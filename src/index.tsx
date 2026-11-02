import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Member } from './env';
import { randomToken, safeEqual, signSession, verifySession } from './crypto';
import { authorizeUrl, exchangeCode, fetchGuildProfile, type LoginProfile } from './discord';
import {
  assignCharacters,
  buyGenderChange,
  chooseFirstGender,
  planCharacterPool,
  completion,
  countOwnedCards,
  getMember,
  getOwnedCard,
  getOwnedItems,
  getProfile,
  listDogam,
  buyWithJelly,
  listPendingServices,
  requestService,
  serviceState,
  settleService,
  SERVICE_FAIL_REASONS,
  getBestCard,
  givePraise,
  praiseToday,
  kstDay,
  giveStarterJelly,
  listPendingRefunds,
  listUnseenPurchases,
  markRefunded,
  markPurchasesSeen,
  saveProfile,
  setDeco,
  setTheme,
  touchVisit,
  upsertLoginMember,
} from './db';
import { PRICES, canUse, canUseTheme, decoItemId, serviceItem, servicePrice, shopItem } from './shop';
import { ChoosePage, GenderChangePage } from './views/choose';
import { characterUrl, isCharacterPool, poolOf } from './character';
import { applySync, parseSync } from './sync';
import { levelName, progress, tierFor, tierLabel } from './levels';
import { cardPalette } from './palette';
import { CardPage, DogamPage, LandingPage, MePage, MessagePage } from './views/pages';
import { ShopPage } from './views/shop';
import { PlazaPage } from './views/plaza';
import { GroupPage } from './views/group';
import { groupViewFor, seasonRanking } from './season';
import { currentPeriod, grantBingo, markFlag, myBingo, todayPartners, LINE_JELLY, LINE_XP, FULL_JELLY } from './bingo';
import { BingoPage } from './views/bingo';
import { GuidePage } from './views/guide';

export { PlazaRoom } from './plaza-room';

const SESSION_COOKIE = 'hs';
const STATE_COOKIE = 'hs_state';
const SESSION_DAYS = 30;

const plazaStub = (c: Context<AppEnv>) => c.env.PLAZA.get(c.env.PLAZA.idFromName('main'));

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

// 사용설명서는 로그인하지 않아도 볼 수 있어요(디스코드 패널의 도움말 링크로도 들어와요).
app.get('/guide', async (c) => page(c, <GuidePage viewer={await currentViewer(c)} />));

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
  const result = await applySync(c.env.DB, parsed.value, Date.now(), { scrimQuests: c.env.SCRIM_QUESTS === '1' });
  // 서버를 나간 멤버가 광장을 열어 두고 있었다면 끊어요. 먼저 하고, 같은 묶음을 다시 받아도(duplicate) 또 해요.
  if (result !== 'stale' && parsed.value.removed.length) await plazaStub(c).kick(parsed.value.removed);
  if (result === 'applied') {
    const ids = parsed.value.members.map((m) => m.id);
    await assignCharacters(c.env.DB, ids);
    await giveStarterJelly(c.env.DB, ids);
  }
  return c.json({ ok: true, result });
});

// 예전 봇은 겜블 지갑 결제를 하려고 이 주소를 물어봐요. 이제 상점은 도감 젤리로 웹에서 바로 결제해서 줄 게 없어요.
app.get('/api/bot/purchases', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ purchases: [] });
});

// 도감 젤리로 산 벌점·경고 지우기, 닉네임 변경권. 봇이 가져가 디스코드 쪽에 적용하고 결과를 알려요.
app.get('/api/bot/services', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const rows = await listPendingServices(c.env.DB);
  return c.json({ services: rows.map((r) => ({ id: r.id, user: r.user_id, kind: r.item_id.slice(4) })) });
});

app.post('/api/bot/services/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  const ok = (body as { ok?: unknown })?.ok;
  const reason = (body as { reason?: unknown })?.reason;
  if (typeof ok !== 'boolean') return c.json({ error: 'bad_ok' }, 400);
  if (!ok && !(SERVICE_FAIL_REASONS as readonly unknown[]).includes(reason)) return c.json({ error: 'bad_reason' }, 400);
  const changed = await settleService(c.env.DB, c.req.param('id'), ok, ok ? null : (reason as string));
  return c.json({ ok: true, changed });
});

// 예전에 겜블 젤리로 산 것을 봇이 겜블 지갑에 돌려줘요. 봇이 목록을 가져가 돌려주고, 한 건씩 끝났다고 알려요.
app.get('/api/bot/refunds', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const rows = await listPendingRefunds(c.env.DB);
  return c.json({ refunds: rows.map((r) => ({ id: r.id, user: r.user_id, item: r.item_id, price: r.price })) });
});

