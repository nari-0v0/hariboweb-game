import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
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
import { ErrorPage, NotFoundPage } from './views/errors';
import { ShopPage } from './views/shop';
import { PlazaPage } from './views/plaza';
import { GroupPage } from './views/group';
import { groupViewFor, seasonRanking } from './season';
import { currentPeriod, grantBingo, markFlag, myBingo, todayPartners, LINE_JELLY, LINE_XP, FULL_JELLY } from './bingo';
import { BingoPage } from './views/bingo';
import { GuidePage } from './views/guide';
import { TitlesPage } from './views/titles';
import { titleById, titleProgress } from './titles';
import {
  TITLE_FAIL_REASONS,
  buyTitle,
  equipTitle,
  listTitleJobs,
  loadTitleStats,
  ownedTitles,
  recordEarnedTitles,
  settleTitle,
  titleState,
} from './title-db';

import { ExpeditionPage } from './views/expedition';
import { prefetchAllowed } from './prefetch';
import { act, currentRun, getRun, listCandidates, myRecord, myRole, quitRun, setRole, startRun } from './expedition-db';
import { isRole } from './expedition';
import { CasesPage } from './views/cases';
import { EscapePage } from './views/escape';
import { JourneyPage } from './views/journey';
import { activeJourney, actJourneyRun, beginJourney, buyPerk, getJourney, journeyBank, journeyRecord, quitJourney } from './journey-db';
import { PERKS, type PerkId } from './journey';
import { activeEscape, actEscapeRun, beginEscape, escapeRecord, getEscape, quitEscape } from './escape-db';
import { StoryPage } from './views/story';
import { activeStory, actStory, beginStory, getStory, storyMarks, uuid } from './story-db';
import type { StoryAction } from './story';
import { accuse, caseRecord, currentCase, getCase, lookAt, quitCase, startCase } from './cases-db';
import { RoomPage } from './views/room';
import { buyRoomItem, getRoom, likeRoom, likedToday, listRooms, saveRoom } from './room-db';

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

// 도감 칭호: 봇이 "닉네임 앞 칭호를 바꿀 멤버"를 가져가 바꾸고 결과를 알려요
app.get('/api/bot/titles', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ titles: await listTitleJobs(c.env.DB) });
});

