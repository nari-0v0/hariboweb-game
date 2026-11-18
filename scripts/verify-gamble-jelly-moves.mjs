import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function indexRows(rows, fields, name) {
  if (!Array.isArray(rows)) throw new Error(name + ': 배열이 필요해요');
  const indexed = new Map();
  for (const row of rows) {
    const id = row?.user_id;
    if (typeof id !== 'string' || !/^\d{15,20}$/.test(id) || indexed.has(id)) {
      throw new Error(name + ': 잘못됐거나 중복된 디스코드 ID');
    }
    for (const field of fields) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0) {
        throw new Error(name + ': 잘못된 ' + field + ' 값 (' + id + ')');
      }
    }
    indexed.set(id, row);
  }
  return indexed;
}

// expected에는 승인된 지급 대상의 양수 이관액만 넣어요.
// before와 after는 해당 시각의 전체 gamble_accounts 잔액이에요.
export function verifyMoves(expected, before, after, paid) {
  const planned = indexRows(expected, ['jelly'], '승인 지급 명단');
  for (const [id, row] of planned) {
    if (row.jelly === 0) throw new Error('승인 지급 명단: 이관액은 양수여야 해요 (' + id + ')');
  }
  const baseline = indexRows(before, ['chips'], '지급 직전 잔액');
  if (baseline.size) throw new Error('지급 직전 잔액: 초기화 뒤 겜블 계정이 0건이어야 해요');
  const actual = indexRows(after, ['chips'], '지급 직후 잔액');
  const receipts = indexRows(paid, ['jelly'], '지급 완료 장부');
  const ledgerMismatches = [];
  for (const id of new Set([...planned.keys(), ...receipts.keys()])) {
    const expectedJelly = planned.get(id)?.jelly ?? null;
    const recordedJelly = receipts.get(id)?.jelly ?? null;
    if (expectedJelly !== recordedJelly) {
      ledgerMismatches.push({ user_id: id, expected: expectedJelly, recorded: recordedJelly });
    }
  }
  const users = new Set([...planned.keys(), ...actual.keys()]);
  const mismatches = [];
  let expectedTotal = 0n;
  for (const id of users) {
    const jelly = planned.get(id)?.jelly ?? 0;
    const current = actual.get(id)?.chips ?? 0;
    expectedTotal += BigInt(jelly);
    if (current !== jelly || planned.has(id) !== actual.has(id)) {
      mismatches.push({ user_id: id, expected: jelly, actual: current, account_missing: !actual.has(id) });
    }
  }
  return { expected_accounts: planned.size, expected_total: expectedTotal.toString(), mismatches, ledger_mismatches: ledgerMismatches };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = process.argv.slice(2);
    if (files.length !== 4) {
      throw new Error('쓰는 법: node scripts/verify-gamble-jelly-moves.mjs approved.json before.json after.json paid.json');
    }
    const [expected, before, after, paid] = files.map(file => JSON.parse(readFileSync(file, 'utf8')));
    const result = verifyMoves(expected, before, after, paid);
    console.log(JSON.stringify(result, null, 2));
    if (result.mismatches.length || result.ledger_mismatches.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
