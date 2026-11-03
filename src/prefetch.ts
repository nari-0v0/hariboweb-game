// 메뉴·링크에 손가락이나 마우스를 올리면 다음 화면을 미리 받아 둬서, 누르면 바로 열려요(크롬·엣지·삼성 인터넷).
// 열기만 해도 기록이 바뀌는 화면(내 카드의 빙고 칸, 칭호 얻기, 상점 결제 결과, 원정대 등)은 빼고,
// 읽기만 하는 화면만 미리 받아요. 서버도 이 목록 밖의 미리 받기 요청은 거절해요.
export const PREFETCH_PATHS = ['/dogam', '/dogam/*', '/card/*', '/group', '/plaza', '/guide'];

export function prefetchAllowed(path: string): boolean {
  return PREFETCH_PATHS.some((p) => (p.endsWith('/*') ? path.startsWith(p.slice(0, -1)) && path.length > p.length - 1 : path === p));
}

export const PREFETCH_RULES = JSON.stringify({
  prefetch: [{ where: { or: PREFETCH_PATHS.map((p) => ({ href_matches: p })) }, eagerness: 'moderate' }],
});
