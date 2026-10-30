// Court orders on AI use in filings: placement, fixed note, scope, hand-set
// review date, official sources only, static table matches the JSON.
// Run: node legal/tests/test_court_orders.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { courtOrdersIsStale, COURT_ORDERS_STALE_DAYS } = require("../court-orders.js");

const NOTE = "A list of court orders about AI use in filings, maintained by hand. It may be incomplete or out of date. Check the official source. Not legal advice.";
const root = path.join(__dirname, "..", "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "court-ai-orders.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "legal", "index.html"), "utf8");

assert.strictEqual(data.note, NOTE);
assert.ok(html.includes(NOTE), "page carries the fixed note verbatim");
assert.ok(/^Federal courts only/.test(data.scope), "scope says federal courts only");
assert.ok(html.includes(data.scope), "scope is shown on the page");
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(data.last_reviewed), "last_reviewed is a plain date");
assert.ok(html.includes("Last reviewed: <time datetime=\"" + data.last_reviewed + "\">"), "page shows last_reviewed");
assert.ok(/set by hand only/.test(data._comment) && /collapsed/.test(data._comment), "data file says the date is hand-set and the table collapses when reviews stop");

const newsAt = html.indexOf('id="legal-news"');
const ordersAt = html.indexOf('id="court-ai-orders"');
const cliAt = html.indexOf('id="cli"');
assert.ok(newsAt > 0 && ordersAt > newsAt && cliAt > ordersAt, "orders table sits right below the news block");

assert.ok(data.rows.length >= 8 && data.rows.length <= 15, "8 to 15 rows");
for (const r of data.rows) {
  for (const k of ["court", "judge", "effective", "summary", "source"]) assert.ok(r[k], "row has " + k);
  const host = new URL(r.source).hostname;
  assert.ok(r.source.startsWith("https://") && host.endsWith(".uscourts.gov"), "official source: " + r.source);
  assert.ok(html.includes('href="' + r.source.replace(/&/g, "&amp;") + '"'), "row source is on the page");
  assert.ok(!/%|percent|reliability|success rate|pro se users|you should/i.test(r.summary), "neutral summary: " + r.court);
}
assert.strictEqual((html.match(/<td data-label="Court">/g) || []).length, data.rows.length, "static rows match the JSON");

const src = fs.readFileSync(path.join(root, "legal", "court-orders.js"), "utf8");
assert.ok(!/fetch\(|XMLHttpRequest|vcCount|goatcounter/i.test(src), "no network calls or analytics events");
assert.ok(html.includes('<script src="court-orders.js"></script>'));
assert.ok(html.includes("gc.zgo.at/count.js") && html.includes("nocount"), "GoatCounter nocount loader intact");

assert.strictEqual(COURT_ORDERS_STALE_DAYS, 21);
assert.strictEqual(courtOrdersIsStale("2026-10-30", new Date(2026, 9, 30)), false);
assert.strictEqual(courtOrdersIsStale("2026-10-30", new Date(2026, 10, 20)), false);
assert.strictEqual(courtOrdersIsStale("2026-10-30", new Date(2026, 10, 21)), true);
assert.strictEqual(courtOrdersIsStale("", new Date()), true);

console.log("test_court_orders: ok");
