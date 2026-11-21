import type { Member } from '../env';
import type { CharacterPool } from '../character';
import { PRICES } from '../shop';
import { Card } from './card';
import { Layout } from './layout';

export const POOL_LABEL: Record<CharacterPool, string> = { girl: '여자', boy: '남자' };

function Preview(props: { viewer: Member; pool: CharacterPool; character: string; picked?: boolean }) {
  return (
    <Card
      id={props.viewer.user_id}
      character={props.character}
      kind="own"
      size="large"
      name={props.viewer.display_name}
      theme="basic"
      intro={POOL_LABEL[props.pool]}
      xp={0}
      stats={[]}
    />
  );
}

// 처음 들어오면 여자·남자 캐릭터 중 하나를 골라요. 고르기 전에는 다른 화면으로 못 가요.
export function ChoosePage(props: {
  viewer: Member;
  previews: Record<CharacterPool, string>;
  same?: Record<CharacterPool, boolean>;
  pick?: CharacterPool;
  changed?: boolean;
}) {
  const { viewer, previews, same, pick, changed } = props;
  if (pick) {
    // 확정 → 정말 이걸로? (다시 확인)
    return (
      <Layout title="캐릭터 고르기" viewer={viewer}>
        <section class="panel choose confirm">
          <h1>정말 이걸로 선택하시겠습니까?</h1>
          <div class="choose-one">
            <Preview viewer={viewer} pool={pick} character={previews[pick]} />
          </div>
          {changed ? <p class="notice">그 사이 받을 캐릭터가 바뀌었어요. 위 그림을 다시 확인해 주세요.</p> : null}
          <p class="notice">
            {same?.[pick] ? '지금 캐릭터를 그대로 써요. ' : '지금 캐릭터 대신 위 그림 캐릭터로 바뀌어요. '}
            <b>{POOL_LABEL[pick]}</b> 캐릭터로 정해요. 나중에 바꾸려면 젤리 상점에서 "성별 바꾸기"를 도감 젤리 {PRICES.gender}개로 사야 해요.
          </p>
          <div class="choose-actions">
            <a class="btn btn-ghost" href="/choose">
              다시 고르기
            </a>
            <form method="post" action="/api/me/gender">
              <input type="hidden" name="pool" value={pick} />
              <input type="hidden" name="character" value={previews[pick]} />
              <button class="btn btn-primary" type="submit">
                네, 이걸로 할게요
              </button>
            </form>
          </div>
        </section>
      </Layout>
    );
  }
  return (
    <Layout title="캐릭터 고르기" viewer={viewer}>
      <section class="panel choose">
        <h1>내 캐릭터를 골라 주세요</h1>
        <p class="muted">여자와 남자 캐릭터 중 하나를 골라야 도감을 시작할 수 있어요. 아래는 미리보기예요.</p>
        <form method="get" action="/choose" class="choose-form">
          <div class="choose-grid">
            {(['girl', 'boy'] as const).map((pool) => (
              <label class="choose-card">
                <input type="radio" name="pick" value={pool} required />
                <Preview viewer={viewer} pool={pool} character={previews[pool]} />
                <span class="choose-label">
                {POOL_LABEL[pool]}
                {same?.[pool] ? ' (지금 캐릭터 그대로)' : ''}
              </span>
              </label>
            ))}
          </div>
          <div class="choose-actions">
            {/* 다음 화면에서 한 번 더 확인하니 여기서는 "확정"이 아니라 "다음"이에요 */}
            <button class="btn btn-primary" type="submit">
              다음
            </button>
          </div>
        </form>
      </section>
    </Layout>
  );
}

