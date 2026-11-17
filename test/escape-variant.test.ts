import { describe, expect, it } from 'vitest';
import { ESCAPE_CASES, actEscape, coinSpots, decodeEscape, escCase, escVariantOf, startEscape } from '../src/escape';
import { STORY_SEEDS } from '../src/escape-stories';

// 다시 푸는 판(나리 2026-11-17, 멍쑤님 제보): 수수께끼는 같고 범인·단서·자리·시계 시각 같은 것만 바뀌어요.
const refs = (c: { objects: { ref?: number }[] }) => c.objects.flatMap((o) => (o.ref ? [o.ref] : [])).sort((a, b) => a - b);
const ids = STORY_SEEDS.map((s) => s.id);

describe('사건파일 다시 푸는 판', () => {
  it('만든 사건마다 다시 푸는 판 1~3도 모범 풀이로 실수 없이 끝까지 풀려요', () => {
    for (const id of ids) {
      for (const vr of [1, 2, 3]) {
        const c = escCase(id, vr)!;
        expect(c.vr).toBe(vr);
        let s = startEscape(c);
        expect(s.vr).toBe(vr);
        for (const a of c.solution!) {
          const n = actEscape(c, s, a);
          expect(n, `${id}#${vr} ${JSON.stringify(a)}`).not.toBeNull();
          s = n!;
          expect(s.mistakes, `${id}#${vr} ${JSON.stringify(a)} ${s.msg}`).toBe(0);
        }
        expect(s.done, `${id}#${vr}`).toBe(true);
      }
    }
  });

  it('수수께끼(은행 문제)는 처음 판과 같고, 판은 달라져요', () => {
    let culpritChanged = 0;
    let layoutChanged = 0;
    for (const id of ids) {
      const a = escCase(id)!;
      const b = escCase(id, 1)!;
      expect(refs(b), id).toEqual(refs(a));
      expect(b.scenes.map((x) => x.name)).toEqual(a.scenes.map((x) => x.name));
      if (a.question.options[a.question.correct] !== b.question.options[b.question.correct]) culpritChanged++;
      if (JSON.stringify(a.solution) !== JSON.stringify(b.solution)) layoutChanged++;
    }
    expect(layoutChanged).toBe(ids.length);
    expect(culpritChanged).toBeGreaterThan(ids.length / 2);
  });

  it('같은 판 번호면 늘 같은 판이에요(다른 판을 먼저 만들어도)', () => {
    const first = JSON.stringify(escCase(ids[0]!, 5));
    for (const id of ids.slice(0, 10)) escCase(id, 7);
    expect(JSON.stringify(escCase(ids[0]!, 5))).toBe(first);
  });

  it('판 기록에 판 번호가 남고, 다시 읽을 때 같은 판으로 읽어요', () => {
    const c = escCase(ids[0]!, 2)!;
    const json = JSON.stringify(startEscape(c));
    expect(escVariantOf(json)).toBe(2);
    expect(escVariantOf(JSON.stringify(startEscape(escCase(ids[0]!)!)))).toBe(0);
    expect(decodeEscape(escCase(ids[0]!, escVariantOf(json))!, json)).not.toBeNull();
    expect(coinSpots(c, 'r1')).not.toEqual(coinSpots(escCase(ids[0]!)!, 'r1'));
  });

  it('손으로 만든 사건·대화 사건은 다시 풀어도 그대로예요', () => {
    for (const c of ESCAPE_CASES.filter((x) => !ids.includes(x.id))) expect(escCase(c.id, 3)).toBe(c);
  });
});
