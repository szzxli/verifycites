/* veripaper — local history of papers checks (batch 2, agent-hq #84).
 *
 * Goal: a reason to return. A professor or PhD student who checked a paper
 * two months ago finds it here and re-checks it, instead of starting over.
 *
 * Storage: this browser's localStorage only (key 'veripaper-history-v1'),
 * at most 50 records, newest first; the section shows the latest 10.
 * No IndexedDB, no backend, no upload, $0. History is best-effort: if
 * storage is unavailable (private mode) or full, the checker keeps
 * working and history silently does nothing.
 *
 * What a record stores — registry-derived metadata ONLY:
 *   title (first cited record title, else 'untitled paper'),
 *   identifier (the checked paper's own DOI/URL/book id — empty in v1:
 *   the check never sees one, and none is guessed),
 *   checkedAt (ms), counts, and ONE row per citation:
 *   { display, origin, url, label, base, doi, arxiv, claimed, title }.
 *   display is built from record fields only (authors + year, or record
 *   title, or the identifier). url is built from identifiers only.
 * What is NEVER stored: the pasted draft, the paper body text, claim
 * text, notes, or any other user input. There is no opt-in to store body
 * text. A check with no conclusions (no rows, or every row
 * RATE_LIMITED) is not stored.
 *
 * Re-check re-runs verification on the STORED rows: it synthesizes a
 * BibTeX draft from the rows (identifiers + record titles) and runs the
 * exact .bib pipeline (groundDraft in bibMode) on it, then updates the
 * row labels and the record date in place. It is existence-level only:
 * support was judged against claims that were never stored, so an
 * ABSTRACT-SUPPORTED row comes back CITED when the record still exists
 * (support not re-judged, never pretended). It does NOT recreate the
 * original pasted input — that text was never stored. A re-check that
 * concludes nothing (all rows RATE_LIMITED) changes nothing. A re-check
 * fires the existing 'papers-check' event once on success; it adds no
 * new event and creates no new record.
 *
 * Staleness: a record 7+ days old shows "Sources may be out of date —
 * re-check" on its card. The 2-week reminder is deferred (it depends on
 * re-check outcomes) — see DESIGN.md.
 */
'use strict';

var VP_HISTORY_KEY = 'veripaper-history-v1';
var VP_HISTORY_MAX_RECORDS = 50;   // stored, newest first; oldest dropped
var VP_HISTORY_MAX_SHOWN = 10;     // displayed in the section
var VP_HISTORY_STALE_MS = 7 * 864e5;
var VP_HISTORY_STALE = 'Sources may be out of date — re-check';
var VP_HISTORY_UNTITLED = 'untitled paper';
var VP_HISTORY_EMPTY = "When you check something for the first time, you'll see it here.";
var VP_HISTORY_RECHECK_FAIL = 'Re-check did not complete — registries unreachable or nothing new to check. Try again later.';

function vpHistEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; });
}
/* Same mapping as labelClass() in ground.js (duplicated so this module
   stays usable without it; ground.js wins when present). */
function vpHistLabelClass(base) {
  return { 'ABSTRACT-SUPPORTED': 'l-verified', CITED: 'l-cited', UNVERIFIED: 'l-unverified',
    RATE_LIMITED: 'l-stale', INVALID_DOI: 'l-unverified', ID_NOT_FOUND: 'l-unverified',
    ID_NOT_FOUND_TITLE_FOUND: 'l-unverified', NOT_A_SCHOLARLY_RECORD: 'l-stale' }[base] || 'l-cited';
}
function vpHistClass(base) {
  try { if (typeof labelClass === 'function') return labelClass(base); } catch (e) { /* fall through */ }
  return vpHistLabelClass(base);
}
function vpHistStorage() {
  try { return (typeof localStorage !== 'undefined' && localStorage) || null; } catch (e) { return null; }
}
function vpHistId() {
  return 'vp-h-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xffffff).toString(16);
}

/* ---- row derivation: registry fields + identifiers only, never user text ---- */

