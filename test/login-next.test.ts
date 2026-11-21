import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const noDb = { prepare() { throw new Error('no db'); } } as unknown as D1Database;

describe('로그인 전에 열려던 화면·다시 시도 링크(4차 점검)', () => {
  it('점검 화면의 다시 시도 링크는 %09 같은 글자로 다른 사이트로 나가지 않아요', async () => {
    const env = { MAINTENANCE: '1', DB: noDb, SESSION_SECRET: 's' } as unknown as Env;
    for (const p of ['/%09/evil.example/x', '/%0a/evil.example/x', '/%0d%0a/evil.example/x']) {
      const html = await (await app.request(p, {}, env)).text();
      expect(html).not.toMatch(/href="\/[\t\n\r]/);
      expect(html.match(/href="([^"]*evil[^"]*)"/)?.[1]).toBe(p);
    }
  });

  it('직접 연 화면은 /?next=로 넘기고, 화면 안 fetch(알림함)는 기억하지 않아요', async () => {
    const env = { DB: noDb, SESSION_SECRET: 's' } as unknown as Env;
    const nav = await app.request('/bingo', { headers: { 'Sec-Fetch-Mode': 'navigate' } }, env);
    expect(nav.status).toBe(302);
    expect(nav.headers.get('Location')).toBe('/?next=%2Fbingo');
    const box = await app.request('/alerts?box=1', { headers: { 'Sec-Fetch-Mode': 'cors' } }, env);
    expect(box.headers.get('Location')).toBe('/');
    const box2 = await app.request('/alerts?box=1', {}, env);
    expect(box2.headers.get('Location')).toBe('/');
  });

  it('/?next=에 탭·줄바꿈을 넣어 다른 사이트로 보내지 못해요(쿠키에도 안 남아요)', async () => {
    const env = { DB: noDb, SESSION_SECRET: 's' } as unknown as Env;
    for (const q of ['%2F%09%2Fevil.example%2Fx', '%2F%0a%2Fevil.example', '%2F%5Cevil.example', '%2F%2Fevil.example', '%2Fauth%2Flogin']) {
      const res = await app.request(`/?next=${q}`, {}, env);
      expect(res.headers.get('Set-Cookie') ?? '').not.toContain('dogam_next=');
    }
    const ok = await app.request('/?next=%2Fbingo%3Fx%3D1', {}, env);
    expect(ok.headers.get('Set-Cookie') ?? '').toContain('dogam_next=%2Fbingo%3Fx%3D1');
    const kr = await app.request('/?next=%2F%ED%95%9C', {}, env);
    expect(kr.headers.get('Set-Cookie') ?? '').toContain('dogam_next=%2F%25ED%2595%259C');
  });
});
