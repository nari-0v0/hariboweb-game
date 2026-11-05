import { JellyMystery } from './jelly-mystery';
import type { StoryRun } from '../story-db';
import { CASE_PLAY, FIELD_SKILLS, cellPorts, connected, neighbors, skillReason, type ObjectTask } from '../tactile';
import { meets, region, storyCase, storyEvent } from '../story-content';
import { fillStory } from '../story';
import { JellyScenery, EvidenceProp } from './jelly-scene';
import { roleOf } from '../expedition';
import { JELLY_CASE } from '../jelly-investigation';
import { JellyInventory, JellyStation, JellyWarehouseScene } from './jelly-investigation';

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
function Task(props: { task: ObjectTask; clue: string; jelly: boolean }) {
  const t = props.task;
  const prompts = { inspect: '가까이에서 관찰한 내용을 수첩에 남겨요.', strips: '문장의 내용과 흐름을 살펴 조각을 한 장의 기록으로 복원해요.', clock: '표시창을 관찰하고 예약 시각을 맞춰요.', code: '확대된 표찰에서 확인한 내용을 직접 기록해요.', align: '아래 기록을 움직여 두 흔적이 겹치는 위치를 찾아요.' };
  return <><p>{prompts[t.kind]}</p>
    {props.jelly && props.clue === 'boxes' && <p class="observation">봉인된 상자 다섯 개. 각 상자의 표찰에는 100이라고 적혀 있어요. 총수량을 기록해요.</p>}
    {t.kind === 'clock' && <div class="clock-display" aria-label="예약 표시창 02:13">DAILY <b>02:13</b> RECORD × 3</div>}
    {props.clue === 'serial' && <p class="observation">왕관 안쪽 표찰 · 027-R</p>}
    {t.kind === 'strips' && <Arrange pieces={t.pieces!} label="기록 조립" />}
    {t.kind === 'clock' && <label class="instrument">🕰️ 예약 시각 <input type="time" data-clock value="00:00" required /></label>}
    {t.kind === 'code' && <label class="instrument">확대한 표찰 옮겨 적기 <input type="text" data-code autocomplete="off" maxlength={24} required /></label>}
    {t.kind === 'align' && <div class="align-tool"><div class="wave-guide" style={`transform:translateX(${Number(t.solution) * 12}px)`}>∿　∿　∿　∿</div><div class="wave-moving" data-wave>∿　∿　∿　∿</div><label>기준 눈금 <input type="range" min="0" max="8" step="1" value="0" data-align /><output data-align-output>0</output></label></div>}
    {t.kind !== 'inspect' && <details class="puzzle-hint"><summary>막혔을 때 힌트 보기</summary><p>{t.hint}</p></details>}
  </>;
}
export function CaseWorkbench(props: { run: StoryRun }) {
  if (props.run.state.version === 4) return <JellyMystery run={props.run} />;
  const { run } = props, s = run.state, play = CASE_PLAY[s.content]!, def = s.version === 3 ? JELLY_CASE : storyCase(s.content)!, t = s.interaction;
  if (!t || t.mode !== 'case') return null;
  const ready = def.evidence.every(id => s.seen.includes(id)) && t.links.length === def.evidence.length - 1;
  return <div class="case-workbench" data-interaction-key={run.row.id} data-investigation-version={s.version}>
    <noscript><p>방 이동과 증거 조립에는 브라우저의 JavaScript가 필요해요.</p></noscript>
    <p>{def.intro}</p>
    <ol class="case-milestones" aria-label="수사 진행"><li class={def.evidence.every(id => s.seen.includes(id)) ? 'complete' : 'current'}>현장 증거 {def.evidence.filter(id => s.seen.includes(id)).length}/{def.evidence.length}</li><li class={t.links.length === def.evidence.length - 1 ? 'complete' : ''}>증거 연결 {t.links.length}/{def.evidence.length - 1}</li><li class={ready ? 'current' : ''}>사건 복원</li></ol>
    <details class="witness-notes"><summary>조력자 대화 수첩</summary>{def.dialogue.map(line => <p>{fillStory(line, s.crew)}</p>)}</details>
    <div class="room-tabs" role="group" aria-label="방 이동">{play.rooms.map((r, i) => <button type="button" class="btn" data-room-button={String(i)} aria-pressed={i === 0 ? 'true' : 'false'}>{r.icon} {r.name}</button>)}</div>
    {s.version === 3 && <JellyInventory run={run} />}
    <button class="btn btn-small" type="button" data-aid-toggle aria-pressed="false">조사 위치 도움 켜기</button>
    {play.rooms.map((r, i) => <div class={`search-scene room-${i}${s.content === 'jelly500' ? ' jelly-scene' : ''}`} data-room-scene={String(i)} hidden={i !== 0} style={`--room-color:${r.color}`} aria-label={`${r.name} 조사 장면`}>
      {s.content === 'jelly500' ? <JellyScenery room={i} /> : <><div class="scene-window" aria-hidden="true" /><div class="scene-shelf" aria-hidden="true" /><div class="scene-desk" aria-hidden="true" /></>}<span class="scene-name">{r.name}</span>
      <img class="scene-helper" src={s.crew[0]?.art ?? '/char/deco/detective.png'} alt="조사 중인 조력자" />
      {s.version === 3 && i === 0 && <JellyWarehouseScene run={run} />}
      {play.objects.filter(o => o.room === i && (s.version !== 3 || ['receipt', 'promise'].includes(o.clue))).map(o => {
        const c = def.clues.find(c => c.id === o.clue)!, seen = s.seen.includes(o.clue), available = meets(s.marks, c.need);
        return <button class={`hotspot${seen ? ' found' : ''}${s.content === 'jelly500' ? ' physical-prop' : ''}`} type="button" data-open-object={o.clue} style={`left:${o.x}%;top:${o.y}%`} disabled={!available} aria-label={`${c.label}${seen ? ' (기록함)' : !available ? ' (기록 필요)' : ' 확대'}`}>{s.content === 'jelly500' ? <EvidenceProp clue={o.clue} /> : <span>{o.icon}</span>}<small>{seen ? '✓ 기록함' : available ? '조사' : '잠김'}</small></button>;
      })}
    </div>)}
    {s.version === 3 && play.rooms.map((_, i) => <JellyStation run={run} room={i} />)}
    <p class="hint">방 안의 물건을 눌러 확대하세요. 작은 열쇠나 바닥 흔적도 놓치지 마세요.</p>
    {play.objects.filter(o => s.version !== 3 || ['receipt', 'promise'].includes(o.clue)).map(o => {
      const c = def.clues.find(c => c.id === o.clue)!;
      return <dialog class="object-dialog" data-object-dialog={o.clue} aria-label={c.label}>
        <button class="btn dialog-close" type="button" data-close-dialog>닫기 ×</button><h3>{c.label}</h3><div class="object-zoom" aria-hidden="true">{s.content === 'jelly500' ? <EvidenceProp clue={o.clue} /> : o.icon}</div>
        {s.seen.includes(o.clue) ? <p>{c.text}</p> : <TactileForm run={run} action="inspect" choice={`${o.clue}|`} prefix={`${o.clue}|`} label="조사 결과 기록"><Task task={o.task} clue={o.clue} jelly={s.content === 'jelly500'} /></TactileForm>}
      </dialog>;
    })}
    <section class="evidence-workbench"><h3>수사 보드 · 연결 {t.links.length}/{def.evidence.length - 1}</h3><p class="hint">같은 이동·시각·정체로 이어지는 증거를 연결하세요. 카드에서 카드로 끌거나 두 카드를 차례로 누르면 돼요.</p>
      <TactileForm run={run} action="connect" choice="" class="evidence-form" label="연결선 기록">
        <div class="evidence-board" data-evidence-board data-links={JSON.stringify(t.links)}><svg class="evidence-lines" aria-hidden="true" />
          {def.clues.filter(c => s.seen.includes(c.id) && (s.version !== 3 || def.evidence.includes(c.id))).map(c => <button type="button" class="evidence-paper" draggable="true" data-evidence={c.id}><b>📌 {c.label}</b><span>{c.text}</span></button>)}
          {!s.seen.length && <p>현장에서 발견한 증거가 여기에 모여요.</p>}
        </div><p class="hint" data-connect-status aria-live="polite">두 증거를 연결해 보세요.</p>
      </TactileForm>
      <h3>{s.content === 'explorer' ? '석문 문양 맞추기' : '사건의 흐름 복원'}</h3><p>수사 보드의 증거를 바탕으로 아래 조각을 실제 순서에 놓으세요.</p>
      {ready ? <TactileForm run={run} action="reconstruct" choice="" prefix="" label="복원한 흐름 확인"><Arrange pieces={play.path} label="사건 흐름 복원" /></TactileForm> : <div class="workbench-locked">먼저 현장 증거를 모으고 수사 보드의 연결을 완성해요. 그다음 복원 조각이 열려요.</div>}
    </section>
  </div>;
}

