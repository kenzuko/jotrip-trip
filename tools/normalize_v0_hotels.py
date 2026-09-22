#!/usr/bin/env python3
"""
Normalize a small, known-safe V0 subset of the Phu Quoc hotel workbook into
JoTrip's private import JSON format.

No hotel prices are embedded in this source file. Prices are read from the
workbook at runtime and written only to ./private-data/, which is gitignored.

V0 profiles:
- Crowne Plaza Phu Quoc Starbay
- La Festa Phu Quoc
- Dusit Princess Moonrise Beach Resort
- KLC Holidays Phu Quoc
- Sea Sense Resort & Spa
- The Shells Phu Quoc
- TomHill Boutique Resort & Spa
- The Residence Resort & Villas

Usage:
  python3 tools/normalize_v0_hotels.py "/path/to/FILE MIEN NAM.xlsx"
"""

from __future__ import annotations

import json
import math
import re
import sys
import uuid
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

OBSERVED_AT = "2026-09-22"


def slugify(value: str) -> str:
    import unicodedata
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.replace("đ", "d").replace("Đ", "D").lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


class Xlsx:
    def __init__(self, path: Path):
        self.zf = zipfile.ZipFile(path)
        self.strings = self._shared_strings()
        self.sheets = self._sheet_paths()

    def _shared_strings(self) -> list[str]:
        name = "xl/sharedStrings.xml"
        if name not in self.zf.namelist():
            return []
        root = ET.fromstring(self.zf.read(name))
        return [
            "".join((t.text or "") for t in si.iter(f"{{{MAIN_NS}}}t"))
            for si in root.findall(f"{{{MAIN_NS}}}si")
        ]

    def _sheet_paths(self) -> dict[str, str]:
        workbook = ET.fromstring(self.zf.read("xl/workbook.xml"))
        rels = ET.fromstring(self.zf.read("xl/_rels/workbook.xml.rels"))
        target_by_id = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels.findall(f"{{{PKG_REL_NS}}}Relationship")
        }
        result = {}
        for sheet in workbook.find(f"{{{MAIN_NS}}}sheets") or []:
            name = sheet.attrib["name"]
            rel_id = sheet.attrib[f"{{{REL_NS}}}id"]
            target = target_by_id[rel_id]
            if target.startswith("/"):
                path = target.lstrip("/")
            elif target.startswith("xl/"):
                path = target
            else:
                path = "xl/" + target.lstrip("/")
            result[name] = path
        return result

    def cells(self, sheet_name: str) -> dict[str, Any]:
        root = ET.fromstring(self.zf.read(self.sheets[sheet_name]))
        result: dict[str, Any] = {}
        for cell in root.iter(f"{{{MAIN_NS}}}c"):
            ref = cell.attrib.get("r", "")
            cell_type = cell.attrib.get("t")
            value = cell.find(f"{{{MAIN_NS}}}v")

            if cell_type == "inlineStr":
                inline = cell.find(f"{{{MAIN_NS}}}is")
                result[ref] = (
                    "".join((t.text or "") for t in inline.iter(f"{{{MAIN_NS}}}t"))
                    if inline is not None
                    else ""
                )
                continue

            if value is None or value.text is None:
                result[ref] = ""
                continue

            raw = value.text
            if cell_type == "s":
                try:
                    result[ref] = self.strings[int(raw)]
                except (ValueError, IndexError):
                    result[ref] = raw
            elif cell_type == "str":
                result[ref] = raw
            else:
                try:
                    result[ref] = float(raw)
                except ValueError:
                    result[ref] = raw
        return result


def vnd(value: Any) -> int | None:
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)) or float(value) <= 0:
            return None
        return int(round(float(value)))

    text = str(value or "").strip()
    if not text or text.upper() in {"N/A", "NA", "CBC", "ON REQUEST", "FREE", "MIỄN PHÍ"}:
        return None

    cleaned = re.sub(r"[^0-9]", "", text)
    if not cleaned:
        return None
    number = int(cleaned)
    return number if number >= 100_000 else None


