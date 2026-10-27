// Node tests for the localised briefing sample tag. No network.
// Run: node tests/test_sample_tag.js
// Guarantees: the sample marker is rendered from the current language's
// dictionary (EN SAMPLE / ES MUESTRA / ZH 示例) and no hardcoded
// bilingual "[SAMPLE / 示例]" marker remains in the legal app.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const { I18N } = require("../i18n.js");

assert.ok(!appSrc.includes("[SAMPLE / 示例]"),
  "hardcoded bilingual sample marker must not remain in app.js");
assert.ok(appSrc.includes("T().briefingSampleTag"),
  "sample marker must come from the current language dictionary");
assert.strictEqual(I18N.en.briefingSampleTag, "SAMPLE");
assert.strictEqual(I18N.es.briefingSampleTag, "MUESTRA");
assert.strictEqual(I18N.zh.briefingSampleTag, "示例");
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.briefingSampleTag),
  "Spanish sample tag must contain no Chinese characters");
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.en.briefingSampleTag),
  "English sample tag must contain no Chinese characters");
console.log("sample tag tests passed");
