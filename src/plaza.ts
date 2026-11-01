// 광장: 같이 돌아다니는 지도. 통화방마다 방 구역이 있고, 방에 들어가면 디스코드 통화방도 옮겨 줘요.
// 실시간 연결은 src/plaza-room.ts(Durable Object), 화면은 public/plaza.js. 봇과 주고받는 형식은 docs/bot-sync.md

const ID = /^\d{17,20}$/;

// 위에 작은 광장, 그 아래 통화방 상자. 사람 있는 방은 앉은 사람이 다 보이게 넓어지고, 빈 방은 작게 줄어요.
// 카테고리마다 이름표를 달고 구역을 나눠요. 방은 왼쪽부터 채우고 자리가 모자라면 다음 줄로 넘어가요.
export const WORLD_W = 1080;
const GAP = 14;
const MARGIN = 24;
const ROW_GAP = 34; // 방 이름표가 위로 튀어나와서 줄 사이는 조금 더 띄워요
const GROUP_HEAD = 46;
const PARK_H = 100;
const EMPTY_W = 120; // 빈 방
const EMPTY_H = 60;
const SEAT_W = 54; // 앉은 캐릭터 한 칸(public/styles.css .plaza-seat 52px + 간격 2px)
const SEAT_H = 68;
const ROOM_PAD_W = 24; // 테두리 + 안쪽 여백
const ROOM_PAD_H = 30; // 위 이름표 자리 + 아래 여백
const MIN_W = 130;

// 방 이름표가 잘리지 않을 만큼의 폭(대충 계산: 한글 14px, 그 밖 8px + 인원수 칸)
function signWidth(name: string): number {
  let w = 0;
  for (const ch of name) w += /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u{1F000}-\u{1FFFF}]/u.test(ch) ? 14 : 8;
  return Math.min(WORLD_W - MARGIN * 2, w + 100);
}

// 방 크기: 앉을 사람 수에 맞춰요. 한 줄에 다 안 들어가면 여러 줄로 앉아요. 빈 방은 이름표만큼만.
export function roomSize(people: number, name = ''): { w: number; h: number } {
  const sign = signWidth(name);
  if (people <= 0) return { w: Math.max(EMPTY_W, sign), h: EMPTY_H };
  const perRow = Math.floor((WORLD_W - MARGIN * 2 - ROOM_PAD_W) / SEAT_W);
  const cols = Math.min(people, perRow);
  const rows = Math.ceil(people / perRow);
  return { w: Math.max(MIN_W, sign, ROOM_PAD_W + cols * SEAT_W), h: ROOM_PAD_H + rows * SEAT_H };
}

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

// 위쪽은 처음 나타나는 광장, 그 아래는 카테고리별 방 구역이에요(봇이 보낸 순서대로, 같은 카테고리는 붙어 있어요).
export function layoutRooms(channels: VoiceChannel[], charOf: (id: string) => string): Layout {
  const sections: { name: string; channels: VoiceChannel[] }[] = [];
  for (const ch of channels) {
    const name = ch.group ?? '';
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.channels.push(ch);
    else sections.push({ name, channels: [ch] });
  }
  const rooms: Room[] = [];
  const groups: Group[] = [];
  const park = { x: MARGIN, y: MARGIN, w: WORLD_W - MARGIN * 2, h: PARK_H };
  let y = MARGIN + PARK_H + GAP * 2;
  for (const sec of sections) {
    if (sec.name) {
      groups.push({ name: sec.name, x: MARGIN, y });
      y += GROUP_HEAD;
    }
    let x = MARGIN;
    let rowH = 0;
    for (const ch of sec.channels) {
      const { w, h } = roomSize(ch.members.length, ch.name);
      if (x > MARGIN && x + w > WORLD_W - MARGIN) {
        y += rowH + ROW_GAP;
        x = MARGIN;
        rowH = 0;
      }
      rooms.push({ ...ch, members: ch.members.map((m) => ({ ...m, char: charOf(m.id) })), x, y, w, h });
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }
    y += rowH + ROW_GAP + GAP;
  }
  return { w: WORLD_W, h: y - GAP - ROW_GAP + MARGIN, park, rooms, groups };
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
