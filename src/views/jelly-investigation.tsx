import type { StoryRun } from '../story-db';
import { EvidenceProp } from './jelly-scene';

function Act(props: { run: StoryRun; choice: string; label: string; disabled?: boolean; children?: any; class?: string }) {
  return <form method="post" action="/api/story/act" class={props.class} data-jelly-action={props.choice}>
    <input type="hidden" name="run" value={props.run.row.id} /><input type="hidden" name="at" value={String(props.run.row.revision)} />
    <input type="hidden" name="action" value="jelly" /><input type="hidden" name="choice" value={props.choice} />
    {props.children}<button class="btn" type="submit" disabled={props.disabled}>{props.label}</button>
  </form>;
}
export function SampleDrawing(props: { flour?: boolean }) {
  return <svg class="sample-drawing" viewBox="0 0 160 90" aria-hidden="true"><ellipse cx="80" cy="46" rx="70" ry="35" fill="#e9e8db" stroke="#829b9d" stroke-width="3" />
    {Array.from({ length: props.flour ? 35 : 12 }, (_, i) => {
      const x = 29 + (i * 29 % 103), y = 25 + (i * 13 % 40);
      return props.flour ? <circle cx={x} cy={y} r="2" fill="#fdf8e8" stroke="#b2aca1" stroke-width=".5" /> : <path d={`M${x} ${y}l9 -4 5 8 -8 6 -7 -5Z`} fill="#f4f9ec" stroke="#8faaa4" stroke-width="1.5" />;
    })}</svg>;
}
export function JellyInventory(props: { run: StoryRun }) {
  const p = props.run.state.interaction;
  if (p?.mode !== 'case' || !p.jelly) return null;
  const j = p.jelly;
  return <div class="jelly-inventory" aria-label="조사 도구와 표본"><b>조사 가방</b>
    {j.sample ? <button type="button" draggable="true" data-sample-source aria-label="창고 가루 표본 끌기">⌕ 창고 가루 표본 {j.matched ? '· 설탕 확인 ✓' : '· 미확인'}</button> : <span>빈 표본병 · 가루를 발견하면 채집할 수 있어요</span>}
    {j.cart && <span class="tag">S-17 수레 확인 ✓</span>}{j.seal && <span class="tag">온전한 봉인 ✓</span>}
  </div>;
}
export function JellyWarehouseScene(props: { run: StoryRun }) {
  const p = props.run.state.interaction;
  if (p?.mode !== 'case' || !p.jelly) return null;
  const j = p.jelly;
  return <>
    <button type="button" class={`movable-crate${j.crate ? ` shifted-${j.crate}` : ''}`} draggable={!j.crate} data-jelly-crate disabled={!!j.crate} aria-label={j.crate ? '옆으로 옮긴 창고 상자' : '바닥을 가린 상자 끌어서 옮기기'}><svg viewBox="0 0 130 105" aria-hidden="true"><rect x="5" y="4" width="120" height="95" fill="#bda57c" stroke="#73786e" stroke-width="5" /><path d="M12 12L118 91M118 12L12 91M5 30H125M5 73H125" stroke="#8d876f" stroke-width="5" /><rect x="38" y="35" width="55" height="34" fill="#efdfb8" /><text x="65" y="57" text-anchor="middle" font-size="15" fill="#737b72">보관함</text></svg></button>
    {j.crate && <><div class="exposed-trail" aria-hidden="true">··★····★····★··<br />··················→</div><div class="warehouse-findings">
      <Act run={props.run} choice="trace" label={props.run.state.seen.includes('trail') ? '바퀴 자국 기록 ✓' : '드러난 바퀴 자국 조사'} disabled={props.run.state.seen.includes('trail')} />
      <Act run={props.run} choice="collect" label={j.sample ? '가루 표본 채집 ✓' : '하얀 가루를 표본병에 채집'} disabled={j.sample} />
    </div></>}
  </>;
}
export function JellyStation(props: { run: StoryRun; room: number }) {
  const s = props.run.state, p = s.interaction;
  if (p?.mode !== 'case' || !p.jelly) return null;
  const j = p.jelly;
  if (props.room === 0) return <section class="jelly-station" data-room-station="0"><h3>가려진 바닥 살펴보기</h3>
    {!j.crate ? <><p>보관함이 바닥을 가리고 있어요. 상자를 왼쪽이나 오른쪽으로 끌어 옮겨 보세요.</p><div class="crate-controls"><Act run={props.run} choice="move:left" label="← 상자를 왼쪽으로 밀기" /><Act run={props.run} choice="move:right" label="상자를 오른쪽으로 밀기 →" /></div><p class="hint">터치·키보드에서는 위 버튼으로도 상자를 움직일 수 있어요.</p></> : <p>상자 밑의 별표 바퀴 자국은 행사 준비실 방향으로 이어져 있어요. 가루를 채집하면 주방의 표본과 비교할 수 있어요.</p>}
  </section>;
  if (props.room === 1) return <section class="jelly-station" data-room-station="1" hidden><h3>주방 표본 비교대</h3>
    {!j.sample ? <p class="workbench-locked">창고에서 가루를 채집해 오면 확대 비교를 시작할 수 있어요. 방은 자유롭게 둘러볼 수 있어요.</p> : <>
      <div class="unknown-sample"><b>창고에서 가져온 가루</b><SampleDrawing /><p>큰 알갱이와 빛이 통하는 면이 보여요.</p></div>
      <p>조사 가방의 표본을 각 접시에 끌어 놓거나, 접시 아래 버튼을 눌러 두 표본을 모두 비교해요.</p>
      <div class="comparison-dishes">{(['sugar', 'flour'] as const).map(id => <div class="standard-dish" data-test-dish={id}><h4>{id === 'sugar' ? '설탕 표본' : '밀가루 표본'}</h4><SampleDrawing flour={id === 'flour'} />
        <Act run={props.run} choice={`test:${id}`} label={j.tested.includes(id) ? '확대 비교 완료 ✓' : '창고 표본을 놓고 확대 비교'} disabled={j.tested.includes(id)} />
        {j.tested.includes(id) && <p>{id === 'sugar' ? '각지고 큰 반투명 결정. 창고 표본과 입자 모양이 같아요.' : '작고 불투명한 알갱이. 창고 표본과 크기·투명도가 달라요.'}</p>}
      </div>)}</div>
      {j.matched ? <p class="investigation-success">설탕과 일치해요. 포포의 적재 메모: 「설탕 봉지와 젤리 · 별표 바퀴 S-17 수레」. 행사 준비실에서 바퀴와 적재표를 대조할 수 있어요.</p> : j.tested.length === 2 ? <div class="match-workbench"><h4>같은 표본 연결하기</h4><div class="piece-tray"><button type="button" draggable="true" data-standard-choice="sugar">설탕 표본</button><button type="button" draggable="true" data-standard-choice="flour">밀가루 표본</button></div><button type="button" class="match-drop" data-match-drop>일치하는 표본을 여기에 놓기</button><Act run={props.run} choice="match:" class="jelly-match-form" label="놓은 표본과 비교 결과 기록" /><p class="hint">접시의 입자 모양·크기·투명도를 보고 연결해요. 표본을 누른 뒤 빈칸을 눌러도 돼요.</p></div> : <p class="hint">설탕과 밀가루 두 접시를 모두 조사하면 표본 연결대가 열려요.</p>}
    </>}
  </section>;
  return <section class="jelly-station" data-room-station="2" hidden><h3>행사 준비실의 수레 대조</h3>
    <p>수레의 바퀴 표식과 적재표를 살펴보세요. 창고 흔적과 표본 비교를 마치면 조사 결과를 대조할 수 있어요.</p>
    <div class="cart-lineup">{[{ id: 'S17', tag: 'S-17', wheel: '★', load: '설탕 봉지 · 젤리 상자' }, { id: 'F04', tag: 'F-04', wheel: '▧', load: '밀가루 포대' }, { id: 'P09', tag: 'P-09', wheel: '○', load: '파티 조명 · 장식' }].map(cart => <article class={`cart-card${j.cart === cart.id ? ' matched-cart' : ''}`}><h4>{cart.tag}</h4><svg viewBox="0 0 170 100" aria-hidden="true"><path d="M15 25H134L123 66H28Z" fill="#9eb6ba" stroke="#627f88" stroke-width="4" /><path d="M128 26L145 8H164" fill="none" stroke="#627f88" stroke-width="4" /><circle cx="43" cy="79" r="14" fill="#edf0dd" stroke="#647e84" stroke-width="3" /><circle cx="110" cy="79" r="14" fill="#edf0dd" stroke="#647e84" stroke-width="3" /><text x="43" y="84" text-anchor="middle" font-size="15" fill="#788b80">{cart.wheel}</text></svg><p>바퀴 표식: {cart.wheel}</p><p>적재표: {cart.load}</p><Act run={props.run} choice={`cart:${cart.id}`} label={j.cart === cart.id ? '흔적과 일치 ✓' : '이 수레를 흔적과 대조'} disabled={!j.matched || !s.seen.includes('trail') || !!j.cart} /></article>)}</div>
    {j.cart && <><h3>S-17 상자의 봉인 확대</h3>{j.seal ? <p class="investigation-success">승인 도장이 끊김 없이 이어져요. 중간에 개봉한 흔적이 없어요.</p> : <Act run={props.run} choice="seal:0" class="jelly-seal-form" label="봉인 인쇄선 대조 기록"><p>봉인의 두 인쇄 조각이 이어지도록 확대판을 움직여 보세요.</p><div class="seal-view" aria-label="승인 도장의 두 인쇄 조각"><span class="seal-half">승<br />★</span><span class="seal-half moving-seal" data-jelly-seal-piece>인<br />17</span></div><label>확대판 위치 <input type="range" min="0" max="6" step="1" value="0" data-jelly-seal /><output data-jelly-seal-output>0</output></label></Act>}
      {j.seal && <><h3>봉인 상자 실물 수량 대조</h3>{j.counted ? <p class="investigation-success">다섯 상자 확인 완료 · 100개 × 5상자 = 500개. 장부의 수량과 대조할 수 있어요.</p> : <Act run={props.run} choice="count::" class="jelly-count-form" label="직접 확인한 상자와 총수량 기록"><p>각 상자를 하나씩 눌러 봉인과 표찰을 확인한 뒤 총수량을 적어 주세요.</p><div class="count-crates">{[1, 2, 3, 4, 5].map(n => <button type="button" data-count-box={`b${n}`} aria-pressed="false"><EvidenceProp clue="single-box" /><b>{n}번 상자</b><span>봉인 정상 · 표찰 100개</span></button>)}</div><p data-count-status aria-live="polite">0/5상자 확인</p><label class="instrument">총 젤리 수량 <input type="text" inputmode="numeric" pattern="[0-9]+" maxlength={4} data-count-total required autocomplete="off" /></label></Act>}</>}
    </>}
  </section>;
}