def make_row(
    *,
    hotel_name: str,
    room_name: str,
    cell: str,
    price: Any,
    stay_from: str,
    stay_to: str,
    rate_plan: str,
    market_scope: str = "ALL MARKET",
    minimum_stay: int | None = None,
    minimum_advance_days: int | None = None,
    non_refundable: bool = False,
    breakfast_included: bool | None = True,
    occupancy_key: str | None = None,
) -> dict[str, Any] | None:
    amount = vnd(price)
    if amount is None:
        return None

    return {
        "hotelId": slugify(hotel_name),
        "hotelName": hotel_name,
        "roomKey": slugify(room_name),
        "marketScope": market_scope,
        "stayFrom": stay_from,
        "stayTo": stay_to,
        "mealPlan": "BB" if breakfast_included else None,
        "occupancyKey": occupancy_key,
        "baseNetVnd": amount,
        "sourceLocator": cell,
        "sourceVersion": OBSERVED_AT,
        "ratePlan": rate_plan,
        "minimumStay": minimum_stay,
        "minimumAdvanceDays": minimum_advance_days,
        "nonRefundable": non_refundable,
        "taxIncluded": True,
        "breakfastIncluded": breakfast_included,
        "blackoutDates": [],
    }


def add_matrix(
    rows: list[dict[str, Any]],
    cells: dict[str, Any],
    *,
    hotel_name: str,
    room_rows: range,
    room_col: str,
    price_col: str,
    stay_ranges: list[tuple[str, str]],
    rate_plan: str,
    minimum_stay: int | None = None,
    minimum_advance_days: int | None = None,
    non_refundable: bool = False,
    occupancy_col: str | None = None,
):
    for row_no in room_rows:
        room_name = str(cells.get(f"{room_col}{row_no}", "")).strip()
        if not room_name:
            continue
        occupancy = (
            str(cells.get(f"{occupancy_col}{row_no}", "")).strip()
            if occupancy_col
            else None
        )
        for stay_from, stay_to in stay_ranges:
            item = make_row(
                hotel_name=hotel_name,
                room_name=room_name,
                cell=f"{price_col}{row_no}",
                price=cells.get(f"{price_col}{row_no}"),
                stay_from=stay_from,
                stay_to=stay_to,
                rate_plan=rate_plan,
                minimum_stay=minimum_stay,
                minimum_advance_days=minimum_advance_days,
                non_refundable=non_refundable,
                occupancy_key=occupancy or None,
            )
            if item:
                rows.append(item)


