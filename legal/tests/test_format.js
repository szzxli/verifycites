// Node test for standardCitation in extract.js. No network.
// Run: node legal/tests/test_format.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
// Load extract.js source and eval the REPORTERS block + functions in this
// context, same pattern as test_extract.js.
const src = fs.readFileSync(path.join(__dirname, "..", "extract.js"), "utf8");
const fnSrc = src.replace(/if \(typeof module[\s\S]*$/, "");
eval(fnSrc); // defines REPORTERS, extractCitations, standardCitation

// Full row: case name + pin cite + year.
assert.strictEqual(
  standardCitation({ caseName: "Obergefell v. Hodges", volume: "576",
    reporter: "U.S.", page: "644", pinCite: "650", year: "2015" }),
  "Obergefell v. Hodges, 576 U.S. 644, 650 (2015)");
// No case name, no pin cite.
assert.strictEqual(
  standardCitation({ caseName: null, volume: "347",
    reporter: "U.S.", page: "483", pinCite: null, year: "1954" }),
  "347 U.S. 483 (1954)");
// No year: no parenthetical is invented.
assert.strictEqual(
  standardCitation({ caseName: "Smith v. Jones", volume: "123",
    reporter: "F.3d", page: "456", pinCite: null, year: null }),
  "Smith v. Jones, 123 F.3d 456");
// Pin range keeps its en dash.
assert.strictEqual(
  standardCitation({ caseName: null, volume: "576",
    reporter: "U.S.", page: "644", pinCite: "650\u2013655", year: "2015" }),
  "576 U.S. 644, 650\u2013655 (2015)");
// End to end: extra spaces in the pasted text are normalized away,
// and nothing is added that the extractor did not find.
const rows = extractCitations("Brown v. Board of Education, 347  U.S.   483 (1954).");
assert.strictEqual(rows.length, 1, JSON.stringify(rows));
assert.strictEqual(standardCitation(rows[0]),
  "Brown v. Board of Education, 347 U.S. 483 (1954)");
console.log("test_format: ok");