function vpHistSurname(author) {
  var a = String(author || '').trim();
  if (!a) return '';
  if (a.indexOf(',') >= 0) return a.split(',')[0].trim();
  var parts = a.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}
function vpHistIdLabel(id) {
  var s = String(id || '').trim();
  if (!s) return '';
  if (/^10\.48550\/arXiv\./i.test(s)) return 'arXiv:' + s.replace(/^10\.48550\/arXiv\./i, '');
  if (/^\d{4}\.\d{4,5}/.test(s)) return 'arXiv:' + s;
  if (/^10\./.test(s)) return 'DOI ' + s;
  return s;
}
/* Display citation: "Author (year)" from the record, else the record
   title, else the identifier, else 'Untitled reference'. Claim text and
   reference-list text are never used: both are user input. */
function vpHistoryDisplay(e) {
  var authors = (e && e.authors) || [];
  var year = (e && e.year) || '';
  if (authors.length && year) {
    var surname = vpHistSurname(authors[0]);
    return surname + (authors.length > 1 ? ' et al.' : '') + ' (' + year + ')';
  }
  if (e && e.title) return e.title;
  if (e && e.doi) return vpHistIdLabel(e.doi);
  if (e && e.arxiv_id) return vpHistIdLabel(e.arxiv_id);
  if (e && e.claimed_id) return vpHistIdLabel(e.claimed_id);
  return 'Untitled reference';
}
/* Source origin: 'arxiv' when the row carries an arXiv identifier,
   'webpage' when the row is a non-scholarly record, 'other' for every
   registry row (the evidence does not record which registry answered,
   so no finer claim is made). */
function vpHistoryOrigin(e) {
  var doi = String((e && e.doi) || '');
  var claimed = String((e && e.claimed_id) || '');
  if ((e && e.arxiv_id) || /^10\.48550\/arXiv\./i.test(doi) || /^10\.48550\/arXiv\./i.test(claimed)) return 'arxiv';
  if (e && e.base === 'NOT_A_SCHOLARLY_RECORD') return 'webpage';
  return 'other';
}
function vpHistoryTargetUrl(e) {
  var doi = String((e && e.doi) || '').trim();
  var ax = String((e && e.arxiv_id) || '').replace(/^arXiv:/i, '').trim();
  var claimed = String((e && e.claimed_id) || '').trim();
  if (ax) return 'https://arxiv.org/abs/' + encodeURIComponent(ax);
  if (doi) {
    if (/^10\.48550\/arXiv\./i.test(doi))
      return 'https://arxiv.org/abs/' + encodeURIComponent(doi.replace(/^10\.48550\/arXiv\./i, ''));
    return 'https://doi.org/' + encodeURIComponent(doi);
  }
  if (claimed) {
    if (/^10\.48550\/arXiv\./i.test(claimed))
      return 'https://arxiv.org/abs/' + encodeURIComponent(claimed.replace(/^10\.48550\/arXiv\./i, ''));
    if (/^\d{4}\.\d{4,5}/.test(claimed)) return 'https://arxiv.org/abs/' + encodeURIComponent(claimed);
    if (/^10\./.test(claimed)) return 'https://doi.org/' + encodeURIComponent(claimed);
  }
  return '';
}
function vpHistoryRowFromEvidence(e) {
  return {
    display: vpHistoryDisplay(e),
    origin: vpHistoryOrigin(e),
    url: vpHistoryTargetUrl(e),
    label: (e && e.label) || (e && e.base) || 'UNVERIFIED',
    base: (e && e.base) || 'UNVERIFIED',
    doi: (e && e.doi) || '',
    arxiv: String((e && e.arxiv_id) || '').replace(/^arXiv:/i, ''),
    claimed: (e && e.claimed_id) || '',
    title: (e && e.title) || ''
  };
}
/* found = a registry record exists (ABSTRACT-SUPPORTED, CITED).
   notFound = no record for the cited identifier/marker (UNVERIFIED,
   ID_NOT_FOUND, ID_NOT_FOUND_TITLE_FOUND, INVALID_DOI,
   NOT_A_SCHOLARLY_RECORD). RATE_LIMITED is neither: not checked.
   contradictions = the citation as written conflicts with the registry:
   a chimeric or retracted tag, or an identifier the registry does not
   have (ID_NOT_FOUND / ID_NOT_FOUND_TITLE_FOUND). A malformed DOI is a
   format error, not a contradiction. */
