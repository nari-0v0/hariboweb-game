import type { NickJob, Profile, Purchase } from '../db';
import type { Member } from '../env';
import { PRICES, SERVICES, SHOP_ITEMS, canUse, rewardNeed, serviceItem, servicePrice, type ShopItem } from '../shop';
import { poolOf } from '../character';
import { Card } from './card';
import { titleName } from '../titles';
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
  service_pending: [{ title: '구매 완료', text: '구매가 완료되었습니다. 하리보봇이 곧 디스코드에 적용해요(1분 안쪽).' }],
  gender_same: [{ title: '알림', text: '이미 그 성별 캐릭터예요.' }],
  price_changed: [{ title: '알림', text: '그 사이 값이 바뀌었어요. 새 값을 확인하고 다시 사 주세요.' }],
  nick_pending: [{ title: '변경 신청 완료', text: '하리보봇이 곧 디스코드 닉네임을 바꿔요(1분 안쪽). 칭호와 생년은 그대로예요.' }],
  nick_none: [{ title: '알림', text: '닉네임 변경권이 없거나, 앞서 신청한 변경을 아직 적용하는 중이에요.' }],
  nick_bad: [{ title: '알림', text: '닉네임은 띄어쓰기 없이 16자 안으로 적어 주세요. 「」는 쓸 수 없어요.', bad: true }],
  service_busy: [{ title: '알림', text: '앞서 산 것을 하리보봇이 아직 적용하는 중이에요. 끝나면 다시 살 수 있어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

const NICK_FAIL_TEXT: Record<string, string> = {
  invalid: '서버 닉네임 규칙(글자 수·자음모음만 쓰기 등)에 맞지 않아 바꾸지 못했어요.',
  banned: '쓸 수 없는 단어가 들어 있어 바꾸지 못했어요.',
  forbidden: '방장 계정이나 하리보봇보다 높은 역할은 디스코드 규칙상 봇이 닉네임을 바꿀 수 없어요. 디스코드에서 직접 바꿔 주세요(변경권은 그대로 남아요).',
  left: '서버에 없어서 바꾸지 못했어요.',
};

// 도감 젤리 모으는 법(나리가 정한 규칙이 바뀌면 같이 바꿔요)
export const JELLY_HOWTO = '출석 1개, 하루 통화 3시간 3개, 도감 카드 레벨이 오를 때마다 1개';

// 오류가 났을 때 방장에게 문의하는 카카오톡 오픈채팅
import { OWNER_CONTACT_URL } from '../contact';
export { OWNER_CONTACT_URL };

export type PopupLine = { title: string; text: string; bad?: boolean; contact?: boolean };

// 받침이 있으면 "을", 없으면 "를"
export function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
}

// 결제 결과 문구
export function resultLines(p: Pick<Purchase, 'status' | 'reason'> & { item_id?: string }, name: string): PopupLine[] {
  const service = serviceItem(p.item_id);
  if (p.status === 'done') return [{ title: '구매 완료', text: service ? service.done : `${name} 구매가 완료되었습니다.` }];
  if (p.reason === 'no_penalty') return [{ title: '적용 안 됨', text: '지울 벌점이 없어서 도감 젤리를 돌려드렸습니다.' }];
  if (p.reason === 'no_warning') return [{ title: '적용 안 됨', text: '지울 경고가 없어서 도감 젤리를 돌려드렸습니다.' }];
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

export function Popup(props: { lines: PopupLine[] }) {
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

function stateOf(item: ShopItem, p: { profile: Profile; owned: Set<string>; cards: number; members: number }): State {
  const usingNow = item.kind === 'theme' ? p.profile.theme_id === item.key : p.profile.deco_id === item.key;
  if (usingNow) return 'using';
  if (canUse(item, p.owned, p.cards, p.members)) return 'usable';
  return item.price === null ? 'reward' : 'buy';
}

function Action(props: { item: ShopItem; state: State; cards: number; members: number }) {
  const { item, state } = props;
  if (state === 'using') return <span class="tag on">사용 중</span>;
  if (state === 'reward')
    return (
      <span class="tag reward">
        도감 {props.cards}/{rewardNeed(item.rewardRank ?? 0, props.members)}장
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

export type ShopTab = 'store' | 'deco' | 'titles';

// 상점 위쪽: 젤리 잔액과 매점·꾸미기·칭호 탭
export function ShopHead(props: { jelly: number; tab: ShopTab }) {
  const tab = (key: ShopTab, href: string, label: string) => (
    <a href={href} class={`shop-tab${props.tab === key ? ' on' : ''}`} aria-current={props.tab === key ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <section class="panel shop-head">
      <div class="panel-head">
        <h1>젤리 상점</h1>
        <span class="jelly">
          보유 젤리 🍬 {props.jelly}개
        </span>
      </div>
      <p class="hint">모으는 법: {JELLY_HOWTO}</p>
      <nav class="shop-tabs" aria-label="상점 메뉴">
        {tab('store', '/shop', '🛒 매점')}
        {tab('deco', '/shop/deco', '🎨 꾸미기')}
        {tab('titles', '/titles', '🏷️ 칭호')}
      </nav>
    </section>
  );
}

export function ShopPage(props: {
  tab: 'store' | 'deco';
  viewer: Member;
  profile: Profile;
  owned: Set<string>;
  cards: number;
  members: number;
  results: Purchase[];
  services: { bought: Map<string, number>; pending: Set<string> };
  nick: { left: number; last: NickJob | null };
  notice?: string;
}) {
  const { viewer, profile, owned, cards, members } = props;
  const ctx = { profile, owned, cards, members };
  const themes = SHOP_ITEMS.filter((i) => i.kind === 'theme');
  const decoBuy = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price !== null);
  const decoReward = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price === null);
  const nameOf = (id: string) => SHOP_ITEMS.find((i) => i.id === id)?.name ?? serviceItem(id)?.name ?? (id === 'change:gender' ? '성별 바꾸기' : id);
  const popup = props.results.flatMap((p) => resultLines(p, nameOf(p.item_id)));
  const notice = props.notice ? NOTICES[props.notice] : undefined;
  if (notice && !popup.length) popup.push(...notice);

  const head = <ShopHead jelly={profile.dogam_jelly} tab={props.tab} />;
  return (
    <Layout title={props.tab === 'deco' ? '꾸미기' : '매점'} viewer={viewer} active="shop">
      <Popup lines={popup} />
      {props.tab === 'store' ? (
        <div class="stack-lg shop-store">
          {head}
          <section class="panel">
            <h2>잡다매점</h2>
            <p class="muted">사면 하리보봇이 디스코드에 바로 적용해요. 지울 게 없으면 젤리를 돌려드려요.</p>
            <div class="service-list">
              {SERVICES.map((item) => {
                const pending = props.services.pending.has(item.id);
                const price = servicePrice(item, props.services.bought.get(item.id) ?? 0);
                return (
                  <div class="service-item">
                    <div>
                      <span class="shop-name">{item.name}</span>
                      <p class="hint">{item.text}</p>
                    </div>
                    {pending ? (
                      <span class="tag">적용 중</span>
                    ) : (
                      <form method="post" action="/api/shop/service">
                        <input type="hidden" name="item" value={item.id} />
                        <input type="hidden" name="price" value={String(price)} />
                        <button class="btn btn-small btn-buy" type="submit">
                          🍬 {price}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
                <div class="service-item service-nick" id="nick">
                  <div>
                    <span class="shop-name">내 닉네임 변경권 {props.nick.left}장</span>
                    <p class="hint">닉네임 앞부분만 바뀌어요. 칭호·생년은 그대로예요.</p>
                    {props.nick.last && props.nick.last.status !== 'pending' && (
                      <p class="hint">
                        지난 변경 「{props.nick.last.front}」:{' '}
                        {props.nick.last.status === 'done' ? '적용됐어요' : `${NICK_FAIL_TEXT[props.nick.last.reason ?? ''] ?? '적용하지 못했어요'} 변경권은 그대로 남아 있어요.`}
                      </p>
                    )}
                  </div>
                  {props.nick.last?.status === 'pending' ? (
                    <span class="tag">적용 중</span>
                  ) : props.nick.left > 0 ? (
                    <form method="post" action="/api/shop/nick" class="nick-form">
                      <input name="front" maxlength={16} required placeholder="새 닉네임" aria-label="새 닉네임" />
                      <button class="btn btn-small btn-buy" type="submit">
                        바꾸기
                      </button>
                    </form>
                  ) : (
                    <span class="hint">위에서 사면 여기서 써요</span>
                  )}
                </div>
                <div class="service-item" id="gender">
                  <div>
                    <span class="shop-name">성별 바꾸기</span>
                    <p class="hint">{poolOf(profile.character_id) === 'boy' ? '남자 → 여자' : '여자 → 남자'} 캐릭터로 바꿔요. 바꾸기 전에 새 캐릭터를 미리 볼 수 있어요.</p>
                  </div>
                  <a class="btn btn-small btn-buy" href="/shop/gender">
                    🍬 {PRICES.gender}
                  </a>
                </div>
            </div>
          </section>

        </div>
      ) : (
        <div class="split">
        <div class="stage-wrap shop-preview">
          <Card
            id={viewer.user_id}
            character={profile.character_id}
            deco={profile.deco_id}
            kind="own"
            size="large"
            name={viewer.display_name}
            title={titleName(profile.title_id)}
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
          {head}
          <section class="panel">
            <h2>카드 테마</h2>
            <p class="muted">테마 그림을 누르면 내 카드에 미리 입혀 볼 수 있어요.</p>
            <div class="shop-grid">
              {themes.map((item) => {
                const state = stateOf(item, ctx);
                return (
                  <div class={`shop-item ${state}`}>
                    <button type="button" class={`theme-img swatch theme-${item.key}`} data-preview-theme={item.key} aria-label={`${item.name} 미리 보기`}>
                      <span class="swatch-inner"></span>
                    </button>
                    <span class="shop-name">{item.name}</span>
                    <Action item={item} state={state} cards={cards} members={members} />
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
                    <Action item={item} state={state} cards={cards} members={members} />
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
                    <Action item={item} state={state} cards={cards} members={members} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        </div>
      )}
    </Layout>
  );
}
