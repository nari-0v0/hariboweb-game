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
    // 겜블장처럼 같은 화면으로 바로 돌아오는 폼은 로딩 화면을 띄우지 않아요(data-no-loader, 나리 2026-11-15)
    if (e.target instanceof HTMLFormElement && e.target.hasAttribute('data-no-loader')) return;
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

// 꾸밈 캐릭터를 누르면 큰 내 카드 그림만 바꿔 끼워 봐요(저장·구매 전 미리보기). 잠긴 보상 캐릭터도 볼 수 있어요.
(() => {
  document.addEventListener('click', (e) => {
    const pick = e.target instanceof Element && e.target.closest('[data-preview-deco]');
    const img = pick && document.querySelector('.stage-wrap .card .c-avatar');
    const id = pick && pick.dataset.previewDeco;
    if (!img || !id || !/^[a-z0-9-]+$/.test(id)) return;
    img.src = `/char/deco/${id}.png`;
    const ax = Number(pick.dataset.ax) || 0;
    if (ax) img.style.setProperty('--ax', `${ax}%`);
    else img.style.removeProperty('--ax');
    document.querySelectorAll('.deco-pick.previewing').forEach((x) => x.classList.remove('previewing'));
    pick.classList.add('previewing');
    const card = img.closest('.card');
    const r = card.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();

// 원정대 자동 선택(방치): 켜 두면 잠깐마다 "알아서 하기"를 보내고 화면 속 원정 부분만 바꿔 끼워요.
(() => {
  const KEY = 'jr-auto';
  // 저장 공간을 못 쓰는 브라우저에서도 이 탭에서는 켠 상태가 유지되게 메모리에도 들고 있어요.
  let mem = false;
  try { mem = localStorage.getItem(KEY) === '1'; } catch {}
  // 켜 둔 채 자리를 비우지 않게 1시간마다 한 번 확인해요(나리 2026-11-21). 켠 시각을 기억해요.
  const SINCE = 'jr-auto-since';
  const HOUR = 60 * 60 * 1000;
  let since = 0;
  try { since = Number(localStorage.getItem(SINCE)) || 0; } catch {}
  const mark = (t) => { since = t; try { t ? localStorage.setItem(SINCE, String(t)) : localStorage.removeItem(SINCE); } catch {} };
  if (mem && (!since || since > Date.now())) mark(Date.now());
  const get = () => mem;
  const set = (on) => {
    if (on && !mem) mark(Date.now());
    if (!on) mark(0);
    mem = !!on;
    try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {}
  };
  let timer = 0;
  let busy = false;
  let fails = 0; // 연결이 잠깐 끊긴 횟수(이어서). 3번이면 멈추고 알려 줘요(점검 W166)
  // 자동은 끌 때까지 계속 켜져 있어요(나리 2026-11-21, 처음처럼). 그만두기를 누르면 꺼져요. 단, 켠 지 1시간이 지나면 판이 끝날 때 「계속하기」를 눌러야 이어져요.
  // 판이 끝나면 결과를 보여 주고 5초 기다린 뒤(남은 초를 보여 줘요) 같은 장으로 다시 떠나요. 준비물은 사지 않아요.
  if (['quit', 'daycap'].includes(new URLSearchParams(location.search).get('n') ?? '')) set(false);
  // 그만두기를 누르면 바로 자동을 꺼요. 자동 요청이 가는 중이면 끝나길 기다렸다가 새 순번으로 그만둬요(Codex 전체 점검).
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || !f.matches('form.jr-quit')) return;
    set(false);
    clearTimeout(timer);
    if (!busy) return;
    e.preventDefault();
    const wait = setInterval(() => {
      if (busy) return;
      clearInterval(wait);
      const latest = document.querySelector('form.jr-quit');
      if (latest) latest.submit();
    }, 100);
  }, true);
  const again = document.querySelector('.jr-result form.jr-chapters');
  if (again && get()) {
    // 결과가 실제로 보이는 때부터 5초를 세요(움직임 줄이기면 결과가 바로 보여요. 아래 마지막 싸움 처리와 같은 규칙)
    const finalWait = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Number(document.querySelector('[data-final-wait]')?.getAttribute('data-final-wait')) || 0;
    const depart = () => {
      again.querySelectorAll('input[name="kit"]').forEach((k) => { k.checked = false; });
      again.requestSubmit ? again.requestSubmit() : again.submit();
    };
    // 다른 탭에서 「계속하기」를 눌렀을 수 있어서, 쓸 때마다 저장된 시각을 다시 읽어요(Codex #303).
    const fresh = () => { try { since = Number(localStorage.getItem(SINCE)) || since; } catch {} return Date.now() - since < HOUR; };
    // 보통은 5초 세고 같은 장으로 다시 떠나요.
    const countdown = () => {
      const box = document.createElement('div');
      box.className = 'jr-autonext';
      box.setAttribute('role', 'status');
      box.innerHTML = '<span class="jr-autonext-spin" aria-hidden="true"></span><b>🤖 자동: <span data-left>5</span>초 뒤 같은 장으로 다시 떠나요</b><button type="button" class="btn btn-ghost">그만하기</button>';
      let left = 5;
      let t = 0;
      const stop = () => { clearInterval(t); box.remove(); };
      box.querySelector('button').addEventListener('click', () => { set(false); stop(); });
      document.body.append(box);
      t = setInterval(() => {
        left -= 1;
        box.querySelector('[data-left]').textContent = String(Math.max(0, left));
        if (left > 0 || !get()) return;
        stop();
        depart();
      }, 1000);
    };
    // 켠 지 1시간이 지났으면 다시 떠나지 않고 「계속하기」를 눌러야 이어져요(누르면 다시 1시간).
    const ask = () => {
      const box = document.createElement('div');
      box.className = 'jr-autonext jr-autoask';
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-label', '자동 계속 확인');
      box.innerHTML = '<b>🤖 자동으로 1시간 돌았어요. 계속 돌릴까요?</b><button type="button" class="btn" data-go>계속하기</button><button type="button" class="btn btn-ghost" data-stop>그만하기</button>';
      // 다른 탭에서 계속하기를 누르면 이 창은 닫고 보통처럼 5초 뒤 떠나요. 그만하기를 누르면 이 창도 닫아요.
      const onStore = (e) => {
        if (e.key === KEY && e.newValue !== '1') { mem = false; close(); return; }
        if (e.key === SINCE && fresh()) { close(); if (get()) countdown(); }
      };
      const close = () => { removeEventListener('storage', onStore); box.remove(); };
      addEventListener('storage', onStore);
      box.querySelector('[data-stop]').addEventListener('click', () => { set(false); close(); });
      box.querySelector('[data-go]').addEventListener('click', () => {
        if (!get()) { close(); return; }
        removeEventListener('storage', onStore);
        if (!fresh()) mark(Date.now());
        box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        depart();
      });
      document.body.append(box);
      box.querySelector('[data-go]').focus({ preventScroll: true });
    };
    setTimeout(() => {
      if (!get()) return;
      if (fresh()) countdown();
      else ask();
    }, finalWait);
  }
  const sync = () => {
    const box = document.querySelector('[data-auto-toggle]');
    if (!box) return;
    box.hidden = false;
    const on = get();
    box.querySelector('input').checked = on;
    box.classList.toggle('on', on);
    document.querySelector('[data-journey-play]')?.classList.toggle('jr-idling', on);
    clearTimeout(timer);
    // 싸움 모션이 있으면 다 보여 준 뒤에 다음으로 넘어가요. 싸움 없는 날은 0.5초만 쉬어요(나리 2026-11-15, 예전 1.3초).
    const wait = Number(document.querySelector('[data-wait]')?.getAttribute('data-wait')) || 0;
    if (on) timer = setTimeout(tick, Math.max(500, wait, fails * 3000)); // 연결이 끊겼으면 3초·6초 뒤 다시 해 봐요
  };
  async function tick() {
    const form = document.querySelector('form[data-idle]');
    if (!form || !get() || busy) return;
    busy = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin' });
      const url = new URL(res.url);
      if (!res.ok || url.searchParams.has('n') && url.searchParams.get('n') !== 'stale') {
        // 멈춘 이유(오류 안내 등)를 볼 수 있게 그 화면으로 가요.
        set(false);
        // 리다이렉트 없이 오류(500·503)면 res.url은 POST 전용 주소라, 그 대신 지금 화면을 다시 열어요.
        if (res.redirected) location.href = res.url;
        else location.reload();
        return;
      }
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const next = doc.getElementById('journey');
      const cur = document.getElementById('journey');
      if (!next || !cur || url.searchParams.has('r')) {
        // 원정이 끝나면 결과 화면으로(자동은 켜진 채로, 결과 화면에서 5초 뒤 다시 떠나요). POST 주소면 지금 화면을 다시 열어요.
        if (res.redirected) location.href = res.url;
        else location.reload();
        return;
      }
      const open = cur.querySelector('details')?.open;
      cur.replaceWith(next);
      // 그만두기 버튼은 바꿔 끼우는 부분 밖에 있어서 판 순번만 새 값으로 맞춰요.
      const rev = doc.querySelector('.jr-quit input[name="rev"]');
      const mine = document.querySelector('.jr-quit input[name="rev"]');
      if (rev && mine) mine.value = rev.value;
      if (open) next.querySelector('details')?.setAttribute('open', '');
      fails = 0;
    } catch {
      fails += 1;
      if (fails >= 3) {
        set(false);
        fails = 0;
        const box = document.querySelector('[data-auto-toggle]');
        if (box && !box.querySelector('.jr-auto-err')) box.insertAdjacentHTML('beforeend', '<small class="jr-auto-err">연결이 끊겨서 자동을 멈췄어요. 다시 켜 주세요.</small>');
      }
    } finally {
      busy = false;
      sync();
    }
  }
  document.addEventListener('change', (e) => {
    const box = e.target instanceof Element && e.target.closest('[data-auto-toggle]');
    if (!box) return;
    box.querySelector('.jr-auto-err')?.remove();
    set(e.target.checked);
    sync();
  });
  sync();
})();

