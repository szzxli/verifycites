#!/usr/bin/env python3
"""Build a static I&N Dec. existence index from EOIR Agency Decisions pages.

Source: https://www.justice.gov/eoir/ag-bia-decisions
  * Volumes 8-26: the interim-decision lists at /eoir/vll/intdec/nfvolNN.html
  * Volumes 27-30: the current volume pages at /eoir/volume-N
Volumes 1-7 are cumulative-index PDFs, not these HTML lists, and are
recorded as a gap. OCAHO lists on the same index page are a different
reporter and are not included.

Each entry is volume, page, case name, year, and an official URL.
No decision text. The browser never calls justice.gov.

A volume is "complete" (a missing page may be reported as not found)
only when the parsed count is within 3 of the count EOIR publishes
and at least 97 percent of that count. A shorter parse stays out of
the complete list: a hit is still "found", a miss is "not checked".
Volume 30 is also unioned with data/bia-index.json.

Crawl-delay is 10 seconds, from the snapshot poller. HTTP 403 or 429
stops the run and writes nothing.
"""

import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bia_snapshot_poll as poll  # noqa: E402

SOURCE = "https://www.justice.gov/eoir/ag-bia-decisions"
OUT_NAME = "bia-cite-index.json"

# Header citation on an EOIR volume list: "ACOSTA , 19 I&N Dec. 211 (BIA 1985)".
# The parenthetical may be BIA, A.G., Comm., or a combination. The year is
# the last four digits inside it. Holding summaries cite other volumes;
# those are dropped by the volume filter below.
CITE_RE = re.compile(
    r"([A-Z][A-Z0-9\-\.' ]{0,80}?)\s*,\s*(\d+)\s+I&N Dec\.\s*(\d+)\s*"
    r"\([^)]{0,80}?(\d{4})\)"
)
ID_RE = re.compile(r"\s*ID\s*(\d+)")
NFVOL_RE = re.compile(r'href="([^"]*nfvol(\d+)\.html)"')
VOLPAGE_RE = re.compile(r'href="([^"]*)"')


def targets_from_index(index_html):
    """(volume, absolute url) for AG/BIA lists only."""
    found = {}
    for m in NFVOL_RE.finditer(index_html):
        vol = int(m.group(2))
        if 8 <= vol <= 26:
            found[vol] = urllib.parse.urljoin(poll.BASE, m.group(1))
    for m in VOLPAGE_RE.finditer(index_html):
        href = m.group(1)
        if "listing-volume" in href or "Ocaho" in href or "publisheddecisions" in href:
            continue
        vm = re.search(r"/eoir/volume-(\d+)$", href)
        if not vm:
            continue
        vol = int(vm.group(1))
        if 8 <= vol <= 30:
            found[vol] = urllib.parse.urljoin(poll.BASE, href)
    return sorted(found.items())


def url_for_interim_id(anchors, interim_id):
    token = str(interim_id)
    for href, text in anchors:
        href = href or ""
        if token in href or token in (text or ""):
            if href.startswith("http") or href.startswith("/"):
                return urllib.parse.urljoin(poll.BASE, href)
    return ""


def parse_existence(html, page_volume):
    parser = poll.LinkParser()
    parser.feed(html)
    page_text = re.sub(r"\s+", " ", " ".join(parser.text_parts))
    list_url = (poll.BASE + "/eoir/vll/intdec/nfvol%02d.html" % page_volume
                if page_volume <= 26 else poll.BASE + "/eoir/volume-%d" % page_volume)
    rows = {}
    for m in CITE_RE.finditer(page_text):
        vol = int(m.group(2))
        page = int(m.group(3))
        if vol != page_volume or page in rows:
            continue
        name = " ".join(m.group(1).split())
        url = list_url
        id_m = ID_RE.match(page_text[m.end():m.end() + 24])
        if id_m:
            found = url_for_interim_id(parser.anchors, id_m.group(1))
            if found:
                url = found
        rows[page] = {
            "volume": str(vol),
            "page": page,
            "name": "Matter of " + name,
            "year": int(m.group(4)),
            "url": url,
        }
    return list(rows.values())


