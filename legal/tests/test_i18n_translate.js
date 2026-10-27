// Node tests for v2 trilingual UI + translation preparation. No network.
// Run: node web/tests/test_i18n_translate.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { I18N, I18N_LABELS } = require("../i18n.js");

// (a) All 3 languages share exactly the same flat UI keys.
const langs = ["en", "es", "zh"];
const keySets = langs.map((l) => Object.keys(I18N[l]).sort());
assert.deepStrictEqual(keySets[1], keySets[0], "es keys must equal en keys");
assert.deepStrictEqual(keySets[2], keySets[0], "zh keys must equal en keys");
assert.ok(keySets[0].length >= 30, "expected a full UI key set");

// (b) Disclaimer exists in all 3 languages; English is authoritative,
//     the other two carry an explicit translation note.
for (const l of langs) {
  assert.ok(I18N[l].disclaimer && I18N[l].disclaimer.length > 100, l + " disclaimer");
  assert.ok(I18N[l].disclaimerNote, l + " disclaimerNote");
  assert.ok(I18N[l].transWarning && I18N[l].transWarning.length > 50, l + " transWarning");
}
// Label explanations share the same 8 codes in every language.
const labelCodes = Object.keys(I18N_LABELS.en).sort();
assert.deepStrictEqual(Object.keys(I18N_LABELS.es).sort(), labelCodes);
assert.deepStrictEqual(Object.keys(I18N_LABELS.zh).sort(), labelCodes);
for (const l of langs) for (const c of labelCodes) assert.ok(I18N_LABELS[l][c], l + "/" + c);

// (c) Citations / names survive translation preparation unchanged.
const extractSrc = fs.readFileSync(path.join(__dirname, "..", "extract.js"), "utf8");
const extractFn = extractSrc.replace(/if \(typeof module[\s\S]*$/, "");
eval(extractFn); // defines REPORTERS, extractCitations
const translateSrc = fs.readFileSync(path.join(__dirname, "..", "translate.js"), "utf8");
const translateFn = translateSrc.replace(/if \(typeof module[\s\S]*$/, "");
eval(translateFn); // defines splitParagraphs, prepareForTranslation, ...

assert.strictEqual(DEFAULT_TRANSLATE_ENDPOINT, "", "no default endpoint");

const opinion = "In Brown v. Board of Education, 347 U.S. 483 (1954), the Court held "
  + "that separate schools are unequal. See also 576 U.S. 644 and 12,000 students.";
const prepared = prepareForTranslation(opinion);
// Masked text must contain none of the protected strings.
for (const p of prepared.protected) assert.ok(!prepared.masked.includes(p), "masked leaks: " + p);
// The extractor's detected name span may include a leading sentence-start
// word ("In Brown v. Board of Education" -- pre-existing v1 behaviour,
// unchanged here); what matters is the full name is masked, not leaked.
assert.ok(prepared.protected.some((p) => p.includes("Brown v. Board of Education")));
assert.ok(prepared.protected.includes("347 U.S. 483"));
assert.ok(prepared.protected.includes("576 U.S. 644"));
assert.ok(prepared.protected.includes("12,000"));
assert.ok(prepared.protected.includes("1954"));
// A fake "translation" that keeps placeholders restores everything verbatim.
const fake = prepared.masked.replace("held", "sostuvo").replace("separate", "separadas");
const restored = restoreTranslation(fake, prepared);
for (const p of prepared.protected) assert.ok(restored.includes(p), "restore lost: " + p);
assert.ok(!/\u27e6P\d+\u27e7/.test(restored), "placeholders must not survive restore");

// Paragraph splitting.
assert.deepStrictEqual(splitParagraphs("One.\n\nTwo.\n\n\nThree."), ["One.", "Two.", "Three."]);

// No endpoint => NO_ENDPOINT, and the fetch stub must never be called.
(async () => {
  let called = 0;
  const rows = await translateParagraphs(["Hello world. 347 U.S. 483."],
    { endpoint: "", fetchFn: () => { called++; throw new Error("must not fetch"); } });
  assert.strictEqual(rows[0].error, "NO_ENDPOINT");
  assert.strictEqual(rows[0].translation, null);
  assert.strictEqual(called, 0, "fetch must not run without an endpoint");
  // With a stub endpoint, protected spans survive a round trip verbatim.
  const stub = async () => ({ json: async () => ({ translatedText: "Hola \u27e6P0\u27e7 mundo." }) });
  const rows2 = await translateParagraphs(["See 347 U.S. 483."],
    { endpoint: "https://example.invalid/translate", target: "es", fetchFn: stub });
  assert.ok(rows2[0].translation.includes("347 U.S. 483"), JSON.stringify(rows2[0]));
  console.log("web i18n + translation-preparation tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
