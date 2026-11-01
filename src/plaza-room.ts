import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { characterUrl } from './character';
import {
  allow,
  clampToWorld,
  inside,
  layoutRooms,
  parseBotMessage,
  parseClientMessage,
  spawnPoint,
  voiceChannelOf,
  type Layout,
  type Rate,
  type VoiceSnapshot,
} from './plaza';

// 광장 하나를 맡는 Durable Object. 아무도 말하지 않을 때는 잠들어서(하이버네이션) 요금이 들지 않아요.
// 위치와 채팅은 저장하지 않아요. 통화방 모습(누가 어느 방에 있는지)만 다시 깨어날 때를 위해 넣어 둬요.

type Player = { id: string; name: string; char: string; x: number; y: number };
type UserTag = Player & { kind: 'user'; move: Rate; join: Rate };
type BotTag = { kind: 'bot' };
type Tag = UserTag | BotTag;
type Voice = { layout: Layout; snapshot: VoiceSnapshot };

const EMPTY: VoiceSnapshot = { channels: [], elsewhere: [] };
const NEAR = 30; // 방 테두리 근처도 방 안으로 쳐요

export class PlazaRoom extends DurableObject<Env> {
  private voice: Voice | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 연결 유지용 ping은 깨우지 않고 바로 pong으로 답해요
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async getVoice(): Promise<Voice> {
    if (!this.voice) {
      const saved = await this.ctx.storage.get<Voice>('voice');
      this.voice = saved ?? { layout: layoutRooms([], () => ''), snapshot: EMPTY };
    }
    return this.voice;
  }

  private botOnline(except?: WebSocket) {
    return this.ctx.getWebSockets('bot').some((ws) => ws !== except);
  }

