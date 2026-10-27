"""Unit tests for scripts/imm-ina-mapping-poll.py (stdlib only, no network).

Run from scripts/:  python3 -m unittest tests.test_imm_ina_mapping_poll -v

The poller file name contains hyphens, so it is loaded by path rather
than by a plain import.
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_POLLER = os.path.join(_HERE, "..", "imm-ina-mapping-poll.py")


def load_poller():
    spec = importlib.util.spec_from_file_location("imm_ina_mapping_poll", _POLLER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


poll = load_poller()

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0" identifier="/us/usc/t8">
  <main>
    <title>
      <section identifier="/us/usc/t8/s1101">
        <heading>Definitions</heading>
        <sourceCredit>(June 27, 1952, ch. 477, title I, \u00a7 101, 66 Stat. 166;
          Pub. L. 85\u2013316, \u00a7\u00a71, 2, Sept. 11, 1957, 71 Stat. 639.)</sourceCredit>
        <notes><note topic="shortTitle"><heading>Short Title</heading>
          <content><p>Act June 27, 1952, ch. 477, \u00a7 1, 66 Stat. 163.</p></content>
          <section identifier="/us/usc/t8/s9999">
            <heading>Quoted section inside a note</heading>
            <sourceCredit>(June 27, 1952, ch. 477, title I, \u00a7 999, 66 Stat. 1.)</sourceCredit>
          </section>
        </note></notes>
      </section>
      <section identifier="/us/usc/t8/s1158">
        <heading>Asylum</heading>
        <sourceCredit>(June 27, 1952, ch. 477, title II, ch. 1, \u00a7 208, as added
          Pub. L. 96\u2013212, title II, \u00a7 201(b), Mar. 17, 1980, 94 Stat. 105.)</sourceCredit>
      </section>
      <section identifier="/us/usc/t8/s1227">
        <heading>Deportable aliens</heading>
        <sourceCredit>(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 237,
          formerly ch. 5, \u00a7 241, 66 Stat. 204.)</sourceCredit>
      </section>
      <section identifier="/us/usc/t8/s1229b">
        <heading>Cancellation of removal; adjustment of status</heading>
        <sourceCredit>(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 240A, as added
          Pub. L. 104\u2013208, div. C, title III, \u00a7 304(a)(3), Sept. 30, 1996.)</sourceCredit>
      </section>
      <section identifier="/us/usc/t8/s1353d">
        <heading>Disposition of money received as extra compensation</heading>
        <sourceCredit>(Aug. 22, 1940, ch. 688, 54 Stat. 858;
          June 27, 1952, ch. 477, title IV, \u00a7 402(i)(2), 66 Stat. 278.)</sourceCredit>
      </section>
      <section identifier="/us/usc/t8/s1401b">
        <heading>Repealed. Pub. L. 92\u2013584, \u00a7 2, Oct. 27, 1972, 86 Stat. 1377.</heading>
        <sourceCredit>(June 27, 1952, ch. 477, title III, ch. 1, \u00a7 301, 66 Stat. 235.)</sourceCredit>
      </section>
      <section identifier="/us/usc/t8/s9998">
        <heading>No source credit at all</heading>
      </section>
    </title>
  </main>
</uscDoc>
"""

SAMPLE_PAGE = """
<html><body>
<p>The United States Code Online is current through Public Law 119-134
(October 20, 2026).</p>
<a href="download/releasepoints/us/pl/119/134/xml_usc08@119-134.zip">[XML]</a>
</body></html>
"""


