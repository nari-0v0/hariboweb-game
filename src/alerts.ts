// 웹 알림함(오른쪽 위 🔔): 멤버 개인에게 보내는 알림은 디스코드가 아니라 여기만 써요(나리 2026-11-16).
// 읽은 알림은 지울 수 있고, 15일이 지나면 저절로 지워져요.

export const ALERT_KEEP_DAYS = 15;
const DAY_MS = 86_400_000;

export type Alert = { id: number; title: string; body: string; created_at: string; read_at: string | null };

export const alertCutoff = (nowMs: number) => new Date(nowMs - ALERT_KEEP_DAYS * DAY_MS).toISOString();

// 보관 기간이 지난 알림(동기화 묶음마다 같이 지워요)
export const purgeAlerts = (db: D1Database, nowMs: number) => db.prepare('DELETE FROM alerts WHERE created_at < ?').bind(alertCutoff(nowMs));

export async function listAlerts(db: D1Database, userId: string, nowMs: number, limit = 30): Promise<Alert[]> {
  const { results } = await db
    .prepare('SELECT id, title, body, created_at, read_at FROM alerts WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .bind(userId, alertCutoff(nowMs), limit)
    .all<Alert>();
  return results;
}

// 알림함을 열면 다 읽은 걸로 해요(빨간 점이 꺼져요)
export async function markAlertsRead(db: D1Database, userId: string, nowMs: number): Promise<void> {
  await db.prepare('UPDATE alerts SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(new Date(nowMs).toISOString(), userId).run();
}

// 읽은 알림만 지워요(안 읽은 건 남아요)
export async function deleteAlert(db: D1Database, userId: string, id: number): Promise<boolean> {
  const r = await db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ? AND read_at IS NOT NULL').bind(id, userId).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function clearReadAlerts(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare('DELETE FROM alerts WHERE user_id = ? AND read_at IS NOT NULL').bind(userId).run();
  return r.meta?.changes ?? 0;
}

// ── 지난 시즌 퀘스트 결과 ──

export type SeasonTeamResult = { complete: boolean; bonus: boolean; achievers: string[]; members: { id: string; left: boolean }[] };
export type SeasonServerResult = { met: boolean; participants: string[] } | null;

const kstDate = (ms: number) => {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
};

// 시즌 기간(한국 날짜). 끝은 마지막 날(끝 시각 바로 전)로 보여요.
export const seasonLabel = (start: string, end: string) => `${kstDate(Date.parse(start))}~${kstDate(Date.parse(end) - 1)}`;

// 사람마다 한 개의 결과 알림. 팀원(나간 사람 빼고)과 납치 대소동 참여자만 받아요.
export function seasonResultAlerts(
  teams: SeasonTeamResult[],
  server: SeasonServerResult,
  reward: { teamJelly: number; teamJp: number; serverJelly: number; serverJp: number },
): Map<string, string[]> {
  const lines = new Map<string, string[]>();
  const add = (u: string, line: string) => {
    const list = lines.get(u) ?? [];
    list.push(line);
    lines.set(u, list);
  };
  for (const team of teams) {
    if (team.bonus) continue;
    const reached = new Set(team.achievers);
    for (const m of team.members) {
      if (m.left) continue;
      const mine = reached.has(m.id);
      if (team.complete && mine) add(m.id, `🤝 팀 퀘스트 달성! 팀도 완료해서 도감 젤리 ${reward.teamJelly}개와 젤리피 ${reward.teamJp}를 받았어요.`);
      else if (team.complete) add(m.id, '🤝 팀 퀘스트: 팀은 완료했지만 내 목표를 채우지 못해서 보상은 없어요.');
      else if (mine) add(m.id, '🤝 팀 퀘스트: 내 목표는 달성했지만 팀이 완료하지 못해서 보상은 없어요.');
      else add(m.id, '🤝 팀 퀘스트: 이번에는 달성하지 못했어요.');
    }
  }
  if (server)
    for (const u of server.participants)
      add(
        u,
        server.met
          ? `🟢 납치 대소동: 서버 목표 달성! 참여해서 도감 젤리 ${reward.serverJelly}개와 젤리피 ${reward.serverJp}를 받았어요.`
          : '🟢 납치 대소동: 참여했지만 서버 목표를 채우지 못해서 보상은 없어요.',
      );
  return lines;
}
