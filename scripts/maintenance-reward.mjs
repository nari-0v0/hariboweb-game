// 11/21 점검 보상 SQL 만들기 (나리 2026-11-19 결정).
//
// 쓰는 법: node scripts/maintenance-reward.mjs <웹이 닫혀 있던 시간(시간 단위, 예: 2.5)> > maintenance-reward.sql
// 만든 SQL은 겜블장 초기화(gamble-reset.sql)와 젤리 이전(gamble-jelly-moves)이 끝난 "다음에"
// wrangler d1 execute haribo-dogam --remote --file 로 한 번 실행해요. 순서는 docs/maintenance-reward.md.
//
// 지금 웹 도감에 있는 멤버(members.active = 1) 모두 똑같이 받아요.
//   - 도감 젤리: jelly_grants 기록에도 남아요(이유 "11/21 점검 보상"). 디스코드 축하 글은 올라가지 않아요.
//   - 원정대 재료: 1장부터 지금까지 열린 장(재료 기록이 있는 가장 뒤 장)까지 장마다 같은 개수. 안 해 본 사람은 1장 재료.
//   - 젤칩: 겜블장 계정에 더해요. 겜블장에 처음 올 때 받는 시작 1,000개는 따로 그대로 받아요(매일 주는 칩은 없어요).
//   - 🔔 알림 하나.
// "이미 받음" 표시는 지워지지 않는 jelly_grants 기록(id maint-2026-11-21:<멤버>)이에요. 알림은 멤버가 지우거나
// 15일 뒤 저절로 지워지니까 표시로 쓰지 않아요(Codex 리뷰).
//
// 중간에 끊겨도 두 번 주지 않게(2026-11-21 점검): D1은 파일의 문장을 하나씩 실행해서, 예전처럼 "주기 → 마지막에 표시"로
// 나누면 중간에 끊긴 뒤 다시 돌릴 때 앞에서 이미 준 것을 또 줬어요. 그래서 보상 전부를 jelly_grants에 표시를 넣는
// 순간 도는 트리거 안에 넣었어요. 표시 넣기(INSERT OR IGNORE) 한 문장 = 표시 + 젤리·재료·젤칩·알림이라 함께 되거나
// 함께 안 되고, 이미 표시가 있는 사람은 OR IGNORE로 트리거가 돌지 않아요. 트리거는 끝에서 지워요(남아도 이 표시
// 번호가 아니면 아무 일도 안 해요). 그래서 같은 파일을 언제, 어디서 끊겨 다시 실행해도 한 사람에게 한 번만 들어가요.
import { pathToFileURL } from 'node:url';

export const REF = 'maint-2026-11-21';
export const GRANTED_BY = '323412514224209921'; // 나리
export const MAX_CH = 15; // 원정대 마지막 장(밤샘 점검 #308: 10~15장 재료도 받게)

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
  const trigger = `maint_reward_${REF.replace(/\W/g, '_')}`;
  // 트리거 안에서 NEW.user_id = 표시를 넣은 멤버
  const top = `COALESCE((SELECT MAX(CAST(key AS INTEGER)) FROM json_each(journey_bank.mats) WHERE CAST(key AS INTEGER) BETWEEN 1 AND ${MAX_CH}), 1)`;
  const body = [
    // 1) 도감 젤리
    `INSERT OR IGNORE INTO profiles (user_id, dogam_jelly, updated_at) VALUES (NEW.user_id, 0, '${now}');`,
    `UPDATE profiles SET dogam_jelly = dogam_jelly + ${t.jelly}, updated_at = '${now}' WHERE user_id = NEW.user_id;`,
    // 2) 원정대 재료
    `INSERT OR IGNORE INTO journey_bank (user_id, mats, updated_at) VALUES (NEW.user_id, '{}', '${now}');`,
  ];
  for (let ch = 1; ch <= MAX_CH; ch++) {
    body.push(`UPDATE journey_bank SET mats = json_set(mats, '$."${ch}"', COALESCE(json_extract(mats, '$."${ch}"'), 0) + ${t.mats}), updated_at = '${now}'
    WHERE user_id = NEW.user_id AND ${top} >= ${ch};`);
  }
  body.push(
    // 3) 젤칩
    `INSERT OR IGNORE INTO gamble_accounts (user_id, chips) VALUES (NEW.user_id, 0);`,
    `UPDATE gamble_accounts SET chips = chips + ${t.chips} WHERE user_id = NEW.user_id;`,
    // 4) 알림
    `INSERT OR IGNORE INTO alerts (user_id, ref, title, body, created_at)
    VALUES (NEW.user_id, '${REF}', '🎁 11/21 점검 보상', '점검 동안 기다려 줘서 고마워요! 도감 젤리 ${t.jelly}개, 원정대 재료(열린 장마다 ${t.mats}개씩), 젤칩 ${fmt(t.chips)}개를 넣었어요.', '${now}');`,
  );
  const lines = [
    `-- 11/21 점검 보상: 점검 ${hours}시간 → ${t.label} 칸 (도감 젤리 ${t.jelly}, 원정대 재료 장마다 ${t.mats}, 젤칩 ${t.chips}), 만든 때 ${now}`,
    '-- 겜블장 젤리 이전이 끝나지 않았으면 여기서 멈춰요(먼저 주면 겜블장 초기화 때 젤칩이 지워져요).',
    `SELECT CASE WHEN EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL) THEN 1 ELSE json('STOP: gamble jelly move not done yet') END;`,
    '-- 앞에서 끊겼다 다시 돌리는 거라면 남은 트리거를 이 파일 것으로 바꿔요.',
    `DROP TRIGGER IF EXISTS ${trigger};`,
    `CREATE TRIGGER ${trigger} AFTER INSERT ON jelly_grants
WHEN NEW.id = '${REF}:' || NEW.user_id
BEGIN
  ${body.join('\n  ')}
END;`,
    '-- 받음 표시 넣기 = 보상 주기(한 문장). 이미 받은 사람은 건너뛰어요.',
    `INSERT OR IGNORE INTO jelly_grants (id, user_id, amount, reason, granted_by, created_at, applied_at)
  SELECT '${REF}:' || user_id, user_id, ${t.jelly}, '11/21 점검 보상', '${GRANTED_BY}', '${now}', '${now}'
  FROM members WHERE active = 1;`,
    `DROP TRIGGER IF EXISTS ${trigger};`,
  ];
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
