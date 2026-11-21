import { comma } from '../num';
import type { Member } from '../env';
import { GAMBLE_ART, SLOT_ART } from '../gamble-art';
import { BOOSTER_REFILL_CHIPS, CHERRY_PAIR, cardScore, COIN_PAYOUT, COIN_WIN_PER_MILLE, DAILY_CHIPS, REFILL_CHIPS, ROULETTE, SLOTS, payback, rankOf, type CoinFlip, type CoinSide } from '../gamble';
import { expiredHand, publicHand, type GambleAccount, type Game, type Round } from '../gamble-db';
import { plainPodium } from '../rankings';
import { Layout } from './layout';
import { dayStartMs, gameDay } from '../day';
import { PodiumBoard } from './podium';

const GAMES: Record<Game, string> = { slot: '슬롯', roulette: '배수 룰렛', cards: '카드 21(블랙잭)', coinflip: '동전 던지기' };
const DESCRIPTIONS: Record<Game, string> = {
  slot: '릴 세 개에서 같은 그림을 맞춰요.',
  coinflip: `곰과 발바닥 중 나올 면을 맞혀요. 맞힐 확률 ${COIN_WIN_PER_MILLE / 10}%, 맞히면 ${COIN_PAYOUT}배.`,
  roulette: '바늘이 멈춘 칸의 배수를 받아요.',
  cards: '21을 넘기지 않고 딜러보다 가까우면 이겨요.',
};
// 젤칩 채우기 규칙(src/gamble-db.ts claimDaily와 같아요, 나리 2026-11-21 확정): 시작 젤칩이나 채우기를 받은 다음 게임일
// (아침 6시 뒤)부터, 젤칩이 0개면 하루 한 번 채워져요. 처음 받은 날에는 다시 채우지 않아요.
const REFILL_RULE = `젤칩이 0개면 다음 게임일(아침 6시 뒤)부터 하루 한 번 ${REFILL_CHIPS}개(💎 부스터 ${BOOSTER_REFILL_CHIPS}개)로 채워져요.`;
const NOTICES: Record<string, string> = {
  bet: '가진 젤칩 안에서 1개 이상 걸어 주세요.',
  active: '진행 중인 카드 21을 먼저 끝내 주세요.',
  fast: '너무 빨라요. 잠깐 뒤에 다시 걸어 주세요.',
  stale: '다른 화면에서 이미 진행했어요. 지금 판을 보여 드려요.',
  pick: '곰이나 발바닥 중 하나를 골라 주세요.',
  rescue: '젤칩을 채워 드렸어요.',
  'rescue-day-changed': '날짜가 바뀌었어요. 지금 잔액을 확인한 뒤 다시 시도해 주세요.',
  'no-rescue': `오늘 이미 받았거나, 아직 젤칩이나 진행 중인 카드 21이 있어요. ${REFILL_RULE}`,
};
const chips = (n: number) => comma(n);

// 젤칩이 0개인데 지금은 채울 수 없을 때 안내(카드 21이 진행 중이면 그것부터)
export const emptyText = (handOpen: boolean) => handOpen
  ? '젤칩이 모두 진행 중인 카드 21에 걸려 있어요. 카드 21을 먼저 끝내 주세요.'
  : `젤칩은 다음 게임일(아침 6시 뒤)에 0개면 ${REFILL_CHIPS}개(💎 ${BOOSTER_REFILL_CHIPS}개)로 채워져요. 하루 한 번이에요.`;

function Art({ name }: { name: string }) {
  const art = GAMBLE_ART[name]!;
  return art.image ? <img class="gb-art" src={art.image} alt={art.text} /> : <span>{art.text}</span>;
}

// 받은 젤칩 안내: 처음 시작(DAILY_CHIPS) 또는 0개일 때 하루 한 번 채우기.
// moved = 디스코드 겜블장 지갑에서 옮겨 온 젤칩(처음 왔을 때 같이 알려 줘요).
export const dailyText = (n: number, moved = 0) =>
  n >= DAILY_CHIPS
    ? `겜블장 시작 젤칩 ${chips(n)}개를 받았어요.${moved > 0 ? ` 디스코드 겜블장에서 옮긴 젤칩 ${chips(moved)}개도 들어 있어요.` : ''}`
    : `젤칩이 다 떨어져서 ${n}개를 채워 드렸어요(0개면 하루 한 번).${n >= BOOSTER_REFILL_CHIPS ? ` 💎 부스터 감사 +${BOOSTER_REFILL_CHIPS - REFILL_CHIPS}` : ''}`;
