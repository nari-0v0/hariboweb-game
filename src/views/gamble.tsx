import type { Member } from '../env';
import { GAMBLE_ART, SLOT_ART, SUIT_ART } from '../gamble-art';
import { CHERRY_PAIR, ROULETTE, SLOTS, WHEEL, rankOf } from '../gamble';
import { gambleDay, publicHand, type GambleAccount, type Game, type Round } from '../gamble-db';
import { Layout } from './layout';

const GAMES = { slot: '슬롯', roulette: '배수 룰렛', cards: '카드 21(블랙잭)' };
const DESCRIPTIONS = {
  slot: '릴 세 개에서 같은 그림을 맞춰요.',
  roulette: '바늘이 멈춘 칸의 배수를 받아요.',
  cards: '21을 넘기지 않고 딜러보다 가까우면 이겨요.',
};
const NOTICES: Record<string, string> = {
  bet: '가진 칩 안에서 1개 이상 걸어 주세요.',
  active: '진행 중인 카드 21을 먼저 끝내 주세요.',
  rescue: '다시 시작할 칩 1000개를 받았어요.',
  'no-rescue': '오늘 이미 다시 시작했거나, 아직 칩이나 진행 중인 카드 21이 있어요.',
};
const chips = (n: number) => n.toLocaleString('ko-KR');

function Art({ name }: { name: string }) {
  const art = GAMBLE_ART[name]!;
  return art.image ? <img class="gb-art" src={art.image} alt={art.text} /> : <span>{art.text}</span>;
}

const BET_STEPS = [1, 5, 10, 100, 1000, 10000];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function ArtLayer({ name }: { name: string }) {
  const image = GAMBLE_ART[name]?.image;
  return image ? <img class="gb-art-layer" src={image} alt="" /> : null;
}

