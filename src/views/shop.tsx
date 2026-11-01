import type { Profile, Purchase } from '../db';
import type { Member } from '../env';
import { SHOP_ITEMS, canUse, type ShopItem } from '../shop';
import { Card } from './card';
import { Layout } from './layout';

// 버튼을 누른 뒤 팝업으로 보여 주는 안내
const NOTICES: Record<string, PopupLine[]> = {
  equipped: [{ title: '변경 완료', text: '꾸밈 캐릭터로 변경되었습니다.' }],
  unequipped: [{ title: '변경 완료', text: '기본 캐릭터로 돌아왔습니다.' }],
  theme: [{ title: '변경 완료', text: '카드 테마가 변경되었습니다.' }],
  owned: [{ title: '알림', text: '이미 가지고 있는 물건입니다.' }],
  not_for_sale: [{ title: '알림', text: '젤리로 살 수 없는 물건입니다.' }],
  locked: [{ title: '알림', text: '아직 사용할 수 없는 물건입니다.' }],
  not_enough_jelly: [{ title: '구매 실패', text: '도감 젤리가 부족해서 구매하지 못했습니다.', bad: true }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

// 도감 젤리 모으는 법(나리가 정한 규칙이 바뀌면 같이 바꿔요)
export const JELLY_HOWTO = '처음 한 번 5개, 출석 1개, 하루 통화 3시간 3개, 도감 카드 레벨이 오를 때마다 1개';

// 오류가 났을 때 방장에게 문의하는 카카오톡 오픈채팅
export const OWNER_CONTACT_URL = 'https://open.kakao.com/o/sznz9sHg';

type PopupLine = { title: string; text: string; bad?: boolean; contact?: boolean };

// 받침이 있으면 "을", 없으면 "를"
export function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
}

// 결제 결과 문구
export function resultLines(p: Pick<Purchase, 'status' | 'reason'>, name: string): PopupLine[] {
  if (p.status === 'done') return [{ title: '구매 완료', text: `${name} 구매가 완료되었습니다.` }];
  if (p.reason === 'not_enough_jelly')
    return [{ title: '구매 실패', text: `젤리가 부족해서 ${name}${objectParticle(name)} 구매하지 못했습니다.`, bad: true }];
  if (p.reason === 'left') return [{ title: '구매 취소', text: `서버를 나가서 ${name} 구매가 취소되었습니다.`, bad: true }];
  if (p.reason === 'shop_changed')
    return [{ title: '구매 취소', text: `상점이 도감 젤리로 바뀌어서 ${name} 구매가 취소되었습니다. 젤리는 빠지지 않았습니다.` }];
  return [
    { title: '구매 실패', text: `${name} 구매 중 오류가 발생하였습니다.`, bad: true },
    { title: '구매 실패', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ];
}

function Popup(props: { lines: PopupLine[] }) {
  if (!props.lines.length) return null;
  const bad = props.lines.some((l) => l.bad);
  return (
    <>
      <input type="checkbox" id="popup-close" class="popup-close" />
      <div class="popup-wrap">
        <div class={`popup panel${bad ? ' bad' : ''}`} role="alertdialog" aria-labelledby="popup-title">
          <h2 id="popup-title">{props.lines[0]!.title}</h2>
          {props.lines.map((l) => (
            <p>{l.text}</p>
          ))}
          <div class="popup-actions">
            {props.lines.some((l) => l.contact) && (
              <a class="btn btn-ghost" href={OWNER_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                방장에게 문의하기
              </a>
            )}
            <label for="popup-close" class="btn btn-primary" tabindex={0}>
              확인
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

type State = 'using' | 'usable' | 'buy' | 'reward';

function stateOf(item: ShopItem, p: { profile: Profile; owned: Set<string>; cards: number }): State {
  const usingNow = item.kind === 'theme' ? p.profile.theme_id === item.key : p.profile.deco_id === item.key;
  if (usingNow) return 'using';
  if (canUse(item, p.owned, p.cards)) return 'usable';
  return item.price === null ? 'reward' : 'buy';
}

function Action(props: { item: ShopItem; state: State; cards: number }) {
  const { item, state } = props;
  if (state === 'using') return <span class="tag on">사용 중</span>;
  if (state === 'reward')
    return (
      <span class="tag reward">
        도감 {props.cards}/{item.rewardCards}장
      </span>
    );
  if (state === 'usable')
    return (
      <form method="post" action={item.kind === 'theme' ? '/api/me/theme' : '/api/me/deco'}>
        <input type="hidden" name={item.kind} value={item.key} />
        <button class="btn btn-small" type="submit">
          쓰기
        </button>
      </form>
    );
  // 잔액이 모자라도 버튼은 막지 않아요. 누르면 "젤리가 부족해요" 안내가 떠요.
  return (
    <form method="post" action="/api/shop/buy">
      <input type="hidden" name="item" value={item.id} />
      <button class="btn btn-small btn-buy" type="submit">
        🍬 {item.price}
      </button>
    </form>
  );
}

export function ShopPage(props: {
  viewer: Member;
  profile: Profile;
  owned: Set<string>;
  cards: number;
  results: Purchase[];
  notice?: string;
}) {
  const { viewer, profile, owned, cards } = props;
  const ctx = { profile, owned, cards };
  const themes = SHOP_ITEMS.filter((i) => i.kind === 'theme');
  const decoBuy = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price !== null);
  const decoReward = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price === null);
  const nameOf = (id: string) => SHOP_ITEMS.find((i) => i.id === id)?.name ?? id;
  const popup = props.results.flatMap((p) => resultLines(p, nameOf(p.item_id)));
  const notice = props.notice ? NOTICES[props.notice] : undefined;
  if (notice && !popup.length) popup.push(...notice);

  return (
    <Layout title="젤리 상점" viewer={viewer} active="shop">
      <Popup lines={popup} />
      <div class="split">
        <div class="stage-wrap shop-preview">
          <Card
            id={viewer.user_id}
            character={profile.character_id}
            deco={profile.deco_id}
            kind="own"
            size="large"
            name={viewer.display_name}
            theme={profile.theme_id}
            intro={profile.intro}
            xp={profile.solo_xp}
            stats={[]}
          />
          {profile.deco_id && (
            <form method="post" action="/api/me/deco" class="center">
              <input type="hidden" name="deco" value="" />
              <button class="btn btn-small" type="submit">
                기본 캐릭터로 돌아가기
              </button>
            </form>
          )}
        </div>

        <div class="stack-lg">
          <section class="panel">
            <div class="panel-head">
              <h1>젤리 상점</h1>
              <span class="jelly" aria-label="내 도감 젤리">
                🍬 {profile.dogam_jelly}
              </span>
            </div>
            <p class="muted">
              도감 젤리는 이 도감에서만 쓰는 젤리예요. 겜블 젤리와는 따로라서 겜블 지갑에서는 빠지지 않아요.
            </p>
            <p class="hint">모으는 법: {JELLY_HOWTO}</p>
          </section>

          <section class="panel">
            <h2>카드 테마</h2>
            <div class="shop-grid">
              {themes.map((item) => {
                const state = stateOf(item, ctx);
                return (
                  <div class={`shop-item ${state}`}>
                    <span class={`theme-img swatch theme-${item.key}`}>
                      <span class="swatch-inner"></span>
                    </span>
                    <span class="shop-name">{item.name}</span>
                    <Action item={item} state={state} cards={cards} />
                  </div>
                );
              })}
            </div>
          </section>

          <section class="panel">
            <h2>꾸밈 캐릭터</h2>
            <p class="muted">사면 내 카드 그림이 이 캐릭터로 바뀌어요. 언제든 기본 캐릭터로 돌아갈 수 있어요.</p>
            <div class="shop-grid deco">
              {decoBuy.map((item) => {
                const state = stateOf(item, ctx);
                return (
                  <div class={`shop-item ${state}`}>
                    <img src={`/char/deco/${item.key}.png`} alt="" loading="lazy" />
                    <span class="shop-name">{item.name}</span>
                    <Action item={item} state={state} cards={cards} />
                  </div>
                );
              })}
            </div>
          </section>

          <section class="panel">
            <h2>도감 보상 캐릭터</h2>
            <p class="muted">젤리로는 못 사요. 같이 놀아서 도감 카드를 모으면 하나씩 열려요. 지금 {cards}장 모았어요.</p>
            <div class="shop-grid deco">
              {decoReward.map((item) => {
                const state = stateOf(item, ctx);
                return (
                  <div class={`shop-item ${state}`}>
                    <img src={`/char/deco/${item.key}.png`} alt="" loading="lazy" />
                    <span class="shop-name">{item.name}</span>
                    <Action item={item} state={state} cards={cards} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