function vpHistoryCounts(evidence) {
  var list = evidence || [];
  var total = list.length, found = 0, notFound = 0, supported = 0, contradictions = 0;
  list.forEach(function (e) {
    if (e.base === 'ABSTRACT-SUPPORTED') supported++;
    if (e.base === 'ABSTRACT-SUPPORTED' || e.base === 'CITED') found++;
    else if (e.base !== 'RATE_LIMITED') notFound++;
    var tags = String(e.label || '').split(' ').slice(1);
    var bad = tags.some(function (t) { return /^\[CHIMERIC/.test(t) || /^\[RETRACTED\]/.test(t); });
    if (bad || e.base === 'ID_NOT_FOUND' || e.base === 'ID_NOT_FOUND_TITLE_FOUND') contradictions++;
  });
  return { total: total, found: found, notFound: notFound,
    supportedPct: total ? Math.round(supported / total * 100) : 0, contradictions: contradictions };
}
function vpHistoryHasConclusions(evidence) {
  var list = evidence || [];
  if (!list.length) return false;
  return list.some(function (e) { return e.base !== 'RATE_LIMITED'; });
}
function vpHistoryDeriveTitle(evidence) {
  var list = evidence || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].title) return list[i].title;
  }
  return '';
}
function vpHistoryDate(ms) {
  try {
    return new Date(ms).toLocaleDateString('en-US',
      { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) { return ''; }
}
function vpHistorySummarize(rec) {
  var c = rec.counts || { total: 0, supportedPct: 0, contradictions: 0 };
  return c.total + ' references · ' + c.supportedPct + '% supported · ' +
    c.contradictions + ' contradictions · ' + vpHistoryDate(rec.checkedAt);
}
function vpHistoryIsStale(rec, nowMs) {
  if (!rec || !rec.checkedAt) return false;
  return (nowMs || Date.now()) - rec.checkedAt >= VP_HISTORY_STALE_MS;
}
function vpHistoryBuildRecord(evidence, opts) {
  var list = Array.isArray(evidence) ? evidence : [];
  if (!vpHistoryHasConclusions(list)) return null;
  return {
    id: vpHistId(),
    title: vpHistoryDeriveTitle(list) || VP_HISTORY_UNTITLED,
    identifier: '',
    checkedAt: Date.now(),
    counts: vpHistoryCounts(list),
    rows: list.map(vpHistoryRowFromEvidence)
  };
}

/* ---- storage: corrupt or missing storage degrades to empty, never throws ---- */

function vpHistoryLoad(storage) {
  var store = storage || vpHistStorage();
  var raw = null;
  try { raw = store ? store.getItem(VP_HISTORY_KEY) : null; } catch (e) { return { v: 1, records: [] }; }
  if (!raw) return { v: 1, records: [] };
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) return { v: 1, records: [] };
    return { v: 1, records: parsed.records.filter(function (r) {
      return r && typeof r === 'object' && typeof r.id === 'string' && Array.isArray(r.rows);
    }) };
  } catch (e) { return { v: 1, records: [] }; }
}
function vpHistorySaveStore(store, storage) {
  var s = storage || vpHistStorage();
  if (!s) return false;
  var data = { v: 1, records: store.records };
  var attempts = 0;
  while (attempts <= store.records.length) {
    try { s.setItem(VP_HISTORY_KEY, JSON.stringify(data)); return true; }
    catch (e) {
      /* Quota exceeded: drop the oldest record and retry. History is
         best-effort — if nothing fits, the check still stands. */
      if (!data.records.length) return false;
      data.records = data.records.slice(0, -1);
      attempts++;
    }
  }
  return false;
}

/* ---- save hook: called from ground.js after a check renders ---- */

