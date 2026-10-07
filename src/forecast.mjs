import { DAY_MS } from './input.mjs';
import { requireValue } from './validation.mjs';

export function forecast(input) {
  const unitsByVariant = new Map(input.variants.map(variant => [variant.id, 0]));
  const excludedOrders = { outsideWindow: 0, cancelled: 0, test: 0 };
  for (const order of input.orders) {
    const time = Date.parse(order.createdAt);
    if (time < input.windowStart || time >= input.windowEnd) { excludedOrders.outsideWindow++; continue; }
    if (order.test) { excludedOrders.test++; continue; }
    if (order.cancelledAt !== null) { excludedOrders.cancelled++; continue; }
    for (const line of order.lineItems) {
      const units = unitsByVariant.get(line.variantId) + line.currentQuantity;
      requireValue(Number.isSafeInteger(units), 'Sales units exceed safe integer range');
      unitsByVariant.set(line.variantId, units);
    }
  }
  const variants = input.variants.map(variant => {
    const start = Math.max(input.windowStart, Date.parse(variant.launchedAt));
    const ageDays = (input.windowEnd - start) / DAY_MS;
    let stockoutDays = 0;
    for (let day = start; day < input.windowEnd; day += DAY_MS) {
      const date = new Date(day).toISOString().slice(0, 10);
      if (variant.stockouts.some(period => date >= period.from && date < period.to)) stockoutDays++;
    }
    const sellingDays = ageDays - stockoutDays;
    const netUnits = unitsByVariant.get(variant.id);
    const velocity = sellingDays > 0 ? netUnits / sellingDays : null;
    const leadDemand = netUnits * variant.leadTimeDays;
    const coverageDemand = netUnits * (variant.leadTimeDays + input.reviewDays);
    requireValue(Number.isSafeInteger(leadDemand) && Number.isSafeInteger(coverageDemand), 'Forecast demand exceeds safe integer range');
    // Divide integer demand last: (29 / 90) * 90 otherwise rounds up to 30.
    const reorderPoint = velocity === null ? null : Math.ceil(leadDemand / sellingDays) + variant.safetyStockUnits;
    const targetStock = velocity === null ? null : Math.ceil(coverageDemand / sellingDays) + variant.safetyStockUnits;
    const inventoryPosition = variant.available + variant.incoming;
    const rawQuantity = velocity === null || inventoryPosition > reorderPoint ? 0 : Math.max(0, targetStock - inventoryPosition);
    const suggestedQuantity = rawQuantity > 0 ? Math.ceil(Math.max(rawQuantity, variant.minimumLineUnits) / variant.packSize) * variant.packSize : 0;
    requireValue(Number.isSafeInteger(suggestedQuantity) && (targetStock === null || Number.isSafeInteger(targetStock)), 'Forecast quantity exceeds safe integer range');
    const warnings = [];
    if (ageDays < 90) warnings.push('new_product');
    if (sellingDays < 14) warnings.push('limited_history');
    if (stockoutDays > 0) warnings.push('stockout_adjusted');
    if (sellingDays === 0) warnings.push('no_selling_days_manual_estimate_required');
    if (velocity === 0) warnings.push('zero_sales');
    if (variant.available < 0) warnings.push('negative_available_backorder');
    if (variant.incoming > 0) warnings.push('verify_incoming_arrival_before_lead_time');
    return {
      ...variant, ageDays, sellingDays, stockoutDays, netUnits,
      velocityPerDay: velocity, reorderPoint, targetStock, inventoryPosition,
      rawQuantity, suggestedQuantity, warnings,
      decision: sellingDays === 0 ? 'manual_review' : suggestedQuantity > 0 ? 'suggested' : 'monitor',
    };
  });
  return {
    shop: input.shop, asOf: input.asOf, locationId: input.locationId,
    window: { from: new Date(input.windowStart).toISOString(), toExclusive: new Date(input.windowEnd).toISOString(), days: 90 },
    reviewDays: input.reviewDays, excludedOrders, variants,
  };
}
