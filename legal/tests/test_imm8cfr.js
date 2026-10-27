// Node tests for the 8 CFR static-index match (legal app, display-only).
// Run: node tests/test_imm8cfr.js
// Guarantees: a regulation row whose section EXACTLY matches the static
// eCFR Title 8 index shows a "Found in eCFR Title 8" line with the
// section title and index-level currency signals, and stops saying
// "not yet connected". An unmatched regulation row keeps the old
// wording — absence from the index is never worded as "not found".
// Non-regulation rows never match. No per-section "last amended"
// claim is ever made (eCFR publishes no such field); the line cites
// index up-to-date time and last-poll time, both labelled as index
// times. No live lookup is performed by any of these tests.
const assert = require("assert");

const { buildHealthReport, healthReportMarkdown, immClassifyRow,
  immSourceLine, imm8cfrNormalizeSection, imm8cfrFind,
  imm8cfrFoundText } = require("../report.js");
const { I18N } = require("../i18n.js");

const SAMPLE_INDEX = {
  sections: [
    { part: "208", section: "208.18",
      title: "Implementation of the Convention Against Torture.",
      received_on: "2023-03-29T21:30:09-0400",
      first_seen: "2026-10-27T22:54:35Z" },
    { part: "103", section: "103.3",
      title: "Denials, appeals, and precedent decisions.",
      received_on: "2024-04-02T19:50:09-0400",
      first_seen: "2026-10-27T22:54:35Z" },
  ],
  meta: { last_poll: "2026-10-27T22:54:45Z", up_to_date_as_of: "2026-10-23",
    title_latest_amended_on: "2026-10-14", status: "ok" },
};

const cfrRow = (text, page) => ({ text, caseName: null, reporter: "8 CFR",
  volume: null, page, year: null });

// (a) Section normalisation: subsections strip, plain sections pass.
assert.strictEqual(imm8cfrNormalizeSection(cfrRow("8 CFR 208.18", "208.18")), "208.18");
assert.strictEqual(imm8cfrNormalizeSection(cfrRow("8 CFR § 103.3(c)", "103.3(c)")), "103.3");
assert.strictEqual(imm8cfrNormalizeSection(cfrRow("8 CFR 208.18(a)(1)", "208.18(a)(1)")), "208.18");
assert.strictEqual(imm8cfrNormalizeSection({ text: "8 C.F.R. § 208.18", page: null }), "208.18",
  "text fallback must handle the C.F.R. spelling");

// (b) Exact match: title + index-level currency signals, no "not yet connected".
const hit = imm8cfrFind(SAMPLE_INDEX, cfrRow("8 CFR 208.18", "208.18"));
assert.ok(hit && hit.entry.title === "Implementation of the Convention Against Torture.");
const foundEn = immSourceLine("regulation", I18N.en, cfrRow("8 CFR 208.18", "208.18"), hit);
assert.ok(foundEn.includes("Found in eCFR Title 8"), "found line, got: " + foundEn);
assert.ok(foundEn.includes("Implementation of the Convention Against Torture."));
assert.ok(foundEn.includes("2026-10-23"), "index up-to-date date must appear");
assert.ok(foundEn.includes("2026-10-27T22:54:45Z"), "index last-poll time must appear");
assert.ok(!foundEn.includes("not yet connected"),
  "matched row must stop saying not yet connected, got: " + foundEn);
assert.ok(!/last amended/i.test(foundEn),
  "no per-section last-amended claim may appear, got: " + foundEn);

// (c) Subsection row matches its parent section.
const subHit = imm8cfrFind(SAMPLE_INDEX, cfrRow("8 CFR § 103.3(c)", "103.3(c)"));
assert.ok(subHit && subHit.entry.section === "103.3");

// (d) Unmatched regulation row keeps the old wording, never "not found".
const miss = imm8cfrFind(SAMPLE_INDEX, cfrRow("8 CFR 999.99", "999.99"));
assert.strictEqual(miss, null);
const missLine = immSourceLine("regulation", I18N.en, cfrRow("8 CFR 999.99", "999.99"), miss);
assert.ok(missLine.includes("not yet connected"), "unmatched row keeps old wording");
assert.ok(!/not found|does not exist/i.test(missLine),
  "absence must never be worded as not found, got: " + missLine);

// (e) Non-regulation rows never match, even with a section-like number.
assert.strictEqual(imm8cfrFind(SAMPLE_INDEX,
  { text: "30 I&N Dec. 185", caseName: "Matter of MERCADER", reporter: "I&N Dec." }), null,
  "BIA row must not match the CFR index");
assert.strictEqual(imm8cfrFind(SAMPLE_INDEX,
  { text: "INA § 208", caseName: null, reporter: "INA" }), null,
  "INA row must not match the CFR index");
assert.strictEqual(imm8cfrFind(SAMPLE_INDEX,
  { text: "347 U.S. 483", caseName: "Brown v. Board of Education", reporter: "U.S." }), null,
  "court row must not match the CFR index");

// (f) Markdown download carries the found line when the finder is passed.
const report = buildHealthReport([
  { text: "8 CFR 208.18", caseName: null, reporter: "8 CFR", volume: null,
    page: "208.18", year: null, label: "NOT_CHECKED" },
  { text: "8 CFR 999.99", caseName: null, reporter: "8 CFR", volume: null,
    page: "999.99", year: null, label: "NOT_CHECKED" },
]);
const md = healthReportMarkdown(report, I18N.en, {}, "2026-10-27",
  null, (row) => imm8cfrFind(SAMPLE_INDEX, row));
assert.ok(md.includes("Found in eCFR Title 8"));
assert.ok(md.includes("Implementation of the Convention Against Torture."));
assert.ok(md.includes("8 CFR provision (eCFR) — not yet connected"),
  "unmatched row in the same download keeps the old wording");
// Without the finder, the old behaviour is preserved exactly.
const mdOld = healthReportMarkdown(report, I18N.en, {}, "2026-10-27");
assert.ok(!mdOld.includes("Found in eCFR Title 8"));
assert.ok(mdOld.includes("8 CFR provision (eCFR) — not yet connected"));

// (g) i18n: the new key exists in all three languages, titles untranslated.
for (const lang of ["en", "es", "zh"]) {
  assert.ok(I18N[lang].imm8cfrFound, "imm8cfrFound missing in " + lang);
  assert.ok(I18N[lang].imm8cfrFound.includes("{title}"), "title placeholder in " + lang);
  assert.ok(I18N[lang].imm8cfrFound.includes("{upToDate}"), "upToDate placeholder in " + lang);
  assert.ok(I18N[lang].imm8cfrFound.includes("{lastPoll}"), "lastPoll placeholder in " + lang);
}
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.imm8cfrFound), "no Chinese in the Spanish line");

// (h) The subsection no longer claims "no 8 CFR lookup": it names the
// static index instead, in all three languages, and the old phrasing is gone.
for (const lang of ["en", "es", "zh"]) {
  const s = I18N[lang].immSectionNotCovered;
  assert.ok(!/no live BIA, INA, or 8 CFR|BIA, INA ni 8 CFR|BIA、INA、8 CFR 的实时查询/.test(s),
    "old no-8CFR-lookup phrasing must be gone in " + lang);
}
assert.ok(I18N.en.immSectionNotCovered.includes("static eCFR Title 8 index"));
assert.ok(I18N.es.immSectionNotCovered.includes("índice estático del Título 8 de eCFR"));
assert.ok(I18N.zh.immSectionNotCovered.includes("eCFR 第 8 编静态索引"));

console.log("8 CFR static-index match tests passed");
