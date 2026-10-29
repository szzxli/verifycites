/* Hand-check marks for the legal report. Browser localStorage only.
   Nothing here is sent to a server.

   The stored value under lcc-human-review-v1 used to be one global map
   from citation text to {status, note}. Those marks were not tied to a
   report, so a citation marked in one paste showed up on every later
   paste that contained the same text.

   v2 scopes marks per report. The report key is a hash of the checker
   input (the text that was extracted). Existing global marks are copied
   into legacy and seeded into a report the first time that report is
   opened, only for citation texts that report actually contains. Later
   edits stay on that report. Clearing a report empties that report's
   bucket and does not delete legacy, so a different report can still
   inherit a mark that was never cleared there. */
var REVIEW_STORAGE_KEY = "lcc-human-review-v1";

function reviewHash(str) {
  var h = 0x811c9dc5;
  var s = String(str == null ? "" : str);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

function reviewReportKey(inputText) {
  return reviewHash(String(inputText == null ? "" : inputText));
}

function reviewLooksLikeFlatMarks(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (parsed.v === 2 && parsed.reports && typeof parsed.reports === "object") return false;
  var keys = Object.keys(parsed);
  if (!keys.length) return false;
  return keys.every(function (k) {
    var v = parsed[k];
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    return Object.keys(v).every(function (field) { return field === "status" || field === "note"; });
  });
}

function reviewMigrate(parsed) {
  if (parsed && parsed.v === 2 && parsed.reports && typeof parsed.reports === "object") {
    if (!parsed.legacy || typeof parsed.legacy !== "object" || Array.isArray(parsed.legacy)) parsed.legacy = {};
    return parsed;
  }
  var store = { v: 2, legacy: {}, reports: {} };
  if (reviewLooksLikeFlatMarks(parsed)) {
    Object.keys(parsed).forEach(function (k) {
      store.legacy[k] = { status: parsed[k].status || "", note: parsed[k].note || "" };
    });
  } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length) {
    store.preserved = parsed;
  }
  return store;
}

function reviewFreshStore() {
  return { v: 2, legacy: {}, reports: {} };
}

function reviewLoadStore(storage) {
  try {
    var raw = storage.getItem(REVIEW_STORAGE_KEY);
    if (!raw) return reviewFreshStore();
    return reviewMigrate(JSON.parse(raw));
  } catch (e) {
    return reviewFreshStore();
  }
}

function reviewSaveStore(storage, store) {
  try { storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(store || reviewFreshStore())); } catch (e) { /* private mode */ }
}

function reviewCopyMark(mark) {
  mark = mark || {};
  return { status: mark.status || "", note: mark.note || "" };
}

function reviewMarksForReport(store, key, citeTexts) {
  store.reports = store.reports || {};
  store.legacy = store.legacy || {};
  var bucket = store.reports[key];
  if (!bucket || typeof bucket !== "object") {
    bucket = { seeded: true, marks: {} };
    (citeTexts || []).forEach(function (text) {
      if (!text || !store.legacy[text]) return;
      bucket.marks[text] = reviewCopyMark(store.legacy[text]);
    });
    store.reports[key] = bucket;
  }
  if (!bucket.marks || typeof bucket.marks !== "object") bucket.marks = {};
  return bucket.marks;
}

function reviewClearReport(store, key) {
  store.reports = store.reports || {};
  store.reports[key] = { seeded: true, marks: {} };
  return store.reports[key].marks;
}

function reviewIsCheckedStatus(status) {
  return status === "confirmed" || status === "corrected" || status === "recheck";
}

function reviewCheckedCount(rows, marks) {
  var list = rows || [];
  var checked = 0;
  list.forEach(function (row) {
    var mark = (marks || {})[row.text] || {};
    if (reviewIsCheckedStatus(mark.status)) checked++;
  });
  return { checked: checked, total: list.length };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REVIEW_STORAGE_KEY, reviewHash, reviewReportKey, reviewLooksLikeFlatMarks,
    reviewMigrate, reviewFreshStore, reviewLoadStore, reviewSaveStore,
    reviewMarksForReport, reviewClearReport, reviewIsCheckedStatus, reviewCheckedCount
  };
}
