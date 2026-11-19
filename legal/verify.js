/* Citation existence check (browser).
   - Reported court cites (U.S., F.3d, F.4th, S. Ct., ...): POST only the
     citation (volume, reporter, page) to this site's /api/verify, which
     asks CourtListener. The rest of the pasted text stays in the browser.
   - I&N Dec. cites: looked up in the static BIA library on this site
     (data/bia-cite-index.json, built from EOIR Agency Decisions pages).
   - Statutes, regulations, the Federal Register, AAO: not checked.
   "Verified — found" is used only when a lookup returned a record.
   Found means the citation exists. It does not mean the case is still
   good law or that it supports the claim. */
var VERIFY_LOOKUP_URL = "https://verifycites-verify.szzxli711.workers.dev";
var VERIFY_CHUNK = 25;
var VERIFY_TIMEOUT_MS = 20000;
var VERIFY_SRC_CL = "CourtListener";
var VERIFY_SRC_BIA = "VerifyCites BIA library (EOIR precedent decisions)";
var VERIFY_FOUND_NOTE = "Found means this citation exists. It does not mean it is still good law or that it supports the claim.";

function verifyNorm(s) {
  return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\bet\s*al\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
var VERIFY_NAME_STOP = ["the", "of", "and", "inc", "llc", "corp", "co", "ltd", "company", "city", "county", "state",
  "united", "states", "america", "matter", "in", "re", "ex", "rel", "for", "a", "an"];
function verifyPartyTokens(party) {
  return verifyNorm(party).split(" ").filter(function (t) { return t.length > 1; });
}
/* "match" when the main word of each side of "A v. B" (or every token
   of "Matter of X") appears in the record name. Used only to tell the
   reader when the name in the text is a different case. */
function verifyNameCompare(textName, recordName) {
  if (!textName) return "none";
  var rec = " " + verifyNorm(recordName) + " ";
  var m = /^(.*?)\s+v\.?\s+(.*)$/i.exec(textName);
  var sides = m ? [m[1], m[2]] : [String(textName).replace(/^\s*(?:in\s+re|matter\s+of)\s+/i, "")];
  var ok = sides.every(function (side) {
    var toks = verifyPartyTokens(side).filter(function (t) { return VERIFY_NAME_STOP.indexOf(t) < 0; });
    if (!toks.length) toks = verifyPartyTokens(side);
    if (!toks.length) return true;
    return toks.some(function (t) { return rec.indexOf(" " + t + " ") >= 0; });
  });
  return ok ? "match" : "mismatch";
}

function verifyCiteKey(text) {
  var s = String(text || "").replace(/\s+/g, " ").trim();
  var m = /^(\d+)\s+(.+?)\s+(\d+)$/.exec(s);
  if (!m) return "";
  return String(parseInt(m[1], 10)) + "|" + m[2].toLowerCase().replace(/[^a-z0-9]+/g, "") + "|" + String(parseInt(m[3], 10));
}

/* Pure: one court cite against one trimmed CourtListener lookup item
   (or null when that cite was not in the response). */
function verifyCourtFromLookup(row, item) {
  var cite = row.volume + " " + row.reporter + " " + row.page;
  if (!item) {
    return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_CL, code: "nc_unreturned", params: {} };
  }
  if (item.status === 429) {
    return { label: "RATE_LIMITED", sourceName: VERIFY_SRC_CL, code: "nc_rate", params: {} };
  }
  if (item.status === 400) {
    return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_CL, code: "nc_reporter", params: { reporter: row.reporter || "" } };
  }
  var clusters = (item.clusters || []).filter(function (c) { return c && (c.caseName || c.url); });
  if (item.status === 404) {
    return { label: "NOT_FOUND", sourceName: VERIFY_SRC_CL, code: "nf_court", params: { cite: cite } };
  }
  if ((item.status === 200 || item.status === 300) && clusters.length) {
    var first = clusters[0];
    var names = clusters.map(function (c) { return c.caseName; }).filter(Boolean);
    var year = first.dateFiled ? String(first.dateFiled).slice(0, 4) : "";
    var st = verifyNameCompare(row.caseName, names.join(" "));
    var code = "ok";
    if (st === "mismatch") code = "ok_name_differs";
    else if (clusters.length > 1) code = "ok_several";
    return {
      label: "VERIFIED", sourceName: VERIFY_SRC_CL, code: code,
      url: first.url || "", recordName: first.caseName || "", recordYear: year,
      params: { name: first.caseName || "", year: year, textName: row.caseName || "", also: names.slice(1).join("; "), cite: cite }
    };
  }
  return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_CL, code: "nc_empty", params: {} };
}

