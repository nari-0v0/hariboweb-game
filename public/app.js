// 카드에 마우스를 올리면 살짝 기울고 빛이 따라와요. 움직임 줄이기 설정이면 꺼져요.
(() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  document.addEventListener('pointermove', (e) => {
    if (calm.matches || !fine.matches) return;
    const tilt = e.target instanceof Element && e.target.closest('.tilt:not(.still)');
    document.querySelectorAll('.tilt.active').forEach((t) => t !== tilt && reset(t));
    if (!tilt) return;
    const r = tilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tilt.classList.add('active');
    tilt.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    tilt.style.setProperty('--ry', `${(x - 0.5) * 18}deg`);
    tilt.style.setProperty('--mx', `${x * 100}%`);
    tilt.style.setProperty('--my', `${y * 100}%`);
  });
  document.documentElement.addEventListener('pointerleave', () => document.querySelectorAll('.tilt.active').forEach(reset));
  function reset(t) {
    t.classList.remove('active');
    t.style.removeProperty('--rx');
    t.style.removeProperty('--ry');
  }
})();

// 메뉴: 키보드(Enter·스페이스)로 열고, Esc나 메뉴 안 링크를 누르면 닫아요
(() => {
  const toggle = document.getElementById('menu-toggle');
  if (!toggle) return;
  document.querySelector('.menu-btn')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle.checked = !toggle.checked;
      if (toggle.checked) document.querySelector('.menu-panel a')?.focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.checked) {
      toggle.checked = false;
      document.querySelector('.menu-btn')?.focus();
    }
  });
  // 뒤로 가기로 돌아왔을 때 메뉴가 열린 채로 남지 않게
  addEventListener('pageshow', () => (toggle.checked = false));
})();
