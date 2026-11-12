// 칭찬 한마디: 검사, 칭찬함(보낸 사람 숨김·안 읽은 개수·숨기기), 봇 API, 떠난 멤버 정리
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { givePraise } from '../src/db';
import { checkNote, cleanNote, hasBadWord, hidePraiseNote, markPraiseSeen, parseNoteVerdict, praiseBox } from '../src/praise-note';
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

  it('욕설 단어는 띄어쓰기·문장부호를 넣어도 찾아요', () => {
    expect(hasBadWord('ㅅ ㅂ 진짜 잘하네')).toBe(true);
    expect(hasBadWord('존.나 웃겼어')).toBe(true);
    expect(hasBadWord('오늘 같이 해서 즐거웠어요!')).toBe(false);
  });

  it('AI가 비꼬기라고 하면 한마디는 빼요. AI가 없거나 실패하면 단어 검사만 해요', async () => {
    expect(parseNoteVerdict('{"verdict":"bad"}')).toBe('bad');
    expect(parseNoteVerdict('모르겠어요')).toBeNull();
    expect(await checkNote(fakeAi('{"verdict":"ok"}'), '덕분에 이겼어요')).toEqual({ note: '덕분에 이겼어요', filtered: false });
    expect(await checkNote(fakeAi('{"verdict":"bad"}'), '와 진짜 대단하시네요^^ 혼자 다 죽던데')).toEqual({ note: null, filtered: true });
    expect(await checkNote(fakeAi(new Error('limit')), '덕분에 이겼어요')).toEqual({ note: '덕분에 이겼어요', filtered: false });
    expect(await checkNote(undefined, '병신')).toEqual({ note: null, filtered: true });
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
    await markPraiseSeen(db, C, Date.now() + 1000);
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
    // 패널에서 한 번 봤으니 다음에는 0개예요
    const again = (await (await call(env, `/api/bot/card/${C}`)).json()) as { praise_box: { unread: number } };
    expect(again.praise_box.unread).toBe(0);
  });
});
