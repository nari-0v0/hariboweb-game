import { Layout } from './layout';

// 디스코드 액티비티 스크립트(public/discord-activity.js). 고치면 ?v=도 바꿔요(브라우저에 오래 남아 있어요).
export const ACTIVITY_SCRIPT_SRC = '/discord-activity.js?v=1';
export const activityScriptTag = (clientId: string) =>
  `<script src="${ACTIVITY_SCRIPT_SRC}" data-client-id="${clientId.replace(/[^0-9]/g, '')}" defer></script>`;

// 디스코드 음성채널에서 🚀로 처음 열었을 때 보이는 화면. 스크립트(첫 주소라서 index.tsx가 붙여요)가 디스코드로 로그인한 뒤 내 카드로 넘겨요.
export function ActivityBootPage(props: { clientId: string }) {
  return (
    <Layout title="디스코드에서 열기">
      <section class="panel act-boot" id="activity-boot" data-client-id={props.clientId}>
        <h1>하리보 멤버 도감</h1>
        <p class="muted" id="activity-status" role="status" aria-live="polite">
          디스코드 계정을 확인하는 중이에요…
        </p>
        <button class="btn btn-primary act-retry" id="activity-retry" type="button" hidden>
          다시 시도
        </button>
      </section>
      <noscript>
        <p class="muted">디스코드 앱을 최신으로 업데이트한 뒤 다시 열어 주세요.</p>
      </noscript>
    </Layout>
  );
}
