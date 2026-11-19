/* Field comparison: title, authors, and year are reported only when this
 * check compared them. Run: node tests/fieldcmp.js
 *
 * The four cases use the real arXiv paper 1706.03762
 * (Vaswani et al., "Attention Is All You Need", 2017). Registry metadata
 * is the published record; the lookup is stubbed so the comparison, not
 * the network, is what the test measures.
 */
'use strict';
const { makeSandbox, resp, harness } = require('./_sandbox');
const { ok, done } = harness();

const RECORD = {
  title: 'Attention Is All You Need',
  authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit',
    'Llion Jones', 'Aidan N. Gomez', 'Lukasz Kaiser', 'Illia Polosukhin'],
  year: 2017,
};
const REAL_REF = '[1] Vaswani, A., et al. Attention is all you need. NeurIPS 2017. arXiv:1706.03762';
const WRONG_YEAR_REF = '[1] Vaswani, A., et al. Attention is all you need. NeurIPS 2019. arXiv:1706.03762';
const WRONG_TITLE_REF = '[1] Vaswani, A., et al. Quantum cooking for beginners. NeurIPS 2017. doi:10.48550/arXiv.1706.03762';
const NO_AUTHORS_REF = '[1] Attention is all you need. NeurIPS 2017. arXiv:1706.03762';

const REAL_LINE = 'Title ✓ · Authors ✓ (first author) · Year ✓';
const WRONG_YEAR_LINE = 'Title ✓ · Authors ✓ (first author) · Year ✗ 2019 vs 2017';
const WRONG_TITLE_LINE = 'Title ✗ · Authors ✓ (first author) · Year ✓';
const NO_AUTHORS_LINE = 'Title ✓ · Authors Not compared — the reference names no authors · Year ✓';

function vaswaniResponse(url) {
  const u = String(url);
  if (!/1706\.03762/i.test(u)) return resp(404, {});
  if (u.includes('api.crossref.org/works/')) {
    return resp(200, { message: {
      title: ['Attention Is All You Need'],
      author: RECORD.authors.map(name => {
        const p = name.split(/\s+/);
        return { given: p.slice(0, -1).join(' '), family: p[p.length - 1] };
      }),
      'container-title': ['arXiv'],
      'published-print': { 'date-parts': [[2017]] },
    } });
  }
  if (u.includes('api.datacite.org/dois/')) {
    return resp(200, { data: { attributes: {
      titles: [{ title: 'Attention Is All You Need' }],
      creators: RECORD.authors.map(name => ({ name })),
      publisher: 'arXiv',
      publicationYear: 2017,
    } } });
  }
  return resp(404, {});
}

