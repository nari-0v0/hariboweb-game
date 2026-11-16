// Workers AI(무료 사용량) 한 번 묻기. 없거나(로컬·바인딩 없음) 실패하거나 한도가 끝나면 '' 을 돌려줘요.
export const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export async function askAi(ai: Ai | undefined, system: string, user: string, maxTokens: number, label: string): Promise<string> {
  if (!ai) return '';
  try {
    const out = (await ai.run(AI_MODEL as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
    } as never)) as { response?: unknown };
    return typeof out?.response === 'string' ? out.response : '';
  } catch (e) {
    console.error(`${label} AI 검토 실패(규칙 검사만으로 넘겨요)`, e);
    return '';
  }
}
