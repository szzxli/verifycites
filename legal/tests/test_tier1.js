// Node tests for Tier-1 first-seen matching (legal app). No network.
// Run: node tests/test_tier1.js
// Guarantees: exact-match-only first-seen display. A match requires an
// identical normalised case name, plus year agreement when both sides
// carry a year. No match produces no first-seen text at all — absence
// from the index is never worded as "not found", and a first-seen hit
// never changes the machine label/category.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { tier1NormalizeCaseName, tier1FindLegal, tier1FirstSeenText,
  buildHealthReport, healthReportMarkdown, healthReportHtml } = require("../report.js");
const { I18N } = require("../i18n.js");

const INDEX = {
  meta: { last_poll: "2026-10-27T21:53:46Z",
    sources: [{ name: "Ninth Circuit" }, { name: "Supreme Court" },
      { name: "arXiv" }, { name: "Europe PMC" }] },
  items: [
    { source: "Supreme Court", kind: "legal", title_or_case_name: "FCC v. Brown",
      identifier: "26A476", url: "https://example.invalid/x.pdf",
      date: "2026-10-14", first_seen: "2026-10-27T21:53:40Z" },
    { source: "Ninth Circuit", kind: "legal",
      title_or_case_name: "BERKELEY HOMELESS UNION, ET AL. V. CITY OF BERKELEY, ET AL.",
      identifier: "26-842", url: "https://example.invalid/y.pdf",
      date: "2026-10-26", first_seen: "2026-10-27T21:53:40Z" },
    { source: "arXiv", kind: "paper", title_or_case_name: "Some Paper",
      identifier: "2610.35868", url: "https://arxiv.org/abs/2610.35868",
      date: "2026-10-26", first_seen: "2026-10-27T21:53:46Z" },
  ],
};

// (a) Normalisation: case, punctuation, and whitespace do not matter.
assert.strictEqual(tier1NormalizeCaseName("FCC v. Brown"), "fcc v brown");
assert.strictEqual(
  tier1NormalizeCaseName("BERKELEY HOMELESS UNION, ET AL. V. CITY OF BERKELEY, ET AL."),
  "berkeley homeless union et al v city of berkeley et al");

// (b) Exact match, case-insensitive, with year agreement.
let hit = tier1FindLegal(INDEX, { caseName: "FCC v. Brown", year: "2026" });
assert.ok(hit && hit.source === "Supreme Court" && hit.identifier === "26A476",
  "exact name + year must match");
hit = tier1FindLegal(INDEX, { caseName: "fcc v. brown", year: null });
assert.ok(hit, "name match without a row year must still match");
hit = tier1FindLegal(INDEX, { caseName: "Berkeley Homeless Union, et al. v. City of Berkeley, et al.", year: "2026" });
assert.ok(hit && hit.source === "Ninth Circuit", "all-caps index title must match");

// (c) No match: wrong year, wrong name, no case name, paper items ignored.
assert.strictEqual(tier1FindLegal(INDEX, { caseName: "FCC v. Brown", year: "2025" }), null,
  "year disagreement must not match");
assert.strictEqual(tier1FindLegal(INDEX, { caseName: "FCC v. Smith", year: "2026" }), null);
assert.strictEqual(tier1FindLegal(INDEX, { caseName: null, year: "2026" }), null);
assert.strictEqual(tier1FindLegal(INDEX, { caseName: "Some Paper", year: "2026" }), null,
  "paper items must never match a legal row");
assert.strictEqual(tier1FindLegal(null, { caseName: "FCC v. Brown" }), null);
assert.strictEqual(tier1FindLegal({ items: [] }, { caseName: "FCC v. Brown" }), null);

// (d) First-seen text: template + date-only rendering, never a claim.
assert.strictEqual(tier1FirstSeenText(INDEX.items[0], I18N.en),
  "First seen at Supreme Court on 2026-10-27");
assert.strictEqual(tier1FirstSeenText(null, I18N.en), null);
assert.ok(I18N.es.tier1FirstSeen.includes("{source}") && I18N.es.tier1FirstSeen.includes("{date}"),
  "Spanish template must keep both placeholders");
assert.ok(I18N.zh.tier1FirstSeen.includes("{source}") && I18N.zh.tier1FirstSeen.includes("{date}"),
  "Chinese template must keep both placeholders");

// (e) i18n: all four Tier-1 keys exist in all three languages.
for (const lang of ["en", "es", "zh"]) {
  for (const key of ["tier1Heading", "tier1Note", "tier1Unavailable", "tier1FirstSeen"]) {
    assert.ok(I18N[lang][key], `missing ${key} in ${lang}`);
  }
}

// (f) Downloads: matched row gains first-seen text; unmatched row gains
// nothing; machine label/category are untouched by the Tier-1 lookup.
const report = buildHealthReport([
  { text: "26A476", caseName: "FCC v. Brown", year: "2026" },
  { text: "347 U.S. 483", volume: "347", reporter: "U.S.", page: "483",
    caseName: "Brown v. Board of Education", year: "1954" },
]);
const find = (row) => tier1FindLegal(INDEX, row);
const md = healthReportMarkdown(report, I18N.en, {}, "2026-10-27", find);
assert.ok(md.includes("First seen at Supreme Court on 2026-10-27"),
  "matched row must carry first-seen text in Markdown");
assert.strictEqual((md.match(/First seen at/g) || []).length, 1,
  "unmatched row must gain no first-seen text");
assert.ok(md.includes("Cannot be determined"), "machine category must be unchanged");
const html = healthReportHtml(report, I18N.en, {}, "2026-10-27", find);
assert.ok(html.includes("First seen at Supreme Court on 2026-10-27"),
  "matched row must carry first-seen text in HTML");
assert.strictEqual((html.match(/First seen at/g) || []).length, 1);
assert.ok(!/not in the Tier-1 index|Tier-1.*not found/i.test(md + html),
  "absence must never be worded as not-found");

// (g) Without a finder, downloads are byte-identical to the old behaviour.
const mdPlain = healthReportMarkdown(report, I18N.en, {}, "2026-10-27");
assert.ok(!mdPlain.includes("First seen at"), "no finder => no first-seen text");

// (h) The real seed index (if present) matches the real SCOTUS row.
const seedPath = path.join(__dirname, "..", "..", "data", "tier1-index.json");
if (fs.existsSync(seedPath)) {
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  assert.ok(seed.meta && seed.meta.last_poll, "seed index must carry meta.last_poll");
  assert.ok(Array.isArray(seed.items) && seed.items.length > 0, "seed index must be non-empty");
  const real = tier1FindLegal(seed, { caseName: "FCC v. Brown", year: "2026" });
  assert.ok(real && real.source === "Supreme Court",
    "real seed index must match FCC v. Brown to the Supreme Court item");
  for (const it of seed.items) {
    assert.ok(it.source && it.identifier && it.url && it.first_seen,
      "every seed item must carry source, identifier, url, first_seen");
  }
} else {
  console.log("seed index not present; skipping real-index assertions");
}

console.log("legal Tier-1 tests passed");
