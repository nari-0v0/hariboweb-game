import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Member } from './env';
import { randomToken, safeEqual, signSession, verifySession } from './crypto';
import { authorizeUrl, exchangeCode, fetchGuildProfile, type LoginProfile } from './discord';
import {
  assignCharacters,
  chooseCharacterPool,
  completion,
  countOwnedCards,
  getMember,
  getOwnedCard,
  getOwnedItems,
  getProfile,
  listDogam,
  listMyPurchases,
  listPendingPurchases,
  markPurchasesSeen,
  requestPurchase,
  saveProfile,
  setDeco,
  setTheme,
  settlePurchase,
  upsertLoginMember,
} from './db';
import { canUse, canUseTheme, decoItemId, shopItem } from './shop';
import { isCharacterPool } from './character';
import { applySync, parseSync } from './sync';
import { CardPage, DogamPage, LandingPage, MePage, MessagePage } from './views/pages';
import { ShopPage } from './views/shop';

const SESSION_COOKIE = 'hs';
const STATE_COOKIE = 'hs_state';
const SESSION_DAYS = 30;

const app = new Hono<AppEnv>();

async function page(c: Context<AppEnv>, node: unknown, status: 200 | 403 | 404 = 200) {
  return c.html('<!doctype html>' + String(await node), status);
}

const baseUrl = (c: Context<AppEnv>) => c.env.PUBLIC_URL || new URL(c.req.url).origin;
const secure = (c: Context<AppEnv>) => new URL(c.req.url).protocol === 'https:';

async function startSession(c: Context<AppEnv>, profile: LoginProfile) {
  await upsertLoginMember(c.env.DB, profile);
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  setCookie(c, SESSION_COOKIE, await signSession(c.env.SESSION_SECRET, { uid: profile.id, exp }), {
    httpOnly: true,
    secure: secure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

// 쿠키가 맞아도 서버를 떠났으면(봇이 removed로 알려 주면) 들어올 수 없어요.
async function currentViewer(c: Context<AppEnv>): Promise<Member | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const session = await verifySession(c.env.SESSION_SECRET, token);
  if (!session) return null;
  const member = await getMember(c.env.DB, session.uid);
  return member && member.active ? member : null;
}

app.get('/', async (c) => {
  if (await currentViewer(c)) return c.redirect('/me');
  const error = c.req.query('error') === 'not_member' ? '하리보 서버 멤버만 들어올 수 있어요.' : undefined;
  return page(c, <LandingPage error={error} devLogin={c.env.DEV_LOGIN === '1'} />);
});

app.get('/auth/login', (c) => {
  const state = randomToken();
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: secure(c), sameSite: 'Lax', path: '/auth', maxAge: 600 });
  return c.redirect(authorizeUrl(c.env, `${baseUrl(c)}/auth/callback`, state));
});

app.get('/auth/callback', async (c) => {
  const { code, state } = c.req.query();
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/auth' });
  if (!code || !state || !expected || state !== expected)
    return page(c, <MessagePage title="로그인 실패" message="로그인을 다시 시도해 주세요." />, 403);

  const token = await exchangeCode(c.env, code, `${baseUrl(c)}/auth/callback`);
  if (!token) return page(c, <MessagePage title="로그인 실패" message="디스코드 확인에 실패했어요. 다시 시도해 주세요." />, 403);
  const profile = await fetchGuildProfile(c.env, token);
  if (!profile) return c.redirect('/?error=not_member');

  await startSession(c, profile);
  return c.redirect('/me');
});

// 로컬 개발 전용. .dev.vars에 DEV_LOGIN=1이 있을 때만 열려요.
app.get('/auth/dev', async (c) => {
  if (c.env.DEV_LOGIN !== '1') return c.notFound();
  const id = c.req.query('id') ?? '';
  if (!/^\d{17,20}$/.test(id)) return page(c, <MessagePage title="개발용 로그인" message="17~20자리 숫자 ID를 넣어 주세요." />, 403);
  await startSession(c, { id, name: c.req.query('name') || `멤버${id.slice(-4)}`, avatar_url: null, joined_at: null });
  return c.redirect('/me');
});

