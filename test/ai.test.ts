import { describe, expect, it, vi } from 'vitest';
import { AI_FALLBACK_MODEL, AI_MODEL, aiErrorText, askAi } from '../src/ai';

describe('askAi', () => {
  it('첫 모델이 실패하면 다른 모델로 한 번 더 묻고, 실패 이유를 글로 남겨요', async () => {
    const seen: string[] = [];
    const ai = {
      run: vi.fn(async (model: string) => {
        seen.push(model);
        if (model === AI_MODEL) throw new Error('5007: No such model');
        return { response: '{"verdict":"ok"}' };
      }),
    } as unknown as Ai;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await askAi(ai, 's', 'u', 20, '칭찬 한마디')).toBe('{"verdict":"ok"}');
    expect(seen).toEqual([AI_MODEL, AI_FALLBACK_MODEL]);
    expect(String(log.mock.calls[0]?.[0])).toContain('No such model');
    log.mockRestore();
  });

  it('둘 다 실패하면 빈 답이에요', async () => {
    const ai = { run: vi.fn(async () => { throw new Error('limit'); }) } as unknown as Ai;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await askAi(ai, 's', 'u', 20, 'x')).toBe('');
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('오류가 Error가 아니어도 글로 바꿔요', () => {
    expect(aiErrorText({ code: 3036 })).toBe('{"code":3036}');
  });
});