(async () => {
  const sb = makeSandbox();
  console.log('— parsed comparison, real record —');
  const real = sb.vpCompareFields(sb.vpParseReference(REAL_REF), RECORD);
  const wrongYear = sb.vpCompareFields(sb.vpParseReference(WRONG_YEAR_REF), RECORD);
  const wrongTitle = sb.vpCompareFields(sb.vpParseReference(WRONG_TITLE_REF), RECORD);
  const noAuthors = sb.vpCompareFields(sb.vpParseReference(NO_AUTHORS_REF), RECORD);
  ok('1 real reference line', real.line === REAL_LINE, real.line);
  ok('1 real overall is not a detail mismatch', real.detailsMismatch === false && real.overall === 'Found', real.overall);
  ok('2 wrong-year line', wrongYear.line === WRONG_YEAR_LINE, wrongYear.line);
  ok('2 wrong year (more than 1) overall', wrongYear.overall === "Found, but details don't match" && wrongYear.detailsMismatch === true, wrongYear.overall);
  ok('3 wrong-title line (real DOI 10.48550/arXiv.1706.03762)', wrongTitle.line === WRONG_TITLE_LINE, wrongTitle.line);
  ok('3 wrong title overall', wrongTitle.overall === "Found, but details don't match" && wrongTitle.detailsMismatch === true, wrongTitle.overall);
  ok('4 missing authors line', noAuthors.line === NO_AUTHORS_LINE, noAuthors.line);
  ok('4 missing authors is not a mismatch', noAuthors.detailsMismatch === false, noAuthors.overall);

  console.log('— year off by 1, close title, partial authors, missing record fields —');
  const off = sb.vpCompareFields(sb.vpParseReference(
    '[1] Vaswani, A., et al. Attention is all you need. NeurIPS 2016. arXiv:1706.03762'), RECORD);
  ok('off by 1 label', off.year.label === 'Year off by 1 (preprint vs published)', off.year.label);
  ok('off by 1 stays Found', off.detailsMismatch === false && off.overall === 'Found' && /Year off by 1 \(preprint vs published\)/.test(off.line), off.overall);
  const offHtml = sb.renderReport([{
    claim: 'Off by one [1].', base: 'CITED', label: 'CITED',
    title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], venue: 'arXiv', year: '2017',
    doi: '10.48550/arXiv.1706.03762', arxiv_id: '1706.03762', note: 'record exists',
    fieldcmp: off,
  }]);
  ok('off by 1 report stays Found and shows the year label',
    /Existence: Found ·/.test(offHtml) &&
    !offHtml.includes("Found, but details don't match") &&
    offHtml.includes('Year off by 1 (preprint vs published)'));
  const close = sb.vpCompareTitle('Attention is all you need', 'Attention is all you need for translation');
  ok('minor title difference is close', close.status === 'close' && close.label === 'Title ~ close (minor differences)', close.label);
  const several = sb.vpCompareFields(sb.vpParseReference(
    '[1] Vaswani, A., Shazeer, N. Attention is all you need. NeurIPS 2017. arXiv:1706.03762'), RECORD);
  ok('full listed overlap is Authors ✓', several.authors.label === 'Authors ✓', several.authors.label);
  const partial = sb.vpCompareAuthors(['Smith', 'Vaswani'], RECORD.authors);
  ok('first author wrong, some overlap is partial', partial.status === 'partial', partial.label);
  const missingRecord = sb.vpCompareFields(sb.vpParseReference(REAL_REF), { title: '', authors: [], year: '' });
  ok('missing record title not compared', missingRecord.title.label === 'Title Not compared — the record has no title', missingRecord.title.label);
  ok('missing record authors not compared', missingRecord.authors.reason === 'Not compared — the record names no authors', missingRecord.authors.label);
  ok('missing record year not compared', missingRecord.year.label === 'Year Not compared — the record has no year', missingRecord.year.label);
  ok('accent and punctuation still match', sb.vpCompareTitle('Attention: Is All You Need!', 'Atténtion is all you need').status === 'match');
  const bare = sb.vpCompareFields(sb.vpParseReference(''), RECORD);
  ok('no reference text is Not compared, not a mismatch',
    bare.detailsMismatch === false &&
    bare.title.label === 'Title Not compared — the citation has no reference text' &&
    bare.authors.label === 'Authors Not compared — the citation has no reference text' &&
    bare.year.label === 'Year Not compared — the citation has no reference text', bare.line);
  ok('a claim sentence is not used as the reference',
    sb.vpReferenceText({ cite_type: 'doi', cite_id: '10.1000/x', claim: 'Contrastive methods improved representation learning [doi:10.1000/x].' },
      { numeric: {}, citekey: {}, authoryear: {} }) === '');

  console.log('— pipeline: four references, stubbed registry for 1706.03762 —');
  const draft = [
    'Real [1]. Wrong year [2]. Wrong title [3]. No authors [4].',
    '',
    '## References',
    '',
    REAL_REF,
    '',
    WRONG_YEAR_REF.replace('[1]', '[2]'),
    '',
    WRONG_TITLE_REF.replace('[1]', '[3]'),
    '',
    NO_AUTHORS_REF.replace('[1]', '[4]'),
  ].join('\n');
  const live = makeSandbox(async (url) => vaswaniResponse(url));
  const ev = await live.groundDraft(draft, { keyless: false, apiKey: null }, null);
  ok('four results', ev.length === 4, String(ev.length));
  const by = {};
  ev.forEach(e => { const m = /\[(\d)\]/.exec(e.claim); if (m) by[m[1]] = e; });
  ok('pipeline 1 line', by['1'] && by['1'].fieldcmp && by['1'].fieldcmp.line === REAL_LINE, by['1'] && by['1'].fieldcmp && by['1'].fieldcmp.line);
  ok('pipeline 1 stays CITED, not a detail mismatch', by['1'] && by['1'].base === 'CITED' && by['1'].fieldcmp.detailsMismatch === false, by['1'] && by['1'].base);
  ok('pipeline 2 line', by['2'] && by['2'].fieldcmp && by['2'].fieldcmp.line === WRONG_YEAR_LINE, by['2'] && by['2'].fieldcmp && by['2'].fieldcmp.line);
  ok('pipeline 2 overall is a detail mismatch', by['2'] && by['2'].base === 'CITED' && by['2'].fieldcmp.overall === "Found, but details don't match" && by['2'].fieldcmp.detailsMismatch === true, by['2'] && by['2'].fieldcmp && by['2'].fieldcmp.overall);
  ok('pipeline 2 category is field mismatch', live.vpDisplayCategory(by['2']) === 'fieldMismatch');
  ok('pipeline 3 line', by['3'] && by['3'].fieldcmp && by['3'].fieldcmp.line === WRONG_TITLE_LINE, by['3'] && by['3'].fieldcmp && by['3'].fieldcmp.line);
  ok('pipeline 3 used the real DOI', by['3'] && by['3'].doi === '10.48550/arXiv.1706.03762', by['3'] && by['3'].doi);
  ok('pipeline 3 overall status', by['3'] && by['3'].fieldcmp.overall === "Found, but details don't match", by['3'] && by['3'].fieldcmp && by['3'].fieldcmp.overall);
  ok('pipeline 3 is not ABSTRACT-SUPPORTED', by['3'] && by['3'].base !== 'ABSTRACT-SUPPORTED', by['3'] && by['3'].base);
  ok('pipeline 3 category is field mismatch', live.vpDisplayCategory(by['3']) === 'fieldMismatch');
  ok('pipeline 4 line', by['4'] && by['4'].fieldcmp && by['4'].fieldcmp.line === NO_AUTHORS_LINE, by['4'] && by['4'].fieldcmp && by['4'].fieldcmp.line);
  ok('pipeline 4 not a detail mismatch', by['4'] && by['4'].fieldcmp.detailsMismatch === false);
  const html = live.renderReport(ev);
  ok('report shows the compact lines', [REAL_LINE, WRONG_YEAR_LINE, WRONG_TITLE_LINE, NO_AUTHORS_LINE].every(s => html.includes(s)));
  function claimBlock(src, claim) {
    const i = src.indexOf(claim);
    if (i < 0) return '';
    const next = src.indexOf('<div class="claim', i + claim.length);
    return src.slice(i, next < 0 ? src.length : next);
  }
  ok('report flags the wrong year', claimBlock(html, 'Wrong year').includes('vp-overall') && claimBlock(html, 'Wrong year').includes("Found, but details don't match"));
  ok('report flags the wrong title', claimBlock(html, 'Wrong title').includes("Found, but details don't match"));
  ok('report does not flag the real reference', !claimBlock(html, 'Real [1]').includes("Found, but details don't match"));
  ok('report does not flag the author-less reference', !claimBlock(html, 'No authors').includes("Found, but details don't match"));
  ok('report does not call the wrong title verified', !/ABSTRACT-SUPPORTED/.test(html.split('Wrong title')[1].split('No authors')[0] || ''));
  const md = live.vpReportMarkdown(ev, {});
  ok('markdown carries the four lines', [REAL_LINE, WRONG_YEAR_LINE, WRONG_TITLE_LINE, NO_AUTHORS_LINE].every(s => md.includes(s)));
  ok('markdown existence for the wrong title', md.includes("Found, but details don't match"));
  ok('no accusing words in the new notes', ev.every(e => !/fabricat|\bfake\b|hallucinat/i.test(e.note || '')));

  console.log('— pasted reference list, three lines, no heading —');
  const PASTE = [
    'Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). Attention is all you need. Advances in Neural Information Processing Systems. arXiv:1706.03762',
    'Vaswani, A., Shazeer, N., et al. (2019). Attention is all you need. arXiv:1706.03762',
    'Smith, J. (2017). Deep learning for weather forecasting in coastal regions. https://doi.org/10.48550/arXiv.1706.03762',
  ].join('\n');
  const pasted = await live.groundDraft(PASTE, { keyless: false, apiKey: null }, null);
  ok('paste yields 3 references', pasted.length === 3, JSON.stringify(pasted.map(e => e.claim)));
  ok('paste 1 is the 2017 Vaswani line', pasted[0] && pasted[0].claim.startsWith('Vaswani, A., Shazeer, N., Parmar') && !/2019/.test(pasted[0].claim));
  ok('paste 1 all fields match', pasted[0] && pasted[0].fieldcmp && pasted[0].fieldcmp.line === 'Title ✓ · Authors ✓ · Year ✓', pasted[0] && pasted[0].fieldcmp && pasted[0].fieldcmp.line);
  ok('paste 1 overall Found', pasted[0] && pasted[0].fieldcmp && pasted[0].fieldcmp.overall === 'Found' && pasted[0].fieldcmp.detailsMismatch === false);
  ok('paste 2 is the 2019 line', pasted[1] && pasted[1].claim.startsWith('Vaswani, A., Shazeer, N., et al. (2019)') && !/Smith/.test(pasted[1].claim));
  ok('paste 2 year mismatch line', pasted[1] && pasted[1].fieldcmp && pasted[1].fieldcmp.line === 'Title ✓ · Authors ✓ · Year ✗ 2019 vs 2017', pasted[1] && pasted[1].fieldcmp && pasted[1].fieldcmp.line);
  ok('paste 2 overall', pasted[1] && pasted[1].fieldcmp && pasted[1].fieldcmp.overall === "Found, but details don't match");
  ok('paste 3 is the Smith line', pasted[2] && pasted[2].claim.startsWith('Smith, J. (2017)'));
  ok('paste 3 title mismatch', pasted[2] && pasted[2].fieldcmp && pasted[2].fieldcmp.line === 'Title ✗ · Authors ✗ · Year ✓' && pasted[2].fieldcmp.overall === "Found, but details don't match", pasted[2] && pasted[2].fieldcmp && pasted[2].fieldcmp.line);
  const pasteHtml = live.renderReport(pasted);
  ok('paste report is not three matched rows', /Field mismatch 2/.test(pasteHtml) && /Matched 1/.test(pasteHtml), (pasteHtml.match(/Category: Matched \d+ · Field mismatch \d+/) || [])[0]);

  console.log('— draft with a References section, in-text cites —');
  const DRAFT = [
    'The transformer was introduced (Vaswani et al., 2017). A wrong year is cited (Vaswani et al., 2019). Weather forecasting is attributed to the same work (Smith, 2017).',
    '',
    '## References',
    '',
    PASTE,
  ].join('\n');
  const linked = await live.groundDraft(DRAFT, { keyless: false, apiKey: null }, null);
  ok('draft yields 3 in-text citations', linked.length === 3, JSON.stringify(linked.map(e => e.claim)));
  ok('draft cites stay in the body', linked.every(e => !/arXiv:1706\.03762/.test(e.claim) && !/doi\.org/.test(e.claim)));
  ok('draft 1 all fields match', linked[0] && linked[0].fieldcmp && linked[0].fieldcmp.line === 'Title ✓ · Authors ✓ · Year ✓' && linked[0].fieldcmp.overall === 'Found', linked[0] && linked[0].fieldcmp && linked[0].fieldcmp.line);
  ok('draft 2 year mismatch', linked[1] && linked[1].fieldcmp && linked[1].fieldcmp.line === 'Title ✓ · Authors ✓ · Year ✗ 2019 vs 2017' && linked[1].fieldcmp.overall === "Found, but details don't match", linked[1] && linked[1].fieldcmp && linked[1].fieldcmp.line);
  ok('draft 3 title mismatch', linked[2] && linked[2].fieldcmp && linked[2].fieldcmp.line === 'Title ✗ · Authors ✗ · Year ✓' && linked[2].fieldcmp.overall === "Found, but details don't match", linked[2] && linked[2].fieldcmp && linked[2].fieldcmp.line);

  console.log('— exact labels —');
  console.log('  1 real: ' + REAL_LINE + ' | overall Found');
  console.log("  2 wrong year: " + WRONG_YEAR_LINE + " | overall Found, but details don't match");
  console.log('  3 wrong title: ' + WRONG_TITLE_LINE + " | overall Found, but details don't match");
  console.log('  4 missing authors: ' + NO_AUTHORS_LINE + ' | overall Found');
  done();
})().catch(err => { console.error(err); process.exit(1); });