function biaEntryVolume(e) {
  if (e.volume != null && e.volume !== "") return String(parseInt(e.volume, 10));
  var m = /^(\d+)/.exec(e.citation || "");
  return m ? String(parseInt(m[1], 10)) : "";
}
function biaEntryPage(e) {
  if (e.page != null && e.page !== "") return parseInt(e.page, 10);
  var m = /I&N Dec\.\s*(\d+)/.exec(e.citation || "");
  return m ? parseInt(m[1], 10) : NaN;
}
function biaEntryName(e) { return e.name || e.display_name || ""; }
function biaEntryUrl(e) { return e.url || e.pdf_url || ""; }

function verifyBiaCoverage(volumes) {
  var nums = [];
  (volumes || []).forEach(function (v) {
    var n = parseInt(v, 10);
    if (!isNaN(n) && nums.indexOf(n) < 0) nums.push(n);
  });
  nums.sort(function (a, b) { return a - b; });
  if (!nums.length) return { code: "nc_bia_empty", params: {} };
  if (nums.length === 1) return { code: "nc_bia_one", params: { span: String(nums[0]) } };
  var contig = nums.every(function (n, i) { return i === 0 || n === nums[i - 1] + 1; });
  if (contig) return { code: "nc_bia_range", params: { span: nums[0] + "\u2013" + nums[nums.length - 1] } };
  return { code: "nc_bia_list", params: { span: nums.join(", ") } };
}

/* Pure: one I&N Dec. cite against the static library.
   A volume listed in index.volumes (or, if that list is absent, any
   volume that has entries) is complete: a miss is Not found. Any other
   volume is Not checked, and the reason names the volumes we do have.
   A hit is Verified — found even when the volume is not in the complete
   list, because that one decision was in the file. */
function verifyBiaRow(row, index) {
  var entries = (index && index.entries) || [];
  var vol = String(parseInt(row.volume, 10));
  var page = parseInt(row.page, 10);
  if (!row || row.page == null || isNaN(page)) {
    return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_BIA, code: "nc_bia_nopage", params: {} };
  }
  var cite = vol + " I&N Dec. " + page;
  var hit = null;
  for (var i = 0; i < entries.length; i++) {
    if (biaEntryVolume(entries[i]) === vol && biaEntryPage(entries[i]) === page) { hit = entries[i]; break; }
  }
  if (hit) {
    var name = biaEntryName(hit);
    var year = hit.year != null ? String(hit.year) : "";
    var st = verifyNameCompare(row.caseName, name);
    return {
      label: "VERIFIED", sourceName: VERIFY_SRC_BIA, code: st === "mismatch" ? "ok_name_differs" : "ok",
      url: biaEntryUrl(hit), recordName: name, recordYear: year,
      params: { name: name, year: year, textName: row.caseName || "", also: "", cite: cite }
    };
  }
  var complete = (index && index.volumes && index.volumes.length)
    ? index.volumes.map(function (v) { return String(parseInt(v, 10)); })
    : entries.map(biaEntryVolume).filter(Boolean);
  var seen = {};
  complete.forEach(function (v) { if (v && v !== "NaN") seen[v] = true; });
  var cov = verifyBiaCoverage(Object.keys(seen));
  if (seen[vol]) {
    return { label: "NOT_FOUND", sourceName: VERIFY_SRC_BIA, code: "nf_bia", params: { cite: cite } };
  }
  return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_BIA, code: cov.code, params: cov.params };
}

function verifyRowKind(row) {
  var rep = row.reporter || "";
  if (rep === "I&N Dec.") return "bia";
  if (rep === "INA" || rep === "8 CFR" || rep === "8 U.S.C." || rep === "Fed. Reg.") return "statute";
  if (rep === "AAO") return "aao";
  if (/C\.?F\.?R|U\.?S\.?C/.test(rep)) return "statute";
  return "court";
}
function verifyNotCheckedCode(kind) { return kind === "aao" ? "nc_aao" : "nc_statute"; }

function verifyUnavailable(code) {
  return {
    label: code === "nc_rate" ? "RATE_LIMITED" : "NOT_CHECKED",
    sourceName: VERIFY_SRC_CL, code: code, params: {}
  };
}

