import type { Member } from '../env';
import type { JourneyRecord, JourneyRun } from '../journey-db';
import { DAILY_REWARD_JOURNEYS, DAYS, ELITE_DAY, EVENTS, OFFERS, SKILLS, stat, xpNeed, type JourneyState, type SkillId } from '../journey';
import { FictionNote } from './expedition';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  stale: [{ title: '알림', text: '다른 화면에서 이미 진행했어요. 지금 상태를 보여 드려요.' }],
  bad: [{ title: '알림', text: '지금은 그렇게 할 수 없어요.' }],
  quit: [{ title: '알림', text: '원정을 그만두고 돌아왔어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

// 행동 하나 = 작은 폼 하나. 자바스크립트 없이도 눌러서 진행돼요.
function Act(props: { run: JourneyRun; a: string; n?: number; children: unknown; cls?: string; disabled?: boolean; idle?: boolean }) {
  return (
    <form method="post" action="/api/journey/act" class="jr-form" data-idle={props.idle ? '' : undefined}>
      <input type="hidden" name="run" value={props.run.row.id} />
      <input type="hidden" name="rev" value={String(props.run.row.rev)} />
      <input type="hidden" name="a" value={props.a} />
      {props.n !== undefined && <input type="hidden" name="n" value={String(props.n)} />}
      {!props.idle && (
        <button type="submit" class={props.cls} disabled={props.disabled}>
          {props.children}
        </button>
      )}
    </form>
  );
}

function Bar(props: { now: number; max: number; cls: string; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((props.now / Math.max(1, props.max)) * 100)));
  return (
    <div class={`jr-bar ${props.cls}`} role="meter" aria-valuenow={props.now} aria-valuemin={0} aria-valuemax={props.max} aria-label={props.label}>
      <span style={`width:${pct}%`} />
      <b>
        {props.label} {props.now}/{props.max}
      </b>
    </div>
  );
}

function Road(props: { s: JourneyState }) {
  const { s } = props;
  return (
    <ol class="jr-road" aria-label={`${s.day}/${DAYS}일`}>
      {Array.from({ length: DAYS }, (_, i) => {
        const d = i + 1;
        const mark = d === DAYS ? '🐉' : d === ELITE_DAY ? '🐻' : '';
        const cls = ['jr-step', d <= s.day ? 'past' : '', d === s.day ? 'here' : '', mark ? 'mark' : ''].filter(Boolean).join(' ');
        return (
          <li class={cls} title={`${d}일째`}>
            {mark || (d === s.day ? '' : d % 5 === 0 ? d : '')}
          </li>
        );
      })}
    </ol>
  );
}

function SkillChips(props: { s: JourneyState }) {
  const owned = (Object.entries(props.s.skills) as [SkillId, number][]).filter(([, l]) => l > 0);
  if (!owned.length) return <p class="hint">아직 배운 스킬이 없어요. 레벨이 오르면 골라요.</p>;
  return (
    <ul class="jr-skills">
      {owned.map(([id, l]) => (
        <li title={SKILLS[id].text(l)}>
          <span aria-hidden="true">{SKILLS[id].icon}</span> {SKILLS[id].name} <b>Lv.{l}</b>
        </li>
      ))}
    </ul>
  );
}

function Choice(props: { run: JourneyRun }) {
  const { run } = props;
  const s = run.state;
  const p = s.pending;
  if (!p) return null;
  if (p.kind === 'skill')
    return (
      <div class="jr-choice">
        <h3>⭐ 스킬 하나를 골라요</h3>
        <div class="jr-cards">
          {p.options.map((id, n) => {
            const lv = (s.skills[id] ?? 0) + 1;
            return (
              <Act run={run} a="pick" n={n} cls="jr-card">
                <span class="jr-card-icon" aria-hidden="true">
                  {SKILLS[id].icon}
                </span>
                <b>{SKILLS[id].name}</b>
                <span class="tag">{lv === 1 ? '새 스킬' : `Lv.${lv}`}</span>
                <span class="jr-card-text">{SKILLS[id].text(lv)}</span>
              </Act>
            );
          })}
        </div>
      </div>
    );
  if (p.kind === 'event') {
    const e = EVENTS[p.id];
    return (
      <div class="jr-choice">
        <h3>
          {e.icon} {e.title}
        </h3>
        <p>{e.text}</p>
        <div class="jr-row">
          {e.options.map((text, n) => (
            <Act run={run} a="pick" n={n} cls={`btn ${n === 0 ? 'btn-primary' : ''}`}>
              {text}
            </Act>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div class="jr-choice">
      <h3>🛒 떠돌이 상인</h3>
      <p class="hint">가진 동전 🪙 {s.coins}개. 여러 개 사도 돼요.</p>
      <div class="jr-cards">
        {p.offers.map((o, n) => {
          const info = OFFERS[o.id];
          return (
            <Act run={run} a="buy" n={n} cls="jr-card" disabled={s.coins < o.price}>
              <span class="jr-card-icon" aria-hidden="true">
                {info.icon}
              </span>
              <b>{info.name}</b>
              <span class="tag">🪙 {o.price}</span>
              <span class="jr-card-text">{info.text}</span>
            </Act>
          );
        })}
      </div>
      <Act run={run} a="leave" cls="btn btn-small">
        👋 그만 사고 떠나기
      </Act>
    </div>
  );
}

function Play(props: { run: JourneyRun; art: string; name: string }) {
  const { run } = props;
  const s = run.state;
  const st = stat(s);
  const foe = [...s.today].reverse().find((l) => l.icon !== '📅' && l.icon !== '🤖' && l.icon !== '⭐');
  const lost = s.hp <= 0;
  return (
    <section class="panel jr-play" id="now">
      <div id="journey" data-journey-play>
        <div class="jr-top">
          <b class="jr-day">
            📅 {s.day}일째 <span class="hint">/ {DAYS}일</span>
          </b>
          <span class="jr-coins">🪙 {s.coins}</span>
        </div>
        <Road s={s} />
        <div class="jr-stage">
          <div class={`jr-hero${lost ? ' down' : ''}`}>
            <img src={props.art} alt={props.name} width={96} height={96} />
            <span class="jr-shadow" />
          </div>
          <div class="jr-vs" aria-hidden="true">
            {foe?.icon ?? '🌲'}
          </div>
        </div>
        <Bar now={s.hp} max={st.maxHp} cls="hp" label="❤️ 체력" />
        <Bar now={s.xp} max={xpNeed(s.lv)} cls="xp" label={`⭐ Lv.${s.lv}`} />
        <div class="jr-stats">
          <span title="공격력">⚔️ {st.atk}</span>
          <span title="방어력">🛡️ {st.def}</span>
          <span title="물리친 적">💥 {s.kills}</span>
        </div>
        <ul class="jr-today" role="status">
          {s.today.map((l) => (
            <li class={l.tone ? `tone-${l.tone}` : l.icon === '📅' ? 'day' : ''}>
              <span aria-hidden="true">{l.icon}</span> {l.text}
            </li>
          ))}
        </ul>
        <Choice run={run} />
        {!s.pending && (
          <div class="jr-go">
            <Act run={run} a="next" cls="btn btn-primary jr-next">
              ▶ 다음 날
            </Act>
            <Act run={run} a="auto" cls="btn">
              ⏩ 고를 일이 생길 때까지
            </Act>
          </div>
        )}
        <Act run={run} a="idle" idle>
          {null}
        </Act>
        <label class="jr-auto" hidden data-auto-toggle>
          <input type="checkbox" />
          <span>
            <b>🤖 자동 선택</b> 켜 두면 스킬·갈림길·상점까지 알아서 고르며 끝까지 나아가요. 화면을 켜 두고 구경만 해도 돼요.
          </span>
        </label>
        <h3 class="jr-sub">배운 스킬</h3>
        <SkillChips s={s} />
        {s.journal.length > 0 && (
          <details class="jr-journal">
            <summary>📜 지난 일 보기</summary>
            <ul>
              {s.journal
                .filter((l) => l.icon !== '🤖')
                .map((l) => (
                  <li class={l.tone ? `tone-${l.tone}` : l.icon === '📅' ? 'day' : ''}>
                    <span aria-hidden="true">{l.icon}</span> {l.text}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
      <form method="post" action="/api/journey/quit" class="jr-quit">
        <input type="hidden" name="run" value={run.row.id} />
        <button class="btn btn-small btn-ghost" type="submit">
          원정 그만두기 (보상 없음)
        </button>
      </form>
    </section>
  );
}

function Result(props: { run: JourneyRun; art: string; name: string }) {
  const { run } = props;
  const s = run.state;
  return (
    <section class="panel jr-result" id="now">
      <span class="eyebrow">{s.cleared ? '원정 성공' : '원정 끝'}</span>
      <div class="jr-result-head">
        <div class={`jr-hero${s.cleared ? ' win' : ' down'}`}>
          <img src={props.art} alt={props.name} width={96} height={96} />
        </div>
        <div>
          <h2>{s.cleared ? '🏆 드래곤을 물리쳤어요!' : `🏳️ ${s.day}일째에서 멈췄어요`}</h2>
          <p class="hint">
            Lv.{s.lv} · 물리친 적 {s.kills} · 스킬 {Object.keys(s.skills).length}개
          </p>
        </div>
      </div>
      <ul class="jr-today">
        {s.today.map((l) => (
          <li class={l.tone ? `tone-${l.tone}` : l.icon === '📅' ? 'day' : ''}>
            <span aria-hidden="true">{l.icon}</span> {l.text}
          </li>
        ))}
      </ul>
      <p>
        {run.row.xp > 0
          ? `보상: 내 카드 경험치 +${run.row.xp}${run.row.jelly ? `, 도감 젤리 +${run.row.jelly}` : ''}`
          : `오늘 보상은 이미 ${DAILY_REWARD_JOURNEYS}번 받았어요. 내일 다시 받을 수 있어요.`}
      </p>
      <form method="post" action="/api/journey/start">
        <button class="btn btn-primary" type="submit">
          🎒 다시 떠나기
        </button>
      </form>
    </section>
  );
}

export function JourneyPage(props: { viewer: Member; art: string; run: JourneyRun | null; result: JourneyRun | null; record: JourneyRecord; notice?: string }) {
  const { run, result, record } = props;
  const name = props.viewer.display_name;
  return (
    <Layout title="하리보 원정대" viewer={props.viewer} active="expedition">
      <Popup lines={NOTICES[props.notice ?? ''] ?? []} />
      <div class="stack jr" data-fresh>
        <section class="panel">
          <span class="eyebrow">🧭 하루하루 모험</span>
          <h1>하리보 원정대</h1>
          <p class="muted">
            내 캐릭터가 말랑 숲을 하루씩 걸어가요. 싸움은 알아서 하고, 레벨이 오르면 스킬 3개 중 하나를 골라요. {ELITE_DAY}일째 숲지기 곰, {DAYS}일째 젤리 도둑 드래곤을 이기면 성공!
          </p>
          <p class="hint">
            하루 첫 {DAILY_REWARD_JOURNEYS}판은 끝날 때 내 카드 경험치(멀리 갈수록 많이)를 받고, 드래곤을 이기면 도감 젤리 1개도 받아요. 오늘 받은 보상 {Math.min(record.rewardedToday, DAILY_REWARD_JOURNEYS)}/{DAILY_REWARD_JOURNEYS}
          </p>
          <FictionNote />
        </section>
        {run ? <Play run={run} art={props.art} name={name} /> : result ? <Result run={result} art={props.art} name={name} /> : null}
        {!run && !result && (
          <section class="panel jr-start">
            <div class="jr-hero">
              <img src={props.art} alt={name} width={96} height={96} />
              <span class="jr-shadow" />
            </div>
            <div>
              <h2>떠날 준비 됐나요?</h2>
              <p class="hint">
                가장 멀리 간 날 {record.best}일 · 드래곤 물리친 횟수 {record.clears}번
              </p>
              <form method="post" action="/api/journey/start">
                <button class="btn btn-primary" type="submit">
                  🎒 원정 떠나기
                </button>
              </form>
            </div>
          </section>
        )}
        <p class="hint">
          예전 방식도 할 수 있어요: <a href="/expedition">대원 원정</a> · <a href="/expedition/story">지도 탐사</a>
        </p>
      </div>
    </Layout>
  );
}
