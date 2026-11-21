// 휴대폰에서 작은 물건도 누를 수 있게: 누르는 범위(tap)는 최소 크기까지 넓히되 다른 물건 가운데는 덮지 않아요.
// 나리 2026-11-19: 「도서관의 사라진 고지도」 촛불(가로 4%)을 휴대폰에서 못 눌러 건전지를 못 찾았어요.
import { describe, expect, it } from 'vitest';
import { ROOMS, TAP_MIN_H, TAP_MIN_W } from '../src/case-rooms';

const inside = (b: { x: number; y: number; w: number; h: number }, px: number, py: number) => Math.abs(px - b.x) < b.w / 2 && Math.abs(py - b.y) < b.h / 2;

describe('방 그림 누르는 범위', () => {
  it('도서관 촛불은 최소 크기로 넓어져요', () => {
    const candle = ROOMS.study.spots.find((s) => s.id === 'candle')!;
    expect(candle.tap).toEqual({ x: 34.5, y: 48, w: TAP_MIN_W, h: TAP_MIN_H });
  });

  it('넓힌 범위는 원래 물건을 품고, 방 밖으로 나가지 않고, 다른 물건 가운데를 새로 덮지 않아요', () => {
    let small = 0;
    let grown = 0;
    for (const room of Object.values(ROOMS)) {
      for (const h of room.spots) {
        if (!h.tap) continue;
        const t = h.tap;
        expect(t.w).toBeGreaterThanOrEqual(h.w);
        expect(t.h).toBeGreaterThanOrEqual(h.h);
        expect(t.x - t.w / 2).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w / 2).toBeLessThanOrEqual(100);
        expect(t.y - t.h / 2).toBeGreaterThanOrEqual(0);
        expect(t.y + t.h / 2).toBeLessThanOrEqual(100);
        for (const o of room.spots) if (o !== h && !inside(h, o.x, o.y)) expect(inside(t, o.x, o.y), `${room.key}/${h.id} covers ${o.id}`).toBe(false);
      }
      for (const h of room.spots) if (h.w < TAP_MIN_W || h.h < TAP_MIN_H) (small++, h.tap && grown++);
    }
    // 작은 물건 거의 다(이웃이 너무 붙은 몇 개 빼고) 넓어져요
    expect(grown / small).toBeGreaterThan(0.95);
  });
});
