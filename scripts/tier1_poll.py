#!/usr/bin/env python3
"""Tier-1 first-seen index poller for verifycites (Python standard library only).

Polls four exact, verified direct primary sources and merges what they
publish into a static, same-origin JSON index that the browser pages read:

  * Ninth Circuit opinions RSS (U.S. Court of Appeals for the Ninth Circuit)
  * Supreme Court slip-opinion index (HTML table diffing; no feed exists)
  * arXiv API (Atom; 3-second delay between calls per the API manual)
  * Europe PMC API (FIRST_PDATE range; first-publication dates)

Design rules (do not weaken them without recording why):
  * Metadata only. Never fetch paywalled full text, never scrape PDFs.
  * Dedupe key is (source, identifier). ``first_seen`` is IMMUTABLE: once
    an item is in the index, re-polling never overwrites its first_seen.
    Other fields (title, url, date) may be refreshed from the latest fetch.
  * A failed source must not wipe existing items and must not crash the
    run: its status is recorded as "error" with the error text, and the
    other sources are still polled.
  * Per-source index cap of 1000 items (oldest first_seen pruned first)
    keeps the published file bounded; the cap is a size guard, not a
    claim that older items never existed.
  * No user data, no credentials, no secrets anywhere in this script,
    its output, or its logs. The GitHub Actions workflow runs it with
    no secrets at all.
  * ``first_seen`` is the UTC time THIS poller first observed the item.
    It is not the item's publication date and must never be presented
    as one; the browser UI shows the source-side date separately when
    the source supplies one, and labels the index time as an index time.
  * Certificates are verified by default. ``--insecure`` exists ONLY for
    development environments behind a TLS-intercepting proxy (it must
    never be passed by the scheduled workflow).

Usage:
    python3 scripts/tier1_poll.py [--index data/tier1-index.json]
                                  [--max-per-source 100] [--insecure]
"""

import argparse
import html as htmlmod
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

USER_AGENT = "verifycites-tier1-poller/1.0 (+https://verifycites.com/)"
INDEX_CAP_PER_SOURCE = 1000
REQUEST_TIMEOUT = 40
MAX_RETRIES = 3
RETRY_SLEEP = 5

CA9_RSS_URL = "https://www.ca9.uscourts.gov/decisions/opinions/index.xml"
SCOTUS_BASE_URL = "https://www.supremecourt.gov/opinions/slipopinion"
ARXIV_API_URL = "https://export.arxiv.org/api/query"
EUROPEPMC_API_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_date_to_iso(raw):
    """Best-effort normalisation of a source-side date to YYYY-MM-DD."""
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ",
                "%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return "%s-%s-%s" % m.groups()
    return None


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
            except Exception as exc:  # noqa: BLE001 - recorded per source
                last_err = exc
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_SLEEP)
        raise RuntimeError("fetch failed after %d attempts: %s" % (MAX_RETRIES, last_err))


def fetch_ninth_circuit(fetcher):
    """Parse the Ninth Circuit opinions RSS feed."""
    raw = fetcher.get(CA9_RSS_URL)
    root = ET.fromstring(raw)
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = (it.findtext("pubDate") or "").strip()
        if not title or not link:
            continue
        m = re.search(r"(\d{2}-\d+)\.pdf", link)
        identifier = m.group(1) if m else link
        items.append({
            "source": "Ninth Circuit", "kind": "legal",
            "title_or_case_name": title, "identifier": identifier,
            "url": link, "date": parse_date_to_iso(pub),
        })
    return items


class _ScotusTableParser(HTMLParser):
    """Collect table rows: [cells..., link-in-name-cell]."""

    def __init__(self):
        super().__init__()
        self.rows = []
        self._row = None
        self._cell = None
        self._cell_link = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = ""
            self._cell_link = None
        elif tag == "a" and self._cell is not None:
            for k, v in attrs:
                if k == "href":
                    self._cell_link = v

    def handle_data(self, data):
        if self._cell is not None:
            self._cell += data

    def handle_endtag(self, tag):
        if tag == "td" and self._row is not None and self._cell is not None:
            self._row.append((self._cell.strip(), self._cell_link))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if len(self._row) >= 4:
                self.rows.append(self._row)
            self._row = None


def _current_october_term():
    """October Term number for today (e.g. 26 for October Term 2026).

    The Term begins in October, so before October the current Term is
    the one that began last calendar year.
    """
    now = datetime.now(timezone.utc)
    start_year = now.year if now.month >= 10 else now.year - 1
    return start_year % 100


