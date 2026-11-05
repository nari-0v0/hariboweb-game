// 화면 조작만 담당하고 정답·진행·보상은 서버에서 검증해요.
(() => {
  const cache = new Map();
  let stopWatching = () => {};
  function enhance() {
  stopWatching();
  const root = document.querySelector('[data-interaction-key]');
  if (!root) return;
  const key = `haribo-workbench:${root.dataset.interactionKey}`;
  let memory = cache.get(key) || {};
  try { if (!cache.has(key)) memory = JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || '{}'); } catch { /* 기기 저장 없이도 플레이 가능 */ }
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) memory = {};
  if (!memory.drafts || typeof memory.drafts !== 'object' || Array.isArray(memory.drafts)) memory.drafts = {};
  const remember = () => { cache.set(key, memory); try { localStorage.setItem(key, JSON.stringify(memory)); } catch {} };
  const formKey = form => `${form.querySelector('[name="action"]').value}:${form.dataset.prefix || ''}`;
  const setChoice = (form, value) => { const field = form?.querySelector('input[name="choice"]'); if (field) field.value = value; };
  const status = (node, text) => { if (node) node.textContent = text; };
  function room(id) {
    root.querySelectorAll('[data-room-scene]').forEach(n => { n.hidden = n.dataset.roomScene !== id; });
    root.querySelectorAll('[data-room-button]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.roomButton === id)));
    memory.room = id; remember();
  }
  root.querySelectorAll('[data-room-button]').forEach(n => n.addEventListener('click', () => room(n.dataset.roomButton)));
  room(memory.room || '0');
  const aid = root.querySelector('[data-aid-toggle]');
  const help = () => { root.classList.toggle('aids-on', !!memory.aids); if (aid) { aid.setAttribute('aria-pressed', String(!!memory.aids)); aid.textContent = memory.aids ? '조사 위치 도움 끄기' : '조사 위치 도움 켜기'; } };
  aid?.addEventListener('click', () => { memory.aids = !memory.aids; remember(); help(); }); help();
  root.querySelectorAll('[data-open-object]').forEach(n => n.addEventListener('click', () => {
    const dialog = [...root.querySelectorAll('[data-object-dialog]')].find(d => d.dataset.objectDialog === n.dataset.openObject);
    memory.openObject = n.dataset.openObject; remember();
    dialog?.showModal();
  }));
  root.querySelectorAll('[data-object-dialog]').forEach(d => d.addEventListener('close', () => { memory.openObject = null; remember(); }));
  root.querySelectorAll('[data-close-dialog]').forEach(n => n.addEventListener('click', () => n.closest('dialog').close()));

  for (const puzzle of root.querySelectorAll('[data-arrange]')) {
    let selected = null;
    const form = puzzle.closest('form'), draftKey = formKey(form);
    const pieces = [...puzzle.querySelectorAll('[data-piece]')], slots = [...puzzle.querySelectorAll('[data-slot]')];
    const update = () => {
      const ids = slots.map(n => n.dataset.placed || '');
      const complete = ids.every(Boolean);
      setChoice(puzzle.closest('form'), (puzzle.closest('form').dataset.prefix || '') + ids.join(','));
      status(puzzle.querySelector('[data-arrange-status]'), complete ? '모든 칸을 채웠어요. 복원한 내용을 확인해 보세요.' : `${ids.filter(Boolean).length}/${slots.length} 조각 배치`);
      pieces.forEach(n => { n.classList.toggle('placed', ids.includes(n.dataset.piece)); n.setAttribute('aria-pressed', String(selected === n.dataset.piece)); });
      memory.drafts[draftKey] = { pieces: ids }; remember();
    };
    const place = (slot, id) => {
      const piece = pieces.find(n => n.dataset.piece === id);
      if (!piece) return;
      slots.forEach(n => { if (n.dataset.placed === id) { delete n.dataset.placed; n.textContent = `${Number(n.dataset.slot) + 1}. 여기에 놓기`; } });
      slot.dataset.placed = id; slot.textContent = piece.textContent; selected = null; update();
    };
    pieces.forEach(n => {
      n.addEventListener('click', () => { selected = n.dataset.piece; update(); });
      n.addEventListener('dragstart', e => { selected = n.dataset.piece; e.dataTransfer.setData('text/plain', selected); e.dataTransfer.effectAllowed = 'move'; });
    });
    slots.forEach(n => {
      n.addEventListener('click', () => { if (selected) place(n, selected); else { delete n.dataset.placed; n.textContent = `${Number(n.dataset.slot) + 1}. 여기에 놓기`; update(); } });
      n.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      n.addEventListener('drop', e => { e.preventDefault(); place(n, e.dataTransfer.getData('text/plain')); });
    });
    const saved = memory.drafts[draftKey]?.pieces, used = new Set();
    if (Array.isArray(saved)) slots.forEach((slot, i) => { const p = pieces.find(n => n.dataset.piece === saved[i]); if (p && !used.has(saved[i])) { slot.dataset.placed = saved[i]; slot.textContent = p.textContent; used.add(saved[i]); } });
    update();
    puzzle.closest('form').addEventListener('submit', e => {
      if (!slots.every(n => n.dataset.placed)) { e.preventDefault(); status(puzzle.querySelector('[data-arrange-status]'), '빈칸을 모두 채워 주세요.'); }
    });
  }
  root.querySelectorAll('[data-clock], [data-code], [data-align]').forEach(n => {
    const draftKey = formKey(n.closest('form')), saved = memory.drafts[draftKey]?.value;
    if (typeof saved === 'string' && saved.length <= 24) n.value = saved;
    const update = () => {
      const form = n.closest('form'); setChoice(form, form.dataset.prefix + n.value);
      if (n.matches('[data-align]')) { status(form.querySelector('[data-align-output]'), n.value); const wave = form.querySelector('[data-wave]'); if (wave) wave.style.transform = `translateX(${Number(n.value) * 12}px)`; }
      memory.drafts[draftKey] = { value: n.value }; remember();
    };
    n.addEventListener('input', update); update();
  });
  const board = root.querySelector('[data-evidence-board]');
  if (board) {
    let picked = [];
    const cards = [...board.querySelectorAll('[data-evidence]')], form = board.closest('form');
    const update = () => {
      cards.forEach(n => n.setAttribute('aria-pressed', String(picked.includes(n.dataset.evidence))));
      setChoice(form, picked.join('>'));
      status(form.querySelector('[data-connect-status]'), picked.length === 2 ? '두 증거를 골랐어요. 연결선을 기록하세요.' : '연결할 증거 두 장을 고르세요.');
      memory.picked = picked; remember();
    };
    cards.forEach(n => {
      n.addEventListener('click', () => { const id = n.dataset.evidence; picked = picked.includes(id) ? picked.filter(p => p !== id) : [...(picked.length === 2 ? [] : picked), id]; update(); });
      n.addEventListener('dragstart', e => { picked = [n.dataset.evidence]; e.dataTransfer.setData('text/plain', n.dataset.evidence); });
      n.addEventListener('dragover', e => e.preventDefault());
      n.addEventListener('drop', e => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain'); if (from !== n.dataset.evidence && cards.some(c => c.dataset.evidence === from)) { picked = [from, n.dataset.evidence]; update(); } });
    });
    form.addEventListener('submit', e => { if (picked.length !== 2) { e.preventDefault(); update(); } });
    const draw = () => {
      const svg = board.querySelector('svg'), rect = board.getBoundingClientRect(); svg.replaceChildren();
      for (const link of JSON.parse(board.dataset.links || '[]')) {
        const ends = link.split('>').map(id => cards.find(n => n.dataset.evidence === id));
        if (!ends.every(Boolean)) continue;
        const [a, b] = ends.map(n => n.getBoundingClientRect()), line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.left - rect.left + a.width / 2)); line.setAttribute('y1', String(a.top - rect.top + 12));
        line.setAttribute('x2', String(b.left - rect.left + b.width / 2)); line.setAttribute('y2', String(b.top - rect.top + 12)); svg.append(line);
      }
    };
    const observer = new ResizeObserver(draw); observer.observe(board); stopWatching = () => observer.disconnect(); draw();
    if (Array.isArray(memory.picked)) picked = [...new Set(memory.picked)].filter(id => cards.some(n => n.dataset.evidence === id)).slice(0, 2);
    if (JSON.parse(board.dataset.links || '[]').includes([...picked].sort().join('>'))) picked = [];
    update();
  }
  function crew(id) {
    root.querySelectorAll('[data-map-crew]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.mapCrew === id)));
    root.querySelectorAll('.map-scout-form input[name="choice"], .map-skill-form input[name="choice"]').forEach(n => { n.value = n.value.split(':')[0] + ':' + id; });
    root.querySelectorAll('[data-skill-options]').forEach(n => { const option = JSON.parse(n.dataset.skillOptions)[Number(id)]; if (!option) return; const b = n.querySelector('button[type="submit"]'); b.textContent = option.label; b.disabled = !!option.why; status(n.querySelector('[data-skill-reason]'), option.why || '이 특기를 지금 사용할 수 있어요.'); });
    const info = root.querySelector('[data-crew-skill-info]'); if (info) info.textContent = JSON.parse(info.dataset.roleDescriptions)[Number(id)] || '';
    memory.crew = id; remember();
  }
  function tile(id) {
    root.querySelectorAll('[data-tile-detail]').forEach(n => { n.hidden = n.dataset.tileDetail !== id; });
    root.querySelectorAll('[data-map-cell]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.mapCell === id)));
    const prompt = root.querySelector('[data-no-cell]'); if (prompt) prompt.hidden = true;
    memory.tile = id; remember();
  }
  root.querySelectorAll('[data-map-crew]').forEach(n => n.addEventListener('click', () => crew(n.dataset.mapCrew)));
  root.querySelectorAll('[data-map-cell]').forEach(n => n.addEventListener('click', () => tile(n.dataset.mapCell)));
  crew(memory.crew || '0'); if (memory.tile !== undefined) tile(memory.tile);
  const open = [...root.querySelectorAll('[data-object-dialog]')].find(d => d.dataset.objectDialog === memory.openObject && d.querySelector('form'));
  if (open) { const message = document.querySelector('#now .exp-outcome'); if (message) { const p = document.createElement('p'); p.className = 'inspection-feedback'; p.textContent = message.textContent; open.querySelector('h3').after(p); } open.showModal(); }
  }
  enhance();

  let pending = false;
  function feedback(text, retry = false) {
    let box = document.querySelector('[data-save-feedback]');
    if (!box) { box = document.createElement('div'); box.dataset.saveFeedback = ''; box.className = 'save-feedback'; box.setAttribute('role', 'status'); (document.querySelector('dialog[open]') || document.querySelector('#now') || document.querySelector('.story'))?.prepend(box); }
    box.replaceChildren(document.createTextNode(text));
    if (retry) { const b = document.createElement('button'); b.className = 'btn btn-small'; b.type = 'button'; b.textContent = '저장 상태 확인'; b.addEventListener('click', () => refresh(location.href)); box.append(b); }
  }
  async function renderResponse(response, scroll) {
    if (!response.ok) throw new Error(`http_${response.status}`);
    const url = new URL(response.url), parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const fresh = parsed.querySelector('.story'), old = document.querySelector('.story');
    if (url.origin !== location.origin || !['/cases/story', '/expedition/story'].includes(url.pathname) || !fresh || !old) throw new Error('unexpected_page');
    const before = new Map([...old.querySelectorAll('[data-map-cell]')].map(n => [n.dataset.mapCell, n.className]));
    old.replaceWith(document.importNode(fresh, true)); history.replaceState(null, '', url.href);
    enhance(); window.scrollTo(scroll.x, scroll.y);
    document.querySelectorAll('[data-map-cell]').forEach(n => { const prev = before.get(n.dataset.mapCell); if (prev && prev !== n.className) n.classList.add('tile-updated'); });
  }
  async function load(url, options, scroll) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try { await renderResponse(await fetch(url, { ...options, signal: controller.signal }), scroll); }
    finally { clearTimeout(timer); }
  }
  async function refresh(url) {
    if (pending) return; pending = true;
    try { await load(url, { credentials: 'same-origin', cache: 'no-store' }, { x: scrollX, y: scrollY }); }
    catch { feedback('기록을 불러오지 못했어요. 연결 상태를 확인한 뒤 다시 확인해 주세요.', true); }
    finally { pending = false; }
  }
  document.addEventListener('submit', async e => {
    const form = e.target;
    if (e.defaultPrevented || !(form instanceof HTMLFormElement) || !form.closest('.story') || new URL(form.action).pathname !== '/api/story/act') return;
    e.preventDefault(); document.dispatchEvent(new Event('haribo:ready'));
    if (pending) return;
    pending = true;
    const scroll = { x: scrollX, y: scrollY }, buttons = [...document.querySelectorAll('.story button[type="submit"]')].map(b => [b, b.disabled]);
    const body = new URLSearchParams(); new FormData(form).forEach((value, key) => { if (typeof value === 'string') body.append(key, value); });
    buttons.forEach(([b]) => { b.disabled = true; });
    document.querySelector('.story')?.setAttribute('aria-busy', 'true');
    try { await load(form.action, { method: 'POST', body, credentials: 'same-origin', redirect: 'follow' }, scroll); }
    catch { feedback('저장 결과를 확인하지 못했어요. 같은 행동을 다시 보내기 전에 저장 상태를 확인해 주세요.', true); }
    finally { pending = false; buttons.forEach(([b, disabled]) => { b.disabled = disabled; }); document.querySelector('.story')?.removeAttribute('aria-busy'); }
  });
})();