export function ExpeditionMap(props: { run: StoryRun }) {
  const { run } = props, s = run.state, map = s.interaction;
  if (!map || map.mode !== 'map') return null;
  const reach = connected(map), r = region(s.content)!;
  return <div class={`expedition-map theme-${r.id}`} data-interaction-key={run.row.id}>
    <p>{r.intro}</p><p class="hint">대원을 고르고 안개 칸에 보내세요. 드러난 길 조각을 돌려 기지와 연결한 뒤 현장을 조사하세요. 마지막 목적지는 다른 현장 5곳을 기록하면 열려요.</p>
    <div class="map-crew" role="group" aria-label="조사 대원">{s.crew.map((c, i) => <button class="crew-token" type="button" data-map-crew={String(i)} aria-pressed={i === 0 ? 'true' : 'false'}><img src={c.art} alt="" /><span>{c.name}</span><small>{roleOf(c.role).name}</small></button>)}</div>
    <p class="crew-skill-description" data-crew-skill-info data-role-descriptions={JSON.stringify(s.crew.map(c => `${roleOf(c.role).name} · ${FIELD_SKILLS[c.role].text}${c.role === 'guard' ? '' : ' 특기는 역할마다 원정 중 한 번 사용할 수 있어요.'}`))}>{FIELD_SKILLS[s.crew[0]!.role].text}</p>
    <div class="map-layout"><div class="tile-map" role="group" aria-label={`${r.name} 탐험 지도`}>
      {map.cells.map((c, i) => <button type="button" class={`map-tile${c.revealed ? ' revealed' : ' fog'}${reach.has(i) ? ' connected' : ''}${c.surveyed ? ' surveyed' : ''}`} data-map-cell={String(i)} aria-label={`${String.fromCharCode(65 + i % 5)}${1 + Math.floor(i / 5)} ${i === map.camp ? '기지' : c.revealed ? c.event ? storyEvent(c.event)!.title : c.ports.length ? '길 조각' : '막힌 지형' : '미탐색 안개'}${c.surveyed ? ' 조사 완료' : ''}`}>
        <small class="tile-coordinate">{String.fromCharCode(65 + i % 5)}{1 + Math.floor(i / 5)}</small>
        {c.traced && <span class="tile-compass" style={`transform:rotate(${c.rotation * 90}deg)`} aria-label="원형 탁본 북쪽">↑</span>}
        {c.revealed ? <><span class="tile-roads" aria-hidden="true">{cellPorts(c).map(p => <i class={`road port-${p}`} />)}</span><span class="tile-landmark">{i === map.camp ? '⛺' : c.event ? c.surveyed ? '✓' : '✦' : c.ports.length ? '·' : '♣'}</span>
          <span class="tile-party">{map.crewAt.map((n, actor) => n === i ? <img src={s.crew[actor]!.art} alt="" /> : null)}</span></> : <span aria-hidden="true">☁</span>}
        {!c.revealed && c.peeked && <small class="terrain-peek">{c.ports.length ? '발자국' : '수풀'}</small>}
      </button>)}
    </div><div class="map-details">
      <p class="hint" data-no-cell>지도에서 조사할 칸을 눌러 주세요.</p>
      {map.cells.map((c, i) => {
        const ev = c.revealed && c.event ? storyEvent(c.event) : null, canScout = reach.has(i) || neighbors(i).some(n => reach.has(n));
        return <section data-tile-detail={String(i)} hidden><h3>{String.fromCharCode(65 + i % 5)}{1 + Math.floor(i / 5)} · {i === map.camp ? '원정 기지' : ev?.title ?? (c.revealed ? '발견한 지형' : '안개 속 지형')}</h3>
          {ev && <><p>{ev.intro}</p><p class="hint">{fillStory(ev.dialogue, s.crew)}</p></>}
          {!c.revealed && <p>이웃한 길이 기지와 이어져 있으면 대원을 보내 지형을 밝힐 수 있어요. 수호자는 막힌 지형에서도 다치지 않아요.</p>}
          {i !== map.camp && <TactileForm run={run} action="scout" choice={`${i}:0`} class="map-scout-form" disabled={!canScout} label={!c.revealed ? '대원을 보내 안개 걷기' : '선택한 대원 조사 배치'} />}
          <div data-skill-options={JSON.stringify(s.crew.map((who, actor) => ({ label: FIELD_SKILLS[who.role].label, why: skillReason(s, i, actor) })))}><TactileForm run={run} action="skill" choice={`${i}:0`} class="map-skill-form" disabled={!!skillReason(s, i, 0)} label={FIELD_SKILLS[s.crew[0]!.role].label} /><p class="hint" data-skill-reason>{skillReason(s, i, 0)}</p></div>
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
