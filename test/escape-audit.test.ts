import { describe, expect, it } from 'vitest';
import { BANK } from '../src/escape-bank';
import { checkUi } from '../src/escape-ui';

const puzzle = (id: string) => BANK.find((entry) => entry.idea === id)!;

describe('사건파일 수수께끼 회귀 검사', () => {
  it('성냥 2개를 빼면 큰 정사각형과 작은 정사각형 하나만 남는다', () => {
    // 0~3은 각 테두리의 두 변 묶음, 4~7은 안쪽 성냥.
    const squares = [[0, 3, 4, 7], [0, 1, 4, 5], [1, 2, 5, 6], [2, 3, 6, 7], [0, 1, 2, 3]];
    const remaining = (removed: number[]) => squares.filter((square) => square.every((side) => !removed.includes(side)));
    expect(remaining([])).toHaveLength(5);
    for (const side of [4, 5, 6, 7]) expect(remaining([side])).toHaveLength(3);
    // Removing an outer match destroys at most one small square and the large square.
    expect(remaining([6, 7])).toHaveLength(2);
    expect(new Set(remaining([6, 7]).flat()).size).toBe(6);
    expect(puzzle('tz106').a).toBe('2');
  });

  it('전구 문제에는 온도 차이로 풀 수 있다는 조건이 있다', () => {
    expect(puzzle('tz039').q).toContain('켜 두면 뜨거워지는 백열전구');
  });

  it('사진이 아들이라는 결론을 내려면 사진 속 인물이 소년이어야 한다', () => {
    expect(puzzle('tz081').q).toContain('사진 속 소년');
  });

  it('금화 자루에서 서로 다른 개수를 꺼낼 수 있다', () => {
    expect(puzzle('tz119').q).toContain('최소 10개씩');
  });

  it('얼음 동굴 출구를 통과한 뒤 이어지는 행동은 정답이 아니다', () => {
    const { ui, a } = puzzle('slide-iceexit');
    expect(checkUi(ui!, a!)).toBe(true);
    expect(checkUi(ui!, a + '.PR')).toBe(false);
  });
});
