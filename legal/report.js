/* Citation health report (browser, v1). Local only: no network calls.
   The report summarizes what the extractor found and runs STRUCTURE
   checks on the extracted text itself (duplicates, missing year, no case
   name, unknown reporter). It makes NO judgment about quality, relevance,
   whether a case supports an argument, quote accuracy, or good law.
   In browser mode every row is NOT_CHECKED: nothing is verified here. */
var REPORT_FLAG_KEYS = ["duplicate", "missingYear", "noCaseName", "invalidReporter"];

function buildHealthReport(results) {
  var counts = {};
  var seen = {};
  var flagCounts = { duplicate: 0, missingYear: 0, noCaseName: 0, invalidReporter: 0 };
  var rows = [];
  (results || []).forEach(function (r, i) {
    var label = r.label || "NOT_CHECKED";
    counts[label] = (counts[label] || 0) + 1;
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
      year: r.year || null, label: label, flags: flags,
      manualUrl: r.manualUrl, scholarUrl: r.scholarUrl
    });
  });
  return { total: rows.length, byLabel: counts, flagCounts: flagCounts, rows: rows };
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
  lines.push("");
  lines.push("## " + f("citations", "Citations"));
  report.rows.forEach(function (row) {
    var flagText = row.flags.length
      ? row.flags.map(function (fl) { return _flagLabel(fl, t); }).join("; ")
      : f("noFlags", "—");
    lines.push("- [ ] **" + row.label + "** \u2014 " + row.text
      + (row.caseName ? " (" + row.caseName + ")" : "")
      + (row.year ? " (" + row.year + ")" : "")
      + (row.pinCite ? " pin cite: " + row.pinCite : "")
      + " \u2014 " + f("flags", "Structure flags") + ": " + flagText
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
  var rows = report.rows.map(function (row) {
    var flagText = row.flags.length
      ? row.flags.map(function (fl) { return _escHtml(_flagLabel(fl, t)); }).join("; ")
      : _escHtml(f("noFlags", "—"));
    var links = (row.manualUrl ? "<a href=\"" + _escHtml(row.manualUrl) + "\">" + _escHtml(f("manual", "Manual check")) + "</a>" : "")
      + (row.scholarUrl ? " | <a href=\"" + _escHtml(row.scholarUrl) + "\">Scholar</a>" : "");
    return "<tr><td>" + row.index + "</td><td>" + _escHtml(row.text) + "</td>"
      + "<td>" + _escHtml(row.caseName) + "</td><td>" + _escHtml(row.year) + "</td>"
      + "<td>" + _escHtml(row.pinCite) + "</td><td>" + flagText + "</td>"
      + "<td>" + _escHtml(row.label) + "</td><td>" + links + "</td></tr>";
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
    + "<h2>" + _escHtml(f("citations", "Citations")) + "</h2>"
    + "<table><tr><th>#</th><th>" + _escHtml(f("citation", "Citation")) + "</th>"
    + "<th>" + _escHtml(f("caseName", "Case name in text")) + "</th>"
    + "<th>" + _escHtml(f("year", "Year")) + "</th>"
    + "<th>" + _escHtml(f("pin", "Pin cite")) + "</th>"
    + "<th>" + _escHtml(f("flags", "Structure flags")) + "</th>"
    + "<th>" + _escHtml(f("label", "Label")) + "</th>"
    + "<th>" + _escHtml(f("links", "Manual-check links")) + "</th></tr>" + rows + "</table>"
    + "</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildHealthReport, healthReportMarkdown, healthReportHtml, REPORT_FLAG_KEYS };
}
