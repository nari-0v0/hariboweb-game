import type { Podium } from '../rankings';

const MEDALS = ['🥇', '🥈', '🥉'];

// 1·2·3위 시상대(가운데가 1위). 그림이 아니라 글자·메달 이모지·CSS 상자만 써요.
export function PodiumBoard(props: { title: string; icon: string; podium: Podium; show: (v: number) => string; empty?: string }) {
  const { top, me } = props.podium;
  const slots = [top[1], top[0], top[2]]; // 2위, 1위, 3위 순서로 놓아요
  return (
    <section class="pd">
      <h3 class="pd-title">
        <span aria-hidden="true">{props.icon}</span> {props.title}
      </h3>
      {top.length === 0 ? (
        <p class="pd-empty">{props.empty ?? '아직 기록이 없어요. 첫 1등이 되어 보세요!'}</p>
      ) : (
        <ol class="pd-stage">
          {slots.map((r, i) =>
            r ? (
              <li class={`pd-slot pd-${r.rank <= 3 ? r.rank : 3}${i === 1 ? ' pd-mid' : ''}`}>
                {r.rank === 1 && (
                  <span class="pd-crown" aria-hidden="true">
                    👑
                  </span>
                )}
                <span class="pd-name">{r.name}</span>
                <span class="pd-value">{props.show(r.value)}</span>
                <span class="pd-block">
                  <span class="pd-medal" aria-label={`${r.rank}위`}>
                    {MEDALS[r.rank - 1] ?? r.rank}
                  </span>
                </span>
              </li>
            ) : (
              <li class={`pd-slot pd-none${i === 1 ? ' pd-mid' : ''}`} aria-hidden="true">
                <span class="pd-block" />
              </li>
            ),
          )}
        </ol>
      )}
      {me && (
        <p class="pd-me">
          내 순위 <b>{me.rank}위</b> · {props.show(me.value)}
        </p>
      )}
    </section>
  );
}
