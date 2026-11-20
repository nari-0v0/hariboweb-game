import { describe, expect, it } from 'vitest';
import { KAKAO_SCRIPT, kakaoExternalUrl } from '../src/kakao';

// 아주 작은 가짜 화면으로 스크립트를 돌려 봐요.
function run(ua: string, opts: { stored?: string | null; storageThrows?: boolean } = {}) {
  const store = new Map<string, string>();
  if (opts.stored) store.set('kk-ext', opts.stored);
  const made: any[] = [];
  const el = (tag: string): any => {
    const node: any = { tag, children: [] as any[], attrs: {} as Record<string, string>, style: {}, textContent: '' };
    node.appendChild = (ch: any) => node.children.push(ch);
    node.setAttribute = (k: string, v: string) => (node.attrs[k] = v);
    made.push(node);
    return node;
  };
  const body: any = el('body');
  body.firstChild = null;
  body.insertBefore = (ch: any) => body.children.unshift(ch);
  const location = { href: 'https://example.test/me?x=1#top' };
  const sessionStorage = opts.storageThrows
    ? { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } }
    : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  const document = { body, createElement: el };
  new Function('navigator', 'location', 'document', 'sessionStorage', KAKAO_SCRIPT)({ userAgent: ua }, location, document, sessionStorage);
  const bar = body.children[0];
  return { location, bar, store, made };
}

const KAKAO_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 KAKAOTALK/25.9.1';
const KAKAO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.9.0';
const target = kakaoExternalUrl('https://example.test/me?x=1');

describe('카카오톡 속 브라우저 안내', () => {
  it('카톡이 아니면 아무것도 안 해요', () => {
    const r = run('Mozilla/5.0 (iPhone) Safari/604.1');
    expect(r.bar).toBeUndefined();
    expect(r.location.href).toBe('https://example.test/me?x=1#top');
  });

  it('카톡 안드로이드: 처음 한 번 기본 브라우저로 열고 띠를 보여요', () => {
    const r = run(KAKAO_ANDROID);
    expect(r.location.href).toBe(target);
    expect(r.bar.className).toBe('kk-bar');
    const link = r.made.find((n) => n.className === 'kk-open');
    expect(link.href).toBe(target);
    expect(r.made.find((n) => n.className === 'kk-hint').textContent).toContain('⋮');
    expect(r.store.get('kk-ext')).toBe('1');
  });

  it('카톡 아이폰: 사파리 안내와 공유 버튼 안내', () => {
    const r = run(KAKAO_IOS);
    expect(r.made.find((n) => n.className === 'kk-text').textContent).toContain('사파리');
    expect(r.made.find((n) => n.className === 'kk-hint').textContent).toContain('공유');
  });

  it('한 번 시도했으면 다시 자동으로 열지 않고 띠만 보여요', () => {
    const r = run(KAKAO_ANDROID, { stored: '1' });
    expect(r.location.href).toBe('https://example.test/me?x=1#top');
    expect(r.bar.className).toBe('kk-bar');
  });

  it('저장소를 못 쓰면 매 화면 튕기지 않게 자동으로 열지 않아요', () => {
    const r = run(KAKAO_ANDROID, { storageThrows: true });
    expect(r.location.href).toBe('https://example.test/me?x=1#top');
    expect(r.bar.className).toBe('kk-bar');
  });

  it('스크립트 안에 </script>가 없어요', () => {
    expect(KAKAO_SCRIPT).not.toMatch(/<\//);
  });
});
