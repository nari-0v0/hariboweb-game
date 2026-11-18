// Workers AI(무료 사용량) 한 번 묻기. 없거나(로컬·바인딩 없음) 실패하거나 한도가 끝나면 '' 을 돌려줘요.
// 2026-11-18: 예전 첫 모델(@cf/meta/llama-3.1-8b-instruct)은 2026-05-30에 없어져서 매번 5028 오류였어요(배포 로그).
// 그래서 지금은 오류 없이 답하던 70b 모델을 먼저 물어요.
export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// 첫 모델이 실패하면(모델이 없어졌거나 막혔을 때) 한 번 더 물어볼 모델
export const AI_FALLBACK_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

// 모델 답(response)을 글로. 답이 JSON이면 Workers AI가 글 대신 이미 풀어 둔 객체로 줄 때가 있어서
// 그때는 다시 JSON 글로 바꿔요(예전에는 이걸 빈 답으로 버려서 판단이 늘 'none'이었어요).
export function aiResponseText(out: unknown): string {
  const r = (out as { response?: unknown } | null)?.response;
  if (typeof r === 'string') return r;
  if (r !== null && typeof r === 'object') {
    try {
      return JSON.stringify(r);
    } catch {
      return '';
    }
  }
  return '';
}

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
      } as never)) as unknown;
      const text = aiResponseText(out);
      if (text.trim()) return text;
      // 오류는 아닌데 쓸 수 있는 답이 없으면 이유를 남기고 다음 모델에 물어요
      console.error(`${label} AI 답이 비었어요(${model}): ${aiErrorText(out)}`);
    } catch (e) {
      console.error(`${label} AI 검토 실패(${model}): ${aiErrorText(e)}`);
    }
  }
  return '';
}