app.post('/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.redirect('/');
});

// 봇 전용 API는 로그인 대신 비밀 토큰으로 확인해요.
async function isBot(c: Context<AppEnv>) {
  const auth = c.req.header('Authorization') ?? '';
  return !!c.env.BOT_SYNC_SECRET && (await safeEqual(auth, `Bearer ${c.env.BOT_SYNC_SECRET}`));
}

app.post('/api/bot/sync', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'JSON이 아니에요' }, 400);
  }
  const parsed = parseSync(raw);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const result = await applySync(c.env.DB, parsed.value);
  if (result === 'applied') await assignCharacters(c.env.DB, parsed.value.members.map((m) => m.id));
  return c.json({ ok: true, result });
});

// 봇이 몇 초마다 가져가는 결제 요청
app.get('/api/bot/purchases', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const pending = await listPendingPurchases(c.env.DB);
  return c.json({
    purchases: pending.map((p) => ({ id: p.id, user_id: p.user_id, item_id: p.item_id, price: p.price, created_at: p.created_at })),
  });
});

// 봇이 젤리를 뺀(또는 못 뺀) 결과. 같은 요청에 두 번 와도 한 번만 반영돼요.
app.post('/api/bot/purchases/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON이 아니에요' }, 400);
  }
  const balance = body.balance ?? null;
  if (typeof body.ok !== 'boolean' || (balance !== null && !(Number.isInteger(balance) && (balance as number) >= 0)))
    return c.json({ error: 'ok(true/false)와 balance(0 이상 정수)가 필요해요' }, 400);
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 100) : null;
  const result = await settlePurchase(c.env.DB, c.req.param('id'), body.ok, reason, balance as number | null);
  if (!result) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true, status: result.status });
});

// 여기부터는 로그인한 하리보 멤버만
const members = new Hono<AppEnv>();

members.use('*', async (c, next) => {
  const viewer = await currentViewer(c);
  if (!viewer) {
    if (c.req.method !== 'GET') return c.text('로그인이 필요해요', 401);
    return c.redirect('/');
  }
  c.set('viewer', viewer);
  await next();
});

members.get('/me', async (c) => {
  const viewer = c.get('viewer');
  const [profile, entries, items] = await Promise.all([
    getProfile(c.env.DB, viewer.user_id),
    listDogam(c.env.DB, viewer.user_id),
    getOwnedItems(c.env.DB, viewer.user_id),
  ]);
  const { owned, total } = completion(entries);
  return page(
    c,
    <MePage viewer={viewer} profile={profile} items={items} owned={owned} total={total} saved={c.req.query('saved') === '1'} />,
  );
});

members.post('/api/me/profile', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const form = await c.req.parseBody();
  const intro = String(form.intro ?? '').replace(/\s+/g, ' ').trim();
  const theme = String(form.theme ?? 'basic');
  if ([...intro].length > 30) return c.text('소개는 30자까지예요', 400);
  if (!canUseTheme(theme, await getOwnedItems(c.env.DB, viewer.user_id))) return c.text('아직 쓸 수 없는 테마예요', 400);
  await saveProfile(c.env.DB, viewer.user_id, intro, theme);
  return c.redirect('/me?saved=1');
});

members.post('/api/me/character', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return c.text('잘못된 요청이에요', 403);
  const pool = (await c.req.parseBody()).pool;
  if (!isCharacterPool(pool)) return c.text('소녀나 소년 중에 골라 주세요', 400);
  await chooseCharacterPool(c.env.DB, c.get('viewer').user_id, pool);
  return c.redirect('/me?saved=1');
});

const sameOrigin = (c: Context<AppEnv>) => {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
};

