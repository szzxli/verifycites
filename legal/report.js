/* Citation health report (browser, v1). Local only: no network calls.
   The report summarizes what the extractor found and runs STRUCTURE
   checks on the extracted text itself (duplicates, missing year, no case
   name, unknown reporter). It makes NO judgment about quality, relevance,
   whether a case supports an argument, quote accuracy, or good law.
   In browser mode every row is NOT_CHECKED: nothing is verified here. */
var REPORT_FLAG_KEYS = ["duplicate", "missingYear", "noCaseName", "invalidReporter"];

/* Display-only category derivation. This does NOT change any engine
   result: it only maps the existing label (plus whether a case name was
   supplied, for CITED) onto the five display categories. Browser rows are
   all NOT_CHECKED, so they all map to "cannotDetermine"; CLI-style rows
   fed in with other labels map per the v2 mapping draft. */
var REPORT_CATEGORY_KEYS = {
  matched: "reportCatMatched", fieldMismatch: "reportCatFieldMismatch",
  notFound: "reportCatNotFound", cannotDetermine: "reportCatCannotDetermine",
  retrievalFailed: "reportCatRetrievalFailed"
};
var REPORT_CATEGORY_ACTIONS = {
  matched: "reportActionMatched", fieldMismatch: "reportActionFieldMismatch",
  notFound: "reportActionNotFound", cannotDetermine: "reportActionCannotDetermine",
  retrievalFailed: "reportActionRetrievalFailed"
};
function reportDisplayCategory(label, caseName) {
  switch (label) {
    case "VERIFIED": return "matched";
    case "MISMATCH": return "fieldMismatch";
    case "INVALID_REPORTER": return "fieldMismatch";
    case "NOT_FOUND": return "notFound";
    case "RATE_LIMITED": return "retrievalFailed";
    case "CITED": return caseName ? "fieldMismatch" : "cannotDetermine";
    default: return "cannotDetermine";
  }
}

/* ---- Tier-1 first-seen matching (display-only) ----
   Matches a report row against the static Tier-1 first-seen index
   (data/tier1-index.json, published by scripts/tier1_poll.py) on an
   EXACT basis only: the normalised case name must be identical
   (modulo "et al." party suffixes, which index titles and extracted
   case names carry inconsistently), and
   when both the row and the index item carry a year, the years must
   agree. A match means only that the poller first observed an item
   with this case name at the named direct source on the stated date;
   it is NOT a verification result, NOT an existence proof, and NOT a
   claim about the cited case. No match produces no text at all:
   absence from the index is never worded as "not found". */
