import type { StoryAction, StoryState } from './story';
import { meets, region, storyCase, storyEvent, type Mark } from './story-content';

export type ObjectTask = { kind: 'inspect' | 'strips' | 'clock' | 'code' | 'align'; hint: string; pieces?: { id: string; text: string }[]; solution: string };
export type CaseRoom = { name: string; icon: string; color: string };
type CasePlay = { rooms: CaseRoom[]; objects: { clue: string; room: number; icon: string; x: number; y: number; task: ObjectTask }[]; path: { id: string; text: string }[] };
const plain: ObjectTask = { kind: 'inspect', hint: '물건을 확대해 살핀 뒤 수첩에 옮기세요.', solution: '' };
const room = (name: string, icon: string, color: string): CaseRoom => ({ name, icon, color });
export const CASE_PLAY: Record<string, CasePlay> = {
  jelly500: {
    rooms: [room('창고', '📦', '#b9d9d3'), room('주방', '🧁', '#eddbbd'), room('행사 준비실', '🎀', '#d3c9e5')],
    objects: [
      { clue: 'powder', room: 0, icon: '✧', x: 25, y: 76, task: plain },
      { clue: 'receipt', room: 0, icon: '📜', x: 72, y: 48, task: { kind: 'strips', hint: '찢어진 운반 장부를 위에서 아래로 복원하세요. 시각 → 담당 → 물품 → 목적지 순서입니다.', pieces: [{ id: 'time', text: '21:05 · 운반 시작' }, { id: 'porter', text: '담당: 행사 요정 포포' }, { id: 'amount', text: '물품: 젤리 500개' }, { id: 'destination', text: '행사 준비실 · 승인 완료' }], solution: 'time,porter,amount,destination' } },
      { clue: 'boxes', room: 2, icon: '🍬', x: 45, y: 62, task: { kind: 'code', hint: '상자의 표찰을 확대해 수량을 확인하세요. 봉인 5상자 × 상자마다 100개. 총수량을 적으세요.', solution: '500' } },
      { clue: 'promise', room: 1, icon: '🎀', x: 67, y: 60, task: plain },
    ], path: [{ id: 'warehouse', text: '창고' }, { id: 'cart', text: '승인된 수레 이동' }, { id: 'party', text: '행사 준비실' }],
  },
  bell0213: {
    rooms: [room('회관 입구', '🚪', '#b8c8df'), room('시계실', '🕰️', '#c2b9d9')],
    objects: [
      { clue: 'sound', room: 0, icon: '〰', x: 28, y: 60, task: { kind: 'align', hint: '두 녹음 파형이 겹치도록 아래 파형을 이동하세요. 첫 종의 기준 눈금은 3입니다.', solution: '3' } },
      { clue: 'alarm', room: 1, icon: '🕰️', x: 54, y: 38, task: { kind: 'clock', hint: '예약 표시창의 「새벽 2시 13분」에 시계 바늘을 맞춰 녹음 재생 설정을 확인하세요.', solution: '02:13' } },
      { clue: 'entry', room: 0, icon: '📹', x: 75, y: 28, task: plain },
      { clue: 'key', room: 1, icon: '🗝️', x: 55, y: 82, task: plain },
    ], path: [{ id: 'timer', text: '예약 알람' }, { id: '0213', text: '02:13 자동 작동' }, { id: 'recording', text: '같은 녹음 세 번' }],
  },
  crown027: {
    rooms: [room('왕관 전시실', '👑', '#d9d1a9'), room('수리 공방', '🔧', '#b8d1dc')],
    objects: [
      { clue: 'serial', room: 0, icon: '👑', x: 49, y: 49, task: { kind: 'code', hint: '왕관 안쪽 확대 표찰: 「전시 대체품 · 027-R」. 일련번호를 정확히 옮기세요.', solution: '027-R' } },
      { clue: 'ledger', room: 0, icon: '📖', x: 78, y: 73, task: plain },
      { clue: 'workshop', room: 1, icon: '🔧', x: 37, y: 65, task: plain },
      { clue: 'history', room: 1, icon: '⭐', x: 73, y: 32, task: plain },
    ], path: [{ id: 'original', text: '진품 027 접수' }, { id: 'repair', text: '공방에서 수리' }, { id: 'replica', text: '027-R 대체 전시' }],
  },
  invitations: {
    rooms: [room('북쪽 탑', '🏰', '#b9cce0'), room('남쪽 탑', '🎉', '#d5c6dd')],
    objects: [
      { clue: 'north', room: 0, icon: '✉️', x: 32, y: 63, task: plain },
      { clue: 'south', room: 1, icon: '💌', x: 68, y: 50, task: plain },
      { clue: 'revision', room: 1, icon: '📋', x: 30, y: 32, task: { kind: 'strips', hint: '행사 이력 카드를 이른 시각부터 시간순으로 배치하세요.', pieces: [{ id: 'old', text: '18:00 북쪽 초대장 저장' }, { id: 'change', text: '18:30 남쪽 탑으로 변경' }, { id: 'new', text: '19:00 남쪽 초대장 발급' }], solution: 'old,change,new' } },
      { clue: 'gift', room: 0, icon: '🎁', x: 73, y: 75, task: plain },
    ], path: [{ id: 'north', text: '18:00 북쪽 원본' }, { id: 'revision', text: '18:30 장소 변경' }, { id: 'south', text: '19:00 남쪽 새 초대장' }],
  },
  mirror: {
    rooms: [room('마스코트 공방', '🎭', '#d6c7df'), room('거울방', '🪞', '#b5cbda')],
    objects: [
      { clue: 'identity', room: 0, icon: '🪪', x: 26, y: 55, task: plain },
      { clue: 'memory', room: 0, icon: '☕', x: 70, y: 73, task: plain },
      { clue: 'reflection', room: 1, icon: '🪞', x: 50, y: 45, task: { kind: 'align', hint: '거울의 두 기준선을 5번 눈금에서 겹쳐 보세요. A는 그대로 비치고 B에는 보라색 연기만 남습니다.', solution: '5' } },
    ], path: [{ id: 'memory', text: '공방 기억 대조' }, { id: 'mirror', text: '거울 반사 비교' }, { id: 'spirit', text: 'B의 보라색 정령 문양' }],
  },
  explorer: {
    rooms: [room('숲의 분실물 자리', '🎒', '#b4d0c3'), room('북쪽 석문', '🗿', '#b5bfd8')],
    objects: [
      { clue: 'note', room: 0, icon: '📝', x: 33, y: 67, task: plain },
      { clue: 'tracks', room: 0, icon: '👣', x: 74, y: 82, task: plain },
      { clue: 'door', room: 1, icon: '▣', x: 50, y: 43, task: { kind: 'strips', hint: '석문 기준 배열은 △ ○ □. 「두 번째, 세 번째, 첫 번째」 순서로 문양을 끌어 넣으세요.', pieces: [{ id: 'triangle', text: '△' }, { id: 'circle', text: '○' }, { id: 'square', text: '□' }], solution: 'circle,square,triangle' } },
      { clue: 'letter', room: 0, icon: '✉️', x: 54, y: 33, task: plain },
      { clue: 'map', room: 1, icon: '🗺️', x: 77, y: 72, task: plain },
    ], path: [{ id: 'circle', text: '○' }, { id: 'square', text: '□' }, { id: 'triangle', text: '△' }],
  },
};