app.post('/api/bot/titles/:user', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  const { id, ok, reason } = (body ?? {}) as { id?: unknown; ok?: unknown; reason?: unknown };
  if (typeof id !== 'string' || (id !== '' && !titleById(id))) return c.json({ error: 'bad_id' }, 400);
  if (typeof ok !== 'boolean') return c.json({ error: 'bad_ok' }, 400);
  if (!ok && !(TITLE_FAIL_REASONS as readonly unknown[]).includes(reason)) return c.json({ error: 'bad_reason' }, 400);
  const changed = await settleTitle(c.env.DB, c.req.param('user'), id, ok ? null : (reason as string));
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
  // 새로 채웠으면 그 자리에서 줄 보상도 확인해요(이 칸이 마지막 칸일 수 있어요)
  await markFlag(c.env.DB, id, 'panel', Date.now())
    .then((fresh) => (fresh ? myBingo(c.env.DB, id, Date.now()) : null))
    .catch((e) => console.error('빙고 표시 실패', e));
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
const isPrefetch = (c: Context<AppEnv>) => /prefetch|prerender/i.test(c.req.header('Sec-Purpose') ?? c.req.header('Purpose') ?? '');

const members = new Hono<AppEnv>();

members.use('*', async (c, next) => {
  const viewer = await currentViewer(c);
  if (!viewer) {
    if (c.req.method !== 'GET') return c.text('로그인이 필요해요', 401);
    return c.redirect('/');
  }
  c.set('viewer', viewer);
  // 브라우저가 미리 받기만 하는 요청은 읽기만 하는 화면에만 답해요(열기만 해도 기록이 바뀌는 화면은 실제로 열 때만)
  if (isPrefetch(c) && !prefetchAllowed(c.req.path)) return c.body(null, 503);
  // 방문 시각 기록은 응답을 기다리게 하지 않고 뒤에서 해요
  const touch = touchVisit(c.env.DB, viewer, Date.now()).catch((e) => console.error('방문 기록 실패', e));
  try {
    c.executionCtx.waitUntil(touch);
  } catch {
    await touch;
  }
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
  // 새로 채웠으면 그 자리에서 줄 보상도 확인해요(이 칸이 마지막 칸일 수 있어요)
  await markFlag(c.env.DB, viewer.user_id, 'web', Date.now())
    .then((fresh) => (fresh ? myBingo(c.env.DB, viewer.user_id, Date.now()) : null))
    .catch((e) => console.error('빙고 표시 실패', e));
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

// 완성 원고 모드도 기존 로그인·현재 멤버·캐릭터 선택 미들웨어 안에서만 열려요.
members.use('/api/story/*', bodyLimit({ maxSize: 4096, onError: c => c.text('입력이 너무 길어요', 413) }));
for (const kind of ['case', 'expedition'] as const) {
  const url = kind === 'case' ? '/cases/story' : '/expedition/story';
  members.get(url, async c => {
    const viewer = c.get('viewer');
    c.header('Cache-Control', 'no-store');
    const [active, marks, candidates] = await Promise.all([
      activeStory(c.env.DB, viewer.user_id, kind), storyMarks(c.env.DB, viewer.user_id), listCandidates(c.env.DB, viewer.user_id),
    ]);
    const id = c.req.query('r');
    const result = !active && uuid(id) ? await getStory(c.env.DB, viewer.user_id, id) : null;
    return page(c, <StoryPage viewer={viewer} kind={kind} run={active ?? (result?.row.kind === kind && result.state.phase === 'done' ? result : null)} candidates={candidates} marks={marks} notice={c.req.query('n')} />);
  });
}
members.post('/api/story/start', async c => {
  c.header('Cache-Control', 'no-store');
  // 새 변경 API는 Origin 필수. 일반 브라우저의 POST form은 Origin을 보냅니다.
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('잘못된 요청이에요', 403);
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(c.req.header('Content-Type') ?? '')) return c.text('잘못된 입력이에요', 400);
  const raw = await c.req.text();
  if (raw.length > 4096) return c.text('입력이 너무 길어요', 413);
  const b = new URLSearchParams(raw);
  const kind = b.get('kind'), content = b.get('content'), request = b.get('request');
  if ((kind !== 'case' && kind !== 'expedition') || !content || !uuid(request) || ['kind', 'content', 'request'].some(k => b.getAll(k).length !== 1)) return c.text('잘못된 입력이에요', 400);
  const url = kind === 'case' ? '/cases/story' : '/expedition/story';
  try {
    const id = await beginStory(c.env.DB, c.get('viewer').user_id, kind, content, b.getAll('m'), request);
    return c.redirect(id ? `${url}?r=${id}#now` : `${url}?n=bad`, 303);
  } catch (err) { console.error('이야기 시작 실패', err); return c.redirect(`${url}?n=error`, 303); }
});
members.post('/api/story/act', async c => {
  c.header('Cache-Control', 'no-store');
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('잘못된 요청이에요', 403);
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(c.req.header('Content-Type') ?? '')) return c.text('잘못된 입력이에요', 400);
  const raw = await c.req.text();
  if (raw.length > 4096) return c.text('입력이 너무 길어요', 413);
  const b = new URLSearchParams(raw), id = b.get('run'), at = b.get('at'), action = b.get('action'), choice = b.get('choice');
  if (!uuid(id) || !at || !/^(0|[1-9][0-9]{0,5})$/.test(at) || !action || !['look', 'answer', 'promise', 'choose', 'quit', 'inspect', 'connect', 'reconstruct', 'scout', 'rotate', 'survey', 'return', 'skill', 'jelly'].includes(action) || choice === null || choice.length > 100 || ['run', 'at', 'action', 'choice'].some(k => b.getAll(k).length !== 1)) return c.text('잘못된 입력이에요', 400);
  const user = c.get('viewer').user_id, run = await getStory(c.env.DB, user, id);
  if (!run) return c.text('이야기를 찾을 수 없어요', 404);
  const url = run.row.kind === 'case' ? '/cases/story' : '/expedition/story';
  try {
    const result = await actStory(c.env.DB, user, id, Number(at), { action: action as StoryAction['action'], choice });
    return c.redirect(`${url}?r=${id}${result === 'ok' ? '' : `&n=${result}`}#now`, 303);
  } catch (err) { console.error('이야기 진행 실패', err); return c.redirect(`${url}?r=${id}&n=error#now`, 303); }
});

// 상점: 매점(잡다매점: 디스코드 물건·성별 바꾸기)과 꾸미기(테마·꾸밈 캐릭터) 탭. 칭호 탭은 /titles예요.
async function shopPage(c: Context<AppEnv>, tab: 'store' | 'deco') {
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
    <ShopPage tab={tab} viewer={viewer} profile={profile} owned={owned} cards={cards} results={results} services={services} notice={c.req.query('n')} />,
  );
}

