// 11/21 점검 보상 SQL 만들기 (나리 2026-11-19 결정).
//
// 쓰는 법: node scripts/maintenance-reward.mjs <웹이 닫혀 있던 시간(시간 단위, 예: 2.5)> > maintenance-reward.sql
// 만든 SQL은 겜블장 초기화(gamble-reset.sql)와 젤리 이전(gamble-jelly-moves)이 끝난 "다음에"
// wrangler d1 execute haribo-dogam --remote --file 로 한 번 실행해요. 순서는 docs/maintenance-reward.md.
//
// 지금 웹 도감에 있는 멤버(members.active = 1) 모두 똑같이 받아요.
//   - 도감 젤리: jelly_grants 기록에도 남아요(이유 "11/21 점검 보상"). 디스코드 축하 글은 올라가지 않아요.
//   - 원정대 재료: 1장부터 지금까지 열린 장(재료 기록이 있는 가장 뒤 장)까지 장마다 같은 개수. 안 해 본 사람은 1장 재료.
//   - 젤칩: 겜블장 계정에 더해요. 매일 받는 1,000개는 따로 그대로 받아요.
//   - 🔔 알림 하나.
// "이미 받음" 표시는 지워지지 않는 jelly_grants 기록(id maint-2026-11-21:<멤버>)이에요. 알림은 멤버가 지우거나
// 15일 뒤 저절로 지워지니까 표시로 쓰지 않아요(Codex 리뷰). 그래서 같은 파일을 언제 다시 실행해도 한 번만 들어가요.
import { pathToFileURL } from 'node:url';

export const REF = 'maint-2026-11-21';
export const GRANTED_BY = '323412514224209921'; // 나리
export const MAX_CH = 9;

// 경계는 아래 구간이에요(딱 3시간이면 1~3시간 칸).
export const TIERS = [
  { upto: 1, label: '1시간까지', jelly: 1, mats: 1, chips: 100 },
  { upto: 3, label: '1~3시간', jelly: 1, mats: 1, chips: 300 },
  { upto: 6, label: '3~6시간', jelly: 2, mats: 1, chips: 500 },
  { upto: 12, label: '6~12시간', jelly: 2, mats: 2, chips: 700 },
  { upto: Infinity, label: '12시간 넘게', jelly: 3, mats: 2, chips: 1000 },
];

export function tierFor(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) throw new Error(`점검 시간이 이상해요: ${hours}`);
  return TIERS.find((t) => h <= t.upto);
}

const fmt = (n) => n.toLocaleString('en-US');

export function buildRewardSql(hours, now = new Date().toISOString()) {
  const t = tierFor(hours);
  const fresh = `user_id IN (SELECT user_id FROM members WHERE active = 1)
    AND NOT EXISTS (SELECT 1 FROM jelly_grants g WHERE g.id = '${REF}:' || %T.user_id)`;
  const who = (table) => fresh.replaceAll('%T', table);
  const top = `COALESCE((SELECT MAX(CAST(key AS INTEGER)) FROM json_each(journey_bank.mats) WHERE CAST(key AS INTEGER) BETWEEN 1 AND ${MAX_CH}), 1)`;
  const lines = [
    `-- 11/21 점검 보상: 점검 ${hours}시간 → ${t.label} 칸 (도감 젤리 ${t.jelly}, 원정대 재료 장마다 ${t.mats}, 젤칩 ${t.chips}), 만든 때 ${now}`,
    '-- 겜블장 젤리 이전이 끝나지 않았으면 여기서 멈춰요(먼저 주면 겜블장 초기화 때 젤칩이 지워져요).',
    `SELECT CASE WHEN EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL) THEN 1 ELSE json('STOP: gamble jelly move not done yet') END;`,
    // 1) 도감 젤리
    `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
  SELECT user_id, ${t.jelly}, '${now}' FROM members m WHERE ${who('m')}
  ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, updated_at = excluded.updated_at;`,
    // 2) 원정대 재료
    `INSERT OR IGNORE INTO journey_bank (user_id, mats, updated_at)
  SELECT user_id, '{}', '${now}' FROM members m WHERE ${who('m')};`,
  ];
  for (let ch = 1; ch <= MAX_CH; ch++) {
    lines.push(`UPDATE journey_bank SET mats = json_set(mats, '$."${ch}"', COALESCE(json_extract(mats, '$."${ch}"'), 0) + ${t.mats}), updated_at = '${now}'
  WHERE ${who('journey_bank')} AND ${top} >= ${ch};`);
  }
  lines.push(
    // 3) 젤칩
    `INSERT OR IGNORE INTO gamble_accounts (user_id, chips) SELECT user_id, 0 FROM members m WHERE ${who('m')};`,
    `UPDATE gamble_accounts SET chips = chips + ${t.chips} WHERE ${who('gamble_accounts')};`,
    // 4) 알림
    `INSERT OR IGNORE INTO alerts (user_id, ref, title, body, created_at)
  SELECT user_id, '${REF}', '🎁 11/21 점검 보상', '점검 동안 기다려 줘서 고마워요! 도감 젤리 ${t.jelly}개, 원정대 재료(열린 장마다 ${t.mats}개씩), 젤칩 ${fmt(t.chips)}개를 넣었어요.', '${now}'
  FROM members m WHERE ${who('m')};`,
    // 5) 지급 기록 = 받음 표시. 반드시 마지막이에요.
    `INSERT OR IGNORE INTO jelly_grants (id, user_id, amount, reason, granted_by, created_at, applied_at)
  SELECT '${REF}:' || user_id, user_id, ${t.jelly}, '11/21 점검 보상', '${GRANTED_BY}', '${now}', '${now}' FROM members m WHERE ${who('m')};`,
  );
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hours = process.argv[2];
  if (!hours) {
    console.error('쓰는 법: node scripts/maintenance-reward.mjs <점검 시간(시간)> > out.sql');
    process.exit(1);
  }
  process.stdout.write(buildRewardSql(hours));
}
