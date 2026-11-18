import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { xpForLevel } from '../src/levels';
import app from '../src/index';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const PATH = '/api/internal/game-progress';
const HEADERS = { Authorization: 'Bearer stats-test-token' };

it('rejects missing and wrong credentials, even if a bot token is supplied', async () => {
  const prepare = vi.fn();
  const env = { GAME_PROGRESS_TOKEN: 'stats-test-token', BOT_SYNC_SECRET: 'bot-test-token', DB: { prepare } } as unknown as Env;
  const responses = await Promise.all([
    app.request(PATH, {}, env),
    app.request(PATH, { headers: { Authorization: 'Bearer bot-test-token' } }, env),
    app.request(PATH, { headers: HEADERS }, { ...env, GAME_PROGRESS_TOKEN: undefined }),
  ]);
  for (const response of responses) {
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  expect(prepare).not.toHaveBeenCalled();
});

it('aggregates active members, exact level boundaries and game progress without returning identities', async () => {
  const sql = new DatabaseSync(':memory:');
  for (const migration of readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(`migrations/${migration}`, 'utf8'));
  }
  const now = new Date().toISOString();
  const member = sql.prepare('INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, ?)');
  const card = sql.prepare('INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, ?, ?, ?)');
  member.run('player-a', 'Private Player', 1, now);
  member.run('departed', 'Departed Player', 0, now);
  for (let i = 0; i < 60; i++) {
    const id = `member-${i}`;
    member.run(id, id, 1, now);
    card.run('player-a', id, i < 5 ? xpForLevel(25) : xpForLevel(25) - 1, now, now);
  }
  card.run('player-a', 'departed', xpForLevel(25), now, now);
  card.run('player-a', 'player-a', xpForLevel(25), now, now);
  sql.prepare("INSERT INTO journey_runs (id, user_id, chapter, state, status, cleared, started_at, updated_at) VALUES (?, ?, 9, '{}', 'done', 1, ?, ?)")
    .run('journey', 'player-a', now, now);
  sql.prepare("INSERT INTO escape_runs (id, user_id, case_id, state, status, started_at, updated_at) VALUES (?, ?, ?, '{}', 'done', ?, ?)")
    .run('escape', 'player-a', 'jellyjar', now, now);
  sql.prepare('INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at) VALUES (?, ?, ?, ?)')
    .run('player-a', 'jellyjar', 'escape', now);
  const db = {
    prepare: (query: string) => ({
      bind: (caseIds: string) => ({ all: async () => ({ results: sql.prepare(query).all(caseIds) }) }),
    }),
  };
  const env = { DB: db, GAME_PROGRESS_TOKEN: 'stats-test-token' } as unknown as Env;

  const response = await app.request(PATH, { headers: HEADERS }, env);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.text();
  expect(body).not.toMatch(/player-a|Private Player|departed|member-0/i);
  expect(JSON.parse(body)).toMatchObject({
    activeMembers: 61,
    dogam: {
      plannedRequirements: [
        { members: 1, journeyFinishers: 1, escapeFinishers: 0 },
        { members: 0, journeyFinishers: 0, escapeFinishers: 0 },
      ],
    },
    journey: { started: 1, chapters: expect.arrayContaining([{ chapter: 9, cleared: 1, need: { cards: 55, lv: 20, lvCards: 5 }, members: 1, journeyFinishers: 1, escapeFinishers: 0 }]) },
    escape: { started: 1, solvedMilestones: expect.arrayContaining([{ solved: 1, members: 1 }, { solved: 5, members: 0 }]) },
  });
});