members.get('/shop', (c) => shopPage(c, 'store'));
members.get('/shop/deco', (c) => shopPage(c, 'deco'));

members.post('/api/shop/buy', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const item = shopItem((await c.req.parseBody()).item);
  if (!item || item.price === null) return c.redirect('/shop/deco?n=not_for_sale');
  const owned = await getOwnedItems(c.env.DB, viewer.user_id);
  if (owned.has(item.id)) return c.redirect('/shop/deco?n=owned');
  let result: Awaited<ReturnType<typeof buyWithJelly>>;
  try {
    result = await buyWithJelly(c.env.DB, viewer.user_id, item.id, item.price);
  } catch (e) {
    console.error('도감 젤리 결제 실패', e);
    return c.redirect('/shop/deco?n=error');
  }
  // 산 물건은 결과 팝업("구매가 완료되었습니다")으로, 못 산 이유는 안내 팝업으로 보여 줘요
  return c.redirect(result === 'done' ? '/shop/deco' : `/shop/deco?n=${result}`);
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
    return c.redirect('/shop/deco?n=unequipped');
  }
  const item = shopItem(decoItemId(key));
  if (!item) return c.redirect('/shop/deco?n=error');
  const [owned, cards] = await Promise.all([getOwnedItems(c.env.DB, viewer.user_id), countOwnedCards(c.env.DB, viewer.user_id)]);
  if (!canUse(item, owned, cards)) return c.redirect('/shop/deco?n=locked');
  await setDeco(c.env.DB, viewer.user_id, key);
  return c.redirect('/shop/deco?n=equipped');
});

members.post('/api/me/theme', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const theme = String((await c.req.parseBody()).theme ?? '');
  if (!canUseTheme(theme, await getOwnedItems(c.env.DB, viewer.user_id))) return c.redirect('/shop/deco?n=locked');
  await setTheme(c.env.DB, viewer.user_id, theme);
  return c.redirect('/shop/deco?n=theme');
});

// 칭호: 얻은 칭호를 고르면 하리보봇이 디스코드 닉네임 앞에 붙여요
members.get('/titles', async (c) => {
  const viewer = c.get('viewer');
  const nowIso = new Date().toISOString();
  const [stats, owned, state, profile] = await Promise.all([
    loadTitleStats(c.env.DB, viewer.user_id, nowIso),
    ownedTitles(c.env.DB, viewer.user_id),
    titleState(c.env.DB, viewer.user_id),
    getProfile(c.env.DB, viewer.user_id),
  ]);
  const fresh = await recordEarnedTitles(c.env.DB, viewer.user_id, stats, owned);
  return page(
    c,
    <TitlesPage
      viewer={viewer}
      profile={profile}
      stats={stats}
      owned={owned}
      state={state}
      fresh={fresh}
      focus={c.req.query('t')}
      notice={c.req.query('n')}
    />,
  );
});

members.post('/api/titles/equip', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const raw = String((await c.req.parseBody()).title ?? '');
  if (raw === '') {
    await equipTitle(c.env.DB, viewer.user_id, null);
    return c.redirect('/titles?n=removed');
  }
  const t = titleById(raw);
  if (!t) return c.redirect('/titles?n=error');
  const owned = await ownedTitles(c.env.DB, viewer.user_id);
  if (!owned.has(t.id)) {
    // 방금 조건을 채웠을 수도 있어요
    const stats = await loadTitleStats(c.env.DB, viewer.user_id, new Date().toISOString());
    if (t.rule.kind === 'shop' || !titleProgress(t, stats).ok) return c.redirect('/titles?n=locked');
    await recordEarnedTitles(c.env.DB, viewer.user_id, stats, owned);
  }
  await equipTitle(c.env.DB, viewer.user_id, t.id);
  return c.redirect('/titles?n=equipped');
});

