import test from 'node:test';
import assert from 'node:assert/strict';
import { approve } from '../src/approval.mjs';
import { forecast } from '../src/forecast.mjs';
import { parseInput } from '../src/input.mjs';
import { sha256 } from '../src/output.mjs';
import { buildPurchaseOrders } from '../src/purchase-orders.mjs';
import { csv, purchaseOrderCsv, supplierEmail } from '../src/render.mjs';
import { rawFixtures, scenario } from './helpers.mjs';

function fixturePOs() {
  const input = parseInput(rawFixtures());
  return buildPurchaseOrders(forecast(input), input.suppliers);
}

test('groups suggested variants by supplier and excludes monitor or manual-review variants', () => {
  // Given
  const input = parseInput(rawFixtures());
  // When
  const pos = buildPurchaseOrders(forecast(input), input.suppliers);
  // Then
  assert.deepEqual(pos.map(po => [po.supplier.id, po.lines.length, po.totalUnits, po.totalMinor]), [
    ['demo-supplier-home', 2, 66, 27000], ['demo-supplier-light', 1, 20, 24000], ['demo-supplier-paper', 1, 45, 13500],
  ]);
});

test('rounds up pack sizes after the line minimum, never rounding demand down', () => {
  // Given
  const input = scenario({ available: 5, incoming: 2, packSize: 8, minimumLineUnits: 65 });
  // When
  const [po] = buildPurchaseOrders(forecast(input), input.suppliers);
  // Then
  assert.equal(po.lines[0].calculation.rawQuantity, 46);
  assert.equal(po.lines[0].quantity, 72);
  assert.equal(po.totalMinor, 36000);
});

test('blocks supplier value minimum without adding unrelated products or inflating quantities', () => {
  // Given
  const input = parseInput(rawFixtures());
  // When
  const po = buildPurchaseOrders(forecast(input), input.suppliers).find(po => po.supplier.id === 'demo-supplier-light');
  // Then
  assert.equal(po.approvalEligible, false);
  assert.deepEqual(po.minimums, { shortfallUnits: 0, shortfallMinor: 6000 });
  assert.equal(po.lines[0].quantity, 20);
});

test('blocks supplier unit minimum even if the goods value is sufficient', () => {
  // Given
  const input = scenario({ packSize: 1, unitCostMinor: 10000 });
  // When
  const [po] = buildPurchaseOrders(forecast(input), input.suppliers);
  // Then
  assert.equal(po.totalUnits, 53);
  assert.deepEqual(po.minimums, { shortfallUnits: 7, shortfallMinor: 0 });
  assert.equal(po.approvalEligible, false);
});

test('accepts supplier minimums exactly at their boundaries', () => {
  // Given
  const input = scenario({ packSize: 1 });
  input.suppliers[0].minimumOrderUnits = 53;
  input.suppliers[0].minimumOrderValueMinor = 26500;
  // When
  const [po] = buildPurchaseOrders(forecast(input), input.suppliers);
  // Then
  assert.equal(po.approvalEligible, true);
});

test('creates no empty PO when every variant is adequately stocked', () => {
  // Given
  const input = scenario({ available: 1000 });
  // When
  const pos = buildPurchaseOrders(forecast(input), input.suppliers);
  // Then
  assert.deepEqual(pos, []);
});

test('escapes CSV quotes and commas while neutralizing spreadsheet formulas', () => {
  // Given
  const rows = [['=1+1', '@SUM(A1)', '-cmd', 'a,"b"', 'ordinary', 42]];
  // When
  const result = csv(rows);
  // Then
  assert.equal(result, '"\'=1+1","\'@SUM(A1)","\'-cmd","a,""b""","ordinary","42"\r\n');
});

test('renders supplier drafts with the same quantities and goods total as the PO', () => {
  // Given
  const [po] = fixturePOs();
  // When
  const email = supplierEmail(po);
  // Then
  assert.ok(email.includes(`To: ${po.supplier.email}`));
  assert.ok(email.includes('270.00 USD'));
  for (const line of po.lines) assert.ok(email.includes(`${line.sku}: ${line.quantity} units`));
});

test('CSV carries draft status, eligibility and machine-readable quantities', () => {
  // Given
  const [po] = fixturePOs();
  // When
  const result = purchaseOrderCsv(po);
  // Then
  assert.equal(result.split('\r\n').filter(Boolean).length, 3);
  assert.ok(result.includes('"draft","true"'));
  assert.ok(result.includes('"42","6","500","21000"'));
});

test('records explicit local approval bound to the exact reviewed bytes', () => {
  // Given
  const [po] = fixturePOs();
  const content = JSON.stringify(po);
  // When
  const result = approve(content, { sha256: sha256(content), reviewer: 'demo-reviewer' });
  // Then
  assert.equal(result.status, 'approved_locally');
  assert.equal(result.poSha256, sha256(content));
  assert.equal(result.totalUnits, 66);
  assert.equal(result.emailsSent, 0);
  assert.equal(result.stockWrites, 0);
});

const invalidApprovals = [
  ['supplier minimum shortfall', pos => pos[1], /minimum not met/],
  ['pack size violation', pos => { pos[0].lines[0].quantity = 43; return pos[0]; }, /pack size/],
  ['incorrect total', pos => { pos[0].totalMinor = 1; return pos[0]; }, /totals mismatch/],
  ['non-draft status', pos => { pos[0].status = 'ordered'; return pos[0]; }, /drafts/],
  ['forged eligibility metadata', pos => { pos[0].minimums.shortfallMinor = 1; return pos[0]; }, /eligibility/],
];
for (const [condition, mutate, message] of invalidApprovals) {
  test(`rejects approval with ${condition}`, () => {
    // Given
    const content = JSON.stringify(mutate(fixturePOs()));
    // When / Then
    assert.throws(() => approve(content, { sha256: sha256(content), reviewer: 'demo-reviewer' }), message);
  });
}

test('rejects approval when the reviewed PO changes', () => {
  // Given
  const content = JSON.stringify(fixturePOs()[0]);
  // When / Then
  assert.throws(() => approve(content + '\n', { sha256: sha256(content), reviewer: 'demo-reviewer' }), /SHA-256 mismatch/);
});