def fetch_scotus(fetcher):
    """Diff the Supreme Court slip-opinion index for the current Term.

    There is no SCOTUS RSS/Atom feed, so: fetch the current October
    Term page (slipopinion/<term>) and parse its tables (columns: R-,
    Date, Docket, Name, J., Citation). Only rows with a real filing
    date and a docket number are kept; historical terms are NOT
    followed, because re-observing years-old orders would pollute a
    freshness index with stale material. If the current Term page
    yields nothing (e.g. just after a Term boundary), the previous
    Term page is tried once as a fallback. The docket number is the
    stable identifier; slip opinions initially carry no final U.S.
    Reports pagination, so no reporter citation is claimed.
    """
    term = _current_october_term()
    candidates = [term, (term - 1) % 100]
    last_error = None
    for term_no in candidates:
        page_url = SCOTUS_BASE_URL + "/" + str(term_no)
        try:
            page = fetcher.get(page_url).decode("utf-8", "ignore")
        except Exception as exc:  # noqa: BLE001 - try the fallback term
            last_error = exc
            continue
        parser = _ScotusTableParser()
        parser.feed(page)
        items = []
        skipped = 0
        for row in parser.rows:
            # Row shape: R-, Date, Docket, Name(link), J., Citation.
            if len(row) < 4:
                skipped += 1
                continue
            date_raw, docket, name_cell = row[1][0], row[2][0], row[3]
            name = htmlmod.unescape(name_cell[0]).strip()
            href = name_cell[1]
            date = parse_date_to_iso(date_raw)
            if not name or not docket or not date \
                    or not re.match(r"^\d+[A-Za-z]+\d+$", docket):
                skipped += 1
                continue
            items.append({
                "source": "Supreme Court", "kind": "legal",
                "title_or_case_name": name, "identifier": docket,
                "url": urllib.parse.urljoin(page_url + "/", href) if href else page_url,
                "date": date,
            })
        if skipped:
            print("Supreme Court term %d: skipped %d dateless/malformed rows"
                  % (term_no, skipped), file=sys.stderr)
        if items:
            return items
    raise RuntimeError("no usable rows on current or previous Term pages: %s"
                       % (last_error,))


def fetch_arxiv(fetcher):
    """Newest arXiv submissions via the Atom API (one call per run).

    Uses a submittedDate range for the last 7 days: a bare ``all:*``
    query is rejected by the API (HTTP 500), so it is not used.
    """
    time.sleep(3)  # API manual: 3-second delay between calls.
    today = datetime.now(timezone.utc).date()
    week_ago = today - timedelta(days=7)
    params = urllib.parse.urlencode({
        "search_query": "submittedDate:[%s0000 TO %s2359]" % (
            week_ago.strftime("%Y%m%d"), today.strftime("%Y%m%d")),
        "sortBy": "submittedDate",
        "sortOrder": "descending", "start": 0, "max_results": 25,
    })
    raw = fetcher.get(ARXIV_API_URL + "?" + params)
    ns = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
    root = ET.fromstring(raw)
    items = []
    for entry in root.findall("a:entry", ns):
        id_url = (entry.findtext("a:id", namespaces=ns) or "").strip()
        title = " ".join((entry.findtext("a:title", namespaces=ns) or "").split())
        published = (entry.findtext("a:published", namespaces=ns) or "").strip()
        m = re.search(r"(\d{4}\.\d{4,5})(v\d+)?$", id_url)
        if not title or not m:
            continue
        doi_el = entry.find("x:doi", ns)
        item = {
            "source": "arXiv", "kind": "paper",
            "title_or_case_name": title, "identifier": m.group(1),
            "url": "https://arxiv.org/abs/" + m.group(1),
            "date": parse_date_to_iso(published),
        }
        if doi_el is not None and doi_el.text:
            item["doi"] = doi_el.text.strip()
        items.append(item)
    return items


