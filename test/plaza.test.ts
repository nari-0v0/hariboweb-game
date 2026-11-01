import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX,
  WORLD_W,
  allow,
  cleanChat,
  clampToWorld,
  layoutRooms,
  parseBotMessage,
  parseClientMessage,
  roomAt,
  spawnPoint,
  voiceChannelOf,
} from '../src/plaza';

const A = '111111111111111111';
const B = '222222222222222222';
const CH1 = '900000000000000001';
const CH2 = '900000000000000002';

const channels = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `90000000000000000${i}`, name: `방${i}`, limit: 0, members: [] }));

describe('layoutRooms', () => {
  it('places the park on top and rooms in rows below it without overlap', () => {
    const l = layoutRooms(channels(7), () => '');
    expect(l.w).toBe(WORLD_W);
    expect(l.rooms).toHaveLength(7);
    for (const a of l.rooms)
      for (const b of l.rooms)
        if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    const top = Math.min(...l.rooms.map((r) => r.y));
    expect(top).toBeGreaterThan(l.park.y + l.park.h);
    expect(l.h).toBeGreaterThan(Math.max(...l.rooms.map((r) => r.y + r.h)));
    for (const r of l.rooms) expect(r.x + r.w).toBeLessThanOrEqual(l.w);
  });

  it('puts each category in its own labelled section', () => {
    const chs = [
      ...channels(6).map((c) => ({ ...c, group: '일반통화방' })),
      ...channels(2).map((c, i) => ({ ...c, id: `91000000000000000${i}`, group: '내전통화방' })),
    ];
    const l = layoutRooms(chs, () => '');
    expect(l.groups.map((g) => g.name)).toEqual(['일반통화방', '내전통화방']);
    const normal = l.rooms.filter((r) => r.group === '일반통화방');
    const scrim = l.rooms.filter((r) => r.group === '내전통화방');
    const normalBottom = Math.max(...normal.map((r) => r.y + r.h));
    expect(l.groups[1]!.y).toBeGreaterThanOrEqual(normalBottom);
    for (const r of scrim) expect(r.y).toBeGreaterThan(l.groups[1]!.y);
    expect(Math.min(...normal.map((r) => r.y))).toBeGreaterThan(l.park.y + l.park.h);
  });

  it('rejects a bad group name from the bot', () => {
    const ok = parseBotMessage(JSON.stringify({ t: 'voice', channels: [{ id: CH1, name: '수다방', limit: 0, members: [], group: '일반통화방' }] }));
    expect(ok && ok.t === 'voice' && ok.channels[0]!.group).toBe('일반통화방');
    expect(parseBotMessage(JSON.stringify({ t: 'voice', channels: [{ id: CH1, name: '수다방', limit: 0, members: [], group: 5 }] }))).toBeNull();
  });

  it('works with no rooms and attaches characters to members', () => {
    expect(layoutRooms([], () => '').rooms).toEqual([]);
    const l = layoutRooms([{ id: CH1, name: '수다방', limit: 5, members: [{ id: A, name: '하리' }] }], (id) => `/char/${id}.png`);
    expect(l.rooms[0]!.members[0]).toEqual({ id: A, name: '하리', char: `/char/${A}.png` });
  });

  it('finds the room under a point, and spawns in the park', () => {
    const l = layoutRooms(channels(4), () => '');
    const r = l.rooms[2]!;
    expect(roomAt(l, r.x + 5, r.y + 5)?.id).toBe(r.id);
    const s = spawnPoint(l, A);
    expect(roomAt(l, s.x, s.y)).toBeUndefined();
    expect(s.x).toBeGreaterThan(l.park.x);
    expect(s.x).toBeLessThan(l.park.x + l.park.w);
    expect(s.y).toBeGreaterThan(l.park.y);
    expect(s.y).toBeLessThan(l.park.y + l.park.h);
  });

  it('clamps positions into the world', () => {
    expect(clampToWorld({ w: 100, h: 50 }, -5, 999.6)).toEqual({ x: 0, y: 50 });
  });
});

describe('client messages', () => {
  it('accepts move and join', () => {
    expect(parseClientMessage('{"t":"move","x":10,"y":20.5}')).toEqual({ t: 'move', x: 10, y: 20.5 });
    expect(parseClientMessage(`{"t":"join","ch":"${CH1}"}`)).toEqual({ t: 'join', ch: CH1 });
  });
  it('rejects anything else', () => {
    for (const raw of ['nope', '[]', '{"t":"move","x":"1","y":2}', '{"t":"move","x":1e9,"y":2}', '{"t":"join","ch":"abc"}', '{"t":"chat"}', 'x'.repeat(300)])
      expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('bot messages', () => {
  it('parses a voice snapshot', () => {
    const raw = JSON.stringify({ t: 'voice', channels: [{ id: CH1, name: '수다방', limit: 4, members: [{ id: A, name: '하리' }] }], elsewhere: [B] });
    expect(parseBotMessage(raw)).toEqual({
      t: 'voice',
      channels: [{ id: CH1, name: '수다방', limit: 4, members: [{ id: A, name: '하리' }] }],
      elsewhere: [B],
    });
  });
  it('rejects bad snapshots', () => {
    expect(parseBotMessage(JSON.stringify({ t: 'voice', channels: [{ id: 'x', name: 'a', members: [] }] }))).toBeNull();
    expect(parseBotMessage(JSON.stringify({ t: 'voice', channels: channels(31) }))).toBeNull();
    expect(parseBotMessage(JSON.stringify({ t: 'voice', channels: [{ id: CH1, name: 'a', limit: -1, members: [] }] }))).toBeNull();
    expect(parseBotMessage(JSON.stringify({ t: 'voice', channels: [], elsewhere: ['bad'] }))).toBeNull();
  });
  it('cleans chat text and drops empty chat', () => {
    const long = '가'.repeat(100);
    const msg = parseBotMessage(JSON.stringify({ t: 'chat', user: A, ch: CH1, text: `  안녕\n\n  ${long}` }));
    expect(msg && msg.t === 'chat' && [...msg.text].length).toBe(CHAT_MAX);
    expect(parseBotMessage(JSON.stringify({ t: 'chat', user: A, ch: CH1, text: '   ' }))).toBeNull();
    expect(cleanChat(' 하이  하이 ')).toBe('하이 하이');
  });
  it('parses move results', () => {
    expect(parseBotMessage(JSON.stringify({ t: 'moved', user: A, ch: CH2, ok: false, reason: 'full' }))).toEqual({
      t: 'moved', user: A, ch: CH2, ok: false, reason: 'full',
    });
    expect(parseBotMessage(JSON.stringify({ t: 'moved', user: A, ch: CH2, ok: 'yes' }))).toBeNull();
  });
});

describe('voiceChannelOf', () => {
  const snap = { channels: [{ id: CH1, name: 'a', limit: 0, members: [{ id: A, name: 'a' }] }], elsewhere: [B] };
  it('finds where someone is', () => {
    expect(voiceChannelOf(snap, A)).toBe(CH1);
    expect(voiceChannelOf(snap, B)).toBe('elsewhere');
    expect(voiceChannelOf(snap, '333333333333333333')).toBeNull();
    expect(voiceChannelOf(null, A)).toBeNull();
  });
});

describe('allow', () => {
  it('limits messages per window', () => {
    const rate = { start: 0, count: 0 };
    expect(allow(rate, 1000, 1000, 2)).toBe(true);
    expect(allow(rate, 1100, 1000, 2)).toBe(true);
    expect(allow(rate, 1200, 1000, 2)).toBe(false);
    expect(allow(rate, 2100, 1000, 2)).toBe(true);
  });
});
