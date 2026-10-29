// Node test for Phase 4A analytics instrumentation in ground.js.
// No network, no DOM. Run: node tests/analytics.js
// Guarantees: event names come only from one fixed list, every event
// call passes a quoted literal from that list, and the single
// GoatCounter count call forwards only the validated name — never
// draft text, claim text, paper titles, or any user input.
'use strict';
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "ground.js"), "utf8");
const EXPECTED = ["papers-check", "papers-references-export", "papers-claim-mark", "papers-review-complete", "papers-tool-link"];
const analyticsDoc = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "analytics.md"), "utf8");
for (const name of EXPECTED) {
  assert.ok(analyticsDoc.includes("`" + name + "`"), "docs/analytics.md missing " + name);
}

const listMatch = src.match(/const VP_EVENTS = \[([^\]]*)\]/);
assert.ok(listMatch, "VP_EVENTS list must be present");
const listed = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual([...listed].sort(), [...EXPECTED].sort(),
  "VP_EVENTS must equal the documented event list exactly");

const calls = [];
for (const line of src.split("\n")) {
  if (line.includes("function vpCount")) continue;
  const m = line.match(/vpCount\(([^)]*)\)/);
  if (m) calls.push(m[1].trim());
}
assert.ok(calls.length >= 5, "expected at least 5 vpCount call sites, got " + calls.length);
for (const arg of calls) {
  const lit = arg.match(/^"([^"]+)"$/);
  assert.ok(lit, "vpCount argument must be a string literal, got: " + arg);
  assert.ok(EXPECTED.includes(lit[1]), "vpCount argument must be in VP_EVENTS, got: " + lit[1]);
}

assert.strictEqual((src.match(/\.count\(/g) || []).length, 1,
  "exactly one .count call site (inside vpCount)");
assert.ok(/gc\.count\(\{ path: name, event: true \}\)/.test(src),
  "count must forward only the validated fixed name");
assert.ok(!/goatcounter\.count/.test(src), "no direct window.goatcounter.count call allowed");
console.log("papers analytics tests passed");
