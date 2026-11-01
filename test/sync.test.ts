import { describe, expect, it } from 'vitest';
import { levelUpJelly, parseSync } from '../src/sync';

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
  });

  it('ignores the old gamble jelly balance and reads dogam jelly earned', () => {
    const r = parseSync({ batch_id: 'x', members: [{ id: A, name: 'a', jelly: 42 }], jelly_earned: [{ id: A, amount: 3 }] });
    expect(r.ok && r.value.members[0]).toEqual({ id: A, name: 'a', avatar_url: null, joined_at: null, is_newbie: false });
    expect(r.ok && r.value.jelly_earned).toEqual([{ id: A, amount: 3 }]);
  });

  it.each([0, -1, 101, 1.5])('rejects jelly_earned amount %s', (amount) => {
    expect(parseSync({ batch_id: 'x', jelly_earned: [{ id: A, amount }] }).ok).toBe(false);
  });

  it('allows missing lists', () => {
    const r = parseSync({ batch_id: 'x' });
    expect(r.ok && r.value).toEqual({ batch_id: 'x', members: [], removed: [], pair_xp: [], solo_xp: [], jelly_earned: [] });
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
  ])('rejects %s', (_, payload) => {
    expect(parseSync(payload).ok).toBe(false);
  });
});

describe('levelUpJelly', () => {
  const pair = (xp: number) => ({ a: A, b: B, xp, voice_seconds: 0, scrims: 0, at: '2026-11-01T00:00:00.000Z' });
  it('gives one jelly per card level gained to each card owner', () => {
    // 레벨 2 = 30xp, 레벨 3 = 120xp
    const jelly = levelUpJelly(new Map([[`${A}:${B}`, 20], [`${B}:${A}`, 20]]), [pair(110)]);
    expect(jelly.get(A)).toBe(2);
    expect(jelly.get(B)).toBe(2);
  });
  it('counts several pairs in one batch in order and gives nothing without a level up', () => {
    expect(levelUpJelly(new Map(), [pair(10)]).size).toBe(0);
    const jelly = levelUpJelly(new Map(), [pair(20), pair(20)]);
    expect(jelly.get(A)).toBe(1);
  });
});
