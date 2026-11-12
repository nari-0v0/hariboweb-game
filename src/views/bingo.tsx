import type { Member } from '../env';
import { type BingoView, FULL_JELLY, LINE_JELLY, LINE_XP, LINES } from '../bingo';
import {
  type BingoExtras,
  type JellypiRanking,
  JP_FULL,
  JP_LINE,
  JP_SERVER,
  JP_TEAM,
  KIDNAP_MIN,
  SERVER_JELLY,
  TEAM_GOAL_MIN,
  TEAM_JELLY,
  TEAM_PRIOR_MAX,
} from '../team';
import { Layout } from './layout';
import { BLOCK_HELP, BLOCK_LIMIT_NOTICE, BLOCK_MAX_PENDING, BLOCK_NOTICE, BLOCK_QUESTION, BLOCK_REASON_MAX, BLOCK_UNDO_NOTICE, type MyBlock } from '../assign-block';

// 같이 배정되지 않기: 다시 물을 때 적은 내용을 그대로 보여 줘요
export type BlockForm = { to: string; reason: string; msg: string; asked: boolean };
export type BlockBox = { candidates: { id: string; name: string }[]; form?: BlockForm; sent?: boolean; mine?: MyBlock[]; undone?: boolean };

function BlockSection(props: { box: BlockBox }) {
  const { candidates, form, sent, undone } = props.box;
  const mine = props.box.mine ?? [];
  const full = mine.length >= BLOCK_MAX_PENDING;
  return (
    <details class="panel bgo-block" id="block" open={!!form || !!sent || !!undone}>
      <summary>🚫 같이 배정되지 않기</summary>
      <p class="bgo-block-limit">{BLOCK_LIMIT_NOTICE}</p>
      {mine.length > 0 && (
        <div class="bgo-block-mine">
          <b>
            내가 제외한 사람 {mine.length} / {BLOCK_MAX_PENDING}명
          </b>
          <ul>
            {mine.map((b) => (
              <li>
                <span class="bgo-block-name">{b.name}</span>
                <span class="bgo-block-state">{b.state === 'approved' ? '제외됨' : '검토 중'}</span>
                <form method="post" action="/bingo/block/cancel#block">
                  <input type="hidden" name="id" value={String(b.id)} />
                  <button class="btn btn-small" type="submit">
                    풀기
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p class="bgo-block-notice">{BLOCK_UNDO_NOTICE}</p>
        </div>
      )}
      {undone && <p class="bgo-block-done">풀었어요. 다음 팀 짜기부터 다시 같은 팀이 될 수 있어요.</p>}
      {sent ? (
        <p class="bgo-block-done">접수했어요.</p>
      ) : full ? (
        <p class="bgo-block-msg">이미 {BLOCK_MAX_PENDING}명을 제외했어요. 다른 사람을 제외하려면 위에서 한 명을 풀어 주세요.</p>
      ) : (
        <form method="post" action="/bingo/block#block" class="bgo-block-form">
          <label class="bgo-block-label" for="block-find">
            멤버
          </label>
          <input id="block-find" class="bgo-block-find" type="search" placeholder="이름으로 찾기" autocomplete="off" data-filter="block-to" />
          <select id="block-to" name="to" required size={5}>
            {candidates.map((m) => (
              <option value={m.id} selected={form?.to === m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label class="bgo-block-label" for="block-reason">
            {BLOCK_QUESTION}
          </label>
          <p class="bgo-block-help">{BLOCK_HELP}</p>
          {form?.msg && <p class="bgo-block-msg">{form.msg}</p>}
          <textarea id="block-reason" name="reason" rows={4} maxlength={BLOCK_REASON_MAX} required>
            {form?.reason ?? ''}
          </textarea>
          {form?.asked && <input type="hidden" name="asked" value="1" />}
          <p class="bgo-block-notice">
            {BLOCK_NOTICE.map((line, i) => (
              <>
                {i > 0 && <br />}
                {line}
              </>
            ))}
          </p>
          <button class="btn" type="submit">
            보내기
          </button>
        </form>
      )}
    </details>
  );
}

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

const TEAM_STATE = {
  done: '나는 달성!',
  todo: '나는 아직',
  'team-done': '팀 완료, 나는 아직',
  bonus: '보너스 칸',
  none: '이번 시즌 팀이 없어요',
} as const;

// 서버 퀘스트: 초록하리보 납치 대소동! (판 위 큰 진행 막대)
function ServerQuestBar(props: { extras: BingoExtras; me: string }) {
  const q = props.extras.server;
  if (!q) return null;
  const n = Math.min(q.kidnapped.length, q.target);
  const pct = q.target ? Math.round((n / q.target) * 100) : 0;
  const joined = q.participants.includes(props.me);
  return (
    <section class={`panel bgo-server${q.met ? ' met' : ''}`} aria-label="서버 퀘스트">
      <div class="bgo-server-head">
        <span class="bgo-server-tag">서버 퀘스트</span>
        <h2>초록하리보 납치 대소동!</h2>
      </div>
      <p class="bgo-server-text">초록하리보를 통화방으로 납치해 오세요! 같은 방에서 {KIDNAP_MIN}분 함께하면 납치 성공.</p>
      <div class="bgo-server-bar" aria-hidden="true">
        <i style={`width:${pct}%`} />
      </div>
      <p class="bgo-server-count">
        납치된 초록하리보 <b>{q.kidnapped.length}</b> / {q.target}명
        {joined && <span class="bgo-chip">나도 참여!</span>}
      </p>
      <p class="bgo-server-reward">
        시즌이 끝날 때 목표를 채웠으면 참여한 사람 모두 젤리 {SERVER_JELLY}개 + 젤리피 {JP_SERVER}. 못 채우면 아무도 못 받아요.
      </p>
    </section>
  );
}

// 가운데 칸 팀 퀘스트 자세히
function TeamPanel(props: { extras: BingoExtras; view: BingoView; me: string }) {
  const t = props.extras.team;
  const state = props.view.team;
  if (!t) {
    return (
      <section class="panel bgo-team">
        <h2>👫 팀 퀘스트</h2>
        <p>이번 시즌 팀이 아직 없어요. 통화방에서 놀면 팀이 생겨요.</p>
      </section>
    );
  }
  const pct = t.target ? Math.round((Math.min(t.achievers.length, t.target) / t.target) * 100) : 100;
  const done = new Set(t.achievers);
  const mates = t.members.filter((m) => !m.left);
  return (
    <section class={`panel bgo-team${t.complete ? ' met' : ''}`}>
      <h2>👫 팀 퀘스트 · {t.no + 1}팀</h2>
      <div class="bgo-mates">
        <b>우리 팀원 {mates.length}명{t.bonus ? '' : ' · ✓ 달성'}</b>
        <ul aria-label="우리 팀원">
          {mates.map((m) => (
            <li class={`${done.has(m.id) ? 'done' : ''}${m.id === props.me ? ' me' : ''}`.trim() || undefined}>
              {done.has(m.id) ? '✓ ' : ''}
              {m.name}
              {m.id === props.me ? ' (나)' : ''}
            </li>
          ))}
        </ul>
      </div>
      <p class="bgo-team-text">
        지난 2주간 {TEAM_PRIOR_MAX}분 미만 통화자와 이번 시즌에 같은 통화방에서 {TEAM_GOAL_MIN}분 함께하기
      </p>
      {t.bonus ? (
        <p class="bgo-team-bonus">우리 팀은 후보가 2명보다 적어서 가운데 칸을 보너스 칸으로 채웠어요. (팀 퀘스트 보상은 없어요)</p>
      ) : (
        <>
          <p class="bgo-team-count">
            우리 팀 <b>{t.achievers.length}</b> / {t.target}명
          </p>
          <div class="bgo-server-bar small" aria-hidden="true">
            <i style={`width:${pct}%`} />
          </div>
          <p class={`bgo-team-me s-${state}`}>{TEAM_STATE[state]}</p>
          <p class="bgo-team-reward">
            시즌이 끝날 때 팀 목표를 채웠으면 달성한 사람만 젤리 {TEAM_JELLY}개 + 젤리피 {JP_TEAM}.
          </p>
        </>
      )}
    </section>
  );
}

function RankList(props: { title: string; rank: JellypiRanking }) {
  const { top, me } = props.rank;
  return (
    <div class="bgo-rank">
      <h3>{props.title}</h3>
      {top.length === 0 ? (
        <p class="muted">아직 모은 사람이 없어요.</p>
      ) : (
        <ol>
          {top.map((r) => (
            <li class={me?.id === r.id ? 'mine' : undefined}>
              <span class="bgo-rank-no">{r.rank}</span>
              <span class="bgo-rank-name">{r.name}</span>
              <span class="bgo-rank-n">{r.total}</span>
            </li>
          ))}
        </ol>
      )}
      {me && me.rank > top.length && (
        <p class="bgo-rank-me">
          내 순위 {me.rank}위 · {me.total}
        </p>
      )}
    </div>
  );
}

// 하리보 빙고: 서버 퀘스트 막대, 3×3 칸(가운데 = 팀 퀘스트), 채운 칸과 줄, 받은 보상, 젤리피 순위
export function BingoPage(props: { viewer: Member; view: BingoView | null; extras?: BingoExtras | null; block?: BlockBox }) {
  const v = props.view;
  const extras = props.extras ?? null;
  if (!v) {
    return (
      <Layout title="하리보 빙고" viewer={props.viewer} active="bingo">
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
    <Layout title="하리보 빙고" viewer={props.viewer} active="bingo">
      {extras && <ServerQuestBar extras={extras} me={props.viewer.user_id} />}
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
                <div class={`bgo-cell d-${x.diff}${x.center ? ' bgo-center' : ''}${x.done ? ' done' : ''}${lineCells.has(i) ? ' in-line' : ''}${nearCells.has(i) ? ' near' : ''}`}>
                  {x.center ? (
                    <span class="bgo-diff bgo-diff-team">팀</span>
                  ) : (
                    <span class="bgo-diff" title={DIFF_LABEL[x.diff]}>
                      <span aria-hidden="true">{DIFF_STARS[x.diff]}</span>
                      <span class="sr-only">{DIFF_LABEL[x.diff]}</span>
                    </span>
                  )}
                  <span class="bgo-icon" aria-hidden="true">
                    {x.icon}
                  </span>
                  <span class="bgo-text">{x.text}</span>
                  {x.done ? (
                    <span class="bgo-stamp">{x.center && v.team === 'bonus' ? '보너스' : '완료'}</span>
                  ) : x.center ? (
                    <span class="bgo-count">{extras?.team && !extras.team.bonus ? `우리 팀 ${extras.team.achievers.length}/${extras.team.target}명` : ''}</span>
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
          {extras && <TeamPanel extras={extras} view={v} me={props.viewer.user_id} />}
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

          {extras && (
            <section class="panel bgo-ranks">
              <h2>🍬 젤리피 순위</h2>
              <p class="bgo-rank-help">젤리피는 쓸 수 없는 기록이에요. 빙고 한 줄 {JP_LINE}, 9칸 {JP_FULL}, 팀 퀘스트 {JP_TEAM}, 서버 퀘스트 {JP_SERVER}.</p>
              <div class="bgo-rank-cols">
                <RankList title="이번 시즌" rank={extras.ranks.season} />
                <RankList title="전체" rank={extras.ranks.all} />
              </div>
            </section>
          )}

          <section class="bgo-rules">
            <p>활동하면 칸이 저절로 채워져요. 신청이나 인증은 없어요.</p>
            <p>
              한 줄마다 젤리 {LINE_JELLY}개 + 경험치 {LINE_XP}, 9칸을 다 채우면 젤리 {FULL_JELLY}개 더.
            </p>
            <p>가운데 칸은 팀 퀘스트예요. 내가 달성하거나 우리 팀이 목표를 채우면 채워져요.</p>
            <p>빙고판은 생명력 주기를 반으로 나눠서, 한 주기에 2번 새로 나와요. 팀과 퀘스트는 주기(2주) 내내 이어져요.</p>
          </section>
        </aside>
      </div>
      {props.block && <BlockSection box={props.block} />}
    </Layout>
  );
}
