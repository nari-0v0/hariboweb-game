import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";

export async function writeSummary(report) {
  if (report.label !== "final") return;
  let before;
  try {
    before = JSON.parse(
      await readFile("output/playtest/baseline/results.json", "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const count = (r, kind) =>
    r?.issues.filter((i) => i.kind === kind).length ?? "—";
  const done = (r) => r?.cases.filter((c) => c.completed).length ?? "—";
  const pngs = async (phase) =>
    (await readdir(`output/playtest/${phase}`).catch(() => []))
      .filter((f) => f.endsWith(".png"))
      .sort();
  const beforePics = await pngs("baseline"),
    afterPics = await pngs("final"),
    balancePics = await pngs("balance-validation");
  const rows = [
    [
      "실제 UI 완료 사건",
      `${done(before)}/${before?.cases.length ?? "—"}`,
      `${done(report)}/${report.cases.length}`,
    ],
    [
      "원정 자동 종료",
      before?.expedition?.completed ? "완료" : "미검증",
      report.expedition?.completed ? "완료" : "미완료",
    ],
    ["단계·화면 검사", before?.checks ?? "—", report.checks],
    ["콘솔 오류", count(before, "console"), count(report, "console")],
    ["페이지 예외", count(before, "pageerror"), count(report, "pageerror")],
    ["HTTP 오류", count(before, "http"), count(report, "http")],
    [
      "대비 경고 (반복 포함)",
      count(before, "contrast"),
      count(report, "contrast"),
    ],
    [
      "가림 경고 (반복 포함)",
      count(before, "occluded"),
      count(report, "occluded"),
    ],
    [
      "390px 포함 가로 넘침",
      count(before, "overflow"),
      count(report, "overflow"),
    ],
    ["사건 진행 실패", count(before, "failure"), count(report, "failure")],
    ["PNG 캡처", beforePics.length, afterPics.length],
  ];
  const text = `# 플레이테스트 최종 리포트

현재 저장소의 사건은 요청에 적힌 50개가 아닌 51개입니다. 서버 정의의 solution(steps)을 읽고, 수제 사건은 기존 테스트와 같은 풀이 순서를 계산해 실제 브라우저 UI로 실행했습니다. 정답·진행 상태를 API로 직접 보내거나 DB로 완료 처리하지 않았습니다. 원정의 진행은 화면의 자동 모드로만 수행했습니다. 자동 모드가 의도적으로 잠그는 수동 버튼을 검사에서 제외하지 않도록, 장면마다 자동 진행을 잠시 정지해 두 너비에서 클릭 가능성을 검사한 뒤 자동 진행을 재개했습니다.

| 검사 | 수정 전 전체 실행 | 최종 전체 실행 |
|---|---:|---:|
${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}

- 최종 S등급: ${report.cases.filter((c) => c.grade === "S").length}개
- 실제 UI로 수집한 사건 동전: ${report.cases.reduce((n, c) => n + (c.coins || 0), 0)}개
- 정답 풀이 행동: ${report.cases.reduce((n, c) => n + c.steps, 0)} steps (퍼즐 내부 클릭·초점 선택·동전 클릭은 별도)
- 최종 실행: ${report.started} ~ ${report.finished} (UTC; 한국 시간은 +9시간)
- 최종 서버: ${report.server.managed ? "스크립트가 npx wrangler dev로 시작" : "기존 로컬 서버 사용"}, ${report.server.url}, 자체 서버 정리 ${report.server.stopped ? "완료" : "해당 없음/미완료"}
- 실제 원정 결과: ${report.expedition?.text.split("\n").find((t) => t.includes("멈췄어요") || t.includes("물리쳤어요")) ?? "미완료"}

## 재현 위치와 수정

1. 인물 가림: trophy-talk 탕비실 도토, c09·c14·c31·c46 등의 인물이 바닥/러그 조사 버튼에 가렸습니다. 동전을 조사 영역 앞에 두고, 인물과 발견 물건은 방 아래의 독립된 줄로 옮겼습니다.
2. 작은 조사 지점 가림: c29의 탁상 종이 매표 창구에 가렸습니다. src/views/escape.tsx에서 큰 영역부터, 작은 영역을 나중에 그리도록 바꿨습니다. 조사 대사가 있는 버튼은 하나도 비활성화하거나 검사에서 제외하지 않았습니다. 인물과 발견한 물건을 방 바로 아래의 별도 줄에 놓아 모든 방 조사 버튼과 대화 동작을 함께 보존했습니다.
3. 모바일 추가 가림: 수정 후 전체 실행에서 c15·c31·c49의 서랍/서류함이 인물에 가리는 것을 찾아 인물을 방 아래의 독립된 버튼 줄로 옮겼습니다. 호버나 초점이 바뀌어도 방 안 조사 영역을 가리지 않습니다. 최종 전체 실행에는 이 변경이 포함됩니다.
4. 저대비: 정답/다음 날 버튼은 흰 글자와 분홍 바탕 약 2.62:1, 합치기·결말 상자는 밝은 글자와 밝은 바탕 약 1.04:1이었습니다. 주요 버튼, 합치기, 결말, 퍼즐 출구·경로·저울의 글자색을 진하게 명시했습니다. CSS 캐시 버전도 갱신했습니다.
5. /favicon.ico 404: Layout에서 기존 explorer PNG를 favicon으로 지정했습니다.
6. 원정 검사기: 자동 모드에서 기존 수동 버튼이 의도적으로 잠기는 것을 가림으로 잘못 집계한 중간 실행이 있었습니다. 최종 실행은 검사 시 자동 체크박스를 실제로 꺼서 모든 수동 버튼을 활성 상태로 검사하고, 다시 켜서 자동으로만 진행합니다. 버튼을 검사에서 제외하지 않았습니다.
7. 자동화 선택자: c44 강 건너기에는 같은 이름의 탐정이 셋 있습니다. 수정 전 해당 사건의 중단은 앱 오류와 구분되는 자동화 선택자 오류입니다. 각 강가의 표시 순서와 이동 상태를 따라 실제 버튼을 고르도록 수정했습니다.

## 사건별 수정 전후

| 사건 | 수정 전 | 최종 | 최종 steps | 동전 | 등급 |
|---|---|---|---:|---:|---|
${report.cases.map((c) => `| ${c.id} ${c.title} | ${before?.cases.find((b) => b.id === c.id)?.completed ? "완료" : before ? "중단" : "미검증"} | ${c.completed ? "완료" : "중단"} | ${c.steps} | ${c.coins ?? "—"} | ${c.grade ?? "—"} |`).join("\n")}

## 남은 문제

${report.issues.length ? report.issues.map((i) => `- ${i.where}: ${i.kind} ${JSON.stringify(i.detail)}`).join("\n") : "이번 검사 범위에서 재현되는 콘솔·페이지·HTTP 오류, 저대비, 클릭 가림, 가로 넘침은 없습니다."}

## 실행과 산출물

- npm ci 후 npm run playtest: 로컬 D1 마이그레이션 → 비어 있는 포트에 npx wrangler dev → 준비 대기 → 로그인/UI 검사 → 자신이 시작한 프로세스 그룹만 종료합니다. DEV_LOGIN은 배포 설정에 넣지 않습니다.
- 기존 서버 사용: node scripts/playtest.mjs http://127.0.0.1:8787 final (그 서버는 종료하지 않습니다).
- 수정 전 기준 저장: node scripts/playtest.mjs baseline
- Chromium이 필요합니다. 시스템 /usr/bin/chromium을 사용하거나 CHROMIUM_PATH로 지정할 수 있고, 없으면 Playwright 설치 브라우저를 사용합니다.
- 상세 단계별 문제: output/playtest/baseline/playtest-report.md 및 results.json
- 최종 상세 결과: output/playtest/final/playtest-report.md 및 results.json
- 캡처 색인: output/playtest/index.html (압축을 풀고 열면 전체 캡처를 볼 수 있습니다).
- PNG 파일 이름: 사건ID-장면ID-단계, -390, -puzzle-단계, -result. 원정은 expedition-순번 및 expedition-result.

## 검사 한계

1280×900 및 390×844의 Chromium으로 검사했습니다. 대비는 단색 배경의 계산된 전경·배경색과 WCAG AA 기준(보통 4.5:1, 큰 글자 3:1)을 비교합니다. 이미지·그라데이션 속 글자 및 투명도·애니메이션을 포함한 픽셀 합성 대비, 실제 휴대폰 터치, 스크린리더, 다른 브라우저, 원정의 모든 장·무작위 분기는 검증하지 않았습니다. 확대 보기는 정상 닫기 UI로 닫고, 클릭은 버튼의 실제 노출 지점을 사용하며 force 클릭이나 합성 이벤트로 우회하지 않았습니다.
`;
  await mkdir("output", { recursive: true });
  await writeFile("playtest-report.md", text);
  await writeFile("output/playtest-report.md", text);
  const escape = (s) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const section = (phase, files) =>
    `<section><h2>${phase === "baseline" ? "수정 전" : phase === "final" ? "최종 전체 실행" : "저울 바탕 보완 후 추가 검증"} 캡처 (${files.length})</h2>${files.map((f) => `<details><summary>${escape(f)}</summary><a href="${phase}/${encodeURIComponent(f)}" target="_blank"><img loading="lazy" src="${phase}/${encodeURIComponent(f)}" alt="${escape(f)}"></a></details>`).join("\n")}</section>`;
  await writeFile(
    "output/playtest/index.html",
    `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>플레이테스트 캡처</title><style>body{font-family:sans-serif;max-width:1000px;margin:24px auto;padding:16px;background:#eef8ff;color:#2a2030}section,details{margin:12px 0}summary{cursor:pointer;padding:8px;background:#fffaf2;border:1px solid #2a2030}img{max-width:100%;height:auto}a{color:#254d8b}</style><h1>사건파일·원정대 전체 캡처</h1><p><a href="../playtest-report.md">최종 리포트</a> · 각 파일 이름을 누르고 그림을 누르면 원본이 열립니다.</p>${section("baseline", beforePics)}${section("final", afterPics)}${section("balance-validation", balancePics)}</html>`,
  );
}
