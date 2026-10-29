// News block: English note, stale vs fresh, same-origin read, max 10.
// Run: node legal/tests/test_news.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { LEGAL_NEWS_NOTE, legalNewsView, legalNewsHref } = require("../news.js");

const NOTE = "Court opinions whose text matches a fixed search for AI-generated or nonexistent citations. Inclusion does not mean a court found misconduct. Not legal advice.";
assert.strictEqual(LEGAL_NEWS_NOTE, NOTE);

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(html.includes(NOTE), "page carries the fixed note verbatim");
assert.ok(!/data-i18n="[^"]*"[^>]*>Court opinions whose text matches/.test(html),
  "the news note is not a translated i18n string");
const noteAt = html.indexOf('id="legal-news-note"');
const noteTag = html.slice(noteAt - 80, noteAt + 40);
assert.ok(!noteTag.includes("data-i18n"), "news note element is not data-i18n");

const checkerAt = html.indexOf('id="checker"');
const newsAt = html.indexOf('id="legal-news"');
const cliAt = html.indexOf('id="cli"');
assert.ok(checkerAt > 0 && newsAt > checkerAt && cliAt > newsAt,
  "news sits below the citation tool and report, and the tool comes first");
assert.ok(/<details id="legal-news-details" open>/.test(html), "news is expanded by default");
assert.ok(!/location\.hash\s*=\s*["']#legal-news/.test(html), "default path does not jump to news");

const newsSrc = fs.readFileSync(path.join(__dirname, "..", "news.js"), "utf8");
assert.ok(newsSrc.includes('fetch("../data/legal-news.json"'), "news reads the same-origin JSON");
assert.ok(!/fetch\(\s*["']https?:/.test(newsSrc), "news.js makes no third-party fetch");
assert.ok(!newsSrc.includes("courtlistener.com/api"), "news.js does not call the CourtListener API");

const fresh = legalNewsView({
  status: "ok",
  updated_utc: "2026-10-29T03:00:00Z",
  last_success_utc: "2026-10-29T03:00:00Z",
  items: [{ date: "2026-10-02", court: "Nebraska Supreme Court", case_name: "Shannon v. Shannon", url: "https://www.courtlistener.com/opinion/1/" }],
});
assert.strictEqual(fresh.stale, false);
assert.strictEqual(fresh.updated, "2026-10-29T03:00:00Z");
assert.strictEqual(fresh.note, NOTE);
assert.strictEqual(fresh.items.length, 1);

const stale = legalNewsView({
  status: "error",
  updated_utc: "2026-10-29T04:00:00Z",
  last_success_utc: "2026-10-01T00:00:00Z",
  items: [{ case_name: "Kept", url: "https://www.courtlistener.com/opinion/2/", date: "2026-10-01", court: "X" }],
});
assert.strictEqual(stale.stale, true);
assert.strictEqual(stale.updated, "2026-10-01T00:00:00Z");
assert.ok(stale.staleText.includes("2026-10-01T00:00:00Z"));
assert.ok(/last successful update/i.test(stale.staleText));
assert.ok(!/just now|updated today/i.test(stale.staleText));
assert.strictEqual(stale.items.length, 1);

const many = [];
for (let i = 0; i < 15; i++) many.push({ case_name: "C" + i, url: "https://www.courtlistener.com/opinion/" + i + "/" });
assert.strictEqual(legalNewsView({ status: "ok", updated_utc: "t", last_success_utc: "t", items: many }).items.length, 10);

assert.strictEqual(legalNewsHref("https://www.courtlistener.com/opinion/1/"), "https://www.courtlistener.com/opinion/1/");
assert.strictEqual(legalNewsHref("https://evil.example/opinion"), "");
assert.strictEqual(legalNewsHref("javascript:alert(1)"), "");

console.log("legal news tests passed");
