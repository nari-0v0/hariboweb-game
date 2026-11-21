export function nextBet(current, balance, action) {
  if (action === 'clear') return 0;
  if (action === 'all') return balance;
  return current + Math.min(action, balance - current);
}

function canAnimate() {
  return Element.prototype.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function dropCoin(coin) {
  coin.hidden = false;
  try {
    await coin.animate(
      [
        { transform: 'translateY(-3.25rem) scale(1)', opacity: 1 },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: .72 },
        { transform: 'translateY(.75rem) scale(.25)', opacity: 0 },
      ],
      { duration: 600, easing: 'cubic-bezier(.45,.05,.75,.45)' },
    ).finished;
  } finally {
    coin.hidden = true;
  }
}

function initBet(form) {
  const balance = Number(form.dataset.gbBalance);
  const input = form.elements.namedItem('bet');
  const submit = form.querySelector('button[type="submit"]');
  const amount = form.querySelector('output');
  const format = new Intl.NumberFormat('ko-KR');
  const coin = form.closest('.gb-room').querySelector('.gb-dropping-coin');
  let state = 'idle';

  form.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-gb-bet]');
    if (!button || button.disabled) return;
    const action = button.dataset.gbBet;
    const bet = nextBet(Number(input.value), balance, action === 'all' || action === 'clear' ? action : Number(action));
    input.value = String(bet);
    amount.value = `${format.format(bet)}개`;
    submit.disabled = bet === 0;
  });

  form.addEventListener('submit', async (event) => {
    if (state === 'sending' || state === 'dropping' || submit.disabled) {
      event.preventDefault();
      return;
    }
    if (state === 'ready' || !coin || !canAnimate()) {
      state = 'sending';
      return;
    }

    event.preventDefault();
    form.inert = true;
    // 젤칩이 떨어지는 동안 바로 보내요. 다 떨어질 때까지 기다렸다 보내면 그만큼 늦어져요(나리 2026-11-15).
    dropCoin(coin).catch(() => {
      // A canceled animation should not block a valid bet.
    });
    state = 'ready';
    // submit 이벤트 안에서는 다시 보낼 수 없어서 한 박자 뒤에 보내요.
    setTimeout(() => form.requestSubmit(), 0);
  });

  addEventListener('pagehide', () => { state = 'idle'; });
  addEventListener('pageshow', (event) => {
    // 뒤로 가기로 돌아온 화면은 이미 쓴 베팅 표를 들고 있어서 새로 불러와요.
    if (event.persisted) location.reload();
  });
}

function spinReels(stage) {
  return [...stage.querySelectorAll('.gb-reel-strip')].map((strip, i) => strip.animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% + var(--gb-reel-size) - 4px))' }],
    { duration: 1200 + 400 * i, easing: 'cubic-bezier(.2,.6,.55,1)', fill: 'both' },
  ));
}

function spinWheel(stage) {
  const disc = stage.querySelector('.gb-wheel-disc');
  const stop = Number.parseFloat(disc.style.getPropertyValue('--gb-wheel-stop'));
  return [disc.animate(
    [{ transform: 'rotate(0deg)' }, { transform: `rotate(${5 * 360 + stop}deg)` }],
    { duration: 3000, easing: 'cubic-bezier(.12,.7,.15,1)', fill: 'both' },
  )];
}

