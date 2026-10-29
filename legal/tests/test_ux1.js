// Node tests for the UX1 cognitive-chain batch (legal page only). No network.
// Run: node tests/test_ux1.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { I18N } = require("../i18n.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const copySrc = fs.readFileSync(path.join(__dirname, "..", "ui-enhancements.js"), "utf8");
const { extractCitations, REPORTERS } = require("../extract.js");
global.REPORTERS = REPORTERS;
const { buildHealthReport, healthReportMarkdown } = require("../report.js");

const idx = (s) => html.indexOf(s);
const checkerAt = idx('<section class="workspace-card" id="checker"');
assert.ok(checkerAt > 0, "checker section present");

// --- 1. I18N: new keys in all 3 languages, equal key sets (already enforced
// by test_i18n_translate.js, but the new keys get explicit coverage here).
const NEW_KEYS = ["browserModeFirstLine", "trustLimit1", "trustLimit2", "trustLimit3",
  "coverageLine", "eligibilityNote", "checkerTopLimit", "showAllColumns",
  "showFewerColumns", "columnsNote"];
for (const l of ["en", "es", "zh"]) {
  for (const k of NEW_KEYS) assert.ok(I18N[l][k], l + "/" + k);
  assert.deepStrictEqual(Object.keys(I18N[l]).sort(), Object.keys(I18N.en).sort(), l + " keys");
}

// --- 2. First-screen honesty: hero line + trust-panel limit items.
const heroLineAt = idx('data-i18n="browserModeFirstLine"');
assert.ok(heroLineAt > 0 && heroLineAt < checkerAt,
  "browserModeFirstLine must sit in the hero, before the checker section");
assert.ok(I18N.en.browserModeFirstLine.includes("NOT_CHECKED"));
assert.ok(I18N.en.browserModeFirstLine.includes("does not check whether a case exists"));
for (const k of ["trustLimit1", "trustLimit2", "trustLimit3"]) {
  assert.ok(html.includes('data-i18n="' + k + '"'), k + " in trust panel");
}
assert.ok(I18N.en.trustLimit1.includes("supports your argument"));
assert.ok(I18N.en.trustLimit2.includes("pin cites"));
assert.ok(I18N.en.trustLimit3.includes("still good law"));
// Full disclaimer untouched + English-authoritative note untouched.
assert.ok(html.includes("Every row is NOT_CHECKED"),
  "disclaimer states browser rows are not checked");
assert.ok(I18N.en.disclaimer.includes("does not check whether a cited case exists"));
assert.ok(html.includes('data-i18n="disclaimerNote"'), "disclaimer note intact");
// Hero "Not legal advice" chip merged away (disclaimer itself kept above).
assert.ok(!html.includes('data-copy="factNoAdvice"'), "hero factNoAdvice chip removed");
assert.ok(html.includes('data-copy="factCli"'), "hero CLI fact present");
assert.ok(!copySrc.includes("factNoAdvice"), "COPY dict no longer defines factNoAdvice");

// --- 3. Report table: four-column default + toggle reveals the rest.
const reportThead = html.slice(idx('id="reportTableWrap"'));
const thead = reportThead.slice(0, reportThead.indexOf("</thead>"));
const ths = [...thead.matchAll(/<th\s[^>]*>/g)].map((m) => m[0]);
assert.strictEqual(ths.length, 15, "report thead has 15 columns (14 + Label), got " + ths.length);
const visible = ths.filter((t) => !t.includes("col-extra"));
assert.strictEqual(visible.length, 5, "5 visible columns by default, got " + visible.length);
assert.ok(visible.some((t) => t.includes('data-i18n="thCitation"')), "Citation visible");
assert.ok(visible.some((t) => t.includes('data-i18n="thCaseName"')), "Case name visible");
assert.ok(visible.some((t) => t.includes('data-i18n="thLabel"')), "Label visible");
assert.ok(visible.some((t) => t.includes('data-i18n="thLinks"')), "Manual-check links visible");
assert.strictEqual(ths.filter((t) => t.includes("col-extra")).length, 10, "10 extra columns hidden by default");
assert.ok(visible.some((t) => t.includes('data-i18n="reportThEvidence"')), "Matching evidence visible");
assert.ok(html.includes('id="reportColumnsToggle"'), "toggle button present");
assert.ok(html.includes('onclick="toggleReportColumns()"'), "toggle wired");
assert.ok(html.includes('data-i18n="columnsNote"'), "columns note present");
assert.ok(I18N.en.columnsNote.includes("Human review"), "columns note names human review");
assert.ok(I18N.en.columnsNote.includes("re-verify"), "columns note names re-verify");
assert.ok(css.includes("#reportTableWrap.report-collapsed .col-extra"), "collapsed CSS rule present");
assert.ok(css.includes("display: none"), "collapsed rule hides extras");
assert.ok(appSrc.includes("function toggleReportColumns()"), "toggle function in app.js");
assert.ok(appSrc.includes("function applyReportColumns()"), "apply function in app.js");
assert.ok(appSrc.includes('class=\\"col-extra\\"'), "report rows mark extra cells");
assert.ok(appSrc.includes('esc(row.label)'), "report rows carry a Label cell");
// Extraction table untouched: still 6 columns, no col-extra.
const resultsThead = html.slice(idx('id="resultsWrap"'), idx('id="reportTableWrap"'));
assert.strictEqual([...resultsThead.matchAll(/<th\s[^>]*>/g)].length, 6, "extraction table still 6 columns");
assert.ok(!resultsThead.includes("col-extra"), "extraction table has no collapsed columns");

