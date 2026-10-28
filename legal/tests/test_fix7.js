// Node tests for the 7 breakpoint-report fixes. No network.
// Run: node web/tests/test_fix7.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { I18N } = require("../i18n.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const i18nSrc = fs.readFileSync(path.join(__dirname, "..", "i18n.js"), "utf8");

// New keys exist in all 3 languages with equal key sets.
const NEW_KEYS = ["extractPreNote", "labelLegend", "resultsCliGuide", "cliSingle",
  "cliBatch", "cliTokenLink", "cliTerms", "cliTermsLink", "briefingAudience"];
for (const l of ["en", "es", "zh"]) {
  for (const k of NEW_KEYS) assert.ok(I18N[l][k], l + "/" + k);
  assert.deepStrictEqual(Object.keys(I18N[l]).sort(), Object.keys(I18N.en).sort(), l + " keys");
}
// Fix 1 (SUPERSEDED by UX2): the problem-first hero question is replaced by a
// browser-truthful heading. UX2 heading states extraction + self-check.
assert.ok(I18N.en.heading.includes("Extract citations"));
assert.ok(I18N.en.heading.includes("check each case yourself"));
assert.ok(I18N.zh.heading.includes("逐一自行核查"));
assert.ok(!I18N.en.heading.includes("actually exist"));
assert.ok(!I18N.zh.heading.includes("真实存在"));
// Fix 7: exact Chinese disclaimer-authoritative sentence; English still authoritative.
assert.strictEqual(I18N.zh.disclaimerNote, "如有歧义，以英文版免责声明为准。");
assert.ok(I18N.en.disclaimerNote.toLowerCase().includes("authoritative"));
// Fix 7: briefing audience line present in HTML and i18n (US-only scope).
assert.ok(html.includes('data-i18n="briefingAudience"'));
assert.ok(I18N.en.briefingAudience.includes("CourtListener cases only"));
assert.ok(I18N.zh.briefingAudience.includes("不覆盖中国法律"));
// Fix 2/3/6: HTML hooks present.
assert.ok(html.includes('data-i18n="extractPreNote"'), "prenote under button");
assert.ok(html.includes('data-i18n="labelLegend"'), "legend above table");
assert.ok(html.includes('<a href="#cli" data-i18n="resultsCliGuide"'), "guide anchor to #cli");
// Fix 3: translation section is inside a <details> block.
const transSec = html.slice(html.indexOf('<section class="utility-card" id="translation"'));
assert.ok(transSec.startsWith('<section class="utility-card" id="translation" aria-labelledby="translation-title">\n      <details'), "translation in details");
// Disclaimer: full disclaimer sentence must NOT sit inside any <details> block.
// (Tag-depth scan at the marker position; the briefing warning also says
// "Not legal advice" but is a different, shorter sentence.)
const marker = "This tool only checks whether a cited case exists in CourtListener";
const idx = html.indexOf(marker);
assert.ok(idx > 0, "disclaimer marker");
let depth = 0;
for (const m of html.slice(0, idx).matchAll(/<\/?details\b/g)) {
  if (m[0].startsWith("</")) depth--; else depth++;
}
assert.strictEqual(depth, 0, "main disclaimer must not be inside <details>");
assert.ok(html.includes('<div class="trust-panel" id="disclaimer">'), "disclaimer is a div");
// Fix 4: CLI lines + token docs link present; first-time setup estimate
// present, worded as an estimate (UX1 batch supersedes the old
// no-minute-estimate rule: the parent brief explicitly requires it).
assert.ok(html.includes('data-i18n="cliSingle"') && html.includes('data-i18n="cliBatch"'));
assert.ok(html.includes("https://wiki.free.law/c/courtlistener/help/api/rest/v3/overview"), "token docs link");
assert.ok(I18N.en.cliBatch.includes("about 10 minutes"), "CLI estimate present (EN, as estimate)");
assert.ok(I18N.es.cliBatch.includes("10 minutos"), "CLI estimate present (ES)");
assert.ok(I18N.zh.cliBatch.includes("10 分钟"), "CLI estimate present (ZH)");
// Fix 5: terms note + details link present; nuanced wording (no absolute claim).
assert.ok(html.includes('data-i18n="cliTerms"'));
assert.ok(html.includes("https://free.law/membership/allowed-api-usage/"), "terms details link");
assert.ok(I18N.en.cliTerms.includes("five or fewer attorneys"));
assert.ok(I18N.en.cliTerms.includes("revenue-positive"));
assert.ok(I18N.en.cliTerms.includes("even internal tools count as commercial use"));

console.log("web fix7 tests passed");
