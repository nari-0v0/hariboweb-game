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

function RunView(props: { run: Run }) {
  const { state: s, crew, choices } = props.run;
  const at = choices.length;
  const ev = s.event ? eventById(s.event) : null;
  const healer = crew.some((c) => c.role === 'healer');
  return (
    <section class="panel exp-run">
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
      <div class="crew-row">
        {crew.map((c) => (
          <CrewCard c={c} />
        ))}
      </div>
      {s.log.length > 0 && (
        <div class="exp-log" role="status">
          {s.log.map((l) => (
            <p class={l.good ? 'good' : l.bad ? 'bad' : undefined}>{l.text}</p>
          ))}
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
    <section class={`panel exp-result end-${ending}`}>
      <span class="eyebrow">원정 결과</span>
      <h2>{e.name}</h2>
      <p>{e.text}</p>
      {s.log.length > 0 && (
        <div class="exp-log">
          {s.log.map((l) => (
            <p class={l.good ? 'good' : l.bad ? 'bad' : undefined}>{l.text}</p>
          ))}
        </div>
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
          <p class="muted">대원 3명과 7칸짜리 안개숲을 지나요. 고르는 길과 대가에 따라 결말이 달라져요. 실패해도 카드와 젤리는 그대로예요.</p>
          <FictionNote big={!props.run} />
        </section>
        {props.run ? (
          <RunView run={props.run} />
        ) : (
          <>
            {props.result && <ResultView run={props.result} />}
            <StartForm candidates={props.candidates} />
            <RolePicker {...props.role} />
            <RecordView record={props.record} />
          </>
        )}
      </div>
    </Layout>
  );
}
