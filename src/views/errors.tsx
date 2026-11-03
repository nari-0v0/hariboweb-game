import type { Member } from '../env';
import { Layout } from './layout';
import { OWNER_CONTACT_URL } from './shop';

// 길 잃은 곰돌이 젤리 세 마리(픽셀 로고와 같은 모양)
function LostBears() {
  return (
    <div class="err-bears" aria-hidden="true">
      <span class="brand-mark" />
      <span class="brand-mark" />
      <span class="brand-mark" />
    </div>
  );
}

// 없는 주소(404)
export function NotFoundPage(props: { viewer?: Member | null }) {
  return (
    <Layout title="페이지가 없어요" viewer={props.viewer}>
      <section class="panel message err-page">
        <p class="err-code">404</p>
        <LostBears />
        <h1>페이지가 없어요</h1>
        <p class="muted">주소가 바뀌었거나 없는 화면이에요. 메뉴에서 다시 골라 주세요.</p>
        <div class="err-actions">
          <a class="btn btn-primary" href={props.viewer ? '/me' : '/'}>
            {props.viewer ? '내 카드로' : '처음으로'}
          </a>
          <a class="btn btn-ghost" href="/guide">
            사용설명서
          </a>
        </div>
      </section>
    </Layout>
  );
}

// 서버 오류(500). DB가 문제일 수도 있어서 로그인 정보 없이 그려요.
export function ErrorPage(props: { retry: string }) {
  return (
    <Layout title="잠깐 문제가 생겼어요">
      <section class="panel message err-page">
        <p class="err-code">앗!</p>
        <LostBears />
        <h1>잠깐 문제가 생겼어요</h1>
        <p class="muted">조금 뒤에 다시 시도해 주세요. 계속 안 되면 방장에게 알려 주세요.</p>
        <div class="err-actions">
          <a class="btn btn-primary" href={props.retry}>
            다시 시도
          </a>
          <a class="btn btn-ghost" href={OWNER_CONTACT_URL} target="_blank" rel="noopener noreferrer">
            방장 문의
          </a>
        </div>
      </section>
    </Layout>
  );
}
