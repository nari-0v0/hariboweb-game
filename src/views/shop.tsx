import type { Profile, Purchase } from '../db';
import type { Member } from '../env';
import { SHOP_ITEMS, canUse, type ShopItem } from '../shop';
import { Card } from './card';
import { Layout } from './layout';

const NOTICES: Record<string, string> = {
  requested: '결제를 요청했어요. 하리보봇이 젤리를 빼면 바로 열려요.',
  already_pending: '이미 결제 중인 물건이에요. 조금만 기다려 주세요.',
  owned: '이미 가진 물건이에요.',
  not_for_sale: '살 수 없는 물건이에요.',
  equipped: '꾸밈 캐릭터를 바꿨어요!',
  unequipped: '기본 캐릭터로 돌아왔어요.',
  theme: '카드 테마를 바꿨어요!',
};

const REASONS: Record<string, string> = {
  not_enough_jelly: '젤리가 부족해요',
  left: '서버를 나갔어요',
};

type State = 'using' | 'usable' | 'pending' | 'buy' | 'reward';

function stateOf(item: ShopItem, p: { profile: Profile; owned: Set<string>; cards: number; pending: Set<string> }): State {
  const usingNow = item.kind === 'theme' ? p.profile.theme_id === item.key : p.profile.deco_id === item.key;
  if (usingNow) return 'using';
  if (canUse(item, p.owned, p.cards)) return 'usable';
  if (p.pending.has(item.id)) return 'pending';
  return item.price === null ? 'reward' : 'buy';
}

function Action(props: { item: ShopItem; state: State; jelly: number | null; cards: number }) {
  const { item, state } = props;
  if (state === 'using') return <span class="tag on">사용 중</span>;
  if (state === 'pending') return <span class="tag wait">결제 중…</span>;
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
  const short = props.jelly !== null && props.jelly < (item.price ?? 0);
  return (
    <form method="post" action="/api/shop/buy">
      <input type="hidden" name="item" value={item.id} />
      <button class="btn btn-small btn-buy" type="submit" disabled={short} title={short ? '젤리가 부족해요' : undefined}>
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
  purchases: Purchase[];
  notice?: string;
}) {
  const { viewer, profile, owned, cards, purchases } = props;
  const pending = new Set(purchases.filter((x) => x.status === 'pending').map((x) => x.item_id));
  const ctx = { profile, owned, cards, pending };
  const themes = SHOP_ITEMS.filter((i) => i.kind === 'theme');
  const decoBuy = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price !== null);
  const decoReward = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price === null);
  // 방금(5분 안에) 끝난 결제 결과만 보여 줘요
  const since = Date.now() - 5 * 60_000;
  const recent = purchases
    .filter((x) => x.status !== 'pending' && x.settled_at && Date.parse(x.settled_at) >= since)
    .slice(0, 2);
  // 결제가 끝나면 "요청했어요" 안내는 결과 안내로 바뀌어요
  const notice = props.notice === 'requested' || props.notice === 'already_pending' ? (pending.size ? props.notice : undefined) : props.notice;
  const nameOf = (id: string) => SHOP_ITEMS.find((i) => i.id === id)?.name ?? id;

  return (
    <Layout title="젤리 상점" viewer={viewer} active="shop" refresh={pending.size ? 4 : undefined}>
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
              <span class="jelly" aria-label="내 젤리">
                🍬 {profile.jelly ?? '-'}
              </span>
            </div>
            {notice && NOTICES[notice] && <p class="notice ok">{NOTICES[notice]}</p>}
            {pending.size > 0 && <p class="notice">결제 중: {[...pending].map(nameOf).join(', ')} (자동으로 새로고침돼요)</p>}
            {recent.map((x) => (
              <p class={x.status === 'done' ? 'notice ok' : 'notice error'}>
                {nameOf(x.item_id)}: {x.status === 'done' ? '샀어요!' : `못 샀어요 (${REASONS[x.reason ?? ''] ?? x.reason ?? '알 수 없음'})`}
              </p>
            ))}
            {profile.jelly === null && <p class="muted">젤리는 하리보봇 통장에서 빠져나가요. 잔액은 봇이 알려 주면 여기에 보여요.</p>}
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
                    <Action item={item} state={state} jelly={profile.jelly} cards={cards} />
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
                    <Action item={item} state={state} jelly={profile.jelly} cards={cards} />
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
                    <Action item={item} state={state} jelly={profile.jelly} cards={cards} />
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
