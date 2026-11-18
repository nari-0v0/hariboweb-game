import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardToOrigin, workerHandlesPath } from '../src/origin-proxy';
import worker from '../src/worker';
import type { Env } from '../src/env';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

afterEach(() => vi.unstubAllGlobals());

describe('Worker 문지기 모드', () => {
  it('ORIGIN_URL로 메서드·머리글·본문을 스트림으로 넘겨요', async () => {
    const returned = new Response(null, { status: 307, headers: { Location: '/next' } });
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => returned);
    const request = new Request('https://dogam.example/api/bot/sync?part=1', {
      method: 'POST',
      headers: { Cookie: 'session=one', 'Content-Type': 'application/json', Host: 'dogam.example' },
      body: '{"hello":"world"}',
    });

    const response = await forwardToOrigin(
      request,
      { ORIGIN_URL: 'http://127.0.0.1:8787', ORIGIN_SECRET: 'door-secret' },
      fakeFetch,
    );
    expect(response).toBe(returned);
    expect(fakeFetch).toHaveBeenCalledOnce();
    const [target, init] = fakeFetch.mock.calls[0]!;
    expect(String(target)).toBe('http://127.0.0.1:8787/api/bot/sync?part=1');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Cookie')).toBe('session=one');
    expect(headers.get('Host')).toBeNull();
    expect(headers.get('X-Forwarded-Host')).toBe('dogam.example');
    expect(headers.get('X-Origin-Secret')).toBe('door-secret');
    expect(await new Response(init?.body).text()).toBe('{"hello":"world"}');
  });

  it('보호 그림 경로는 Worker가 직접 맡아요', () => {
    expect(workerHandlesPath('/char/girl-01.png')).toBe(true);
    expect(workerHandlesPath('/case/room/one.webp')).toBe(true);
    expect(workerHandlesPath('/journey/map.webp')).toBe(true);
    expect(workerHandlesPath('/guide')).toBe(false);
  });

  it('ORIGIN_URL이 있으면 일반 앱 요청을 원본 서버로 넘겨요', async () => {
    const originFetch = vi.fn(async () => new Response('origin page'));
    const assetFetch = vi.fn(async () => new Response('worker css'));
    vi.stubGlobal('fetch', originFetch);
    const response = await worker.fetch(
      new Request('https://dogam.example/guide'),
      {
        ORIGIN_URL: 'http://127.0.0.1:8787',
        ORIGIN_SECRET: 'door-secret',
        ASSETS: { fetch: assetFetch },
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(await response.text()).toBe('origin page');
    expect(originFetch).toHaveBeenCalledOnce();
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it('문지기 모드에서도 보호 그림은 원본으로 넘기지 않고 Worker Assets에서 줘요', async () => {
    const originFetch = vi.fn(async () => new Response('wrong'));
    const assetFetch = vi.fn(async () => new Response('protected image'));
    vi.stubGlobal('fetch', originFetch);
    const response = await worker.fetch(
      new Request('https://dogam.example/char/girl-01-0.png'),
      {
        ORIGIN_URL: 'http://127.0.0.1:8787',
        ORIGIN_SECRET: 'door-secret',
        ASSETS: { fetch: assetFetch },
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(await response.text()).toBe('protected image');
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(originFetch).not.toHaveBeenCalled();
  });
});
