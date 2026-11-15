// 그림 파일 요청을 받아도 되는지. 우리 사이트 화면에서 쓰는 그림이면 true예요.
// - 다른 사이트가 우리 그림 주소를 붙여 쓰면(Referer가 다른 주소) 거절해요.
// - 그림 주소를 주소창·새 탭으로 바로 열면(Sec-Fetch-Dest: document) 거절해요.
// - Referer가 없으면(하리보봇, 디스코드 미리보기 등) 그대로 줘요.
export function imageRequestAllowed(referer: string | undefined, dest: string | undefined, ...origins: string[]): boolean {
  if (dest === 'document' || dest === 'iframe' || dest === 'frame') return false;
  if (!referer) return true;
  let from: string;
  try {
    from = new URL(referer).origin;
  } catch {
    return false;
  }
  return origins.some((o) => {
    try {
      return new URL(o).origin === from;
    } catch {
      return false;
    }
  });
}
