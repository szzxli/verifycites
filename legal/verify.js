/* Citation existence check (browser). What this does, exactly:
   - Court-reporter cites (U.S., F.3d, F. Supp. 2d, ...): looks the volume
     up in the Caselaw Access Project static files (static.case.law,
     Harvard Library Innovation Lab, free, no account) and compares the
     case at that volume/first page with the case name in your text.
   - I&N Dec. cites: looks the volume/page up in this site's own BIA
     library file (data/bia-index.json, built from EOIR's decisions pages).
   - Everything else (statutes, regulations, Federal Register, AAO):
     not checked here.
   Only the reporter, volume and page are ever requested. Your pasted
   text and case names never leave the browser.
   A "Verified" row means: a decision with that citation exists in that
   source and its name matches. It says NOTHING about whether the case is
   good law, whether later decisions overruled or limited it, or whether
   it supports your argument: subsequent history is NOT checked. */
var VERIFY_CAP_BASE = "https://static.case.law/";
var VERIFY_TIMEOUT_MS = 12000;
var VERIFY_CONCURRENCY = 4;
var VERIFY_NOT_GOOD_LAW = "Subsequent history and good-law status are not checked.";
var VERIFY_SRC_CAP = "Caselaw Access Project (Harvard, static.case.law)";
var VERIFY_SRC_BIA = "VerifyCites BIA library (EOIR precedent decisions)";

function verifyNorm(s) {
  return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\bet\s*al\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
var VERIFY_NAME_STOP = ["the", "of", "and", "inc", "llc", "corp", "co", "ltd", "company", "city", "county", "state",
  "united", "states", "america", "matter", "in", "re", "ex", "rel", "for", "a", "an"];
function verifyPartyTokens(party) {
  return verifyNorm(party).split(" ").filter(function (t) { return t.length > 1; });
}
/* Case-name comparison. "A v. B" matches a record when the main word of
   each side appears in the record name (stop words and corporate
   suffixes ignored). "Matter of X" matches when every X token appears.
   Returns "match", "mismatch", or "none" (no name in the text). */
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
function verifyAbbrKey(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

/* Map an extracted reporter abbreviation to a CAP reporter slug using
   CAP's own ReportersMetadata.json (short_name -> slug). */
function verifySlugFor(reporters, abbreviation) {
  var key = verifyAbbrKey(abbreviation);
  for (var i = 0; i < (reporters || []).length; i++) {
    if (verifyAbbrKey(reporters[i].short_name) === key) return reporters[i].slug;
  }
  return null;
}
function verifyCapHtmlUrl(slug, vol, c) {
  return VERIFY_CAP_BASE + slug + "/" + vol + "/html/" + c.file_name + ".html";
}
/* Pure: decide the result for one court cite given the volume's case list
   (array, or null when the volume is not in CAP). */
function verifyCourtRow(row, slug, cases) {
  var out = { sourceName: VERIFY_SRC_CAP };
  if (!slug) {
    return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_CAP, code: "nc_reporter", params: { reporter: row.reporter } };
  }
  if (cases === null) {
    return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_CAP, code: "nc_volume", params: { reporter: row.reporter, volume: row.volume } };
  }
  var page = String(parseInt(row.page, 10));
  var hits = cases.filter(function (c) { return String(parseInt(c.first_page, 10)) === page; });
  if (!hits.length) {
    var inside = cases.filter(function (c) { return parseInt(c.first_page, 10) < +page && +page <= parseInt(c.last_page, 10); })[0];
    return { label: "NOT_FOUND", sourceName: VERIFY_SRC_CAP,
      code: inside ? "nf_court_inside" : "nf_court", params: { cite: row.volume + " " + row.reporter + " " + row.page,
        inside: inside ? (inside.name_abbreviation || inside.name) : "", insidePage: inside ? inside.first_page : "" } };
  }
  var best = null, state = "none";
  hits.forEach(function (c) {
    var st = verifyNameCompare(row.caseName, c.name_abbreviation + " " + c.name);
    if (st === "match" || (st === "none" && state !== "match") || !best) {
      if (state !== "match") { best = c; state = st; }
    }
  });
  var yr = best.decision_date ? best.decision_date.slice(0, 4) : null;
  var url = verifyCapHtmlUrl(slug, row.volume, best);
  var recordName = best.name_abbreviation || best.name;
  var yearBad = !!(row.year && yr && Math.abs(parseInt(row.year, 10) - parseInt(yr, 10)) > 1);
  var yearOff = !!(row.year && yr && parseInt(row.year, 10) !== parseInt(yr, 10));
  out.url = url; out.recordName = recordName; out.recordYear = yr;
  var p = { name: recordName, year: yr || "", textName: row.caseName || "", textYear: row.year || "" };
  out.params = p;
  if (state === "mismatch") { out.label = "MISMATCH"; out.code = "mismatch_name"; }
  else if (state === "none") { out.label = "CITED"; out.code = "cited_noname"; }
  else if (yearBad) { out.label = "MISMATCH"; out.code = "mismatch_year"; }
  else { out.label = "VERIFIED"; out.code = yearOff ? "ok_year1" : "ok"; }
  return out;
}