// 원정대가 끝난 날: 마지막 싸움을 평소 진행 화면 모양으로 보여 준 뒤, 모션이 끝나면 결과로 바꿔요(화면 길이로 미리 알 수 없게).
(() => {
  const result = document.querySelector('[data-final-wait]');
  const fight = document.querySelector('.jr-final-fight');
  if (!result || !fight) return;
  const show = () => {
    fight.remove();
    result.id = 'now';
    result.hidden = false;
    result.scrollIntoView({ block: 'start' });
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(show, reduced ? 0 : Number(result.getAttribute('data-final-wait')) || 0);
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
  // 그림을 끌어서 바탕화면 등에 저장하지 못하게 해요
  document.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
  });
  // 글 입력칸에서는 붙여넣기 메뉴가 필요해서 우클릭을 그대로 둬요
  document.addEventListener('contextmenu', (e) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
  });

  let cover = null;
  const makeCover = () => {
    const el = document.createElement('div');
    el.className = 'devtools-cover';
    el.textContent = '개발자 도구를 닫아 주세요. 닫으면 다시 이용할 수 있어요.';
    return el;
  };
  // 멈추는 줄은 따로 만든 아주 작은 조각에 넣어요. 개발자 도구가 멈출 때 이 조각만 열려서,
  // app.js의 다른 코드 대신 "닫아 주세요" 한 줄만 보여요.
  const pause = new Function('debugger; // 개발자 도구를 닫아 주세요. 닫으면 다시 이용할 수 있어요.\n//# sourceURL=close-devtools');
  const check = () => {
    // 멈추기 바로 전에 가림막을 먼저 덮어요. 개발자 도구가 열려 있으면 멈춘 동안 화면이 가려져 있어요.
    // 닫혀 있으면 같은 순간(화면을 다시 그리기 전)에 바로 걷어서 깜빡이지 않아요.
    const shade = cover ? null : document.body.appendChild(makeCover());
    const start = performance.now();
    // 개발자 도구가 닫혀 있으면 아무 일도 안 하고, 열려 있으면 여기서 멈춰요
    pause();
    const open = performance.now() - start > 100;
    if (open && !cover) {
      cover = shade || makeCover();
      cover.setAttribute('role', 'alert');
      // 화면 내용을 통째로 지워서, 개발자 도구의 Elements 칸에도 가림막만 보이게 해요(닫으면 새로고침으로 되살려요)
      document.body.replaceChildren(cover);
    } else {
      shade?.remove();
      if (!open && cover) location.reload();
    }
  };
  setInterval(check, 1000);
})();

