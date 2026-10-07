export function csv(rows) {
  return rows.map(row => row.map(value => {
    const cell = String(value ?? '');
    // Neutralize spreadsheet formulas while preserving the text in JSON.
    const safe = /^\s*[=+@-]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n') + '\r\n';
}

export function purchaseOrderCsv(po) {
  return csv([
    ['po_id', 'status', 'approval_eligible', 'supplier_id', 'currency', 'variant_id', 'sku', 'title', 'quantity', 'pack_size', 'unit_cost_minor', 'line_total_minor', 'warnings'],
    ...po.lines.map(line => [po.id, po.status, po.approvalEligible, po.supplier.id, po.supplier.currency,
      line.variantId, line.sku, line.title, line.quantity, line.packSize, line.unitCostMinor, line.lineTotalMinor, line.warnings.join(';')]),
  ]);
}

export function forecastCsv(report) {
  return csv([
    ['variant_id', 'sku', 'net_units', 'selling_days', 'stockout_days', 'velocity_per_day', 'available', 'incoming', 'reorder_point', 'target_stock', 'raw_quantity', 'suggested_quantity', 'decision', 'warnings'],
    ...report.variants.map(variant => [variant.id, variant.sku, variant.netUnits, variant.sellingDays,
      variant.stockoutDays, variant.velocityPerDay, variant.available, variant.incoming, variant.reorderPoint,
      variant.targetStock, variant.rawQuantity, variant.suggestedQuantity, variant.decision, variant.warnings.join(';')]),
  ]);
}

export function supplierEmail(po) {
  const amount = (po.totalMinor / 100).toFixed(2);
  return [
    'DRAFT ONLY - not sent. Human approval required before any supplier communication.',
    `Approval eligibility: ${po.approvalEligible ? 'ready for human review' : 'BLOCKED: supplier minimum not met'}`,
    `Minimum shortfalls: ${po.minimums.shortfallUnits} units; ${po.minimums.shortfallMinor} USD cents.`,
    `To: ${po.supplier.email}`,
    `Subject: Purchase order draft ${po.id}`,
    `Attachment draft: ${po.id}.csv`, '',
    `Hello ${po.supplier.name},`, '',
    `Please review the proposed order for ${po.shop}:`,
    ...po.lines.map(line => `- ${line.sku}: ${line.quantity} units (${line.quantity / line.packSize} packs of ${line.packSize})`),
    '', `Estimated goods total: ${amount} ${po.supplier.currency}, excluding freight and tax.`,
    'Please confirm availability, pricing, terms and expected delivery date.', '',
    'Demo purchasing team', '',
    'Internal review notes:',
    ...po.lines.map(line => `${line.sku}: ${line.warnings.join(', ') || 'no data warnings'}`),
    '', 'This file is a review artifact. The demo has no email transport.', '',
  ].join('\n');
}
