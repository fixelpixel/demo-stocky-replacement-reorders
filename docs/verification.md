# Local verification

Verified on 2026-10-07 with Node `v22.22.2`, npm, and `node:test`.

## Test result

`npm test`: **61 tests passed; 0 failed, cancelled, skipped or todo**.

Coverage: velocity and reorder maths, exact/fractional coverage, integer
overflow, zero sales, safety-stock floors, stockout unions/clipping, new
products, zero exposure, incoming and negative stock, refunded quantities,
UTC window boundaries, input errors, supplier grouping, pack/MOQ rounding,
supplier unit/value minimums, CSV escaping, email quantities/totals, approval
validation and digest mismatch.

Seven real CLI scenarios cover generation, approval, changed PO rejection,
minimum shortfall rejection, preserved run directories, preserved approval
receipts, and rejection of an unsupported send option. Generated files match
checked-in examples byte-for-byte and every manifest digest is verified.

A regression was reproduced before fixing the calculation: `(29 / 90) * 90`
became `29.000000000000004` and ceiling incorrectly proposed 30 units.
The test failed with `30 !== 29`; integer demand divided last now passes.

## Observed CLI run

`npm run demo` read 94 synthetic orders and 8 variants and wrote 3 supplier
POs, 3 CSVs, 3 email drafts, forecast JSON/CSV and a completion manifest.

| Supplier | Units | Total USD cents | Approval eligible |
| --- | ---: | ---: | --- |
| demo-supplier-home | 66 | 27000 | true |
| demo-supplier-light | 20 | 24000 | false: 6000-cent shortfall |
| demo-supplier-paper | 45 | 13500 | true, with new-product warning |

A separate CLI approval using fictional reviewer `demo-operator` produced
`approved_locally` for the Home PO with its reviewed digest:
`a5e6ffb1286f1333003c66ab8d2ae9ff95503de47fdb67de5f2c8e9209f8328f`.
This is a synthetic workflow demonstration, not merchant approval of a purchase.

The CLI run and receipt reported 0 emails sent and 0 stock writes. Code
inspection found no network client, email transport or environment-variable
reads in `src/` or `scripts/`. GraphQL files were never executed.

## Review limits

Syntax checks and runtime tests passed. This verification covers the offline
CLI only; no Shopify store, email delivery, hosted service or production
approval system was exercised. These limitations are explicit in the README.
