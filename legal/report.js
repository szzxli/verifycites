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

function _categoryCounts(report) {
  if (report.byCategory) return report.byCategory;
  var counts = {};
  (report.rows || []).forEach(function (row) {
    var c = row.category || reportDisplayCategory(row.label, row.caseName);
    counts[c] = (counts[c] || 0) + 1;
  });
  return counts;
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
   for any key the caller does not supply. */
function healthReportMarkdown(report, t) {
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
  lines.push("");
  lines.push("## " + f("citations", "Citations"));
  report.rows.forEach(function (row) {
    var flagText = (row.flags || []).length
      ? row.flags.map(function (fl) { return _flagLabel(fl, t); }).join("; ")
      : f("noFlags", "—");
    var d = _rowDisplay(row, t);
    lines.push("- [ ] **" + row.label + "** \u2014 " + row.text
      + (row.caseName ? " (" + row.caseName + ")" : "")
      + (row.year ? " (" + row.year + ")" : "")
      + (row.pinCite ? " pin cite: " + row.pinCite : "")
      + " \u2014 " + f("flags", "Structure flags") + ": " + flagText
      + " \u2014 " + f("thCategory", "Category") + ": " + d.categoryLabel
      + " \u2014 " + f("thAnomaly", "Anomaly reason") + ": " + d.anomaly
      + " \u2014 " + f("thEvidence", "Matching evidence") + ": " + d.evidence
      + " \u2014 " + f("thScope", "Check scope") + ": " + d.scope
      + " \u2014 " + f("thAction", "Suggested action") + ": " + d.action
      + (row.manualUrl ? " \u2014 [" + f("manual", "Manual check") + "](" + row.manualUrl + ")" : ""));
  });
  return lines.join("\n") + "\n";
}

function healthReportHtml(report, t) {
  t = t || {};
  var f = function (k, d) { return t[k] || d; };
  var labelRows = Object.keys(report.byLabel).map(function (label) {
    return "<tr><td>" + _escHtml(label) + "</td><td>" + report.byLabel[label] + "</td></tr>";
  }).join("");
  var catCounts = _categoryCounts(report);
  var catText = Object.keys(catCounts).map(function (cat) {
    return _escHtml(f(REPORT_CATEGORY_KEYS[cat], cat)) + ": " + catCounts[cat];
  }).join(" · ");
  var rows = report.rows.map(function (row) {
    var flagText = (row.flags || []).length
      ? row.flags.map(function (fl) { return _escHtml(_flagLabel(fl, t)); }).join("; ")
      : _escHtml(f("noFlags", "—"));
    var d = _rowDisplay(row, t);
    var links = (row.manualUrl ? "<a href=\"" + _escHtml(row.manualUrl) + "\">" + _escHtml(f("manual", "Manual check")) + "</a>" : "")
      + (row.scholarUrl ? " | <a href=\"" + _escHtml(row.scholarUrl) + "\">Scholar</a>" : "");
    return "<tr><td>" + row.index + "</td><td>" + _escHtml(row.text) + "</td>"
      + "<td>" + _escHtml(row.caseName) + "</td><td>" + _escHtml(row.year) + "</td>"
      + "<td>" + _escHtml(row.pinCite) + "</td><td>" + flagText + "</td>"
      + "<td>" + _escHtml(row.label) + "</td>"
      + "<td>" + _escHtml(d.categoryLabel) + "</td>"
      + "<td>" + _escHtml(d.anomaly) + "</td>"
      + "<td>" + _escHtml(d.evidence) + "</td>"
      + "<td>" + _escHtml(d.scope) + "</td>"
      + "<td>" + _escHtml(d.action) + "</td>"
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
    + "<th>" + _escHtml(f("links", "Manual-check links")) + "</th></tr>" + rows + "</table>"
    + "</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildHealthReport, healthReportMarkdown, healthReportHtml, REPORT_FLAG_KEYS, reportDisplayCategory };
}
