#!/usr/bin/env python3
"""INA <-> 8 U.S.C. mapping-table poller for verifycites (Python stdlib only).

Polls the Office of the Law Revision Counsel (OLRC) Title 8 bulk XML and
builds a static, same-origin JSON table that the legal page reads to turn
INA and 8 U.S.C. rows from "cannot confirm a section exists" into real,
sourced results:

  * GET https://uscode.house.gov/download.html — the current release
    point (e.g. Public Law 119-134, October 20, 2026) and the Title 8
    XML zip link for that release point. The zip URL is DERIVED from
    this page on every run, never hard-coded to a release point, so a
    new release point flows through automatically.
  * GET the Title 8 XML zip for that release point, parse usc08.xml
    (USLM), and extract one mapping entry per Code section whose
    origin is the Immigration and Nationality Act.

Evidence rule (the hard rule — do not weaken it without recording why):
  * An entry exists ONLY when the Code section's own sourceCredit, in
    its FIRST citation segment, cites the Act of June 27, 1952,
    ch. 477 — the act the Code itself identifies as the Immigration
    and Nationality Act (see the References in Text note under
    8 U.S.C. 1158 in this release: "act June 27, 1952, ch. 477, 66 Stat.
    163, known as the Immigration and Nationality Act") — followed by
    a section number (e.g. "title II, ch. 1, section 208, as added
    Pub. L. 96-212"). That section number IS the INA section number,
    and the Code section carrying the sourceCredit IS its 8 U.S.C.
    counterpart. No correspondence is ever hand-typed from memory and
    none is inferred from section-number similarity.
  * The FIRST-segment restriction is load-bearing, not pedantic: a
    loose whole-sourceCredit search false-positives on sections the
    1952 Act merely amended later. In release point P.L. 119-134 it
    would wrongly map INA 402 -> 8 U.S.C. 1353d and INA 403 ->
    8 U.S.C. 1552 (both cite ch. 477 only in a later amendment
    citation, e.g. 1353d's "title IV, section 402(i)(2)"). The strict
    rule excludes all three later-only sections (1353a, 1353d, 1552).
  * The FIRST section number after ch. 477 is the current INA number:
    "formerly" numbers and the amending Public Law's own section
    number always come AFTER it (e.g. 8 U.S.C. 1227: "section 237,
    formerly ch. 5, section 241"; 8 U.S.C. 1229b: "section 240A, as added
    Pub. L. 104-208, div. C, title III, section 304(a)(3)").
  * Letter-suffixed sections are kept whole: INA 240A -> 1229b (not
    240 -> 1229a), INA 274A -> 1324a, and so on. The browser matcher
    must read the letter from the row's full text, because the
    extractor's page field drops it (see report.js).
  * Repealed sections are skipped: a repealed heading is not a live
    counterpart, and matching a row to it would be misleading.
  * Subsection suffixes are NOT in this table: the source evidence
    establishes the section-level correspondence only. The browser
    line carries the row's own subsection suffix on both sides
    (INA 212(a) -> 8 U.S.C. 1182(a)); that carry-over is documented
    in the JSON meta and in report.js, not hidden.
  * The table is PARTIAL by design: Title 8 sections whose origin is
    not the 1952 Act (e.g. sections first enacted by later standalone
    acts) have no entry, and an unmapped row keeps its old wording.
    Absence from this table is never worded as "does not exist".

Design rules (mirroring scripts/imm8cfr_poll.py):
  * A failed fetch must not wipe existing entries: the run records
    status "error" with the error text and writes the old entries
    back with updated meta. An unreadable existing table aborts the
    run (exit 2) rather than overwriting it. A successful fetch that
    parses to ZERO entries is treated as an error for the same
    reason — a release point always contains INA-derived sections.
  * A successful fetch REBUILDS the table from scratch (unlike the
    8 CFR index, which preserves first_seen): if a later release
    repeals or renumbers a section, its mapping must disappear,
    otherwise the page would claim a counterpart that no longer
    exists in the current Code.
  * No user data, no credentials, no secrets anywhere in this script,
    its output, or its logs. The GitHub Actions workflow runs it with
    no secrets at all.
  * Certificates are verified by default. ``--insecure`` exists ONLY
    for development environments behind a TLS-intercepting proxy (it
    must never be passed by the scheduled workflow).
  * STEP 0 (2026-10-27): uscode.house.gov robots.txt as returned by
    curl contained only "User-agent: Slurp / Disallow: /" (Yahoo
    Slurp only — no general prohibition on automated access); the
    download page publicly offers the bulk XML and the site's privacy
    policy contemplates browsing, reading, and downloading. No
    separate terms-of-use page was found on the site, and nothing
    found forbids automated download of the Title 8 bulk XML. The
    poller makes one weekly download-page fetch plus one zip fetch,
    with an identifying User-Agent. If OLRC ever publishes a
    prohibition, this poller must stop and the table must fall back
    to its last good build.

Usage:
    python3 scripts/imm-ina-mapping-poll.py [--index data/imm-ina-mapping.json]
                                            [--insecure]
                                            [--xml path/to/usc08.xml]
"""

