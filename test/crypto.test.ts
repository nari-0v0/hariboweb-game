import { describe, expect, it } from 'vitest';
import { safeEqual, signSession, verifySession } from '../src/crypto';

describe('session cookie', () => {
  const secret = 'test-secret';
  const session = { uid: '123456789012345678', exp: Date.now() + 60_000 };

  it('round-trips', async () => {
    const token = await signSession(secret, session);
    expect(await verifySession(secret, token)).toEqual(session);
  });

  it('rejects a wrong secret, tampering, and expiry', async () => {
    const token = await signSession(secret, session);
    expect(await verifySession('other', token)).toBeNull();
    const [body, sig] = token.split('.');
    const forged = await signSession('other', { ...session, uid: '999999999999999999' });
    expect(await verifySession(secret, `${forged.split('.')[0]}.${sig}`)).toBeNull();
    expect(await verifySession(secret, `${body}.`)).toBeNull();
    expect(await verifySession(secret, 'garbage')).toBeNull();
    expect(await verifySession(secret, token, session.exp + 1)).toBeNull();
  });

  it('compares secrets', async () => {
    expect(await safeEqual('Bearer a', 'Bearer a')).toBe(true);
    expect(await safeEqual('Bearer a', 'Bearer b')).toBe(false);
    expect(await safeEqual('', 'Bearer a')).toBe(false);
  });
});
