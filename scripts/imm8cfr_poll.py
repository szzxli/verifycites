#!/usr/bin/env python3
"""8 CFR static index poller for verifycites (Python standard library only).

Polls the eCFR developer API (versioner endpoints only) and builds a
static, same-origin JSON index that the legal page reads to turn 8 CFR
rows from "not yet connected" into real, sourced results:

  * GET /api/versioner/v1/titles.json — Title 8 currency signals
    (up_to_date_as_of, latest_amended_on). The structure date used
    below is up_to_date_as_of itself: a date past eCFR's currency
    (e.g. today, when eCFR is a few days behind) returns HTTP 404,
    which is how the earlier Title 8 probe failed.
  * GET /api/versioner/v1/structure/{date}/title-8.json — the full
    Title 8 hierarchy; section nodes carry the section title
    (label_description) and eCFR's received_on field.

Design rules (do not weaken them without recording why):
  * Sanctioned route only. eCFR's bot-wall message states that
    programmatic access to ecfr.gov is limited to the developer APIs;
    this poller uses ONLY the versioner API — never HTML pages, never
    the full-text endpoint (/api/versioner/v1/full/), never the
    renderer content endpoint (/api/renderer/v1/content/), both of
    which ecfr.gov's robots.txt lists under "Don't index developer
    tool links". See STEP 0 notes in the build record.
  * Metadata only. The index stores part, section, title, and
    received_on per section — never regulatory full text — so the
    published file stays bounded (Title 8 holds ~985 sections).
  * Reserved sections are skipped: a reserved placeholder is not a
    real section, and matching a row to it would be misleading.
  * ``first_seen`` is IMMUTABLE: once a section is in the index,
    re-polling never overwrites its first_seen. Title and received_on
    may be refreshed from the latest fetch.
  * A failed fetch must not wipe existing sections: the run records
    status "error" with the error text and writes the old sections
    back with updated meta. An unreadable existing index aborts the
    run (exit 2) rather than overwriting it.
  * Honesty limit, recorded plainly: eCFR's versioner API publishes
    NO per-section last-amended date. Section nodes carry received_on
    (when eCFR received the content), which is NOT a last-amended
    date and must never be presented as one. The index therefore
    carries received_on under its own name, and the browser UI line
    for a matched row cites the section title plus the INDEX-level
    currency signals (up_to_date_as_of, last_poll) — never a
    per-section "last amended" claim. Title-level latest_amended_on
    is stored in meta for the same reason: it describes Title 8 as
    a whole, not any one section.
  * No user data, no credentials, no secrets anywhere in this script,
    its output, or its logs. The GitHub Actions workflow runs it with
    no secrets at all.
  * Certificates are verified by default. ``--insecure`` exists ONLY
    for development environments behind a TLS-intercepting proxy (it
    must never be passed by the scheduled workflow).

Usage:
    python3 scripts/imm8cfr_poll.py [--index data/imm-8cfr-index.json]
                                    [--insecure]
"""

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

USER_AGENT = "verifycites-imm8cfr-poller/1.0 (+https://verifycites.com/)"
REQUEST_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_SLEEP = 5
ECFR_TITLES_URL = "https://www.ecfr.gov/api/versioner/v1/titles.json"
ECFR_STRUCTURE_URL = "https://www.ecfr.gov/api/versioner/v1/structure/%s/title-8.json"


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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


def fetch_title8_currency(fetcher):
    """Title 8 currency signals from titles.json.

    Returns (up_to_date_as_of, latest_amended_on). Raises if Title 8
    is missing or the signals are absent — the structure date must
    come from eCFR itself, never from the wall clock.
    """
    data = json.loads(fetcher.get(ECFR_TITLES_URL).decode("utf-8"))
    for title in data.get("titles", []):
        if title.get("number") == 8:
            up_to_date = title.get("up_to_date_as_of")
            if not up_to_date:
                raise RuntimeError("titles.json Title 8 entry has no up_to_date_as_of")
            return up_to_date, title.get("latest_amended_on")
    raise RuntimeError("titles.json has no Title 8 entry")


