/*
 * Download/Copy report (.md) for a papers check: every citation keeps its
 * full label (base + tags), the file is built offline from in-memory
 * evidence only, and no new network call is made. No network.
 * Run: node tests/report-markdown.js
 */
'use strict';

const { makeSandbox, harness } = require('./_sandbox');
const { ok, done } = harness();

(function () {
  console.log('— report markdown keeps every label —');
  const sb = makeSandbox(async () => {
    throw new Error('report builder must not fetch');
  });
  const ev = [
    {
      claim: 'Claim one [1].',
      base: 'ABSTRACT-SUPPORTED',
      label: 'ABSTRACT-SUPPORTED [KEYLESS-NLI]',
      title: 'Attention Is All You Need',
      authors: ['A. Vaswani'],
      venue: 'NeurIPS',
      year: '2017',
      doi: '10.48550/arXiv.1706.03762',
      arxiv_id: '1706.03762',
      note: ''
    },
    {
      claim: 'Claim two [2].',
      base: 'ID_NOT_FOUND',
      label: 'ID_NOT_FOUND',
      title: '',
      authors: [],
      venue: '',
      year: '',
      doi: '10.9999/nothing.here',
      arxiv_id: '',
      note: 'The identifier was checked and was not found there.'
    },
    {
      claim: 'Claim three [3].',
      base: 'CITED',
      label: 'CITED [STALE:2020] [CHIMERIC:author-mismatch]',
      title: 'Transformers',
      authors: ['T. Wolf'],
      venue: '',
      year: '2020',
      doi: '',
      arxiv_id: '',
      note: ''
    },
  ];
  const md = sb.vpReportMarkdown(ev, { unit: 'claims', tier1: null, handMarks: {} });
  ok(
    'every citation row carries its full label',
    /ABSTRACT-SUPPORTED \[KEYLESS-NLI\]/.test(md) &&
      /ID_NOT_FOUND/.test(md) &&
      /CITED \[STALE:2020\] \[CHIMERIC:author-mismatch\]/.test(md)
  );
  ok(
    'summary counts each base label',
    /ABSTRACT-SUPPORTED: 1/.test(md) &&
      /ID_NOT_FOUND: 1/.test(md) &&
      /CITED: 1/.test(md)
  );
  ok(
    'category per row',
    /Category: Matched/.test(md) &&
      /Category: Not found/.test(md) &&
      /Category: Field mismatch/.test(md)
  );
  ok(
    'glossary defines every base label',
    [
      'ABSTRACT-SUPPORTED',
      'CITED',
      'UNVERIFIED',
      'ID_NOT_FOUND',
      'ID_NOT_FOUND_TITLE_FOUND',
      'NOT_A_SCHOLARLY_RECORD',
      'RATE_LIMITED',
      'INVALID_DOI'
    ].every(l => md.includes(l + ' = '))
  );
  ok(
    'report states its limits',
    /first-pass screen, not a verdict/.test(md) &&
      /abstract-level only/.test(md) &&
      /Per-item check time: not recorded/.test(md)
  );
  ok('no accusing words', !/fabricat|\bfake\b|hallucinat/i.test(md));
  ok(
    'empty evidence still builds a header-only report',
    sb.vpReportMarkdown([], {}).includes('Total claims: 0')
  );
  console.log('— offline: builder makes no fetch —');
  ok('no fetch calls recorded', sb.__calls.length === 0);
  done();
})();