members.post('/api/titles/buy', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const t = titleById((await c.req.parseBody()).title);
  if (!t) return c.redirect('/titles?n=error');
  let result: Awaited<ReturnType<typeof buyTitle>>;
  try {
    result = await buyTitle(c.env.DB, viewer.user_id, t);
  } catch (e) {
    console.error('칭호 결제 실패', e);
    return c.redirect('/titles?n=error');
  }
  // 산 칭호가 들어 있는 묶음을 펼쳐서 보여 줘요
  return c.redirect(`/titles?n=${result === 'done' ? 'bought' : result}&t=${encodeURIComponent(t.id)}`);
});

members.get('/expedition', async (c) => {
  const viewer = c.get('viewer');
  const db = c.env.DB;
  const run = await currentRun(db, viewer.user_id);
  const rid = c.req.query('r');
  const [result, record, candidates, role] = await Promise.all([
    !run && rid ? getRun(db, viewer.user_id, rid) : Promise.resolve(null),
    myRecord(db, viewer.user_id),
    run ? Promise.resolve([]) : listCandidates(db, viewer.user_id),
    myRole(db, viewer.user_id),
  ]);
  // 뒤로 가기로 지난 원정 화면이 다시 보이지 않게, 브라우저가 이 화면을 저장해 두지 않고 늘 새로 받아요
  c.header('Cache-Control', 'no-store');
  return page(
    c,
    <ExpeditionPage
      viewer={viewer}
      run={run}
      result={result?.row.status === 'done' ? result : null}
      record={record}
      candidates={candidates}
      role={role}
      notice={c.req.query('n')}
    />,
  );
});

members.post('/api/expedition/start', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const body = await c.req.parseBody({ all: true });
  const raw = body.m;
  const ids = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map(String);
  const r = await startRun(c.env.DB, viewer.user_id, ids);
  return c.redirect(r === 'started' ? '/expedition#now' : `/expedition?n=${r}`);
});

members.post('/api/expedition/act', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const viewer = c.get('viewer');
  const body = await c.req.parseBody();
  const at = Number(body.at);
  const choice = Number(body.c);
  if (!Number.isInteger(at) || !Number.isInteger(choice) || at < 0 || choice < 0) return c.redirect('/expedition');
  try {
    const r = await act(c.env.DB, viewer.user_id, String(body.run ?? ''), at, choice);
    if (r.result === 'done' && r.runId) return c.redirect(`/expedition?r=${encodeURIComponent(r.runId)}#now`);
  } catch (e) {
    console.error('원정 진행 실패', e);
    return c.redirect('/expedition?n=error');
  }
  // 이미 반영됐거나 엉뚱한 차례면 지금 화면을 다시 보여 줘요(#now: 결과가 바로 보이게 원정 칸으로 내려가요)
  return c.redirect('/expedition#now');
});

members.post('/api/expedition/quit', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const run = String((await c.req.parseBody()).run ?? '');
  const quit = await quitRun(c.env.DB, c.get('viewer').user_id, run);
  return c.redirect(quit ? '/expedition?n=quit' : '/expedition');
});

members.post('/api/expedition/role', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const role = (await c.req.parseBody()).role;
  if (!isRole(role)) return c.redirect('/expedition');
  await setRole(c.env.DB, c.get('viewer').user_id, role);
  return c.redirect('/expedition?n=role');
});