  private players(except?: WebSocket): Player[] {
    return this.ctx
      .getWebSockets('user')
      .filter((ws) => ws !== except)
      .map((ws) => ws.deserializeAttachment() as UserTag)
      .map(({ id, name, char, x, y }) => ({ id, name, char, x, y }));
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets('user')) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        // 이미 끊긴 연결
      }
    }
  }

  private sendTo(userId: string, msg: unknown) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(`u:${userId}`)) {
      try {
        ws.send(text);
      } catch {
        // 이미 끊긴 연결
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    if (request.headers.get('X-Plaza-Role') === 'bot') {
      for (const old of this.ctx.getWebSockets('bot')) old.close(4000, 'replaced');
      this.ctx.acceptWebSocket(server, ['bot']);
      server.serializeAttachment({ kind: 'bot' } satisfies BotTag);
      this.broadcast({ t: 'bot', online: true });
      return new Response(null, { status: 101, webSocket: client });
    }

    let who: { id: string; name: string; char: string };
    try {
      who = JSON.parse(decodeURIComponent(request.headers.get('X-Plaza-User') ?? ''));
    } catch {
      return new Response('bad user', { status: 400 });
    }
    // 같은 사람이 창을 또 열면 예전 창은 닫아요(한 사람 = 캐릭터 하나)
    for (const old of this.ctx.getWebSockets(`u:${who.id}`)) old.close(4001, 'opened elsewhere');

    const voice = await this.getVoice();
    const start = spawnPoint(voice.layout, `${who.id}:${Date.now()}`);
    const tag: UserTag = {
      kind: 'user',
      ...who,
      ...start,
      move: { start: 0, count: 0 },
      join: { start: 0, count: 0 },
    };
    this.ctx.acceptWebSocket(server, ['user', `u:${who.id}`]);
    server.serializeAttachment(tag);
    server.send(
      JSON.stringify({
        t: 'hello',
        me: { id: tag.id, name: tag.name, char: tag.char, x: tag.x, y: tag.y },
        players: this.players(server).filter((p) => p.id !== who.id),
        layout: voice.layout,
        elsewhere: voice.snapshot.elsewhere,
        bot: this.botOnline(),
      }),
    );
    this.broadcast({ t: 'enter', p: { id: tag.id, name: tag.name, char: tag.char, x: tag.x, y: tag.y } }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    const tag = ws.deserializeAttachment() as Tag | null;
    if (!tag) return;
    if (tag.kind === 'bot') return this.fromBot(message);
    return this.fromUser(ws, tag, message);
  }

  private async fromUser(ws: WebSocket, tag: UserTag, raw: string) {
    const msg = parseClientMessage(raw);
    if (!msg) return;
    const now = Date.now();
    const voice = await this.getVoice();

    if (msg.t === 'move') {
      if (!allow(tag.move, now, 1000, 12)) return ws.serializeAttachment(tag);
      const p = clampToWorld(voice.layout, msg.x, msg.y);
      tag.x = p.x;
      tag.y = p.y;
      ws.serializeAttachment(tag);
      this.broadcast({ t: 'move', id: tag.id, x: p.x, y: p.y }, ws);
      return;
    }

    // 통화방 옮기기 요청
    const ok = allow(tag.join, now, 3000, 1);
    ws.serializeAttachment(tag);
    if (!ok) return;
    const reply = (reason: string) => ws.send(JSON.stringify({ t: 'joined', ch: msg.ch, ok: false, reason }));
    const room = voice.layout.rooms.find((r) => r.id === msg.ch);
    if (!room) return reply('no_room');
    const near = { x: room.x - NEAR, y: room.y - NEAR, w: room.w + NEAR * 2, h: room.h + NEAR * 2 };
    if (!inside(near, tag.x, tag.y)) return reply('too_far');
    const current = voiceChannelOf(voice.snapshot, tag.id);
    if (current === null) return reply('not_in_voice');
    if (current === msg.ch) return;
    const bot = this.ctx.getWebSockets('bot')[0];
    if (!bot) return reply('bot_offline');
    bot.send(JSON.stringify({ t: 'move', user: tag.id, ch: msg.ch }));
    ws.send(JSON.stringify({ t: 'joining', ch: msg.ch }));
  }

  private async fromBot(raw: string) {
    const msg = parseBotMessage(raw);
    if (!msg) return;
    if (msg.t === 'voice') {
      const chars = await this.characters(msg.channels.flatMap((c) => c.members.map((m) => m.id)));
      const snapshot = { channels: msg.channels, elsewhere: msg.elsewhere };
      this.voice = { layout: layoutRooms(msg.channels, (id) => chars.get(id) ?? characterUrl(null, id)), snapshot };
      await this.ctx.storage.put('voice', this.voice);
      this.broadcast({ t: 'voice', layout: this.voice.layout, elsewhere: snapshot.elsewhere });
      return;
    }
    if (msg.t === 'chat') {
      this.broadcast({ t: 'chat', id: msg.user, ch: msg.ch, text: msg.text });
      return;
    }
    this.sendTo(msg.user, { t: 'joined', ch: msg.ch, ok: msg.ok, reason: msg.reason });
  }

  // 통화방에 있는 사람들의 캐릭터 그림(도감에 장착한 꾸밈 캐릭터 포함)
  private async characters(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 90) {
      const part = unique.slice(i, i + 90);
      const { results } = await this.env.DB.prepare(
        `SELECT user_id, character_id, deco_id FROM profiles WHERE user_id IN (${part.map(() => '?').join(',')})`,
      )
        .bind(...part)
        .all<{ user_id: string; character_id: string | null; deco_id: string | null }>();
      for (const r of results) out.set(r.user_id, characterUrl(r.character_id, r.user_id, r.deco_id));
    }
    return out;
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      // 이미 닫힘
    }
  }

  async webSocketError(ws: WebSocket) {
    this.gone(ws);
  }

  private gone(ws: WebSocket) {
    const tag = ws.deserializeAttachment() as Tag | null;
    if (!tag) return;
    if (tag.kind === 'bot') {
      if (!this.botOnline(ws)) this.broadcast({ t: 'bot', online: false }, ws);
      return;
    }
    const still = this.ctx.getWebSockets(`u:${tag.id}`).some((other) => other !== ws);
    if (!still) this.broadcast({ t: 'leave', id: tag.id }, ws);
  }
}
