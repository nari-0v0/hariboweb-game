import type { Member } from '../env';
import type { Rankings } from '../rankings';
import { JP_FULL, JP_LINE, JP_SERVER, JP_TEAM } from '../team';
import { Layout } from './layout';
import { PodiumBoard } from './podium';

const n = (v: number) => v.toLocaleString('ko-KR');

export const RANK_TABS = [
  { id: 'dogam', label: '도감', icon: '📖' },
  { id: 'bingo', label: '빙고', icon: '🎯' },
  { id: 'journey', label: '원정대', icon: '🧭' },
  { id: 'escape', label: '사건파일', icon: '🔎' },
  { id: 'gamble', label: '겜블장', icon: '🎰' },
] as const;
export type RankTab = (typeof RANK_TABS)[number]['id'];
export const rankTab = (v: unknown): RankTab => (RANK_TABS.find((t) => t.id === v)?.id ?? 'dogam');

// 순위 메뉴: 게임마다 탭 하나. 탭 안에는 1·2·3위 시상대와 내 순위.
export function RankPage(props: { viewer: Member; ranks: Rankings; tab: RankTab }) {
  const r = props.ranks;
  const tab = props.tab;
  return (
    <Layout title="순위" viewer={props.viewer} active="rank">
      <div class="rk">
        <header class="rk-head">
          <h1>🏆 하리보 순위</h1>
          <p>지금 서버에 있는 멤버만 세요.</p>
        </header>
        <nav class="rk-tabs" aria-label="게임 고르기">
          {RANK_TABS.map((t) => (
            <a href={`/rank?g=${t.id}`} class={t.id === tab ? 'on' : undefined} aria-current={t.id === tab ? 'page' : undefined}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </a>
          ))}
        </nav>
        {tab === 'dogam' && <PodiumBoard title="모은 도감 카드" icon="🃏" podium={r.dogam} show={(v) => `${n(v)}장`} note="같이 논 사람 카드를 많이 모은 순" />}
        {tab === 'bingo' && (
          <div class="rk-pair">
            <PodiumBoard title="이번 시즌 젤리피" icon="🍬" podium={r.jellypiSeason} show={(v) => `${n(v)}`} />
            <PodiumBoard title="전체 젤리피" icon="🍭" podium={r.jellypiAll} show={(v) => `${n(v)}`} />
            <p class="rk-note">
              젤리피는 쓸 수 없는 기록이에요. 빙고 한 줄 {JP_LINE}, 9칸 {JP_FULL}, 팀 퀘스트 {JP_TEAM}, 서버 퀘스트 {JP_SERVER}.
            </p>
          </div>
        )}
        {tab === 'journey' && <PodiumBoard title="가장 높이 올라간 레벨" icon="🏔️" podium={r.journey} show={(v) => `Lv.${n(v)}`} />}
        {tab === 'escape' && <PodiumBoard title="해결한 사건" icon="🕵️" podium={r.escape} show={(v) => `${n(v)}건`} />}
        {tab === 'gamble' && (
          <div class="rk-pair">
            {r.gamble.seasonTop && (
              <p class="rk-champ">
                <span aria-hidden="true">👑</span> 이번 시즌 누적 딴 젤칩 1등 <b>{r.gamble.seasonTop.name}</b> · {n(r.gamble.seasonTop.value)}개
              </p>
            )}
            <PodiumBoard title="가진 젤칩" icon="🪙" podium={r.gamble.chips} show={(v) => `${n(v)}개`} />
            <PodiumBoard title="한 번에 딴 최고 젤칩" icon="💥" podium={r.gamble.best} show={(v) => `${n(v)}개`} />
            <PodiumBoard title="올인 승리" icon="🔥" podium={r.gamble.allIn} show={(v) => `${n(v)}회`} />
          </div>
        )}
      </div>
    </Layout>
  );
}