const BET_STEPS = [1, 5, 10, 100, 1000, 10000];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 나리가 그린 게임별 배경: 게임 방은 정사각형(room), 로비의 게임 고르기 칸은 가로로 긴 그림(lobby).
// 게임 방에서 제일 크게 보이는 그림(먼저 받기 시작해요).
const MAIN_ART: Record<Game, string> = { slot: 'slotFrame', roulette: 'wheel', cards: 'cardBack', coinflip: 'coinHeads' };
const gameBackground = (game: Game, kind: 'room' | 'lobby') => `/gamble/bg/${game}-${kind}.webp?v=${game === 'coinflip' ? 3 : 2}`;

function ArtLayer({ name }: { name: string }) {
  const image = GAMBLE_ART[name]?.image;
  return image ? <img class="gb-art-layer" src={image} alt="" /> : null;
}

const COIN_NAMES: Record<CoinSide, string> = { heads: '곰', tails: '발바닥' };

// 동전 던지기: 나올 면 고르기(그림 동전 두 개 중 하나)
function CoinPick({ pick }: { pick: CoinSide }) {
  return (
    <fieldset class="gb-coin-pick">
      <legend>나올 면 고르기</legend>
      {(['heads', 'tails'] as const).map((side) => (
        <label class="gb-coin-option">
          <input type="radio" name="pick" value={side} checked={side === pick} />
          <img src={GAMBLE_ART[side === 'heads' ? 'coinHeads' : 'coinTails']!.image} alt="" />
          <span>{COIN_NAMES[side]}</span>
        </label>
      ))}
    </fieldset>
  );
}

// 카드 21은 아침 6시에 하던 판을 멈춰요. 6시 3분 전부터는 시작하기 전에 알려요(7차 점검).
const soonSix = (now = Date.now()) => dayStartMs(gameDay(now)) + 86_400_000 - now <= 3 * 60_000;

function BetForm({ game, balance, keepBet, pick }: { game: Game; balance: number; keepBet?: number; pick?: CoinSide }) {
  // 판이 끝나 결과가 나온 뒤에도 걸 젤칩은 0개에서 다시 골라요(나리 2026-11-14). 앞 판 금액을 그대로 두지 않아요.
  // 다만 걸기가 거절됐을 때(너무 빠름 등)는 고른 금액을 그대로 둬요(가진 젤칩까지만, 2026-11-21 점검).
  const bet = Math.max(0, Math.min(keepBet ?? 0, balance));
  return (
    <form class="gb-form gb-bet-form" action={`/gamble/${game}/play`} method="post" data-gb-balance={balance} data-no-loader="">
      <input type="hidden" name="game" value={game} />
      <input type="hidden" name="token" value={crypto.randomUUID()} />
      <input type="hidden" name="bet" value={bet} />
      {game === 'coinflip' && <CoinPick pick={pick ?? 'heads'} />}
      <div class="gb-bet-display">
        <span>걸 젤칩</span><output class="gb-bet-amount" aria-label="걸 젤칩">{chips(bet)}개</output>
      </div>
      <div class="gb-bet-steps" role="group" aria-label="걸 젤칩 고르기">
        {BET_STEPS.map((step) => <button class="gb-button gb-amount-button" type="button" data-gb-bet={step} disabled={balance <= 0}><span>+{step >= 1000 ? `${step / 1000}천`.replace('10천', '1만') : step}</span></button>)}
        <button class="gb-button" type="button" data-gb-bet="all" disabled={balance <= 0}>올인</button>
        <button class="gb-button" type="button" data-gb-bet="clear" disabled={balance <= 0}>지우기</button>
      </div>
      {game === 'cards' && soonSix() && <p class="hint gb-six-warn">⏰ 곧 아침 6시예요. 6시가 되면 하던 판은 그때 카드로 자동으로 멈춰요.</p>}
      {/* 결과 뒤에도 금액은 0개부터라 "한 번 더" 대신 늘 같은 이름이에요(2026-11-21 점검: 눌러도 안 되는 "한 번 더") */}
      <button class="gb-button gb-play-button" type="submit" disabled={!bet}>{game === 'cards' ? '카드 받기' : '확인'}</button>
    </form>
  );
}

