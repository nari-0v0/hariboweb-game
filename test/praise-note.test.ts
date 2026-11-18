// 칭찬 한마디: 검사, 칭찬함(보낸 사람 숨김·안 읽은 개수·숨기기), 봇 API, 떠난 멤버 정리
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { signSession } from '../src/crypto';
import { givePraise } from '../src/db';
import { fallbackWeek, loadStats } from '../src/bingo';
import { loadGroups } from '../src/season';
import { checkNote, cleanNote, hidePraiseNote, markPraiseSeen, parseNoteVerdict, praiseBox } from '../src/praise-note';
import { applySync, parseSync } from '../src/sync';
import type { Env } from '../src/env';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const [A, B, C] = ['111111111111111111', '222222222222222222', '333333333333333333'];
const NOW = Date.parse('2026-11-12T03:00:00Z');

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => sql.prepare(query).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try {
        for (const s of list) sql.prepare(s.query).run(...(s.args as never[]));
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
      return [];
    },
  };
  for (const id of [A, B, C]) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
  return { sql, db: db as unknown as D1Database };
}

const fakeAi = (reply: string | Error) =>
  ({
    run: async () => {
      if (reply instanceof Error) throw reply;
      return { response: reply };
    },
  }) as unknown as Ai;

describe('한마디 검사', () => {
  it('띄어쓰기를 정리하고 100자까지 받아요', () => {
    expect(cleanNote('  오늘   캐리 \n고마워요 ')).toBe('오늘 캐리 고마워요');
    expect([...cleanNote('가'.repeat(150))]).toHaveLength(100);
    expect(cleanNote(3)).toBe('');
  });

  it('AI가 비꼬기라고 하면 한마디는 빼요. 욕설은 막지 않고, AI가 없거나 실패하면 그대로 보내요', async () => {
    expect(parseNoteVerdict('{"verdict":"bad"}')).toBe('bad');
    expect(parseNoteVerdict('모르겠어요')).toBeNull();
    expect(await checkNote(fakeAi('{"verdict":"ok"}'), '덕분에 이겼어요')).toEqual({ note: '덕분에 이겼어요', filtered: false, verdict: 'ok' });
    expect(await checkNote(fakeAi('{"verdict":"bad"}'), '와 진짜 대단하시네요^^ 혼자 다 죽던데')).toEqual({ note: null, filtered: true, verdict: 'bad' });
    expect(await checkNote(fakeAi(new Error('limit')), '덕분에 이겼어요')).toEqual({ note: '덕분에 이겼어요', filtered: false, verdict: 'none' });
    expect(await checkNote(undefined, '존나 잘함 ㅅㅂ')).toEqual({ note: '존나 잘함 ㅅㅂ', filtered: false, verdict: 'none' });
    expect(await checkNote(undefined, '   ')).toEqual({ note: null, filtered: false });
  });
});

