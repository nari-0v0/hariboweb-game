import type { StoryRun } from '../story-db';
import { JELLY_RECORDS, MYSTERY_INTRO, MYSTERY_QUESTIONS } from '../jelly-mystery';
import { JellyScenery } from './jelly-scene';

function Fields({ run, action, choice }: { run: StoryRun; action: string; choice: string }) {
  return <><input type="hidden" name="run" value={run.row.id} /><input type="hidden" name="at" value={String(run.row.revision)} /><input type="hidden" name="action" value={action} /><input type="hidden" name="choice" value={choice} /></>;
}
function Pick({ label, options }: { label: string; options: readonly (readonly [string, string])[] }) {
  return <label>{label}<select data-theory-field required aria-label={label}><option value="">고르기</option>{options.map(([id, text]) => <option value={id}>{text}</option>)}</select></label>;
}
export function JellyMystery({ run }: { run: StoryRun }) {
  const s = run.state, records = JELLY_RECORDS.filter(r => s.seen.includes(r.id));
  const evidence = records.map(r => [r.id, `${r.id} · ${r.title}`] as const);
  return <div class="case-workbench mystery-workbench" data-interaction-key={run.row.id} data-investigation-version="4">
    <noscript><p>방을 이동하고 사건 재구성판을 쓰려면 브라우저의 JavaScript를 켜 주세요.</p></noscript>
    <p class="mystery-premise">{MYSTERY_INTRO}</p>
    <div class="mystery-questions"><b>풀어야 할 모순</b><ul><li>21:05 기록보다 20:50 사진이 먼저인 이유는?</li><li>같은 4·5번인데 내용물이 다른 이유는?</li><li>운반을 못 봤다는 증언과 출고 기록은 양립할까?</li></ul></div>
    <p class="hint">조사 순서는 자유예요. 문서의 시각이 무엇을 뜻하는지, 번호가 어느 물건에 붙었는지 구분해 보세요. 기록은 정답 해설이 아니라 각 장소에서 확인한 원문이에요.</p>
    <div class="room-tabs" role="group" aria-label="방 이동">{['📦 창고', '🧁 주방', '🎀 행사 준비실'].map((name, i) => <button class="btn" type="button" data-room-button={i} aria-pressed={i === 0 ? 'true' : 'false'}>{name}</button>)}</div>
    {[0, 1, 2].map(room => <section class="mystery-room" data-room-scene={room} hidden={room !== 0}>
      <div class="search-scene jelly-scene"><JellyScenery room={room} /><img class="scene-helper" src={s.crew[room]?.art ?? s.crew[0]?.art ?? '/char/deco/detective.png'} alt="가상 조사 조력자" /></div>
      <div class="mystery-record-grid">{JELLY_RECORDS.filter(r => r.room === room).map(r => <article class={`mystery-record ${s.seen.includes(r.id) ? 'recorded' : ''}`}><span class="eyebrow">현장 원기록 {r.id}</span><h3>{r.title}</h3>
        {s.seen.includes(r.id) ? <p>{r.body}</p> : <form method="post" action="/api/story/act"><Fields run={run} action="jelly" choice={`read:${r.id}`} /><button class="btn" type="submit">펼쳐서 조사하기</button></form>}
      </article>)}</div>
    </section>)}
    <section class="mystery-notebook"><h3>원기록 수첩 · {records.length}/{JELLY_RECORDS.length}</h3><p>다른 방의 기록도 여기에서 다시 펼칠 수 있어요. 의심이 들면 원문의 범위를 확인하세요.</p>{records.map(r => <details><summary>{r.id} · {r.title}</summary><p>{r.body}</p></details>)}</section>
    <section class="mystery-theory"><h3>사건 재구성판</h3><p>정답 문장을 고르는 대신 실제 이동 세 건과 다섯 가지 모순을 함께 설명해 주세요. 틀린 배치는 모순을 확인하고 수정할 수 있어요. 오답으로 보상이나 조사 기록을 잃지 않아요.</p>
      {s.log.length > 0 && <div class="mystery-feedback" role="status">{s.log.map(line => <p>{line}</p>)}</div>}
      <form method="post" action="/api/story/act" data-mystery-theory><Fields run={run} action="reconstruct" choice="" />
        {['첫 번째 젤리 운반', '두 번째 젤리 운반', '사진에 섞인 소품 운반'].map((name, i) => <fieldset><legend>{name} · 출발지는 창고</legend><div class="theory-row">
          <Pick label={`${i + 1}번 이동 시각`} options={[[ 'c', '20:15' ], [ 'a', '20:30' ], [ 'b', '20:45' ]]} />
          <Pick label={`${i + 1}번 이동 물품`} options={[[ 'y', 'J4·J5 / 젤리 200개' ], [ 'z', 'D4·D5 / 무대 소품' ], [ 'x', 'J1~J3 / 젤리 300개' ]]} />
          <Pick label={`${i + 1}번 이동 도착지`} options={[[ 'k', '주방 건조 보관함' ], [ 'p', '행사 준비실' ]]} />
        </div></fieldset>)}
        {MYSTERY_QUESTIONS.map((q, i) => <fieldset><legend>{q.title}</legend><Pick label={`${i + 1}번 모순의 설명`} options={q.options.map((text, n) => [String(n + 1), text] as const)} /><div class="theory-citations"><Pick label={`${i + 1}번 근거 하나`} options={evidence} /><Pick label={`${i + 1}번 근거 둘`} options={evidence} /></div></fieldset>)}
        <p class="hint">설명마다 직접 확인한 원기록 두 장을 근거로 붙이세요. 근거 순서는 상관없어요. 작성 중인 배치는 이 기기에 보관돼요.</p><button class="btn btn-primary" type="submit">재구성의 모순 검증하기</button>
      </form>
    </section>
  </div>;
}
