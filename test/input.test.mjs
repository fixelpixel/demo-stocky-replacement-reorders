import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/input.mjs';
import { rawFixtures } from './helpers.mjs';

const invalidInputs = [
  ['a real shop domain', raw => { raw.inventory.shop = 'not-synthetic.invalid'; }, /shop/],
  ['a non-synthetic supplier address', raw => { raw.suppliers[0].email = 'orders@not-synthetic.invalid'; }, /email/],
  ['invalid calendar dates', raw => { raw.inventory.asOf = '2026-02-30'; }, /calendar/],
  ['invalid UTC timestamps', raw => { raw.orders[0].createdAt = '2026-07-03T25:00:00Z'; }, /timestamp/],
  ['cancellation before creation', raw => { raw.orders[0].cancelledAt = '2026-07-03T11:00:00Z'; }, /cancellation precedes/],
  ['missing quantities', raw => { delete raw.inventory.variants[0].incoming; }, /incoming/],
  ['zero pack size', raw => { raw.inventory.variants[0].packSize = 0; }, /packSize/],
  ['fractional stock units', raw => { raw.inventory.variants[0].available = 1.2; }, /available/],
  ['unknown supplier', raw => { raw.inventory.variants[0].supplierId = 'demo-missing'; }, /unknown supplier/],
  ['duplicate order IDs', raw => { raw.orders.push(structuredClone(raw.orders[0])); }, /duplicate/],
  ['duplicate variant IDs', raw => { raw.inventory.variants.push(structuredClone(raw.inventory.variants[0])); }, /duplicate/],
  ['duplicate SKUs', raw => { raw.inventory.variants[1].sku = raw.inventory.variants[0].sku; }, /duplicate/],
  ['unknown order variants', raw => { raw.orders[0].lineItems[0].variantId = 'demo-missing'; }, /unknown variant/],
  ['current quantity larger than original', raw => { raw.orders[0].lineItems[0].currentQuantity = 10; }, /exceeds quantity/],
  ['negative current quantity', raw => { raw.orders[0].lineItems[0].currentQuantity = -1; }, /currentQuantity/],
  ['sales before launch', raw => { raw.inventory.variants[0].launchedAt = '2026-09-30'; }, /sale before launch/],
  ['sales in declared full-day stockouts', raw => { raw.inventory.variants[0].stockouts = [{ from: '2026-07-03', to: '2026-07-04' }]; }, /sale during/],
  ['reversed stockout interval', raw => { raw.inventory.variants[0].stockouts = [{ from: '2026-08-02', to: '2026-08-01' }]; }, /stockout end/],
  ['unsafe IDs for output paths', raw => { raw.suppliers[0].id = '../demo-home'; }, /demo-\*/],
  ['mail header injection', raw => { raw.suppliers[0].name = 'Demo\r\nBcc: orders@demo-other.example'; }, /single-line/],
];

for (const [condition, mutate, message] of invalidInputs) {
  test(`rejects ${condition} before any output`, () => {
    // Given
    const raw = rawFixtures();
    mutate(raw);
    // When / Then
    assert.throws(() => parseInput(raw), message);
  });
}
