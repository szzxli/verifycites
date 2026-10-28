// Node tests for the INA <-> 8 U.S.C. static-mapping match (legal app,
// display-only). Run: node tests/test_imm_ina_mapping.js
// Guarantees: a statute row whose section EXACTLY matches the static
// OLRC Title 8 mapping table shows a mapping line naming both numbers
// plus the release-point currency and the index time, and stops saying
// "not yet connected" / "cannot be confirmed". An unmapped statute row
// keeps its NEW wording exactly — the section is not in the partial
// table and therefore cannot be confirmed; absence from a PARTIAL
// table is never worded as "does not exist" or "not found". Letter
// suffixes are honoured (INA 240A -> 1229b, never 1229a; 8 U.S.C.
// 1229b -> INA 240A, never 239), because the extractor captures the
// letter into the row's page field and the matcher reads it from
// there (text recovery survives only as a legacy fallback for
// hand-built rows). Number similarity alone never matches (INA 1158 is not INA 208's counterpart). Non-statute
// rows never match. No live lookup is performed by any of these tests.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildHealthReport, healthReportMarkdown, immClassifyRow,
  immSourceLine, immInaNormalizeSection, immInaFind,
  immInaMappingText } = require("../report.js");
const { I18N } = require("../i18n.js");

const SAMPLE_INDEX = {
  entries: [
    { ina: "101", usc: "1101", usc_title: "Definitions",
      evidence: "(June 27, 1952, ch. 477, title I, \u00a7 101, 66 Stat. 166" },
    { ina: "208", usc: "1158", usc_title: "Asylum",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 1, \u00a7 208, as added Pub. L. 96\u2013212" },
    { ina: "212", usc: "1182", usc_title: "Inadmissible aliens",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 2, \u00a7 212, 66 Stat. 182" },
    { ina: "237", usc: "1227", usc_title: "Deportable aliens",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 237, formerly ch. 5, \u00a7 241" },
    { ina: "239", usc: "1229", usc_title: "Initiation of removal proceedings",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 239, as added Pub. L. 104\u2013208" },
    { ina: "240", usc: "1229a", usc_title: "Removal proceedings",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 240, as added Pub. L. 104\u2013208" },
    { ina: "240A", usc: "1229b", usc_title: "Cancellation of removal; adjustment of status",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 240A, as added Pub. L. 104\u2013208" },
    { ina: "241", usc: "1231", usc_title: "Detention and removal of aliens ordered removed",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 4, \u00a7 241, as added and amended Pub. L. 104\u2013208" },
    { ina: "242", usc: "1252", usc_title: "Judicial review of orders of removal",
      evidence: "(June 27, 1952, ch. 477, title II, ch. 5, \u00a7 242, 66 Stat. 208" },
  ],
  meta: { last_poll: "2026-10-27T23:19:00Z", current_through_pl: "119-134",
    release_point: "Public Law 119-134", status: "ok" },
};

const inaRow = (text, page) => ({ text, caseName: null, reporter: "INA",
  volume: null, page, year: null });
const uscRow = (text, page) => ({ text, caseName: null, reporter: "8 U.S.C.",
  volume: null, page, year: null });

// (a) Section normalisation: subsections strip for lookup, letters kept.
assert.deepStrictEqual(
  immInaNormalizeSection(inaRow("INA \u00a7 212(a)", "212(a)")),
  { side: "ina", base: "212", suffix: "(a)" });
assert.deepStrictEqual(
  immInaNormalizeSection(inaRow("INA \u00a7 101(a)(15)(L)", "101(a)(15)(L)")),
  { side: "ina", base: "101", suffix: "(a)(15)(L)" });
assert.deepStrictEqual(
  immInaNormalizeSection(inaRow("INA \u00a7 240A", "240")),
  { side: "ina", base: "240A", suffix: "" },
  "legacy fallback: letter suffix recovered from row text when page carries none");
assert.deepStrictEqual(
  immInaNormalizeSection(uscRow("8 U.S.C. \u00a7 1229b", "1229")),
  { side: "usc", base: "1229b", suffix: "" });
assert.deepStrictEqual(
  immInaNormalizeSection(uscRow("8 U.S.C. \u00a7 1101(a)(15)(L)", "1101(a)(15)(L)")),
  { side: "usc", base: "1101", suffix: "(a)(15)(L)" });

// (b) Exact forward match: both numbers, PL currency, index time, and
// the old wording is gone.
const hit = immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 208", "208"));
assert.ok(hit && hit.entry.usc === "1158" && hit.counterpart === "1158");
const lineEn = immSourceLine("statute", I18N.en, inaRow("INA \u00a7 208", "208"), null, hit);
assert.ok(lineEn.includes("INA \u00a7 208 maps to 8 U.S.C. \u00a7 1158"), "got: " + lineEn);
assert.ok(lineEn.includes("P.L. 119-134"), "release-point currency must appear");
assert.ok(lineEn.includes("2026-10-27T23:19:00Z"), "index time must appear");
assert.ok(lineEn.includes("not a registry timestamp"));
assert.ok(!lineEn.includes("not yet connected"), "matched row stops saying not yet connected");
assert.ok(!lineEn.includes("cannot confirm"), "matched row stops saying cannot confirm");
assert.ok(!/good law|currently in effect/i.test(lineEn),
  "no good-law or in-effect verdict may appear, got: " + lineEn);
// Default template (no i18n) carries the same shape.
const lineDefault = immInaMappingText(hit, {});
assert.ok(lineDefault.includes("INA \u00a7 208 maps to 8 U.S.C. \u00a7 1158"));

// (c) Subsection suffixes are carried from the row's own text.
const sub = immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 212(a)", "212(a)"));
assert.strictEqual(immSourceLine("statute", I18N.en,
  inaRow("INA \u00a7 212(a)", "212(a)"), null, sub),
  "INA \u00a7 212(a) maps to 8 U.S.C. \u00a7 1182(a) (OLRC Title 8, current through P.L. 119-134; index time 2026-10-27T23:19:00Z, not a registry timestamp)");
const sub2 = immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 101(a)(15)(L)", "101(a)(15)(L)"));
assert.ok(immSourceLine("statute", I18N.en,
  inaRow("INA \u00a7 101(a)(15)(L)", "101(a)(15)(L)"), null, sub2)
  .includes("INA \u00a7 101(a)(15)(L) maps to 8 U.S.C. \u00a7 1101(a)(15)(L)"));

// (d) Letter-suffix guard: the false positives the page-field alone
// would produce must not happen.
const aHit = immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 240A", "240"));
assert.ok(aHit && aHit.entry.usc === "1229b" && aHit.counterpart === "1229b",
  "INA 240A must map to 1229b, got: " + JSON.stringify(aHit));
const plainHit = immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 240", "240"));
assert.ok(plainHit && plainHit.entry.usc === "1229a",
  "INA 240 must map to 1229a, got: " + JSON.stringify(plainHit));
const uscLetter = immInaFind(SAMPLE_INDEX, uscRow("8 U.S.C. \u00a7 1229b", "1229"));
assert.ok(uscLetter && uscLetter.counterpart === "240A" && uscLetter.side === "usc",
  "8 U.S.C. 1229b must map to INA 240A, got: " + JSON.stringify(uscLetter));
const uscPlain = immInaFind(SAMPLE_INDEX, uscRow("8 U.S.C. \u00a7 1229", "1229"));
assert.ok(uscPlain && uscPlain.counterpart === "239",
  "8 U.S.C. 1229 must map to INA 239, got: " + JSON.stringify(uscPlain));

// (e) Reverse match: mirror line, U.S.C. side first.
const rev = immInaFind(SAMPLE_INDEX, uscRow("8 U.S.C. \u00a7 1158", "1158"));
assert.ok(immSourceLine("statute", I18N.en,
  uscRow("8 U.S.C. \u00a7 1158", "1158"), null, rev)
  .includes("8 U.S.C. \u00a7 1158 maps to INA \u00a7 208"));
const revSub = immInaFind(SAMPLE_INDEX, uscRow("8 U.S.C. \u00a7 1182(a)", "1182(a)"));
assert.ok(immSourceLine("statute", I18N.en,
  uscRow("8 U.S.C. \u00a7 1182(a)", "1182(a)"), null, revSub)
  .includes("8 U.S.C. \u00a7 1182(a) maps to INA \u00a7 212(a)"));

// (f) Unmapped rows keep the NEW wording exactly.
assert.strictEqual(immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 999", "999")), null);
const missLine = immSourceLine("statute", I18N.en, inaRow("INA \u00a7 999", "999"), null, null);
assert.strictEqual(missLine, I18N.en.immSourceStatute,
  "unmapped INA row must keep the new line verbatim, got: " + missLine);
assert.ok(missLine.includes("not in the partial"));
assert.ok(missLine.includes("cannot be confirmed"));
assert.ok(!/does not exist|not found/i.test(missLine.replace("cannot be confirmed", "")),
  "absence must never be worded as not found / does not exist");
assert.ok(!missLine.includes("does not yet map"),
  "the mapping table exists now, so 'does not yet map' would be false");
assert.strictEqual(immInaFind(SAMPLE_INDEX, uscRow("8 U.S.C. \u00a7 9999", "9999")), null);
assert.strictEqual(
  immSourceLine("statute", I18N.en, uscRow("8 U.S.C. \u00a7 9999", "9999"), null, null),
  I18N.en.immSourceUsc, "unmapped U.S.C. row must keep the old U.S.C. line verbatim");

// (g) Number similarity alone never matches.
assert.strictEqual(immInaFind(SAMPLE_INDEX, inaRow("INA \u00a7 1158", "1158")), null,
  "INA 1158 is not an INA key just because 1158 is a U.S.C. number");
assert.strictEqual(immInaFind(SAMPLE_INDEX, uscRow("8 U.S.C. \u00a7 208", "208")), null,
  "8 U.S.C. 208 is not a U.S.C. value just because 208 is an INA number");

// (h) Non-statute rows never match, even with a section-like number,
// and a mapping object passed for a regulation row changes nothing.
assert.strictEqual(immInaFind(SAMPLE_INDEX,
  { text: "30 I&N Dec. 185", caseName: "Matter of MERCADER", reporter: "I&N Dec." }), null,
  "BIA row must not match the mapping table");
assert.strictEqual(immInaFind(SAMPLE_INDEX,
  { text: "8 CFR 208.18", caseName: null, reporter: "8 CFR", page: "208.18" }), null,
  "8 CFR row must not match the mapping table");
assert.strictEqual(immInaFind(SAMPLE_INDEX,
  { text: "347 U.S. 483", caseName: "Brown v. Board of Education", reporter: "U.S." }), null,
  "court row must not match the mapping table");
assert.ok(immSourceLine("regulation", I18N.en,
  { text: "8 CFR 208.18", reporter: "8 CFR", page: "208.18" }, null, hit)
  .includes("8 CFR provision (eCFR) \u2014 not yet connected"),
  "mapping object must be ignored for regulation rows");

// (i) i18n: the new keys exist in all three languages with identical
// placeholder sets; Spanish carries no Chinese characters.
for (const lang of ["en", "es", "zh"]) {
  for (const key of ["immInaFound", "immInaFoundReverse"]) {
    assert.ok(I18N[lang][key], key + " missing in " + lang);
    for (const ph of ["{ina}", "{usc}", "{pl}", "{lastPoll}"]) {
      assert.ok(I18N[lang][key].includes(ph), key + " in " + lang + " lacks " + ph);
    }
  }
}
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.immInaFound), "no Chinese in the Spanish line");
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.immInaFoundReverse), "no Chinese in the Spanish reverse line");
assert.ok(I18N.zh.immInaFound.includes("INA"));
assert.ok(I18N.es.immInaFound.includes("corresponde"));

// (j) The subsection no longer claims "no INA lookup": it names the
// partial mapping table instead, in all three languages, keeps the
// honesty that unmapped sections cannot be confirmed, and the static
// HTML fallback matches the English string exactly.
for (const lang of ["en", "es", "zh"]) {
  const s = I18N[lang].immSectionNotCovered;
  assert.ok(!/no live BIA or INA|no INA lookup|BIA ni INA|BIA\u3001INA \u7684\u5b9e\u65f6\u67e5\u8be2/.test(s),
    "old no-INA-lookup phrasing must be gone in " + lang + ", got: " + s);
}
assert.ok(I18N.en.immSectionNotCovered.includes("partial INA\u21948 U.S.C. mapping table"));
assert.ok(I18N.en.immSectionNotCovered.includes("unmapped sections still cannot be confirmed"));
assert.ok(I18N.es.immSectionNotCovered.includes("tabla parcial de correspondencias INA\u21948 U.S.C."));
assert.ok(I18N.es.immSectionNotCovered.includes("a\u00fan no pueden confirmarse"));
assert.ok(I18N.zh.immSectionNotCovered.includes("\u90e8\u5206 INA\u21948 U.S.C. \u5bf9\u7167\u8868"));
assert.ok(I18N.zh.immSectionNotCovered.includes("\u4ecd\u4e0d\u80fd\u786e\u8ba4"));
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(indexHtml.includes(I18N.en.immSectionNotCovered),
  "index.html fallback must match the English subsection string exactly");

// (k) Markdown download carries the mapping line when the finder is
// passed, and keeps the old wording for the unmapped row in the same
// download; without the finder, the old behaviour is preserved.
const report = buildHealthReport([
  { text: "INA \u00a7 208", caseName: null, reporter: "INA", volume: null,
    page: "208", year: null, label: "NOT_CHECKED" },
  { text: "INA \u00a7 999", caseName: null, reporter: "INA", volume: null,
    page: "999", year: null, label: "NOT_CHECKED" },
  { text: "8 U.S.C. \u00a7 1158", caseName: null, reporter: "8 U.S.C.", volume: null,
    page: "1158", year: null, label: "NOT_CHECKED" },
]);
const md = healthReportMarkdown(report, I18N.en, {}, "2026-10-27",
  null, null, (row) => immInaFind(SAMPLE_INDEX, row));
assert.ok(md.includes("INA \u00a7 208 maps to 8 U.S.C. \u00a7 1158"));
assert.ok(md.includes("8 U.S.C. \u00a7 1158 maps to INA \u00a7 208"));
assert.ok(md.includes("INA provision \u2014 this section is not in the partial"),
  "unmapped row in the same download keeps the new wording");
const mdOld = healthReportMarkdown(report, I18N.en, {}, "2026-10-27");
assert.ok(!mdOld.includes("maps to 8 U.S.C."));
assert.ok(mdOld.includes("INA provision \u2014 this section is not in the partial"));

console.log("INA mapping tests passed");
