import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DECO_CHARACTERS } from '../src/characters';
import { DECO_PRICES, SHOP_ITEMS } from '../src/shop';

// 나리가 준 투명 배경 낱장 그림(sheets.json의 single)이 build_characters.py로 제대로 들어갔는지 봐요.
// - 잘린 그림 크기 = 원본에서 투명하지 않은 부분의 상자(빈 테두리만 잘라요)
// - 벌·물방울·인형처럼 떨어진 소품도 지워지지 않아요(원본의 또렷한 픽셀이 모두 남아요)

type Png = { w: number; h: number; alpha: Uint8Array };

// 이 테스트에 필요한 만큼만 읽는 PNG 해석기: 8비트 RGBA(6)와 8비트 팔레트(3), 인터레이스 없음
function readPng(path: string): Png {
  const buf = readFileSync(path);
  let pos = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  let trns: Uint8Array = new Uint8Array();
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      type = data[9]!;
      if (data[8] !== 8 || data[12] !== 0 || (type !== 6 && type !== 3)) throw new Error(`${path}: 지원하지 않는 PNG`);
    } else if (name === 'tRNS') trns = new Uint8Array(data);
    else if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[y * stride + x] = (v + pred) & 255;
    }
  }
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = type === 6 ? out[i * 4 + 3]! : (trns[out[i]!] ?? 255);
  return { w, h, alpha };
}

function box(p: Png) {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.alpha[y * p.w + x]! > 0) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const sheets = JSON.parse(readFileSync('assets/characters/sheets.json', 'utf8')) as {
  deco: { file: string; single?: boolean; center?: number; characters: [string, string][] }[];
};
const singles = sheets.deco.filter((s) => s.single);
const JOBS = ['astronaut', 'beekeeper', 'calligrapher', 'clockmaker', 'conductor', 'construction-worker', 'diver', 'farmer', 'lighthouse-keeper', 'puppeteer', 'firefighter', 'glassblower', 'brewer'];

describe('낱장 꾸밈 캐릭터 그림', () => {
  it('직업 캐릭터 13종 × 소녀·소년이 모두 낱장으로 들어가 있어요', () => {
    const ids = singles.map((s) => s.characters[0]![0]).filter((id) => !id.startsWith('mech-'));
    expect(ids).toEqual(JOBS.flatMap((j) => [`${j}-girl`, `${j}-boy`]));
    for (const s of singles) expect(s.characters.length).toBe(1);
  });

  it.each(singles.map((s) => [s.characters[0]![0], s.file, s.center] as const))('%s: 빈 테두리만 자르고 떨어진 소품도 남아요', (id, file, center) => {
    const src = readPng(`assets/characters/${file}`);
    const out = readPng(`public/char/deco/${id}.png`);
    const want = box(src);
    // center가 있으면 얼굴이 가운데 오게 한쪽에 투명 칸을 덧대요(메카, 나리 2026-11-21)
    const pad = center === undefined ? 0 : Math.round(Math.abs(2 * (want.w * center) / 100 - want.w));
    const padLeft = center !== undefined && center < 50 ? pad : 0;
    expect([out.w, out.h]).toEqual([want.w + pad, want.h]);
    // 원본에서 또렷한 픽셀(알파 128 이상)은 같은 자리에 모두 남아요: 시트 모드처럼 떨어진 조각을 지우면 빠져요.
    // (아주 옅은 가장자리 번짐은 색 128개로 줄일 때 투명으로 합쳐질 수 있어요)
    const left = Math.min(...[...Array(src.w).keys()].filter((x) => [...Array(src.h).keys()].some((y) => src.alpha[y * src.w + x]! > 0)));
    const top = Math.min(...[...Array(src.h).keys()].filter((y) => [...Array(src.w).keys()].some((x) => src.alpha[y * src.w + x]! > 0)));
    let lost = 0;
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++)
        if (src.alpha[y * src.w + x]! >= 128 && out.alpha[(y - top) * out.w + (x - left + padLeft)]! === 0) lost++;
    expect(lost).toBe(0);
    const meta = DECO_CHARACTERS.find((d) => d.id === id)!;
    expect([meta.w, meta.h]).toEqual([out.w, out.h]);
  });

  it('모든 꾸밈 캐릭터 목록의 크기가 실제 그림 파일과 같아요(다시 빌드해도 기존 그림이 그대로)', () => {
    for (const d of DECO_CHARACTERS) {
      const buf = readFileSync(`public/char/deco/${d.id}.png`);
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)], d.id).toEqual([d.w, d.h]);
    }
  });

  it('메카 11종은 상점에서 팔지 않고 도감 보상으로만 열려요', () => {
    const mecha = singles.map((s) => s.characters[0]![0]).filter((id) => id.startsWith('mech-'));
    expect(mecha.length).toBe(11);
    for (const id of mecha) {
      expect(DECO_PRICES[id], id).toBeUndefined();
      expect(SHOP_ITEMS.find((i) => i.id === `deco:${id}`)?.price, id).toBeNull();
    }
  });

  it('새 직업 캐릭터는 다른 직업 캐릭터와 같은 35젤리에 팔아요', () => {
    for (const s of singles) {
      const id = s.characters[0]![0];
      if (id.startsWith('mech-')) continue; // 메카는 팔지 않는 도감 보상이에요
      expect(DECO_PRICES[id], id).toBe(DECO_PRICES.chef);
      expect(SHOP_ITEMS.find((i) => i.id === `deco:${id}`)?.price).toBe(35);
    }
  });
});
