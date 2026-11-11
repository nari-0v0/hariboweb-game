export function nextBet(current, balance, action) {
  if (action === 'clear') return 0;
  if (action === 'all') return balance;
  return current + Math.min(action, balance - current);
}

function initBet(form) {
  const balance = Number(form.dataset.gbBalance);
  const input = form.elements.namedItem('bet');
  const submit = form.querySelector('button[type="submit"]');
  const amount = form.querySelector('output');
  const format = new Intl.NumberFormat('ko-KR');

  form.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-gb-bet]');
    if (!button || button.disabled) return;
    const action = button.dataset.gbBet;
    const bet = nextBet(Number(input.value), balance, action === 'all' || action === 'clear' ? action : Number(action));
    input.value = String(bet);
    amount.value = `${format.format(bet)}개`;
    submit.disabled = bet === 0;
  });

  form.addEventListener('submit', (event) => {
    if (submit.disabled) event.preventDefault();
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
  const deck = stage.querySelector('.gb-card-deck').getBoundingClientRect();
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

const playMotion = { slot: spinReels, roulette: spinWheel, cards: dealCards };

async function showResult(stage) {
  if (!Element.prototype.animate || !firstView(stage.dataset.gbKey) ||
    matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
