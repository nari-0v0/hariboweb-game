import type { Podium, PodiumRow } from '../rankings';

const PLACE = ['1st', '2nd', '3rd'];

function Spot(props: { row: PodiumRow | undefined; place: 1 | 2 | 3; show: (v: number) => string }) {
  const r = props.row;
  if (!r) {
    return (
      <li class={`pd-spot pd-p${props.place} pd-empty-spot`} aria-hidden="true">
        <span class="pd-who">
          <span class="pd-q">?</span>
        </span>
        <span class="pd-base">
          <b>{props.place}</b>
        </span>
      </li>
    );
  }
  return (
    <li class={`pd-spot pd-p${props.place}`}>
      {props.place === 1 && (
        <span class="pd-crown" aria-hidden="true">
          👑
        </span>
      )}
      <span class="pd-who">{r.char && <img src={r.char} alt="" loading="lazy" decoding="async" />}</span>
      <span class="pd-base">
        <b>{r.rank}</b>
        <small>{PLACE[r.rank - 1] ?? ''}</small>
      </span>
      <span class="pd-name">{r.name}</span>
      <span class="pd-value">{props.show(r.value)}</span>
    </li>
  );
}

// 1·2·3위 시상대(가운데 1위). 캐릭터는 멤버가 고른 그림이에요.
export function PodiumBoard(props: { title: string; icon: string; podium: Podium; show: (v: number) => string; empty?: string; note?: string }) {
  const { top, me } = props.podium;
  return (
    <section class="pd">
      <header class="pd-head">
        <h3>
          <span aria-hidden="true">{props.icon}</span> {props.title}
        </h3>
        {props.note && <p>{props.note}</p>}
      </header>
      {top.length === 0 ? (
        <p class="pd-none">{props.empty ?? '아직 기록이 없어요. 첫 1등이 되어 보세요!'}</p>
      ) : (
        <ol class="pd-stage">
          <Spot row={top[1]} place={2} show={props.show} />
          <Spot row={top[0]} place={1} show={props.show} />
          <Spot row={top[2]} place={3} show={props.show} />
        </ol>
      )}
      {me && (
        <p class="pd-me">
          {me.char && <img src={me.char} alt="" loading="lazy" decoding="async" />}
          <span>
            내 순위 <b>{me.rank}위</b>
          </span>
          <span class="pd-me-v">{props.show(me.value)}</span>
        </p>
      )}
    </section>
  );
}
