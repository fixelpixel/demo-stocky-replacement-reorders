import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forecast } from './forecast.mjs';
import { loadInput } from './input.mjs';
import { buildPurchaseOrders } from './purchase-orders.mjs';
import { forecastCsv, purchaseOrderCsv, supplierEmail } from './render.mjs';

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

const json = value => JSON.stringify(value, null, 2) + '\n';

export async function generate(inputDirectory, outputDirectory) {
  const input = await loadInput(inputDirectory);
  const report = forecast(input);
  const purchaseOrders = buildPurchaseOrders(report, input.suppliers);
  const files = new Map([
    ['forecast.json', json(report)], ['forecast.csv', forecastCsv(report)],
  ]);
  for (const po of purchaseOrders) {
    files.set(`${po.id}.json`, json(po));
    files.set(`${po.id}.csv`, purchaseOrderCsv(po));
    files.set(`${po.id}.email.txt`, supplierEmail(po));
  }
  const manifest = {
    schemaVersion: 1, mode: 'offline-draft', synthetic: true,
    shop: input.shop, asOf: input.asOf, ordersRead: input.orders.length,
    excludedOrders: report.excludedOrders, variants: report.variants.length,
    purchaseOrders: purchaseOrders.map(po => ({ id: po.id, status: po.status, approvalEligible: po.approvalEligible, totalUnits: po.totalUnits, totalMinor: po.totalMinor })),
    inputSha256: sha256(json(input)),
    files: [...files].map(([file, content]) => ({ file, sha256: sha256(content) })),
    stockWrites: 0, emailsSent: 0, networkRequests: 0,
  };
  // A fresh directory is required: reruns cannot overwrite review or approval records.
  await mkdir(outputDirectory);
  for (const [file, content] of files) await writeFile(join(outputDirectory, file), content, { flag: 'wx' });
  await writeFile(join(outputDirectory, 'run.json'), json(manifest), { flag: 'wx' });
  return manifest;
}
