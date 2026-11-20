// 디스코드 서버 부스터 혜택(나리 2026-11-21). 밸런스를 해치지 않게 보이는 것 위주예요.
// 1) 부스트 중에만 쓰는 칭호 「부스터」  2) 도감·순위에서 이름 옆 💎  3) 달마다 처음 확인될 때 도감 젤리 1개
// 부스트를 끊으면 칭호·💎는 사라지고(고른 칭호는 떼요), 다시 하면 돌아와요. 봇이 동기화 members[].booster로 알려 줘요.
export const BOOSTER_TITLE_ID = 'booster';
export const BOOSTER_MARK = '💎';
export const BOOSTER_JELLY = 1;

const KST_MS = 9 * 3_600_000;
// 한국 시간 기준 달(YYYY-MM)
export const kstMonth = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 7);

// 감사 젤리를 줄 차례인 달(나리 2026-11-21): 처음(배포 달)에는 지금 부스터 모두, 그다음부터는 부스트 시작일(since)이
// 달마다 돌아오는 날(결제일)에 줘요. 마지막으로 돌아온 결제일의 달을 돌려주고, 이 값이 마지막으로 준 달보다 크면 줘요.
// 시작일을 모르면(예전 봇) 그냥 달이 바뀔 때 줘요. 31일처럼 그 달에 없는 날은 그 달 마지막 날로 봐요.
export function boosterDueMonth(since: string | null | undefined, nowMs: number): string {
  const start = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(start) || start > nowMs) return kstMonth(nowMs);
  const s = new Date(start + KST_MS);
  const n = new Date(nowMs + KST_MS);
  const anniversary = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(s.getUTCDate(), last), s.getUTCHours(), s.getUTCMinutes(), s.getUTCSeconds());
  };
  let y = n.getUTCFullYear();
  let m = n.getUTCMonth();
  if (anniversary(y, m) > n.getTime()) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

// 순위 등에서 쓰는 이름: 부스터면 뒤에 💎를 붙여요(SQL 조각)
export const boosterNameSql = (alias = 'm') =>
  `CASE WHEN ${alias}.booster = 1 THEN ${alias}.display_name || ' ${BOOSTER_MARK}' ELSE ${alias}.display_name END`;

export const withBoosterMark = (name: string, booster: unknown) => (Number(booster) === 1 ? `${name} ${BOOSTER_MARK}` : name);

// 동기화 묶음에서 부스트 여부가 온 사람마다. 멤버를 적은(active = 1) 다음에 실행해요.
export function boosterStatements(db: D1Database, list: { id: string; booster: boolean; since?: string | null }[], nowMs: number): D1PreparedStatement[] {
  const t = new Date(nowMs).toISOString();
  const month = kstMonth(nowMs);
  // ?2 = 줄 차례인 달(결제일 기준), ?4 = 적어 둘 달(이번 달). 처음 준 달에 결제일이 또 와도 두 번 주지 않아요.
  const due = `EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1 AND booster = 1 AND COALESCE(booster_gift_month, '') < ?2)`;
  const alert = db.prepare(
    `INSERT INTO alerts (user_id, ref, title, body, created_at)
     SELECT ?1, 'booster-' || ?4, '💎 서버 부스트 고마워요!', '이번 달 감사 선물로 도감 젤리 ${BOOSTER_JELLY}개를 받았어요.', ?3 WHERE ${due}
     ON CONFLICT (user_id, ref) DO NOTHING`,
  );
  const jelly = db.prepare(
    `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
     SELECT ?1, ${BOOSTER_JELLY}, ?3 WHERE ${due} AND ?4 IS NOT NULL -- ?4는 알림과 같은 자리 맞추기용
     ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + ${BOOSTER_JELLY}, updated_at = ?3`,
  );
  // 처음 줄 때는 이번 달(?3)을 적어서 같은 달에 결제일이 또 와도 두 번 주지 않고, 그다음부터는 결제일의 달(?2)을 적어요.
  // (결제일 다음 날 동기화로 받아도 그 달 결제일 몫으로 남아서, 다음 결제일을 놓치지 않게. Codex #299)
  const mark = db.prepare(
    `UPDATE members SET booster_gift_month = CASE WHEN booster_gift_month IS NULL THEN ?3 ELSE ?2 END
     WHERE user_id = ?1 AND active = 1 AND booster = 1 AND COALESCE(booster_gift_month, '') < ?2`,
  );
  // 부스트를 끊었으면 고른 「부스터」 칭호를 떼요(봇이 닉네임에서도 떼요)
  const unequip = db.prepare(
    `UPDATE profiles SET title_id = NULL, title_note = NULL, updated_at = ?2 WHERE user_id = ?1 AND title_id = '${BOOSTER_TITLE_ID}'`,
  );
  const stmts: D1PreparedStatement[] = [];
  for (const m of list) {
    // 알림과 젤리는 표시(mark)보다 먼저: 둘 다 "이번 달 아직 안 줌"일 때만 들어가요.
    if (m.booster) {
      const due = boosterDueMonth(m.since, nowMs);
      stmts.push(alert.bind(m.id, due, t, month), jelly.bind(m.id, due, t, month), mark.bind(m.id, due, month));
    }
    else stmts.push(unequip.bind(m.id, t));
  }
  return stmts;
}