function SlotReels({ reels }: { reels?: number[] }) {
  const strip = Array.from({ length: 6 }, () => SLOT_ART).flat();
  const jackpot = reels?.every((i) => SLOT_ART[i] === 'seven');
  return (
    <div class={`gb-slot${GAMBLE_ART.slotFrame?.image ? ' gb-slot--framed' : ''}`} data-gb-jackpot={jackpot ? 'yes' : undefined}>
      {(reels ?? [null, null, null]).map((symbol) => {
        const name = symbol === null ? null : SLOT_ART[symbol]!;
        return (
          <div class="gb-reel" role="img" aria-label={name ? GAMBLE_ART[name]!.text : '빈 릴'}>
            <div class="gb-reel-strip" aria-hidden="true">
              {name ? [...strip, name].map((item) => <span class="gb-reel-symbol"><Art name={item} /></span>) : <span class="gb-reel-symbol">—</span>}
            </div>
          </div>
        );
      })}
      <ArtLayer name="slotFrame" />
    </div>
  );
}

// 룰렛 판 그림(나리 그림, 2026-11-15)은 같은 크기 6칸이에요. 12시 방향 칸부터 시계 방향으로 이 배수예요.
// 나올 확률은 그림 크기와 상관없이 서버의 ROULETTE(WHEEL)가 정하고, 여기서는 나온 배수 칸으로 판을 돌려 세워요.
const DISC_SLICES = [0, 1, 2, 3, 5, 10];
const SLICE = 360 / DISC_SLICES.length;
if (ROULETTE.some(({ payout }) => !DISC_SLICES.includes(payout))) throw new Error('룰렛 판 그림에 없는 배수가 있어요');

function RouletteWheel({ landed: raw, multiplier }: { landed?: number; multiplier?: number | null }) {
  // 멈출 칸은 저장된 배수로 정해요(확률표가 바뀌어도 그림과 실제 받은 칩이 같게). 그림에 없는 배수면 멈춘 칸 없이 그려요.
  const slice = multiplier == null ? -1 : DISC_SLICES.indexOf(multiplier);
  const landed = raw !== undefined && slice >= 0 ? raw : undefined;
  // 칸 한가운데만 서지 않게, 결과 번호에 따라 칸 안에서 조금씩 다른 자리에 서요(칸 폭 60도 중 ±15도).
  const wobble = landed === undefined ? 0 : ((landed * 37) % 31) - 15;
  return (
    <div class={`gb-wheel-stage${GAMBLE_ART.wheel?.image ? ' gb-wheel-stage--rim' : ''}`}>
      <div class="gb-wheel-pointer" aria-hidden="true"><Art name="pointer" /></div>
      <div class="gb-wheel-viewport">
        <div class="gb-wheel-disc gb-wheel-disc--art" data-gb-landed={landed}
          style={`--gb-wheel-stop:${-(Math.max(slice, 0) * SLICE + wobble)}deg`} aria-hidden="true">
          <img class="gb-wheel-disc-img" src={GAMBLE_ART.wheelDisc!.image} alt="" />
        </div>
      </div>
      {/* 테두리 그림은 판과 같이 돌지 않게 판 바깥에 덮어요. */}
      <ArtLayer name="wheel" />
    </div>
  );
}

// 나리가 그린 카드 52장(public/gamble/cards/<무늬>-<숫자>.webp). 카드 번호 = 무늬 × 13 + 숫자.
const SUIT_FILES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const SUIT_NAMES = ['스페이드', '하트', '다이아', '클로버'] as const;
const cardImage = (card: number) =>
  `/gamble/cards/${SUIT_FILES[Math.floor(card / 13)]}-${CARD_RANKS[rankOf(card)]!.toLowerCase()}.webp?v=1`;

