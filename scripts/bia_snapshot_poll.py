#!/usr/bin/env python3
"""BIA precedent snapshot poller for verifycites (standard library + pypdf).

Builds a static, same-origin snapshot index of EOIR AG/BIA precedent
decisions so the legal page can offer one-click search over cited
cases instead of sending the user to open twelve systems by hand.
The browser page reads the static files; it never contacts justice.gov.
This script runs in GitHub Actions, not in the browser.

What it stores (and what it does NOT store):
  * data/bia-index.json — metadata ONLY per decision: interim decision
    number, case name, I&N Dec. citation, year, deciding body (BIA/AG),
    volume, official PDF URL, first-seen time (immutable), fetch time,
    PDF sha256, extracted-text length, extraction status. Never full
    decision text, so the published files stay bounded.
  * data/bia-search/volNN.json — per-volume inverted index
    (term -> sorted decision IDs) built from extracted text, so the
    page can search by issue/keyword without shipping full text.
  * data/bia-manifest.json — the verification record for the run:
    per-volume expected vs found counts, missing IDs, extraction
    ok/short/failed lists, gaps, error text, timestamps.

Design rules (do not weaken them without recording why):
  * Sanctioned route only. justice.gov robots.txt does not disallow
    /eoir/ paths and sets Crawl-delay: 10; the DOJ Legal Policies page
    states DOJ website information is public domain and may be copied
    and distributed without permission (citation appreciated — every
    index entry carries its source URL and fetch time). This poller
    fetches ONLY the EOIR decisions index page, volume pages, and
    decision PDFs. Single-threaded, 10 seconds between requests, no
    exceptions: there is no --delay flag on purpose.
  * Stop on block. HTTP 403 or 429 stops the run immediately with no
    retry and no workaround. Transient errors (5xx, timeouts) retry at
    most 3 times with backoff. A blocked or failed enumeration run
    writes nothing: previous published data is preserved.
  * first_seen is IMMUTABLE: once a decision is in the index,
    re-polling never overwrites its first_seen. Fetch time and sha256
    may be refreshed.
  * Pairing is validated, not assumed. A volume page lists one entry
    per decision: a header row carrying the decision's own citation
    and its PDF link, followed by a holding summary that itself cites
    older precedent. Pairing citations and links by whole-page order
    therefore over-counts (2026-10-29 probe: 32 citations vs 26 PDF
    links on the current volume page; the page's own text shows the
    extra citations inside holding summaries). So each PDF link pairs
    with the nearest preceding citation that no earlier link
    intervenes before, accepted only when that citation's volume
    matches the page volume. Anything else is a gap, never a forced
    pair: a citation with no following link (a holding-summary
    citation, or an entry listed before its PDF is published) and a
    link with no valid header citation. Whole-page count mismatch is
    no longer an abort, because the no-guess intent is preserved
    structurally: a link pairs only with the one citation that can be
    its header by position and volume. The page display omits the
    "Matter of" prefix, so the indexer prepends it for display names;
    BIA and A.G. entries are both accepted and the deciding body is
    recorded.
  * Extraction honesty. A PDF yielding under 500 characters is marked
    extraction_status "short" (often a scanned PDF needing OCR) and is
    listed as a gap, not silently indexed: short extractions are
    excluded from the inverted index. Per-PDF failures are recorded
    in manifest.failed and the run continues; the daily poll mode
    re-attempts them (a failed decision is absent from the index, so
    the next poll diff picks it up again).
  * Run status. Exit 0 means the run completed enumeration; the
    manifest says "complete" only when failed[] is empty, otherwise
    "partial" with the failed list. Exit 1 means enumeration failed
    or the run was blocked: nothing is written. A backfill group that
    exits 1 must be re-run whole (no mid-group checkpoint in v1).
  * No user data, no credentials, no secrets anywhere in this script,
    its output, or its logs. Certificates are verified by default.
    ``--insecure`` exists ONLY for local debugging and must never be
    passed from the scheduled workflow.
  * Honesty limit, recorded plainly: this index proves a decision
    EXISTS, what its citation is, and where the official PDF lives.
    It never proves a decision is "still good law": overruling and
    conflict data do not exist in any source used here, and the page
    must never present a hit as valid, current, or supporting an
    argument. The lawyer judges; the index only helps find.

Modes:
  * probe — dry run, writes nothing. Fetches the index page, the
    current volume page, and --limit sample PDFs; prints entries and
    verification counts. Fails when no entries pair on the current
    volume page or when none of the sampled PDFs yields usable text.
  * backfill — one volume group (e.g. 08-10), volumes 08-30 only.
    Volumes 01-07 are NOT enumerable from volume pages (they live in
    cumulative-index PDFs) and are a recorded phase-2 gap, not
    silently skipped: requesting them exits 2 upfront.
  * poll — daily freshness: index page plus the current (highest)
    volume page only; downloads PDFs only for decisions absent from
    the existing index. Older volumes are static and not re-fetched.

GitHub Actions job time is capped at 6 hours, so backfill is chunked
into groups sized to finish inside one run at 10s/request
(08-10, 11-13, 14-19, 20-25, 26-30). Dispatch one group per run.
"""

