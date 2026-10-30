// Batch 2 step 2: B4 (one always-visible disclaimer, restated warnings removed),
// B6 (one name "CLI check" + one applies-to sentence), B11 (three real sample citations).
// Run: node legal/tests/test_batch2_step2.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "..", "ui-enhancements.js"), "utf8");
const { extractCitations } = require("../extract.js");
const { buildHealthReport } = require("../report.js");

// B4: the full disclaimer is present once, not inside <details>, not hidden.
const discAt = html.indexOf('data-i18n="disclaimer"');
assert.ok(discAt > 0 && html.indexOf('data-i18n="disclaimer"', discAt + 1) < 0, "full disclaimer appears once");
const panel = html.slice(html.indexOf('<div class="trust-panel" id="disclaimer">'), html.indexOf('id="checker"'));
assert.ok(!/<details|\shidden[\s>=]/.test(panel), "disclaimer panel is never collapsible or hidden");
for (const k of ["checkerTopLimit", "extractPreNote", "reportNotCheckedNote", "reportScopeNote", "eligibilityNote"]) {
  assert.ok(!html.includes('data-i18n="' + k + '"'), "restated copy removed: " + k);
}
assert.ok(html.includes('data-i18n="reportLimitsPointer"'), "report keeps one short pointer to Important limits");

// B6: one name for the command-line tool, and one applies-to sentence.
assert.ok(!/CLI guide|Advanced option|Full check/i.test(html), "old names are gone from the page");
assert.ok(html.includes(">CLI check</a>") && html.includes(">CLI check</span>"), "nav and section use \"CLI check\"");
assert.ok(html.includes("The CLI check applies to U.S. case citations only"), "one applies-to sentence");
for (const k of ['navCli: "CLI check"', 'advancedOption: "CLI check"']) assert.ok(ui.includes(k), "EN copy: " + k);

// B11: three real citations, one row each: federal case, INA section, BIA precedent.
const m = ui.match(/input\.value = "((?:[^"\\]|\\.)*)";/);
assert.ok(m, "sample text found");
const sample = JSON.parse('"' + m[1] + '"');
const rows = extractCitations(sample);
assert.strictEqual(rows.length, 3, "sample yields three rows");
const types = buildHealthReport(rows).rows.map((r) => r.immType);
assert.deepStrictEqual(types, ["court", "statute", "bia"], "court + INA + BIA");
for (const href of ["https://www.courtlistener.com/c/U.S./347/483/",
  "https://www.govinfo.gov/content/pkg/USCODE-2024-title8/html/USCODE-2024-title8-chap12-subchapII-partI-sec1158.htm",
  "https://www.justice.gov/eoir/vll/intdec/vol19/2986.pdf"]) {
  assert.ok(html.includes('href="' + href + '"'), "official sample source: " + href);
}

// Kept intact.
assert.ok(html.includes('id="court-ai-orders"'), "standing-orders table kept");
assert.ok(html.includes("gc.zgo.at/count.js") && html.includes("nocount"), "GoatCounter nocount loader kept");
console.log("test_batch2_step2: ok");
