// 사건파일 답 입력: 답이 될 수 없는 입력(같은 이름 두 번, 손대지 않은 처음 모습)은 실수로 세지 않고,
// 글자로 적는 답은 단위를 붙여도 맞아요.
import { describe, expect, it } from 'vitest';
import { ESCAPE_CASES, actEscape, startEscape } from '../src/escape';
import { checkUi, matchBits, type Ui } from '../src/escape-ui';

const locks = ESCAPE_CASES.flatMap((c) => c.objects.filter((o) => o.lock?.kind === 'code').map((o) => ({ c, o })));
const at = (c: (typeof locks)[number]['c'], o: (typeof locks)[number]['o']) => ({ ...startEscape(c), scene: o.scene, shown: o.hidden ? [o.id] : [] });

describe('사건파일 답 입력', () => {
  it('줄 세우기에서 같은 이름을 두 번 고르면 실수로 세지 않고 돌려보내요', () => {
    const order = locks.filter(({ o }) => o.lock?.kind === 'code' && o.lock.order);
    expect(order.length).toBeGreaterThan(0);
    for (const { c, o } of order) {
      const code = (o.lock as { code: string }).code;
      const dup = code[0]!.repeat(code.length);
      expect(actEscape(c, at(c, o), { a: 'code', o: o.id, v: dup })).toBeNull();
      // 이름이 다 다르지만 틀린 순서는 그대로 실수예요
      const wrong = [...code].reverse().join('');
      expect(actEscape(c, at(c, o), { a: 'code', o: o.id, v: wrong })!.mistakes).toBe(1);
      expect(actEscape(c, at(c, o), { a: 'code', o: o.id, v: code })!.opened).toContain(o.id);
    }
  });

  it('글자로 적는 답(7.5)은 단위를 붙여 적어도 맞고, 다른 값은 여전히 실수예요', () => {
    const text = locks.filter(({ o }) => o.lock?.kind === 'code' && !o.lock.choices && !o.lock.order && !o.lock.grid && !o.lock.ui && !/^[0-9]+$/.test(o.lock.code));
    expect(text.length).toBeGreaterThan(0);
    for (const { c, o } of text) {
      const lk = o.lock as { code: string; ask: string };
      for (const v of [lk.code, `${lk.code}${lk.ask}`, `${lk.code} ${lk.ask}`, `${lk.code}°`]) expect(actEscape(c, at(c, o), { a: 'code', o: o.id, v })!.opened, v).toContain(o.id);
      expect(actEscape(c, at(c, o), { a: 'code', o: o.id, v: `${lk.code}0${lk.ask}` })!.mistakes).toBe(1);
      expect(actEscape(c, at(c, o), { a: 'code', o: o.id, v: `${lk.ask}` })!.mistakes).toBe(1);
    }
  });

  it('손으로 움직이는 장치는 처음 모습 그대로가 정답인 문제가 없어요(화면은 처음 모습 그대로 내는 걸 막아요)', () => {
    const first = (u: Ui): string | null => {
      switch (u.t) {
        case 'rotate': return u.rot;
        case 'match': return matchBits(u.glyphs);
        case 'balance': return '0'.repeat(u.items.length);
        case 'mark': return '0'.repeat(u.cells.length);
        default: return null;
      }
    };
    let n = 0;
    for (const { o } of locks) {
      const u = o.lock?.kind === 'code' ? o.lock.ui : undefined;
      const v = u && first(u);
      if (!u || v === null || v === undefined) continue;
      n++;
      expect(checkUi(u, v), `${o.id} ${u.t}`).toBe(false);
    }
    expect(n).toBeGreaterThan(5);
  });
});
