// BIA precedent search (branch prototype, #47): fixed per-result note,
// scope text, same-origin reads only, keyword AND matching, official links.
// Run: node legal/tests/test_bia.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { BIA_RESULT_NOTE, BIA_SCOPE_NOTE, BIA_VOLUMES, biaTokenize, biaHref, biaSearch } = require("../bia.js");

assert.strictEqual(BIA_RESULT_NOTE, "Keyword matching only. This shows that the decision exists, its citation, and the official link. It does not say whether the decision is still good law. Not legal advice.");
assert.ok(BIA_SCOPE_NOTE.includes("BIA and Attorney General precedent decisions only"));
assert.ok(BIA_SCOPE_NOTE.includes("volume 30 only"));
assert.ok(BIA_SCOPE_NOTE.includes("01\u201307"));
assert.deepStrictEqual(BIA_VOLUMES, ["30"]);

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const sec = html.slice(html.indexOf('id="bia-search"'), html.indexOf("</section>", html.indexOf('id="bia-search"')));
assert.ok(sec.includes("Volumes 01&#8211;07 are a known gap"), "page states the 01-07 gap");
assert.ok(sec.includes("Currently volume 30 only"), "page states volume 30 scope");
assert.ok(!/data-i18n/.test(sec), "BIA block is English only, not passed through i18n");
assert.ok(html.indexOf('<script src="bia.js"></script>') > 0, "bia.js loaded");
assert.ok(!/%|success rate|win rate|pro se|good law\b(?! )/i.test(sec.replace(/still good law/g, "")), "no rates, no pro se targeting");

const src = fs.readFileSync(path.join(__dirname, "..", "bia.js"), "utf8");
assert.ok(src.includes('fetch("../data/bia-index.json"'), "reads same-origin index");
assert.ok(src.includes('"../data/bia-search/vol" + v + ".json"'), "reads same-origin volume index");
assert.ok(!/fetch\(\s*["']https?:/.test(src), "no third-party fetch");
assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src), "query is not stored");
assert.ok(!/innerHTML/.test(src), "results rendered as text nodes");
const resultBlock = src.slice(src.indexOf("view.results.forEach"));
assert.ok(resultBlock.includes("BIA_RESULT_NOTE"), "note is attached beside each result");

// Tokenizer mirrors the Python poller.
assert.deepStrictEqual(biaTokenize("The Particular social-group of IJ"), ["particular", "social", "group"]);

const index = { entries: [
  { id: 1, display_name: "Matter of A-", citation: "30 I&N Dec. 1", year: 2026, body: "BIA", pdf_url: "https://www.justice.gov/eoir/media/1/dl?inline" },
  { id: 2, display_name: "Matter of B-", citation: "30 I&N Dec. 9", year: 2026, body: "AG", pdf_url: "https://www.justice.gov/eoir/media/2/dl?inline" },
] };
const vols = [{ volume: "30", terms: { asylum: [1, 2], cancellation: [2], removal: [1] } }];
assert.deepStrictEqual(biaSearch(index, vols, "asylum").results.map((e) => e.id), [2, 1]);
assert.deepStrictEqual(biaSearch(index, vols, "asylum cancellation").results.map((e) => e.id), [2]);
assert.deepStrictEqual(biaSearch(index, vols, "asylum unknownword").results, []);
assert.deepStrictEqual(biaSearch(index, vols, "of the").results, []);

assert.strictEqual(biaHref("https://www.justice.gov/eoir/media/1/dl?inline"), "https://www.justice.gov/eoir/media/1/dl?inline");
assert.strictEqual(biaHref("https://evil.example/x"), "");
assert.strictEqual(biaHref("javascript:alert(1)"), "");

// The committed snapshot loads and matches through the same function.
const dataDir = path.join(__dirname, "..", "..", "data");
const realIndex = JSON.parse(fs.readFileSync(path.join(dataDir, "bia-index.json"), "utf8"));
const realVol = JSON.parse(fs.readFileSync(path.join(dataDir, "bia-search", "vol30.json"), "utf8"));
assert.ok(realIndex.entries.length > 0);
assert.ok(realIndex.entries.every((e) => biaHref(e.pdf_url)), "every entry links to the official EOIR PDF");
assert.ok(realIndex.entries.every((e) => !("text" in e)), "no full text in the index");
assert.ok(biaSearch(realIndex, [realVol], "asylum").results.length > 0, "real snapshot returns hits");

console.log("legal BIA search tests passed");
