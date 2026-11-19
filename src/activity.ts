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