// 카드 21 방: 지금 판의 카드는 미리 받고(preload), 나머지 52장(다 합쳐 약 27KB)은 gamble.js가 한가할 때 받아 둬요.
// 그래야 다음 판에 처음 보는 카드도 바로 보여요(나리 2026-11-15: 카드가 느리게 뜸).
const ALL_CARD_IMAGES = Array.from({ length: 52 }, (_, card) => cardImage(card));
const handImages = (round: Round | null) => {
  if (!round) return [];
  const { player, dealer } = publicHand(round);
  return [...player, ...dealer].map(cardImage);
};

function PlayingCard({ card, order, flip }: { card?: number; order?: number; flip?: boolean }) {
  const hidden = card === undefined;
  return (
    <span class="gb-playing-card" data-gb-deal={order} data-gb-flip={flip ? 'yes' : undefined} aria-label={hidden ? '가려진 카드' : undefined}>
      <span class="gb-card-turn">
        <span class="gb-card-face gb-card-back" aria-hidden={hidden ? undefined : 'true'}>
          <Art name="cardBack" />
        </span>
        {!hidden && (
          <span class="gb-card-face gb-card-front gb-card-front--art">
            <img class="gb-card-img" src={cardImage(card)} alt={`${SUIT_NAMES[Math.floor(card / 13)]} ${CARD_RANKS[rankOf(card)]}`} />
          </span>
        )}
      </span>
    </span>
  );
}

function Cards({ round }: { round: Round }) {
  const { player, dealer, score } = publicHand(round);
  const settled = round.multiplier !== null;
  const opening = round.revision === 0;
  // A stand adds a revision but no player card. A hit adds one of each.
  const hit = !opening && player.length === 2 + round.revision;
  const playerOrder = (i: number) => opening ? i * 2 : hit && i === player.length - 1 ? 0 : undefined;
  const dealerOrder = (i: number) => opening ? i * 2 + 1 : i === 0 ? undefined : (hit ? i : i - 1);
  return (
    <div class="gb-card-table">
      <p>내 카드<span data-gb-reveal> · {score}점</span></p>
      <div class="gb-tiles">
        {player.map((card, i) => <PlayingCard card={card} order={playerOrder(i)} />)}
      </div>
      <p>딜러 카드{settled && <span data-gb-reveal> · {cardScore(dealer)}점</span>}</p>
      <div class="gb-tiles">
        {dealer.map((card, i) => <PlayingCard card={card} order={dealerOrder(i)} flip={!opening && settled && i === 1} />)}
        {!settled && <PlayingCard order={opening ? 3 : undefined} />}
      </div>
      {expiredHand(round) && <p role="status" data-gb-reveal>아침 6시가 지나 이 판은 저절로 멈췄어요(멈추기로 정산).</p>}
    </div>
  );
}

// 나리가 그린 동전 앞(곰)·뒤(발바닥). 두 면을 겹쳐 두고 통째로 뒤집어요. 멈출 면은 서버가 정한 결과예요.
function CoinStage({ round }: { round: Round | null }) {
  const flip = round ? (JSON.parse(round.state) as CoinFlip) : null;
  const side = flip?.side ?? 'heads';
  const won = flip ? flip.pick === flip.side : null;
  return (
    <div class="gb-coin-stage">
      <div class="gb-coin-toss">
        <div class="gb-coin" data-gb-side={side} style={`--gb-coin-end:${side === 'heads' ? 0 : 180}deg`} role="img"
          aria-label={flip ? `나온 면: ${COIN_NAMES[side]}` : '동전'}>
          <img class="gb-coin-face gb-coin-heads" src={GAMBLE_ART.coinHeads!.image} alt="" />
          <img class="gb-coin-face gb-coin-tails" src={GAMBLE_ART.coinTails!.image} alt="" />
        </div>
        {/* 결과는 고른 면·나온 면 대신 동전 가운데에 성공/실패로만 보여 줘요(나리 2026-11-14) */}
        {won !== null && (
          <p class={`gb-coin-result ${won ? 'is-win' : 'is-lose'}`} data-gb-reveal>{won ? '성공' : '실패'}</p>
        )}
      </div>
    </div>
  );
}

function CardDeck() {
  return <div class="gb-card-deck" aria-hidden="true"><Art name="cardBack" /></div>;
}

