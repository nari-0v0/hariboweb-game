// 디스코드 액티비티(디스코드 앱 안에서 연 도감)용 화면 스크립트.
// 고친 뒤 `npm run build:activity`로 public/discord-activity.js를 다시 만들고,
// src/views/activity.tsx의 ACTIVITY_SCRIPT_SRC ?v= 숫자를 올려요.
//
// 하는 일
// 1. 처음 화면(#activity-boot): 디스코드에 로그인 허락(authorize)을 받아 code를 서버로 보내고, 내 카드로 넘어가요.
// 2. 다른 화면: 카카오톡 같은 바깥 링크를 누르면 디스코드의 "외부 링크 열기"로 열어요
//    (디스코드 앱 속 칸 안에서는 바깥 사이트로 바로 갈 수 없어요).
import { DiscordSDK } from '@discord/embedded-app-sdk';

type Win = Window & { __hariboActivity?: boolean };
const KEY = 'haribo-activity-query';
// SDK는 document.referrer(디스코드 부모 창 주소)로 연결할 곳을 정해요. 화면을 옮기면 referrer가 우리 주소로 바뀌어서 첫 값을 기억해 둬요.
const REF_KEY = 'haribo-activity-referrer';

function clientIdOf(): string {
  const fromScript = (document.currentScript as HTMLScriptElement | null)?.dataset.clientId;
  const boot = document.getElementById('activity-boot');
  return fromScript || boot?.dataset.clientId || '';
}

const hasLaunchQuery = () => !!new URLSearchParams(location.search).get('frame_id');

// 🚀로 막 연 첫 주소(점검 화면이어도)에서 디스코드가 준 값과 부모 창 주소를 기억해요.
function saveLaunch() {
  if (!hasLaunchQuery()) return;
  try {
    sessionStorage.setItem(KEY, location.search);
    if (document.referrer) sessionStorage.setItem(REF_KEY, document.referrer);
  } catch {
    /* 저장이 막혀 있으면 다른 화면에서 바깥 링크만 못 열어요 */
  }
}
function saved(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

// SDK는 처음 열 때 주소에 붙은 frame_id 등을 읽어요. 다른 화면으로 옮긴 뒤에는 기억해 둔 값을 잠깐 주소에 붙였다가 되돌려요.
let sdkPromise: Promise<DiscordSDK> | null = null;
function getSdk(clientId: string): Promise<DiscordSDK> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const here = location.pathname + location.search + location.hash;
    let swapped = false;
    let refPatched = false;
    if (!hasLaunchQuery()) {
      const query = saved(KEY);
      const ref = saved(REF_KEY);
      if (!query || !ref) throw new Error('no launch info');
      history.replaceState(history.state, '', location.pathname + query + location.hash);
      swapped = true;
      // SDK가 만들어지는 순간에만 referrer를 처음 값(디스코드 부모 창)으로 보여 줘요.
      Object.defineProperty(document, 'referrer', { configurable: true, get: () => ref });
      refPatched = true;
    }
    let sdk: DiscordSDK;
    try {
      sdk = new DiscordSDK(clientId);
    } finally {
      if (swapped) history.replaceState(history.state, '', here);
      if (refPatched) delete (document as unknown as { referrer?: string }).referrer;
    }
    await sdk.ready();
    return sdk;
  })();
  sdkPromise.catch(() => {
    sdkPromise = null;
  });
  return sdkPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function boot(root: HTMLElement, clientId: string) {
  const status = document.getElementById('activity-status');
  const retry = document.getElementById('activity-retry') as HTMLButtonElement | null;
  const say = (text: string, canRetry = false) => {
    if (status) status.textContent = text;
    if (retry) retry.hidden = !canRetry;
  };
  retry?.addEventListener('click', () => location.reload());
  try {
    const sdk = await withTimeout(getSdk(clientId), 15_000);
    let code: string;
    try {
      ({ code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds.members.read'],
      }));
    } catch {
      say('디스코드 계정 확인을 허락해야 들어갈 수 있어요.', true);
      return;
    }
    say('하리보 서버 멤버인지 확인하는 중이에요…');
    const res = await fetch('/activity/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (data.error === 'not_member') say('하리보 디스코드 서버 멤버만 들어올 수 있어요.');
      else say('로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.', true);
      return;
    }
    const check = (await (await fetch('/activity/check', { credentials: 'same-origin' })).json().catch(() => ({}))) as { in?: boolean };
    if (!check.in) {
      say('디스코드 앱이 로그인 정보를 저장하지 못했어요. 디스코드 앱을 최신으로 업데이트해 주세요.', true);
      return;
    }
    root.dataset.done = '1';
    location.replace('/me');
  } catch {
    say('디스코드와 연결하지 못했어요. 액티비티를 닫았다가 다시 열어 주세요.', true);
  }
}

function linkOpener(clientId: string) {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      withTimeout(getSdk(clientId), 5_000)
        .then((sdk) => sdk.commands.openExternalLink({ url: url.href }))
        .catch(() => {
          // 디스코드와 연결이 안 되면 새 창 열기라도 해 봐요.
          window.open(url.href, '_blank', 'noopener');
        });
    },
    true,
  );
}

(() => {
  const w = window as Win;
  if (w.__hariboActivity) return;
  w.__hariboActivity = true;
  const clientId = clientIdOf();
  if (!clientId) return;
  saveLaunch();
  linkOpener(clientId);
  const root = document.getElementById('activity-boot');
  if (root) void boot(root, clientId);
})();
