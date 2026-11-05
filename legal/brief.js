/* Daily brief. Client-side filter of the shared Tier-1 index only.
   This file makes no network call of its own: it reads whatever the
   shared tier1Load() function from app.js returns, and it never adds
   a third-party address. The note is English only and is never passed
   through the language switcher, even when a language switcher is on
   the page. No analytics event is added here. */
var DAILY_BRIEF_NOTE = "New official-source items from the last 24 hours. Inclusion does not mean a court found misconduct. Not legal advice.";
var DAILY_BRIEF_EMPTY = "No new official-source items in the last 24h";
var DAILY_BRIEF_DISPLAY_MAX = 10;

/* Use the shared normalizer from report.js when it is loaded (it is,
   because brief.js loads after report.js and app.js). The fallback
   below only lets the file run standalone in Node tests; it repeats
   the same lower-casing and punctuation rules. */
function dailyBriefNormalize(name) {
  if (typeof tier1NormalizeCaseName === "function") return tier1NormalizeCaseName(name);
  return String(name || "").toLowerCase().replace(/\bet\s+al\b/g, " ").replace(/\betal\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function dailyBriefCutoffDate(lastPoll) {
  var pollTime = typeof lastPoll === "string" ? Date.parse(lastPoll) : NaN;
  if (!isFinite(pollTime)) return "";
  return new Date(pollTime - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dailyBriefHref(url) {
  return typeof url === "string" && (url.indexOf("https://") === 0 || url.indexOf("http://") === 0) ? url : "";
}

function dailyBriefView(data) {
  data = data || {};
  var meta = data.meta || {};
  var lastPoll = typeof meta.last_poll === "string" ? meta.last_poll : "";
  var cutoffDate = dailyBriefCutoffDate(lastPoll);
  /* Day granularity is inherent: a qualifying date can be up to ~47h old
     at poll time, because only the calendar date is compared. The window
     anchors to meta.last_poll, never the visitor's clock. */
  var sources = Array.isArray(meta.sources) ? meta.sources : [];
  var hasError = sources.some(function (source) { return source && source.status === "error"; });
  /* Stale, in the news.js style, means the last good poll cannot be
     treated as current: a source reported an error, or there is no
     usable last_poll. No age threshold is invented here, and the list
     is still rendered from the last good data. */
  var stale = hasError || !cutoffDate;
  var staleText = "";
  if (stale) {
    staleText = lastPoll
      ? "The last attempt failed. This list is from the last good data (" + lastPoll + "), not a new poll."
      : "The last attempt failed. There is no successful poll to show.";
  }
  var items = [];
  if (cutoffDate) {
    var byKey = {};
    var all = Array.isArray(data.items) ? data.items : [];
    all.forEach(function (item, index) {
      if (!item || item.kind !== "legal") return;
      var date = typeof item.date === "string" ? item.date.slice(0, 10) : "";
      if (!date || date < cutoffDate) return;
      var key = dailyBriefNormalize(item.title_or_case_name) + "\u0000" + (item.source || "");
      var existing = byKey[key];
      if (!existing || date > existing.date) {
        byKey[key] = { item: item, date: date, index: index };
      }
    });
    var deduped = Object.keys(byKey).map(function (key) { return byKey[key]; });
    deduped.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      var aSeen = a.item.first_seen || "";
      var bSeen = b.item.first_seen || "";
      if (aSeen !== bSeen) return aSeen < bSeen ? 1 : -1;
      return a.index - b.index;
    });
    items = deduped.slice(0, DAILY_BRIEF_DISPLAY_MAX).map(function (entry) { return entry.item; });
  }
  return {
    note: DAILY_BRIEF_NOTE,
    updated: lastPoll,
    updatedText: lastPoll ? "Last poll: " + lastPoll : "Last poll: (none)",
    stale: stale,
    staleText: staleText,
    cutoffDate: cutoffDate,
    items: items,
    emptyText: items.length ? "" : DAILY_BRIEF_EMPTY
  };
}

function selectDailyBrief(data) {
  return dailyBriefView(data).items;
}

function renderDailyBrief(data) {
  var view = dailyBriefView(data);
  var note = document.getElementById("daily-brief-note");
  if (note) note.textContent = view.note;
  var updated = document.getElementById("daily-brief-updated");
  if (updated) updated.textContent = view.updatedText;
  var stale = document.getElementById("daily-brief-stale");
  if (stale) {
    stale.hidden = !view.stale;
    stale.textContent = view.staleText;
  }
  var list = document.getElementById("daily-brief-list");
  if (!list) return;
  list.textContent = "";
  if (!view.items.length) {
    list.textContent = DAILY_BRIEF_EMPTY;
    return;
  }
  view.items.forEach(function (item) {
    var li = document.createElement("li");
    li.appendChild(document.createTextNode((item.date || "") + " \u00b7 " + (item.source || "") + " \u00b7 "));
    var href = dailyBriefHref(item.url);
    var name = item.title_or_case_name || "";
    if (href) {
      var a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = name;
      li.appendChild(a);
    } else {
      li.appendChild(document.createTextNode(name));
    }
    list.appendChild(li);
  });
}

function loadDailyBrief() {
  try {
    if (typeof tier1Load !== "function") {
      renderDailyBrief(null);
      return;
    }
    var result = tier1Load();
    if (result && typeof result.then === "function") {
      result.then(function (loaded) {
        try { renderDailyBrief(loaded); } catch (e) { try { renderDailyBrief(null); } catch (ignored) {} }
      }, function () {
        try { renderDailyBrief(null); } catch (ignored) {}
      });
    } else {
      renderDailyBrief(result);
    }
  } catch (e) {
    try { renderDailyBrief(null); } catch (ignored) {}
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadDailyBrief);
  else loadDailyBrief();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DAILY_BRIEF_NOTE: DAILY_BRIEF_NOTE, DAILY_BRIEF_EMPTY: DAILY_BRIEF_EMPTY, DAILY_BRIEF_DISPLAY_MAX: DAILY_BRIEF_DISPLAY_MAX, dailyBriefCutoffDate: dailyBriefCutoffDate, dailyBriefView: dailyBriefView, selectDailyBrief: selectDailyBrief, dailyBriefHref: dailyBriefHref, renderDailyBrief: renderDailyBrief, loadDailyBrief: loadDailyBrief };
}
