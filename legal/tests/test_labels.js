// Node test for web/labels.js. No network. Run: node web/tests/test_labels.js
const assert = require("assert");
const path = require("path");
const { LABELS, NEXT_ACTION } = require("../labels.js");
for (const label of ["VERIFIED", "CITED", "AMBIGUOUS", "MISMATCH", "NOT_FOUND",
                     "INVALID_REPORTER", "RATE_LIMITED", "NOT_CHECKED"]) {
  assert.ok(LABELS[label], label);
  assert.ok(NEXT_ACTION[label], label);
}
assert.ok(!/fabricated|fake|hallucinated/i.test(JSON.stringify(LABELS)),
  "labels must never use fabricated/fake/hallucinated wording");
console.log("web labels tests passed");
