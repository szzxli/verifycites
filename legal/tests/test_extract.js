// Node test for web/extract.js. No network. Run: node web/tests/test_extract.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
// Load extract.js source and eval the REPORTERS block + function in this context.
const src = fs.readFileSync(path.join(__dirname, "..", "extract.js"), "utf8");
const fnSrc = src.replace(/if \(typeof module[\s\S]*$/, "");
eval(fnSrc); // defines REPORTERS, extractCitations
assert.ok(Array.isArray(REPORTERS) && REPORTERS.length >= 10, "reporters table present");
const cases = extractCitations(
  "Obergefell v. Hodges, 576 U.S. 644 (2015). See also 616 S.W.3d 389 and 718 F. App'x 84.");
assert.strictEqual(cases.length, 3, JSON.stringify(cases));
assert.strictEqual(cases[0].text, "576 U.S. 644");
assert.strictEqual(cases[0].caseName, "Obergefell v. Hodges");
assert.strictEqual(cases[0].year, "2015");
assert.strictEqual(cases[0].manualUrl, "https://www.courtlistener.com/c/us/576/644/");
assert.strictEqual(cases[1].manualUrl, "https://www.courtlistener.com/c/sw3d/616/389/");
assert.strictEqual(cases[2].manualUrl, "https://www.courtlistener.com/c/f-appx/718/84/");
const signal = extractCitations("See Brown v. Board of Education, 347 U.S. 483 (1954).");
assert.strictEqual(signal[0].caseName, "Brown v. Board of Education");

// A year counts only inside this citation's own parenthetical. A "(YYYY)"
// that belongs to the next citation, even within a short lookahead, is not
// borrowed — the first cite stays year-less.
const borrowed = extractCitations(
  "Smith v. Jones, 123 F.3d 456. Roe v. Wade, 410 U.S. 113 (1973).");
assert.strictEqual(borrowed.length, 2, JSON.stringify(borrowed));
assert.strictEqual(borrowed[0].text, "123 F.3d 456");
assert.strictEqual(borrowed[0].caseName, "Smith v. Jones");
assert.strictEqual(borrowed[0].year, null);
assert.strictEqual(borrowed[1].text, "410 U.S. 113");
assert.strictEqual(borrowed[1].caseName, "Roe v. Wade");
assert.strictEqual(borrowed[1].year, "1973");
const ownYear = extractCitations(
  "Smith v. Jones, 123 F.3d 456 (1998). Roe v. Wade, 410 U.S. 113 (1973).");
assert.strictEqual(ownYear[0].year, "1998", "own parenthetical, not the next cite");
assert.strictEqual(ownYear[1].year, "1973");
const courtYear = extractCitations("Hunt v. Smith, 670 S.W.2d 248 (Ky. App. 1984).");
assert.strictEqual(courtYear[0].caseName, "Hunt v. Smith");
assert.strictEqual(courtYear[0].year, "1984", "court-and-year parenthetical");
const pinYear = extractCitations("Obergefell v. Hodges, 576 U.S. 644, 650 (2015).");
assert.strictEqual(pinYear[0].year, "2015", "year after a pin cite");
assert.strictEqual(pinYear[0].pinCite, "650");
const pinRangeYear = extractCitations("Brown v. Board of Education, 347 U.S. 483, 490-492 (1954).");
assert.strictEqual(pinRangeYear[0].year, "1954");
assert.strictEqual(pinRangeYear[0].pinCite, "490–492");
const pinEnDash = extractCitations("Brown v. Board of Education, 347 U.S. 483, 490\u2013492 (1954).");
assert.strictEqual(pinEnDash[0].year, "1954");
assert.strictEqual(pinEnDash[0].pinCite, "490–492");
const noteYear = extractCitations("Smith v. Jones, 123 F.3d 456, 460 n.2 (1999).");
assert.strictEqual(noteYear[0].caseName, "Smith v. Jones");
assert.strictEqual(noteYear[0].year, "1999", "year after a footnote pin");
assert.strictEqual(noteYear[0].pinCite, "460");
const starYear = extractCitations("Smith v. Jones, 123 F.3d 456, *7 (1999).");
assert.strictEqual(starYear[0].year, "1999", "year after a star-page pin");

// Signal, transition, and sentence-start words are not part of the case name.
const prefixes = [
  ["Also Brown v. Board of Education, 347 U.S. 483 (1954).", "Brown v. Board of Education", "1954"],
  ["Again Roe v. Wade, 410 U.S. 113 (1973).", "Roe v. Wade", "1973"],
  ["But Smith v. Jones, 123 F.3d 456 (2020).", "Smith v. Jones", "2020"],
  ["Accord Smith v. Jones, 123 F.3d 456 (2020).", "Smith v. Jones", "2020"],
  ["See also Brown v. Board of Education, 347 U.S. 483 (1954).", "Brown v. Board of Education", "1954"],
  ["Cf. Obergefell v. Hodges, 576 U.S. 644 (2015).", "Obergefell v. Hodges", "2015"],
  ["Compare Brown v. Board of Education, 347 U.S. 483 (1954).", "Brown v. Board of Education", "1954"],
  ["In Brown v. Board of Education, 347 U.S. 483 (1954).", "Brown v. Board of Education", "1954"],
  ["After Miranda v. Arizona, 384 U.S. 436 (1966).", "Miranda v. Arizona", "1966"],
  ["Under Chevron v. Natural Resources Defense Council, 467 U.S. 837 (1984).", "Chevron v. Natural Resources Defense Council", "1984"],
  ["However, Brown v. Board of Education, 347 U.S. 483 (1954).", "Brown v. Board of Education", "1954"],
  ["In United States v. Nixon, 418 U.S. 683 (1974).", "United States v. Nixon", "1974"],
  ["Also Board of Regents v. Roth, 408 U.S. 564 (1972).", "Board of Regents v. Roth", "1972"],
];
for (const [text, name, year] of prefixes) {
  const found = extractCitations(text);
  assert.strictEqual(found.length, 1, text + " -> " + JSON.stringify(found));
  assert.strictEqual(found[0].caseName, name, text + " -> " + found[0].caseName);
  assert.strictEqual(found[0].year, year, text);
}

// Multi-word parties, and names that only begin like a signal word, stay whole.
const guards = [
  ["United States v. Nixon, 418 U.S. 683 (1974).", "United States v. Nixon", "1974"],
  ["Board of Regents v. Roth, 408 U.S. 564 (1972).", "Board of Regents v. Roth", "1972"],
  ["Nixon v. United States, 506 U.S. 224 (1993).", "Nixon v. United States", "1993"],
  ["Roth v. Board of Regents, 408 U.S. 564 (1972).", "Roth v. Board of Regents", "1972"],
  ["On Lee v. United States, 343 U.S. 747 (1952).", "On Lee v. United States", "1952"],
  ["Butler v. Smith, 123 F.3d 456 (1999).", "Butler v. Smith", "1999"],
  ["Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986).", "Anderson v. Liberty Lobby, Inc.", "1986"],
  ["Seeley v. Kaiser, 123 F.3d 456 (1999).", "Seeley v. Kaiser", "1999"],
  ["See v. See, 64 F.3d 778 (1966).", "See v. See", "1966"],
  ["Indiana v. Smith, 123 F.3d 456 (1999).", "Indiana v. Smith", "1999"],
  ["Forbes v. Smith, 123 F.3d 456 (1999).", "Forbes v. Smith", "1999"],
  ["Ashcroft v. Iqbal, 556 U.S. 662 (2009).", "Ashcroft v. Iqbal", "2009"],
  ["LinkCo, Inc. v. Naoyuki Akikusa, 357 F. App'x 180 (2009).", "LinkCo, Inc. v. Naoyuki Akikusa", "2009"],
  ["In the Interest of A.B. v. C.D., 123 F.3d 456 (1999).", "In the Interest of A.B. v. C.D.", "1999"],
  ["For the People v. Smith, 123 F.3d 456 (1999).", "For the People v. Smith", "1999"],
];
for (const [text, name, year] of guards) {
  const found = extractCitations(text);
  assert.strictEqual(found.length, 1, text + " -> " + JSON.stringify(found));
  assert.strictEqual(found[0].caseName, name, text + " -> " + (found[0] && found[0].caseName));
  assert.strictEqual(found[0].year, year, text);
}

assert.ok(!/fetch\(|XMLHttpRequest/.test(src), "extract.js must not call the network");
console.log("web extract tests passed");
