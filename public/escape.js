// 사건파일 방: 그림을 누르면 톡 하고 돋보기가 떠요. 사건과 상관없는 곳은 짧은 말만 하고,
// 확대 화면은 손가락·마우스로 끌어서 둘러볼 수 있어요.
(() => {
  const room = document.querySelector('[data-room]');
  if (!room) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tap = (e) => {
    const r = room.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'esc-tap';
    dot.style.left = `${((e.clientX - r.left) / r.width) * 100}%`;
    dot.style.top = `${((e.clientY - r.top) / r.height) * 100}%`;
    room.append(dot);
    setTimeout(() => dot.remove(), 700);
    return dot;
  };
  let bubble = null;
  room.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-loupe], .esc-back')) return;
    if (!calm) tap(e);
  });
  room.addEventListener('click', (e) => {
    const idle = e.target instanceof Element && e.target.closest('.esc-hot.idle');
    if (!idle) return;
    bubble?.remove();
    bubble = document.createElement('span');
    bubble.className = 'esc-say';
    bubble.textContent = idle.dataset.say || '';
    const r = room.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    bubble.style.left = `${Math.min(80, Math.max(20, x))}%`;
    bubble.style.top = `${((e.clientY - r.top) / r.height) * 100}%`;
    room.append(bubble);
    const mine = bubble;
    setTimeout(() => mine.remove(), 1800);
  });

  // 확대 화면 끌기
  const lens = room.querySelector('[data-loupe]');
  const img = lens?.querySelector('.esc-loupe-img');
  if (!lens || !img) return;
  // 조금 움직여야 끌기로 봐요. 그냥 누르면 확대 화면 속 물건이 눌려요.
  let start = null;
  let dragged = false;
  lens.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('label')) return;
    start = { x: e.clientX, y: e.clientY, l: img.offsetLeft, t: img.offsetTop, id: e.pointerId };
    dragged = false;
  });
  lens.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (!dragged) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
      dragged = true;
      lens.setPointerCapture(start.id);
      lens.classList.add('dragging');
    }
    const minL = lens.clientWidth - img.offsetWidth;
    const minT = lens.clientHeight - img.offsetHeight;
    img.style.left = `${Math.min(0, Math.max(minL, start.l + e.clientX - start.x))}px`;
    img.style.top = `${Math.min(0, Math.max(minT, start.t + e.clientY - start.y))}px`;
  });
  const end = () => {
    start = null;
    lens.classList.remove('dragging');
  };
  lens.addEventListener('pointerup', end);
  lens.addEventListener('pointercancel', end);
  // 끌고 난 뒤 손을 뗄 때 생기는 클릭은 물건 누르기로 치지 않아요.
  lens.addEventListener(
    'click',
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
})();