describe('칭찬함', () => {
  it('보낸 사람 없이 한마디·날짜만 보이고, 본 뒤에는 안 읽은 개수가 0이에요', async () => {
    const { db } = fakeD1();
    await givePraise(db, A, C, '2026-11-11', '어제 고마웠어요');
    await givePraise(db, B, C, '2026-11-12');
    const box = await praiseBox(db, C);
    expect(box).toMatchObject({ unread: 2, total: 2 });
    expect(box.items.map((i) => [i.day, i.note, i.unread])).toEqual([
      ['2026-11-12', null, true],
      ['2026-11-11', '어제 고마웠어요', true],
    ]);
    expect(JSON.stringify(box)).not.toContain(A);
    expect(JSON.stringify(box)).not.toContain(B);
    // 봇 카드는 최근 limit개만, 웹 칭찬함(allUnread)은 안 읽은 건 다 보여 줘요
    expect((await praiseBox(db, C, 1)).items).toHaveLength(1);
    expect((await praiseBox(db, C, 1, true)).items).toHaveLength(2);
    await markPraiseSeen(db, C, Date.now() + 1000, (await praiseBox(db, C, 20, true)).items.map((item) => item.id));
    expect((await praiseBox(db, C)).unread).toBe(0);
  });

  it('받은 사람만 한마디를 숨길 수 있어요', async () => {
    const { db } = fakeD1();
    await givePraise(db, A, C, '2026-11-12', '최고!');
    const [item] = (await praiseBox(db, C)).items;
    expect(await hidePraiseNote(db, A, item!.id)).toBe(false);
    expect(await hidePraiseNote(db, C, item!.id)).toBe(true);
    expect((await praiseBox(db, C)).items[0]).toMatchObject({ note: null, hidden: true });
  });

  it('오래된 읽음 표시가 나중에 저장돼도 읽은 칭찬이 다시 새 칭찬이 되지 않아요', async () => {
    const { db } = fakeD1();
    const before = Date.now() - 1000;
    await givePraise(db, A, C, '2026-11-12', '최고!');
    await markPraiseSeen(db, C, Date.now() + 1000, (await praiseBox(db, C, 20, true)).items.map((item) => item.id));
    await markPraiseSeen(db, C, before, (await praiseBox(db, C, 20, true)).items.map((item) => item.id));
    expect((await praiseBox(db, C)).unread).toBe(0);
  });

  it('떠난 멤버의 한마디는 지우고, 보낸 사람 기록(빙고 집계)은 남기고, 다시 들어와도 예전 칭찬은 안 보여요', async () => {
    const { sql, db } = fakeD1();
    await givePraise(db, A, C, '2026-11-10', '예전 칭찬');
    await givePraise(db, B, C, '2026-11-12', '오늘 칭찬');
    const parsed = parseSync({ batch_id: `${new Date().toISOString()}-left`, removed: [C] });
    if (!parsed.ok) throw new Error(parsed.error);
    await applySync(db, parsed.value, Date.now() + 1000);
    expect(sql.prepare('SELECT from_id, note FROM praises ORDER BY from_id').all()).toEqual([
      { from_id: A, note: null },
      { from_id: B, note: null },
    ]);
    sql.prepare("UPDATE members SET active = 1 WHERE user_id = ?").run(C);
    expect(await praiseBox(db, C)).toMatchObject({ total: 0, unread: 0, items: [] });
  });
});

describe('떠난 멤버 정리', () => {
  it('산 기록·남은 닉네임 변경권·젤칩을 지워서, 다시 들어와도 돌아오지 않아요', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT INTO purchases (id, user_id, item_id, price, status, created_at) VALUES ('p1', ?, 'svc:nickname', 5, 'done', 'x')").run(C);
    sql.prepare("INSERT INTO nick_jobs (id, user_id, front, status, created_at) VALUES ('n1', ?, '새이름', 'pending', 'x')").run(C);
    sql.prepare("INSERT INTO gamble_accounts (user_id, chips) VALUES (?, 5000)").run(C);
    const parsed = parseSync({ batch_id: `${new Date().toISOString()}-left2`, removed: [C] });
    if (!parsed.ok) throw new Error(parsed.error);
    await applySync(db, parsed.value, Date.now() + 1000);
    for (const t of ['purchases', 'nick_jobs', 'gamble_accounts'])
      expect(sql.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(C)).toEqual({ n: 0 });
  });
});

