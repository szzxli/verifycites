// Node tests for the UX2 cognitive-chain batch (legal page only). No network.
// Run: node tests/test_ux2.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { I18N } = require("../i18n.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const { extractCitations, REPORTERS } = require("../extract.js");
global.REPORTERS = REPORTERS;
const { buildHealthReport, healthReportMarkdown } = require("../report.js");

// --- 1. New keys in all 3 languages, equal key sets.
const NEW_KEYS = ["trustLeadLine", "queryDevNote", "transDevNote", "briefingManualExplainer"];
for (const l of ["en", "es", "zh"]) {
  for (const k of NEW_KEYS) assert.ok(I18N[l][k], l + "/" + k);
  assert.deepStrictEqual(Object.keys(I18N[l]).sort(), Object.keys(I18N.en).sort(), l + " keys");
}
// No CJK characters in any ES string.
for (const k of Object.keys(I18N.es)) {
  assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es[k]), "ES/" + k + " has no CJK");
}

// --- 2. Title + H1 are browser-truthful; old question wording is gone.
assert.ok(!html.includes("does the case you cited exist?"), "static title question gone");
assert.ok(html.includes("browser citation extraction"), "static title is browser-truthful");
assert.ok(!html.includes("Does every case in your brief actually exist?"), "old H1 gone from HTML");
for (const l of ["en", "es", "zh"]) {
  assert.ok(!/actually exist|realmente cada caso|真实存在/.test(I18N[l].heading),
    l + " heading has no existence question");
}
assert.ok(I18N.en.heading.includes("Extract citations"));
assert.ok(I18N.es.heading.includes("Extraiga las citas"));
assert.ok(I18N.zh.heading.includes("逐一自行核查"));
// document.title still comes from the (already truthful) pageTitle key.
assert.ok(appSrc.includes("document.title = T().pageTitle"), "title set from pageTitle");
assert.ok(I18N.en.pageTitle.includes("browser citation extraction"));

// --- 3. Limits box leads with the browser-mode truth, before the disclaimer.
const trustAt = html.indexOf('class="trust-content"');
const leadAt = html.indexOf('data-i18n="trustLeadLine"', trustAt);
const discAt = html.indexOf('data-i18n="disclaimer"', trustAt);
assert.ok(trustAt > 0 && leadAt > trustAt && discAt > leadAt, "lead line precedes disclaimer");
assert.ok(I18N.en.trustLeadLine.includes("extracts only"));
assert.ok(I18N.es.trustLeadLine.includes("solo extrae"));
assert.ok(I18N.zh.trustLeadLine.includes("只提取引文"));
// Disclaimer text and the three items are untouched.
assert.ok(I18N.en.disclaimer.startsWith("Not legal advice."));
assert.ok(I18N.en.trustLimit1 && I18N.en.trustLimit2 && I18N.en.trustLimit3);

// --- 4. No absolute privacy claim remains in any user-visible string.
// User-visible strings = index.html fallbacks + I18N values + COPY dict values.
const copySrc = fs.readFileSync(path.join(__dirname, "..", "ui-enhancements.js"), "utf8");
const visible = html + "\n" + Object.values(I18N.en).join("\n") + Object.values(I18N.es).join("\n")
  + Object.values(I18N.zh).join("\n") + copySrc;
for (const bad of ["nothing leaves your browser", "never leaves your browser",
  "text never leaves", "no deja su navegador", "永不离开浏览器", "绝不会离开"]) {
  assert.ok(!visible.toLowerCase().includes(bad.toLowerCase()), "absolute claim gone: " + bad);
}
// The scoped extraction-step forms are allowed: EN "in the extraction step, your
// text does not leave your browser" and its ZH equivalent "在提取这一步，您的文本
// 不会离开您的浏览器" — both name the extraction step, so they are not absolute.
// The only "leave(s) your browser" phrasing left is the scoped extraction-step form.
assert.ok(visible.includes("in the extraction step, your text does not leave your browser"));
// Footer privacy line is present and scoped (extraction local; endpoint/query only; GoatCounter views).
assert.ok(html.includes('data-i18n="privacy"'), "footer privacy hook");
assert.ok(I18N.en.privacy.includes("citation extraction runs in this browser"));
assert.ok(I18N.en.privacy.includes("translation endpoint you choose"));
assert.ok(I18N.en.privacy.includes("briefing requests send"));
assert.ok(I18N.en.privacy.includes("GoatCounter"));
// No page-wide privacy claim inside the immigration section.
const immAt = html.indexOf('id="immigration"');
const queryAt = html.indexOf('id="query-translation"');
const immSection = html.slice(immAt, queryAt);
assert.ok(!/privacy/i.test(immSection), "no privacy claim inside immigration section");

