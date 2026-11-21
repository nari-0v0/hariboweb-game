import { esc } from './esc';
import { raw } from 'hono/html';
import { characterUrl } from '../character';
import { CHAR_OFFSETS } from '../char-offsets';
import { levelName, progress, tierEffects, tierFor } from '../levels';
import { themeOrBasic } from '../themes';

export type CardProps = {
  // 디스코드 ID와 정해진 캐릭터
  id: string;
  character?: string | null;
  deco?: string | null;
  name: string;
  // 도감 칭호(디스코드 닉네임 앞에 붙는 것)
  title?: string | null;
  theme: string | null;
  intro: string | null;
  xp: number;
  // 'own' = 내 카드, 'pair' = 도감 속 친구 카드, 'unknown' = 아직 못 만난 멤버
  kind: 'own' | 'pair' | 'unknown';
  // 그림 위 이름표를 바꿀 때(예: 다른 사람 도감의 본인 카드)
  label?: string;
  faded?: boolean;
  no?: string;
  stats: [string, string][];
  href?: string;
  size?: 'large' | 'small';
  // 도감 → 카드 상세로 넘어갈 때 같은 카드가 이어지게 하는 이름
  vt?: string;
};

export function Card(p: CardProps) {
  const { level } = progress(p.xp);
  const unknown = p.kind === 'unknown';
  const tier = unknown ? 'plain' : tierFor(level);
  const label = unknown ? '???' : p.label ?? (p.kind === 'own' ? '나의 카드' : levelName(level));
  const theme = unknown ? 'basic' : themeOrBasic(p.theme);
  const classes = ['card', `theme-${theme}`, `tier-${tier}`, ...(unknown ? [] : tierEffects(level)), `size-${p.size ?? 'small'}`];
  if (p.faded) classes.push('faded');
  const art = characterUrl(p.character, p.id, unknown ? null : p.deco);
  // 발이 그림자 위 가운데에 오게 옮겨요(포니테일·소품이 한쪽으로 긴 그림)
  const feet = CHAR_OFFSETS[art.replace(/^\/char\//, '')] ?? 0;
  if (unknown) classes.push('unknown');

  // 도감 한 화면에 카드가 100장 가까이라 JSX로 하나씩 그리면 무료 요금제 계산 한도(요청당 10ms)를 넘겨요.
  // 그래서 같은 모양의 HTML 글을 바로 이어 붙여요(이름·소개 등 글자는 꼭 esc로 바꿔요).
  const stats = p.stats
    .slice(0, 3)
    .map(([k, v]) => `<div class="c-stat"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`)
    .join('');
  const body =
    `<div class="${unknown || p.faded ? 'tilt still' : 'tilt'}"${p.vt ? ` style="${esc(`view-transition-name:${p.vt}`)}"` : ''}>` +
    `<div class="${esc(classes.join(' '))}"><div class="c-body">` +
    `<div class="c-head"><span class="c-no">${esc(p.no ? `No.${p.no}` : 'HARIBO')}</span><span class="c-lv"><b>★</b>${unknown ? '?' : level}</span></div>` +
    `<div class="c-art"><span class="c-label">${esc(label)}</span><div class="c-ground"></div>` +
    `<img class="c-avatar" src="${esc(art)}"${feet ? ` style="--ax:${feet}%"` : ''} alt="" loading="lazy"/></div>` +
    `<div class="c-name">${p.title && !unknown ? `<span class="c-title">${esc(p.title)}</span>` : ''}${esc(p.name)}</div>` +
    `<div class="c-intro">${esc(unknown ? '같이 놀면 카드가 열려요' : p.intro || '...')}</div>` +
    `<div class="c-stats">${stats}</div></div>` +
    (p.faded ? '<div class="badge-left">떠난 멤버</div>' : '') +
    '<div class="fx" aria-hidden="true"></div><div class="shine" aria-hidden="true"></div></div></div>';
  return raw(
    p.href ? `<a class="card-link" href="${esc(p.href)}" aria-label="${esc(`${p.name} 카드 보기`)}">${body}</a>` : body,
  );
}


export function formatHours(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.round(seconds / 60)}분`;
  return h < 10 ? `${h.toFixed(1)}시간` : `${Math.round(h)}시간`;
}
