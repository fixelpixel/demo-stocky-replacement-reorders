import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { array, date, email, id, integer, object, requireValue, text, timestamp, unique } from './validation.mjs';

export const DAY_MS = 86_400_000;

export function parseInput(raw) {
  object(raw, 'input');
  const inventory = object(raw.inventory, 'inventory');
  requireValue(inventory.shop === 'demo-store.example', 'inventory.shop: only demo-store.example is allowed');
  const asOf = date(inventory.asOf, 'inventory.asOf');
  const windowEnd = Date.parse(asOf);
  const windowStart = windowEnd - 90 * DAY_MS;
  const locationId = id(inventory.locationId, 'inventory.locationId');
  const reviewDays = integer(inventory.reviewDays, 'inventory.reviewDays', 1);
  const suppliers = array(raw.suppliers, 'suppliers').map((value, index) => {
    const label = `supplier[${index}]`;
    const supplier = object(value, label);
    requireValue(supplier.currency === 'USD', `${label}: demo supports USD only`);
    return {
      id: id(supplier.id, `${label}.id`), name: text(supplier.name, `${label}.name`),
      email: email(supplier.email, `${label}.email`), currency: supplier.currency,
      minimumOrderUnits: integer(supplier.minimumOrderUnits, `${label}.minimumOrderUnits`),
      minimumOrderValueMinor: integer(supplier.minimumOrderValueMinor, `${label}.minimumOrderValueMinor`),
    };
  });
  unique(suppliers, 'id', 'suppliers');
  const supplierIds = new Set(suppliers.map(supplier => supplier.id));
  const variants = array(inventory.variants, 'variants').map((value, index) => {
    const label = `variant[${index}]`;
    const variant = object(value, label);
    const launchedAt = date(variant.launchedAt, `${label}.launchedAt`);
    requireValue(Date.parse(launchedAt) <= windowEnd, `${label}: launch is after snapshot`);
    const supplierId = id(variant.supplierId, `${label}.supplierId`);
    requireValue(supplierIds.has(supplierId), `${label}: unknown supplier`);
    const available = integer(variant.available, `${label}.available`, -1_000_000_000);
    const stockouts = array(variant.stockouts, `${label}.stockouts`).map((period, periodIndex) => {
      object(period, `${label}.stockouts[${periodIndex}]`);
      const from = date(period.from, `${label}.stockout.from`);
      const to = date(period.to, `${label}.stockout.to`);
      requireValue(from < to, `${label}: stockout end must follow start`);
      return { from, to };
    });
    return {
      id: id(variant.id, `${label}.id`), sku: text(variant.sku, `${label}.sku`),
      title: text(variant.title, `${label}.title`), supplierId, launchedAt, available, stockouts,
      incoming: integer(variant.incoming, `${label}.incoming`),
      leadTimeDays: integer(variant.leadTimeDays, `${label}.leadTimeDays`),
      safetyStockUnits: integer(variant.safetyStockUnits, `${label}.safetyStockUnits`),
      packSize: integer(variant.packSize, `${label}.packSize`, 1),
      minimumLineUnits: integer(variant.minimumLineUnits, `${label}.minimumLineUnits`),
      unitCostMinor: integer(variant.unitCostMinor, `${label}.unitCostMinor`, 1),
    };
  });
  unique(variants, 'id', 'variants');
  unique(variants, 'sku', 'variants');
  const byId = new Map(variants.map(variant => [variant.id, variant]));
  const orders = array(raw.orders, 'orders').map((value, index) => {
    const label = `order[${index}]`;
    const order = object(value, label);
    requireValue(typeof order.test === 'boolean', `${label}.test: expected boolean`);
    const createdAt = timestamp(order.createdAt, `${label}.createdAt`);
    const cancelledAt = order.cancelledAt === null ? null : timestamp(order.cancelledAt, `${label}.cancelledAt`);
    requireValue(cancelledAt === null || Date.parse(cancelledAt) >= Date.parse(createdAt), `${label}: cancellation precedes creation`);
    const lineItems = array(order.lineItems, `${label}.lineItems`).map((item, itemIndex) => {
      object(item, `${label}.lineItems[${itemIndex}]`);
      const variantId = id(item.variantId, `${label}.variantId`);
      requireValue(byId.has(variantId), `${label}: unknown variant (map deleted variants explicitly)`);
      const currentQuantity = integer(item.currentQuantity, `${label}.currentQuantity`);
      const quantity = integer(item.quantity, `${label}.quantity`);
      requireValue(currentQuantity <= quantity, `${label}: currentQuantity exceeds quantity`);
      const variant = byId.get(variantId);
      const time = Date.parse(createdAt);
      if (!order.test && cancelledAt === null && currentQuantity > 0 && time >= windowStart && time < windowEnd) {
        requireValue(time >= Date.parse(variant.launchedAt), `${label}: sale before launch`);
        requireValue(!variant.stockouts.some(period => createdAt.slice(0, 10) >= period.from && createdAt.slice(0, 10) < period.to), `${label}: sale during declared full-day stockout`);
      }
      return { variantId, quantity, currentQuantity };
    });
    return { id: id(order.id, `${label}.id`), createdAt, cancelledAt, test: order.test, lineItems };
  });
  unique(orders, 'id', 'orders');
  return { shop: inventory.shop, asOf, locationId, reviewDays, windowStart, windowEnd, suppliers, variants, orders };
}

export async function loadInput(directory) {
  const [inventory, suppliers, orders] = await Promise.all(
    ['inventory.json', 'suppliers.json', 'orders.json'].map(async file => JSON.parse(await readFile(join(directory, file), 'utf8'))),
  );
  return parseInput({ inventory, suppliers, orders });
}
