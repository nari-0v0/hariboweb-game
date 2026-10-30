import { raw } from 'hono/html';
import { chibiSvg } from '../chibi';
import { levelName, progress, tierFor } from '../levels';
import { themeOrBasic } from '../themes';

export type CardProps = {
  id: string;
  name: string;
  theme: string | null;
  intro: string | null;
  xp: number;
  // 'own' = 내 카드, 'pair' = 도감 속 친구 카드, 'unknown' = 아직 못 만난 멤버
  kind: 'own' | 'pair' | 'unknown';
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
  const label = unknown ? '???' : p.kind === 'own' ? '나의 카드' : levelName(level);
  const theme = unknown ? 'basic' : themeOrBasic(p.theme);
  const classes = ['card', `theme-${theme}`, `tier-${tier}`, `size-${p.size ?? 'small'}`];
  if (p.faded) classes.push('faded');
  if (unknown) classes.push('unknown');

  const body = (
    <div class={unknown || p.faded ? 'tilt still' : 'tilt'} style={p.vt ? `view-transition-name:${p.vt}` : undefined}>
      <div class={classes.join(' ')}>
        <div class="c-body">
          <div class="c-head">
            <span class="c-no">{p.no ? `No.${p.no}` : 'HARIBO'}</span>
            <span class="c-lv">
              <b>★</b>
              {unknown ? '?' : level}
            </span>
          </div>
          <div class="c-art">
            <span class="c-label">{label}</span>
            <div class="c-ground" />
            <div class="c-avatar">{raw(chibiSvg(p.id))}</div>
          </div>
          <div class="c-name">{p.name}</div>
          <div class="c-intro">{unknown ? '같이 놀면 카드가 열려요' : p.intro || '...'}</div>
          <div class="c-stats">
            {p.stats.slice(0, 3).map(([k, v]) => (
              <div class="c-stat">
                <span class="k">{k}</span>
                <span class="v">{v}</span>
              </div>
            ))}
          </div>
        </div>
        {p.faded && <div class="badge-left">떠난 멤버</div>}
        <div class="fx" aria-hidden="true"></div>
        <div class="shine" aria-hidden="true"></div>
      </div>
    </div>
  );
  return p.href ? (
    <a class="card-link" href={p.href} aria-label={`${p.name} 카드 보기`}>
      {body}
    </a>
  ) : (
    body
  );
}

export function formatHours(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.round(seconds / 60)}분`;
  return h < 10 ? `${h.toFixed(1)}시간` : `${Math.round(h)}시간`;
}
