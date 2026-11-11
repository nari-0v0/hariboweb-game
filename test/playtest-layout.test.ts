import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ESCAPE_CASES, escCase, startEscape } from '../src/escape';
import { EscapePage } from '../src/views/escape';
import { Layout } from '../src/views/layout';
import type { EscRun } from '../src/escape-db';
import { ROOMS, personBox } from '../src/case-rooms';

const viewer = { user_id: '900000000000000001', display_name: '검사', avatar_url: null, joined_at: null, active: 1, is_newbie: 0 };

describe('플레이테스트에서 재현된 화면 회귀', () => {
  it('조사 대사가 있는 모든 방 버튼을 유지하고 인물은 방 그림 안에 둔다', async () => {
    const def = escCase('trophy-talk')!;
    const state = startEscape(def);
    const run: EscRun = { def, state, row: { id: 'test', user_id: viewer.user_id, case_id: def.id, state: JSON.stringify(state), rev: 0, status: 'going', grade: null, xp: 0, jelly: 0 } };
    const html = String(await EscapePage({ viewer, art: '/char/deco/explorer.png', run, result: null, best: new Map() }).toString());
    const idle = [...html.matchAll(/<button[^>]*class="esc-hot idle"[^>]*>/g)].map(m => m[0]);
    const room = ROOMS[def.scenes[0]!.bg!];
    const placed = def.objects.filter(o => o.scene === state.scene && o.at);
    expect(idle).toHaveLength(room.spots.length - placed.length);
    for (const button of idle) {
      expect(button).toContain('data-say=');
      expect(button).not.toContain('disabled');
      expect(button).not.toContain('aria-hidden');
    }
    expect(html).not.toContain('esc-actors'); // 처음엔 모두 방 안
    expect(html.indexOf('aria-label="모모"')).toBeGreaterThan(html.indexOf('class="esc-bg"'));
    expect(html.indexOf('aria-label="모모"')).toBeLessThan(html.indexOf('class="esc-bag"'));
  });

  it('문제를 푼 사람은 방 아래 카드 줄로 내려가요', async () => {
    const def = escCase('trophy-talk')!;
    const momo = def.objects.find((o) => o.face && o.lock && o.scene === def.scenes[0]!.id)!;
    const state = { ...startEscape(def), opened: [momo.id], seen: [momo.id] };
    const run: EscRun = { def, state, row: { id: 'test', user_id: viewer.user_id, case_id: def.id, state: JSON.stringify(state), rev: 0, status: 'going', grade: null, xp: 0, jelly: 0 } };
    const html = String(await EscapePage({ viewer, art: '/char/deco/explorer.png', run, result: null, best: new Map() }).toString());
    expect(html.indexOf(`aria-label="${momo.name}"`)).toBeGreaterThan(html.indexOf('class="esc-actors"'));
    expect(html.indexOf('class="esc-actors"')).toBeGreaterThan(0);
  });

  it('인물 자리는 방마다 눌리는 곳을 거의 다 가리지 않는 곳이에요', () => {
    // 방마다 실제로 한꺼번에 서는 사람 수만큼만 봐요.
    const need: Record<string, number> = {};
    for (const c of ESCAPE_CASES) for (const sc of c.scenes) need[sc.bg!] = Math.max(need[sc.bg!] ?? 0, c.objects.filter((o) => o.scene === sc.id && !o.at && !(o.goto && !o.face)).length);
    for (const room of Object.values(ROOMS)) {
      expect(room.people.length, room.key).toBeGreaterThanOrEqual(2);
      for (const [x, y] of room.people.slice(0, need[room.key] ?? 0)) {
        expect(y + 12, `${room.key} 발끝`).toBeLessThanOrEqual(97);
        const b = personBox(x, y);
        for (const h of room.spots) {
          const hit = [0.15, 0.5, 0.85].flatMap((a) => [0.15, 0.5, 0.85].map((c) => [h.x - h.w / 2 + h.w * a, h.y - h.h / 2 + h.h * c] as const)).filter(([px, py]) => px > b.l && px < b.r && py > b.t && py < b.b);
          expect(hit.length, `${room.key}/${h.id}`).toBeLessThan(7);
        }
      }
    }
  });

  it('매표 창구 안의 작은 종이 창구 뒤에 가려지지 않게 나중에 그린다', async () => {
    const def = escCase('c29')!;
    const state = startEscape(def);
    const run: EscRun = { def, state, row: { id: 'test', user_id: viewer.user_id, case_id: def.id, state: JSON.stringify(state), rev: 0, status: 'going', grade: null, xp: 0, jelly: 0 } };
    const html = String(await EscapePage({ viewer, art: '/char/deco/explorer.png', run, result: null, best: new Map() }).toString());
    const booth = html.indexOf('aria-label="매표 창구"');
    const bell = html.indexOf('aria-label="탁상 종"');
    expect(booth).toBeGreaterThan(0);
    expect(bell).toBeGreaterThan(booth);
    // 두 지점 모두 서버 행동 폼으로 남아야 해요.
    expect(html).toContain('name="o" value="tr1"');
    expect(html).toContain('name="o" value="box3"');
  });

  it('브라우저가 없는 favicon.ico를 요청하지 않도록 기존 PNG를 지정한다', async () => {
    const html = String(await Layout({ title: '검사', children: '검사' }).toString());
    const icon = html.match(/<link rel="icon"[^>]*href="([^"]+)"/);
    expect(icon).not.toBeNull();
    expect(readFileSync(`public${icon![1]}`, 'utf8').slice(1, 4)).toBe('PNG');
  });
});