// Downloads keep ALL fields even though DOM columns collapse.
const rows = buildHealthReport([
  { text: "347 U.S. 483", volume: "347", reporter: "U.S.", page: "483",
    caseName: "Brown v. Board of Education", year: "1954", pinCite: "490",
    manualUrl: "https://www.courtlistener.com/?q=%22347+U.S.+483%22" },
]);
const md = healthReportMarkdown(rows, {}, {}, "");
for (const field of ["NOT_CHECKED", "Brown v. Board of Education", "1954", "pin cite: 490",
  "Structure flags", "Category", "Anomaly reason", "Matching evidence",
  "Check scope", "Suggested action", "Human review", "Manual check"]) {
  assert.ok(md.includes(field), "download keeps field: " + field);
}

// --- 4. Legend leads with NOT_CHECKED; CLI-only statuses marked CLI-only.
for (const l of ["en", "es", "zh"]) {
  assert.ok(I18N[l].labelLegend.startsWith("NOT_CHECKED"), l + " legend leads with NOT_CHECKED");
}
assert.ok(!I18N.en.labelLegend.includes("VERIFIED"), "EN legend is NOT_CHECKED only");
assert.ok(!I18N.es.labelLegend.includes("VERIFIED"), "ES legend is NOT_CHECKED only");
assert.ok(!I18N.zh.labelLegend.includes("VERIFIED"), "ZH legend is NOT_CHECKED only");

// --- 5. Eligibility paragraph below the results, with the agreement link.
const eligAt = idx('data-i18n="eligibilityNote"');
assert.ok(eligAt > idx('id="reportSection"'), "eligibility paragraph is below the report section");
assert.ok(eligAt < idx('<section class="utility-card cli-card" id="cli"'), "eligibility paragraph is inside the checker section");
assert.ok(html.includes("https://free.law/membership/allowed-api-usage/"), "agreement link present");
assert.ok(I18N.en.eligibilityNote.includes("five or fewer attorneys"), "eligibility: who may use");
assert.ok(I18N.en.eligibilityNote.includes("separate Free Law Project agreement"), "eligibility: who needs agreement");
assert.ok(I18N.en.eligibilityNote.includes("membership-based"), "eligibility says membership-based");
assert.ok(!I18N.en.eligibilityNote.includes("free CourtListener"), "no unconditional-free claim (EN)");
assert.ok(!I18N.en.howToText.includes("free CourtListener"), "howToText no longer says free token");

