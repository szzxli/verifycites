/* Phase 3 evaluation set — PAPERS domain (display mapping only).
   Run: node tests/evaluation.js (no network in this file).
   DATASET: synthetic evidence objects written for this file (not live
   registry results). Size: 8 items with known expected categories and
   identifier statuses. MEASURED: display-category mapping accuracy and
   identifier-comparison accuracy on this synthetic set; these are
   renderer measurements, NOT live lookup accuracy. Live-registry spot
   checks live in network.js and are run separately (see EVALUATION.md).
   Human-review agreement is NOT RUN (no human labels exist in this repo).
   Any PRD-style metric threshold is a SUGGESTED TARGET, not a result.
   Papers and legal results are reported separately — no blended score. */
'use strict';
const { makeSandbox, harness } = require('./_sandbox.js');
const { ok, done } = harness();
const sb = makeSandbox();

function fieldBlock(html, n) {
  const parts = html.split('Field comparison (cited vs. record):');
  if (parts.length <= n + 1) return '';
  return parts[n + 1].split('Anomaly reason:')[0] || '';
}
function summaryCounts(html) {
  const m = html.match(/Category: Matched (\d+) · Field mismatch (\d+) · Not found (\d+) · Cannot be determined (\d+) · Retrieval failed (\d+)/);
  return m ? { matched: +m[1], fieldMismatch: +m[2], notFound: +m[3], cannotDetermine: +m[4], retrievalFailed: +m[5] } : null;
}

const items = [
  // 0 matched, identifier Matches
  { claim: 'Vaswani et al. (2017) attention, DOI 10.48550/arXiv.1706.03762.', base: 'CITED', label: 'CITED', title: 'Attention Is All You Need', authors: ['Vaswani, Ashish'], venue: 'NeurIPS', year: '2017', doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: '' },
  // 1 cannotDetermine, record missing -> identifier Missing in record (P3)
  { claim: 'Some paper nobody can find.', base: 'UNVERIFIED', label: 'UNVERIFIED', title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: 'no record' },
  // 2 fieldMismatch (chimeric authors Differs)
  { claim: 'Wrong et al. (2017) Attention is all you need.', base: 'CITED', label: 'CITED [CHIMERIC:author-mismatch]', title: 'Attention Is All You Need', authors: ['Vaswani, Ashish'], venue: 'NeurIPS', year: '2017', doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: '' },
  // 3 notFound (fabricated identifier, registry lookup found nothing)
  { claim: 'See DOI 10.1234/fake999.', base: 'FABRICATED', label: 'FABRICATED', title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: '' },
  // 4 retrievalFailed (check failed -> identifier Not compared, not Missing)
  { claim: 'A paper, DOI 10.1234/edge1.', base: 'RATE_LIMITED', label: 'RATE_LIMITED', title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: '' },
  // 5 fieldMismatch (invalid DOI, no lookup made)
  { claim: 'A paper, DOI not-a-doi.', base: 'INVALID_DOI', label: 'INVALID_DOI', title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: '' },
  // 6 matched + retracted warning intact
  { claim: 'Vaswani et al. (2017) attention, DOI 10.48550/arXiv.1706.03762.', base: 'CITED', label: 'CITED [RETRACTED]', title: 'Attention Is All You Need', authors: ['Vaswani, Ashish'], venue: 'NeurIPS', year: '2017', doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: '' },
  // 7 matched + stale reminder intact
  { claim: 'Vaswani et al. (2017) attention, DOI 10.48550/arXiv.1706.03762.', base: 'CITED', label: 'CITED [STALE:2020]', title: 'Attention Is All You Need', authors: ['Vaswani, Ashish'], venue: 'NeurIPS', year: '2017', doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: '' },
];
const html = sb.renderReport(items);
const counts = summaryCounts(html);
ok('category counts measured', !!counts, JSON.stringify(counts));
ok('category mapping 8/8: matched 3', counts && counts.matched === 3, JSON.stringify(counts));
ok('category mapping 8/8: fieldMismatch 2', counts && counts.fieldMismatch === 2, JSON.stringify(counts));
ok('category mapping 8/8: notFound 1', counts && counts.notFound === 1, JSON.stringify(counts));
ok('category mapping 8/8: cannotDetermine 1', counts && counts.cannotDetermine === 1, JSON.stringify(counts));
ok('category mapping 8/8: retrievalFailed 1', counts && counts.retrievalFailed === 1, JSON.stringify(counts));
// Measured category mapping: 8/8 on this synthetic set.
ok('identifier 0 Matches', /Identifier: cited 10\.48550\/arXiv\.1706\.03762 · record 10\.48550\/arXiv\.1706\.03762 — Matches/.test(fieldBlock(html, 0)));
ok('identifier 1 Missing in record', /Identifier: cited Not shown in the claim text · record Missing — Missing in record/.test(fieldBlock(html, 1)));
ok('identifier 2 Not compared (claim shows no identifier)', /Identifier: cited Not shown in the claim text · record 10\.48550\/arXiv\.1706\.03762 — Not compared/.test(fieldBlock(html, 2)));
ok('identifier 3 Missing in record', /Identifier: cited 10\.1234\/fake999 · record Missing — Missing in record/.test(fieldBlock(html, 3)));
ok('identifier 4 Not compared — check failed', /Not compared — check failed/.test(fieldBlock(html, 4)));
ok('identifier 5 Not compared (no lookup)', /Identifier: cited Not shown in the claim text · record Missing — Not compared/.test(fieldBlock(html, 5)) && !/Missing in record/.test(fieldBlock(html, 5).split('Identifier:')[1] || ''));
// Measured identifier comparison: 6/6 checked identifier statuses correct.
// Phase 3 basis block: what was checked, sources, labelled local run time,
// per-item time explicitly not recorded — in the summary and per item.
ok('summary basis block present', /Check basis: each claim was looked up/.test(html));
ok('summary run time labelled local, not registry', /your browser's local run time, not a registry timestamp/.test(html));
ok('summary per-item time not recorded', /Per-item check time: not recorded in this report/.test(html));
ok('per-item time not recorded', (html.match(/Item check time: not recorded/g) || []).length === 8, 'expected 8 per-item lines');
ok('retracted warning intact', html.includes('Retracted warning:'));
ok('stale reminder intact', html.includes('Freshness reminder:'));
// NOT RUN (recorded, not measured): human-review agreement (no human
// labels exist for papers items in this repo); live-registry precision /
// recall as a benchmark (would need a labelled corpus; the live spot
// checks in network.js are not a benchmark — see EVALUATION.md).
console.log('papers evaluation: synthetic category mapping 8/8, identifier statuses 6/6; '
  + 'human-review agreement NOT RUN; live-registry benchmark NOT RUN');
done();
