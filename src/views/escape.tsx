import type { Member } from '../env';
import type { EscRun } from '../escape-db';
import { ESCAPE_CASES, ESC_XP, bigHint, canAnswer, coinSpots, coinsLeft, escGrade, isLocked, puzzleNo, visible, type EscGrade, type EscObject } from '../escape';
import { casePics, itemPic } from '../case-art';
import { ROOMS, roomSrc, roomSrcSet, type Hotspot, type RoomKey } from '../case-rooms';
import { ROOM_BLUR } from '../room-blur.gen';
import { FictionNote } from './fiction';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';
import { uiForClient } from '../escape-ui';

const NOTICES: Record<string, PopupLine[]> = {
  stale: [
    {
      title: '알림',
      text: '다른 화면에서 이미 진행했어요. 지금 상태를 보여 드려요.',
    },
  ],
  bad: [{ title: '알림', text: '그렇게는 할 수 없어요.' }],
  quit: [{ title: '알림', text: '사건을 덮고 돌아왔어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

const GRADE_TEXT: Record<EscGrade, string> = {
  S: '명탐정!',
  A: '훌륭해요',
  B: '해결!',
  C: '겨우 해결',
};

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
  const cls = [
    'esc-thing',
    pics ? 'has-pic' : '',
    o.big ? 'big' : '',
    o.y < 30 ? 'on-wall' : '',
    s.focus === o.id ? 'focus' : '',
    s.seen.includes(o.id) && !locked ? 'seen' : '',
    !s.seen.includes(o.id) ? 'new' : '',
    motion ? `fx-${motion}` : '',
  ]
    .filter(Boolean)
    .join(' ');
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
        {locked && (
          <span class="esc-lock" aria-hidden="true">
            {o.face ? '❓' : '🔒'}
          </span>
        )}
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

// 멈춘 시각 읽기: "오후 3시 40분", "3시 정각" → [시, 분]
export function clockTime(msg: string): [number, number] | null {
  const t = msg.match(/(\d{1,2})시\s?(?:(\d{1,2})분|정각)/);
  return t ? [Number(t[1]) % 12, Number(t[2] ?? 0)] : null;
}

const box = (h: Hotspot) => `left:${h.x - h.w / 2}%;top:${h.y - h.h / 2}%;width:${h.w}%;height:${h.h}%`;

// 방 그림 속 물건 자리 하나. 눌러야 반응해요(표시는 없어요).
function Hot(props: { run: EscRun; o: EscObject; h: Hotspot; sign?: string }) {
  const { run, o, h, sign } = props;
  const s = run.state;
  const locked = isLocked(s, o);
  const cls = ['esc-hot', s.focus === o.id ? 'focus' : '', s.focus === o.id && s.fx ? `fx-${s.fx}` : ''].filter(Boolean).join(' ');
  return (
    <div class="esc-hot-wrap" style={box(h)}>
      {sign && (
        <span class={`esc-sign ${h.x < 50 ? 'l' : 'r'}`} aria-hidden="true">
          ▶ {sign}
        </span>
      )}
      <Act run={run} a="tap" o={o.id} cls={cls} label={o.name}>
        {locked && s.seen.includes(o.id) && (
          <span class="esc-hot-lock" aria-hidden="true">
            🔒
          </span>
        )}
      </Act>
    </div>
  );
}

// 눌러 본 곳을 방 그림에서 크게 확대해요. 손가락·마우스로 끌어서 둘러볼 수 있고, 시계는 멈춘 시각으로 바늘이 돌아가요.
function Loupe(props: { bg: RoomKey; h: Hotspot; msg: string; name: string; hots: unknown }) {
  const { h } = props;
  const k = Math.min(3, Math.max(1.8, Math.min(62 / h.w, 62 / h.h)));
  const clamp = (v: number) => Math.min(0, Math.max(100 - 100 * k, v));
  const left = clamp(50 - h.x * k);
  const top = clamp(50 - h.y * k);
  const time = h.face ? clockTime(props.msg) : null;
  const tag = zoomTag(props.msg);
  return (
    <>
      <input type="checkbox" id="esc-loupe-x" class="esc-loupe-x" hidden />
      <div class="esc-loupe" data-loupe>
        <div class="esc-loupe-img" style={`width:${k * 100}%;height:${k * 100}%;left:${left}%;top:${top}%`}>
          <img src={roomSrc(props.bg)} alt="" draggable={false} />
          {time && h.face && (
            <span
              class="esc-hands"
              style={`left:${h.face[0]}%;top:${h.face[1]}%;width:${h.face[2] * 1.56}%;--face:${h.face[3]};--hr:${time[0] * 30 + time[1] / 2}deg;--mn:${time[1] * 6}deg`}
              aria-hidden="true"
            >
              <i class="hr" />
              <i class="mn" />
            </span>
          )}
          {props.hots}
        </div>
        <b class="esc-loupe-name">🔍 {props.name}</b>
        {tag && <span class="esc-zoom-tag">{tag}</span>}
        <label for="esc-loupe-x" class="esc-loupe-close" aria-label="확대 닫기">
          ✕
        </label>
        <span class="esc-loupe-drag" aria-hidden="true">
          ✋ 끌어서 둘러보기
        </span>
      </div>
    </>
  );
}

// 이 사건에 나오는 그림(열린 모습·소지품·방 배경)을 미리 받아 둬요. 열 때 그림이 늦게 뜨지 않게요.
function CasePreload(props: { def: EscRun['def'] }) {
  const set = new Set<string>();
  for (const o of props.def.objects)
    for (const open of [false, true]) {
      const p = casePics(o.emoji, open, false);
      if (p) set.add(p.now.src);
    }
  for (const it of Object.values(props.def.items)) {
    const p = itemPic(it.emoji);
    if (p) set.add(p);
  }
  const rooms = [...new Set(props.def.scenes.flatMap((sc) => (sc.bg ? [sc.bg] : [])))];
  // 지금 보는 방 그림이 먼저 오도록, 미리 받아 두는 그림은 낮은 순서로 받아요.
  return (
    <div class="jr-preload" aria-hidden="true">
      {[...set].map((src) => (
        <img src={src} alt="" width={1} height={1} fetchpriority="low" />
      ))}
      {rooms.map((k) => (
        <img src={roomSrc(k)} srcset={roomSrcSet(k)} sizes="(max-width: 820px) 100vw, 820px" alt="" width={1} height={1} fetchpriority="low" />
      ))}
    </div>
  );
}

function Focus(props: { run: EscRun; art: string; name: string }) {
  const { run } = props;
  const s = run.state;
  const o = s.focus ? run.def.objects.find((x) => x.id === s.focus) : null;
  const locked = o && isLocked(s, o);
  const puzzle = locked && o.lock!.kind === 'code';
  const code = o?.lock?.kind === 'code' ? o.lock : null;
  return (
    <div class={`esc-talk${s.fx === 'wrong' ? ' fx-nope' : ''}`}>
      <img class="esc-face" src={o?.face ? `/char/${o.face}.png` : props.art} alt={o?.face ? o.name : props.name} width={72} height={72} />
      <div class={`esc-bubble tone-${s.tone}`} role="status">
        {o && !puzzle && (
          <b class="esc-bubble-name">
            {o.at || casePics(o.emoji, false, false) ? '' : `${o.emoji} `}
            {o.name}
          </b>
        )}
        {o &&
          !puzzle &&
          (() => {
            const pics = o.at ? null : casePics(o.emoji, o.lock ? !locked : !!o.goto, false);
            return pics ? <Zoom src={pics.now.src} msg={s.msg} name={o.name} /> : null;
          })()}
        {!puzzle && <p>{s.msg}</p>}
        {puzzle && (
          <div class="esc-puzzle" data-esc-sync="puzzle">
            <div class="esc-puzzle-head">
              <b>수수께끼 No.{puzzleNo(run.def, o.id)}</b>
              <span>{o.face ? `${o.name}의 문제` : o.name}</span>
            </div>
            <p>{o.look}</p>
            {s.fx === 'wrong' && <p class="esc-wrong">❌ {s.msg}</p>}
            <p class="hint">
              {o.lock!.kind === 'code' && o.lock!.ask}
              {o.face ? '' : ' · 수첩의 📌 메모가 실마리예요.'}
            </p>
            {(s.seenHints ?? [])
              .filter((k) => run.def.hints[k]?.until === o.id)
              .map((k) => (
                <p class="esc-hint-line">💡 {run.def.hints[k]!.text}</p>
              ))}
            {(s.bigHints ?? []).includes(o.id) && bigHint(o) && <p class="esc-hint-line">💡💡 {bigHint(o)}</p>}
            {bigHint(o) && !(s.bigHints ?? []).includes(o.id) && run.def.hints.some((h, k) => h.until === o.id && (s.seenHints ?? []).includes(k)) && (
              <Act run={run} a="hint2" o={o.id} cls="btn btn-small esc-hint-btn">
                {coinsLeft(s) > 0 ? '💡💡 더 쉬운 힌트 (동전 1개)' : '💡💡 더 쉬운 힌트 (등급 감점)'}
              </Act>
            )}
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
            {code?.ui ? (
              <div class="esc-ui-wrap">
                <div class="esc-ui" data-ui={JSON.stringify(uiForClient(code.ui))}>
                  <noscript>이 문제는 화면에서 직접 움직여 풀어요. 자바스크립트를 켜 주세요.</noscript>
                </div>
                <input type="hidden" name="v" value="" data-ui-v />
              </div>
            ) : o.lock!.kind === 'code' && o.lock!.grid ? (
              <div class="esc-grid" style={`--w:${o.lock!.grid.w}`}>
                <input type="hidden" name="gn" value={String(o.lock!.grid.w * o.lock!.grid.h)} />
                {o.lock!.grid.nums.map((n, i) =>
                  n === null ? (
                    <label class="esc-cell">
                      <input type="checkbox" name={`g${i}`} value="1" aria-label={`${Math.floor(i / code!.grid!.w) + 1}줄 ${(i % code!.grid!.w) + 1}칸`} />
                      <span aria-hidden="true" />
                    </label>
                  ) : (
                    <span class="esc-cell num">{n}</span>
                  ),
                )}
              </div>
            ) : o.lock!.kind === 'code' && o.lock!.order ? (
              <div class="esc-order">
                {o.lock!.order.map((_, i) => (
                  <label>
                    <span>{i + 1}번째</span>
                    <select name={`t${i}`} required>
                      <option value="">고르기</option>
                      {code!.order!.map((nm, k) => (
                        <option value={String(k + 1)}>{nm}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : o.lock!.kind === 'code' && o.lock!.choices ? (
              <div class="esc-choices">
                {o.lock!.choices.map((ch) => (
                  <button class="btn" type="submit" name="v" value={ch}>
                    {ch}
                  </button>
                ))}
              </div>
            ) : o.lock!.kind === 'code' && /^[0-9]+$/.test(o.lock!.code) ? (
              <input
                name="v"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength={8}
                autocomplete="off"
                placeholder={o.lock!.ask}
                aria-label={`${o.name} 비밀번호`}
                required
              />
            ) : (
              <input
                name="v"
                maxlength={12}
                autocomplete="off"
                placeholder={o.lock!.kind === 'code' ? o.lock!.ask : ''}
                aria-label={`${o.name} 암호`}
                required
              />
            )}
            {code?.ui && (
              <button class="btn" type="button" data-ui-reset>
                ↺ 처음부터
              </button>
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

// 사건과 상관없는 물건: 눌러도 짧은 말만 해요(서버에 안 보내요).
const idleSay = (h: Hotspot) => (h.tag?.includes('door') ? '문은 굳게 닫혀 있어요. 지금은 이 방을 살펴봐요.' : `${h.label}… 특별한 건 없어 보여요.`);

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
  const ready = canAnswer(def, s);
  const bg: RoomKey = scene.bg ?? 'office';
  const room = ROOMS[bg];
  const placed = things.filter((o) => o.at);
  const backs = things.filter((o) => !o.at && o.goto && !o.face);
  const loose = things.filter((o) => !o.at && !(o.goto && !o.face));
  // 사람은 처음엔 방 안에 서 있다가, 그 사람 문제를 풀면 방 아래 카드 줄로 내려가요(방 안을 덜 가려요).
  const met = loose.filter((o) => o.face && (o.lock ? !isLocked(s, o) : s.seen.includes(o.id)));
  const standing = loose.filter((o) => !met.includes(o));
  const focusObj = s.focus ? things.find((o) => o.id === s.focus) : undefined;
  // 확대(끌어서 둘러보기)는 눈으로 읽어야 할 게 있을 때만: 멈춘 시계 바늘, 적힌 시각·글씨.
  const spot = focusObj?.at ? room.spots.find((h) => h.id === focusObj.at) : undefined;
  const lens = spot && ((spot.face && clockTime(s.msg)) || zoomTag(s.msg)) ? spot : undefined;
  // 방 그림 속 물건 자리들. 확대 화면 안에도 같은 자리를 깔아서, 확대한 채로도 물건을 누를 수 있어요.
  // 창구 안의 종처럼 겹친 곳은 작은 지점을 나중에 그려 눌릴 수 있게 해요.
  const hots = [...room.spots].sort((a, b) => b.w * b.h - a.w * a.h).map((h) => {
    const o = placed.find((o) => o.at === h.id);
    return o ? (
      <Hot run={run} o={o} h={h} sign={o.goto ? def.scenes.find((x) => x.id === o.goto)?.name : undefined} />
    ) : (
      <button type="button" class="esc-hot idle" style={box(h)} data-say={idleSay(h)} aria-label={h.label} />
    );
  });
  return (
    <>
      <section class="jr-game esc-game" id="now">
        <div class="esc-layout">
          <div class="esc-view">
            <header class="jr-hud" data-esc-sync="hud">
              <span class="jr-hud-ch">
                📍 {def.place} · {scene.name}
              </span>
              {puzzles.length > 0 && (
                <span class="esc-chip" title="푼 수수께끼">
                  🧩 {solved}/{puzzles.length}
                </span>
              )}
              <span class="esc-chip" title="힌트 동전">
                🪙 {left}
              </span>
              <span class="esc-chip" title="실수">
                ❌ {s.mistakes}
              </span>
            </header>
            <div class="esc-frame">
              <div class={`esc-room esc-pic-room${s.fx === 'move' ? ' fx-move' : ''}`} data-room>
                <img
                  class="esc-bg"
                  src={roomSrc(bg)}
                  srcset={roomSrcSet(bg)}
                  sizes="(max-width: 820px) 100vw, 820px"
                  fetchpriority="high"
                  decoding="async"
                  style={ROOM_BLUR[bg] ? `background:url(${ROOM_BLUR[bg]}) center/cover` : undefined}
                  alt={`${scene.name} 그림`}
                  width={1500}
                  height={1050}
                  draggable={false}
                />
                                {hots}
                {standing.map((o, i) => {
                  const [x, y] = room.people[i % room.people.length]!;
                  return <Thing run={run} o={{ ...o, x, y }} />;
                })}
                {coins.map((c) => (
                  <div class="esc-spot esc-coin-spot" style={`--x:${c.x};--y:${c.y}`}>
                    <Act run={run} a="coin" n={c.k} cls="esc-coin" label="반짝이는 곳">
                      {null}
                    </Act>
                  </div>
                ))}
                {s.fx === 'right' && (
                  <b class="esc-stamp right" aria-hidden="true">
                    정답!
                  </b>
                )}
                {s.fx === 'wrong' && (
                  <b class="esc-stamp wrong" aria-hidden="true">
                    땡!
                  </b>
                )}
                {s.fx === 'coin' && (
                  <b class="esc-stamp coin" aria-hidden="true">
                    🪙 +1
                  </b>
                )}
                {lens && s.fx !== 'move' && <Loupe bg={bg} h={lens} msg={s.msg} name={focusObj!.name} hots={hots} />}
              </div>
            </div>
            {met.length > 0 && (
              <div class="esc-actors" aria-label="이야기를 나눈 사람">
                {met.map((o) => <Thing run={run} o={o} />)}
              </div>
            )}
            <div class="esc-bag">
              <b>🎒</b>
              {s.inv.length ? (
                s.inv.map((i) => (
                  <span class="esc-item">
                    <ItemIcon emoji={def.items[i]?.emoji} /> {def.items[i]?.name}
                  </span>
                ))
              ) : (
                <span class="hint">가방이 비었어요</span>
              )}
            </div>
          </div>
          <div class="esc-side">
            <Focus run={run} art={props.art} name={props.name} />
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
            <div class="esc-tools" data-esc-sync="tools">
              {backs.map((o) => (
                <Act run={run} a="tap" o={o.id} cls="btn btn-small">
                  🚪 {o.name}
                </Act>
              ))}
              <a class="btn btn-small" href="/cases/room?list=1">
                📁 사건 목록
              </a>
              <Act run={run} a="hint" cls="btn btn-small">
                {left > 0 ? '💡 힌트 (동전 1개)' : '💡 힌트 (등급 감점)'}
              </Act>
              <a class="btn btn-small" href="#notes">
                📒 수첩 {s.clues.length}/{allClues.length}
              </a>
              <a class={`btn btn-small${ready ? ' btn-primary' : ''}`} href="#answer">
                🕵️ 진실 맞히기
                {ready ? '!' : ` ${need}/${def.question.needs.length}`}
              </a>
            </div>
          </div>
        </div>
        <CasePreload def={run.def} />
        <div class="esc-foot">
          <span class="hint">물건을 눌러 살펴보세요. 방 곳곳을 누르면 숨은 힌트 동전이 있어요.</span>
          <form method="post" action="/api/escape/quit">
            <input type="hidden" name="run" value={run.row.id} />
            <button class="btn btn-small btn-ghost" type="submit">
              사건 덮기
            </button>
          </form>
        </div>
      </section>

      <section class="panel esc-notes" id="notes">
        <h2>
          📒 수첩{' '}
          <span class="tag">
            {s.clues.length}/{allClues.length}
          </span>
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

      <section class="panel esc-answer" id="answer">
        <h2>🕵️ {def.more ? '진실 맞히기: 누가, 어떻게, 왜?' : def.question.text}</h2>
        {ready && def.more ? (
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
        ) : ready ? (
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
    <section class="jr-game esc-game esc-result" id="now">
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

export function EscapePage(props: {
  viewer: Member;
  art: string;
  run: EscRun | null;
  list?: boolean; // 하던 사건이 있어도 사건 목록 보기
  result: EscRun | null;
  best: Map<string, EscGrade>;
  notice?: string;
  url?: string;
}) {
  const { run, result } = props;
  return (
    <Layout title="하리보 사건파일" viewer={props.viewer} active="cases" scripts={run ? ['/escape.js?v=loupe-tap-1', '/escape-ui.js?v=5'] : undefined}>
      {props.url && <i hidden data-replace-url={props.url} />}
      <Popup lines={NOTICES[props.notice ?? ''] ?? []} />
      <div class="stack esc" data-fresh>
        <div class="jr-title">
          <h1>🔎 하리보 사건파일</h1>
          <span class="jr-reward" title="해결한 사건">
            📁 {props.best.size}/{ESCAPE_CASES.length}
          </span>
          <details class="jr-help">
            <summary aria-label="하는 법">?</summary>
            <div>
              <p>방 안 물건을 눌러 살피고, 열쇠와 비밀번호·수수께끼로 잠긴 곳을 열어 단서를 모아요. 단서가 모이면 진실을 맞혀요.</p>
              <p>방 곳곳 빈 자리를 눌러 보면 숨은 힌트 동전이 있어요. 실수와 동전 없이 본 힌트가 적을수록 등급이 높아요.</p>
              <p>사건마다 처음 해결하면 내 카드 경험치 {ESC_XP}, S·A 등급이면 도감 젤리 1개도 받아요.</p>
            </div>
          </details>
        </div>
        {run && !props.list ? <Play run={run} art={props.art} name={props.viewer.display_name} /> : result ? <Result run={result} /> : null}
        {(!run || props.list) && (
          <section class="jr-game esc-game esc-shelf">
            <h2 class="jr-pick-title">어떤 사건 파일을 열까요?</h2>
            {run && (
              <p class="esc-going">
                하던 사건: <b>{run.def.emoji} {run.def.title}</b>{' '}
                <a class="btn btn-small btn-primary" href="/cases/room#now">
                  ▶ 이어 하기
                </a>
                <br />
                <span class="hint">다른 사건을 열면 하던 사건은 덮여요(다음에 열면 처음부터 해요).</span>
              </p>
            )}
            <p class="hint">★ 입문 사건은 짧고 쉬워요. ★★★ 사건은 방 3개, 퍼즐 4~5개, 물건 합치기, 범인·방법·동기까지 맞혀야 해요.</p>
            <div class="esc-cases">
              {ESCAPE_CASES.map((c) => {
                const best = props.best.get(c.id);
                return (
                  <form method="post" action="/api/escape/start" class={`esc-file${best ? ' done' : ''}`}>
                    <input type="hidden" name="case" value={c.id} />
                    {run && <input type="hidden" name="switch" value="1" />}
                    <button type="submit" title={c.intro}>
                      <span class="esc-file-tab">{'★'.repeat(c.level ?? 1)}</span>
                      <span class="esc-case-emoji" aria-hidden="true">
                        {c.emoji}
                      </span>
                      <b>{c.title}</b>
                      <span class="esc-file-place">📍 {c.place}</span>
                      {best ? <span class={`esc-file-stamp g-${best}`}>{best}</span> : <span class="esc-file-new">미해결</span>}
                    </button>
                  </form>
                );
              })}
            </div>
          </section>
        )}
        <FictionNote />
      </div>
    </Layout>
  );
}
