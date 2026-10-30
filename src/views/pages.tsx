import type { Member } from '../env';
import type { DogamEntry, Profile } from '../db';
import { levelName, progress } from '../levels';
import { THEMES, UNLOCKED_THEMES } from '../themes';
import { Card, formatHours } from './card';
import { Layout } from './layout';

export function LandingPage(props: { error?: string; devLogin: boolean }) {
  return (
    <Layout title="환영해요">
      <section class="hero">
        <h1>하리보 멤버 도감</h1>
        <p>같이 통화하고 내전할수록 서로의 카드가 자라요. 친구 카드를 모아 도감을 채워 보세요.</p>
        {props.error && <p class="error">{props.error}</p>}
        <a class="button" href="/auth/login">디스코드로 로그인</a>
        <p class="hint">하리보 디스코드 서버 멤버만 들어올 수 있어요.</p>
        {props.devLogin && (
          <form class="dev" method="get" action="/auth/dev">
            <input name="id" placeholder="개발용 디스코드 ID" />
            <input name="name" placeholder="이름" />
            <button type="submit">개발용 로그인</button>
          </form>
        )}
      </section>
    </Layout>
  );
}

function ProgressBar(props: { xp: number }) {
  const p = progress(props.xp);
  return (
    <div class="xpbar">
      <div class="xpbar-fill" style={`width:${Math.round(p.ratio * 100)}%`}></div>
      <span>
        Lv.{p.level} · {p.next === null ? '최고 레벨' : `${p.current} / ${p.next} XP`}
      </span>
    </div>
  );
}

export function MePage(props: { viewer: Member; profile: Profile; owned: number; total: number; saved: boolean }) {
  const { viewer, profile } = props;
  return (
    <Layout title="내 카드" viewer={viewer}>
      <div class="split">
        <Card
          kind="own"
          size="large"
          name={viewer.display_name}
          theme={profile.theme_id}
          intro={profile.intro}
          xp={profile.solo_xp}
          stats={[
            ['레벨', String(progress(profile.solo_xp).level)],
            ['도감', `${props.owned}/${props.total}`],
            ['경험치', String(profile.solo_xp)],
          ]}
        />
        <section class="panel">
          <h2>내 카드</h2>
          <p>출석, 서바이벌, 빙고처럼 혼자 하는 활동으로 내 카드가 자라요.</p>
          <ProgressBar xp={profile.solo_xp} />
          <p class="hint">Lv.5 은테 · Lv.10 금테 · Lv.20 반짝이 · Lv.30 홀로그램 · Lv.50 전설</p>

          <h3>꾸미기</h3>
          {props.saved && <p class="ok">저장했어요.</p>}
          <form method="post" action="/api/me/profile" class="stack">
            <label>
              한 줄 소개 (30자까지)
              <input name="intro" maxlength={30} value={profile.intro} placeholder="예: 저녁에 롤 같이 해요" />
            </label>
            <fieldset class="themes">
              <legend>카드 테마</legend>
              {THEMES.map((t) => {
                const locked = !UNLOCKED_THEMES.includes(t.id);
                return (
                  <label class={locked ? 'theme locked' : 'theme'}>
                    <input type="radio" name="theme" value={t.id} checked={profile.theme_id === t.id} disabled={locked} />
                    <img src={`/frames/${t.id}.webp`} alt="" loading="lazy" />
                    <span>{t.name}</span>
                    {locked && <small>상점 준비 중</small>}
                  </label>
                );
              })}
            </fieldset>
            <button class="button" type="submit">저장</button>
          </form>
        </section>
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
  return (
    <Layout title={mine ? '내 도감' : `${props.owner.display_name}님의 도감`} viewer={props.viewer}>
      <section class="panel wide">
        <h1>{mine ? '내 도감' : `${props.owner.display_name}님의 도감`}</h1>
        <div class="xpbar">
          <div class="xpbar-fill" style={`width:${pct}%`}></div>
          <span>
            {props.owned} / {props.total}명 ({pct}%)
          </span>
        </div>
        <p class="hint">지금 서버에 있는 멤버만 완성도에 들어가요.</p>
      </section>
      <div class="grid">
        {props.entries.map((e) => (
          <div class="grid-item">
            <Card
              kind={e.owned ? 'pair' : 'unknown'}
              faded={!e.active}
              name={e.display_name}
              theme={e.theme_id}
              intro={e.intro}
              xp={e.xp}
              href={e.owned ? `/card/${e.user_id}${mine ? '' : `?from=${props.owner.user_id}`}` : undefined}
              stats={
                e.owned
                  ? [
                      ['레벨', String(progress(e.xp).level)],
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
            {mine && e.active ? (
              <a class="sub" href={`/dogam/${e.user_id}`}>
                도감 구경
              </a>
            ) : null}
          </div>
        ))}
      </div>
      {props.entries.length === 0 && <p class="hint center">아직 다른 멤버가 없어요.</p>}
    </Layout>
  );
}

export function CardPage(props: { viewer: Member; owner: Member; target: Member; entry: DogamEntry }) {
  const { entry, owner, target } = props;
  const mine = owner.user_id === props.viewer.user_id;
  const p = progress(entry.xp);
  return (
    <Layout title={target.display_name} viewer={props.viewer}>
      <div class="split">
        <Card
          kind="pair"
          size="large"
          faded={!target.active}
          name={target.display_name}
          theme={entry.theme_id}
          intro={entry.intro}
          xp={entry.xp}
          stats={[
            ['레벨', String(p.level)],
            ['통화', formatHours(entry.voice_seconds)],
            ['내전', `${entry.scrims}회`],
          ]}
        />
        <section class="panel">
          <h2>{mine ? `나와 ${target.display_name}님` : `${owner.display_name}님과 ${target.display_name}님`}</h2>
          <p class="big">{levelName(p.level)}</p>
          <ProgressBar xp={entry.xp} />
          <dl class="facts">
            <dt>처음 만난 날</dt>
            <dd>{entry.first_met ? entry.first_met.slice(0, 10) : '-'}</dd>
            <dt>함께 통화한 시간</dt>
            <dd>{formatHours(entry.voice_seconds)}</dd>
            <dt>함께한 내전</dt>
            <dd>{entry.scrims}회</dd>
          </dl>
          {!target.active && <p class="hint">서버를 떠난 멤버예요. 다시 들어오면 카드가 살아나요.</p>}
          <a class="sub" href={mine ? '/dogam' : `/dogam/${owner.user_id}`}>
            도감으로 돌아가기
          </a>
        </section>
      </div>
    </Layout>
  );
}

export function MessagePage(props: { viewer?: Member | null; title: string; message: string }) {
  return (
    <Layout title={props.title} viewer={props.viewer}>
      <section class="panel wide center">
        <h1>{props.title}</h1>
        <p>{props.message}</p>
        <a class="button" href="/">처음으로</a>
      </section>
    </Layout>
  );
}
