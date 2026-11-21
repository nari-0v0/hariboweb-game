import type { Env } from './env';

const API = 'https://discord.com/api/v10';
// 디스코드가 멈춰도 로그인 요청이 오래 묶이지 않게 10초에서 끊어요(점검 W10). 끊기거나 연결이 안 되면 실패(null)로 봐요.
const TIMEOUT_MS = 10_000;
async function call(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    console.error(`디스코드 요청 실패: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function authorizeUrl(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds.members.read',
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<string | null> {
  const res = await call(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
  return typeof data?.access_token === 'string' ? data.access_token : null;
}

type GuildMember = {
  nick?: string | null;
  avatar?: string | null;
  joined_at?: string;
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
};

export type LoginProfile = { id: string; name: string; avatar_url: string | null; joined_at: string | null };

// 하리보 서버 멤버가 아니면(디스코드가 404) 'not_member', 연결이 끊기거나 다른 오류면 null(다시 시도 안내)
export async function fetchGuildProfile(env: Env, accessToken: string): Promise<LoginProfile | 'not_member' | null> {
  const res = await call(`${API}/users/@me/guilds/${env.GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res?.status === 404) return 'not_member';
  if (!res?.ok) return null;
  const m = (await res.json().catch(() => null)) as GuildMember | null;
  const u = m?.user;
  // 모양이 이상한 답(디스코드 변경·오류)은 로그인 실패로 봐요(점검 W194)
  if (!m || !u || typeof u.id !== 'string' || typeof u.username !== 'string') return null;
  let avatar_url: string | null = null;
  if (m.avatar) avatar_url = `https://cdn.discordapp.com/guilds/${env.GUILD_ID}/users/${u.id}/avatars/${m.avatar}.png`;
  else if (u.avatar) avatar_url = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`;
  return { id: u.id, name: m.nick || u.global_name || u.username, avatar_url, joined_at: m.joined_at ?? null };
}
