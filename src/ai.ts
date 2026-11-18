// Workers AI(무료 사용량) 한 번 묻기. 없거나(로컬·바인딩 없음) 실패하거나 한도가 끝나면 '' 을 돌려줘요.
// 예전 모델 '@cf/meta/llama-3.1-8b-instruct'는 2026-05-30에 없어져서(오류 5028) 처음부터 AI가 한 번도 답하지 못했어요.
export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// 첫 모델이 실패하면 한 번 더 물어볼 모델
export const AI_FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

// 실패 이유를 로그에 글로 남겨요. 예전에는 오류 객체를 그대로 찍어서 이유 글이 빠지고 위치만 남았어요.
export function aiErrorText(e: unknown): string {
  if (e instanceof Error) {
    const extra = Object.entries(e as unknown as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
    return [e.name, e.message, extra].filter(Boolean).join(' | ').slice(0, 500);
  }
  try {
    return JSON.stringify(e).slice(0, 500);
  } catch {
    return String(e).slice(0, 500);
  }
}

export async function askAi(ai: Ai | undefined, system: string, user: string, maxTokens: number, label: string): Promise<string> {
  if (!ai) return '';
  for (const model of [AI_MODEL, AI_FALLBACK_MODEL]) {
    try {
      const out = (await ai.run(model as Parameters<Ai['run']>[0], {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
      } as never)) as { response?: unknown };
      const response = out?.response;
      if (typeof response === 'string') return response;
      // 답이 JSON 모양이면 Workers AI가 글 대신 이미 풀어 둔 객체로 줄 때가 있어요. 다시 글로 바꿔 넘겨요.
      if (response && typeof response === 'object') return JSON.stringify(response);
      console.error(`${label} AI 답 모양이 이상해요(${model}): ${aiErrorText(out)}`);
      return '';
    } catch (e) {
      console.error(`${label} AI 검토 실패(${model}): ${aiErrorText(e)}`);
    }
  }
  return '';
}
