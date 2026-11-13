import type { Profile } from '../db';
import type { Member } from '../env';
import type { TitleState } from '../title-db';
import { TITLES, TITLE_GROUPS, visibleTitles, titleName, titleProgress, type Title, type TitleStats } from '../titles';
import { Card } from './card';
import { Layout } from './layout';
import { Popup, ShopHead, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  equipped: [{ title: '변경 완료', text: '칭호를 바꿨어요. 하리보봇이 곧(1분 안쪽) 디스코드 닉네임 앞에 붙여요.' }],
  removed: [{ title: '변경 완료', text: '칭호를 뗐어요. 하리보봇이 곧 디스코드 닉네임에서도 떼요.' }],
  bought: [{ title: '구매 완료', text: '칭호 구매가 완료되었습니다. 아래에서 "쓰기"를 누르면 닉네임 앞에 붙어요.' }],
  owned: [{ title: '알림', text: '이미 가지고 있는 칭호입니다.' }],
  not_for_sale: [{ title: '알림', text: '젤리로 살 수 없는 칭호입니다. 조건을 채우면 열려요.' }],
  locked: [{ title: '알림', text: '아직 조건을 채우지 못한 칭호입니다.' }],
  not_enough_jelly: [{ title: '구매 실패', text: '도감 젤리가 부족해서 구매하지 못했습니다.', bad: true }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

// 닉네임에 붙었는지 알려 주는 한 줄
function applyText(s: TitleState): { text: string; retry?: boolean } | null {
  const want = s.title_id ?? '';
  if (want !== (s.title_applied ?? '')) return { text: want ? '하리보봇이 곧 디스코드 닉네임 앞에 붙여요(1분 안쪽).' : '하리보봇이 곧 디스코드 닉네임에서 떼요.' };
  if (!want)
    return s.title_note ? { text: '디스코드 닉네임에서 칭호를 떼지 못했어요(봇보다 높은 역할일 수 있어요). 다시 떼어 볼 수 있어요.', retry: true } : null;
  if (s.title_note === 'too_long') return { text: '닉네임이 길어서 칭호를 붙이지 못했어요(디스코드 닉네임은 32자까지). 닉네임을 줄인 뒤 다시 붙여 보세요.', retry: true };
  if (s.title_note === 'forbidden') return { text: '하리보봇이 이 멤버의 닉네임은 바꿀 수 없어요(봇보다 높은 역할). 웹 카드에만 보여요. 역할 순서를 고쳤다면 다시 붙여 볼 수 있어요.', retry: true };
  if (s.title_note) return { text: '디스코드 닉네임에 붙이지 못했어요.', retry: true };
  return { text: '디스코드 닉네임 앞에 붙어 있어요.' };
}

function TitleRow(props: { t: Title; stats: TitleStats; owned: boolean; using: boolean }) {
  const { t, stats, owned, using } = props;
  const prog = titleProgress(t, stats);
  const open = owned || (t.rule.kind !== 'shop' && prog.ok);
  return (
    <div class={`title-item${using ? ' using' : open ? ' open' : ' locked'}`}>
      <span class="title-chip">{t.name}</span>
      <div class="title-info">
        <span class="hint">{prog.text}</span>
        {!open && prog.now && <span class="hint now">지금 {prog.now}</span>}
      </div>
      {using ? (
        <span class="tag on">사용 중</span>
      ) : open ? (
        <form method="post" action="/api/titles/equip">
          <input type="hidden" name="title" value={t.id} />
          <button class="btn btn-small" type="submit">
            쓰기
          </button>
        </form>
      ) : t.rule.kind === 'shop' ? (
        <form method="post" action="/api/titles/buy">
          <input type="hidden" name="title" value={t.id} />
          <button class="btn btn-small btn-buy" type="submit">
            🍬 {t.rule.price}
          </button>
        </form>
      ) : (
        <span class="tag reward">잠김</span>
      )}
    </div>
  );
}

// 상점 칭호는 이름표와 버튼만 작게 보여요(500개 가까이라)
function ShopChip(props: { t: Title; owned: boolean; using: boolean }) {
  const { t, owned, using } = props;
  return (
    <div class={`title-cell${using ? ' using' : owned ? ' open' : ''}`}>
      <span class="title-chip">{t.name}</span>
      {using ? (
        <span class="tag on">사용 중</span>
      ) : owned ? (
        <form method="post" action="/api/titles/equip">
          <input type="hidden" name="title" value={t.id} />
          <button class="btn btn-small" type="submit">
            쓰기
          </button>
        </form>
      ) : (
        <form method="post" action="/api/titles/buy">
          <input type="hidden" name="title" value={t.id} />
          <button class="btn btn-small btn-buy" type="submit">
            🍬 {t.rule.kind === 'shop' ? t.rule.price : ''}
          </button>
        </form>
      )}
    </div>
  );
}

export function TitlesPage(props: {
  viewer: Member;
  profile: Profile;
  stats: TitleStats;
  owned: Set<string>;
  state: TitleState;
  fresh: string[];
  focus?: string;
  notice?: string;
}) {
  const { viewer, profile, stats, owned, state } = props;
  const current = titleName(state.title_id);
  const popup: PopupLine[] = [];
  if (props.fresh.length)
    popup.push({ title: '새 칭호', text: `새 칭호를 얻었어요: ${props.fresh.map((id) => `「${titleName(id)}」`).join(' ')}` });
  const notice = props.notice && Object.hasOwn(NOTICES, props.notice) ? NOTICES[props.notice] : undefined;
  if (notice) popup.push(...notice);
  const apply = applyText(state);
  const shown = visibleTitles(owned);
  const count = shown.filter((t) => owned.has(t.id)).length;

  return (
    <Layout title="칭호" viewer={viewer} active="shop">
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
            title={current}
            theme={profile.theme_id}
            intro={profile.intro}
            xp={profile.solo_xp}
            stats={[]}
          />
        </div>

        <div class="stack-lg">
          <ShopHead jelly={profile.dogam_jelly} tab="titles" />
          <section class="panel">
            <div class="panel-head">
              <h2>칭호</h2>
              <span class="hint">예: 「칭호」 닉네임 생년</span>
            </div>
            <div class="service-item">
              <div>
                <span class="shop-name">지금 칭호: {current ? `「${current}」` : '없음'}</span>
                {apply && <p class="hint">{apply.text}</p>}
              </div>
              {!current && apply?.retry && (
                <form method="post" action="/api/titles/equip">
                  <input type="hidden" name="title" value="" />
                  <button class="btn btn-small" type="submit">
                    다시 떼기
                  </button>
                </form>
              )}
              {current && (
                <div class="title-actions">
                  {apply?.retry && (
                    <form method="post" action="/api/titles/equip">
                      <input type="hidden" name="title" value={state.title_id ?? ''} />
                      <button class="btn btn-small" type="submit">
                        다시 붙이기
                      </button>
                    </form>
                  )}
                  <form method="post" action="/api/titles/equip">
                    <input type="hidden" name="title" value="" />
                    <button class="btn btn-small" type="submit">
                      칭호 떼기
                    </button>
                  </form>
                </div>
              )}
            </div>
            <details class="owned-titles">
              <summary>
                보유 칭호 {count}/{shown.length}개
              </summary>
              {count ? (
                <div class="title-grid">
                  {TITLES.filter((t) => owned.has(t.id)).map((t) => (
                    <ShopChip t={t} owned using={state.title_id === t.id} />
                  ))}
                </div>
              ) : (
                <p class="hint">아직 가진 칭호가 없어요.</p>
              )}
            </details>
          </section>

          <p class="hint center">묶음을 누르면 펼쳐져요.</p>
          {TITLE_GROUPS.map((g) => {
            const list = shown.filter((t) => t.group === g);
            if (!list.length) return null;
            const shop = list[0]?.rule.kind === 'shop' ? list[0].rule.price : null;
            const have = list.filter((t) => owned.has(t.id)).length;
            const open = list.some((t) => t.id === state.title_id || t.id === props.focus || props.fresh.includes(t.id));
            return (
              <details class="panel title-group" open={open}>
                <summary>
                  <h2>{g}</h2>
                  <span class="hint">
                    {shop !== null ? `🍬 ${shop} · ` : ''}가진 {have}/{list.length}
                  </span>
                </summary>
                {shop !== null ? (
                  <div class="title-grid">
                    {list.map((t) => (
                      <ShopChip t={t} owned={owned.has(t.id)} using={state.title_id === t.id} />
                    ))}
                  </div>
                ) : (
                  <div class="title-list">
                    {list.map((t) => (
                      <TitleRow t={t} stats={stats} owned={owned.has(t.id)} using={state.title_id === t.id} />
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
