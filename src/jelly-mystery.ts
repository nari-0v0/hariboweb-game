import type { StoryState } from './story';

// 기록은 사실만 제공한다. 해석과 해답은 브라우저에 내려보내는 기록 데이터에서 분리한다.
export const JELLY_RECORDS = [
  { id: 'A', room: 0, title: '출고 집계 장부', body: '젤리 K11 로트 500개 / 행사 물품 / 21:05 / 포포 정리. 하단의 작은 글씨: 「표시 시각은 장부 작성 시각. 개별 출고 시각은 문턱 계수기 원장 참조」. 수령 장소 칸에는 행사 준비실, 주방 두 곳의 도장이 겹쳐 찍혀 있다.' },
  { id: 'B', room: 2, title: '20:50 행사 준비 사진', body: '벽시계 20:50. 행사 준비실 앞에 바깥 번호 1~5가 붙은 상자 다섯 개가 놓여 있다. 뚜껑은 닫혀 있어 내용물은 보이지 않는다. 4·5번 상자의 붉은 번호표 모서리가 들떠 있다.' },
  { id: 'C', room: 1, title: '주방 담당의 관찰 범위', body: '가상 주방 요정 모모: 「나는 20:55에 설거지를 마치고 복도로 나왔어. 그때부터 21:15까지 수레는 한 번도 안 지나갔어. 그 전에는 물소리 때문에 복도를 볼 수도 들을 수도 없었어.」' },
  { id: 'D', room: 2, title: '상자 다섯 개의 안쪽 표찰', body: '바깥 1·2·3번: 안쪽 봉인 J1·J2·J3, K11 젤리 각 100개. 바깥 4·5번: 안쪽 표찰 D4·D5, 무대 천과 종이별. 바깥 번호는 내용물 수량을 뜻하지 않는다. 젤리 봉인 세 개에는 절단 흔적이 없다.' },
  { id: 'E', room: 0, title: '포장 상자 재사용 대장', body: '오늘 20:10, 지난 행사 바깥 상자 4·5번을 장식 운반용 D4·D5로 재사용. 예전 붉은 번호표는 포장 껍데기에 남겨 둠. 젤리의 새 안쪽 봉인 번호는 J1~J5이며 각 100개. 포장 껍데기 번호와 재고 봉인 번호는 별도 체계다.' },
  { id: 'F', room: 1, title: '주방 안쪽 건조 보관함', body: '봉인 J4·J5, K11 젤리 각 100개. 두 봉인은 온전하다. 수령표: 「20:45 / 창고에서 도착 / 임시 보관」. 바깥 포장은 무번호 회색 상자다. 이곳의 J4·J5는 사진 속 붉은 4·5번과 다른 물건이다.' },
  { id: 'G', room: 0, title: '문턱 계수기 원장', body: '자동 시각은 회관 표준시와 동기화됨. 20:30 S-17 / 봉인 J1,J2,J3 반출. 20:45 S-17 / 봉인 J4,J5 반출. 20:45 이후 21:15까지 창고 반출 없음. 포장 소품 D4·D5는 20:15에 별도로 반출됨.' },
  { id: 'H', room: 1, title: '20:25 행사 배치 지시서', body: '승인된 배치: 행사 준비실 선반의 안전 적재량은 세 상자다. 나머지 두 상자는 무대 조립이 끝날 때까지 주방 건조 보관함에 둔다. 전량 K11 행사 물품이며 판매·폐기 물량은 없다. 포포와 모모의 수령 도장.' },
  { id: 'I', room: 0, title: '바퀴 흔적과 가루 탁본', body: '가루는 설탕 결정이다. 수레 보관 기록상 S-17과 F-04 모두 오늘 설탕을 실었다. 바닥의 왼쪽 바퀴 흔적에는 매 회전마다 짧은 이중 홈이 찍혔고, 오른쪽에는 없다. 가루만으로 수레를 특정할 수 없다.' },
  { id: 'J', room: 2, title: '수레 두 대의 바퀴 점검', body: 'S-17: 왼쪽 바퀴에 이중 홈, 오른쪽은 매끈함. F-04: 양쪽 바퀴 모두 매끈함. 정비표의 날짜는 오늘이다. 두 수레 적재판에는 설탕이 남아 있다. S-17의 오늘 운행표에는 20:30·20:45 두 번의 창고 출발이 적혀 있다.' },
  { id: 'K', room: 2, title: '사진 뒷면의 촬영 메모', body: '「20:50, 장식 배치를 찍음. 바깥 번호가 보이도록 정렬했지만 내용물 검수 사진은 아님. D4·D5는 젤리 도착 전부터 여기 있었음」. 사진 파일의 시각도 20:50으로 일치한다. 카메라 시계가 틀렸다는 흔적은 없다.' },
  { id: 'L', room: 0, title: '포포의 미완성 안내판', body: '가상 행사 요정 포포: 「집계만 끝내고 창고 안내판을 아직 못 붙였어. 500개는 행사 전체 배정량이야. 어디에 얼마가 있는지는 각 수령표로 확인해 줘. 누구도 기록을 숨기려 한 건 아니야.」 안내판에는 장소별 수량 칸이 비어 있다.' },
] as const;

