// 광장: 같이 돌아다니는 지도. 서버(Durable Object)와 웹소켓으로 이어져 있어요.
(() => {
  const root = document.getElementById('plaza');
  if (!root) return;
  const world = document.getElementById('plaza-world');
  const statusEl = document.getElementById('plaza-status');
  const toastEl = document.getElementById('plaza-toast');
  const toastText = document.getElementById('plaza-toast-text');
  const toastLink = document.getElementById('plaza-toast-link');
  const listEl = document.getElementById('plaza-rooms');
  const GUILD = root.dataset.guild;
  const SPEED = 240; // 1초에 움직이는 거리
  const SEND_EVERY = 120; // 방향키로 걸을 때 위치를 보내는 간격(ms)
  const STILL_MS = 700; // 방 안에서 이만큼 멈춰 있으면 통화방을 옮겨요
  const BUBBLE_MS = 6000;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  let ws = null;
  let retry = 1000;
  let stopped = false;
  let me = null;
  let layout = { w: 1260, h: 500, park: { x: 60, y: 60, w: 1140, h: 380 }, rooms: [] };
  let voiceOf = new Map(); // 사람 id -> 통화방 id ('elsewhere'는 광장에 안 보이는 방)
  let botOnline = false;
  let lastAsked = null;
  let stillSince = 0;
  let lastSent = 0;
  let sentX = null;
  let sentY = null;
  let cam = { x: 0, y: 0, s: 1 };
  const players = new Map();
  const keys = new Set();

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const safeChar = (src) => (typeof src === 'string' && src.startsWith('/char/') ? src : '/char/girl-01-0.png');
  const discordLink = (ch) => `https://discord.com/channels/${GUILD}/${ch}`;

  // 알림
  let toastTimer = 0;
  function toast(text, link) {
    toastText.textContent = text;
    toastLink.hidden = !link;
    if (link) toastLink.href = link;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), link ? 9000 : 4000);
  }
  const setStatus = (text) => (statusEl.textContent = text);
  function refreshStatus() {
    if (!ws || ws.readyState !== 1) return setStatus('연결하는 중…');
    const n = players.size;
    const bot = botOnline ? '' : ' · 디스코드 연결을 기다리는 중이라 통화방은 아직 못 옮겨요';
    setStatus(`지금 광장에 ${n}명${bot}`);
  }

  // 캐릭터
  function addPlayer(p, isMe) {
    removePlayer(p.id);
    const node = el('div', 'plaza-pl' + (isMe ? ' me' : ''));
    const bubble = el('div', 'plaza-bubble');
    const img = el('img');
    img.src = safeChar(p.char);
    img.alt = '';
    img.draggable = false;
    const name = el('span', 'plaza-name', p.name);
    node.append(bubble, img, name);
    world.append(node);
    const player = { ...p, tx: p.x, ty: p.y, node, img, bubble, bubbleTimer: 0 };
    players.set(p.id, player);
    place(player);
    markVoice(player);
    updateSeats();
    refreshStatus();
    return player;
  }
  function removePlayer(id) {
    const p = players.get(id);
    if (!p) return;
    p.node.remove();
    players.delete(id);
    updateSeats();
    refreshStatus();
  }
  function place(p) {
    p.node.style.transform = `translate(${p.x}px, ${p.y}px)`;
    p.node.style.zIndex = String(10 + Math.round(p.y));
  }
  function markVoice(p) {
    p.node.classList.toggle('in-voice', voiceOf.has(p.id));
  }

  // 말풍선
  function say(target, text) {
    const bubble = target.bubble;
    bubble.textContent = text;
    bubble.classList.add('on');
    clearTimeout(target.bubbleTimer);
    target.bubbleTimer = setTimeout(() => bubble.classList.remove('on'), BUBBLE_MS);
  }

  // 통화방 구역
  const roomNodes = new Map();
  function setLayout(next, elsewhere) {
    layout = next;
    voiceOf = new Map();
    for (const r of layout.rooms) for (const m of r.members) voiceOf.set(m.id, r.id);
    for (const id of elsewhere || []) if (!voiceOf.has(id)) voiceOf.set(id, 'elsewhere');
    world.style.width = `${layout.w}px`;
    world.style.height = `${layout.h}px`;

    for (const n of roomNodes.values()) n.node.remove();
    roomNodes.clear();
    let park = world.querySelector('.plaza-park');
    if (!park) {
      park = el('div', 'plaza-park');
      park.append(el('span', 'plaza-park-sign', '광장'));
      world.prepend(park);
    }
    Object.assign(park.style, box(layout.park));

    for (const r of layout.rooms) {
      const node = el('div', 'plaza-room');
      Object.assign(node.style, box(r));
      const sign = el('div', 'plaza-sign');
      sign.append(el('b', null, r.name), el('span', null, r.limit ? `${r.members.length}/${r.limit}` : `${r.members.length}명`));
      const seats = el('div', 'plaza-seats');
      node.append(sign, seats);
      world.append(node);
      roomNodes.set(r.id, { node, seats, room: r, seatById: new Map() });
    }
    // 지도가 작아졌을 때만 밖으로 나간 사람을 안으로 들여요(걷던 길은 그대로)
    for (const p of players.values()) {
      const c = clamp(p.x, p.y);
      const t = clamp(p.tx, p.ty);
      p.x = c.x;
      p.y = c.y;
      p.tx = t.x;
      p.ty = t.y;
      place(p);
      markVoice(p);
    }
    updateSeats();
    renderList();
    refreshStatus();
  }

  // 지도 아래 통화방 목록: 누가 어느 방에 있는지 한눈에, 누르면 그 방으로 걸어가요
  function renderList() {
    listEl.replaceChildren();
    if (!layout.rooms.length) {
      listEl.append(el('p', 'hint', '디스코드 통화방 정보를 기다리는 중이에요.'));
      return;
    }
    for (const r of layout.rooms) {
      const item = el('button', 'plaza-room-item');
      item.type = 'button';
      item.dataset.room = r.id;
      const head = el('span', 'plaza-room-name', r.name);
      const count = el('span', 'plaza-room-count', r.limit ? `${r.members.length}/${r.limit}` : `${r.members.length}명`);
      const who = el('span', 'plaza-room-who', r.members.length ? r.members.map((m) => m.name).join(', ') : '비어 있어요');
      item.append(head, count, who);
      item.addEventListener('click', () => walkTo(r));
      listEl.append(item);
    }
  }
  function walkTo(r) {
    if (!me) return;
    me.tx = Math.round(r.x + r.w / 2);
    me.ty = Math.round(r.y + r.h * 0.45);
    sentX = me.tx;
    sentY = me.ty;
    send({ t: 'move', x: me.tx, y: me.ty });
    root.scrollIntoView({ block: 'nearest', behavior: calm.matches ? 'auto' : 'smooth' });
  }
  const box = (r) => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });

  // 광장에 직접 나와 있지 않은 통화방 사람은 방 안에 앉아 있는 모습으로 보여 줘요
  const SEAT_MAX = 8;
  function updateSeats() {
    for (const { seats, room, seatById } of roomNodes.values()) {
      seats.replaceChildren();
      seatById.clear();
      const sitting = room.members.filter((m) => !players.has(m.id));
      for (const m of sitting.slice(0, SEAT_MAX)) {
        const seat = el('div', 'plaza-seat');
        const bubble = el('div', 'plaza-bubble');
        const img = el('img');
        img.src = safeChar(m.char);
        img.alt = '';
        img.draggable = false;
        seat.append(bubble, img, el('span', 'plaza-name', m.name));
        seats.append(seat);
        seatById.set(m.id, { bubble, bubbleTimer: 0 });
      }
      if (sitting.length > SEAT_MAX) seats.append(el('span', 'plaza-more', `+${sitting.length - SEAT_MAX}`));
    }
  }

  function roomAt(x, y) {
    return layout.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }
  function clamp(x, y) {
    return { x: Math.min(Math.max(x, 0), layout.w), y: Math.min(Math.max(y, 0), layout.h) };
  }

  // 방에 들어가 멈추면 통화방 옮기기
  function checkRoom() {
    const room = roomAt(me.x, me.y);
    if (!room) {
      lastAsked = null;
      return;
    }
    if (room.id === lastAsked) return;
    lastAsked = room.id;
    const mine = voiceOf.get(me.id);
    if (mine === room.id) return;
    if (!mine) return toast('먼저 디스코드에서 아무 통화방에 들어와 주세요. 그다음 여기서 방을 옮길 수 있어요.', discordLink(room.id));
    if (!botOnline) return toast('디스코드 연결을 기다리는 중이라 지금은 통화방을 못 옮겨요.');
    send({ t: 'join', ch: room.id });
  }

  const REASONS = {
    not_in_voice: '먼저 디스코드에서 아무 통화방에 들어와 주세요. 그다음 여기서 방을 옮길 수 있어요.',
    full: '방이 꽉 차서 옮기지 못했어요.',
    no_permission: '이 방에는 들어갈 수 없어요.',
    no_room: '지금은 없는 통화방이에요.',
    too_far: '방 안으로 조금 더 들어가 주세요.',
    bot_offline: '디스코드 연결을 기다리는 중이라 지금은 통화방을 못 옮겨요.',
    busy: '조금 뒤에 다시 들어가 주세요.',
  };
  const roomName = (ch) => layout.rooms.find((r) => r.id === ch)?.name ?? '통화방';

  function onMessage(msg) {
    switch (msg.t) {
      case 'hello':
        for (const id of [...players.keys()]) removePlayer(id);
        botOnline = !!msg.bot;
        setLayout(msg.layout, msg.elsewhere);
        me = addPlayer(msg.me, true);
        for (const p of msg.players) addPlayer(p, false);
        sentX = me.x;
        sentY = me.y;
        lastAsked = roomAt(me.x, me.y)?.id ?? null;
        refreshStatus();
        break;
      case 'enter':
        if (!me || msg.p.id !== me.id) addPlayer(msg.p, false);
        break;
      case 'leave':
        if (!me || msg.id !== me.id) removePlayer(msg.id);
        break;
      case 'move': {
        const p = players.get(msg.id);
        if (p && p !== me) {
          p.tx = msg.x;
          p.ty = msg.y;
        }
        break;
      }
      case 'voice':
        setLayout(msg.layout, msg.elsewhere);
        break;
      case 'bot':
        botOnline = !!msg.online;
        refreshStatus();
        break;
      case 'chat': {
        const walker = players.get(msg.id);
        if (walker) say(walker, msg.text);
        else {
          const seat = roomNodes.get(msg.ch)?.seatById.get(msg.id);
          if (seat) say(seat, msg.text);
        }
        break;
      }
      case 'joining':
        toast(`${roomName(msg.ch)}(으)로 옮기는 중…`);
        break;
      case 'joined':
        if (msg.ok) toast(`디스코드에서 ${roomName(msg.ch)}(으)로 옮겼어요.`);
        else if (msg.reason === 'not_in_voice') toast(REASONS.not_in_voice, discordLink(msg.ch));
        else toast(REASONS[msg.reason] || '오류가 발생하였습니다. 방장에게 문의해주세요.');
        break;
    }
  }

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(`${proto}${location.host}/plaza/ws`);
    ws.onopen = () => {
      retry = 1000;
      refreshStatus();
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        // 모르는 말은 무시
      }
    };
    ws.onclose = (e) => {
      if (e.code === 4001) {
        stopped = true;
        setStatus('다른 창에서 광장을 열었어요. 이 창을 쓰려면 새로고침해 주세요.');
        return;
      }
      setStatus('연결이 끊겨서 다시 연결하는 중…');
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30000);
    };
  }
  // 연결이 끊기지 않게 가끔 ping (서버는 깨지 않고 바로 pong)
  setInterval(() => !stopped && ws && ws.readyState === 1 && ws.send("ping"), 25000);

  // 움직이기
  const DIRS = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
  };
  const typing = (e) => e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
  document.addEventListener('keydown', (e) => {
    if (!DIRS[e.code] || typing(e)) return;
    e.preventDefault();
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  root.addEventListener('pointerdown', (e) => {
    if (!me || e.button > 0) return;
    root.focus({ preventScroll: true });
    const r = root.getBoundingClientRect();
    const c = clamp((e.clientX - r.left - cam.x) / cam.s, (e.clientY - r.top - cam.y) / cam.s);
    me.tx = Math.round(c.x);
    me.ty = Math.round(c.y);
    send({ t: 'move', x: me.tx, y: me.ty });
    sentX = me.tx;
    sentY = me.ty;
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (me) {
      let dx = 0;
      let dy = 0;
      for (const k of keys) {
        dx += DIRS[k][0];
        dy += DIRS[k][1];
      }
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const c = clamp(me.x + (dx / len) * SPEED * dt, me.y + (dy / len) * SPEED * dt);
        me.tx = c.x;
        me.ty = c.y;
        if (now - lastSent > SEND_EVERY && (Math.round(c.x) !== sentX || Math.round(c.y) !== sentY)) {
          lastSent = now;
          sentX = Math.round(c.x);
          sentY = Math.round(c.y);
          send({ t: 'move', x: sentX, y: sentY });
        }
      } else if (keys.size === 0 && (Math.round(me.tx) !== sentX || Math.round(me.ty) !== sentY)) {
        // 방향키를 뗀 자리를 마지막으로 알려요
        sentX = Math.round(me.tx);
        sentY = Math.round(me.ty);
        send({ t: 'move', x: sentX, y: sentY });
      }
    }
    for (const p of players.values()) {
      const ddx = p.tx - p.x;
      const ddy = p.ty - p.y;
      const dist = Math.hypot(ddx, ddy);
      const step = SPEED * dt * (p === me ? 1 : Math.max(1, dist / 160));
      const walking = dist > 0.5;
      if (walking) {
        if (dist <= step) {
          p.x = p.tx;
          p.y = p.ty;
        } else {
          p.x += (ddx / dist) * step;
          p.y += (ddy / dist) * step;
        }
        if (Math.abs(ddx) > 1) p.node.classList.toggle('left', ddx < 0);
        place(p);
      }
      p.node.classList.toggle('walking', walking && !calm.matches);
    }
    if (me) {
      const moving = Math.hypot(me.tx - me.x, me.ty - me.y) > 0.5 || keys.size > 0;
      if (moving) stillSince = now;
      else if (stillSince && now - stillSince > STILL_MS) {
        stillSince = 0;
        checkRoom();
      }
      follow();
    }
    requestAnimationFrame(frame);
  }

  // 화면이 내 캐릭터를 따라가요
  function follow() {
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    const s = vw < 700 ? 0.62 : 1;
    const ww = layout.w * s;
    const wh = layout.h * s;
    const x = ww <= vw ? (vw - ww) / 2 : Math.min(0, Math.max(vw - ww, vw / 2 - me.x * s));
    const y = wh <= vh ? (vh - wh) / 2 : Math.min(0, Math.max(vh - wh, vh / 2 - me.y * s));
    if (x !== cam.x || y !== cam.y || s !== cam.s) {
      cam = { x, y, s };
      world.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    }
  }

  connect();
  requestAnimationFrame(frame);
})();
