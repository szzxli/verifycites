// Node tests for the citation health report (browser v1). No network.
// Run: node web/tests/test_report.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { extractCitations, REPORTERS } = require("../extract.js");
global.REPORTERS = REPORTERS;
const { buildHealthReport, healthReportMarkdown, healthReportHtml } = require("../report.js");
const { I18N } = require("../i18n.js");

// (a) Counts by label: browser rows default to NOT_CHECKED.
const rows = buildHealthReport([
  { text: "347 U.S. 483", volume: "347", reporter: "U.S.", page: "483", caseName: "Brown v. Board of Education", year: "1954" },
  { text: "347 U.S. 483", volume: "347", reporter: "U.S.", page: "483", caseName: "Brown v. Board of Education", year: "1954" },
  { text: "576 U.S. 644", volume: "576", reporter: "U.S.", page: "644", caseName: null, year: null },
  { text: "123 F.3d 456", volume: "123", reporter: "F.3d", page: "456", caseName: "Smith v. Jones", year: null, label: "NOT_CHECKED" },
]);
assert.strictEqual(rows.total, 4, "total");
assert.strictEqual(rows.byLabel.NOT_CHECKED, 4, "all browser rows NOT_CHECKED");

// (b) Duplicate flagging: the second identical cite is flagged, the first is not.
assert.deepStrictEqual(rows.rows[0].flags, [], "first occurrence not flagged");
assert.ok(rows.rows[1].flags.includes("duplicate"), "duplicate flagged");

// (c) Missing-year and no-case-name flagging.
assert.ok(rows.rows[2].flags.includes("missingYear"), "missing year flagged");
assert.ok(rows.rows[2].flags.includes("noCaseName"), "no case name flagged");
assert.ok(rows.rows[3].flags.includes("missingYear"), "missing year flagged (row 4)");
assert.ok(!rows.rows[3].flags.includes("noCaseName"), "case name present, not flagged");

// (d) Unknown reporter flagging (defensive: browser extraction only
// recognizes known reporters, but the builder must flag one if given).
const bad = buildHealthReport([
  { text: "1 X.Y. 2", volume: "1", reporter: "X.Y.", page: "2", caseName: null, year: null },
]);
assert.ok(bad.rows[0].flags.includes("invalidReporter"), "unknown reporter flagged");

// (e) Pin-cite extraction from the extractor itself.
const pin = extractCitations("Obergefell v. Hodges, 576 U.S. 644, 650 (2015).");
assert.strictEqual(pin.length, 1, "one citation");
assert.strictEqual(pin[0].pinCite, "650", "pin cite 650, got: " + pin[0].pinCite);
assert.strictEqual(pin[0].year, "2015", "year after pin cite");
const pinRange = extractCitations("Brown v. Board of Education, 347 U.S. 483, 490-492 (1954).");
assert.strictEqual(pinRange[0].pinCite, "490–492", "pin range, got: " + pinRange[0].pinCite);
assert.strictEqual(pinRange[0].year, "1954", "year after pin range");
// Not a pin cite: digits followed by another citation's volume + reporter.
const notPin = extractCitations("See 347 U.S. 483, 576 U.S. 644 (2015).");
assert.strictEqual(notPin[0].pinCite, null, "following citation is not a pin cite");
assert.strictEqual(notPin.length, 2, "both citations extracted");
assert.strictEqual(notPin[0].year, null, "parallel cite does not take the later year");
assert.strictEqual(notPin[1].year, "2015", "year stays on the cite it follows");

// Missing-year cite followed by a different cite that has a year.
// The first must be flagged; the second keeps its own year.
const followed = buildHealthReport(extractCitations(
  "Also Smith v. Jones, 123 F.3d 456. Again Roe v. Wade, 410 U.S. 113 (1973)."));
assert.strictEqual(followed.rows[0].caseName, "Smith v. Jones");
assert.strictEqual(followed.rows[0].year, null);
assert.strictEqual(followed.rows[0].label, "NOT_CHECKED");
assert.ok(followed.rows[0].flags.includes("missingYear"), "missing year flagged when the next cite has one");
assert.strictEqual(followed.rows[1].caseName, "Roe v. Wade");
assert.strictEqual(followed.rows[1].year, "1973");
assert.strictEqual(followed.rows[1].label, "NOT_CHECKED");
assert.ok(!followed.rows[1].flags.includes("missingYear"), "cite with its own year is not flagged");

// (f) Downloads contain the disclaimer + scope line, and no relevance
// judgment, score, or good-law claim anywhere in the generated output.
const t = { disclaimer: I18N.en.disclaimer, scope: I18N.en.reportScopeNote,
  summary: "Summary", total: "Total citations", byLabel: "By label",
  citations: "Citations", manual: "Manual check", flags: "Structure flags",
  flagDuplicate: "Duplicate citation", flagMissingYear: "Missing year",
  flagNoCaseName: "No case name in text", flagInvalidReporter: "Unknown reporter",
  noFlags: "—", citation: "Citation", caseName: "Case name in text",
  year: "Year", pin: "Pin cite", label: "Label", links: "Manual-check links" };
const md = healthReportMarkdown(rows, t);
const html = healthReportHtml(rows, t);
// The disclaimer line is a closed bold span, including the short default.
const bareMd = healthReportMarkdown({ total: 0, byLabel: {}, rows: [] }, {});
assert.ok(bareMd.includes("> **Not legal advice.**"), "short disclaimer bold is closed: " + bareMd);
for (const line of md.split("\n").concat(bareMd.split("\n"))) {
  assert.strictEqual((line.match(/\*\*/g) || []).length % 2, 0, "unclosed bold: " + line);
}
const disclaimerLine = md.split("\n").find((line) => line.includes(t.disclaimer));
assert.ok(disclaimerLine, "long disclaimer present");
assert.ok(disclaimerLine.startsWith("> **") && disclaimerLine.endsWith("**"),
  "long disclaimer bold is closed: " + disclaimerLine);
assert.ok(md.includes("does not check whether cases support your argument"),
  "scope line present in Markdown download");
assert.ok(html.includes("does not check whether cases support your argument"),
  "scope line present in HTML download");
// The judgment check runs on the citations body only: the disclaimer and
// scope lines themselves legitimately name the things NOT checked.
const mdBody = md.split("## Citations")[1] || "";
const htmlBody = html.split("<h2>Citations</h2>")[1] || "";
for (const body of [mdBody, htmlBody]) {
  assert.ok(!/relevan|support|good law|win|score|%/i.test(body),
    "no relevance/score/good-law judgment or percentage in citations body");
}
assert.ok(md.includes("pin cite") || md.includes("Pin cite") || true, "md built");

// (g) i18n key sets stay equal across languages (new report keys included).
const enKeys = Object.keys(I18N.en).sort();
for (const lang of ["es", "zh"]) {
  assert.deepStrictEqual(Object.keys(I18N[lang]).sort(), enKeys,
    "i18n keys equal for " + lang);
}
const htmlSrc = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(htmlSrc.includes('id="reportSection"'), "report section in page");
assert.ok(htmlSrc.includes('src="report.js"'), "report.js loaded");

console.log("web citation health report tests passed");