import argparse
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from xml.etree import ElementTree

USER_AGENT = "verifycites-imm-ina-mapping-poller/1.0 (+https://verifycites.com/)"
REQUEST_TIMEOUT = 120
MAX_RETRIES = 3
RETRY_SLEEP = 5
OLRC_DOWNLOAD_URL = "https://uscode.house.gov/download.html"
OLRC_BASE = "https://uscode.house.gov/"
# The act the Code itself identifies as the Immigration and Nationality
# Act (see the 8 U.S.C. 1158 References in Text note, quoted above).
INA_ACT = "June 27, 1952, ch. 477"
INA_ACT_RE = re.compile(r"June 27, 1952,\s*ch\.\s*477")
INA_SECTION_RE = re.compile(r"\u00a7\s*([0-9]+[A-Za-z]?)")
CURRENT_THROUGH_RE = re.compile(
    r"current through Public Law ([0-9]+-[0-9]+) \(([A-Za-z]+ [0-9]{1,2}, [0-9]{4})\)")
ZIP_LINK_RE = re.compile(
    r"download/releasepoints/us/pl/([0-9]+)/([0-9]+)/xml_usc08@\1-\2\.zip")


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def norm_ws(text):
    return " ".join((text or "").split())


class Fetcher:
    """Small GET helper with retries on transient failures."""

    def __init__(self, insecure=False):
        self.ctx = ssl._create_unverified_context() if insecure else None

    def get(self, url):
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT,
                                            context=self.ctx) as resp:
                    if resp.status != 200:
                        raise urllib.error.HTTPError(url, resp.status, "non-200", None, None)
                    return resp.read()
            except Exception as exc:  # noqa: BLE001 - recorded as run status
                last_err = exc
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_SLEEP)
        raise RuntimeError("fetch failed after %d attempts: %s" % (MAX_RETRIES, last_err))


def parse_download_page(html):
    """Release point + Title 8 XML zip URL, derived from the page itself.

    Raises if the current-through Public Law and the zip link disagree:
    silently downloading a zip for a different release point than the
    one the page advertises would mislabel the table's currency.
    """
    text = html.decode("utf-8", errors="replace")
    # HTML source may wrap the currency sentence across lines.
    text = re.sub(r"\s+", " ", text)
    m = CURRENT_THROUGH_RE.search(text)
    if not m:
        raise RuntimeError("download page has no 'current through Public Law' marker")
    pl, date_text = m.group(1), m.group(2)
    try:
        date_iso = datetime.strptime(date_text, "%B %d, %Y").strftime("%Y-%m-%d")
    except ValueError as exc:
        raise RuntimeError("unparsable release-point date %r: %s" % (date_text, exc))
    zm = ZIP_LINK_RE.search(text)
    if not zm:
        raise RuntimeError("download page has no Title 8 XML zip link")
    zip_pl = "%s-%s" % (zm.group(1), zm.group(2))
    if zip_pl != pl:
        raise RuntimeError("zip release point %s != current-through %s" % (zip_pl, pl))
    return {
        "release_point": "Public Law %s" % pl,
        "current_through_pl": pl,
        "current_through_date": date_iso,
        "zip_url": OLRC_BASE + zm.group(0),
    }


