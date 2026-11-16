// 디스코드 봇 겜블장 지갑 젤리 → 웹 젤칩 1:1 옮기기 SQL 만들기 (2026-11-21, 나리 결정).
//
// 쓰는 법: node scripts/gamble-jelly-moves.mjs wallets.json > gamble-jelly-moves.sql
//   wallets.json = [{"user_id": "디스코드 숫자 ID", "jelly": 지갑 젤리}, ...]
//   (봇 DB gamble_records의 acct 기록에서 지갑 "jelly"만 읽어요. 예금·적금·주식·알바는 넣지 않아요.)
// 만든 SQL은 wrangler d1 execute haribo-dogam --remote --file 로 한 번 실행해요.
// 두 번 실행해도 젤칩은 한 번만 들어가요(migrations/0042_gamble_jelly_moves.sql).
// 지금 웹 도감에 있는 멤버만 받아요. 서버를 떠난 사람 몫은 넣지 않고 표에만 남아요.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function buildMoveSql(wallets, now = new Date().toISOString()) {
  if (!Array.isArray(wallets)) throw new Error('지갑 목록은 배열이어야 해요');
  const seen = new Set();
  const rows = [];
  for (const w of wallets) {
    const id = String(w?.user_id ?? '');
    const jelly = Number(w?.jelly);
    if (!/^\d{15,20}$/.test(id)) throw new Error(`이상한 디스코드 ID: ${id}`);
    if (!Number.isSafeInteger(jelly) || jelly < 0) throw new Error(`이상한 젤리 값: ${id}=${w?.jelly}`);
    if (seen.has(id)) throw new Error(`같은 사람이 두 번 있어요: ${id}`);
    seen.add(id);
    if (jelly > 0) rows.push(`('${id}', ${jelly}, '${now}')`);
  }
  const lines = [`-- 겜블장 지갑 젤리 → 젤칩 1:1, ${rows.length}명, 만든 때 ${now}`];
  if (rows.length) {
    lines.push(`INSERT OR IGNORE INTO gamble_jelly_moves (user_id, jelly, loaded_at) VALUES\n  ${rows.join(',\n  ')};`);
  }
  lines.push(`UPDATE gamble_jelly_moves SET moved_at = '${now}'
  WHERE moved_at IS NULL AND user_id IN (SELECT user_id FROM members WHERE active = 1);`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('쓰는 법: node scripts/gamble-jelly-moves.mjs wallets.json > out.sql');
    process.exit(1);
  }
  process.stdout.write(buildMoveSql(JSON.parse(readFileSync(file, 'utf8'))));
}