var VERIFY_TEXT = {
  en: {
    badge: { pending: "Not checked", found: "Verified \u2014 found", notFound: "Not found", notChecked: "Not checked ({reason})" },
    ok: "Record: {name} ({year}).",
    ok_name_differs: "Record: {name} ({year}). Your text names {textName}.",
    ok_several: "Record: {name} ({year}). Other records at this citation: {also}.",
    nf_court: "We checked CourtListener and no matching record exists. This citation may be wrong or fabricated.",
    nf_bia: "We checked our BIA library and no decision is listed at {cite}. This citation may be wrong or fabricated.",
    nc_lookup: "lookup unavailable",
    nc_rate: "lookup rate limited",
    nc_reporter: "this reporter is not in CourtListener",
    nc_unreturned: "lookup did not return this citation",
    nc_empty: "lookup returned no record",
    nc_bia_one: "BIA library currently covers volume {span}",
    nc_bia_range: "BIA library currently covers volumes {span}",
    nc_bia_list: "BIA library currently covers volumes {span}",
    nc_bia_nopage: "no starting page to look up",
    nc_bia_empty: "BIA library is empty",
    nc_bia_load: "BIA library could not be loaded",
    nc_statute: "statutes, regulations, and the Federal Register are not looked up here",
    nc_aao: "AAO decisions are not looked up here",
    foundNote: "Found means this citation exists. It does not mean it is still good law or that it supports the claim.",
    checking: "Checking\u2026"
  },
  es: {
    badge: { pending: "No verificado", found: "Verificado \u2014 encontrado", notFound: "No encontrado", notChecked: "No verificado ({reason})" },
    ok: "Registro: {name} ({year}).",
    ok_name_differs: "Registro: {name} ({year}). Su texto nombra {textName}.",
    ok_several: "Registro: {name} ({year}). Otros registros en esta cita: {also}.",
    nf_court: "Consultamos CourtListener y no hay un registro que coincida. La cita puede estar mal o ser inventada.",
    nf_bia: "Consultamos nuestra biblioteca de la BIA y no hay una decisi\u00f3n en {cite}. La cita puede estar mal o ser inventada.",
    nc_lookup: "consulta no disponible",
    nc_rate: "l\u00edmite de consultas",
    nc_reporter: "este repertorio no est\u00e1 en CourtListener",
    nc_unreturned: "la consulta no devolvi\u00f3 esta cita",
    nc_empty: "la consulta no devolvi\u00f3 un registro",
    nc_bia_one: "la biblioteca de la BIA ahora cubre el volumen {span}",
    nc_bia_range: "la biblioteca de la BIA ahora cubre los vol\u00famenes {span}",
    nc_bia_list: "la biblioteca de la BIA ahora cubre los vol\u00famenes {span}",
    nc_bia_nopage: "no hay p\u00e1gina inicial para consultar",
    nc_bia_empty: "la biblioteca de la BIA est\u00e1 vac\u00eda",
    nc_bia_load: "no se pudo cargar la biblioteca de la BIA",
    nc_statute: "aqu\u00ed no se consultan leyes, reglamentos ni el Federal Register",
    nc_aao: "aqu\u00ed no se consultan decisiones del AAO",
    foundNote: "Encontrado significa que la cita existe. No significa que siga siendo derecho vigente ni que respalde la afirmaci\u00f3n.",
    checking: "Comprobando\u2026"
  },
  zh: {
    badge: { pending: "\u672a\u6838\u5b9e", found: "\u5df2\u6838\u5b9e\u2014\u2014\u627e\u5230", notFound: "\u672a\u627e\u5230", notChecked: "\u672a\u6838\u5b9e\uff08{reason}\uff09" },
    ok: "\u8bb0\u5f55\uff1a{name}\uff08{year}\uff09\u3002",
    ok_name_differs: "\u8bb0\u5f55\uff1a{name}\uff08{year}\uff09\u3002\u60a8\u7684\u6587\u672c\u5199\u7684\u662f {textName}\u3002",
    ok_several: "\u8bb0\u5f55\uff1a{name}\uff08{year}\uff09\u3002\u8be5\u5f15\u7528\u8fd8\u6709\u5176\u4ed6\u8bb0\u5f55\uff1a{also}\u3002",
    nf_court: "\u5df2\u67e5\u8be2 CourtListener\uff0c\u6ca1\u6709\u5339\u914d\u8bb0\u5f55\u3002\u8be5\u5f15\u7528\u53ef\u80fd\u6709\u8bef\u6216\u7cfb\u865a\u6784\u3002",
    nf_bia: "\u5df2\u67e5\u8be2\u6211\u4eec\u7684 BIA \u5e93\uff0c{cite} \u5904\u6ca1\u6709\u51b3\u5b9a\u3002\u8be5\u5f15\u7528\u53ef\u80fd\u6709\u8bef\u6216\u7cfb\u865a\u6784\u3002",
    nc_lookup: "\u67e5\u8be2\u4e0d\u53ef\u7528",
    nc_rate: "\u67e5\u8be2\u9891\u7387\u53d7\u9650",
    nc_reporter: "CourtListener \u4e0d\u6536\u5f55\u8be5\u51fa\u7248\u7269",
    nc_unreturned: "\u67e5\u8be2\u6ca1\u6709\u8fd4\u56de\u8be5\u5f15\u7528",
    nc_empty: "\u67e5\u8be2\u6ca1\u6709\u8fd4\u56de\u8bb0\u5f55",
    nc_bia_one: "BIA \u5e93\u76ee\u524d\u53ea\u8986\u76d6\u7b2c {span} \u5377",
    nc_bia_range: "BIA \u5e93\u76ee\u524d\u8986\u76d6\u7b2c {span} \u5377",
    nc_bia_list: "BIA \u5e93\u76ee\u524d\u8986\u76d6\u7b2c {span} \u5377",
    nc_bia_nopage: "\u6ca1\u6709\u53ef\u67e5\u8be2\u7684\u8d77\u59cb\u9875",
    nc_bia_empty: "BIA \u5e93\u4e3a\u7a7a",
    nc_bia_load: "BIA \u5e93\u672a\u80fd\u52a0\u8f7d",
    nc_statute: "\u6b64\u5904\u4e0d\u67e5\u8be2\u6cd5\u89c4\u3001\u6761\u4f8b\u548c Federal Register",
    nc_aao: "\u6b64\u5904\u4e0d\u67e5\u8be2 AAO \u51b3\u5b9a",
    foundNote: "\u201c\u627e\u5230\u201d\u53ea\u8868\u793a\u8be5\u5f15\u7528\u5b58\u5728\u3002\u4e0d\u8868\u793a\u5b83\u4ecd\u662f\u6709\u6548\u6cd5\u5f8b\uff0c\u4e5f\u4e0d\u8868\u793a\u5b83\u652f\u6301\u6240\u8ff0\u4e3b\u5f20\u3002",
    checking: "\u6838\u5b9e\u4e2d\u2026"
  }
};