import argparse
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

BASE = "https://www.justice.gov"
INDEX_URL = BASE + "/eoir/ag-bia-decisions"
USER_AGENT = "verifycites-bia-snapshot-poller/1.0 (+https://verifycites.com/)"
REQUEST_TIMEOUT = 40
MAX_RETRIES = 3
RETRY_SLEEP = 5
CRAWL_DELAY = 10
MIN_TEXT_CHARS = 500

# Verified 2026-10-28 from the EOIR decisions index page. Volume 30 is
# open-ended (still growing); volumes 08-29 are closed ranges. Volume 10
# carries the extra legacy number 938 alongside 1230-1417.
EXPECTED_COUNTS = {
    "08": 149, "09": 142, "10": 189, "11": 258, "12": 225, "13": 216,
    "14": 184, "15": 225, "16": 185, "17": 141, "18": 99, "19": 150,
    "20": 142, "21": 98, "22": 100, "23": 100, "24": 102, "25": 123,
    "26": 121, "27": 98, "28": 100, "29": 155, "30": None,
}
EXPECTED_IDS = {
    "08": set(range(939, 1088)),
    "09": set(range(1088, 1230)),
    "10": {938} | set(range(1230, 1418)),
    "11": set(range(1418, 1676)),
    "12": set(range(1676, 1901)),
    "13": set(range(1901, 2117)),
    "14": set(range(2117, 2301)),
    "15": set(range(2301, 2526)),
    "16": set(range(2526, 2711)),
    "17": set(range(2711, 2852)),
    "18": set(range(2852, 2951)),
    "19": set(range(2951, 3101)),
    "20": set(range(3101, 3243)),
    "21": set(range(3243, 3341)),
    "22": set(range(3341, 3441)),
    "23": set(range(3441, 3541)),
    "24": set(range(3541, 3643)),
    "25": set(range(3643, 3766)),
    "26": set(range(3766, 3887)),
    "27": set(range(3887, 3985)),
    "28": set(range(3985, 4085)),
    "29": set(range(4085, 4240)),
    "30": None,
}

CITATION_RE = re.compile(
    r"([A-Z0-9][A-Z0-9\-\.\s&]*?),\s*(\d+)\s+I&N Dec\.\s*(\d+)\s*"
    r"\((BIA|A\.G\.)\s*(\d{4})\)"
)
ID_TEXT_RE = re.compile(r"ID\s*(\d+)")
PDF_HREF_RE = re.compile(r"^/eoir/media/\d+/dl(\?inline)?$")
LEGACY_HREF_RE = re.compile(r"^/sites/default/files/eoir/legacy/.*\.pdf$")
VOLUME_HREF_RE = re.compile(r"^/eoir/volume-(\d+)$")
TOKEN_RE = re.compile(r"[a-z0-9]+")
STOPWORDS = {
    "the", "and", "of", "to", "in", "a", "an", "is", "are", "was", "were",
    "be", "been", "being", "for", "with", "on", "at", "by", "from", "that",
    "this", "it", "as", "or", "not", "no", "are", "has", "have", "had",
    "will", "would", "can", "could", "should", "may", "might", "must",
    "shall", "upon", "which", "who", "whom", "whose", "when", "where",
    "under", "over", "after", "before", "between", "through", "during",
    "also", "than", "then", "them", "they", "their", "his", "her", "its",
    "our", "your", "all", "any", "each", "per", "via", "into", "out",
}


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class BlockedError(RuntimeError):
    pass


