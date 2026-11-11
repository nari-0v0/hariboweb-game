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

function BetForm({ game, balance }: { game: Game; balance: number }) {
  return (
    <form class="gb-form" action="/gamble/play" method="post">
      <input type="hidden" name="game" value={game} />
      <input type="hidden" name="token" value={crypto.randomUUID()} />
      <label>걸 칩 <input required name="bet" type="number" min="1" max={balance} step="1" disabled={!balance} /></label>
      <button class="gb-button" type="submit" disabled={!balance}>{game === 'cards' ? '카드 받기' : '돌리기'}</button>
    </form>
  );
}

function Cards({ round }: { round: Round }) {
  const { player, dealer, score } = publicHand(round);
  const show = (card: number) => {
    const rank = rankOf(card);
    return <span class="gb-tile"><Art name={SUIT_ART[Math.floor(card / 13)]!} /> {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank]}</span>;
  };
  return (
    <>
      <p>내 카드 · {score}점</p>
      <div class="gb-tiles">{player.map(show)}</div>
      <p>딜러 카드</p>
      <div class="gb-tiles">{dealer.map(show)}{round.multiplier === null && <span class="gb-tile" aria-label="가려진 카드"><Art name="hidden" /></span>}</div>
    </>
  );
}

function Result({ round, balance }: { round: Round; balance: number }) {
  const multiplier = round.multiplier!;
  const net = round.bet * (multiplier - 1);
  return (
    <section class="gb-panel gb-result" id="gb-result" aria-label="게임 결과">
      <h2>{GAMES[round.game]} · {net > 0 ? `칩 ${chips(net)}개 이겼어요!` : net < 0 ? `칩 ${chips(-net)}개 잃었어요` : '본전이에요'}</h2>
      {round.game === 'slot' && <div class="gb-tiles">{(JSON.parse(round.state) as number[]).map((i) => <span class="gb-tile"><Art name={SLOT_ART[i]!} /></span>)}</div>}
      {round.game === 'roulette' && <p>룰렛 {Number(round.state) + 1}번째 칸</p>}
      {round.game === 'cards' && <Cards round={round} />}
      <p>{multiplier}배 · 지금 가진 칩 <strong>{chips(balance)}개</strong></p>
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
  return (
    <Layout title="겜블장" viewer={props.viewer} active="gamble">
      <div class="gb-page">
        <section class="gb-panel gb-intro">
          <h1>겜블장 <Art name="slot" /></h1>
          <p>칩은 겜블장 전용이에요. 젤리로 바꾸거나 상점에서 쓸 수 없고, 순위와 칭호에만 쓰여요.</p>
          <p>가진 칩 <strong class="gb-balance">{chips(balance)}개</strong></p>
          {props.daily && <p role="status">오늘 칩 1000개 받았어요.</p>}
          {notice && <p role="status">{notice}</p>}
          {balance === 0 && props.account?.rescue_day !== gambleDay(props.now) && (
            <form method="post" action="/gamble/rescue">
              <input type="hidden" name="day" value={gambleDay(props.now)} />
              <button class="gb-button" type="submit">다시 시작</button>
            </form>
          )}
        </section>
        {props.result && props.result.multiplier !== null && <Result round={props.result} balance={balance} />}
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
            <ol class="gb-wheel" aria-label="룰렛 40칸">
              {WHEEL.map((payout, i) => <li aria-current={props.result?.game === 'roulette' && Number(props.result.state) === i ? 'true' : undefined}>{payout}배</li>)}
            </ol>
            <p>{ROULETTE.map(({ payout, count }) => `${payout}배 ${count}칸`).join(' · ')}</p>
            <BetForm game="roulette" balance={balance} />
          </section>
          <section class="gb-panel" id="gb-cards">
            <h2><Art name="cards" /> 카드 21</h2>
            <p>21을 넘기지 않고 딜러보다 21에 가까우면 이겨요. 딜러는 17점부터 멈춰요.</p>
            <p>승리 2배 · 첫 두 장으로 21을 만들어 이기면 3배 · 비기면 1배</p>
            {props.hand ? (
              <>
                <p>건 칩 {chips(props.hand.bet)}개 · 한국 시간 자정이 되면 자동으로 멈춰요.</p>
                <Cards round={props.hand} />
                <form class="gb-form" method="post" action="/gamble/cards">
                  <input type="hidden" name="token" value={props.hand.token} />
                  <input type="hidden" name="revision" value={props.hand.revision} />
                  <button class="gb-button" name="move" value="hit" type="submit">한 장 더</button>
                  <button class="gb-button" name="move" value="stand" type="submit">멈추기</button>
                </form>
              </>
            ) : <BetForm game="cards" balance={balance} />}
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
