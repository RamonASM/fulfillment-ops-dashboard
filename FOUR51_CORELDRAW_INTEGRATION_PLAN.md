# Four51 → CorelDRAW Print Merge Automation — Review & Build Plan

**Date:** June 16, 2026
**Scope decided with Ramon:** build inside `fulfillment-ops-dashboard`; ingest orders via a Four51 **cXML Order Request listener**; output a **CorelDRAW Print Merge** data file.
**Status:** Review complete. Plan below is awaiting go-ahead on Phase 0.

---

## 1. Executive summary

The thing you described as "half-built" does not exist anywhere in this repo. There is **no** Four51 API, cXML, variable-data, field-mapping-to-print, or CorelDRAW code. What exists is an inventory/fulfillment dashboard that ingests **manual CSV exports** from Four51.

The real problem is narrow and very solvable: Everstory's personalized products carry per-line imprint text (the "Title Line 1 / Title Line 2" you mentioned). That text needs to flow, **line-for-line**, into CorelDRAW to produce artwork. Today it's either re-keyed by hand or run through something that mis-parses it. I verified the root cause against your actual data (Section 3).

One hard constraint shapes the whole design, so it's stated up front: **CorelDRAW cannot be driven fully headlessly, and its Print Merge cannot stack two lines inside a single field.** That means the realistic automation target is *"generate a perfect, pre-split Print Merge data file + a pre-bound template, and have the merge run on a Corel workstation,"* not *"call a CorelDRAW API."* Details and the honest automation boundary are in Section 4.

---

## 2. What you actually have today

- A ~110K-line monorepo: Node/Express API (`apps/api`), two React apps (`apps/web` admin, `apps/portal` client), a Python importer (`apps/python-importer`), and DS/ML analytics services. Postgres via Prisma, PM2 + nginx on DigitalOcean.
- **Everstory** is the live client. They sell personalized memorial/funeral products (tote bags, memorial cards, bracelets, signage) through a **Four51 OrderCloud** storefront.
- Data moves **manually**: someone exports CSVs from Four51 and uploads them here. I confirmed the order export is a textbook Four51 OrderCloud file (`Order ID, User, Product ID, Product Name, Customized Product ID, Order Type, Quantity, Quantity Multiplier, Date Submitted, Ship To…`).
- The mapping engine that already exists (`import.service.ts`, `field-groups.ts`) is genuinely good — header-pattern detection, fuzzy matching, an AI fallback, and a learning loop. **We reuse it**, we don't replace it.

---

## 3. The real root cause (verified against your data)

Your orders export has a column called **`Customized Product ID`**. The name is misleading — it is **not** a SKU. It holds the **personalization/imprint text** for the line. Verified across the order exports in `uploads/`:

- **7,175 of 10,563 order lines (~68%)** have `Customized Product ID` ≠ `Product ID` — i.e. they're personalized.
- The values are real imprint strings: `"Sunset Memorial Park - Chester April 5"`, `"White Chapel Memorial Gardens - Wichita October 26"`, `"Grand Lawn Cemetery & Mausoleum November 13"`.
- **~149 of those values contain commas**, so the field is double-quoted in the CSV (RFC4180).

That last point is the crux of *"lines aren't being passed off correctly… line to line."* When a downstream step splits on commas **without honoring quotes**, every quoted, comma-bearing value shifts the columns for that row — and depending on the parser, can knock the alignment off for following rows too. The symptom is exactly what you described: line items stop matching up between systems. (I reproduced this class of bug on myself mid-review: a naïve comma split produced garbage like `"Amy Green DIRECTOR"` in the wrong column; a proper RFC4180 read produced clean data. Same trap.)

There's a second, compounding issue inside this dashboard: **the orders import path silently drops this field.** The Python `clean_orders_data()` hard-codes 8 target columns and re-indexes to the `Transaction` model, which has **no metadata/JSON column** — so even when the dashboard ingests orders, the personalization text is discarded. (Custom fields are only preserved on the *inventory* path, into `Product.metadata`.)

