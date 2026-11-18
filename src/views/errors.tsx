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

// 화면 가운데 큰 글씨 + 곰돌이 + 버튼 두 개(다시 시도, 방장 문의). 로그인·DB 없이 그려요.
function TroublePage(props: { title: string; code: string; lines: string[]; retry: string }) {
  return (
    <Layout title={props.title}>
      <section class="panel message err-page">
        <p class="err-code">{props.code}</p>
        <LostBears />
        <h1>{props.title}</h1>
        {props.lines.map((l) => (
          <p class="muted">{l}</p>
        ))}
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

// 서버 오류(500)
export function ErrorPage(props: { retry: string }) {
  return <TroublePage code="앗!" title="오류가 생겼어요!" lines={['방장에게 도움을 요청하세요!']} retry={props.retry} />;
}

// DB 하루 사용량 한도에 닿았을 때(503). 한도는 매일 아침 9시(한국 시간)에 다시 채워져요.
export function DbFullPage(props: { retry: string }) {
  return (
    <TroublePage
      code="DB"
      title="DB가 가득 찼어요!"
      lines={['방장에게 도움을 요청하세요!', '하루 쓸 수 있는 양을 다 써서, 보통 아침 9시에 다시 열려요.']}
      retry={props.retry}
    />
  );
}

// 점검 중(503). when = 나리가 적은 점검 시간(없으면 시간 없이)
export function MaintenancePage(props: { retry: string; when: string }) {
  return (
    <TroublePage
      code="점검"
      title="점검 중이에요!"
      lines={[...(props.when ? [`${props.when} 점검할 예정이에요!`] : []), '조금 더 오래 걸릴 수 있으니 조금만 기다려 주세요.']}
      retry={props.retry}
    />
  );
}