def _localname(tag):
    return tag.split("}")[-1] if isinstance(tag, str) else ""


def _child_text(section, wanted):
    for child in section:
        if _localname(child.tag) == wanted:
            return norm_ws("".join(child.itertext()))
    return ""


def extract_mappings(xml_bytes):
    """Build mapping entries from one Title 8 USLM document.

    Returns (entries, stats). Entries are sorted by INA number
    (numeric part, then letter suffix). See the module docstring for
    the evidence rule; anything that does not satisfy it is skipped,
    never guessed.
    """
    root = ElementTree.fromstring(xml_bytes)
    entries = []
    seen_ina = {}
    conflicts = []
    skipped_repealed = 0
    skipped_no_evidence = 0
    # Ancestry guard: quoted statutes inside notes also use <section>
    # elements. Only structural sections (children of part/subchapter/
    # chapter, never inside a note) may contribute a mapping.
    parent = {child: par for par in root.iter() for child in par}
    for section in root.iter():
        if _localname(section.tag) != "section":
            continue
        ident = section.get("identifier") or ""
        m = re.search(r"/s([0-9]+[a-z]?)$", ident)
        if not m:
            continue
        anc, cur = set(), section
        while cur in parent:
            cur = parent[cur]
            anc.add(_localname(cur.tag))
        if anc & {"notes", "note", "quotedContent"}:
            skipped_no_evidence += 1
            continue
        usc = m.group(1)
        title = _child_text(section, "heading")
        if title.lower().startswith("repealed"):
            skipped_repealed += 1
            continue
        credit = _child_text(section, "sourceCredit")
        if not credit:
            skipped_no_evidence += 1
            continue
        # FIRST citation segment only: enactment, before the first
        # amendment separator. Later segments may mention ch. 477 as
        # an amended act, which is not an origin claim (see docstring).
        first = credit.split(";")[0]
        act = INA_ACT_RE.search(first)
        if not act:
            skipped_no_evidence += 1
            continue
        sec = INA_SECTION_RE.search(first[act.end():])
        if not sec:
            skipped_no_evidence += 1
            continue
        ina = sec.group(1)
        evidence = norm_ws(first)
        if len(evidence) > 400:
            evidence = evidence[:400]
        if ina in seen_ina:
            conflicts.append({"ina": ina, "kept_usc": seen_ina[ina], "dropped_usc": usc})
            continue
        seen_ina[ina] = usc
        entries.append({
            "ina": ina,
            "usc": usc,
            "usc_title": title,
            "evidence": evidence,
            "evidence_form": "sourceCredit first citation: Act of June 27, 1952, "
                             "ch. 477 (Immigration and Nationality Act), section",
        })
    entries.sort(key=lambda e: (int(re.match(r"[0-9]+", e["ina"]).group(0)),
                                re.sub(r"^[0-9]+", "", e["ina"])))
    stats = {"sections_seen": None, "skipped_repealed": skipped_repealed,
             "skipped_no_evidence": skipped_no_evidence, "conflicts": conflicts}
    return entries, stats


def load_existing(path):
    if not os.path.exists(path):
        return {"entries": []}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
        raise ValueError("existing mapping table is not a valid table document")
    return data