def from_library(raw):
    citation = raw.get("citation") or ""
    parts = citation.replace("I&N Dec.", " ").split()
    if len(parts) < 2 or not parts[-1].isdigit():
        return None
    return {
        "volume": str(int(raw.get("volume") or parts[0])),
        "page": int(parts[-1]),
        "name": raw.get("display_name") or ("Matter of " + (raw.get("name") or "")),
        "year": int(raw["year"]) if raw.get("year") else None,
        "url": raw.get("pdf_url") or "",
    }


def is_complete(volume, found, expected):
    if volume == 30:
        return found > 0
    if not expected:
        return False
    return found >= expected - 3 and found >= int(expected * 0.97)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root, "data")
    out_path = os.path.join(data_dir, OUT_NAME)
    fetcher = poll.Fetcher()
    index_html = fetcher.get(poll.INDEX_URL).decode("utf-8", errors="replace")
    targets = targets_from_index(index_html)
    print("targets: %s" % ",".join(str(v) for v, _ in targets), flush=True)

    by_key = {}
    lib_path = os.path.join(data_dir, "bia-index.json")
    if os.path.exists(lib_path):
        with open(lib_path, encoding="utf-8") as fh:
            library = json.load(fh)
        for raw in library.get("entries") or []:
            row = from_library(raw)
            if row:
                by_key[(row["volume"], row["page"])] = row
        print("library rows: %d" % sum(1 for k in by_key if k[0] == "30"), flush=True)

    per_volume = {}
    partial = []
    for vol, url in targets:
        print("fetch %s" % url, flush=True)
        html = fetcher.get(url).decode("utf-8", errors="replace")
        rows = parse_existence(html, vol)
        expected = poll.EXPECTED_COUNTS.get("%02d" % vol)
        print("  volume %s parsed %d expected %s" % (vol, len(rows), expected), flush=True)
        per_volume[str(vol)] = {"parsed": len(rows), "expected": expected, "url": url}
        if not is_complete(vol, len(rows), expected):
            partial.append(str(vol))
        for row in rows:
            key = (row["volume"], row["page"])
            prev = by_key.get(key)
            if prev and prev.get("url") and "/eoir/media/" in prev["url"] and "/eoir/media/" not in row["url"]:
                continue
            by_key[key] = row

    complete = []
    for vol in range(8, 31):
        info = per_volume.get(str(vol))
        if not info or str(vol) in partial:
            continue
        if is_complete(vol, info["parsed"], info["expected"]):
            complete.append(str(vol))

    entries = sorted(by_key.values(), key=lambda e: (int(e["volume"]), int(e["page"])))
    payload = {
        "source": SOURCE,
        "source_note": (
            "Existence index built from the public EOIR Agency Decisions "
            "pages at " + SOURCE + ". Volumes 8-26 come from the interim "
            "decision lists (/eoir/vll/intdec/nfvolNN.html). Volumes 27-30 "
            "come from /eoir/volume-N. Volume 30 is also unioned with this "
            "site's BIA library, which is built from the same pages. "
            "Each entry is a volume, page, case name, and official link. "
            "A listed citation exists. Nothing here says the decision is "
            "still good law or that it supports a claim."
        ),
        "fetched_utc": poll.utcnow_iso(),
        "volumes": complete,
        "partial_volumes": partial,
        "volume_counts": per_volume,
        "gaps": [
            "Volumes 1-7 are not published as HTML decision lists on the Agency Decisions index (they are in cumulative-index PDFs) and are not covered.",
            "OCAHO decision lists on the same index page are a different reporter and are not included.",
        ],
        "entries": [
            {"volume": e["volume"], "page": e["page"], "name": e["name"],
             "year": e["year"], "url": e["url"]}
            for e in entries
        ],
    }
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    os.replace(tmp, out_path)
    print("wrote %s entries=%d complete=%s partial=%s" % (
        out_path, len(entries), ",".join(complete), ",".join(partial)), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except poll.BlockedError as exc:
        print("BLOCKED: %s (nothing written)" % exc, file=sys.stderr)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        print("ERROR: %s (nothing written)" % exc, file=sys.stderr)
        sys.exit(1)
