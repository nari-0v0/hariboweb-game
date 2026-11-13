-- 원정대 장비 강화: 무기·갑옷·장신구 단계와, 장마다 나오는 강화 재료(장 번호 → 개수 JSON)
ALTER TABLE journey_bank ADD COLUMN weapon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_bank ADD COLUMN armor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_bank ADD COLUMN charm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_bank ADD COLUMN mats TEXT NOT NULL DEFAULT '{}';
