import type { Member } from '../env';
import { Layout } from './layout';

// 광장 화면의 뼈대. 지도와 캐릭터는 public/plaza.js가 실시간 연결로 그려요.
export function PlazaPage(props: { viewer: Member; guildId: string }) {
  return (
    <Layout title="광장" viewer={props.viewer} active="plaza" wide scripts={['/plaza.js']}>
      <section class="plaza-head">
        <h1>광장</h1>
        <p class="muted">
          같이 돌아다녀요. 통화방 구역에 들어가서 멈추면 디스코드 통화방도 그 방으로 옮겨 드려요. 통화방 채팅은 말풍선으로
          떠요.
        </p>
        <p class="plaza-status" id="plaza-status" role="status">
          연결하는 중…
        </p>
      </section>
      <div class="plaza" id="plaza" data-guild={props.guildId} tabindex={0} aria-label="광장 지도. 누르거나 방향키로 움직여요.">
        <div class="plaza-world" id="plaza-world"></div>
      </div>
      <h2 class="plaza-list-title">통화방</h2>
      <div class="plaza-rooms" id="plaza-rooms"></div>
      <p class="hint plaza-help">컴퓨터: 방향키나 WASD, 또는 가고 싶은 곳 클릭 · 휴대폰: 가고 싶은 곳을 톡 · 통화방 목록을 눌러도 그 방으로 걸어가요</p>
      <div class="plaza-toast" id="plaza-toast" role="alert" hidden>
        <span id="plaza-toast-text"></span>
        <a class="btn btn-small btn-discord" id="plaza-toast-link" href="#" target="_blank" rel="noopener" hidden>
          디스코드 열기
        </a>
      </div>
    </Layout>
  );
}