// 하리보 원정대 (하루 모험판): 하루씩 나아가며 싸우고 스킬을 골라요. 자동 선택(방치)도 돼요.
const JR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
members.get('/expedition/go', async (c) => {
  const viewer = c.get('viewer');
  c.header('Cache-Control', 'no-store');
  const [run, record, profile, bank] = await Promise.all([
    activeJourney(c.env.DB, viewer.user_id),
    journeyRecord(c.env.DB, viewer.user_id),
    getProfile(c.env.DB, viewer.user_id),
    journeyBank(c.env.DB, viewer.user_id),
  ]);
  const rid = c.req.query('r') ?? '';
  const done = !run && JR_ID.test(rid) ? await getJourney(c.env.DB, viewer.user_id, rid) : null;
  const art = characterUrl(profile.character_id, viewer.user_id, profile.deco_id);
  return page(c, <JourneyPage viewer={viewer} art={art} run={run} result={done?.row.status === 'done' ? done : null} record={record} bank={bank} notice={c.req.query('n')} />);
});
members.post('/api/journey/start', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  try {
    const id = await beginJourney(c.env.DB, c.get('viewer').user_id);
    return c.redirect(id ? '/expedition/go#now' : '/expedition/go?n=bad', 303);
  } catch (e) {
    console.error('원정 시작 실패', e);
    return c.redirect('/expedition/go?n=error', 303);
  }
});
members.post('/api/journey/act', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const id = String(body.run ?? ''), rev = Number(body.rev), a = String(body.a ?? ''), n = Number(body.n);
  const act =
    a === 'next' || a === 'auto' || a === 'idle' || a === 'leave' ? ({ a } as const)
    : (a === 'pick' || a === 'buy') && Number.isInteger(n) && n >= 0 && n < 10 ? ({ a, n } as const)
    : null;
  if (!JR_ID.test(id) || !Number.isSafeInteger(rev) || rev < 0 || !act) return c.redirect('/expedition/go?n=bad#now', 303);
  try {
    const user = c.get('viewer').user_id;
    const r = await actJourneyRun(c.env.DB, user, id, rev, act);
    if (r !== 'ok') return c.redirect(`/expedition/go?n=${r}#now`, 303);
    const after = await getJourney(c.env.DB, user, id);
    return c.redirect(after?.row.status === 'done' ? `/expedition/go?r=${id}#now` : '/expedition/go#now', 303);
  } catch (e) {
    console.error('원정 진행 실패', e);
    return c.redirect('/expedition/go?n=error#now', 303);
  }
});
members.post('/api/journey/perk', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const k = String((await c.req.parseBody()).k ?? '');
  if (!Object.hasOwn(PERKS, k)) return c.redirect('/expedition/go?n=bad#perks', 303);
  try {
    const ok = await buyPerk(c.env.DB, c.get('viewer').user_id, k as PerkId);
    return c.redirect(`/expedition/go?n=${ok ? 'perk' : 'noperk'}#perks`, 303);
  } catch (e) {
    console.error('원정 강화 실패', e);
    return c.redirect('/expedition/go?n=error#perks', 303);
  }
});
members.post('/api/journey/quit', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const id = String((await c.req.parseBody()).run ?? '');
  const ok = JR_ID.test(id) && (await quitJourney(c.env.DB, c.get('viewer').user_id, id));
  return c.redirect(ok ? '/expedition/go?n=quit' : '/expedition/go', 303);
});

