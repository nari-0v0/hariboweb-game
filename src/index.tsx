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
  countActiveMembers,
  countOwnedCards,
  getMember,
  getOwnedCard,
  getOwnedItems,
  getProfile,
  listDogam,
  buyWithJelly,
  listPendingServices,
  listCheers,
  markCheer,
  listNickJobs,
  nickState,
  settleNickJob,
  useNickTicket,
  NICK_FAIL_REASONS,
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
import { KIDNAP_MIN, SERVER_JELLY, TEAM_GOAL_MIN, TEAM_JELLY, TEAM_PRIOR_MAX, bingoExtras, loadServerQuest, loadTeams, myTeamState, rankTeams, seasonAt } from './team';
import { loadRankings } from './rankings';
import { dogamProgress } from './unlock';
import { RankPage, rankTab } from './views/rank';
import { BLOCK_MAX_PENDING, BLOCK_MORE, blockCandidates, cancelBlock, decideBlock, listUnpostedBlocks, markBlockPosted, myBlocks, requestBlock } from './assign-block';
import { checkNote, cleanNote, hidePraiseNote, markPraiseSeen, praiseBox, praiseDayLabel, PRAISE_NOTE_MAX } from './praise-note';
import type { BlockForm } from './views/bingo';
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

import { GambleLobby, GambleRoom } from './views/gamble';
import { activeHand, betChips, betTooSoon, claimDaily, expireHand, gambleAccount, gambleDay, gambleRanks, gambleRound, moveHand, rescueChips, type Game } from './gamble-db';
import { prefetchAllowed } from './prefetch';
import { EscapePage } from './views/escape';
import { JourneyPage } from './views/journey';
import { activeJourney, actJourneyRun, beginJourney, buyPerk, getJourney, journeyBank, journeyRecord, quitJourney, upgradeGear } from './journey-db';
import { GEAR, PERKS, type GearId, type PerkId } from './journey';
import { activeEscape, actEscapeRun, beginEscape, escapeOpen, escapeRecord, getEscape, quitEscape } from './escape-db';
import { escCase } from './escape';

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
  const notMember = c.req.query('error') === 'not_member';
  return page(c, <LandingPage notMember={notMember} devLogin={c.env.DEV_LOGIN === '1'} />);
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

// 도감 축하: 두 사람 카드가 10레벨마다. 봇이 디스코드에 올리고 알려요.
app.get('/api/bot/cheers', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const rows = await listCheers(c.env.DB);
  return c.json({ cheers: rows.map((r) => ({ ...r, name: levelName(r.level) })) });
});
app.post('/api/bot/cheers', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  const { a, b, level } = (body ?? {}) as { a?: unknown; b?: unknown; level?: unknown };
  const id = /^\d{5,20}$/;
  if (typeof a !== 'string' || typeof b !== 'string' || !id.test(a) || !id.test(b) || !Number.isInteger(level) || (level as number) < 10 || (level as number) > 100)
    return c.json({ error: 'bad_body' }, 400);
  return c.json({ ok: true, changed: await markCheer(c.env.DB, a, b, level as number) });
});

// 도감 닉네임 변경권: 봇이 가져가 닉네임을 바꾸고 결과를 알려요. 실패면 변경권이 그대로 남아요.
app.get('/api/bot/nicks', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const rows = await listNickJobs(c.env.DB);
  return c.json({ nicks: rows.map((r) => ({ id: r.id, user: r.user_id, front: r.front })) });
});
app.post('/api/bot/nicks/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  const { ok, reason } = (body ?? {}) as { ok?: unknown; reason?: unknown };
  if (typeof ok !== 'boolean') return c.json({ error: 'bad_ok' }, 400);
  if (!ok && !(NICK_FAIL_REASONS as readonly unknown[]).includes(reason)) return c.json({ error: 'bad_reason' }, 400);
  const changed = await settleNickJob(c.env.DB, c.req.param('id'), ok, ok ? null : (reason as string));
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

// 같이 배정되지 않기: 봇이 아직 안 올린 요청을 가져가 비공개 채널에 올리고, 올린 메시지 번호와 나리의 결정을 알려요.
app.get('/api/bot/assign-blocks', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ blocks: await listUnpostedBlocks(c.env.DB) });
});