**Net:** the variable text exists, but it's (a) crammed into one mislabeled field, (b) comma-bearing and quote-sensitive, (c) not split into the discrete lines the printer needs, and (d) thrown away by the current importer. That's the whole bug, and all four parts are fixable.

> Why your choice of the **cXML listener** is the right call: in the cXML payload the imprint is **already split into named fields** (`Title Line 1`, `Title Line 2`, etc.) instead of one mashed string. The listener path makes the hardest part — separation — mostly disappear. See Section 5.

---

## 4. The one hard constraint: CorelDRAW's automation ceiling

Researched against Corel's official docs, the SDK API site, and community threads. Two findings drive the architecture:

1. **No REST/cloud/headless API.** CorelDRAW automation is COM/VBA, GMS macros, and VSTA (.NET) — all running inside the installed desktop app on Windows. There is **no** server-side or command-line "merge → PDF" mode. The `community.coreldraw.com/sdk/api` link you found is that desktop macro object model, not a web API.
2. **Print Merge itself is not in the scriptable object model**, and **multi-line text inside a single merge field is not supported** (confirmed: a user's two-line cell exploded into extra pages). PDF export *is* scriptable (`Document.PublishToPDF`).

**What this means concretely — the automation boundary:**

- We can fully automate everything up to and including a **correct, pre-split Print Merge data file** and a **pre-bound `.cdr` template**. That eliminates the re-keying and the line-to-line mapping errors — the actual pain.
- The **merge run** needs a CorelDRAW workstation. Practical options, in order of effort: (a) an operator clicks *Create Merged Document* (still a huge win — data is correct and split); (b) a VBA/VSTA macro post-processes the merged doc and exports PDF via `PublishToPDF`; (c) UI automation (AutoHotkey) drives the wizard for near-unattended runs.
- **Stack each visual line as its own field** (`TitleLine1`, `TitleLine2`, `OrgName`, `EventDate`…) with separate text objects in the template. Do **not** try to put a newline inside one field.

If "fully unattended, server-side PDF generation" turns out to be a hard requirement, CorelDRAW is the wrong engine and we'd revisit a VDP tool that is API/CLI-driven. Worth deciding explicitly rather than discovering later.

---

## 5. Target architecture (inside this dashboard)

```
Four51 OrderCloud
   │  (HTTP POST, raw cXML OrderRequest, text/xml)
   ▼
[NEW] POST /api/webhooks/four51   ← public route; CSRF already exempt; verify shared secret + IP allowlist
   │   • capture raw body  • verify  • return cXML <Response><Status code="200"/> fast (<5s)
   ▼
[NEW] cXML parser + mapping layer
   │   • parse OrderRequestHeader + each ItemOut
   │   • pull per-line ProductSpecs Extrinsics → canonical fields (TitleLine1/2, etc.)
   │   • pull ItemDetail/URL → production PDF link
   │   • dedupe on orderID (idempotent)
   ▼
[NEW] storage: PrintOrder + PrintOrderLine (Postgres/Prisma)
   ▼
[NEW] admin UI: review orders, confirm spec→column mapping   ← reuse ImportModal + MappingComboBox
   ▼
[NEW] GET /api/exports/print-merge  → CorelDRAW-ready CSV/XLSX   ← reuse export.routes.ts pattern
   ▼
CorelDRAW workstation: pre-bound .cdr template → Print Merge → PublishToPDF
```

### Four51 cXML → Print Merge field mapping (the translation layer)

The imprint text lives at `ItemDetail / Extrinsic[name="ProductSpecs"] / Extrinsic[name="<SpecName>"]`. Spec names are **defined by the catalog admin**, so the parser must **iterate them, never hard-code**.

| Print Merge column | Source in cXML | Notes |
|---|---|---|
| `OrderID` | `OrderRequestHeader/@orderID` | dedupe key |
| `LineNumber` | `ItemOut/@lineNumber` | preserves line-to-line order |
| `ProductID` | `ItemOut/ItemID/SupplierPartID` | the real SKU |
| `VariantID` | `ItemOut/ItemID/SupplierPartAuxiliaryID` | variant, if any |
| `TitleLine1` | `ProductSpecs/Extrinsic[name="Title Line 1"]` | **separate field** (Corel can't stack) |
| `TitleLine2` | `ProductSpecs/Extrinsic[name="Title Line 2"]` | **separate field** |
| `…other specs` | each remaining `ProductSpecs/Extrinsic` | mapped via the review UI |
| `Quantity` | `ItemOut/@quantity` × `quantityMultiplier` | drives row expansion (below) |
| `ProductionPDF` | `ItemDetail/URL` | set Four51 "Attachment Type = Production" |
| `Ship*` | `ItemOut/ShipTo/Address/…` | per-line ship-to |

**Line-to-line integrity rules** (this is where it currently breaks):

- One `ItemOut` = one logical line. Emit Print Merge rows in `lineNumber` order; never reorder.
- If the product is produced one-piece-per-record, expand a qty-N line into **N identical rows** (or a `Quantity` column the template imposition uses) — decide per product.
- Treat every field as quote-safe (RFC4180): quote any value containing comma, quote, or newline. This single rule kills the comma bug from Section 3.
- `ProductSpecs` can be **present but empty** (non-personalized lines) — handle gracefully.

### Data model additions (Prisma)

There is no `Order` model today (`OrderRequest` is an internal *reorder request* with required FKs to `PortalUser` and `Product` — a bad fit for external orders). Cleanest path is **two new purpose-built tables**:

- `PrintOrder`: `id`, `clientId`, `four51OrderId @unique` (idempotency → P2002 → 409, already handled), `source`, `status`, `orderDate`, `raw cXML` (audit), ship-to, timestamps.
- `PrintOrderLine`: `id`, `printOrderId`, `lineNumber`, `productId` (string, **not** a hard FK), `variantId`, `quantity`, `quantityMultiplier`, `specs Json` (all ProductSpecs name/value pairs), `titleLine1`, `titleLine2`, `productionPdfUrl`.

Storing the full spec set in a `Json` column (precedent: `Product.metadata`) keeps us flexible since spec names vary by product; the mapped/curated columns (`titleLine1/2`) are what the export reads.

### Known seams that make this cheaper than it sounds

- **The webhook is pre-anticipated:** `/api/webhooks/` is *already* in the CSRF exempt list with the comment "Webhooks protected by signature verification." Auth is opt-in per router, so a webhook router is simply public + our own signature middleware.
- **Reuse for the export:** `excel.service.ts → generateInventoryCSV()` is the template for `generatePrintMergeCSV()`; `export.routes.ts` is the pattern for the download route.
- **Reuse for the UI:** `ImportModal.tsx` mapping wizard + `MappingComboBox.tsx` are exactly the spec→column review screen; `Orders.tsx` is the list/line-item view.

### Gaps/risks to know about (found during review)

- **No XML parser** is installed, and **no raw/text body parser** is registered — an XML POST currently yields an empty `req.body`. We add `fast-xml-parser` + a path-scoped `express.text()` with raw-body capture (needed for signature verification).
- **The cron scheduler is never started** (`startScheduler()` has no caller) and **BullMQ is installed but unused.** For "ack fast, process after," follow the import route's persist-then-process pattern; don't assume the queue infra runs.
- Four51 **retries** on no-response (≈30 min, ≤3) and can **redeliver** — dedupe is our responsibility (the `@unique` handles it).
- Production PDF URLs are Four51-hosted and may need auth/IP context and may not be ready at the instant of the POST — fetch defensively/async.

---

## 6. Phased implementation plan (vertical slices, TDD per CLAUDE.md)

Each phase is end-to-end, tested, and committed before the next — matching this repo's own rules.

**Phase 0 — Quick win from the CSV you already have (1 slice, no new infra).**
Prove the CorelDRAW side *this week* without waiting on Four51. Build `generatePrintMergeCSV()` + a download route that: reads an uploaded orders CSV with a proper RFC4180 parser, pulls `Customized Product ID`, splits it into `TitleLine1/2` by an agreed rule, quote-safes every field, and emits a Corel-ready file. Then bind one real `.cdr` template and run a test merge. *Outcome:* a correct merge file from real data, and confirmation the Corel workflow holds — the fastest way to de-risk everything downstream.

**Phase 1 — cXML listener + storage.** Prisma migration for `PrintOrder`/`PrintOrderLine`; add XML + raw-body parsers; `POST /api/webhooks/four51` with shared-secret + IP-allowlist middleware; parse → map → persist (idempotent); return cXML `Status 200`. Integration tests with a real cXML sample (need one from you).

**Phase 2 — Review/mapping UI.** New admin page: list incoming print orders, show per-line specs, reuse `MappingComboBox` to confirm/adjust spec→column mapping (persisted, learnable), and a "Generate Print Merge file" download. Reuse `Orders.tsx` + `ImportModal` patterns.

**Phase 3 — CorelDRAW handoff.** Finalize the `.cdr` template field names to match export columns; deliver a VBA/VSTA macro that runs `PublishToPDF` (and, if needed, the documented two-macro line-break workaround) so an operator's part is one click. Optional AHK automation for near-unattended runs.

---

## 7. The 14 X/Twitter links — verdict

I read all 14 in the browser as you asked. **None** are about Four51, cXML, OrderCloud, variable-data printing, CorelDRAW, or web-to-print. They're a cluster of mid-2026 Claude Code / AI-agent threads: "loop engineering," subagents, hooks, CLAUDE.md discipline, plugin lists, "build your own harness," "agents that work while you sleep," LLM-from-scratch explainers. Engagement-bait density is high (one is a "leaked system prompt" clickbait).

So on *this* problem they contribute nothing. There are two transferable takeaways worth keeping:

- **Dev-workflow discipline** (recurring across @Blum_OG, @DamiDefi, @samueljmcd): run a tight loop — Explore subagent maps the code, plan first, **hooks enforce lint/tests after edits**, a **reviewer subagent** critiques the diff, then fix-and-recheck. Your `CLAUDE.md` already preaches this; the gap is enforcement (e.g. the scheduler that's defined but never wired). Adopting hooks-as-law would directly reduce the audit-churn this repo shows.
- **One concrete tool** (@nicos_ai's list): **n8n** (open-source workflow automation) is a legitimate candidate for the non-Corel "glue" — e.g. polling Four51, moving files, notifying the print team — if you'd rather not hand-code orchestration.

Honest recommendation: don't mine these further; they're general content, not solution inputs.

---

## 8. Open decisions I need from you

1. **Start with Phase 0?** It's low-risk and proves the Corel pipeline against real data immediately. (Recommended.)
2. **Title-splitting rule.** For the CSV quick-win, how should `"White Chapel Memorial Gardens - Wichita October 26"` break into lines? (e.g. split on `" - "`, or org-name vs date.) In the cXML world this is moot — the lines arrive separate.
3. **A real cXML OrderRequest sample** from Four51 (and confirmation the storefront can POST to a listener URL + issue a shared secret). Needed for Phase 1.
4. **A sample `.cdr` template** (or the field names/layout) for the personalized product you want to pilot.
5. **CorelDRAW version + subscriber status** (the Sept-2023 update added XLSX/Path/QR fields; older versions are CSV/TXT/RTF/ODBC only) and **who runs the merge** (operator vs. automated workstation).

---

*Sources: repo review (`import.service.ts`, `field-groups.ts`, `apps/python-importer/`, `schema.prisma`, `apps/web`), the uploaded Four51 Integration Guide (Aug 2015), the Four51 Order Request Implementation Guide (cXML `ProductSpecs` mapping, listener mechanism), CorelDRAW official Help + SDK API site + community threads, and direct analysis of the Everstory order exports in `uploads/`.*
