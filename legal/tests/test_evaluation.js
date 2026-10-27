// Phase 3 evaluation set — LEGAL domain (browser extractor + structure
// checks only). No network. Run: node tests/test_evaluation.js
//
// DATASET: synthetic fixtures written for this file (not a live
// CourtListener benchmark — the live fetch path needs a user token and
// is not run here). Size: set A = 3 known citations + 2 decoy lines;
// set B = 6 labelled rows for structure flags.
// MEASURED: extraction precision/recall on set A; per-row structure-flag
// exactness on set B. Human-review agreement is NOT RUN (it needs at
// least two independent human reviewers marking the same rows; no such
// data exists in this repo) — it is recorded as not-run, not as a number.
// Any PRD-style metric threshold (e.g. "100% mapping accuracy") is a
// SUGGESTED TARGET, not a result; the numbers below are what was
// actually measured on these fixtures. Legal and papers results are
// reported separately — there is no blended score.
const assert = require("assert");
const { extractCitations, REPORTERS } = require("../extract.js");
global.REPORTERS = REPORTERS;
const { buildHealthReport } = require("../report.js");

// ---- Set A: extraction. Known citations must be found; decoy lines
// that look numeric but carry no reporter must NOT be extracted.
const textA = "Brown v. Board of Education, 347 U.S. 483 (1954). "
  + "Obergefell v. Hodges, 576 U.S. 644 (2015). "
  + "Roe v. Wade, 410 U.S. 113 (1973). "
  + "About 12,000 students attended the hearing, see page 483 of the record.";
const foundA = extractCitations(textA);
const foundTexts = foundA.map(function (r) { return r.text; });
assert.strictEqual(foundA.length, 3, "set A: exactly 3 citations extracted, got " + JSON.stringify(foundTexts));
assert.ok(foundTexts.some(function (s) { return s.indexOf("347 U.S. 483") >= 0; }), "Brown found");
assert.ok(foundTexts.some(function (s) { return s.indexOf("576 U.S. 644") >= 0; }), "Obergefell found");
assert.ok(foundTexts.some(function (s) { return s.indexOf("410 U.S. 113") >= 0; }), "Roe found");
assert.ok(!foundTexts.some(function (s) { return /12,000|page 483/.test(s); }), "decoy lines not extracted");
// Measured set A: precision 3/3, recall 3/3 on this fixture set.

// ---- Set B: structure flags on labelled rows.
const labelled = [
  { row: { text: "347 U.S. 483", volume: "347", reporter: "U.S.", page: "483", caseName: "Brown v. Board of Education", year: "1954" }, flags: [] },
  { row: { text: "347 U.S. 483", volume: "347", reporter: "U.S.", page: "483", caseName: "Brown v. Board of Education", year: "1954" }, flags: ["duplicate"] },
  { row: { text: "123 F.3d 456", volume: "123", reporter: "F.3d", page: "456", caseName: "Smith v. Jones", year: null }, flags: ["missingYear"] },
  { row: { text: "576 U.S. 644", volume: "576", reporter: "U.S.", page: "644", caseName: null, year: null }, flags: ["missingYear", "noCaseName"] },
  { row: { text: "1 X.Y. 2", volume: "1", reporter: "X.Y.", page: "2", caseName: null, year: null }, flags: ["missingYear", "noCaseName", "invalidReporter"] },
  { row: { text: "410 U.S. 113", volume: "410", reporter: "U.S.", page: "113", caseName: "Roe v. Wade", year: "1973" }, flags: [] },
];
const reportB = buildHealthReport(labelled.map(function (l) { return l.row; }));
var exact = 0;
reportB.rows.forEach(function (row, i) {
  var want = labelled[i].flags.slice().sort();
  var got = (row.flags || []).slice().sort();
  assert.deepStrictEqual(got, want, "set B row " + i + ": flags " + JSON.stringify(got) + " != " + JSON.stringify(want));
  exact += 1;
});
assert.strictEqual(exact, 6, "set B: 6/6 rows flag-exact");
// Measured set B: structure-flag exactness 6/6 rows (no false-positive
// flags on the two clean rows, no missed flags on the four flagged rows).

// ---- NOT RUN (recorded, not measured): human-review agreement.
// A human status is a reader's own mark; agreement between reviewers
// cannot be computed from fixtures. Requires: >= 2 reviewers marking the
// same report rows independently, then agreement rate per row. No such
// data exists in this repo, so no number is claimed here.
// ---- NOT RUN: live CourtListener verification accuracy. The browser
// mode makes no lookup; the CLI path needs the user's own token and was
// not run in this environment.

console.log("legal evaluation: set A extraction 3/3 found, 0 false positives; "
  + "set B structure flags 6/6 rows exact; "
  + "human-review agreement NOT RUN; live CourtListener accuracy NOT RUN");
console.log("legal evaluation tests passed");