app.post('/api/bot/assign-blocks/:id/posted', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = Number(c.req.param('id'));
  let body: { message_id?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  if (!Number.isSafeInteger(id) || !isDiscordId(body.message_id)) return c.json({ error: 'bad_id' }, 400);
  return c.json({ ok: true, changed: await markBlockPosted(c.env.DB, id, body.message_id, Date.now()) });
});

app.post('/api/bot/assign-blocks/:id/decide', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = Number(c.req.param('id'));
  let body: { decision?: unknown; by?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  if (!Number.isSafeInteger(id) || !isDiscordId(body.by)) return c.json({ error: 'bad_id' }, 400);
  if (body.decision !== 'approve' && body.decision !== 'reject') return c.json({ error: 'bad_decision' }, 400);
  const r = await decideBlock(c.env.DB, id, body.decision === 'approve' ? 'approved' : 'rejected', body.by, Date.now());
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(r);
});

// 디스코드 고정 패널 "내 카드". 봇이 이 정보로 카드 그림과 안내를 만들어요.
app.get('/api/bot/card/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const member = isDiscordId(id) ? await getMember(c.env.DB, id) : null;
  if (!member || !member.active) return c.json({ error: 'not_member' }, 404);
  const [profile, entries, best, praise, box] = await Promise.all([
    getProfile(c.env.DB, id),
    listDogam(c.env.DB, id),
    getBestCard(c.env.DB, id),
    praiseToday(c.env.DB, id),
    praiseBox(c.env.DB, id, 5),
  ]);
  // 패널 "내 카드"로 칭찬함을 봤어요(안 읽은 개수는 이번 응답에만 보여 줘요)
  if (box.unread) await markPraiseSeen(c.env.DB, id, Date.now()).catch((e) => console.error('칭찬함 읽음 표시 실패', e));
  // 주간 빙고 "패널에서 내 카드 열기" 칸(실패해도 카드는 보여 줘요)
  // 새로 채웠으면 그 자리에서 줄 보상도 확인해요(이 칸이 마지막 칸일 수 있어요)
  await markFlag(c.env.DB, id, 'panel', Date.now())
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
    praise_box: {
      unread: box.unread,
      total: box.total,
      items: box.items.map((i) => ({ day: i.day, date: praiseDayLabel(i.day), note: i.note, unread: i.unread })),
    },
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
  let body: { from?: unknown; to?: unknown; note?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON이 아니에요' }, 400);
  }
  if (!isDiscordId(body.from) || !isDiscordId(body.to)) return c.json({ error: 'bad_id' }, 400);
  if (body.note != null && (typeof body.note !== 'string' || [...body.note].length > PRAISE_NOTE_MAX * 2)) return c.json({ error: 'bad_note' }, 400);
  // 한마디는 비꼬기·욕이면 빼고 칭찬만 전해요. 이미 줬거나 한도면 AI에 묻지 않아요.
  const status = await praiseToday(c.env.DB, body.from);
  const asked = cleanNote(body.note) !== '';
  const check = asked && status.left > 0 && !status.given.includes(body.to) ? await checkNote(c.env.AI, body.note) : { note: null, filtered: false };
  const result = await givePraise(c.env.DB, body.from, body.to, kstDay(), check.note);
  // 칭찬 주기·받기 빙고 칸이 채워졌으면 줄 보상을 줘요(실패해도 칭찬은 끝났어요)
  if (result.result === 'done') {
    const now = Date.now();
    await grantBingo(c.env.DB, await currentPeriod(c.env.DB, now), [body.from, body.to], now).catch((e) => console.error('빙고 보상 확인 실패', e));
  }
  // note: sent(한마디도 전함) · filtered(한마디는 빼고 칭찬만 전함) · none(한마디 없음)
  const note = result.result !== 'done' || !asked ? 'none' : check.note ? 'sent' : 'filtered';
  return c.json({ ...result, note });
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

// 디스코드 고정 패널 "우리 팀": 빙고 가운데 칸 팀 퀘스트와 서버 퀘스트(초록하리보 납치 대소동!).
// 달성한 사람 이름만 보여 줘요(후보·짝은 보여 주지 않아요).
app.get('/api/bot/team/:id', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (!isDiscordId(id)) return c.json({ error: 'bad_id' }, 400);
  const x = await bingoExtras(c.env.DB, id, new Date().toISOString());
  const t = x.team;
  const names = new Map(t?.members.map((m) => [m.id, m.name]) ?? []);
  return c.json({
    season: x.season ? { start: x.season.start, end: x.season.end } : null,
    team: t
      ? {
          no: t.no + 1,
          members: t.members.filter((m) => !m.left).map((m) => ({ id: m.id, name: m.name })),
          target: t.target,
          achievers: t.achievers.map((a) => ({ id: a, name: names.get(a) ?? '알 수 없음' })),
          complete: t.complete,
          bonus: t.bonus,
          me: myTeamState(t, id),
        }
      : null,
    server: x.server ? { target: x.server.target, kidnapped: x.server.kidnapped.length, met: x.server.met, joined: x.server.participants.includes(id) } : null,
    rules: { goal_min: TEAM_GOAL_MIN, prior_max: TEAM_PRIOR_MAX, kidnap_min: KIDNAP_MIN, team_jelly: TEAM_JELLY, server_jelly: SERVER_JELLY },
    page_url: baseUrl(c) + '/bingo',
  });
});

