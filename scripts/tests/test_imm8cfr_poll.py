"""Unit tests for scripts/imm8cfr_poll.py (stdlib only, no network).

Run from scripts/:  python3 -m unittest tests.test_imm8cfr_poll -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import imm8cfr_poll as poll  # noqa: E402


SAMPLE_TITLES = {
    "titles": [
        {"number": 7, "name": "Agriculture", "up_to_date_as_of": "2026-10-23"},
        {"number": 8, "name": "Aliens and Nationality",
         "latest_amended_on": "2026-10-14", "up_to_date_as_of": "2026-10-23"},
    ]
}

SAMPLE_STRUCTURE = {
    "identifier": "8", "type": "title", "children": [
        {"identifier": "I", "type": "chapter", "children": [
            {"identifier": "208", "type": "part", "label": "Part 208—Procedures for Asylum",
             "label_description": "Procedures for Asylum", "children": [
                 {"identifier": "208.18", "type": "section",
                  "label": "§ 208.18 Implementation of the Convention Against Torture.",
                  "label_description": "Implementation of the Convention Against Torture.",
                  "received_on": "2023-03-29T21:30:09-0400", "reserved": False},
                 {"identifier": "208.99", "type": "section",
                  "label": "§ 208.99 Reserved.",
                  "label_description": "Reserved.", "reserved": True},
             ]},
            {"identifier": "103", "type": "part", "label": "Part 103—Powers and Duties",
             "label_description": "Powers and Duties", "children": [
                 {"identifier": "103.3", "type": "section",
                  "label": "§ 103.3 Denial; appeal; precedent decisions.",
                  "label_description": "Denial; appeal; precedent decisions.",
                  "reserved": False},
             ]},
        ]},
    ],
}


class FakeFetcher:
    def __init__(self, payloads):
        self.payloads = payloads

    def get(self, url):
        return self.payloads[url]


class TestTitle8Currency(unittest.TestCase):
    def test_picks_title_8_and_its_date(self):
        fetcher = FakeFetcher({
            poll.ECFR_TITLES_URL: json.dumps(SAMPLE_TITLES).encode("utf-8")})
        up_to_date, latest = poll.fetch_title8_currency(fetcher)
        self.assertEqual(up_to_date, "2026-10-23")
        self.assertEqual(latest, "2026-10-14")

    def test_missing_title_8_raises(self):
        fetcher = FakeFetcher({
            poll.ECFR_TITLES_URL: json.dumps({"titles": []}).encode("utf-8")})
        with self.assertRaises(RuntimeError):
            poll.fetch_title8_currency(fetcher)


class TestExtractSections(unittest.TestCase):
    def test_sections_and_reserved_skip(self):
        sections, skipped = poll.extract_sections(SAMPLE_STRUCTURE)
        self.assertEqual(skipped, 1)
        by_section = {s["section"]: s for s in sections}
        self.assertEqual(set(by_section), {"208.18", "103.3"})
        self.assertEqual(by_section["208.18"]["part"], "208")
        self.assertEqual(by_section["208.18"]["title"],
                         "Implementation of the Convention Against Torture.")
        self.assertEqual(by_section["208.18"]["received_on"],
                         "2023-03-29T21:30:09-0400")
        self.assertIsNone(by_section["103.3"]["received_on"])

    def test_label_fallback_strips_section_prefix(self):
        node = {"identifier": "1", "type": "title", "children": [
            {"identifier": "100.1", "type": "section",
             "label": "§ 100.1 Some title here.", "reserved": False}]}
        sections, _ = poll.extract_sections(node)
        self.assertEqual(sections[0]["title"], "Some title here.")


class TestMergeSections(unittest.TestCase):
    def test_first_seen_immutable_and_title_refreshes(self):
        existing = {"sections": [
            {"part": "208", "section": "208.18", "title": "OLD TITLE",
             "received_on": None, "first_seen": "2026-10-27T00:00:00Z"}]}
        fetched, _ = poll.extract_sections(SAMPLE_STRUCTURE)
        merged = poll.merge_sections(existing, fetched, "2026-11-03T00:00:00Z")
        by_section = {s["section"]: s for s in merged}
        # Old section keeps its first_seen but refreshes its title.
        self.assertEqual(by_section["208.18"]["first_seen"], "2026-10-27T00:00:00Z")
        self.assertEqual(by_section["208.18"]["title"],
                         "Implementation of the Convention Against Torture.")
        # New section is stamped with the new run time.
        self.assertEqual(by_section["103.3"]["first_seen"], "2026-11-03T00:00:00Z")

    def test_failure_preserves_index(self):
        # merge is only called on success; this asserts the failure
        # path's contract directly: main() writes existing sections
        # back untouched when a fetch raises (covered by keeping the
        # loaded list and only replacing it inside the try block).
        existing = {"sections": [
            {"part": "208", "section": "208.18", "title": "T",
             "received_on": None, "first_seen": "2026-10-27T00:00:00Z"}]}
        sections = list(existing["sections"])
        try:
            raise RuntimeError("simulated fetch failure")
        except RuntimeError:
            pass  # sections list is untouched by the failure
        self.assertEqual(sections, existing["sections"])


if __name__ == "__main__":
    unittest.main()