// 상점 "성별 바꾸기" 확인 화면
export function GenderChangePage(props: { viewer: Member; to: CharacterPool; character: string; jelly: number; changed?: boolean }) {
  const { viewer, to } = props;
  return (
    <Layout title="성별 바꾸기" viewer={viewer} active="shop">
      <section class="panel choose confirm">
        <h1>{POOL_LABEL[to]} 캐릭터로 바꾸시겠습니까?</h1>
        <div class="choose-one">
          <Preview viewer={viewer} pool={to} character={props.character} />
        </div>
        {props.changed && (
          <p class="notice" role="status">
            그 사이 미리보기 캐릭터가 바뀌었어요. 도감 젤리는 그대로예요. 새 캐릭터를 확인하고 다시 눌러 주세요.
          </p>
        )}
        <p class="notice">
          도감 젤리 {PRICES.gender}개가 빠져요(지금 {props.jelly}개). 위 캐릭터는 미리보기예요.
        </p>
        <div class="choose-actions">
          <a class="btn btn-ghost" href="/shop">
            그만두기
          </a>
          <form method="post" action="/api/shop/gender">
            <input type="hidden" name="pool" value={to} />
            <input type="hidden" name="character" value={props.character} />
            <button class="btn btn-primary" type="submit">
              🍬 {PRICES.gender} 바꾸기
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

// 상점 "캐릭터 리롤권" 확인 화면(나리 2026-11-20): 무작위라 미리보기 없이, 지금 캐릭터만 보여 줘요
export function RerollPage(props: { viewer: Member; pool: CharacterPool; character: string; jelly: number; available?: boolean }) {
  const { viewer } = props;
  return (
    <Layout title="캐릭터 리롤권" viewer={viewer} active="shop">
      <section class="panel choose confirm">
        <h1>기본 캐릭터를 새로 뽑으시겠습니까?</h1>
        <p class="muted">아래는 지금 캐릭터예요.</p>
        <div class="choose-one">
          <Preview viewer={viewer} pool={props.pool} character={props.character} />
        </div>
        <p class="notice">
          지금 캐릭터 대신 같은 성별의 빈 캐릭터 중 하나가 <b>무작위</b>로 정해지고 <b>바로 확정</b>돼요. 되돌릴 수 없고, 지금 캐릭터는 다른 멤버가 받을 수 있어요.
        </p>
        <p class="notice">
          도감 젤리 {PRICES.reroll}개가 빠져요(지금 {props.jelly}개).
        </p>
        {props.available === false && (
          <p class="notice" role="alert">
            지금은 바꿀 수 있는 빈 캐릭터가 없어서 살 수 없어요. 새 캐릭터 그림이 들어오면 다시 살 수 있어요.
          </p>
        )}
        <div class="choose-actions">
          <a class="btn btn-ghost" href="/shop">
            그만두기
          </a>
          <form method="post" action="/api/shop/reroll">
            <input type="hidden" name="character" value={props.character} />
            <button class="btn btn-primary" type="submit" disabled={props.available === false}>
              🍬 {PRICES.reroll} 새로 뽑기
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

// 상점 "게임 기록 초기화권" 확인 화면(나리 2026-11-20). 되돌릴 수 없어서 체크해야 살 수 있어요.
export function GameResetPage(props: { viewer: Member; jelly: number; chips: number | null; handBet?: number; unclaimed?: boolean; gen: number; unchecked?: boolean }) {
  const { viewer } = props;
  return (
    <Layout title="게임 기록 초기화권" viewer={viewer} active="shop">
      <section class="panel confirm reset-confirm">
        <h1>⚠️ 게임 기록을 처음으로 되돌릴까요?</h1>
        <p class="notice">되돌릴 수 없어요. 아래 기록이 모두 처음 상태가 돼요.</p>
        <ul class="reset-list">
          <li>
            🎰 <b>겜블장</b>: 젤칩이 시작 칩 1000개가 되고 판 기록과 이번 시즌 겜블 순이익 기록이 사라져요
            {props.chips !== null && props.chips !== 1000 ? ` (지금 ${props.chips.toLocaleString('ko-KR')}개 → 1000개)` : ''}.{props.chips !== null && props.chips > 0 ? ' 디스코드에서 옮겨 온 젤칩과 점검 보상 젤칩도 따로 남지 않아요.' : ''}
            {props.unclaimed && ' 아직 받지 않은 시작 젤칩 1000개는 이 1000개로 쳐서 따로 받지 않아요.'}
            {!!props.handBet && ` 하고 있는 카드 21 판도 없어지고 건 젤칩 ${props.handBet.toLocaleString('ko-KR')}개는 돌아오지 않아요.`}
          </li>
          <li>🧭 <b>원정대</b>: 깬 장, 장비, 재료, 훈련, 젤코인, 펫, 끝없는 탑 층이 모두 처음으로.</li>
          <li>🔎 <b>사건파일</b>: 푼 사건, 재수사·오늘의 사건 기록이 모두 처음으로.</li>
        </ul>
        <p class="hint">그대로 남는 것: 도감 카드, 도감 젤리, 산 칭호·테마·꾸밈 캐릭터, 기본 캐릭터, 이미 받은 칭호.</p>
        <p class="hint">사건파일은 이미 푼 사건을 다시 풀어도 경험치·도감 젤리를 또 받지 않아요. 원정대는 이미 깬 장의 도감 젤리를 또 받지 않고, 하루 경험치는 평소처럼(오늘 받은 판 수는 이어서) 받아요.</p>
        {props.unchecked && (
          <p class="notice" role="alert">
            "알겠어요"에 체크해야 살 수 있어요.
          </p>
        )}
        <form method="post" action="/api/shop/reset" class="stack">
          <input type="hidden" name="gen" value={String(props.gen)} />
          <label class="reset-check">
            <input type="checkbox" name="ok" value="1" required /> 위 내용을 읽었고, 되돌릴 수 없다는 걸 알겠어요
          </label>
          <p class="notice">도감 젤리 {PRICES.reset}개가 빠져요(지금 {props.jelly}개).</p>
          <div class="choose-actions">
            <a class="btn btn-ghost" href="/shop">
              그만두기
            </a>
            <button class="btn btn-primary" type="submit">
              🍬 {PRICES.reset} 초기화하기
            </button>
          </div>
        </form>
      </section>
    </Layout>
  );
}