members.get('/shop', async (c) => {
  const viewer = c.get('viewer');
  const [profile, owned, cards, purchases] = await Promise.all([
    getProfile(c.env.DB, viewer.user_id),
    getOwnedItems(c.env.DB, viewer.user_id),
    countOwnedCards(c.env.DB, viewer.user_id),
    listMyPurchases(c.env.DB, viewer.user_id),
  ]);
  // 끝난 결제 중 아직 결과를 안 본 것은 이번에 팝업으로 보여 주고 본 것으로 표시해요
  const results = purchases.filter((p) => p.status !== 'pending' && !p.seen_at).slice(0, 3);
  await markPurchasesSeen(c.env.DB, viewer.user_id, results.map((p) => p.id));
  return page(
    c,
    <ShopPage viewer={viewer} profile={profile} owned={owned} cards={cards} purchases={purchases} results={results} notice={c.req.query('n')} />,
  );
});

members.post('/api/shop/buy', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const item = shopItem((await c.req.parseBody()).item);
  if (!item || item.price === null) return c.redirect('/shop?n=not_for_sale');
  const owned = await getOwnedItems(c.env.DB, viewer.user_id);
  if (owned.has(item.id)) return c.redirect('/shop?n=owned');
  const ok = await requestPurchase(c.env.DB, viewer.user_id, item.id, item.price);
  return c.redirect(`/shop?n=${ok ? 'requested' : 'already_pending'}`);
});

members.post('/api/me/deco', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const key = String((await c.req.parseBody()).deco ?? '');
  if (key === '') {
    await setDeco(c.env.DB, viewer.user_id, null);
    return c.redirect('/shop?n=unequipped');
  }
  const item = shopItem(decoItemId(key));
  if (!item) return c.redirect('/shop?n=error');
  const [owned, cards] = await Promise.all([getOwnedItems(c.env.DB, viewer.user_id), countOwnedCards(c.env.DB, viewer.user_id)]);
  if (!canUse(item, owned, cards)) return c.redirect('/shop?n=locked');
  await setDeco(c.env.DB, viewer.user_id, key);
  return c.redirect('/shop?n=equipped');
});

members.post('/api/me/theme', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const theme = String((await c.req.parseBody()).theme ?? '');
  if (!canUseTheme(theme, await getOwnedItems(c.env.DB, viewer.user_id))) return c.redirect('/shop?n=locked');
  await setTheme(c.env.DB, viewer.user_id, theme);
  return c.redirect('/shop?n=theme');
});

members.get('/dogam', async (c) => {
  const viewer = c.get('viewer');
  const entries = await listDogam(c.env.DB, viewer.user_id);
  return page(c, <DogamPage viewer={viewer} owner={viewer} entries={entries} {...completion(entries)} />);
});

members.get('/dogam/:userId', async (c) => {
  const viewer = c.get('viewer');
  const owner = await getMember(c.env.DB, c.req.param('userId'));
  if (!owner || !owner.active)
    return page(c, <MessagePage viewer={viewer} title="도감이 없어요" message="지금 서버에 있는 멤버의 도감만 볼 수 있어요." />, 404);
  if (owner.user_id === viewer.user_id) return c.redirect('/dogam');
  const entries = await listDogam(c.env.DB, owner.user_id);
  return page(c, <DogamPage viewer={viewer} owner={owner} entries={entries} {...completion(entries)} />);
});

members.get('/card/:userId', async (c) => {
  const viewer = c.get('viewer');
  const targetId = c.req.param('userId');
  if (targetId === viewer.user_id) return c.redirect('/me');
  const from = c.req.query('from');
  const owner = from && from !== viewer.user_id ? await getMember(c.env.DB, from) : viewer;
  const notFound = () =>
    page(c, <MessagePage viewer={viewer} title="카드가 없어요" message="아직 같이 놀지 않은 멤버예요." />, 404);
  if (!owner || !owner.active) return notFound();
  const [entry, target] = await Promise.all([getOwnedCard(c.env.DB, owner.user_id, targetId), getMember(c.env.DB, targetId)]);
  if (!entry || !target) return notFound();
  return page(c, <CardPage viewer={viewer} owner={owner} target={target} entry={entry} />);
});

app.route('/', members);

app.notFound((c) => page(c, <MessagePage title="페이지가 없어요" message="주소를 다시 확인해 주세요." />, 404));

export default app;
