const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export type Session = { uid: string; exp: number };

export async function signSession(secret: string, session: Session): Promise<string> {
  const body = toBase64Url(enc.encode(JSON.stringify(session)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(secret: string, token: string, now = Date.now()): Promise<Session | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const sigBytes = fromBase64Url(sig);
  if (!sigBytes) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, enc.encode(body));
  if (!ok) return null;
  const raw = fromBase64Url(body);
  if (!raw) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(raw)) as Session;
    if (typeof session.uid !== 'string' || typeof session.exp !== 'number' || session.exp < now) return null;
    return session;
  } catch {
    return null;
  }
}

// 두 값을 같은 길이의 해시로 바꾼 뒤 끝까지 비교해서, 비교 시간으로 비밀 값을 알아낼 수 없게 해요.
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export function randomToken(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
