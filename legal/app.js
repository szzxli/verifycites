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

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
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
  if (window.__lastBriefing) renderBriefing(window.__lastBriefing);
}

function render(results) {
  var tbody = document.getElementById("results");
  tbody.innerHTML = "";
  results.forEach(function (r, i) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + esc(r.text) + "</td>"
      + "<td>" + esc(r.caseName) + "</td><td>NOT_CHECKED</td>"
      + "<td><a href=\"" + esc(r.manualUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(T().openCourtListener) + "</a>"
      + " | <a href=\"" + esc(r.scholarUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(T().searchScholar) + "</a></td>";
    tbody.appendChild(tr);
  });
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
    noFlags: t.reportNoFlags, citation: t.thCitation, caseName: t.thCaseName,
    year: t.reportThYear, pin: t.reportThPin, label: t.thLabel, links: t.thLinks
  };
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
        noCaseName: t.reportFlagNoCaseName, invalidReporter: t.reportFlagInvalidReporter }[f];
      return label + ": " + report.flagCounts[f];
    });
  document.getElementById("reportSummary").textContent =
    t.reportTotal + ": " + report.total + " · " + t.reportByLabel + ": " + byLabel
    + (flagParts.length ? " · " + t.reportStructureHeading + ": " + flagParts.join("; ") : "");
  var tbody = document.getElementById("reportRows");
  tbody.innerHTML = "";
  report.rows.forEach(function (row) {
    var flagText = row.flags.length ? row.flags.map(function (fl) {
      return { duplicate: t.reportFlagDuplicate, missingYear: t.reportFlagMissingYear,
        noCaseName: t.reportFlagNoCaseName, invalidReporter: t.reportFlagInvalidReporter }[fl];
    }).join("; ") : t.reportNoFlags;
    var tr = document.createElement("tr");
    tr.innerHTML = "<td>" + row.index + "</td><td>" + esc(row.text) + "</td>"
      + "<td>" + esc(row.caseName) + "</td><td>" + esc(row.year) + "</td>"
      + "<td>" + esc(row.pinCite) + "</td><td>" + esc(flagText) + "</td>"
      + "<td><a href=\"" + esc(row.manualUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(t.openCourtListener) + "</a>"
      + " | <a href=\"" + esc(row.scholarUrl) + "\" target=\"_blank\" rel=\"noopener\">"
      + esc(t.searchScholar) + "</a></td>";
    tbody.appendChild(tr);
  });
  section.hidden = false;
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
  downloadBlob(healthReportMarkdown(window.__lastReport, reportStrings()),
    "citation-health-report.md", "text/markdown");
}

