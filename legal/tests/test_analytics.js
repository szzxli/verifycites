// Node test for Phase 4A analytics instrumentation in web/app.js.
// No network, no DOM. Run: node web/tests/test_analytics.js
// Guarantees: event names come only from one fixed list, every event
// call passes a quoted literal from that list, and the single
// GoatCounter count call forwards only the validated name — never
// citation text, brief content, case names, or any user input.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const EXPECTED = ["legal-extract", "legal-report-download", "legal-human-review-set", "legal-reverify"];

const listMatch = src.match(/var VC_EVENTS = \[([^\]]*)\]/);
assert.ok(listMatch, "VC_EVENTS list must be present");
const listed = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual([...listed].sort(), [...EXPECTED].sort(),
  "VC_EVENTS must equal the documented event list exactly");

const calls = [];
for (const line of src.split("\n")) {
  if (line.includes("function vcCount")) continue;
  const m = line.match(/vcCount\(([^)]*)\)/);
  if (m) calls.push(m[1].trim());
}
assert.ok(calls.length >= 6, "expected at least 6 vcCount call sites, got " + calls.length);
for (const arg of calls) {
  const lit = arg.match(/^"([^"]+)"$/);
  assert.ok(lit, "vcCount argument must be a string literal, got: " + arg);
  assert.ok(EXPECTED.includes(lit[1]), "vcCount argument must be in VC_EVENTS, got: " + lit[1]);
}

assert.strictEqual((src.match(/\.count\(/g) || []).length, 1,
  "exactly one .count call site (inside vcCount)");
assert.ok(/gc\.count\(\{ path: name, event: true \}\)/.test(src),
  "count must forward only the validated fixed name");
assert.ok(!/goatcounter\.count/.test(src), "no direct window.goatcounter.count call allowed");
console.log("web analytics tests passed");
