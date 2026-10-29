#!/usr/bin/env python3
"""Citation-integrity news poller (Python standard library only).

Reads the CourtListener opinion Atom search feed and writes
data/legal-news.json. The browser page reads that static file from the
same origin. This script is the only thing that contacts CourtListener,
and it runs in GitHub Actions, not in the browser.

The query is phrase-level. It does not use the standalone word
"sanctions" (that token also matches economic and disciplinary
sanctions that have nothing to do with citations). A hit has to name a
fabricated, fictitious, nonexistent, hallucinated, or AI-generated
citation or case, and it also has to name an AI system or technology.

On failure the previous items are kept. status becomes "error",
updated_utc is this attempt, and last_success_utc stays on the last
successful run. A stale list must never be presented as a fresh one.
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

# Exact query. docs/legal-news.md must quote this string unchanged.
LEGAL_NEWS_QUERY = (
    '("fabricated citation" OR "fabricated citations" OR "fabricated case" OR "fabricated cases" '
    'OR "fictitious citation" OR "fictitious citations" OR "fictitious case" OR "fictitious cases" '
    'OR "hallucinated citation" OR "hallucinated citations" OR "hallucinated case" OR "hallucinated cases" '
    'OR "nonexistent citation" OR "nonexistent citations" OR "nonexistent case" OR "non-existent citation" '
    'OR "non-existent case" OR "AI-generated citation" OR "AI-generated citations" '
    'OR "artificial intelligence hallucination" OR "artificial intelligence hallucinations") '
    'AND ("artificial intelligence" OR "AI-generated" OR ChatGPT OR "generative AI" '
    'OR "generative artificial intelligence" OR "large language model" OR GPT)'
)

FEED_BASE = "https://www.courtlistener.com/feed/search/"
USER_AGENT = "verifycites-legal-news-poller/1.0 (+https://verifycites.com/)"
REQUEST_TIMEOUT = 40
MAX_RETRIES = 3
RETRY_SLEEP = 5
STORE_MAX = 20
ATOM = "{http://www.w3.org/2005/Atom}"


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def feed_url():
    params = urllib.parse.urlencode({
        "type": "o",
        "order_by": "dateFiled desc",
        "q": LEGAL_NEWS_QUERY,
    })
    return FEED_BASE + "?" + params


def empty_payload(now):
    return {
        "status": "ok",
        "updated_utc": now,
        "last_success_utc": None,
        "query": LEGAL_NEWS_QUERY,
        "error": None,
        "items": [],
    }


def load_payload(path):
    if not path or not os.path.exists(path):
        return empty_payload(None)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return empty_payload(None)
    if not isinstance(data, dict):
        return empty_payload(None)
    items = data.get("items")
    if not isinstance(items, list):
        items = []
    return {
        "status": data.get("status") if data.get("status") in ("ok", "error") else "ok",
        "updated_utc": data.get("updated_utc"),
        "last_success_utc": data.get("last_success_utc"),
        "query": LEGAL_NEWS_QUERY,
        "error": data.get("error"),
        "items": [it for it in items if isinstance(it, dict)],
    }


def parse_feed(xml_bytes):
    """Return opinion items from a CourtListener Atom search feed."""
    root = ET.fromstring(xml_bytes)
    items = []
    for entry in root.findall(ATOM + "entry"):
        title = (entry.findtext(ATOM + "title") or "").strip()
        link = ""
        for el in entry.findall(ATOM + "link"):
            rel = el.get("rel") or "alternate"
            href = (el.get("href") or "").strip()
            if rel == "alternate" and href:
                link = href
                break
        court = ""
        author = entry.find(ATOM + "author")
        if author is not None:
            court = (author.findtext(ATOM + "name") or "").strip()
        published = (entry.findtext(ATOM + "published") or "").strip()
        date = published[:10] if len(published) >= 10 and published[4] == "-" else ""
        if not title or not link:
            continue
        items.append({
            "date": date,
            "court": court,
            "case_name": title,
            "url": link,
        })
        if len(items) >= STORE_MAX:
            break
    return items


def apply_poll(existing, outcome, now):
    """Merge one poll attempt into the published payload.

    outcome is {"ok": True, "items": [...]} or {"ok": False, "error": "..."}.
    A failed attempt keeps items and last_success_utc, and moves
    updated_utc to this attempt with status "error".
    """
    existing = existing or empty_payload(None)
    previous_items = existing.get("items") if isinstance(existing.get("items"), list) else []
    if outcome.get("ok"):
        return {
            "status": "ok",
            "updated_utc": now,
            "last_success_utc": now,
            "query": LEGAL_NEWS_QUERY,
            "error": None,
            "items": outcome.get("items") or [],
        }
    return {
        "status": "error",
        "updated_utc": now,
        "last_success_utc": existing.get("last_success_utc"),
        "query": LEGAL_NEWS_QUERY,
        "error": outcome.get("error") or "fetch failed",
        "items": previous_items,
    }


class Fetcher:
    def __init__(self, insecure=False):
        self.ctx = ssl._create_unverified_context() if insecure else None

    def get(self, url):
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT, context=self.ctx) as resp:
                    if resp.status != 200:
                        raise urllib.error.HTTPError(url, resp.status, "non-200", None, None)
                    return resp.read()
            except Exception as exc:  # noqa: BLE001 - recorded on the payload
                last_err = exc
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_SLEEP)
        raise RuntimeError("fetch failed after %d attempts: %s" % (MAX_RETRIES, last_err))


def poll_once(existing, fetcher, now):
    try:
        raw = fetcher.get(feed_url())
        items = parse_feed(raw)
        return apply_poll(existing, {"ok": True, "items": items}, now)
    except Exception as exc:  # noqa: BLE001 - status error, items preserved
        return apply_poll(existing, {"ok": False, "error": str(exc)}, now)


def write_payload(path, payload):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Poll CourtListener for citation-integrity opinions.")
    parser.add_argument("--output", default="data/legal-news.json")
    parser.add_argument("--insecure", action="store_true",
                        help="Disable TLS verification. Never pass this from the scheduled workflow.")
    args = parser.parse_args(argv)
    existing = load_payload(args.output)
    payload = poll_once(existing, Fetcher(insecure=args.insecure), utcnow_iso())
    write_payload(args.output, payload)
    print("status=%s items=%d updated_utc=%s last_success_utc=%s" % (
        payload["status"], len(payload["items"]), payload["updated_utc"], payload["last_success_utc"]))
    if payload["status"] != "ok":
        print("error=%s" % payload["error"], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
