import { levelName, progress, tierFor } from '../levels';
import { themeOrBasic } from '../themes';

export type CardProps = {
  name: string;
  theme: string | null;
  intro: string | null;
  xp: number;
  // 'own' = 내 카드, 'pair' = 도감 속 친구 카드, 'unknown' = 아직 못 만난 멤버
  kind: 'own' | 'pair' | 'unknown';
  faded?: boolean;
  stats: [string, string][];
  href?: string;
  size?: 'large' | 'small';
};

export function Card(p: CardProps) {
  const { level } = progress(p.xp);
  const unknown = p.kind === 'unknown';
  const tier = unknown ? 'plain' : tierFor(level);
  const top = unknown ? '???' : p.kind === 'own' ? '나의 카드' : levelName(level);
  const classes = ['card', `tier-${tier}`, `size-${p.size ?? 'small'}`];
  if (p.faded) classes.push('faded');
  if (unknown) classes.push('unknown');

  const body = (
    <div class={classes.join(' ')}>
      <img class="frame" src={`/frames/${unknown ? 'basic' : themeOrBasic(p.theme)}.webp`} alt="" loading="lazy" />
      <div class="slot top">{top}</div>
      <div class="slot name">{p.name}</div>
      <div class="slot stage">
        <img class="char" src="/img/character-placeholder.svg" alt="" />
      </div>
      <div class="slot intro">{unknown ? '같이 놀면 카드가 생겨요' : p.intro || ' '}</div>
      {p.stats.slice(0, 3).map(([label, value], i) => (
        <div class={`slot stat s${i + 1}`}>
          <span class="label">{label}</span>
          <span class="value">{value}</span>
        </div>
      ))}
      {p.faded && <div class="badge-left">떠난 멤버</div>}
      <div class="fx" aria-hidden="true"></div>
    </div>
  );
  return p.href ? (
    <a class="card-link" href={p.href}>
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
