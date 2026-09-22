#!/usr/bin/env python3
"""
JoTrip private hotel workbook audit helper.

Zero external Python dependencies. It reads .xlsx files as ZIP/XML and writes
a private audit JSON under ./private-data/, which is gitignored.

This tool is intentionally conservative: it identifies candidate ALL MARKET
blocks and discount/date/rate signals. It does not publish prices or pretend to
fully understand contract logic.

Usage:
  python3 tools/audit_hotel_workbooks.py /path/to/file.xlsx
"""

from __future__ import annotations

import json
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

ALL_MARKET_RE = re.compile(
    r"\ball\s*markets?\b|\ball\s*market\b|tất\s*cả\s*(?:các\s*)?thị\s*trường",
    re.I,
)
DISCOUNT_RE = re.compile(
    r"(?:giảm|discount|off|chiết\s*khấu)\D{0,25}(\d+(?:[.,]\d+)?)\s*%",
    re.I,
)
DATE_RE = re.compile(r"\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b")


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    name = "xl/sharedStrings.xml"
    if name not in zf.namelist():
        return []

    root = ET.fromstring(zf.read(name))
    result: list[str] = []

    for si in root.findall(f"{{{MAIN_NS}}}si"):
        parts: list[str] = []
        for t in si.iter(f"{{{MAIN_NS}}}t"):
            parts.append(t.text or "")
        result.append("".join(parts))

    return result


def workbook_sheets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    target_by_id = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall(f"{{{PKG_REL_NS}}}Relationship")
    }

    sheets: list[tuple[str, str]] = []
    sheets_node = workbook.find(f"{{{MAIN_NS}}}sheets")
    if sheets_node is None:
        return sheets

    for sheet in sheets_node:
        name = sheet.attrib.get("name", "")
        rel_id = sheet.attrib.get(f"{{{REL_NS}}}id", "")
        target = target_by_id.get(rel_id, "")
        if target.startswith("/"):
            path = target.lstrip("/")
        elif target.startswith("xl/"):
            path = target
        else:
            path = "xl/" + target.lstrip("/")
        sheets.append((name, path))

    return sheets


def cell_text(cell: ET.Element, strings: list[str]) -> tuple[str, float | None]:
    cell_type = cell.attrib.get("t")
    value_node = cell.find(f"{{{MAIN_NS}}}v")
    inline = cell.find(f"{{{MAIN_NS}}}is")

    if inline is not None:
        text = "".join((t.text or "") for t in inline.iter(f"{{{MAIN_NS}}}t"))
        return text.strip(), None

    if value_node is None or value_node.text is None:
        return "", None

    raw = value_node.text

    if cell_type == "s":
        try:
            return strings[int(raw)].strip(), None
        except (ValueError, IndexError):
            return raw.strip(), None

    if cell_type in {"str", "inlineStr"}:
        return raw.strip(), None

    try:
        number = float(raw)
        return raw, number
    except ValueError:
        return raw.strip(), None


def is_pq_sheet(name: str) -> bool:
    normalized = name.strip().upper()
    return (
        normalized.startswith("PQ")
        or "PHU QUOC" in normalized
        or "PHÚ QUỐC" in normalized
    )


def audit_sheet(zf: zipfile.ZipFile, sheet_name: str, sheet_path: str, strings: list[str]) -> dict[str, Any]:
    root = ET.fromstring(zf.read(sheet_path))

    markers: list[dict[str, Any]] = []
    discounts: list[dict[str, Any]] = []
    dates: list[dict[str, Any]] = []
    numeric_candidates: list[dict[str, Any]] = []

    for cell in root.iter(f"{{{MAIN_NS}}}c"):
        ref = cell.attrib.get("r", "")
        text, numeric = cell_text(cell, strings)

        if text:
            if ALL_MARKET_RE.search(text):
                markers.append({"cell": ref, "text": text[:500]})

            for match in DISCOUNT_RE.finditer(text):
                discounts.append({
                    "cell": ref,
                    "percent": float(match.group(1).replace(",", ".")),
                    "text": text[:500],
                })

            for token in DATE_RE.findall(text):
                dates.append({"cell": ref, "token": token})

        if numeric is not None and 100_000 <= numeric <= 1_000_000_000:
            numeric_candidates.append({
                "cell": ref,
                "value": numeric,
            })

    reasons: list[str] = []
    state = "CANDIDATE" if markers else "REVIEW"

    if not markers:
        reasons.append("no_clear_all_market_marker")
    if len(discounts) > 1:
        reasons.append("multiple_discount_candidates_review_required")

    return {
        "sheet": sheet_name,
        "state": state,
        "reasons": reasons,
        "all_market_markers": markers,
        "discount_candidates": discounts,
        "date_tokens": dates[:150],
        "numeric_rate_candidates": numeric_candidates[:1000],
    }


def audit_workbook(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as zf:
        strings = shared_strings(zf)
        sheets = workbook_sheets(zf)
        pq_sheets = [(name, target) for name, target in sheets if is_pq_sheet(name)]

        audited = [
            audit_sheet(zf, name, target, strings)
            for name, target in pq_sheets
            if target in zf.namelist()
        ]

        return {
            "source_name": path.name,
            "sheet_count": len(sheets),
            "candidate_sheet_count": len(pq_sheets),
            "candidate_count": sum(1 for item in audited if item["state"] == "CANDIDATE"),
            "review_count": sum(1 for item in audited if item["state"] == "REVIEW"),
            "sheets": audited,
        }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Pass one or more .xlsx file paths")

    out_dir = Path("private-data")
    out_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "audit_id": str(uuid.uuid4()),
        "files": [audit_workbook(Path(raw).expanduser()) for raw in sys.argv[1:]],
    }

    output = out_dir / "hotel-workbook-audit.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote private audit to {output}")
    for item in report["files"]:
        print(
            f"{item['source_name']}: "
            f"{item['candidate_sheet_count']} PQ candidates, "
            f"{item['candidate_count']} auto-candidates, "
            f"{item['review_count']} review"
        )
    print("Do not commit private-data/.")


if __name__ == "__main__":
    main()
