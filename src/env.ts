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
  // 1이면 시즌 모둠 퀘스트에 내전 퀘스트도 넣어요(내전을 쉬는 동안은 비워 둬요)
  SCRIM_QUESTS?: string;
};

export type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string | null;
  is_newbie: number;
  active: number;
  gender_chosen_at?: string | null; // 처음 성별(여자·남자 캐릭터)을 고른 때
};

export type AppEnv = { Bindings: Env; Variables: { viewer: Member } };
