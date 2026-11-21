-- 끝없는 탑·펫(나리 2026-11-19). 모두 원정 준비소 줄(journey_bank)에 붙여요.
-- tower: 깬 가장 높은 층(다음 도전 = tower + 1), tower_at: 마지막 도전 때(연타 막기), tower_last: 마지막 도전 결과(화면에 한 번 보여 줌)
-- pets: {"펫": 레벨}, pet: 데려가는 펫
ALTER TABLE journey_bank ADD COLUMN tower INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_bank ADD COLUMN tower_at TEXT;
ALTER TABLE journey_bank ADD COLUMN tower_last TEXT;
ALTER TABLE journey_bank ADD COLUMN pets TEXT NOT NULL DEFAULT '{}';
ALTER TABLE journey_bank ADD COLUMN pet TEXT;
-- 탑 순위(높은 층 10명)를 색인으로 몇 줄만 읽어요
CREATE INDEX IF NOT EXISTS journey_bank_tower ON journey_bank (tower DESC) WHERE tower > 0;
