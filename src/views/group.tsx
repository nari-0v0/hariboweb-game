import type { Member } from '../env';
import type { GroupView } from '../season';
import { QUESTS_PER_GROUP } from '../quests';
import { Layout } from './layout';

const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' } as const;
const TOTAL = QUESTS_PER_GROUP.easy + QUESTS_PER_GROUP.normal + QUESTS_PER_GROUP.hard;

function shortDay(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`);

// 우리 모둠: 이번 시즌 모둠원과 퀘스트 8개 진행도
export function GroupPage(props: { viewer: Member; view: GroupView | null }) {
  const v = props.view;
  if (!v) {
    return (
      <Layout title="우리 모둠" viewer={props.viewer} active="group">
        <section class="panel message">
          <h1>아직 모둠이 없어요</h1>
          <p class="muted">시즌이 시작될 때 최근 2주 동안 활동한 멤버로 모둠을 만들어요. 시즌 중에 같이 통화하면 모둠에 들어가요.</p>
          <a class="btn btn-primary" href="/me">내 카드로</a>
        </section>
      </Layout>
    );
  }
  const done = v.quests.filter((q) => q.done).length;
  const endShown = new Date(Date.parse(v.season.end) - 1).toISOString();
  return (
    <Layout title="우리 모둠" viewer={props.viewer} active="group">
      <section class="panel group">
        <div class="panel-head">
          <h1>{v.groupNo + 1}모둠</h1>
          <span class="chip">
            {shortDay(v.season.start)} ~ {shortDay(endShown)}
          </span>
          <span class="chip">
            퀘스트 {done}/{TOTAL}
          </span>
        </div>
        <p class="muted">모둠원끼리 같이 하면 채워져요. 하나 깰 때마다 모둠원 모두 도감 젤리를 받고, 8개를 다 깨면 시즌 칭호를 받아요.</p>
        <ul class="group-members">
          {v.members.map((m) => (
            <li>
              <a href={m.id === props.viewer.user_id ? '/me' : `/card/${m.id}`}>{m.name}</a>
              {!m.start && <span class="tag">새로 왔어요</span>}
            </li>
          ))}
        </ul>
      </section>
      <section class="quest-list">
        {v.quests.map((q) => (
          <article class={`panel quest${q.done ? ' done' : ''}`}>
            <div class="quest-head">
              <span class={`tag diff-${q.diff}`}>{DIFF_LABEL[q.diff]}</span>
              <span class="tag">{q.cat}</span>
              <span class="jelly">젤리 {q.reward}</span>
            </div>
            <h2>{q.name}</h2>
            <p>{q.text}</p>
            <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.value}>
              <div class="bar-fill" style={`width:${Math.round((q.value / Math.max(1, q.target)) * 100)}%`} />
            </div>
            <p class="quest-count">{q.done ? '완료!' : `${q.value} / ${q.target}`}</p>
          </article>
        ))}
      </section>
      <section class="panel">
        <h2>모둠 순위</h2>
        <p class="muted">깬 퀘스트가 많은 모둠이 위예요. 같으면 모둠끼리 같이 통화한 시간이 긴 모둠이 위예요.</p>
        <ol class="rank-list">
          {v.ranking.map((r) => (
            <li class={r.mine ? 'mine' : undefined}>
              <b>{r.rank}위</b>
              <span>
                {r.no + 1}모둠{r.mine ? ' (우리)' : ''}
              </span>
              <span>
                퀘스트 {r.done}/{r.total}
              </span>
              <span>통화 {hm(r.minutes)}</span>
            </li>
          ))}
        </ol>
      </section>
      {v.titles.length > 0 && (
        <section class="panel">
          <h2>내 시즌 칭호</h2>
          <p>{v.titles.join(' · ')}</p>
        </section>
      )}
    </Layout>
  );
}
