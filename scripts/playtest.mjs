// Default: node scripts/playtest.mjs (starts and stops its own local Wrangler).
// Existing server: node scripts/playtest.mjs http://127.0.0.1:8787 [baseline|final]
import assert from "node:assert/strict";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { startLocalServer } from "./playtest-server.mjs";
import { writeSummary } from "./playtest-report.mjs";
const external = process.argv[2]?.startsWith("http");
let base = external ? new URL(process.argv[2]) : new URL("http://127.0.0.1");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
  "Local only",
);
const label = (external ? process.argv[3] : process.argv[2]) || "final";
assert(/^[a-z0-9-]+$/.test(label));
const dir = resolve("output/playtest", label);
// Preserve previous evidence instead of overwriting screenshots from an earlier run.
if (existsSync(resolve(dir, "results.json")))
  await rename(dir, `${dir}-${Date.now()}`);
await mkdir(dir, { recursive: true });
await mkdir("work", { recursive: true });
await build({
  entryPoints: ["src/escape.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "work/playtest-cases.mjs",
});
const {
  ESCAPE_CASES,
  startEscape,
  actEscape,
  canAnswer,
  isLocked,
  visible,
  coinSpots,
} = await import("../work/playtest-cases.mjs?" + Date.now());
function solution(c) {
  if (c.solution) return c.solution;
  let s = startEscape(c);
  const steps = [];
  const add = (a) => {
    s = actEscape(c, s, a);
    assert(s);
    steps.push(a);
  };
  for (let round = 0; round < 40 && !canAnswer(c, s); round++)
    for (const scene of c.scenes) {
      const door = c.objects.find(
        (o) =>
          o.scene === s.scene &&
          o.goto === scene.id &&
          !isLocked(s, o) &&
          s.scene !== scene.id,
      );
      for (const o of c.objects.filter((o) => visible(c, s, o) && !o.goto)) {
        if (!isLocked(s, o)) {
          if (!s.seen.includes(o.id)) add({ a: "tap", o: o.id });
        } else if (o.lock.kind === "code")
          add({ a: "code", o: o.id, v: o.lock.code });
        else if (s.inv.includes(o.lock.item))
          add({ a: "use", o: o.id, i: o.lock.item });
      }
      for (const o of c.objects.filter(
        (o) =>
          visible(c, s, o) &&
          o.goto &&
          isLocked(s, o) &&
          o.lock.kind === "item" &&
          s.inv.includes(o.lock.item),
      ))
        add({ a: "use", o: o.id, i: o.lock.item });
      if (door) add({ a: "tap", o: door.id });
    }
  assert(canAnswer(c, s));
  add({ a: "answer", n: c.question.correct });
  return steps;
}
let ownedServer;
let browser;
try {
  if (!external) {
    ownedServer = await startLocalServer();
    base = ownedServer.url;
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(6000);
  const report = {
    label,
    server: {
      managed: !external,
      url: base.origin,
      pid: ownedServer?.pid,
      stopped: false,
    },
    started: new Date().toISOString(),
    cases: [],
    issues: [],
    checks: 0,
    expedition: null,
  };
  let where = "login";
  const issue = (kind, detail) => report.issues.push({ where, kind, detail });
  page.on("console", (m) => {
    if (m.type() === "error")
      issue("console", { text: m.text(), location: m.location() });
  });
  page.on("pageerror", (e) => issue("pageerror", e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) issue("http", `${r.status()} ${r.url()}`);
  });
  // A large furniture hotspot can contain a smaller one. Use an exposed point of
  // the requested control, as a player would; never dispatch events or force clicks.
  async function click(loc, submit = false) {
    const old = submit
      ? await page
          .locator("input[name=rev]")
          .first()
          .getAttribute("value")
          .catch(() => null)
      : null;
    await loc.scrollIntoViewIfNeeded();
    const point = await loc.evaluate((e) => {
      e.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      });
      const r = e.getBoundingClientRect();
      for (const x of [0.5, 0.15, 0.85])
        for (const y of [0.5, 0.15, 0.85]) {
          const px = r.left + r.width * x,
            py = r.top + r.height * y,
            hit = document.elementFromPoint(px, py);
          if (hit && e.contains(hit)) return { x: px, y: py };
        }
      return null;
    });
    assert(
      point,
      "Control is fully occluded: " + (await loc.getAttribute("aria-label")),
    );
    await page.mouse.click(point.x, point.y);
    if (submit)
      await page.waitForFunction((old) => {
        const rev = document.querySelector("input[name=rev]");
        return !rev || rev.value !== old;
      }, old);
  }
  const form = (a, o) =>
    page
      .locator(
        `form:has(input[name=a][value="${a}"])${o ? `:has(input[name=o][value="${o}"])` : ""}`,
      )
      .first();
  async function closeLens() {
    const l = page.locator(".esc-loupe-close");
    if (await l.isVisible()) await l.click();
  }
  async function inspect(tag, capture = false) {
    report.checks++;
    const data = await page.evaluate(() => {
      const colors = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const blend = (a, b) =>
        a.slice(0, 3).map((v, i) => v * (a[3] ?? 1) + b[i] * (1 - (a[3] ?? 1)));
      const lum = (c) =>
        c
          .map((x) => {
            x /= 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          })
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = [];
      for (const e of document.querySelectorAll(".jr-game *, .panel *")) {
        const r = e.getBoundingClientRect(),
          cs = getComputedStyle(e);
        if (
          !r.width ||
          !r.height ||
          cs.visibility === "hidden" ||
          cs.display === "none" ||
          !Array.from(e.childNodes).some(
            (n) => n.nodeType === 3 && /[a-zA-Z0-9가-힣]/.test(n.textContent),
          )
        )
          continue;
        if (e.closest("[hidden],.jr-preload") || Number(cs.opacity) === 0)
          continue;
        let bg = [255, 255, 255];
        const chain = [];
        for (let p = e; p; p = p.parentElement) chain.unshift(p);
        let image = false;
        for (const p of chain) {
          const s = getComputedStyle(p);
          const color = colors(s.backgroundColor);
          if ((color[3] ?? 1) === 1) image = false;
          if (s.backgroundImage !== "none") image = true;
          bg = blend(color, bg);
        }
        if (image) continue;
        const fg = blend(colors(cs.color), bg),
          ls = [lum(fg), lum(bg)].sort((a, b) => b - a),
          ratio = (ls[0] + 0.05) / (ls[1] + 0.05);
        const threshold =
          parseFloat(cs.fontSize) >= 24 ||
          (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700)
            ? 3
            : 4.5;
        if (ratio < threshold - 0.02)
          contrast.push({
            selector:
              e.tagName.toLowerCase() +
              "." +
              String(e.className).trim().split(/\s+/).join("."),
            text: e.textContent.trim().slice(0, 70),
            fg: cs.color,
            bg,
            ratio: +ratio.toFixed(2),
          });
      }
      return {
        overflow:
          Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth,
          ) > innerWidth,
        width: Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth,
        ),
        contrast,
      };
    });
    if (data.overflow)
      issue(
        "overflow",
        `${tag}: viewport ${await page.evaluate(() => innerWidth)}, scrollWidth ${data.width}`,
      );
    for (const c of data.contrast) issue("contrast", { tag, ...c });
    // Sample real hit targets across each button; actual solution clicks also use Playwright actionability. Close the intentional loupe first.
    await closeLens();
    if (await page.locator(".esc-room").count())
      await page.locator(".esc-room").scrollIntoViewIfNeeded();
    const blocked = await page.evaluate(() => {
      const scroll = [scrollX, scrollY],
        blocked = [];
      for (const e of document.querySelectorAll(
        ".jr-game button, .panel button, .jr-game a.btn, .panel a.btn",
      )) {
        if (
          !e.getBoundingClientRect().width ||
          e.disabled ||
          getComputedStyle(e).visibility === "hidden"
        )
          continue;
        e.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant",
        });
        const r = e.getBoundingClientRect();
        const hits = [0.15, 0.5, 0.85].flatMap((x) =>
          [0.15, 0.5, 0.85].map((y) =>
            document.elementFromPoint(
              r.left + r.width * x,
              r.top + r.height * y,
            ),
          ),
        );
        if (!hits.some((hit) => hit && e.contains(hit)))
          blocked.push({
            label: e.getAttribute("aria-label") || e.textContent.trim(),
            html: e.outerHTML.slice(0, 350),
            blockers: [
              ...new Set(
                hits.filter(Boolean).map((h) => h.tagName + "." + h.className),
              ),
            ],
          });
      }
      window.scrollTo(...scroll);
      return blocked;
    });
    for (const b of blocked) issue("occluded", { tag, ...b });
    if (capture)
      await page.screenshot({ path: `${dir}/${tag}.png`, fullPage: true });
  }
  async function ui(u, v) {
    const box = page.locator(".esc-ui");
    const cells = box
      .locator(".esc-ui-board")
      .first()
      .locator(":scope > .esc-ui-cell");
    const tokens = v.split(".");
    switch (u.t) {
      case "slide":
        for (const m of tokens) {
          await box
            .locator(".esc-ui-piece")
            .nth(u.pieces.findIndex((p) => p.id === m[0]))
            .click();
          await box.locator(".a" + m[1]).click();
        }
        break;
      case "pour":
        for (const m of tokens) {
          await box
            .locator(".esc-ui-jug")
            .nth(Number(/[FE]/.test(m[0]) ? m[1] : m[0]))
            .click();
          if (m[0] === "F" || m[0] === "E")
            await box
              .locator(".esc-ui-tools button")
              .filter({ hasText: m[0] === "F" ? "가득" : "비우기" })
              .click();
          else await box.locator(".esc-ui-jug").nth(Number(m[1])).click();
        }
        break;
      case "river": {
        const right = new Set();
        let side = 0;
        for (const m of tokens) {
          const boat = [];
          for (const id of m) {
            // Several passengers intentionally share a name. The UI draws each
            // bank in definition order; follow identities through its real buttons.
            const available = u.items.filter(
              (it) =>
                right.has(it.id) === Boolean(side) && !boat.includes(it.id),
            );
            const index = available.findIndex((it) => it.id === id);
            assert(index >= 0, "Passenger is on the wrong bank: " + id);
            await box
              .locator(".bank")
              .nth(side)
              .locator("button")
              .nth(index)
              .click();
            boat.push(id);
          }
          await box.locator(".esc-ui-cross").click();
          for (const id of boat) side === 0 ? right.add(id) : right.delete(id);
          side = 1 - side;
        }
        break;
      }
      case "lights":
        for (const m of tokens) await cells.nth(Number(m)).click();
        break;
      case "match": {
        const sticks = box.locator(".stick");
        for (let i = 0; i < v.length; i++)
          if (
            (await sticks.nth(i).getAttribute("class")).includes(" on") !==
            (v[i] === "1")
          )
            await sticks.nth(i).click();
        break;
      }
      case "balance":
        for (let i = 0; i < v.length; i++)
          await box.locator("select").nth(i).selectOption(v[i]);
        break;
      case "path":
        for (const m of tokens.slice(u.start === undefined ? 0 : 1))
          await cells.nth(Number(m)).click();
        break;
      case "rotate":
        for (let i = 0; i < v.length; i++)
          for (let n = 0; n < (Number(v[i]) - Number(u.rot[i]) + 4) % 4; n++)
            await cells.nth(i).click();
        break;
      case "stacks":
        for (const m of tokens) {
          if (u.rule === "flip")
            await box
              .locator(".disk")
              .nth(Number(m) - 1)
              .click();
          else {
            await box.locator(".esc-ui-col").nth(Number(m[0])).click();
            await box.locator(".esc-ui-col").nth(Number(m[1])).click();
          }
        }
        break;
      case "numgrid": {
        let j = 0;
        for (let i = 0; i < u.given.length; i++) {
          if (u.given[i] === -1) continue;
          if (u.given[i] === null)
            await cells.nth(i).locator("input").fill(v[j]);
          j++;
        }
        break;
      }
      case "mark":
        for (let i = 0; i < v.length; i++)
          if (v[i] === "1") await cells.nth(i).click();
        break;
      case "multi":
        for (const n of v)
          await box
            .locator("input")
            .nth(Number(n) - 1)
            .check();
        break;
      case "jump":
        for (const m of tokens)
          for (const n of m.split("-")) await cells.nth(Number(n)).click();
        break;
      case "dials":
        for (const m of tokens)
          await box.locator(".esc-ui-tools button").nth(Number(m)).click();
        break;
      case "color":
        for (let r = 0; r < v.length; r++) {
          if (u.given?.[r]) continue;
          for (let n = 0; n < Number(v[r]); n++)
            await cells.nth(u.regions.indexOf(r)).click();
        }
        break;
      case "divide":
        for (let i = 0; i < v.length; i++)
          for (let n = 0; n < Number(v[i]); n++) await cells.nth(i).click();
        break;
      default:
        throw Error("Unsupported UI " + u.t);
    }
    assert.equal(
      await page.locator("[data-ui-v]").inputValue(),
      v,
      "UI movement sequence",
    );
  }
  try {
    await page.goto(
      new URL(
        "/auth/dev?id=" +
          String(900000000000000000n + BigInt(Date.now())) +
          "&name=Playtest",
        base,
      ).href,
    );
    assert(!page.url().includes("/auth/dev"), "DEV_LOGIN login failed");
    if (page.url().includes("/choose")) {
      await page
        .locator(".choose-card")
        .filter({ has: page.locator("input[value=boy]") })
        .click();
      await page.getByRole("button", { name: "확정", exact: true }).click();
      await page.getByRole("button", { name: "네, 이걸로 할게요" }).click();
    }
    console.log(`Authenticated; ${ESCAPE_CASES.length} cases`);
    for (const c of ESCAPE_CASES) {
      const result = { id: c.id, title: c.title, completed: false, steps: 0 };
      report.cases.push(result);
      where = c.id;
      try {
        await page.goto(new URL("/cases/room?list=1", base).href);
        await page
          .locator(`form:has(input[name=case][value="${c.id}"]) button`)
          .click();
        await page.locator(".esc-room").waitFor();
        let s = startEscape(c),
          lastScene = null,
          index = 0;
        for (const a of solution(c)) {
          where = `${c.id}/${s.scene}/step-${index}-${a.a}${a.o ? "-" + a.o : ""}`;
          await inspect(`${c.id}-${s.scene}-${index}`, lastScene !== s.scene);
          if (lastScene !== s.scene) {
            lastScene = s.scene;
            await page.setViewportSize({ width: 390, height: 844 });
            await inspect(`${c.id}-${s.scene}-390`, true);
            // Collect each scene's coins using actual buttons, including hit testing.
            for (let k = 0; k < 3; k++) {
              const coin = page.locator(".esc-coin").first();
              if (!(await coin.count())) break;
              await click(coin, true);
            }
            await page.setViewportSize({ width: 1280, height: 900 });
          }
          if (["code", "use"].includes(a.a)) {
            await closeLens();
            await click(form("tap", a.o).locator("button"), true);
            await inspect(`${c.id}-${s.scene}-puzzle-${index}`, true);
            await page.setViewportSize({ width: 390, height: 844 });
            await inspect(`${c.id}-${s.scene}-puzzle-${index}-390`, true);
          }
          if (a.a === "tap")
            await click(form("tap", a.o).locator("button"), true);
          else if (a.a === "use")
            await click(
              form("use", a.o)
                .filter({ has: page.locator(`input[name=i][value="${a.i}"]`) })
                .locator("button"),
              true,
            );
          else if (a.a === "combine") {
            const f = form("combine");
            await f.locator("[name=i]").selectOption(a.i);
            await f.locator("[name=j]").selectOption(a.j);
            await click(f.locator("button"), true);
          } else if (a.a === "code") {
            const lock = c.objects.find((o) => o.id === a.o).lock,
              f = form("code", a.o);
            if (lock.ui) await ui(lock.ui, a.v);
            else if (lock.grid) {
              for (let i = 0; i < a.v.length; i++)
                if (a.v[i] === "1") await f.locator(`[name=g${i}]`).check();
            } else if (lock.order) {
              for (let i = 0; i < a.v.length; i++)
                await f.locator(`[name=t${i}]`).selectOption(a.v[i]);
            } else if (lock.choices) {
              await click(f.locator(`button[name=v][value="${a.v}"]`), true);
            } else await f.locator("input[name=v]").fill(a.v);
            if (!lock.choices)
              await click(f.locator("button[type=submit]"), true);
          } else if (a.a === "answer") {
            if (c.more) {
              const f = form("answer");
              await f.locator(`input[name=n][value="${a.n}"]`).check();
              for (let i = 0; i < c.more.length; i++)
                await f
                  .locator(
                    `input[name=m${i}][value="${a.m?.[i] ?? c.more[i].correct}"]`,
                  )
                  .check();
              await click(f.locator("button"), true);
            } else
              await click(
                page.locator(
                  `form:has(input[name=a][value=answer]):has(input[name=n][value="${a.n}"]) button`,
                ),
                true,
              );
          } else throw Error("Unhandled " + a.a);
          await page.setViewportSize({ width: 1280, height: 900 });
          s = actEscape(c, s, a);
          assert(s);
          assert.equal(s.mistakes, 0);
          index++;
          result.steps = index;
          if (!s.done)
            assert.equal(
              await page.locator('.esc-chip[title="실수"]').innerText(),
              "❌ 0",
              "UI mistakes",
            );
        }
        assert(
          await page.locator(".esc-result").isVisible(),
          "Missing result screen",
        );
        assert((await page.locator(".esc-ending").innerText()) === c.ending);
        result.grade = await page.locator(".esc-grade-badge").innerText();
        assert.equal(result.grade, "S", "UI grade");
        result.coins = Number(
          (await page.locator(".esc-grade").innerText()).match(
            /찾은 힌트 동전 (\d+)개/,
          )?.[1],
        );
        const expectedCoins = c.scenes.reduce(
          (n, scene) => n + coinSpots(c, scene.id).length,
          0,
        );
        assert.equal(
          result.coins,
          expectedCoins,
          "All scene coins collected through UI",
        );
        result.completed = true;
        await inspect(`${c.id}-result`, true);
        console.log(
          `DONE ${report.cases.filter((c) => c.completed).length}/${ESCAPE_CASES.length} ${c.id}`,
        );
      } catch (e) {
        result.error = e.message;
        issue("failure", e.message);
        await page.screenshot({
          path: `${dir}/${c.id}-failure.png`,
          fullPage: true,
        });
        console.log("FAIL", c.id, e.message.slice(0, 180));
      }
      await writeFile(`${dir}/results.json`, JSON.stringify(report, null, 2));
    }
    where = "expedition";
    await page.goto(new URL("/expedition/go", base).href);
    await page.locator(".jr-depart").first().click();
    await page.locator("[data-auto-toggle] input").check();
    const started = Date.now();
    let rev = null,
      scene = 0;
    while (
      !(await page.locator(".jr-result").count()) &&
      Date.now() - started < 20 * 60 * 1000
    ) {
      const now = await page
        .locator("#journey input[name=rev]")
        .first()
        .inputValue()
        .catch(() => null);
      if (now !== rev) {
        rev = now;
        where = `expedition/rev-${now}`;
        // Auto mode deliberately locks manual choices. Pause it through the UI
        // so every meaningful button is audited while active; all progression
        // is still performed by the app's automatic mode after resuming.
        await page.locator("[data-auto-toggle] input").uncheck();
        await inspect(`expedition-${scene++}`, true);
        await page.setViewportSize({ width: 390, height: 844 });
        await inspect(`expedition-${scene}-390`, true);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator("[data-auto-toggle] input").check();
      }
      await page.waitForTimeout(700);
    }
    assert(
      await page.locator(".jr-result").isVisible(),
      "Expedition auto timeout",
    );
    report.expedition = {
      completed: true,
      text: await page.locator(".jr-result").innerText(),
      scenes: scene,
    };
    await inspect("expedition-result", true);
  } catch (e) {
    issue("fatal", e.message);
    console.error(e);
  } finally {
    await browser.close();
    if (ownedServer) {
      await ownedServer.stop();
      report.server.stopped = true;
    }
    report.finished = new Date().toISOString();
    await writeFile(`${dir}/results.json`, JSON.stringify(report, null, 2));
    const unique = [
      ...new Map(report.issues.map((i) => [JSON.stringify(i), i])).values(),
    ];
    await writeFile(
      `${dir}/playtest-report.md`,
      `# UI 플레이테스트 (${label})\n\n- 로그인: /auth/dev, 실제 브라우저 세션\n- 사건: ${report.cases.filter((c) => c.completed).length}/${ESCAPE_CASES.length} 완료 (요청 50개, 현재 저장소 ${ESCAPE_CASES.length}개 모두 대상)\n- 원정 자동 종료: ${report.expedition?.completed ?? false}\n- 단계 검사: ${report.checks}\n- 시각: ${report.started} ~ ${report.finished}\n- 화면: 1280×900, 장면별 390×844\n- 캡처: ${dir}\n\n## 사건별 결과\n\n${report.cases.map((c) => `- ${c.id}: ${c.completed ? "완료" : "실패"} (${c.steps} steps) ${c.error || ""}`).join("\n")}\n\n## 재현 위치 및 문제\n\n${unique.map((i) => `- ${i.where}: **${i.kind}** ${typeof i.detail === "string" ? i.detail : JSON.stringify(i.detail)}`).join("\n") || "없음"}\n\n## 검사 한계\n\n대비 검사는 계산된 단색 배경과 텍스트의 WCAG AA 비율입니다. 이미지 배경·그림 안 글자, 스크린리더와 실제 터치 기기는 검증하지 않습니다. 의도된 돋보기는 닫기 UI로 닫고 가림을 검사합니다. 가림은 버튼 여러 지점의 elementFromPoint와 실제 풀이 클릭으로 검사하며 force를 사용하지 않습니다.\n`,
    );
    await writeSummary(report);
    console.log("Report", dir);
    if (
      report.cases.filter((c) => c.completed).length !== ESCAPE_CASES.length ||
      !report.expedition?.completed ||
      report.issues.length
    )
      process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await ownedServer?.stop();
}
