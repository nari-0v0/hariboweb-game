import type { Member } from '../env';
import type { EscRun } from '../escape-db';
import { ESCAPE_CASES, ESC_XP, canAnswer, coinSpots, coinsLeft, escGrade, isLocked, puzzleNo, visible, type EscGrade, type EscObject } from '../escape';
import { casePics, itemPic, roomBg } from '../case-art';
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

// 소지품: 그림이 있으면 그림, 없으면 이모지
function ItemIcon(props: { emoji?: string }) {
  const src = itemPic(props.emoji);
  return src ? <img class="esc-item-pic" src={src} alt="" width={24} height={24} /> : <span aria-hidden="true">{props.emoji}</span>;
}

function Thing(props: { run: EscRun; o: EscObject }) {
  const { run, o } = props;
  const s = run.state;
  const locked = isLocked(s, o);
  const now = s.focus === o.id ? s.fx : undefined;
  const motion = now === 'open' || now === 'right' ? (o.emoji === '🚪' ? 'swing' : 'pop') : now === 'gain' ? 'shine' : now === 'wrong' ? 'nope' : '';
  // 열리는 물건: 잠금을 풀었거나, 잠금 없는 문(돌아가는 문)은 열린 모습
  const pics = casePics(o.emoji, !!o.lock ? !locked : !!o.goto, !!o.big);
  const cls = ['esc-thing', pics ? 'has-pic' : '', o.big ? 'big' : '', o.y < 30 ? 'on-wall' : '', s.focus === o.id ? 'focus' : '', s.seen.includes(o.id) && !locked ? 'seen' : '', motion ? `fx-${motion}` : ''].filter(Boolean).join(' ');
  return (
    <div class="esc-spot" style={`--x:${o.x};--y:${o.y}`}>
      <Act run={run} a="tap" o={o.id} cls={cls} label={o.name}>
        {o.face ? (
          <span class="esc-pic esc-person" aria-hidden="true">
            <img src={`/char/${o.face}.png`} alt="" />
          </span>
        ) : pics ? (
          <span class="esc-pic" aria-hidden="true" style={`width:calc(var(--k) * ${pics.now.w}cqw);height:calc(var(--k) * ${pics.now.h}cqw)`}>
            <img src={pics.now.src} alt="" />
            {pics.was && (motion === 'pop' || motion === 'swing') && <img class="esc-was" src={pics.was.src} alt="" />}
          </span>
        ) : (
          <span class="esc-emoji" aria-hidden="true">
            {o.emoji}
          </span>
        )}
        {locked && <span class="esc-lock" aria-hidden="true">{o.face ? '❓' : '🔒'}</span>}
        {(motion === 'pop' || motion === 'swing' || motion === 'shine') && <span class="esc-burst" aria-hidden="true" />}
        <span class="esc-name">{o.name}</span>
      </Act>
    </div>
  );
}

// 눌러 본 물건을 크게 보여 주는 확대 화면. 시각·적힌 글씨는 쪽지로 붙여 눈으로 찾게 해요.
export function zoomTag(msg: string): string | null {
  const t = msg.match(/(오전|오후)?\s?(\d{1,2})시\s?(?:(\d{1,2})분|정각)/);
  if (t) return `${t[1] ? `${t[1]} ` : ''}${t[2]}:${String(t[3] ?? 0).padStart(2, '0')}`;
  const q = msg.match(/「([^」]{1,16})」/);
  return q ? q[1]! : null;
}

function Zoom(props: { src: string; msg: string; name: string }) {
  const tag = zoomTag(props.msg);
  return (
    <div class="esc-zoom" aria-hidden="true">
      <img src={props.src} alt="" />
      {tag && <span class="esc-zoom-tag">{tag}</span>}
    </div>
  );
}

// 이 사건에 나오는 그림(열린 모습·소지품·방 배경)을 미리 받아 둬요. 열 때 그림이 늦게 뜨지 않게요.
function CasePreload(props: { def: EscRun['def'] }) {
  const set = new Set<string>();
  for (const o of props.def.objects) for (const open of [false, true]) { const p = casePics(o.emoji, open, false); if (p) set.add(p.now.src); }
  for (const it of Object.values(props.def.items)) { const p = itemPic(it.emoji); if (p) set.add(p); }
  for (const sc of props.def.scenes) set.add(roomBg(sc.name));
  return (
    <div class="jr-preload" aria-hidden="true">
      {[...set].map((src) => <img src={src} alt="" width={1} height={1} />)}
    </div>
  );
}

