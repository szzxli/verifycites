/* Label split (batch 2 step 3): ID_NOT_FOUND vs ID_NOT_FOUND_TITLE_FOUND,
 * NOT_A_SCHOLARLY_RECORD for web/software/standards, a next step per label,
 * and no accusing words in user-facing labels. No network.
 * Run: node tests/labels.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox, harness } = require('./_sandbox');
const { ok, done } = harness();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'ground.js'), 'utf8');

(async () => {
  console.log('— non-scholarly heuristic —');
  {
    const sb = makeSandbox();
    for (const s of ['Wolf, T. Transformers. https://github.com/huggingface/transformers. 2020.',
      'Microsoft. phi-2 model card. huggingface.co/microsoft/phi-2.', 'Postel, J. RFC 791: Internet Protocol. 1981.',
      'ISO/IEC 27001:2022 Information security.', 'NIST SP 800-53 Rev. 5.', 'ANSI/NISO Z39.96-2021 JATS.',
      'Example blog post [Online]. Accessed 2024-01-01.'])
      ok('non-scholarly: ' + s.slice(0, 30), sb.vpLooksNonScholarly(s) === true);
    for (const s of ['Vaswani, A. et al. Attention is all you need. NeurIPS 2017.', 'LeCun, Y. Deep learning. Nature 521:436-444, 2015.', ''])
      ok('scholarly/empty stays false: ' + s.slice(0, 30), sb.vpLooksNonScholarly(s) === false);
  }

  console.log('— engine: identifier not found, title found / not found —');
  {
    const md = '# T\n\nClaim one [1]. Claim two [2]. Claim three [3]. See https://example.org/blog/post for details.\n\n## References\n\n' +
      '[1] Vaswani, A. et al. Attention is all you need. NeurIPS 2017. doi:10.9999/typo.attention\n\n' +
      '[2] Nobody, A. A title no database knows at all. 2020. doi:10.9999/nothing.here\n\n' +
      '[3] Wolf, T. et al. Transformers library. https://github.com/huggingface/transformers. 2020.';
    const sb = makeSandbox(async () => ({ ok: false, status: 404 }));
    sb.bibliographicLookup = async (raw) => /Attention is all you need/i.test(raw)
      ? { record: { title: 'Attention Is All You Need', year: '2017', authors: ['A. Vaswani'] }, doi: '10.48550/arXiv.1706.03762', via: 'openalex' }
      : { doi: null, arxiv_id: null, via: 'none', answered: ['openalex'] };
    const ev = await sb.groundDraft(md, {}, null);
    const by = {}; ev.forEach(e => { by[e.claim] = e; });
    const e1 = by['Claim one [1].'], e2 = by['Claim two [2].'], e3 = by['Claim three [3].'];
    ok('mistyped id + title match -> ID_NOT_FOUND_TITLE_FOUND', e1 && e1.base === 'ID_NOT_FOUND_TITLE_FOUND', e1 && e1.base);
    ok('title-found note names the matching record', e1 && /Attention Is All You Need/.test(e1.note) && /10\.48550\/arXiv\.1706\.03762/.test(e1.note));
    ok('id + no title match -> ID_NOT_FOUND', e2 && e2.base === 'ID_NOT_FOUND', e2 && e2.base);
    ok('github reference, no record -> NOT_A_SCHOLARLY_RECORD', e3 && e3.base === 'NOT_A_SCHOLARLY_RECORD', e3 && e3.base);
    const url = ev.find(e => /example\.org/.test(e.claim));
    ok('inline web URL -> NOT_A_SCHOLARLY_RECORD', !url || url.base === 'NOT_A_SCHOLARLY_RECORD', url && url.base);
    for (const e of ev) ok('note has no accusing words: ' + e.base, !/fabricat|\bfake\b|hallucinat/i.test(e.note || ''), e.note);

    const out = sb.renderReport(ev);
    ok('summary counts the new labels', /ID_NOT_FOUND_TITLE_FOUND 1/.test(out) && /ID_NOT_FOUND 1/.test(out) && /NOT_A_SCHOLARLY_RECORD \d/.test(out));
    ok('categories: title-found is a field mismatch, non-scholarly cannot be determined',
      sb.vpDisplayCategory(e1) === 'fieldMismatch' && sb.vpDisplayCategory(e3) === 'cannotDetermine' && sb.vpDisplayCategory(e2) === 'notFound');
  }

  console.log('— legend and contract: next step per label, no accusing label names —');
  {
    const sb = makeSandbox();
    const legend = sb.renderReport([{ claim: 'x', base: 'CITED', label: 'CITED', note: 'n' }]);
    for (const l of ['ABSTRACT-SUPPORTED', 'CITED', 'UNVERIFIED', 'ID_NOT_FOUND', 'ID_NOT_FOUND_TITLE_FOUND', 'NOT_A_SCHOLARLY_RECORD', 'RATE_LIMITED', 'INVALID_DOI']) {
      ok('legend has a next step for ' + l, new RegExp('(?:^|[ :;]) ?' + l + ' = (?:(?! = ).)*next:').test(legend));
      const re = new RegExp('<span class="label [^"]+">' + l + '</span></dt>\\s*<dd>[^<]*(?:<[^>]+>[^<]*)*?<b>Next:</b>');
      ok('contract has a next step for ' + l, re.test(html));
    }
    ok('no FABRICATED label anywhere', !/FABRICATED/.test(html) && !/FABRICATED/.test(src));
    const labels = (html.match(/<span class="label [^"]+">[^<]+<\/span>/g) || []).concat(src.match(/<span class="label [^"]+">[^<$]+/g) || []);
    ok('no accusing words in label chips', labels.every(s => !/fabricat|fake|hallucinat/i.test(s)), labels.filter(s => /fabricat|fake|hallucinat/i.test(s)).join(' | '));
  }

  console.log('— privacy wording and honest recall —');
  {
    ok('no "nothing is uploaded" / "never leaves the page"', !/nothing is uploaded|never leaves the page/i.test(html));
    const priv = 'Only citation identifiers and reference text are sent to the registries';
    ok('privacy line in section 1 and footer match', html.split(priv).length - 1 === 2);
    ok('recall stated with rank and date', /22\/33 \(67%\), 5th of the 6 tools/.test(html) && /15\/71 \(21%\), is the lowest of the six/.test(html) && /have not been re-scored/.test(html));
    ok('nocount loader kept', /nocount/.test(html));
    ok('service worker cache bumped', /veripaper-v3[4-9]/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
  }
  done();
})();