class Fetcher:
    def __init__(self, insecure=False):
        self.ctx = ssl._create_unverified_context() if insecure else None
        self._first = True

    def get(self, url):
        if not self._first:
            time.sleep(CRAWL_DELAY)
        self._first = False
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT, context=self.ctx) as resp:
                    if resp.status != 200:
                        raise urllib.error.HTTPError(url, resp.status, "non-200", None, None)
                    return resp.read()
            except urllib.error.HTTPError as exc:
                if exc.code in (403, 429):
                    raise BlockedError("blocked by source: HTTP %d on %s" % (exc.code, url))
                last_err = exc
            except Exception as exc:  # noqa: BLE001 - recorded on the manifest
                last_err = exc
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_SLEEP)
        raise RuntimeError("fetch failed after %d attempts: %s" % (MAX_RETRIES, last_err))


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.anchors = []  # (href, text) in document order
        self.text_parts = []
        self._href = None
        self._buf = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href", "")
            self._buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._buf).strip()))
            self._href = None
            self._buf = []

    def handle_data(self, data):
        self.text_parts.append(data)
        if self._href is not None:
            self._buf.append(data)


def parse_volume_links(index_html):
    parser = LinkParser()
    parser.feed(index_html)
    volumes = []
    for href, _text in parser.anchors:
        m = VOLUME_HREF_RE.match((href or "").strip())
        if m:
            volumes.append(m.group(1).zfill(2))
    return sorted(set(volumes))


def parse_volume_entries(volume_html, page_volume=None):
    """Pair each PDF link with its own entry's header citation.

    Returns (entries, gaps). See the module docstring for why
    whole-page order pairing was replaced: holding summaries cite
    older precedent, so whole-page citation counts always exceed
    PDF-link counts on real volume pages.
    """
    parser = LinkParser()
    parser.feed(volume_html)
    page_text = " ".join(parser.text_parts)
    page_text = re.sub(r"\s+", " ", page_text)
    citations = []
    for m in CITATION_RE.finditer(page_text):
        name = re.sub(r"\s+", " ", m.group(1)).strip()
        citations.append({
            "start": m.start(),
            "name": name,
            "display_name": "Matter of " + name,
            "cite_vol": int(m.group(2)),
            "cite_page": int(m.group(3)),
            "body": "AG" if m.group(4) == "A.G." else "BIA",
            "year": int(m.group(5)),
        })
    pdf_links = []
    search_from = 0
    for href, text in parser.anchors:
        href = (href or "").strip()
        if not (PDF_HREF_RE.match(href) or LEGACY_HREF_RE.match(href)):
            continue
        id_m = ID_TEXT_RE.search(text or "")
        anchor_text = re.sub(r"\s+", " ", text or "").strip()
        anchor_start = None
        anchor_end = None
        if anchor_text:
            found = page_text.find(anchor_text, search_from)
            if found >= 0:
                anchor_start = found
                anchor_end = found + len(anchor_text)
                search_from = anchor_end
        pdf_links.append({
            "pdf_url": urllib.parse.urljoin(BASE, href),
            "id": int(id_m.group(1)) if id_m else None,
            "anchor_start": anchor_start,
            "anchor_end": anchor_end,
        })
    entries = []
    gaps = []
    used = set()
    prev_end = -1
    for link in pdf_links:
        start = link["anchor_start"]
        if start is None:
            gaps.append({"kind": "link",
                         "detail": "PDF link with unlocatable anchor text: %s"
                                   % link["pdf_url"]})
            continue
        end = link["anchor_end"]
        cands = [i for i, c in enumerate(citations)
                 if i not in used and prev_end <= c["start"] < end]
        if not cands:
            gaps.append({"kind": "link",
                         "detail": "no citation before PDF link: %s" % link["pdf_url"]})
        else:
            cand = citations[cands[-1]]
            if page_volume is not None and cand["cite_vol"] != page_volume:
                gaps.append({"kind": "link",
                             "detail": "nearest citation before %s is %s, not page "
                                       "volume %d; not paired"
                                       % (link["pdf_url"], cand["display_name"],
                                          page_volume)})
            else:
                used.add(cands[-1])
                entry = {k: v for k, v in cand.items() if k != "start"}
                entry.update({"pdf_url": link["pdf_url"], "id": link["id"]})
                entries.append(entry)
        prev_end = end
    # A holding summary can cite the same older precedent more than
    # once (2026-10-29 probe: R-K-K-, 26 I&N Dec. 658, listed twice).
    # Report each unpaired citation once, keyed by its I&N Dec. cite.
    seen_cites = set()
    for i, cite in enumerate(citations):
        if i in used:
            continue
        key = (cite["cite_vol"], cite["cite_page"])
        if key in seen_cites:
            continue
        seen_cites.add(key)
        gaps.append({"kind": "citation",
                     "detail": "citation without a following PDF link: %s "
                               "(%d I&N Dec. %d)"
                               % (cite["display_name"], cite["cite_vol"],
                                  cite["cite_page"])})
    return entries, gaps


