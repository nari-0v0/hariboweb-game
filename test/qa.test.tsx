import { describe, expect, it } from 'vitest';
import { QA, QA_TABS, qaTab } from '../src/qa';
import { QaPage } from '../src/views/qa';

describe('자주 묻는 질문(Q&A)', () => {
  it('칸은 전체·도감·빙고·원정대·겜블장·사건파일·기타이고, 칸마다 질문이 있어요', () => {
    expect(QA_TABS.map((t) => t.label)).toEqual(['전체', '도감', '빙고', '원정대', '겜블장', '사건파일', '기타']);
    for (const t of QA_TABS) if (t.id !== 'all') expect(QA.some((x) => x.cat === t.id)).toBe(true);
    for (const x of QA) {
      expect(x.q.trim().length).toBeGreaterThan(0);
      expect(x.a.length).toBeGreaterThan(0);
    }
    expect(new Set(QA.map((x) => x.q)).size).toBe(QA.length);
  });
  it('모르는 칸 이름은 전체로 보여요', () => {
    expect(qaTab(undefined)).toBe('all');
    expect(qaTab('nope')).toBe('all');
    expect(qaTab('journey')).toBe('journey');
  });
  it('전체는 모든 질문, 칸을 고르면 그 칸 질문만 보여요', () => {
    const all = String(<QaPage viewer={null} tab="all" />);
    for (const x of QA) expect(all).toContain(x.q.slice(0, 8));
    const gamble = String(<QaPage viewer={null} tab="gamble" />);
    for (const x of QA) {
      if (x.cat === 'gamble') expect(gamble).toContain(x.q.slice(0, 8));
      else expect(gamble).not.toContain(`<span class="qa-q">${x.q}`);
    }
  });
});
