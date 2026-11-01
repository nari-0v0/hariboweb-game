import type { Child } from 'hono/jsx';
import type { Member } from '../env';

type NavKey = 'me' | 'dogam' | 'shop';

export function Layout(props: { title: string; viewer?: Member | null; active?: NavKey; refresh?: number; children?: Child }) {
  const nav = (key: NavKey, href: string, label: string) => (
    <a href={href} class={props.active === key ? 'on' : undefined} aria-current={props.active === key ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {props.refresh && <meta http-equiv="refresh" content={String(props.refresh)} />}
        <title>{props.title} · 하리보 멤버 도감</title>
        <link rel="preload" href="/fonts/Galmuri11.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="stylesheet" href="/styles.css" />
        <script src="/app.js" defer></script>
      </head>
      <body>
        <div class="sky" aria-hidden="true">
          <i class="cloud c1" />
          <i class="cloud c2" />
          <i class="cloud c3" />
        </div>
        <header class="topbar">
          <a class="brand" href="/">
            <span class="brand-mark" aria-hidden="true"></span>
            <span class="brand-text">하리보 멤버 도감</span>
          </a>
          {props.viewer && (
            <nav class="nav">
              {nav('me', '/me', '내 카드')}
              {nav('dogam', '/dogam', '도감')}
              {nav('shop', '/shop', '상점')}
              <form method="post" action="/auth/logout">
                <button class="nav-out" type="submit">로그아웃</button>
              </form>
            </nav>
          )}
        </header>
        <main>{props.children}</main>
        <footer class="foot">
          글꼴: 갈무리(Galmuri, OFL)
        </footer>
      </body>
    </html>
  );
}
