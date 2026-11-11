// 사건파일 조작 퍼즐 화면. 문제(data-ui)를 그리고, 움직임을 기록해 답 칸(data-ui-v)에 넣어요.
// 정답 확인은 서버(src/escape-ui.ts)가 해요. 여기서는 규칙에 안 맞는 움직임을 미리 막아 줄 뿐이에요.
(() => {
  const box = document.querySelector('.esc-ui');
  if (!box) return;
  const u = JSON.parse(box.dataset.ui);
  const form = box.closest('form');
  const out = form.querySelector('[data-ui-v]');
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (text, fn, cls = 'btn btn-small') => {
    const b = h('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const say = h('p', 'esc-ui-say');
  const tell = (t, bad) => {
    say.textContent = t;
    say.classList.toggle('bad', !!bad);
  };
  const xy = (w, c) => [c % w, Math.floor(c / w)];
  const board = (w, hh, cls = '') => {
    const g = h('div', `esc-ui-board ${cls}`);
    g.style.setProperty('--w', w);
    g.style.setProperty('--h', hh);
    return g;
  };
  let moves = [];
  const setV = (v) => (out.value = v);
  const count = (max) => tell(`움직인 횟수 ${moves.length}${max ? ` / 최대 ${max}` : ''}`, max && moves.length > max);

  const W = {};

  // ── 블록 밀기 ──
  W.slide = () => {
    const ps = u.pieces.map((p) => ({ ...p }));
    const walls = new Set(u.walls || []);
    let sel = ps.find((p) => !p.fixed && (!u.push || p.id === 'P'));
    const g = board(u.w, u.h, 'slide');
    for (let c = 0; c < u.w * u.h; c++) {
      const cell = h('span', `esc-ui-cell${walls.has(c) ? ' wall' : ''}`);
      g.append(cell);
    }
    for (const [id, [x, y]] of Object.entries(u.goal)) {
      const p = ps.find((q) => q.id === id);
      const t = h('span', 'esc-ui-target');
      Object.assign(t.style, { left: `${(x / u.w) * 100}%`, top: `${(y / u.h) * 100}%`, width: `${(p.w / u.w) * 100}%`, height: `${(p.h / u.h) * 100}%` });
      g.append(t);
    }
    if (u.exit) {
      const p = ps.find((q) => q.id === u.exit.id);
      const t = h('span', `esc-ui-exit ${u.exit.side}`, '출구');
      const along = u.exit.side === 'L' || u.exit.side === 'R';
      Object.assign(t.style, along ? { top: `${(p.y / u.h) * 100}%`, height: `${(p.h / u.h) * 100}%` } : { left: `${(p.x / u.w) * 100}%`, width: `${(p.w / u.w) * 100}%` });
      g.append(t);
    }
    const els = new Map();
    for (const p of ps) {
      const e = h('button', `esc-ui-piece${p.fixed ? ' fixed' : ''}`, p.label);
      e.type = 'button';
      if (p.color) e.style.background = p.color;
      e.addEventListener('click', () => {
        if (p.fixed || (u.push && p.id !== 'P')) return;
        sel = p;
        draw();
      });
      let start = null;
      e.addEventListener('pointerdown', (ev) => (start = [ev.clientX, ev.clientY]));
      e.addEventListener('pointerup', (ev) => {
        if (!start) return;
        const dx = ev.clientX - start[0], dy = ev.clientY - start[1];
        start = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18 || p.fixed || (u.push && p.id !== 'P')) return;
        sel = p;
        go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
      });
      els.set(p.id, e);
      g.append(e);
    }
    const D = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    const occ = (x, y, skip) => ps.find((p) => p.id !== skip && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
    const fits = (p, x, y) => {
      for (let i = 0; i < p.w; i++) for (let j = 0; j < p.h; j++) {
        const cx = x + i, cy = y + j;
        if (cx < 0 || cy < 0 || cx >= u.w || cy >= u.h || walls.has(cy * u.w + cx) || occ(cx, cy, p.id)) return false;
      }
      return true;
    };
    let gone = false;
    const go = (dir) => {
      if (!sel || gone) return;
      const d = D[dir];
      if ((sel.axis === 'h' && d[1]) || (sel.axis === 'v' && d[0])) return tell('이 조각은 그 방향으로 못 움직여요.', true);
      if (u.exit && sel.id === u.exit.id && dir === u.exit.side) {
        let x = sel.x, y = sel.y;
        while (fits(sel, x + d[0], y + d[1])) (x += d[0]), (y += d[1]);
        const outNow = dir === 'R' ? x + sel.w === u.w : dir === 'L' ? x === 0 : dir === 'D' ? y + sel.h === u.h : y === 0;
        if (outNow) {
          sel.x = x;
          sel.y = y;
          moves.push(sel.id + dir);
          gone = true;
          setV(moves.join('.'));
          draw();
          els.get(sel.id).classList.add('gone');
          return tell('빠져나왔어요! 「정답 내기」를 눌러 보세요.');
        }
      }
      let steps = 0;
      do {
        const nx = sel.x + d[0], ny = sel.y + d[1];
        if (u.push) {
          const b = occ(nx, ny, sel.id);
          if (b) {
            if (b.fixed || !fits(b, b.x + d[0], b.y + d[1])) break;
            b.x += d[0];
            b.y += d[1];
          }
        }
        if (!fits(sel, nx, ny)) break;
        sel.x = nx;
        sel.y = ny;
        steps++;
      } while (u.ice);
      if (!steps) return tell('막혀서 못 움직여요.', true);
      moves.push(sel.id + dir);
      setV(moves.join('.'));
      draw();
      count(u.max);
    };
    const pad = h('div', 'esc-ui-pad');
    for (const [k, t] of [['U', '▲'], ['L', '◀'], ['D', '▼'], ['R', '▶']]) pad.append(btn(t, () => go(k), `btn esc-ui-arrow a${k}`));
    const draw = () => {
      for (const p of ps) {
        const e = els.get(p.id);
        Object.assign(e.style, { left: `${(p.x / u.w) * 100}%`, top: `${(p.y / u.h) * 100}%`, width: `${(p.w / u.w) * 100}%`, height: `${(p.h / u.h) * 100}%` });
        e.classList.toggle('sel', p === sel);
      }
    };
    draw();
    return [g, pad];
  };

  // ── 물 붓기 ──
  W.pour = () => {
    const s = [...u.init];
    let pick = null;
    const row = h('div', 'esc-ui-jugs');
    const jugs = u.cap.map((cap, i) => {
      const j = h('button', 'esc-ui-jug');
      j.type = 'button';
      j.innerHTML = `<span class="water"></span><b></b><small>${u.names[i]} · ${cap}L</small>`;
      j.addEventListener('click', () => {
        if (pick === null) return (pick = i), draw();
        if (pick === i) return (pick = null), draw();
        const k = Math.min(s[pick], cap - s[i]);
        if (!k) {
          pick = null;
          draw();
          return tell('따를 물이 없거나 이미 가득 찼어요.', true);
        }
        s[pick] -= k;
        s[i] += k;
        moves.push(`${pick}${i}`);
        pick = null;
        done();
      });
      row.append(j);
      return j;
    });
    const tools = h('div', 'esc-ui-tools');
    if (u.fill) tools.append(btn('🚰 고른 병 가득 채우기', () => pick !== null && ((s[pick] = u.cap[pick]), moves.push(`F${pick}`), (pick = null), done())));
    if (u.empty) tools.append(btn('🫗 고른 병 비우기', () => pick !== null && ((s[pick] = 0), moves.push(`E${pick}`), (pick = null), done())));
    const done = () => {
      setV(moves.join('.'));
      draw();
      count(u.max);
    };
    const draw = () =>
      jugs.forEach((j, i) => {
        j.querySelector('.water').style.height = `${(s[i] / u.cap[i]) * 100}%`;
        j.querySelector('b').textContent = `${s[i]}L`;
        j.classList.toggle('sel', pick === i);
      });
    draw();
    tell('따를 병을 먼저 누르고, 받을 병을 눌러요.');
    return [row, tools];
  };

  // ── 강 건너기 ──
  W.river = () => {
    const right = new Set();
    let side = 0, time = 0;
    let boat = [];
    const [lName, rName] = u.place || ['이쪽', '저쪽'];
    const wrap = h('div', 'esc-ui-river');
    const L = h('div', 'bank'), B = h('div', 'boat'), R = h('div', 'bank');
    wrap.append(L, B, R);
    const item = (id) => u.items.find((i) => i.id === id);
    const bad = (bank) =>
      (u.rules || []).some((r) => (r.all ? r.all.every((x) => bank.includes(x)) && !(r.none || []).some((x) => bank.includes(x)) : r.few.filter((x) => bank.includes(x)).length > 0 && r.many.filter((x) => bank.includes(x)).length > r.few.filter((x) => bank.includes(x)).length));
    const chip = (id, where) => {
      const it = item(id);
      const c = btn(`${it.emoji} ${it.name}${it.w ? ` ${it.w}kg` : ''}${it.time ? ` ${it.time}분` : ''}`, () => {
        if (where === 'boat') boat = boat.filter((x) => x !== id);
        else if ((where === 'R') !== (side === 1)) return tell(`${u.boat || '배'}가 반대편에 있어요.`, true);
        else if (boat.length >= u.cap) return tell(`한 번에 ${u.cap}명까지만 탈 수 있어요.`, true);
        else boat.push(id);
        draw();
      }, 'esc-ui-chip');
      return c;
    };
    const cross = btn(`⛵ 건너기`, () => {
      if (!boat.length) return tell('아무도 안 탔어요.', true);
      if (u.rowers && !boat.some((x) => u.rowers.includes(x))) return tell(`${u.boat || '배'}를 움직일 수 있는 사람이 타야 해요.`, true);
      if (u.maxW && boat.reduce((a, x) => a + (item(x).w || 0), 0) > u.maxW) return tell(`너무 무거워요. ${u.maxW}kg까지예요.`, true);
      time += Math.max(...boat.map((x) => item(x).time || 0));
      for (const x of boat) side === 0 ? right.add(x) : right.delete(x);
      moves.push(boat.join(''));
      boat = [];
      side = 1 - side;
      setV(moves.join('.'));
      const ids = u.items.map((i) => i.id);
      if (bad(ids.filter((x) => !right.has(x))) || bad(ids.filter((x) => right.has(x)))) tell('앗, 규칙이 깨졌어요! 「처음부터」로 다시 해 보세요.', true);
      else if (u.limit !== undefined && time > u.limit) tell(`${time}분이 걸렸어요. ${u.limit}분 안에 해야 해요.`, true);
      else tell(`건넌 횟수 ${moves.length}${u.limit !== undefined ? ` · 걸린 시간 ${time}분 / ${u.limit}분` : ''}`);
      draw();
    }, 'btn btn-primary esc-ui-cross');
    const draw = () => {
      L.replaceChildren(h('b', '', lName), ...u.items.filter((i) => !right.has(i.id) && !boat.includes(i.id)).map((i) => chip(i.id, 'L')));
      R.replaceChildren(h('b', '', rName), ...u.items.filter((i) => right.has(i.id) && !boat.includes(i.id)).map((i) => chip(i.id, 'R')));
      B.replaceChildren(h('b', '', `${side ? '→ ' : ''}${u.boat || '배'}${side ? '' : ' ←'}`), ...boat.map((id) => chip(id, 'boat')));
      B.classList.toggle('far', side === 1);
    };
    draw();
    tell('태울 사람을 누르고 「건너기」를 눌러요.');
    return [wrap, cross];
  };

  // ── 스위치 ──
  W.lights = () => {
    const mod = u.mod || 2;
    const s = [...u.init].map(Number);
    const skins = (u.skin || (mod === 2 ? '⚫🟡' : '🔴🟢🔵')).match(/\p{Extended_Pictographic}️?|./gu);
    const g = board(u.w, u.h, 'lights');
    const cells = s.map((_, c) => {
      const b = btn('', () => {
        const [x, y] = xy(u.w, c);
        for (const [dx, dy] of u.shape) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < u.w && ny < u.h) s[ny * u.w + nx] = (s[ny * u.w + nx] + 1) % mod;
        }
        moves.push(String(c));
        setV(moves.join('.'));
        draw();
        count(u.max);
      }, 'esc-ui-cell btn-cell');
      g.append(b);
      return b;
    });
    const goal = h('div', 'esc-ui-goal');
    const gg = board(u.w, u.h, 'mini');
    for (const ch of u.goal) gg.append(h('span', 'esc-ui-cell', skins[Number(ch)]));
    goal.append(h('small', '', '목표'), gg);
    const draw = () => cells.forEach((b, i) => (b.textContent = skins[s[i]]));
    draw();
    return [g, goal];
  };

  // ── 성냥개비 ──
  W.match = () => {
    const SEG = { 0: '1111110', 1: '0110000', 2: '1101101', 3: '1111001', 4: '0110011', 5: '1011011', 6: '1011111', 7: '1110000', 8: '1111111', 9: '1111011' };
    const OPS = { '-': '100', '+': '110', '=': '101', ' ': '000' };
    const from = [...u.glyphs].map((g) => SEG[g] || OPS[g]).join('');
    const s = [...from];
    const row = h('div', 'esc-ui-match');
    let i = 0;
    const bars = [];
    for (const gl of u.glyphs) {
      const digit = SEG[gl] !== undefined;
      const g = h('div', digit ? 'glyph digit' : 'glyph op');
      const names = digit ? ['a', 'b', 'c', 'd', 'e', 'f', 'g'] : ['p', 'q', 'r'];
      for (const nm of names) {
        const k = i++;
        const b = btn('', () => {
          s[k] = s[k] === '1' ? '0' : '1';
          setV(s.join(''));
          draw();
        }, `stick s-${nm}`);
        b.setAttribute('aria-label', '성냥개비 자리');
        g.append(b);
        bars.push(b);
      }
      row.append(g);
    }
    const draw = () => {
      let off = 0, on = 0;
      bars.forEach((b, k) => {
        b.classList.toggle('on', s[k] === '1');
        b.classList.toggle('moved', s[k] !== from[k]);
        if (from[k] === '1' && s[k] === '0') off++;
        if (from[k] === '0' && s[k] === '1') on++;
      });
      tell(`뺀 막대 ${off}개 · 놓은 막대 ${on}개`);
    };
    setV(s.join(''));
    draw();
    return [row, h('p', 'hint', '막대를 누르면 빼고, 빈 자리를 누르면 놓아요.')];
  };

  // ── 저울·시소 ──
  W.balance = () => {
    const at = u.items.map(() => 0);
    const beam = h('div', 'esc-ui-beam');
    const bar = h('div', 'bar');
    const slots = u.arms.map((a, k) => {
      const sl = h('div', 'slot');
      sl.style.left = `${50 + (a / Math.max(...u.arms.map(Math.abs))) * 46}%`;
      bar.append(sl);
      return sl;
    });
    if (u.left) {
      const sl = h('div', 'slot fixed', `${u.left.name}`);
      sl.style.left = `${50 + (u.left.at / Math.max(...u.arms.map(Math.abs), Math.abs(u.left.at))) * 46}%`;
      bar.append(sl);
    }
    beam.append(bar, h('div', 'pivot'));
    const list = h('div', 'esc-ui-assign');
    u.items.forEach((it, i) => {
      const lab = h('label');
      const sel = h('select');
      sel.append(new Option('안 올려요', '0'));
      u.arms.forEach((a, k) => sel.append(new Option(`${a < 0 ? '왼쪽' : '오른쪽'} ${Math.abs(a)}칸`, String(k + 1))));
      sel.addEventListener('change', () => {
        at[i] = Number(sel.value);
        draw();
      });
      lab.append(h('span', '', `${it.name} (${it.w})`), sel);
      list.append(lab);
    });
    const draw = () => {
      let m = u.left ? u.left.w * u.left.at : 0;
      slots.forEach((sl) => (sl.textContent = ''));
      at.forEach((k, i) => {
        if (!k) return;
        m += u.items[i].w * u.arms[k - 1];
        slots[k - 1].textContent += `${slots[k - 1].textContent ? ' ' : ''}${u.items[i].name}`;
      });
      bar.style.rotate = `${Math.max(-12, Math.min(12, m / 4))}deg`;
      setV(at.join(''));
      tell(m === 0 && at.some(Boolean) ? '수평이에요!' : m > 0 ? '오른쪽으로 기울었어요.' : m < 0 ? '왼쪽으로 기울었어요.' : '물건을 올려 보세요.');
    };
    draw();
    return [beam, list];
  };

  // ── 길 긋기 ──
  W.path = () => {
    const blocked = new Set(u.blocked || []);
    const wall = new Set((u.walls || []).flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
    let cells = u.start !== undefined ? [u.start] : [];
    const g = board(u.w, u.h, `path${u.walls ? ' walled' : ''}`);
    const els = [];
    for (let c = 0; c < u.w * u.h; c++) {
      const [x, y] = xy(u.w, c);
      const b = btn('', () => tap(c), `esc-ui-cell btn-cell${blocked.has(c) ? ' wall' : ''}`);
      if (wall.has(`${c}-${c + 1}`) && x < u.w - 1) b.classList.add('wr');
      if (wall.has(`${c}-${c + u.w}`) && y < u.h - 1) b.classList.add('wb');
      if (u.marks && u.marks[c]) b.dataset.mark = u.marks[c];
      g.append(b);
      els.push(b);
    }
    const near = (a, b) => {
      const [ax, ay] = xy(u.w, a), [bx, by] = xy(u.w, b);
      const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
      return u.step === 'orth' ? dx + dy === 1 : u.step === 'king' ? Math.max(dx, dy) === 1 : (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    };
    const tap = (c) => {
      if (blocked.has(c)) return;
      if (cells.at(-1) === c && !(u.start !== undefined && cells.length === 1)) cells.pop();
      else if (!cells.length) cells.push(c);
      else if (!near(cells.at(-1), c) || wall.has(`${cells.at(-1)}-${c}`)) return tell('바로 옆(규칙대로 갈 수 있는) 칸만 이어져요.', true);
      else if (cells.includes(c) && !(u.loop && c === cells[0] && cells.length > 3)) return tell('한 번 지난 칸은 다시 못 가요. 마지막 칸을 누르면 한 칸 되돌려요.', true);
      else cells.push(c);
      setV(cells.join('.'));
      draw();
    };
    const draw = () => {
      els.forEach((b, c) => {
        const k = cells.indexOf(c);
        b.classList.toggle('on', k >= 0);
        b.classList.toggle('head', c === cells.at(-1));
        b.textContent = u.marks && u.marks[c] ? u.marks[c] : k >= 0 ? String(k + 1) : '';
      });
      tell(`지나간 칸 ${cells.length}${u.max ? ` · 움직임 ${Math.max(0, cells.length - 1)} / 최대 ${u.max}` : ''}`);
    };
    draw();
    return [g, h('p', 'hint', '칸을 차례로 눌러 길을 이어요. 마지막 칸을 다시 누르면 한 칸 되돌려요.')];
  };

  // ── 타일 돌리기 ──
  W.rotate = () => {
    const r = [...u.rot].map(Number);
    const g = board(u.w, u.h, `rotate ${u.mode}`);
    const els = [...u.tiles].map((t, i) => {
      const fixed = (u.fixed && u.fixed[i] === '1') || (u.mode === 'pipe' ? t === '.' : t !== 'M');
      const b = btn('', () => {
        if (fixed) return;
        r[i] = (r[i] + 1) % 4;
        draw();
      }, `esc-ui-cell btn-cell tile t-${t === '/' || t === '\\' ? 'm' : t === '*' ? 'star' : t === '#' ? 'wall' : t}${fixed ? ' fixed' : ''}`);
      g.append(b);
      return b;
    });
    const draw = () => {
      els.forEach((b, i) => {
        const t = u.tiles[i];
        if (u.mode === 'pipe') {
          b.innerHTML = t === '.' ? '' : `<i class="pipe p-${t}" style="rotate:${r[i] * 90}deg"></i>${t === 'S' ? '<em>💧</em>' : t === 'E' ? '<em>🪴</em>' : ''}`;
        } else {
          b.textContent = t === 'M' ? (r[i] % 2 ? '╲' : '╱') : t === '/' ? '╱' : t === '\\' ? '╲' : t === '*' ? '⭐' : t === 'L' ? '🔦' : t === 'E' ? '🚪' : t === '#' ? '🧱' : '';
        }
      });
      setV(r.join(''));
    };
    draw();
    return [g, h('p', 'hint', '타일을 누르면 돌아가요.')];
  };

  // ── 쌓기 ──
  W.stacks = () => {
    const s = u.stacks.map((x) => [...x]);
    let pick = null;
    const row = h('div', `esc-ui-stacks ${u.rule}`);
    const cols = s.map((_, i) => {
      const c = btn('', () => {
        if (u.rule === 'flip') return;
        if (pick === null) {
          if (!s[i].length) return;
          pick = i;
          return draw();
        }
        if (pick === i) return (pick = null), draw();
        const a = pick;
        pick = null;
        const top = s[a].at(-1), under = s[i].at(-1);
        if (u.adj && Math.abs(a - i) !== 1) return draw(), tell('바로 옆 기둥으로만 옮길 수 있어요.', true);
        if (u.cap && s[i].length >= u.cap) return draw(), tell('꽉 찼어요.', true);
        if (u.rule === 'hanoi' && under !== undefined && Number(under) < Number(top)) return draw(), tell('작은 것 위에 큰 것을 올릴 수 없어요.', true);
        if (u.rule === 'color' && under !== undefined && under !== top) return draw(), tell('같은 색 위에만 올릴 수 있어요.', true);
        s[i].push(s[a].pop());
        moves.push(`${a}${i}`);
        setV(moves.join('.'));
        draw();
        count(u.max);
      }, 'esc-ui-col');
      row.append(c);
      return c;
    });
    const disk = (x) => (u.rule === 'hanoi' || u.rule === 'flip' ? x : x);
    const draw = () => {
      cols.forEach((c, i) => {
        c.replaceChildren(...s[i].map((x, k) => {
          const d = h('span', `disk d${x}`, u.rule === 'color' ? x : '');
          if (u.rule === 'hanoi' || u.rule === 'flip') d.style.width = `${30 + Number(x) * 12}%`;
          if (u.rule === 'flip') {
            d.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const n = s[i].length - k;
              if (n < 2) return;
              s[i] = [...s[i].slice(0, k), ...s[i].slice(k).reverse()];
              moves.push(String(n));
              setV(moves.join('.'));
              draw();
              count(u.max);
            });
          }
          if (u.rule === 'color') d.textContent = disk(x);
          return d;
        }).reverse(), h('small', '', u.names ? u.names[i] : ''));
        c.classList.toggle('sel', pick === i);
      });
    };
    draw();
    tell(u.rule === 'flip' ? '팬케이크를 누르면 그 위가 통째로 뒤집혀요.' : '옮길 기둥을 누르고, 놓을 기둥을 눌러요.');
    return [row];
  };

  // ── 숫자 칸 ──
  W.numgrid = () => {
    const g = board(u.w, u.h, 'numgrid');
    const vals = u.given.map((x) => (x === null ? '' : String(x)));
    const cage = new Map();
    (u.cages || []).forEach((cg, k) => cg.cells.forEach((c, j) => cage.set(c, [k, j === 0 ? cg.label : ''])));
    u.given.forEach((x, c) => {
      if (x === -1) return g.append(h('span', `esc-ui-cell void${u.marks && u.marks[c] ? ' clue' : ''}`, (u.marks && u.marks[c]) || ''));
      const cell = h('label', `esc-ui-cell num${x !== null ? ' given' : ''}`);
      if (cage.has(c)) {
        cell.classList.add(`cage${cage.get(c)[0] % 6}`);
        if (cage.get(c)[1]) cell.append(h('small', 'cage-label', cage.get(c)[1]));
      }
      if (u.marks && u.marks[c] && x !== -1) cell.append(h('small', 'cage-label', u.marks[c]));
      if (x !== null) cell.append(h('b', '', String(x)));
      else {
        const inp = h('input');
        inp.inputMode = 'numeric';
        inp.maxLength = 1;
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/[^0-9]/g, '').slice(-1);
          vals[c] = inp.value;
          setV(vals.filter((_, i) => u.given[i] !== -1).map((x) => x || '_').join(''));
        });
        cell.append(inp);
      }
      g.append(cell);
    });
    for (const [a, b, op] of u.ineq || []) {
      const [ax, ay] = xy(u.w, a), [bx, by] = xy(u.w, b);
      const t = h('span', 'esc-ui-ineq', ay === by ? op : op === '<' ? '∧' : '∨');
      Object.assign(t.style, { left: `${((ax + bx + 1) / 2 / u.w) * 100}%`, top: `${((ay + by + 1) / 2 / u.h) * 100}%` });
      g.append(t);
    }
    setV(vals.filter((_, i) => u.given[i] !== -1).map((x) => x || '_').join(''));
    return [g];
  };

  // ── 칸 고르기 ──
  W.mark = () => {
    const on = u.cells.map(() => false);
    const cols = u.colClues ? 1 : 0, rows = u.rowClues ? 1 : 0;
    const g = board(u.w + rows, u.h + cols, 'mark');
    if (cols) {
      if (rows) g.append(h('span', 'esc-ui-clue'));
      u.colClues.forEach((t) => g.append(h('span', 'esc-ui-clue col', t)));
    }
    const els = [];
    for (let y = 0; y < u.h; y++) {
      if (rows) g.append(h('span', 'esc-ui-clue row', u.rowClues[y]));
      for (let x = 0; x < u.w; x++) {
        const c = y * u.w + x;
        const fixed = u.cells[c];
        const b = fixed ? h('span', 'esc-ui-cell fixed', fixed) : btn('', () => ((on[c] = !on[c]), draw()), 'esc-ui-cell btn-cell');
        if (u.regions) b.classList.add(`reg${u.regions[c] % 8}`);
        g.append(b);
        els.push(b);
      }
    }
    const draw = () => {
      els.forEach((b, c) => !u.cells[c] && (b.textContent = on[c] ? u.icon : (u.text && u.text[c]) || ''));
      els.forEach((b, c) => !u.cells[c] && u.text && b.classList.toggle('shade', on[c]));
      setV(on.map((x) => (x ? '1' : '0')).join(''));
      tell(`표시한 칸 ${on.filter(Boolean).length}개`);
    };
    draw();
    return [g];
  };

  // ── 여러 개 고르기 ──
  W.multi = () => {
    const list = h('div', 'esc-ui-multi');
    const on = u.options.map(() => false);
    u.options.forEach((t, i) => {
      const lab = h('label');
      const c = h('input');
      c.type = 'checkbox';
      c.addEventListener('change', () => {
        on[i] = c.checked;
        setV(on.map((x, k) => (x ? k + 1 : '')).join(''));
      });
      lab.append(c, h('span', '', t));
      list.append(lab);
    });
    return [list];
  };

  // ── 뛰어넘기 ──
  W.jump = () => {
    const s = [...u.init];
    const holes = new Set(u.holes);
    let pick = null;
    const g = board(u.w, u.h, 'jump');
    const els = s.map((_, c) => {
      if (holes.has(c)) {
        const v = h('span', 'esc-ui-cell void');
        g.append(v);
        return v;
      }
      const b = btn('', () => {
        if (s[c] !== '0') return (pick = pick === c ? null : c), draw();
        if (pick === null) return;
        const a = pick;
        pick = null;
        const [ax, ay] = xy(u.w, a), [bx, by] = xy(u.w, c);
        const dx = bx - ax, dy = by - ay;
        if (u.rule === 'frogs') {
          const dir = s[a] === '1' ? 1 : -1;
          const along = u.h === 1 ? dx : dy, across = u.h === 1 ? dy : dx;
          if (across || !(along === dir || along === 2 * dir) || (along === 2 * dir && s[u.h === 1 ? a + dir : a + dir * u.w] === '0')) return draw(), tell('앞으로 한 칸 가거나, 바로 앞 하나를 뛰어넘을 수만 있어요.', true);
        } else if (u.rule === 'knight') {
          if (!((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return draw(), tell('나이트는 ㄱ자로만 움직여요.', true);
        } else {
          if (!((Math.abs(dx) === 2 && !dy) || (Math.abs(dy) === 2 && !dx)) || s[(ay + dy / 2) * u.w + ax + dx / 2] !== '1') return draw(), tell('가로·세로로 하나를 뛰어넘어 빈칸에 가야 해요.', true);
          s[(ay + dy / 2) * u.w + ax + dx / 2] = '0';
        }
        s[c] = s[a];
        s[a] = '0';
        moves.push(`${a}-${c}`);
        setV(moves.join('.'));
        draw();
        count(u.max);
      }, 'esc-ui-cell btn-cell');
      g.append(b);
      return b;
    });
    const face = u.faces || (u.rule === 'frogs' ? ['', '🐸', '🐢'] : u.rule === 'knight' ? ['', '♘', '♞'] : ['', '🔵']);
    const draw = () => els.forEach((b, c) => !holes.has(c) && ((b.textContent = face[Number(s[c])] || ''), b.classList.toggle('sel', pick === c)));
    draw();
    tell('움직일 말을 누르고, 갈 빈칸을 눌러요.');
    return [g];
  };

  // ── 다이얼 ──
  W.dials = () => {
    const s = [...u.init];
    const row = h('div', 'esc-ui-dials');
    const ds = u.faces.map(() => {
      const d = h('span', 'dial');
      row.append(d);
      return d;
    });
    const pad = h('div', 'esc-ui-tools');
    u.buttons.forEach((b, k) =>
      pad.append(btn(b.label, () => {
        b.turns.forEach((t, i) => (s[i] = (s[i] + t + u.faces[i].length * 10) % u.faces[i].length));
        moves.push(String(k));
        setV(moves.join('.'));
        draw();
        count(u.max);
      })),
    );
    const draw = () => ds.forEach((d, i) => (d.textContent = u.faces[i][s[i]]));
    draw();
    const goal = h('p', 'hint', `목표: ${u.goal.map((g, i) => u.faces[i][g]).join(' ')}`);
    return [row, pad, goal];
  };

  // ── 색칠 ──
  W.color = () => {
    const n = Math.max(...u.regions) + 1;
    const c = Array.from({ length: n }, (_, r) => (u.given && u.given[r]) || 0);
    const g = board(u.w, u.h, 'color');
    const els = u.regions.map((r, i) => {
      const [x, y] = xy(u.w, i);
      const b = btn('', () => {
        if (u.given && u.given[r]) return;
        c[r] = (c[r] % u.colors) + 1;
        draw();
      }, 'esc-ui-cell btn-cell');
      if (x < u.w - 1 && u.regions[i + 1] !== r) b.classList.add('br');
      if (y < u.h - 1 && u.regions[i + u.w] !== r) b.classList.add('bb');
      g.append(b);
      return b;
    });
    const draw = () => {
      els.forEach((b, i) => (b.dataset.c = String(c[u.regions[i]])));
      setV(c.join(''));
    };
    draw();
    return [g, h('p', 'hint', `구역을 누를 때마다 색이 바뀌어요 (${u.colors}가지).`)];
  };

  // ── 땅 나누기 ──
  W.divide = () => {
    const holes = new Set(u.holes || []);
    const p = u.marks.map((_, i) => (holes.has(i) ? 0 : 0));
    const g = board(u.w, u.h, 'divide');
    const els = u.marks.map((m, i) => {
      if (holes.has(i)) {
        const v = h('span', 'esc-ui-cell void');
        g.append(v);
        return v;
      }
      const b = btn(m || '', () => {
        p[i] = (p[i] % u.parts) + 1;
        draw();
      }, 'esc-ui-cell btn-cell');
      g.append(b);
      return b;
    });
    const draw = () => {
      els.forEach((b, i) => !holes.has(i) && (b.dataset.c = String(p[i])));
      setV(p.join(''));
    };
    draw();
    return [g, h('p', 'hint', `칸을 누를 때마다 조각 색이 바뀌어요 (${u.parts}조각).`)];
  };

  const make = () => {
    moves = [];
    tell('');
    setV('');
    const parts = (W[u.t] || (() => [h('p', '', '이 문제는 아직 화면이 없어요.')]))();
    box.replaceChildren(...parts, say);
  };
  make();
  form.querySelector('[data-ui-reset]')?.addEventListener('click', make);
  form.addEventListener('submit', (e) => {
    if (!out.value) {
      e.preventDefault();
      tell('먼저 문제를 풀어 보세요.', true);
    }
  });
})();