// 같이 배정되지 않기: 이름으로 멤버 목록 좁히기
(() => {
  document.querySelectorAll('input[data-filter]').forEach((input) => {
    const select = document.getElementById(input.dataset.filter);
    if (!select) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      let first = null;
      for (const opt of select.options) {
        const show = !q || opt.textContent.toLowerCase().includes(q);
        opt.hidden = !show;
        if (show && !first) first = opt;
      }
      // 맞는 멤버가 없으면 이전 선택도 지워요. 안 보이는 사람이 신청되지 않게요(select의 required가 제출을 막아요).
      if (!first) select.selectedIndex = -1;
      else if (select.selectedIndex < 0 || select.options[select.selectedIndex].hidden) first.selected = true;
    });
  });
})();

// 칭호: 이름으로 찾기. 맞는 칭호만 남기고 그 묶음을 펼쳐요. 지우면 처음 모양으로 돌아가요.
(() => {
  const input = document.querySelector('input[data-title-search]');
  if (!input) return;
  const groups = [...document.querySelectorAll('.title-group')];
  const none = document.querySelector('.title-search-none');
  const norm = (v) => v.replace(/[「」\s]/g, '').toLowerCase();
  groups.forEach((g) => (g.dataset.wasOpen = g.open ? '1' : ''));
  input.addEventListener('input', () => {
    const q = norm(input.value);
    let any = false;
    for (const g of groups) {
      let hit = 0;
      g.querySelectorAll('.title-cell, .title-item').forEach((cell) => {
        const name = cell.querySelector('.title-chip')?.textContent || '';
        const show = !q || norm(name).includes(q);
        cell.hidden = !show;
        if (show) hit++;
      });
      g.hidden = !!q && !hit;
      g.open = q ? hit > 0 : g.dataset.wasOpen === '1';
      if (hit) any = true;
    }
    if (none) none.hidden = !q || any;
  });
  // 사용자가 직접 펼치거나 접은 모양은 검색을 지울 때 그대로 돌아오게 기억해요
  groups.forEach((g) => g.addEventListener('toggle', () => !norm(input.value) && (g.dataset.wasOpen = g.open ? '1' : '')));
})();

