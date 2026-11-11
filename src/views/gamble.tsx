import type { Member } from '../env';
import { GAMBLE_ART, SLOT_ART, SUIT_ART } from '../gamble-art';
import { CHERRY_PAIR, ROULETTE, SLOTS, WHEEL, rankOf } from '../gamble';
import { gambleDay, publicHand, type GambleAccount, type Game, type Round } from '../gamble-db';
import { Layout } from './layout';

const GAMES = { slot: '슬롯', roulette: '배수 룰렛', cards: '카드 21' };
const NOTICES: Record<string, string> = {
  bet: '가진 칩 안에서 1개 이상 걸어 주세요.',
  active: '진행 중인 카드 21을 먼저 끝내 주세요.',
  rescue: '다시 시작할 칩 1000개를 받았어요.',
  'no-rescue': '오늘 이미 다시 시작했거나, 아직 칩이 있어요.',
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

function BetForm({ game, balance }: { game: Game; balance: number }) {
  return (
    <form class="gb-form gb-bet-form" action="/gamble/play" method="post" data-gb-balance={balance}>
      <input type="hidden" name="game" value={game} />
      <input type="hidden" name="token" value={crypto.randomUUID()} />
      <input type="hidden" name="bet" value="0" />
      <div class="gb-bet-display">
        <span>걸 칩</span><output class="gb-bet-amount" aria-label="걸 칩">0개</output>
      </div>
      <div class="gb-bet-steps" role="group" aria-label="걸 칩 고르기">
        {BET_STEPS.map((step) => <button class="gb-button" type="button" data-gb-bet={step} disabled={!balance}>+{step}</button>)}
        <button class="gb-button" type="button" data-gb-bet="all" disabled={!balance}>올인</button>
        <button class="gb-button" type="button" data-gb-bet="clear" disabled={!balance}>지우기</button>
      </div>
      <button class="gb-button gb-play-button" type="submit" disabled>{game === 'cards' ? '카드 받기' : '돌리기'}</button>
    </form>
  );
}

function SlotReels({ reels }: { reels: number[] }) {
  const strip = Array.from({ length: 6 }, () => SLOT_ART).flat();
  const jackpot = reels.every((i) => SLOT_ART[i] === 'seven');
  return (
    <div class="gb-slot" data-gb-jackpot={jackpot ? 'yes' : undefined}>
      {reels.map((symbol) => {
        const name = SLOT_ART[symbol]!;
        return (
          <div class="gb-reel" role="img" aria-label={GAMBLE_ART[name]!.text}>
            <div class="gb-reel-strip" aria-hidden="true">
              {[...strip, name].map((item) => <span class="gb-reel-symbol"><Art name={item} /></span>)}
            </div>
          </div>
        );
      })}
      <ArtLayer name="slotFrame" />
    </div>
  );
}

const WHEEL_COLORS: Record<number, string> = {
  0: '#e0eaff', 1: '#addef8', 2: '#bceada', 3: '#f7d9a0', 5: '#e7cffa', 10: '#f5baca',
};
const SECTOR = 360 / WHEEL.length;
const WHEEL_FILL = `conic-gradient(from -${SECTOR / 2}deg, ${WHEEL.map((payout, i) =>
  `${WHEEL_COLORS[payout]} ${i * SECTOR}deg ${(i + 1) * SECTOR}deg`).join(', ')})`;

function RouletteWheel({ landed }: { landed: number }) {
  return (
    <div class="gb-wheel-stage">
      <div class="gb-wheel-pointer" aria-hidden="true"><Art name="pointer" /></div>
      <div class="gb-wheel-viewport">
        <div class="gb-wheel-disc" data-gb-landed={landed}
          style={`--gb-wheel-fill:${WHEEL_FILL};--gb-wheel-sector:${SECTOR}deg;--gb-wheel-stop:${-landed * SECTOR}deg`}
          aria-hidden="true">
          <ArtLayer name="wheel" />
          <div class="gb-wheel-sectors" />
          {WHEEL.map((payout, i) => (
            <span class="gb-wheel-label" data-gb-sector={i} aria-current={i === landed ? 'true' : undefined} style={`--gb-wheel-angle:${i * SECTOR}deg`}>{payout}배</span>
          ))}
        </div>
      </div>
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
      <div class="gb-card-deck" aria-hidden="true"><Art name="cardBack" /></div>
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

function Result({ round, balance }: { round: Round; balance: number }) {
  const multiplier = round.multiplier!;
  const net = round.bet * (multiplier - 1);
  const landed = Number(round.state);
  return (
    <section class="gb-panel gb-result" id="gb-result" aria-label="게임 결과"
      data-gb-motion={round.game} data-gb-key={`${round.token}:${round.revision}:done`}>
      <h2 data-gb-reveal>{GAMES[round.game]} · {net > 0 ? `칩 ${chips(net)}개 이겼어요!` : net < 0 ? `칩 ${chips(-net)}개 잃었어요` : '본전이에요'}</h2>
      {round.game === 'slot' && <SlotReels reels={JSON.parse(round.state) as number[]} />}
      {round.game === 'roulette' && <RouletteWheel landed={landed} />}
      {round.game === 'cards' && <Cards round={round} />}
      <p data-gb-reveal>{round.game === 'roulette' && `룰렛 ${landed + 1}번째 칸 · `}{multiplier}배 · 지금 가진 칩 <strong>{chips(balance)}개</strong></p>
    </section>
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

export function GamblePage(props: {
  viewer: Member; account: GambleAccount | null; hand: Round | null; result: Round | null;
  ranks: Rank[][]; now: string; daily: boolean; notice?: string;
}) {
  const balance = props.account?.chips ?? 0;
  const [balanceRank = [], bestRank = [], allInRank = [], seasonRank = []] = props.ranks;
  const notice = props.notice && Object.hasOwn(NOTICES, props.notice) ? NOTICES[props.notice] : null;
  const settled = props.result?.multiplier != null ? props.result : null;
  const playingHand = !settled && props.hand && props.hand.token === props.result?.token ? props.hand : null;
  return (
    <Layout title="겜블장" viewer={props.viewer} active="gamble" scripts={[{ src: '/gamble.js?v=1', type: 'module' }]}>
      <div class="gb-page">
        <section class="gb-panel gb-intro">
          <h1>겜블장 <Art name="slot" /></h1>
          <p>칩은 겜블장 전용이에요. 젤리로 바꾸거나 상점에서 쓸 수 없고, 순위와 칭호에만 쓰여요.</p>
          <p class="gb-intro-balance">가진 칩 <strong class="gb-balance">{chips(balance)}개</strong></p>
          {props.daily && <p role="status">오늘 칩 1000개 받았어요.</p>}
          {notice && <p role="status">{notice}</p>}
          {balance === 0 && props.account?.rescue_day !== gambleDay(props.now) && (
            <form method="post" action="/gamble/rescue">
              <input type="hidden" name="day" value={gambleDay(props.now)} />
              <button class="gb-button" type="submit">다시 시작</button>
            </form>
          )}
        </section>
        {settled && <Result round={settled} balance={balance} />}
        {props.hand && (
          <section class="gb-panel gb-result gb-active-hand" aria-label="진행 중인 카드 21"
            data-gb-motion={playingHand ? 'cards' : undefined}
            data-gb-key={playingHand ? `${playingHand.token}:${playingHand.revision}:active` : undefined}>
            <h2><Art name="cards" /> 카드 21 진행 중</h2>
            <p>건 칩 {chips(props.hand.bet)}개 · 한국 시간 자정이 되면 자동으로 멈춰요.</p>
            <Cards round={props.hand} />
            <form class="gb-form" method="post" action="/gamble/cards" data-gb-card-actions="">
              <input type="hidden" name="token" value={props.hand.token} />
              <input type="hidden" name="revision" value={props.hand.revision} />
              <button class="gb-button" name="move" value="hit" type="submit">한 장 더</button>
              <button class="gb-button" name="move" value="stand" type="submit">멈추기</button>
            </form>
          </section>
        )}
        <noscript>걸 칩을 고르려면 자바스크립트를 켜 주세요.</noscript>
        <div class="gb-games">
          <section class="gb-panel">
            <h2><Art name="slot" /> 슬롯</h2>
            <p>같은 그림 3개가 나오면 배당을 받아요.</p>
            <div class="gb-tiles">{SLOTS.map(({ payout }, i) => <span class="gb-tile"><Art name={SLOT_ART[i]!} /> {payout}배</span>)}</div>
            <p><Art name="cherry" /> 2개는 {CHERRY_PAIR}배예요.</p>
            <BetForm game="slot" balance={balance} />
          </section>
          <section class="gb-panel">
            <h2><Art name="roulette" /> 배수 룰렛</h2>
            <p>40칸 중 하나에 멈춰요. 1배는 본전이에요.</p>
            <p>{ROULETTE.map(({ payout, count }) => `${payout}배 ${count}칸`).join(' · ')}</p>
            <BetForm game="roulette" balance={balance} />
          </section>
          <section class="gb-panel" id="gb-cards">
            <h2><Art name="cards" /> 카드 21</h2>
            <p>21을 넘기지 않고 딜러보다 21에 가까우면 이겨요. 딜러는 17점부터 멈춰요.</p>
            <p>승리 2배 · 첫 두 장으로 21을 만들어 이기면 3배 · 비기면 1배</p>
            {props.hand ? <p>진행 중인 판은 위 노란 상자에서 이어서 해요.</p> : <BetForm game="cards" balance={balance} />}
          </section>
        </div>
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
