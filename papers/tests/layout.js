/* Batch 2 step 3, part B: B3 input label, B4 filters + cache line, B5 echo,
 * B6 keyless disclosure, B7 project sentence, B9 back to top. No network.
 * Run: node tests/layout.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox, harness } = require('./_sandbox');
const { ok, done } = harness();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const proj = fs.readFileSync(path.join(__dirname, '..', 'project.js'), 'utf8');

// B3
ok('B3: persistent label for the draft input', /<label for="ground-input" id="ground-input-label"/.test(html));
ok('B3: names .docx/.pdf/.bib and says what to do with .doc and .txt', /\.docx, \.pdf or \.bib/.test(html) && /\.doc file\? Save it as \.docx/.test(html) && /\.txt file\? Open it and paste/.test(html));

// B4
{
  const sb = makeSandbox();
  const ev = [{ claim: 'a', base: 'CITED', label: 'CITED', note: '' }, { claim: 'b', base: 'UNVERIFIED', label: 'UNVERIFIED', note: '' },
    { claim: 'c', base: 'CITED', label: 'CITED', note: '' }];
  const out = sb.renderReport(ev);
  ok('B4: counts are filter buttons', /<button type="button" class="label l-cited vp-filter" data-filter="CITED" aria-pressed="false">CITED 2<\/button>/.test(out));
  ok('B4: zero counts are disabled', /data-filter="ABSTRACT-SUPPORTED" aria-pressed="false" disabled>ABSTRACT-SUPPORTED 0/.test(out));
  ok('B4: Show all button and a one-line hint', /data-filter="" aria-pressed="true">Show all/.test(out) && /Click a label count to show only those results/.test(out));
  ok('B4: every result block carries its label for filtering', (out.match(/data-claim-base="/g) || []).length === 3);
  ok('B4: no cache line without cache hits', !/vp-cache-line/.test(out));
  // filter logic on fake elements
  const mk = (attrs) => ({ attrs, hidden: false, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const blocks = ev.map(e => mk({ 'data-claim-base': e.base }));
  const chips = [mk({ 'data-filter': 'CITED', 'aria-pressed': 'false' }), mk({ 'data-filter': '', 'aria-pressed': 'true' })];
  const box = { querySelectorAll: sel => (sel === '[data-claim-base]' ? blocks : chips) };
  sb.vpApplyFilter(box, 'CITED');
  ok('B4: filter shows only CITED blocks', blocks.map(b => b.hidden).join() === 'false,true,false');
  ok('B4: pressed state follows the filter', chips[0].attrs['aria-pressed'] === 'true' && chips[1].attrs['aria-pressed'] === 'false');
  sb.vpApplyFilter(box, '');
  ok('B4: Show all restores every block', blocks.every(b => !b.hidden));
  const src = fs.readFileSync(path.join(__dirname, '..', 'ground.js'), 'utf8');
  ok('B4: cache line says where, what, and browser-local', /localStorage \(key <code>veripaper-cache-v1<\/code>\): registry records, abstracts and check verdicts, kept 7–30 days, at most 800 entries\. It stays in this browser and is never sent anywhere\./.test(src));
  ok('B4: old unexplained cache line is gone', !/served from local cache/.test(src));
  ok('B4: filters add no analytics events', !/vpFilter[\s\S]{0,400}(vpCount|goatcounter|VP_EVENTS)/.test(src));
}

// B5
{
  const a = html.indexOf('const showE'), b = html.indexOf('}catch(err){', a);
  const seg = html.slice(a, b);
  ok('B5: echo shows the input and its DOI / arXiv ID form', /You entered: <code>\$\{esc\(raw\)\}<\/code>/.test(html) && /DOI form: <code>10\.48550\/arXiv\./.test(html));
  ok('B5: echo is labelled as an echo, not a result', /echo of your input, not a check result/.test(html));
  ok('B5: every outcome after normalisation shows the echo', !/\n\s+show\(`/.test(seg) && (seg.match(/showE\(`/g) || []).length >= 4);
}

// B6
ok('B6: one default line', /Leave the box checked — the free check runs in your browser\./.test(html));
ok('B6: details behind a disclosure', /<details class="fold" id="keyless-explainer"[^>]*>\s*<summary>What is the keyless check\?<\/summary>/.test(html));
{
  const d = html.slice(html.indexOf('id="keyless-explainer"'), html.indexOf('</details>', html.indexOf('id="keyless-explainer"')));
  ok('B6: honesty content kept inside', /87&nbsp;MB/.test(d) && /\[KEYLESS-NLI\]/.test(d) && /OpenRouter key/.test(d) && /first-pass screen/.test(d) && /Crossref, DataCite\/arXiv, OpenAlex/.test(d));
}

// B7
ok('B7: one plain sentence under the project bar', /id="pj-purpose"[^>]*>One project keeps your idea, checklist, venues, rebuttal and submissions together\. Everything stays in this browser\./.test(html));
ok('B7: grounded is defined where the count appears', /id="grounded-definition"/.test(html));
ok('B7: cryptic chain removed from the hint', !/one project carries idea/.test(proj));

// B9
ok('B9: back-to-top control and footer link', /id="back-to-top"/.test(html) && /href="#top" id="footer-top"/.test(html) && /<header class="vc-nav" id="top">/.test(html));

ok('nocount loader kept', /nocount/.test(html));
ok('service worker cache v35+', /veripaper-v(3[5-9]|[4-9]\d)/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
done();
