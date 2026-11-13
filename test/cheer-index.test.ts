import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XP_SCALE } from '../src/levels';

// 도감 축하 부분 색인(0034)은 listCheers의 WHERE와 같아야 쓰여요. 카드 경험치 곡선을 바꾸면 새 마이그레이션으로 색인도 바꿔요.
describe('도감 축하 색인', () => {
  it('색인 조건이 지금 경험치 곡선과 같아요', () => {
    const sql = readFileSync(join(process.cwd(), 'migrations', '0034_cheer_due_index.sql'), 'utf8');
    expect(sql).toContain(`xp >= ${XP_SCALE} * ((cheer_level / 10) * 10 + 9) * ((cheer_level / 10) * 10 + 9)`);
  });
});
