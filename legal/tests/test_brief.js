"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { DAILY_BRIEF_NOTE, DAILY_BRIEF_EMPTY, dailyBriefView, dailyBriefHref, dailyBriefCutoffDate } = require("../brief.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const briefSrc = fs.readFileSync(path.join(__dirname, "..", "brief.js"), "utf8");

function dataWith(items, metaOverrides) {
  const meta = Object.assign({ last_poll: "2026-11-04T23:18:35Z", sources: [{ name: "CA9", status: "ok" }] }, metaOverrides || {});
  return { meta: meta, items: items };
}

function item(overrides) {
  return Object.assign({ kind: "legal", source: "CA9", title_or_case_name: "Smith v. Jones", date: "2026-11-04", first_seen: "2026-11-04T10:00:00Z", url: "https://www.ca9.uscourts.gov/example" }, overrides || {});
}

// Verbatim note, no data-i18n on any brief element, placement, script order, closed details.
assert.strictEqual(DAILY_BRIEF_NOTE, "New official-source items from the last 24 hours. Inclusion does not mean a court found misconduct. Not legal advice.");
assert.ok(html.includes(DAILY_BRIEF_NOTE), "index.html must contain the verbatim daily brief note");
const briefAt = html.indexOf('id="daily-brief"');
assert.ok(briefAt > -1, "daily-brief section must exist");
const briefEnd = html.indexOf("</section>", briefAt);
assert.ok(briefEnd > briefAt, "daily-brief section must close");
const briefSection = html.slice(briefAt, briefEnd);
assert.ok(!briefSection.includes("data-i18n"), "daily brief section must not carry data-i18n");
const noteAt = html.indexOf('id="daily-brief-note"');
assert.ok(noteAt > briefAt && noteAt < briefEnd, "daily brief note must be inside the daily brief section");
assert.ok(!html.slice(noteAt - 80, noteAt + 40).includes("data-i18n"), "daily brief note must not carry data-i18n");
assert.ok(html.includes('<details id="daily-brief-details">'), "daily brief details must stay closed by default");
assert.ok(!/<details[^>]*\bopen\b/.test(briefSection), "daily brief details must not have an open attribute");
const checkerAt = html.indexOf('id="checker"');
const newsAt = html.indexOf('id="legal-news"');
const courtAt = html.indexOf('id="court-ai-orders"');
assert.ok(checkerAt > -1 && newsAt > -1 && courtAt > -1, "checker, legal-news and court-ai-orders must exist");
assert.ok(checkerAt < newsAt && newsAt < briefAt && briefAt < courtAt, "daily brief must sit below checker, after legal-news and before court-ai-orders");
const appAt = html.indexOf('<script src="app.js"></script>');
const briefScriptAt = html.indexOf('<script src="brief.js"></script>');
assert.ok(appAt > -1 && briefScriptAt > appAt, "brief.js must load after app.js so tier1Load is available");