/* Pure: BIA row against the library index (data/bia-index.json). */
function verifyBiaRow(row, index) {
  var entries = (index && index.entries) || [];
  var cite = row.volume + " I&N Dec. " + parseInt(row.page, 10);
  var vols = {};
  entries.forEach(function (e) { vols[String(e.volume)] = (vols[String(e.volume)] || 0) + 1; });
  var volList = Object.keys(vols).sort(function (a, b) { return a - b; });
  var hit = entries.filter(function (e) { return e.citation === cite; })[0];
  if (hit) {
    var st = verifyNameCompare(row.caseName, hit.display_name);
    var base = { sourceName: VERIFY_SRC_BIA, url: hit.pdf_url, recordName: hit.display_name, recordYear: String(hit.year),
      params: { name: hit.display_name, year: String(hit.year), textName: row.caseName || "", textYear: row.year || "" } };
    if (st === "mismatch") { base.label = "MISMATCH"; base.code = "mismatch_name"; }
    else if (st === "none") { base.label = "CITED"; base.code = "cited_noname"; }
    else if (row.year && Math.abs(parseInt(row.year, 10) - hit.year) > 1) { base.label = "MISMATCH"; base.code = "mismatch_year"; }
    else { base.label = "VERIFIED"; base.code = row.year && parseInt(row.year, 10) !== hit.year ? "ok_year1" : "ok"; }
    return base;
  }
  var n = vols[String(parseInt(row.volume, 10))] || vols[String(row.volume)];
  if (n) {
    return { label: "NOT_FOUND", sourceName: VERIFY_SRC_BIA, code: "nf_bia", params: { cite: cite, n: String(n), volume: String(row.volume) } };
  }
  return { label: "NOT_CHECKED", sourceName: VERIFY_SRC_BIA, code: "nc_bia_outside", params: { vols: volList.join(", ") || "-" } };
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

function verifyWithTimeout(fetchImpl, url, ms) {
  var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var timer = null;
  var timeout = new Promise(function (_res, rej) {
    timer = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error("timeout after " + Math.round(ms / 1000) + " s")); }, ms);
  });
  var req = fetchImpl(url, ctl ? { signal: ctl.signal } : {});
  return Promise.race([req, timeout]).then(function (r) { clearTimeout(timer); return r; },
    function (e) { clearTimeout(timer); throw e; });
}

/* deps: { fetch, onProgress(done,total), timeoutMs } . Mutates rows:
   row.label, row.verify = {label, sourceName, url, reason, recordName,
   recordYear}. Returns a summary object. */
