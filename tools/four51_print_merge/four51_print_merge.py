#!/usr/bin/env python3
"""
Four51 order CSV  ->  CorelDRAW Print Merge data file.

Phase 0 of the Four51 -> CorelDRAW automation. Standalone, stdlib-only.

What it fixes (the real bugs found in the Everstory exports):
  1. The imprint text lives in the misleadingly-named "Customized Product ID"
     column, NOT the Product ID. ~68% of order lines carry it.
  2. Many imprint values contain commas, so they are double-quoted in the CSV.
     Splitting on commas WITHOUT honoring quotes shifts every column on that
     row and breaks the line-to-line mapping. We read/write with Python's csv
     module, which is RFC4180-correct, so quoting is handled both ways.
  3. CorelDRAW Print Merge cannot stack two lines inside one field, so we split
     the imprint into separate TitleLine1 / TitleLine2 (+ EventDate) columns.
     The raw imprint is preserved in CustomizedText so nothing is ever lost.

This is the CSV-based quick win. The production path (a Four51 cXML listener)
will deliver these fields already separated as named ProductSpecs; the splitter
below only matters while we read the flat CSV export.

Usage:
    python3 four51_print_merge.py INPUT_ORDERS.csv -o OUTPUT_printmerge.csv
    python3 four51_print_merge.py INPUT.csv -o OUT.csv --expand-quantity
    python3 four51_print_merge.py INPUT.csv -o OUT.csv --line-sep " - "
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass

# --- Source column names, exactly as Four51 exports them -------------------
SRC_ORDER_ID = "Order ID"
SRC_USER = "User"
SRC_PRODUCT_ID = "Product ID"
SRC_PRODUCT_NAME = "Product Name"
SRC_IMPRINT = "Customized Product ID"   # <-- actually the imprint text, not an ID
SRC_ORDER_TYPE = "Order Type"
SRC_ORDER_STATUS = "Order Status"
SRC_QTY = "Quantity"
SRC_QTY_MULT = "Quantity Multiplier"
SRC_TOTAL_QTY = "Total Quantity"
SRC_DATE = "Date Submitted"
SRC_SHIP_COMPANY = "Ship To Company Name"
SRC_SHIP_FIRST = "Ship To First Name"
SRC_SHIP_LAST = "Ship To Last Name"
SRC_SHIP_CITY = "Ship To City"
SRC_SHIP_STATE = "Ship To State"

# --- Output (CorelDRAW Print Merge) field names ----------------------------
# Header row becomes the merge-field names inside CorelDRAW. Keep them simple
# (no spaces / reserved chars) so they bind cleanly in the template.
OUT_FIELDS = [
    "OrderID",
    "LineNumber",       # sequential within each order, in file order = line-to-line integrity
    "ProductID",
    "ProductName",
    "IsPersonalized",   # Yes / No
    "CustomizedText",   # raw imprint, preserved verbatim
    "TitleLine1",
    "TitleLine2",
    "EventDate",
    "Quantity",
    "QuantityMultiplier",
    "ShipToCompany",
    "ShipToName",
    "ShipToCity",
    "ShipToState",
    "DateSubmitted",
]

_MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|"
    "November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec"
)
# Trailing date like "April 5", "October 26", "Nov 13, 2024"
_TRAILING_DATE_RE = re.compile(
    r"\s+(?P<date>(?:%s)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\s*$" % _MONTHS,
    re.IGNORECASE,
)


@dataclass
class SplitResult:
    title_line1: str
    title_line2: str
    event_date: str


def extract_trailing_date(text: str) -> tuple[str, str]:
    """Return (text_without_date, date_or_empty)."""
    m = _TRAILING_DATE_RE.search(text)
    if not m:
        return text.strip(), ""
    date = m.group("date").strip()
    remainder = text[: m.start()].strip()
    return remainder, date


def split_imprint(imprint: str, line_sep: str = " - ") -> SplitResult:
    """
    Split a single imprint string into two visible lines + an optional date.

    Default heuristic (transparent and conservative):
      1. Peel a trailing month/day(/year) into EventDate.
      2. If the remainder contains the line separator (default ' - '),
         split once: left -> TitleLine1, right -> TitleLine2.
      3. Otherwise the whole remainder -> TitleLine1, TitleLine2 empty.

    The raw imprint is always preserved separately by the caller, so an
    imperfect split is never destructive and can be corrected downstream.
    """
    text = (imprint or "").strip()
    if not text:
        return SplitResult("", "", "")
    remainder, date = extract_trailing_date(text)
    if line_sep and line_sep in remainder:
        left, right = remainder.split(line_sep, 1)
        return SplitResult(left.strip(), right.strip(), date)
    return SplitResult(remainder.strip(), "", date)


def is_personalized(imprint: str, product_id: str) -> bool:
    """An imprint is real personalization only if it is non-empty AND differs
    from the SKU (Four51 repeats the Product ID here for non-personalized lines)."""
    t = (imprint or "").strip()
    return bool(t) and t != (product_id or "").strip()


def _full_name(first: str, last: str) -> str:
    return " ".join(p for p in [(first or "").strip(), (last or "").strip()] if p)


def transform_row(row: dict, line_no: int, line_sep: str) -> dict:
    imprint = row.get(SRC_IMPRINT, "") or ""
    product_id = row.get(SRC_PRODUCT_ID, "") or ""
    personalized = is_personalized(imprint, product_id)
    split = split_imprint(imprint, line_sep) if personalized else SplitResult("", "", "")
    return {
        "OrderID": (row.get(SRC_ORDER_ID, "") or "").strip(),
        "LineNumber": line_no,
        "ProductID": product_id.strip(),
        "ProductName": (row.get(SRC_PRODUCT_NAME, "") or "").strip(),
        "IsPersonalized": "Yes" if personalized else "No",
        "CustomizedText": imprint.strip() if personalized else "",
        "TitleLine1": split.title_line1,
        "TitleLine2": split.title_line2,
        "EventDate": split.event_date,
        "Quantity": (row.get(SRC_TOTAL_QTY) or row.get(SRC_QTY, "") or "").strip(),
        "QuantityMultiplier": (row.get(SRC_QTY_MULT, "") or "").strip(),
        "ShipToCompany": (row.get(SRC_SHIP_COMPANY, "") or "").strip(),
        "ShipToName": _full_name(row.get(SRC_SHIP_FIRST, ""), row.get(SRC_SHIP_LAST, "")),
        "ShipToCity": (row.get(SRC_SHIP_CITY, "") or "").strip(),
        "ShipToState": (row.get(SRC_SHIP_STATE, "") or "").strip(),
        "DateSubmitted": (row.get(SRC_DATE, "") or "").strip(),
    }


def convert(in_path: str, out_path: str, line_sep: str = " - ",
            expand_quantity: bool = False) -> dict:
    """Convert a Four51 orders CSV to a CorelDRAW Print Merge CSV.

    Returns a stats dict for reporting.
    """
    stats = {"rows_in": 0, "rows_out": 0, "personalized": 0,
             "with_two_lines": 0, "with_date": 0, "missing_columns": []}

    with open(in_path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        for required in (SRC_ORDER_ID, SRC_PRODUCT_ID, SRC_IMPRINT):
            if required not in header:
                stats["missing_columns"].append(required)
        if stats["missing_columns"]:
            raise ValueError(
                "Input does not look like a Four51 orders export. Missing "
                f"columns: {stats['missing_columns']}. Found: {header}"
            )

        per_order_counter: dict[str, int] = {}
        # newline="" + default dialect => RFC4180 quoting on output.
        with open(out_path, "w", newline="", encoding="utf-8") as out_fh:
            writer = csv.DictWriter(out_fh, fieldnames=OUT_FIELDS)
            writer.writeheader()
            for raw in reader:
                stats["rows_in"] += 1
                order_id = (raw.get(SRC_ORDER_ID, "") or "").strip()
                per_order_counter[order_id] = per_order_counter.get(order_id, 0) + 1
                rec = transform_row(raw, per_order_counter[order_id], line_sep)

                if rec["IsPersonalized"] == "Yes":
                    stats["personalized"] += 1
                    if rec["TitleLine2"]:
                        stats["with_two_lines"] += 1
                    if rec["EventDate"]:
                        stats["with_date"] += 1

                reps = 1
                if expand_quantity:
                    try:
                        reps = max(1, int(float(rec["Quantity"] or 1)))
                    except ValueError:
                        reps = 1
                for _ in range(reps):
                    writer.writerow(rec)
                    stats["rows_out"] += 1
    return stats


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Four51 orders CSV -> CorelDRAW Print Merge CSV")
    p.add_argument("input", help="Path to the Four51 orders CSV export")
    p.add_argument("-o", "--output", required=True, help="Path for the Print Merge CSV")
    p.add_argument("--line-sep", default=" - ",
                   help="Separator used to split imprint into two lines (default ' - ')")
    p.add_argument("--expand-quantity", action="store_true",
                   help="Emit one row per unit (Quantity), for one-piece-per-record products")
    args = p.parse_args(argv)

    stats = convert(args.input, args.output, args.line_sep, args.expand_quantity)
    print(
        "Print Merge file written: {out}\n"
        "  rows in:            {rows_in}\n"
        "  rows out:           {rows_out}\n"
        "  personalized lines: {personalized}\n"
        "  split into 2 lines: {with_two_lines}\n"
        "  trailing date found:{with_date}".format(out=args.output, **stats),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
