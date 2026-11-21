import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { poolOf, rerollCharacter } from '../src/character';

// 2026-11-21 점검: 원래 그림(-0)을 쓰는 사람은 리롤권으로 색만 바뀐 여분이 되지 않아요.
describe('캐릭터 리롤권', () => {
  const boys = CHARACTERS.filter((c) => poolOf(`${c.id}-0`) === 'boy').map((c) => `${c.id}-0`);
  it('원래 그림이 다 찼으면 원래 그림 쓰는 사람은 바꾸지 않아요', () => {
    expect(rerollCharacter('boy', boys[0]!, new Set(boys), new Set())).toBeNull();
  });
  it('여분 색을 쓰던 사람은 여분으로도 바꿀 수 있어요', () => {
    const current = boys[0]!.replace(/-0$/, '-1');
    expect(rerollCharacter('boy', current, new Set(boys), new Set(), () => 0)).toMatch(/-[1-9]\d*$/);
  });
  it('빈 원래 그림이 있으면 그걸로 바꿔요', () => {
    const taken = new Set(boys.slice(2));
    expect(rerollCharacter('boy', boys[0]!, taken, new Set(), () => 0)).toBe(boys[1]);
  });
});
