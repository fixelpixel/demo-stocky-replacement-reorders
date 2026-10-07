import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast } from '../src/forecast.mjs';
import { parseInput } from '../src/input.mjs';
import { rawFixtures, sale, scenario } from './helpers.mjs';

test('calculates 90-day velocity, lead-time threshold and order-up-to stock', () => {
  // Given
  const input = scenario({ available: 5, incoming: 2 });
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.velocityPerDay, 2);
  assert.equal(result.reorderPoint, 25);
  assert.equal(result.targetStock, 53);
  assert.equal(result.inventoryPosition, 7);
  assert.equal(result.rawQuantity, 46);
});

test('rounds fractional demand upwards to a whole unit', () => {
  // Given
  const input = scenario({ safetyStockUnits: 0 }, [sale(91)]);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.reorderPoint, 11);
  assert.equal(result.targetStock, 25);
});

test('does not add a unit from floating-point error for exact coverage', () => {
  // Given
  const input = scenario({ leadTimeDays: 90, safetyStockUnits: 0 }, [sale(29)]);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.reorderPoint, 29);
});

test('reorders when inventory position exactly equals the reorder point', () => {
  // Given
  const input = scenario({ available: 25 });
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.rawQuantity, 28);
});

test('rejects integer overflow instead of emitting an imprecise forecast', () => {
  // Given
  const input = scenario({ leadTimeDays: 1_000_000_000 }, [sale(1_000_000_000)]);
  // When / Then
  assert.throws(() => forecast(input), /safe integer range/);
});

test('does not order above the threshold even below the order-up-to target', () => {
  // Given
  const input = scenario({ available: 26 });
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.suggestedQuantity, 0);
  assert.equal(result.decision, 'monitor');
});

test('counts incoming stock to avoid a duplicate purchase', () => {
  // Given
  const input = scenario({ incoming: 60 });
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.suggestedQuantity, 0);
  assert.ok(result.warnings.includes('verify_incoming_arrival_before_lead_time'));
});

test('orders no packs for zero sales and zero safety stock', () => {
  // Given
  const input = scenario({ safetyStockUnits: 0, minimumLineUnits: 100, packSize: 6 }, []);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.velocityPerDay, 0);
  assert.equal(result.suggestedQuantity, 0);
  assert.ok(result.warnings.includes('zero_sales'));
});

test('honors a configured safety-stock floor even without sales', () => {
  // Given
  const input = scenario({ safetyStockUnits: 5, packSize: 3 }, []);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.rawQuantity, 5);
  assert.equal(result.suggestedQuantity, 6);
});

test('excludes stockout days instead of interpreting missing sales as lower demand', () => {
  // Given
  const input = scenario({ stockouts: [{ from: '2026-08-02', to: '2026-09-01' }] }, [sale(120)]);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.stockoutDays, 30);
  assert.equal(result.sellingDays, 60);
  assert.equal(result.velocityPerDay, 2);
});

test('unions overlapping stockouts and clips periods outside the window', () => {
  // Given
  const input = scenario({ stockouts: [
    { from: '2026-08-01', to: '2026-08-11' }, { from: '2026-08-06', to: '2026-08-16' },
    { from: '2026-01-01', to: '2026-07-04' }, { from: '2026-10-01', to: '2026-10-20' },
  ] });
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.stockoutDays, 16);
  assert.equal(result.sellingDays, 74);
});

test('leaves a fully stocked-out product for manual estimation', () => {
  // Given
  const input = scenario({ stockouts: [{ from: '2026-07-03', to: '2026-10-01' }] }, []);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.velocityPerDay, null);
  assert.equal(result.reorderPoint, null);
  assert.equal(result.suggestedQuantity, 0);
  assert.equal(result.decision, 'manual_review');
});

test('uses only post-launch exposure for a new product and warns about thin history', () => {
  // Given
  const input = scenario({ launchedAt: '2026-09-21' }, [sale(20)]);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.sellingDays, 10);
  assert.equal(result.velocityPerDay, 2);
  assert.ok(result.warnings.includes('new_product'));
  assert.ok(result.warnings.includes('limited_history'));
});

test('requires manual review for a launch on the snapshot day', () => {
  // Given
  const input = scenario({ launchedAt: '2026-10-01' }, []);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.sellingDays, 0);
  assert.equal(result.velocityPerDay, null);
  assert.equal(result.decision, 'manual_review');
});

test('treats negative available inventory as backorders', () => {
  // Given
  const input = scenario({ available: -3 });
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.rawQuantity, 56);
  assert.ok(result.warnings.includes('negative_available_backorder'));
});

test('uses current quantity after refunds without double-subtracting them', () => {
  // Given
  const input = scenario({}, [sale(180, { lineItems: [{ variantId: 'demo-variant-mug', quantity: 200, currentQuantity: 180 }] })]);
  // When
  const [result] = forecast(input).variants;
  // Then
  assert.equal(result.netUnits, 180);
});

test('applies half-open UTC window boundaries and excludes cancelled and test orders', () => {
  // Given
  const input = scenario({}, [
    sale(90, { id: 'demo-order-start', createdAt: '2026-07-03T00:00:00Z' }),
    sale(999, { id: 'demo-order-before', createdAt: '2026-07-02T23:59:59Z' }),
    sale(999, { id: 'demo-order-end', createdAt: '2026-10-01T00:00:00Z' }),
    sale(999, { id: 'demo-order-test', test: true }),
    sale(999, { id: 'demo-order-cancel', cancelledAt: '2026-09-30T13:00:00Z' }),
  ]);
  // When
  const report = forecast(input);
  // Then
  assert.equal(report.variants[0].netUnits, 90);
  assert.deepEqual(report.excludedOrders, { outsideWindow: 2, cancelled: 1, test: 1 });
});

test('the checked-in fixtures cover 90 days and reproduce the intended three POs', () => {
  // Given
  const input = parseInput(rawFixtures());
  // When
  const report = forecast(input);
  // Then
  assert.equal(new Set(input.orders.filter(order => /^demo-order-\d+$/.test(order.id)).map(order => order.createdAt.slice(0, 10))).size, 90);
  assert.deepEqual(report.variants.filter(variant => variant.suggestedQuantity > 0).map(variant => [variant.sku, variant.suggestedQuantity]),
    [['DEMO-MUG', 42], ['DEMO-TEA', 24], ['DEMO-LAMP', 20], ['DEMO-NOTE', 45]]);
});
