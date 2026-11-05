import type { StoryRun } from '../story-db';
import { CASE_PLAY, cellPorts, connected, neighbors, type ObjectTask } from '../tactile';
import { meets, region, storyCase, storyEvent } from '../story-content';
import { fillStory } from '../story';

export function TactileForm(props: { run: StoryRun; action: string; choice: string; children?: any; prefix?: string; class?: string; disabled?: boolean; label?: string }) {
  return <form class={props.class} method="post" action="/api/story/act" data-puzzle-form={props.prefix !== undefined ? '' : undefined} data-prefix={props.prefix}>
    <input type="hidden" name="run" value={props.run.row.id} /><input type="hidden" name="at" value={String(props.run.row.revision)} />
    <input type="hidden" name="action" value={props.action} /><input type="hidden" name="choice" value={props.choice} />
    {props.children}<button class="btn btn-primary" type="submit" disabled={props.disabled}>{props.label ?? '수첩에 기록'}</button>
  </form>;
}
function Arrange(props: { pieces: { id: string; text: string }[]; label: string }) {
  // 해답 순서는 브라우저로 보내지 않고, 섞인 조각만 렌더링해요.
  const sorted = [...props.pieces].sort((a, b) => a.id.localeCompare(b.id));
  const mixed = [...sorted.slice(1), sorted[0]!];
  return <div class="arrange" data-arrange aria-label={props.label}>
    <p class="hint">조각을 끌어 넣거나, 조각을 누른 뒤 빈칸을 누르세요. 채운 칸을 누르면 비울 수 있어요.</p>
    <div class="piece-tray">{mixed.map(p => <button type="button" class="paper-piece" draggable="true" data-piece={p.id}>{p.text}</button>)}</div>
    <ol class="piece-slots">{props.pieces.map((_, i) => <li><button type="button" class="piece-slot" data-slot={String(i)} aria-label={`${i + 1}번 배치 칸`}>{i + 1}. 여기에 놓기</button></li>)}</ol>
    <p class="hint" data-arrange-status aria-live="polite">아직 배치하지 않았어요.</p>
  </div>;
}
function Task(props: { task: ObjectTask }) {
  const t = props.task;
  return <><p>{t.hint}</p>
    {t.kind === 'strips' && <Arrange pieces={t.pieces!} label="기록 조립" />}
    {t.kind === 'clock' && <label class="instrument">🕰️ 예약 시각 <input type="time" data-clock value="00:00" required /></label>}
    {t.kind === 'code' && <label class="instrument">확대한 표찰 옮겨 적기 <input type="text" data-code autocomplete="off" maxlength={24} required /></label>}
    {t.kind === 'align' && <div class="align-tool"><div class="wave-guide" style={`transform:translateX(${Number(t.solution) * 12}px)`}>∿　∿　∿　∿</div><div class="wave-moving" data-wave>∿　∿　∿　∿</div><label>기준 눈금 <input type="range" min="0" max="8" step="1" value="0" data-align /><output data-align-output>0</output></label></div>}
  </>;
}
export function CaseWorkbench(props: { run: StoryRun }) {
  const { run } = props, s = run.state, play = CASE_PLAY[s.content]!, def = storyCase(s.content)!, t = s.interaction;
  if (!t || t.mode !== 'case') return null;
  return <div class="case-workbench" data-interaction-key={run.row.id}>
    <noscript><p>방 이동과 증거 조립에는 브라우저의 JavaScript가 필요해요.</p></noscript>
    <p>{def.intro}</p>
    <details class="witness-notes"><summary>조력자 대화 수첩</summary>{def.dialogue.map(line => <p>{fillStory(line, s.crew)}</p>)}</details>
    <div class="room-tabs" role="group" aria-label="방 이동">{play.rooms.map((r, i) => <button type="button" class="btn" data-room-button={String(i)} aria-pressed={i === 0 ? 'true' : 'false'}>{r.icon} {r.name}</button>)}</div>
    {play.rooms.map((r, i) => <div class={`search-scene room-${i}`} data-room-scene={String(i)} hidden={i !== 0} style={`--room-color:${r.color}`} aria-label={`${r.name} 조사 장면`}>
      <div class="scene-window" aria-hidden="true" /><div class="scene-shelf" aria-hidden="true" /><div class="scene-desk" aria-hidden="true" /><span class="scene-name">{r.name}</span>
      <img class="scene-helper" src={s.crew[0]?.art ?? '/char/deco/detective.png'} alt="조사 중인 조력자" />
      {play.objects.filter(o => o.room === i).map(o => {
        const c = def.clues.find(c => c.id === o.clue)!, seen = s.seen.includes(o.clue), available = meets(s.marks, c.need);
        return <button class={`hotspot${seen ? ' found' : ''}`} type="button" data-open-object={o.clue} style={`left:${o.x}%;top:${o.y}%`} disabled={!available} aria-label={`${c.label}${seen ? ' (기록함)' : !available ? ' (기록 필요)' : ' 확대'}`}><span>{o.icon}</span><small>{seen ? '✓ 기록함' : available ? '조사' : '잠김'}</small></button>;
      })}
    </div>)}
    <p class="hint">방 안의 물건을 눌러 확대하세요. 작은 열쇠나 바닥 흔적도 놓치지 마세요.</p>
    {play.objects.map(o => {
      const c = def.clues.find(c => c.id === o.clue)!;
      return <dialog class="object-dialog" data-object-dialog={o.clue} aria-label={c.label}>
        <button class="btn dialog-close" type="button" data-close-dialog>닫기 ×</button><h3>{c.label}</h3><div class="object-zoom" aria-hidden="true">{o.icon}</div>
        {s.seen.includes(o.clue) ? <p>{c.text}</p> : <TactileForm run={run} action="inspect" choice={`${o.clue}|`} prefix={`${o.clue}|`} label="조사 결과 기록"><Task task={o.task} /></TactileForm>}
      </dialog>;
    })}
    <section class="evidence-workbench"><h3>수사 보드 · 연결 {t.links.length}/{def.evidence.length - 1}</h3><p class="hint">같은 이동·시각·정체로 이어지는 증거를 연결하세요. 카드에서 카드로 끌거나 두 카드를 차례로 누르면 돼요.</p>
      <TactileForm run={run} action="connect" choice="" class="evidence-form" label="연결선 기록">
        <div class="evidence-board" data-evidence-board data-links={JSON.stringify(t.links)}><svg class="evidence-lines" aria-hidden="true" />
          {def.clues.filter(c => s.seen.includes(c.id)).map(c => <button type="button" class="evidence-paper" draggable="true" data-evidence={c.id}><b>📌 {c.label}</b><span>{c.text}</span></button>)}
          {!s.seen.length && <p>현장에서 발견한 증거가 여기에 모여요.</p>}
        </div><p class="hint" data-connect-status aria-live="polite">두 증거를 연결해 보세요.</p>
      </TactileForm>
      <h3>{s.content === 'explorer' ? '석문 문양 맞추기' : '사건의 흐름 복원'}</h3><p>수사 보드의 증거를 바탕으로 아래 조각을 실제 순서에 놓으세요.</p>
      <TactileForm run={run} action="reconstruct" choice="" prefix="" label="복원한 흐름 확인" disabled={!def.evidence.every(id => s.seen.includes(id)) || t.links.length !== def.evidence.length - 1}><Arrange pieces={play.path} label="사건 흐름 복원" /></TactileForm>
    </section>
  </div>;
}