describe('봇 칭찬 API', () => {
  const call = (env: Env, path: string, body?: unknown) =>
    app.request(path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, env);

  it('한마디를 같이 보내고, 비꼬기면 빼고 칭찬만 전해요', async () => {
    const { db } = fakeD1();
    const env = { DB: db, BOT_SYNC_SECRET: 's', AI: fakeAi('{"verdict":"ok"}') } as unknown as Env;
    const res = await call(env, '/api/bot/praise', { from: A, to: C, note: '  오늘 캐리 고마워요 ' });
    expect(await res.json()).toMatchObject({ result: 'done', note: 'sent' });
    const bad = { ...env, AI: fakeAi('{"verdict":"bad"}') } as Env;
    expect(await (await call(bad, '/api/bot/praise', { from: B, to: C, note: '잘하시네요^^' })).json()).toMatchObject({ result: 'done', note: 'filtered' });
    expect(await (await call(env, '/api/bot/praise', { from: A, to: B })).json()).toMatchObject({ result: 'done', note: 'none' });
    expect(await (await call(env, '/api/bot/praise', { from: A, to: C, note: '또' })).json()).toMatchObject({ result: 'already', note: 'none' });
    expect((await call(env, '/api/bot/praise', { from: A, to: C, note: 5 })).status).toBe(400);

    const card = (await (await call(env, `/api/bot/card/${C}`)).json()) as { praise_box: { unread: number; items: { note: string | null; date: string }[] } };
    expect(card.praise_box.unread).toBe(2);
    expect(card.praise_box.items.map((i) => i.note).sort()).toEqual([null, '오늘 캐리 고마워요']);
    expect(JSON.stringify(card.praise_box)).not.toContain(A);
    // 패널은 일부만 보여 줘요. 웹에서 아직 읽지 않은 칭찬은 그대로예요.
    const again = (await (await call(env, `/api/bot/card/${C}`)).json()) as { praise_box: { unread: number } };
    expect(again.praise_box.unread).toBe(2);

    // AI가 본 한마디는 원래 글 그대로 로그로 남고, 봇이 가져가 올린 뒤 표시해요
    const logs = (await (await call(env, '/api/bot/ai-logs')).json()) as { logs: { id: number; from: { id: string }; text: string; verdict: string }[] };
    expect(logs.logs.map((l) => [l.from.id, l.text, l.verdict])).toEqual([
      [A, '오늘 캐리 고마워요', 'ok'],
      [B, '잘하시네요^^', 'bad'],
    ]);
    const marked = await call(env, '/api/bot/ai-logs/posted', { ids: logs.logs.map((l) => l.id) });
    expect(await marked.json()).toMatchObject({ changed: 2 });
    expect(((await (await call(env, '/api/bot/ai-logs')).json()) as { logs: unknown[] }).logs).toHaveLength(0);
    expect((await call(env, '/api/bot/ai-logs/posted', { ids: ['x'] })).status).toBe(400);
  });
});

it('다른 멤버의 도감에 있는 내 카드는 관계 상세를 보여 줘요', async () => {
  const { db, sql } = fakeD1();
  sql.prepare("UPDATE members SET gender_chosen_at = 'chosen' WHERE user_id = ?").run(A);
  sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, 10, ?, ?)").run(B, A, new Date(NOW).toISOString(), new Date(NOW).toISOString());
  const session = await signSession('test', { uid: A, exp: Date.now() + 60_000 });
  const env = { DB: db, SESSION_SECRET: 'test' } as Env;
  const get = (path: string) => app.request(path, { headers: { Cookie: `hs=${session}` } }, env);
  const response = await get(`/card/${A}?from=${B}`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('처음 만난 날');
  expect((await get(`/card/${A}`)).headers.get('location')).toBe('/me');
});