// 지금 시즌 팀 순위(고정 패널 본문 그림). 시즌이나 팀이 없으면 ranking: null
app.get('/api/bot/teams', async (c) => {
  if (!(await isBot(c))) return c.json({ error: 'unauthorized' }, 401);
  const now = new Date().toISOString();
  const season = await seasonAt(c.env.DB, now);
  if (!season) return c.json({ season: null, ranking: null, server: null, page_url: baseUrl(c) + '/bingo' });
  const [teams, server] = await Promise.all([loadTeams(c.env.DB, season.id), loadServerQuest(c.env.DB, season.id)]);
  return c.json({
    season: { start: season.start, end: season.end },
    ranking: teams.size ? rankTeams(teams.values()).map((r) => ({ ...r, no: r.no + 1 })) : null,
    server: server ? { target: server.target, kidnapped: server.kidnapped.length, met: server.met } : null,
    page_url: baseUrl(c) + '/bingo',
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
    .catch((e) => console.error('빙고 표시 실패', e));
  const [profile, entries, items, box] = await Promise.all([
    getProfile(c.env.DB, viewer.user_id),
    listDogam(c.env.DB, viewer.user_id),
    getOwnedItems(c.env.DB, viewer.user_id),
    praiseBox(c.env.DB, viewer.user_id),
  ]);
  if (box.unread) await markPraiseSeen(c.env.DB, viewer.user_id, Date.now()).catch((e) => console.error('칭찬함 읽음 표시 실패', e));
  const { owned, total } = completion(entries);
  return page(
    c,
    <MePage viewer={viewer} profile={profile} items={items} owned={owned} total={total} saved={c.req.query('saved') === '1'} praise={box} />,
  );
});

// 칭찬함: 받은 한마디 숨기기
members.post('/api/me/praise/:id/hide', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const id = Number(c.req.param('id'));
  if (Number.isSafeInteger(id) && id > 0) await hidePraiseNote(c.env.DB, c.get('viewer').user_id, id);
  return c.redirect('/me#praise');
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

// 상점: 매점(잡다매점: 디스코드 물건·성별 바꾸기)과 꾸미기(테마·꾸밈 캐릭터) 탭. 칭호 탭은 /titles예요.
async function shopPage(c: Context<AppEnv>, tab: 'store' | 'deco') {
  const viewer = c.get('viewer');
  const [profile, owned, cards, memberCount, results, services, nick] = await Promise.all([
    getProfile(c.env.DB, viewer.user_id),
    getOwnedItems(c.env.DB, viewer.user_id),
    countOwnedCards(c.env.DB, viewer.user_id),
    countActiveMembers(c.env.DB),
    listUnseenPurchases(c.env.DB, viewer.user_id),
    serviceState(c.env.DB, viewer.user_id),
    nickState(c.env.DB, viewer.user_id),
  ]);
  // 아직 결과를 안 본 결제는 이번에 팝업으로 보여 주고 본 것으로 표시해요
  await markPurchasesSeen(c.env.DB, viewer.user_id, results.map((p) => p.id));
  return page(
    c,
    <ShopPage tab={tab} viewer={viewer} profile={profile} owned={owned} cards={cards} members={memberCount} results={results} services={services} nick={nick} notice={c.req.query('n')} />,
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
    result = await requestService(c.env.DB, viewer.user_id, item.id, price, n, item.key === 'nickname');
  } catch (e) {
    console.error('도감 서비스 결제 실패', e);
    return c.redirect('/shop?n=error');
  }
  if (result === 'changed') return c.redirect('/shop?n=price_changed');
  if (result === 'done') return c.redirect('/shop#nick');
  return c.redirect(`/shop?n=${result === 'pending' ? 'service_pending' : result === 'busy' ? 'service_busy' : 'not_enough_jelly'}`);
});

// 도감 닉네임 변경권 쓰기: 하리보봇이 1분 안쪽에 디스코드 닉네임 앞부분을 바꿔요(칭호·생년은 그대로).
members.post('/api/shop/nick', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const front = String((await c.req.parseBody()).front ?? '').trim();
  if (!front || front.length > 16 || /\s/.test(front) || /[「」]/.test(front)) return c.redirect('/shop?n=nick_bad#nick');
  const ok = await useNickTicket(c.env.DB, c.get('viewer').user_id, front);
  return c.redirect(`/shop?n=${ok ? 'nick_pending' : 'nick_none'}#nick`);
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
  const [owned, cards, memberCount] = await Promise.all([getOwnedItems(c.env.DB, viewer.user_id), countOwnedCards(c.env.DB, viewer.user_id), countActiveMembers(c.env.DB)]);
  if (!canUse(item, owned, cards, memberCount)) return c.redirect('/shop/deco?n=locked');
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

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isGambleGame = (value: unknown): value is Game => value === 'slot' || value === 'roulette' || value === 'cards';
const gambleRoomUrl = (game: Game, token?: string) => `/gamble/${game}${token ? `?r=${token}` : ''}`;

members.get('/gamble', async (c) => {
  c.header('Cache-Control', 'no-store');
  const viewer = c.get('viewer');
  const user = viewer.user_id;
  const db = c.env.DB;
  const token = c.req.query('r');
  if (uuid(token)) {
    const round = await gambleRound(db, user, token);
    if (round) return c.redirect(gambleRoomUrl(round.game, round.token));
  }
  const now = new Date().toISOString();
  await expireHand(db, user, now);
  const daily = await claimDaily(db, user, now);
  const [account, hand, ranks] = await Promise.all([
    gambleAccount(db, user), activeHand(db, user), gambleRanks(db, now),
  ]);
  return page(c, <GambleLobby viewer={viewer} account={account} inProgress={!!hand}
    ranks={ranks} now={now} daily={daily} notice={c.req.query('n')} />);
});

members.get('/gamble/:game', async (c) => {
  const game = c.req.param('game');
  if (!isGambleGame(game)) return c.notFound();
  c.header('Cache-Control', 'no-store');
  const viewer = c.get('viewer');
  const user = viewer.user_id;
  const db = c.env.DB;
  const now = new Date().toISOString();
  const expired = await expireHand(db, user, now);
  const daily = await claimDaily(db, user, now);
  const token = c.req.query('r') ?? (game === 'cards' ? expired : null);
  const [account, hand, round] = await Promise.all([
    gambleAccount(db, user), activeHand(db, user),
    uuid(token) ? gambleRound(db, user, token) : null,
  ]);
  return page(c, <GambleRoom viewer={viewer} game={game} balance={account?.chips ?? 0}
    hand={hand} result={round?.game === game ? round : null} daily={daily} notice={c.req.query('n')} />);
});

async function playGamble(c: Context<AppEnv>, room?: string) {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const user = c.get('viewer').user_id;
  const db = c.env.DB;
  const now = new Date().toISOString();
  const form = await c.req.parseBody();
  const game = room ?? form.game;
  if (!isGambleGame(game)) return c.redirect('/gamble', 303);
  const { bet, token } = form;
  const url = gambleRoomUrl(game);
  if (typeof bet !== 'string' || !/^[1-9][0-9]*$/.test(bet) || !uuid(token)) {
    return c.redirect(`${url}?n=bet`, 303);
  }
  await expireHand(db, user, now);
  const round = await betChips(db, user, game, Number(bet), token, now);
  if (round?.game === game) return c.redirect(gambleRoomUrl(game, round.token), 303);
  const notice = game === 'cards' && await activeHand(db, user) ? 'active' : await betTooSoon(db, user, now) ? 'fast' : 'bet';
  return c.redirect(`${url}?n=${notice}`, 303);
}

members.post('/gamble/:game/play', (c) => playGamble(c, c.req.param('game')));
members.post('/gamble/play', (c) => playGamble(c));

members.post('/gamble/cards', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const { token, revision, move } = await c.req.parseBody();
  if (!uuid(token) || typeof revision !== 'string' || !/^[0-9]{1,2}$/.test(revision) ||
    (move !== 'hit' && move !== 'stand')) return c.redirect(gambleRoomUrl('cards'), 303);
  const user = c.get('viewer').user_id;
  await moveHand(c.env.DB, user, token, Number(revision), move, new Date().toISOString());
  return c.redirect(gambleRoomUrl('cards', token), 303);
});

members.post('/gamble/rescue', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const user = c.get('viewer').user_id;
  const now = new Date().toISOString();
  const { day } = await c.req.parseBody();
  if (day !== gambleDay(now)) return c.redirect('/gamble?n=no-rescue', 303);
  await expireHand(c.env.DB, user, now);
  const rescued = await rescueChips(c.env.DB, user, now);
  return c.redirect(rescued ? '/gamble?n=rescue' : '/gamble?n=no-rescue', 303);
});

// 하리보 원정대 (하루 모험판): 하루씩 나아가며 싸우고 스킬을 골라요. 자동 선택(방치)도 돼요.
const JR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
members.get('/expedition/go', async (c) => {
  const viewer = c.get('viewer');
  c.header('Cache-Control', 'no-store');
  const [run, record, profile, bank, dogam] = await Promise.all([
    activeJourney(c.env.DB, viewer.user_id),
    journeyRecord(c.env.DB, viewer.user_id),
    getProfile(c.env.DB, viewer.user_id),
    journeyBank(c.env.DB, viewer.user_id),
    dogamProgress(c.env.DB, viewer.user_id),
  ]);
  const rid = c.req.query('r') ?? '';
  const done = !run && JR_ID.test(rid) ? await getJourney(c.env.DB, viewer.user_id, rid) : null;
  const art = characterUrl(profile.character_id, viewer.user_id, profile.deco_id);
  return page(c, <JourneyPage viewer={viewer} art={art} run={run} result={done?.row.status === 'done' ? done : null} record={record} bank={bank} dogam={dogam} notice={c.req.query('n')} prep={c.req.query('prep')} />);
});
members.post('/api/journey/start', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  try {
    const ch = Number((await c.req.parseBody()).ch ?? 1);
    const id = await beginJourney(c.env.DB, c.get('viewer').user_id, Number.isSafeInteger(ch) && ch >= 1 ? ch : 1);
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
    return c.redirect(`/expedition/go?prep=train&n=${ok ? 'perk' : 'noperk'}#perks`, 303);
  } catch (e) {
    console.error('원정 강화 실패', e);
    return c.redirect('/expedition/go?n=error#perks', 303);
  }
});
members.post('/api/journey/gear', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const k = String((await c.req.parseBody()).k ?? '');
  if (!Object.hasOwn(GEAR, k)) return c.redirect('/expedition/go?n=bad#perks', 303);
  try {
    const ok = await upgradeGear(c.env.DB, c.get('viewer').user_id, k as GearId);
    return c.redirect(`/expedition/go?prep=gear&n=${ok ? 'gear' : 'nogear'}#perks`, 303);
  } catch (e) {
    console.error('원정 장비 강화 실패', e);
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
  const [run, best, profile, dogam] = await Promise.all([activeEscape(c.env.DB, viewer.user_id), escapeRecord(c.env.DB, viewer.user_id), getProfile(c.env.DB, viewer.user_id), dogamProgress(c.env.DB, viewer.user_id)]);
  const art = characterUrl(profile.character_id, viewer.user_id, profile.deco_id);
  const rid = c.req.query('r') ?? '';
  const done = !run && ESC_ID.test(rid) ? await getEscape(c.env.DB, viewer.user_id, rid) : null;
  return page(c, <EscapePage viewer={viewer} art={art} run={run} result={done?.row.status === 'done' ? done : null} best={best} dogam={dogam} notice={c.req.query('n')} list={c.req.query('list') === '1'} />);
});
members.post('/api/escape/start', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  try {
    const user = c.get('viewer').user_id;
    const want = String(body.case ?? '');
    // 사건 목록에서 다른 사건을 고르면 하던 사건은 덮고 새로 열어요.
    // 도감 조건이 안 되는 사건이면 하던 사건을 덮지 않고 돌아가요.
    if (!(await escapeOpen(c.env.DB, user, want))) return c.redirect('/cases/room?list=1&n=locked', 303);
    if (body.switch === '1' && escCase(want)) {
      const going = await activeEscape(c.env.DB, user);
      if (going && going.row.case_id !== want) await quitEscape(c.env.DB, user, going.row.id);
    }
    const id = await beginEscape(c.env.DB, user, want);
    return c.redirect(id ? '/cases/room#now' : '/cases/room?n=bad', 303);
  } catch (e) {
    console.error('사건 시작 실패', e);
    return c.redirect('/cases/room?n=error', 303);
  }
});
// 칸 고르기(g0, g1, …)와 순서 고르기(t0, t1, …)는 칸·자리마다 따로 와서 답 하나로 이어 붙여요.
function escCodeValue(body: Record<string, unknown>, v: string): string {
  const gn = Number(body.gn);
  if (Number.isInteger(gn) && gn > 0 && gn <= 64) return Array.from({ length: gn }, (_, i) => (body[`g${i}`] ? '1' : '0')).join('');
  if (body.t0 === undefined) return v;
  const out: string[] = [];
  for (let i = 0; i < 9 && body[`t${i}`] !== undefined; i++) out.push(String(body[`t${i}`]).slice(0, 1));
  return out.join('');
}
members.post('/api/escape/act', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const id = String(body.run ?? ''), rev = Number(body.rev), a = String(body.a ?? '');
  const str = (k: string) => String(body[k] ?? '').slice(0, 40);
  const act =
    a === 'tap' ? { a, o: str('o') } as const
    : a === 'use' ? { a, o: str('o'), i: str('i') } as const
    : a === 'code' ? { a, o: str('o'), v: escCodeValue(body, String(body.v ?? '').slice(0, 900)) } as const
    : a === 'answer' ? { a, n: Number(body.n), ...(body.m0 !== undefined ? { m: [0, 1, 2].map((k) => body[`m${k}`]).filter((v) => v !== undefined).map(Number) } : {}) } as const
    : a === 'combine' ? { a, i: str('i'), j: str('j') } as const
    : a === 'hint' ? { a } as const
    : a === 'hint2' ? { a, o: str('o') } as const
    : a === 'coin' && /^[0-9]$/.test(String(body.n ?? '')) ? { a, k: Number(body.n) } as const
    : null;
  if (!ESC_ID.test(id) || !Number.isSafeInteger(rev) || rev < 0 || !act) return c.redirect('/cases/room?n=bad#now', 303);
  try {
    const user = c.get('viewer').user_id;
    const r = await actEscapeRun(c.env.DB, user, id, rev, act);
    if (r !== 'ok') return c.redirect(`/cases/room?n=${r}#now`, 303);
    // 다시 불러오기(리다이렉트) 없이 바로 화면을 그려 보내요. 한 번 왕복이 줄어서 빨라요.
    const [after, best, profile, dogam] = await Promise.all([getEscape(c.env.DB, user, id), escapeRecord(c.env.DB, user), getProfile(c.env.DB, user), dogamProgress(c.env.DB, user)]);
    const done = after?.row.status === 'done';
    c.header('Cache-Control', 'no-store');
    const viewer = c.get('viewer');
    const art = characterUrl(profile.character_id, user, profile.deco_id);
    return page(c, <EscapePage viewer={viewer} art={art} run={done ? null : after} result={done ? after : null} best={best} dogam={dogam} url={done ? `/cases/room?r=${id}#now` : '/cases/room#now'} />);
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

// 예전 사건파일·원정대 주소는 지금 게임으로 보내요(옛 게임과 보상은 없앴어요).
for (const [from, to] of [['/cases', '/cases/room'], ['/cases/story', '/cases/room'], ['/expedition', '/expedition/go'], ['/expedition/story', '/expedition/go']] as const) {
  members.get(from, (c) => c.redirect(to, 301));
}

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
  const view = await groupViewFor(c.env.DB, viewer.user_id, Date.now());
  // 모둠 퀘스트 8개는 하리보 빙고(팀 퀘스트)로 바뀌었어요. 예전 시즌 퀘스트가 없으면 빙고로 보내요.
  if (!view || !view.quests.length) return c.redirect('/bingo');
  return page(c, <GroupPage viewer={viewer} view={view} />);
});