export type MapCell = { ports: number[]; rotation: number; revealed: boolean; event: string | null; surveyed: boolean };
export type TactileState = { mode: 'case'; links: string[] } | { mode: 'map'; cells: MapCell[]; crewAt: number[]; camp: number };
const NEIGHBORS = [[-5, 0, 2], [1, 1, 3], [5, 2, 0], [-1, 3, 1]] as const;
export function neighbors(i: number): number[] { return NEIGHBORS.filter(([d]) => i + d >= 0 && i + d < 25 && (Math.abs(d) !== 1 || Math.floor(i / 5) === Math.floor((i + d) / 5))).map(([d]) => i + d); }
export const cellPorts = (c: MapCell) => c.ports.map(p => (p + c.rotation) % 4);
export function connected(map: Extract<TactileState, { mode: 'map' }>): Set<number> {
  const found = new Set<number>([map.camp]), queue = [map.camp];
  while (queue.length) {
    const i = queue.shift()!, from = map.cells[i]!;
    for (const [d, port, reverse] of NEIGHBORS) {
      const j = i + d, to = map.cells[j];
      if (!neighbors(i).includes(j) || !to?.revealed || found.has(j)) continue;
      if (cellPorts(from).includes(port) && cellPorts(to).includes(reverse)) { found.add(j); queue.push(j); }
    }
  }
  return found;
}
export function newMap(content: string): Extract<TactileState, { mode: 'map' }> {
  const paths = content === 'ruins'
    ? [[20, 21, 16, 11, 6, 7, 2], [20, 15, 10, 11], [6, 5, 0, 1, 2], [11, 12, 13, 18, 23]]
    : content === 'village'
      ? [[20, 15, 16, 17, 12, 13, 14], [20, 21, 22, 17], [12, 7, 8, 13], [12, 11, 6, 1]]
      : [[20, 15, 10, 11, 12, 7, 2], [20, 21, 22, 17, 12], [10, 5, 6, 7], [12, 13, 14, 19, 24]];
  const cells: MapCell[] = Array.from({ length: 25 }, () => ({ ports: [], rotation: 0, revealed: false, event: null, surveyed: false }));
  for (const path of paths) for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!, b = path[k]!, port = b === a - 5 ? 0 : b === a + 1 ? 1 : b === a + 5 ? 2 : 3;
    if (!cells[a]!.ports.includes(port)) cells[a]!.ports.push(port);
    if (!cells[b]!.ports.includes((port + 2) % 4)) cells[b]!.ports.push((port + 2) % 4);
  }
  const ids = region(content)!.events;
  paths[0]!.slice(1).forEach((n, k) => { cells[n]!.event = ids[k]!; });
  cells.forEach((c, i) => { c.rotation = i === 20 ? 0 : (i + (content === 'mist' ? 1 : content === 'ruins' ? 2 : 3)) % 4; });
  cells[20]!.revealed = true;
  return { mode: 'map', cells, crewAt: [20, 20, 20], camp: 20 };
}
const EVENT_MARKS: Record<string, Mark> = {
  fork: { fairySong: '1' }, bag: { explorerTrail: '1' }, chest: { glyph: '1', chestFriend: '1' }, mushroom: { cave: '1' }, merchant: { lantern: '1' }, signal: { rescued: '1' },
  door: { glyph: '1' }, footprints: { mapFragment: '1' }, guardian: { archive: '1' }, symbols: { starCrystal: '1' }, hourglass: { timeShard: '1' }, letter: { sealedLetter: '1' },
  guards: { villagePass: '1' }, map: { fakeMap: '1' }, bottle: { spiritHelp: '1', mirrorLore: '1' }, warehouse: { merchantFavor: '1', rescueRope: '1' }, companion: { illusionKnown: '1' }, stargate: { nextDestination: '1' },
};
const EVENT_RESULTS: Record<string, string> = {
  fork: '길을 연결하자 요정이 노래로 북쪽 방향을 알려 주었다. 세 갈래 길을 지도에 옮겼다.',
  bag: '가방의 일지를 지도 위 발자국과 대조했다. 「북쪽 관측소, 신호는 세 번」. 루미의 흔적을 기록했다.',
  chest: '상자의 이름표를 닦았다. 「내 이름은 보보! 이름을 읽어 줘서 고마워.」 안쪽의 별 문양을 옮겨 적었다.',
  mushroom: '작은 길을 연결해 버섯 옆을 안전하게 지났다. 버섯이 동굴의 위치를 지도에 찍어 주었다.',
  merchant: '끊긴 길을 이어 상인의 수레를 도왔다. 상인은 랜턴을 빌려주며 구조 신호 위치를 짚었다.',
  signal: '세 번의 휘파람이 지도 끝과 일치했다. 연결한 귀환로로 별콩을 구조했다. 루미는 유적 관측소에 있다는 소식을 얻었다.',
  door: '석문의 홈을 탁본했다. 기준 배열 △ ○ □와 「둘째, 셋째, 첫째」를 지도 여백에 기록했다.',
  footprints: '미로의 실제 연결을 지도에서 확인했다. 반복되는 발자국 대신 연결된 길로 방에 들어가 지도 조각을 찾았다.',
  guardian: '유적을 훼손하지 않고 연결한 탐사 지도를 석상에 보여 주었다. 석상이 기록실의 봉인을 풀었다.',
  symbols: '기준 배열 △ ○ □에서 2→3→1, 즉 ○→□→△를 탁본에 대조했다. 문이 열리며 별빛 결정이 드러났다.',
  hourglass: '거꾸로 흐르는 모래를 기록했다. 시간의 파편을 발견하고 현재 지도에 위치를 남겼다.',
  letter: '연결한 관측소 귀환로 옆에서 봉인된 편지를 읽었다. 루미의 행적을 사건파일에서 다시 조사할 수 있다.',
  guards: '완성한 입구 지도를 경비 인형에게 보여 주고 정식 통행증을 받았다.',
  map: '길을 직접 연결해 보니 판매 지도에 있는 강은 실제로 존재하지 않았다. 오류를 지도에 표시했다.',
  bottle: '유리병을 안전하게 열었다. 정령이 자기 빛으로 나타나 마지막 문까지 동행하기로 약속했다.',
  warehouse: '연결된 두 귀환로를 확보하고 주민들과 상인을 구조했다. 구조 밧줄을 챙겼다.',
  companion: '지도와 원정 기록을 펼치자 낯선 여행자의 기억과 맞지 않았다. 거울 정령이 환영을 거두고 자기 빛으로 인사했다.',
  stargate: '모든 현장 기록과 귀환로를 지도에 완성했다. 별빛의 문 너머에서 관측소의 새 목적지를 기록했다.',
};

