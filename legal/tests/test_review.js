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
assert.ok(!/window\.confirm\(/.test(app), "clear no longer uses native window.confirm()");
assert.ok(html.includes('id="clearMarksConfirm"'), "clear uses the in-page confirm bar");
assert.ok(html.includes('id="clearMarksBtn"'), "clear button is on the page");
assert.ok(html.includes("button-quiet"), "clear button uses the quiet style");
assert.ok(html.includes("You have checked"), "progress sentence is on the page or set from the same wording");
assert.ok(app.includes("You have checked "), "progress wording is built in app.js");
assert.ok(!html.includes("briefing.js"), "briefing.js is not loaded");
assert.ok(!fs.existsSync(path.join(__dirname, "..", "briefing.js")), "briefing.js is deleted");
assert.ok(html.includes('onclick="clearHandMarks()"'), "Clear my marks click calls clearHandMarks");
assert.ok(html.includes("Your marks are saved in this browser only. Paste the same text again to restore them."));
assert.ok(!html.includes("briefing-audience"), "briefing-audience class is gone");
assert.ok(!/OPTIONAL/i.test(html) || !html.includes("OPTIONAL GUIDE"), "no OPTIONAL GUIDE label");

const briefA = "Brief A text";
const seeded = R.reviewFreshStore();
seeded.reports[keyA] = { seeded: true, marks: { "347 U.S. 483": { status: "confirmed", note: "keep" } } };
seeded.reports[keyB] = { seeded: true, marks: { "99 F.4th 1": { status: "recheck", note: "other" } } };
const mem2 = {
  _v: JSON.stringify(seeded),
  getItem() { return this._v; },
  setItem(k, v) { this._v = v; }
};
// In-page confirm bar (replaces window.confirm): fake elements.
function fakeEl(id, extra) {
  return Object.assign({ id, hidden: id === "clearMarksConfirm", attrs: {}, focused: 0,
    setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused++; lastFocus = id; } }, extra || {});
}
let lastFocus = null;
const els = { clearMarksConfirm: fakeEl("clearMarksConfirm"), clearMarksBtn: fakeEl("clearMarksBtn"),
  clearMarksCancel: fakeEl("clearMarksCancel"), clearMarksYes: fakeEl("clearMarksYes") };
const nativeConfirmCalls = [];
global.localStorage = mem2;
global.reviewLoadStore = R.reviewLoadStore;
global.reviewClearReport = R.reviewClearReport;
global.reviewSaveStore = R.reviewSaveStore;
global.reviewReportKey = R.reviewReportKey;
global.reviewMarksForReport = R.reviewMarksForReport;
global.reviewCheckedCount = R.reviewCheckedCount;
global.reviewIsCheckedStatus = R.reviewIsCheckedStatus;
global.document = {
  documentElement: { lang: "en" },
  title: "",
  getElementById(id) {
    if (id === "input") return { value: briefA };
    return els[id] || null;
  },
  querySelectorAll() { return []; }
};
global.window = {
  confirm(msg) { nativeConfirmCalls.push(msg); return true; },
  __lastResults: [{ text: "347 U.S. 483" }],
  __lastReport: { rows: [{ text: "347 U.S. 483" }] }
};
eval(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"));

// Click "Clear my marks": bar opens, focus moves into it, nothing is cleared yet.
clearHandMarks();
assert.strictEqual(els.clearMarksConfirm.hidden, false, "confirm bar is shown");
assert.strictEqual(lastFocus, "clearMarksCancel", "focus moves into the confirm bar (Cancel)");
assert.strictEqual(els.clearMarksBtn.attrs["aria-expanded"], "true");
assert.strictEqual(JSON.parse(mem2._v).reports[keyA].marks["347 U.S. 483"].status, "confirmed", "opening the bar clears nothing");

// Cancel keeps the marks and closes the bar.
cancelClearHandMarks();
assert.strictEqual(els.clearMarksConfirm.hidden, true, "Cancel closes the bar");
assert.strictEqual(lastFocus, "clearMarksBtn", "focus returns to the Clear my marks button");
let afterCancel = JSON.parse(mem2._v);
assert.strictEqual(afterCancel.reports[keyA].marks["347 U.S. 483"].status, "confirmed", "cancel keeps marks");
assert.strictEqual(R.reviewCheckedCount([{ text: "347 U.S. 483" }], afterCancel.reports[keyA].marks).checked, 1);

// Yes clears only the current report.
clearHandMarks();
confirmClearHandMarks();
assert.strictEqual(els.clearMarksConfirm.hidden, true, "Yes closes the bar");
assert.deepStrictEqual(nativeConfirmCalls, [], "native confirm() is never called");
const afterOk = JSON.parse(mem2._v);
assert.deepStrictEqual(afterOk.reports[keyA].marks, {}, "OK clears only the current report");
assert.strictEqual(afterOk.reports[keyB].marks["99 F.4th 1"].status, "recheck", "other report is kept");
assert.strictEqual(R.reviewCheckedCount([{ text: "347 U.S. 483" }], afterOk.reports[keyA].marks).checked, 0, "X returns to 0");
assert.ok(!JSON.stringify(afterOk).includes(briefA), "the brief text is not stored");

const barAt = html.indexOf('id="clearMarksConfirm"');
const barTag = html.slice(html.lastIndexOf("<div", barAt), html.indexOf(">", barAt) + 1);
assert.ok(/role="alertdialog"/.test(barTag) && /aria-live="assertive"/.test(barTag), "bar has a role and aria-live");
assert.ok(/aria-labelledby="clearMarksConfirmText"/.test(barTag) && /\bhidden\b/.test(barTag), "bar is labelled and hidden by default");
assert.ok(html.includes('<span id="clearMarksConfirmText">Clear marks?</span>'), "bar text");
assert.ok(html.includes('onclick="confirmClearHandMarks()">Yes</button>') && html.includes('onclick="cancelClearHandMarks()">Cancel</button>'), "Yes / Cancel buttons");
assert.ok(/Escape/.test(barTag), "Escape cancels");

console.log("legal review tests passed");
