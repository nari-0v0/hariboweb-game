import type { Member } from '../env';
import { COLS, FLOORS, FURNITURE, ME, ROWS, WALLS, WALL_ROWS, furniture, ownsFloor, ownsFurniture, ownsWall, type Furniture, type Placed } from '../room';
import type { Room, RoomCard } from '../room-db';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  saved: [{ title: '알림', text: '방을 저장했어요.' }],
  bought: [{ title: '알림', text: '구매가 완료되었습니다. "꾸미기"를 눌러 방에 놓아 보세요.' }],
  owned: [{ title: '알림', text: '이미 가지고 있는 물건이에요.' }],
  not_enough_jelly: [{ title: '알림', text: '도감 젤리가 모자라요.' }],
  not_for_sale: [{ title: '알림', text: '살 수 없는 물건이에요.' }],
  bad: [{ title: '알림', text: '그 자리에는 놓을 수 없어요. 다시 꾸며 주세요.' }],
  liked: [{ title: '알림', text: '좋아요를 눌렀어요! ♥' }],
  already: [{ title: '알림', text: '오늘은 이미 좋아요를 눌렀어요. 내일 또 눌러 주세요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

function Item(props: { p: Placed; art: string; name: string }) {
  const { p } = props;
  const f = p.k === ME ? null : furniture(p.k);
  const w = f?.w ?? 1;
  const h = f?.h ?? 1;
  return (
    <div class={`room-item${p.k === ME ? ' me' : ''}`} data-k={p.k} style={`--x:${p.x};--y:${p.y};--w:${w};--h:${h}`} title={f?.name ?? props.name}>
      {p.k === ME ? <img src={props.art} alt={props.name} /> : f?.art ? <img src={f.art} alt={f.name} /> : <span aria-hidden="true">{f?.emoji}</span>}
    </div>
  );
}

export function RoomScene(props: { room: Pick<Room, 'wall' | 'floor' | 'layout' | 'art' | 'name'>; id?: string }) {
  const { room } = props;
  return (
    <div class="room-frame">
      <div class={`room wall-${room.wall} floor-${room.floor}`} id={props.id} style={`--cols:${COLS};--rows:${ROWS};--wall-rows:${WALL_ROWS}`}>
        <div class="room-wall" />
        <div class="room-floor" />
        <div class="room-items">
          {room.layout.map((p) => (
            <Item p={p} art={room.art} name={room.name} />
          ))}
        </div>
      </div>
    </div>
  );
}

const CATS = ['기본', '거실', '취미', '식물', '동물', '간식', '벽 장식'] as const;

function BuyButton(props: { id: string; price: number; owned: boolean; jelly: number }) {
  if (props.owned) return <span class="tag on">가짐</span>;
  return (
    <form method="post" action="/api/room/buy">
      <input type="hidden" name="item" value={props.id} />
      <button class="btn btn-small btn-buy" type="submit" disabled={props.jelly < props.price}>
        🍬 {props.price}
      </button>
    </form>
  );
}

function Store(props: { owned: Set<string>; jelly: number }) {
  const { owned, jelly } = props;
  return (
    <details class="panel room-store" id="store">
      <summary>
        <h2>🛒 가구점</h2> <span class="hint">보유 젤리 🍬 {jelly}개 · 눌러서 펼치기</span>
      </summary>
      {CATS.filter((c) => c !== '기본').map((cat) => (
        <>
          <h3>{cat}</h3>
          <div class="furn-grid">
            {FURNITURE.filter((x) => x.cat === cat).map((x) => (
              <div class="furn-cell">
                <span class="furn-icon" aria-hidden="true">
                  {x.emoji}
                </span>
                <span class="furn-name">
                  {x.name}
                  {(x.w > 1 || x.h > 1) && <span class="hint"> ({x.w}×{x.h}칸)</span>}
                </span>
                <BuyButton id={`furn:${x.key}`} price={x.price} owned={ownsFurniture(x.key, owned)} jelly={jelly} />
              </div>
            ))}
          </div>
        </>
      ))}
      <h3>벽지</h3>
      <div class="furn-grid">
        {WALLS.filter((s) => s.price > 0).map((s) => (
          <div class="furn-cell">
            <span class={`swatch wall-${s.key}`} aria-hidden="true" />
            <span class="furn-name">{s.name}</span>
            <BuyButton id={`wall:${s.key}`} price={s.price} owned={ownsWall(s.key, owned)} jelly={jelly} />
          </div>
        ))}
      </div>
      <h3>바닥</h3>
      <div class="furn-grid">
        {FLOORS.filter((s) => s.price > 0).map((s) => (
          <div class="furn-cell">
            <span class={`swatch floor-${s.key}`} aria-hidden="true" />
            <span class="furn-name">{s.name}</span>
            <BuyButton id={`floor:${s.key}`} price={s.price} owned={ownsFloor(s.key, owned)} jelly={jelly} />
          </div>
        ))}
      </div>
    </details>
  );
}

// 꾸미기 도구(public/room.js가 켜요). 자바스크립트가 없으면 숨겨진 채로 있어요.
function Editor(props: { room: Room; owned: Set<string> }) {
  const { room, owned } = props;
  const data = {
    cols: COLS,
    rows: ROWS,
    wallRows: WALL_ROWS,
    me: ME,
    art: room.art,
    name: room.name,
    layout: room.layout,
    wall: room.wall,
    floor: room.floor,
    items: FURNITURE.filter((x) => ownsFurniture(x.key, owned)).map((x: Furniture) => ({
      k: x.key,
      name: x.name,
      emoji: x.emoji,
      art: x.art ?? null,
      w: x.w,
      h: x.h,
      zone: x.zone,
    })),
    walls: WALLS.filter((s) => ownsWall(s.key, owned)).map((s) => ({ key: s.key, name: s.name })),
    floors: FLOORS.filter((s) => ownsFloor(s.key, owned)).map((s) => ({ key: s.key, name: s.name })),
  };
  return (
    <section class="room-editor" id="room-editor" hidden>
      <script type="application/json" id="room-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
      <p class="room-tip hint" id="room-tip">
        아래 가구를 누른 다음, 방의 빈칸을 누르면 놓여요. 놓인 가구를 누르면 옮기거나 치울 수 있어요.
      </p>
      <div class="room-tools" id="room-tools" hidden>
        <b id="room-picked" />
        <button class="btn btn-small" type="button" data-act="remove">
          치우기
        </button>
        <button class="btn btn-small btn-ghost" type="button" data-act="cancel">
          그만
        </button>
      </div>
      <h3>가진 가구</h3>
      <div class="room-palette" id="room-palette" />
      <h3>벽지</h3>
      <div class="room-chips" id="room-walls" />
      <h3>바닥</h3>
      <div class="room-chips" id="room-floors" />
      <form method="post" action="/api/room/save" class="room-save" id="room-save">
        <input type="hidden" name="layout" />
        <input type="hidden" name="wall" />
        <input type="hidden" name="floor" />
        <button class="btn btn-primary" type="submit">
          💾 저장하기
        </button>
        <a class="btn btn-ghost" href="/room">
          취소
        </a>
      </form>
    </section>
  );
}

function RoomList(props: { title: string; rooms: RoomCard[]; me: string }) {
  if (!props.rooms.length) return null;
  return (
    <>
      <h3>{props.title}</h3>
      <div class="room-list">
        {props.rooms.map((r) => (
          <a class="room-link" href={r.userId === props.me ? '/room' : `/room/${encodeURIComponent(r.userId)}`}>
            <img src={r.art} alt="" loading="lazy" />
            <b>{r.name}</b>
            <span class="hint">♥ {r.likes}</span>
          </a>
        ))}
      </div>
    </>
  );
}

export function RoomPage(props: {
  viewer: Member;
  room: Room;
  mine: boolean;
  owned: Set<string>;
  jelly: number;
  liked: boolean;
  recent: RoomCard[];
  popular: RoomCard[];
  notice?: string;
}) {
  const { room, mine } = props;
  return (
    <Layout title={mine ? '내 방' : `${room.name}의 방`} viewer={props.viewer} active="room" scripts={mine ? ['/room.js'] : undefined}>
      <Popup lines={NOTICES[props.notice ?? ''] ?? []} />
      <div class="stack" data-fresh>
        <section class="panel room-panel">
          <span class="eyebrow">집 꾸미기</span>
          <div class="panel-head">
            <h1>🏠 {mine ? '내 방' : `${room.name}의 방`}</h1>
            <span class="room-likes">♥ {room.likes}</span>
          </div>
          <RoomScene room={room} id="room" />
          {mine ? (
            <div class="room-actions">
              <button class="btn btn-primary" type="button" id="room-edit-btn" hidden>
                🛠️ 꾸미기
              </button>
              <a class="btn" href="#store">
                🛒 가구 사러 가기
              </a>
            </div>
          ) : (
            <div class="room-actions">
              <form method="post" action={`/api/room/${encodeURIComponent(room.userId)}/like`}>
                <button class="btn btn-primary" type="submit" disabled={props.liked}>
                  {props.liked ? '♥ 오늘 좋아요 했어요' : '♥ 좋아요'}
                </button>
              </form>
              <a class="btn" href="/room">
                🏠 내 방으로
              </a>
            </div>
          )}
          {mine && <Editor room={room} owned={props.owned} />}
        </section>
        {mine && <Store owned={props.owned} jelly={props.jelly} />}
        <section class="panel">
          <h2>👀 방 구경 가기</h2>
          <p class="hint">다른 멤버 방에 놀러 가서 하루 한 번 좋아요를 누를 수 있어요.</p>
          <RoomList title="최근에 꾸민 방" rooms={props.recent} me={props.viewer.user_id} />
          <RoomList title="좋아요 많은 방" rooms={props.popular} me={props.viewer.user_id} />
          {!props.recent.length && <p class="muted">아직 꾸민 방이 없어요. 첫 번째로 꾸며 보세요!</p>}
        </section>
      </div>
    </Layout>
  );
}
