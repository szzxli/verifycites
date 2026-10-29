"""Tests for scripts/legal_news_poll.py. No network."""

import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from legal_news_poll import (  # noqa: E402
    LEGAL_NEWS_QUERY,
    apply_poll,
    parse_feed,
)

ATOM_SAMPLE = b"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Shannon v. Shannon</title>
    <link href="https://www.courtlistener.com/opinion/11009430/shannon-v-shannon/" rel="alternate"/>
    <published>2026-10-02T00:00:00-07:00</published>
    <author><name>Nebraska Supreme Court</name></author>
  </entry>
  <entry>
    <title>Skip me</title>
    <published>2026-10-01T00:00:00Z</published>
  </entry>
</feed>
"""


class QueryTests(unittest.TestCase):
    def test_query_matches_docs(self):
        docs_path = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "legal-news.md")
        with open(docs_path, encoding="utf-8") as fh:
            docs = fh.read()
        self.assertIn(LEGAL_NEWS_QUERY, docs)

    def test_query_has_no_standalone_sanctions(self):
        self.assertNotRegex(LEGAL_NEWS_QUERY, r"\bsanctions?\b")


class FeedTests(unittest.TestCase):
    def test_parse_feed_keeps_dated_opinion_with_link(self):
        items = parse_feed(ATOM_SAMPLE)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["case_name"], "Shannon v. Shannon")
        self.assertEqual(items[0]["court"], "Nebraska Supreme Court")
        self.assertEqual(items[0]["date"], "2026-10-02")
        self.assertTrue(items[0]["url"].startswith("https://www.courtlistener.com/opinion/"))

    def test_success_sets_both_timestamps_and_replaces_items(self):
        existing = {
            "status": "ok",
            "updated_utc": "2026-10-01T00:00:00Z",
            "last_success_utc": "2026-10-01T00:00:00Z",
            "items": [{"case_name": "Old"}],
        }
        payload = apply_poll(existing, {"ok": True, "items": [{"case_name": "New"}]}, "2026-10-29T03:00:00Z")
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["updated_utc"], "2026-10-29T03:00:00Z")
        self.assertEqual(payload["last_success_utc"], "2026-10-29T03:00:00Z")
        self.assertEqual(payload["query"], LEGAL_NEWS_QUERY)
        self.assertIsNone(payload["error"])
        self.assertEqual(payload["items"], [{"case_name": "New"}])

    def test_failure_keeps_items_and_last_success(self):
        existing = {
            "status": "ok",
            "updated_utc": "2026-10-01T00:00:00Z",
            "last_success_utc": "2026-10-01T00:00:00Z",
            "items": [{"case_name": "Kept"}],
        }
        payload = apply_poll(existing, {"ok": False, "error": "timeout"}, "2026-10-29T03:00:00Z")
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["updated_utc"], "2026-10-29T03:00:00Z")
        self.assertEqual(payload["last_success_utc"], "2026-10-01T00:00:00Z")
        self.assertEqual(payload["error"], "timeout")
        self.assertEqual(payload["items"], [{"case_name": "Kept"}])
        self.assertNotEqual(payload["updated_utc"], payload["last_success_utc"])


if __name__ == "__main__":
    unittest.main()
