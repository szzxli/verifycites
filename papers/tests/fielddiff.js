/* Phase 2: cited-vs-record field comparison in renderReport (display
   only — no label, lookup, or cache code is touched by this test's
   subject). Run: node tests/fielddiff.js */
'use strict';
const { makeSandbox, harness } = require('./_sandbox.js');
const { ok, done } = harness();
const sb = makeSandbox();

function fieldBlock(html, n) {
  // Field comparison block of the nth item: from its "Field comparison"
  // marker to the following "Anomaly reason".
  const parts = html.split('Field comparison (cited vs. record):');
  if (parts.length <= n + 1) return '';
  return parts[n + 1].split('Anomaly reason:')[0] || '';
}

const matched = {
  claim: 'Vaswani et al. (2017) showed attention is all you need, DOI 10.48550/arXiv.1706.03762.',
  base: 'CITED', label: 'CITED', title: 'Attention Is All You Need',
  authors: ['Vaswani, Ashish', 'Shazeer, Noam'], venue: 'NeurIPS', year: '2017',
  doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: 'record exists',
};
const missing = {
  claim: 'Some paper nobody can find.',
  base: 'UNVERIFIED', label: 'UNVERIFIED', title: '', authors: [], venue: '', year: '',
  doi: '', arxiv_id: '', note: 'no record',
};
const chimeric = {
  claim: 'Wrong et al. (2017) Attention is all you need [1].',
  base: 'CITED', label: 'CITED [CHIMERIC:author-mismatch]', title: 'Attention Is All You Need',
  authors: ['Vaswani, Ashish'], venue: 'NeurIPS', year: '2017',
  doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: 'chimeric note',
};
const fabricated = {
  claim: 'See the paper at DOI 10.1234/fake999 for details.',
  base: 'ID_NOT_FOUND', label: 'ID_NOT_FOUND', title: '', authors: [], venue: '', year: '',
  doi: '', arxiv_id: '', note: 'identifier not found',
};
const retracted = Object.assign({}, matched, {
  claim: 'Vaswani et al. (2017) showed attention, DOI 10.48550/arXiv.1706.03762.',
  label: 'CITED [RETRACTED]',
});
const stale = Object.assign({}, matched, {
  claim: 'Vaswani et al. (2017) showed attention, DOI 10.48550/arXiv.1706.03762.',
  label: 'CITED [STALE:2020]',
});

const html = sb.renderReport([matched, missing, chimeric, fabricated, retracted, stale]);

// (a) Every item carries all five field rows.
for (const f of ['Title:', 'Authors:', 'Venue:', 'Year:', 'Identifier:']) {
  ok('field row present: ' + f, html.split(f).length >= 7, 'expected 6 items + header mentions');
}
// (b) Matched item: identifier from the claim text matches the record.
const b0 = fieldBlock(html, 0);
ok('matched identifier Matches', /Identifier: cited 10\.48550\/arXiv\.1706\.03762 · record 10\.48550\/arXiv\.1706\.03762 — Matches/.test(b0), b0.slice(0, 200));
ok('matched record fields shown', /Title: cited Not recorded separately in this check · record Attention Is All You Need/.test(b0));
ok('matched authors not compared, not invented', /Authors: cited Not recorded separately in this check · record Vaswani, Ashish/.test(b0));
// (c) Missing record fields are shown as Missing, never guessed.
const b1 = fieldBlock(html, 1);
ok('missing title shown Missing', /Title: cited Not recorded separately in this check · record Missing — Missing in record/.test(b1));
ok('missing year shown Missing', /Year: cited Not recorded separately in this check · record Missing — Missing in record/.test(b1));
ok('missing identifier Missing in record (P3 consistency)', /Identifier: cited Not shown in the claim text · record Missing — Missing in record/.test(b1));
// (d) Chimeric authors are highlighted as Differs; other fields are not.
const b2 = fieldBlock(html, 2);
ok('chimeric authors Differs', /Authors: cited Differs from the record \(flagged by the check\) · record Vaswani, Ashish — <b>Differs<\/b>/.test(b2));
ok('chimeric title not marked Differs', !/Title:[^<]*<b>Differs<\/b>/.test(b2));
// (e) Fabricated identifier: cited id present, registry lookup found no
// record -> the record identifier is Missing in record (P3 consistency:
// the lookup was made, so record absence is established; this is not an
// accusation about the author, just the identifier comparison).
const b3 = fieldBlock(html, 3);
ok('fabricated identifier Missing in record', /Identifier: cited 10\.1234\/fake999 · record Missing — Missing in record/.test(b3));
// (e2) P3 exceptions where record absence is NOT established: the check
// failed (RATE_LIMITED) or no lookup was made (INVALID_DOI) keep
// "Not compared" wording instead of claiming a missing record.
const edgeHtml = sb.renderReport([
  { claim: 'A paper, DOI 10.1234/edge1.', base: 'RATE_LIMITED', label: 'RATE_LIMITED', title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: 'rate limited' },
  { claim: 'A paper, DOI not-a-doi.', base: 'INVALID_DOI', label: 'INVALID_DOI', title: '', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: 'invalid doi' },
  { claim: 'A paper found by title.', base: 'CITED', label: 'CITED', title: 'Some Title', authors: [], venue: '', year: '', doi: '', arxiv_id: '', note: 'record without identifier' },
]);
const eParts = edgeHtml.split('Field comparison (cited vs. record):');
ok('rate-limited identifier stays Not compared', /Identifier: cited 10\.1234\/edge1 · record Missing — Not compared — check failed/.test(eParts[1]), eParts[1].slice(0, 300));
ok('invalid-doi identifier stays Not compared', /Identifier: cited Not shown in the claim text · record Missing — Not compared/.test(eParts[2]) && !/Identifier:[^<]*Missing in record/.test(eParts[2].split('Anomaly reason:')[0]));
ok('record without identifier is Missing in record', /Identifier: cited Not shown in the claim text · record Missing — Missing in record/.test(eParts[3]));
// (f) P0 fields and warnings stay intact alongside the new block.
for (const f of ['Category:', 'Matching evidence:', 'Check scope:', 'Suggested action:']) {
  ok('P0 field intact: ' + f, html.includes(f));
}
ok('retracted warning intact', html.includes('Retracted warning:'));
ok('stale freshness reminder intact', html.includes('Freshness reminder:'));
// (g) No judgmental wording inside the field-comparison blocks.
for (let i = 0; i < 6; i++) {
  const b = fieldBlock(html, i);
  ok('no judgmental wording in block ' + i, !/relevan|score|%|good law|fabricated/i.test(b), b.slice(0, 160));
}
// (h) Cited values are never invented: blocks never claim a cited title,
// author, venue or year that is not in the evidence object.
for (let i = 0; i < 6; i++) {
  const b = fieldBlock(html, i);
  ok('no invented cited title/authors/venue/year in block ' + i,
    /Title: cited Not recorded separately/.test(b) &&
    /Venue: cited Not recorded separately/.test(b) &&
    /Year: cited Not recorded separately/.test(b));
}

done();
