import type { Member } from '../env';
import { GAMBLE_ART, SLOT_ART } from '../gamble-art';
import { CHERRY_PAIR, ROULETTE, SLOTS, WHEEL, payback, rankOf } from '../gamble';
import { gambleDay, publicHand, type GambleAccount, type Game, type Round } from '../gamble-db';
import { plainPodium } from '../rankings';
import { Layout } from './layout';
import { PodiumBoard } from './podium';

const GAMES = { slot: '슬롯', roulette: '배수 룰렛', cards: '카드 21(블랙잭)' };
const DESCRIPTIONS = {
  slot: '릴 세 개에서 같은 그림을 맞춰요.',
  roulette: '바늘이 멈춘 칸의 배수를 받아요.',
  cards: '21을 넘기지 않고 딜러보다 가까우면 이겨요.',
};
const NOTICES: Record<string, string> = {
  bet: '가진 젤칩 안에서 1개 이상 걸어 주세요.',
  active: '진행 중인 카드 21을 먼저 끝내 주세요.',
  fast: '너무 빨라요. 잠깐 뒤에 다시 걸어 주세요.',
  rescue: '다시 시작할 젤칩 1000개를 받았어요.',
  'no-rescue': '오늘 이미 다시 시작했거나, 아직 젤칩이나 진행 중인 카드 21이 있어요.',
};
const chips = (n: number) => n.toLocaleString('ko-KR');

function Art({ name }: { name: string }) {
  const art = GAMBLE_ART[name]!;
  return art.image ? <img class="gb-art" src={art.image} alt={art.text} /> : <span>{art.text}</span>;
}

const BET_STEPS = [1, 5, 10, 100, 1000, 10000];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 나리가 그린 게임별 배경: 게임 방은 정사각형(room), 로비의 게임 고르기 칸은 가로로 긴 그림(lobby).
// 게임 방에서 제일 크게 보이는 그림(먼저 받기 시작해요).
const MAIN_ART: Record<Game, string> = { slot: 'slotFrame', roulette: 'wheel', cards: 'cardBack' };
const gameBackground = (game: Game, kind: 'room' | 'lobby') => `/gamble/bg/${game}-${kind}.webp?v=2`;

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
        <span>걸 젤칩</span><output class="gb-bet-amount" aria-label="걸 젤칩">{chips(bet)}개</output>
      </div>
      <div class="gb-bet-steps" role="group" aria-label="걸 젤칩 고르기">
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

// 룰렛 판 그림(나리 그림)은 같은 크기 8칸이에요. 12시 방향 칸부터 시계 방향으로 이 배수예요.
// 나올 확률은 그림 크기와 상관없이 서버의 ROULETTE(WHEEL)가 정하고, 여기서는 나온 배수 칸으로 판을 돌려 세워요.
const DISC_SLICES = [0, 0.5, 1, 1.5, 2, 3, 5, 10];
const SLICE = 360 / DISC_SLICES.length;
if (ROULETTE.some(({ payout }) => !DISC_SLICES.includes(payout))) throw new Error('룰렛 판 그림에 없는 배수가 있어요');