function GameSurface({ game, round, canBet }: { game: Game; round: Round | null; canBet: boolean }) {
  return (
    <div class={`gb-game-surface gb-surface-${game}`} style={`--gb-bg:url(${gameBackground(game, 'room')})`}>
      {game === 'slot' && <SlotReels reels={round ? JSON.parse(round.state) as number[] : undefined} />}
      {game === 'roulette' && <RouletteWheel landed={round ? Number(round.state) : undefined} multiplier={round?.multiplier} />}
      {game === 'cards' && (round ? <Cards round={round} /> : <CardDeck />)}
      {game === 'coinflip' && <CoinStage round={round} />}
      {canBet && (
        <div class="gb-coin-drop" aria-hidden="true">
          <span class="gb-dropping-coin" hidden><Art name="coin" /></span>
          <span class="gb-coin-target" />
        </div>
      )}
    </div>
  );
}

function Result({ round, balance }: { round: Round; balance: number }) {
  const multiplier = round.multiplier!;
  const back = payback(round.bet, multiplier);
  const net = back - round.bet;
  // 받은 젤칩(건 것 포함)을 먼저 보여 주고, 이득·손해는 괄호로 붙여요(나리 2026-11-15: "3배인데 왜 2개?")
  const title = back === 0 ? `젤칩 ${chips(round.bet)}개 잃었어요`
    : net > 0 ? `젤칩 ${chips(back)}개 받았어요! (${chips(net)}개 이득)`
    : net < 0 ? `젤칩 ${chips(back)}개 받았어요 (${chips(-net)}개 손해)`
    : `젤칩 ${chips(back)}개 돌려받았어요 (본전)`;
  return (
    <div class="gb-round-result" aria-live="polite" data-gb-reveal>
      <h2>{title}</h2>
      <p>{multiplier}배 · 지금 가진 젤칩 <strong>{chips(balance)}개</strong></p>
    </div>
  );
}

// 슬롯 칸마다 나올 확률(src/gamble.ts의 weight 그대로 계산해요)
const SLOT_TOTAL = SLOTS.reduce((n, { weight }) => n + weight, 0);
const tripleChance = (weight: number) => (weight / SLOT_TOTAL) ** 3;
const cherryPairChance = () => { const p = SLOTS[0]!.weight / SLOT_TOTAL; return 3 * p * p * (1 - p); };
const pct = (x: number) => `${x * 100 >= 1 ? (x * 100).toFixed(1) : (x * 100).toPrecision(1)}%`;
function slotOdds() {
  return [...SLOTS.map(({ weight, payout }) => `${payout}배 ${pct(tripleChance(weight))}`), `체리 2개 ${pct(cherryPairChance())}`].join(' · ');
}
function slotReturn() {
  return SLOTS.reduce((n, { weight, payout }) => n + tripleChance(weight) * payout, 0) + cherryPairChance() * CHERRY_PAIR;
}

function GameRules({ game }: { game: Game }) {
  return (
    <details class="gb-rules">
      <summary>게임 방법</summary>
      <p>{DESCRIPTIONS[game]}</p>
      {game === 'slot' && (
        <>
          <div class="gb-tiles">{SLOTS.map(({ payout }, i) => <span class="gb-tile"><Art name={SLOT_ART[i]!} /> {payout}배</span>)}</div>
          <p><Art name="cherry" /> 2개는 {CHERRY_PAIR}배예요.</p>
          <p>나올 확률: {slotOdds()} · 평균으로 건 젤칩의 약 {Math.round(slotReturn() * 100)}%가 돌아와요.</p>
        </>
      )}
      {game === 'roulette' && <p>1배는 본전이에요. 나올 확률: {ROULETTE.map(({ payout, count }) => `${payout}배 ${count}%`).join(' · ')}</p>}
      {game === 'coinflip' && <p>나올 면을 맞힐 확률은 {COIN_WIN_PER_MILLE / 10}%예요. 맞히면 {COIN_PAYOUT}배, 틀리면 건 젤칩을 잃어요.</p>}
      {game === 'cards' && <CardRules />}
    </details>
  );
}

