import { describe, expect, it } from 'vitest';
import { parseSync } from '../src/sync';

const A = '111111111111111111';
const B = '222222222222222222';

describe('parseSync', () => {
  it('accepts a full batch and fills defaults', () => {
    const r = parseSync({
      batch_id: '2026-10-30T10:00Z',
      members: [{ id: A, name: '하리', avatar_url: null, joined_at: '2026-01-01T00:00:00Z', is_newbie: true }],
      removed: [B],
      pair_xp: [{ a: A, b: B, xp: 30, voice_seconds: 1800, at: '2026-10-30T09:00:00Z' }],
      solo_xp: [{ id: A, xp: 20 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pair_xp[0]).toMatchObject({ scrims: 0, at: '2026-10-30T09:00:00.000Z' });
    expect(r.value.members[0]!.is_newbie).toBe(true);
    expect(r.value.members[0]!.jelly).toBeNull();
  });

  it('reads the jelly balance the bot sends', () => {
    const r = parseSync({ batch_id: 'x', members: [{ id: A, name: 'a', jelly: 42 }] });
    expect(r.ok && r.value.members[0]!.jelly).toBe(42);
  });

  it('allows missing lists', () => {
    const r = parseSync({ batch_id: 'x' });
    expect(r.ok && r.value).toEqual({ batch_id: 'x', members: [], removed: [], pair_xp: [], solo_xp: [] });
  });

  it.each([
    ['no batch id', { members: [] }],
    ['bad id', { batch_id: 'x', removed: ['abc'] }],
    ['self pair', { batch_id: 'x', pair_xp: [{ a: A, b: A, xp: 1, at: '2026-10-30T00:00:00Z' }] }],
    ['negative xp', { batch_id: 'x', solo_xp: [{ id: A, xp: -1 }] }],
    ['fractional xp', { batch_id: 'x', pair_xp: [{ a: A, b: B, xp: 1.5, at: '2026-10-30T00:00:00Z' }] }],
    ['bad time', { batch_id: 'x', pair_xp: [{ a: A, b: B, xp: 1, at: 'yesterday' }] }],
    ['http avatar', { batch_id: 'x', members: [{ id: A, name: 'a', avatar_url: 'http://x' }] }],
    ['not a list', { batch_id: 'x', members: {} }],
    ['negative jelly', { batch_id: 'x', members: [{ id: A, name: 'a', jelly: -1 }] }],
    ['text jelly', { batch_id: 'x', members: [{ id: A, name: 'a', jelly: '5' }] }],
  ])('rejects %s', (_, payload) => {
    expect(parseSync(payload).ok).toBe(false);
  });
});
