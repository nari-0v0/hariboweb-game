import { describe, expect, it } from 'vitest';
import { LandingPage } from '../src/views/pages';
import { COMMUNITY_URL } from '../src/contact';

describe('첫 화면', () => {
  it('서버 멤버가 아니면 카톡방 들어가기 버튼을 보여 줘요', async () => {
    const html = String(await (<LandingPage notMember devLogin={false} />));
    expect(html).toContain(COMMUNITY_URL);
    expect(html).toContain('하리보 카톡방 들어가기');
  });
  it('그냥 들어오면 카톡방 안내가 없어요', async () => {
    const html = String(await (<LandingPage devLogin={false} />));
    expect(html).not.toContain(COMMUNITY_URL);
  });
});
