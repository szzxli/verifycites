// Papers hand-check counts, grounded ×N wording, deadline line, hero links.
// Run: node papers/tests/handcheck.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'ground.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const projectSrc = fs.readFileSync(path.join(__dirname, '..', 'project.js'), 'utf8');

function mkEl() {
  return {
    value: '', textContent: '', innerHTML: '', disabled: false, style: {}, dataset: {},
    addEventListener() {}, click() {}, scrollIntoView() {}, appendChild() {}, remove() {},
  };
}
const sandbox = {
  console,
  setTimeout: (fn) => setTimeout(fn, 0),
  clearTimeout: () => {},
  document: {
    readyState: 'complete',
    addEventListener: () => {},
    getElementById: () => mkEl(),
    createElement: () => mkEl(),
    body: mkEl(),
  },
  window: {},
  navigator: {},
  location: { href: '' },
  fetch: async () => { throw new Error('no network'); },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  Blob: function () {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'ground.js' });

const id0 = sandbox.handcheckClaimId(0, 'claim a');
const id1 = sandbox.handcheckClaimId(1, 'claim b');
assert.notStrictEqual(id0, id1);
assert.strictEqual(sandbox.handcheckStorageKey('p1'), 'veripaper.handcheck.v1.p1');
const counts = sandbox.handcheckCounts(
  [{ claim: 'claim a' }, { claim: 'claim b' }],
  { [id0]: true });
assert.strictEqual(counts.checked, 1);
assert.strictEqual(counts.total, 2);

const report = sandbox.renderReport(
  [{ claim: 'claim a', base: 'CITED', label: 'CITED', note: '' },
   { claim: 'claim b', base: 'CITED', label: 'CITED', note: '' }],
  { handMarks: { [id0]: true } });
assert.ok(report.includes('You have checked 1 of 2 claims by hand'));
assert.ok(report.includes('Checked by hand'));
assert.ok(report.includes('data-handcheck="' + id0 + '"'));

assert.ok(html.includes('id="grounded-definition"'));
assert.ok(html.includes('grounded ×N = number of citation checks completed in this project, saved in this browser.'));
assert.ok(!html.includes('VP.recordGround'), 'user-facing page does not name VP.recordGround');
assert.ok(html.includes('id="deadline-no-reminders"'));
assert.ok(html.includes('For your own tracking — this page does not send reminders.'));
assert.ok(html.includes('class="btn primary hero-tool-link"'));
assert.ok(html.includes('href="#verify"'));
assert.ok(html.includes('id="hero-side-tools"'));
for (const href of ['#idea', '#datasets', '#venues', '#rebuttal', '#submissions']) {
  assert.ok(html.includes('href="' + href + '"'), 'hero side link ' + href);
}
assert.ok(html.includes('claims processed by the checker') || src.includes('processed by the checker'));
assert.ok(src.includes('source found; whether it supports the claim was not checked (or only partly)'));
assert.ok(src.includes('This check was counted in project '));
assert.ok(html.includes('identifier</b> in the text matches the record') || html.includes('identifier'));
assert.ok(!html.includes('metadata match'), 'section 1 does not claim metadata matching');
assert.ok(projectSrc.includes('p.groundRuns.length'));
assert.ok(projectSrc.includes('p.groundRuns.push'));
assert.ok(src.includes('VP.recordGround(evidence)'));

const outer = { tagName: 'DETAILS', open: false, parentElement: null };
const mid = { tagName: 'DIV', parentElement: outer };
const nested = { tagName: 'DETAILS', open: false };
const section = {
  tagName: 'SECTION', id: 'idea', parentElement: mid, scrolled: false,
  querySelector(sel) { return sel === 'details' ? nested : null; },
  scrollIntoView() { this.scrolled = true; }
};
sandbox.openHeroToolTarget(section);
assert.strictEqual(outer.open, true, 'ancestor Experimental side tools details opens');
assert.strictEqual(nested.open, true, 'the tool details opens when present');
assert.strictEqual(section.scrolled, true, 'the link scrolls to the tool');

console.log('papers handcheck tests passed');