// --- 5. Translation sections: developer-feature label + endpoint explainer.
assert.ok(html.indexOf('data-i18n="queryDevNote"') > queryAt, "query dev note present");
const transAt = html.indexOf('id="translation"');
assert.ok(html.indexOf('data-i18n="transDevNote"') > transAt, "translation dev note present");
for (const l of ["en", "es", "zh"]) {
  assert.ok(/developer|desarrollador|开发者/i.test(I18N[l].queryDevNote), l + " query dev label");
  assert.ok(/developer|desarrollador|开发者/i.test(I18N[l].transDevNote), l + " trans dev label");
  assert.ok(I18N[l].queryDevNote.includes("your-translation-service.example"),
    l + " query example format");
  assert.ok(I18N[l].transDevNote.includes("your-translation-service.example"),
    l + " trans example format");
  assert.ok(!/libretranslate/i.test(I18N[l].queryDevNote), l + " no real service named in dev note");
  assert.ok(!/libretranslate/i.test(I18N[l].transDevNote), l + " no real service named in dev note");
}
assert.ok(I18N.en.queryDevNote.includes("opinion-translation section below"),
  "query dependency note explicit");

// --- 6. Briefing manual items explained.
const briefAt = html.indexOf('id="briefing"');
assert.ok(html.indexOf('data-i18n="briefingManualExplainer"') > briefAt, "manual explainer present");
assert.ok(I18N.en.briefingManualExplainer.includes("paste yourself"));
assert.ok(I18N.en.briefingManualExplainer.includes("blocked or unavailable"));
assert.ok(I18N.en.briefingManualExplainer.includes("Rank manual items"));
assert.ok(I18N.es.briefingManualExplainer.includes("Ordenar elementos manuales"));
assert.ok(I18N.zh.briefingManualExplainer.includes("排序手动条目"));

// --- 7. UX1 regressions (must all still hold).
assert.ok(html.includes('class="table-wrap report-collapsed"'), "report table collapsed by default");
assert.ok(html.includes('id="reportColumnsToggle"'), "columns toggle present");
assert.ok(I18N.en.labelLegend.startsWith("NOT_CHECKED"), "legend leads with NOT_CHECKED");
const order = ["id=\"checker\"", "id=\"cli\"", "id=\"immigration\"",
  "id=\"query-translation\"", "id=\"translation\"", "id=\"briefing\""]
  .map((s) => html.indexOf(s));
assert.ok(order.every((v) => v > 0) && order.every((v, i) => i === 0 || v > order[i - 1]),
  "section order unchanged");
assert.ok(html.includes('href="#cli"'), "#cli jump link present");
assert.ok(I18N.en.cliBatch.includes("about 10 minutes"), "CLI estimate present");
assert.ok(I18N.en.eligibilityNote.includes("Free Law Project agreement"), "eligibility present");
assert.ok(html.includes("https://free.law/membership/allowed-api-usage/"), "FLP link present");

// --- 8. Health report still builds end-to-end (standard format, human review, scope).
const sample = "Brown v. Board of Education, 347 U.S. 483 (1954). See 8 CFR 208.18 and INA 240A.";
const rows = extractCitations(sample);
assert.ok(rows.length >= 3, "mixed sample extracts 3+ rows");
const report = buildHealthReport(rows, { lang: "en" });
assert.ok(report.rows.length >= 3, "report rows present");
const md = healthReportMarkdown(report, {}, { lang: "en" });
assert.ok(md.includes("Human review"), "report keeps human review field");
assert.ok(md.includes("Matching evidence"), "report keeps evidence field");

console.log("web ux2 tests passed");
