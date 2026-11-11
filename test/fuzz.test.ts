// 아무렇게나 눌러 봐도 상태가 깨지지 않는지(사건파일·원정대) 확인해요.
import { expect, it } from 'vitest';
import { ESCAPE_CASES, actEscape, startEscape, decodeEscape, coinSpots, visible, type EscAction } from '../src/escape';
import { startJourney, actJourney, decodeJourney, stat } from '../src/journey';
import { CHAPTERS } from '../src/journey-chapters';
const out: string[] = [];
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
it('fuzz escape', () => {
  for (const c of ESCAPE_CASES) {
    const r = rng(c.id.length * 7919 + c.id.charCodeAt(1));
    for (let run = 0; run < 6; run++) {
      let s = startEscape(c);
      for (let i = 0; i < 300 && !s.done; i++) {
        const objs = c.objects.filter((o) => visible(c, s, o));
        const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
        const k = r();
        let a: EscAction;
        if (k < 0.45 && objs.length) a = { a: 'tap', o: pick(objs)!.id };
        else if (k < 0.6 && objs.length && s.inv.length) a = { a: 'use', o: pick(objs)!.id, i: pick(s.inv)! };
        else if (k < 0.7 && s.inv.length > 1) a = { a: 'combine', i: pick(s.inv)!, j: pick(s.inv)! };
        else if (k < 0.78) a = { a: 'hint' };
        else if (k < 0.82 && objs.length) a = { a: 'hint2', o: pick(objs)!.id };
        else if (k < 0.88) a = { a: 'coin', k: Math.floor(r() * 3) };
        else if (k < 0.95 && objs.length) a = { a: 'code', o: pick(objs)!.id, v: String(Math.floor(r() * 1000)) };
        else a = { a: 'answer', n: Math.floor(r() * 4), m: (c.more ?? []).map(() => Math.floor(r() * 4)) };
        let n;
        try { n = actEscape(c, s, a); } catch (e) { out.push(`THROW ${c.id} ${JSON.stringify(a)} ${e}`); break; }
        if (!n) continue;
        if (!decodeEscape(c, JSON.stringify(n))) { out.push(`DECODE ${c.id} after ${JSON.stringify(a)}`); break; }
        if (!c.scenes.some((x) => x.id === n.scene)) out.push(`SCENE ${c.id}`);
        if (n.focus && !c.objects.some((o) => o.id === n.focus)) out.push(`FOCUS ${c.id} ${n.focus}`);
        s = n;
      }
    }
    for (const sc of c.scenes) if (coinSpots(c, sc.id).length < 2) out.push(`COINS ${c.id}/${sc.id}`);
  }
});
it('fuzz journey', () => {
  const chs = CHAPTERS.length;
  for (let ch = 1; ch <= chs; ch++) for (let k = 0; k < 25; k++) {
    const r = rng(k * 31 + ch);
    let s = startJourney(`seed${ch}-${k}`, undefined, ch);
    for (let i = 0; i < 400 && !s.done; i++) {
      const q = r();
      const a = q < 0.4 ? { a: 'next' as const } : q < 0.6 ? { a: 'pick' as const, n: Math.floor(r() * 4) - 0 } : q < 0.7 ? { a: 'buy' as const, n: Math.floor(r() * 4) } : q < 0.8 ? { a: 'leave' as const } : { a: 'idle' as const };
      let n;
      try { n = actJourney(s, a); } catch (e) { out.push(`JTHROW ch${ch} ${JSON.stringify(a)} ${e}`); break; }
      if (!n) continue;
      const st = stat(n);
      if (!decodeJourney(JSON.stringify(n))) { out.push(`JDECODE ch${ch} day${n.day} ${JSON.stringify(a)}`); break; }
      if (!Number.isFinite(n.hp) || n.hp > st.maxHp || n.coins < 0 || !Number.isFinite(n.coins)) out.push(`JSTAT ch${ch} day${n.day} hp${n.hp}/${st.maxHp} coins${n.coins}`);
      s = n;
    }
    if (!s.done) out.push(`JSTUCK ch${ch} k${k} day${s.day} pending=${JSON.stringify(s.pending)}`);
  }
  expect([...new Set(out)]).toEqual([]);
});
