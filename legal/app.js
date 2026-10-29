/* Browser UI (v2). Citation extraction stays local: the checker makes NO
   network calls. The translation viewer is OFF by default: it only calls
   a user-supplied LibreTranslate-compatible endpoint, and with no endpoint
   it shows an explanation instead of inventing a translation. */
var currentLang = "en";
function T() { return I18N[currentLang] || I18N.en; }
function esc(s) {
  return String(s || "").replace(/[&<>\"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/* Phase 4A: silent usage counts via the existing GoatCounter script.
   Fixed event names ONLY — never citation text, brief content, case
   names, or any user input. Guarded: a no-op when GoatCounter is
   blocked or absent, and it never throws. The full event dictionary
   lives in docs/analytics.md; this list is the single enforcement
   point for the legal app. */
var VC_EVENTS = ["legal-extract", "legal-report-download", "legal-human-review-set", "legal-reverify", "legal-news-click", "legal-review-complete"];
function vcCount(name) {
  try {
    if (VC_EVENTS.indexOf(name) < 0) return;
    var gc = (typeof window !== "undefined") ? window.goatcounter : null;
    if (gc && typeof gc.count === "function") gc.count({ path: name, event: true });
  } catch (e) { /* analytics must never break the tool */ }
}

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  try { localStorage.setItem("vc-lang", lang); } catch (e) {}
  document.documentElement.lang = lang;
  document.title = T().pageTitle;
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = T()[el.getAttribute("data-i18n")];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
    el.placeholder = T()[el.getAttribute("data-i18n-placeholder")];
  });
  var sel = document.getElementById("lang");
  if (sel) sel.value = lang;
  if (window.__lastResults) render(window.__lastResults);
  if (window.__transRows) renderTrans(window.__transRows);
}

