import type { Crew } from './expedition';
import { meets, region, storyCase, storyEvent, type Mark, type StoryOption } from './story-content';
import { advanceTactile, newMap, type TactileState } from './tactile';
import { newJellyInvestigation } from './jelly-investigation';

export type StoryState = {
  version: 1 | 2 | 3; kind: 'case' | 'expedition'; content: string; crew: Crew[]; marks: Mark;
  interaction?: TactileState;
  seen: string[]; route: string[]; position: number; hp: number; tools: number; time: number;
  phase: 'play' | 'epilogue' | 'done'; ending: string | null; correct: boolean;
  log: string[]; journal: string[];
};
export type StoryAction = { action: 'look' | 'answer' | 'promise' | 'choose' | 'quit' | 'inspect' | 'connect' | 'reconstruct' | 'scout' | 'rotate' | 'survey' | 'return' | 'skill' | 'jelly'; choice: string };
export function startStory(kind: StoryState['kind'], content: string, crew: Crew[], marks: Mark): StoryState {
  const s = startLegacyStory(kind, content, crew, marks);
  s.version = 2;
  s.interaction = kind === 'case' ? { mode: 'case', links: [] } : newMap(content);
  if (kind === 'case' && content === 'jelly500' && s.interaction.mode === 'case') { s.version = 3; s.interaction.jelly = newJellyInvestigation(); }
  return s;
}
export function startLegacyStory(kind: StoryState['kind'], content: string, crew: Crew[], marks: Mark): StoryState {
  const def = kind === 'case' ? storyCase(content) : region(content);
  if (!def) throw new Error('bad_content');
  return {
    version: 1, kind, content, crew, marks: Object.fromEntries(Object.entries(marks).filter(([key]) => !['shortcut', 'alarm', 'borrowedBag', 'spiritHelp', 'treasureLocked'].includes(key))), seen: [],
    route: kind === 'expedition' ? [...region(content)!.events] : [], position: 0,
    hp: 8, tools: 5, time: 0, phase: 'play', ending: null, correct: false,
    log: [], journal: [],
  };
}
export function fillStory(text: string, crew: Crew[]): string {
  return text.replaceAll('{a}', crew[0]?.name ?? '탐색 조력자').replaceAll('{b}', crew[1]?.name ?? '기록 조력자').replaceAll('{c}', crew[2]?.name ?? '안전 조력자');
}
export function optionReason(s: StoryState, opt: StoryOption): string | null {
  if (!meets(s.marks, opt.need)) return '발견 기록이 필요해요';
  if (opt.role && !s.crew.some(c => c.role === opt.role)) return '해당 역할의 대원이 필요해요';
  if (s.tools + (opt.tools ?? 0) < 0) return '도구가 모자라요';
  if (s.hp + (opt.hp ?? 0) <= 0 && (opt.hp ?? 0) < 0) return '체력이 모자라요';
  if (s.route[s.position] === 'stargate' && opt.end === 'hidden' && !meets(s.marks, 'spiritHelp') && !meets(s.marks, 'rescueRope')) return '정령의 도움 또는 구조 밧줄이 필요해요';
  return null;
}

