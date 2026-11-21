import type { Member } from '../env';
import { QA, QA_TABS, type QaCat } from '../qa';
import { Layout } from './layout';

// 자주 묻는 질문(Q&A): 위 칸을 누르면 그 게임 질문만 보여요(전체 = 모두)
export function QaPage(props: { viewer: Member | null; tab: 'all' | QaCat }) {
  const list = props.tab === 'all' ? QA : QA.filter((x) => x.cat === props.tab);
  const icon = (c: QaCat) => QA_TABS.find((t) => t.id === c)?.icon ?? '';
  return (
    <Layout title="Q&A" viewer={props.viewer}>
      <section class="panel qa-page">
        <h1>💡 자주 묻는 질문</h1>
        <p class="hint">질문을 누르면 답이 펼쳐져요. 새로 바뀐 것은 「업데이트 현황」에서 봐요.</p>
        <nav class="qa-tabs" aria-label="질문 고르기">
          {QA_TABS.map((t) => (
            <a href={t.id === 'all' ? '/qa' : `/qa?c=${t.id}`} class={t.id === props.tab ? 'on' : undefined} aria-current={t.id === props.tab ? 'page' : undefined}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </a>
          ))}
        </nav>
        <ul class="qa-list">
          {list.map((x) => (
            <li>
              <details>
                <summary>
                  {props.tab === 'all' && <span class="qa-cat" aria-hidden="true">{icon(x.cat)}</span>}
                  <span class="qa-q">{x.q}</span>
                </summary>
                <div class="qa-a">
                  {x.a.map((p) => (
                    <p>{p}</p>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}
