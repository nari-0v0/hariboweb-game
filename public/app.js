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

// 원정대처럼 늘 지금 상태여야 하는 화면은 뒤로 가기로 돌아와도 저장된 옛 화면 대신 새로 불러와요
addEventListener('pageshow', (e) => {
  if (e.persisted && document.querySelector('[data-fresh]')) location.reload();
});

// 로딩 화면: 다른 화면으로 넘어갈 때 0.1초 넘게 걸리면 곰젤리가 통통 뛰어요(바로 열리면 안 보여요)
(() => {
  const root = document.documentElement;
  let timer = 0;
  const show = () => {
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.add('loading'), 100);
  };
  const hide = () => {
    clearTimeout(timer);
    root.classList.remove('loading');
  };
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element && e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // 같은 화면 안 이동
    show();
  });
  document.addEventListener('submit', (e) => {
    if (!e.defaultPrevented && !(e.target instanceof HTMLFormElement && e.target.target)) show();
  });
  addEventListener('pageshow', hide);
  document.addEventListener('haribo:ready', hide);
  addEventListener('pagehide', hide);
})();

// 메뉴를 열면 메뉴 속 화면(읽기만 하는 화면)을 바로 미리 받아 둬요. 누르면 거의 바로 열려요.
(() => {
  const toggle = document.getElementById('menu-toggle');
  const rules = document.querySelector('script[type="speculationrules"]');
  if (!toggle || !rules || !HTMLScriptElement.supports?.('speculationrules')) return;
  let done = false;
  toggle.addEventListener('change', () => {
    if (!toggle.checked || done) return;
    done = true;
    try {
      const where = JSON.parse(rules.textContent).prefetch[0].where;
      const s = document.createElement('script');
      s.type = 'speculationrules';
      s.textContent = JSON.stringify({
        prefetch: [{ where: { and: [{ selector_matches: '.menu-panel a' }, where] }, eagerness: 'immediate' }],
      });
      document.head.append(s);
    } catch {}
  });
})();

// 카드 테마를 누르면 큰 내 카드에 바로 입혀 봐요(저장·구매 전 미리보기). 잠긴 테마도 볼 수 있어요.
(() => {
  document.addEventListener('click', (e) => {
    const pick = e.target instanceof Element && e.target.closest('[data-preview-theme]');
    const card = pick && document.querySelector('.stage-wrap .card');
    const id = pick && pick.dataset.previewTheme;
    if (!card || !id || !/^[a-z0-9-]+$/.test(id)) return;
    [...card.classList].forEach((c) => c.startsWith('theme-') && card.classList.remove(c));
    card.classList.add(`theme-${id}`);
    document.querySelectorAll('.previewing').forEach((x) => x.classList.remove('previewing'));
    pick.classList.add('previewing');
    const r = card.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();

// 원정대 자동 선택(방치): 켜 두면 잠깐마다 "알아서 하기"를 보내고 화면 속 원정 부분만 바꿔 끼워요.
(() => {
  const KEY = 'jr-auto';
  const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const set = (on) => { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {} };
  let timer = 0;
  let busy = false;
  const sync = () => {
    const box = document.querySelector('[data-auto-toggle]');
    if (!box) return;
    box.hidden = false;
    const on = get();
    box.querySelector('input').checked = on;
    box.classList.toggle('on', on);
    document.querySelector('[data-journey-play]')?.classList.toggle('jr-idling', on);
    clearTimeout(timer);
    // 싸움 모션이 있으면 다 보여 준 뒤에 다음으로 넘어가요.
    const wait = Number(document.querySelector('[data-wait]')?.getAttribute('data-wait')) || 0;
    if (on) timer = setTimeout(tick, Math.max(1300, wait));
  };
  async function tick() {
    const form = document.querySelector('form[data-idle]');
    if (!form || !get() || busy) return;
    busy = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin' });
      const url = new URL(res.url);
      if (!res.ok || url.searchParams.has('n') && url.searchParams.get('n') !== 'stale') throw new Error('stop');
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const next = doc.getElementById('journey');
      const cur = document.getElementById('journey');
      if (!next || !cur || url.searchParams.has('r')) {
        location.href = res.url; // 원정이 끝나면 결과 화면으로
        return;
      }
      const open = cur.querySelector('details')?.open;
      cur.replaceWith(next);
      if (open) next.querySelector('details')?.setAttribute('open', '');
    } catch {
      set(false);
    } finally {
      busy = false;
      sync();
    }
  }
  document.addEventListener('change', (e) => {
    const box = e.target instanceof Element && e.target.closest('[data-auto-toggle]');
    if (!box) return;
    set(e.target.checked);
    sync();
  });
  sync();
})();

// 게임 화면이 POST 응답으로 바로 올 때: 주소를 원래 화면으로 바꾸고 #now 로 내려가요(새로 고침해도 다시 보내지 않게)
(() => {
  const el = document.querySelector('[data-replace-url]');
  if (!el) return;
  const url = el.getAttribute('data-replace-url');
  history.replaceState(null, '', url);
  const id = url.split('#')[1];
  if (id) document.getElementById(id)?.scrollIntoView();
})();

// 개발자 도구(F12) 막기: 단축키·우클릭을 막고, 개발자 도구가 열리면 화면을 가리고 멈춰요.
// 눈속임용이에요. 칩·젤리·정답은 모두 서버가 정하고 확인해서, 이걸 우회해도 조작은 안 돼요.
(() => {
  const devKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    return e.key === 'F12' ||
      (mod && e.shiftKey && ['KeyI', 'KeyJ', 'KeyC'].includes(e.code)) ||
      (e.metaKey && e.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(e.code)) ||
      (mod && !e.shiftKey && e.code === 'KeyU');
  };
  window.addEventListener('keydown', (e) => {
    if (!devKey(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  // 글 입력칸에서는 붙여넣기 메뉴가 필요해서 우클릭을 그대로 둬요
  document.addEventListener('contextmenu', (e) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
  });

  let cover = null;
  const check = () => {
    const start = performance.now();
    // 개발자 도구가 닫혀 있으면 아무 일도 안 하고, 열려 있으면 여기서 멈춰요
    debugger; // eslint-disable-line no-debugger
    const open = performance.now() - start > 100;
    if (open && !cover) {
      cover = document.createElement('div');
      cover.className = 'devtools-cover';
      cover.setAttribute('role', 'alert');
      cover.textContent = '개발자 도구를 닫아 주세요. 닫으면 다시 이용할 수 있어요.';
      // 화면 내용을 통째로 지워서, 개발자 도구의 Elements 칸에도 가림막만 보이게 해요(닫으면 새로고침으로 되살려요)
      document.body.replaceChildren(cover);
    } else if (!open && cover) {
      location.reload();
    }
  };
  setInterval(check, 1000);
})();