// --- 6. Section order + nav order alignment.
const order = ["checker", "cli", "immigration"];
const positions = order.map((id) => idx('id="' + id + '"'));
for (let i = 1; i < positions.length; i++) {
  assert.ok(positions[i] > positions[i - 1], "section order: " + order[i - 1] + " before " + order[i]);
}
const navStart = html.indexOf('<nav class="primary-nav"');
const navBlock = html.slice(navStart, html.indexOf("</nav>", navStart));
const navHrefs = [...navBlock.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(navHrefs, order, "nav order matches page order, got " + navHrefs.join(","));
assert.ok(navBlock.includes('data-copy="navImmigration"'), "nav has immigration link");
assert.ok(!navBlock.includes('data-copy="navQuery"'), "query-translation is not in the page nav");
// Audience line moved to the hero (exactly once, before the checker).
const audienceHits = [...html.matchAll(/data-i18n="briefingAudience"/g)].length;
assert.strictEqual(audienceHits, 1, "briefingAudience appears exactly once");
assert.ok(idx('data-i18n="briefingAudience"') < checkerAt, "audience line is on the first screen (hero)");

// --- 7. Coverage line beside the input.
const covAt = idx('data-i18n="coverageLine"');
assert.ok(covAt > checkerAt && covAt < idx('id="input"'), "coverage line sits above the checker input");
assert.ok(I18N.en.coverageLine.includes("NOT_CHECKED") || I18N.en.coverageLine.includes("Not checked here"), "coverage: browser does not check");
assert.ok(I18N.en.coverageLine.includes("8 C.F.R."), "coverage names regulations");
assert.ok(I18N.en.coverageLine.includes("BIA"), "coverage names BIA");
assert.ok(I18N.en.immCheckerLink.includes("partial coverage"), "immigration link reads partial coverage");

// --- 8. Privacy narrowed to the extraction step (hero + footer).
assert.ok(!html.includes("nothing leaves your browser"), "old absolute hero claim gone");
assert.ok(!html.includes("text never leaves your browser"), "old absolute footer claim gone");
const subtitleEl = html.slice(idx('data-i18n="subtitle"'), idx('data-i18n="subtitle"') + 400);
assert.ok(subtitleEl.includes("extraction step"), "hero subtitle narrowed to extraction step");
const privacyEl = html.slice(idx('data-i18n="privacy"'), idx('data-i18n="privacy"') + 400);
assert.ok(privacyEl.includes("citation extraction runs in this browser"), "footer privacy narrowed");
assert.ok(html.includes("goatcounter"), "GoatCounter snippet untouched");
// Module disclosures intact.
assert.ok(html.includes("does not send this text to CourtListener"), "input disclosure intact");
assert.ok(I18N.en.privacy.includes("GoatCounter"), "privacy names GoatCounter");
assert.ok(!I18N.en.privacy.includes("translation endpoint"), "translation is not promoted in the privacy line");

// --- 9. Checker-top limit line (for #checker deep-link landings).
const topLimitAt = idx('data-i18n="checkerTopLimit"');
assert.ok(topLimitAt > checkerAt && topLimitAt < idx('id="input"'), "checker-top limit inside checker, above input");
assert.ok(I18N.en.checkerTopLimit.includes("not checked online"), "checker-top limit states the limit");

// --- 10. Results note: real #cli link in all three languages (split COPY keys).
const noteStart = html.indexOf('<div class="not-checked-note"');
const noteDiv = html.slice(noteStart, html.indexOf("</div>", noteStart) + 6);
assert.ok(noteDiv.includes('<a href="#cli" data-copy="browserModeNoteLink">'), "note links to #cli");
assert.ok(noteDiv.includes('data-copy="browserModeNotePrefix"'), "note prefix present");
assert.ok(noteDiv.includes('data-copy="browserModeNoteSuffix"'), "note suffix present");
// Prefix + link + suffix reconstruct the original note exactly.
const ORIG_NOTE = {
  en: "Every result in browser mode is marked NOT_CHECKED. Use the links to check by hand. The CLI checks CourtListener case existence and case name only. It does not check statutes, regulations, BIA, AAO, the INA, or the C.F.R.",
  es: "Todos los resultados del modo navegador se marcan NOT_CHECKED. Use los enlaces para comprobarlos a mano. La CLI solo comprueba en CourtListener si el caso existe y si el nombre coincide. No comprueba leyes, reglamentos, decisiones de BIA o AAO, la INA ni el C.F.R.",
  zh: "浏览器模式下的结果均标为 NOT_CHECKED。请通过链接手动核对。CLI 只在 CourtListener 中核查判例是否存在以及案名是否一致，不核查法规、BIA、AAO、INA 或 C.F.R.。",
};
const copyOf = (lang, key) => {
  const block = copySrc.split("var COPY = {")[1];
  assert.ok(block, "COPY dict found in ui-enhancements.js");
  const start = block.indexOf(lang + ": {");
  const seg = block.slice(start, block.indexOf("},", start));
  const m = seg.match(new RegExp(key + ': "((?:[^"\\\\]|\\\\.)*)"'));
  assert.ok(m, lang + "/" + key + " in COPY");
  return JSON.parse('"' + m[1] + '"');
};
for (const l of ["en", "es", "zh"]) {
  const rebuilt = copyOf(l, "browserModeNotePrefix") + copyOf(l, "browserModeNoteLink") + copyOf(l, "browserModeNoteSuffix");
  assert.strictEqual(rebuilt, ORIG_NOTE[l], l + " note split reconstructs the original");
  assert.ok(!/[\u4e00-\u9fff]/.test(copyOf(l, "browserModeNotePrefix") + copyOf(l, "browserModeNoteLink") + copyOf(l, "browserModeNoteSuffix")) || l === "zh",
    l + " note split has no stray CJK unless ZH");
}
// COPY parity for all new data-copy keys.
for (const k of ["navImmigration", "navQuery", "factCli", "browserModeNotePrefix", "browserModeNoteLink", "browserModeNoteSuffix"]) {
  for (const l of ["en", "es", "zh"]) copyOf(l, k);
}
assert.ok(!/[\u4e00-\u9fff]/.test(copyOf("es", "navImmigration") + copyOf("es", "navQuery") + copyOf("es", "factCli")),
  "ES new COPY strings contain no CJK");

// --- 11. CLI estimate present (worded as an estimate).
assert.ok(I18N.en.cliBatch.includes("about 10 minutes"), "EN CLI estimate");
assert.ok(I18N.es.cliBatch.includes("10 minutos"), "ES CLI estimate");
assert.ok(I18N.zh.cliBatch.includes("10 分钟"), "ZH CLI estimate");

console.log("web ux1 tests passed");