export function advanceTactile(old: StoryState, a: StoryAction): { state: StoryState; grants: Mark } | null {
  if (!old.interaction || old.phase === 'done') return null;
  const s = structuredClone(old), t = s.interaction!, grants: Mark = {};
  const grant = (m?: Mark) => { Object.assign(s.marks, m); Object.assign(grants, m); };
  const done = (ending: string, correct = true) => { s.phase = 'done'; s.ending = ending; s.correct = correct; };
  s.log = [];
  if (a.action === 'quit' || (a.action === 'return' && t.mode === 'map')) {
    done(a.action === 'quit' ? 'quit' : 'return', a.action !== 'quit'); s.log.push('작성한 지도와 발견 기록을 챙겨 기지로 돌아왔다.');
  } else if (t.mode === 'case') {
    const def = storyCase(s.content)!, play = CASE_PLAY[s.content]!;
    if (a.action === 'inspect' && s.phase === 'play') {
      const [id, payload = ''] = a.choice.split('|'), obj = play.objects.find(o => o.clue === id), clue = def.clues.find(c => c.id === id);
      if (!obj || !clue || s.seen.includes(id!) || !meets(s.marks, clue.need)) return null;
      if (payload.trim().toUpperCase() !== obj.task.solution.toUpperCase()) { s.log.push('복원한 내용이 물건의 기록과 맞지 않아요. 확대 화면의 기준을 다시 살펴보세요.'); }
      else {
        if (def.id === 'crown027' && s.seen.length === 0 && id === 'serial') grant({ crownFirst: '1' });
        s.seen.push(id!); grant(clue.grant); s.log.push(clue.text);
      }
    } else if (a.action === 'connect' && s.phase === 'play') {
      const pair = a.choice.split('>');
      if (pair.length !== 2 || pair[0] === pair[1] || !pair.every(id => s.seen.includes(id))) return null;
      const key = [...pair].sort().join('>');
      const needed = def.evidence.slice(1).map((id, i) => [def.evidence[i]!, id].sort().join('>'));
      if (!needed.includes(key)) s.log.push('두 기록만으로는 같은 이동·시각·정체를 설명할 수 없어요. 기록의 내용이 맞닿는 증거를 연결해 보세요.');
      else if (t.links.includes(key)) return null;
      else { t.links.push(key); s.log.push('두 증거가 같은 사실을 가리키는 것을 확인했다. 수사 보드에 연결선을 남겼다.'); }
    } else if (a.action === 'reconstruct' && s.phase === 'play') {
      if (!def.evidence.every(id => s.seen.includes(id)) || t.links.length !== def.evidence.length - 1) return null;
      if (a.choice !== play.path.map(p => p.id).join(',')) s.log.push('배치한 흐름은 증거와 일치하지 않아요. 시간과 이동 방향을 다시 확인하세요.');
      else { grant(def.grant); s.log.push(def.ending); if (def.extra && meets(s.marks, def.extra.need)) s.log.push(def.extra.text); if (def.id === 'mirror') s.phase = 'epilogue'; else done('solved'); }
    } else if (a.action === 'promise' && s.phase === 'epilogue' && ['return', 'befriend', 'release'].includes(a.choice)) {
      grant({ spirit: a.choice }); s.log.push(a.choice === 'befriend' ? '정령을 원정대 지도에 초대했다. 자기 모습으로 친구가 되기로 약속했다.' : a.choice === 'return' ? '정령을 거울 세계의 문으로 안내했다. 통신 거울로 다시 인사하기로 했다.' : '정령에게 자유의 숲 지도를 건넸다. 다음에는 자기 빛으로 찾아오겠다고 약속했다.'); done('solved');
    } else return null;
  } else {
    if (s.phase !== 'play' || !/^(?:[0-9]|1[0-9]|2[0-4])(?::[0-2])?$/.test(a.choice)) return null;
    if ((a.action === 'scout') !== a.choice.includes(':')) return null;
    const [n, actor] = a.choice.split(':').map(Number), cell = t.cells[n!];
    if (!cell) return null;
    const reach = connected(t);
    if (a.action === 'scout') {
      if (!Number.isInteger(actor) || !s.crew[actor!] || (!reach.has(n!) && !neighbors(n!).some(i => reach.has(i)))) return null;
      const fresh = !cell.revealed;
      cell.revealed = true; t.crewAt[actor!] = n!;
      if (fresh) { s.time++; if (!cell.ports.length && s.crew[actor!]!.role !== 'guard') s.hp--; }
      s.log.push(`${s.crew[actor!]!.name}이(가) ${fresh ? '안개를 걷고 지형을 지도에 옮겼다' : '해당 지점의 조사 준비를 마쳤다'}. 길 조각을 돌려 기지와 연결하세요.`);
    } else if (a.action === 'rotate') {
      if (!cell.revealed || n === t.camp || !cell.ports.length) return null;
      cell.rotation = (cell.rotation + 1) % 4;
      s.log.push('지도 조각을 시계 방향으로 90도 돌렸다. 연결된 길은 밝게 표시된다.');
    } else if (a.action === 'survey') {
      if (!cell.revealed || !reach.has(n!) || !t.crewAt.includes(n!) || !cell.event || cell.surveyed) return null;
      const ids = region(s.content)!.events, final = cell.event === ids[5];
      if (final && ids.slice(0, 5).some(id => !t.cells.some(c => c.event === id && c.surveyed))) { s.log.push('마지막 목적지에 들어가기 전에 지도에 남은 다섯 현장 기록을 완성해야 한다.'); }
      else {
        cell.surveyed = true; grant(EVENT_MARKS[cell.event]); s.seen.push(cell.event); s.log.push(EVENT_RESULTS[cell.event]!);
        const ev = storyEvent(cell.event)!;
        if (ev.extra && meets(s.marks, ev.extra.need)) s.log.push(ev.extra.text);
        if (cell.event === 'chest' && meets(s.marks, 'rustyKey')) { grant({ mapFragment: '1' }); s.log.push('시계 밑 녹슨 열쇠로 보보의 안쪽 서랍을 열어 별빛 지도를 발견했다.'); }
        if (cell.event === 'warehouse' && meets(s.marks, 'oldInvitation')) { grant({ forgottenGift: '1' }); s.log.push('북쪽 탑의 인수표를 내밀자 보관소에서 잊힌 선물을 꺼내 주었다.'); }
        if (s.crew.some(c => c.role === 'healer')) s.hp = Math.min(8, s.hp + 1);
        if (final) {
          const hidden = s.content === 'village' && meets(s.marks, 'starCrystal') && meets(s.marks, 'spiritHelp');
          if (hidden) grant({ starDiscoverer: '1' });
          done(hidden ? 'hidden' : s.content === 'mist' ? 'rescue' : 'discovery');
        }
      }
    } else return null;
    if (s.hp <= 0 || s.time >= 40) { done('escape', false); s.log.push('안전 한계에 도달해 지도를 챙기고 기지로 귀환했다.'); }
    s.position = t.cells.filter(c => c.surveyed).length;
  }
  s.journal.push(...s.log);
  return { state: s, grants };
}