function BetForm({ game, balance, previousBet }: { game: Game; balance: number; previousBet?: number }) {
  const bet = Math.min(balance, previousBet ?? 0);
  return (
    <form class="gb-form gb-bet-form" action={`/gamble/${game}/play`} method="post" data-gb-balance={balance}>
      <input type="hidden" name="game" value={game} />
      <input type="hidden" name="token" value={crypto.randomUUID()} />
      <input type="hidden" name="bet" value={bet} />
      <div class="gb-bet-display">
        <span>걸 칩</span><output class="gb-bet-amount" aria-label="걸 칩">{chips(bet)}개</output>
      </div>
      <div class="gb-bet-steps" role="group" aria-label="걸 칩 고르기">
        {BET_STEPS.map((step) => <button class="gb-button gb-amount-button" type="button" data-gb-bet={step} disabled={!balance}><span>+{step >= 1000 ? `${step / 1000}천`.replace('10천', '1만') : step}</span></button>)}
        <button class="gb-button" type="button" data-gb-bet="all" disabled={!balance}>올인</button>
        <button class="gb-button" type="button" data-gb-bet="clear" disabled={!balance}>지우기</button>
      </div>
      <button class="gb-button gb-play-button" type="submit" disabled={!bet}>{previousBet !== undefined ? '한 번 더' : game === 'cards' ? '카드 받기' : '확인'}</button>
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

// 룰렛판은 40칸(서버 WHEEL 번호, 확률 그대로)을 같은 배수끼리 묶어 넓은 칸 19개로 그려요.
// [배수, 칸 수]: 0배 22 · 1배 8 · 2배 6 · 3배 2 · 5배 1 · 10배 1 = 40칸. 같은 배수끼리는 붙지 않게 놓아요.
const WHEEL_RUNS: [number, number][] = [
  [0, 3], [1, 2], [0, 3], [2, 2], [0, 3], [1, 2], [0, 3], [3, 1], [0, 3], [2, 2],
  [0, 3], [1, 2], [0, 2], [5, 1], [1, 2], [2, 2], [0, 2], [10, 1], [3, 1],
];
const SECTOR = 360 / WHEEL.length;
// WHEEL 번호 i가 판의 몇 번째 자리(k)에 그려지는지, 그리고 그 자리가 어느 묶음(run)인지
const { WHEEL_POS, RUN_OF } = (() => {
  const free = new Map<number, number[]>();
  WHEEL.forEach((p, i) => free.set(p, [...(free.get(p) ?? []), i]));
  const pos: number[] = [];
  const runOf: number[] = [];
  let k = 0;
  WHEEL_RUNS.forEach(([payout, count], r) => {
    for (let j = 0; j < count; j++, k++) {
      const i = free.get(payout)!.shift()!;
      pos[i] = k;
      runOf[i] = r;
    }
  });
  if (k !== WHEEL.length || [...free.values()].some((l) => l.length)) throw new Error('룰렛 칸 묶음이 WHEEL과 안 맞아요');
  return { WHEEL_POS: pos, RUN_OF: runOf };
})();
const RUN_COLORS: Record<number, string> = {
  1: '#1f6b3a', 2: '#2f5fa8', 3: '#7b3fa0', 5: '#c26a12', 10: '#d4a017',
};
let zeroNo = 0;
const RUN_DRAW = WHEEL_RUNS.reduce<{ from: number; to: number; payout: number; color: string }[]>((list, [payout, count]) => {
  const from = list.length ? list[list.length - 1]!.to : 0;
  const color = payout === 0 ? (zeroNo++ % 2 ? '#7a1420' : '#1d1d24') : RUN_COLORS[payout]!;
  return [...list, { from, to: from + count * SECTOR, payout, color }];
}, []);
// 칸 사이에 금색 줄을 그어요.
const WHEEL_FILL = `conic-gradient(from -${SECTOR / 2}deg, ${RUN_DRAW.map(({ from, to, color }) =>
  `#e8c25a ${from}deg ${from + 0.8}deg, ${color} ${from + 0.8}deg ${to}deg`).join(', ')})`;

function RouletteWheel({ landed }: { landed?: number }) {
  const landedRun = landed === undefined ? -1 : RUN_OF[landed];
  return (
    <div class={`gb-wheel-stage${GAMBLE_ART.wheel?.image ? ' gb-wheel-stage--rim' : ''}`}>
      <div class="gb-wheel-pointer" aria-hidden="true"><Art name="pointer" /></div>
      <div class="gb-wheel-viewport">
        <div class="gb-wheel-disc" data-gb-landed={landed}
          style={`--gb-wheel-fill:${WHEEL_FILL};--gb-wheel-stop:${-WHEEL_POS[landed ?? 0]! * SECTOR}deg`}
          aria-hidden="true">
          {RUN_DRAW.map(({ from, to, payout }, r) => (
            <span class={`gb-wheel-label${payout >= 5 ? ' gb-wheel-label--big' : ''}`} aria-current={r === landedRun ? 'true' : undefined}
              style={`--gb-wheel-angle:${(from + to) / 2 - SECTOR / 2}deg`}>{payout}배</span>
          ))}
        </div>
      </div>
      {/* 테두리 그림은 판과 같이 돌지 않게 판 바깥에 덮어요. */}
      <ArtLayer name="wheel" />
    </div>
  );
}

function PlayingCard({ card, order, flip }: { card?: number; order?: number; flip?: boolean }) {
  const hidden = card === undefined;
  return (
    <span class="gb-playing-card" data-gb-deal={order} data-gb-flip={flip ? 'yes' : undefined} aria-label={hidden ? '가려진 카드' : undefined}>
      <span class="gb-card-turn">
        <span class="gb-card-face gb-card-back" aria-hidden={hidden ? undefined : 'true'}>
          <Art name="cardBack" />
        </span>
        {!hidden && (
          <span class="gb-card-face gb-card-front">
            <ArtLayer name="cardFront" />
            <span class="gb-card-mark"><Art name={SUIT_ART[Math.floor(card / 13)]!} /> {CARD_RANKS[rankOf(card)]}</span>
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
      <CardDeck />
      <p>내 카드<span data-gb-reveal> · {score}점</span></p>
      <div class="gb-tiles">
        {player.map((card, i) => <PlayingCard card={card} order={playerOrder(i)} />)}
      </div>
      <p>딜러 카드</p>
      <div class="gb-tiles">
        {dealer.map((card, i) => <PlayingCard card={card} order={dealerOrder(i)} flip={!opening && settled && i === 1} />)}
        {!settled && <PlayingCard order={opening ? 3 : undefined} />}
      </div>
    </div>
  );
}

function CardDeck() {
  return <div class="gb-card-deck" aria-hidden="true"><Art name="cardBack" /></div>;
}

function GameSurface({ game, round, canBet }: { game: Game; round: Round | null; canBet: boolean }) {
  return (
    <div class={`gb-game-surface gb-surface-${game}`} style={GAMBLE_ART.background?.image ? `--gb-bg:url(${GAMBLE_ART.background.image})` : undefined}>
      {game === 'slot' && <SlotReels reels={round ? JSON.parse(round.state) as number[] : undefined} />}
      {game === 'roulette' && <RouletteWheel landed={round ? Number(round.state) : undefined} />}
      {game === 'cards' && (round ? <Cards round={round} /> : <CardDeck />)}
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
  const net = round.bet * (multiplier - 1);
  return (
    <div class="gb-round-result" aria-live="polite" data-gb-reveal>
      <h2>{net > 0 ? `칩 ${chips(net)}개 이겼어요!` : net < 0 ? `칩 ${chips(-net)}개 잃었어요` : '본전이에요'}</h2>
      <p>{round.game === 'roulette' && `룰렛 ${Number(round.state) + 1}번째 칸 · `}{multiplier}배 · 지금 가진 칩 <strong>{chips(balance)}개</strong></p>
    </div>
  );
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
        </>
      )}
      {game === 'roulette' && <p>1배는 본전이에요. {ROULETTE.map(({ payout, count }) => `${payout}배 ${count}칸`).join(' · ')}</p>}
      {game === 'cards' && <p>딜러는 17점부터 멈춰요. 승리 2배 · 첫 두 장으로 21을 만들어 이기면 3배 · 비기면 1배</p>}
    </details>
  );
}

type Rank = { name: string; value: number };
function Ranking({ title, rows, unit }: { title: string; rows: Rank[]; unit: string }) {
  return (
    <section class="gb-panel">
      <h3>{title}</h3>
      {rows.length ? <ol class="gb-ranking">{rows.map(({ name, value }) => <li>{name} · <strong>{chips(value)}{unit}</strong></li>)}</ol> : <p>아직 기록이 없어요.</p>}
    </section>
  );
}

const noticeText = (key?: string) => key && Object.hasOwn(NOTICES, key) ? NOTICES[key] : null;

function ChipBalance({ balance }: { balance: number }) {
  return <p class="gb-room-balance">가진 칩 <strong class="gb-balance">{chips(balance)}개</strong></p>;
}

export function GambleLobby(props: {
  viewer: Member; account: GambleAccount | null; inProgress: boolean;
  ranks: Rank[][]; now: string; daily: boolean; notice?: string;
}) {
  const balance = props.account?.chips ?? 0;
  const [balanceRank = [], bestRank = [], allInRank = [], seasonRank = []] = props.ranks;
  const notice = noticeText(props.notice);
  return (
    <Layout title="겜블장" viewer={props.viewer} active="gamble">
      <div class="gb-page">
        <section class="gb-panel gb-lobby-intro">
          <ArtLayer name="background" />
          <h1>겜블장 <Art name="slot" /></h1>
          <ChipBalance balance={balance} />
          {props.daily && <p role="status">오늘 칩 1000개 받았어요.</p>}
          {notice && <p role="status">{notice}</p>}
          {balance === 0 && !props.inProgress && props.account?.rescue_day !== gambleDay(props.now) && (
            <form method="post" action="/gamble/rescue">
              <input type="hidden" name="day" value={gambleDay(props.now)} />
              <button class="gb-button" type="submit">다시 시작</button>
            </form>
          )}
          <p>칩은 겜블장 전용이에요. 젤리로 바꾸거나 상점에서 쓸 수 없고, 순위와 칭호에만 쓰여요.</p>
        </section>
        <nav class="gb-games" aria-label="게임 고르기">
          {(Object.keys(GAMES) as Game[]).map((game) => (
            <a class="gb-panel gb-game-link" href={`/gamble/${game}`}>
              <span class="gb-game-link-icon"><Art name={game} /></span>
              <strong>{GAMES[game]}</strong>
              {game === 'cards' && props.inProgress && <span class="gb-game-progress">진행 중</span>}
              <span>{DESCRIPTIONS[game]}</span>
            </a>
          ))}
        </nav>
        <h2>겜블장 순위</h2>
        <div class="gb-games">
          <Ranking title="가진 칩" rows={balanceRank} unit="개" />
          <Ranking title="한 번에 딴 최고 칩" rows={bestRank} unit="개" />
          <Ranking title="올인 승리" rows={allInRank} unit="회" />
          <Ranking title="이번 시즌 누적 딴 칩 1등" rows={seasonRank} unit="개" />
        </div>
        <p><a href="/titles">겜블장 칭호 보기</a></p>
      </div>
    </Layout>
  );
}

export function GambleRoom(props: {
  viewer: Member; game: Game; balance: number; hand: Round | null; result: Round | null;
  daily: boolean; notice?: string;
}) {
  const { game, balance } = props;
  const hand = game === 'cards' ? props.hand : null;
  const result = !hand && props.result?.multiplier != null ? props.result : null;
  const motion = result ?? (hand && hand.token === props.result?.token ? hand : null);
  const notice = noticeText(props.notice);
  return (
    <Layout title={GAMES[game]} viewer={props.viewer} active="gamble" scripts={[{ src: '/gamble.js?v=2', type: 'module' }]}>
      <div class="gb-page gb-room-page">
        <div class="gb-room-bar">
          <a href="/gamble">← 겜블장</a>
          <ChipBalance balance={balance} />
          {game !== 'cards' && props.hand && <a class="gb-resume" href="/gamble/cards">진행 중인 카드 21로 가기</a>}
          {props.daily && <p role="status">오늘 칩 1000개 받았어요.</p>}
        </div>
        <section class="gb-panel gb-room" aria-label={GAMES[game]} data-gb-settled={result ? 'yes' : undefined}
          data-gb-motion={motion?.game} data-gb-key={motion ? `${motion.token}:${motion.revision}:${result ? 'done' : 'active'}` : undefined}>
          <h1><Art name={game} /> {GAMES[game]}</h1>
          {notice && <p role="status">{notice}</p>}
          <GameSurface game={game} round={hand ?? result} canBet={!hand} />
          {result && <Result round={result} balance={balance} />}
          {hand ? (
            <>
              <p>건 칩 {chips(hand.bet)}개 · 한국 시간 자정이 되면 자동으로 멈춰요.</p>
              <form class="gb-form" method="post" action="/gamble/cards" data-gb-card-actions="">
                <input type="hidden" name="token" value={hand.token} />
                <input type="hidden" name="revision" value={hand.revision} />
                <button class="gb-button" name="move" value="hit" type="submit">한 장 더</button>
                <button class="gb-button" name="move" value="stand" type="submit">멈추기</button>
              </form>
            </>
          ) : (
            <div data-gb-reveal>
              <BetForm game={game} balance={balance} previousBet={result?.bet} />
              {balance === 0 && <p><a href="/gamble">겜블장에서 칩 받기</a></p>}
              <noscript>걸 칩을 바꾸려면 자바스크립트를 켜 주세요.</noscript>
            </div>
          )}
          <GameRules game={game} />
        </section>
      </div>
    </Layout>
  );
}
