// 화면 조작만 담당하고 정답·진행·보상은 서버에서 검증해요.
(() => {
  const root = document.querySelector('[data-interaction-key]');
  if (!root) return;
  const key = `haribo-workbench:${root.dataset.interactionKey}`;
  let memory = {};
  try { memory = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { /* 기기 저장 없이도 플레이 가능 */ }
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) memory = {};
  const remember = () => { try { sessionStorage.setItem(key, JSON.stringify(memory)); } catch {} };
  const setChoice = (form, value) => { const field = form?.querySelector('input[name="choice"]'); if (field) field.value = value; };
  const status = (node, text) => { if (node) node.textContent = text; };
  function room(id) {
    root.querySelectorAll('[data-room-scene]').forEach(n => { n.hidden = n.dataset.roomScene !== id; });
    root.querySelectorAll('[data-room-button]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.roomButton === id)));
    memory.room = id; remember();
  }
  root.querySelectorAll('[data-room-button]').forEach(n => n.addEventListener('click', () => room(n.dataset.roomButton)));
  room(memory.room || '0');
  root.querySelectorAll('[data-open-object]').forEach(n => n.addEventListener('click', () => {
    const dialog = [...root.querySelectorAll('[data-object-dialog]')].find(d => d.dataset.objectDialog === n.dataset.openObject);
    dialog?.showModal();
  }));
  root.querySelectorAll('[data-close-dialog]').forEach(n => n.addEventListener('click', () => n.closest('dialog').close()));

  for (const puzzle of root.querySelectorAll('[data-arrange]')) {
    let selected = null;
    const pieces = [...puzzle.querySelectorAll('[data-piece]')], slots = [...puzzle.querySelectorAll('[data-slot]')];
    const update = () => {
      const ids = slots.map(n => n.dataset.placed || '');
      const complete = ids.every(Boolean);
      setChoice(puzzle.closest('form'), (puzzle.closest('form').dataset.prefix || '') + ids.join(','));
      status(puzzle.querySelector('[data-arrange-status]'), complete ? '모든 칸을 채웠어요. 복원한 내용을 확인해 보세요.' : `${ids.filter(Boolean).length}/${slots.length} 조각 배치`);
      pieces.forEach(n => { n.classList.toggle('placed', ids.includes(n.dataset.piece)); n.setAttribute('aria-pressed', String(selected === n.dataset.piece)); });
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
    puzzle.closest('form').addEventListener('submit', e => {
      if (!slots.every(n => n.dataset.placed)) { e.preventDefault(); status(puzzle.querySelector('[data-arrange-status]'), '빈칸을 모두 채워 주세요.'); }
    });
  }
  root.querySelectorAll('[data-clock], [data-code], [data-align]').forEach(n => {
    const update = () => {
      const form = n.closest('form'); setChoice(form, form.dataset.prefix + n.value);
      if (n.matches('[data-align]')) { status(form.querySelector('[data-align-output]'), n.value); const wave = form.querySelector('[data-wave]'); if (wave) wave.style.transform = `translateX(${Number(n.value) * 12}px)`; }
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
    new ResizeObserver(draw).observe(board); draw();
  }
  function crew(id) {
    root.querySelectorAll('[data-map-crew]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.mapCrew === id)));
    root.querySelectorAll('.map-scout-form input[name="choice"]').forEach(n => { n.value = n.value.split(':')[0] + ':' + id; });
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
})();