// 하리보 사건파일 (방탈출판): 물건을 눌러 찾고 퍼즐을 풀어요.
const ESC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
members.get('/cases/room', async (c) => {
  const viewer = c.get('viewer');
  c.header('Cache-Control', 'no-store');
  const [run, best, profile] = await Promise.all([activeEscape(c.env.DB, viewer.user_id), escapeRecord(c.env.DB, viewer.user_id), getProfile(c.env.DB, viewer.user_id)]);
  const art = characterUrl(profile.character_id, viewer.user_id, profile.deco_id);
  const rid = c.req.query('r') ?? '';
  const done = !run && ESC_ID.test(rid) ? await getEscape(c.env.DB, viewer.user_id, rid) : null;
  return page(c, <EscapePage viewer={viewer} art={art} run={run} result={done?.row.status === 'done' ? done : null} best={best} notice={c.req.query('n')} />);
});
members.post('/api/escape/start', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  try {
    const id = await beginEscape(c.env.DB, c.get('viewer').user_id, String(body.case ?? ''));
    return c.redirect(id ? '/cases/room#now' : '/cases/room?n=bad', 303);
  } catch (e) {
    console.error('사건 시작 실패', e);
    return c.redirect('/cases/room?n=error', 303);
  }
});
members.post('/api/escape/act', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const id = String(body.run ?? ''), rev = Number(body.rev), a = String(body.a ?? '');
  const str = (k: string) => String(body[k] ?? '').slice(0, 40);
  const act =
    a === 'tap' ? { a, o: str('o') } as const
    : a === 'use' ? { a, o: str('o'), i: str('i') } as const
    : a === 'code' ? { a, o: str('o'), v: str('v') } as const
    : a === 'answer' ? { a, n: Number(body.n), ...(body.m0 !== undefined ? { m: [0, 1, 2].map((k) => body[`m${k}`]).filter((v) => v !== undefined).map(Number) } : {}) } as const
    : a === 'combine' ? { a, i: str('i'), j: str('j') } as const
    : a === 'hint' ? { a } as const
    : a === 'coin' && /^[0-9]$/.test(String(body.n ?? '')) ? { a, k: Number(body.n) } as const
    : null;
  if (!ESC_ID.test(id) || !Number.isSafeInteger(rev) || rev < 0 || !act) return c.redirect('/cases/room?n=bad#now', 303);
  try {
    const user = c.get('viewer').user_id;
    const r = await actEscapeRun(c.env.DB, user, id, rev, act);
    if (r !== 'ok') return c.redirect(`/cases/room?n=${r}#now`, 303);
    // 다시 불러오기(리다이렉트) 없이 바로 화면을 그려 보내요. 한 번 왕복이 줄어서 빨라요.
    const [after, best, profile] = await Promise.all([getEscape(c.env.DB, user, id), escapeRecord(c.env.DB, user), getProfile(c.env.DB, user)]);
    const done = after?.row.status === 'done';
    c.header('Cache-Control', 'no-store');
    const viewer = c.get('viewer');
    const art = characterUrl(profile.character_id, user, profile.deco_id);
    return page(c, <EscapePage viewer={viewer} art={art} run={done ? null : after} result={done ? after : null} best={best} url={done ? `/cases/room?r=${id}#now` : '/cases/room#now'} />);
  } catch (e) {
    console.error('사건 진행 실패', e);
    return c.redirect('/cases/room?n=error#now', 303);
  }
});
members.post('/api/escape/quit', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const id = String((await c.req.parseBody()).run ?? '');
  const ok = ESC_ID.test(id) && (await quitEscape(c.env.DB, c.get('viewer').user_id, id));
  return c.redirect(ok ? '/cases/room?n=quit' : '/cases/room', 303);
});

// 하리보 사건파일
members.get('/cases', async (c) => {
  const viewer = c.get('viewer');
  const db = c.env.DB;
  const rid = c.req.query('r');
  const [run, record] = await Promise.all([currentCase(db, viewer.user_id), caseRecord(db, viewer.user_id)]);
  const result = !run && rid ? await getCase(db, viewer.user_id, rid) : null;
  // 뒤로 가기로 지난 사건 화면이 다시 보이지 않게 늘 새로 받아요
  c.header('Cache-Control', 'no-store');
  return page(
    c,
    <CasesPage viewer={viewer} run={run} result={result?.row.status === 'done' ? result : null} record={record} notice={c.req.query('n')} />,
  );
});

members.post('/api/cases/start', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const r = await startCase(c.env.DB, c.get('viewer').user_id, String((await c.req.parseBody()).case ?? ''));
  return c.redirect(r === 'started' ? '/cases#now' : `/cases?n=${r}`);
});

members.post('/api/cases/look', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const at = Number(body.at);
  const spot = Number(body.spot);
  if (!Number.isInteger(at) || !Number.isInteger(spot)) return c.redirect('/cases#now');
  try {
    await lookAt(c.env.DB, c.get('viewer').user_id, String(body.run ?? ''), at, spot);
  } catch (e) {
    console.error('사건 조사 실패', e);
    return c.redirect('/cases?n=error');
  }
  return c.redirect('/cases#now');
});