function Focus(props: { run: EscRun; art: string; name: string }) {
  const { run } = props;
  const s = run.state;
  const o = s.focus ? run.def.objects.find((x) => x.id === s.focus) : null;
  const locked = o && isLocked(s, o);
  const puzzle = locked && o.lock!.kind === 'code';
  return (
    <div class={`esc-talk${s.fx === 'wrong' ? ' fx-nope' : ''}`}>
      <img class="esc-face" src={o?.face ? `/char/${o.face}.png` : props.art} alt={o?.face ? o.name : props.name} width={72} height={72} />
    <div class={`esc-bubble tone-${s.tone}`} role="status">
      {o && !puzzle && (
        <b class="esc-bubble-name">
          {casePics(o.emoji, false, false) ? '' : `${o.emoji} `}
          {o.name}
        </b>
      )}
      {o && !puzzle && (() => {
        const pics = casePics(o.emoji, o.lock ? !locked : !!o.goto, false);
        return pics ? <Zoom src={pics.now.src} msg={s.msg} name={o.name} /> : null;
      })()}
      {!puzzle && <p>{s.msg}</p>}
      {puzzle && (
        <div class="esc-puzzle">
          <div class="esc-puzzle-head">
            <b>수수께끼 No.{puzzleNo(run.def, o.id)}</b>
            <span>{o.face ? `${o.name}의 문제` : o.name}</span>
          </div>
          <p>{o.look}</p>
          {s.fx === 'wrong' && <p class="esc-wrong">❌ {s.msg}</p>}
          <p class="hint">{o.lock!.kind === 'code' && o.lock!.ask}{o.face ? '' : ' · 수첩의 📌 메모가 실마리예요.'}</p>
          {(s.seenHints ?? []).filter((k) => run.def.hints[k]?.until === o.id).map((k) => (
            <p class="esc-hint-line">💡 {run.def.hints[k]!.text}</p>
          ))}
          {run.def.hints.some((h, k) => h.until === o.id && !(s.seenHints ?? []).includes(k)) && (
            <Act run={run} a="hint" cls="btn btn-small esc-hint-btn">
              {coinsLeft(s) > 0 ? '💡 이 문제 힌트 (동전 1개)' : '💡 이 문제 힌트 (등급 감점)'}
            </Act>
          )}
        </div>
      )}
      {puzzle && (
        <form method="post" action="/api/escape/act" class="esc-code">
          <input type="hidden" name="run" value={run.row.id} />
          <input type="hidden" name="rev" value={String(run.row.rev)} />
          <input type="hidden" name="a" value="code" />
          <input type="hidden" name="o" value={o.id} />
          {o.lock!.kind === 'code' && o.lock!.choices ? (
            <div class="esc-choices">
              {o.lock!.choices.map((ch) => (
                <button class="btn" type="submit" name="v" value={ch}>
                  {ch}
                </button>
              ))}
            </div>
          ) : o.lock!.kind === 'code' && /^[0-9]+$/.test(o.lock!.code) ? (
            <input name="v" inputmode="numeric" pattern="[0-9]*" maxlength={8} autocomplete="off" placeholder={o.lock!.ask} aria-label={`${o.name} 비밀번호`} required />
          ) : (
            <input name="v" maxlength={12} autocomplete="off" placeholder={o.lock!.kind === 'code' ? o.lock!.ask : ''} aria-label={`${o.name} 암호`} required />
          )}
          {!(o.lock!.kind === 'code' && o.lock!.choices) && (
            <button class="btn btn-primary" type="submit">
              ✍️ 정답 내기
            </button>
          )}
        </form>
      )}
      {locked && o.lock!.kind === 'item' && (
        <div class="esc-use">
          {s.inv.length ? (
            <>
              <span class="hint">가방에서 쓸 물건을 골라요</span>
              {s.inv.map((i) => (
                <Act run={run} a="use" o={o.id} i={i} cls="btn btn-small">
                  <ItemIcon emoji={run.def.items[i]?.emoji} /> {run.def.items[i]?.name} 쓰기
                </Act>
              ))}
            </>
          ) : (
            <span class="hint">가방이 비어 있어요. 다른 곳을 먼저 살펴보세요.</span>
          )}
        </div>
      )}
    </div>
    </div>
  );
}

