import { ESCAPE_CASES } from './escape';
import { MAX_CHAPTER } from './journey-chapters';
import { xpForLevel } from './levels';
import { ESCAPE_STEPS, JOURNEY_NEEDS, capNeed, type Need } from './unlock';

const PLANNED_NEEDS: Need[] = [
  { cards: 60, lv: 25, lvCards: 5 },
  { cards: 60, lv: 25, lvCards: 8 },
];

type ProgressRow = {
  cards: number;
  journeyTop: number;
  journeyStarted: number;
  casesSolved: number;
  escapeStarted: number;
} & Record<`lv${number}`, number>;

export async function gameProgressStats(db: D1Database) {
  const needs = [...JOURNEY_NEEDS, ...ESCAPE_STEPS, ...PLANNED_NEEDS];
  const levels = [...new Set(needs.flatMap(({ lv }) => lv === undefined ? [] : [lv]))].sort((a, b) => a - b);
  const levelColumns = levels.map((lv) => `COUNT(CASE WHEN c.xp >= ${xpForLevel(lv)} THEN 1 END) AS lv${lv}`);
  const { results: rows } = await db.prepare(`
    WITH active_members AS (
      SELECT user_id FROM members WHERE active = 1
    ), dogam AS (
      SELECT c.owner_id, COUNT(*) AS cards, ${levelColumns.join(', ')}
      FROM cards c
      JOIN active_members owner ON owner.user_id = c.owner_id
      JOIN active_members target ON target.user_id = c.target_id
      WHERE c.owner_id != c.target_id
      GROUP BY c.owner_id
    )
    SELECT COALESCE(d.cards, 0) AS cards,
      ${levels.map((lv) => `COALESCE(d.lv${lv}, 0) AS lv${lv}`).join(', ')},
      COALESCE((SELECT chapter FROM journey_runs
        WHERE user_id = m.user_id AND status = 'done' AND cleared = 1
        ORDER BY chapter DESC LIMIT 1), 0) AS journeyTop,
      EXISTS(SELECT 1 FROM journey_runs WHERE user_id = m.user_id) AS journeyStarted,
      (SELECT COUNT(*) FROM escape_rewards WHERE user_id = m.user_id
        AND case_id IN (SELECT value FROM json_each(?))) AS casesSolved,
      EXISTS(SELECT 1 FROM escape_runs WHERE user_id = m.user_id) AS escapeStarted
    FROM active_members m LEFT JOIN dogam d ON d.owner_id = m.user_id
  `).bind(JSON.stringify(ESCAPE_CASES.map(({ id }) => id))).all<ProgressRow>();

  function eligibility(need0: Need) {
    const need = capNeed(need0, rows.length);
    const eligible = rows.filter((row) => row.cards >= need.cards &&
      (need.lv === undefined || (row[`lv${need.lv}`] ?? 0) >= (need.lvCards ?? 0)));
    return {
      need,
      members: eligible.length,
      journeyFinishers: eligible.filter((row) => row.journeyTop >= MAX_CHAPTER).length,
      escapeFinishers: eligible.filter((row) => row.casesSolved === ESCAPE_CASES.length).length,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    activeMembers: rows.length,
    dogam: {
      cardCountDistribution: [0, 1, 5, 10, 20, 30, 35, 45, 55, 60, 70].map((min, index, bounds) => {
        const next = bounds[index + 1];
        return { min, max: next === undefined ? null : next - 1,
          members: rows.filter(({ cards }) => cards >= min && (next === undefined || cards < next)).length };
      }),
      cardCountsByMinimumLevel: levels.map((level) => ({
        level,
        atLeastOne: rows.filter((row) => (row[`lv${level}`] ?? 0) >= 1).length,
        atLeastFive: rows.filter((row) => (row[`lv${level}`] ?? 0) >= 5).length,
        atLeastEight: rows.filter((row) => (row[`lv${level}`] ?? 0) >= 8).length,
      })),
      plannedRequirements: PLANNED_NEEDS.map(eligibility),
    },
    journey: {
      started: rows.filter((row) => row.journeyStarted).length,
      chapters: JOURNEY_NEEDS.map((need, index) => ({
        chapter: index + 1,
        cleared: rows.filter((row) => row.journeyTop >= index + 1).length,
        ...eligibility(need),
      })),
    },
    escape: {
      totalCases: ESCAPE_CASES.length,
      started: rows.filter((row) => row.escapeStarted).length,
      solvedMilestones: [...new Set([1, 5, 10, 20, 30, 40, 50, ESCAPE_CASES.length])]
        .filter((solved) => solved <= ESCAPE_CASES.length)
        .map((solved) => ({ solved, members: rows.filter((row) => row.casesSolved >= solved).length })),
      unlockSteps: ESCAPE_STEPS.map((need, index) => ({ step: index + 1, ...eligibility(need) })),
    },
  };
}