it('내 카드는 칭찬 3개만 미리 보여 주고 읽음 처리는 칭찬함 페이지에서 해요', async () => {
  const { db, sql } = fakeD1();
  sql.prepare("UPDATE members SET gender_chosen_at = 'chosen' WHERE user_id = ?").run(A);
  const senders = ['444444444444444441', '444444444444444442', '444444444444444443', '444444444444444444', '444444444444444445'];
  senders.forEach((from, i) =>
    sql
      .prepare('INSERT INTO praises (day, from_id, to_id, jelly, created_at, note) VALUES (?, ?, ?, 1, ?, ?)')
      .run('2026-11-12', from, A, `2026-11-12T0${i}:00:00.000Z#x`, `한마디${i}`),
  );
  const session = await signSession('test', { uid: A, exp: Date.now() + 60_000 });
  const env = { DB: db, SESSION_SECRET: 'test' } as Env;
  const get = (path: string) => app.request(path, { headers: { Cookie: `hs=${session}` } }, env);

  const me = await (await get('/me')).text();
  expect(me.match(/class="pr-item/g)?.length).toBe(3);
  expect(me).toContain('href="/me/praise"');
  expect(me).not.toContain('숨기기');
  expect((await praiseBox(db, A)).unread).toBe(5);

  const full = await (await get('/me/praise')).text();
  expect(full.match(/class="pr-item/g)?.length).toBe(5);
  expect(full).not.toContain(senders[0]);
  expect((await praiseBox(db, A)).unread).toBe(0);
});

it('안 읽은 칭찬이 300개를 넘어도 읽음 처리할 칭찬을 빠짐없이 보여 줘요', async () => {
  const { db, sql } = fakeD1();
  sql.prepare("UPDATE members SET gender_chosen_at = 'chosen' WHERE user_id = ?").run(A);
  const add = sql.prepare('INSERT INTO praises (day, from_id, to_id, jelly, created_at, note) VALUES (?, ?, ?, 0, ?, ?)');
  // 같은 사람도 다른 날에는 다시 칭찬할 수 있어요. 오래 칭찬함을 열지 않은 상태예요.
  for (let i = 0; i < 301; i++) {
    const at = new Date(Date.now() - (i + 1) * 86_400_000).toISOString();
    add.run(at.slice(0, 10), B, A, `${at}#praise`, `칭찬번호${i}끝`);
  }
  expect((await praiseBox(db, A, 5)).items).toHaveLength(5); // 패널 미리보기는 그대로
  expect((await praiseBox(db, A)).unread).toBe(301);
  const session = await signSession('test', { uid: A, exp: Date.now() + 60_000 });
  const response = await app.request('/me/praise', { headers: { Cookie: `hs=${session}` } }, { DB: db, SESSION_SECRET: 'test' } as Env);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html.match(/class="pr-item/g)?.length).toBe(301);
  expect(html).toContain('칭찬번호300끝'); // 가장 오래된 것도 보여 준 뒤 읽음으로 바뀌어요.
  expect((await praiseBox(db, A)).unread).toBe(0);
});

it('칭찬 한마디 검사 중 자정을 넘어도 빙고·시즌 통계에서 칭찬이 빠지지 않아요', async () => {
  const { db, sql } = fakeD1();
  const before = Date.parse('2026-11-08T14:59:59.000Z'); // 한국 일요일 23:59:59
  const after = Date.parse('2026-11-08T15:00:01.000Z'); // 한국 월요일 00:00:01
  sql.prepare("INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES ('2026-11-09', '2026-11-08T15:00:00.000Z', '2026-11-22T15:00:00.000Z', 'x')").run();
  for (const id of [A, C]) sql.prepare("INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES ('2026-11-09', ?, 0, 1, 'x')").run(id);
  vi.useFakeTimers();
  try {
    vi.setSystemTime(before);
    const ai = { run: async () => { vi.setSystemTime(after); return { response: '{"verdict":"ok"}' }; } } as unknown as Ai;
    const env = { DB: db, BOT_SYNC_SECRET: 's', AI: ai } as unknown as Env;
    const res = await app.request('/api/bot/praise', {
      method: 'POST', headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: A, to: C, note: '오늘 고마워요' }),
    }, env);
    expect(await res.json()).toMatchObject({ result: 'done', note: 'sent' });
    // 하루 한도는 요청을 시작한 날짜, 빙고·시즌은 실제로 저장된 시각 기준이에요.
    expect(sql.prepare('SELECT day FROM praises').get()).toEqual({ day: '2026-11-08' });
    const old = await loadStats(db, fallbackWeek(before), [A, C]);
    const current = await loadStats(db, fallbackWeek(after), [A, C]);
    expect([old.get(A)!.praiseGiven, old.get(C)!.praiseGot]).toEqual([0, 0]);
    expect([current.get(A)!.praiseGiven, current.get(C)!.praiseGot]).toEqual([1, 1]);
    expect((await loadGroups(db, '2026-11-09'))!.groups[0]!.ctx.praises).toEqual([{ from: A, to: C, day: '2026-11-08', toNewbie: false }]);
  } finally { vi.useRealTimers(); }
});

it('칭찬함의 개수를 센 뒤 새 칭찬이 와도 기존 한마디를 못 본 채 읽음 처리하지 않아요', async () => {
  const { db, sql } = fakeD1();
  const opened = Date.parse('2026-11-16T03:00:00.000Z');
  sql.prepare("UPDATE members SET gender_chosen_at = 'chosen' WHERE user_id = ?").run(A);
  const add = sql.prepare('INSERT INTO praises (day, from_id, to_id, created_at, note) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < 20; i++) {
    const at = new Date(opened - (i + 1) * 86_400_000).toISOString();
    add.run(at.slice(0, 10), B, A, `${at}#old`, `기존칭찬${i}끝`);
  }
  const prepare = db.prepare.bind(db);
  let inserted = false;
  const inject = (s: D1PreparedStatement): D1PreparedStatement => ({
    ...s,
    bind: (...values: unknown[]) => inject(s.bind(...values)),
    all: async <T>() => {
      if (!inserted) {
        inserted = true;
        vi.setSystemTime(opened + 1000);
        add.run('2026-11-16', C, A, '2026-11-16T03:00:01.000Z#new', '방금온칭찬');
      }
      return s.all<T>();
    },
  }) as D1PreparedStatement;
  db.prepare = (query) => query.includes('SELECT rowid AS id') ? inject(prepare(query)) : prepare(query);
  vi.useFakeTimers();
  try {
    vi.setSystemTime(opened);
    const session = await signSession('test', { uid: A, exp: opened + 60_000 });
    const response = await app.request('/me/praise', { headers: { Cookie: `hs=${session}` } }, { DB: db, SESSION_SECRET: 'test' } as Env);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(inserted).toBe(true);
    for (let i = 0; i < 20; i++) expect(html).toContain(`기존칭찬${i}끝`);
    expect(html).toContain('방금온칭찬');
    expect((await praiseBox(db, A)).unread).toBe(1); // 페이지를 연 뒤 온 것은 다음에도 새 칭찬이에요.
  } finally { vi.useRealTimers(); }
});

describe('디스코드에서 처음 여자·남자 고르기', () => {
  const call = (env: Env, path: string, body?: unknown) =>
    app.request(path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, env);

  it('안 고른 사람은 카드에 gender_chosen=false, 고르면 그 묶음 캐릭터가 되고 두 번째는 already예요', async () => {
    const { db, sql } = fakeD1();
    const env = { DB: db, BOT_SYNC_SECRET: 's' } as unknown as Env;
    const before = (await (await call(env, `/api/bot/card/${A}`)).json()) as {
      gender_chosen: boolean;
      gender_options: Record<string, { character: string; character_url: string; same: boolean }>;
    };
    expect(before.gender_chosen).toBe(false);
    expect(before.gender_options.boy!.character).toMatch(/^boy-/);
    expect(before.gender_options.boy!.character_url).toContain(`/char/${before.gender_options.boy!.character}.png`);
    expect((await call(env, '/api/bot/gender', { user_id: A, pool: 'other' })).status).toBe(400);
    expect((await call(env, '/api/bot/gender', { user_id: A, pool: 'boy', character: 7 })).status).toBe(400);
    // 미리보기와 다른 캐릭터면 고르지 않아요
    expect(await (await call(env, '/api/bot/gender', { user_id: A, pool: 'boy', character: 'boy-50-3' })).json()).toEqual({ result: 'changed' });
    expect(await (await call(env, '/api/bot/gender', { user_id: A, pool: 'boy', character: before.gender_options.boy!.character })).json()).toEqual({ result: 'done' });
    const card = (await (await call(env, `/api/bot/card/${A}`)).json()) as { gender_chosen: boolean; character_url: string; gender_options?: unknown };
    expect(card.gender_chosen).toBe(true);
    expect(card.gender_options).toBeUndefined();
    expect(card.character_url).toContain(`/char/${before.gender_options.boy!.character}.png`);
    expect(await (await call(env, '/api/bot/gender', { user_id: A, pool: 'girl' })).json()).toEqual({ result: 'already' });
    expect((sql.prepare('SELECT character_id FROM profiles WHERE user_id = ?').get(A) as { character_id: string }).character_id).toMatch(/^boy-/);
    expect((await call(env, '/api/bot/gender', { user_id: '999999999999999999', pool: 'boy' })).status).toBe(404);
  });
});

it('목록 조회 직후 같은 밀리초에 받은 칭찬도 보지 않은 채 읽음 처리하지 않아요', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  try {
    const { db } = fakeD1();
    await givePraise(db, A, C, '2026-11-12', '먼저 받은 칭찬');
    const shown = await praiseBox(db, C, 20, true);
    await givePraise(db, B, C, '2026-11-12', '같은 밀리초의 새 칭찬');
    await markPraiseSeen(db, C, NOW, shown.items.map((item) => item.id));
    const after = await praiseBox(db, C, 20, true);
    expect(after.unread).toBe(1);
    expect(after.items.find((item) => item.note === '같은 밀리초의 새 칭찬')?.unread).toBe(true);
    expect(after.items.find((item) => item.note === '먼저 받은 칭찬')?.unread).toBe(false);
  } finally { vi.useRealTimers(); }
});


it('건별 읽음 표시 마이그레이션은 기존에 본 칭찬을 다시 새것으로 만들지 않아요', () => {
  const sql = new DatabaseSync(':memory:');
  const files = readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort();
  for (const file of files.filter((f) => f < '0048')) sql.exec(readFileSync(`migrations/${file}`, 'utf8'));
  sql.prepare("INSERT INTO members (user_id, display_name, updated_at) VALUES (?, 'a', 'x')").run(C);
  sql.prepare("INSERT INTO profiles (user_id, praise_seen_at, updated_at) VALUES (?, '2026-11-12T03:00:00.000Z', 'x')").run(C);
  const insert = sql.prepare('INSERT INTO praises (day, from_id, to_id, created_at) VALUES (?, ?, ?, ?)');
  insert.run('2026-11-11', A, C, '2026-11-11T03:00:00.000Z#seen');
  insert.run('2026-11-12', A, C, '2026-11-12T03:00:00.001Z#new');
  sql.exec(readFileSync('migrations/0048_praise_read.sql', 'utf8'));
  expect(sql.prepare('SELECT read_at FROM praises ORDER BY created_at').all()).toEqual([
    { read_at: '2026-11-12T03:00:00.000Z' }, { read_at: null },
  ]);
});

it('AI 검사 중 초기화되면 초기화 전 칭찬·젤리를 다시 지급하지 않아요', async () => {
  const { db, sql } = fakeD1();
  const ai = { run: async () => {
    sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
    return { response: '{"verdict":"ok"}' };
  } } as unknown as Ai;
  const response = await app.request('/api/bot/praise', {
    method: 'POST', headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: A, to: C, note: '초기화 전 칭찬' }),
  }, { DB: db, BOT_SYNC_SECRET: 's', AI: ai } as Env);
  expect(await response.json()).toMatchObject({ result: 'not_member', jelly: false, note: 'none' });
  expect(await praiseBox(db, C)).toMatchObject({ unread: 0, total: 0 });
  expect(sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(C)).toBeUndefined();
});