class TestExtractMappings(unittest.TestCase):
    def test_strict_first_segment_rule(self):
        entries, stats = poll.extract_mappings(SAMPLE_XML.encode("utf-8"))
        by_ina = {e["ina"]: e["usc"] for e in entries}
        self.assertEqual(by_ina, {"101": "1101", "208": "1158",
                                  "237": "1227", "240A": "1229b"})
        # 237, not the "formerly" 241, is the current INA number.
        self.assertEqual(by_ina["237"], "1227")
        # 240A kept whole: never collapsed onto 240.
        self.assertEqual(by_ina["240A"], "1229b")
        # Later-only ch. 477 citation (1353d) and the repealed section
        # and the quoted section inside a note are all excluded.
        self.assertNotIn("402", by_ina)
        self.assertNotIn("301", by_ina)
        self.assertNotIn("999", by_ina)
        self.assertEqual(stats["skipped_repealed"], 1)
        self.assertEqual(stats["conflicts"], [])
        # Entries are sorted by INA number, letter suffix last.
        self.assertEqual([e["ina"] for e in entries],
                         ["101", "208", "237", "240A"])
        # Evidence is the source's own first citation segment.
        ev208 = [e for e in entries if e["ina"] == "208"][0]
        self.assertIn("June 27, 1952, ch. 477", ev208["evidence"])
        self.assertIn("\u00a7 208", ev208["evidence"])

    def test_empty_xml_yields_no_entries(self):
        entries, _ = poll.extract_mappings(
            b'<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"/>')
        self.assertEqual(entries, [])


class TestDownloadPage(unittest.TestCase):
    def test_release_point_and_zip_derived_from_page(self):
        rel = poll.parse_download_page(SAMPLE_PAGE.encode("utf-8"))
        self.assertEqual(rel["current_through_pl"], "119-134")
        self.assertEqual(rel["release_point"], "Public Law 119-134")
        self.assertEqual(rel["current_through_date"], "2026-10-20")
        self.assertEqual(rel["zip_url"],
                         "https://uscode.house.gov/download/releasepoints/"
                         "us/pl/119/134/xml_usc08@119-134.zip")

    def test_mismatched_zip_is_rejected(self):
        page = SAMPLE_PAGE.replace("xml_usc08@119-134", "xml_usc08@119-133")
        with self.assertRaises(RuntimeError):
            poll.parse_download_page(page.encode("utf-8"))

    def test_missing_marker_is_rejected(self):
        with self.assertRaises(RuntimeError):
            poll.parse_download_page(b"<html></html>")


class TestMainPreservation(unittest.TestCase):
    def _run(self, tmp, xml_text, prefill=None):
        xml_path = os.path.join(tmp, "usc08.xml")
        with open(xml_path, "w", encoding="utf-8") as fh:
            fh.write(xml_text)
        index_path = os.path.join(tmp, "imm-ina-mapping.json")
        if prefill is not None:
            with open(index_path, "w", encoding="utf-8") as fh:
                json.dump(prefill, fh)
        rc = poll.main(["--index", index_path, "--xml", xml_path,
                        "--release-point", "Public Law 119-134"])
        with open(index_path, encoding="utf-8") as fh:
            return rc, json.load(fh)

    def test_success_rebuilds_and_zero_entries_preserves(self):
        with tempfile.TemporaryDirectory() as tmp:
            rc, doc = self._run(tmp, SAMPLE_XML)
            self.assertEqual(rc, 0)
            self.assertEqual(doc["meta"]["status"], "ok")
            self.assertEqual(len(doc["entries"]), 4)
            self.assertEqual(doc["meta"]["current_through_pl"], "119-134")
            # A later run that parses to zero entries must NOT wipe.
            rc2, doc2 = self._run(
                tmp, '<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"/>',
                prefill=doc)
            self.assertEqual(rc2, 0)
            self.assertEqual(doc2["meta"]["status"], "error")
            self.assertEqual(len(doc2["entries"]), 4)
            self.assertEqual(doc2["meta"]["current_through_pl"], "119-134")

    def test_unreadable_existing_aborts(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_path = os.path.join(tmp, "imm-ina-mapping.json")
            with open(index_path, "w", encoding="utf-8") as fh:
                fh.write("{not json")
            xml_path = os.path.join(tmp, "usc08.xml")
            with open(xml_path, "w", encoding="utf-8") as fh:
                fh.write(SAMPLE_XML)
            rc = poll.main(["--index", index_path, "--xml", xml_path])
            self.assertEqual(rc, 2)
            with open(index_path, encoding="utf-8") as fh:
                self.assertEqual(fh.read(), "{not json")


if __name__ == "__main__":
    unittest.main()
