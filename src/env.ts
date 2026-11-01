import type { PlazaRoom } from './plaza-room';

export type Env = {
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  GUILD_ID: string;
  PUBLIC_URL: string;
  SESSION_SECRET: string;
  BOT_SYNC_SECRET: string;
  PLAZA: DurableObjectNamespace<PlazaRoom>;
  DEV_LOGIN?: string;
};

export type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string | null;
  is_newbie: number;
  active: number;
};

export type AppEnv = { Bindings: Env; Variables: { viewer: Member } };
