// 업데이트 현황(나리 2026-11-19): 배포할 때마다 맨 위에 한 줄 더해요. 짧게, 멤버가 알아들을 말로.
// 새 줄이 생기면 위 메뉴의 "업데이트 현황"에 점이 떠요(본 줄은 브라우저에 기억해요. DB는 읽지 않아요).
export type Update = { day: string; text: string };
export const UPDATES: Update[] = [
  { day: '2026-11-19', text: '🔎 사건파일 「오늘의 사건」 추가 · 🗼 끝없는 탑 층 보상을 10층마다 1개부터 다시 세도록 변경 · 📋 업데이트 현황 추가' },
];
// 점을 띄울지 비교하는 값(맨 위 줄이 바뀌면 달라져요)
export const updatesMark = () => (UPDATES[0] ? `${UPDATES[0].day}:${UPDATES.length}` : '');
