// 광장: 같이 돌아다니는 지도. 통화방마다 방 구역이 있고, 방에 들어가면 디스코드 통화방도 옮겨 줘요.
// 실시간 연결은 src/plaza-room.ts(Durable Object), 화면은 public/plaza.js. 봇과 주고받는 형식은 docs/bot-sync.md

const ID = /^\d{17,20}$/;

// 위에 광장, 그 아래 같은 크기 통화방 상자를 한 줄에 다섯 개씩. 지도 폭은 데스크톱 광장 틀에 들어가는 크기예요.
export const ROOM_W = 220;
export const ROOM_H = 100;
const GAP = 16;
const MARGIN = 24;
const COLS = 5;
const ROW_GAP = 34; // 방 이름표가 위로 튀어나와서 줄 사이는 조금 더 띄워요
const PARK_H = 100;
export const WORLD_W = MARGIN * 2 + COLS * ROOM_W + (COLS - 1) * GAP;

export const MAX_CHANNELS = 30;
export const MAX_ROOM_MEMBERS = 99;
export const CHAT_MAX = 60;

export type Rect = { x: number; y: number; w: number; h: number };
export type VoiceMember = { id: string; name: string };
export type VoiceChannel = { id: string; name: string; limit: number; members: VoiceMember[]; group?: string };
export type VoiceSnapshot = { channels: VoiceChannel[]; elsewhere: string[] };
export type Room = VoiceChannel & Rect & { members: (VoiceMember & { char: string })[] };
export type Group = { name: string; x: number; y: number };
export type Layout = { w: number; h: number; park: Rect; rooms: Room[]; groups: Group[] };

// 위쪽은 처음 나타나는 광장, 그 아래는 통화방 상자예요(봇이 보낸 순서대로).
export function layoutRooms(channels: VoiceChannel[], charOf: (id: string) => string): Layout {
  const park = { x: MARGIN, y: MARGIN, w: WORLD_W - MARGIN * 2, h: PARK_H };
  const top = MARGIN + PARK_H + ROW_GAP;
  const rooms: Room[] = channels.map((ch, i) => ({
    ...ch,
    members: ch.members.map((m) => ({ ...m, char: charOf(m.id) })),
    x: MARGIN + (i % COLS) * (ROOM_W + GAP),
    y: top + Math.floor(i / COLS) * (ROOM_H + ROW_GAP),
    w: ROOM_W,
    h: ROOM_H,
  }));
  const rows = Math.ceil(channels.length / COLS);
  const bottom = rows ? top + rows * (ROOM_H + ROW_GAP) - ROW_GAP : MARGIN + PARK_H;
  return { w: WORLD_W, h: bottom + MARGIN, park, rooms, groups: [] };
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function roomAt(layout: Layout, x: number, y: number): Room | undefined {
  return layout.rooms.find((r) => inside(r, x, y));
}

export function clampToWorld(layout: Pick<Layout, 'w' | 'h'>, x: number, y: number) {
  return { x: Math.round(Math.min(Math.max(x, 0), layout.w)), y: Math.round(Math.min(Math.max(y, 0), layout.h)) };
}

// 공원 안 아무 곳(사람마다 조금씩 다르게)
export function spawnPoint(layout: Layout, seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  const p = layout.park;
  // 캐릭터는 발 위치 기준이라 위쪽 70px, 아래쪽 이름표 20px은 비워요
  return { x: Math.round(p.x + 40 + (h % (p.w - 80))), y: Math.round(p.y + 70 + ((h >>> 12) % Math.max(1, p.h - 90))) };
}

export function voiceChannelOf(snapshot: VoiceSnapshot | null, userId: string): string | null {
  if (!snapshot) return null;
  for (const ch of snapshot.channels) if (ch.members.some((m) => m.id === userId)) return ch.id;
  return snapshot.elsewhere.includes(userId) ? 'elsewhere' : null;
}

// 채팅 한 줄: 줄바꿈과 겹친 공백을 없애고 짧게 잘라요
export function cleanChat(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length > CHAT_MAX ? chars.slice(0, CHAT_MAX - 1).join('') + '…' : flat;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isName = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= 100;
const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100_000;

// 브라우저가 보내는 말
export type ClientMessage = { t: 'move'; x: number; y: number } | { t: 'join'; ch: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 200) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  if (v.t === 'move' && isCoord(v.x) && isCoord(v.y)) return { t: 'move', x: v.x, y: v.y };
  if (v.t === 'join' && typeof v.ch === 'string' && ID.test(v.ch)) return { t: 'join', ch: v.ch };
  return null;
}

// 봇이 보내는 말
export type BotMessage =
  | ({ t: 'voice' } & VoiceSnapshot)
  | { t: 'chat'; user: string; ch: string; text: string }
  | { t: 'moved'; user: string; ch: string; ok: boolean; reason: string | null };

export function parseBotMessage(raw: string): BotMessage | null {
  if (raw.length > 200_000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  if (v.t === 'voice') {
    if (!Array.isArray(v.channels) || v.channels.length > MAX_CHANNELS) return null;
    const channels: VoiceChannel[] = [];
    for (const c of v.channels) {
      if (!isObj(c) || typeof c.id !== 'string' || !ID.test(c.id) || !isName(c.name)) return null;
      const limit = c.limit ?? 0;
      if (!Number.isInteger(limit) || (limit as number) < 0 || (limit as number) > 99) return null;
      if (!Array.isArray(c.members) || c.members.length > MAX_ROOM_MEMBERS) return null;
      const members: VoiceMember[] = [];
      for (const m of c.members) {
        if (!isObj(m) || typeof m.id !== 'string' || !ID.test(m.id) || !isName(m.name)) return null;
        members.push({ id: m.id, name: m.name });
      }
      if (c.group !== undefined && !isName(c.group)) return null;
      channels.push({ id: c.id, name: c.name, limit: limit as number, members, ...(c.group ? { group: c.group as string } : {}) });
    }
    const rawElse = v.elsewhere ?? [];
    if (!Array.isArray(rawElse) || rawElse.length > 5000 || !rawElse.every((id) => typeof id === 'string' && ID.test(id)))
      return null;
    return { t: 'voice', channels, elsewhere: rawElse as string[] };
  }
  if (v.t === 'chat') {
    if (typeof v.user !== 'string' || !ID.test(v.user) || typeof v.ch !== 'string' || !ID.test(v.ch)) return null;
    if (typeof v.text !== 'string') return null;
    const text = cleanChat(v.text);
    return text ? { t: 'chat', user: v.user, ch: v.ch, text } : null;
  }
  if (v.t === 'moved') {
    if (typeof v.user !== 'string' || !ID.test(v.user) || typeof v.ch !== 'string' || !ID.test(v.ch)) return null;
    if (typeof v.ok !== 'boolean') return null;
    const reason = typeof v.reason === 'string' ? v.reason.slice(0, 40) : null;
    return { t: 'moved', user: v.user, ch: v.ch, ok: v.ok, reason };
  }
  return null;
}

// 너무 자주 보내는 걸 막는 간단한 창(초당 move 10번, 3초에 join 1번)
export type Rate = { start: number; count: number };
export function allow(rate: Rate, now: number, windowMs: number, max: number): boolean {
  if (now - rate.start >= windowMs) {
    rate.start = now;
    rate.count = 0;
  }
  rate.count += 1;
  return rate.count <= max;
}