def write_table(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp_path, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Poll OLRC Title 8 into an INA mapping table.")
    parser.add_argument("--index", default=None,
                        help="Path to data/imm-ina-mapping.json (default: <repo>/data/imm-ina-mapping.json)")
    parser.add_argument("--insecure", action="store_true",
                        help="DEV ONLY: skip TLS verification (MITM proxy environments). Never in the workflow.")
    parser.add_argument("--xml", default=None,
                        help="DEV ONLY: parse this local usc08.xml instead of downloading (release info kept from existing meta unless --release-point is given).")
    parser.add_argument("--release-point", default=None,
                        help="With --xml: release-point label, e.g. 'Public Law 119-134'.")
    args = parser.parse_args(argv)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = args.index or os.path.join(repo_root, "data", "imm-ina-mapping.json")

    try:
        existing = load_existing(index_path)
    except Exception as exc:  # noqa: BLE001 - abort rather than wipe
        print("ERROR: refusing to overwrite an unreadable table: %s" % exc, file=sys.stderr)
        return 2

    fetcher = Fetcher(insecure=args.insecure)
    now = utcnow_iso()
    entries = list(existing.get("entries", []))
    prev_meta = existing.get("meta") if isinstance(existing.get("meta"), dict) else {}
    meta = {"last_poll": now, "source": "OLRC Title 8 bulk XML (uscode.house.gov)",
            "status": "error", "last_error": None,
            # On failure the last-known currency signals are preserved,
            # never blanked: a stale-but-labelled signal beats no signal.
            "release_point": prev_meta.get("release_point"),
            "current_through_pl": prev_meta.get("current_through_pl"),
            "current_through_date": prev_meta.get("current_through_date"),
            "download_url": prev_meta.get("download_url"),
            "entries": len(entries),
            "evidence_act": "Act of June 27, 1952, ch. 477, identified in the Code "
                            "itself as the Immigration and Nationality Act "
                            "(8 U.S.C. 1158 References in Text note).",
            "subsection_note": "Evidence establishes the section-level correspondence "
                               "only; subsection suffixes in the browser line are "
                               "carried from the row's own cited text.",
            "partial": True}
    try:
        if args.xml:
            with open(args.xml, "rb") as fh:
                xml_bytes = fh.read()
            if args.release_point:
                meta["release_point"] = args.release_point
                mm = re.match(r"Public Law ([0-9]+-[0-9]+)", args.release_point)
                if mm:
                    meta["current_through_pl"] = mm.group(1)
            fetched, stats = extract_mappings(xml_bytes)
        else:
            release = parse_download_page(fetcher.get(OLRC_DOWNLOAD_URL))
            raw_zip = fetcher.get(release["zip_url"])
            with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
                names = [n for n in zf.namelist() if n.endswith("usc08.xml")]
                if not names:
                    raise RuntimeError("Title 8 zip contains no usc08.xml (members: %s)"
                                       % zf.namelist()[:10])
                xml_bytes = zf.read(names[0])
            fetched, stats = extract_mappings(xml_bytes)
            meta.update({"release_point": release["release_point"],
                         "current_through_pl": release["current_through_pl"],
                         "current_through_date": release["current_through_date"],
                         "download_url": release["zip_url"]})
        if not fetched:
            raise RuntimeError("parsed Title 8 XML yielded zero mapping entries; refusing to wipe")
        entries = fetched
        meta.update({"status": "ok", "entries": len(entries),
                     "skipped_repealed": stats["skipped_repealed"],
                     "skipped_no_evidence": stats["skipped_no_evidence"],
                     "conflicts": stats["conflicts"]})
        print("OLRC Title 8: ok (%d mapping entries, %d repealed skipped, "
              "%d without INA origin skipped)"
              % (len(entries), stats["skipped_repealed"], stats["skipped_no_evidence"]))
    except Exception as exc:  # noqa: BLE001 - failure is data, entries preserved
        meta["last_error"] = str(exc)[:300]
        print("OLRC Title 8: ERROR: %s (keeping %d existing entries)"
              % (exc, len(entries)), file=sys.stderr)

    write_table(index_path, {"entries": entries, "meta": meta})
    print("wrote %s (%d entries, status %s)" % (index_path, len(entries), meta["status"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
