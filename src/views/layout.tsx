import { GAMBLE_LOCKED } from '../gamble';
import { OWNER_CONTACT_URL } from '../contact';
import { PREFETCH_RULES } from '../prefetch';
import { NOTICE_BAR } from '../maintenance';
import { burnEndText } from '../burning';
import { updatesMark } from '../updates';
import { KAKAO_SCRIPT } from '../kakao';
import type { Child } from 'hono/jsx';
import type { Member } from '../env';

type NavKey = 'me' | 'dogam' | 'shop' | 'group' | 'bingo' | 'titles' | 'expedition' | 'gamble' | 'cases' | 'rank' | 'guide';

export function Layout(props: {
  title: string;
  viewer?: Member | null;
  active?: NavKey;
  refresh?: { seconds: number; url: string };
  wide?: boolean;
  scripts?: (string | { src: string; type: 'module' })[];
  /** 화면에 바로 보일 큰 그림(배경 등)을 CSS보다 먼저 받기 시작해요. */
  preloadImages?: string[];
  children?: Child;
}) {
  const burn = props.viewer?.burn_until ?? null;
  const nav = (key: NavKey, href: string, label: string, icon: string) => (
    <a href={href} class={props.active === key ? 'on' : undefined} aria-current={props.active === key ? 'page' : undefined}>
      <span aria-hidden="true">{icon}</span> {label}
    </a>
  );
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {props.refresh && <meta http-equiv="refresh" content={`${props.refresh.seconds}; url=${props.refresh.url}`} />}
        <title>{props.title} · 하리보 멤버 도감</title>
        <link rel="preload" href="/fonts/Galmuri11.woff2" as="font" type="font/woff2" crossorigin="" />
        {props.preloadImages?.map((href) => <link rel="preload" href={href} as="image" fetchpriority="high" />)}
        <link rel="icon" type="image/png" href="/char/deco/explorer.png" />
        <link rel="stylesheet" href="/styles.css?v=audit4-1121" />
        <script src="/app.js?v=audit4-1121" defer></script>
        {props.scripts?.map((script) => typeof script === 'string'
          ? <script src={script} defer></script>
          : <script src={script.src} type={script.type}></script>)}
        {props.viewer && <script type="speculationrules" dangerouslySetInnerHTML={{ __html: PREFETCH_RULES }} />}
      </head>
      <body class={NOTICE_BAR || burn ? 'has-notice' : undefined}>
        {/* 카카오톡 속 브라우저면 기본 브라우저로 열어 보고 안내 띠를 띄워요(그 밖에는 아무것도 안 해요). kakao.ts */}
        <script dangerouslySetInnerHTML={{ __html: KAKAO_SCRIPT }} />
        {/* 버닝타임 띠가 점검 공지보다 먼저예요(점검이 끝난 뒤에 켜지니까요) */}
        {burn ? (
          <a class="notice-bar burn-bar" role="status" href="/guide#burning">
            <span aria-hidden="true">🔥</span> 버닝타임 {burnEndText(burn)}까지! 통화 카드 경험치·원정대 재료 확률 1.5배, 힌트 동전·빙고 통화 2배
          </a>
        ) : null}
        {/* 메뉴 위에 고정되는 공지 띠. 끄려면 maintenance.ts의 NOTICE_BAR를 ''로 */}
        {!burn && NOTICE_BAR && (
          <div class="notice-bar" role="status">
            <span aria-hidden="true">📢</span> {NOTICE_BAR}
          </div>
        )}
        <div class="sky" aria-hidden="true">
          <i class="cloud c1" />
          <i class="cloud c2" />
          <i class="cloud c3" />
        </div>
        {props.viewer && <input type="checkbox" id="menu-toggle" class="menu-toggle" aria-hidden="true" tabindex={-1} />}
        <header class="topbar">
          <a class="brand" href={props.viewer ? '/me' : '/'}>
            <span class="brand-mark" aria-hidden="true"></span>
            <span class="brand-text">하리보 멤버 도감</span>
          </a>
          {props.viewer && (
            <div class="topbar-right">
              {/* 업데이트 현황: 새 줄이 있으면 점(app.js가 브라우저에 기억한 값과 비교해요) */}
              <a class="upd-btn" href="/updates" data-upd={updatesMark()}>
                <span>업데이트</span>
                <span>현황</span>
                <i class="upd-dot" aria-hidden="true" hidden />
              </a>
              {/* 알림함: 안 읽은 알림이 있으면 빨간 점. 누르면 팝업(app.js), 자바스크립트가 없으면 /alerts 화면 */}
              <a
                class="alert-btn"
                href="/alerts"
                data-alert-open
                aria-label={(props.viewer.unread_alerts ?? 0) > 0 ? `알림 (새 알림 ${props.viewer.unread_alerts}개)` : '알림'}
              >
                <img class="bell-off" src="/ui/bell.webp?v=4" alt="" width="32" height="32" />
                <img class="bell-on" src="/ui/bell-on.webp?v=4" alt="" width="32" height="32" />
                {(props.viewer.unread_alerts ?? 0) > 0 && <i class="alert-dot" aria-hidden="true" />}
              </a>
              <label for="menu-toggle" class="menu-btn" role="button" tabindex={0} aria-label="메뉴 열기">
                <span class="menu-icon" aria-hidden="true"></span>
                <span class="menu-word">메뉴</span>
              </label>
            </div>
          )}
        </header>
        {props.viewer && (
          <>
            <label for="menu-toggle" class="menu-scrim" aria-hidden="true"></label>
            <nav class="menu-panel" aria-label="메뉴">
              {nav('me', '/me', '내 카드', '🃏')}
              {nav('dogam', '/dogam', '도감', '📖')}
              {nav('bingo', '/bingo', '하리보 빙고', '🎯')}
              {nav('expedition', '/expedition/go', '원정대', '🧭')}
              {GAMBLE_LOCKED ? (
                <span class="menu-locked" aria-disabled="true" title="지금은 잠겨 있어요">
                  <span aria-hidden="true">🔒</span> 겜블장 <small>잠금</small>
                </span>
              ) : (
                nav('gamble', '/gamble', '겜블장', '🎰')
              )}
              {nav('cases', '/cases/room', '사건파일', '🔎')}
              {nav('rank', '/rank', '순위', '🏆')}
              {nav('shop', '/shop', '상점', '🍬')}
              {nav('guide', '/guide', '사용설명서', '📘')}
              <div class="menu-foot">
                <a class="menu-help" href={OWNER_CONTACT_URL} target="_blank" rel="noopener" title="방장 1:1 카톡">
                  🐞 버그 문의
                </a>
                <form method="post" action="/auth/logout">
                  <button class="menu-out" type="submit">
                    로그아웃
                  </button>
                </form>
              </div>
            </nav>
          </>
        )}
        {props.viewer && <div class="alert-pop" id="alert-pop" role="dialog" aria-label="알림" hidden></div>}
        <main class={props.wide ? 'wide' : undefined}>{props.children}</main>
        {/* 다음 화면이 늦게 오면(0.1초 넘게) 보이는 로딩 화면. app.js가 켜고 꺼요. */}
        <div class="loader" role="status" aria-live="polite">
          <div class="loader-box">
            <div class="loader-bears" aria-hidden="true">
              <span class="brand-mark" />
              <span class="brand-mark" />
              <span class="brand-mark" />
            </div>
            <span class="loader-text">불러오는 중…</span>
          </div>
        </div>
        <footer class="foot">
          <a class="foot-help" href={OWNER_CONTACT_URL} target="_blank" rel="noopener">
            🐞 버그 신고·문의하기
          </a>
          <br />
          <a href="/guide">사용설명서</a> ·{' '}
          글꼴: 갈무리(Galmuri, OFL)
        </footer>
      </body>
    </html>
  );
}