// No own network call: the shared tier1Load() from app.js is the only loader.
assert.ok(briefSrc.includes("tier1Load"), "brief.js must use the shared tier1Load()");
assert.ok(!/fetch\(/.test(briefSrc), "brief.js must not call fetch itself");
assert.ok(!briefSrc.includes("XMLHttpRequest"), "brief.js must not use XMLHttpRequest itself");

// 24h window, including the cutoff-date boundary, dateless exclusion, legal-only.
assert.strictEqual(dailyBriefCutoffDate("2026-11-04T23:18:35Z"), "2026-11-03");
const dateless = item({ title_or_case_name: "Dateless case" });
delete dateless.date;
const windowView = dailyBriefView(dataWith([
  item({ title_or_case_name: "On cutoff", date: "2026-11-03" }),
  item({ title_or_case_name: "Before cutoff", date: "2026-11-02" }),
  dateless,
  item({ kind: "paper", title_or_case_name: "Paper item", date: "2026-11-04" })
]));
assert.deepStrictEqual(windowView.items.map(function (row) { return row.title_or_case_name; }), ["On cutoff"]);
assert.strictEqual(windowView.updatedText, "Last poll: 2026-11-04T23:18:35Z");
assert.strictEqual(windowView.stale, false);

// Same-case double-docket dedupe: newest date wins; a date tie keeps the earliest array position.
const dedupeView = dailyBriefView(dataWith([
  item({ title_or_case_name: "Smith v. Jones, et al.", date: "2026-11-03", url: "https://www.ca9.uscourts.gov/old" }),
  item({ title_or_case_name: "SMITH v. JONES", date: "2026-11-04", url: "https://www.ca9.uscourts.gov/new" }),
  item({ title_or_case_name: "Other case", date: "2026-11-04", url: "https://www.ca9.uscourts.gov/other" }),
  item({ title_or_case_name: "Other case", date: "2026-11-04", url: "https://www.ca9.uscourts.gov/other-duplicate" })
]));
assert.strictEqual(dedupeView.items.length, 2);
assert.strictEqual(dedupeView.items[0].url, "https://www.ca9.uscourts.gov/new");
assert.strictEqual(dedupeView.items[1].url, "https://www.ca9.uscourts.gov/other");

// Sort: date descending, then first_seen descending, then array order.
const sortedView = dailyBriefView(dataWith([
  item({ title_or_case_name: "Older date", date: "2026-11-03", first_seen: "2026-11-03T09:00:00Z" }),
  item({ title_or_case_name: "Earlier seen", date: "2026-11-04", first_seen: "2026-11-04T08:00:00Z" }),
  item({ title_or_case_name: "Later seen", date: "2026-11-04", first_seen: "2026-11-04T10:00:00Z" }),
  item({ title_or_case_name: "First tied", date: "2026-11-04", first_seen: "2026-11-04T10:00:00Z" }),
  item({ title_or_case_name: "Second tied", date: "2026-11-04", first_seen: "2026-11-04T10:00:00Z" })
]));
assert.deepStrictEqual(sortedView.items.map(function (row) { return row.title_or_case_name; }), ["Later seen", "First tied", "Second tied", "Earlier seen", "Older date"]);

// 10-row cap.
const many = [];
for (let i = 0; i < 12; i++) many.push(item({ title_or_case_name: "Case " + i, date: "2026-11-04" }));
assert.strictEqual(dailyBriefView(dataWith(many)).items.length, 10);

// Empty state, exactly, with no fallback content.
const emptyView = dailyBriefView(dataWith([
  item({ title_or_case_name: "Too old", date: "2026-11-01" }),
  item({ kind: "paper", title_or_case_name: "Paper only", date: "2026-11-04" })
]));
assert.strictEqual(emptyView.items.length, 0);
assert.strictEqual(emptyView.emptyText, "No new official-source items in the last 24h");
assert.strictEqual(DAILY_BRIEF_EMPTY, "No new official-source items in the last 24h");

// Stale source: still render from the last good data.
const staleView = dailyBriefView(dataWith([item()], { sources: [{ name: "CA9", status: "error" }] }));
assert.strictEqual(staleView.stale, true);
assert.ok(staleView.staleText.includes("last good data"), "stale note must say the list is from the last good data");
assert.strictEqual(staleView.items.length, 1);

// Fetch failure / missing data: empty state, never a throw.
const failureView = dailyBriefView(null);
assert.strictEqual(failureView.items.length, 0);
assert.strictEqual(failureView.emptyText, "No new official-source items in the last 24h");

// Row links use only index URLs; non-web URLs are dropped.
assert.strictEqual(dailyBriefHref("https://www.ca9.uscourts.gov/example"), "https://www.ca9.uscourts.gov/example");
assert.strictEqual(dailyBriefHref("javascript:alert(1)"), "");

console.log("test_brief passed");
