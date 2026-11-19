import type { Member } from '../env';
import { UPDATES, updatesMark } from '../updates';
import { Layout } from './layout';

// 업데이트 현황: 배포마다 한 줄씩, 최근 것이 위에
export function UpdatesPage(props: { viewer: Member | null }) {
  return (
    <Layout title="업데이트 현황" viewer={props.viewer}>
      <section class="panel upd-page" data-upd-seen={updatesMark()}>
        <h1>📋 업데이트 현황</h1>
        <p class="hint">새로 생기거나 바뀐 것을 배포할 때마다 한 줄씩 적어요.</p>
        <ol class="upd-list">
          {UPDATES.map((u) => (
            <li>
              <time datetime={u.day}>{`${Number(u.day.slice(5, 7))}월 ${Number(u.day.slice(8, 10))}일`}</time>
              <span>{u.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </Layout>
  );
}
