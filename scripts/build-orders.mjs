import { writeFile } from 'node:fs/promises';

// Reproducible, explicitly invented orders covering every day in [July 3, October 1).
const start = Date.parse('2026-07-03T00:00:00Z');
const orders = Array.from({ length: 90 }, (_, day) => {
  const createdAt = new Date(start + day * 86_400_000 + 12 * 3_600_000).toISOString();
  const lineItems = [
    { variantId: 'demo-variant-mug', quantity: 2, currentQuantity: 2 },
    { variantId: 'demo-variant-tea', quantity: day === 0 ? 3 : 1, currentQuantity: 1 },
    { variantId: 'demo-variant-pen', quantity: 1, currentQuantity: 1 },
  ];
  if ((day < 30 || day >= 60) && day % 2 === 0) {
    lineItems.push({ variantId: 'demo-variant-lamp', quantity: 1, currentQuantity: 1 });
  }
  if (day >= 80) lineItems.push({ variantId: 'demo-variant-notebook', quantity: 2, currentQuantity: 2 });
  return { id: `demo-order-${String(day + 1).padStart(3, '0')}`, createdAt, cancelledAt: null, test: false, lineItems };
});
for (const [id, createdAt, cancelledAt, test] of [
  ['demo-order-cancelled', '2026-09-30T14:00:00Z', '2026-09-30T15:00:00Z', false],
  ['demo-order-test', '2026-09-30T14:00:00Z', null, true],
  ['demo-order-before-window', '2026-07-02T23:59:59Z', null, false],
  ['demo-order-at-window-end', '2026-10-01T00:00:00Z', null, false],
]) {
  orders.push({ id, createdAt, cancelledAt, test,
    lineItems: [{ variantId: 'demo-variant-mug', quantity: 999, currentQuantity: 999 }] });
}
await writeFile(new URL('../fixtures/orders.json', import.meta.url), JSON.stringify(orders, null, 2) + '\n');
console.log(`Wrote ${orders.length} synthetic orders (90 daily orders + 4 exclusion cases).`);
