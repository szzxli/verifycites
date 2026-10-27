"""Tests for scripts/tier1_poll.py (stdlib only).

Run: python3 -m unittest discover -s scripts/tests -v
Covers the merge contract the whole feature rests on: dedupe by
(source, identifier), first_seen immutability, failed-source
preservation, and the per-source cap. No network is used here.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tier1_poll import INDEX_CAP_PER_SOURCE, merge_index


def item(source, identifier, title="T", first_seen=None):
    entry = {
        "source": source, "kind": "legal" if "Circuit" in source or "Court" in source else "paper",
        "title_or_case_name": title, "identifier": identifier,
        "url": "https://example.invalid/" + identifier,
    }
    if first_seen is not None:
        entry["first_seen"] = first_seen
    return entry


class MergeTests(unittest.TestCase):
    def test_dedupe_by_source_and_identifier(self):
        existing = {"items": [item("Ninth Circuit", "26-842", first_seen="2026-10-27T00:00:00Z")]}
        fetched = {"Ninth Circuit": [
            item("Ninth Circuit", "26-842"),
            item("Ninth Circuit", "26-842"),
            item("Ninth Circuit", "26-843"),
        ]}
        index, _ = merge_index(existing, fetched, "2026-10-28T00:00:00Z")
        keys = [(i["source"], i["identifier"]) for i in index["items"]]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(index["items"]), 2)

    def test_first_seen_immutable_and_fields_refresh(self):
        existing = {"items": [item("arXiv", "2610.1", title="Old Title",
                                      first_seen="2026-10-27T00:00:00Z")]}
        fetched = {"arXiv": [item("arXiv", "2610.1", title="New Title")]}
        index, _ = merge_index(existing, fetched, "2026-10-28T00:00:00Z")
        self.assertEqual(len(index["items"]), 1)
        self.assertEqual(index["items"][0]["first_seen"], "2026-10-27T00:00:00Z")
        self.assertEqual(index["items"][0]["title_or_case_name"], "New Title")

    def test_failed_source_preserves_existing_items(self):
        existing = {"items": [
            item("arXiv", "2610.1", first_seen="2026-10-27T00:00:00Z"),
            item("Europe PMC", "10.1/abc", first_seen="2026-10-27T00:00:00Z"),
        ]}
        # Europe PMC fetched nothing this run (failure path): its items stay.
        fetched = {"arXiv": [item("arXiv", "2610.2")], "Europe PMC": []}
        index, _ = merge_index(existing, fetched, "2026-10-28T00:00:00Z")
        self.assertEqual(len(index["items"]), 3)
        kept = {(i["source"], i["identifier"]) for i in index["items"]}
        self.assertIn(("Europe PMC", "10.1/abc"), kept)

    def test_same_identifier_different_source_is_not_a_dupe(self):
        existing = {"items": [item("arXiv", "10.1/abc", first_seen="2026-10-27T00:00:00Z")]}
        fetched = {"Europe PMC": [item("Europe PMC", "10.1/abc")]}
        index, _ = merge_index(existing, fetched, "2026-10-28T00:00:00Z")
        self.assertEqual(len(index["items"]), 2)

    def test_per_source_cap(self):
        existing = {"items": [
            item("arXiv", "id-%04d" % n, first_seen="2026-10-%02dT00:00:00Z" % (n % 28 + 1))
            for n in range(INDEX_CAP_PER_SOURCE + 50)
        ]}
        index, _ = merge_index(existing, {}, "2026-10-28T00:00:00Z")
        arxiv_items = [i for i in index["items"] if i["source"] == "arXiv"]
        self.assertEqual(len(arxiv_items), INDEX_CAP_PER_SOURCE)


if __name__ == "__main__":
    unittest.main()