def normalize(path: Path) -> dict[str, Any]:
    book = Xlsx(path)
    rows: list[dict[str, Any]] = []

    # Crowne Plaza
    s = book.cells("PQ - Crowne Plaza ")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 20), room_col="A", price_col="E",
               stay_ranges=[("2026-06-09", "2026-09-30")], rate_plan="TACTICAL_OFFER")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 20), room_col="A", price_col="F",
               stay_ranges=[("2026-10-01", "2026-10-31")], rate_plan="SPECIAL_PROMOTION")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 20), room_col="A", price_col="G",
               stay_ranges=[("2026-10-01", "2026-10-31")], rate_plan="TACTICAL_OFFER")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 20), room_col="A", price_col="H",
               stay_ranges=[("2026-11-01", "2026-11-30"), ("2027-02-15", "2027-04-30")], rate_plan="TACTICAL_HIGH")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 20), room_col="A", price_col="I",
               stay_ranges=[("2026-12-01", "2026-12-21"), ("2027-01-11", "2027-02-05")], rate_plan="TACTICAL_HIGH")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 20), room_col="A", price_col="J",
               stay_ranges=[("2026-12-22", "2027-01-10"), ("2027-02-06", "2027-02-14")], rate_plan="TACTICAL_PEAK", minimum_stay=2)

    # La Festa
    s = book.cells("PQ - La Festa PQ")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 14), room_col="A", price_col="D",
               stay_ranges=[("2026-10-01", "2026-12-23")], rate_plan="STATIC_HIGH", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 14), room_col="A", price_col="E",
               stay_ranges=[("2026-04-01", "2026-09-30")], rate_plan="STATIC_SHOULDER", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 14), room_col="A", price_col="F",
               stay_ranges=[("2026-02-17", "2026-02-24"), ("2026-12-24", "2027-01-02")],
               rate_plan="STATIC_FESTIVE", minimum_stay=2, occupancy_col="B")

    # Dusit Princess
    s = book.cells("PQ - Dusit Princess Phú Quốc")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 17), room_col="A", price_col="B",
               stay_ranges=[("2026-05-16", "2026-05-31"), ("2026-07-01", "2026-09-02"), ("2026-10-09", "2026-10-31")],
               rate_plan="HELLO_SUMMER")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 17), room_col="A", price_col="C",
               stay_ranges=[("2026-06-01", "2026-06-30"), ("2026-09-03", "2026-09-30")],
               rate_plan="HELLO_SUMMER")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 17), room_col="A", price_col="D",
               stay_ranges=[("2026-10-01", "2026-10-08")], rate_plan="HELLO_SUMMER_GOLDEN_WEEK")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(22, 31), room_col="A", price_col="C",
               stay_ranges=[("2026-04-01", "2026-10-31")], rate_plan="CONTRACT_2026")

    # KLC Holidays
    s = book.cells("PQ - KLC Holiday")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(7, 11), room_col="A", price_col="D",
               stay_ranges=[(OBSERVED_AT, "2026-10-31")], rate_plan="SUMMER_PROMOTION", occupancy_col="B")

    # Sea Sense
    s = book.cells("PQ - Sea Sense")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(7, 14), room_col="A", price_col="B",
               stay_ranges=[("2026-05-01", "2026-10-14")], rate_plan="CONTRACT_REGULAR")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(7, 14), room_col="A", price_col="C",
               stay_ranges=[("2026-10-15", "2026-12-19"), ("2027-01-11", "2027-04-30")], rate_plan="CONTRACT_HIGH")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(7, 14), room_col="A", price_col="D",
               stay_ranges=[("2026-12-20", "2027-01-10")], rate_plan="CONTRACT_PEAK")

    # The Shells
    s = book.cells("PQ - The Shells Phú Quốc")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 13), room_col="A", price_col="B",
               stay_ranges=[(OBSERVED_AT, "2026-10-31")], rate_plan="SUNSHINE_ESCAPE")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(17, 22), room_col="A", price_col="B",
               stay_ranges=[("2026-05-02", "2026-10-31")], rate_plan="CONTRACT_2025_2026")

    # TomHill
    s = book.cells("PQ - TomHill Boutique")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 14), room_col="A", price_col="C",
               stay_ranges=[("2026-05-13", "2026-10-31")], rate_plan="SUMMER_ESCAPE_1N", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(8, 14), room_col="A", price_col="D",
               stay_ranges=[("2026-05-13", "2026-10-31")], rate_plan="SUMMER_LONGSTAY", minimum_stay=3, occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(22, 29), room_col="A", price_col="C",
               stay_ranges=[("2026-05-13", "2026-10-31")], rate_plan="CONTRACT_LOW", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(22, 29), room_col="A", price_col="D",
               stay_ranges=[("2026-11-01", "2026-12-22"), ("2027-01-02", "2027-03-31")], rate_plan="CONTRACT_HIGH", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(22, 29), room_col="A", price_col="E",
               stay_ranges=[("2026-08-30", "2026-09-02"), ("2026-12-23", "2027-01-01"), ("2027-02-05", "2027-02-09")],
               rate_plan="CONTRACT_FESTIVE", minimum_stay=2, occupancy_col="B")

    # The Residence
    s = book.cells("PQ - The Residence")
    hotel = str(s["A1"]).strip()
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(10, 17), room_col="A", price_col="C",
               stay_ranges=[("2026-05-03", "2026-06-30"), ("2026-09-04", "2026-10-31")], rate_plan="CONTRACT_LOW", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(10, 17), room_col="A", price_col="D",
               stay_ranges=[("2026-07-01", "2026-09-03")], rate_plan="CONTRACT_HIGH", occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(10, 17), room_col="A", price_col="E",
               stay_ranges=[("2026-05-03", "2026-06-30"), ("2026-09-04", "2026-10-31")],
               rate_plan="EARLY_BIRD_30", minimum_advance_days=30, non_refundable=True, occupancy_col="B")
    add_matrix(rows, s, hotel_name=hotel, room_rows=range(10, 17), room_col="A", price_col="F",
               stay_ranges=[("2026-07-01", "2026-09-03")],
               rate_plan="EARLY_BIRD_45", minimum_advance_days=45, non_refundable=True, occupancy_col="B")

    return {
        "sourceName": path.name,
        "sourceVersion": OBSERVED_AT,
        "rows": rows,
        "meta": {
            "normalizer": "v0-known-safe-profiles",
            "hotelCount": len({row["hotelId"] for row in rows}),
            "rowCount": len(rows),
            "warning": "Private commercial data. Never commit this output.",
        },
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: normalize_v0_hotels.py /path/to/workbook.xlsx")

    payload = normalize(Path(sys.argv[1]).expanduser())
    out_dir = Path("private-data")
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "hotel-import-v0.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {payload['meta']['rowCount']} private rate rows for {payload['meta']['hotelCount']} hotels")
    print(f"Output: {out}")
    print("Do not commit private-data/.")


if __name__ == "__main__":
    main()
