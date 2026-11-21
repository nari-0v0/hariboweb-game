import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeJourney, beginJourney } from '../src/journey-db';
import { activeEscape, beginEscape } from '../src/escape-db';
import { ESCAPE_CASES } from '../src/escape';
import { isEmptyReason } from '../src/assign-block';
import { signSession, verifySession } from '../src/crypto';

// 점검 보고서(#165) W101~W200 중 고친 것(나리 2026-11-21)
function database() {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(process.cwd(), 'migrations')).filter((f) => f.endsWith('.sql')).sort()) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
  const statement = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => statement(query, a),
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  });
  const db = {
    prepare: (q: string) => statement(q),
    batch: async (list: ReturnType<typeof statement>[]) => {
      sql.exec('BEGIN');
      try {
        const out = list.map((s) => ({ results: [], meta: { changes: Number(sql.prepare(s.query).run(...s.args).changes) } }));
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES ('me', 'me', 1, 'x')").run();
  return { sql, db };
}

describe('깨진 진행 판에서 빠져나오기 (W196·W197)', () => {
  it('원정대: 읽을 수 없는 진행 판은 그만둔 걸로 하고 새 판을 시작해요', async () => {
    const { sql, db } = database();
    sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter) VALUES ('bad', 'me', 'not json', 'x', 'x', 1)").run();
    expect(await activeJourney(db, 'me')).toBeNull();
    const id = await beginJourney(db, 'me', 1);
    expect(id).not.toBe('bad');
    expect((await activeJourney(db, 'me'))?.row.id).toBe(id);
    expect(sql.prepare("SELECT status FROM journey_runs WHERE id = 'bad'").get()).toEqual({ status: 'quit' });
  });
  it('원정대: 읽을 수 있는 진행 판은 그대로 이어가요', async () => {
    const { db } = database();
    const first = await beginJourney(db, 'me', 1);
    expect(await beginJourney(db, 'me', 1)).toBe(first);
  });
  it('사건파일: 없어진 사건의 진행 판은 그만둔 걸로 하고 새 사건을 시작해요', async () => {
    const { sql, db } = database();
    sql.prepare("INSERT INTO escape_runs (id, user_id, case_id, state, started_at, updated_at) VALUES ('bad', 'me', 'no-such-case', '{}', 'x', 'x')").run();
    expect(await activeEscape(db, 'me')).toBeNull();
    const id = await beginEscape(db, 'me', ESCAPE_CASES[0]!.id);
    expect(id).toBeTruthy();
    expect(id).not.toBe('bad');
    expect(sql.prepare("SELECT status FROM escape_runs WHERE id = 'bad'").get()).toEqual({ status: 'quit' });
  });
});

describe('작은 검사들', () => {
  it('배정 제외 사유: 이모지 두 개만 있으면 내용 없음으로 봐요 (W140)', () => {
    expect(isEmptyReason('😡😡')).toBe(true);
    expect(isEmptyReason('게임 중에 계속 욕을 해서요')).toBe(false);
  });
  it('세션 토큰: 조각이 더 붙어 있으면 받지 않아요 (W192)', async () => {
    const t = await signSession('secret-key-for-test', { uid: 'me', exp: Date.now() + 60_000 });
    expect(await verifySession('secret-key-for-test', t)).not.toBeNull();
    expect(await verifySession('secret-key-for-test', `${t}.extra`)).toBeNull();
  });
});

describe('디스코드 로그인: 연결 실패와 서버 미가입을 구분해요(Codex #304)', () => {
  const env = { GUILD_ID: '1' } as unknown as import('../src/env').Env;
  const withFetch = async (impl: () => Promise<Response>, run: () => Promise<void>) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  };
  it('404는 미가입, 끊김·500은 다시 시도(null)', async () => {
    const { fetchGuildProfile } = await import('../src/discord');
    await withFetch(async () => new Response('{}', { status: 404 }), async () => {
      expect(await fetchGuildProfile(env, 't')).toBe('not_member');
    });
    await withFetch(async () => new Response('{}', { status: 500 }), async () => {
      expect(await fetchGuildProfile(env, 't')).toBeNull();
    });
    await withFetch(async () => { throw new Error('timeout'); }, async () => {
      expect(await fetchGuildProfile(env, 't')).toBeNull();
    });
  });
});
