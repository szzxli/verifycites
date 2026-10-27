/* Opinion-translation preparation + pluggable backend (v2, local prototype).
   RULE: case names, citations, reporter abbreviations, and numbers are
   NEVER translated. They are masked out before any text is sent to a
   translation endpoint and restored verbatim afterwards.
   DEFAULT: no endpoint is configured (DEFAULT_TRANSLATE_ENDPOINT === "").
   With no endpoint, translateParagraphs() returns NO_ENDPOINT for every
   paragraph and never calls fetch -- no translation is invented. */
var DEFAULT_TRANSLATE_ENDPOINT = "";

function splitParagraphs(text) {
  return String(text || "").split(/\n\s*\n/).map(function (p) {
    return p.trim();
  }).filter(Boolean);
}

function _pushSeg(segs, start, end, text) {
  if (start < 0 || end <= start) return;
  segs.push({ start: start, end: end, text: text.slice(start, end) });
}

function _collectProtected(text) {
  var segs = [];
  // 1. Citations + case names found by the shared extractor (web/extract.js).
  if (typeof extractCitations === "function") {
    try {
      extractCitations(text).forEach(function (c) {
        var i = text.indexOf(c.text);
        if (i >= 0) _pushSeg(segs, i, i + c.text.length, text);
        if (c.caseName) {
          var j = text.indexOf(c.caseName);
          if (j >= 0) _pushSeg(segs, j, j + c.caseName.length, text);
        }
      });
    } catch (e) { /* fall through to generic patterns below */ }
  }
  // 2. Generic "X v. Y" case-name pattern (covers names the extractor missed).
  var nameRe = /[A-Z][\w.'&\-]+(?:\s+(?:[A-Z][\w.'&\-]+|of|the|and|for)){0,3}\s+v\.\s+[A-Z][\w.'&\-]+(?:\s+[A-Z][\w.'&\-]+){0,3}/g;
  var m;
  while ((m = nameRe.exec(text)) !== null) _pushSeg(segs, m.index, m.index + m[0].length, text);
  // 3. Reporter abbreviations from the shared table.
  var reporters = (typeof REPORTERS !== "undefined" && REPORTERS) || [];
  reporters.forEach(function (r) {
    var abbr = r.abbreviation, at = 0, k;
    while ((k = text.indexOf(abbr, at)) >= 0) {
      _pushSeg(segs, k, k + abbr.length, text);
      at = k + abbr.length;
    }
  });
  // 4. Numbers (years, volumes, pages, amounts, percentages).
  var numRe = /\d+(?:,\d{3})*(?:\.\d+)?/g;
  while ((m = numRe.exec(text)) !== null) _pushSeg(segs, m.index, m.index + m[0].length, text);
  // Sort and merge overlaps (keep the longest covering span).
  segs.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
  var merged = [];
  segs.forEach(function (s) {
    var last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      if (s.end > last.end) { last.end = s.end; last.text = text.slice(last.start, last.end); }
    } else merged.push({ start: s.start, end: s.end, text: s.text });
  });
  return merged;
}

function prepareForTranslation(text) {
  var segs = _collectProtected(text);
  var masked = "", pos = 0;
  segs.forEach(function (s, i) {
    masked += text.slice(pos, s.start) + "\u27e6P" + i + "\u27e7";
    pos = s.end;
  });
  masked += text.slice(pos);
  return { masked: masked, protected: segs.map(function (s) { return s.text; }) };
}

function restoreTranslation(translated, prepared) {
  var out = String(translated || "");
  prepared.protected.forEach(function (p, i) {
    out = out.split("\u27e6P" + i + "\u27e7").join(p);
  });
  return out;
}

/* Pluggable backend. endpoint = full /translate URL of the user's own
   LibreTranslate-compatible server (or "" for none). target = "es" | "zh"
   for the opinion viewer, "en" for query translation; source defaults to
   "en" (opinion viewer) and is set to the UI language for query
   translation (documented in README). fetchFn is injectable for tests;
   defaults to global fetch. */
async function translateParagraphs(paragraphs, opts) {
  var endpoint = (opts && opts.endpoint ? String(opts.endpoint).trim() : "");
  if (!endpoint) {
    return paragraphs.map(function (p) {
      return { original: p, translation: null, error: "NO_ENDPOINT" };
    });
  }
  var fetchFn = (opts && opts.fetchFn) || (typeof fetch !== "undefined" ? fetch : null);
  if (!fetchFn) {
    return paragraphs.map(function (p) {
      return { original: p, translation: null, error: "NO_FETCH" };
    });
  }
  var target = (opts && opts.target) || "es";
  var source = (opts && opts.source) || "en";
  var out = [];
  for (var i = 0; i < paragraphs.length; i++) {
    var prepared = prepareForTranslation(paragraphs[i]);
    try {
      var res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: prepared.masked, source: source, target: target, format: "text" })
      });
      var data = await res.json();
      var raw = data.translatedText || data.translated_text || "";
      out.push({ original: paragraphs[i], translation: restoreTranslation(raw, prepared), error: null });
    } catch (e) {
      out.push({ original: paragraphs[i], translation: null, error: "TRANSLATE_FAILED" });
    }
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_TRANSLATE_ENDPOINT: DEFAULT_TRANSLATE_ENDPOINT,
    splitParagraphs: splitParagraphs,
    prepareForTranslation: prepareForTranslation,
    restoreTranslation: restoreTranslation,
    translateParagraphs: translateParagraphs
  };
}