export const MYSTERY_INTRO = '21:15, 창고의 젤리 500개가 없어졌다. 장부에는 21:05라고 적혔는데, 20:50 사진에는 벌써 다섯 상자가 보인다. 주방 담당은 21시 이후 수레를 보지 못했다. 사진 속 상자를 열자 두 개에는 젤리 대신 소품이 들어 있다. 시각·상자 번호·내용물 중 무엇을 같은 것으로 착각한 걸까?';
export const MYSTERY_ENDING = '사진도 장부도 증언도 거짓이 아니었다. 20:30에는 J1~J3의 300개가 행사 준비실로, 20:45에는 J4·J5의 200개가 주방으로 옮겨졌다. 두 번 모두 왼쪽 바퀴에 이중 홈이 난 S-17이었다. 21:05는 두 건을 합산한 장부 작성 시각이었다. 사진의 붉은 4·5번은 재사용한 소품 포장으로, 젤리 봉인 J4·J5가 아니었다. 20:55부터 복도를 본 모모의 증언도 실제 운반과 충돌하지 않는다. 300+200=500개가 온전하게 확인되었고, 승인 지시서대로 분산 보관되어 있었다. 조력자들과 장소별 안내판을 완성했다.';

export const MYSTERY_QUESTIONS = [
  { title: '장부보다 먼저 찍힌 도착 사진', options: ['사진 시계가 15분 빨랐다', '21:05는 집계 작성 시각이다', '사진이 다른 날 촬영됐다'] },
  { title: '같은 4·5번인데 다른 내용물', options: ['젤리 두 상자가 소품으로 바뀌었다', '사진에는 젤리 500개가 들어 있다', '바깥 포장 번호와 안쪽 봉인 번호가 다르다'] },
  { title: '수레를 보지 못했다는 증언', options: ['관찰 시작 전에 두 번 모두 이동했다', '증인이 이동을 숨겼다', '수레는 21:05에 이동했다'] },
  { title: '설탕 묻은 수레가 두 대', options: ['설탕이 있으면 모두 같은 수레다', '왼쪽 이중 홈과 운행 기록이 S-17을 가리킨다', '설탕이 없는 수레가 옮겼다'] },
  { title: '왜 두 장소에 나누어 보관했을까', options: ['행사 선반 용량에 맞춘 승인된 임시 배치다', '200개는 폐기된 물량이다', '주방의 200개는 다른 행사 재고다'] },
] as const;

