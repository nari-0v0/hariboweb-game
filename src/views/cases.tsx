import type { Member } from '../env';
import type { CaseRecord, CaseRun } from '../cases-db';
import { CASES, DAILY_REWARD_CASES, GOOD_LOOKS, GRADE_INFO, type Grade } from '../cases';
import { FictionNote } from './expedition';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  bad_case: [{ title: '알림', text: '없는 사건이에요. 목록에서 다시 골라 주세요.' }],
  need_look: [{ title: '알림', text: '먼저 한 곳 이상 조사해 주세요.' }],
  need_answer: [{ title: '알림', text: '범인·방법·동기를 모두 골라 주세요.' }],
  quit: [{ title: '알림', text: '사건을 덮고 돌아왔어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

function SuspectCard(props: { run: CaseRun; i: number; mark?: 'culprit' | 'wrong' }) {
  const { run, i } = props;
  const s = run.suspects[i]!;
  const [a, b] = run.puzzle.traits[i]!;
  const [t1, t2] = run.def.traits;
  return (
    <div class={`crew suspect${s.id ? '' : ' apprentice'}${props.mark ? ` ${props.mark}` : ''}`}>
      <img src={s.art} alt="" loading="lazy" />
      <b class="crew-name">{s.name}</b>
      <span class="hint">
        {t1.label}: <b>{t1.values[a]!.name}</b>
      </span>
      <span class="hint">
        {t2.label}: <b>{t2.values[b]!.name}</b>
      </span>
    </div>
  );
}

function RunView(props: { run: CaseRun }) {
  const { run } = props;
  const at = run.looked.length;
  return (
    <section class="panel case-run" id="now">
      <span class="eyebrow">
        {run.def.icon} {run.def.name}
      </span>
      <p>{run.def.intro}</p>

      <h3>용의자</h3>
      <div class="suspect-row">
        {run.suspects.map((_, i) => (
          <SuspectCard run={run} i={i} />
        ))}
      </div>

      <h3>
        조사할 곳 <span class="hint">조사 {at}번 · {GOOD_LOOKS}번 안에 다 맞히면 S</span>
      </h3>
      <div class="case-places">
        {run.def.places.map((place, i) => {
          const k = run.looked.indexOf(i);
          return k >= 0 ? (
            <div class={`case-clue${k === at - 1 ? ' fresh' : ''}`}>
              <b>📌 {place}</b>
              <p>{run.puzzle.clues[i]!.text}</p>
            </div>
          ) : (
            <form method="post" action="/api/cases/look">
              <input type="hidden" name="run" value={run.row.id} />
              <input type="hidden" name="at" value={String(at)} />
              <input type="hidden" name="spot" value={String(i)} />
              <button class="btn case-look" type="submit">
                🔍 {place}
              </button>
            </form>
          );
        })}
      </div>

      <h3>범인 지목</h3>
      <form method="post" action="/api/cases/accuse" class="case-accuse">
        <input type="hidden" name="run" value={run.row.id} />
        <input type="hidden" name="at" value={String(at)} />
        <fieldset>
          <legend>누가?</legend>
          {run.suspects.map((s, i) => (
            <label class="case-opt">
              <input type="radio" name="culprit" value={String(i)} required /> {s.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>어떻게?</legend>
          {run.def.methods.map((m, i) => (
            <label class="case-opt">
              <input type="radio" name="method" value={String(i)} required /> {m.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>왜?</legend>
          {run.def.motives.map((m, i) => (
            <label class="case-opt">
              <input type="radio" name="motive" value={String(i)} required /> {m.name}
            </label>
          ))}
        </fieldset>
        <button class="btn btn-primary" type="submit" disabled={at === 0}>
          🔎 이 사람이 범인이에요!
        </button>
        {at === 0 && <p class="hint">한 곳 이상 조사하면 지목할 수 있어요.</p>}
      </form>

      <form method="post" action="/api/cases/quit" class="exp-quit">
        <input type="hidden" name="run" value={run.row.id} />
        <button class="btn btn-small" type="submit">
          사건 덮기 (보상 없음)
        </button>
      </form>
    </section>
  );
}

function ResultView(props: { run: CaseRun }) {
  const { run } = props;
  const g = (run.row.grade ?? 'F') as Grade;
  const a = run.answer;
  const p = run.puzzle;
  const right = (ok: boolean) => (ok ? '⭕' : '❌');
  return (
    <section class={`panel case-result g-${g}`} id="now">
      <span class="eyebrow">
        {run.def.icon} {run.def.name} · 결과
      </span>
      <div class="case-grade">
        <span class="grade-badge">{g}</span>
        <div>
          <b class="exp-verdict">{GRADE_INFO[g].name}</b>
          <span class="hint">{GRADE_INFO[g].text}</span>
        </div>
      </div>
      <div class="suspect-row">
        {run.suspects.map((_, i) => (
          <SuspectCard run={run} i={i} mark={i === p.culprit ? 'culprit' : a && i === a.culprit ? 'wrong' : undefined} />
        ))}
      </div>
      <ul class="case-truth">
        <li>
          {right(a?.culprit === p.culprit)} 범인: <b>{run.suspects[p.culprit]!.name}</b>
          {a && a.culprit !== p.culprit && <span class="hint"> (내 답: {run.suspects[a.culprit]?.name})</span>}
        </li>
        <li>
          {right(a?.method === p.method)} 방법: <b>{run.def.methods[p.method]!.name}</b>
          {a && a.method !== p.method && <span class="hint"> (내 답: {run.def.methods[a.method]?.name})</span>}
        </li>
        <li>
          {right(a?.motive === p.motive)} 동기: <b>{run.def.motives[p.motive]!.name}</b>
          {a && a.motive !== p.motive && <span class="hint"> (내 답: {run.def.motives[a.motive]?.name})</span>}
        </li>
      </ul>
      <p class="exp-reward">
        {run.row.xp || run.row.jelly
          ? `보상: 내 카드 경험치 +${run.row.xp}${run.row.jelly ? `, 도감 젤리 +${run.row.jelly}` : ''}`
          : `오늘 보상(하루 ${DAILY_REWARD_CASES}건)은 다 받았어요. 사건은 계속 풀 수 있어요.`}
      </p>
      <details>
        <summary>모든 단서 보기 (조사 {run.looked.length}번)</summary>
        <ul class="exp-journal">
          {run.def.places.map((place, i) => (
            <li>
              {run.looked.includes(i) ? '📌' : '·'} {place}: {p.clues[i]!.text}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function HowTo(props: { open: boolean }) {
  return (
    <details class="panel exp-howto" open={props.open}>
      <summary>
        <h2>❔ 하는 법</h2> <span class="hint">눌러서 펼치기·접기</span>
      </summary>
      <ol>
        <li>
          <b>사건 고르기</b>: 아래 사건 중 하나를 골라요. 용의자는 내 도감 카드 멤버 중에서 무작위로 4명이 나오고, 범인과 단서는 매번 바뀌어요.
        </li>
        <li>
          <b>조사하기</b>: 장소를 눌러 단서를 하나씩 모아요. 용의자 카드의 특징(옷, 신발 같은 것)과 단서를 맞춰 보며 범인을 좁혀요. 특징 단서 두 개를 겹치거나, 알리바이로 한 명을 빼면 범인이 보여요.
        </li>
        <li>
          <b>방법·동기</b>: 어떤 장소에는 어떻게 했는지, 왜 했는지 알려 주는 단서가 있어요. 헛단서도 섞여 있어요.
        </li>
        <li>
          <b>지목하기</b>: 범인·방법·동기를 골라 지목해요. {GOOD_LOOKS}번 안에 조사하고 다 맞히면 S(명탐정)예요.
        </li>
        <li>
          <b>보상</b>: 하루 첫 {DAILY_REWARD_CASES}건은 내 카드 경험치를 받고, S나 A면 도감 젤리 1개도 받아요.
        </li>
      </ol>
    </details>
  );
}

function CaseList(props: { record: CaseRecord }) {
  return (
    <section class="panel">
      <h2>사건 목록</h2>
      <div class="case-list">
        {CASES.map((c) => {
          const best = props.record.best.get(c.id);
          return (
            <div class="case-card">
              <span class="case-icon" aria-hidden="true">
                {c.icon}
              </span>
              <div class="case-body">
                <b>{c.name}</b>
                <span class="hint">{c.blurb}</span>
                <span class="hint">최고 등급: {best ? `${best} (${GRADE_INFO[best].name})` : '아직 없음'}</span>
              </div>
              <form method="post" action="/api/cases/start">
                <input type="hidden" name="case" value={c.id} />
                <button class="btn btn-small btn-buy" type="submit">
                  조사 시작
                </button>
              </form>
            </div>
          );
        })}
      </div>
      <p class="hint">
        푼 사건 {props.record.solved}건 · 오늘 보상 {Math.min(props.record.today, DAILY_REWARD_CASES)}/{DAILY_REWARD_CASES}건
      </p>
    </section>
  );
}

export function CasesPage(props: { viewer: Member; run: CaseRun | null; result: CaseRun | null; record: CaseRecord; notice?: string }) {
  return (
    <Layout title="하리보 사건파일" viewer={props.viewer} active="cases">
      <Popup lines={NOTICES[props.notice ?? ''] ?? []} />
      <div class="stack exp" data-fresh>
        <section class="panel">
          <span class="eyebrow">추리 게임</span>
          <div class="panel-head">
            <h1>하리보 사건파일</h1>
          </div>
          <p class="muted">장소를 조사해서 단서를 모으고, 범인·방법·동기를 맞혀요. 틀려도 잃는 건 없어요.</p>
          <FictionNote big={!props.run} />
        </section>
        {props.run ? (
          <RunView run={props.run} />
        ) : (
          <>
            {props.result && <ResultView run={props.result} />}
            <HowTo open={props.record.played === 0 && !props.result} />
            <CaseList record={props.record} />
          </>
        )}
      </div>
    </Layout>
  );
}
