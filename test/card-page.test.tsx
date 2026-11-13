import { expect, it } from 'vitest';
import type { DogamEntry } from '../src/db';
import type { Member } from '../src/env';
import { CardPage } from '../src/views/pages';

it('한국 시간 자정이 지난 뒤 만났으면 그날을 표시해요', async () => {
  const owner: Member = { user_id: '1', display_name: '나', avatar_url: null, joined_at: null, active: 1, is_newbie: 0 };
  const target: Member = { ...owner, user_id: '2', display_name: '친구' };
  const entry: DogamEntry = {
    ...target, owned: 1, xp: 1, voice_seconds: 60, scrims: 0, first_met: '2026-11-12T15:30:00.000Z',
    theme_id: 'basic', intro: null, character_id: null, deco_id: null, title_id: null,
  };
  const html = String(await (<CardPage viewer={owner} owner={owner} target={target} entry={entry} />));
  expect(html).toContain('2026.11.13');
});