function downloadReportHtml() {
  if (!window.__lastReport) return;
  downloadBlob(healthReportHtml(window.__lastReport, reportStrings()),
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

/* ---- Daily Legal Briefing (local-only, first version) ---- */
function briefingPrefsFromForm() {
  return {
    state: (document.getElementById("briefState").value || "CA"),
    topics: (document.getElementById("briefTopics").value || "")
      .split(",").map(function (s) { return s.trim(); }).filter(Boolean),
    cases: (document.getElementById("briefCases").value || "")
      .split("\n").map(function (s) { return s.trim(); }).filter(Boolean),
    rules: briefingParseDatedLines(document.getElementById("briefRules").value || ""),
    deadlines: briefingParseDatedLines(document.getElementById("briefDeadlines").value || "")
  };
}
function briefingPrefsToForm(prefs) {
  document.getElementById("briefState").value = prefs.state;
  document.getElementById("briefTopics").value = (prefs.topics || []).join(", ");
  document.getElementById("briefCases").value = (prefs.cases || []).join("\n");
  document.getElementById("briefRules").value = (prefs.rules || [])
    .map(function (r) { return r.date + " | " + r.label + " | " + r.source; }).join("\n");
  document.getElementById("briefDeadlines").value = (prefs.deadlines || [])
    .map(function (d) { return d.date + " | " + d.label + " | " + d.source; }).join("\n");
}
function renderBriefing(briefing) {
  window.__lastBriefing = briefing;
  var o = briefing.overview;
  document.getElementById("briefingOverview").textContent =
    o.followed + " " + T().briefingFollowedCount + " · "
    + o.deadlines + " " + T().briefingDeadlinesCount + " · "
    + o.rules + " " + T().briefingRulesCount;
  var st = document.getElementById("briefingStatus");
  if (briefing.isSample) {
    st.textContent = T().briefingSampleNote;
  } else if (!briefing.items.length) {
    st.textContent = T().briefingNoReal;
  } else { st.textContent = ""; }
  var wrap = document.getElementById("briefingResults");
  wrap.innerHTML = "";
  var buckets = { followed: [], rules: [], fines: [] };
  briefing.items.forEach(function (it) { (buckets[it.bucket] || buckets.fines).push(it); });
  ["followed", "rules", "fines"].forEach(function (b) {
    var h = document.createElement("h4");
    h.textContent = b === "followed" ? T().briefingFollowedCount
      : b === "rules" ? T().briefingRulesCount : T().briefingFinesHeading;
    wrap.appendChild(h);
    if (!buckets[b].length) {
      var em = document.createElement("p"); em.textContent = T().briefingEmptyBucket;
      wrap.appendChild(em); return;
    }
    buckets[b].forEach(function (it) {
      var div = document.createElement("div");
      var countdown = "";
      if (it.kind === "deadline") {
        var days = briefingCountdownDays(it.date, briefingTodayStr());
        countdown = " — " + briefingCountdownLabel(days, currentLang);
      }
      div.innerHTML = "<p><a href=\"" + esc(it.url) + "\" target=\"_blank\" rel=\"noopener\">"
        + esc(it.title) + "</a>"
        + (it.sample ? " <strong>[SAMPLE / 示例]</strong>" : "")
        + (it.court ? " — " + esc(it.court) : "")
        + (it.date ? " (" + esc(it.date) + countdown + ")" : "") + "<br>"
        + (it.snippet ? "<em>" + esc(it.snippet) + "</em><br>" : "")
        + T().briefingWhyLabel + ": " + esc(it.why) + "</p>";
      wrap.appendChild(div);
    });
  });
}
function showSampleBriefing() {
  renderBriefing({ isSample: true, items: BRIEFING_SAMPLE_ITEMS.slice(),
    overview: { followed: 0, deadlines: 0, rules: 0, sample: true } });
}
function saveBriefingPrefs() {
  var prefs = briefingPrefsFromForm();
  briefingSavePrefs(localStorage, prefs);
  document.getElementById("briefingSaved").textContent = T().briefingSavedNote;
  getBriefing();
}
function clearBriefingPrefs() {
  briefingClearPrefs(localStorage);
  briefingPrefsToForm(briefingDefaultPrefs());
  document.getElementById("briefingResults").innerHTML = "";
  document.getElementById("briefingOverview").textContent = "";
  document.getElementById("briefingStatus").textContent = "";
  document.getElementById("briefingSaved").textContent = "";
}
async function getBriefing() {
  var prefs = briefingPrefsFromForm();
  try {
    var raws = await briefingFetchOpinions(prefs, fetch);
    var briefing = briefingBuild(raws, prefs, briefingTodayStr());
    if (briefing.isSample) {
      document.getElementById("briefingStatus").textContent = T().briefingNoReal;
    }
    renderBriefing(briefing);
  } catch (e) {
    document.getElementById("briefingStatus").textContent = T().briefingFetchBlocked;
    document.getElementById("briefingOverview").textContent = "";
    document.getElementById("briefingResults").innerHTML = "";
  }
}
function rankManualBriefing() {
  var prefs = briefingPrefsFromForm();
  var raws = (document.getElementById("briefManual").value || "").split("\n")
    .map(function (line) {
      var parts = line.split("|").map(function (s) { return s.trim(); });
      if (parts.length < 4 || !/^https?:\/\//.test(parts[3])) return null;
      return { kind: "opinion", title: parts[0], court: parts[1], date: parts[2],
        url: parts[3], snippet: parts[4] || "" };
    }).filter(Boolean);
  var briefing = briefingBuild(raws, prefs, briefingTodayStr());
  renderBriefing(briefing);
}
/* Restore saved preferences on load (no fetch until the user clicks). */
(function () {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(BRIEFING_STORAGE_KEY)) {
      briefingPrefsToForm(briefingLoadPrefs(localStorage));
    }
  } catch (e) { /* private mode etc.: preferences simply do not persist */ }
})();
