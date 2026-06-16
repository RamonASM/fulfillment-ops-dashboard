#!/usr/bin/env python3
"""
Tests for four51_print_merge.

Runnable two ways:
    python3 -m pytest test_four51_print_merge.py
    python3 test_four51_print_merge.py        # plain runner, no pytest needed
"""
import csv
import io
import os
import tempfile

from four51_print_merge import (
    convert,
    extract_trailing_date,
    is_personalized,
    split_imprint,
)


def test_split_org_location_and_date():
    r = split_imprint("White Chapel Memorial Gardens - Wichita October 26")
    assert r.title_line1 == "White Chapel Memorial Gardens"
    assert r.title_line2 == "Wichita"
    assert r.event_date == "October 26"


def test_split_org_with_trailing_date_no_separator():
    r = split_imprint("Grand Lawn Cemetery & Mausoleum November 13")
    assert r.title_line1 == "Grand Lawn Cemetery & Mausoleum"
    assert r.title_line2 == ""
    assert r.event_date == "November 13"


def test_split_plain_org_no_date():
    r = split_imprint("Bronswood Cemetery")
    assert r.title_line1 == "Bronswood Cemetery"
    assert r.title_line2 == ""
    assert r.event_date == ""


def test_trailing_date_with_year_and_abbrev():
    remainder, date = extract_trailing_date("Covington Memorial Gardens Dec 14, 2024")
    assert remainder == "Covington Memorial Gardens"
    assert date == "Dec 14, 2024"


def test_is_personalized_rules():
    # Four51 repeats the SKU for non-personalized lines -> not personalized.
    assert is_personalized("EVR-BAG-001", "EVR-BAG-001") is False
    assert is_personalized("", "EVR-BAG-001") is False
    assert is_personalized("Sunset Memorial Park", "EVR-CRD-002") is True


def test_rfc4180_comma_value_roundtrips():
    """The core bug: a comma-bearing, quoted imprint must survive read+write
    without shifting any columns."""
    src = io.StringIO()
    w = csv.writer(src)
    w.writerow(["Order ID", "Product ID", "Product Name", "Customized Product ID",
                "Quantity", "Quantity Multiplier", "Total Quantity", "Date Submitted",
                "Ship To Company Name", "Ship To First Name", "Ship To Last Name",
                "Ship To City", "Ship To State", "User", "Order Type", "Order Status"])
    # Imprint contains a comma -> csv writer will quote it.
    w.writerow(["1001", "EVR-CRD-9", "Memorial Card", "Smith Family, In Memory - Ohio May 3",
                "5", "1", "5", "5/3/24", "Smith Funeral Home", "Jane", "Doe",
                "Columbus", "OH", "buyer", "Standard", "Completed"])

    with tempfile.TemporaryDirectory() as d:
        ip = os.path.join(d, "in.csv")
        op = os.path.join(d, "out.csv")
        with open(ip, "w", newline="", encoding="utf-8") as fh:
            fh.write(src.getvalue())
        stats = convert(ip, op)
        assert stats["rows_in"] == 1
        assert stats["rows_out"] == 1
        assert stats["personalized"] == 1
        with open(op, newline="", encoding="utf-8") as fh:
            out = list(csv.DictReader(fh))
        assert len(out) == 1
        rec = out[0]
        # Column alignment preserved despite the comma in the imprint:
        assert rec["ProductID"] == "EVR-CRD-9"
        assert rec["CustomizedText"] == "Smith Family, In Memory - Ohio May 3"
        assert rec["TitleLine1"] == "Smith Family, In Memory"
        assert rec["TitleLine2"] == "Ohio"
        assert rec["EventDate"] == "May 3"
        assert rec["ShipToName"] == "Jane Doe"


def test_line_numbers_increment_per_order():
    src = io.StringIO()
    w = csv.writer(src)
    w.writerow(["Order ID", "Product ID", "Customized Product ID"])
    w.writerow(["A", "P1", "Org One"])
    w.writerow(["A", "P2", "Org Two"])
    w.writerow(["B", "P1", "Org Three"])
    with tempfile.TemporaryDirectory() as d:
        ip = os.path.join(d, "in.csv")
        op = os.path.join(d, "out.csv")
        with open(ip, "w", newline="", encoding="utf-8") as fh:
            fh.write(src.getvalue())
        convert(ip, op)
        with open(op, newline="", encoding="utf-8") as fh:
            out = list(csv.DictReader(fh))
    assert [r["LineNumber"] for r in out] == ["1", "2", "1"]


def test_expand_quantity():
    src = io.StringIO()
    w = csv.writer(src)
    w.writerow(["Order ID", "Product ID", "Customized Product ID", "Total Quantity"])
    w.writerow(["A", "P9", "Memorial Bench", "3"])
    with tempfile.TemporaryDirectory() as d:
        ip = os.path.join(d, "in.csv")
        op = os.path.join(d, "out.csv")
        with open(ip, "w", newline="", encoding="utf-8") as fh:
            fh.write(src.getvalue())
        stats = convert(ip, op, expand_quantity=True)
    assert stats["rows_out"] == 3


def _run_plain():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        passed += 1
        print(f"  PASS {fn.__name__}")
    print(f"\n{passed}/{len(fns)} tests passed")


if __name__ == "__main__":
    _run_plain()
