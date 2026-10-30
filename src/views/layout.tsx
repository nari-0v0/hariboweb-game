import type { Child } from 'hono/jsx';
import type { Member } from '../env';

export function Layout(props: { title: string; viewer?: Member | null; children?: Child }) {
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} · 하리보 멤버 도감</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap"
        />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <header class="topbar">
          <a class="brand" href="/">하리보 멤버 도감</a>
          {props.viewer && (
            <nav>
              <a href="/me">내 카드</a>
              <a href="/dogam">도감</a>
              <form method="post" action="/auth/logout">
                <button class="link" type="submit">로그아웃</button>
              </form>
            </nav>
          )}
        </header>
        <main>{props.children}</main>
      </body>
    </html>
  );
}
