// 조사: 받침에 맞게 붙여요(「단비이에요」 같은 글이 사건에 나오지 않게).
import { describe, expect, it } from 'vitest';
import { jo, ro } from '../src/josa';
import { ESCAPE_CASES, actEscape, escCase, startEscape } from '../src/escape';

const noBatchimThenI = /([가-힣])이에요/g;
const hasBatchim = (ch: string) => (ch.charCodeAt(0) - 0xac00) % 28 > 0;

describe('조사 붙이기', () => {
  it('받침·ㄹ받침·한글 아닌 끝에 맞게 골라요', () => {
    expect(jo('단비', '이에요', '예요')).toBe('단비예요');
    expect(jo('하늘', '이에요', '예요')).toBe('하늘이에요');
    expect(ro('창고')).toBe('창고로');
    expect(ro('교실')).toBe('교실로');
    expect(ro('부엌')).toBe('부엌으로');
    expect(ro('B2')).toBe('B2(으)로');
    expect(jo('손전등', '과', '와')).toBe('손전등과');
  });

  it('사건 글에 「(으)로」 같은 두 꼴 조사나 받침 없는 이름 뒤 「이에요」가 없어요', () => {
    for (const base of ESCAPE_CASES)
      for (let vr = 0; vr <= (base.solution ? 5 : 0); vr++) {
        const c = escCase(base.id, vr)!;
        const texts = c.objects.flatMap((o) => [o.name, o.look, o.again ?? '', o.openText ?? '']);
        for (const t of texts) {
          expect(t, `${c.id}#${vr}`).not.toMatch(/\(으\)로|와\(과\)|은\(는\)/);
          for (const m of t.matchAll(noBatchimThenI)) expect(hasBatchim(m[1]!), `${c.id}#${vr}: ${t.slice(0, 40)}`).toBe(true);
        }
      }
  });

  it('방 이동·합치기 실패 알림도 받침에 맞아요', () => {
    const c = escCase('jellyjar')!;
    let s = startEscape(c);
    s = { ...s, opened: ['door1'], seen: ['door1'] };
    s = actEscape(c, s, { a: 'tap', o: 'door1' })!;
    expect(s.msg).toBe('창고로 왔어요.');
  });
});