def extract_text(pdf_bytes):
    """Return extracted text, or raise when no extractor is available."""
    try:
        from pypdf import PdfReader  # type: ignore
        import io
        reader = PdfReader(io.BytesIO(pdf_bytes))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(parts)
    except ImportError:
        pass
    try:
        proc = subprocess.run(
            ["pdftotext", "-", "-"], input=pdf_bytes,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        if proc.returncode == 0:
            return proc.stdout.decode("utf-8", errors="replace")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    raise RuntimeError("no PDF text extractor available (need pypdf or pdftotext)")


# Initials case names (K-Y-V-R-, N-L-U-, R-K-K-) would otherwise split
# into one-letter tokens and be dropped. A run of single letters joined
# by hyphens collapses to one token first: "K-Y-V-R-" -> "kyvr". The
# same regex and steps live in legal/bia.js biaTokenize(); keep them in
# sync (both sides are tested).
INITIALS_RE = re.compile(r"(^|[^A-Za-z0-9])((?:[A-Za-z]-)+[A-Za-z]?)(?=[^A-Za-z0-9]|$)")


def collapse_initials(text):
    return INITIALS_RE.sub(lambda m: m.group(1) + m.group(2).replace("-", ""), text)


def name_key(name):
    """Normalized case-name key: lowercase, letters and digits only."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def name_terms(name):
    """Search terms for a case name: its normalized key plus its tokens."""
    terms = tokenize(name or "")
    key = name_key(name)
    if len(key) >= 2:
        terms.add(key)
    return terms


def tokenize(text):
    """Lowercase alphanumeric tokens, 3+ chars, minus stopwords; plus
    collapsed initials runs of 2+ letters (so M-K- -> "mk" is kept)."""
    text = text or ""
    terms = set()
    for m in INITIALS_RE.finditer(text):
        key = m.group(2).replace("-", "").lower()
        if len(key) >= 2:
            terms.add(key)
    for tok in TOKEN_RE.findall(collapse_initials(text).lower()):
        if len(tok) >= 3 and tok not in STOPWORDS:
            terms.add(tok)
    return terms


def load_json(path, default):
    if not path or not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path, payload, compact=False):
    """Write JSON atomically. compact=True (published page files:
    bia-index.json, bia-search/volNN.json) drops indentation to keep
    the files the page downloads small; the manifest stays readable."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        if compact:
            json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


def parse_volume_group(spec):
    m = re.fullmatch(r"(\d{1,2})-(\d{1,2})", spec.strip())
    if not m:
        raise ValueError("volume group must look like 08-10, got %r" % spec)
    lo, hi = int(m.group(1)), int(m.group(2))
    if lo > hi:
        raise ValueError("volume group start after end: %r" % spec)
    vols = ["%02d" % v for v in range(lo, hi + 1)]
    unsupported = [v for v in vols if v not in EXPECTED_COUNTS]
    if unsupported:
        raise ValueError(
            "volumes %s are not enumerable from volume pages "
            "(volumes 01-07 live in cumulative-index PDFs: phase 2, "
            "not in this run)" % ",".join(unsupported))
    return vols


def build_entry(entry, pdf_bytes, now):
    text = extract_text(pdf_bytes)
    flat = re.sub(r"\s+", " ", text)
    status = "ok" if len(flat) >= MIN_TEXT_CHARS else "short"
    return {
        "id": entry["id"],
        "name": entry["name"],
        "display_name": entry["display_name"],
        "name_key": name_key(entry["name"]),
        "citation": "%d I&N Dec. %d" % (entry["cite_vol"], entry["cite_page"]),
        "year": entry["year"],
        "body": entry["body"],
        "pdf_url": entry["pdf_url"],
        "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
        "text_chars": len(flat),
        "extraction_status": status,
        "fetched_utc": now,
    }, (flat if status == "ok" else "")


def run_probe(fetcher, limit):
    now = utcnow_iso()
    index_html = fetcher.get(INDEX_URL).decode("utf-8", errors="replace")
    volumes = parse_volume_links(index_html)
    if not volumes:
        raise RuntimeError("no volume links found on the EOIR index page")
    current = volumes[-1]
    vol_html = fetcher.get(BASE + "/eoir/volume-" + current).decode("utf-8", errors="replace")
    entries, gaps = parse_volume_entries(vol_html, page_volume=int(current))
    if not entries:
        raise RuntimeError("probe failed: no entries paired on current "
                           "volume page (%d gaps)" % len(gaps))
    sample = entries[:limit]
    ok = 0
    shown = []
    for entry in sample:
        pdf = fetcher.get(entry["pdf_url"])
        built, _text = build_entry(entry, pdf, now)
        shown.append(built)
        if built["extraction_status"] == "ok":
            ok += 1
    print("probe: index volumes=%s current=%s entries_on_page=%d sampled=%d text_ok=%d gaps=%d"
          % (",".join(volumes), current, len(entries), len(sample), ok, len(gaps)))
    for gap in gaps:
        print("  gap: %s" % gap["detail"])
    for built in shown:
        print("  id=%s %s (%d) %s chars=%d status=%s"
              % (built["id"], built["display_name"], built["year"],
                 built["citation"], built["text_chars"], built["extraction_status"]))
    if ok == 0 and sample:
        raise RuntimeError("probe failed: none of the sampled PDFs yielded usable text")
    return 0


def run_backfill_or_poll(fetcher, data_dir, mode, volume_group, now):
    index_path = os.path.join(data_dir, "bia-index.json")
    manifest_path = os.path.join(data_dir, "bia-manifest.json")
    search_dir = os.path.join(data_dir, "bia-search")
    existing_index = load_json(index_path, None)
    if existing_index is not None and not isinstance(existing_index, dict):
        raise RuntimeError("existing index unreadable: refusing to overwrite")
    old_entries = {}
    if existing_index:
        for e in existing_index.get("entries", []):
            if isinstance(e, dict) and e.get("pdf_url"):
                old_entries[e["pdf_url"]] = e
    if mode == "poll":
        index_html = fetcher.get(INDEX_URL).decode("utf-8", errors="replace")
        volumes = parse_volume_links(index_html)
        if not volumes:
            raise RuntimeError("no volume links found on the EOIR index page")
        todo_vols = [volumes[-1]]
    else:
        todo_vols = parse_volume_group(volume_group)

    new_entries = []
    failed = []
    per_volume = {}
    search_updates = {}
    for vol in todo_vols:
        vol_html = fetcher.get(BASE + "/eoir/volume-" + vol).decode("utf-8", errors="replace")
        page_entries_all, page_gaps = parse_volume_entries(
            vol_html, page_volume=int(vol))
        page_entries = page_entries_all
        if mode == "poll":
            page_entries = [e for e in page_entries if e["pdf_url"] not in old_entries]
        vol_new = []
        vol_failed = []
        vol_terms = {}
        for entry in page_entries:
            try:
                pdf = fetcher.get(entry["pdf_url"])
                built, flat = build_entry(entry, pdf, now)
            except Exception as exc:  # noqa: BLE001 - recorded, run continues
                vol_failed.append({"id": entry["id"], "pdf_url": entry["pdf_url"],
                                   "error": str(exc)[:300]})
                continue
            prev = old_entries.get(built["pdf_url"])
            if prev and prev.get("first_seen_utc"):
                built["first_seen_utc"] = prev["first_seen_utc"]
            else:
                built["first_seen_utc"] = now
            built["volume"] = vol
            vol_new.append(built)
            if flat:
                key = built["id"] if built["id"] is not None else built["pdf_url"]
                for term in tokenize(flat) | name_terms(built["name"]):
                    vol_terms.setdefault(term, []).append(key)
        if mode == "poll" and vol_terms:
            # Poll indexes only new decisions; merge them into the
            # existing volume index instead of replacing it.
            prev_vol = load_json(os.path.join(search_dir, "vol%s.json" % vol), {})
            for term, keys in ((prev_vol or {}).get("terms") or {}).items():
                vol_terms.setdefault(term, []).extend(keys)
        for term in vol_terms:
            vol_terms[term] = sorted(set(vol_terms[term]),
                                     key=lambda x: (isinstance(x, str), x))
        if not page_entries_all and page_gaps:
            vol_failed.append({"volume": vol,
                               "error": "pairing produced no entries (%d gaps)"
                                        % len(page_gaps)})
        found_ids = [e["id"] for e in page_entries_all if e["id"] is not None]
        expected = EXPECTED_IDS.get(vol)
        missing = sorted(expected - set(found_ids)) if expected is not None else []
        per_volume[vol] = {
            "found_on_page": len(page_entries_all),
            "pairing_gaps": len(page_gaps),
            "pairing_gap_sample": [g["detail"] for g in page_gaps[:3]],
            "expected_count": EXPECTED_COUNTS.get(vol),
            "new_downloaded": len(vol_new),
            "failed": len(vol_failed),
            "missing_ids": missing,
            "extraction_short": sum(1 for b in vol_new if b["extraction_status"] == "short"),
        }
        new_entries.extend(vol_new)
        failed.extend(vol_failed)
        if vol_terms:
            search_updates[vol] = vol_terms
        print("volume %s: page=%d new=%d failed=%d missing_ids=%d"
              % (vol, len(page_entries_all), len(vol_new), len(vol_failed), len(missing)))

    merged = dict(old_entries)
    for built in new_entries:
        merged[built["pdf_url"]] = built
    all_entries = sorted(merged.values(),
                         key=lambda e: (e.get("volume", ""), e.get("id") or 0))
    manifest = {
        "status": "complete" if not failed else "partial",
        "mode": mode,
        "updated_utc": now,
        "last_success_utc": now,
        "volumes": per_volume,
        "failed": failed,
        "gaps": [
            "volumes 01-07 not enumerable from volume pages "
            "(cumulative-index PDFs): phase 2, not in this run",
        ],
        "error": None,
    }
    index_payload = {
        "status": manifest["status"],
        "updated_utc": now,
        "last_success_utc": now,
        "source": "EOIR AG/BIA precedent decisions (justice.gov)",
        "entries": all_entries,
    }
    write_json(index_path, index_payload, compact=True)
    for vol, terms in search_updates.items():
        write_json(os.path.join(search_dir, "vol%s.json" % vol),
                   {"volume": vol, "updated_utc": now, "terms": terms},
                   compact=True)
    write_json(manifest_path, manifest)
    print("done: mode=%s volumes=%s total_entries=%d new=%d failed=%d status=%s"
          % (mode, ",".join(todo_vols), len(all_entries),
             len(new_entries), len(failed), manifest["status"]))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="BIA precedent snapshot poller.")
    parser.add_argument("--mode", choices=["probe", "backfill", "poll"], default="poll")
    parser.add_argument("--volume-group", default="26-30")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--insecure", action="store_true",
                        help="Disable TLS verification. Never pass this from the scheduled workflow.")
    args = parser.parse_args(argv)
    fetcher = Fetcher(insecure=args.insecure)
    try:
        if args.mode == "probe":
            return run_probe(fetcher, args.limit)
        return run_backfill_or_poll(fetcher, args.data_dir, args.mode,
                                    args.volume_group, utcnow_iso())
    except BlockedError as exc:
        print("BLOCKED: %s (no retry, nothing written)" % exc, file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - run failed, previous data preserved
        print("ERROR: %s (nothing written)" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
