import type { Member } from '../env';
import { type BingoView, FULL_JELLY, LINE_JELLY, LINE_XP } from '../bingo';
import { Layout } from './layout';

const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' } as const;

function shortDay(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const amount = (v: number, unit?: 'min') => (unit === 'min' && v >= 60 ? `${Math.floor(v / 60)}시간${v % 60 ? ` ${v % 60}분` : ''}` : unit === 'min' ? `${v}분` : String(v));

// 이번 주 빙고: 3×3 칸, 채운 칸과 줄, 받은 보상
export function BingoPage(props: { viewer: Member; view: BingoView | null }) {
  const v = props.view;
  if (!v) {
    return (
      <Layout title="이번 주 빙고" viewer={props.viewer} active="bingo">
        <section class="panel message">
          <h1>빙고를 불러오지 못했어요</h1>
          <p class="muted">잠시 뒤에 다시 들어와 주세요.</p>
        </section>
      </Layout>
    );
  }
  const endShown = new Date(Date.parse(v.week.end) - 1).toISOString();
  const lineCells = new Set(v.lines.flatMap((i) => [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]][i]!));
  return (
    <Layout title="이번 주 빙고" viewer={props.viewer} active="bingo">
      <section class="panel bingo-head">
        <div class="panel-head">
          <h1>이번 주 빙고</h1>
          <span class="chip">
            {shortDay(v.week.start)} ~ {shortDay(endShown)}
          </span>
          {v.lines.length > 0 && <span class="chip sprout">{v.full ? '9칸 다 채움!' : `${v.lines.length}줄 완성!`}</span>}
        </div>
        <p class="muted">
          활동하면 칸이 저절로 채워져요. 신청이나 인증은 없어요. 한 줄마다 젤리 {LINE_JELLY}개와 내 카드 경험치 {LINE_XP}, 9칸을 다 채우면 젤리 {FULL_JELLY}개를 더 받아요.
          빙고판은 생명력 주기를 반으로 나눠서, 한 주기에 2번 새로 나와요.
        </p>
      </section>
      <section class="bingo" aria-label="빙고판">
        {v.cells.map((x, i) => (
          <div class={`bingo-cell diff-${x.diff}${x.done ? ' done' : ''}${lineCells.has(i) ? ' line' : ''}`}>
            <span class="bingo-icon" aria-hidden="true">
              {x.icon}
            </span>
            <span class="bingo-text">{x.text}</span>
            <span class="bingo-count">{x.done ? '완료!' : `${amount(x.value, x.unit)} / ${amount(x.target, x.unit)}`}</span>
            <span class="sr-only">{DIFF_LABEL[x.diff]}</span>
          </div>
        ))}
      </section>
      <section class="panel bingo-sum">
        <div>
          <b>채운 칸</b>
          <span>{v.filled} / 9칸</span>
        </div>
        <div>
          <b>완성한 줄</b>
          <span>
            {v.lines.length}줄 · 젤리 {v.jelly} · 경험치 {v.xp}
          </span>
        </div>
      </section>
    </Layout>
  );
}
