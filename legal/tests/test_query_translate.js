// Node tests for v2 query auto-translation (zh/es UI -> English search).
// No network: the MT backend is a stub. Run: node web/tests/test_query_translate.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extractSrc = fs.readFileSync(path.join(__dirname, "..", "extract.js"), "utf8");
eval(extractSrc.replace(/if \(typeof module[\s\S]*$/, "")); // REPORTERS, extractCitations
const translateSrc = fs.readFileSync(path.join(__dirname, "..", "translate.js"), "utf8");
eval(translateSrc.replace(/if \(typeof module[\s\S]*$/, "")); // prepare/restore/translate

// Chinese query: descriptive text in Chinese + citation-format content
// that must survive untouched (volume, reporter, page, year, headcount).
const zhQuery = "布朗诉教育委员会案，347 U.S. 483 (1954)，涉及 12000 名学生。";
const prepared = prepareForTranslation(zhQuery);
for (const keep of ["347 U.S. 483", "1954", "12000"]) {
  assert.ok(prepared.protected.includes(keep), "protected must include " + keep);
  assert.ok(!prepared.masked.includes(keep), "masked leaks " + keep);
}
// Simulated MT output: Chinese prose translated, placeholders kept.
const fakeEn = prepared.masked
  .replace("布朗诉教育委员会案", "Brown v. Board of Education case")
  .replace("涉及", "involving").replace("名学生", "students");
const enQuery = restoreTranslation(fakeEn, prepared);
for (const keep of ["347 U.S. 483", "1954", "12000"]) {
  assert.ok(enQuery.includes(keep), "English query lost " + keep + ": " + enQuery);
}
assert.ok(!/\u27e6P\d+\u27e7/.test(enQuery), "placeholders must not survive");
// The English query still extracts the same citation.
const cites = extractCitations(enQuery);
assert.strictEqual(cites.length, 1);
assert.strictEqual(cites[0].text, "347 U.S. 483");

(async () => {
  // Stub backend receives source=zh, target=en and placeholders intact.
  let seenBody = null;
  const stub = async (_url, opts) => {
    seenBody = JSON.parse(opts.body);
    return { json: async () => ({ translatedText: "Brown case, \u27e6P0\u27e7 (\u27e6P1\u27e7), involving \u27e6P2\u27e7 students." }) };
  };
  const rows = await translateParagraphs([zhQuery],
    { endpoint: "https://example.invalid/translate", source: "zh", target: "en", fetchFn: stub });
  assert.strictEqual(seenBody.source, "zh");
  assert.strictEqual(seenBody.target, "en");
  assert.strictEqual(rows[0].error, null);
  for (const keep of ["347 U.S. 483", "1954", "12000"]) {
    assert.ok(rows[0].translation.includes(keep), "stub round trip lost " + keep);
  }
  // No endpoint: NO_ENDPOINT, fetch never called, translation stays null
  // (the caller must NOT pretend an English search happened).
  let called = 0;
  const noRows = await translateParagraphs([zhQuery], {
    endpoint: "", source: "zh", target: "en",
    fetchFn: () => { called++; throw new Error("must not fetch"); }
  });
  assert.strictEqual(noRows[0].error, "NO_ENDPOINT");
  assert.strictEqual(noRows[0].translation, null);
  assert.strictEqual(called, 0);
  // Backend failure: TRANSLATE_FAILED, translation null -- never a fake query.
  const failRows = await translateParagraphs([zhQuery], {
    endpoint: "https://example.invalid/translate", source: "zh", target: "en",
    fetchFn: async () => { throw new Error("down"); }
  });
  assert.strictEqual(failRows[0].error, "TRANSLATE_FAILED");
  assert.strictEqual(failRows[0].translation, null);
  console.log("web query-translation tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
