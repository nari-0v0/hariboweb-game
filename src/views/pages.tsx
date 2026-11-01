import type { Member } from '../env';
import type { DogamEntry, Profile } from '../db';
import { levelName, progress, tierFor } from '../levels';
import { DECO_CHARACTERS } from '../characters';
import { THEMES, UNLOCKED_THEMES } from '../themes';
import { Card, formatHours } from './card';
import { Layout } from './layout';

const SAMPLE_STATS: [string, string][] = [
  ['레벨', '20'],
  ['통화', '100시간'],
  ['내전', '12회'],
];

const TIER_LABEL = { plain: '기본', silver: '은테', gold: '금테', sparkle: '반짝이', holo: '홀로그램', legend: '전설' } as const;
const TIER_STEPS = [
  [5, '은테'],
  [10, '금테'],
  [20, '반짝이'],
  [30, '홀로그램'],
  [50, '전설'],
] as const;

function DiscordIcon() {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.8ZM8 15.5c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.7 8 10.7s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
      />
    </svg>
  );
}

export function LandingPage(props: { error?: string; devLogin: boolean }) {
  return (
    <Layout title="환영해요">
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">하리보 디스코드 멤버 전용</p>
          <h1>
            같이 놀수록
            <br />
            <mark>카드가 자라는</mark> 도감
          </h1>
          <p class="lead">통화방에서, 내전에서 함께한 시간만큼 서로의 카드가 반짝반짝 빛나요. 친구 카드를 모아 나만의 도감을 채워 보세요.</p>
          {props.error && <p class="notice error">{props.error}</p>}
          <a class="btn btn-discord" href="/auth/login">
            <DiscordIcon /> 디스코드로 시작하기
          </a>
          <p class="hint">하리보 서버 멤버만 들어올 수 있어요.</p>
          {props.devLogin && (
            <form class="dev" method="get" action="/auth/dev">
              <input name="id" placeholder="개발용 디스코드 ID" aria-label="개발용 디스코드 ID" />
              <input name="name" placeholder="이름" aria-label="이름" />
              <button class="btn btn-ghost" type="submit">개발용 로그인</button>
            </form>
          )}
        </div>
        <div class="fan" aria-hidden="true">
          <Card id="210987654321098765" character="girl-14-0" kind="pair" name="얼음공주" theme="ice" intro="새벽 롤 같이 해요" xp={3000} no="027" stats={SAMPLE_STATS} />
          <Card id="345678901234567890" character="girl-31-0" kind="pair" name="장미단" theme="rose" intro="내전 MVP 노려요" xp={11000} no="104" stats={SAMPLE_STATS} />
          <Card id="123456789012345678" character="boy-03-0" kind="pair" name="하리보" theme="basic" intro="반가워요!" xp={26000} no="001" stats={SAMPLE_STATS} />
        </div>
      </section>
      <section class="steps">
        <div class="step">
          <span class="step-no">1</span>
          <h3>같이 놀기</h3>
          <p>같은 통화방에 있거나 같은 내전에 나가면 서로의 카드 경험치가 올라요.</p>
        </div>
        <div class="step">
          <span class="step-no">2</span>
          <h3>카드 키우기</h3>
          <p>첫 만남에서 친구, 절친, 단짝까지. 레벨이 오를수록 카드가 화려해져요.</p>
        </div>
        <div class="step">
          <span class="step-no">3</span>
          <h3>도감 채우기</h3>
          <p>아직 못 만난 멤버는 실루엣으로 보여요. 같이 놀면 카드가 생겨요.</p>
        </div>
      </section>
    </Layout>
  );
}

function XpBar(props: { xp: number }) {
  const p = progress(props.xp);
  return (
    <div class="xp">
      <div class="xp-head">
        <span class="lv">Lv.{p.level}</span>
        <span class="hint">{p.next === null ? '최고 레벨이에요' : `다음 레벨까지 ${p.next - p.current} XP`}</span>
      </div>
      <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.ratio * 100)}>
        <div class="bar-fill" style={`width:${Math.max(3, Math.round(p.ratio * 100))}%`}></div>
      </div>
    </div>
  );
}

