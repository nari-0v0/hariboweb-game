import { describe, expect, it } from 'vitest';
import { AdmissionGuard, LatestOnly } from '../src/plaza';

const A = '111111111111111111';
const B = '222222222222222222';

describe('AdmissionGuard', () => {
  it('blocks an admission that was in progress when the member was kicked', () => {
    const g = new AdmissionGuard();
    const ticket = g.begin();
    g.kick([A]);
    expect(g.revokedSince(A, ticket)).toBe(true);
    expect(g.revokedSince(B, ticket)).toBe(false);
    g.end();
  });

  it('lets an admission that started after the kick through (rejoined member)', () => {
    const g = new AdmissionGuard();
    const first = g.begin();
    g.kick([A]);
    const later = g.begin();
    expect(g.revokedSince(A, first)).toBe(true);
    expect(g.revokedSince(A, later)).toBe(false);
    g.end();
    g.end();
  });

  it('keeps nothing when no admission is in progress', () => {
    const g = new AdmissionGuard();
    g.kick([A]);
    const ticket = g.begin();
    expect(g.revokedSince(A, ticket)).toBe(false);
    g.end();
  });
});

describe('LatestOnly', () => {
  it('only the most recently started update may write', () => {
    const l = new LatestOnly();
    const older = l.start();
    const newer = l.start();
    expect(l.isLatest(newer)).toBe(true);
    expect(l.isLatest(older)).toBe(false);
  });
});
