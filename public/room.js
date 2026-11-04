// 내 방 꾸미기 도구: 가구를 골라 빈칸을 누르면 놓이고, 놓인 가구를 누르면 옮기거나 치울 수 있어요.
// 저장은 서버가 다시 확인해요(가진 물건인지, 자리에 맞는지, 겹치지 않는지).
(() => {
  const dataEl = document.getElementById('room-data');
  const room = document.getElementById('room');
  const editor = document.getElementById('room-editor');
  const editBtn = document.getElementById('room-edit-btn');
  if (!dataEl || !room || !editor || !editBtn) return;
  let D;
  try {
    D = JSON.parse(dataEl.textContent || '{}');
  } catch {
    return;
  }
  const items = new Map(D.items.map((x) => [x.k, x]));
  const sizeOf = (k) => (k === D.me ? { w: 1, h: 1, zone: 'floor' } : items.get(k));
  const nameOf = (k) => (k === D.me ? D.name : items.get(k)?.name || k);
  let layout = D.layout.filter((p) => sizeOf(p.k));
  let wall = D.wall;
  let floor = D.floor;
  let picked = null; // 고른 가구 key
  const holder = room.querySelector('.room-items');
  const palette = document.getElementById('room-palette');
  const tools = document.getElementById('room-tools');
  const pickedLabel = document.getElementById('room-picked');
  const tip = document.getElementById('room-tip');
  const form = document.getElementById('room-save');

  const fits = (k, x, y) => {
    const s = sizeOf(k);
    if (!s || x < 0 || y < 0 || x + s.w > D.cols || y + s.h > D.rows) return false;
    if (s.zone === 'wall' ? y + s.h > D.wallRows : y < D.wallRows) return false;
    return layout.every((p) => {
      if (p.k === k) return true;
      const o = sizeOf(p.k);
      return x + s.w <= p.x || p.x + o.w <= x || y + s.h <= p.y || p.y + o.h <= y;
    });
  };

  const say = (text) => {
    tip.textContent = text;
  };

  function itemEl(p) {
    const s = sizeOf(p.k);
    const el = document.createElement('div');
    el.className = `room-item${p.k === D.me ? ' me' : ''}${picked === p.k ? ' picked' : ''}`;
    el.dataset.k = p.k;
    el.style.cssText = `--x:${p.x};--y:${p.y};--w:${s.w};--h:${s.h}`;
    el.title = nameOf(p.k);
    const art = p.k === D.me ? D.art : items.get(p.k)?.art;
    if (art) {
      const img = document.createElement('img');
      img.src = art;
      img.alt = nameOf(p.k);
      el.append(img);
    } else {
      const span = document.createElement('span');
      span.textContent = items.get(p.k)?.emoji || '';
      el.append(span);
    }
    return el;
  }

  function chip(list, current, onPick, prefix) {
    const box = document.createDocumentFragment();
    for (const s of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `room-chip${s.key === current ? ' on' : ''}`;
      const sw = document.createElement('span');
      sw.className = `swatch ${prefix}-${s.key}`;
      b.append(sw, document.createTextNode(s.name));
      b.addEventListener('click', () => onPick(s.key));
      box.append(b);
    }
    return box;
  }

  function render() {
    holder.replaceChildren(...layout.map(itemEl));
    room.className = `room wall-${wall} floor-${floor} editing`;
    const placed = new Set(layout.map((p) => p.k));
    palette.replaceChildren(
      ...D.items.map((x) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `room-chip${picked === x.k ? ' on' : ''}${placed.has(x.k) ? ' placed' : ''}`;
        b.dataset.k = x.k;
        const icon = document.createElement('span');
        icon.className = 'chip-icon';
        icon.textContent = x.emoji;
        b.append(icon, document.createTextNode(x.name + (placed.has(x.k) ? ' ✓' : '')));
        b.addEventListener('click', () => pick(picked === x.k ? null : x.k));
        return b;
      }),
    );
    document.getElementById('room-walls').replaceChildren(chip(D.walls, wall, (k) => ((wall = k), render()), 'wall'));
    document.getElementById('room-floors').replaceChildren(chip(D.floors, floor, (k) => ((floor = k), render()), 'floor'));
    tools.hidden = !picked;
    if (picked) {
      pickedLabel.textContent = `${nameOf(picked)} 고름`;
      tools.querySelector('[data-act="remove"]').disabled = picked === D.me || !layout.some((p) => p.k === picked);
    }
  }

  function pick(k) {
    picked = k;
    if (k) {
      const s = sizeOf(k);
      say(`${nameOf(k)}: ${s.zone === 'wall' ? '위쪽 벽' : '아래쪽 바닥'}의 빈칸을 누르면 놓여요.`);
    } else say('아래 가구를 누른 다음, 방의 빈칸을 누르면 놓여요. 놓인 가구를 누르면 옮기거나 치울 수 있어요.');
    render();
  }

  room.addEventListener('click', (e) => {
    if (!room.classList.contains('editing')) return;
    const hit = e.target instanceof Element ? e.target.closest('.room-item') : null;
    if (hit && !picked) return pick(hit.dataset.k);
    if (!picked) return;
    const r = room.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * D.cols);
    const y = Math.floor(((e.clientY - r.top) / r.height) * D.rows);
    const s = sizeOf(picked);
    // 2칸짜리는 누른 칸을 왼쪽/위로 맞춰 보고, 안 되면 한 칸 당겨서 놓아 봐요
    const spots = [
      [x, y],
      [x - 1, y],
      [x, y - 1],
      [x - 1, y - 1],
    ].filter(([sx, sy]) => sx > x - s.w && sy > y - s.h);
    const spot = spots.find(([sx, sy]) => fits(picked, sx, sy));
    if (!spot) {
      if (hit && hit.dataset.k !== picked) return pick(hit.dataset.k);
      say(`여기엔 못 놓아요. ${s.zone === 'wall' ? '벽 장식은 위쪽 벽에만' : '가구는 아래쪽 바닥에만'}, 빈칸에 놓을 수 있어요.`);
      return;
    }
    layout = layout.filter((p) => p.k !== picked).concat({ k: picked, x: spot[0], y: spot[1] });
    pick(null);
  });

  tools.addEventListener('click', (e) => {
    const act = e.target instanceof Element ? e.target.closest('[data-act]')?.getAttribute('data-act') : null;
    if (act === 'remove' && picked && picked !== D.me) layout = layout.filter((p) => p.k !== picked);
    if (act) pick(null);
  });

  form.addEventListener('submit', () => {
    form.elements.layout.value = JSON.stringify(layout);
    form.elements.wall.value = wall;
    form.elements.floor.value = floor;
  });

  editBtn.hidden = false;
  editBtn.addEventListener('click', () => {
    editBtn.hidden = true;
    editor.hidden = false;
    render();
    editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
})();