// 카드 21 규칙(src/gamble.ts openingPayout·playHand와 같아요). 가이드에도 같은 내용이 있어요.
export function CardRules() {
  return (
    <ul class="gb-rule-list">
      <li>21을 넘기지 않고 딜러보다 21에 가까우면 이겨요. 이기면 2배, 비기면 1배(본전)예요.</li>
      <li>첫 두 장이 21이면 바로 끝나요: A와 그림 카드(J·Q·K)면 3배, A와 10이면 2배.</li>
      <li>딜러의 첫 두 장이 21이면 바로 끝나고 0배예요. 나도 첫 두 장이 21이면 비겨서 1배예요.</li>
      <li>딜러는 17점이 될 때까지 받고 17점부터 멈춰요. 내가 21점이 되면 저절로 멈춰요.</li>
    </ul>
  );
}

type Rank = { name: string; value: number };

const noticeText = (key?: string) => key && Object.hasOwn(NOTICES, key) ? NOTICES[key] : null;

function ChipBalance({ balance }: { balance: number }) {
  return <p class="gb-room-balance">가진 젤칩 <strong class="gb-balance">{chips(balance)}개</strong></p>;
}

// 겜블장이 잠겼을 때 보이는 화면(GAMBLE_LOCKED)
export function GambleLocked(props: { viewer: Member }) {
  return (
    <Layout title="겜블장" viewer={props.viewer} active="gamble">
      <section class="panel message">
        <h1>🔒 겜블장은 지금 잠겨 있어요</h1>
        <p class="muted">지금은 들어갈 수 없어요. 다시 열리면 메뉴에서 들어갈 수 있어요.</p>
        <p>
          <a class="btn btn-primary" href="/me">내 카드로</a>
        </p>
      </section>
    </Layout>
  );
}

export function GambleLobby(props: {
  viewer: Member; account: GambleAccount | null; inProgress: boolean;
  ranks: Rank[][]; now: string; daily: number; moved?: number; notice?: string; seasonNet?: number;
}) {
  const balance = props.account?.chips ?? 0;
  const [balanceRank = [], bestRank = [], allInRank = [], seasonRank = []] = props.ranks;
  const notice = noticeText(props.notice);
  return (
    <Layout title="겜블장" viewer={props.viewer} active="gamble" preloadImages={(Object.keys(GAMES) as Game[]).map((game) => gameBackground(game, 'lobby'))}>
      <div class="gb-page">
        <section class="gb-panel gb-lobby-intro">
          <h1>겜블장 <Art name="slot" /></h1>
          <ChipBalance balance={balance} />
          {props.daily > 0 && <p role="status">{dailyText(props.daily, props.moved)}</p>}
          {notice && <p role="status">{notice}</p>}
          {props.account && balance <= 0 && !notice && <p>{emptyText(props.inProgress)}</p>}
          {balance < 0 && <p>마이너스는 지운 글에서 받았던 젤칩이에요. 다음에 들어오는 젤칩에서 먼저 갚아요.</p>}
          <p>젤칩은 겜블장 전용이에요. 젤리로 바꾸거나 상점에서 쓸 수 없고, 순위와 칭호에만 쓰여요.</p>
        </section>
        <nav class="gb-games" aria-label="게임 고르기">
          {(Object.keys(GAMES) as Game[]).map((game) => (
            <a class="gb-panel gb-game-link" href={`/gamble/${game}`} style={`--gb-bg:url(${gameBackground(game, 'lobby')})`}>
              <span class="gb-game-link-icon"><Art name={game} /></span>
              <strong>{GAMES[game]}</strong>
              {game === 'cards' && props.inProgress && <span class="gb-game-progress">진행 중</span>}
              <span>{DESCRIPTIONS[game]}</span>
            </a>
          ))}
        </nav>
        <section class="gb-rank">
          <h2>🏆 겜블장 순위</h2>
          {seasonRank[0] && (
            <p class="rk-champ">
              <span aria-hidden="true">👑</span> 이번 시즌 순이익 1등 <b>{seasonRank[0].name}</b> · {chips(seasonRank[0].value)}개
            </p>
          )}
          {props.seasonNet !== undefined && (
            <p class="hint">내 이번 시즌 순이익 <b>{props.seasonNet > 0 ? '+' : ''}{chips(props.seasonNet)}개</b> (도박신은 시즌이 끝나는 토요일 아침 6시에 1등이 받아요)</p>
          )}
          <div class="rk-trio">
            <PodiumBoard title="가진 젤칩" icon="🪙" podium={plainPodium(balanceRank)} show={(v) => `${chips(v)}개`} />
            <PodiumBoard title="한 번에 딴 최고 젤칩" icon="💥" podium={plainPodium(bestRank)} show={(v) => `${chips(v)}개`} />
            <PodiumBoard title="올인 승리" icon="🔥" podium={plainPodium(allInRank)} show={(v) => `${chips(v)}회`} />
          </div>
          <p class="gb-rank-links"><a href="/rank">다른 게임 순위 보기</a> · <a href="/titles">겜블장 칭호 보기</a></p>
        </section>
      </div>
    </Layout>
  );
}

