/* Daily Legal Briefing ("每日法律简报") — LOCAL-ONLY, first version.
   Open-and-see only: NO email push, NO account, NO server, NO token.
   Preferences live in the browser's localStorage (wrapped by app.js);
   this file is pure logic so node tests can run it without a DOM.
   Honesty rules (never broken):
   - Total briefing cap is 5 items, morning-readable in ~5 minutes.
   - Every shown item MUST have a one-line "why this matters to you"
     (state + topic and/or a followed case it relates to). No reason
     => the item is dropped, never shown bare.
   - No invented summaries: item text uses only title/court/date/
     snippet fields from the source. What is quoted is the snippet;
     the why-line is generated from the match, and labelled as such.
   - No invented rules or deadlines. The rules/deadlines bucket comes
     ONLY from user-entered entries (each with a date and a source
     link) or from a fetched item's own stated date — never invented.
   - SAMPLE items are fictional examples, always labelled SAMPLE/示例,
     and NEVER mixed with real items: if any real item ranks, samples
     are excluded entirely. */
var BRIEFING_STATES = {
  CA: { name: "California", courts: ["cal", "cacd", "cand", "caed", "casd"] },
  TX: { name: "Texas", courts: ["tx", "txed", "txnd", "txsd", "txwd"] },
  FL: { name: "Florida", courts: ["fla", "flamd", "fland", "flasd"] },
  NY: { name: "New York", courts: ["ny", "nyed", "nysd", "nywd", "nynd"] }
};
var BRIEFING_CAP = 5;
var BRIEFING_STORAGE_KEY = "lcc-briefing-prefs-v1";

function briefingState(code) {
  return BRIEFING_STATES[code] || null;
}
function briefingValidState(code) {
  return !!BRIEFING_STATES[code];
}
function briefingDefaultPrefs() {
  return { state: "CA", topics: [], cases: [], rules: [], deadlines: [] };
}
/* Preferences serialisation (pure; app.js passes localStorage as storage). */
function briefingPrefsToJSON(prefs) {
  return JSON.stringify({
    state: briefingValidState(prefs.state) ? prefs.state : "CA",
    topics: (prefs.topics || []).filter(Boolean),
    cases: (prefs.cases || []).filter(Boolean),
    rules: (prefs.rules || []).filter(function (r) { return r && r.label && r.date && r.source; }),
    deadlines: (prefs.deadlines || []).filter(function (d) { return d && d.label && d.date && d.source; })
  });
}
function briefingPrefsFromJSON(json) {
  try {
    var p = JSON.parse(json);
    if (!p || typeof p !== "object") return briefingDefaultPrefs();
    return {
      state: briefingValidState(p.state) ? p.state : "CA",
      topics: Array.isArray(p.topics) ? p.topics.filter(Boolean) : [],
      cases: Array.isArray(p.cases) ? p.cases.filter(Boolean) : [],
      rules: Array.isArray(p.rules) ? p.rules : [],
      deadlines: Array.isArray(p.deadlines) ? p.deadlines : []
    };
  } catch (e) { return briefingDefaultPrefs(); }
}
function briefingSavePrefs(storage, prefs) {
  storage.setItem(BRIEFING_STORAGE_KEY, briefingPrefsToJSON(prefs));
}
function briefingLoadPrefs(storage) {
  var raw = storage.getItem(BRIEFING_STORAGE_KEY);
  return raw ? briefingPrefsFromJSON(raw) : briefingDefaultPrefs();
}
function briefingClearPrefs(storage) {
  storage.removeItem(BRIEFING_STORAGE_KEY);
}

/* "YYYY-MM-DD" -> UTC day number; null when invalid. */
function briefingDayNumber(dateStr) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) return null;
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 ||
      d.getUTCDate() !== +m[3]) return null;
  return Math.floor(d.getTime() / 86400000);
}
function briefingTodayStr() {
  var n = new Date();
  return n.getUTCFullYear() + "-" + String(n.getUTCMonth() + 1).padStart(2, "0")
    + "-" + String(n.getUTCDate()).padStart(2, "0");
}
/* Days from todayStr to deadlineStr: positive = upcoming, 0 = today,
   negative = overdue. Null when either date is invalid. */
function briefingCountdownDays(deadlineStr, todayStr) {
  var a = briefingDayNumber(deadlineStr);
  var b = briefingDayNumber(todayStr || briefingTodayStr());
  if (a === null || b === null) return null;
  return a - b;
}
function briefingCountdownLabel(days, lang) {
  if (days === null) return "";
  if (lang === "zh") {
    if (days > 0) return "距离截止还有 " + days + " 天";
    if (days === 0) return "今天截止";
    return "已逾期 " + (-days) + " 天";
  }
  if (lang === "es") {
    if (days > 0) return "Faltan " + days + " días para el vencimiento";
    if (days === 0) return "Vence hoy";
    return "Vencido hace " + (-days) + " días";
  }
  if (days > 0) return days + " days to deadline";
  if (days === 0) return "Due today";
  return "Overdue by " + (-days) + " days";
}

