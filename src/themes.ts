// 카드 틀. basic은 기본, 나머지는 나중에 젤리 상점에서 사는 테마예요.
export const THEMES = [
  { id: 'basic', name: '기본' },
  { id: 'ice', name: '얼음' },
  { id: 'teaparty', name: '티파티' },
  { id: 'mermaid', name: '인어' },
  { id: 'moonnight', name: '달밤' },
  { id: 'rose', name: '장미' },
  { id: 'blackgold', name: '블랙골드' },
  { id: 'cyber', name: '사이버' },
  { id: 'racing', name: '레이싱' },
  { id: 'space', name: '우주' },
  { id: 'forest', name: '숲' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

// 상점이 생기기 전까지는 기본 테마만 고를 수 있어요.
export const UNLOCKED_THEMES: readonly string[] = ['basic'];

export function themeOrBasic(id: string | null | undefined): ThemeId {
  return THEMES.some((t) => t.id === id) ? (id as ThemeId) : 'basic';
}