def fetch_europepmc(fetcher):
    """Europe PMC records first published in the last 7 days."""
    today = datetime.now(timezone.utc).date()
    week_ago = today - timedelta(days=7)
    query = "FIRST_PDATE:[%s TO %s]" % (week_ago.isoformat(), today.isoformat())
    params = urllib.parse.urlencode({
        "query": query, "resultType": "core", "pageSize": 25, "format": "json",
    })
    raw = fetcher.get(EUROPEPMC_API_URL + "?" + params)
    data = json.loads(raw.decode("utf-8"))
    items = []
    for rec in data.get("resultList", {}).get("result", []):
        title = (rec.get("title") or "").strip()
        rec_id = rec.get("id")
        source = rec.get("source") or "MED"
        if not title or not rec_id:
            continue
        doi = (rec.get("doi") or "").strip() or None
        items.append({
            "source": "Europe PMC", "kind": "paper",
            "title_or_case_name": title,
            "identifier": doi if doi else "europepmc:" + str(rec_id),
            "url": "https://europepmc.org/article/%s/%s" % (source, rec_id),
            "date": rec.get("firstPublicationDate") or rec.get("electronicPublicationDate"),
            **({"doi": doi} if doi else {}),
        })
    return items


SOURCES = [
    ("Ninth Circuit", fetch_ninth_circuit),
    ("Supreme Court", fetch_scotus),
    ("arXiv", fetch_arxiv),
    ("Europe PMC", fetch_europepmc),
]


def merge_index(existing, fetched_by_source, now):
    """Merge fetched items into the index.

    Existing items keep their first_seen forever; new items are stamped
    with ``now``. Returns (index_dict, per-source counts).
    """
    items = list(existing.get("items", [])) if isinstance(existing, dict) else []
    by_key = {}
    for it in items:
        by_key[(it.get("source"), it.get("identifier"))] = it
    counts = {}
    for name, fetched in fetched_by_source.items():
        counts[name] = 0
        for new in fetched:
            key = (new["source"], new["identifier"])
            counts[name] += 1
            if key in by_key:
                old = by_key[key]
                for field in ("title_or_case_name", "url", "date", "doi"):
                    if new.get(field):
                        old[field] = new[field]
            else:
                entry = dict(new)
                entry["first_seen"] = now
                items.append(entry)
                by_key[key] = entry
    # Per-source cap: keep the most recently first-seen items.
    kept = []
    per_source = {}
    for it in items:
        per_source.setdefault(it.get("source"), []).append(it)
    for group in per_source.values():
        group.sort(key=lambda x: x.get("first_seen", ""), reverse=True)
        kept.extend(group[:INDEX_CAP_PER_SOURCE])
    kept.sort(key=lambda x: x.get("first_seen", ""), reverse=True)
    return {"items": kept}, counts


def load_existing(path):
    if not os.path.exists(path):
        return {"items": []}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise ValueError("existing index is not a valid index document")
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description="Poll Tier-1 direct sources.")
    parser.add_argument("--index", default=None,
                        help="Path to data/tier1-index.json (default: <repo>/data/tier1-index.json)")
    parser.add_argument("--max-per-source", type=int, default=100,
                        help="Max items taken per source per run (default 100)")
    parser.add_argument("--insecure", action="store_true",
                        help="DEV ONLY: skip TLS verification (MITM proxy environments). Never in the workflow.")
    args = parser.parse_args(argv)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = args.index or os.path.join(repo_root, "data", "tier1-index.json")

    try:
        existing = load_existing(index_path)
    except Exception as exc:  # noqa: BLE001 - abort rather than wipe
        print("ERROR: refusing to overwrite an unreadable index: %s" % exc, file=sys.stderr)
        return 2

    fetcher = Fetcher(insecure=args.insecure)
    now = utcnow_iso()
    fetched_by_source = {}
    meta_sources = []
    for name, fn in SOURCES:
        try:
            fetched = fn(fetcher)[: args.max_per_source]
            fetched_by_source[name] = fetched
            meta_sources.append({"name": name, "status": "ok",
                                 "items": len(fetched), "last_error": None})
            print("%s: ok (%d items)" % (name, len(fetched)))
        except Exception as exc:  # noqa: BLE001 - per-source failure is data
            fetched_by_source[name] = []
            meta_sources.append({"name": name, "status": "error",
                                 "items": 0, "last_error": str(exc)[:300]})
            print("%s: ERROR: %s" % (name, exc), file=sys.stderr)

    index, _counts = merge_index(existing, fetched_by_source, now)
    index["meta"] = {"last_poll": now, "sources": meta_sources}
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    tmp_path = index_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp_path, index_path)
    print("wrote %s (%d items, last_poll %s)" % (index_path, len(index["items"]), now))
    return 0


if __name__ == "__main__":
    sys.exit(main())