function TierRoad(props: { level: number }) {
  return (
    <ol class="road">
      {TIER_STEPS.map(([lv, label]) => (
        <li class={props.level >= lv ? 'done' : undefined}>
          <span class="dot"></span>
          <b>Lv.{lv}</b>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function MePage(props: { viewer: Member; profile: Profile; owned: number; total: number; saved: boolean }) {
  const { viewer, profile } = props;
  const level = progress(profile.solo_xp).level;
  return (
    <Layout title="내 카드" viewer={viewer} active="me">
      <div class="split">
        <div class="stage-wrap">
          <Card
            id={viewer.user_id}
            character={profile.character_id}
            kind="own"
            size="large"
            name={viewer.display_name}
            theme={profile.theme_id}
            intro={profile.intro}
            xp={profile.solo_xp}
            stats={[
              ['레벨', String(level)],
              ['도감', `${props.owned}/${props.total}`],
              ['경험치', profile.solo_xp.toLocaleString('ko-KR')],
            ]}
          />
        </div>
        <div class="side">
          <section class="panel">
            <div class="panel-head">
              <h1>{viewer.display_name}</h1>
              <span class={`chip tier-chip t-${tierFor(level)}`}>{TIER_LABEL[tierFor(level)]}</span>
            </div>
            <p class="muted">출석, 서바이벌, 빙고처럼 혼자 하는 활동으로 내 카드가 자라요.</p>
            <XpBar xp={profile.solo_xp} />
            <TierRoad level={level} />
          </section>

          <section class="panel">
            <h2>카드 꾸미기</h2>
            {props.saved && <p class="notice ok">저장했어요!</p>}
            <form method="post" action="/api/me/profile" class="stack">
              <label class="field">
                <span>한 줄 소개</span>
                <input name="intro" maxlength={30} value={profile.intro} placeholder="예: 저녁에 롤 같이 해요" />
                <small class="hint">30자까지</small>
              </label>
              <fieldset class="themes">
                <legend>카드 테마</legend>
                <div class="theme-grid">
                  {THEMES.map((t) => {
                    const locked = !UNLOCKED_THEMES.includes(t.id);
                    return (
                      <label class={locked ? 'theme locked' : 'theme'}>
                        <input type="radio" name="theme" value={t.id} checked={profile.theme_id === t.id} disabled={locked} />
                        <span class={`theme-img swatch theme-${t.id}`}>
                          <span class="swatch-inner"></span>
                          {locked && (
                            <span class="lock" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path
                                  fill="currentColor"
                                  d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z"
                                />
                              </svg>
                            </span>
                          )}
                        </span>
                        <span class="theme-name">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
                <small class="hint">잠긴 테마는 젤리 상점이 열리면 살 수 있어요.</small>
              </fieldset>
              <details class="deco">
                <summary>꾸밈 캐릭터 {DECO_CHARACTERS.length}종 미리 보기</summary>
                <div class="deco-grid">
                  {DECO_CHARACTERS.map((d) => (
                    <figure class="deco-item">
                      <img src={`/char/deco/${d.id}.png`} alt="" loading="lazy" width={d.w} height={d.h} />
                      <figcaption>{d.name}</figcaption>
                    </figure>
                  ))}
                </div>
                <small class="hint">꾸밈 캐릭터는 곧 열려요. 지금은 기본 캐릭터가 카드에 나와요.</small>
              </details>
              <button class="btn btn-primary" type="submit">저장하기</button>
            </form>
          </section>
        </div>
      </div>
    </Layout>
  );
}

export function DogamPage(props: {
  viewer: Member;
  owner: Member;
  entries: DogamEntry[];
  owned: number;
  total: number;
}) {
  const mine = props.owner.user_id === props.viewer.user_id;
  const pct = props.total ? Math.round((props.owned / props.total) * 100) : 0;
  const left = props.entries.filter((e) => !e.active).length;
  const title = mine ? '내 도감' : `${props.owner.display_name}님의 도감`;
  // 도감 번호: 서버에 들어온 순서
  const order = [...props.entries].sort(
    (a, b) => (a.joined_at ?? '9999').localeCompare(b.joined_at ?? '9999') || a.user_id.localeCompare(b.user_id),
  );
  const dexNo = new Map(order.map((e, i) => [e.user_id, String(i + 1).padStart(3, '0')]));
  const filter = (id: string, label: string, n: number, checked = false) => (
    <label class="filter">
      <input type="radio" name="f" id={id} checked={checked} />
      <span>
        {label} <em>{n}</em>
      </span>
    </label>
  );
  return (
    <Layout title={title} viewer={props.viewer} active={mine ? 'dogam' : undefined}>
      <div class="dogam">
        <section class="panel dogam-head">
          <div class="ring" style={`--p:${pct}`}>
            <span>
              <b>{pct}</b>%
            </span>
          </div>
          <div>
            <h1>{title}</h1>
            <p class="muted">
              지금 서버 멤버 {props.total}명 중 <b>{props.owned}명</b>의 카드를 모았어요.
            </p>
            <div class="filters" role="radiogroup" aria-label="보기">
              {filter('f-all', '전체', props.entries.length, true)}
              {filter('f-owned', '모은 카드', props.entries.filter((e) => e.owned && e.active).length)}
              {filter('f-unknown', '못 만난 멤버', props.total - props.owned)}
              {left > 0 && filter('f-left', '떠난 멤버', left)}
            </div>
          </div>
        </section>
        <div class="grid">
          {props.entries.map((e) => {
            const state = !e.active ? 'left' : e.owned ? 'owned' : 'unknown';
            const lv = progress(e.xp).level;
            return (
              <div class={`grid-item is-${state}`}>
                <Card
                  id={e.user_id}
                  character={e.character_id}
                  no={dexNo.get(e.user_id)}
                  kind={e.owned ? 'pair' : 'unknown'}
                  faded={!e.active}
                  name={e.display_name}
                  theme={e.theme_id}
                  intro={e.intro}
                  xp={e.xp}
                  vt={e.owned && mine ? `card-${e.user_id}` : undefined}
                  href={e.owned ? `/card/${e.user_id}${mine ? '' : `?from=${props.owner.user_id}`}` : undefined}
                  stats={
                    e.owned
                      ? [
                          ['레벨', String(lv)],
                          ['통화', formatHours(e.voice_seconds)],
                          ['내전', `${e.scrims}회`],
                        ]
                      : [
                          ['레벨', '?'],
                          ['통화', '?'],
                          ['내전', '?'],
                        ]
                  }
                />
                {e.is_newbie && e.active ? <span class="chip small sprout">새싹</span> : null}
                {mine && e.active ? (
                  <a class="peek" href={`/dogam/${e.user_id}`}>
                    도감 구경하기 →
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
        {props.entries.length === 0 && (
          <section class="panel empty">
            <p>아직 다른 멤버가 없어요.</p>
          </section>
        )}
      </div>
    </Layout>
  );
}

export function CardPage(props: { viewer: Member; owner: Member; target: Member; entry: DogamEntry }) {
  const { entry, owner, target } = props;
  const mine = owner.user_id === props.viewer.user_id;
  const p = progress(entry.xp);
  return (
    <Layout title={target.display_name} viewer={props.viewer}>
      <a class="back" href={mine ? '/dogam' : `/dogam/${owner.user_id}`}>
        ← {mine ? '내 도감' : `${owner.display_name}님의 도감`}
      </a>
      <div class="split">
        <div class="stage-wrap">
          <Card
            id={target.user_id}
            character={entry.character_id}
            kind="pair"
            size="large"
            faded={!target.active}
            name={target.display_name}
            theme={entry.theme_id}
            intro={entry.intro}
            xp={entry.xp}
            vt={mine ? `card-${target.user_id}` : undefined}
            stats={[
              ['레벨', String(p.level)],
              ['통화', formatHours(entry.voice_seconds)],
              ['내전', `${entry.scrims}회`],
            ]}
          />
        </div>
        <div class="side">
          <section class="panel">
            <p class="eyebrow">{mine ? `나와 ${target.display_name}님은` : `${owner.display_name}님과 ${target.display_name}님은`}</p>
            <h1 class="relation">
              {levelName(p.level)}
              <span class={`chip tier-chip t-${tierFor(p.level)}`}>{TIER_LABEL[tierFor(p.level)]}</span>
            </h1>
            <XpBar xp={entry.xp} />
            <TierRoad level={p.level} />
          </section>
          <div class="tiles">
            <div class="tile">
              <span class="tile-label">처음 만난 날</span>
              <b>{entry.first_met ? entry.first_met.slice(0, 10).replace(/-/g, '.') : '-'}</b>
            </div>
            <div class="tile">
              <span class="tile-label">함께 통화</span>
              <b>{formatHours(entry.voice_seconds)}</b>
            </div>
            <div class="tile">
              <span class="tile-label">함께한 내전</span>
              <b>{entry.scrims}회</b>
            </div>
          </div>
          {!target.active && <p class="notice">서버를 떠난 멤버예요. 다시 들어오면 카드가 살아나요.</p>}
        </div>
      </div>
    </Layout>
  );
}

export function MessagePage(props: { viewer?: Member | null; title: string; message: string }) {
  return (
    <Layout title={props.title} viewer={props.viewer}>
      <section class="panel message">
        <h1>{props.title}</h1>
        <p class="muted">{props.message}</p>
        <a class="btn btn-primary" href="/">처음으로</a>
      </section>
    </Layout>
  );
}
