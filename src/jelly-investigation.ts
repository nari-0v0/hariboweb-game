import { storyCase, type StoryCase } from './story-content';
import type { StoryState } from './story';

export type JellyInvestigation = {
  crate: 'left' | 'right' | null;
  sample: boolean;
  tested: ('sugar' | 'flour')[];
  matched: boolean;
  cart: 'S17' | null;
  seal: boolean;
  counted: boolean;
};
export const newJellyInvestigation = (): JellyInvestigation => ({ crate: null, sample: false, tested: [], matched: false, cart: null, seal: false, counted: false });
export const JELLY_CASE: StoryCase = {
  ...storyCase('jelly500')!,
  dialogue: ['{a}: 상자가 바닥을 가리고 있어. 움직여 보면 운반 흔적이 있을지도 몰라.', '{b}: 가루를 발견하면 주방의 표본과 비교해 보자. 모양만 보고 서둘러 단정하진 말고.', '가상 행사 요정 포포: 운반 장부는 창고 선반에 두었어. 수레와 물품의 기록도 거기에 있어.'],
  clues: [
    { id: 'trail', label: '드러난 바퀴 자국', text: '상자 밑에서 두 줄의 수레 자국이 드러났다. 한쪽 바퀴에는 별 모양 못 자국이 반복되고, 행사 준비실 방향으로 이어진다.' },
    { id: 'powder', label: '창고에서 채집한 가루', text: '바퀴 자국 옆의 하얀 가루를 표본병에 담았다. 아직 정체는 확정하지 않았다.' },
    { id: 'match', label: '가루 비교와 적재 메모', text: '창고 가루는 설탕처럼 각진 반투명 결정이다. 밀가루는 훨씬 작고 불투명하다. 포포의 적재 메모에는 「설탕 봉지와 젤리: 별표 바퀴 S-17 수레」라고 적혀 있다.' },
    { id: 'cart', label: 'S-17 수레 대조', text: 'S-17 수레의 별표 바퀴와 설탕 적재표가 창고의 바퀴 자국·가루와 일치한다.' },
    { id: 'seal', label: '온전한 승인 봉인', text: 'S-17 수레 상자의 봉인을 확대해 맞춰 보니 절단 흔적 없이 승인 도장이 이어진다. 중간에 개봉된 흔적은 없다.' },
    { id: 'boxes', label: '봉인 상자 실물 수량', text: 'S-17 수레의 봉인이 온전한 상자 다섯 개를 하나씩 확인했다. 각 표찰은 100개이며 합계는 젤리 500개다.' },
    { id: 'receipt', label: '운반 장부', text: '21:05 포포 / 젤리 500개 / 행사 준비실 임시 이동. 반납 예정 22:00. 승인 도장이 있다. 수레 번호 부분은 번져 있어 실물 흔적으로 확인해야 한다.' },
    { id: 'promise', label: '행사 준비 리본', text: '포포: 다음부터는 창고에 이동 안내도 붙일게. 준비를 도와줘서 고마워!', grant: { ribbon: '1' } },
  ],
  evidence: ['trail', 'match', 'boxes', 'receipt'],
  ending: '탐정: 별표 바퀴 자국, 설탕 표본, S-17의 온전한 봉인과 500개 실물이 모두 장부와 일치해. 젤리는 승인받아 행사 준비실로 옮겨졌어. 포포는 창고 안내판을 바로잡고 모두에게 파티를 열었다.',
};
export function isJellyState(v: unknown): v is JellyInvestigation {
  if (!v || typeof v !== 'object') return false;
  const s = v as JellyInvestigation;
  return [null, 'left', 'right'].includes(s.crate) && [s.sample, s.matched, s.seal, s.counted].every(x => typeof x === 'boolean') &&
    Array.isArray(s.tested) && s.tested.length <= 2 && new Set(s.tested).size === s.tested.length && s.tested.every(x => ['sugar', 'flour'].includes(x)) &&
    (s.cart === null || s.cart === 'S17') && (!s.sample || s.crate !== null) && (!s.matched || (s.sample && s.tested.length === 2)) &&
    (!s.cart || s.matched) && (!s.seal || !!s.cart) && (!s.counted || s.seal);
}
// s는 advanceTactile에서 복제한 판입니다. 클라이언트가 보낸 정답만으로 조사 단계를 건너뛸 수 없어요.
export function applyJellyAction(s: StoryState, choice: string): boolean {
  const t = s.interaction;
  if (s.phase !== 'play' || t?.mode !== 'case' || !t.jelly) return false;
  const j = t.jelly, [action, value, total] = choice.split(':');
  if (choice.split(':').length > (action === 'count' ? 3 : 2)) return false;
  const note = (id: string) => { if (!s.seen.includes(id)) s.seen.push(id); s.log.push(JELLY_CASE.clues.find(c => c.id === id)!.text); };
  if (action === 'move' && !j.crate && ['left', 'right'].includes(value ?? '') && !total) {
    j.crate = value as 'left' | 'right'; s.log.push('상자를 옆으로 밀었다. 가려져 있던 바퀴 자국과 하얀 가루가 드러났다. 흔적을 조사하고 가루를 채집할 수 있다.');
  } else if (action === 'trace' && choice === 'trace' && j.crate && !s.seen.includes('trail')) note('trail');
  else if (action === 'collect' && choice === 'collect' && j.crate && !j.sample) { j.sample = true; note('powder'); }
  else if (action === 'test' && !total && j.sample && ['sugar', 'flour'].includes(value ?? '') && !j.tested.includes(value as 'sugar' | 'flour')) {
    j.tested.push(value as 'sugar' | 'flour');
    s.log.push(value === 'sugar' ? '확대경 아래에서 창고 표본과 설탕은 각진 반투명 결정으로 보인다. 밀가루 표본과도 비교해 보자.' : '밀가루는 작은 불투명 알갱이다. 창고 표본의 큰 반투명 결정과 다르다. 두 비교 결과를 대조해 일치하는 표본을 놓자.');
  } else if (action === 'match' && !total && j.sample && j.tested.length === 2 && !j.matched && ['sugar', 'flour'].includes(value ?? '')) {
    if (value !== 'sugar') s.log.push('밀가루는 창고 표본과 입자의 크기·투명도가 다르다. 확대된 표본을 다시 비교해 보자.');
    else { j.matched = true; note('match'); s.log.push('포포: 설탕을 실었던 건 S-17 수레야. 별표가 찍힌 바퀴와 적재표를 같이 확인해 봐.'); }
  } else if (action === 'cart' && !total && j.matched && s.seen.includes('trail') && !j.cart && ['S17', 'F04', 'P09'].includes(value ?? '')) {
    if (value !== 'S17') s.log.push('이 수레의 바퀴 표식과 적재표는 창고에서 확인한 흔적과 일치하지 않는다. 별표 바퀴와 설탕 적재표를 찾아보자.');
    else { j.cart = 'S17'; note('cart'); }
  } else if (action === 'seal' && !total && j.cart && !j.seal && /^[0-6]$/.test(value ?? '')) {
    if (value !== '3') s.log.push('봉인의 인쇄선이 아직 어긋나 있다. 두 도장 조각이 이어지도록 움직여 보자.');
    else { j.seal = true; note('seal'); }
  } else if (action === 'count' && j.seal && !j.counted && value && total && choice.split(':').length === 3) {
    const ids = value.split(',');
    if (ids.length !== 5 || new Set(ids).size !== 5 || !ids.every(id => ['b1', 'b2', 'b3', 'b4', 'b5'].includes(id))) return false;
    if (total !== '500') s.log.push('직접 확인한 상자 다섯 개의 표찰은 각각 100개다. 실물 표찰을 바탕으로 총수량을 다시 계산해 보자.');
    else { j.counted = true; note('boxes'); }
  } else return false;
  return true;
}
