# Four51 cXML Listener — Phase 1 (build + go-live)

Automates the whole loop: Four51 posts each order to us → we store it with the
imprint already split into Title Line 1 / Title Line 2 → the portal exports a
CorelDRAW Print Merge file. No more manual CSV export/re-key.

## What was built

```
Four51 storefront
   │  POST raw cXML OrderRequest (text/xml)
   ▼
POST /api/webhooks/four51        apps/api/src/routes/webhooks/four51.routes.ts
   │   • raw body, no CSRF/JWT (CSRF-exempt by design)
   │   • auth: SharedSecret in the cXML, compared timing-safe to FOUR51_SHARED_SECRET
   │   • optional source-IP allowlist (FOUR51_ALLOWED_IPS)
   │   • returns cXML <Response><Status code="200" text="OK"/>
   ▼
parse + map                      apps/api/src/services/four51-cxml.service.ts
   │   ProductSpecs Extrinsics -> TitleLine1/TitleLine2 + full specs map
   │   ItemDetail/URL -> production PDF link; entities decoded; XML-bomb-safe
   ▼
persist (idempotent)             apps/api/src/services/four51-print-order.service.ts
   │   upsert on (clientId, four51OrderId); replace lines on re-delivery
   ▼
PrintOrder / PrintOrderLine      apps/api/prisma/schema.prisma  (tables print_orders / print_order_lines)
   ▼
Portal: "Export received orders" GET /api/portal/exports/print-merge/stored
   └─ reuses the same Print Merge column contract as the upload tool
```

The upload-and-convert tool from Phase 0 still works; this adds the automated
ingestion path and a DB-backed export beside it.

## Go-live: 3 steps

### 1. Create the tables + regenerate the Prisma client
From the repo root (the Prisma client MUST be regenerated — the new models won't
compile until you do):

```bash
npm run db:generate -w apps/api   # regenerate client (adds PrintOrder types)
npm run db:push     -w apps/api   # create print_orders / print_order_lines
# (or fold prisma/migrations/manual_add_print_orders.sql into a tracked migration)
```

`npm run db:generate` is already part of your deploy script, so a normal deploy
covers the client regeneration; you just need the schema applied (`db:push`).

### 2. Set environment variables (production `.env`)

```bash
FOUR51_CLIENT_ID=<the internal Client UUID to attach orders to>   # required
FOUR51_SHARED_SECRET=<the shared secret you give Four51>          # required
FOUR51_ALLOWED_IPS=209.134.131.129,209.134.131.187               # optional allowlist
```

If either required var is missing the webhook fails closed (500, "not
configured") — it never silently accepts unauthenticated orders.

> Find the Client UUID: `SELECT id, name FROM clients WHERE code = 'everstory';`

### 3. Configure Four51
Point Four51's Order Request listener at:

```
https://api.yourtechassist.us/api/webhooks/four51
```

- Set the **SharedSecret** to the same value as `FOUR51_SHARED_SECRET`.
- Set **Attachment Type = Production** so the order carries the production PDF URL.
- Make sure **"Include Specs"** is on so the ProductSpecs (Title Line 1/2) are sent.

## Test it before pointing Four51 at it

```bash
# Replace the secret to match FOUR51_SHARED_SECRET. Expect HTTP 200 + cXML Status 200.
curl -i -X POST https://api.yourtechassist.us/api/webhooks/four51 \
  -H 'Content-Type: text/xml' \
  --data-binary @sample-order.cxml
```

A wrong/missing secret returns cXML `Status code="401"`; unparseable XML returns
`406`. There's a representative sample structure in
`apps/api/src/services/four51-cxml.service.test.ts`.

## What's verified vs. what needs your environment

Verified here: cXML parsing, title-line separation, entity decoding, row
building, and the Print Merge column contract — 19 unit tests pass; API + portal
typecheck clean apart from the `prisma.printOrder` references that resolve on
`db:generate`.

Needs your side: apply the schema, set the env vars, supply a real Four51 sample
+ the real shared secret, and run a live test POST. I did not deploy.

## Known limitations / next

- **Single-tenant:** orders attach to the one `FOUR51_CLIENT_ID`. Multi-client
  support would key off the cXML `To` credential — straightforward to add later.
- **CorelDRAW merge is still operator-run** (no headless API exists — see
  `FOUR51_CORELDRAW_INTEGRATION_PLAN.md`). This feature gets you a perfect,
  pre-split data file; a person still runs Create Merged Document + exports PDF.
- **Migration is a manual SQL file**, not a tracked Prisma migration (couldn't
  generate one offline). `db:push` is the simplest apply; fold into a migration
  for reproducible deploys.
- **Production PDF URLs** are stored but not yet downloaded/cached; fetch them
  when you wire the artwork side.
