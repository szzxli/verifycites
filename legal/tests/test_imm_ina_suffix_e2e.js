// Node tests for the INA / 8 U.S.C. letter-suffix fix (legal app,
// display-only). Run: node tests/test_imm_ina_suffix_e2e.js
//
// Regression: the live page misdirected lawyers for letter-suffixed
// sections — "INA § 240A" displayed as "INA § 240" and mapped to
// 8 U.S.C. § 1229a (should be 1229b); "8 U.S.C. § 1229b" displayed as
// "8 U.S.C. § 1229" and mirrored to INA § 239 (should be 240A).
// Root cause: the extractor's INA / 8 U.S.C. patterns captured only
// digits into the row's section field, dropping the trailing letter,
// so the matcher could only look up the truncated number — and the
// earlier unit tests missed it because they hand-built rows with full
// text intact instead of running the real extractor.
//
// These tests therefore run the REAL extractor -> buildHealthReport ->
// immSourceLine path with a mapping finder. No hand-built rows with
// pre-filled text are used for the bug cases: if the extractor ever
// drops the letter again, these tests fail.
const assert = require("assert");
const { extractCitations, standardCitation } = require("../extract.js");
const { buildHealthReport, immSourceLine, immInaFind,
  reverifyRow } = require("../report.js");
const { I18N } = require("../i18n.js");

// Small sample of the real mapping table (same pairs as the live
// data/imm-ina-mapping.json for the sections used here).
const SAMPLE_INDEX = {
  entries: [
    { ina: "208", usc: "1158" },
    { ina: "239", usc: "1229" },
    { ina: "240", usc: "1229a" },
    { ina: "240A", usc: "1229b" },
    { ina: "212", usc: "1182" },
    { ina: "101", usc: "1101" },
  ],
  meta: { last_poll: "2026-10-27T23:19:00Z", current_through_pl: "119-134",
    release_point: "Public Law 119-134", status: "ok" },
};

// Run the real path: extract, build the report, then resolve each
// report row's source line exactly as the page does (finder passed).
function e2e(text) {
  const rows = extractCitations(text);
  const report = buildHealthReport(rows);
  const lines = report.rows.map((r) =>
    immSourceLine(r.immType, I18N.en, r, null, immInaFind(SAMPLE_INDEX, r)));
  return { rows, report, lines };
}

// (a) The bug cases: suffixed sections display AND map with the letter.
{
  const { rows, lines } = e2e("Relief under INA \u00a7 240A.");
  assert.strictEqual(rows.length, 1, JSON.stringify(rows));
  assert.strictEqual(rows[0].text, "INA \u00a7 240A");
  assert.strictEqual(rows[0].page, "240A");
  assert.ok(lines[0].includes("INA \u00a7 240A maps to 8 U.S.C. \u00a7 1229b"),
    "INA 240A must map to 1229b, got: " + lines[0]);
  assert.ok(!lines[0].includes("1229a"), "must never fall back to 1229a: " + lines[0]);
}
{
  const { rows, lines } = e2e("See 8 U.S.C. \u00a7 1229b.");
  assert.strictEqual(rows.length, 1, JSON.stringify(rows));
  assert.strictEqual(rows[0].text, "8 U.S.C. \u00a7 1229b");
  assert.strictEqual(rows[0].page, "1229b");
  assert.ok(lines[0].includes("8 U.S.C. \u00a7 1229b maps to INA \u00a7 240A"),
    "1229b must mirror to INA 240A, got: " + lines[0]);
  assert.ok(!lines[0].includes("INA \u00a7 239"), "must never fall back to 239: " + lines[0]);
}

// (b) Distinctness: suffixed and unsuffixed are DIFFERENT sections.
{
  const { lines } = e2e("Proceedings under INA \u00a7 240.");
  assert.ok(lines[0].includes("INA \u00a7 240 maps to 8 U.S.C. \u00a7 1229a"),
    "plain 240 must still map to 1229a, got: " + lines[0]);
}
{
  const { lines } = e2e("See 8 U.S.C. \u00a7 1229.");
  assert.ok(lines[0].includes("8 U.S.C. \u00a7 1229 maps to INA \u00a7 239"),
    "plain 1229 must still map to 239, got: " + lines[0]);
}