function verifyRows(rows, deps) {
  deps = deps || {};
  var fetchImpl = deps.fetch || (typeof fetch !== "undefined" ? fetch.bind(typeof window !== "undefined" ? window : globalThis) : null);
  var timeoutMs = deps.timeoutMs || VERIFY_TIMEOUT_MS;
  var cache = deps.cache || {};
  var total = rows.length, done = 0;
  function tick() { done++; if (deps.onProgress) deps.onProgress(done, total); }
  function getJson(url) {
    if (!cache[url]) {
      cache[url] = verifyWithTimeout(fetchImpl, url, timeoutMs).then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }
    return cache[url];
  }
  function failed(row, err) {
    row.verify = { label: "LOOKUP_FAILED", sourceName: null, code: "failed", params: { err: (err && err.message) || "network error" } };
    row.label = "LOOKUP_FAILED";
  }
  function apply(row, res) { row.verify = res; row.label = res.label; }
  function one(row) {
    var kind = verifyRowKind(row);
    if (kind !== "bia" && kind !== "court") {
      apply(row, { label: "NOT_CHECKED", sourceName: null, code: verifyNotCheckedCode(kind), params: {} });
      return Promise.resolve();
    }
    if (!fetchImpl) { failed(row, new Error("no network access")); return Promise.resolve(); }
    if (kind === "bia") {
      return getJson(deps.biaIndexUrl || "/data/bia-index.json").then(function (idx) {
        apply(row, verifyBiaRow(row, idx));
      }).catch(function (e) { failed(row, e); });
    }
    return getJson(VERIFY_CAP_BASE + "ReportersMetadata.json").then(function (reps) {
      var slug = verifySlugFor(reps, row.reporter);
      if (!slug) { apply(row, verifyCourtRow(row, null, null)); return null; }
      return getJson(VERIFY_CAP_BASE + slug + "/" + parseInt(row.volume, 10) + "/CasesMetadata.json").then(function (cases) {
        apply(row, verifyCourtRow(row, slug, cases));
      });
    }).catch(function (e) { failed(row, e); });
  }
  var queue = rows.slice();
  var active = 0;
  return new Promise(function (resolve) {
    function pump() {
      if (!queue.length && !active) { resolve(verifySummary(rows)); return; }
      while (active < VERIFY_CONCURRENCY && queue.length) {
        active++;
        one(queue.shift()).then(function () { active--; tick(); pump(); });
      }
    }
    if (!rows.length) resolve(verifySummary(rows)); else pump();
  });
}
function verifySummary(rows) {
  var s = { total: rows.length, verified: 0, cited: 0, mismatch: 0, not_found: 0, not_checked: 0, failed: 0 };
  rows.forEach(function (r) {
    switch (r.label) {
      case "VERIFIED": s.verified++; break;
      case "CITED": s.cited++; break;
      case "MISMATCH": s.mismatch++; break;
      case "NOT_FOUND": s.not_found++; break;
      case "LOOKUP_FAILED": s.failed++; break;
      default: s.not_checked++;
    }
  });
  return s;
}
/* One plain sentence per row, in the fixed forms the page promises, in
   the page language. Record names stay as the source prints them. */
