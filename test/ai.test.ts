import { describe, expect, it, vi } from 'vitest';
import { AI_FALLBACK_MODEL, AI_MODEL, aiErrorText, aiResponseText, askAi } from '../src/ai';

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

  it('답이 JSON 객체로 와도 글로 바꿔서 판단을 읽어요(Workers AI가 JSON 답을 미리 풀어 줄 때)', async () => {
    const ai = { run: vi.fn(async () => ({ response: { verdict: 'ok' } })) } as unknown as Ai;
    expect(await askAi(ai, 's', 'u', 20, 'x')).toBe('{"verdict":"ok"}');
    expect(aiResponseText({ response: 'hi' })).toBe('hi');
    expect(aiResponseText({})).toBe('');
    expect(aiResponseText(null)).toBe('');
  });

  it('오류 없이 빈 답이 오면 다음 모델에 물어요', async () => {
    const seen: string[] = [];
    const ai = {
      run: vi.fn(async (model: string) => {
        seen.push(model);
        return model === AI_MODEL ? { response: '' } : { response: '{"verdict":"bad"}' };
      }),
    } as unknown as Ai;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await askAi(ai, 's', 'u', 20, 'x')).toBe('{"verdict":"bad"}');
    expect(seen).toEqual([AI_MODEL, AI_FALLBACK_MODEL]);
    expect(String(log.mock.calls[0]?.[0])).toContain('답이 비었어요');
    log.mockRestore();
  });

  it('없어진 예전 모델(llama-3.1-8b-instruct)은 더 묻지 않아요', () => {
    expect([AI_MODEL, AI_FALLBACK_MODEL]).not.toContain('@cf/meta/llama-3.1-8b-instruct');
  });

  it('오류가 Error가 아니어도 글로 바꿔요', () => {
    expect(aiErrorText({ code: 3036 })).toBe('{"code":3036}');
  });
});
