import type { PlazaRoom } from './plaza-room';

export type Env = {
  DB: D1Database;
  // public 폴더 파일. 그림 폴더(/char, /case, /journey)는 서버를 먼저 거쳐서 다른 사이트가 퍼 가지 못하게 해요.
  ASSETS: Fetcher;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  GUILD_ID: string;
  PUBLIC_URL: string;
  GAMBLE_TESTERS?: string;
  SESSION_SECRET: string;
  BOT_SYNC_SECRET: string;
  GAME_PROGRESS_TOKEN?: string;
  PLAZA: DurableObjectNamespace<PlazaRoom>;
  DEV_LOGIN?: string;
  // Workers AI(무료 사용량). 같이 배정되지 않기 사유 검토에만 써요. 없으면 규칙 검사만 해요.
  AI?: Ai;
  // 1이면 시즌 모둠 퀘스트에 내전 퀘스트도 넣어요(내전을 쉬는 동안은 비워 둬요)
  SCRIM_QUESTS?: string;
  // 비어 있으면 지금처럼 Worker가 앱을 전부 실행하고, 있으면 그림 외 요청을 Node 원본 서버로 넘겨요.
  ORIGIN_URL?: string;
  ORIGIN_SECRET?: string;
};

export type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string | null;
  is_newbie: number;
  active: number;
  gender_chosen_at?: string | null; // 처음 성별(여자·남자 캐릭터)을 고른 때
  last_login_at?: string | null; // 마지막으로 로그인하거나 들어온 때(모둠 퀘스트 '접속'에 써요)
  unread_alerts?: number; // 안 읽은 알림 수(🔔 빨간 점)
};

export type AppEnv = { Bindings: Env; Variables: { viewer: Member } };
