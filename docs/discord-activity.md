# 디스코드 액티비티 (디스코드 안에서 도감 열기)

음성채널의 🚀(액티비티) 버튼으로 도감을 디스코드 앱 안에서 바로 여는 기능이에요.
코드는 들어가 있지만 **스위치 `DISCORD_ACTIVITY`가 비어 있으면 꺼져 있고**, 지금 웹과 똑같이 움직여요.

## 꼭 먼저 알아 둘 것

- 디스코드 규칙상 **인증 안 된 앱의 액티비티는 멤버 25명 미만 서버에서만** 열 수 있어요.
  하리보 서버(약 98명)에서 모두가 쓰려면 하리보봇 앱이 디스코드 **앱 인증(App Verification)** 을 받아야 해요.
  인증 전에는 나리와 앱 테스터만, 25명 미만 시험 서버에서 써 볼 수 있어요.
- 로그인은 지금 웹 로그인과 같은 하리보봇 앱(ID `1420027662830669925`)을 써요.
  그래서 **새 비밀 값(Client Secret)은 필요 없어요.** 이미 웹에 `DISCORD_CLIENT_SECRET`으로 들어가 있어요.
- 디스코드 안에서 열어도 요청은 지금 웹(Cloudflare)으로 가요. 무료 한도 걱정이 있으면 웹을 봇 서버로 옮긴 뒤 켜요.

## 나리가 개발자 포털에서 할 일

discord.com/developers/applications → 하리보봇 앱

1. **Activities → Settings**: Enable Activities 켜기. 지원 기기(PC·iOS·Android) 모두 켜기.
2. **Activities → URL Mappings**: 두 줄을 넣어요.
   | PREFIX | TARGET |
   |---|---|
   | `/` | `hariboweb-game.haribobot.workers.dev` |
   | `/cdn` | `cdn.discordapp.com` |
   (`/cdn`은 멤버 프로필 사진용이에요.)
3. **OAuth2**: 할 일 없음. Redirects에 지금 웹 로그인 주소가 이미 있어요.
4. **App Testers**(인증 전 시험용): 시험해 볼 사람을 넣어요.
5. 하리보 서버에서 모두 쓰려면 **App Verification** 신청(본인 확인 단계가 있어요).

## 켜는 법 (나리가 "켜줘" 한 뒤 Claude가)

- Worker: Cloudflare 설정 > 변수에 `DISCORD_ACTIVITY=1` (또는 `wrangler.jsonc`의 `vars`).
- 봇 서버(Node)로 옮긴 뒤라면 그 서버 설정에도 `DISCORD_ACTIVITY=1`.
- 켜는 배포 때 `src/updates.ts` 맨 위에 한 줄 추가.

## 어떻게 움직이나요

1. 🚀로 열면 디스코드가 `https://1420027662830669925.discordsays.com/?frame_id=…&instance_id=…&platform=…`을 열어요(우리 웹을 디스코드 프록시로 감싼 주소).
2. `/`가 이 값들을 보면 "디스코드 계정 확인 중" 화면을 보여 주고, `public/discord-activity.js`(디스코드 공식 Embedded App SDK 2.5.0)가
   디스코드에 로그인 허락(authorize)을 받아요. 처음 한 번만 허락 창이 떠요.
3. 받은 code를 `POST /activity/login`으로 보내면 서버가 하리보 멤버인지 확인하고 `hsa` 쿠키(SameSite=None, Partitioned)를 넣어요.
   `GET /activity/check`로 쿠키가 정말 저장됐는지 확인한 뒤 내 카드(`/me`)로 넘어가요.
4. `hsa` 쿠키로 보는 화면은 서버가
   - 프로필 사진 주소(`https://cdn.discordapp.com/…`)를 `/.proxy/cdn/…`으로 바꾸고,
   - `<html class="in-activity">`(로그아웃 숨김, 휴대폰 위·아래 가림 영역 비키기)와 스크립트를 붙여요.
5. 카카오톡 같은 바깥 링크는 디스코드의 "외부 링크 열기"로 열어요.

스크립트를 고치면 `client/discord-activity.ts` 수정 → `npm run build:activity` → `src/views/activity.tsx`의 `?v=` 올리기.

## 켠 뒤 실제 기기에서 확인할 것

- PC 디스코드 앱, 휴대폰(iOS·Android)에서 로그인 → 내 카드까지 가는지
- "디스코드 앱이 로그인 정보를 저장하지 못했어요"가 뜨면 그 기기에서 쿠키가 막힌 거예요(다른 방법 필요)
- 프로필 사진, 그림, 버튼(POST)이 다 되는지, 카톡 링크가 열리는지
