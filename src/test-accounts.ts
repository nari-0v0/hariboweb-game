// 나리 테스트 계정(나리 2026-11-20). 로그인·테스트는 그대로 되지만 "멤버"로는 세지 않아요:
// 다른 사람 도감·완성도·서버 인원(판타지 캐릭터 보상 기준)에서 빠지고, 함께한 경험치(카드)가 생기지 않고,
// 시즌 팀(초록하리보)·신입에도 들어가지 않아요. 계정을 더 빼려면 디스코드 ID를 여기에 넣어요.
export const TEST_MEMBER_IDS: readonly string[] = [
  '1270353217968148536', // 실험 98
];

const TEST_SET = new Set(TEST_MEMBER_IDS);
export const isTestMember = (id: string) => TEST_SET.has(id);

// SQL 조건: col이 테스트 계정이 아니에요. ID는 숫자만이라 그대로 넣어도 안전해요.
export function notTestMember(col: string): string {
  if (!TEST_MEMBER_IDS.length) return '1 = 1';
  return `${col} NOT IN (${TEST_MEMBER_IDS.map((id) => `'${id.replace(/\D/g, '')}'`).join(', ')})`;
}
