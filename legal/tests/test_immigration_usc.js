// Node tests for (1) the corrected immigration-subsection frequency
// wording and (2) the 8 U.S.C. extractor pattern. No network.
// Run: node tests/test_immigration_usc.js
// Guarantees: the corrected final sentences are present and the old
// frequency sentences are gone in all three languages; a pasted
// "8 U.S.C. § <section>" yields exactly one statute row with no
// year/name flags, the §-normalised standard format, and the OLRC
// manual link; court cites (including "8 U.S. 100") stay court rows.
const assert = require("assert");
const { extractCitations, standardCitation } = require("../extract.js");
const { buildHealthReport, immClassifyRow, immSourceLine } = require("../report.js");
const { I18N } = require("../i18n.js");

function rowsOf(text) {
  const rows = extractCitations(text);
  return { rows, rep: buildHealthReport(rows) };
}

// ---------- Change 1: corrected frequency wording ----------
const corrected = {
  en: "The core statute and regulation text (INA, 8 CFR) changes rarely; what changes more often is policy guidance and new BIA precedent.",
  es: "El texto básico de la ley y el reglamento (INA, 8 CFR) cambia rara vez; lo que cambia con más frecuencia son las guías de política y los nuevos precedentes BIA.",
  zh: "INA 与 8 CFR 的核心法条文本变化很少；变化较多的是政策指引和新的 BIA 先例。",
};
const oldFreq = {
  en: "Immigration sources change frequently.",
  es: "Las fuentes de inmigración cambian con frecuencia.",
  zh: "移民来源变化频繁。",
};
for (const lang of ["en", "es", "zh"]) {
  const s = I18N[lang].immSectionNotCovered;
  assert.ok(s.includes(corrected[lang]), lang + ": corrected sentence missing");
  assert.ok(!s.includes(oldFreq[lang]), lang + ": old frequency sentence still present");
}
// Static HTML fallback carries the same EN string: it must match too,
// or the contradicted wording still shows before JS loads.
const fs = require("fs");
const path = require("path");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(!indexHtml.includes(oldFreq.en),
  "index.html fallback must not carry the old frequency sentence");
assert.ok(indexHtml.includes(corrected.en),
  "index.html fallback must carry the corrected sentence");
// Rest of each string preserved (spot checks, not full-string pins).
assert.ok(I18N.en.immSectionNotCovered.includes("can be overruled"));
assert.ok(I18N.es.immSectionNotCovered.includes("puede ser revocado"));
assert.ok(I18N.zh.immSectionNotCovered.includes("可被推翻"));

// ---------- Change 2a: basic extraction + flags + format + link ----------
let { rows, rep } = rowsOf("Relief is available under 8 U.S.C. § 1158.");
assert.strictEqual(rows.length, 1, JSON.stringify(rows));
assert.strictEqual(rows[0].text, "8 U.S.C. § 1158");
assert.strictEqual(rows[0].reporter, "8 U.S.C.");
assert.strictEqual(rows[0].page, "1158");
assert.strictEqual(rows[0].volume, null);
assert.strictEqual(rows[0].caseName, null);
assert.strictEqual(rows[0].year, null);
assert.strictEqual(rows[0].manualUrl, "https://uscode.house.gov/download.html");
assert.strictEqual(immClassifyRow(rows[0]), "statute");
assert.strictEqual(rep.rows[0].immType, "statute");
assert.deepStrictEqual(rep.rows[0].flags, [],
  "U.S.C. rows carry no year/name/reporter flags: " + JSON.stringify(rep.rows[0].flags));
assert.strictEqual(standardCitation(rows[0]), "8 U.S.C. § 1158");

// ---------- Change 2b: subsection + spelling variants ----------
({ rows, rep } = rowsOf("See 8 U.S.C. § 1101(a)(15)(L) and 8 USC 1158."));
assert.strictEqual(rows.length, 2, JSON.stringify(rows));
assert.strictEqual(rows[0].page, "1101(a)(15)(L)");
assert.strictEqual(standardCitation(rows[0]), "8 U.S.C. § 1101(a)(15)(L)");
assert.strictEqual(rows[1].text, "8 USC 1158", "text keeps the spelling as written");
assert.strictEqual(rows[1].reporter, "8 U.S.C.", "USC spelling normalises to 8 U.S.C.");
assert.strictEqual(standardCitation(rows[1]), "8 U.S.C. § 1158");
assert.ok(rows.every((r) => immClassifyRow(r) === "statute"));
assert.ok(rep.rows.every((r) => r.flags.length === 0));

// ---------- Change 2c: single-row guarantee (no overlapping court row) ----------
({ rows } = rowsOf("8 U.S.C. § 1158."));
assert.strictEqual(rows.length, 1,
  "a U.S.C. cite must yield exactly one row, no court overlap: " + JSON.stringify(rows));

// ---------- Change 2d: court guards ----------
// Classic court cite stays court.
({ rows, rep } = rowsOf("Brown v. Board of Education, 347 U.S. 483 (1954)."));
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].reporter, "U.S.");
assert.strictEqual(immClassifyRow(rows[0]), "court");
// Volume-8 court cite: the "8" plus "U.S." must NOT become a statute row.
({ rows, rep } = rowsOf("See 8 U.S. 100."));
assert.strictEqual(rows.length, 1, JSON.stringify(rows));
assert.strictEqual(rows[0].reporter, "U.S.", "8 U.S. 100 is a court cite, not a statute cite");
assert.strictEqual(immClassifyRow(rows[0]), "court");

// ---------- Change 2e: mixed brief, text order + correct types ----------
({ rows, rep } = rowsOf(
  "Brown v. Board of Education, 347 U.S. 483 (1954). "
  + "Matter of MERCADER, 30 I&N Dec. 185 (BIA 2026). "
  + "Relief under INA § 208 and 8 U.S.C. § 1158, and 8 CFR 208.18."));
assert.strictEqual(rows.length, 5, JSON.stringify(rows.map((r) => r.text)));
assert.deepStrictEqual(rows.map((r) => r.reporter),
  ["U.S.", "I&N Dec.", "INA", "8 U.S.C.", "8 CFR"]);
assert.deepStrictEqual(rep.rows.map((r) => r.immType),
  ["court", "bia", "statute", "statute", "regulation"]);

// ---------- Change 2f: distinct U.S.C. source line + backward compat ----------
const uscLineEn = immSourceLine("statute", I18N.en, { reporter: "8 U.S.C." });
assert.ok(uscLineEn.includes("8 U.S.C."), uscLineEn);
assert.ok(uscLineEn.includes("not in the partial"),
  "unmapped U.S.C. line must say the section is not in the partial table: " + uscLineEn);
assert.ok(!uscLineEn.includes("INA provision"),
  "U.S.C. rows must not be labelled INA provisions: " + uscLineEn);
const inaLineEn = immSourceLine("statute", I18N.en, { reporter: "INA" });
assert.ok(inaLineEn.includes("INA provision"), inaLineEn);
const legacyLine = immSourceLine("statute", I18N.en);
assert.ok(legacyLine.includes("INA provision"),
  "two-argument calls keep the shared statute line: " + legacyLine);
assert.strictEqual(I18N.en.immSourceUsc, uscLineEn);
assert.ok(!/[\u4e00-\u9fff]/.test(I18N.es.immSourceUsc),
  "Spanish U.S.C. line must contain no Chinese characters");
assert.ok(I18N.zh.immSourceUsc.includes("8 U.S.C."));

console.log("immigration U.S.C. tests passed");
