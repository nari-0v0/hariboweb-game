import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MYSTERY_CASES } from '../src/escape-mystery';
import { BANK } from '../src/escape-bank';
import { actEscape, escGrade, normCode, startEscape } from '../src/escape';

const KO_NUM: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };
// 「한글 3글자」「네 자리」「숫자 4자리」처럼 적힌 글자 수
function askLength(ask: string): number | null {
  const m = ask.match(/(\d+)\s*(?:글자|자리)/) ?? ask.match(/(한|두|세|네|다섯|여섯)\s*(?:글자|자리)/);
  if (!m) return null;
  return /^\d+$/.test(m[1]!) ? Number(m[1]) : KO_NUM[m[1]!]!;
}

describe('추리 사건', () => {
  it('아이디가 m01부터 차례로이고, 겹치지 않아요', () => {
    expect(MYSTERY_CASES.map((c) => c.id)).toEqual(MYSTERY_CASES.map((_, i) => `m${String(i + 1).padStart(2, '0')}`));
  });

  it.each(MYSTERY_CASES.map((c) => [c.id, c] as const))('%s: 모범 풀이로 실수 없이 S, 마지막 답은 세 개 모두 맞아요', (_, c) => {
    let s = startEscape(c);
    for (const a of c.solution!) {
      const n = actEscape(c, s, a);
      expect(n, `${c.id} ${JSON.stringify(a)}`).not.toBeNull();
      s = n!;
      expect(s.mistakes, `${c.id} ${JSON.stringify(a)} ${s.msg}`).toBe(0);
    }
    expect(s.done).toBe(true);
    expect(escGrade(s)).toBe('S');
    // 모든 단서를 다 모았어요(쓸모없는 단서가 남지 않게)
    expect(new Set(s.clues)).toEqual(new Set(Object.keys(c.clues)));
  });

  it('추리·수수께끼 답: 고르기 답은 보기 안에 한 번만, 적힌 글자 수와 답 길이가 같아요', () => {
    for (const c of MYSTERY_CASES) {
      for (const o of c.objects) {
        const l = o.lock;
        if (!l || l.kind !== 'code') continue;
        if (l.choices) {
          expect(l.choices.filter((x) => normCode(x) === normCode(l.code)), `${c.id}/${o.id}`).toHaveLength(1);
          expect(new Set(l.choices).size, `${c.id}/${o.id} 같은 보기`).toBe(l.choices.length);
          continue;
        }
        const n = askLength(l.ask);
        expect(n, `${c.id}/${o.id} 글자 수가 안 적혀 있어요: ${l.ask}`).not.toBeNull();
        expect([...l.code.normalize('NFC')].length, `${c.id}/${o.id} ${l.ask}`).toBe(n);
      }
    }
  });

  it('추리 잠금은 사람에게 달려 있고, 머리 쓰는 문제는 사건마다 1~2개예요', () => {
    for (const c of MYSTERY_CASES) {
      const codes = c.objects.filter((o) => o.lock?.kind === 'code');
      const deduce = codes.filter((o) => o.deduce);
      const brain = codes.filter((o) => !o.deduce);
      expect(deduce.length, c.id).toBeGreaterThanOrEqual(2);
      expect(brain.length, c.id).toBeGreaterThanOrEqual(1);
      expect(brain.length, c.id).toBeLessThanOrEqual(2);
      for (const o of deduce) expect(o.memo, `${c.id}/${o.id} 증언은 메모에 남아요`).toBe(true);
    }
  });

  it('마지막 질문은 추리로 얻는 단서를 모두 필요로 하고, 범인은 용의자 중 하나예요', () => {
    for (const c of MYSTERY_CASES) {
      const fromDeduce = c.objects.filter((o) => o.deduce).flatMap((o) => [o.clue ?? []].flat());
      for (const k of fromDeduce) expect(c.question.needs, `${c.id} ${k}`).toContain(k);
      expect(c.question.options).toHaveLength(4);
      expect(c.more).toHaveLength(2);
      for (const q of c.more!) expect(q.options).toHaveLength(3);
    }
  });

  it('인물 그림 파일이 있고, 한 사건 안에서 겹치지 않아요', () => {
    for (const c of MYSTERY_CASES) {
      const faces = c.objects.flatMap((o) => (o.face ? [o.face] : []));
      expect(new Set(faces).size, c.id).toBe(faces.length);
      for (const f of faces) expect(existsSync(`public/char/${f}.png`), `${c.id} ${f}`).toBe(true);
    }
  });

  it('수수께끼 은행과 같은 문제를 쓰지 않아요', () => {
    const bank = new Set(BANK.map((b) => normCode(b.q ?? '')));
    for (const c of MYSTERY_CASES) for (const o of c.objects) expect(bank.has(normCode(o.look)), `${c.id}/${o.id}`).toBe(false);
  });
});
