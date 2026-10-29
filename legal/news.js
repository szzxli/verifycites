/* Citation-integrity news. Reads same-origin data/legal-news.json only.
   This file does not call CourtListener or any other third party.
   The note is English only and is never passed through the language
   switcher, even when a language switcher is on the page. */
var LEGAL_NEWS_NOTE = "Court opinions whose text matches a fixed search for AI-generated or nonexistent citations. Inclusion does not mean a court found misconduct. Not legal advice.";
var LEGAL_NEWS_DISPLAY_MAX = 10;

function legalNewsView(data) {
  data = data || {};
  var success = typeof data.last_success_utc === "string" ? data.last_success_utc : "";
  var attempt = typeof data.updated_utc === "string" ? data.updated_utc : "";
  var stale = data.status === "error" || (attempt && success && attempt !== success) || (data.status === "error");
  if (data.status === "error" && !success) stale = true;
  var staleText = "";
  if (stale) {
    staleText = success
      ? "The last attempt failed. This list is from the last successful update (" + success + "), not a new fetch."
      : "The last attempt failed. There is no successful update to show.";
  }
  var items = Array.isArray(data.items) ? data.items.slice(0, LEGAL_NEWS_DISPLAY_MAX) : [];
  return {
    note: LEGAL_NEWS_NOTE,
    updated: success,
    stale: stale,
    staleText: staleText,
    items: items
  };
}

function legalNewsHref(url) {
  return typeof url === "string" && url.indexOf("https://www.courtlistener.com/") === 0 ? url : "";
}

function renderLegalNews(data) {
  var view = legalNewsView(data);
  var note = document.getElementById("legal-news-note");
  if (note) note.textContent = view.note;
  var updated = document.getElementById("legal-news-updated");
  if (updated) updated.textContent = view.updated ? ("Last successful update: " + view.updated) : "Last successful update: (none)";
  var stale = document.getElementById("legal-news-stale");
  if (stale) {
    stale.hidden = !view.stale;
    stale.textContent = view.staleText;
  }
  var list = document.getElementById("legal-news-list");
  if (!list) return view;
  list.textContent = "";
  view.items.forEach(function (item) {
    var li = document.createElement("li");
    li.appendChild(document.createTextNode((item.date || "") + " \u00b7 " + (item.court || "") + " \u00b7 "));
    var href = legalNewsHref(item.url);
    if (href) {
      var a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.case_name || href;
      a.addEventListener("click", function () {
        if (typeof vcCount === "function") vcCount("legal-news-click");
      });
      li.appendChild(a);
    } else {
      li.appendChild(document.createTextNode(item.case_name || ""));
    }
    list.appendChild(li);
  });
  return view;
}

function loadLegalNews() {
  var list = document.getElementById("legal-news-list");
  if (!list || typeof fetch !== "function") return;
  fetch("../data/legal-news.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("news fetch " + r.status); return r.json(); })
    .then(function (data) { renderLegalNews(data); })
    .catch(function () {
      renderLegalNews({ status: "error", updated_utc: "", last_success_utc: "", items: [] });
    });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadLegalNews);
  else loadLegalNews();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LEGAL_NEWS_NOTE, LEGAL_NEWS_DISPLAY_MAX, legalNewsView, legalNewsHref, renderLegalNews };
}