app.post('/api/bot/refunds/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const changed = await markRefunded(c.env.DB, c.req.param('id'));
  return c.json({ ok: true, changed });
});

const isDiscordId = (v: unknown): v is string => typeof v === 'string' && /^\d{17,20}$/.test(v);

// 디스코드 고정 패널 "내 카드". 봇이 이 정보로 카드 그림과 안내를 만들어요.
app.get('/api/bot/card/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const member = isDiscordId(id) ? await getMember(c.env.DB, id) : null;
  if (!member || !member.active) return c.json({ error: 'not_member' }, 404);
  const [profile, entries, best, praise] = await Promise.all([
    getProfile(c.env.DB, id),
    listDogam(c.env.DB, id),
    getBestCard(c.env.DB, id),
    praiseToday(c.env.DB, id),
  ]);
  // 주간 빙고 "패널에서 내 카드 열기" 칸(실패해도 카드는 보여 줘요)
  await markFlag(c.env.DB, id, 'panel', Date.now()).catch((e) => console.error('빙고 표시 실패', e));
  const p = progress(profile.solo_xp);
  const tier = tierFor(p.level);
  const base = baseUrl(c);
  return c.json({
    id,
    name: member.display_name,
    intro: profile.intro,
    level: p.level,
    level_name: levelName(p.level),
    ratio: p.ratio,
    tier,
    tier_label: tierLabel(tier),
    jelly: profile.dogam_jelly,
    dogam: completion(entries),
    best: best ? { id: best.user_id, name: best.display_name, level: progress(best.xp).level } : null,
    praise_left: praise.left,
    palette: cardPalette(profile.theme_id, p.level),
    character_url: base + characterUrl(profile.character_id, id, profile.deco_id),
    page_url: base + '/me',
  });
});

// 오늘 칭찬을 몇 번 남겼는지, 누구에게 이미 줬는지
app.get('/api/bot/praise/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (!isDiscordId(id)) return c.json({ error: 'bad_id' }, 400);
  // partners: 오늘 웹에 쌓인 통화 기록으로 본 같이 통화한 사람(봇이 재시작해서 메모리가 비었을 때 봇이 같이 써요)
  const [status, partners] = await Promise.all([praiseToday(c.env.DB, id), todayPartners(c.env.DB, id, kstDay())]);
  return c.json({ ...status, partners });
});

// 칭찬하기. 오늘 같이 논 사람인지는 봇이 확인하고 보내요.
app.post('/api/bot/praise', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let body: { from?: unknown; to?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON이 아니에요' }, 400);
  }
  if (!isDiscordId(body.from) || !isDiscordId(body.to)) return c.json({ error: 'bad_id' }, 400);
  const result = await givePraise(c.env.DB, body.from, body.to);
  // 칭찬 주기·받기 빙고 칸이 채워졌으면 줄 보상을 줘요(실패해도 칭찬은 끝났어요)
  if (result.result === 'done') {
    const now = Date.now();
    await grantBingo(c.env.DB, await currentPeriod(c.env.DB, now), [body.from, body.to], now).catch((e) => console.error('빙고 보상 확인 실패', e));
  }
  return c.json(result);
});

// 디스코드 고정 패널 "빙고"(생명력 주기마다 새 빙고판). 보는 김에 채운 줄 보상도 줘요.
app.get('/api/bot/bingo/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const member = isDiscordId(id) ? await getMember(c.env.DB, id) : null;
  if (!member || !member.active) return c.json({ error: 'not_member' }, 404);
  const view = await myBingo(c.env.DB, id, Date.now());
  if (!view) return c.json({ error: 'not_member' }, 404);
  return c.json({
    name: member.display_name,
    week: { start: view.week.start, end: view.week.end },
    cells: view.cells.map((x) => ({ icon: x.icon, text: x.text, diff: x.diff, value: x.value, target: x.target, done: x.done, unit: x.unit ?? null })),
    lines: view.lines,
    filled: view.filled,
    full: view.full,
    jelly: view.jelly,
    xp: view.xp,
    rewards: { line_jelly: LINE_JELLY, line_xp: LINE_XP, full_jelly: FULL_JELLY },
    page_url: baseUrl(c) + '/bingo',
  });
});