async function bingoPage(c: Context<AppEnv>, form?: BlockForm) {
  const viewer = c.get('viewer');
  const view = await myBingo(c.env.DB, viewer.user_id, Date.now());
  const [extras, candidates, mine] = await Promise.all([
    view ? bingoExtras(c.env.DB, viewer.user_id, view.week.start) : Promise.resolve(null),
    blockCandidates(c.env.DB, viewer.user_id),
    myBlocks(c.env.DB, viewer.user_id),
  ]);
  const sent = c.req.query('blocked') === '1';
  const undone = c.req.query('unblocked') === '1';
  return page(c, <BingoPage viewer={viewer} view={view} extras={extras} block={{ candidates, form, sent, mine, undone }} />);
}

members.get('/bingo', (c) => bingoPage(c));

// 순위 메뉴: 도감·빙고(젤리피)·원정대·사건파일·겜블장 1~3위와 내 순위
members.get('/rank', async (c) => {
  const viewer = c.get('viewer');
  return page(c, <RankPage viewer={viewer} ranks={await loadRankings(c.env.DB, viewer.user_id, Date.now())} tab={rankTab(c.req.query('g'))} />);
});

// 같이 배정되지 않기 신청. 다시 물어야 하면 적은 내용을 그대로 두고 화면을 다시 보여 줘요.
members.post('/bingo/block', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const to = String(body.to ?? '');
  const reason = String(body.reason ?? '');
  const asked = body.asked === '1';
  if (!isDiscordId(to)) return bingoPage(c, { to: '', reason, msg: '같이 배정되지 않을 멤버를 골라 주세요.', asked });
  const result = await requestBlock(c.env.DB, c.env.AI, c.get('viewer').user_id, to, reason, asked, Date.now());
  if (result === 'done') return c.redirect('/bingo?blocked=1#block');
  const msg = {
    self: '나 자신은 고를 수 없어요.',
    unknown: '지금 서버에 있는 멤버를 골라 주세요.',
    dup: '이 멤버는 이미 제외했거나 검토 중이에요.',
    limit: `최대 ${BLOCK_MAX_PENDING}명까지 배정을 제외시킬 수 있어요. 다른 사람을 제외하려면 위에서 한 명을 풀어 주세요.`,
    empty: BLOCK_MORE,
    more: BLOCK_MORE,
  }[result];
  return bingoPage(c, { to, reason, msg, asked: asked || result === 'more' });
});

// 같이 배정되지 않기 풀기(내 요청만). 승인 없이 바로 지워요.
members.post('/bingo/block/cancel', async (c) => {
  if (!sameOrigin(c)) return c.text('잘못된 요청이에요', 403);
  const body = await c.req.parseBody();
  const id = Number(body.id);
  if (Number.isSafeInteger(id) && id > 0) await cancelBlock(c.env.DB, c.get('viewer').user_id, id);
  return c.redirect('/bingo?unblocked=1#block');
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
