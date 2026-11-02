import type { Member } from '../env';
import { FULL_JELLY, LINE_JELLY, LINE_XP } from '../bingo';
import { PRICES, REWARD_STEP } from '../shop';
import { STARTER_JELLY, PRAISE_PER_DAY, PRAISE_JELLY_PER_DAY } from '../db';
import { JELLY_PER_CARD_STEP, LEVEL_STEP } from '../sync';
import { Layout } from './layout';

// 사용설명서: 도감에서 할 수 있는 것과 젤리 모으는 법. 숫자는 코드 값을 그대로 보여 줘요.
export function GuidePage(props: { viewer: Member | null }) {
  return (
    <Layout title="사용설명서" viewer={props.viewer} active="guide">
      <section class="panel guide">
        <h1>사용설명서</h1>
        <p class="muted">하리보 멤버 도감에서 할 수 있는 것들이에요. 신청이나 인증은 없고, 같이 놀면 저절로 쌓여요.</p>

        <h2>🃏 카드와 도감</h2>
        <ul>
          <li>멤버마다 카드가 한 장씩 있어요. 같이 통화하거나 내전을 뛰면 <b>두 사람의 카드가 함께</b> 경험치를 받아요.</li>
          <li>출석, 서바이벌, 빙고처럼 혼자 하는 활동은 내 카드에 쌓여요.</li>
          <li>레벨은 100까지예요. 첫 만남 → 친구(10) → 절친(30) → 단짝(60) → 평생 단짝(100). 카드 색은 {LEVEL_STEP}레벨마다 바뀌어요.</li>
          <li>같이 논 사람의 카드가 내 도감에 모여요. 다른 멤버의 도감도 구경할 수 있어요.</li>
        </ul>

        <h2>🍬 도감 젤리</h2>
        <p>도감 젤리는 도감에서만 쓰는 젤리예요. 겜블 젤리와는 따로예요.</p>
        <ul>
          <li>처음 한 번 {STARTER_JELLY}개</li>
          <li>출석 1개, 하루 통화 3시간 3개</li>
          <li>도감 카드가 {LEVEL_STEP}레벨 오를 때마다 {JELLY_PER_CARD_STEP}개</li>
          <li>칭찬을 받으면 1개 (하루 {PRAISE_JELLY_PER_DAY}개까지)</li>
          <li>모둠 퀘스트를 깨면 1~3개, 빙고 한 줄마다 {LINE_JELLY}개</li>
        </ul>

        <h2>🛒 상점</h2>
        <ul>
          <li>카드 테마 {PRICES.theme}개, 꾸밈 캐릭터 {PRICES.deco}개예요.</li>
          <li>판타지 캐릭터는 젤리로 못 사요. 도감 카드를 {REWARD_STEP}장 모을 때마다 하나씩 열려요.</li>
        </ul>

        <h2>💛 칭찬하기</h2>
        <ul>
          <li>디스코드 고정 패널의 <b>칭찬하기</b> 버튼으로 해요.</li>
          <li>오늘 같이 통화했거나 내전을 뛴 사람에게만, 하루 {PRAISE_PER_DAY}번, 같은 사람에게는 하루 1번 줄 수 있어요.</li>
        </ul>

        <h2>🧩 우리 모둠</h2>
        <ul>
          <li>생명력 주기(2주)마다 같은 게임 하는 사람끼리 10명쯤 모둠이 돼요.</li>
          <li>모둠마다 퀘스트 8개가 나와요. 하나 깰 때마다 모둠원 모두 젤리를 받고, 8개를 다 깨면 시즌 칭호를 받아요.</li>
          <li>모둠 순위는 깬 퀘스트가 많은 순, 같으면 모둠끼리 같이 통화한 시간이 긴 순이에요.</li>
        </ul>

        <h2>🎯 이번 주 빙고</h2>
        <ul>
          <li>생명력 주기를 반으로 나눠, 한 주기에 2번 나만의 3×3 빙고판이 나와요.</li>
          <li>통화, 출석, 칭찬 같은 활동을 하면 칸이 저절로 채워져요.</li>
          <li>한 줄마다 젤리 {LINE_JELLY}개와 내 카드 경험치 {LINE_XP}, 9칸을 다 채우면 젤리 {FULL_JELLY}개를 더 받아요.</li>
        </ul>

        <h2>🌳 광장</h2>
        <ul>
          <li>멤버들과 같이 돌아다니는 지도예요. 통화방 상자에 들어가 멈추면 디스코드에서 그 통화방으로 옮겨져요.</li>
          <li>디스코드 통화방에 먼저 들어가 있어야 옮길 수 있어요. 통화방 채팅은 말풍선으로 보여요(저장하지 않아요).</li>
        </ul>

        <h2>📌 디스코드 고정 패널</h2>
        <ul>
          <li>내 카드, 칭찬하기, 우리 모둠, 모둠 순위, 이번 주 빙고 버튼이 있어요. 누르면 나만 보이는 창으로 열려요.</li>
          <li>알림은 보내지 않아요. 궁금할 때 버튼을 눌러 보세요.</li>
        </ul>
        {!props.viewer && (
          <p>
            <a class="btn btn-discord" href="/auth/login">디스코드로 시작하기</a>
          </p>
        )}
      </section>
    </Layout>
  );
}