export function ExpeditionMap(props: { run: StoryRun }) {
  const { run } = props, s = run.state, map = s.interaction;
  if (!map || map.mode !== 'map') return null;
  const reach = connected(map), r = region(s.content)!;
  return <div class={`expedition-map theme-${r.id}`} data-interaction-key={run.row.id}>
    <p>{r.intro}</p><p class="hint">대원을 고르고 안개 칸에 보내세요. 드러난 길 조각을 돌려 기지와 연결한 뒤 현장을 조사하세요. 마지막 목적지는 다른 현장 5곳을 기록하면 열려요.</p>
    <div class="map-crew" role="group" aria-label="조사 대원">{s.crew.map((c, i) => <button class="crew-token" type="button" data-map-crew={String(i)} aria-pressed={i === 0 ? 'true' : 'false'}><img src={c.art} alt="" /><span>{c.name}</span></button>)}</div>
    <div class="map-layout"><div class="tile-map" role="group" aria-label={`${r.name} 탐험 지도`}>
      {map.cells.map((c, i) => <button type="button" class={`map-tile${c.revealed ? ' revealed' : ' fog'}${reach.has(i) ? ' connected' : ''}${c.surveyed ? ' surveyed' : ''}`} data-map-cell={String(i)} aria-label={`${String.fromCharCode(65 + i % 5)}${1 + Math.floor(i / 5)} ${i === map.camp ? '기지' : c.revealed ? c.event ? storyEvent(c.event)!.title : c.ports.length ? '길 조각' : '막힌 지형' : '미탐색 안개'}${c.surveyed ? ' 조사 완료' : ''}`}>
        <small class="tile-coordinate">{String.fromCharCode(65 + i % 5)}{1 + Math.floor(i / 5)}</small>
        {c.revealed ? <><span class="tile-roads" aria-hidden="true">{cellPorts(c).map(p => <i class={`road port-${p}`} />)}</span><span class="tile-landmark">{i === map.camp ? '⛺' : c.event ? c.surveyed ? '✓' : '✦' : c.ports.length ? '·' : '♣'}</span>
          <span class="tile-party">{map.crewAt.map((n, actor) => n === i ? <img src={s.crew[actor]!.art} alt="" /> : null)}</span></> : <span aria-hidden="true">☁</span>}
      </button>)}
    </div><div class="map-details">
      <p class="hint" data-no-cell>지도에서 조사할 칸을 눌러 주세요.</p>
      {map.cells.map((c, i) => {
        const ev = c.revealed && c.event ? storyEvent(c.event) : null, canScout = reach.has(i) || neighbors(i).some(n => reach.has(n));
        return <section data-tile-detail={String(i)} hidden><h3>{String.fromCharCode(65 + i % 5)}{1 + Math.floor(i / 5)} · {i === map.camp ? '원정 기지' : ev?.title ?? (c.revealed ? '발견한 지형' : '안개 속 지형')}</h3>
          {ev && <><p>{ev.intro}</p><p class="hint">{fillStory(ev.dialogue, s.crew)}</p></>}
          {!c.revealed && <p>이웃한 길이 기지와 이어져 있으면 대원을 보내 지형을 밝힐 수 있어요. 수호자는 막힌 지형에서도 다치지 않아요.</p>}
          {i !== map.camp && <TactileForm run={run} action="scout" choice={`${i}:0`} class="map-scout-form" disabled={!canScout} label={!c.revealed ? '대원을 보내 안개 걷기' : '선택한 대원 조사 배치'} />}
          {c.revealed && i !== map.camp && c.ports.length > 0 && <TactileForm run={run} action="rotate" choice={String(i)} label="길 조각 90° 회전 ↻" />}
          {ev && <TactileForm run={run} action="survey" choice={String(i)} disabled={!reach.has(i) || !map.crewAt.includes(i) || c.surveyed} label={c.surveyed ? '현장 기록 완료 ✓' : '연결된 현장 조사'} />}
          {c.revealed && !reach.has(i) && <p class="hint">기지와 길이 끊겨 있어요. 서로 마주 보는 길의 끝을 맞춰 주세요.</p>}
          {ev && c.surveyed && <p class="hint">이곳의 발견은 수첩에 기록되어 다음 사건에서도 사용할 수 있어요.</p>}
        </section>;
      })}
    </div></div>
    <div class="map-progress">{r.events.map(id => <span class={`tag${s.seen.includes(id) ? ' on' : ''}`}>{s.seen.includes(id) ? '✓' : '○'} {storyEvent(id)!.title}</span>)}</div>
    <TactileForm run={run} action="return" choice="" label="작성한 지도를 챙겨 기지로 귀환" />
    <noscript><p>지도 회전과 대원 배치에는 브라우저의 JavaScript가 필요해요.</p></noscript>
  </div>;
}
