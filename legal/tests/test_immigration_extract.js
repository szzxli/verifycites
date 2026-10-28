// Node tests for immigration-citation extraction (BIA / INA / 8 CFR).
// No network. Run: node tests/test_immigration_extract.js
// Guarantees: pasted immigration cites produce rows that route through
// immClassifyRow, carry no invented verification, and keep the rest of
// the pipeline (flags, standard format, re-verify) intact.
const assert = require("assert");
const { extractCitations, standardCitation } = require("../extract.js");
const { buildHealthReport, immClassifyRow, reverifyRow } = require("../report.js");

function flagsOf(text) {
  const rows = extractCitations(text);
  const rep = buildHealthReport(rows);
  return { rows, rep };
}

// (a) BIA with Matter of name + BIA year.
let { rows, rep } = flagsOf("Matter of MERCADER, 30 I&N Dec. 185 (BIA 2026).");
assert.strictEqual(rows.length, 1, JSON.stringify(rows));
assert.strictEqual(rows[0].text, "30 I&N Dec. 185");
assert.strictEqual(rows[0].volume, "30");
assert.strictEqual(rows[0].reporter, "I&N Dec.");
assert.strictEqual(rows[0].page, "185");
assert.strictEqual(rows[0].caseName, "Matter of MERCADER");
assert.strictEqual(rows[0].year, "2026");
assert.strictEqual(rows[0].manualUrl, "https://www.justice.gov/eoir/volume-30");
assert.strictEqual(immClassifyRow(rows[0]), "bia");
assert.strictEqual(rep.rows[0].immType, "bia");
assert.deepStrictEqual(rep.rows[0].flags, [], "BIA row with name+year has no flags");
assert.strictEqual(standardCitation(rows[0]), "Matter of MERCADER, 30 I&N Dec. 185 (BIA 2026)");

// (b) BIA anonymised form.
({ rows } = flagsOf("Matter of M-K-, 28 I&N Dec. 123 (BIA 2021)."));
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].caseName, "Matter of M-K-");
assert.strictEqual(rows[0].year, "2021");
assert.strictEqual(immClassifyRow(rows[0]), "bia");

// (c) BIA without year: row exists, missing-year flag fires (real defect
// for a BIA cite), no invalid-reporter flag.
({ rows, rep } = flagsOf("Matter of MERCADER, 30 I&N Dec. 185."));
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].year, null);
assert.ok(rep.rows[0].flags.includes("missingYear"), JSON.stringify(rep.rows[0].flags));
assert.ok(!rep.rows[0].flags.includes("invalidReporter"));
assert.strictEqual(immClassifyRow(rows[0]), "bia");

// (d) BIA without a Matter of name: row still exists and routes by the
// reporter alone; no-case-name flag fires.
({ rows, rep } = flagsOf("See 30 I&N Dec. 185 (BIA 2026)."));
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].caseName, null);
assert.strictEqual(immClassifyRow(rows[0]), "bia");
assert.ok(rep.rows[0].flags.includes("noCaseName"));

// (e) INA section + subsection: no missing-year, no no-case-name flag.
({ rows, rep } = flagsOf("Relief is available under INA § 208 and INA § 101(a)(15)(L)."));
assert.strictEqual(rows.length, 2, JSON.stringify(rows));
assert.strictEqual(rows[0].text, "INA § 208");
assert.strictEqual(rows[0].reporter, "INA");
assert.strictEqual(rows[0].page, "208");
assert.strictEqual(rows[0].year, null);
assert.strictEqual(rows[1].page, "101(a)(15)(L)");
assert.strictEqual(immClassifyRow(rows[0]), "statute");
assert.strictEqual(immClassifyRow(rows[1]), "statute");
assert.deepStrictEqual(rep.rows[0].flags, [], "INA rows carry no year/name flags");
assert.deepStrictEqual(rep.rows[1].flags, []);
assert.strictEqual(standardCitation(rows[0]), "INA § 208");
assert.strictEqual(standardCitation(rows[1]), "INA § 101(a)(15)(L)");

// (f) 8 CFR, both spellings + subsection letter; reporter normalised.
({ rows, rep } = flagsOf("See 8 CFR 208.18, 8 CFR § 103.3(c), and 8 C.F.R. § 103.3(c)."));
assert.strictEqual(rows.length, 3, JSON.stringify(rows));
assert.strictEqual(rows[0].page, "208.18");
assert.strictEqual(rows[1].page, "103.3(c)");
assert.strictEqual(rows[1].text, "8 CFR § 103.3(c)");
assert.strictEqual(rows[2].reporter, "8 CFR", "C.F.R. spelling normalises to 8 CFR");
assert.strictEqual(rows[2].text, "8 C.F.R. § 103.3(c)", "text keeps the spelling as written");
assert.ok(rows.every((r) => immClassifyRow(r) === "regulation"));
assert.ok(rep.rows.slice(0, 2).every((r) => r.flags.length === 0), JSON.stringify(rep.rows));
assert.deepStrictEqual(rep.rows[2].flags, ["duplicate"],
  "same section cited with both CFR spellings is one duplicate, not two cites");
assert.strictEqual(standardCitation(rows[0]), "8 CFR § 208.18");
assert.strictEqual(standardCitation(rows[1]), "8 CFR § 103.3(c)");
// Duplicate INA section is still caught.
({ rep } = flagsOf("INA § 208 applies. INA § 208 applies again."));
assert.ok(rep.rows[1].flags.includes("duplicate"));

// (g) Court-row guard: 576 U.S. 644 stays court, never statute.
({ rows, rep } = flagsOf("Obergefell v. Hodges, 576 U.S. 644 (2015)."));
assert.strictEqual(rows.length, 1);
assert.strictEqual(immClassifyRow(rows[0]), "court");
assert.strictEqual(rows[0].reporter, "U.S.");

// (h) Mixed text keeps text order; court + BIA + INA + CFR in one brief.
({ rows } = flagsOf(
  "Brown v. Board of Education, 347 U.S. 483 (1954). " +
  "Matter of MERCADER, 30 I&N Dec. 185 (BIA 2026). " +
  "See INA § 208; 8 CFR 208.18."));
assert.strictEqual(rows.length, 4, JSON.stringify(rows.map((r) => r.text)));
assert.deepStrictEqual(rows.map((r) => immClassifyRow(r)),
  ["court", "bia", "statute", "regulation"]);

// (i) Re-verify path: editing a row to an INA cite re-extracts it.
{
  const start = extractCitations("Brown v. Board of Education, 347 U.S. 483 (1954).");
  const out = reverifyRow(start, 0, "INA § 208", extractCitations);
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.row.reporter, "INA");
  assert.strictEqual(immClassifyRow(out.row), "statute");
}

// (j) All new rows stay browser-mode NOT_CHECKED with no invented check.
({ rows, rep } = flagsOf("Matter of MERCADER, 30 I&N Dec. 185 (BIA 2026). INA § 208. 8 CFR 208.18."));
assert.ok(rep.rows.every((r) => r.label === "NOT_CHECKED"));
assert.ok(rep.rows.every((r) => r.category === "cannotDetermine"));

console.log("immigration extraction tests passed");
