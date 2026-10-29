"""Tests for scripts/bia_snapshot_poll.py pairing (stdlib only, no network).

Run: python3 -m unittest discover -s scripts/tests -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bia_snapshot_poll import parse_volume_entries

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


if __name__ == "__main__":
    unittest.main()
