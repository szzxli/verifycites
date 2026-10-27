// Node test: switching language must actually re-render the briefing
// audience line (data-i18n="briefingAudience") in the chosen language.
// This is a DOM-level test, not just a dictionary check: it runs the real
// setLang() from app.js against a stub document and asserts the element's
// text after each switch. Run: node web/tests/test_briefing_audience_lang.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { I18N } = require("../i18n.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(html.includes('data-i18n="briefingAudience"'),
  "index.html must carry a briefingAudience element");

// Minimal stub document: one [data-i18n] element, the briefing audience line,
// starting with the English static fallback text from index.html.
const audienceEl = {
  textContent: "For Chinese-speaking users in the US, or Chinese-friendly legal-aid settings. This tool covers US CourtListener cases only — it does not cover Chinese law.",
  getAttribute: function (name) { return name === "data-i18n" ? "briefingAudience" : null; }
};
global.document = {
  documentElement: { lang: "en" },
  title: "",
  querySelectorAll: function (sel) {
    return sel === "[data-i18n]" ? [audienceEl] : [];
  },
  getElementById: function () { return { value: "" }; }
};
global.window = {};
global.I18N = I18N;

const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
eval(appSrc); // defines currentLang, T(), setLang() in this context

setLang("zh");
assert.strictEqual(audienceEl.textContent, I18N.zh.briefingAudience,
  "ZH switch must render the ZH audience string, got: " + audienceEl.textContent);
assert.ok(/[\u4e00-\u9fff]/.test(audienceEl.textContent),
  "ZH audience line must contain Chinese characters");
assert.ok(!audienceEl.textContent.includes("For Chinese-speaking"),
  "ZH audience line must not still show the English fallback");

setLang("en");
assert.strictEqual(audienceEl.textContent, I18N.en.briefingAudience,
  "EN switch must restore the EN audience string");

setLang("es");
assert.strictEqual(audienceEl.textContent, I18N.es.briefingAudience,
  "ES switch must render the ES audience string");

console.log("web briefing audience language tests passed");
