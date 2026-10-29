/* BIA precedent search (branch prototype, #47). Reads same-origin
   ../data/bia-index.json (metadata only) and
   ../data/bia-search/vol30.json (term -> decision IDs) only, and only
   when the user runs a search. The query never leaves this browser:
   matching happens here, nothing is stored, and the usage event
   carries only its fixed name. This file does not call justice.gov or
   any other third party; result links point to the official PDFs.
   The note and scope text are English only and are never passed
   through the language switcher, like the news note. */
var BIA_RESULT_NOTE = "Keyword matching only. This shows that the decision exists, its citation, and the official link. It does not say whether the decision is still good law. Not legal advice.";
var BIA_SCOPE_NOTE = "Scope: BIA and Attorney General precedent decisions only. Currently volume 30 only. Volumes 01\u201307 are a known gap and are not searchable here.";
var BIA_VOLUMES = ["30"];
var BIA_STOPWORDS = ("the and of to in a an is are was were be been being for with on at by from that this it as or not no has have had " +
  "will would can could should may might must shall upon which who whom whose when where under over after before between through during " +
  "also than then them they their his her its our your all any each per via into out").split(" ");
var BIA_OFFICIAL_PREFIX = "https://www.justice.gov/eoir/";

/* Same tokenizer as scripts/bia_snapshot_poll.py tokenize(). */
function biaTokenize(text) {
  var out = [];
  var toks = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  toks.forEach(function (t) {
    if (t.length >= 3 && BIA_STOPWORDS.indexOf(t) < 0 && out.indexOf(t) < 0) out.push(t);
  });
  return out;
}

function biaHref(url) {
  return typeof url === "string" && url.indexOf(BIA_OFFICIAL_PREFIX) === 0 ? url : "";
}

/* Pure: every query term must appear in a decision's indexed text. */
function biaSearch(index, volumes, query) {
  var terms = biaTokenize(query);
  if (!terms.length) return { terms: terms, results: [] };
  var byKey = {};
  ((index && index.entries) || []).forEach(function (e) {
    byKey[String(e.id != null ? e.id : e.pdf_url)] = e;
  });
  var hits = null;
  (volumes || []).forEach(function (vol) {
    var map = (vol && vol.terms) || {};
    var volHits = null;
    terms.forEach(function (t) {
      var ids = (map[t] || []).map(String);
      volHits = volHits === null ? ids : volHits.filter(function (k) { return ids.indexOf(k) >= 0; });
    });
    hits = (hits || []).concat(volHits || []);
  });
  var results = (hits || []).map(function (k) { return byKey[k]; }).filter(Boolean);
  results.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
  return { terms: terms, results: results };
}

var __biaData = null;
function biaLoad() {
  if (__biaData) return __biaData;
  __biaData = Promise.all([
    fetch("../data/bia-index.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("bia index " + r.status); return r.json(); })
  ].concat(BIA_VOLUMES.map(function (v) {
    return fetch("../data/bia-search/vol" + v + ".json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("bia vol " + r.status); return r.json(); });
  }))).then(function (all) { return { index: all[0], volumes: all.slice(1) }; });
  __biaData.catch(function () { __biaData = null; });
  return __biaData;
}

function renderBiaResults(view, updated) {
  var status = document.getElementById("bia-status");
  var list = document.getElementById("bia-results");
  if (!list) return;
  list.textContent = "";
  if (status) {
    status.textContent = !view.terms.length
      ? "Enter at least one keyword of three or more letters."
      : view.results.length + " decision(s) contain every keyword. Snapshot updated: " + (updated || "(unknown)") + ".";
  }
  view.results.forEach(function (e) {
    var li = document.createElement("li");
    li.className = "bia-result";
    var head = document.createElement("p");
    head.className = "bia-result-head";
    var href = biaHref(e.pdf_url);
    var label = (e.display_name || "") + ", " + (e.citation || "") + " (" + (e.body === "AG" ? "A.G." : "BIA") + " " + (e.year || "") + ")";
    if (href) {
      var a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label + " \u2014 official PDF \u2197";
      head.appendChild(a);
    } else {
      head.appendChild(document.createTextNode(label));
    }
    var note = document.createElement("p");
    note.className = "bia-result-note";
    note.textContent = BIA_RESULT_NOTE;
    li.appendChild(head);
    li.appendChild(note);
    list.appendChild(li);
  });
}

function runBiaSearch(evt) {
  if (evt && evt.preventDefault) evt.preventDefault();
  var input = document.getElementById("bia-query");
  var status = document.getElementById("bia-status");
  var query = input ? input.value : "";
  if (!biaTokenize(query).length) {
    renderBiaResults({ terms: [], results: [] }, "");
    return;
  }
  if (typeof vcCount === "function") vcCount("legal-bia-search");
  if (status) status.textContent = "Loading the volume 30 snapshot\u2026";
  biaLoad().then(function (d) {
    renderBiaResults(biaSearch(d.index, d.volumes, query), d.index && d.index.last_success_utc);
  }).catch(function () {
    var list = document.getElementById("bia-results");
    if (list) list.textContent = "";
    if (status) status.textContent = "The BIA snapshot could not be loaded. Use the EOIR Agency Decisions link above to search by hand.";
  });
}

if (typeof document !== "undefined") {
  var bindBia = function () {
    var form = document.getElementById("bia-form");
    if (form) form.addEventListener("submit", runBiaSearch);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindBia);
  else bindBia();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BIA_RESULT_NOTE, BIA_SCOPE_NOTE, BIA_VOLUMES, biaTokenize, biaHref, biaSearch };
}
