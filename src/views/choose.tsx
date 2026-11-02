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
export function ChoosePage(props: { viewer: Member; previews: Record<CharacterPool, string>; pick?: CharacterPool }) {
  const { viewer, previews, pick } = props;
  if (pick) {
    // 확정 → 정말 이걸로? (다시 확인)
    return (
      <Layout title="캐릭터 고르기" viewer={viewer}>
        <section class="panel choose confirm">
          <h1>정말 이걸로 선택하시겠습니까?</h1>
          <div class="choose-one">
            <Preview viewer={viewer} pool={pick} character={previews[pick]} />
          </div>
          <p class="notice">
            <b>{POOL_LABEL[pick]}</b> 캐릭터로 정해요. 나중에 바꾸려면 젤리 상점에서 "성별 바꾸기"를 도감 젤리 {PRICES.gender}개로 사야 해요.
          </p>
          <div class="choose-actions">
            <a class="btn btn-ghost" href="/choose">
              다시 고르기
            </a>
            <form method="post" action="/api/me/gender">
              <input type="hidden" name="pool" value={pick} />
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
                <span class="choose-label">{POOL_LABEL[pool]}</span>
              </label>
            ))}
          </div>
          <div class="choose-actions">
            <button class="btn btn-primary" type="submit">
              확정
            </button>
          </div>
        </form>
      </section>
    </Layout>
  );
}

// 상점 "성별 바꾸기" 확인 화면
export function GenderChangePage(props: { viewer: Member; to: CharacterPool; character: string; jelly: number }) {
  const { viewer, to } = props;
  return (
    <Layout title="성별 바꾸기" viewer={viewer} active="shop">
      <section class="panel choose confirm">
        <h1>{POOL_LABEL[to]} 캐릭터로 바꾸시겠습니까?</h1>
        <div class="choose-one">
          <Preview viewer={viewer} pool={to} character={props.character} />
        </div>
        <p class="notice">
          도감 젤리 {PRICES.gender}개가 빠져요(지금 {props.jelly}개). 위 캐릭터는 미리보기예요.
        </p>
        <div class="choose-actions">
          <a class="btn btn-ghost" href="/shop">
            그만두기
          </a>
          <form method="post" action="/api/shop/gender">
            <input type="hidden" name="pool" value={to} />
            <button class="btn btn-primary" type="submit">
              🍬 {PRICES.gender} 바꾸기
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}
