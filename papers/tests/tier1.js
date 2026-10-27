// Node tests for Tier-1 first-seen matching (papers app). No network.
// Run: node tests/tier1.js
// The helpers live in ground.js (browser code); they are extracted and
// evaluated in a sandbox here so the matching logic itself — not a copy
// of it — is what gets tested. Static checks cover the wiring.
'use strict';
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "ground.js"), "utf8");

function extractFn(name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " must be defined in ground.js");
  // Function ends at the first "\n}\n" after its start.
  const end = src.indexOf("\n}\n", start);
  assert.ok(end > start, "could not find end of " + name);
  return src.slice(start, end + 3);
}

const sandbox = {};
vm.createContext(sandbox);
for (const name of ["vpTier1NormDoi", "vpTier1NormArxiv", "vpTier1FindPaper"]) {
  vm.runInContext(extractFn(name), sandbox);
}
const { vpTier1NormDoi, vpTier1NormArxiv, vpTier1FindPaper } = sandbox;

const INDEX = {
  meta: { last_poll: "2026-10-27T21:53:46Z", sources: [{ name: "arXiv" }, { name: "Europe PMC" }] },
  items: [
    { source: "arXiv", kind: "paper", title_or_case_name: "Quantum dynamics",
      identifier: "2610.35867", url: "https://arxiv.org/abs/2610.35867",
      date: "2026-10-26", first_seen: "2026-10-27T21:53:46Z" },
    { source: "Europe PMC", kind: "paper", title_or_case_name: "Some Study",
      identifier: "10.1007/10_2026_363", doi: "10.1007/10_2026_363",
      url: "https://europepmc.org/article/MED/42888301",
      date: "2026-10-27", first_seen: "2026-10-27T21:53:46Z" },
    { source: "Europe PMC", kind: "paper", title_or_case_name: "Book Chapter",
      identifier: "europepmc:NBK625567", url: "https://europepmc.org/article/NBK/NBK625567",
      date: "2026-10-27", first_seen: "2026-10-27T21:53:46Z" },
    { source: "Supreme Court", kind: "legal", title_or_case_name: "FCC v. Brown",
      identifier: "26A476", url: "https://example.invalid/x.pdf",
      date: "2026-10-14", first_seen: "2026-10-27T21:53:40Z" },
  ],
};

// (a) Normalisation.
assert.strictEqual(vpTier1NormDoi("DOI:10.1007/10_2026_363"), "10.1007/10_2026_363");
assert.strictEqual(vpTier1NormDoi("https://doi.org/10.1007/10_2026_363"), "10.1007/10_2026_363");
assert.strictEqual(vpTier1NormDoi("10.1007/10_2026_363."), "10.1007/10_2026_363");
assert.strictEqual(vpTier1NormArxiv("arXiv:2610.35867v1"), "2610.35867");
assert.strictEqual(vpTier1NormArxiv("2610.35867v2"), "2610.35867");

// (b) Exact identifier matches.
let hit = vpTier1FindPaper(INDEX, { doi: null, arxiv_id: "2610.35867v1" });
assert.ok(hit && hit.source === "arXiv", "versioned arXiv ID must match the unversioned index ID");
hit = vpTier1FindPaper(INDEX, { doi: "10.1007/10_2026_363", arxiv_id: null });
assert.ok(hit && hit.source === "Europe PMC", "DOI must match the Europe PMC item");
hit = vpTier1FindPaper(INDEX, { doi: "doi:10.1007/10_2026_363", arxiv_id: null });
assert.ok(hit, "doi:-prefixed DOI must match");

// (c) No match: unknown identifiers, legal items, empty evidence.
assert.strictEqual(vpTier1FindPaper(INDEX, { doi: "10.9999/unknown", arxiv_id: null }), null);
assert.strictEqual(vpTier1FindPaper(INDEX, { doi: null, arxiv_id: "2610.00000v1" }), null);
assert.strictEqual(vpTier1FindPaper(INDEX, { doi: null, arxiv_id: null }), null);
assert.strictEqual(vpTier1FindPaper(INDEX, { doi: "26A476", arxiv_id: null }), null,
  "legal items must never match a paper row");
assert.strictEqual(vpTier1FindPaper(null, { doi: "10.1007/10_2026_363" }), null);
assert.strictEqual(vpTier1FindPaper({ items: [] }, { doi: "10.1007/10_2026_363" }), null);

// (d) Wiring (static): renderReport honours ropts.tier1, the handler
// fetches ONLY the same-origin index, and no Tier-1 code reaches out
// to a court, arXiv, or Europe PMC host from the browser.
assert.ok(src.includes("vpTier1NoteHtml(ropts && ropts.tier1)"),
  "summary must render the Tier-1 note from ropts.tier1");
assert.ok(src.includes("vpTier1FindPaper(ropts.tier1, e)"),
  "per-item first-seen must use ropts.tier1");
assert.ok(src.includes("fetch('../data/tier1-index.json'"),
  "papers handler must fetch the same-origin index");
const tier1Section = src.slice(src.indexOf("Tier-1 first-seen matching"),
  src.indexOf("Faithful port of veripaper"));
assert.ok(!/ca9\.uscourts|supremecourt\.gov|export\.arxiv|ebi\.ac\.uk/.test(tier1Section),
  "Tier-1 browser code must not fetch any direct source host");
assert.ok(!/RECAP|ORCID|govinfo|bioRxiv/.test(tier1Section),
  "excluded batch sources must not appear in Tier-1 browser code");
assert.ok(/First seen at/.test(src), "first-seen display text must exist");
assert.ok(!/not in the Tier-1 index|Tier-1.*not found/i.test(tier1Section),
  "absence must never be worded as not-found");

console.log("papers Tier-1 tests passed");
