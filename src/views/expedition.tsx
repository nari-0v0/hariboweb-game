import type { Member } from '../env';
import type { Candidate, ExpRecord, Run } from '../expedition-db';
import { CREW_SIZE } from '../expedition-db';
import {
  DAILY_REWARD_RUNS,
  ENDINGS,
  FINDS,
  PATH_INFO,
  ROLES,
  STEPS,
  conditionOf,
  eventById,
  findOf,
  roleOf,
  visibleOptions,
  type Crew,
  type Ending,
  type RoleId,
  type RunState,
} from '../expedition';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  too_many: [{ title: '알림', text: `대원은 ${CREW_SIZE}명까지 고를 수 있어요.` }],
  bad_pick: [{ title: '알림', text: '데려갈 수 없는 멤버가 있어요. 다시 골라 주세요.' }],
  role: [{ title: '변경 완료', text: '원정대 역할을 바꿨어요. 다른 멤버가 내 카드를 데려갈 때도 이 역할로 나와요.' }],
  quit: [{ title: '알림', text: '원정을 그만두고 돌아왔어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

// 꼭 보여 줘야 하는 가상 안내 문구
export function FictionNote(props: { big?: boolean }) {
  return (
    <p class={`fiction${props.big ? ' big' : ''}`}>
      이 이야기는 가상의 세계예요. 등장인물은 멤버의 이름만 빌린 가상 인물이고, 실제 멤버와는 관계없어요.
    </p>
  );
}

function RoleTag(props: { role: RoleId }) {
  const r = roleOf(props.role);
  return (
    <span class={`role-tag r-${r.id}`}>
      {r.icon} {r.name}
    </span>
  );
}

function CrewCard(props: { c: Crew }) {
  const { c } = props;
  const cond = conditionOf(c.cond);
  return (
    <div class={`crew${c.id ? '' : ' apprentice'}`}>
      <img src={c.art} alt="" loading="lazy" />
      <b class="crew-name">{c.name}</b>
      <RoleTag role={c.role} />
      <span class="hint">
        {cond.name}
        {cond.text && ` (${cond.text})`}
        {c.bonus > 0 && ` · 카드 +${c.bonus}`}
      </span>
    </div>
  );
}

function Track(props: { step: number }) {
  return (
    <ol class="exp-track" aria-label={`${STEPS}칸 중 ${props.step}칸`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <li class={i + 1 < props.step ? 'done' : i + 1 === props.step ? 'now' : undefined}>{i + 1 === STEPS ? '🦌' : i + 1}</li>
      ))}
    </ol>
  );
}

function ActButton(props: { run: string; at: number; c: number; disabled?: boolean; children?: unknown }) {
  return (
    <form method="post" action="/api/expedition/act">
      <input type="hidden" name="run" value={props.run} />
      <input type="hidden" name="at" value={String(props.at)} />
      <input type="hidden" name="c" value={String(props.c)} />
      <button class="btn exp-choice" type="submit" disabled={props.disabled}>
        {props.children}
      </button>
    </form>
  );
}

// 변화량 칩: ❤️ -2 처럼 크게
function DeltaChips(props: { s: RunState }) {
  const l = props.s.last;
  if (!l) return null;
  const chips: [string, number][] = [
    ['❤️', l.delta.hp],
    ['🍖', l.delta.food],
    ['✨', l.delta.mana],
  ];
  const shown = chips.filter(([, n]) => n !== 0);
  if (!shown.length && !l.finds.length) return null;
  return (
    <div class="exp-delta">
      {shown.map(([icon, n]) => (
        <span class={n > 0 ? 'up' : 'down'}>
          {icon} {n > 0 ? `+${n}` : n}
        </span>
      ))}
      {l.finds.map((f) => (
        <span class="up">
          {findOf(f)!.icon} {findOf(f)!.name}
        </span>
      ))}
    </div>
  );
}

