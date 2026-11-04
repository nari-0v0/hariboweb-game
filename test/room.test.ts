import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLS, DEFAULT_LAYOUT, FURNITURE, ME, ROWS, checkLayout, furnId, parseLayout, roomItem } from '../src/room';
import { buyRoomItem, getRoom, likeRoom, listRooms, saveRoom } from '../src/room-db';
import { applySync, parseSync } from '../src/sync';

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
        const out = list.map((s) =>
          /^\s*SELECT/i.test(s.query)
            ? { results: sql.prepare(s.query).all(...(s.args as never[])) }
            : { results: [], meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) } },
        );
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db: db as unknown as D1Database };
}


const none = new Set<string>();

describe('방 배치 확인', () => {
  it('기본 방은 올바른 배치예요', () => {
    expect(checkLayout(DEFAULT_LAYOUT, none)).toEqual(DEFAULT_LAYOUT);
  });

  it('안 가진 가구, 같은 가구 두 번, 방 밖, 겹치기, 벽/바닥 자리 틀림은 저장하지 않아요', () => {
    expect(checkLayout([{ k: 'sofa', x: 0, y: 3 }], none)).toBeNull();
    expect(checkLayout([{ k: 'sofa', x: 0, y: 3 }], new Set(['furn:sofa']))).toHaveLength(2); // 주인 캐릭터는 자동으로 들어가요
    expect(checkLayout([{ k: 'chair', x: 0, y: 3 }, { k: 'chair', x: 1, y: 3 }], none)).toBeNull();
    expect(checkLayout([{ k: 'chair', x: 10, y: 3 }], none)).toBeNull();
    expect(checkLayout([{ k: 'sofa', x: 9, y: 3 }], new Set(['furn:sofa']))).toBeNull(); // 2칸이라 오른쪽 끝에 안 들어가요
    expect(checkLayout([{ k: 'chair', x: 2, y: 3 }, { k: 'plant', x: 2, y: 3 }], none)).toBeNull();
    expect(checkLayout([{ k: 'chair', x: 2, y: 0 }], none)).toBeNull(); // 가구는 벽에 못 놓아요
    expect(checkLayout([{ k: 'window', x: 2, y: 4 }], none)).toBeNull(); // 벽 장식은 바닥에 못 놓아요
    expect(checkLayout([{ k: 'tree', x: 2, y: 6 }], new Set(['furn:tree']))).toBeNull(); // 세로 2칸
    expect(checkLayout([{ k: 'chair', x: 1.5, y: 3 }], none)).toBeNull();
    expect(checkLayout('nope', none)).toBeNull();
  });

  it('가구를 전부 놓아도 저장되고 다시 읽어도 그대로예요', () => {
    const owned = new Set(FURNITURE.map((x) => furnId(x.key)));
    let layout: { k: string; x: number; y: number }[] = [];
    for (const k of [...FURNITURE.map((x) => x.key), ME]) {
      let done = false;
      for (let y = 0; y < ROWS && !done; y++)
        for (let x = 0; x < COLS && !done; x++) {
          const next = [...layout, { k, x, y }];
          if (checkLayout(next, owned)) (layout = next), (done = true);
        }
      expect(done).toBe(true);
    }
    expect(checkLayout(layout, owned)).toHaveLength(FURNITURE.length + 1);
    expect(parseLayout(JSON.stringify(layout), owned)).toEqual(layout);
    // 주인 캐릭터 없이 보내도 자동으로 넣고, 다시 읽어도 기본 방으로 안 돌아가요
    const noMe = layout.filter((p) => p.k !== ME);
    const saved = checkLayout(noMe, owned);
    expect(saved).toHaveLength(FURNITURE.length + 1);
    expect(parseLayout(JSON.stringify(saved), owned)).toEqual(saved);
  });

  it('저장된 방을 읽을 때는 잘못된 물건만 빼요', () => {
    const json = JSON.stringify([{ k: 'sofa', x: 0, y: 3 }, { k: 'chair', x: 5, y: 5 }, { k: ME, x: 1, y: 6 }]);
    expect(parseLayout(json, none)).toEqual([{ k: 'chair', x: 5, y: 5 }, { k: ME, x: 1, y: 6 }]);
    expect(parseLayout('{bad', none)).toEqual(DEFAULT_LAYOUT);
  });

  it('가구는 모두 방에 들어가는 크기이고 이름이 겹치지 않아요', () => {
    expect(new Set(FURNITURE.map((x) => x.key)).size).toBe(FURNITURE.length);
    for (const x of FURNITURE) expect(checkLayout([{ k: x.key, x: 0, y: x.zone === 'wall' ? 0 : 2 }], new Set([`furn:${x.key}`]))).not.toBeNull();
    expect(roomItem('furn:chair')).toBeNull(); // 처음부터 가진 건 안 팔아요
    expect(roomItem('furn:sofa')).toMatchObject({ price: 15 });
    expect(roomItem('wall:mint')).toMatchObject({ price: 10 });
    expect(roomItem('theme:rose')).toBeNull();
  });
});

