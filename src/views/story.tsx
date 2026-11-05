import type { Member } from '../env';
import type { Candidate } from '../expedition-db';
import { roleOf } from '../expedition';
import type { StoryRun } from '../story-db';
import { fillStory, optionReason, STORY_ENDINGS, type StoryState } from '../story';
import { meets, REGIONS, STORY_CASES, region, storyCase, storyEvent, type Mark } from '../story-content';
import { Layout } from './layout';
import { FictionNote } from './expedition';
import { CaseWorkbench, ExpeditionMap } from './tactile';

function Action(props: { run: StoryRun; action: string; choice: string; label: string; disabled?: boolean }) {
  return <form method="post" action="/api/story/act">
    <input type="hidden" name="run" value={props.run.row.id} />
    <input type="hidden" name="at" value={String(props.run.row.revision)} />
    <input type="hidden" name="action" value={props.action} />
    <input type="hidden" name="choice" value={props.choice} />
    <button type="submit" class="btn exp-choice" disabled={props.disabled}>{props.label}</button>
  </form>;
}
const home = (kind: StoryState['kind']) => kind === 'case' ? '/cases/story' : '/expedition/story';
function Play(props: { run: StoryRun }) {
  const { run } = props, s = run.state, c = s.kind === 'case' ? storyCase(s.content) : null;
  const ev = s.kind === 'expedition' ? storyEvent(s.route[s.position] ?? '') : null;
  const title = c?.title ?? region(s.content)?.name;
  return <>
    <section class="panel" id="now">
      <span class="eyebrow">{s.kind === 'case' ? '사건 수첩' : s.version === 2 ? `현장 기록 ${s.seen.length}/6` : `원정 ${Math.min(s.position + 1, s.route.length)}/${s.route.length}`}</span>
      <h2>{title}</h2>
      {s.kind === 'expedition' && <p class="exp-res">❤️ 체력 {s.hp}/8 · {s.version === 1 && `🧰 도구 ${s.tools} · `}⏳ 탐사 {s.time}/{s.version === 2 ? 40 : 10}</p>}
      {s.log.length > 0 && <div class="exp-outcome plain" role="status">{s.log.map(t => <p>{t}</p>)}</div>}
      {s.phase === 'done' ? <>
        <h3>{STORY_ENDINGS[s.ending ?? ''] ?? '이야기 완료'}</h3>
        <p>{run.row.xp > 0 ? `최초 완료 보상: 내 카드 경험치 +${run.row.xp}${run.row.jelly ? `, 도감 젤리 +${run.row.jelly}` : ' (안전 귀환은 젤리 보상 없음)'}` : !s.correct ? '이야기를 덮거나 안전 한계로 귀환해 이번 판 보상은 없어요. 이미 기록한 발견은 남아요.' : '이번 판의 추가 보상은 없어요. 최초 보상을 받았거나 오늘의 보상 한도에 도달했어요. 발견과 분기는 계속 기록돼요.'}</p>
        {run.row.season_id && <p class="hint">완료 시즌: {run.row.season_id} · 발견 기록은 시즌이 바뀌어도 남아요.</p>}
        <a class="btn btn-primary" href={home(s.kind)}>다른 이야기 고르기</a>
      </> : s.phase === 'epilogue' ? <>
        <h3>정령과 어떤 약속을 할까요?</h3>
        <p>이 선택은 다음에 시작하는 원정의 대사에 반영돼요.</p>
        <div class="exp-choices">
          <Action run={run} action="promise" choice="befriend" label="자기 모습으로 친구가 되도록 설득한다" />
          <Action run={run} action="promise" choice="return" label="거울 세계로 돌아가도록 안내한다" />
          <Action run={run} action="promise" choice="release" label="스스로 선택하도록 놓아준다" />
        </div>
      </> : s.version === 2 ? (s.kind === 'case' ? <CaseWorkbench run={run} /> : <ExpeditionMap run={run} />) : c ? <>
        <p>{c.intro}</p>
        <div class="exp-log">{c.dialogue.map(t => <p>{fillStory(t, s.crew)}</p>)}</div>
        <h3>직접 조사하기</h3>
        <p class="hint">조사 순서를 고를 수 있어요. 핵심 증거를 모으면 추리를 확정할 수 있어요. 정답은 증거와 함께 고정되어 있어요.</p>
        <div class="exp-choices">{c.clues.filter(clue => meets(s.marks, clue.need)).map(clue => <Action run={run} action="look" choice={clue.id} label={`${s.seen.includes(clue.id) ? '✓ ' : ''}${clue.label}`} disabled={s.seen.includes(clue.id)} />)}</div>
        <h3>증거 수첩 {s.seen.length}/{c.clues.filter(clue => meets(s.marks, clue.need)).length}</h3>
        {c.clues.filter(clue => s.seen.includes(clue.id)).map(clue => <div class="exp-log"><b>{clue.label}</b><p>{clue.text}</p></div>)}
        <h3>최종 추리</h3>
        {!c.evidence.every(e => s.seen.includes(e)) && <p class="hint">아직 핵심 증거가 부족해요. {c.clues.filter(clue => c.evidence.includes(clue.id) && !s.seen.includes(clue.id)).map(clue => clue.label).join(', ')}을 확인해 주세요.</p>}
        <div class="exp-choices">{c.answers.map((text, n) => <Action run={run} action="answer" choice={String(n)} label={text} disabled={!c.evidence.every(e => s.seen.includes(e))} />)}</div>
      </> : ev ? <>
        <h3>{ev.title}</h3><p>{ev.intro}</p>
        <p class="exp-log">{fillStory(ev.dialogue, s.crew)}</p>
        {ev.id === 'bag' && meets(s.marks, 'shortcut') && <p class="hint">앞서 고른 지름길에 덫이 있었어요. 이번 행동에는 체력 1이 추가로 들어요.</p>}
        {ev.id === 'symbols' && meets(s.marks, 'alarm') && <p class="hint">석상 경보 때문에 이번 행동에 시간 1이 추가로 들어요.</p>}
        {ev.extra && meets(s.marks, ev.extra.need) && ev.id !== 'bag' && <p class="exp-log">{ev.extra.text}</p>}
        {ev.id === 'companion' && meets(s.marks, 'spirit=release') && <p>놓아준 정령이 골목에서 자기 빛으로 손을 흔든다. 「약속대로 내 모습으로 인사하러 왔어!」</p>}
        <div class="exp-choices">{ev.options.map((opt, i) => {
          const why = optionReason(s, opt);
          const costs = [opt.hp ? `체력 ${opt.hp > 0 ? '+' : ''}${opt.hp}` : '', opt.tools ? `도구 ${opt.tools > 0 ? '+' : ''}${opt.tools}` : '', `시간 +${1 + (opt.time ?? 0)}`].filter(Boolean).join(' · ');
          return <Action run={run} action="choose" choice={String(i)} label={`${opt.label} (${costs})${why ? ` — ${why}` : ''}`} disabled={!!why} />;
        })}</div>
      </> : <p>현재 장면을 읽지 못했어요. 이야기를 덮고 다시 시작해 주세요.</p>}
    </section>
    <section class="panel"><h3>{s.kind === 'case' ? '함께 조사하는 조력자' : '함께 떠난 대원'}</h3>
      <div class="crew-row">{s.crew.map(c => <div class="crew"><img src={c.art} alt="" /><b>{c.name}</b><span class="hint">가상 조력자 · {roleOf(c.role).name}</span></div>)}</div>
      <details><summary>선택과 발견 일지</summary><ol class="exp-journal">{s.journal.map(t => <li>{t}</li>)}</ol></details>
      {s.phase !== 'done' && <Action run={run} action="quit" choice="" label="이야기 덮기 (이번 판 보상 없음)" />}
    </section>
  </>;
}
export function StoryPage(props: { viewer: Member; kind: StoryState['kind']; run: StoryRun | null; candidates: Candidate[]; marks: Mark; notice?: string }) {
  const { kind, run } = props;
  const definitions = kind === 'case' ? STORY_CASES.map(c => ({ id: c.id, title: c.title, intro: c.intro, art: '/char/deco/detective.png' })) : REGIONS.map(r => ({ id: r.id, title: r.name, intro: r.intro, art: r.art }));
  return <Layout title={kind === 'case' ? '하리보 사건파일 · 이야기' : '하리보 원정대 · 이야기'} viewer={props.viewer} active={kind === 'case' ? 'cases' : 'expedition'} scripts={['/tactile.js?v=polish-1']}>
    <div class="stack exp story" data-fresh>
      <section class="panel"><span class="eyebrow">함께 남기는 모험 기록</span><h1>{kind === 'case' ? '하리보 사건파일' : '하리보 원정대'}</h1>
        <p>{kind === 'case' ? '방 안을 탐색하고, 증거를 조립하고 연결해 6개 사건의 진실을 밝혀요.' : '안개숲·별빛 유적·달빛 마을의 지도를 직접 복원해요. 대원을 보내 길을 밝히고 18개 현장을 발견하세요.'}</p>
        <FictionNote />
        <p class="hint">이야기별 최초 완료에 경험치 10 · 해결/발견/구조 성공은 도감 젤리 1개도 받아요. 안전 귀환은 경험치만 받아요. 기존 모드와 각각 하루 첫 3판 한도를 공유해요. 한도 이후에는 다음 날 다시 완료해 최초 보상을 받을 수 있어요. 겜블 지갑과는 별개예요.</p>
        <p class="hint">발견은 바로 기록되며 시즌이 지나도 유지돼요. 다른 이야기에서 얻은 기록은 새 판을 시작할 때 반영돼요. 원정은 새 칸 탐사에 시간 1이 들어요. 지도 회전과 대원 재배치는 시간을 쓰지 않아요.</p>
        <div class="end-row"><a class="btn btn-small" href={kind === 'case' ? '/expedition/story' : '/cases/story'}>{kind === 'case' ? '원정대로 이어가기' : '사건파일로 이어가기'}</a><a class="btn btn-small" href={kind === 'case' ? '/cases' : '/expedition'}>기존 무작위 모드</a></div>
        {props.notice && <p role="status">{props.notice === 'stale' ? '이미 반영되었거나 다른 화면에서 진행했어요. 현재 기록을 보여드려요.' : props.notice === 'error' ? '요청 결과를 확인하지 못했어요. 현재 기록을 확인한 뒤 다시 눌러 주세요.' : '입력을 확인해 주세요. 기록은 현재 화면에서 이어갈 수 있어요.'}</p>}
      </section>
      {run ? <Play run={run} /> : <section class="panel"><h2>이야기 고르기</h2><div class="story-grid">{definitions.map(d => <article class="story-card"><img class="story-art" src={d.art} alt="" /><h3>{d.title}</h3><p>{d.intro}</p>
        <form method="post" action="/api/story/start">
          <input type="hidden" name="request" value={crypto.randomUUID()} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="content" value={d.id} />
          <details><summary>조력자 고르기 (최대 3명)</summary><div class="story-picks">{props.candidates.map(c => <label><input type="checkbox" name="m" value={c.id} checked={c.me} /> {c.name} · {roleOf(c.role).name}</label>)}</div><p class="hint">모자라면 견습 대원이 함께해요. 수집한 현재 멤버만 고를 수 있어요. 역할은 기존 원정대의 내 역할에서 바꿀 수 있어요.</p></details>
          <button class="btn btn-primary" type="submit">{kind === 'case' ? '조사 시작' : '원정 시작'}</button>
        </form></article>)}</div></section>}
      {run?.state.phase === 'done' && <a class="btn" href={home(kind)}>이야기 목록</a>}
      <section class="panel"><h2>이어지는 발견 기록</h2><p>발견 {Object.keys(props.marks).length}개 · 서로 다른 선택으로 숨은 장면을 찾아보세요.</p>
        <ul class="exp-journal">{[
          ['rustyKey', '시계 밑 녹슨 열쇠 → 안개숲 말하는 보물상자'], ['oldInvitation', '오래된 초대장 → 달빛 마을 보관소의 잊힌 선물'],
          ['mirrorSolved', '거울 정령의 정체 → 달빛 마을의 재회'], ['starCode', '석문 암호 → 별빛 유적의 문양 힌트'],
          ['sealedLetter', '봉인된 편지 → 실종 탐험가의 진실 조사'], ['fakeMap', '가짜 지도 → 사건파일에서 원본 출처 조사'],
          ['crownHistory', '황금 왕관의 역사'], ['mapTruth', '옛 무대 지도의 진실'], ['starDiscoverer', '별빛의 발견자'],
        ].map(([key, text]) => <li>{props.marks[key!] ? `✓ ${text}` : `미발견 · ${text}`}</li>)}</ul>
      </section>
    </div>
  </Layout>;
}
