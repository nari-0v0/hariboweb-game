import { describe, expect, it } from 'vitest';
import { crossSiteImageRequest, imageRequestAllowed } from '../src/image-guard';

const SITE = 'https://hariboweb-game.haribobot.workers.dev';

describe('imageRequestAllowed', () => {
  it('allows images used on our own pages', () => {
    expect(imageRequestAllowed(`${SITE}/me`, 'image', SITE)).toBe(true);
    expect(imageRequestAllowed(`${SITE}/styles.css?v=1`, 'image', 'http://127.0.0.1:8787', SITE)).toBe(true);
  });
  it('allows requests without a referer (bot, Discord previews)', () => {
    expect(imageRequestAllowed(undefined, undefined, SITE)).toBe(true);
    expect(imageRequestAllowed(undefined, 'image', SITE)).toBe(true);
  });
  it('blocks other sites and opening the image directly', () => {
    expect(imageRequestAllowed('https://evil.example/page', 'image', SITE)).toBe(false);
    expect(imageRequestAllowed(`${SITE}.evil.example/`, 'image', SITE)).toBe(false);
    expect(imageRequestAllowed(undefined, 'document', SITE)).toBe(false);
    expect(imageRequestAllowed(`${SITE}/me`, 'document', SITE)).toBe(false);
    expect(imageRequestAllowed('not a url', 'image', SITE)).toBe(false);
  });
});

it('다른 사이트에서 부른 그림 요청(Sec-Fetch-Site: cross-site)은 거절해요', () => {
  expect(crossSiteImageRequest('cross-site')).toBe(true);
  expect(crossSiteImageRequest('same-origin')).toBe(false);
  expect(crossSiteImageRequest('same-site')).toBe(false);
  expect(crossSiteImageRequest('none')).toBe(false);
  expect(crossSiteImageRequest(undefined)).toBe(false); // 봇·디스코드 미리보기
});
