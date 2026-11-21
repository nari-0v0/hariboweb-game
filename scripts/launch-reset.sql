-- 정식 시작 초기화 (나리가 "시작"이라고 할 때 한 번만 실행)
-- 실행: npx wrangler d1 execute haribo-dogam --remote --file scripts/launch-reset.sql
-- 되돌리기: 실행 전에 찍어 둔 D1 Time Travel 북마크로 복구해요(30일 안).
--
-- 지우는 것: 카드·도감(경험치, 레벨, 통화 시간), 혼자 경험치, 도감 젤리(처음 선물 5개만 남김),
--   자기소개, 성별 고른 표시(나리 빼고, 나리 2026-11-16), 산 물건·칭호, 칭찬, 빙고, 시즌 칭호, 납치 대소동 진행, 젤리피, 원정대·사건파일 진행, 같이 배정되지 않기.
-- 남기는 것: 지금 있는 멤버 목록(나간 멤버는 지움), 캐릭터(성별은 다음에 들어올 때 다시 골라요), 이번 시즌(안 끝난 시즌) 팀과 팀 퀘스트 짝, 서버 퀘스트 목표(18명),
--   지난 시즌 정산 표시(season_settle: 지우면 지난 시즌 보상을 또 줘요), 봇 동기화 기록,
--   겜블장 전체(젤칩, 판 기록, 겜블 시즌 우승자, 겜블장 칭호와 달고 있던 겜블장 칭호: 나리 2026-11-15 결정으로 초기화하지 않아요).

DELETE FROM cards;
-- 겜블장 칭호(title:gamble-…, 도박신 포함)는 겜블장 기록이라 남겨요.
DELETE FROM owned_items WHERE item_id NOT LIKE 'title:gamble-%';
DELETE FROM purchases;
DELETE FROM nick_jobs;
DELETE FROM alerts;
DELETE FROM jelly_grants;
DELETE FROM card_count_rewards;
DELETE FROM praises;
-- 칭찬 한마디의 AI 판단 기록(원래 글이 남아 있어요)도 칭찬과 같이 지워요.
DELETE FROM ai_logs;
DELETE FROM bingo_lines;
DELETE FROM bingo_day;
DELETE FROM bingo_pair;
DELETE FROM bingo_flag;
DELETE FROM pair_day;
DELETE FROM member_voice_day;
DELETE FROM member_voice_slot;
DELETE FROM gq_voice;
DELETE FROM gq_member_day;
DELETE FROM gq_member_gameday;
DELETE FROM gq_pair;
DELETE FROM gq_room;
DELETE FROM gq_run;
DELETE FROM gq_scrim;
DELETE FROM gq_newbie;
DELETE FROM gq_attend;
DELETE FROM season_snap;
-- 끝난 시즌의 팀 기록도 지워요. 남겨 두면 "끝까지 함께한 시즌" 칭호가 바로 다시 생겨요(title-db.ts loadTitleStats).
-- 이번 시즌(아직 안 끝난 시즌) 팀은 그대로 둬요.
DELETE FROM season_quests WHERE season_id IN (SELECT id FROM seasons WHERE ends_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
DELETE FROM season_members WHERE season_id IN (SELECT id FROM seasons WHERE ends_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
DELETE FROM season_titles;
DELETE FROM kidnap_min;
DELETE FROM season_pair_reset;
DELETE FROM jellypi;
DELETE FROM exp_finds;
DELETE FROM exp_runs;
DELETE FROM case_runs;
DELETE FROM story_marks;
DELETE FROM story_rewards;
DELETE FROM story_runs;
DELETE FROM escape_rewards;
DELETE FROM escape_runs;
-- 재수사·오늘의 사건·사건 첫 보상 표와 게임 초기화권 기록도 지워요(점검 2026-11-21).
-- 남겨 두면 처음으로 되돌린 계정이 옛 연속 기록을 보고, 새로 깬 사건·원정대 첫 보상도 못 받아요.
DELETE FROM escape_re;
DELETE FROM escape_daily;
DELETE FROM escape_daily_stats;
DELETE FROM escape_paid;
DELETE FROM game_resets;
DELETE FROM journey_bank;
DELETE FROM journey_runs;
DELETE FROM room_likes;
DELETE FROM rooms;
DELETE FROM assign_blocks;

-- 내 카드: 경험치 0, 산 꾸미기는 기본으로, 칭호는 떼요(title_applied는 그대로 둬서 봇이 닉네임 앞 칭호를 떼게 해요).
-- 젤리는 처음 선물(5개)을 이미 받은 사람만 5개. 아직 안 받은 사람은 처음 들어올 때 받아요.
UPDATE profiles SET
  solo_xp = 0,
  intro = '',
  dogam_jelly = CASE WHEN EXISTS (SELECT 1 FROM members m WHERE m.user_id = profiles.user_id AND m.starter_jelly_at IS NOT NULL) THEN 5 ELSE 0 END,
  theme_id = 'basic',
  deco_id = NULL,
  title_id = CASE WHEN title_id LIKE 'gamble-%' THEN title_id ELSE NULL END,
  praise_seen_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- 서버를 나간 멤버(active = 0)는 목록에서 아예 지워요(나리 2026-11-15). 다른 사람 도감 속 카드도 위에서 다 지워졌어요.
-- 겜블장 기록은 나갈 때 이미 지워져요(gamble_member_left 트리거). 다시 들어오면 새 멤버로 처음부터 시작해요.
DELETE FROM members WHERE active = 0;
-- 지운 멤버가 맡겨 둔 캐릭터(성별 바꾸기 전 캐릭터)도 지워요. 남은 멤버의 맡긴 캐릭터는 캐릭터처럼 그대로 둬요.
DELETE FROM character_keep WHERE user_id NOT IN (SELECT user_id FROM members);

-- 성별 고르기도 처음부터 다시 해요(다음에 들어올 때 다시 골라요). 서버 주인 나리(하리 98)는 빼요(나리 2026-11-16).
UPDATE members SET gender_chosen_at = NULL WHERE user_id <> '323412514224209921';

-- 칭호 조건·칭찬함은 이 시각 뒤 기록만 세요.
UPDATE members SET reset_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
