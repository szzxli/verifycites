/*
 * Local history of papers checks (batch 2, agent-hq #84): records store
 * registry metadata only — never draft text, claim text, or notes.
 * No network, no DOM. Run: node tests/history.js
 *
 * Covers: save on check, no body/claim/note text stored, max-50 cap,
 * 10 displayed, empty state, no-conclusion check not stored, re-check
 * updates labels + date, staleness hint at 7+ days, view-citations rows,
 * corrupt storage, quota eviction, no new GoatCounter event, and the
 * ground.js hook + index.html strings this feature depends on.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HISTORY_SRC = fs.readFileSync(path.join(__dirname, '..', 'history.js'), 'utf8');
const GROUND_SRC = fs.readFileSync(path.join(__dirname, '..', 'ground.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

function mkStore(initial, opts) {
  const o = opts || {};
  const s = Object.assign({}, initial || {});
  const store = {
    getItem: k => (k in s ? s[k] : null),
    setItem: (k, v) => {
      if (store.alwaysThrow || (store.maxBytes != null && String(v).length > store.maxBytes)) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      s[k] = String(v);
    },
    removeItem: k => { delete s[k]; },
    _raw: s,
  };
  if (o.maxBytes != null) store.maxBytes = o.maxBytes;
  if (o.alwaysThrow) store.alwaysThrow = true;
  return store;
}
function mkEl() {
  return {
    value: '', textContent: '', innerHTML: '', disabled: false, checked: true,
    style: {}, dataset: {}, hidden: false,
    addEventListener() {}, click() {}, scrollIntoView() {}, appendChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    removeAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
  };
}
function makeCtx(extra) {
  const store = mkStore();
  const listEl = mkEl();
  const ctx = {
    console, setTimeout, clearTimeout,
    document: {
      readyState: 'complete', addEventListener() {},
      getElementById: id => (id === 'vp-history-list' ? listEl : mkEl()),
      createElement: () => mkEl(), body: mkEl(), documentElement: {},
    },
    window: {}, navigator: {}, location: { href: '' },
    localStorage: store, URL, URLSearchParams, Blob: function () {},
    _listEl: listEl, _store: store,
  };
  Object.assign(ctx, extra || {});
  vm.createContext(ctx);
  vm.runInContext(HISTORY_SRC, ctx, { filename: 'history.js' });
  return ctx;
}
function ev(over) {
  return Object.assign({
    claim: 'Claim text that must never be stored [1].', base: 'CITED', label: 'CITED',
    title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', claimed_id: '',
    note: 'Note text that must never be stored.',
  }, over || {});
}
const DAY = 864e5;

(function () {
  console.log('— save builds a record from registry fields only —');
  const ctx = makeCtx();
  const evidence = [
    ev({ base: 'ABSTRACT-SUPPORTED', label: 'ABSTRACT-SUPPORTED [KEYLESS-NLI]',
      title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'],
      venue: 'NeurIPS', year: '2017', doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762' }),
    ev({ base: 'CITED', label: 'CITED', title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      authors: ['Jacob Devlin'], year: '2019', doi: '10.18653/v1/N19-1423' }),
    ev({ base: 'ID_NOT_FOUND', label: 'ID_NOT_FOUND', title: '', authors: [], year: '',
      doi: '', arxiv_id: '', claimed_id: '10.9999/nothing.here' }),
  ];
  const rec = ctx.vpHistorySave(evidence, { unit: 'claims' });
  ok('save returns a record', !!rec);
  eq('title is the first record title', rec.title, 'Attention Is All You Need');
  eq('counts.total', rec.counts.total, 3);
  eq('counts.found', rec.counts.found, 2);
  eq('counts.notFound', rec.counts.notFound, 1);
  eq('counts.supportedPct', rec.counts.supportedPct, 33);
  eq('counts.contradictions', rec.counts.contradictions, 1);
  eq('row 0 display is Author (year)', rec.rows[0].display, 'Vaswani et al. (2017)');
  eq('row 0 origin is arxiv', rec.rows[0].origin, 'arxiv');
  eq('row 0 url is the arXiv link', rec.rows[0].url, 'https://arxiv.org/abs/1706.03762');
  eq('row 1 display', rec.rows[1].display, 'Devlin (2019)');
  eq('row 1 origin is other', rec.rows[1].origin, 'other');
  eq('row 2 display falls back to the claimed DOI', rec.rows[2].display, 'DOI 10.9999/nothing.here');
  eq('row 2 url is the claimed DOI link', rec.rows[2].url, 'https://doi.org/10.9999%2Fnothing.here');
  const stored = JSON.stringify(ctx._store._raw);
  ok('stored JSON has no claim text', !stored.includes('Claim text that must never be stored'));
  ok('stored JSON has no note text', !stored.includes('Note text that must never be stored'));
  ok('stored JSON has no pasted draft fragment', !stored.includes('must never be stored'));
  ok('rows carry no claim/note keys', rec.rows.every(r => !('claim' in r) && !('note' in r)));
  ok('stored under the history key only', Object.keys(ctx._store._raw).length === 1 &&
    ('veripaper-history-v1' in ctx._store._raw));
  eq('identifier is empty in v1', rec.identifier, '');
})();

(function () {
  console.log('— title fallback and no-conclusion checks —');
  const ctx = makeCtx();
  const rec = ctx.vpHistorySave([ev({ base: 'UNVERIFIED', label: 'UNVERIFIED' })], {});
  eq('no record title -> untitled paper', rec.title, 'untitled paper');
  eq('unresolved row display', rec.rows[0].display, 'Untitled reference');
  eq('unresolved row origin is other', rec.rows[0].origin, 'other');
  eq('unresolved row has no url', rec.rows[0].url, '');
  const ctx2 = makeCtx();
  eq('empty evidence stores nothing', ctx2.vpHistorySave([], {}), null);
  eq('empty evidence leaves storage empty', Object.keys(ctx2._store._raw).length, 0);
  const ctx3 = makeCtx();
  eq('all RATE_LIMITED stores nothing',
    ctx3.vpHistorySave([ev({ base: 'RATE_LIMITED', label: 'RATE_LIMITED' }),
      ev({ base: 'RATE_LIMITED', label: 'RATE_LIMITED' })], {}), null);
  eq('all RATE_LIMITED leaves storage empty', Object.keys(ctx3._store._raw).length, 0);
})();

(function () {
  console.log('— webpage rows and counts —');
  const ctx = makeCtx();
  const rec = ctx.vpHistorySave([
    ev({ base: 'NOT_A_SCHOLARLY_RECORD', label: 'NOT_A_SCHOLARLY_RECORD',
      title: 'Some GitHub README', authors: [], year: '' }),
    ev({ base: 'INVALID_DOI', label: 'INVALID_DOI', claimed_id: '' }),
  ], {});
  eq('webpage row origin', rec.rows[0].origin, 'webpage');
  eq('webpage row display falls back to the record title', rec.rows[0].display, 'Some GitHub README');
  eq('notFound counts both rows', rec.counts.notFound, 2);
  eq('invalid DOI is not a contradiction', rec.counts.contradictions, 0);
  const ctx2 = makeCtx();
  const rec2 = ctx2.vpHistorySave([
    ev({ base: 'CITED', label: 'CITED [CHIMERIC:author-mismatch]', title: 'Real Paper',
      authors: ['Jane Roe'], year: '2020', doi: '10.1000/xyz123' }),
    ev({ base: 'CITED', label: 'CITED [RETRACTED]', title: 'Bad Paper',
      authors: ['John Doe'], year: '2021', doi: '10.1000/abc456' }),
  ], {});
  eq('chimeric + retracted count as 2 contradictions', rec2.counts.contradictions, 2);
})();

(function () {
  console.log('— max 50 stored, newest first; 10 displayed —');
  const ctx = makeCtx();
  for (let i = 0; i < 51; i++) {
    ctx.vpHistorySave([ev({ base: 'CITED', label: 'CITED', title: 'Paper ' + i,
      authors: ['Author ' + i], year: '2020', doi: '10.1000/p' + i })], {});
  }
  const store = ctx.vpHistoryLoad();
  eq('51 saves keep 50 records', store.records.length, 50);
  eq('newest first', store.records[0].title, 'Paper 50');
  eq('oldest dropped', store.records[49].title, 'Paper 1');
  ok('Paper 0 is gone', !store.records.some(r => r.title === 'Paper 0'));
  const shown = (ctx._listEl.innerHTML.match(/vp-history-card/g) || []).length;
  eq('section shows the latest 10 cards', shown, 10);
  ok('11th record is not displayed', !ctx._listEl.innerHTML.includes('Paper 40'));
})();

(function () {
  console.log('— empty state, summary format, staleness hint —');
  const ctx = makeCtx();
  ctx.vpHistoryRender();
  ok('empty state text is exact', ctx._listEl.innerHTML.includes(
    "When you check something for the first time, you'll see it here."));
  const rec = { id: 'vp-h-test', title: 'T', identifier: '', checkedAt: Date.UTC(2026, 10, 9),
    counts: { total: 4, found: 3, notFound: 1, supportedPct: 25, contradictions: 2 }, rows: [] };
  eq('summary format is exact', ctx.vpHistorySummarize(rec),
    '4 references · 25% supported · 2 contradictions · Nov 9, 2026');
  const fresh = Object.assign({}, rec, { checkedAt: Date.now() - 6 * DAY });
  const stale = Object.assign({}, rec, { checkedAt: Date.now() - 8 * DAY });
  ok('6 days is not stale', !ctx.vpHistoryIsStale(fresh, Date.now()));
  ok('8 days is stale', ctx.vpHistoryIsStale(stale, Date.now()));
  const card = ctx.vpHistoryCardHtml(stale);
  ok('stale card shows the hint', card.includes('Sources may be out of date — re-check'));
  ok('fresh card hides the hint', !ctx.vpHistoryCardHtml(fresh).includes('Sources may be out of date'));
  ok('card shows Re-check and View citations',
    card.includes('Re-check') && card.includes('View citations'));
  ok('card cites the stored rows', (() => {
    const r2 = Object.assign({}, rec, { rows: [
      { display: 'Vaswani et al. (2017)', origin: 'arxiv',
        url: 'https://arxiv.org/abs/1706.03762', label: 'CITED', base: 'CITED' } ] });
    const html = ctx.vpHistoryCardHtml(r2);
    return html.includes('Vaswani et al. (2017)') && html.includes('CITED') &&
      html.includes('https://arxiv.org/abs/1706.03762') && html.includes('(arxiv)');
  })());
})();

(function () {
  console.log('— re-check updates labels + date, fires papers-check once —');
  const calls = [];
  const ctx = makeCtx({
    bibToDraft: function (bibText) {
      const keys = [];
      const re = /@misc\{([^,\s]+),/g;
      let m;
      while ((m = re.exec(bibText))) keys.push(m[1]);
      return { draft: bibText, entries: keys.map(k => ({ key: k, fields: {} })), errors: [], skipped: [] };
    },
    groundDraft: async function () {
      return [
        ev({ base: 'ID_NOT_FOUND', label: 'ID_NOT_FOUND', title: '', authors: [], year: '',
          doi: '', arxiv_id: '', claimed_id: '10.48550/arXiv.1706.03762' }),
        ev({ base: 'CITED', label: 'CITED', title: 'BERT: Pre-training of Deep Bidirectional Transformers',
          authors: ['Jacob Devlin'], year: '2019', doi: '10.18653/v1/N19-1423' }),
      ];
    },
    bibLabelEvidence: function (evidence) { return evidence; },
    vpCount: function (name) { calls.push(name); },
  });
  const before = Date.now();
  const rec = ctx.vpHistorySave([
    ev({ base: 'ABSTRACT-SUPPORTED', label: 'ABSTRACT-SUPPORTED [KEYLESS-NLI]',
      title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: '2017',
      doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762' }),
    ev({ base: 'CITED', label: 'CITED', title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      authors: ['Jacob Devlin'], year: '2019', doi: '10.18653/v1/N19-1423' }),
  ], {});
  const oldDate = rec.checkedAt;
  const bib = ctx.vpHistoryToBib(rec);
  ok('re-check BibTeX carries the DOI', bib.includes('doi={10.48550/arXiv.1706.03762}'));
  ok('re-check BibTeX carries the second DOI', bib.includes('doi={10.18653/v1/N19-1423}'));
  ok('re-check BibTeX has no claim text', !bib.includes('Claim text'));
  return ctx.vpHistoryRecheck(rec.id).then(okRecheck => {
    ok('re-check succeeds', okRecheck === true);
    const after = ctx.vpHistoryLoad().records[0];
    eq('same record id (updated in place)', after.id, rec.id);
    ok('date updated', after.checkedAt >= oldDate && after.checkedAt >= before);
    eq('row 0 relabelled ID_NOT_FOUND', after.rows[0].base, 'ID_NOT_FOUND');
    eq('row 0 keeps its identifier link', after.rows[0].url, 'https://arxiv.org/abs/1706.03762');
    eq('row 1 still CITED', after.rows[1].base, 'CITED');
    eq('counts recomputed', after.counts.found, 1);
    eq('counts contradictions recomputed', after.counts.contradictions, 1);
    eq('title kept when new evidence still has one', after.title, 'BERT: Pre-training of Deep Bidirectional Transformers');
    assert.deepStrictEqual(calls, ['papers-check']);
    ok('re-check fired papers-check exactly once', true);
  });
})().then(() => {
  console.log('— re-check that concludes nothing changes nothing —');
  const calls = [];
  const ctx = makeCtx({
    bibToDraft: function () { return { draft: '', entries: [{ key: 'vpH0', fields: {} }], errors: [], skipped: [] }; },
    groundDraft: async function () { return [ev({ base: 'RATE_LIMITED', label: 'RATE_LIMITED' })]; },
    bibLabelEvidence: function (evidence) { return evidence; },
    vpCount: function (name) { calls.push(name); },
  });
  const rec = ctx.vpHistorySave([
    ev({ base: 'CITED', label: 'CITED', title: 'Keep Me', authors: ['A B'], year: '2020', doi: '10.1000/keep' }),
  ], {});
  const snapshot = JSON.stringify(ctx.vpHistoryLoad().records[0]);
  return ctx.vpHistoryRecheck(rec.id).then(okRecheck => {
    ok('all-rate-limited re-check reports false', okRecheck === false);
    eq('record untouched', JSON.stringify(ctx.vpHistoryLoad().records[0]), snapshot);
    eq('no event fired', calls.length, 0);
  });
}).then(() => {
  console.log('— corrupt storage and quota eviction —');
  const ctx = makeCtx();
  ctx._store.setItem('veripaper-history-v1', '{not json');
  ok('corrupt JSON loads as empty', ctx.vpHistoryLoad().records.length === 0);
  const rec = ctx.vpHistorySave([ev({ base: 'CITED', label: 'CITED', title: 'After Corrupt' })], {});
  ok('save works after corrupt storage', !!rec && rec.title === 'After Corrupt');
  const throwing = makeCtx();
  throwing._store.alwaysThrow = true;
  const rec2 = throwing.vpHistorySave([ev({ base: 'CITED', label: 'CITED', title: 'No Room' })], {});
  ok('quota failure never throws, returns null', rec2 === null);
  const sized = makeCtx();
  sized._store.maxBytes = 1500;
  for (let i = 0; i < 5; i++) {
    sized.vpHistorySave([ev({ base: 'CITED', label: 'CITED', title: 'Big Paper Number ' + i + ' x'.repeat(120),
      authors: ['Author'], year: '2020', doi: '10.1000/big' + i })], {});
  }
  const kept = sized.vpHistoryLoad().records;
  ok('quota eviction keeps the newest', kept.length >= 1 && kept[0].title.startsWith('Big Paper Number 4'));
  ok('quota eviction drops the oldest first', !kept.some(r => r.title.startsWith('Big Paper Number 0')));
}).then(() => {
  console.log('— no new event, hook present, page strings exact —');
  ok('history.js never calls GoatCounter directly', !/goatcounter\.count/.test(HISTORY_SRC));
  ok('history.js fires only papers-check',
    (HISTORY_SRC.match(/vpCount\("([^"]+)"\)/g) || []).every(s => s === 'vpCount("papers-check")'));
  ok('history.js defines no event list', !/VP_EVENTS|_EVENTS\s*=/.test(HISTORY_SRC));
  ok('ground.js saves history after a check',
    GROUND_SRC.includes('vpHistorySave(evidence, { unit: unit })'));
  ok('ground.js carries claimed_id on evidence',
    GROUND_SRC.includes("claimed_id: res.claimed || ''"));
  ok('ground.js hook never throws',
    GROUND_SRC.includes("if (typeof vpHistorySave === 'function') { try { vpHistorySave(evidence, { unit: unit }); } catch (e) { /* history is best-effort */ } }"));
  ok('index.html loads history.js after ground.js',
    INDEX_HTML.indexOf('<script src="history.js"></script>') > INDEX_HTML.indexOf('<script src="ground.js"></script>'));
  ok('index.html has the history section', INDEX_HTML.includes('<section id="history">'));
  ok('subtitle is exact', INDEX_HTML.includes(
    'Your last 10 checks are saved in this browser only — nothing is uploaded.'));
  ok('empty state is exact', INDEX_HTML.includes(
    "When you check something for the first time, you'll see it here."));
  ok('section heading is Recent checks', INDEX_HTML.includes('<h2>Recent checks</h2>'));
  done();
}).catch(err => { console.log('  FAIL harness error :: ' + (err && err.stack || err)); process.exit(1); });