function verifyFill(tpl, params) {
  return String(tpl || "").replace(/\{(\w+)\}/g, function (_m, k) { return params && params[k] != null ? params[k] : ""; });
}
function verifyUserStatus(row, lang) {
  var T = VERIFY_TEXT[lang] || VERIFY_TEXT.en;
  var v = row && row.verify;
  if (!v) return T.badge.pending;
  if (v.label === "VERIFIED") return T.badge.found;
  if (v.label === "NOT_FOUND") return T.badge.notFound;
  var reason = verifyFill(T[v.code] || T.nc_lookup, v.params);
  return verifyFill(T.badge.notChecked, { reason: reason });
}
function verifyStatusSentence(row, lang) {
  var v = row && row.verify;
  if (!v) return "";
  var T = VERIFY_TEXT[lang] || VERIFY_TEXT.en;
  if (v.label === "VERIFIED") {
    return T.badge.found + ". " + verifyFill(T[v.code] || T.ok, v.params) + " " + T.foundNote;
  }
  if (v.label === "NOT_FOUND") {
    return T.badge.notFound + ". " + verifyFill(T[v.code] || T.nf_court, v.params);
  }
  return verifyUserStatus(row, lang) + ".";
}

function verifySummary(rows) {
  var s = { total: rows.length, verified: 0, cited: 0, mismatch: 0, not_found: 0, not_checked: 0, failed: 0 };
  rows.forEach(function (r) {
    if (r.label === "VERIFIED") s.verified++;
    else if (r.label === "NOT_FOUND") s.not_found++;
    else if (r.label === "RATE_LIMITED" || r.label === "LOOKUP_FAILED") s.failed++;
    else s.not_checked++;
  });
  return s;
}

function verifyPostCitations(fetchImpl, url, citations, timeoutMs) {
  var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs);
  var opts = {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ citations: citations })
  };
  if (ctl) opts.signal = ctl.signal;
  return fetchImpl(url, opts).then(function (r) {
    clearTimeout(timer);
    if (!r || typeof r.json !== "function") return { http: 0, body: null };
    return r.json().then(function (body) { return { http: r.status, body: body }; }, function () { return { http: r.status, body: null }; });
  }, function () {
    clearTimeout(timer);
    return { http: 0, body: null };
  });
}

