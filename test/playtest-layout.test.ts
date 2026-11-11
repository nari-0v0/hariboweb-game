import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { escCase, startEscape } from '../src/escape';
import { EscapePage } from '../src/views/escape';
import { Layout } from '../src/views/layout';
import type { EscRun } from '../src/escape-db';
import { ROOMS } from '../src/case-rooms';

const viewer = { user_id: '900000000000000001', display_name: '검사', avatar_url: null, joined_at: null, active: 1, is_newbie: 0 };

describe('플레이테스트에서 재현된 화면 회귀', () => {
  it('조사 대사가 있는 모든 방 버튼을 유지하고 인물을 별도 줄에 둔다', async () => {
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
    expect(html.indexOf('aria-label="모모"')).toBeGreaterThan(html.indexOf('class="esc-actors"'));
    expect(html).toContain('aria-label="대화와 발견한 물건"');
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
