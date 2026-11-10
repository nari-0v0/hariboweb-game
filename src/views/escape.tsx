import type { Member } from '../env';
import type { EscRun } from '../escape-db';
import { ESCAPE_CASES, ESC_XP, canAnswer, escGrade, isLocked, visible, type EscGrade, type EscObject } from '../escape';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  stale: [{ title: '알림', text: '다른 화면에서 이미 진행했어요. 지금 상태를 보여 드려요.' }],
  bad: [{ title: '알림', text: '그렇게는 할 수 없어요.' }],
  quit: [{ title: '알림', text: '사건을 덮고 돌아왔어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

const GRADE_TEXT: Record<EscGrade, string> = { S: '명탐정!', A: '훌륭해요', B: '해결!', C: '겨우 해결' };

// 행동 하나 = 작은 폼 하나. 자바스크립트 없이도 눌러서 진행돼요.
function Act(props: { run: EscRun; a: string; o?: string; i?: string; n?: number; children: unknown; cls?: string; label?: string }) {
  return (
    <form method="post" action="/api/escape/act" class="esc-form">
      <input type="hidden" name="run" value={props.run.row.id} />
      <input type="hidden" name="rev" value={String(props.run.row.rev)} />
      <input type="hidden" name="a" value={props.a} />
      {props.o && <input type="hidden" name="o" value={props.o} />}
      {props.i && <input type="hidden" name="i" value={props.i} />}
      {props.n !== undefined && <input type="hidden" name="n" value={String(props.n)} />}
      <button type="submit" class={props.cls} aria-label={props.label}>
        {props.children}
      </button>
    </form>
  );
}

function Thing(props: { run: EscRun; o: EscObject }) {
  const { run, o } = props;
  const s = run.state;
  const locked = isLocked(s, o);
  const cls = ['esc-thing', o.big ? 'big' : '', o.y < 30 ? 'on-wall' : '', s.focus === o.id ? 'focus' : '', s.seen.includes(o.id) && !locked ? 'seen' : ''].filter(Boolean).join(' ');
  return (
    <div class="esc-spot" style={`--x:${o.x};--y:${o.y}`}>
      <Act run={run} a="tap" o={o.id} cls={cls} label={o.name}>
        <span class="esc-emoji" aria-hidden="true">
          {o.emoji}
        </span>
        {locked && <span class="esc-lock" aria-hidden="true">🔒</span>}
        <span class="esc-name">{o.name}</span>
      </Act>
    </div>
  );
}

function Focus(props: { run: EscRun }) {
  const { run } = props;
  const s = run.state;
  const o = s.focus ? run.def.objects.find((x) => x.id === s.focus) : null;
  const locked = o && isLocked(s, o);
  return (
    <div class={`esc-bubble tone-${s.tone}`} role="status">
      {o && (
        <b class="esc-bubble-name">
          {o.emoji} {o.name}
        </b>
      )}
      <p>{s.msg}</p>
      {locked && o.lock!.kind === 'code' && (
        <form method="post" action="/api/escape/act" class="esc-code">
          <input type="hidden" name="run" value={run.row.id} />
          <input type="hidden" name="rev" value={String(run.row.rev)} />
          <input type="hidden" name="a" value="code" />
          <input type="hidden" name="o" value={o.id} />
          <input name="v" inputmode="numeric" pattern="[0-9]*" maxlength={8} autocomplete="off" placeholder={o.lock!.ask} aria-label={`${o.name} 비밀번호`} required />
          <button class="btn btn-primary" type="submit">
            🔓 열어 보기
          </button>
        </form>
      )}
      {locked && o.lock!.kind === 'item' && (
        <div class="esc-use">
          {s.inv.length ? (
            <>
              <span class="hint">가방에서 쓸 물건을 골라요</span>
              {s.inv.map((i) => (
                <Act run={run} a="use" o={o.id} i={i} cls="btn btn-small">
                  {run.def.items[i]?.emoji} {run.def.items[i]?.name} 쓰기
                </Act>
              ))}
            </>
          ) : (
            <span class="hint">가방이 비어 있어요. 다른 곳을 먼저 살펴보세요.</span>
          )}
        </div>
      )}
    </div>
  );
}

function Play(props: { run: EscRun }) {
  const { run } = props;
  const { def, state: s } = run;
  const scene = def.scenes.find((x) => x.id === s.scene)!;
  const things = def.objects.filter((o) => visible(def, s, o));
  const allClues = Object.keys(def.clues);
  const need = def.question.needs.filter((n) => s.clues.includes(n)).length;
  return (
    <>
      <section class="panel esc-play" id="now">
        <div class="esc-top">
          <span class="esc-place">📍 {def.place} · {scene.name}</span>
          <span class="esc-stats">
            <span title="실수">❌ {s.mistakes}</span>
            <span title="힌트">💡 {s.hints}</span>
          </span>
        </div>
        <div class="esc-frame">
          <div class="esc-room" style={`--wall:${scene.wall};--floor:${scene.floor}`}>
            <div class="esc-wall" />
            <div class="esc-floor" />
            {things.map((o) => (
              <Thing run={run} o={o} />
            ))}
          </div>
        </div>
        <Focus run={run} />
        <div class="esc-bag">
          <b>🎒 가방</b>
          {s.inv.length ? (
            s.inv.map((i) => (
              <span class="esc-item">
                <span aria-hidden="true">{def.items[i]?.emoji}</span> {def.items[i]?.name}
              </span>
            ))
          ) : (
            <span class="hint">아직 비었어요</span>
          )}
        </div>
        <div class="esc-tools">
          <Act run={run} a="hint" cls="btn btn-small">
            💡 힌트 보기
          </Act>
          <form method="post" action="/api/escape/quit">
            <input type="hidden" name="run" value={run.row.id} />
            <button class="btn btn-small btn-ghost" type="submit">
              사건 덮기
            </button>
          </form>
        </div>
        <p class="hint">물건을 눌러 살펴보세요. 잠긴 곳은 찾은 물건이나 비밀번호로 열어요. 실수와 힌트가 적을수록 등급이 높아요.</p>
      </section>

      <section class="panel esc-notes">
        <h2>
          📒 수첩 <span class="tag">{s.clues.length}/{allClues.length}</span>
        </h2>
        {s.clues.length ? (
          <ul class="esc-clues">
            {s.clues.map((k) => (
              <li>{def.clues[k]}</li>
            ))}
          </ul>
        ) : (
          <p class="hint">찾은 단서가 여기 적혀요.</p>
        )}
      </section>

      <section class="panel esc-answer">
        <h2>🕵️ {def.question.text}</h2>
        {canAnswer(def, s) ? (
          <div class="esc-options">
            {def.question.options.map((text, n) => (
              <Act run={run} a="answer" n={n} cls="btn esc-option">
                {text}
              </Act>
            ))}
          </div>
        ) : (
          <p class="hint">
            핵심 단서를 더 모아야 답할 수 있어요. ({need}/{def.question.needs.length})
          </p>
        )}
      </section>
    </>
  );
}

function Result(props: { run: EscRun }) {
  const { run } = props;
  const g = (run.row.grade as EscGrade | null) ?? escGrade(run.state);
  return (
    <section class="panel esc-result" id="now">
      <span class="eyebrow">사건 해결</span>
      <h2>
        {run.def.emoji} {run.def.title}
      </h2>
      <div class="esc-grade">
        <span class={`esc-grade-badge g-${g}`}>{g}</span>
        <div>
          <b>{GRADE_TEXT[g]}</b>
          <p class="hint">
            실수 {run.state.mistakes}번 · 힌트 {run.state.hints}번
          </p>
        </div>
      </div>
      <p class="esc-ending">{run.state.msg}</p>
      <p>
        {run.row.xp > 0
          ? `처음 해결 보상: 내 카드 경험치 +${run.row.xp}${run.row.jelly ? `, 도감 젤리 +${run.row.jelly}` : ''}`
          : '이 사건은 전에 해결해서 이번에는 보상이 없어요. 더 좋은 등급에 도전해 보세요!'}
      </p>
      <a class="btn btn-primary" href="/cases/room">
        다른 사건 고르기
      </a>
    </section>
  );
}

export function EscapePage(props: { viewer: Member; run: EscRun | null; result: EscRun | null; best: Map<string, EscGrade>; notice?: string }) {
  const { run, result } = props;
  return (
    <Layout title="하리보 사건파일" viewer={props.viewer} active="cases">
      <Popup lines={NOTICES[props.notice ?? ''] ?? []} />
      <div class="stack esc" data-fresh>
        <section class="panel">
          <span class="eyebrow">🔎 방탈출 추리</span>
          <h1>하리보 사건파일</h1>
          <p class="muted">방 안 물건을 눌러 살피고, 열쇠와 비밀번호로 잠긴 곳을 열어 단서를 모아요. 단서가 모이면 진실을 맞혀요.</p>
          <p class="hint">
            사건마다 처음 해결하면 내 카드 경험치 {ESC_XP}, S·A 등급이면 도감 젤리 1개도 받아요. 등장인물은 모두 가상 인물이에요.
          </p>
        </section>
        {run ? <Play run={run} /> : result ? <Result run={result} /> : null}
        {!run && (
          <section class="panel">
            <h2>사건 고르기</h2>
            <div class="esc-cases">
              {ESCAPE_CASES.map((c) => {
                const best = props.best.get(c.id);
                return (
                  <article class="esc-case">
                    <span class="esc-case-emoji" aria-hidden="true">
                      {c.emoji}
                    </span>
                    <h3>{c.title}</h3>
                    <span class="hint">📍 {c.place}</span>
                    <p>{c.intro}</p>
                    {best ? <span class={`tag esc-best g-${best}`}>최고 {best}</span> : <span class="tag wait">아직 안 풀었어요</span>}
                    <form method="post" action="/api/escape/start">
                      <input type="hidden" name="case" value={c.id} />
                      <button class="btn btn-primary" type="submit">
                        {best ? '다시 풀기' : '조사 시작'}
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
            <p class="hint">
              예전 방식도 할 수 있어요: <a href="/cases">무작위 사건</a> · <a href="/cases/story">연재 사건</a>
            </p>
          </section>
        )}
      </div>
    </Layout>
  );
}