function vpHistorySave(evidence, opts) {
  try {
    var rec = vpHistoryBuildRecord(evidence, opts);
    if (!rec) return null;
    var store = vpHistoryLoad();
    store.records.unshift(rec);
    if (store.records.length > VP_HISTORY_MAX_RECORDS)
      store.records.length = VP_HISTORY_MAX_RECORDS;
    if (!vpHistorySaveStore(store)) return null;
    vpHistoryRender();
    return rec;
  } catch (e) { return null; }
}

/* ---- re-check: existence-level re-verification of the stored rows ---- */

function vpHistBibField(s) {
  return String(s == null ? '' : s).replace(/[\\{}$\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}
function vpHistoryToBib(record) {
  return (record.rows || []).map(function (r, i) {
    var fields = [];
    if (r.title) fields.push('title={' + vpHistBibField(r.title) + '}');
    if (r.doi) fields.push('doi={' + vpHistBibField(r.doi) + '}');
    else if (r.arxiv) fields.push('eprint={' + vpHistBibField(r.arxiv) + '}, archiveprefix={arXiv}');
    else if (r.claimed) fields.push('doi={' + vpHistBibField(r.claimed) + '}');
    return '@misc{vpH' + i + (fields.length ? ', ' + fields.join(', ') : ', ') + '}';
  }).join('\n');
}
function vpHistoryApplyRecheck(record, newEvidence) {
  if (!record || !Array.isArray(newEvidence) || newEvidence.length !== (record.rows || []).length) return null;
  if (newEvidence.every(function (e) { return e.base === 'RATE_LIMITED'; })) return null;
  var updated = {
    id: record.id,
    title: vpHistoryDeriveTitle(newEvidence) || record.title,
    identifier: record.identifier || '',
    checkedAt: Date.now(),
    counts: vpHistoryCounts(newEvidence),
    rows: newEvidence.map(vpHistoryRowFromEvidence)
  };
  return updated;
}
async function vpHistoryRecheck(id) {
  try {
    var store = vpHistoryLoad();
    var idx = -1;
    for (var i = 0; i < store.records.length; i++) {
      if (store.records[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return false;
    if (typeof bibToDraft !== 'function' || typeof groundDraft !== 'function' ||
        typeof bibLabelEvidence !== 'function') return false;
    var record = store.records[idx];
    var parsed = bibToDraft(vpHistoryToBib(record));
    if (!parsed.entries.length) return false;
    var evidence = bibLabelEvidence(
      await groundDraft(parsed.draft, { bibMode: true }), parsed.entries);
    var updated = vpHistoryApplyRecheck(record, evidence);
    if (!updated) return false;
    store.records[idx] = updated;
    if (!vpHistorySaveStore(store)) return false;
    vpHistoryRender();
    try { if (typeof vpCount === 'function') vpCount('papers-check'); } catch (e) { /* analytics never breaks the tool */ }
    return true;
  } catch (e) { return false; }
}

/* ---- render ---- */

var vpHistoryEmptyHtml = '<p class="hint" id="vp-history-empty">' + vpHistEsc(VP_HISTORY_EMPTY) + '</p>';
function vpHistoryCardHtml(rec) {
  var stale = vpHistoryIsStale(rec, Date.now());
  var rowsHtml = (rec.rows || []).map(function (r) {
    var link = r.url ? ' <a href="' + vpHistEsc(r.url) + '" target="_blank" rel="noopener">' + vpHistEsc(r.url) + '</a>' : '';
    return '<div class="vp-history-cite"><span class="label ' + vpHistClass(r.base) + '">' +
      vpHistEsc(r.label) + '</span> ' + vpHistEsc(r.display) +
      ' <span style="color:var(--ink-soft)">(' + vpHistEsc(r.origin) + ')</span>' + link + '</div>';
  }).join('');
  return '<div class="finding vp-history-card" data-vp-history-id="' + vpHistEsc(rec.id) + '">' +
    '<p><b>' + vpHistEsc(rec.title) + '</b></p>' +
    '<p class="hint" style="margin:4px 0 0">' + vpHistEsc(vpHistorySummarize(rec)) + '</p>' +
    (stale ? '<p class="hint" style="margin:4px 0 0"><b>' + vpHistEsc(VP_HISTORY_STALE) + '</b></p>' : '') +
    '<div class="btnrow">' +
    '<button type="button" class="btn ghost vp-history-btn" data-vp-history-action="recheck">Re-check</button>' +
    '<button type="button" class="btn ghost vp-history-btn" data-vp-history-action="view" aria-expanded="false">View citations</button>' +
    '</div>' +
    '<p class="hint vp-history-status" style="margin:4px 0 0"></p>' +
    '<div class="vp-history-cites" hidden>' + rowsHtml + '</div>' +
    '</div>';
}
function vpHistoryRender() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  var list = document.getElementById('vp-history-list');
  if (!list) return;
  var store = vpHistoryLoad();
  if (!store.records.length) { list.innerHTML = vpHistoryEmptyHtml; return; }
  var html = '';
  store.records.slice(0, VP_HISTORY_MAX_SHOWN).forEach(function (rec) { html += vpHistoryCardHtml(rec); });
  list.innerHTML = html;
}
function vpHistoryInit() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  var list = document.getElementById('vp-history-list');
  if (!list) return;
  if (list.innerHTML) vpHistoryEmptyHtml = list.innerHTML;
  if (list.addEventListener) {
    list.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-vp-history-action]') : null;
      if (!btn) return;
      var card = btn.closest ? btn.closest('[data-vp-history-id]') : null;
      if (!card || !card.getAttribute) return;
      var id = card.getAttribute('data-vp-history-id');
      var action = btn.getAttribute('data-vp-history-action');
      if (action === 'view') {
        var cites = card.querySelector ? card.querySelector('.vp-history-cites') : null;
        if (!cites) return;
        var open = cites.hasAttribute ? cites.hasAttribute('hidden') : !!cites.hidden;
        if (open) {
          if (cites.removeAttribute) cites.removeAttribute('hidden');
          cites.hidden = false;
        } else {
          if (cites.setAttribute) cites.setAttribute('hidden', '');
          cites.hidden = true;
        }
        if (btn.setAttribute) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Hide citations' : 'View citations';
      } else if (action === 'recheck') {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = 'Re-checking…';
        vpHistoryRecheck(id).then(function (ok) {
          if (ok) return;  // re-render already replaced the card
          btn.disabled = false;
          btn.textContent = 'Re-check failed — try again';
          var status = card.querySelector ? card.querySelector('.vp-history-status') : null;
          if (status) status.textContent = VP_HISTORY_RECHECK_FAIL;
        });
      }
    });
  }
  vpHistoryRender();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vpHistoryInit);
  else vpHistoryInit();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { vpHistoryDisplay: vpHistoryDisplay, vpHistoryOrigin: vpHistoryOrigin,
    vpHistoryTargetUrl: vpHistoryTargetUrl, vpHistoryRowFromEvidence: vpHistoryRowFromEvidence,
    vpHistoryCounts: vpHistoryCounts, vpHistoryHasConclusions: vpHistoryHasConclusions,
    vpHistoryDeriveTitle: vpHistoryDeriveTitle, vpHistorySummarize: vpHistorySummarize,
    vpHistoryIsStale: vpHistoryIsStale, vpHistoryBuildRecord: vpHistoryBuildRecord,
    vpHistoryLoad: vpHistoryLoad, vpHistorySaveStore: vpHistorySaveStore,
    vpHistorySave: vpHistorySave, vpHistoryToBib: vpHistoryToBib,
    vpHistoryApplyRecheck: vpHistoryApplyRecheck, vpHistoryRecheck: vpHistoryRecheck,
    vpHistoryCardHtml: vpHistoryCardHtml, vpHistoryRender: vpHistoryRender,
    VP_HISTORY_KEY: VP_HISTORY_KEY, VP_HISTORY_MAX_RECORDS: VP_HISTORY_MAX_RECORDS,
    VP_HISTORY_MAX_SHOWN: VP_HISTORY_MAX_SHOWN, VP_HISTORY_EMPTY: VP_HISTORY_EMPTY,
    VP_HISTORY_STALE: VP_HISTORY_STALE };
}
