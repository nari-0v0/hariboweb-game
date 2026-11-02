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
