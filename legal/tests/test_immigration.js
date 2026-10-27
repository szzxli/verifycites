// Node tests for immigration source routing (legal app, display-only).
// Run: node tests/test_immigration.js
// Guarantees: every extracted row is routed to at most one source line
// by pattern, and NO immigration row is ever rendered as checked or
// verified — BIA and INA rows always say "not yet connected" with
// manual links, because no live lookup for them exists in this
// page. 8 CFR rows say "not yet connected" UNLESS they exactly match
// the static eCFR Title 8 index (see test_imm8cfr.js for the matched
// case); an unmatched 8 CFR row keeps the old wording. Unclassifiable
// rows stay "unknown" and are never forced into a category. No live
// lookup is performed by any of these tests.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildHealthReport, healthReportMarkdown, immClassifyRow,
  immSourceLine, immLinkKeysFor, IMM_MANUAL_URLS } = require("../report.js");
const { I18N } = require("../i18n.js");

// (a) Classification, one example per type, plus the near-miss guards.
assert.strictEqual(immClassifyRow(
  { text: "30 I&N Dec. 185", caseName: "Matter of MERCADER", reporter: null }), "bia",
  "Matter of + I&N Dec. must route to BIA");
assert.strictEqual(immClassifyRow(
  { text: "30 I&N Dec. 185", caseName: null, reporter: null }), "bia",
  "I&N Dec. text alone must route to BIA");
assert.strictEqual(immClassifyRow(
  { text: "347 U.S. 483", caseName: "Brown v. Board of Education", reporter: "U.S." }), "court",
  "federal reporter row must route to the court line");
assert.strictEqual(immClassifyRow(
  { text: "576 U.S. 644", caseName: "Obergefell v. Hodges", reporter: "U.S." }), "court",
  "U.S. Reports cite must NOT be misread as a U.S.C. statute cite");
assert.strictEqual(immClassifyRow(
  { text: "INA \u00a7 208", caseName: null, reporter: null }), "statute");
assert.strictEqual(immClassifyRow(
  { text: "8 U.S.C. \u00a7 1158", caseName: null, reporter: null }), "statute");
assert.strictEqual(immClassifyRow(
  { text: "8 CFR 208.18", caseName: null, reporter: null }), "regulation");
assert.strictEqual(immClassifyRow(
  { text: "8 C.F.R. \u00a7 208.18", caseName: null, reporter: null }), "regulation");
assert.strictEqual(immClassifyRow(
  { text: "Matter of D-ES- Inc. (AAO 2016)", caseName: "Matter of D-ES- Inc.", reporter: null }), "aao",
  "AAO parenthetical must win over the Matter of pattern");
assert.strictEqual(immClassifyRow(
  { text: "123 F.4th 456", caseName: null, reporter: null }), "unknown",
  "no pattern and no reporter must stay unknown, never forced");
assert.strictEqual(immClassifyRow({ text: "", caseName: "", reporter: null }), "unknown");
assert.strictEqual(immClassifyRow(null), "unknown");

// (b) Source lines: immigration rows never read as checked/verified.
const en = I18N.en;
for (const type of ["bia", "statute", "regulation"]) {
  const line = immSourceLine(type, en);
  assert.ok(line.includes("not yet connected"),
    type + " line must say not yet connected, got: " + line);
  assert.ok(!/was checked|has been verified|verified against/i.test(line),
    type + " line must never claim a check happened: " + line);
}
assert.ok(immSourceLine("aao", en).includes("manual check only"));
assert.ok(immSourceLine("aao", en).includes("bind only the parties"));
assert.ok(immSourceLine("aao", en).includes("may not be cited as authority"));
assert.ok(immSourceLine("court", en).includes("no live lookup"));
assert.ok(immSourceLine("statute", en).includes("does not yet map"));
assert.ok(immSourceLine("unknown", en).includes("Not identified"));

// (c) Manual links: present, correct, and only for routed types.
assert.deepStrictEqual(
  immLinkKeysFor("bia").map((l) => l.url),
  [IMM_MANUAL_URLS.biaDecisions, IMM_MANUAL_URLS.biaLibrary]);