// (c) Subsection parentheticals ride along on both sides.
{
  const { rows, lines } = e2e("Relief under INA \u00a7 240A(a).");
  assert.strictEqual(rows[0].page, "240A(a)");
  assert.ok(lines[0].includes("INA \u00a7 240A(a) maps to 8 U.S.C. \u00a7 1229b(a)"),
    "got: " + lines[0]);
}
{
  const { rows, lines } = e2e("See 8 U.S.C. \u00a7 1229b(a).");
  assert.strictEqual(rows[0].page, "1229b(a)");
  assert.ok(lines[0].includes("8 U.S.C. \u00a7 1229b(a) maps to INA \u00a7 240A(a)"),
    "got: " + lines[0]);
}

// (d) No regression on plain and parenthetical sections.
{
  const { lines } = e2e("Asylum under INA \u00a7 208.");
  assert.ok(lines[0].includes("INA \u00a7 208 maps to 8 U.S.C. \u00a7 1158"));
}
{
  const { rows, lines } = e2e("See INA \u00a7 212(a) and INA \u00a7 101(a)(15)(L).");
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].page, "212(a)");
  assert.strictEqual(rows[1].page, "101(a)(15)(L)");
  assert.ok(lines[0].includes("INA \u00a7 212(a) maps to 8 U.S.C. \u00a7 1182(a)"));
  assert.ok(lines[1].includes("INA \u00a7 101(a)(15)(L) maps to 8 U.S.C. \u00a7 1101(a)(15)(L)"));
}

// (e) Unmapped rows show the NEW wording in all three languages and
// never claim the section does not exist.
{
  const { lines } = e2e("See INA \u00a7 999.");
  assert.strictEqual(lines[0], I18N.en.immSourceStatute);
  assert.ok(lines[0].includes("not in the partial"));
  assert.ok(lines[0].includes("cannot be confirmed"));
  assert.ok(!/does not exist|not found/i.test(lines[0].replace("cannot be confirmed", "")));
  assert.ok(!lines[0].includes("does not yet map"));
  const row = extractCitations("INA \u00a7 999")[0];
  assert.ok(immSourceLine("statute", I18N.es, row).includes("tabla parcial"));
  assert.ok(immSourceLine("statute", I18N.zh, row).includes("\u90e8\u5206"));
  assert.ok(immSourceLine("statute", I18N.zh, row).includes("\u5bf9\u7167\u8868"));
  const uscRow = extractCitations("8 U.S.C. \u00a7 9999")[0];
  assert.strictEqual(
    immSourceLine("statute", I18N.en, uscRow, null, immInaFind(SAMPLE_INDEX, uscRow)),
    I18N.en.immSourceUsc);
  assert.ok(immSourceLine("statute", I18N.es, uscRow).includes("tabla parcial"));
  assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.immSourceStatute), "no Chinese in Spanish line");
  assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.immSourceUsc), "no Chinese in Spanish line");
}

// (f) Duplicates: 240 and 240A are different rows; true repeats flag.
{
  const { report } = e2e("INA \u00a7 240 and INA \u00a7 240A.");
  assert.strictEqual(report.rows.length, 2);
  assert.deepStrictEqual(report.rows.map((r) => r.flags), [[], []]);
  const dup = e2e("INA \u00a7 240A and INA \u00a7 240A.");
  assert.deepStrictEqual(dup.report.rows.map((r) => r.flags), [[], ["duplicate"]]);
}

// (g) Standard format renders the letter.
assert.strictEqual(standardCitation(extractCitations("INA \u00a7 240A")[0]), "INA \u00a7 240A");
assert.strictEqual(standardCitation(extractCitations("8 U.S.C. \u00a7 1229b")[0]),
  "8 U.S.C. \u00a7 1229b");

// (h) Re-verify / edit path preserves the letter.
{
  const rows0 = extractCitations("INA \u00a7 240.");
  const out = reverifyRow(rows0, 0, "INA \u00a7 240A.", extractCitations);
  assert.ok(out.changed);
  assert.strictEqual(out.row.page, "240A");
  const line = immSourceLine("statute", I18N.en, out.row, null,
    immInaFind(SAMPLE_INDEX, out.row));
  assert.ok(line.includes("INA \u00a7 240A maps to 8 U.S.C. \u00a7 1229b"), "got: " + line);
}

// (i) Guards: court rows stay court; 8 CFR extraction is untouched.
{
  const { rows, report } = e2e("576 U.S. 644.");
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].reporter, "U.S.");
  assert.strictEqual(report.rows[0].immType, "court");
}
{
  const { rows, report } = e2e("8 CFR 208.18.");
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].reporter, "8 CFR");
  assert.strictEqual(rows[0].page, "208.18");
  assert.strictEqual(report.rows[0].immType, "regulation");
}

console.log("INA suffix end-to-end tests passed");