// 디스코드 고정 패널 "우리 모둠". 이번 시즌 모둠원과 퀘스트 진행도.
app.get('/api/bot/group/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (!isDiscordId(id)) return c.json({ error: 'bad_id' }, 400);
  const view = await groupViewFor(c.env.DB, id, Date.now());
  if (!view) return c.json({ group: null, page_url: baseUrl(c) + '/group' });
  return c.json({
    group: {
      no: view.groupNo + 1,
      season: { start: view.season.start, end: view.season.end },
      members: view.members.map((m) => ({ id: m.id, name: m.name, late: !m.start })),
      quests: view.quests.map((q) => ({ name: q.name, text: q.text, diff: q.diff, reward: q.reward, value: q.value, target: q.target, done: q.done })),
      titles: view.titles,
      // 모둠별 순위(no는 1부터, mine = 내 모둠)
      ranking: view.ranking.map((r) => ({ no: r.no + 1, rank: r.rank, done: r.done, total: r.total, minutes: r.minutes, size: r.size, mine: r.mine })),
      // 내가 모둠원과 같이 통화한 분(오늘·시즌), 우리 모둠 오늘의 활약
      me: view.me,
      today_top: view.todayTop,
    },
    page_url: baseUrl(c) + '/group',
  });
});

// 지금 시즌 전체 모둠 순위(디스코드 고정 패널 본문 그림). 시즌이 없으면 ranking: null
app.get('/api/bot/ranking', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const view = await seasonRanking(c.env.DB, Date.now());
  if (!view) return c.json({ ranking: null, page_url: baseUrl(c) + '/group' });
  return c.json({
    season: { start: view.season.start, end: view.season.end },
    ranking: view.ranking.map((r) => ({ no: r.no + 1, rank: r.rank, done: r.done, total: r.total, minutes: r.minutes, size: r.size })),
    today_top: view.todayTop.map((t) => ({ name: t.name, minutes: t.minutes, group: t.group + 1 })),
    page_url: baseUrl(c) + '/group',
  });
});

// 광장 실시간 연결(봇). 통화방 모습과 통화방 채팅을 보내고, 방 옮기기 요청을 받아요.
app.get('/api/bot/plaza', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  if (c.req.header('Upgrade') !== 'websocket') return c.text('websocket only', 426);
  const req = new Request(c.req.raw);
  req.headers.delete('X-Plaza-User');
  req.headers.set('X-Plaza-Role', 'bot');
  return plazaStub(c).fetch(req);
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
  await touchVisit(c.env.DB, viewer, Date.now());
  // 처음 들어온 멤버는 여자·남자 캐릭터를 골라야 다른 화면으로 갈 수 있어요
  if (!viewer.gender_chosen_at && c.req.path !== '/choose' && c.req.path !== '/api/me/gender') {
    if (c.req.method !== 'GET') return c.text('먼저 캐릭터를 골라 주세요', 403);
    return c.redirect('/choose');
  }
  await next();
});

members.get('/choose', async (c) => {
  const viewer = c.get('viewer');
  if (viewer.gender_chosen_at) return c.redirect('/me');
  const pick = c.req.query('pick');
  const [girl, boy] = await Promise.all([
    planCharacterPool(c.env.DB, viewer.user_id, 'girl'),
    planCharacterPool(c.env.DB, viewer.user_id, 'boy'),
  ]);
  return page(
    c,
    <ChoosePage viewer={viewer} previews={{ girl: girl.character, boy: boy.character }} pick={isCharacterPool(pick) ? pick : undefined} />,
  );
});

members.post('/api/me/gender', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const pool = (await c.req.parseBody()).pool;
  if (!isCharacterPool(pool)) return c.redirect('/choose');
  await chooseFirstGender(c.env.DB, c.get('viewer').user_id, pool);
  return c.redirect('/me');
});

