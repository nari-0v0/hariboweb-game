import { PREFETCH_RULES } from '../prefetch';
import type { Child } from 'hono/jsx';
import type { Member } from '../env';

type NavKey = 'me' | 'dogam' | 'shop' | 'plaza' | 'group' | 'bingo' | 'titles' | 'expedition' | 'cases' | 'room' | 'guide';

export function Layout(props: {
  title: string;
  viewer?: Member | null;
  active?: NavKey;
  refresh?: { seconds: number; url: string };
  wide?: boolean;
  scripts?: string[];
  children?: Child;
}) {
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
        <link rel="stylesheet" href="/styles.css?v=chapters-1" />
        <script src="/app.js?v=fast-act-1" defer></script>
        {props.scripts?.map((src) => <script src={src} defer></script>)}
        {props.viewer && <script type="speculationrules" dangerouslySetInnerHTML={{ __html: PREFETCH_RULES }} />}
      </head>
      <body>
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
            <label for="menu-toggle" class="menu-btn" role="button" tabindex={0} aria-label="메뉴 열기">
              <span class="menu-icon" aria-hidden="true"></span>
              <span class="menu-word">메뉴</span>
            </label>
          )}
        </header>
        {props.viewer && (
          <>
            <label for="menu-toggle" class="menu-scrim" aria-hidden="true"></label>
            <nav class="menu-panel" aria-label="메뉴">
              {nav('me', '/me', '내 카드', '🃏')}
              {nav('dogam', '/dogam', '도감', '📖')}
              {nav('group', '/group', '모둠', '👥')}
              {nav('bingo', '/bingo', '빙고', '🎯')}
              {nav('plaza', '/plaza', '광장', '🏞️')}
              {nav('expedition', '/expedition/go', '원정대', '🧭')}
              {nav('cases', '/cases/room', '사건파일', '🔎')}
              {nav('room', '/room', '내 방', '🏠')}
              {nav('shop', '/shop', '상점', '🍬')}
              {nav('guide', '/guide', '사용설명서', '📘')}
              <form method="post" action="/auth/logout">
                <button class="menu-out" type="submit">
                  로그아웃
                </button>
              </form>
            </nav>
          </>
        )}
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
          <a href="/guide">사용설명서</a> ·{' '}
          글꼴: 갈무리(Galmuri, OFL)
        </footer>
      </body>
    </html>
  );
}
