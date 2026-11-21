import { describe, expect, it } from 'vitest';
import { BANK } from '../src/escape-bank';
import { reItem } from '../src/escape-bank-re';
import { RE_OVER } from '../src/escape-bank-re-data';
import { checkUi } from '../src/escape-ui';
import { ESCAPE_CASES, actEscape, escCase, startEscape, type EscCase } from '../src/escape';

// 나리 2026-11-21: 재수사(다시 푸는 판)는 수수께끼와 답이 처음 판과 달라야 해요.
describe('다시 푸는 판 수수께끼', () => {
  it('덮어쓰기 목록은 은행에 있는 문제만, 한 번씩', () => {
    const ideas = new Set(BANK.map((b) => b.idea));
    for (const o of RE_OVER) expect(ideas.has(o.idea), o.idea).toBe(true);
    expect(new Set(RE_OVER.map((o) => o.idea)).size).toBe(RE_OVER.length);
  });

  it('시계·카드 말고는 모두 새 판이고, 처음 판의 답으로는 안 풀려요', () => {
    let changed = 0;
    for (const b of BANK) {
      const r = reItem(b);
      if (b.kind === 'clock' || b.kind === 'card') {
        expect.soft(r, b.idea).toBe(b);
        continue;
      }
      changed++;
      expect.soft(r.a, b.idea).toBeDefined();
      expect.soft(r.a, b.idea).not.toBe(b.a);
      expect.soft(r.kind, b.idea).toBe(b.kind);
      if (b.kind === 'ui') {
        expect.soft(r.ui!.t, b.idea).toBe(b.ui!.t);
        expect.soft(JSON.stringify(r.ui), b.idea).not.toBe(JSON.stringify(b.ui));
        expect.soft(checkUi(r.ui!, r.a!), `${b.idea} 새 답`).toBe(true);
        expect.soft(checkUi(r.ui!, b.a!), `${b.idea} 처음 답`).toBe(false);
        expect.soft(checkUi(r.ui!, ''), b.idea).toBe(false);
        const u = r.ui as { answer?: string; answers?: string[] };
        if (u.answer !== undefined) expect.soft(u.answer, b.idea).toBe(r.a);
        if (u.answers) expect.soft(u.answers, b.idea).toContain(r.a);
      } else {
        expect.soft(r.q, b.idea).not.toBe(b.q);
      }
      if (b.kind === 'order') expect.soft([...r.a!].sort().join(''), b.idea).toBe(b.names!.map((_, i) => i + 1).join(''));
      if (b.kind !== 'text') continue;
      expect.soft(!!r.choices, b.idea).toBe(!!b.choices);
      if (r.choices) expect.soft(r.choices, b.idea).toContain(r.a);
      else expect.soft(r.a!.replace(/\s/g, '').length, b.idea).toBeLessThanOrEqual(/^[0-9]+$/.test(r.a!) ? 8 : 12);
    }
    expect.soft(changed).toBe(BANK.length - 5);
  });

  it('부등호는 앞 칸이 왼쪽·위, 묶음 칸은 작은 번호부터(묶음 숫자가 왼쪽 위에 보여요)', () => {
    for (const b of BANK) {
      const u = reItem(b).ui as { ineq?: [number, number, string][]; cages?: { cells: number[] }[] } | undefined;
      for (const [p, q] of u?.ineq ?? []) expect(p, b.idea).toBeLessThan(q);
      for (const c of u?.cages ?? []) expect(c.cells, b.idea).toEqual([...c.cells].sort((x, y) => x - y));
    }
  });

  it('다시 푸는 판 사건도 끝까지 풀리고, 자물쇠 답·수수께끼 카드가 처음 판과 달라요', () => {
    const made = ESCAPE_CASES.filter((c) => c.formats);
    expect(made.length).toBe(47);
    const codes = (c: EscCase) => c.objects.flatMap((o) => (o.lock?.kind === 'code' && o.ref ? [`${o.ref}:${(o.lock as { code: string }).code}`] : []));
    const card = (c: EscCase) => c.objects.find((o) => o.id.startsWith('rdn'))?.look;
    for (const base of made) {
      const re = escCase(base.id, 1)!;
      let s = startEscape(re, true);
      for (const a of re.solution!) {
        s = actEscape(re, s, a)!;
        expect(s, `${base.id} ${JSON.stringify(a)}`).not.toBeNull();
      }
      expect(s.done, base.id).toBe(true);
      expect(s.mistakes, base.id).toBe(0);
      expect(codes(re).filter((x) => codes(base).includes(x)), base.id).toEqual([]);
      if (card(base)) expect(card(re), base.id).not.toBe(card(base));
    }
  });
});