members.get('/me', async (c) => {
  const viewer = c.get('viewer');
  // 주간 빙고 "웹 도감에서 내 카드 보기" 칸
  await markFlag(c.env.DB, viewer.user_id, 'web', Date.now()).catch((e) => console.error('빙고 표시 실패', e));
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

// 예전 "여자/남자" 무료 바꾸기 버튼. 이제는 상점의 "성별 바꾸기"로 바꿔요.
members.post('/api/me/character', (c) => c.redirect('/shop#gender'));

const sameOrigin = (c: Context<AppEnv>) => {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
};

members.get('/shop', async (c) => {
  const viewer = c.get('viewer');
  const [profile, owned, cards, results, services] = await Promise.all([
    getProfile(c.env.DB, viewer.user_id),
    getOwnedItems(c.env.DB, viewer.user_id),
    countOwnedCards(c.env.DB, viewer.user_id),
    listUnseenPurchases(c.env.DB, viewer.user_id),
    serviceState(c.env.DB, viewer.user_id),
  ]);
  // 아직 결과를 안 본 결제는 이번에 팝업으로 보여 주고 본 것으로 표시해요
  await markPurchasesSeen(c.env.DB, viewer.user_id, results.map((p) => p.id));
  return page(
    c,
    <ShopPage viewer={viewer} profile={profile} owned={owned} cards={cards} results={results} services={services} notice={c.req.query('n')} />,
  );
});

members.post('/api/shop/buy', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const item = shopItem((await c.req.parseBody()).item);
  if (!item || item.price === null) return c.redirect('/shop?n=not_for_sale');
  const owned = await getOwnedItems(c.env.DB, viewer.user_id);
  if (owned.has(item.id)) return c.redirect('/shop?n=owned');
  let result: Awaited<ReturnType<typeof buyWithJelly>>;
  try {
    result = await buyWithJelly(c.env.DB, viewer.user_id, item.id, item.price);
  } catch (e) {
    console.error('도감 젤리 결제 실패', e);
    return c.redirect('/shop?n=error');
  }
  // 산 물건은 결과 팝업("구매가 완료되었습니다")으로, 못 산 이유는 안내 팝업으로 보여 줘요
  return c.redirect(result === 'done' ? '/shop' : `/shop?n=${result}`);
});

// 성별 바꾸기: 확인 화면(미리보기) → 도감 젤리로 사요
members.get('/shop/gender', async (c) => {
  const viewer = c.get('viewer');
  const profile = await getProfile(c.env.DB, viewer.user_id);
  const to = poolOf(profile.character_id) === 'boy' ? 'girl' : 'boy';
  const plan = await planCharacterPool(c.env.DB, viewer.user_id, to);
  return page(c, <GenderChangePage viewer={viewer} to={to} character={plan.character} jelly={profile.dogam_jelly} />);
});

members.post('/api/shop/gender', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const pool = (await c.req.parseBody()).pool;
  if (!isCharacterPool(pool)) return c.redirect('/shop?n=error');
  let result: Awaited<ReturnType<typeof buyGenderChange>>;
  try {
    result = await buyGenderChange(c.env.DB, c.get('viewer').user_id, pool, PRICES.gender);
  } catch (e) {
    console.error('성별 바꾸기 실패', e);
    return c.redirect('/shop?n=error');
  }
  return c.redirect(result === 'done' ? '/shop' : result === 'same' ? '/shop?n=gender_same' : '/shop?n=not_enough_jelly');
});

// 벌점·경고 지우기, 닉네임 변경권: 도감 젤리를 빼고 봇이 디스코드 쪽에 적용해요
members.post('/api/shop/service', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const body = await c.req.parseBody();
  const item = serviceItem(body.item);
  if (!item) return c.redirect('/shop?n=not_for_sale');
  let result: Awaited<ReturnType<typeof requestService>>;
  try {
    // 값은 끝난 구매 수로 정해져요. 화면에서 본 값과 다르면 사지 않고 새 값을 보여 줘요.
    const n = (await serviceState(c.env.DB, viewer.user_id)).bought.get(item.id) ?? 0;
    const price = servicePrice(item, n);
    if (String(body.price ?? '') !== String(price)) return c.redirect('/shop?n=price_changed');
    result = await requestService(c.env.DB, viewer.user_id, item.id, price, n);
  } catch (e) {
    console.error('도감 서비스 결제 실패', e);
    return c.redirect('/shop?n=error');
  }
  if (result === 'changed') return c.redirect('/shop?n=price_changed');
  return c.redirect(`/shop?n=${result === 'pending' ? 'service_pending' : result === 'busy' ? 'service_busy' : 'not_enough_jelly'}`);
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

members.get('/group', async (c) => {
  const viewer = c.get('viewer');
  return page(c, <GroupPage viewer={viewer} view={await groupViewFor(c.env.DB, viewer.user_id, Date.now())} />);
});

members.get('/bingo', async (c) => {
  const viewer = c.get('viewer');
  return page(c, <BingoPage viewer={viewer} view={await myBingo(c.env.DB, viewer.user_id, Date.now())} />);
});

members.get('/plaza', (c) => page(c, <PlazaPage viewer={c.get('viewer')} guildId={c.env.GUILD_ID} />));

// 광장 실시간 연결(브라우저). 다른 사이트에서 몰래 연결하지 못하게 주소를 확인해요.
members.get('/plaza/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.text('websocket only', 426);
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const profile = await getProfile(c.env.DB, viewer.user_id);
  const who = {
    id: viewer.user_id,
    name: viewer.display_name,
    char: characterUrl(profile.character_id, viewer.user_id, profile.deco_id),
  };
  const req = new Request(c.req.raw);
  req.headers.set('X-Plaza-Role', 'user');
  req.headers.set('X-Plaza-User', encodeURIComponent(JSON.stringify(who)));
  return plazaStub(c).fetch(req);
});

app.route('/', members);

app.notFound((c) => page(c, <MessagePage title="페이지가 없어요" message="주소를 다시 확인해 주세요." />, 404));

export default app;
