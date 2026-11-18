// 디스코드 봇 겜블장 지갑 젤리 → 웹 젤칩 1:1 옮기기 SQL 만들기 (2026-11-21, 나리 결정).
//
// 쓰는 법: node scripts/gamble-jelly-moves.mjs wallets.json approved.json > gamble-jelly-moves.sql
//   wallets.json = [{"user_id": "디스코드 숫자 ID", "jelly": 지갑 젤리}, ...]
//   (봇 DB gamble_records의 acct 기록에서 지갑 "jelly"만 읽어요. 예금·적금·주식·알바는 넣지 않아요.)
// 만든 SQL은 wrangler d1 execute haribo-dogam --remote --file 로 한 번 실행해요.
// 두 번 실행해도 젤칩은 한 번만 들어가요(migrations/0042_gamble_jelly_moves.sql).
// 지금 웹 도감에 있는 멤버만 받아요. 서버를 떠난 사람 몫은 넣지 않고 표에만 남아요.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function buildMoveSql(wallets, now = new Date().toISOString(), approved = null) {
  if (new Date(now).toISOString() !== now) throw new Error('잘못된 UTC 시각');
  if (!Array.isArray(wallets)) throw new Error('지갑 목록은 배열이어야 해요');
  const seen = new Set();
  const rows = [];
  const positiveBalances = new Map();
  for (const w of wallets) {
    const id = w?.user_id;
    const jelly = w?.jelly;
    if (typeof id !== 'string' || !/^\d{15,20}$/.test(id)) throw new Error(`이상한 디스코드 ID: ${id}`);
    if (!Number.isSafeInteger(jelly) || jelly < 0) throw new Error(`이상한 젤리 값: ${id}=${w?.jelly}`);
    if (seen.has(id)) throw new Error(`같은 사람이 두 번 있어요: ${id}`);
    seen.add(id);
    if (jelly > 0) {
      rows.push(`('${id}', ${jelly}, '${now}')`);
      positiveBalances.set(id, jelly);
    }
  }
  const payableIds = new Set();
  if (approved !== null && !Array.isArray(approved)) throw new Error('승인 명단은 배열이어야 해요');
  for (const row of approved ?? [...positiveBalances].map(([user_id, jelly]) => ({ user_id, jelly }))) {
    const id = row?.user_id;
    if (!positiveBalances.has(id) || positiveBalances.get(id) !== row.jelly || payableIds.has(id)) {
      throw new Error(`승인 명단과 지갑 파일이 일치하지 않아요: ${id}`);
    }
    payableIds.add(id);
  }
  const lines = [`-- 겜블장 지갑 젤리 → 젤칩 1:1, ${rows.length}명, 만든 때 ${now}`];
  if (rows.length) {
    // 이미 적재된 금액이 다르면 NOT NULL 제약으로 이 INSERT 전체를 중단해요.
    lines.push(`INSERT INTO gamble_jelly_moves (user_id, jelly, loaded_at) VALUES\n  ${rows.join(',\n  ')}
  ON CONFLICT(user_id) DO UPDATE SET jelly = NULL
  WHERE gamble_jelly_moves.jelly <> excluded.jelly;`);
  }
  if (payableIds.size) {
    const ids = [...payableIds].map(id => `'${id}'`).join(', ');
    lines.push(`UPDATE gamble_jelly_moves SET moved_at = '${now}'
  WHERE moved_at IS NULL
    AND user_id IN (${ids})
    AND user_id IN (SELECT user_id FROM members WHERE active = 1);`);
  }
  if (lines.length === 1) lines.push('SELECT 0 AS credited;');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (files.length !== 2) {
    console.error('쓰는 법: node scripts/gamble-jelly-moves.mjs wallets.json approved.json > out.sql');
    process.exit(1);
  }
  const [wallets, approved] = files.map(file => JSON.parse(readFileSync(file, 'utf8')));
  if (!Array.isArray(approved)) throw new Error('승인 명단은 배열이어야 해요');
  process.stdout.write(buildMoveSql(wallets, new Date().toISOString(), approved));
}
