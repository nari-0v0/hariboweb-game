-- 원정대 장(챕터): 1장(Lv.1~20)을 깨면 2장(Lv.21~40)이 열려요. 판마다 몇 장인지 남겨요.
ALTER TABLE journey_runs ADD COLUMN chapter INTEGER NOT NULL DEFAULT 1;
