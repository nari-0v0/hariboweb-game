import type { Member } from '../env';
import { type BingoView, FULL_JELLY, LINE_JELLY, LINE_XP, LINES } from '../bingo';
import { Layout } from './layout';

const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' } as const;
const DIFF_STARS = { easy: '★', normal: '★★', hard: '★★★' } as const;

function shortDay(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const amount = (v: number, unit?: 'min') => (unit === 'min' && v >= 60 ? `${Math.floor(v / 60)}시간${v % 60 ? ` ${v % 60}분` : ''}` : unit === 'min' ? `${v}분` : String(v));

// 줄 번호 → 판 위에 긋는 선(칸 가운데를 지나요). 0~3 좌표.
function lineCoords(i: number) {
  const [a, , c] = LINES[i]!;
  const at = (n: number) => [(n % 3) + 0.5, Math.floor(n / 3) + 0.5] as const;
  const [x1, y1] = at(a!);
  const [x2, y2] = at(c!);
  // 끝을 조금 늘려서 칸 끝까지 닿게
  const dx = Math.sign(x2 - x1) * 0.32;
  const dy = Math.sign(y2 - y1) * 0.32;
  return { x1: x1 - dx, y1: y1 - dy, x2: x2 + dx, y2: y2 + dy };
}

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
  const lineCells = new Set(v.lines.flatMap((i) => LINES[i]!));
  // 한 칸만 더 채우면 줄이 되는 칸
  const nearCells = new Set(
    LINES.flatMap((l) => {
      const left = l.filter((x) => !v.cells[x]!.done);
      return left.length === 1 ? left : [];
    }),
  );
  const near = [...nearCells].map((i) => v.cells[i]!);
  return (
    <Layout title="이번 주 빙고" viewer={props.viewer} active="bingo">
      <div class="bgo">
        <section class="bgo-board" aria-label="빙고판">
          <header class="bgo-top">
            <h1>
              <span class="bgo-letter">빙</span>
              <span class="bgo-letter">고</span>
            </h1>
            <span class="bgo-week">
              {shortDay(v.week.start)} ~ {shortDay(endShown)}
            </span>
          </header>
          <div class="bgo-grid">
            {v.cells.map((x, i) => {
              const pct = x.done ? 100 : Math.round((x.value / x.target) * 100);
              return (
                <div class={`bgo-cell d-${x.diff}${x.done ? ' done' : ''}${lineCells.has(i) ? ' in-line' : ''}${nearCells.has(i) ? ' near' : ''}`}>
                  <span class="bgo-diff" title={DIFF_LABEL[x.diff]}>
                    <span aria-hidden="true">{DIFF_STARS[x.diff]}</span>
                    <span class="sr-only">{DIFF_LABEL[x.diff]}</span>
                  </span>
                  <span class="bgo-icon" aria-hidden="true">
                    {x.icon}
                  </span>
                  <span class="bgo-text">{x.text}</span>
                  {x.done ? (
                    <span class="bgo-stamp">완료</span>
                  ) : (
                    <span class="bgo-prog">
                      <span class="bgo-bar" aria-hidden="true">
                        <i style={`width:${pct}%`} />
                      </span>
                      <span class="bgo-count">
                        {amount(x.value, x.unit)} / {amount(x.target, x.unit)}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
            {v.lines.length > 0 && (
              <svg class="bgo-lines" viewBox="0 0 3 3" preserveAspectRatio="none" aria-hidden="true">
                {v.lines.map((i) => (
                  <line {...lineCoords(i)} />
                ))}
              </svg>
            )}
          </div>
        </section>

        <aside class="bgo-side">
          <section class="panel bgo-score">
            <h2>완성한 줄</h2>
            <p class="bgo-big">
              <b>{v.lines.length}</b> / {LINES.length}줄
            </p>
            <div class="bgo-pips" aria-hidden="true">
              {LINES.map((_, i) => (
                <i class={i < v.lines.length ? 'on' : undefined} />
              ))}
            </div>
            <dl class="bgo-got">
              <div>
                <dt>받은 젤리</dt>
                <dd>{v.jelly}개</dd>
              </div>
              <div>
                <dt>카드 경험치</dt>
                <dd>+{v.xp}</dd>
              </div>
            </dl>
          </section>

          <section class={`panel bgo-next${v.full ? ' all' : ''}`}>
            {v.full ? (
              <>
                <h2>9칸 다 채웠어요!</h2>
                <p>젤리 {FULL_JELLY}개를 더 받았어요. 다음 판을 기다려 주세요.</p>
              </>
            ) : near.length > 0 ? (
              <>
                <h2>한 칸만 더 채우면 빙고!</h2>
                <ul>
                  {near.map((x) => (
                    <li>
                      <span aria-hidden="true">{x.icon}</span> {x.text}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2>다 채우기까지</h2>
                <p>
                  {v.filled} / 9칸 채웠어요. 다 채우면 젤리 {FULL_JELLY}개를 더 받아요.
                </p>
              </>
            )}
          </section>

          <section class="bgo-rules">
            <p>활동하면 칸이 저절로 채워져요. 신청이나 인증은 없어요.</p>
            <p>
              한 줄마다 젤리 {LINE_JELLY}개 + 경험치 {LINE_XP}, 9칸을 다 채우면 젤리 {FULL_JELLY}개 더.
            </p>
            <p>빙고판은 생명력 주기를 반으로 나눠서, 한 주기에 2번 새로 나와요.</p>
          </section>
        </aside>
      </div>
    </Layout>
  );
}