describe('방 저장·사기·좋아요', () => {
  function setup() {
    const { sql, db } = fakeD1();
    const t = '2026-11-04T00:00:00Z';
    for (const id of ['me', 'f1', 'gone'])
      sql.prepare('INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, ?)').run(id, id, id === 'gone' ? 0 : 1, t);
    sql.prepare('INSERT INTO profiles (user_id, dogam_jelly, updated_at) VALUES (?, ?, ?)').run('me', 30, t);
    return { sql, db };
  }

  it('젤리로 가구를 사서 놓고 저장해요', async () => {
    const { sql, db } = setup();
    expect((await getRoom(db, 'me'))!.layout).toEqual(DEFAULT_LAYOUT);
    expect(await buyRoomItem(db, 'me', 'furn:sofa')).toBe('done');
    expect(await buyRoomItem(db, 'me', 'furn:sofa')).toBe('owned');
    expect(await buyRoomItem(db, 'me', 'furn:piano')).toBe('not_enough_jelly'); // 15 남음, 피아노 18
    expect(await buyRoomItem(db, 'me', 'furn:chair')).toBe('not_for_sale');
    expect(await buyRoomItem(db, 'me', 'wall:mint')).toBe('done');
    expect((sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get('me') as { dogam_jelly: number }).dogam_jelly).toBe(5);
    // 결과는 방 화면에서 보여 줘서 상점 결과 팝업에는 안 떠요
    expect(sql.prepare("SELECT COUNT(*) AS n FROM purchases WHERE user_id = 'me' AND seen_at IS NULL").get()).toEqual({ n: 0 });
    const layout = [{ k: 'sofa', x: 3, y: 5 }, { k: ME, x: 0, y: 6 }];
    expect(await saveRoom(db, 'me', 'mint', 'wood', JSON.stringify(layout))).toBe('saved');
    const room = (await getRoom(db, 'me'))!;
    expect(room.layout).toEqual(layout);
    expect(room.wall).toBe('mint');
    expect(await saveRoom(db, 'me', 'lemon', 'wood', JSON.stringify(layout))).toBe('bad'); // 안 산 벽지
    expect(await saveRoom(db, 'me', 'mint', 'wood', JSON.stringify([{ k: 'piano', x: 0, y: 3 }]))).toBe('bad');
    expect(await saveRoom(db, 'me', 'mint', 'wood', 'x'.repeat(5000))).toBe('bad');
    expect(await saveRoom(db, 'gone', 'sky', 'wood', '[]')).toBe('bad');
  });

  it('좋아요는 남의 방에 하루 한 번, 떠난 멤버 방은 없어요', async () => {
    const { db } = setup();
    const day1 = new Date('2026-11-04T03:00:00Z');
    expect(await likeRoom(db, 'f1', 'me', day1)).toBe('liked');
    expect(await likeRoom(db, 'f1', 'me', day1)).toBe('already');
    expect(await likeRoom(db, 'f1', 'me', new Date('2026-11-05T03:00:00Z'))).toBe('liked');
    expect(await likeRoom(db, 'me', 'me', day1)).toBe('bad');
    expect(await likeRoom(db, 'me', 'gone', day1)).toBe('bad');
    expect((await getRoom(db, 'me'))!.likes).toBe(2);
    expect(await getRoom(db, 'gone')).toBeNull();
    await saveRoom(db, 'me', 'sky', 'wood', JSON.stringify(DEFAULT_LAYOUT));
    expect((await listRooms(db, 'likes')).map((r) => [r.userId, r.likes])).toEqual([['me', 2]]);
  });

  it('서버를 떠나면 방과 좋아요 기록을 지워요', async () => {
    const { sql, db } = fakeD1();
    const A = '100000000000000001';
    const B = '100000000000000002';
    const t = '2026-11-04T00:00:00Z';
    for (const id of [A, B]) sql.prepare('INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, ?)').run(id, id, t);
    await saveRoom(db, A, 'sky', 'wood', JSON.stringify(DEFAULT_LAYOUT));
    await likeRoom(db, B, A);
    await likeRoom(db, A, B);
    const now = Date.parse('2026-11-04T03:00:00Z');
    const parsed = parseSync({
      batch_id: `${new Date(now).toISOString()}-room`,
      removed: [A],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, now)).toBe('applied');
    expect(sql.prepare('SELECT COUNT(*) AS n FROM rooms').get()).toEqual({ n: 0 });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM room_likes').get()).toEqual({ n: 0 });
  });
});