members.post('/api/cases/accuse', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const num = (v: unknown) => (v === undefined || v === '' ? NaN : Number(v));
  const answer = { culprit: num(body.culprit), method: num(body.method), motive: num(body.motive) };
  if (![answer.culprit, answer.method, answer.motive].every(Number.isInteger)) return c.redirect('/cases?n=need_answer#now');
  try {
    const r = await accuse(c.env.DB, c.get('viewer').user_id, String(body.run ?? ''), Number(body.at), answer);
    if (r.result === 'done' && r.runId) return c.redirect(`/cases?r=${encodeURIComponent(r.runId)}#now`);
    if (r.result === 'bad') return c.redirect('/cases?n=need_look#now');
  } catch (e) {
    console.error('사건 지목 실패', e);
    return c.redirect('/cases?n=error');
  }
  return c.redirect('/cases#now');
});

members.post('/api/cases/quit', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const quit = await quitCase(c.env.DB, c.get('viewer').user_id, String((await c.req.parseBody()).run ?? ''));
  return c.redirect(quit ? '/cases?n=quit' : '/cases');
});

// 내 방 꾸미기
async function roomPage(c: Context<AppEnv>, userId: string) {
  const viewer = c.get('viewer');
  const db = c.env.DB;
  const mine = userId === viewer.user_id;
  const [room, owned, profile, liked, recent, popular] = await Promise.all([
    getRoom(db, userId),
    mine ? getOwnedItems(db, userId) : Promise.resolve(new Set<string>()),
    mine ? getProfile(db, userId) : Promise.resolve(null),
    mine ? Promise.resolve(false) : likedToday(db, viewer.user_id, userId),
    listRooms(db, 'recent'),
    listRooms(db, 'likes', 6),
  ]);
  if (!room) return page(c, <MessagePage viewer={viewer} title="방이 없어요" message="지금 서버에 있는 멤버의 방만 구경할 수 있어요." />, 404);
  // 꾸미고 저장한 뒤 뒤로 가기로 옛 방이 보이지 않게 늘 새로 받아요
  c.header('Cache-Control', 'no-store');
  return page(
    c,
    <RoomPage
      viewer={viewer}
      room={room}
      mine={mine}
      owned={owned}
      jelly={profile?.dogam_jelly ?? 0}
      liked={liked}
      recent={recent}
      popular={popular}
      notice={c.req.query('n')}
    />,
  );
}

members.get('/room', (c) => roomPage(c, c.get('viewer').user_id));
members.get('/room/:userId', (c) => {
  const id = c.req.param('userId');
  return id === c.get('viewer').user_id ? c.redirect('/room') : roomPage(c, id);
});

members.post('/api/room/save', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  try {
    const r = await saveRoom(c.env.DB, c.get('viewer').user_id, String(body.wall ?? ''), String(body.floor ?? ''), String(body.layout ?? ''));
    return c.redirect(`/room?n=${r}`);
  } catch (e) {
    console.error('방 저장 실패', e);
    return c.redirect('/room?n=error');
  }
});

members.post('/api/room/buy', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  try {
    const r = await buyRoomItem(c.env.DB, c.get('viewer').user_id, body.item);
    return c.redirect(`/room?n=${r === 'done' ? 'bought' : r}#store`);
  } catch (e) {
    console.error('방 물건 결제 실패', e);
    return c.redirect('/room?n=error');
  }
});

members.post('/api/room/:userId/like', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const to = c.req.param('userId');
  try {
    const r = await likeRoom(c.env.DB, c.get('viewer').user_id, to);
    if (r === 'bad') return c.redirect('/room');
    return c.redirect(`/room/${encodeURIComponent(to)}?n=${r}`);
  } catch (e) {
    console.error('방 좋아요 실패', e);
    return c.redirect(`/room/${encodeURIComponent(to)}?n=error`);
  }
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

app.notFound((c) => page(c, <NotFoundPage viewer={c.get('viewer') ?? null} />, 404));

// 처리하지 못한 오류: 하얀 화면 대신 다시 시도·방장 문의 화면을 보여 줘요
app.onError((err, c) => {
  console.error('화면 오류', c.req.method, c.req.path, err);
  const retry = c.req.method === 'GET' && /^\/(?![\/\\])/.test(c.req.path) ? c.req.path : '/me';
  return c.html('<!doctype html>' + String(<ErrorPage retry={retry} />), 500);
});

export default app;