var VERIFY_TEXT = {
  en: {
    lead: { VERIFIED: "Verified: found in {src}.", CITED: "Found in {src}, name not compared.", MISMATCH: "Mismatch in {src}.",
      NOT_FOUND: "Not found in {src}.", NOT_CHECKED: "Not checked:", LOOKUP_FAILED: "Not checked:" },
    ok: "The citation exists and the case name matches: {name} ({year}).",
    ok_year1: "The citation exists and the case name matches: {name} ({year}). Your text says {textYear}; reporter year can differ by one.",
    cited_noname: "A decision exists at this citation: {name} ({year}). Your text has no case name to compare.",
    mismatch_name: "A different case is at this citation: {name} ({year}). Your text names {textName}.",
    mismatch_year: "The name matches {name}, but the year differs: your text says {textYear}, the record says {year}.",
    nf_court: "No decision begins at {cite} in that volume.",
    nf_court_inside: "No decision begins at {cite}; that page is inside {inside}, which begins at page {insidePage}.",
    nf_bia: "No decision at {cite}. Our library holds {n} decisions of volume {volume} and may be incomplete; check EOIR directly.",
    nc_reporter: "outside coverage. {reporter} is not a reporter in the Caselaw Access Project.",
    nc_volume: "outside coverage. {reporter} volume {volume} is not in the Caselaw Access Project, which covers published decisions up to about 2018\u20132020.",
    nc_bia_outside: "outside coverage. Our BIA library currently covers volume(s) {vols} only.",
    nc_statute: "statutes, regulations and the Federal Register are not checked here. Use the source link.",
    nc_aao: "AAO decisions are not checked here. Use the source link.",
    failed: "the lookup failed ({err}). Try again.",
    note: "This confirms a decision exists at that citation. Subsequent history and good-law status are not checked.",
    checking: "Checking\u2026"
  },
  es: {
    lead: { VERIFIED: "Verificado: encontrado en {src}.", CITED: "Encontrado en {src}, nombre sin comparar.", MISMATCH: "No coincide en {src}.",
      NOT_FOUND: "No encontrado en {src}.", NOT_CHECKED: "No verificado:", LOOKUP_FAILED: "No verificado:" },
    ok: "La cita existe y el nombre del caso coincide: {name} ({year}).",
    ok_year1: "La cita existe y el nombre del caso coincide: {name} ({year}). Su texto dice {textYear}; el a\u00f1o del reporter puede diferir en uno.",
    cited_noname: "Existe una decisi\u00f3n en esta cita: {name} ({year}). Su texto no incluye nombre del caso para comparar.",
    mismatch_name: "Hay un caso distinto en esta cita: {name} ({year}). Su texto nombra {textName}.",
    mismatch_year: "El nombre coincide con {name}, pero el a\u00f1o difiere: su texto dice {textYear}, el registro dice {year}.",
    nf_court: "Ninguna decisi\u00f3n comienza en {cite} en ese volumen.",
    nf_court_inside: "Ninguna decisi\u00f3n comienza en {cite}; esa p\u00e1gina est\u00e1 dentro de {inside}, que comienza en la p\u00e1gina {insidePage}.",
    nf_bia: "No hay decisi\u00f3n en {cite}. Nuestra biblioteca tiene {n} decisiones del volumen {volume} y puede estar incompleta; consulte EOIR directamente.",
    nc_reporter: "fuera de cobertura. {reporter} no es un reporter del Caselaw Access Project.",
    nc_volume: "fuera de cobertura. {reporter} volumen {volume} no est\u00e1 en el Caselaw Access Project, que cubre decisiones publicadas hasta aproximadamente 2018\u20132020.",
    nc_bia_outside: "fuera de cobertura. Nuestra biblioteca de la BIA cubre por ahora solo el/los volumen(es) {vols}.",
    nc_statute: "aqu\u00ed no se comprueban leyes, reglamentos ni el Federal Register. Use el enlace de la fuente.",
    nc_aao: "aqu\u00ed no se comprueban decisiones del AAO. Use el enlace de la fuente.",
    failed: "fall\u00f3 la consulta ({err}). Int\u00e9ntelo de nuevo.",
    note: "Esto confirma que existe una decisi\u00f3n en esa cita. No se comprueban el historial posterior ni si sigue siendo derecho vigente.",
    checking: "Comprobando\u2026"
  },
  zh: {
    lead: { VERIFIED: "\u5df2\u6838\u5b9e\uff1a\u5728 {src} \u4e2d\u627e\u5230\u3002", CITED: "\u5728 {src} \u4e2d\u627e\u5230\uff0c\u672a\u6bd4\u5bf9\u6848\u540d\u3002", MISMATCH: "\u5728 {src} \u4e2d\u4e0d\u4e00\u81f4\u3002",
      NOT_FOUND: "\u5728 {src} \u4e2d\u672a\u627e\u5230\u3002", NOT_CHECKED: "\u672a\u6838\u5b9e\uff1a", LOOKUP_FAILED: "\u672a\u6838\u5b9e\uff1a" },
    ok: "\u8be5\u5f15\u7528\u5b58\u5728\uff0c\u6848\u540d\u4e00\u81f4\uff1a{name}\uff08{year}\uff09\u3002",
    ok_year1: "\u8be5\u5f15\u7528\u5b58\u5728\uff0c\u6848\u540d\u4e00\u81f4\uff1a{name}\uff08{year}\uff09\u3002\u60a8\u7684\u6587\u672c\u5199\u7684\u662f {textYear}\uff1b\u6c47\u7f16\u5e74\u4efd\u53ef\u80fd\u76f8\u5dee\u4e00\u5e74\u3002",
    cited_noname: "\u8be5\u5f15\u7528\u5904\u6709\u4e00\u4e2a\u5224\u51b3\uff1a{name}\uff08{year}\uff09\u3002\u60a8\u7684\u6587\u672c\u6ca1\u6709\u6848\u540d\u53ef\u4f9b\u6bd4\u5bf9\u3002",
    mismatch_name: "\u8be5\u5f15\u7528\u5904\u662f\u53e6\u4e00\u4e2a\u6848\u4ef6\uff1a{name}\uff08{year}\uff09\u3002\u60a8\u7684\u6587\u672c\u5199\u7684\u662f {textName}\u3002",
    mismatch_year: "\u6848\u540d\u4e0e {name} \u4e00\u81f4\uff0c\u4f46\u5e74\u4efd\u4e0d\u540c\uff1a\u60a8\u7684\u6587\u672c\u5199 {textYear}\uff0c\u8bb0\u5f55\u4e3a {year}\u3002",
    nf_court: "\u8be5\u5377\u4e2d\u6ca1\u6709\u4ece {cite} \u5f00\u59cb\u7684\u5224\u51b3\u3002",
    nf_court_inside: "\u6ca1\u6709\u4ece {cite} \u5f00\u59cb\u7684\u5224\u51b3\uff1b\u8be5\u9875\u5728 {inside} \u4e4b\u5185\uff0c\u8be5\u6848\u4ece\u7b2c {insidePage} \u9875\u5f00\u59cb\u3002",
    nf_bia: "{cite} \u5904\u6ca1\u6709\u51b3\u5b9a\u3002\u6211\u4eec\u7684\u5e93\u6536\u5f55\u4e86\u7b2c {volume} \u5377\u7684 {n} \u4e2a\u51b3\u5b9a\uff0c\u53ef\u80fd\u4e0d\u5b8c\u6574\uff1b\u8bf7\u76f4\u63a5\u5230 EOIR \u6838\u5bf9\u3002",
    nc_reporter: "\u8d85\u51fa\u8986\u76d6\u8303\u56f4\u3002{reporter} \u4e0d\u5728 Caselaw Access Project \u7684\u6c47\u7f16\u4e2d\u3002",
    nc_volume: "\u8d85\u51fa\u8986\u76d6\u8303\u56f4\u3002{reporter} \u7b2c {volume} \u5377\u4e0d\u5728 Caselaw Access Project \u4e2d\uff08\u5176\u8986\u76d6\u7ea6 2018\u20132020 \u5e74\u524d\u5df2\u51fa\u7248\u7684\u5224\u51b3\uff09\u3002",
    nc_bia_outside: "\u8d85\u51fa\u8986\u76d6\u8303\u56f4\u3002\u6211\u4eec\u7684 BIA \u5e93\u76ee\u524d\u53ea\u8986\u76d6\u7b2c {vols} \u5377\u3002",
    nc_statute: "\u6b64\u5904\u4e0d\u6838\u5b9e\u6cd5\u89c4\u3001\u6761\u4f8b\u548c Federal Register\u3002\u8bf7\u7528\u6765\u6e90\u94fe\u63a5\u3002",
    nc_aao: "\u6b64\u5904\u4e0d\u6838\u5b9e AAO \u51b3\u5b9a\u3002\u8bf7\u7528\u6765\u6e90\u94fe\u63a5\u3002",
    failed: "\u67e5\u8be2\u5931\u8d25\uff08{err}\uff09\u3002\u8bf7\u91cd\u8bd5\u3002",
    note: "\u8fd9\u53ea\u8bc1\u660e\u8be5\u5f15\u7528\u5904\u5b58\u5728\u4e00\u4e2a\u5224\u51b3\u3002\u540e\u7eed\u5386\u53f2\u548c\u662f\u5426\u4ecd\u4e3a\u6709\u6548\u6cd5\u5f8b\u672a\u6838\u5b9e\u3002",
    checking: "\u6838\u5b9e\u4e2d\u2026"
  }
};
function verifyFill(tpl, params) {
  return String(tpl || "").replace(/\{(\w+)\}/g, function (_m, k) { return params && params[k] != null ? params[k] : ""; });
}
function verifyStatusSentence(row, lang) {
  var v = row.verify;
  if (!v) return "";
  var T = VERIFY_TEXT[lang] || VERIFY_TEXT.en;
  var lead = verifyFill(T.lead[v.label] || T.lead.NOT_CHECKED, { src: v.sourceName });
  var body = verifyFill(T[v.code] || "", v.params);
  if (v.label === "VERIFIED" || v.label === "CITED" || v.label === "MISMATCH" || v.label === "NOT_FOUND") {
    return lead + " " + body.charAt(0).toUpperCase() + body.slice(1);
  }
  return lead + " " + body;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { VERIFY_TEXT, verifyRows, verifyCourtRow, verifyBiaRow, verifyNameCompare, verifySlugFor, verifyRowKind,
    verifySummary, verifyStatusSentence, VERIFY_NOT_GOOD_LAW, VERIFY_SRC_CAP, VERIFY_SRC_BIA, verifyNorm };
}