/* deps: { fetch, onProgress(done,total), timeoutMs, lookupUrl, biaIndexUrl }.
   Sets row.label and row.verify. "Verified" is set only from a match. */
function verifyRows(rows, deps) {
  deps = deps || {};
  var fetchImpl = deps.fetch || (typeof fetch !== "undefined" ? fetch.bind(typeof window !== "undefined" ? window : globalThis) : null);
  var timeoutMs = deps.timeoutMs || VERIFY_TIMEOUT_MS;
  var lookupUrl = deps.lookupUrl || VERIFY_LOOKUP_URL;
  var biaUrl = deps.biaIndexUrl || "/data/bia-cite-index.json";
  var biaFallback = deps.biaFallbackUrl || "/data/bia-index.json";
  var total = rows.length;
  var done = 0;
  function tick() { done++; if (deps.onProgress) deps.onProgress(done, total); }
  function apply(row, res) { row.verify = res; row.label = res.label; tick(); }
  var court = [];
  var bia = [];
  rows.forEach(function (row) {
    var kind = verifyRowKind(row);
    if (kind === "court") court.push(row);
    else if (kind === "bia") bia.push(row);
    else apply(row, { label: "NOT_CHECKED", sourceName: null, code: verifyNotCheckedCode(kind), params: {} });
  });
  function biaJobClean() {
    if (!bia.length) return Promise.resolve();
    if (!fetchImpl) {
      bia.forEach(function (row) { apply(row, { label: "NOT_CHECKED", sourceName: VERIFY_SRC_BIA, code: "nc_bia_load", params: {} }); });
      return Promise.resolve();
    }
    function readIndex(url) {
      return fetchImpl(url).then(function (r) {
        if (!r || r.ok === false) throw new Error("bia");
        return r.json();
      });
    }
    return readIndex(biaUrl).catch(function () { return readIndex(biaFallback); }).then(function (idx) {
      bia.forEach(function (row) { apply(row, verifyBiaRow(row, idx)); });
    }).catch(function () {
      bia.forEach(function (row) {
        if (!row.verify) apply(row, { label: "NOT_CHECKED", sourceName: VERIFY_SRC_BIA, code: "nc_bia_load", params: {} });
      });
    });
  }
  function courtJob() {
    if (!court.length) return Promise.resolve();
    if (!fetchImpl) {
      court.forEach(function (row) { apply(row, verifyUnavailable("nc_lookup")); });
      return Promise.resolve();
    }
    var chunks = [];
    for (var i = 0; i < court.length; i += VERIFY_CHUNK) chunks.push(court.slice(i, i + VERIFY_CHUNK));
    var stopped = null;
    var chain = Promise.resolve();
    chunks.forEach(function (chunk) {
      chain = chain.then(function () {
        if (stopped) {
          chunk.forEach(function (row) { apply(row, verifyUnavailable(stopped)); });
          return;
        }
        var citations = chunk.map(function (row) { return row.volume + " " + row.reporter + " " + row.page; });
        return verifyPostCitations(fetchImpl, lookupUrl, citations, timeoutMs).then(function (res) {
          var body = res && res.body;
          if (!body || body.ok !== true || !Array.isArray(body.results)) {
            stopped = body && body.reason === "rate_limited" ? "nc_rate" : "nc_lookup";
            chunk.forEach(function (row) { apply(row, verifyUnavailable(stopped)); });
            return;
          }
          chunk.forEach(function (row) {
            var key = verifyCiteKey(row.volume + " " + row.reporter + " " + row.page);
            var item = null;
            body.results.forEach(function (it) {
              if (item) return;
              var keys = [verifyCiteKey(it.citation)].concat((it.normalized || []).map(verifyCiteKey));
              if (keys.indexOf(key) >= 0) item = it;
            });
            var mapped = verifyCourtFromLookup(row, item);
            if (mapped.label === "RATE_LIMITED") stopped = "nc_rate";
            apply(row, mapped);
          });
        });
      });
    });
    return chain;
  }
  return Promise.all([biaJobClean(), courtJob()]).then(function () { return verifySummary(rows); });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VERIFY_TEXT, VERIFY_FOUND_NOTE, VERIFY_SRC_CL, VERIFY_SRC_BIA,
    verifyRows, verifyCourtFromLookup, verifyBiaRow, verifyBiaCoverage,
    verifyCiteKey, verifyNameCompare, verifyRowKind, verifyUserStatus,
    verifySummary, verifyStatusSentence, verifyNorm
  };
}
