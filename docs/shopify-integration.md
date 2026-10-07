# Read-only integration boundary

These files describe a future adapter. They are not an API client and have not
been executed against a development or live store. No token, OAuth flow,
Shopify SDK, email transport or HTTP code is included.

Documentation checked on 2026-10-07 for Admin GraphQL API `2026-10`.
Examples checked against the official Shopify Admin GraphQL `2026-10`
reference. Pin a supported version and validate the queries on a dev store
before implementing an adapter.

## Inventory

Use [inventory.graphql](inventory.graphql). A synthetic variable shape is:

```json
{
  "first": 50,
  "after": null,
  "locationId": "gid://shopify/Location/900000001"
}
```

This GID is invented and is not used by the tool. A real adapter supplies its
selected location. Follow `pageInfo.endCursor` until `hasNextPage` is false.
The query requests exactly one inventory level per variant. A missing level
or `tracked: false` needs an explicit exception, not a fabricated zero.

Map `available` and `incoming` by quantity **name**. Available already excludes
committed units; subtracting committed a second time would understate stock.
Incoming is counted here only under the assumption it arrives before the lead
time horizon. A real adapter must reconcile confirmed open POs, arrival dates
and Shopify incoming so the same shipment is counted once.

Requires `read_products`, `read_inventory` and the applicable `read_locations`
access for location data. References:
[ProductVariant](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ProductVariant),
[InventoryItem](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/InventoryItem),
[InventoryLevel](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/InventoryLevel),
[access scopes](https://shopify.dev/docs/api/usage/access-scopes).

## Orders

Use [orders.graphql](orders.graphql). For the fixture snapshot:

```json
{
  "first": 10,
  "after": null,
  "query": "created_at:>=2026-07-03T00:00:00Z created_at:<2026-10-01T00:00:00Z"
}
```

Use `read_orders` plus approved `read_all_orders` access for this 90-day
window. Default order access is only 60 days; **never silently divide a
60-day partial export by 90**. Write-order access is not needed for these
reads. See the [Order object](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order)
and [orders permissions](https://shopify.dev/docs/api/usage/access-scopes#orders-permissions).

Paginate outer orders and every nested `lineItems` connection separately;
use `ReorderOrderLineItems` for continuation pages and merge by line item ID.
Deduplicate order IDs during ingestion. The offline parser rejects duplicate
IDs so a double-counted export cannot silently become a larger purchase.
Check HTTP failures, GraphQL `errors`, cost limits and throttling; retain the
cursor and only mark an export complete after every page is stored.

Map `currentQuantity` directly to retained units: it excludes refunded and
removed units. Do not subtract refunds again. Keep original `quantity` for
validation. Exclude test orders and cancelled orders explicitly. Handle a
null `variant` (deleted or custom item) via a recorded exception or historical
mapping before producing a normalized export. See
[LineItem](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem).

The demo assumes one location serves all fixture demand. In a multi-location
store, reconcile order demand to the replenishment location explicitly.
Store sales are not automatically warehouse-level demand.

## Data Shopify's current snapshot does not supply

- `launchedAt` is the merchant's first selling date. Product `createdAt` can
  be an earlier catalog-import date and is not an automatic substitute.
- Historical full-day stockout intervals come from saved daily snapshots or
  a reconciled inventory ledger. Today's inventory query does not recover
  90 days of availability. Continuing to sell while available is zero also
  means a full-day stockout mask is inappropriate.
- Supplier mapping, unit cost, pack size, line MOQ, supplier minimum units,
  supplier minimum value, lead time and safety stock live in the app's own
  rule configuration. A product vendor string is not a purchasing contract.

## Approval and supplier handoff

The merchant opens forecast, PO CSV/JSON and email draft, verifies incoming
arrivals, prices, low-history warnings, quantities and supplier minimums,
then supplies the digest of those exact PO JSON bytes to the local approval
command. The command checks totals, pack multiples and minimums and writes
a separate `approved_locally` receipt. It does not mutate the draft.

For a real app, add authenticated approvers, optimistic version checks,
durable append-only approval events, fresh stock validation, and a unique
open-PO reservation before scheduling a supplier message. Sending and
receiving must have their own state transitions and retry-safe records.

This demo owns a draft document only. It makes no claim that native Shopify
purchase-order creation is exposed by these queries. A native PO adapter,
supplier confirmation, inventory transfer and receipt posting need separate
capability checks and tests. An approved local receipt is not an ordered or
received shipment.
