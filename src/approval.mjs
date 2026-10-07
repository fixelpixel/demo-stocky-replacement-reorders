import { array, date, email, id, integer, object, requireValue, text, unique } from './validation.mjs';
import { sha256 } from './output.mjs';

export function approve(content, review) {
  requireValue(typeof review.sha256 === 'string' && /^[a-f0-9]{64}$/.test(review.sha256), 'Review must supply a SHA-256 digest');
  requireValue(sha256(content) === review.sha256, 'PO changed since review: SHA-256 mismatch');
  const reviewer = id(review.reviewer, 'reviewer');
  const po = object(JSON.parse(content), 'PO');
  requireValue(po.status === 'draft' && po.synthetic === true && po.requiresHumanApproval === true, 'Only synthetic human-reviewed drafts may be approved');
  requireValue(po.shop === 'demo-store.example', 'PO shop must be synthetic');
  id(po.locationId, 'PO.locationId');
  const asOf = date(po.asOf, 'PO.asOf');
  const supplier = object(po.supplier, 'PO.supplier');
  id(supplier.id, 'PO.supplier.id');
  email(supplier.email, 'PO.supplier.email');
  text(supplier.name, 'PO.supplier.name');
  requireValue(supplier.currency === 'USD', 'PO currency must be USD');
  requireValue(po.id === `PO-${asOf}-${supplier.id}`, 'PO id does not match date and supplier');
  integer(supplier.minimumOrderUnits, 'supplier.minimumOrderUnits');
  integer(supplier.minimumOrderValueMinor, 'supplier.minimumOrderValueMinor');
  const lines = array(po.lines, 'PO.lines');
  requireValue(lines.length > 0, 'Empty PO cannot be approved');
  unique(lines, 'variantId', 'PO.lines');
  let totalUnits = 0;
  let totalMinor = 0;
  for (const line of lines) {
    object(line, 'PO.line');
    id(line.variantId, 'PO.line.variantId');
    text(line.sku, 'PO.line.sku');
    text(line.title, 'PO.line.title');
    integer(line.quantity, 'PO.line.quantity', 1);
    integer(line.packSize, 'PO.line.packSize', 1);
    integer(line.minimumLineUnits, 'PO.line.minimumLineUnits');
    integer(line.unitCostMinor, 'PO.line.unitCostMinor', 1);
    requireValue(line.quantity % line.packSize === 0 && line.quantity >= line.minimumLineUnits, 'PO line violates pack size or line minimum');
    requireValue(Number.isSafeInteger(line.lineTotalMinor) && line.lineTotalMinor === line.quantity * line.unitCostMinor, 'PO line cost mismatch');
    totalUnits += line.quantity;
    totalMinor += line.lineTotalMinor;
  }
  requireValue(Number.isSafeInteger(totalUnits) && Number.isSafeInteger(totalMinor), 'PO totals exceed safe integer range');
  requireValue(po.totalUnits === totalUnits && po.totalMinor === totalMinor, 'PO totals mismatch');
  requireValue(totalUnits >= supplier.minimumOrderUnits && totalMinor >= supplier.minimumOrderValueMinor, 'Supplier minimum not met: revise or defer PO');
  requireValue(po.approvalEligible === true && po.minimums?.shortfallUnits === 0 && po.minimums?.shortfallMinor === 0, 'PO eligibility metadata must match supplier minimums');
  return {
    schemaVersion: 1, poId: po.id, poSha256: review.sha256, reviewer,
    approvedAt: new Date().toISOString(), status: 'approved_locally',
    totalUnits, totalMinor, currency: 'USD', synthetic: true,
    emailsSent: 0, stockWrites: 0,
  };
}
