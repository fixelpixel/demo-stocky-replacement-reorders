import { requireValue } from './validation.mjs';

export function buildPurchaseOrders(report, suppliers) {
  return [...suppliers].sort((a, b) => a.id.localeCompare(b.id)).flatMap(supplier => {
    const lines = report.variants.filter(variant => variant.supplierId === supplier.id && variant.suggestedQuantity > 0)
      .sort((a, b) => a.id.localeCompare(b.id)).map(variant => ({
        variantId: variant.id, sku: variant.sku, title: variant.title,
        quantity: variant.suggestedQuantity, packSize: variant.packSize,
        minimumLineUnits: variant.minimumLineUnits, unitCostMinor: variant.unitCostMinor,
        lineTotalMinor: variant.suggestedQuantity * variant.unitCostMinor,
        calculation: {
          netUnits: variant.netUnits, sellingDays: variant.sellingDays, velocityPerDay: variant.velocityPerDay,
          available: variant.available, incoming: variant.incoming, inventoryPosition: variant.inventoryPosition,
          leadTimeDays: variant.leadTimeDays, safetyStockUnits: variant.safetyStockUnits,
          reorderPoint: variant.reorderPoint, targetStock: variant.targetStock, rawQuantity: variant.rawQuantity,
        },
        warnings: variant.warnings,
      }));
    if (lines.length === 0) return [];
    const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    requireValue(Number.isSafeInteger(totalUnits) && Number.isSafeInteger(totalMinor), 'PO totals exceed safe integer range');
    const shortfallUnits = Math.max(0, supplier.minimumOrderUnits - totalUnits);
    const shortfallMinor = Math.max(0, supplier.minimumOrderValueMinor - totalMinor);
    return [{
      id: `PO-${report.asOf}-${supplier.id}`, status: 'draft', synthetic: true,
      shop: report.shop, asOf: report.asOf, locationId: report.locationId, window: report.window,
      reviewDays: report.reviewDays, supplier, lines, totalUnits, totalMinor,
      minimums: { shortfallUnits, shortfallMinor },
      approvalEligible: shortfallUnits === 0 && shortfallMinor === 0,
      requiresHumanApproval: true,
    }];
  });
}
