// 실행 중인 로컬 wrangler에만 사용: node scripts/story-smoke.mjs
// 실제 서버·운영 데이터에서는 실행할 수 없어요. 비밀 값은 읽거나 출력하지 않습니다.
import assert from 'node:assert/strict';
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), '로컬 서버에서만 실행할 수 있습니다');
let checks = 0;
const check = (actual, expected) => { assert.equal(actual, expected); checks++; };
const headers = cookie => ({ Cookie: cookie, Origin: base.origin, 'Content-Type': 'application/x-www-form-urlencoded' });
async function login(offset) {
  const id = String(BigInt('900000000000000000') + BigInt(Date.now()) + BigInt(offset));
  const res = await fetch(new URL(`/auth/dev?id=${id}&name=QA${offset}`, base), { redirect: 'manual' });
  check(res.status, 302);
  const cookie = res.headers.get('set-cookie')?.split(';')[0]; assert(cookie, 'DEV_LOGIN=1인 로컬 서버가 필요합니다');
  const choose = await fetch(new URL('/api/me/gender', base), { method: 'POST', headers: headers(cookie), body: 'pool=boy', redirect: 'manual' });
  check(choose.status, 302); return cookie;
}
const post = (path, body, cookie, overrides = {}) => fetch(new URL(path, base), { method: 'POST', redirect: 'manual', headers: { ...headers(cookie), ...overrides }, body: typeof body === 'string' ? body : new URLSearchParams(body) });
const html = async (path, cookie) => {
  const res = await fetch(new URL(path, base), { headers: { Cookie: cookie } }); check(res.status, 200); check(res.headers.get('cache-control'), 'no-store'); return res.text();
};
check((await post('/api/story/start', '', '')).status, 401);
const cookie = await login(0), other = await login(1);
const request = crypto.randomUUID();
const start = { kind: 'case', content: 'jelly500', request };
check((await post('/api/story/start', start, cookie, { Origin: 'https://example.invalid' })).status, 403);
check((await post('/api/story/start', start, cookie, { Origin: '' })).status, 403);
check((await post('/api/story/start', JSON.stringify(start), cookie, { 'Content-Type': 'application/json' })).status, 400);
check((await post('/api/story/start', new URLSearchParams(start).toString() + '&kind=case', cookie)).status, 400);
check((await post('/api/story/start', 'x=' + 'a'.repeat(5000), cookie)).status, 413);
const simultaneous = await Promise.all([post('/api/story/start', start, cookie), post('/api/story/start', start, cookie)]);
for (const res of simultaneous) check(res.status, 303);
check(simultaneous[0].headers.get('location'), simultaneous[1].headers.get('location'));
let rev = 0;
const action = (type, choice, at = rev) => ({ run: request, at: String(at), action: type, choice });
check((await post('/api/story/act', action('inspect', 'receipt|time,porter,amount,destination'), other)).status, 404);
check((await post('/api/story/act', action('inspect', 'receipt|time,porter,amount,destination', NaN), cookie)).status, 400);
check((await post('/api/story/act', action('answer', '1'), cookie)).headers.get('location')?.includes('n=bad'), true);
check((await post('/api/story/act', action('jelly', 'read:A'), cookie)).status, 303); rev++;
check((await post('/api/story/act', action('jelly', 'read:B', 0), cookie)).headers.get('location')?.includes('n=stale'), true);
check((await post('/api/story/act', action('inspect', 'boxes|500'), cookie)).headers.get('location')?.includes('n=bad'), true);
check((await post('/api/story/act', action('reconstruct', 'a,x,p;b,y,k;c,z,p;2,AG;3,DE;1,CG;2,IJ;1,FH'), cookie)).headers.get('location')?.includes('n=bad'), true);
for (const id of 'BCDEFGHIJKL') { check((await post('/api/story/act', action('jelly', 'read:' + id), cookie)).status, 303); rev++; }
check((await post('/api/story/act', action('reconstruct', 'b,x,p;b,y,k;c,z,p;2,AG;3,DE;1,CG;2,IJ;1,FH'), cookie)).status, 303); rev++;
check((await html('/cases/story?r=' + request, cookie)).includes('첫 젤리 운반 시각이 문턱 계수기 원장'), true);
const final = await Promise.all([post('/api/story/act', action('reconstruct', 'a,x,p;b,y,k;c,z,p;2,AG;3,DE;1,CG;2,IJ;1,FH'), cookie), post('/api/story/act', action('reconstruct', 'a,x,p;b,y,k;c,z,p;2,AG;3,DE;1,CG;2,IJ;1,FH'), cookie)]);
check(final.filter(r => r.headers.get('location')?.includes('n=stale')).length, 1);
const page = await html(`/cases/story?r=${request}`, cookie);
check(page.includes('최초 완료 보상: 내 카드 경험치 +10, 도감 젤리 +1'), true);
check(page.includes('사건 해결'), true);
check((await post('/api/story/start', start, cookie)).headers.get('location'), `/cases/story?r=${request}#now`);
const res = await fetch(new URL(`/cases/story?r=${request}`, base), { headers: { Cookie: other } });
check((await res.text()).includes('최초 완료 보상:'), false);
console.log(`로컬 Workers + D1 HTTP 검사 ${checks}개 통과 (인증·Origin·형식·크기·소유권·동시 요청·보상)`);
