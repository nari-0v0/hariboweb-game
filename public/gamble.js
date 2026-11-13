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
    state = 'dropping';
    form.inert = true;
    try {
      await dropCoin(coin);
    } catch {
      // A canceled animation should not block a valid bet.
    }
    if (state !== 'dropping') return;
    state = 'ready';
    form.requestSubmit();
  });

  addEventListener('pagehide', () => { state = 'idle'; });
  addEventListener('pageshow', (event) => {
    if (event.persisted) form.inert = false;
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

const playMotion = { slot: spinReels, roulette: spinWheel, cards: dealCards, coinflip: tossCoin };

async function showResult(stage) {
  if (!canAnimate() || !firstView(stage.dataset.gbKey)) return;

  const actions = stage.querySelector('[data-gb-card-actions]');
  stage.classList.add('gb-motion-running');
  stage.setAttribute('aria-busy', 'true');
  if (actions) actions.inert = true;
  let animations = [];
  try {
    animations = playMotion[stage.dataset.gbMotion](stage);
    await Promise.allSettled(animations.map((animation) => animation.finished));
  } finally {
    for (const animation of animations) animation.cancel();
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
  for (const form of document.querySelectorAll('[data-gb-balance]')) initBet(form);
  const stage = document.querySelector('[data-gb-motion]');
  if (stage) void showResult(stage);
}