function dealCards(stage) {
  // 카드 더미는 화면에 두지 않아요(가시성). 카드는 판 위쪽 가운데에서 날아와요.
  const table = stage.querySelector('.gb-card-table').getBoundingClientRect();
  const deck = { left: table.left + table.width / 2, top: table.top - 40 };
  const animations = [];
  for (const card of stage.querySelectorAll('[data-gb-deal]')) {
    const delay = Number(card.dataset.gbDeal) * 300;
    const turn = card.querySelector('.gb-card-turn');
    const hidden = !card.querySelector('.gb-card-front');

    if (card.dataset.gbFlip !== 'yes') {
      const target = card.getBoundingClientRect();
      animations.push(card.animate(
        [
          { opacity: 0, transform: `translate(${deck.left - target.left}px, ${deck.top - target.top}px) scale(.7)` },
          { opacity: 1, transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 300, delay, easing: 'ease-out', fill: 'both' },
      ));
    }
    if (!hidden) {
      animations.push(turn.animate(
        [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
        { duration: 300, delay, easing: 'ease-in-out', fill: 'both' },
      ));
    }
  }
  return animations;
}

function tossCoin(stage) {
  // 위로 던졌다가 떨어지면서 여러 바퀴 뒤집혀 결과 면으로 멈춰요.
  const coin = stage.querySelector('.gb-coin');
  const toss = stage.querySelector('.gb-coin-toss');
  const end = Number.parseFloat(coin.style.getPropertyValue('--gb-coin-end')) || 0;
  const duration = 1800;
  return [
    coin.animate(
      [{ transform: 'rotateX(0deg)' }, { transform: `rotateX(${8 * 360 + end}deg)` }],
      { duration, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'both' },
    ),
    toss.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-45%) scale(1.15)', offset: .45 },
        { transform: 'translateY(0) scale(1)', offset: .85 },
        { transform: 'translateY(-4%) scale(1)', offset: .92 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
  ];
}

function firstView(key) {
  try {
    const storageKey = `gamble-motion:${key}`;
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // The result can still play when storage is unavailable.
  }
  return true;
}

// 카드 21 버튼 두 번 누르기 막기: 한 번 보내면 새 화면이 뜰 때까지 다음 제출은 무시해요(public/escape.js와 같은 방식).
// 빠르게 두 번 누르면 두 번째가 옛 순번으로 가서 "다른 화면에서 이미 진행했어요"가 떴어요(2026-11-21 점검).
// 버튼을 disabled로 바꾸면 누른 버튼(hit/stand) 값이 안 가서, 표시만 해 두고 막아요.
export function guardCardActions(form) {
  let sending = false;
  form.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;
    if (sending) {
      event.preventDefault();
      return;
    }
    sending = true;
  });
  addEventListener('pageshow', () => { sending = false; });
}

const playMotion = { slot: spinReels, roulette: spinWheel, cards: dealCards, coinflip: tossCoin };

// 그림이 아직 안 받아졌으면(처음 보는 카드 등) 잠깐(최대 1.5초) 기다렸다가 움직여요. 빈 카드가 날아오지 않게요.
function imagesReady(stage) {
  const images = [...stage.querySelectorAll('img')].filter((img) => !img.complete);
  if (!images.length) return Promise.resolve();
  return Promise.race([
    Promise.allSettled(images.map((img) => img.decode())),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

// 카드 52장을 한가할 때 받아 둬요(브라우저에 1년 저장돼서 다음부터는 바로 보여요).
function prefetchImages(room) {
  const urls = (room?.dataset.gbPrefetch ?? '').split(' ').filter(Boolean);
  if (!urls.length) return;
  const run = () => { for (const url of urls) new Image().src = url; };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1000);
}

async function showResult(stage) {
  // 움직임이 끝나거나 건너뛸 때 gb-motion-done을 붙여요. 그 전에는 CSS가 결과를 가려 둬요.
  if (!canAnimate() || !firstView(stage.dataset.gbKey)) {
    stage.classList.add('gb-motion-done');
    return;
  }

  // 그림을 기다리는 동안에도 카드 버튼은 잠가 둬요(새 패를 보기 전에 '한 장 더'가 눌리지 않게).
  const actions = stage.querySelector('[data-gb-card-actions]');
  if (actions) actions.inert = true;
  let animations = [];
  try {
    await imagesReady(stage);
    stage.classList.add('gb-motion-running');
    stage.setAttribute('aria-busy', 'true');
    animations = playMotion[stage.dataset.gbMotion](stage);
    stage.classList.add('gb-motion-started');
    await Promise.allSettled(animations.map((animation) => animation.finished));
  } finally {
    for (const animation of animations) animation.cancel();
    stage.classList.add('gb-motion-done');
    stage.classList.remove('gb-motion-running');
    stage.removeAttribute('aria-busy');
    if (actions) actions.inert = false;
  }

  const jackpot = stage.querySelector('[data-gb-jackpot]');
  if (jackpot) {
    jackpot.animate(
      [
        { boxShadow: '0 0 0 .2rem #ffe996, 0 0 1.4rem .4rem #fff5af' },
        { boxShadow: '0 0 0 .4rem #fff6cc, 0 0 2rem .5rem #ffdc69', offset: .35 },
        { boxShadow: 'none' },
      ],
      { duration: 700, easing: 'ease-out' },
    );
  }
}

if (typeof document !== 'undefined') {
  // 걸기 뒤 바로 그려진 화면이면 주소를 결과 주소로 바꿔요. 새로고침해도 다시 보내지 않고 결과만 보여요.
  const room = document.querySelector('[data-gb-url]');
  if (room) history.replaceState(null, '', room.dataset.gbUrl);
  for (const form of document.querySelectorAll('[data-gb-balance]')) initBet(form);
  for (const form of document.querySelectorAll('[data-gb-card-actions]')) guardCardActions(form);
  const stage = document.querySelector('[data-gb-motion]');
  if (stage) void showResult(stage);
  prefetchImages(document.querySelector('[data-gb-prefetch]'));
}