function RouletteWheel({ landed: raw }: { landed?: number }) {
  // 예전 판(40칸·20칸) 결과 번호는 지금 판에 없을 수 있어서, 그때는 멈춘 칸 없이 그려요.
  const landed = raw !== undefined && raw < WHEEL.length ? raw : undefined;
  const slice = landed === undefined ? 0 : DISC_SLICES.indexOf(WHEEL[landed]!);
  // 칸 한가운데만 서지 않게, 결과 번호에 따라 칸 안에서 조금씩 다른 자리에 서요(칸 폭 45도 중 ±15도).
  const wobble = landed === undefined ? 0 : ((landed * 37) % 31) - 15;
  return (
    <div class={`gb-wheel-stage${GAMBLE_ART.wheel?.image ? ' gb-wheel-stage--rim' : ''}`}>
      <div class="gb-wheel-pointer" aria-hidden="true"><Art name="pointer" /></div>
      <div class="gb-wheel-viewport">
        <div class="gb-wheel-disc gb-wheel-disc--art" data-gb-landed={landed}
          style={`--gb-wheel-stop:${-(slice * SLICE + wobble)}deg`} aria-hidden="true">
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
    <div class={`gb-game-surface gb-surface-${game}`} style={`--gb-bg:url(${gameBackground(game, 'room')})`}>
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
  const net = payback(round.bet, multiplier) - round.bet;
  return (
    <div class="gb-round-result" aria-live="polite" data-gb-reveal>
      <h2>{net > 0 ? `젤칩 ${chips(net)}개 이겼어요!` : net < 0 ? `젤칩 ${chips(-net)}개 잃었어요` : '본전이에요'}</h2>
      <p>{round.game === 'roulette' && `룰렛 ${Number(round.state) + 1}번째 칸 · `}{multiplier}배 · 지금 가진 젤칩 <strong>{chips(balance)}개</strong></p>
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
      {game === 'roulette' && <p>1배는 본전이고, 0.5배·1.5배는 받을 젤칩을 내림해요. 나올 확률: {ROULETTE.map(({ payout, count }) => `${payout}배 ${count}%`).join(' · ')}</p>}
      {game === 'cards' && <p>딜러는 17점부터 멈춰요. 승리 2배 · 첫 두 장으로 21을 만들어 이기면 3배 · 비기면 1배</p>}
    </details>
  );
}

type Rank = { name: string; value: number };

const noticeText = (key?: string) => key && Object.hasOwn(NOTICES, key) ? NOTICES[key] : null;

function ChipBalance({ balance }: { balance: number }) {
  return <p class="gb-room-balance">가진 젤칩 <strong class="gb-balance">{chips(balance)}개</strong></p>;
}

export function GambleLobby(props: {
  viewer: Member; account: GambleAccount | null; inProgress: boolean;
  ranks: Rank[][]; now: string; daily: boolean; notice?: string;
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
          {props.daily && <p role="status">오늘 젤칩 1000개 받았어요.</p>}
          {notice && <p role="status">{notice}</p>}
          {balance === 0 && !props.inProgress && props.account?.rescue_day !== gambleDay(props.now) && (
            <form method="post" action="/gamble/rescue">
              <input type="hidden" name="day" value={gambleDay(props.now)} />
              <button class="gb-button" type="submit">다시 시작</button>
            </form>
          )}
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
              <span aria-hidden="true">👑</span> 이번 시즌 누적 딴 젤칩 1등 <b>{seasonRank[0].name}</b> · {chips(seasonRank[0].value)}개
            </p>
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
  daily: boolean; notice?: string;
}) {
  const { game, balance } = props;
  const hand = game === 'cards' ? props.hand : null;
  const result = !hand && props.result?.multiplier != null ? props.result : null;
  const motion = result ?? (hand && hand.token === props.result?.token ? hand : null);
  const notice = noticeText(props.notice);
  return (
    <Layout title={GAMES[game]} viewer={props.viewer} active="gamble" scripts={[{ src: '/gamble.js?v=3', type: 'module' }]}
      preloadImages={[gameBackground(game, 'room'), ...[MAIN_ART[game]].flatMap((name) => GAMBLE_ART[name]?.image ?? [])]}>
      <div class="gb-page gb-room-page">
        <div class="gb-room-bar">
          <a href="/gamble">← 겜블장</a>
          <ChipBalance balance={balance} />
          {game !== 'cards' && props.hand && <a class="gb-resume" href="/gamble/cards">진행 중인 카드 21로 가기</a>}
          {props.daily && <p role="status">오늘 젤칩 1000개 받았어요.</p>}
        </div>
        <section class="gb-panel gb-room" aria-label={GAMES[game]} data-gb-settled={result ? 'yes' : undefined}
          data-gb-motion={motion?.game} data-gb-key={motion ? `${motion.token}:${motion.revision}:${result ? 'done' : 'active'}` : undefined}>
          <h1><Art name={game} /> {GAMES[game]}</h1>
          {notice && <p role="status">{notice}</p>}
          <GameSurface game={game} round={hand ?? result} canBet={!hand} />
          {result && <Result round={result} balance={balance} />}
          {hand ? (
            <>
              <p>건 젤칩 {chips(hand.bet)}개 · 한국 시간 자정이 되면 자동으로 멈춰요.</p>
              <form class="gb-form" method="post" action="/gamble/cards" data-gb-card-actions="">
                <input type="hidden" name="token" value={hand.token} />
                <input type="hidden" name="revision" value={hand.revision} />
                <button class="gb-button gb-move-button gb-move-hit" name="move" value="hit" type="submit">한 장 더</button>
                <button class="gb-button gb-move-button gb-move-stand" name="move" value="stand" type="submit">멈추기</button>
              </form>
            </>
          ) : (
            <div data-gb-reveal>
              <BetForm game={game} balance={balance} previousBet={result?.bet} />
              {balance === 0 && <p><a href="/gamble">겜블장에서 젤칩 받기</a></p>}
              <noscript>걸 젤칩을 바꾸려면 자바스크립트를 켜 주세요.</noscript>
            </div>
          )}
          <GameRules game={game} />
        </section>
      </div>
    </Layout>
  );
}