// "사용하기"처럼 아래 입력칸으로 보내는 링크: 그 칸으로 내려가서 바로 글을 쓸 수 있게 해요
document.addEventListener('click', (e) => {
  const link = e.target instanceof Element && e.target.closest('a[data-focus]');
  const field = link && document.getElementById(link.dataset.focus);
  if (!field) return;
  e.preventDefault();
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.focus({ preventScroll: true });
});

// 알림함(🔔): 누르면 오른쪽 위에 팝업으로 열려요. 열면 다 읽은 걸로 되고 빨간 점이 꺼져요.
(() => {
  const pop = document.getElementById('alert-pop');
  const btn = document.querySelector('[data-alert-open]');
  if (!pop || !btn) return;
  const close = () => {
    pop.hidden = true;
    btn.classList.remove('on');
  };
  // 종 바로 아래에 붙이고, 말풍선 꼬리가 종 가운데를 가리키게 해요
  const place = () => {
    const r = btn.getBoundingClientRect();
    const right = Math.max(16, Math.min(innerWidth - r.right - 4, innerWidth - 16 - pop.offsetWidth));
    pop.style.top = `${Math.round(r.bottom + 20)}px`;
    pop.style.right = `${Math.round(right)}px`;
    pop.style.setProperty('--tail', `${Math.round(innerWidth - right - (r.left + r.width / 2))}px`);
  };
  addEventListener('resize', () => !pop.hidden && place());
  const render = (html) => {
    pop.innerHTML = html;
    pop.hidden = false;
    place();
    btn.classList.add('on');
    btn.querySelector('.alert-dot')?.remove();
  };
  btn.addEventListener(
    'click',
    async (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (!pop.hidden) return close();
      try {
        const r = await fetch('/alerts?box=1', { headers: { 'X-Alert-Box': '1' }, credentials: 'same-origin' });
        if (!r.ok) throw new Error(String(r.status));
        render(await r.text());
      } catch {
        location.href = '/alerts';
      }
    },
    true,
  );
  pop.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-alert-close]')) close();
  });
  pop.addEventListener(
    'submit',
    async (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-alert-form')) return;
      e.preventDefault();
      try {
        const r = await fetch(form.action, { method: 'POST', headers: { 'X-Alert-Box': '1' }, credentials: 'same-origin' });
        if (!r.ok) throw new Error(String(r.status));
        render(await r.text());
      } catch {
        form.submit();
      }
    },
    true,
  );
  document.addEventListener('click', (e) => {
    if (pop.hidden || !(e.target instanceof Element)) return;
    if (!e.target.closest('#alert-pop') && !e.target.closest('[data-alert-open]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) close();
  });
})();

// 업데이트 현황: 위 메뉴 버튼에 새 줄 점. 업데이트 현황 화면을 열면 본 것으로 기억해요(브라우저에만, DB는 안 읽어요).
(() => {
  const KEY = 'upd-seen';
  let seen = null;
  try { seen = localStorage.getItem(KEY); } catch {}
  const page = document.querySelector('[data-upd-seen]');
  if (page) {
    seen = page.getAttribute('data-upd-seen');
    try { localStorage.setItem(KEY, seen); } catch {}
  }
  const btn = document.querySelector('[data-upd]');
  const dot = btn && btn.querySelector('.upd-dot');
  if (dot) dot.hidden = !btn.getAttribute('data-upd') || btn.getAttribute('data-upd') === seen;
})();

// 주소 끝 #이름이 접힌 안내 칸(details)이면 펼쳐요(버닝타임 띠 → 안내 #burning)
(() => {
  const open = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  };
  open();
  addEventListener('hashchange', open);
})();

// 상점 결과 알림 창: '확인'을 키보드(Enter·스페이스·Esc)로도 닫아요. 열리면 '확인'에 초점을 둬요.
(() => {
  const box = document.getElementById('popup-close');
  const ok = document.querySelector('label[for="popup-close"]');
  if (!box || !ok) return;
  const close = () => {
    box.checked = true;
  };
  ok.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      close();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.checked) close();
  });
  if (!box.checked) ok.focus({ preventScroll: true });
})();
