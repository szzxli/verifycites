// Node tests for the Daily Legal Briefing (local-only, first version).
// No network. Run: node web/tests/test_briefing.js
const assert = require("assert");
const B = require("../briefing.js");

const prefs = {
  state: "CA", topics: ["employment"],
  cases: ["347 U.S. 483"], rules: [], deadlines: []
};
function opinion(title, snippet, date) {
  return { kind: "opinion", title, court: "cal", date, snippet,
    url: "https://www.courtlistener.com/opinion/1/", cites: [] };
}

// (a) 5-item cap: 8 rankable followed items -> exactly 5 shown.
const many = [];
for (let i = 0; i < 8; i++) {
  many.push(opinion("Case " + i + " citing 347 U.S. 483",
    "employment dispute citing 347 U.S. 483", "2026-10-2" + (i % 10)));
}
const capped = B.briefingBuild(many, prefs, "2026-10-26");
assert.strictEqual(capped.items.length, 5, "briefing cap is 5");
assert.strictEqual(capped.isSample, false);

// (b) Why-line present for every shown item; reason-less items dropped.
const mixed = [
  opinion("Unrelated case", "unrelated tax matter", "2026-10-26"),
  opinion("Followed progress", "employment case citing 347 U.S. 483", "2026-10-26"),
  opinion("Fine news", "employment fine of $50,000 imposed", "2026-10-25")
];
const built = B.briefingBuild(mixed, prefs, "2026-10-26");
assert.strictEqual(built.items.length, 2, "reason-less item must be dropped");
for (const it of built.items) assert.ok(it.why && it.why.length > 10, "why-line: " + it.title);

// (c) Deadline countdown math from a user-entered date.
assert.strictEqual(B.briefingCountdownDays("2026-11-05", "2026-10-26"), 10);
assert.strictEqual(B.briefingCountdownDays("2026-10-26", "2026-10-26"), 0);
assert.strictEqual(B.briefingCountdownDays("2026-10-20", "2026-10-26"), -6);
assert.strictEqual(B.briefingCountdownDays("2026-02-30", "2026-10-26"), null);
assert.strictEqual(B.briefingCountdownLabel(10, "zh"), "距离截止还有 10 天");
assert.strictEqual(B.briefingCountdownLabel(0, "en"), "Due today");

// (d) Ranking order: followed-case items before fines news, even when
//     the fines item is newer.
const ranked = B.briefingBuild([
  opinion("Fine news", "employment fine imposed", "2026-10-26"),
  opinion("Followed progress", "employment case citing 347 U.S. 483", "2026-10-20")
], prefs, "2026-10-26");
assert.strictEqual(ranked.items[0].bucket, "followed");
assert.strictEqual(ranked.items[1].bucket, "fines");

// (e) Sample items are labelled SAMPLE and never mixed with real items.
const withReal = B.briefingBuild(
  [opinion("Followed progress", "employment case citing 347 U.S. 483", "2026-10-26")],
  prefs, "2026-10-26");
assert.strictEqual(withReal.isSample, false);
assert.ok(withReal.items.every((it) => !it.sample), "no sample mixed with real");
const empty = B.briefingBuild([], prefs, "2026-10-26");
assert.strictEqual(empty.isSample, true);
assert.ok(empty.items.length > 0 && empty.items.every((it) => it.sample),
  "empty briefing must be all-sample");
assert.ok(empty.items.every((it) => /SAMPLE/.test(it.title)));

// (f) Preferences round-trip and clear-all (fake storage, no DOM).
const store = { _m: {}, setItem(k, v) { this._m[k] = v; },
  getItem(k) { return this._m[k] || null; }, removeItem(k) { delete this._m[k]; } };
const savedPrefs = { state: "TX", topics: ["housing"], cases: ["576 U.S. 644"],
  rules: [{ date: "2026-12-01", label: "Rule X", source: "https://example.gov/rule" }],
  deadlines: [{ date: "2026-11-05", label: "Filing", source: "https://example.gov/deadline" }] };
B.briefingSavePrefs(store, savedPrefs);
const loaded = B.briefingLoadPrefs(store);
assert.deepStrictEqual(loaded, savedPrefs);
B.briefingClearPrefs(store);
assert.strictEqual(store.getItem(B.BRIEFING_STORAGE_KEY), null);
assert.strictEqual(B.briefingLoadPrefs(store).state, "CA");

// Overview counts: followed updates, upcoming deadlines, rule items.
const ovPrefs = { state: "CA", topics: [], cases: ["347 U.S. 483"],
  rules: [{ date: "2026-12-01", label: "Rule X", source: "https://example.gov/r" }],
  deadlines: [
    { date: "2026-11-05", label: "Soon", source: "https://example.gov/d" },
    { date: "2026-10-01", label: "Past", source: "https://example.gov/d" }] };
const ov = B.briefingBuild(
  [opinion("Followed progress", "case citing 347 U.S. 483", "2026-10-26")],
  ovPrefs, "2026-10-26");
assert.strictEqual(ov.overview.followed, 1);
assert.strictEqual(ov.overview.deadlines, 1, "only upcoming deadlines counted");
assert.strictEqual(ov.overview.rules, 3, "rules + deadlines both sit in rules bucket");

// State validation: only CA/TX/FL/NY.
assert.ok(B.briefingValidState("CA") && B.briefingValidState("NY"));
assert.ok(!B.briefingValidState("WA"));
assert.strictEqual(B.briefingPrefsFromJSON(JSON.stringify({ state: "WA" })).state, "CA");

// Fetch helper: builds a CourtListener search URL (court filter + query
// terms only, never brief text) and normalises results; HTTP errors throw.
(async () => {
  let seenUrl = "";
  const stubFetch = async (url) => {
    seenUrl = url;
    return { ok: true, json: async () => ({ results: [
      { id: 9, caseName: "Stub Case", court: "cal", dateFiled: "2026-10-26T00:00:00Z",
        absolute_url: "/opinion/9/stub/", snippet: "employment fine imposed" }] }) };
  };
  const raws = await B.briefingFetchOpinions(
    { state: "CA", topics: ["employment"], cases: [] }, stubFetch);
  assert.ok(seenUrl.includes("courtlistener.com/api/rest/v4/search/"), seenUrl);
  assert.ok(seenUrl.includes("court=cal"), seenUrl);
  assert.ok(seenUrl.includes("employment"), seenUrl);
  assert.strictEqual(raws.length, 1);
  assert.strictEqual(raws[0].url, "https://www.courtlistener.com/opinion/9/stub/");
  const badFetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(
    B.briefingFetchOpinions({ state: "CA", topics: [], cases: [] }, badFetch));
  console.log("web briefing fetch-helper tests passed");
})().catch((e) => { console.error(e); process.exit(1); });

// Dated-line parsing drops invalid lines (never invents a date/source).
const parsed = B.briefingParseDatedLines(
  "2026-11-05 | Filing | https://example.gov/d\n"
  + "not-a-date | Bad | https://example.gov/d\n"
  + "2026-11-06 | No source | example.gov\n");
assert.strictEqual(parsed.length, 1);
assert.strictEqual(parsed[0].label, "Filing");

console.log("web briefing tests passed");
