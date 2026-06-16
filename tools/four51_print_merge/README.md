# Four51 → CorelDRAW Print Merge converter (Phase 0)

A small, dependency-free tool that turns a Four51 orders CSV export into a
**CorelDRAW Print Merge** data file. It fixes the parsing/mapping bugs that were
breaking the line-to-line handoff and splits the imprint text into separate
fields CorelDRAW can use.

## Why this exists

In the Four51 order export, the imprint text is stored in the misleadingly named
**`Customized Product ID`** column (not a SKU). On the Everstory data:

- ~68% of order lines are personalized (7,175 of 10,563).
- Some imprint values contain commas, so they're double-quoted in the CSV. Any
  tool that splits on commas without honoring quotes shifts that row's columns
  and breaks the mapping — the exact "lines aren't passed off correctly" symptom.

This converter reads and writes with an RFC4180-correct CSV engine (so quoting is
respected both ways), splits the imprint into `TitleLine1` / `TitleLine2` /
`EventDate`, and **always preserves the raw imprint** in `CustomizedText` so a
bad split is never destructive.

## Run it

```bash
cd tools/four51_print_merge
python3 four51_print_merge.py path/to/orders_export.csv -o printmerge.csv

# one row per unit (for one-piece-per-record products):
python3 four51_print_merge.py orders.csv -o printmerge.csv --expand-quantity

# change the line separator used to split the imprint (default " - "):
python3 four51_print_merge.py orders.csv -o printmerge.csv --line-sep " | "
```

Run the tests:

```bash
python3 -m pytest test_four51_print_merge.py     # or: python3 test_four51_print_merge.py
```

## Output columns → CorelDRAW merge fields

The header row of the output file becomes the merge-field names inside CorelDRAW.
Build your `.cdr` template once with text objects bound to these fields:

| Column | Use in the template |
|---|---|
| `TitleLine1` | First imprint line (place a text object here) |
| `TitleLine2` | Second imprint line — **a separate, stacked text object** |
| `EventDate` | Optional date line, if your product shows one |
| `CustomizedText` | The full raw imprint (use if you'd rather place it as one block) |
| `ProductID` / `ProductName` | Product identification / internal proofing |
| `OrderID` / `LineNumber` | Traceability back to the order, line by line |
| `Quantity` / `QuantityMultiplier` | Run length |
| `ShipToCompany` / `ShipToName` / `ShipToCity` / `ShipToState` | Labels / packing |
| `IsPersonalized` | `Yes`/`No` — filter or conditional layout |

### The one CorelDRAW rule to remember

CorelDRAW Print Merge **cannot stack two lines inside a single merge field.**
That's why the imprint is split into `TitleLine1` and `TitleLine2`. In the
template, place **two separate text objects** (one per field) rather than trying
to put a line break inside one. (If you ever must keep it in one field, Corel
requires a two-macro Excel+CorelDRAW workaround — avoid it.)

### Building the template (once)

1. In CorelDRAW: **File → Print Merge → Create/Load** → import this CSV as the data source.
2. Insert the fields above as text objects; stack `TitleLine1` above `TitleLine2`.
3. Save the `.cdr`. The data-source association is stored in the document.
4. For each new order batch: regenerate the CSV with this tool, run
   **Create Merged Document**, then export (`Document.PublishToPDF` via a macro,
   or File → Export).

> Encoding: the file is UTF-8. If CorelDRAW shows odd characters, re-save as
> ANSI/Windows-1252, or use the XLSX import path on subscriber builds (Sept 2023+).
> Don't put a backslash `\` in field names — it's reserved in Corel's legacy format.

## The split heuristic (and its limits — read this)

Default rule, applied only to personalized lines:

1. Peel a trailing month/day(/year) into `EventDate`.
2. If the remainder contains ` - `, split once → `TitleLine1` / `TitleLine2`.
3. Otherwise the whole remainder → `TitleLine1`.

On the real export this cleanly handles the `Org - City Month Day` pattern
(e.g. `White Chapel Memorial Gardens - Wichita October 26`). But the imprint
format is **inconsistent** — most values are a single organization name, and a
few are person-name-with-credentials (`Jennifer Wells, MBA, SHRM-CP`). A single
regex can't perfectly resolve every case, so the raw text is always kept in
`CustomizedText` for review/correction.

**This is precisely why the Phase 1 cXML listener is the real fix:** in the
Four51 cXML payload each imprint line arrives as its own **named** field
(`ProductSpecs/Extrinsic[name="Title Line 1"]`, `"Title Line 2"`, …), so there's
no guessing — the converter will read those directly and emit the same output
columns below, but correctly separated at the source.

## Maps to the bigger plan

See `FOUR51_CORELDRAW_INTEGRATION_PLAN.md` at the repo root. This tool is Phase 0
(prove the CorelDRAW side from today's CSV). Phase 1 swaps the CSV reader for a
cXML listener; the output contract (these columns) stays the same.
