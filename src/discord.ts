import type { Env } from './env';

const API = 'https://discord.com/api/v10';

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
  const res = await fetch(`${API}/oauth2/token`, {
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
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

type GuildMember = {
  nick?: string | null;
  avatar?: string | null;
  joined_at?: string;
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
};

export type LoginProfile = { id: string; name: string; avatar_url: string | null; joined_at: string | null };

// 하리보 서버 멤버가 아니면 null
export async function fetchGuildProfile(env: Env, accessToken: string): Promise<LoginProfile | null> {
  const res = await fetch(`${API}/users/@me/guilds/${env.GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const m = (await res.json()) as GuildMember;
  const u = m.user;
  let avatar_url: string | null = null;
  if (m.avatar) avatar_url = `https://cdn.discordapp.com/guilds/${env.GUILD_ID}/users/${u.id}/avatars/${m.avatar}.png`;
  else if (u.avatar) avatar_url = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`;
  return { id: u.id, name: m.nick || u.global_name || u.username, avatar_url, joined_at: m.joined_at ?? null };
}