// 세 이동/보관 사실 + 다섯 모순의 설명과 근거 두 장씩. 정답은 서버에서만 사용한다.
const ROWS = ['a,x,p', 'b,y,k', 'c,z,p'];
const EXPLANATIONS = [
  { claim: '2', pairs: ['AG', 'AB', 'AK'] },
  { claim: '3', pairs: ['DE', 'DF'] },
  { claim: '1', pairs: ['CG', 'CJ'] },
  { claim: '2', pairs: ['IJ'] },
  { claim: '1', pairs: ['FH'] },
];
const REQUIRED = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
export function checkMystery(s: StoryState, choice: string): { valid: boolean; solved: boolean; messages: string[] } {
  const parts = choice.split(';');
  if (parts.length !== 8 || !parts.slice(0, 3).every(p => /^[abc],[xyz],[pk]$/.test(p)) || !parts.slice(3).every(p => /^[123],[A-L]{2}$/.test(p) && p[2] !== p[3])) return { valid: false, solved: false, messages: [] };
  const cited = parts.slice(3).flatMap(p => p.slice(2).split(''));
  if (!cited.every(id => s.seen.includes(id))) return { valid: false, solved: false, messages: [] };
  const messages: string[] = [];
  if (!REQUIRED.every(id => s.seen.includes(id))) messages.push('원기록이 아직 부족하다. 사진 뒷면·수령표·배치 지시서를 포함해 현장을 더 조사해야 한다.');
  const rowNames = ['첫 젤리 운반', '두 번째 젤리 운반', '소품 운반'];
  const destinationRecords = ['행사 준비실 실물 표찰', '주방 수령표', '사진 뒷면의 촬영 메모'];
  const rows = parts.slice(0, 3).map(p => p.split(','));
  if (new Set(rows.map(row => row[1])).size !== rows.length) messages.push('같은 물품을 두 번 옮겼다고 배치하면 다른 물품의 실제 도착을 설명할 수 없다. 봉인과 소품 표찰을 구분해 보자.');
  rows.forEach(([time, cargo, destination], i) => {
    const [expectedTime, expectedCargo, expectedDestination] = ROWS[i]!.split(',');
    const name = rowNames[i]!;
    if (time !== expectedTime) messages.push(`${name} 시각이 문턱 계수기 원장에 찍힌 반출 시각과 다르다.`);
    if (cargo !== expectedCargo) messages.push(`${name}에 배정한 물품이 원장에 적힌 봉인·표찰 번호와 다르다.`);
    if (destination !== expectedDestination) messages.push(`${name}의 도착지가 ${destinationRecords[i]}의 위치와 맞지 않는다.`);
  });
  parts.slice(3).forEach((p, i) => {
    const expected = EXPLANATIONS[i]!, pair = p.slice(2).split('').sort().join('');
    if (p[0] !== expected.claim) messages.push(['사진 시계가 틀렸다는 원기록은 없다. 장부 하단의 시각 정의를 확인해 보자.', '동일 번호를 곧바로 같은 물건으로 보면 주방의 온전한 봉인을 설명할 수 없다.', '증언은 관찰한 시간 범위 안에서만 판단할 수 있다. 관찰 시작과 자동 반출 시각을 나란히 놓아 보자.', '설탕은 두 수레에 모두 있다. 둘을 구별하는 바퀴 특징과 운행 기록이 필요하다.', '주방 물품의 로트와 승인 지시서의 보관 목적을 함께 확인해 보자.'][i]!);
    else if (!expected.pairs.includes(pair)) messages.push(`「${MYSTERY_QUESTIONS[i]!.title}」의 해석을 뒷받침하는 원기록 두 장이 맞지 않는다. 주장 자체와 이를 검증하는 기록을 함께 골라 보자.`);
  });
  return { valid: true, solved: messages.length === 0, messages };
}
export function readMystery(s: StoryState, choice: string): boolean {
  const match = /^read:([A-L])$/.exec(choice), record = JELLY_RECORDS.find(r => r.id === match?.[1]);
  if (!record || s.seen.includes(record.id)) return false;
  s.seen.push(record.id); s.log.push(`${record.id} · ${record.title}을 확인했다. 원문을 현장과 원기록 수첩에 보관했다.`); return true;
}
