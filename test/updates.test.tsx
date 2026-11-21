import { describe, expect, it } from 'vitest';
import { UPDATES, updatesMark } from '../src/updates';
import { UpdatesPage } from '../src/views/updates';

describe('업데이트 현황', () => {
  it('줄마다 날짜(YYYY-MM-DD)와 한 줄 글이 있고, 최근 것이 위예요', () => {
    expect(UPDATES.length).toBeGreaterThan(0);
    for (const u of UPDATES) {
      expect(u.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(u.text.trim().length).toBeGreaterThan(0);
      expect(u.text).not.toContain('\n');
    }
    const days = UPDATES.map((u) => u.day);
    expect([...days].sort().reverse()).toEqual(days);
  });
  it('화면에 줄이 보이고, 본 것으로 기억할 값이 메뉴 버튼 값과 같아요', () => {
    const html = String(<UpdatesPage viewer={null} />);
    expect(html).toContain('업데이트 현황');
    expect(html).toContain(`data-upd-seen="${updatesMark()}"`);
    for (const u of UPDATES) expect(html).toContain(u.text.slice(0, 10));
  });
});