function tier1NormalizeCaseName(s) {
  return String(s || "").toLowerCase().replace(/\bet\s+al\b/g, " ").replace(/\betal\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function tier1FindLegal(index, row) {
  if (!index || !index.items || !row || !row.caseName) return null;
  var name = tier1NormalizeCaseName(row.caseName);
  if (!name) return null;
  var year = row.year ? String(row.year) : null;
  for (var i = 0; i < index.items.length; i++) {
    var it = index.items[i];
    if (it.kind !== "legal") continue;
    if (tier1NormalizeCaseName(it.title_or_case_name) !== name) continue;
    if (year && it.date && String(it.date).slice(0, 4) !== year) continue;
    return it;
  }
  return null;
}
function tier1FirstSeenText(item, t) {
  if (!item || !item.first_seen) return null;
  var tpl = (t && t.tier1FirstSeen) || "First seen at {source} on {date}";
  return tpl.replace("{source}", item.source).replace("{date}", String(item.first_seen).slice(0, 10));
}

function buildHealthReport(results) {
  var counts = {};
  var catCounts = {};
  var seen = {};
  var flagCounts = { duplicate: 0, missingYear: 0, noCaseName: 0, invalidReporter: 0 };
  var rows = [];
  (results || []).forEach(function (r, i) {
    var label = r.label || "NOT_CHECKED";
    counts[label] = (counts[label] || 0) + 1;
    var category = reportDisplayCategory(label, r.caseName);
    catCounts[category] = (catCounts[category] || 0) + 1;
    var key = [r.volume || "", (r.reporter || "").toLowerCase(), r.page || ""].join(" ");
    var isDup = !!seen[key];
    seen[key] = true;
    var knownReporter = true;
    if (typeof REPORTERS !== "undefined" && r.reporter) {
      knownReporter = REPORTERS.some(function (rep) { return rep.abbreviation === r.reporter; });
    }
    var flags = [];
    if (isDup) flags.push("duplicate");
    if (!r.year) flags.push("missingYear");
    if (!r.caseName) flags.push("noCaseName");
    if (!knownReporter) flags.push("invalidReporter");
    flags.forEach(function (f) { flagCounts[f] += 1; });
    rows.push({
      index: i + 1, text: r.text, volume: r.volume, reporter: r.reporter,
      page: r.page, pinCite: r.pinCite || null, caseName: r.caseName || null,
      year: r.year || null, label: label, category: category, flags: flags,
      manualUrl: r.manualUrl, scholarUrl: r.scholarUrl
    });
  });
  return { total: rows.length, byLabel: counts, byCategory: catCounts,
    flagCounts: flagCounts, rows: rows };
}

/* Display fields for one row, from existing row data only. Nothing here
   invents evidence: evidence lists only extracted fields that are present;
   scope is the browser scope for NOT_CHECKED rows and "not recorded" for
   any other label, whose original check is not in this report. */
function _rowDisplay(row, t) {
  var f = function (k, d) { return (t && t[k]) || d; };
  var category = row.category || reportDisplayCategory(row.label, row.caseName);
  var flags = row.flags || [];
  var anomaly = flags.length
    ? flags.map(function (fl) { return _flagLabel(fl, t); }).join("; ")
    : f("noAnomaly", "None");
  var parts = [];
  if (row.caseName) parts.push(f("caseName", "Case name in text") + ": " + row.caseName);
  if (row.year) parts.push(f("year", "Year") + ": " + row.year);
  if (row.pinCite) parts.push(f("pin", "Pin cite") + ": " + row.pinCite);
  var evidence = parts.length ? parts.join("; ") : f("noEvidence", "No evidence extracted");
  var scope = row.label === "NOT_CHECKED"
    ? f("scopeDisplay", "Browser format and completeness check only \u2014 no online lookup was made.")
    : f("scopeUnknown", "Check scope not recorded in this report; see the original check.");
  return {
    category: category,
    categoryLabel: f(REPORT_CATEGORY_KEYS[category], category),
    anomaly: anomaly,
    evidence: evidence,
    scope: scope,
    action: f(REPORT_CATEGORY_ACTIONS[category], category)
  };
}

/* ---- Phase 3: check basis (display-only, never invents a timestamp) ----
   What was actually checked, what source it came from, and when. The only
   time this report can state honestly is the browser's local run time of
   the report itself (supplied by the caller as a string); it is NEVER a
   registry or database timestamp. Per-item check times are not recorded
   in this report at all, and are shown as such. For rows that came from
   another check (any label other than NOT_CHECKED), the original basis
   is not in this report, so the basis section says so instead of
   guessing it. */
function reportCheckBasis(report, t, runTime) {
  var f = function (k, d) { return (t && t[k]) || d; };
  var rows = (report && report.rows) || [];
  var allBrowser = rows.every(function (row) { return (row.label || "NOT_CHECKED") === "NOT_CHECKED"; });
  var runText = runTime
    ? f("reportBasisRunTime", "Report generated in this browser at {t} (your browser's local run time, not a registry or database timestamp).").replace("{t}", runTime)
    : f("reportBasisItemTime", "Per-item check time: not recorded in this report.");
  return {
    heading: f("reportBasisHeading", "Check basis"),
    checked: allBrowser
      ? f("reportBasisBrowserChecked", "What was checked: text extraction from the text you pasted, plus structure checks on the extracted citations (duplicates, missing year, no case name, unknown reporter). No online lookup was made in browser mode.")
      : f("reportBasisMixed", "What was checked: this report mixes rows from different checks. Browser rows were checked by text extraction only; for rows from another check, the basis is not recorded in this report \u2014 see the original check."),
    source: allBrowser
      ? f("reportBasisBrowserSource", "Data source: the text you pasted only. No external database was consulted.")
      : f("reportScopeUnknown", "Check scope not recorded in this report; see the original check."),
    runTime: runText,
    itemTime: f("reportBasisItemTime", "Per-item check time: not recorded in this report.")
  };
}

function _categoryCounts(report) {
  if (report.byCategory) return report.byCategory;
  var counts = {};
  (report.rows || []).forEach(function (row) {
    var c = row.category || reportDisplayCategory(row.label, row.caseName);
    counts[c] = (counts[c] || 0) + 1;
  });
  return counts;
}

/* ---- Phase 2: human review status (display-only, never overwrites the
   machine result) ----
   A human status is a SEPARATE mark the reader sets by hand (confirmed by
   hand / corrected / needs recheck), stored by the page in localStorage
   keyed by citation text and shown in its OWN column beside the machine
   Category. Changing it never changes a row's label or category: those
   come only from buildHealthReport. `human` may be a lookup function
   row -> {status, note}, or a plain object keyed by row text. */
var HUMAN_STATUSES = ["", "confirmed", "corrected", "recheck"];
var HUMAN_STATUS_KEYS = { "": "reportHumanNotSet",
  confirmed: "reportHumanConfirmed", corrected: "reportHumanCorrected",
  recheck: "reportHumanRecheck" };
function humanFor(human, row) {
  if (!human) return { status: "", note: "" };
  var v = (typeof human === "function") ? human(row) : human[row.text];
  v = v || {};
  return { status: HUMAN_STATUSES.indexOf(v.status) >= 0 ? v.status : "", note: v.note || "" };
}
function humanStatusLabel(status, t) {
  var f = function (k, d) { return (t && t[k]) || d; };
  var defaults = { "": "Not set", confirmed: "Confirmed by hand",
    corrected: "Corrected", recheck: "Needs recheck" };
  return f(HUMAN_STATUS_KEYS[status] || "reportHumanNotSet", defaults[status] || "Not set");
}
function humanStatusCounts(report, human) {
  var counts = { confirmed: 0, corrected: 0, recheck: 0 };
  (report.rows || []).forEach(function (row) {
    var h = humanFor(human, row);
    if (counts[h.status] !== undefined) counts[h.status] += 1;
  });
  return counts;
}
function humanSummaryText(report, human, t) {
  var f = function (k, d) { return (t && t[k]) || d; };
  var counts = humanStatusCounts(report, human);
  var parts = [];
  ["confirmed", "corrected", "recheck"].forEach(function (s) {
    if (counts[s]) parts.push(humanStatusLabel(s, t) + ": " + counts[s]);
  });
  return parts.length ? f("reportHumanSummary", "Human review") + ": " + parts.join("; ") : "";
}
/* Re-verify: re-run the browser extractor over corrected citation text
   and swap that row for the first citation the extractor finds. Machine
   fields (label, category, structure flags) are recomputed from the new
   text by buildHealthReport; the human mark is NOT carried by this
   function (the page moves it from the old text to the new one). If the
   extractor finds nothing, the results are returned unchanged. */
function reverifyRow(results, index, newText, extractFn) {
  if (!results || index < 0 || index >= results.length) {
    return { results: results, changed: false, row: null };
  }
  var found = extractFn ? extractFn(newText || "") : [];
  if (!found || !found.length) {
    return { results: results, changed: false, row: null };
  }
  var next = results.slice();
  next[index] = found[0];
  return { results: next, changed: true, row: found[0] };
}

function _escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>\"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function _flagLabel(flag, t) {
  var map = { duplicate: t.flagDuplicate, missingYear: t.flagMissingYear,
    noCaseName: t.flagNoCaseName, invalidReporter: t.flagInvalidReporter };
  return map[flag] || flag;
}

/* t: translation strings for the current language, with English fallbacks
   for any key the caller does not supply. `human` (optional) is the
   human-review lookup described above; its column is separate from the
   machine Category and never merged into it. */
function healthReportMarkdown(report, t, human, runTime, tier1Find) {
  t = t || {};
  var f = function (k, d) { return t[k] || d; };
  // Fixed English notice, in English in every language version: the report
  // is forwarded onward, so this line must not be misread in translation.
  var lines = ["> **This is a format and completeness check, not a verification result. It is not legal advice.**"];
  lines.push("> For a full check, use the command-line tool: https://github.com/szzxli/legal-cite-check#full-check-with-courtlistener-cli");
  lines.push("> **" + f("disclaimer", "Not legal advice.") + "**");
  lines.push("> " + f("scope", "This report does not check whether cases support your argument, whether quotes are accurate, or whether a case is still good law."));
  lines.push("");
  lines.push("## " + f("summary", "Summary"));
  lines.push(f("total", "Total citations") + ": " + report.total);
  Object.keys(report.byLabel).forEach(function (label) {
    lines.push("- " + label + ": " + report.byLabel[label]);
  });
  var catCounts = _categoryCounts(report);
  Object.keys(catCounts).forEach(function (cat) {
    lines.push("- " + f("byCategory", "By category") + ": "
      + f(REPORT_CATEGORY_KEYS[cat], cat) + ": " + catCounts[cat]);
  });
  var humanSummary = humanSummaryText(report, human, t);
  if (humanSummary) lines.push("- " + humanSummary);
  var basis = reportCheckBasis(report, t, runTime);
  lines.push("");
  lines.push("## " + basis.heading);
  lines.push(basis.checked);
  lines.push(basis.source);
  lines.push(basis.runTime);
  lines.push(basis.itemTime);
  lines.push("");
  lines.push("## " + f("citations", "Citations"));
  report.rows.forEach(function (row) {
    var flagText = (row.flags || []).length
      ? row.flags.map(function (fl) { return _flagLabel(fl, t); }).join("; ")
      : f("noFlags", "—");
    var d = _rowDisplay(row, t);
    var h = humanFor(human, row);
    var humanText = humanStatusLabel(h.status, t) + (h.note ? " (" + h.note + ")" : "");
    var firstSeen = "";
    if (typeof tier1Find === "function") {
      var _hit = tier1Find(row);
      if (_hit) firstSeen = " \u2014 " + tier1FirstSeenText(_hit, t);
    }
    lines.push("- [ ] **" + row.label + "** \u2014 " + row.text
      + (row.caseName ? " (" + row.caseName + ")" : "")
      + (row.year ? " (" + row.year + ")" : "")
      + (row.pinCite ? " pin cite: " + row.pinCite : "")
      + " \u2014 " + f("flags", "Structure flags") + ": " + flagText
      + " \u2014 " + f("thCategory", "Category") + ": " + d.categoryLabel
      + " \u2014 " + f("thAnomaly", "Anomaly reason") + ": " + d.anomaly
      + " \u2014 " + f("thEvidence", "Matching evidence") + ": " + d.evidence + firstSeen
      + " \u2014 " + f("thScope", "Check scope") + ": " + d.scope
      + " \u2014 " + f("thAction", "Suggested action") + ": " + d.action
      + " \u2014 " + f("reportThHumanStatus", "Human review") + ": " + humanText
      + (row.manualUrl ? " \u2014 [" + f("manual", "Manual check") + "](" + row.manualUrl + ")" : ""));
  });
  return lines.join("\n") + "\n";
}

function healthReportHtml(report, t, human, runTime, tier1Find) {
  t = t || {};
  var f = function (k, d) { return t[k] || d; };
  var labelRows = Object.keys(report.byLabel).map(function (label) {
    return "<tr><td>" + _escHtml(label) + "</td><td>" + report.byLabel[label] + "</td></tr>";
  }).join("");
  var catCounts = _categoryCounts(report);
  var catText = Object.keys(catCounts).map(function (cat) {
    return _escHtml(f(REPORT_CATEGORY_KEYS[cat], cat)) + ": " + catCounts[cat];
  }).join(" · ");
  var humanSummary = humanSummaryText(report, human, t);
  var basis = reportCheckBasis(report, t, runTime);
  var rows = report.rows.map(function (row) {
    var flagText = (row.flags || []).length
      ? row.flags.map(function (fl) { return _escHtml(_flagLabel(fl, t)); }).join("; ")
      : _escHtml(f("noFlags", "—"));
    var d = _rowDisplay(row, t);
    var h = humanFor(human, row);
    var humanText = _escHtml(humanStatusLabel(h.status, t)) + (h.note ? " (" + _escHtml(h.note) + ")" : "");
    var links = (row.manualUrl ? "<a href=\"" + _escHtml(row.manualUrl) + "\">" + _escHtml(f("manual", "Manual check")) + "</a>" : "")
      + (row.scholarUrl ? " | <a href=\"" + _escHtml(row.scholarUrl) + "\">Scholar</a>" : "");
    return "<tr><td>" + row.index + "</td><td>" + _escHtml(row.text) + "</td>"
      + "<td>" + _escHtml(row.caseName) + "</td><td>" + _escHtml(row.year) + "</td>"
      + "<td>" + _escHtml(row.pinCite) + "</td><td>" + flagText + "</td>"
      + "<td>" + _escHtml(row.label) + "</td>"
      + "<td>" + _escHtml(d.categoryLabel) + "</td>"
      + "<td>" + _escHtml(d.anomaly) + "</td>"
      + "<td>" + _escHtml(d.evidence)
      + (function () { if (typeof tier1Find !== "function") return ""; var _h = tier1Find(row); return _h ? "<br>" + _escHtml(tier1FirstSeenText(_h, t)) : ""; })() + "</td>"
      + "<td>" + _escHtml(d.scope) + "</td>"
      + "<td>" + _escHtml(d.action) + "</td>"
      + "<td>" + humanText + "</td>"
      + "<td>" + links + "</td></tr>";
  }).join("");
  return "<!doctype html><html><head><meta charset='utf-8'>"
    + "<title>legal-cite-check \u2014 citation health report</title>"
    + "<style>body{font-family:system-ui,sans-serif;margin:2em}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}</style>"
    + "</head><body>"
    + "<p><strong>This is a format and completeness check, not a verification result. It is not legal advice.</strong></p>"
    + "<p>For a full check, use the <a href=\"https://github.com/szzxli/legal-cite-check#full-check-with-courtlistener-cli\">command-line tool</a>.</p>"
    + "<p><strong>" + _escHtml(f("disclaimer", "Not legal advice.")) + "</strong></p>"
    + "<p>" + _escHtml(f("scope", "This report does not check whether cases support your argument, whether quotes are accurate, or whether a case is still good law.")) + "</p>"
    + "<h2>" + _escHtml(f("summary", "Summary")) + "</h2>"
    + "<p>" + _escHtml(f("total", "Total citations")) + ": " + report.total + "</p>"
    + "<table><tr><th>" + _escHtml(f("byLabel", "By label")) + "</th><th>Count</th></tr>" + labelRows + "</table>"
    + (catText ? "<p>" + _escHtml(f("byCategory", "By category")) + ": " + catText + "</p>" : "")
    + (humanSummary ? "<p>" + _escHtml(humanSummary) + "</p>" : "")
    + "<h2>" + _escHtml(basis.heading) + "</h2>"
    + "<p>" + _escHtml(basis.checked) + "</p>"
    + "<p>" + _escHtml(basis.source) + "</p>"
    + "<p>" + _escHtml(basis.runTime) + "</p>"
    + "<p>" + _escHtml(basis.itemTime) + "</p>"
    + "<h2>" + _escHtml(f("citations", "Citations")) + "</h2>"
    + "<table><tr><th>#</th><th>" + _escHtml(f("citation", "Citation")) + "</th>"
    + "<th>" + _escHtml(f("caseName", "Case name in text")) + "</th>"
    + "<th>" + _escHtml(f("year", "Year")) + "</th>"
    + "<th>" + _escHtml(f("pin", "Pin cite")) + "</th>"
    + "<th>" + _escHtml(f("flags", "Structure flags")) + "</th>"
    + "<th>" + _escHtml(f("label", "Label")) + "</th>"
    + "<th>" + _escHtml(f("thCategory", "Category")) + "</th>"
    + "<th>" + _escHtml(f("thAnomaly", "Anomaly reason")) + "</th>"
    + "<th>" + _escHtml(f("thEvidence", "Matching evidence")) + "</th>"
    + "<th>" + _escHtml(f("thScope", "Check scope")) + "</th>"
    + "<th>" + _escHtml(f("thAction", "Suggested action")) + "</th>"
    + "<th>" + _escHtml(f("reportThHumanStatus", "Human review")) + "</th>"
    + "<th>" + _escHtml(f("links", "Manual-check links")) + "</th></tr>" + rows + "</table>"
    + "</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildHealthReport, healthReportMarkdown, healthReportHtml,
    tier1NormalizeCaseName, tier1FindLegal, tier1FirstSeenText,
    REPORT_FLAG_KEYS, reportDisplayCategory, reportCheckBasis,
    HUMAN_STATUSES, humanFor, humanStatusLabel, humanStatusCounts,
    humanSummaryText, reverifyRow };
}
