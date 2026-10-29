"""Tests for scripts/bia_snapshot_poll.py pairing (stdlib only, no network).

Run: python3 -m unittest discover -s scripts/tests -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import tempfile

from bia_snapshot_poll import (name_key, name_terms, parse_volume_entries,
                               tokenize, write_json)

PAGE = """
<div><p>ZETA, 30 I&N Dec. 203 (BIA 2026) <a href="/eoir/media/1/dl?inline">ID 4268</a></p>
<p>Holding cites R-K-K-, 26 I&N Dec. 658 (BIA 2015) and again
R-K-K-, 26 I&N Dec. 658 (BIA 2015), plus K-, 7 I&N Dec. 594 (BIA 1957).</p>
<p>YANG, 30 I&N Dec. 199 (BIA 2026) <a href="/eoir/media/2/dl?inline">ID 4267</a></p></div>
"""


class PairingTests(unittest.TestCase):
    def test_pairs_header_citations(self):
        entries, _gaps = parse_volume_entries(PAGE, page_volume=30)
        self.assertEqual([e["id"] for e in entries], [4268, 4267])
        self.assertEqual(entries[1]["display_name"], "Matter of YANG")

    def test_gap_citations_deduped(self):
        _entries, gaps = parse_volume_entries(PAGE, page_volume=30)
        details = [g["detail"] for g in gaps]
        self.assertEqual(len(details), len(set(details)))
        self.assertEqual(sum("26 I&N Dec. 658" in d for d in details), 1)
        self.assertEqual(len(gaps), 2)


# Shared with legal/tests/test_bia.js: the JS tokenizer must agree.
TOKEN_CASES = [
    ("K-Y-V-R", ["kyvr"]),
    ("K-Y-V-R-", ["kyvr"]),
    ("kyvr", ["kyvr"]),
    ("Matter of N-L-U-, 30 I&N Dec. 195", ["matter", "nlu", "dec", "195"]),
    ("M-K-", ["mk"]),
    ("self-employed e-mail", ["self", "employed", "mail"]),
    ("The Particular social-group of IJ", ["particular", "social", "group"]),
]


class TokenizerTests(unittest.TestCase):
    def test_initials_collapse(self):
        for text, want in TOKEN_CASES:
            self.assertEqual(tokenize(text), set(want), text)

    def test_name_key_and_terms(self):
        self.assertEqual(name_key("K-Y-V-R-"), "kyvr")
        self.assertEqual(name_key("MATA RODRIGUEZ"), "matarodriguez")
        self.assertEqual(name_terms("K-Y-V-R-"), {"kyvr"})
        self.assertEqual(name_terms("MATA RODRIGUEZ"),
                         {"mata", "rodriguez", "matarodriguez"})
        self.assertEqual(name_terms("CORNEJO-AGUILAR"),
                         {"cornejo", "aguilar", "cornejoaguilar"})


class CompactJsonTests(unittest.TestCase):
    def test_compact_has_no_indent(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.json")
            write_json(p, {"a": [1, 2], "b": {"c": 1}}, compact=True)
            raw = open(p, encoding="utf-8").read()
            self.assertEqual(raw, '{"a":[1,2],"b":{"c":1}}\n')
            self.assertEqual(json.loads(raw), {"a": [1, 2], "b": {"c": 1}})

    def test_published_files_are_compact(self):
        root = os.path.join(os.path.dirname(__file__), "..", "..", "data")
        for rel in ("bia-index.json", os.path.join("bia-search", "vol30.json")):
            raw = open(os.path.join(root, rel), encoding="utf-8").read()
            self.assertNotIn("\n ", raw, rel)
        idx = json.load(open(os.path.join(root, "bia-index.json"), encoding="utf-8"))
        vol = json.load(open(os.path.join(root, "bia-search", "vol30.json"), encoding="utf-8"))
        for e in idx["entries"]:
            self.assertEqual(e["name_key"], name_key(e["name"]))
            self.assertIn(e["id"], vol["terms"][e["name_key"]])


if __name__ == "__main__":
    unittest.main()