// 바로 앞 선택의 결과: 주사위, 성공·실패, 이야기, 변화량을 크게 보여 줘요
function Outcome(props: { s: RunState }) {
  const { s } = props;
  const l = s.last;
  if (!l || l.kind !== 'event') return null;
  const roll = l.roll;
  const mood = roll ? (roll.ok ? 'win' : 'lose') : 'plain';
  return (
    <div class={`exp-outcome ${mood}`} role="status">
      {roll ? (
        <div class="exp-dice">
          <span class="die" aria-label={`주사위 ${roll.die}`}>
            {roll.die}
          </span>
          <div>
            <b class="exp-verdict">{roll.ok ? '성공!' : '실패…'}</b>
            <span class="hint">
              {roll.who} 판정 {roll.total}
              {roll.total !== roll.die && ` (주사위 ${roll.die} + 보너스 ${roll.total - roll.die})`} / 필요 {roll.need}
            </span>
          </div>
        </div>
      ) : (
        <b class="exp-verdict">결과</b>
      )}
      {s.log.map((line) => (
        <p class={line.good ? 'good' : line.bad ? 'bad' : undefined}>{line.text}</p>
      ))}
      <DeltaChips s={s} />
    </div>
  );
}

function RunView(props: { run: Run }) {
  const { state: s, crew, choices } = props.run;
  const at = choices.length;
  const ev = s.event ? eventById(s.event) : null;
  const healer = crew.some((c) => c.role === 'healer');
  return (
    <section class="panel exp-run" id="now">
      <div class="exp-top">
        <Track step={s.step} />
        <div class="exp-res">
          <span title="체력">❤️ {s.hp}</span>
          <span title="식량">🍖 {s.food}</span>
          <span title="마력">✨ {s.mana}</span>
          {healer && <span title="치유 남은 횟수">🌿 {s.heals}</span>}
          {s.mood !== 0 && <span title="분위기(다음 판정에 더해져요)">{s.mood > 0 ? `😊 +${s.mood}` : `😣 ${s.mood}`}</span>}
          {s.finds.length > 0 && <span title="주운 물건">🎒 {s.finds.length}</span>}
        </div>
      </div>
      <Outcome s={s} />
      {s.last?.kind !== 'event' && s.log.length > 0 && (
        <div class="exp-log" role="status">
          {s.log.map((l) => (
            <p class={l.good ? 'good' : l.bad ? 'bad' : undefined}>{l.text}</p>
          ))}
          <DeltaChips s={s} />
        </div>
      )}
      {s.phase === 'path' && (
        <div class="exp-event">
          <h2>{s.step === 0 ? '어느 길로 들어갈까요?' : '다음 길을 골라요'}</h2>
          <p class="hint">한 칸 갈 때마다 식량 1개를 써요. 식량이 없으면 체력이 2 줄어요.</p>
          <div class="exp-choices">
            {s.paths.map((k, i) => (
              <ActButton run={props.run.row.id} at={at} c={i}>
                <span class="exp-icon">{PATH_INFO[k].icon}</span> {PATH_INFO[k].name}
              </ActButton>
            ))}
          </div>
        </div>
      )}
      {s.phase === 'event' && ev && (
        <div class="exp-event">
          <h2>{ev.name}</h2>
          <p>{s.intro}</p>
          <div class="exp-choices">
            {visibleOptions(ev, crew, s).map(({ opt, index, ok, why }) => (
              <ActButton run={props.run.row.id} at={at} c={index} disabled={!ok}>
                <span class="exp-opt">
                  {opt.label}
                  <span class="exp-meta">
                    {opt.role && <RoleTag role={opt.role} />}
                    {opt.check !== undefined && <span class="tag">🎲 {opt.check} 이상</span>}
                    {opt.cost?.food && <span class="tag">🍖 {opt.cost.food}</span>}
                    {opt.cost?.mana && <span class="tag">✨ {opt.cost.mana}</span>}
                    {opt.heal && <span class="tag">🌿 -1</span>}
                    {!ok && <span class="tag reward">{why}</span>}
                  </span>
                </span>
              </ActButton>
            ))}
          </div>
        </div>
      )}
      <h3>대원</h3>
      <div class="crew-row">
        {crew.map((c) => (
          <CrewCard c={c} />
        ))}
      </div>
      <form method="post" action="/api/expedition/quit" class="exp-quit">
        <input type="hidden" name="run" value={props.run.row.id} />
        <button class="btn btn-small" type="submit">
          원정 그만두기 (보상과 주운 물건은 사라져요)
        </button>
      </form>
    </section>
  );
}