assert.deepStrictEqual(
  immLinkKeysFor("statute").map((l) => l.url),
  [IMM_MANUAL_URLS.olrcTitle8, IMM_MANUAL_URLS.policyManual]);
assert.deepStrictEqual(
  immLinkKeysFor("regulation").map((l) => l.url), [IMM_MANUAL_URLS.ecfrTitle8]);
assert.strictEqual(immLinkKeysFor("aao")[0].url, IMM_MANUAL_URLS.aaoSearch);
assert.deepStrictEqual(immLinkKeysFor("court"), []);
assert.deepStrictEqual(immLinkKeysFor("unknown"), []);
assert.strictEqual(IMM_MANUAL_URLS.biaDecisions, "https://www.justice.gov/eoir/ag-bia-decisions");
assert.strictEqual(IMM_MANUAL_URLS.biaLibrary, "https://www.justice.gov/eoir/virtual-law-library");
assert.strictEqual(IMM_MANUAL_URLS.aaoSearch, "https://www.uscis.gov/about-us/directorates-and-program-offices/administrative-appeals-office-aao/aao-non-precedent-decisions");
assert.strictEqual(IMM_MANUAL_URLS.policyManual, "https://www.uscis.gov/policy-manual");
assert.strictEqual(IMM_MANUAL_URLS.ecfrTitle8, "https://www.ecfr.gov/current/title-8");
assert.strictEqual(IMM_MANUAL_URLS.olrcTitle8, "https://uscode.house.gov/download.html");

// (d) i18n: every new key exists in all three languages, sets identical.
const immKeys = Object.keys(en).filter((k) => k.startsWith("imm"));
assert.ok(immKeys.length >= 19, "expected 19+ imm keys, got " + immKeys.length);
for (const lang of ["es", "zh"]) {
  for (const k of immKeys) {
    assert.ok(I18N[lang][k], "missing " + lang + "." + k);
  }
  assert.deepStrictEqual(
    Object.keys(I18N[lang]).filter((k) => k.startsWith("imm")).sort(),
    immKeys.slice().sort(), "imm key sets must match across languages");
}
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.immSectionTitle),
  "Spanish subsection title must contain no Chinese characters");
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.en.immSectionTitle),
  "English subsection title must contain no Chinese characters");

// (e) Report integration: buildHealthReport carries immType, and the
// Markdown download carries the source line (never a verified claim).
const report = buildHealthReport([
  { text: "347 U.S. 483", caseName: "Brown v. Board of Education", reporter: "U.S.", year: "1954" },
  { text: "30 I&N Dec. 185", caseName: "Matter of MERCADER", reporter: null, year: "2026" },
  { text: "INA \u00a7 208", caseName: null, reporter: null, year: null },
  { text: "8 CFR 208.18", caseName: null, reporter: null, year: null },
]);
assert.deepStrictEqual(report.rows.map((r) => r.immType),
  ["court", "bia", "statute", "regulation"]);
const md = healthReportMarkdown(report, en, null, "2026-10-27");
assert.ok(md.includes("BIA precedent \u2014 not yet connected"));
assert.ok(md.includes("INA provision \u2014 not yet connected"));
assert.ok(md.includes("8 CFR provision (eCFR) \u2014 not yet connected"));
assert.ok(md.includes("https://www.justice.gov/eoir/ag-bia-decisions"));
assert.ok(md.includes("https://www.ecfr.gov/current/title-8"));
assert.ok(!/BIA precedent.*verified/i.test(md));

// (f) Page wiring: subsection anchor, checker link, all six manual
// links, and the on-page source-line hook must exist in the page.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(html.includes('id="immigration"'), "subsection anchor missing");
assert.ok(html.includes('href="#immigration"'), "checker-area link missing");
for (const url of Object.values(IMM_MANUAL_URLS)) {
  assert.ok(html.includes(url), "manual link missing from page: " + url);
}
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.ok(appSrc.includes("immHtml"), "on-page source-line hook missing");
assert.ok(appSrc.includes("immClassifyRow") && appSrc.includes("immSourceLine"));

console.log("immigration routing tests passed");
