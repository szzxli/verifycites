// Regression tests for the immigration-brief audit: multi-section
// regulations, short I&N cites, AAO, the spelled-out Act, Federal
// Register, unrecognized leftovers, impossible year/volume, and a
// standard format that keeps parentheticals and pin cites.
// No network. Run: node legal/tests/test_audit_extract.js
const assert = require("assert");
const { extractCitations, unrecognizedCitations, standardCitation } = require("../extract.js");
const { buildHealthReport } = require("../report.js");

const multi = extractCitations("See 8 C.F.R. §§ 208.16, 1208.16.");
assert.deepStrictEqual(multi.map((r) => r.page), ["208.16", "1208.16"]);
assert.ok(multi.every((r) => /\/section-/.test(r.manualUrl)), JSON.stringify(multi.map((r) => r.manualUrl)));
assert.deepStrictEqual(unrecognizedCitations("See 8 C.F.R. §§ 208.16, 1208.16."), []);

const short = extractCitations("See 19 I&N Dec. at 233.");
assert.strictEqual(short.length, 1);
assert.strictEqual(short[0].volume, "19");
assert.strictEqual(short[0].pinCite, "233");
assert.strictEqual(standardCitation(short[0]), "19 I&N Dec. at 233");

const aao = extractCitations("Matter of D-ES- Inc. (AAO 2016).");
assert.strictEqual(aao.length, 1);
assert.strictEqual(aao[0].reporter, "AAO");
assert.ok(aao[0].manualUrl.includes("/aao-non-precedent-decisions"));
assert.strictEqual(standardCitation(aao[0]), "Matter of D-ES- Inc. (AAO 2016)");

const act = extractCitations("Immigration and Nationality Act § 101(a)(42)(A).");
assert.strictEqual(act.length, 1);
assert.strictEqual(act[0].reporter, "INA");
assert.strictEqual(act[0].page, "101(a)(42)(A)");
assert.strictEqual(standardCitation(act[0]), "Immigration and Nationality Act § 101(a)(42)(A)");

const fed = extractCitations("85 Fed. Reg. 23,986 (Apr. 30, 2020).");
assert.strictEqual(fed.length, 1);
assert.strictEqual(fed[0].reporter, "Fed. Reg.");
assert.strictEqual(fed[0].volume, "85");
assert.strictEqual(fed[0].page, "23986");
assert.strictEqual(fed[0].year, "2020");
assert.strictEqual(standardCitation(fed[0]), "85 Fed. Reg. 23,986 (Apr. 30, 2020)");
assert.ok(fed[0].manualUrl.includes("85-FR-23986"));

const kept = extractCitations("Matter of A-B-, 27 I&N Dec. 316, 318 (A.G. 2018). Hunt v. Smith, 670 S.W.2d 248, 250 (Ky. App. 1984) (en banc).");
assert.strictEqual(standardCitation(kept[0]), "Matter of A-B-, 27 I&N Dec. 316, 318 (A.G. 2018)");
assert.strictEqual(standardCitation(kept[1]), "Hunt v. Smith, 670 S.W.2d 248, 250 (Ky. App. 1984) (en banc)");

const fake = buildHealthReport(extractCitations("Matter of Fakename, 99 I&N Dec. 999 (BIA 2030)."));
assert.strictEqual(fake.rows[0].label, "NOT_CHECKED");
assert.ok(fake.rows[0].flags.includes("impossibleYear"), JSON.stringify(fake.rows[0].flags));
assert.ok(fake.rows[0].flags.includes("impossibleVolume"));

const real = buildHealthReport(extractCitations("Matter of MERCADER, 30 I&N Dec. 185 (BIA 2026)."));
assert.deepStrictEqual(real.rows[0].flags, []);

const missed = unrecognizedCitations("Discussed in 12 F. Supp. 34, which this extractor does not list.");
assert.ok(missed.some((s) => s.includes("12 F. Supp. 34")), JSON.stringify(missed));

// Near-misses: a mistyped reporter, and a cite whose page was left out.
const typo = unrecognizedCitations("The brief cites 12 F.4ht 55 for the rule.");
assert.ok(typo.some((s) => s.includes("12 F.4ht 55")), JSON.stringify(typo));
assert.strictEqual(extractCitations("The brief cites 12 F.4ht 55 for the rule.").length, 0);

const noPage = unrecognizedCitations("See 512 F.3d at (9th Cir. 2008).");
assert.ok(noPage.some((s) => s.includes("512 F.3d at (9th Cir. 2008)")), JSON.stringify(noPage));
assert.strictEqual(extractCitations("See 512 F.3d at (9th Cir. 2008).").length, 0);

// A real reporter with its page is extracted, not also listed as unrecognized.
assert.strictEqual(extractCitations("12 F.4th 55.").length, 1);
assert.deepStrictEqual(unrecognizedCitations("12 F.4th 55."), []);

// Ordinary prose is not citation-like.
const prose = [
  "The court heard 12 witnesses in the hearing on May 3.",
  "See Figure 12. The appendix has 3 tables.",
  "On 12 Dec. 1955 the agency issued a memo.",
  "There are 12 U.S. citizens in the group (federal employees).",
  "Read 512 F.3d opinions before the argument.",
  "Item 12 F. The next point is separate.",
  "See 12 Fig. 3 of the appendix.",
  "12 Washington. 3 more points followed.",
];
prose.forEach((sentence) => {
  assert.deepStrictEqual(unrecognizedCitations(sentence), [], sentence);
});

const mixed = "Immigration and Nationality Act § 101(a)(42)(A); 85 Fed. Reg. 23,986 (Apr. 30, 2020).";
const mixedRows = extractCitations(mixed);
assert.deepStrictEqual(mixedRows.map((r) => r.reporter), ["INA", "Fed. Reg."]);
assert.deepStrictEqual(unrecognizedCitations(mixed), []);

console.log("audit extraction tests passed");