function Play(props: { run: EscRun; art: string; name: string }) {
  const { run } = props;
  const { def, state: s } = run;
  const scene = def.scenes.find((x) => x.id === s.scene)!;
  const things = def.objects.filter((o) => visible(def, s, o));
  const allClues = Object.keys(def.clues);
  const need = def.question.needs.filter((n) => s.clues.includes(n)).length;
  const memos = def.objects.filter((o) => o.memo && s.seen.includes(o.id));
  const qs = [def.question, ...(def.more ?? [])];
  const puzzles = def.objects.filter((o) => o.lock?.kind === 'code');
  const solved = puzzles.filter((o) => s.opened.includes(o.id)).length;
  const coins = coinSpots(def, s.scene).filter((c) => !s.coins?.includes(`${s.scene}:${c.k}`));
  const left = coinsLeft(s);
  return (
    <>
      <section class="panel esc-play" id="now">
        <div class="esc-top">
          <span class="esc-place">📍 {def.place} · {scene.name}</span>
          <span class="esc-stats">
            {puzzles.length > 0 && (
              <span title="푼 수수께끼">
                🧩 {solved}/{puzzles.length}
              </span>
            )}
            <span title="힌트 동전">🪙 {left}</span>
            <span title="실수">❌ {s.mistakes}</span>
            <span title="동전 없이 본 힌트">💡 {s.hints}</span>
          </span>
        </div>
        <div class="esc-frame">
          <div class={`esc-room${s.fx === 'move' ? ' fx-move' : ''}`} style={`--wall:${scene.wall};--floor:${scene.floor};--room:url(${roomBg(scene.name)})`}>
            <div class="esc-wall" />
            <div class="esc-floor" />
            {things.map((o) => (
              <Thing run={run} o={o} />
            ))}
            {coins.map((c) => (
              <div class="esc-spot" style={`--x:${c.x};--y:${c.y}`}>
                <Act run={run} a="coin" n={c.k} cls="esc-coin" label="반짝이는 곳">
                  {null}
                </Act>
              </div>
            ))}
            {s.fx === 'right' && <b class="esc-stamp right" aria-hidden="true">정답!</b>}
            {s.fx === 'wrong' && <b class="esc-stamp wrong" aria-hidden="true">땡!</b>}
            {s.fx === 'coin' && <b class="esc-stamp coin" aria-hidden="true">🪙 +1</b>}
          </div>
        </div>
        <Focus run={run} art={props.art} name={props.name} />
        <CasePreload def={run.def} />
        <div class="esc-bag">
          <b>🎒 가방</b>
          {s.inv.length ? (
            s.inv.map((i) => (
              <span class="esc-item">
                <ItemIcon emoji={def.items[i]?.emoji} /> {def.items[i]?.name}
              </span>
            ))
          ) : (
            <span class="hint">아직 비었어요</span>
          )}
        </div>
        {def.combos && s.inv.length >= 2 && (
          <form method="post" action="/api/escape/act" class="esc-combine">
            <input type="hidden" name="run" value={run.row.id} />
            <input type="hidden" name="rev" value={String(run.row.rev)} />
            <input type="hidden" name="a" value="combine" />
            <b>🔧 합치기</b>
            <select name="i" aria-label="합칠 물건 1">
              {s.inv.map((i) => (
                <option value={i}>{def.items[i]?.name}</option>
              ))}
            </select>
            <span aria-hidden="true">+</span>
            <select name="j" aria-label="합칠 물건 2">
              {s.inv.map((i, k) => (
                <option value={i} selected={k === 1}>
                  {def.items[i]?.name}
                </option>
              ))}
            </select>
            <button class="btn btn-small" type="submit">
              합쳐 보기
            </button>
          </form>
        )}
        <div class="esc-tools">
          <Act run={run} a="hint" cls="btn btn-small">
            {left > 0 ? '💡 힌트 보기 (동전 1개)' : '💡 힌트 보기 (등급 감점)'}
          </Act>
          <form method="post" action="/api/escape/quit">
            <input type="hidden" name="run" value={run.row.id} />
            <button class="btn btn-small btn-ghost" type="submit">
              사건 덮기
            </button>
          </form>
        </div>
        <p class="hint">물건을 눌러 살펴보세요. 잠긴 곳은 찾은 물건이나 수수께끼 정답으로 열어요. 방 곳곳 빈 자리를 눌러 보면 숨은 힌트 동전이 있어요. 실수와 동전 없이 본 힌트가 적을수록 등급이 높아요.</p>
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
        {(run.state.seenHints ?? []).length > 0 && (
          <ul class="esc-clues esc-seen-hints">
            {(run.state.seenHints ?? []).map((k) => (
              <li>💡 {run.def.hints[k]?.text}</li>
            ))}
          </ul>
        )}
        {memos.length > 0 && (
          <details class="esc-memos" open>
            <summary>📌 메모 ({memos.length})</summary>
            <ul>
              {memos.map((o) => (
                <li>
                  <b>
                    {o.emoji} {o.name}
                  </b>
                  <span>{o.look}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section class="panel esc-answer">
        <h2>🕵️ {def.more ? '진실 맞히기: 누가, 어떻게, 왜?' : def.question.text}</h2>
        {canAnswer(def, s) && def.more ? (
          <form method="post" action="/api/escape/act" class="esc-quiz">
            <input type="hidden" name="run" value={run.row.id} />
            <input type="hidden" name="rev" value={String(run.row.rev)} />
            <input type="hidden" name="a" value="answer" />
            {qs.map((q, k) => (
              <fieldset>
                <legend>
                  {k + 1}. {q.text}
                </legend>
                {q.options.map((text, n) => (
                  <label class="esc-pick">
                    <input type="radio" name={k === 0 ? 'n' : `m${k - 1}`} value={String(n)} required />
                    <span>{text}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <button class="btn btn-primary" type="submit">
              🕵️ 이걸로 사건 해결!
            </button>
            <p class="hint">셋 다 맞아야 해결돼요. 틀리면 몇 개 맞았는지만 알려 줘요.</p>
          </form>
        ) : canAnswer(def, s) ? (
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
        <span class={`esc-grade-badge g-${g} fx-stamp`}>{g}</span>
        <div>
          <b>{GRADE_TEXT[g]}</b>
          <p class="hint">
            실수 {run.state.mistakes}번 · 동전 없이 본 힌트 {run.state.hints}번 · 찾은 힌트 동전 {run.state.coins?.length ?? 0}개
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

export function EscapePage(props: { viewer: Member; art: string; run: EscRun | null; result: EscRun | null; best: Map<string, EscGrade>; notice?: string; url?: string }) {
  const { run, result } = props;
  return (
    <Layout title="하리보 사건파일" viewer={props.viewer} active="cases">
      {props.url && <i hidden data-replace-url={props.url} />}
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
        {run ? <Play run={run} art={props.art} name={props.viewer.display_name} /> : result ? <Result run={result} /> : null}
        {!run && (
          <section class="panel">
            <h2>
              사건 고르기 <span class="tag">해결 {props.best.size}/{ESCAPE_CASES.length}</span>
            </h2>
            <p class="hint">★ 입문 사건은 짧고 쉬워요. ★★★ 사건은 방 3개, 퍼즐 4~5개, 물건 합치기, 그리고 범인·방법·동기를 모두 맞혀야 해요.</p>
            <div class="esc-cases">
              {ESCAPE_CASES.map((c) => {
                const best = props.best.get(c.id);
                return (
                  <article class="esc-case">
                    <span class="esc-case-emoji" aria-hidden="true">
                      {c.emoji}
                    </span>
                    <h3>{c.title}</h3>
                    <span class="esc-level" aria-label={`난이도 ${c.level ?? 1}`}>
                      {'★'.repeat(c.level ?? 1)}
                    </span>
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
