// 사건파일 수첩: 용의자 카드를 "지우기"로 흐리게 표시해요. 이 기기 브라우저에만 저장돼요.
(() => {
  const box = document.querySelector('[data-run]');
  if (!box) return;
  const key = `case-x:${box.dataset.run}`;
  let crossed = [];
  try {
    crossed = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(crossed)) crossed = [];
  } catch {
    crossed = [];
  }
  const paint = () => {
    for (const btn of box.querySelectorAll('[data-x]')) {
      const on = crossed.includes(btn.dataset.x);
      btn.closest('.suspect')?.classList.toggle('crossed', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '↩ 되살리기' : '✖ 수첩에서 지우기';
    }
  };
  box.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-x]') : null;
    if (!btn) return;
    const id = btn.dataset.x;
    crossed = crossed.includes(id) ? crossed.filter((v) => v !== id) : [...crossed, id];
    try {
      localStorage.setItem(key, JSON.stringify(crossed));
    } catch {
      /* 저장이 막혀도 화면 표시는 돼요 */
    }
    paint();
  });
  paint();
})();
