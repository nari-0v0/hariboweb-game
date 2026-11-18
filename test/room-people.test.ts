import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOMS, placePeople } from '../src/case-rooms';
import { ROOM_PEOPLE } from '../src/room-people.gen';

// 사건파일 방의 사람 자리는 미리 계산한 표(src/room-people.gen.ts)를 써요(첫 방문 계산 시간을 줄이려고).
// 방(눌리는 곳)을 고쳐서 이 테스트가 틀리면: UPDATE_ROOM_PEOPLE=1 npx vitest run test/room-people.test.ts
describe('미리 계산한 사건파일 사람 자리', () => {
  const fresh = Object.fromEntries(Object.entries(ROOMS).map(([k, r]) => [k, placePeople(r.spots)]));
  if (process.env.UPDATE_ROOM_PEOPLE === '1') {
    const lines = Object.entries(fresh).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    writeFileSync(
      join(process.cwd(), 'src/room-people.gen.ts'),
      `// test/room-people.test.ts 가 만든 파일이에요(UPDATE_ROOM_PEOPLE=1). 손으로 고치지 마세요.\n// 사건파일 방마다 사람(대화 상대)이 설 자리 [x, y] (src/case-rooms.ts placePeople 결과)\nexport const ROOM_PEOPLE: Record<string, [number, number][]> = {\n${lines.join('\n')}\n};\n`,
    );
  }
  it('표가 지금 방 모양으로 계산한 것과 같아요', () => {
    expect(ROOM_PEOPLE).toEqual(fresh);
  });
});
