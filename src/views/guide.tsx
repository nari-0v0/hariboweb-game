import type { Member } from '../env';
import { FULL_JELLY, LINE_JELLY, LINE_XP } from '../bingo';
import { KIDNAP_MIN, SERVER_JELLY, TEAM_GOAL_MIN, TEAM_JELLY, TEAM_PRIOR_MAX } from '../team';
import { PRAISE_PER_DAY, PRAISE_JELLY_PER_DAY } from '../db';
import { JELLY_PER_CARD_STEP, LEVEL_STEP } from '../sync';
import { DAILY_REWARD_JOURNEYS, JOURNEY_FINISH_JELLY } from '../journey';
import { ESC_XP } from '../escape';
import { DAILY_CHIPS, GAMBLE_LOCKED } from '../gamble';
import { Layout } from './layout';

// 사용설명서: 도감에서 할 수 있는 것과 젤리 모으는 법. 숫자는 코드 값을 그대로 보여 줘요.
// 글은 나리가 다듬은 판(2026-11-16)이에요. 숫자만 상수로 바꿔 넣었어요.
const fmt = (n: number) => n.toLocaleString('ko-KR');

export function GuidePage(props: { viewer: Member | null }) {
  const jellyRows: [string, string][] = [
    ['첫 입장 선물', '5개'],
    ['출석', '1개'],
    ['하루 통화 3시간', '3개'],
    [`카드 ${LEVEL_STEP}레벨 상승마다`, `${JELLY_PER_CARD_STEP}개`],
    ['칭찬받기', `1개 (하루 최대 ${PRAISE_JELLY_PER_DAY}개)`],
    ['빙고 한 줄 완성', `${LINE_JELLY}개`],
    ['빙고 전체 완성', `추가 ${FULL_JELLY}개`],
    ['서버 퀘스트 완료', `${SERVER_JELLY}개`],
    ['팀 퀘스트 완료', `${TEAM_JELLY}개`],
    ['원정대 최종 클리어 (최초)', `${JOURNEY_FINISH_JELLY}개`],
    ['사건파일 S·A 등급 (최초)', '1개'],
  ];
  const panelRows: [string, string][] = [
    ['내 카드', '내 카드·칭찬 확인'],
    ['칭찬하기', '멤버에게 칭찬 보내기'],
    ['우리 팀', '소속 팀 확인'],
    ['팀 순위', '팀별 순위 확인'],
    ['이번 주 빙고', '내 빙고판 확인'],
  ];
  return (
    <Layout title="사용설명서" viewer={props.viewer} active="guide">
      <section class="panel guide">
        <h1>📖 하리보 멤버 도감 사용설명서</h1>
        <p class="guide-lead">
          <b>함께 놀고, 카드를 모으고, 다양한 콘텐츠를 즐겨보세요!</b>
        </p>
        <p>별도의 신청이나 인증 없이 평소처럼 통화하고 게임하면 경험치와 보상이 자동으로 쌓여요.</p>

        <h2>🃏 01. 멤버 카드와 도감</h2>
        <p>모든 멤버에게는 카드가 있으며, 함께 활동할수록 성장해요.</p>
        <ul>
          <li>
            <b>함께 활동:</b> 통화·내전 시 두 사람의 카드에 경험치 지급
          </li>
          <li>
            <b>개인 활동:</b> 출석·서바이벌·빙고 등은 내 카드에 경험치 지급
          </li>
          <li>
            <b>도감 수집:</b> 함께 활동한 멤버의 카드를 모으고 다른 사람의 도감도 구경할 수 있어요.
          </li>
        </ul>
        <h3>카드 성장 단계</h3>
        <p class="guide-steps">첫 만남 → 친구(10) → 절친(30) → 단짝(60) → 평생 단짝(100)</p>
        <p>최대 100레벨까지 성장하며, {LEVEL_STEP}레벨마다 카드 색상이 바뀌어요.</p>

        <h2>🍬 02. 도감 젤리</h2>
        <p>활동하면서 모은 젤리로 상점에서 다양한 아이템을 구매할 수 있어요.</p>
        <table class="guide-table">
          <thead>
            <tr>
              <th>획득 방법</th>
              <th>젤리</th>
            </tr>
          </thead>
          <tbody>
            {jellyRows.map(([how, amount]) => (
              <tr>
                <td>{how}</td>
                <td>{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="guide-note">※ 도감 젤리는 겜블장에서 사용하는 젤칩과 별개의 재화예요.</p>

        <h2>🛒 03. 상점</h2>
        <p>
          상점은 <b>매점 · 꾸미기 · 칭호</b>로 구성되어 있어요.
        </p>
        <h3>🎨 꾸미기</h3>
        <ul>
          <li>다양한 카드 테마와 꾸밈 캐릭터를 구매할 수 있어요.</li>
          <li>처음 선택한 캐릭터 성별은 나중에 변경할 수 있어요.</li>
          <li>판타지 캐릭터는 구매할 수 없으며, 도감 수집량에 따라 해금돼요. 마지막 캐릭터는 도감을 모두 채우면 열려요.</li>
        </ul>
        <h3>🏷️ 칭호</h3>
        <ul>
          <li>구매하거나 특정 조건을 달성하면 칭호를 얻을 수 있어요.</li>
          <li>선택한 칭호는 디스코드 닉네임 앞에 자동 적용돼요.</li>
          <li>
            적용 예시: <span class="guide-code">「칭호」닉네임 생년</span>
          </li>
        </ul>
        <h3>🏪 매점</h3>
        <ul>
          <li>벌점·경고 지우기</li>
          <li>닉네임 변경권</li>
          <li>캐릭터 성별 바꾸기</li>
        </ul>
        <p class="guide-note">※ 벌점·경고 지우기는 구매할수록 가격이 올라가요.</p>

        <h2>💛 04. 칭찬하기</h2>
        <p>오늘 함께 활동한 멤버에게 익명으로 칭찬을 보낼 수 있어요.</p>
        <ul>
          <li>
            <b>대상:</b> 오늘 함께 통화하거나 내전을 한 멤버
          </li>
          <li>
            <b>횟수:</b> 하루 최대 {PRAISE_PER_DAY}번, 같은 멤버에게는 하루 1번
          </li>
          <li>
            <b>메시지:</b> 100자 이내의 한마디 또는 메시지 없이 전송 가능
          </li>
        </ul>
        <p>부적절한 메시지는 제외하고 칭찬만 전달돼요.</p>
        <p>
          받은 칭찬은{' '}
          <b>
            [내 카드] → [더 보러가기] → <a href="/me/praise">[칭찬함]</a>
          </b>
          에서 확인할 수 있어요.
        </p>
        <p class="guide-note">※ 받는 사람에게는 칭찬을 보낸 사람이 공개되지 않아요.</p>

        <h2>🎯 05. 하리보 빙고</h2>
        <p>
          생명력 주기(2주)마다 두 번의 <b>3×3 빙고</b>가 진행돼요.
        </p>
        <p>통화, 출석, 칭찬 등 평소 활동으로 칸이 자동 완성돼요.</p>
        <ul>
          <li>
            한 줄 완성: 젤리 {LINE_JELLY}개 + 카드 경험치 {LINE_XP}
          </li>
          <li>전체 완성: 젤리 {FULL_JELLY}개 추가</li>
        </ul>
        <h3>🟢 서버 퀘스트 — 초록하리보 납치 대소동!</h3>
        <p>서버 전체가 함께 참여하는 특별한 퀘스트예요.</p>
        <p>
          <b>초록하리보와 같은 통화방에서 {KIDNAP_MIN}분 이상 함께하면 납치 성공!</b>
        </p>
        <p>시즌 종료 시 서버 목표를 달성했다면 참여한 멤버에게 젤리 {SERVER_JELLY}개가 지급돼요.</p>
        <h3>🤝 팀 퀘스트</h3>
        <p>빙고판 가운데 칸은 팀원들과 함께 달성하는 퀘스트예요.</p>
        <ul>
          <li>
            <b>팀 구성:</b> 2주마다 활동 게임과 시간대가 비슷한 멤버끼리 약 10명씩 자동 배정
          </li>
          <li>
            <b>참여 대상:</b> 초록하리보 역할 보유자
          </li>
          <li>
            <b>개인 목표:</b> 지난 2주간 통화 시간이 {TEAM_PRIOR_MAX}분 미만인 팀원과 같은 통화방에서 {TEAM_GOAL_MIN}분 함께하기
          </li>
          <li>
            <b>팀 완료:</b> 시즌 시작 시 팀 후보 인원의 절반(반올림, 최소 2명)이 개인 목표 달성
          </li>
        </ul>
        <p>시즌 중 역할을 얻으면 인원이 가장 적은 팀에 배정되며, 팀원이 탈퇴하면 목표 인원도 조정돼요.</p>
        <p>시즌 종료 시 팀 목표를 달성했다면 직접 달성한 멤버에게 젤리 {TEAM_JELLY}개가 지급돼요.</p>
        <h3>같이 배정되지 않기</h3>
        <p>특정 멤버와 같은 팀이 되고 싶지 않다면 빙고 화면 아래에서 신청할 수 있어요.</p>
        <ul>
          <li>최대 3명까지 등록 가능</li>
          <li>AI가 사유를 검토하며, 부적절한 사유는 자동 반려</li>
          <li>상대에게 알림이 가지 않으며 언제든 해제 가능</li>
        </ul>
        <h3>🏆 젤리피와 순위</h3>
        <p>빙고 활동으로 쌓이는 젤리피는 순위용 기록이에요. 상점에서 사용할 수 없어요.</p>

        <h2>🧭 06. 원정대 · 사건파일</h2>
        <p>도감을 수집할수록 새로운 모험과 사건이 열려요.</p>
        <h3>⚔️ 원정대</h3>
        <p>캐릭터가 자동으로 이동하고 전투하는 RPG 콘텐츠예요.</p>
        <ul>
          <li>전투와 레벨업을 통해 캐릭터 성장</li>
          <li>레벨업 시 스킬 3개 중 하나 선택</li>
          <li>대장 처치 시 다음 장 해금</li>
          <li>하루 첫 {DAILY_REWARD_JOURNEYS}판은 카드 경험치 지급</li>
          <li>9장 대장 최초 클리어 시 젤리 {JOURNEY_FINISH_JELLY}개 지급</li>
        </ul>
        <p>
          <b>장비와 아이템</b>
        </p>
        <ul>
          <li>젤코인으로 훈련하거나 출발 준비물 구매</li>
          <li>강화 재료로 무기·갑옷·장신구를 +9까지 강화</li>
          <li>출발 준비물: 회복 물약·튼튼 방패·행운 부적</li>
        </ul>
        <p>이미 클리어한 장을 반복하면 보상이 감소하며, 감소 기록은 날짜가 바뀌어도 유지돼요.</p>
        <h3>🔎 사건파일</h3>
        <p>방 안의 물건을 조사하고 단서를 모아 사건을 해결하는 추리 콘텐츠예요.</p>
        <ul>
          <li>열쇠·비밀번호·수수께끼를 풀어 사건 해결</li>
          <li>사건 최초 해결 시 카드 경험치 {ESC_XP}</li>
          <li>S·A 등급 최초 해결 시 젤리 1개 추가</li>
        </ul>
        <h3>🔓 콘텐츠 해금</h3>
        <p>처음에는 원정대 1~3장과 사건파일 5개(입문 3개 + 맨 위 2개)를 이용할 수 있어요.</p>
        <p>이후 콘텐츠는 도감 수집량과 카드 레벨에 따라 순서대로 열려요. 자세한 조건은 잠긴 콘텐츠에서 확인할 수 있어요.</p>
        <p class="guide-note">※ 실패해도 불이익은 없지만, 원정 준비물 구매에 사용한 젤코인은 반환되지 않아요.</p>
        <p class="guide-note">※ 사건 속 등장인물은 실제 멤버의 이름만 빌린 가상 인물이에요.</p>

        <h2>🎰 07. 겜블장</h2>
        {/* 잠겨 있는 동안은 잠김 한 줄만 보여요(나리 2026-11-16). 다시 열면(GAMBLE_LOCKED 끄기) 아래 설명이 저절로 돌아와요. */}
        {GAMBLE_LOCKED ? (
          <p>
            <b>🔒 현재 잠금 상태로, 추후 개방 예정이에요.</b>
          </p>
        ) : (
          <>
            <p>슬롯·룰렛·카드 21·동전 던지기를 즐길 수 있어요.</p>
            <ul>
              <li>
                전용 재화인 <b>젤칩</b> 사용 (도감 젤리와 별개)
              </li>
              <li>매일 젤칩 {fmt(DAILY_CHIPS)}개 지급</li>
              <li>모두 잃으면 하루 한 번 추가 {fmt(DAILY_CHIPS)}개 지급</li>
              <li>젤칩 순위와 전용 칭호 제공</li>
              <li>서버 탈퇴 시 보유 젤칩 소멸</li>
            </ul>
            <h3>🏆 통합 순위</h3>
            <p>메뉴의 [순위]에서 도감·빙고·원정대·사건파일·겜블장의 TOP 3와 내 순위를 확인할 수 있어요.</p>
          </>
        )}

        <h2>📌 08. 디스코드 고정 패널</h2>
        <p>고정 패널에서 주요 기능을 바로 이용할 수 있어요.</p>
        <table class="guide-table">
          <thead>
            <tr>
              <th>버튼</th>
              <th>기능</th>
            </tr>
          </thead>
          <tbody>
            {panelRows.map(([button, what]) => (
              <tr>
                <td>{button}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>버튼을 누르면 나에게만 보이는 화면으로 열려요.</li>
          <li>개인 DM 알림은 발송되지 않아요.</li>
          <li>두 사람의 카드가 10레벨 단위로 성장하면 축하 채널에 메시지가 올라와요.</li>
        </ul>

        <div class="guide-end">
          <p>
            <b>💛 함께 놀다 보면 자연스럽게 성장하는 하리보 멤버 도감!</b>
          </p>
          <p>평소처럼 통화하고 게임하면서 카드를 모으고 다양한 콘텐츠를 즐겨주세요.</p>
        </div>
        {!props.viewer && (
          <p>
            <a class="btn btn-discord" href="/auth/login">디스코드로 시작하기</a>
          </p>
        )}
      </section>
    </Layout>
  );
}
