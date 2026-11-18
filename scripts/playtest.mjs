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
  escCase,
  startEscape,
  actEscape,
  canAnswer,
  isLocked,
  visible,
  coinSpots,
} = await import("../work/playtest-cases.mjs?" + Date.now());
// PLAYTEST_ONLY=cases,journey,gamble,site limits a run to some parts (default: everything).
const ONLY = (process.env.PLAYTEST_ONLY || "cases,journey,gamble,site").split(",");
const only = (part) => ONLY.includes(part);
await build({
  entryPoints: ["src/journey-chapters.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "work/playtest-chapters.mjs",
});
const { MAX_CHAPTER: CHAPTER_COUNT } = await import(
  "../work/playtest-chapters.mjs?" + Date.now()
);
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
async function localSql(command) {
  const { execFileSync } = await import("node:child_process");
  const root = resolve("work/playtest-server");
  execFileSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "haribo-dogam", "--local", "--command", command], { env: { ...process.env, XDG_CONFIG_HOME: root }, stdio: "ignore" });
}
const userId = String(900000000000000000n + BigInt(Date.now()));
let browser;
try {
  if (!external) {
    ownedServer = await startLocalServer({ gambleTester: userId });
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
        // Inside a folded <details> the row is not drawn even though it has a size.
        const fold = e.closest("details:not([open])");
        if (fold && !e.closest("summary")) continue;
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
      await page.screenshot({ path: `${dir}/${tag}.png`, fullPage: true, timeout: 30000 });
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
    // PLAYTEST_LOCAL_SEED=1: 이미 떠 있는 로컬 서버(다른 로봇이 띄운 것)에서도 이 로봇 계정의 잠금을 풀어요.
    if (!ownedServer && process.env.PLAYTEST_LOCAL_SEED) ownedServer = { sql: localSql, borrowed: true };
    if (ownedServer) {
      // Robot-only unlock: give the test account 60 high-level dogam cards on its own local D1,
      // so every case and expedition chapter opens. External runs keep real locks.
      const now = new Date().toISOString();
      const fakes = Array.from({ length: 60 }, (_, i) => `pt-${userId}-${i}`);
      await ownedServer.sql(
        "INSERT OR IGNORE INTO members (user_id, display_name, active, updated_at) VALUES " +
          fakes.map((id, i) => `('${id}', '로봇친구${i}', 1, '${now}')`).join(",") +
          "; INSERT OR REPLACE INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES " +
          fakes.map((id) => `('${userId}', '${id}', 100000, '${now}', '${now}')`).join(",") +
          "; INSERT OR REPLACE INTO journey_bank (user_id, coins, atk, hp, def, weapon, armor, charm, updated_at) VALUES " +
          `('${userId}', 1000000, 34, 34, 13, 9, 9, 9, '${now}');`,
      );
      console.log("Seeded 60 Lv-high cards + max expedition gear for robot unlock");
    }
    await page.goto(
      new URL("/auth/dev?id=" + userId + "&name=Playtest", base).href,
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
    // Robot-only dogam jelly so every shop item and title can be bought (profile exists after login).
    if (ownedServer)
      await ownedServer.sql(
        `UPDATE profiles SET dogam_jelly = 1000000 WHERE user_id = '${userId}';`,
      );
    // PLAYTEST_VARIANTS=N: 만든 사건은 다시 푸는 판(범인·단서·자리를 새로 섞은 판) 1~N도 실제 화면으로 풀어요.
    // 판 번호 = 그 사건을 시작한 횟수라서, 처음 판을 끝낸 뒤 다시 시작하면 다음 판이 나와요.
    const VARIANTS = Number(process.env.PLAYTEST_VARIANTS || 0);
    // PLAYTEST_CASES=c06,c10: 그 사건만. PLAYTEST_SHARD=k/n: 사건 번호를 n으로 나눈 나머지가 k인 사건만 풀어요(여러 로봇을 한 서버에 나눠 돌릴 때).
    const [shardK, shardN] = (process.env.PLAYTEST_SHARD || "0/1").split("/").map(Number);
    const pickCases = process.env.PLAYTEST_CASES?.split(",");
    const plays = ESCAPE_CASES.filter((c, i) => i % shardN === shardK && (!pickCases || pickCases.includes(c.id))).flatMap((c) => Array.from({ length: c.solution ? VARIANTS + 1 : 1 }, (_, vr) => (vr ? escCase(c.id, vr) : c)));
    const lockedIds = new Set();
    for (const c of only("cases") ? plays : []) {
      if (lockedIds.has(c.id)) continue;
      const result = { id: c.vr ? `${c.id}#${c.vr}` : c.id, title: c.title, completed: false, steps: 0 };
      report.cases.push(result);
      where = result.id;
      try {
        await page.goto(new URL("/cases/room?list=1", base).href);
        const start = page.locator(
          `form:has(input[name=case][value="${c.id}"]) button`,
        );
        // A fresh test account only sees the first cases; locked ones show their unlock rule, not a start form.
        if (!(await start.count())) {
          result.locked = true;
          lockedIds.add(c.id);
          console.log(`LOCKED ${c.id}`);
          continue;
        }
        await start.click();
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
          if (a.a === "tap") {
            const goto = c.objects.find((o) => o.id === a.o)?.goto;
            // Way-back doors to an already-open room are replaced by the open-room buttons (a=go).
            const f =
              goto && !(await form("tap", a.o).count()) ? form("go", goto) : form("tap", a.o);
            await click(f.locator("button"), true);
          }
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
          `DONE ${report.cases.filter((c) => c.completed).length}/${plays.length} ${result.id}`,
        );
      } catch (e) {
        result.error = e.message;
        issue("failure", e.message);
        await page.screenshot({
          path: `${dir}/${c.id}-failure.png`,
          fullPage: true,
        });
        console.log("FAIL", result.id, e.message.slice(0, 180));
        // 실패한 판은 덮어 둬요. 다음 판 번호가 하나씩 늘어나야 다시 푸는 판 순서가 맞아요.
        await page.goto(new URL("/cases/room", base).href).catch(() => {});
        await page.locator('form[action="/api/escape/quit"] button').first().click({ timeout: 3000 }).catch(() => {});
      }
      await writeFile(`${dir}/results.json`, JSON.stringify(report, null, 2));
    }
    // Expedition: play every chapter in order (each clear opens the next), up to 3 tries per chapter.
    report.expedition = { chapters: [] };
    for (let ch = 1; only("journey") && ch <= CHAPTER_COUNT; ch++) {
      const run = { ch, cleared: false, tries: 0 };
      report.expedition.chapters.push(run);
      while (!run.cleared && run.tries < 3) {
        run.tries++;
        where = `expedition/ch${ch}/try${run.tries}`;
        await page.goto(new URL("/expedition/go", base).href);
        const pick = page.locator(`.jr-chapters input[name=ch][value="${ch}"]`);
        if (!(await pick.count()) || (await pick.isDisabled())) {
          run.error = "chapter not open";
          break;
        }
        // 장 카드의 글씨(<b>)가 동그라미 위를 덮어서, 사람이 누르듯 카드(라벨)를 눌러 골라요
        await pick.check({ force: true });
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
          // null = the page is between screens (e.g. switching to the result); just wait.
          if (now !== null && now !== rev) {
            rev = now;
            where = `expedition/ch${ch}/rev-${now}`;
            // Auto mode deliberately locks manual choices. Pause it through the UI
            // so every meaningful button is audited while active; all progression
            // is still performed by the app's automatic mode after resuming.
            try {
              await page.locator("[data-auto-toggle] input").uncheck();
              await inspect(`expedition-ch${ch}-${scene++}`, true);
              await page.setViewportSize({ width: 390, height: 844 });
              await inspect(`expedition-ch${ch}-${scene}-390`, true);
              await page.setViewportSize({ width: 1280, height: 900 });
              await page.locator("[data-auto-toggle] input").check();
            } catch (e) {
              // The run can end while we pause it; only the result screen excuses a missing toggle.
              await page.setViewportSize({ width: 1280, height: 900 });
              if (!(await page.locator(".jr-result").count())) throw e;
            }
          }
          await page.waitForTimeout(700);
        }
        await page
          .locator(".jr-result")
          .waitFor({ state: "visible", timeout: 30000 })
          .catch(() => {});
        assert(
          await page.locator(".jr-result").isVisible(),
          `Expedition ch${ch} auto timeout`,
        );
        run.text = await page.locator(".jr-result").innerText();
        run.scenes = scene;
        run.cleared = run.text.includes("물리쳤어요");
        await inspect(`expedition-ch${ch}-result`, true);
      }
      console.log(`EXPEDITION ch${ch} ${run.cleared ? "CLEARED" : "NOT CLEARED"} (${run.tries} tries)`);
      if (!run.cleared) {
        issue("failure", `Expedition ch${ch} not cleared: ${run.error ?? run.text ?? ""}`.slice(0, 300));
        break;
      }
    }
    report.expedition.completed =
      !only("journey") || report.expedition.chapters.filter((r) => r.cleared).length === CHAPTER_COUNT;

    // Gamble hall: one small bet in each game, with screens before and after.
    report.gamble = [];
    for (const game of only("gamble") ? ["slot", "roulette", "cards", "coinflip"] : []) {
      const g = { game, played: false };
      report.gamble.push(g);
      where = `gamble/${game}`;
      try {
        await page.goto(new URL(`/gamble/${game}`, base).href);
        await inspect(`gamble-${game}`, true);
        await page.setViewportSize({ width: 390, height: 844 });
        await inspect(`gamble-${game}-390`, true);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('.gb-bet-form [data-gb-bet="10"]').click();
        await page.locator(".gb-bet-form .gb-play-button").click();
        await page.waitForLoadState("load");
        // Card 21: keep pressing "멈추기" until the hand is settled.
        for (let k = 0; k < 5 && game === "cards"; k++) {
          const stand = page.locator(".gb-move-stand");
          if (!(await stand.count())) break;
          await stand.click();
          await page.waitForLoadState("load");
        }
        await page.locator('[data-gb-settled="yes"]').waitFor({ timeout: 15000 });
        await page.waitForTimeout(4500); // let the result motion finish
        await inspect(`gamble-${game}-result`, true);
        await page.setViewportSize({ width: 390, height: 844 });
        await inspect(`gamble-${game}-result-390`, true);
        await page.setViewportSize({ width: 1280, height: 900 });
        g.played = true;
        console.log(`GAMBLE ${game} OK`);
      } catch (e) {
        g.error = e.message;
        issue("failure", `Gamble ${game}: ${e.message}`.slice(0, 300));
        await page.screenshot({ path: `${dir}/gamble-${game}-failure.png`, fullPage: true });
        console.log("FAIL gamble", game, e.message.slice(0, 180));
      }
    }

    // Every other member page: open it on desktop and phone, then use what a member can use.
    report.site = [];
    const fake0 = `pt-${userId}-0`;
    const PAGES = [
      "/", "/guide", "/me", "/me/praise", "/dogam", `/dogam/${fake0}`, `/card/${fake0}`,
      `/card/${userId}`, "/group", "/bingo", "/rank", "/shop", "/shop/deco", "/shop/gender",
      "/titles", "/gamble", "/expedition/go", "/cases/room?list=1", "/plaza",
    ];
    // A notice popup is a deliberate modal: close it like a player before checking what is under it.
    async function closePopup() {
      const ok = page.locator('.popup-wrap label[for="popup-close"]');
      if (await ok.isVisible().catch(() => false)) await click(ok);
    }
    const look = async (tag, capture) => {
      await closePopup();
      await inspect(tag, capture);
    };
    // Submit a form button and wait for the page that answers it.
    async function submit(loc) {
      await Promise.all([page.waitForNavigation({ waitUntil: "load" }), click(loc)]);
    }
    async function step(name, run) {
      const s = { name, ok: false };
      report.site.push(s);
      where = `site/${name}`;
      try {
        await run();
        s.ok = true;
        console.log(`SITE ${name} OK`);
      } catch (e) {
        s.error = e.message;
        issue("failure", `Site ${name}: ${e.message}`.slice(0, 300));
        await page.screenshot({ path: `${dir}/site-${name.replace(/[^a-z0-9]+/gi, "-")}-failure.png`, fullPage: true });
        console.log("FAIL site", name, e.message.slice(0, 180));
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    const shot = (path) => path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
    for (const path of only("site") ? PAGES : []) {
      await step(`page ${path}`, async () => {
        const r = await page.goto(new URL(path, base).href);
        assert(r && r.status() < 400, `HTTP ${r?.status()}`);
        await look(`site-${shot(path)}`, true);
        await page.setViewportSize({ width: 390, height: 844 });
        await look(`site-${shot(path)}-390`, true);
      });
    }
    if (only("site")) {
      await step("profile intro + theme", async () => {
        await page.goto(new URL("/me", base).href);
        const f = page.locator('form[action="/api/me/profile"]');
        await f.locator("input[name=intro]").fill("로봇이 시험 중이에요");
        await submit(f.locator("button[type=submit]").last());
        await closePopup();
        assert.equal(await page.locator('form[action="/api/me/profile"] input[name=intro]').inputValue(), "로봇이 시험 중이에요");
        await look("site-me-saved", true);
      });
      // Buy every item that is on sale, then use each one (themes, decorations).
      for (const tab of ["/shop", "/shop/deco"]) {
        await step(`buy all ${tab}`, async () => {
          let bought = 0;
          for (let n = 0; n < 200; n++) {
            await page.goto(new URL(tab, base).href);
            await closePopup();
            const buy = page.locator('form[action="/api/shop/buy"] button').first();
            if (!(await buy.count())) break;
            await submit(buy);
            bought++;
            await look(`site-${shot(tab)}-buy-${n}`, n < 2);
          }
          console.log(`SITE ${tab} bought ${bought}`);
          await page.goto(new URL(tab, base).href);
          await closePopup();
          assert.equal(await page.locator('form[action="/api/shop/buy"]').count(), 0, "items left unbought");
          // Use every owned theme/decoration once, by its id (the list is read before any change).
          const uses = await page
            .locator('form[action="/api/me/theme"], form[action="/api/me/deco"]')
            .evaluateAll((fs) =>
              fs.map((f) => {
                const i = f.querySelector("input[type=hidden]");
                return { action: f.getAttribute("action"), name: i.name, value: i.value };
              }),
            );
          let used = 0;
          for (const u of uses) {
            await page.goto(new URL(tab, base).href);
            await closePopup();
            const use = page
              .locator(`form[action="${u.action}"]:has(input[name="${u.name}"][value="${u.value}"]) button`)
              .first();
            if (!(await use.count())) continue; // already in use (no button)
            await submit(use);
            await look(`site-${shot(tab)}-use-${used}`, used < 2);
            used++;
          }
          console.log(`SITE ${tab} used ${used}/${uses.length}`);
        });
      }
      await step("buy services + nickname", async () => {
        for (let n = 0; n < 20; n++) {
          await page.goto(new URL("/shop", base).href);
          await closePopup();
          const buy = page.locator('form[action="/api/shop/service"] button').first();
          if (!(await buy.count())) break;
          await submit(buy);
          await look(`site-shop-service-${n}`, n < 3);
        }
        await page.goto(new URL("/shop", base).href);
        await closePopup();
        const nick = page.locator('form[action="/api/shop/nick"]');
        if (await nick.count()) {
          await nick.locator("input[name=front]").fill("로봇");
          await submit(nick.locator("button"));
          await look("site-shop-nick", true);
        }
      });
      await step("titles buy + equip", async () => {
        // 550+ titles: buy one from every folded group (each group is its own price/kind).
        const groups = await page.goto(new URL("/titles", base).href).then(() =>
          page.locator("details:has(form[action='/api/titles/buy'])").count());
        for (let g = 0, n = 0; g < groups; g++) {
          await page.goto(new URL("/titles", base).href);
          await closePopup();
          const grp = page.locator("details:has(form[action='/api/titles/buy'])").nth(g);
          if (!(await grp.count())) break;
          if (!(await grp.evaluate((d) => d.open))) await click(grp.locator(":scope > summary"));
          const buy = grp.locator("form[action='/api/titles/buy'] button:not([disabled])").first();
          if (!(await buy.count())) continue;
          await submit(buy);
          await look(`site-titles-buy-${n++}`, g < 2);
        }
        await page.goto(new URL("/titles", base).href);
        await closePopup();
        const equip = page.locator('form[action="/api/titles/equip"] button:not([disabled])').first();
        assert(await equip.count(), "no title to equip");
        const fold = equip.locator("xpath=ancestor::details[1]");
        if ((await fold.count()) && !(await fold.evaluate((d) => d.open)))
          await click(fold.locator(":scope > summary"));
        await submit(equip);
        await closePopup();
        await look("site-titles-equipped", true);
        await page.setViewportSize({ width: 390, height: 844 });
        await look("site-titles-equipped-390", true);
      });
      await step("my card after shopping", async () => {
        await page.goto(new URL(`/card/${userId}`, base).href);
        await look("site-my-card-final", true);
        await page.setViewportSize({ width: 390, height: 844 });
        await look("site-my-card-final-390", true);
      });
    }
  } catch (e) {
    issue("fatal", e.message);
    console.error(e);
  } finally {
    await browser.close();
    if (ownedServer?.stop) {
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
      `# UI 플레이테스트 (${label})\n\n- 로그인: /auth/dev, 실제 브라우저 세션\n- 사건: ${report.cases.filter((c) => c.completed).length}/${ESCAPE_CASES.length} 완료, 잠김 ${report.cases.filter((c) => c.locked).length}개 (현재 저장소 ${ESCAPE_CASES.length}개 모두 대상)\n- 원정대: ${(report.expedition?.chapters ?? []).filter((r) => r.cleared).length}/${CHAPTER_COUNT}장 깸 (${(report.expedition?.chapters ?? []).map((r) => `${r.ch}장 ${r.cleared ? "✓" : "✗"}${r.tries > 1 ? `(${r.tries}번)` : ""}`).join(", ")})\n- 겜블장: ${(report.gamble ?? []).map((g) => `${g.game} ${g.played ? "✓" : "✗"}`).join(", ") || "안 함"}\n- 나머지 화면·기능: ${(report.site ?? []).filter((s) => s.ok).length}/${(report.site ?? []).length} 통과${(report.site ?? []).filter((s) => !s.ok).map((s) => ` / ✗ ${s.name}`).join("")}\n- 단계 검사: ${report.checks}\n- 시각: ${report.started} ~ ${report.finished}\n- 화면: 1280×900, 장면별 390×844\n- 캡처: ${dir}\n\n## 사건별 결과\n\n${report.cases.map((c) => `- ${c.id}: ${c.completed ? "완료" : c.locked ? "잠김(새 계정)" : "실패"} (${c.steps} steps) ${c.error || ""}`).join("\n")}\n\n## 재현 위치 및 문제\n\n${unique.map((i) => `- ${i.where}: **${i.kind}** ${typeof i.detail === "string" ? i.detail : JSON.stringify(i.detail)}`).join("\n") || "없음"}\n\n## 검사 한계\n\n대비 검사는 계산된 단색 배경과 텍스트의 WCAG AA 비율입니다. 이미지 배경·그림 안 글자, 스크린리더와 실제 터치 기기는 검증하지 않습니다. 의도된 돋보기는 닫기 UI로 닫고 가림을 검사합니다. 가림은 버튼 여러 지점의 elementFromPoint와 실제 풀이 클릭으로 검사하며 force를 사용하지 않습니다.\n`,
    );
    await writeSummary(report);
    console.log("Report", dir);
    if (
      report.cases.some((c) => !c.completed && !c.locked) ||
      (report.gamble ?? []).some((g) => !g.played) ||
      (report.site ?? []).some((s) => !s.ok) ||
      !report.expedition?.completed ||
      report.issues.length
    )
      process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await ownedServer?.stop?.();
}
