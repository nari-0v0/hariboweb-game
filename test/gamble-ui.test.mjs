import { describe, expect, it, vi } from 'vitest';
import { guardCardActions, nextBet } from '../public/gamble.js';

describe('겜블장 칩 버튼', () => {
  it('누른 버튼만큼 지금 걸 칩에 더한다', () => {
    expect([1, 1, 1].reduce((bet, step) => nextBet(bet, 1000, step), 0)).toBe(3);
    expect(nextBet(3, 1000, 100)).toBe(103);
  });

  it('가진 칩보다 많이 걸지 않는다', () => {
    expect(nextBet(95, 100, 10)).toBe(100);
    expect(nextBet(100, 100, 10000)).toBe(100);
    expect(nextBet(0, 0, 1)).toBe(0);
    expect(nextBet(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER, 10000)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('올인은 가진 칩 전부, 지우기는 0개로 바꾼다', () => {
    expect(nextBet(5, 100, 'all')).toBe(100);
    expect(nextBet(100, 100, 'clear')).toBe(0);
  });
});

it('카드 21 버튼을 빠르게 두 번 눌러도 한 번만 보내요(새 화면이 뜨면 다시 보낼 수 있어요)', () => {
  const handlers = {};
  vi.stubGlobal('addEventListener', (type, fn) => { handlers[type] = fn; });
  try {
    const form = new EventTarget();
    guardCardActions(form);
    const send = () => {
      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);
      return !event.defaultPrevented;
    };
    expect(send()).toBe(true);
    expect(send()).toBe(false);
    handlers.pageshow();
    expect(send()).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