// 순수 상태 전이. 실패한 입력은 원본을 절대로 바꾸지 않습니다.
export function advanceStory(old: StoryState, a: StoryAction): { state: StoryState; grants: Mark } | null {
  if (old.version >= 2) return advanceTactile(old, a);
  if (old.phase === 'done') return null;
  const s = structuredClone(old);
  const grants: Mark = {};
  const grant = (m?: Mark) => { Object.assign(grants, m); Object.assign(s.marks, m); };
  const done = (ending: string, correct = true) => { s.phase = 'done'; s.ending = ending; s.correct = correct; };
  s.log = [];
  if (a.action === 'quit') {
    done('quit', false); s.log.push('이야기를 덮었다. 이미 기록한 발견은 남고 이번 판 보상은 없다.');
  } else if (s.kind === 'case') {
    const def = storyCase(s.content);
    if (!def) return null;
    if (a.action === 'look' && s.phase === 'play') {
      const c = def.clues.find(c => c.id === a.choice);
      if (!c || s.seen.includes(c.id) || !meets(s.marks, c.need)) return null;
      if (def.id === 'crown027' && s.seen.length === 0 && c.id === 'serial') grant({ crownFirst: '1' });
      s.seen.push(c.id); s.log.push(c.text); grant(c.grant);
    } else if (a.action === 'answer' && s.phase === 'play') {
      if (!/^[0-9]+$/.test(a.choice)) return null;
      const n = Number(a.choice);
      if (!def.answers[n] || !def.evidence.every(e => s.seen.includes(e))) return null;
      if (n !== def.correct) {
        // 틀린 추리는 근거를 다시 읽고 같은 판에서 수정할 수 있어요. 아직 보상을 주지 않아요.
        s.log.push('이 판단은 모은 증거와 맞지 않아요. 증거 수첩을 대조한 뒤 다시 추리해 보세요.');
      } else {
        s.log.push(def.ending);
        if (def.extra && meets(s.marks, def.extra.need)) s.log.push(def.extra.text);
        grant(def.grant);
        if (def.id === 'mirror') s.phase = 'epilogue';
        else done('solved');
      }
    } else if (a.action === 'promise' && s.phase === 'epilogue') {
      if (!['return', 'befriend', 'release'].includes(a.choice)) return null;
      grant({ spirit: a.choice });
      s.log.push(a.choice === 'return' ? '정령과 거울 세계로 돌아가기로 약속했다. 다음에는 통신 거울로 인사하기로 했다.' : a.choice === 'befriend' ? '정령을 설득했다. 자기 모습으로 친구가 되기로 약속했다. 달빛 마을에서 다시 만날 수 있다.' : '정령을 놓아주었다. 「다음에는 내 모습으로 인사할게!」 골목에 남은 반짝이는 발자국을 기록했다.');
      done('solved');
    } else return null;
  } else {
    if (a.action !== 'choose' || s.phase !== 'play' || !/^[0-9]+$/.test(a.choice)) return null;
    const ev = storyEvent(s.route[s.position] ?? '');
    const opt = ev?.options[Number(a.choice)];
    if (!ev || !opt || optionReason(s, opt)) return null;
    // 앞 선택의 위험은 다음 이벤트에서 실제 자원 결과로 이어져요.
    if (ev.id === 'bag' && meets(s.marks, 'shortcut')) { s.hp -= 1; s.log.push('지름길의 덫에 걸려 체력 1이 줄었다.'); }
    if (ev.id === 'symbols' && meets(s.marks, 'alarm')) { s.time += 1; s.log.push('석상 경보를 피해 우회하느라 시간이 1 더 들었다.'); }
    if (ev.id === 'signal' && meets(s.marks, 'borrowedBag')) s.log.push('별콩: 루미의 가방이네! 도구를 쓴 이유를 듣고 고맙다며 가방을 맡아 주었다.');
    if (ev.extra && meets(s.marks, ev.extra.need) && ev.id !== 'bag') s.log.push(ev.extra.text);
    s.hp = Math.min(8, s.hp + (opt.hp ?? 0)); s.tools += opt.tools ?? 0;
    s.time += 1 + (opt.time ?? 0);
    s.log.push(opt.text); grant(opt.grant);
    if (s.hp <= 0 || s.time >= 10) {
      // 바로 이 선택으로 이룬 구조/해금은 유지되지만, 무리한 원정 보상은 지급하지 않아요.
      s.log.push('안전 한계에 도달했다. 대원들과 귀환하며 지금까지의 발견 기록은 남겼다.'); done('escape', false);
    } else if (ev.id === 'stargate' && Number(a.choice) === 3) {
      if (meets(s.marks, 'timeShard') && meets(s.marks, 'rescueRope')) {
        grant({ nextDestination: '1' });
        s.log.push('시간의 파편과 밧줄로 숨겨진 귀환 장치를 고정했다. 새로운 목적지가 열렸다.'); done('hidden');
      } else {
        // 단순 조사만으로 조건부 발견을 주지 않아요.
        s.log = ['문 주변을 조사했지만 귀환 장치를 고정할 준비가 부족하다. 발견 기록을 챙겨 안전하게 돌아왔다.']; done('return');
      }
    } else if (opt.end) done(opt.end);
    else {
      s.position += 1;
      if (opt.next) s.route[s.position] = opt.next;
      if (s.position >= s.route.length) done('return');
    }
  }
  s.log = s.log.map(t => fillStory(t, s.crew));
  s.journal.push(...s.log);
  return { state: s, grants };
}

export const STORY_ENDINGS: Record<string, string> = { solved: '사건 해결', rescue: '구조 작전 성공', discovery: '유적의 발견', hidden: '숨겨진 길', return: '안전 귀환', escape: '위험한 탈출', quit: '이야기 덮기' };