/* User-entered lines: "YYYY-MM-DD | label | https://source". Lines that
   fail validation are dropped (never shown with a guessed date/source). */
function briefingParseDatedLines(text) {
  var out = [];
  String(text || "").split("\n").forEach(function (line) {
    var parts = line.split("|").map(function (s) { return s.trim(); });
    if (parts.length < 3) return;
    if (briefingDayNumber(parts[0]) === null) return;
    if (!/^https?:\/\//.test(parts[2])) return;
    out.push({ date: parts[0], label: parts[1], source: parts[2] });
  });
  return out;
}

/* Live fetch, kept OUT of app.js/extract.js on purpose: the v1 invariant
   (citation checking makes no network calls) stays intact, and the only
   CourtListener call in the whole page lives here, running solely when
   the user clicks "Get today's briefing". Sends only saved court/topic/
   citation query strings, never brief text. fetchFn is injectable so
   node tests can stub it; in the browser app.js passes window.fetch. */
async function briefingFetchOpinions(prefs, fetchFn) {
  var state = briefingState(prefs.state);
  var terms = (prefs.topics || []).concat(prefs.cases || []).filter(Boolean);
  terms.push("fine penalty");
  var params = new URLSearchParams({ type: "o", order_by: "dateFiled desc",
    q: terms.join(" ") });
  (state ? state.courts : []).forEach(function (c) { params.append("court", c); });
  var res = await fetchFn(
    "https://www.courtlistener.com/api/rest/v4/search/?" + params.toString());
  if (!res.ok) throw new Error("HTTP " + res.status);
  var data = await res.json();
  return (data.results || []).map(briefingNormalizeOpinion).filter(Boolean);
}
/* Normalise one CourtListener search result (type=o) to a briefing item.
   Only source fields are kept; nothing is summarised or invented. */
function briefingNormalizeOpinion(raw) {
  if (!raw || typeof raw !== "object") return null;
  var id = raw.id;
  var url = raw.absolute_url
    ? "https://www.courtlistener.com" + raw.absolute_url
    : (id ? "https://www.courtlistener.com/opinion/" + id + "/" : null);
  if (!url) return null;
  return {
    kind: "opinion",
    title: raw.caseName || raw.case_name || "",
    court: raw.court || "",
    date: (raw.dateFiled || "").slice(0, 10),
    snippet: raw.snippet || "",
    url: url,
    cites: []
  };
}
function briefingMatchesFines(item) {
  return /fine|penalt|fined/i.test((item.title || "") + " " + (item.snippet || ""));
}
function briefingMatchesFollowed(item, prefs) {
  var hay = ((item.title || "") + " " + (item.snippet || "")).toLowerCase();
  return (prefs.cases || []).filter(function (c) {
    return c && hay.indexOf(String(c).toLowerCase()) !== -1;
  });
}
function briefingMatchesTopic(item, prefs) {
  var hay = ((item.title || "") + " " + (item.snippet || "")).toLowerCase();
  return (prefs.topics || []).filter(function (t) {
    return t && hay.indexOf(String(t).toLowerCase()) !== -1;
  });
}
/* Bucket + why-line. Returns null when no reason can be stated. */
function briefingClassify(item, prefs) {
  var state = briefingState(prefs.state);
  var stateName = state ? state.name : prefs.state;
  var followed = briefingMatchesFollowed(item, prefs);
  var topics = briefingMatchesTopic(item, prefs);
  var isFines = briefingMatchesFines(item);
  if (followed.length > 0) {
    return { bucket: "followed",
      why: "Relates to a case you follow (" + followed[0] + ") in " + stateName
        + (topics.length ? " on " + topics[0] : "") + "." };
  }
  if (isFines && topics.length > 0) {
    return { bucket: "fines",
      why: "Court fines news in " + stateName + " on " + topics[0] + "." };
  }
  if (isFines && !topics.length && (prefs.topics || []).length === 0) {
    return { bucket: "fines",
      why: "Court fines news in " + stateName + "." };
  }
  return null; /* No statable reason => dropped, never shown bare. */
}
function briefingBucketOrder(bucket) {
  return bucket === "followed" ? 0 : bucket === "rules" ? 1 : 2;
}
/* Rank raw items against prefs: classify, drop reason-less items, sort
   by bucket order then date (newest first), cap at 5. */
function briefingRank(rawItems, prefs) {
  var ranked = [];
  (rawItems || []).forEach(function (raw) {
    var item = raw.kind ? raw : briefingNormalizeOpinion(raw);
    if (!item) return;
    var c = briefingClassify(item, prefs);
    if (!c) return;
    item.bucket = c.bucket;
    item.why = c.why;
    ranked.push(item);
  });
  ranked.sort(function (a, b) {
    var d = briefingBucketOrder(a.bucket) - briefingBucketOrder(b.bucket);
    if (d !== 0) return d;
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
  return ranked.slice(0, BRIEFING_CAP);
}
/* User-saved rules/deadlines become bucket-"rules" items (dates and
   sources are the user's own, never invented). */
function briefingSavedItems(prefs, todayStr) {
  var items = [];
  (prefs.rules || []).forEach(function (r) {
    items.push({ kind: "rule", bucket: "rules", title: r.label, date: r.date,
      url: r.source, snippet: "",
      why: "A rule you track in " + (briefingState(prefs.state) || {}).name
        + ", effective " + r.date + "." });
  });
  (prefs.deadlines || []).forEach(function (d) {
    var days = briefingCountdownDays(d.date, todayStr);
    items.push({ kind: "deadline", bucket: "rules", title: d.label, date: d.date,
      url: d.source, snippet: "", days: days,
      why: "A deadline you saved in " + (briefingState(prefs.state) || {}).name
        + (days !== null ? " (" + briefingCountdownLabel(days, "en") + ")." : ".") });
  });
  return items;
}
var BRIEFING_SAMPLE_ITEMS = [
  { kind: "sample", bucket: "followed", sample: true,
    title: "SAMPLE — Example v. Sample (fictional example only)",
    court: "SAMPLE", date: "2026-10-26", snippet: "This is a sample item, not a real case.",
    url: "https://www.courtlistener.com/",
    why: "SAMPLE: relates to a case you follow, shown only as an example." },
  { kind: "sample", bucket: "rules", sample: true,
    title: "SAMPLE — Example state rule (fictional example only)",
    court: "SAMPLE", date: "2026-11-01", snippet: "This is a sample item, not a real rule.",
    url: "https://www.courtlistener.com/",
    why: "SAMPLE: a rule you would track in your state, shown only as an example." },
  { kind: "sample", bucket: "fines", sample: true,
    title: "SAMPLE — Example fines news (fictional example only)",
    court: "SAMPLE", date: "2026-10-25", snippet: "This is a sample item, not real fines news.",
    url: "https://www.courtlistener.com/",
    why: "SAMPLE: court fines news in your state, shown only as an example." }
];
/* Build the briefing: real ranked items + saved rules/deadlines, merged
   by bucket order and capped at 5. If nothing real exists, return the
   clearly-labelled SAMPLE briefing — never a mix of real and sample. */
function briefingBuild(rawItems, prefs, todayStr) {
  var ranked = briefingRank(rawItems, prefs);
  var saved = briefingSavedItems(prefs, todayStr);
  var all = ranked.concat(saved);
  all.sort(function (a, b) {
    var d = briefingBucketOrder(a.bucket) - briefingBucketOrder(b.bucket);
    if (d !== 0) return d;
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
  all = all.slice(0, BRIEFING_CAP);
  if (all.length > 0) {
    return { isSample: false, items: all, overview: briefingOverview(all) };
  }
  return { isSample: true, items: BRIEFING_SAMPLE_ITEMS.slice(),
    overview: { followed: 0, deadlines: 0, rules: 0, sample: true } };
}
function briefingOverview(items) {
  var o = { followed: 0, deadlines: 0, rules: 0 };
  items.forEach(function (it) {
    if (it.bucket === "followed") o.followed++;
    if (it.kind === "deadline" && it.days !== null && it.days >= 0) o.deadlines++;
    if (it.bucket === "rules") o.rules++;
  });
  return o;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { BRIEFING_STATES, BRIEFING_CAP, BRIEFING_STORAGE_KEY,
    briefingState, briefingValidState, briefingDefaultPrefs,
    briefingPrefsToJSON, briefingPrefsFromJSON, briefingSavePrefs,
    briefingLoadPrefs, briefingClearPrefs, briefingDayNumber,
    briefingCountdownDays, briefingCountdownLabel, briefingParseDatedLines,
    briefingNormalizeOpinion, briefingFetchOpinions, briefingMatchesFines, briefingMatchesFollowed,
    briefingMatchesTopic, briefingClassify, briefingRank,
    briefingSavedItems, BRIEFING_SAMPLE_ITEMS, briefingBuild, briefingOverview };
}
