import type { Member } from '../env';
import type { Rankings } from '../rankings';
import { JP_FULL, JP_LINE, JP_SERVER, JP_TEAM } from '../team';
import { Layout } from './layout';
import { PodiumBoard } from './podium';

const n = (v: number) => v.toLocaleString('ko-KR');

// 순위 메뉴: 게임마다 1·2·3위 시상대와 내 순위
export function RankPage(props: { viewer: Member; ranks: Rankings }) {
  const r = props.ranks;
  return (
    <Layout title="순위" viewer={props.viewer} active="rank">
      <section class="panel rk-head">
        <h1>🏆 하리보 순위</h1>
        <p class="muted">지금 서버에 있는 멤버만 세요. 3위까지 보여 주고, 내 순위는 아래에 따로 보여요.</p>
      </section>
      <div class="rk-grid">
        <div class="rk-group">
          <h2>📖 도감</h2>
          <PodiumBoard title="모은 도감 카드" icon="🃏" podium={r.dogam} show={(v) => `${n(v)}장`} />
        </div>
        <div class="rk-group">
          <h2>🎯 하리보 빙고 · 젤리피</h2>
          <PodiumBoard title="이번 시즌 젤리피" icon="🍬" podium={r.jellypiSeason} show={n} />
          <PodiumBoard title="전체 젤리피" icon="🍭" podium={r.jellypiAll} show={n} />
          <p class="rk-note">
            젤리피는 쓸 수 없는 기록이에요. 빙고 한 줄 {JP_LINE}, 9칸 {JP_FULL}, 팀 퀘스트 {JP_TEAM}, 서버 퀘스트 {JP_SERVER}.
          </p>
        </div>
        <div class="rk-group">
          <h2>🧭 원정대</h2>
          <PodiumBoard title="가장 높이 올라간 레벨" icon="🏔️" podium={r.journey} show={(v) => `Lv.${n(v)}`} />
        </div>
        <div class="rk-group">
          <h2>🔎 사건파일</h2>
          <PodiumBoard title="해결한 사건" icon="🕵️" podium={r.escape} show={(v) => `${n(v)}건`} />
        </div>
        <div class="rk-group rk-wide">
          <h2>🎰 겜블장</h2>
          {r.gamble.seasonTop && (
            <p class="rk-champ">
              <span aria-hidden="true">👑</span> 이번 시즌 누적 딴 젤칩 1등 <b>{r.gamble.seasonTop.name}</b> · {n(r.gamble.seasonTop.value)}개
            </p>
          )}
          <div class="rk-cols">
            <PodiumBoard title="가진 젤칩" icon="🪙" podium={r.gamble.chips} show={(v) => `${n(v)}개`} />
            <PodiumBoard title="한 번에 딴 최고 젤칩" icon="💥" podium={r.gamble.best} show={(v) => `${n(v)}개`} />
            <PodiumBoard title="올인 승리" icon="🔥" podium={r.gamble.allIn} show={(v) => `${n(v)}회`} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
