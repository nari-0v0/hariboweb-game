// HTML 글자 바꾸기(Hono JSX와 같은 결과). 많은 칸을 JSX 대신 글로 이어 붙일 때 이름·소개 같은 글자에 꼭 써요.
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: string | number) => String(v).replace(/[&<>"']/g, (ch) => MAP[ch]!);