function ResultView(props: { run: Run }) {
  const { row, state: s, crew } = props.run;
  const ending = (row.ending ?? s.ending) as Ending | null;
  if (!ending) return null;
  const e = ENDINGS[ending];
  return (
    <section class={`panel exp-result end-${ending}`} id="now">
      <span class="eyebrow">원정 결과</span>
      <h2>{e.name}</h2>
      <p>{e.text}</p>
      {s.last?.kind === 'event' ? (
        <Outcome s={s} />
      ) : (
        s.log.length > 0 && (
          <div class="exp-log">
            {s.log.map((l) => (
              <p class={l.good ? 'good' : l.bad ? 'bad' : undefined}>{l.text}</p>
            ))}
            <DeltaChips s={s} />
          </div>
        )
      )}
      <div class="crew-row">
        {crew.map((c) => (
          <CrewCard c={c} />
        ))}
      </div>
      <p>
        {s.finds.length ? `가져온 물건: ${s.finds.map((f) => `${findOf(f)!.icon} ${findOf(f)!.name}`).join(', ')}` : '가져온 물건은 없어요.'}
      </p>
      <p class="exp-reward">
        {row.xp || row.jelly
          ? `보상: 내 카드 경험치 +${row.xp}${row.jelly ? `, 도감 젤리 +${row.jelly}` : ''}`
          : `오늘 보상(하루 ${DAILY_REWARD_RUNS}판)은 다 받았어요. 발견품은 계속 모을 수 있어요.`}
      </p>
      <details>
        <summary>원정 일지 보기</summary>
        <ul class="exp-journal">
          {s.journal.map((j) => (
            <li>{j}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// 처음 하는 사람을 위한 하는 법(기록이 없으면 펼쳐 둬요)
function HowTo(props: { open: boolean }) {
  return (
    <details class="panel exp-howto" open={props.open}>
      <summary>
        <h2>❔ 하는 법</h2> <span class="hint">눌러서 펼치기·접기</span>
      </summary>
      <ol>
        <li>
          <b>대원 고르기</b>: 아래에서 데려갈 멤버를 {CREW_SIZE}명까지 체크하고 <b>원정 시작</b>을 눌러요. 도감에 모은 카드만 데려갈 수 있고, 모자라면 견습 대원이 채워요.
        </li>
        <li>
          <b>길 고르기</b>: 숲은 {STEPS}칸이에요. 칸마다 ⚔️ 위험한 길, 💎 반짝이는 길, ❓ 안개 길, ⛺ 쉼터 중 하나를 골라요. 한 칸 갈 때마다 식량 1개를 써요.
        </li>
        <li>
          <b>사건 풀기</b>: 길마다 사건이 나와요. 선택지를 하나 고르면 결과가 나와요. 🔍🛡️✨ 같은 역할 표시가 붙은 선택지는 그 역할 대원이 있어야 고를 수 있어서, 역할을 섞어 데려가면 좋아요.
        </li>
        <li>
          <b>체력·식량·마력</b>: 위쪽 숫자예요. 체력이 0이 되면 마을로 돌아와요(실패해도 카드와 젤리는 잃지 않아요).
        </li>
        <li>
          <b>결말</b>: 마지막 칸에서 숲의 주인을 만나요. 결말은 💎 보물 발견, 🏠 무사 귀환, 🌙 숨은 결말 세 가지예요.
        </li>
        <li>
          <b>보상</b>: 하루 첫 {DAILY_REWARD_RUNS}판은 끝까지 가면 내 카드 경험치를 받고, 보물·숨은 결말이면 도감 젤리 1개도 받아요. 주운 물건은 원정 기록에 모여요.
        </li>
      </ol>
    </details>
  );
}

function StartForm(props: { candidates: Candidate[] }) {
  const others = props.candidates.filter((c) => !c.me).length;
  return (
    <section class="panel">
      <h2>원정대 꾸리기</h2>
      <p class="hint">
        최대 {CREW_SIZE}명을 골라요. 모자라면 견습 대원이 채워요. 역할이 겹치지 않게 섞으면 고를 수 있는 길이 늘어나요.
        {others === 0 && ' 아직 도감 카드가 없어서 나와 견습 대원으로 떠나요.'}
      </p>
      <form method="post" action="/api/expedition/start">
        <div class="pick-grid">
          {props.candidates.map((c) => (
            <label class="pick">
              <input type="checkbox" name="m" value={c.id} checked={c.me} />
              <img src={c.art} alt="" loading="lazy" />
              <b>{c.me ? `${c.name} (나)` : c.name}</b>
              <RoleTag role={c.role} />
            </label>
          ))}
        </div>
        <button class="btn btn-primary" type="submit">
          원정 시작 ▶
        </button>
      </form>
    </section>
  );
}

function RolePicker(props: { role: RoleId; chosen: boolean }) {
  return (
    <section class="panel">
      <h2>내 역할</h2>
      <p class="hint">{props.chosen ? '다른 멤버가 내 카드를 데려갈 때도 이 역할로 나와요.' : '아직 고르지 않아서 자동으로 정해져 있어요. 원하는 역할로 바꿀 수 있어요.'}</p>
      <form method="post" action="/api/expedition/role" class="role-grid">
        {ROLES.map((r) => (
          <button class={`btn btn-small role-btn${r.id === props.role ? ' on' : ''}`} type="submit" name="role" value={r.id} aria-pressed={r.id === props.role ? 'true' : 'false'}>
            <b>
              {r.icon} {r.name}
            </b>
            <span>{r.good}</span>
          </button>
        ))}
      </form>
    </section>
  );
}

function RecordView(props: { record: ExpRecord }) {
  const { record } = props;
  return (
    <section class="panel">
      <h2>원정 기록</h2>
      <p class="hint">
        끝낸 원정 {record.runs}번 · 오늘 보상 {Math.min(record.today, DAILY_REWARD_RUNS)}/{DAILY_REWARD_RUNS}판 (하루 첫 {DAILY_REWARD_RUNS}판에 내 카드 경험치, 보물을 찾으면 젤리도 1개)
      </p>
      <h3>본 결말</h3>
      <div class="end-row">
        {(Object.keys(ENDINGS) as Ending[]).map((k) => (
          <span class={`tag${record.endings.has(k) ? ' on' : ' reward'}`}>{record.endings.has(k) ? ENDINGS[k].name : '???'}</span>
        ))}
      </div>
      <h3>
        발견품 {FINDS.filter((f) => record.finds.has(f.id)).length}/{FINDS.length}
      </h3>
      <div class="find-grid">
        {FINDS.map((f) => {
          const n = record.finds.get(f.id);
          return (
            <div class={`find rare-${f.rare}${n ? '' : ' unknown'}`}>
              <span class="find-icon">{n ? f.icon : '?'}</span>
              <span class="find-name">{n ? f.name : '???'}</span>
              {n && <span class="hint">×{n}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ExpeditionPage(props: {
  viewer: Member;
  run: Run | null;
  result: Run | null;
  record: ExpRecord;
  candidates: Candidate[];
  role: { role: RoleId; chosen: boolean };
  notice?: string;
}) {
  return (
    <Layout title="하리보 원정대" viewer={props.viewer} active="expedition">
      <Popup lines={NOTICES[props.notice ?? ''] ?? []} />
      <div class="stack exp" data-fresh>
        <section class="panel">
          <span class="eyebrow">제1구역 · 안개숲</span>
          <div class="panel-head">
            <h1>하리보 원정대</h1>
          </div>
          <p><a class="btn btn-primary" href="/expedition/story">새 원정 · 3개 지역과 18개 사건 ▶</a></p>
          <p class="muted">대원 3명과 7칸짜리 안개숲을 지나요. 고르는 길과 대가에 따라 결말이 달라져요. 실패해도 카드와 젤리는 그대로예요.</p>
          <FictionNote big={!props.run} />
        </section>
        {props.run ? (
          <RunView run={props.run} />
        ) : (
          <>
            {props.result && <ResultView run={props.result} />}
            <HowTo open={props.record.runs === 0 && !props.result} />
            <StartForm candidates={props.candidates} />
            <RolePicker {...props.role} />
            <RecordView record={props.record} />
          </>
        )}
      </div>
    </Layout>
  );
}
