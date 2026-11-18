// 원정대 사람 확인(나리 2026-11-18): 하루(한국 시간)에 원정을 HUMAN_EVERY판 떠날 때마다 한 번, 떠나기 전에
// 화면에 한글로 적힌 숫자를 숫자로 따라 치게 해요. 매크로로 밤새 돌려 두는 걸 막으려는 거예요.
// 정답은 저장하지 않고 비밀 값으로 (사람, 날짜, 오늘 떠난 판 수)에서 매번 똑같이 만들어요.
export const HUMAN_EVERY = 50;
export const HUMAN_DIGITS = 4;
const WORDS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

// started = 오늘 떠난 판 수. 50, 100, 150판째를 떠나기 전에 물어봐요.
export const needsHuman = (started: number) => started > 0 && started % HUMAN_EVERY === 0;

export async function humanCode(secret: string, user: string, day: string, started: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`journey-human|${user}|${day}|${started}`)));
  return [...sig.slice(0, HUMAN_DIGITS)].map((b) => String(b % 10)).join('');
}

// 화면에 보여 줄 글자: 4729 → "사 칠 이 구"
export const humanWords = (code: string) => [...code].map((d) => WORDS[Number(d)] ?? '').join(' ');

// 칸이나 띄어쓰기는 상관없이 숫자만 맞으면 돼요(전각 숫자도 받아요).
export function humanOk(code: string, answer: unknown): boolean {
  if (typeof answer !== 'string') return false;
  const digits = answer.normalize('NFKC').replace(/\D/g, '');
  return digits === code;
}