def _section_title(node):
    title = (node.get("label_description") or "").strip()
    if title:
        return title
    # Fallback: strip the "§ 208.18 " prefix from the label.
    label = (node.get("label") or "").strip()
    m = re.match(r"^§\s*\S+\s+(.*)$", label)
    if m:
        return m.group(1).strip()
    return label


def extract_sections(structure):
    """Flatten the Title 8 hierarchy into section entries.

    Reserved sections are skipped. Part is the identifier's first
    dot-component ("208.18" -> part "208"). Entries carry no
    first_seen here; merge_index stamps it.
    """
    sections = []
    skipped_reserved = 0

    def walk(node):
        nonlocal skipped_reserved
        if node.get("type") == "section":
            if node.get("reserved"):
                skipped_reserved += 1
                return
            ident = (node.get("identifier") or "").strip()
            if not ident:
                return
            sections.append({
                "part": ident.split(".")[0],
                "section": ident,
                "title": _section_title(node),
                "received_on": node.get("received_on"),
            })
            return
        for child in node.get("children") or []:
            walk(child)

    walk(structure)
    return sections, skipped_reserved


def merge_sections(existing, fetched, now):
    """Merge fetched sections, preserving every first_seen forever."""
    sections = list(existing.get("sections", [])) if isinstance(existing, dict) else []
    by_section = {}
    for entry in sections:
        by_section[entry.get("section")] = entry
    for new in fetched:
        key = new["section"]
        if key in by_section:
            old = by_section[key]
            for field in ("part", "title", "received_on"):
                if new.get(field) is not None:
                    old[field] = new[field]
        else:
            entry = dict(new)
            entry["first_seen"] = now
            sections.append(entry)
            by_section[key] = entry
    sections.sort(key=lambda x: x.get("section", ""))
    return sections


def load_existing(path):
    if not os.path.exists(path):
        return {"sections": []}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("sections"), list):
        raise ValueError("existing index is not a valid index document")
    return data


def write_index(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp_path, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Poll eCFR Title 8 into a static index.")
    parser.add_argument("--index", default=None,
                        help="Path to data/imm-8cfr-index.json (default: <repo>/data/imm-8cfr-index.json)")
    parser.add_argument("--insecure", action="store_true",
                        help="DEV ONLY: skip TLS verification (MITM proxy environments). Never in the workflow.")
    args = parser.parse_args(argv)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = args.index or os.path.join(repo_root, "data", "imm-8cfr-index.json")

    try:
        existing = load_existing(index_path)
    except Exception as exc:  # noqa: BLE001 - abort rather than wipe
        print("ERROR: refusing to overwrite an unreadable index: %s" % exc, file=sys.stderr)
        return 2

    fetcher = Fetcher(insecure=args.insecure)
    now = utcnow_iso()
    sections = list(existing.get("sections", []))
    prev_meta = existing.get("meta") if isinstance(existing.get("meta"), dict) else {}
    meta = {"last_poll": now, "source": "eCFR API (versioner)",
            "status": "error", "last_error": None,
            # On failure the last-known currency signals are preserved,
            # never blanked: a stale-but-labelled signal beats no signal.
            "up_to_date_as_of": prev_meta.get("up_to_date_as_of"),
            "title_latest_amended_on": prev_meta.get("title_latest_amended_on"),
            "sections": len(sections)}
    try:
        up_to_date, latest_amended = fetch_title8_currency(fetcher)
        raw = fetcher.get(ECFR_STRUCTURE_URL % up_to_date)
        structure = json.loads(raw.decode("utf-8"))
        fetched, skipped = extract_sections(structure)
        sections = merge_sections(existing, fetched, now)
        meta.update({"status": "ok", "up_to_date_as_of": up_to_date,
                     "title_latest_amended_on": latest_amended,
                     "sections": len(sections)})
        print("eCFR Title 8: ok (%d sections fetched, %d reserved skipped, %d indexed)"
              % (len(fetched), skipped, len(sections)))
    except Exception as exc:  # noqa: BLE001 - failure is data, items preserved
        meta["last_error"] = str(exc)[:300]
        print("eCFR Title 8: ERROR: %s (keeping %d existing sections)"
              % (exc, len(sections)), file=sys.stderr)

    write_index(index_path, {"sections": sections, "meta": meta})
    print("wrote %s (%d sections, status %s)" % (index_path, len(sections), meta["status"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