export function GambleRoom(props: {
  viewer: Member; game: Game; balance: number; hand: Round | null; result: Round | null;
  daily: number; moved?: number; notice?: string; url?: string; keepBet?: number; keepPick?: CoinSide;
}) {
  const { game, balance } = props;
  const hand = game === 'cards' ? props.hand : null;
  const result = !hand && props.result?.multiplier != null ? props.result : null;
  const motion = result ?? (hand && hand.token === props.result?.token ? hand : null);
  const notice = noticeText(props.notice);
  const cardsShown = game === 'cards' ? handImages(hand ?? result) : [];
  return (
    <Layout title={GAMES[game]} viewer={props.viewer} active="gamble" scripts={[{ src: '/gamble.js?v=10', type: 'module' }]}
      preloadImages={[gameBackground(game, 'room'), ...[MAIN_ART[game]].flatMap((name) => GAMBLE_ART[name]?.image ?? []), ...cardsShown]}>
      <div class="gb-page gb-room-page">
        <div class="gb-room-bar">
          <a href="/gamble">← 겜블장</a>
          <ChipBalance balance={balance} />
          {game !== 'cards' && props.hand && <a class="gb-resume" href="/gamble/cards">진행 중인 카드 21로 가기</a>}
          {/* 결과가 나오기 전(움직이는 동안)에는 잔액처럼 가려요. 채워 줬다는 말이 결과를 미리 알려 주지 않게(2026-11-21 점검) */}
          {props.daily > 0 && <p class="gb-room-daily" role="status">{dailyText(props.daily, props.moved)}</p>}
        </div>
        <section class="gb-panel gb-room" aria-label={GAMES[game]} data-gb-settled={result ? 'yes' : undefined} data-gb-url={props.url} data-gb-prefetch={game === 'cards' ? ALL_CARD_IMAGES.join(' ') : undefined}
          data-gb-motion={motion?.game} data-gb-key={motion ? `${motion.token}:${motion.revision}:${result ? 'done' : 'active'}` : undefined}>
          <h1><Art name={game} /> {GAMES[game]}</h1>
          {notice && <p role="status">{notice}</p>}
          <GameSurface game={game} round={hand ?? result} canBet={!hand} />
          {result && <Result round={result} balance={balance} />}
          {hand ? (
            <>
              <p>건 젤칩 {chips(hand.bet)}개 · 한국 시간 아침 6시가 되면 자동으로 멈춰요.</p>
              <form class="gb-form" method="post" action="/gamble/cards" data-gb-card-actions="" data-no-loader="">
                <input type="hidden" name="token" value={hand.token} />
                <input type="hidden" name="revision" value={hand.revision} />
                <button class="gb-button gb-move-button gb-move-hit" name="move" value="hit" type="submit">한 장 더</button>
                <button class="gb-button gb-move-button gb-move-stand" name="move" value="stand" type="submit">멈추기</button>
              </form>
            </>
          ) : (
            <div data-gb-reveal>
              <BetForm game={game} balance={balance} keepBet={result ? undefined : props.keepBet}
                pick={game === 'coinflip' ? (result ? (JSON.parse(result.state) as CoinFlip).pick : props.keepPick) : undefined} />
              {balance <= 0 && <p>{emptyText(!!props.hand)}</p>}
              <noscript>걸 젤칩을 바꾸려면 자바스크립트를 켜 주세요.</noscript>
            </div>
          )}
          <GameRules game={game} />
        </section>
      </div>
    </Layout>
  );
}
