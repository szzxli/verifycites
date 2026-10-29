// Per-report hand-check marks. Run: node legal/tests/test_review.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const R = require("../review.js");

const legacy = {
  "347 U.S. 483": { status: "confirmed", note: "read the opinion" },
  "99 F.4th 1": { status: "recheck", note: "" }
};
const store = R.reviewMigrate(legacy);
assert.strictEqual(store.v, 2);
assert.strictEqual(store.legacy["347 U.S. 483"].status, "confirmed");
assert.strictEqual(store.legacy["347 U.S. 483"].note, "read the opinion");
assert.deepStrictEqual(store.reports, {});

const keyA = R.reviewReportKey("Brief A text");
const keyB = R.reviewReportKey("Brief B text");
assert.notStrictEqual(keyA, keyB);

const marksA = R.reviewMarksForReport(store, keyA, ["347 U.S. 483", "100 F.3d 1"]);
assert.strictEqual(marksA["347 U.S. 483"].status, "confirmed", "legacy mark seeds into the report that contains it");
assert.ok(!marksA["100 F.3d 1"]);
assert.ok(!marksA["99 F.4th 1"], "a legacy mark for a citation this report does not contain is not copied in");

const marksB = R.reviewMarksForReport(store, keyB, ["99 F.4th 1"]);
assert.strictEqual(marksB["99 F.4th 1"].status, "recheck");

marksA["347 U.S. 483"] = { status: "corrected", note: "fixed the page" };
assert.strictEqual(store.legacy["347 U.S. 483"].status, "confirmed", "editing one report does not rewrite legacy");
assert.strictEqual(marksB["99 F.4th 1"].status, "recheck");

const beforeClear = R.reviewCheckedCount(
  [{ text: "347 U.S. 483" }, { text: "100 F.3d 1" }], marksA);
assert.deepStrictEqual(beforeClear, { checked: 1, total: 2 });

R.reviewClearReport(store, keyA);
assert.deepStrictEqual(store.reports[keyA].marks, {});
assert.strictEqual(store.legacy["347 U.S. 483"].status, "confirmed", "clear does not delete legacy");
assert.strictEqual(marksB["99 F.4th 1"].status, "recheck", "clear does not touch another report");

const again = R.reviewMarksForReport(store, keyA, ["347 U.S. 483"]);
assert.deepStrictEqual(again, {}, "a cleared report does not re-seed from legacy");

const counts = R.reviewCheckedCount(
  [{ text: "99 F.4th 1" }, { text: "347 U.S. 483" }], marksB);
assert.deepStrictEqual(counts, { checked: 1, total: 2 }, "X/N counts only the marks handed in for this report");

assert.strictEqual(R.reviewIsCheckedStatus(""), false);
assert.strictEqual(R.reviewIsCheckedStatus("confirmed"), true);
const noteOnly = R.reviewCheckedCount([{ text: "A" }], { A: { status: "", note: "looked" } });
assert.strictEqual(noteOnly.checked, 0, "a note without a status is not a completed check");

const mem = {
  _v: null,
  getItem() { return this._v; },
  setItem(k, v) { assert.strictEqual(k, R.REVIEW_STORAGE_KEY); this._v = v; }
};
mem.setItem(R.REVIEW_STORAGE_KEY, JSON.stringify(legacy));
const loaded = R.reviewLoadStore(mem);
assert.strictEqual(loaded.legacy["347 U.S. 483"].status, "confirmed");
R.reviewSaveStore(mem, loaded);
const round = JSON.parse(mem._v);
assert.strictEqual(round.v, 2);
assert.ok(round.legacy["99 F.4th 1"]);

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(app.includes('confirm("Clear hand-check marks for this report?")'), "clear uses confirm()");
assert.ok(html.includes('id="clearMarksBtn"'), "clear button is on the page");
assert.ok(html.includes("button-quiet"), "clear button uses the quiet style");
assert.ok(html.includes("You have checked"), "progress sentence is on the page or set from the same wording");
assert.ok(app.includes("You have checked "), "progress wording is built in app.js");
assert.ok(!html.includes("briefing.js"), "briefing.js is not loaded");
assert.ok(!fs.existsSync(path.join(__dirname, "..", "briefing.js")), "briefing.js is deleted");

console.log("legal review tests passed");
