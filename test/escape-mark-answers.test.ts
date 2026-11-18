import { expect, it } from 'vitest';
import { BANK } from '../src/escape-bank';
import { checkUi, uiForClient, type Ui } from '../src/escape-ui';
import { ESCAPE_CASES, actEscape, escGrade, escJelly, startEscape } from '../src/escape';

type Mark = Extract<Ui, { t: 'mark' }>;
const puzzle = (id: string) => BANK.find((p) => p.idea === id)!;
const bits = (n: number, size: number) => Array.from({ length: size }, (_, i) => (n >> i) & 1);

// 화면에 주어진 줄 수·배 크기·알려 준 한 칸·접촉 금지 조건으로 답을 직접 찾아요.
function ships(u: Mark): string[] {
  const rows = u.rowClues!.map((clue) => Array.from({ length: 1 << u.w }, (_, n) => bits(n, u.w)).filter((r) => r.reduce((a, b) => a + b, 0) === Number(clue)));
  const found: string[] = [];
  const visit = (grid: number[]) => {
    const r = grid.length / u.w;
    if (r < u.h) {
      for (const row of rows[r]!) {
        const next = [...grid, ...row];
        if (row.some((_, c) => Array.from({ length: r + 1 }, (_, y) => next[y * u.w + c]!).reduce((a, b) => a + b, 0) > Number(u.colClues![c]))) continue;
        if (r && row.some((x, c) => x && ((c > 0 && grid[(r - 1) * u.w + c - 1]) || (c + 1 < u.w && grid[(r - 1) * u.w + c + 1])))) continue;
        visit(next);
      }
      return;
    }
    if (u.colClues!.some((clue, c) => Array.from({ length: u.h }, (_, y) => grid[y * u.w + c]!).reduce((a, b) => a + b, 0) !== Number(clue))) return;
    if (u.text!.some((text, i) => text === '🚢' && !grid[i])) return;
    const todo = new Set(grid.flatMap((x, i) => x ? [i] : []));
    const sizes: number[] = [];
    while (todo.size) {
      const first = todo.values().next().value!;
      todo.delete(first);
      const group = [first];
      for (let i = 0; i < group.length; i++) for (const other of [...todo]) {
        const a = group[i]!;
        if (Math.abs(a % u.w - other % u.w) + Math.abs(Math.floor(a / u.w) - Math.floor(other / u.w)) === 1) { todo.delete(other); group.push(other); }
      }
      if (new Set(group.map((i) => i % u.w)).size !== 1 && new Set(group.map((i) => Math.floor(i / u.w))).size !== 1) return;
      sizes.push(group.length);
    }
    if (sizes.sort().join() === '1,1,2,2,3') found.push(grid.join(''));
  };
  visit([]);
  return found.sort();
}

function hitori(u: Mark): string[] {
  const rows = Array.from({ length: u.h }, (_, r) => Array.from({ length: 1 << u.w }, (_, n) => bits(n, u.w)).filter((row) => {
    if (row.some((x, c) => x && row[c + 1])) return false;
    const white = row.flatMap((x, c) => x ? [] : [u.text![r * u.w + c]]);
    return new Set(white).size === white.length;
  }));
  const found: string[] = [];
  const visit = (grid: number[]) => {
    const r = grid.length / u.w;
    if (r < u.h) {
      for (const row of rows[r]!) {
        if (r && row.some((x, c) => x && grid[(r - 1) * u.w + c])) continue;
        const next = [...grid, ...row];
        if (row.some((_, c) => {
          const white = Array.from({ length: r + 1 }, (_, y) => y * u.w + c).filter((i) => !next[i]).map((i) => u.text![i]);
          return new Set(white).size !== white.length;
        })) continue;
        visit(next);
      }
      return;
    }
    const white = new Set(grid.flatMap((x, i) => x ? [] : [i]));
    if (!white.size) return;
    const seen = new Set([white.values().next().value!]);
    const queue = [...seen];
    for (let i = 0; i < queue.length; i++) for (const other of white) {
      const a = queue[i]!;
      if (!seen.has(other) && Math.abs(a % u.w - other % u.w) + Math.abs(Math.floor(a / u.w) - Math.floor(other / u.w)) === 1) { seen.add(other); queue.push(other); }
    }
    if (seen.size === white.size) found.push(grid.join(''));
  };
  visit([]);
  return found.sort();
}

it.each([['mark-ships', ships, 7], ['mark-hitori', hitori, 3]] as const)('%s는 공개된 규칙을 만족하는 모든 답을 받아요', (id, solve, count) => {
  const u = puzzle(id).ui as Mark;
  const solutions = solve(u);
  expect(solutions).toHaveLength(count);
  for (const answer of solutions) expect(checkUi(u, answer), answer).toBe(true);
  expect(checkUi(u, '0'.repeat(u.w * u.h))).toBe(false);
  expect(uiForClient(u)).not.toHaveProperty('answer');
  expect(uiForClient(u)).not.toHaveProperty('answers');
});

it.each(['mark-ships', 'mark-hitori'])('%s의 다른 정답도 실수나 등급 감점 없이 잠금을 열어요', (id) => {
  const entry = puzzle(id);
  const ref = BANK.indexOf(entry) + 1;
  const def = ESCAPE_CASES.find((c) => c.objects.some((o) => o.ref === ref))!;
  const lock = def.objects.find((o) => o.ref === ref)!;
  const solve = id === 'mark-ships' ? ships : hitori;
  const answer = solve(entry.ui as Mark).find((v) => v !== entry.a)!;
  let state = startEscape(def);
  let solved = false;
  for (const action of def.solution!) {
    if (action.a === 'code' && action.o === lock.id) {
      // 이미 세 번 틀린 사람이 정답을 제출하면 A를 유지해야 해요. 네 번째 오답이면 B라 젤리를 잃어요.
      state.mistakes = 3;
      const next = actEscape(def, state, { ...action, v: answer })!;
      expect(next.mistakes).toBe(state.mistakes);
      expect(next.opened).toContain(lock.id);
      state = next;
      solved = true;
      continue;
    }
    state = actEscape(def, state, action)!;
  }
  expect(solved).toBe(true);
  expect(state.done).toBe(true);
  expect(escGrade(state)).toBe('A');
  expect(escJelly(escGrade(state))).toBe(1);
});