function anomalyText(flags) {
  var t = T();
  return (flags || []).filter(function (fl) {
    return fl === "impossibleYear" || fl === "impossibleVolume";
  }).map(function (fl) {
    return fl === "impossibleYear" ? (t.reportFlagImpossibleYear || "Impossible year")
      : (t.reportFlagImpossibleVolume || "Impossible volume");
  }).join("; ");
}
function render(results) {
  var tbody = document.getElementById("results");
  tbody.innerHTML = "";
  var report = (typeof buildHealthReport === "function") ? buildHealthReport(results) : null;
  results.forEach(function (r, i) {
    var tr = document.createElement("tr");
    var immT = (typeof immClassifyRow === "function") ? immClassifyRow(r) : "unknown";
    var manualLabel = (immT === "bia" || immT === "statute" || immT === "regulation" || immT === "aao" || immT === "fedreg")
      ? T().openSourcePage : T().openCourtListener;
    var flags = (report && report.rows[i]) ? report.rows[i].flags : [];
    var anomaly = anomalyText(flags);
    tr.className = "row-not-checked" + (anomaly ? " row-anomaly" : "");
    tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + esc(r.text)
      + (anomaly ? "<div class=\"anomaly-pill\">" + esc(anomaly) + "</div>" : "")
      + "<div class=\"row-source\" data-source-row=\"" + i + "\"></div></td>"
      + "<td>" + esc(r.caseName) + "</td><td>NOT_CHECKED</td>"
      + "<td>" + esc(standardCitation(r))
      + "<br><button type=\"button\" onclick=\"copyStandardFormat(" + i + ")\">"
      + esc(T().copyFormat) + "</button></td>"
      + "<td><a data-manual-row=\"" + i + "\" href=\"" + esc(r.manualUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(manualLabel) + "</a>"
      + " | <a href=\"" + esc(r.scholarUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(T().searchScholar) + "</a></td>";
    tbody.appendChild(tr);
  });
  var missed = (typeof extractCitations === "function" && extractCitations.lastUnrecognized) || [];
  var box = document.getElementById("unrecognizedBox");
  if (box) {
    if (!missed.length) { box.hidden = true; box.textContent = ""; }
    else {
      box.hidden = false;
      box.textContent = (T().unrecognizedNote || "{n} citation-like passage(s) were not recognized, so this list may be incomplete:")
        .replace("{n}", missed.length) + " " + missed.join("; ");
    }
  }
  if (typeof applyVisibleSources === "function") applyVisibleSources();
  document.getElementById("count").textContent =
    T().countFound.replace("{n}", results.length);
  window.__lastResults = results;
  renderReport(results);
}

/* Citation health report (v1): summary + structure checks only, from
   the extracted rows. No verification, no relevance judgment, no brief
   text stored: downloads are generated in this browser on demand. */
function reportStrings() {
  var t = T();
  return {
    disclaimer: I18N.en.disclaimer, summary: t.reportSummary,
    total: t.reportTotal, byLabel: t.reportByLabel,
    citations: t.reportHeading, manual: t.reportHeading && "Manual check",
    scope: t.reportScopeNote, flags: t.reportThFlags,
    flagDuplicate: t.reportFlagDuplicate, flagMissingYear: t.reportFlagMissingYear,
    flagNoCaseName: t.reportFlagNoCaseName, flagInvalidReporter: t.reportFlagInvalidReporter,
    flagImpossibleYear: t.reportFlagImpossibleYear, flagImpossibleVolume: t.reportFlagImpossibleVolume,
    noFlags: t.reportNoFlags, citation: t.thCitation, caseName: t.thCaseName,
    year: t.reportThYear, pin: t.reportThPin, label: t.thLabel, links: t.thLinks,
    byCategory: t.reportByCategory,
    thCategory: t.reportThCategory, thAnomaly: t.reportThAnomaly,
    thEvidence: t.reportThEvidence, thScope: t.reportThScope, thAction: t.reportThAction,
    noAnomaly: t.reportNoAnomaly, noEvidence: t.reportNoEvidence,
    scopeDisplay: t.reportScopeDisplay, scopeUnknown: t.reportScopeUnknown,
    reportCatMatched: t.reportCatMatched, reportCatFieldMismatch: t.reportCatFieldMismatch,
    reportCatNotFound: t.reportCatNotFound, reportCatCannotDetermine: t.reportCatCannotDetermine,
    reportCatRetrievalFailed: t.reportCatRetrievalFailed,
    reportActionMatched: t.reportActionMatched, reportActionFieldMismatch: t.reportActionFieldMismatch,
    reportActionNotFound: t.reportActionNotFound, reportActionCannotDetermine: t.reportActionCannotDetermine,
    reportActionRetrievalFailed: t.reportActionRetrievalFailed,
    reportThHumanStatus: t.reportThHumanStatus, reportHumanNotSet: t.reportHumanNotSet,
    reportHumanConfirmed: t.reportHumanConfirmed, reportHumanCorrected: t.reportHumanCorrected,
    reportHumanRecheck: t.reportHumanRecheck, reportHumanSummary: t.reportHumanSummary,
    reportBasisHeading: t.reportBasisHeading, reportBasisBrowserChecked: t.reportBasisBrowserChecked,
    reportBasisBrowserSource: t.reportBasisBrowserSource, reportBasisMixed: t.reportBasisMixed,
    reportBasisRunTime: t.reportBasisRunTime, reportBasisItemTime: t.reportBasisItemTime
  };
}

/* ---- Phase 2: human review status, browser-local only ----
   Stored in localStorage under REVIEW_STORAGE_KEY (see review.js).
   Marks are scoped to the current report, a hash of the checker input.
   A mark never changes the machine label or category, and it never
   leaves this browser. */
function currentReviewKey() {
  var input = document.getElementById("input");
  return reviewReportKey(input ? input.value : "");
}
function currentReviewCites() {
  var rows = (window.__lastReport && window.__lastReport.rows) || window.__lastResults || [];
  return rows.map(function (r) { return r.text || ""; });
}
function humanReviewLoad() {
  var store = reviewLoadStore(localStorage);
  var marks = reviewMarksForReport(store, currentReviewKey(), currentReviewCites());
  reviewSaveStore(localStorage, store);
  return marks;
}
function humanReviewFor(map, text) {
  var v = (map || {})[text] || {};
  return { status: HUMAN_STATUSES.indexOf(v.status) >= 0 ? v.status : "", note: v.note || "" };
}
function handCheckProgressText(rows, marks) {
  var c = reviewCheckedCount(rows, marks);
  return "You have checked " + c.checked + " of " + c.total + " rows by hand";
}
function onHumanReviewChange() {
  var store = reviewLoadStore(localStorage);
  var rows = (window.__lastReport && window.__lastReport.rows) || [];
  var marks = reviewMarksForReport(store, currentReviewKey(), currentReviewCites());
  var before = reviewCheckedCount(rows, marks).checked;
  document.querySelectorAll("[data-review]").forEach(function (sel) {
    var idx = parseInt(sel.getAttribute("data-review"), 10);
    var row = rows[idx] || null;
    if (!row) return;
    var noteEl = document.querySelector("[data-note=\"" + idx + "\"]");
    var entry = { status: sel.value, note: noteEl ? noteEl.value : "" };
    if (!entry.status && !entry.note) delete marks[row.text];
    else marks[row.text] = entry;
  });
  reviewSaveStore(localStorage, store);
  var after = reviewCheckedCount(rows, marks).checked;
  vcCount("legal-human-review-set");
  if (rows.length && after === rows.length && before < rows.length) vcCount("legal-review-complete");
  if (window.__lastResults) renderReport(window.__lastResults);
}
function onHandToggle(idx) {
  var box = document.querySelector("[data-hand=\"" + idx + "\"]");
  var sel = document.querySelector("[data-review=\"" + idx + "\"]");
  if (!box || !sel) return;
  if (box.checked) {
    if (!reviewIsCheckedStatus(sel.value)) sel.value = "confirmed";
  } else {
    sel.value = "";
  }
  onHumanReviewChange();
}
function clearHandMarks() {
  if (!window.confirm("Clear hand-check marks for this report?")) return;
  var store = reviewLoadStore(localStorage);
  reviewClearReport(store, currentReviewKey());
  reviewSaveStore(localStorage, store);
  if (window.__lastResults) renderReport(window.__lastResults);
}
function onReverify(idx) {
  var editEl = document.querySelector("[data-edit=\"" + idx + "\"]");
  var results = window.__lastResults || [];
  var oldRow = (window.__lastReport && window.__lastReport.rows[idx]) || null;
  if (!editEl || !oldRow || typeof reverifyRow !== "function") return;
  var out = reverifyRow(results, idx, editEl.value, extractCitations);
  if (!out.changed) { editEl.focus(); editEl.select(); return; }
  var store = reviewLoadStore(localStorage);
  var marks = reviewMarksForReport(store, currentReviewKey(), currentReviewCites());
  var entry = marks[oldRow.text];
  if (entry) { delete marks[oldRow.text]; marks[out.row.text] = entry; reviewSaveStore(localStorage, store); }
  render(out.results);
  vcCount("legal-reverify");
}

/* ---- Tier-1 first-seen index (same-origin static file only) ----
   The browser page makes no third-party calls: it reads only
   ../data/tier1-index.json, published by scripts/tier1_poll.py.
   The note states the index's last poll time, labelled as an index
   time, never as a registry timestamp. If the fetch fails, the note
   says the index is unavailable — a stale time is never shown as
   current. Per-row first-seen text appears ONLY on an exact match
   (see tier1FindLegal in report.js); unmatched rows get nothing. */
var __tier1Index = null;
var __tier1Loaded = false;
function tier1Load() {
  if (__tier1Loaded) return Promise.resolve(__tier1Index);
  __tier1Loaded = true;
  return fetch("../data/tier1-index.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("index fetch " + r.status); return r.json(); })
    .then(function (j) { __tier1Index = j; return j; })
    .catch(function () { __tier1Index = null; return null; });
}
function tier1RenderNote() {
  var el = document.getElementById("tier1Note");
  if (!el) return;
  var t = T();
  if (!__tier1Index || !__tier1Index.meta) {
    el.textContent = t.tier1Unavailable || "Tier-1 first-seen index unavailable.";
    return;
  }
  var names = (__tier1Index.meta.sources || []).map(function (x) { return x.name; }).join(", ");
  var time = __tier1Index.meta.last_poll || "";
  el.textContent = (t.tier1Heading || "Tier-1 first-seen index") + ": "
    + (t.tier1Note || "Tier-1 direct sources in this index: {sources}. Index last polled {time} (index time, not a registry timestamp).")
      .replace("{sources}", names).replace("{time}", time);
}
function tier1FindForRow(row) {
  if (!__tier1Index) return null;
  return (typeof tier1FindLegal === "function") ? tier1FindLegal(__tier1Index, row) : null;
}

/* ---- 8 CFR static index (same-origin static file only) ----
   Mirrors the Tier-1 pattern: the page reads only
   ../data/imm-8cfr-index.json, published by scripts/imm8cfr_poll.py.
   A regulation row with an exact section match shows the "Found in
   eCFR Title 8" line; unmatched rows keep their "not yet connected"
   wording. If the fetch fails, every row simply keeps the old
   wording — a missing index is never presented as a negative
   result. */
var __imm8cfrIndex = null;
var __imm8cfrLoaded = false;
function imm8cfrLoad() {
  if (__imm8cfrLoaded) return Promise.resolve(__imm8cfrIndex);
  __imm8cfrLoaded = true;
  return fetch("../data/imm-8cfr-index.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("index fetch " + r.status); return r.json(); })
    .then(function (j) { __imm8cfrIndex = j; return j; })
    .catch(function () { __imm8cfrIndex = null; return null; });
}
function imm8cfrFindForRow(row) {
  if (!__imm8cfrIndex) return null;
  return (typeof imm8cfrFind === "function") ? imm8cfrFind(__imm8cfrIndex, row) : null;
}
function applyVisibleSources() {
  var t = T();
  document.querySelectorAll("[data-source-row]").forEach(function (el) {
    var i = parseInt(el.getAttribute("data-source-row"), 10);
    var row = (window.__lastResults || [])[i];
    if (!row || typeof immSourceLine !== "function") return;
    var type = immClassifyRow(row);
    var cfr = imm8cfrFindForRow(row);
    var ina = immInaFindForRow(row);
    el.textContent = immSourceLine(type, t, row, cfr, ina);
    var link = document.querySelector("[data-manual-row=\"" + i + "\"]");
    if (link && ina && ina.entry) {
      var usc = String(ina.side === "usc" ? ina.rowSection : ina.counterpart).replace(/\([^)]*\)/g, "");
      if (/^\d+[A-Za-z]?$/.test(usc)) link.href = "https://www.law.cornell.edu/uscode/text/8/" + usc;
    }
  });
}
function imm8cfrApplyFound() {
  if (!__imm8cfrIndex) return;
  var t = T();
  document.querySelectorAll("[data-imm8cfr-row]").forEach(function (cell) {
    var ri = parseInt(cell.getAttribute("data-imm8cfr-row"), 10);
    var report = window.__lastReport;
    if (!report || !report.rows || !report.rows[ri]) return;
    var hit = imm8cfrFindForRow(report.rows[ri]);
    if (!hit) return;
    var span = cell.querySelector(".imm-source-line");
    if (!span || span.classList.contains("imm8cfr-applied")) return;
    span.textContent = imm8cfrFoundText(hit, t);
    span.classList.add("imm8cfr-applied");
  });
  applyVisibleSources();
}
/* ---- INA <-> 8 U.S.C. static mapping table (same-origin only) ----
   Mirrors the 8 CFR pattern: the page reads only
   ../data/imm-ina-mapping.json, published by
   scripts/imm-ina-mapping-poll.py from the OLRC Title 8 bulk XML.
   A statute row with an exact section match shows the mapping line;
   unmatched rows keep their "not yet connected" / "cannot confirm"
   wording. If the fetch fails, every row simply keeps the old
   wording — a missing table is never presented as a negative
   result. The browser page itself makes no third-party calls. */
var __immInaIndex = null;
var __immInaLoaded = false;
function immInaLoad() {
  if (__immInaLoaded) return Promise.resolve(__immInaIndex);
  __immInaLoaded = true;
  return fetch("../data/imm-ina-mapping.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("index fetch " + r.status); return r.json(); })
    .then(function (j) { __immInaIndex = j; return j; })
    .catch(function () { __immInaIndex = null; return null; });
}
function immInaFindForRow(row) {
  if (!__immInaIndex) return null;
  return (typeof immInaFind === "function") ? immInaFind(__immInaIndex, row) : null;
}
function immInaApplyFound() {
  if (!__immInaIndex) return;
  var t = T();
  document.querySelectorAll("[data-imm8cfr-row]").forEach(function (cell) {
    var ri = parseInt(cell.getAttribute("data-imm8cfr-row"), 10);
    var report = window.__lastReport;
    if (!report || !report.rows || !report.rows[ri]) return;
    var hit = immInaFindForRow(report.rows[ri]);
    if (!hit) return;
    var span = cell.querySelector(".imm-source-line");
    if (!span || span.classList.contains("immIna-applied")) return;
    span.textContent = immInaMappingText(hit, t);
    span.classList.add("immIna-applied");
  });
  applyVisibleSources();
}
function tier1ApplyFirstSeen() {
  if (!__tier1Index) return;
  var t = T();
  document.querySelectorAll("[data-tier1-row]").forEach(function (cell) {
    var ri = parseInt(cell.getAttribute("data-tier1-row"), 10);
    var report = window.__lastReport;
    if (!report || !report.rows || !report.rows[ri]) return;
    var hit = tier1FindForRow(report.rows[ri]);
    if (!hit || cell.querySelector(".tier1-firstseen")) return;
    var span = document.createElement("span");
    span.className = "tier1-firstseen";
    span.textContent = tier1FirstSeenText(hit, t);
    cell.appendChild(document.createElement("br"));
    cell.appendChild(span);
  });
}

function renderReport(results) {
  var section = document.getElementById("reportSection");
  if (!section) return;
  if (!results || !results.length) { section.hidden = true; return; }
  var report = buildHealthReport(results);
  window.__lastReport = report;
  var t = T();
  var byLabel = Object.keys(report.byLabel).map(function (label) {
    return label + ": " + report.byLabel[label];
  }).join(" · ");
  var flagParts = REPORT_FLAG_KEYS.filter(function (f) { return report.flagCounts[f]; })
    .map(function (f) {
      var label = { duplicate: t.reportFlagDuplicate, missingYear: t.reportFlagMissingYear,
        noCaseName: t.reportFlagNoCaseName, invalidReporter: t.reportFlagInvalidReporter,
        impossibleYear: t.reportFlagImpossibleYear, impossibleVolume: t.reportFlagImpossibleVolume }[f];
      return label + ": " + report.flagCounts[f];
    });
  var catLabels = { matched: t.reportCatMatched, fieldMismatch: t.reportCatFieldMismatch,
    notFound: t.reportCatNotFound, cannotDetermine: t.reportCatCannotDetermine,
    retrievalFailed: t.reportCatRetrievalFailed };
  var catParts = Object.keys(report.byCategory || {}).map(function (c) {
    return catLabels[c] + ": " + report.byCategory[c];
  });
  var humanMap = humanReviewLoad();
  var progress = document.getElementById("handCheckProgress");
  if (progress) progress.textContent = handCheckProgressText(report.rows, humanMap);
  var humanCounts = (typeof humanStatusCounts === "function")
    ? humanStatusCounts(report, humanMap) : { confirmed: 0, corrected: 0, recheck: 0 };
  var humanLabels = { confirmed: t.reportHumanConfirmed, corrected: t.reportHumanCorrected,
    recheck: t.reportHumanRecheck };
  var humanParts = ["confirmed", "corrected", "recheck"].filter(function (s) { return humanCounts[s]; })
    .map(function (s) { return humanLabels[s] + ": " + humanCounts[s]; });
  document.getElementById("reportSummary").textContent =
    t.reportTotal + ": " + report.total + " · " + t.reportByLabel + ": " + byLabel
    + (catParts.length ? " · " + t.reportByCategory + ": " + catParts.join("; ") : "")
    + (flagParts.length ? " · " + t.reportStructureHeading + ": " + flagParts.join("; ") : "")
    + (humanParts.length ? " · " + t.reportHumanSummary + ": " + humanParts.join("; ") : "");
  /* Phase 3: check-basis paragraph. Run time is this browser's local
     time when the report was rendered — labelled as such, never a
     registry timestamp. Per-item times are not recorded (see
     reportCheckBasis). */
  tier1Load().then(function () { tier1RenderNote(); tier1ApplyFirstSeen(); });
  imm8cfrLoad().then(function () { imm8cfrApplyFound(); });
  immInaLoad().then(function () { immInaApplyFound(); });
  var basisEl = document.getElementById("reportBasis");
  if (basisEl && typeof reportCheckBasis === "function") {
    var basis = reportCheckBasis(report, reportStrings(), new Date().toLocaleString());
    basisEl.textContent = basis.heading + ": " + basis.checked + " " + basis.source
      + " " + basis.runTime + " " + basis.itemTime;
  }
  var tbody = document.getElementById("reportRows");
  tbody.innerHTML = "";
  report.rows.forEach(function (row, ri) {
    var flagText = row.flags.length ? row.flags.map(function (fl) {
      return { duplicate: t.reportFlagDuplicate, missingYear: t.reportFlagMissingYear,
        noCaseName: t.reportFlagNoCaseName, invalidReporter: t.reportFlagInvalidReporter,
        impossibleYear: t.reportFlagImpossibleYear, impossibleVolume: t.reportFlagImpossibleVolume }[fl];
    }).join("; ") : t.reportNoFlags;
    var cat = (typeof reportDisplayCategory === "function")
      ? reportDisplayCategory(row.label, row.caseName) : "cannotDetermine";
    var catActions = { matched: t.reportActionMatched, fieldMismatch: t.reportActionFieldMismatch,
      notFound: t.reportActionNotFound, cannotDetermine: t.reportActionCannotDetermine,
      retrievalFailed: t.reportActionRetrievalFailed };
    var anomaly = row.flags.length ? flagText : t.reportNoAnomaly;
    var evParts = [];
    if (row.caseName) evParts.push(t.thCaseName + ": " + row.caseName);
    if (row.year) evParts.push(t.reportThYear + ": " + row.year);
    if (row.pinCite) evParts.push(t.reportThPin + ": " + row.pinCite);
    var evidence = evParts.length ? evParts.join("; ") : "";
    /* Immigration source line (display-only, never a check result):
       appended to the Matching evidence cell so every row names the
       system it belongs to — or says it could not be routed. */
    var immType = row.immType || (typeof immClassifyRow === "function" ? immClassifyRow(row) : "unknown");
    var immHtml = "<br><span class=\"imm-source-line\">"
      + esc(typeof immSourceLine === "function" ? immSourceLine(immType, t, row, imm8cfrFindForRow(row), immInaFindForRow(row)) : "")
      + "</span>"
      + (typeof immLinkKeysFor === "function" ? immLinkKeysFor(immType, row).map(function (l) {
          return " <a href=\"" + esc(l.url) + "\" target=\"_blank\" rel=\"noopener\">" + esc(t[l.key] || l.key) + "</a>";
        }).join(" | ") : "");
    var scope = row.label === "NOT_CHECKED" ? t.reportScopeDisplay : t.reportScopeUnknown;
    var human = humanReviewFor(humanMap, row.text);
    var humanOptions = [["", t.reportHumanNotSet], ["confirmed", t.reportHumanConfirmed],
      ["corrected", t.reportHumanCorrected], ["recheck", t.reportHumanRecheck]].map(function (o) {
      return "<option value=\"" + o[0] + "\"" + (human.status === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("");
    var tr = document.createElement("tr");
    var handChecked = (typeof reviewIsCheckedStatus === "function") && reviewIsCheckedStatus(human.status);
    tr.innerHTML = "<td class=\"col-extra\">" + row.index + "</td><td>" + esc(row.text)
      + "<div class=\"hand-check-line\"><label><input type=\"checkbox\" data-hand=\"" + ri + "\""
      + (handChecked ? " checked" : "") + "> Checked by hand</label></div></td>"
      + "<td>" + esc(row.caseName) + "</td><td>" + esc(row.label) + "</td>"
      + "<td class=\"col-extra\">" + esc(row.year) + "</td>"
      + "<td class=\"col-extra\">" + esc(row.pinCite) + "</td><td class=\"col-extra\">" + esc(flagText) + "</td>"
      + "<td class=\"col-extra\">" + esc(catLabels[cat]) + "</td><td class=\"col-extra\">" + esc(anomaly) + "</td>"
      + "<td data-tier1-row=\"" + ri + "\" data-imm8cfr-row=\"" + ri + "\">" + esc(evidence) + immHtml + "</td><td class=\"col-extra\">" + esc(scope) + "</td>"
      + "<td class=\"col-extra\">" + esc(catActions[cat]) + "</td>"
      + "<td class=\"col-extra\"><select data-review=\"" + ri + "\" aria-label=\"" + esc(t.reportThHumanStatus) + "\">" + humanOptions + "</select>"
      + "<br><input data-note=\"" + ri + "\" value=\"" + esc(human.note) + "\" placeholder=\"" + esc(t.reportNotePlaceholder) + "\" aria-label=\"" + esc(t.reportHumanNote) + "\"></td>"
      + "<td class=\"col-extra\"><input data-edit=\"" + ri + "\" value=\"" + esc(row.text) + "\" placeholder=\"" + esc(t.reportEditPlaceholder) + "\" aria-label=\"" + esc(t.reportThReverify) + "\">"
      + "<br><button type=\"button\" data-reverify=\"" + ri + "\">" + esc(t.reportThReverify) + "</button></td>"
      + "<td><a href=\"" + esc(row.manualUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc((immType === "bia" || immType === "statute" || immType === "regulation" || immType === "aao" || immType === "fedreg") ? t.openSourcePage : t.openCourtListener) + "</a>"
      + " | <a href=\"" + esc(row.scholarUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(t.searchScholar) + "</a></td>";
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-review]").forEach(function (sel) {
    sel.addEventListener("change", onHumanReviewChange);
  });
  tbody.querySelectorAll("[data-hand]").forEach(function (box) {
    box.addEventListener("change", function () {
      onHandToggle(parseInt(box.getAttribute("data-hand"), 10));
    });
  });
  tbody.querySelectorAll("[data-note]").forEach(function (inp) {
    inp.addEventListener("change", onHumanReviewChange);
  });
  tbody.querySelectorAll("[data-reverify]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      onReverify(parseInt(btn.getAttribute("data-reverify"), 10));
    });
  });
  section.hidden = false;
  applyReportColumns();
}

function applyReportColumns() {
  var wrap = document.getElementById("reportTableWrap");
  var btn = document.getElementById("reportColumnsToggle");
  var showAll = !!window.__reportShowAll;
  if (wrap) wrap.classList.toggle("report-collapsed", !showAll);
  if (btn) btn.textContent = showAll ? T().showFewerColumns : T().showAllColumns;
}

function toggleReportColumns() {
  window.__reportShowAll = !window.__reportShowAll;
  applyReportColumns();
}

function downloadBlob(content, filename, type) {
  var blob = new Blob([content], { type: type });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadReportMd() {
  if (!window.__lastReport) return;
  vcCount("legal-report-download");
  downloadBlob(healthReportMarkdown(window.__lastReport, reportStrings(), humanReviewLoad(),
    new Date().toLocaleString(), tier1FindForRow, imm8cfrFindForRow, immInaFindForRow),
    "citation-health-report.md", "text/markdown");
}

function downloadReportHtml() {
  if (!window.__lastReport) return;
  vcCount("legal-report-download");
  downloadBlob(healthReportHtml(window.__lastReport, reportStrings(), humanReviewLoad(),
    new Date().toLocaleString(), tier1FindForRow, imm8cfrFindForRow, immInaFindForRow),
    "citation-health-report.html", "text/html");
}

function showQueryPanel(original, english, status) {
  var orig = document.getElementById("origQuery");
  var en = document.getElementById("enQuery");
  var st = document.getElementById("queryStatus");
  if (orig) orig.textContent = original;
  if (en) en.value = english || "";
  if (st) st.textContent = status || "";
  window.__lastQuery = { original: original, english: english || "" };
}

/* Search flow (v2 query auto-translation): on a non-English UI, clicking
   search automatically translates the query to English and searches the
   English query -- the user never has to translate by hand. The original
   and the English query are both shown, and the English query is editable
   for a manual re-search. Citation-format content (volumes, pages,
   reporter abbreviations) and numbers are masked before translation and
   restored verbatim. With no endpoint, or on translation failure, NO
   English query is generated and NO English search is claimed: extraction
   below runs on the original query only, and the status says so. */
async function check() {
  var text = document.getElementById("input").value || "";
  if (text.trim()) vcCount("legal-extract");
  if (currentLang === "en") {
    showQueryPanel(text, text, T().queryEnglishNote);
    render(extractCitations(text));
    return;
  }
  var endpoint = "";
  var mt = document.getElementById("mtEndpoint");
  if (mt) endpoint = (mt.value || "").trim();
  if (!endpoint) {
    showQueryPanel(text, "", T().queryNoEndpoint);
    render(extractCitations(text));
    return;
  }
  var rows = await translateParagraphs([text],
    { endpoint: endpoint, source: currentLang, target: "en" });
  if (!rows[0] || rows[0].error || rows[0].translation == null) {
    showQueryPanel(text, "", T().queryTranslateFailed);
    render(extractCitations(text));
    return;
  }
  showQueryPanel(text, rows[0].translation, T().queryTranslatedNote);
  render(extractCitations(rows[0].translation));
}

function searchEnQuery() {
  var q = (document.getElementById("enQuery").value || "");
  if (!q.trim()) return;
  vcCount("legal-extract");
  render(extractCitations(q));
  var st = document.getElementById("queryStatus");
  if (st) st.textContent = T().queryEditedSearch;
}

function openFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    document.getElementById("input").value = reader.result || "";
    check();
  };
  reader.readAsText(file);
}

function copyStandardFormat(i) {
  var r = (window.__lastResults || [])[i];
  if (!r) return;
  var text = standardCitation(r);
  var done = function (ok) {
    document.getElementById("count").textContent = ok ? T().copiedFormat : T().copyFormatFailed;
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); },
      function () { done(false); });
  } else {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    done(ok);
  }
}

function exportMarkdown() {
  var results = window.__lastResults || [];
  var lines = ["> **" + I18N.en.disclaimer + "**"];
  if (currentLang !== "en") lines.push("> " + T().disclaimerNote);
  lines.push("");
  results.forEach(function (r) {
    lines.push("- [ ] NOT_CHECKED \u2014 " + r.text
      + (r.caseName ? " (" + r.caseName + ")" : "")
      + " \u2014 " + r.manualUrl);
  });
  navigator.clipboard.writeText(lines.join("\n")).then(function () {
    document.getElementById("count").textContent = T().copied;
  });
}

function exportJson() {
  var blob = new Blob([JSON.stringify(window.__lastResults || [], null, 2)],
    { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "legal-cite-check.json";
  a.click();
}

function renderTrans(rows) {
  var tbody = document.getElementById("transResults");
  tbody.innerHTML = "";
  rows.forEach(function (row) {
    var tr = document.createElement("tr");
    var transCell = row.error === "NO_ENDPOINT" ? esc(T().transNoEndpoint)
      : row.error ? esc(row.error) : esc(row.translation);
    tr.innerHTML = "<td>" + esc(row.original) + "</td><td>" + transCell + "</td>";
    tbody.appendChild(tr);
  });
  window.__transRows = rows;
}

async function doTranslate() {
  var text = document.getElementById("opinion").value || "";
  var endpoint = (document.getElementById("mtEndpoint").value || "").trim();
  var target = document.getElementById("mtTarget").value || "es";
  var rows = await translateParagraphs(splitParagraphs(text),
    { endpoint: endpoint, target: target });
  renderTrans(rows);
}
