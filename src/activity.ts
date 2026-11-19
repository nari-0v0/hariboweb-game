import type { Env } from './env';

// 디스코드 액티비티: 음성채널의 🚀 버튼으로 디스코드 안에서 도감을 여는 기능.
// 디스코드는 우리 웹을 https://<앱ID>.discordsays.com 주소(디스코드 프록시)로 감싸서 보여 줘요.
// 설정 DISCORD_ACTIVITY=1일 때만 켜져요. 꺼져 있으면 지금 웹과 똑같이 움직여요.

export const activityOn = (env: Pick<Env, 'DISCORD_ACTIVITY'>) => env.DISCORD_ACTIVITY?.trim() === '1';

// 디스코드 안에서 우리 화면이 보이는 주소(출처). 앱 ID는 지금 로그인에 쓰는 하리보봇 앱과 같아요.
export const activityOrigin = (env: Pick<Env, 'DISCORD_CLIENT_ID'>) => `https://${env.DISCORD_CLIENT_ID}.discordsays.com`;

// 디스코드 안 로그인 쿠키. 일반 웹 쿠키(hs)와 이름을 달리해서, 이 쿠키가 있으면 "디스코드 안에서 보는 중"으로 알아요.
// 디스코드 앱 속 화면은 discordsays.com이라 쿠키 보관함이 일반 웹과 따로예요.
export const ACTIVITY_COOKIE = 'hsa';

// 디스코드가 액티비티를 처음 열 때 주소에 붙여 주는 값들(SDK가 꼭 필요로 해요).
export function isActivityLaunch(query: Record<string, string>): boolean {
  return !!query.frame_id && !!query.instance_id && (query.platform === 'desktop' || query.platform === 'mobile');
}

// 이 요청의 화면을 디스코드 안 화면으로 바꿔야 하는지: 디스코드 안 로그인 쿠키가 있거나, 🚀로 막 연 첫 주소일 때.
// (첫 주소는 로그인 전이라 쿠키가 없어요. 점검 화면 등이 먼저 나와도 바깥 링크 열기 스크립트가 붙어야 해요.)
export function wantsActivityPage(env: Pick<Env, 'DISCORD_ACTIVITY'>, request: Request): boolean {
  if (!activityOn(env)) return false;
  if (new RegExp(`(?:^|;\\s*)${ACTIVITY_COOKIE}=`).test(request.headers.get('Cookie') ?? '')) return true;
  return isActivityLaunch(Object.fromEntries(new URL(request.url).searchParams));
}

// 화면(HTML) 응답이면 디스코드 안 화면으로 바꿔요. 그 밖의 응답은 그대로예요.
export async function toActivityResponse(res: Response, scriptTag: string): Promise<Response> {
  if (!(res.headers.get('Content-Type') ?? '').startsWith('text/html') || !res.body) return res;
  const html = rewriteForActivity(await res.text(), scriptTag);
  const headers = new Headers(res.headers);
  headers.delete('Content-Length');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

// 디스코드 안에서는 등록한 주소(URL Mapping)로만 그림을 받을 수 있어요.
// 프로필 사진(cdn.discordapp.com)은 개발자 포털에 /cdn → cdn.discordapp.com 으로 등록하고, 화면 속 주소를 바꿔요.
const CDN = /https:\/\/cdn\.discordapp\.com\//g;
export function rewriteForActivity(html: string, scriptTag: string): string {
  let out = html.replace(CDN, '/.proxy/cdn/');
  // 디스코드 안 표시(로그아웃 숨김·안전 여백) + 바깥 링크 열기 스크립트
  out = out.replace('<html lang="ko">', '<html lang="ko" class="in-activity">');
  out = out.replace('</head>', `${scriptTag}</head>`);
  return out;
}
