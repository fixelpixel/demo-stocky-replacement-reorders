import { readFileSync } from 'node:fs';
import { parseInput } from '../src/input.mjs';

export function rawFixtures() {
  return Object.fromEntries(['inventory', 'suppliers', 'orders'].map(name => [name,
    JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')),
  ]));
}

export function sale(quantity, changes = {}) {
  return {
    id: 'demo-order-one', createdAt: '2026-09-30T12:00:00Z', cancelledAt: null, test: false,
    lineItems: [{ variantId: 'demo-variant-mug', quantity, currentQuantity: quantity }], ...changes,
  };
}

export function scenario(variant = {}, orders = [sale(180)]) {
  const raw = rawFixtures();
  raw.inventory.variants = [{ ...raw.inventory.variants[0], available: 0, incoming: 0,
    leadTimeDays: 10, safetyStockUnits: 5, packSize: 1, minimumLineUnits: 0, ...variant }];
  raw.orders = orders;
  return parseInput(raw);
}
