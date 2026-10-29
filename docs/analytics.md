# Event analytics (Phase 4A) — design note

Status: implemented locally, **not yet verified against the GoatCounter
dashboard**. Everything below describes what the code sends and what it
deliberately does not send. No dashboard numbers are claimed here.

## What already existed

Analytics before this change was GoatCounter **page views only**: one
script tag per page (`data-goatcounter="https://szzxli.goatcounter.com/count"`,
script from `gc.zgo.at`), szzxli account, exactly once per page. No new
script tags, fonts, or trackers were added by Phase 4A — the event calls
reuse that same script.

## How an event is sent

Each app has one guarded helper and one fixed list, and the list is the
single enforcement point:

- Legal app (`legal/app.js`): `VC_EVENTS` + `vcCount(name)`.
- Papers app (`papers/ground.js`): `VP_EVENTS` + `vpCount(name)`.

The helper only fires when the name is in its list, only when
`window.goatcounter.count` exists, and never throws: if GoatCounter is
blocked (ad blocker, offline, script failed to load), the call is a
silent no-op and the tool keeps working. The call shape is
`goatcounter.count({ path: <fixed event name>, event: true })`.

**Nothing else may call GoatCounter.** There is exactly one `.count`
call site per app, inside its helper. Tests enforce this
(`legal/tests/test_analytics.js`, `papers/tests/analytics.js`): the
list must match the dictionary below exactly, every call site must pass
a quoted literal from the list, and no direct
`window.goatcounter.count` call may exist.

## Event dictionary

| Event name | Trigger (counted once per…) | What is counted | Explicitly NOT sent |
|---|---|---|---|
| `legal-extract` | User runs an extraction with non-empty input — the Extract path (`check()`). File upload counts through `check()`. This is the legal check-run event. | One extract invocation. | Citation text, brief content, case names, years, the query, the language. Empty-input clicks are not counted. |
| `legal-report-download` | User downloads the citation health report, Markdown or HTML (`downloadReportMd()` / `downloadReportHtml()`), with a report present. This is the legal copy/export-report event. | One report download. | Report contents, rows, human notes, counts. Downloads blocked by the no-report guard are not counted. |
| `legal-human-review-set` | User changes a human-review status or note in the report table (`onHumanReviewChange()`), and the change is saved. | One saved human-review change. | The status value itself is NOT sent as a dimension — the event carries only the fixed name. No citation text, no note text. |
| `legal-reverify` | User re-verifies a row and the extractor produces a changed row (`onReverify()`, `out.changed` true). | One completed re-verify. | Old/new citation text, flags, labels. Failed re-verifies (extractor finds nothing) are not counted. |
| `legal-news-click` | User clicks a citation-integrity news item link (`renderLegalNews()` in `legal/news.js`). | One news-item click. | Case name, court, date, URL, the search query. |
| `legal-review-complete` | The hand-check count for the current report reaches every row (`onHumanReviewChange()`, checked count was below N and is now equal to N, N > 0). | One completion of the current report. | Which rows, citation text, notes, the report hash. |
| `legal-bia-search` | User submits a BIA precedent search with at least one usable keyword (`runBiaSearch()` in `legal/bia.js`). Branch prototype (#47), not deployed. | One search submission. | The keywords, the query, result count, case names, citations, the language. Empty or stopword-only submissions are not counted. |
| `papers-check` | A papers check run completes and its report is rendered (`initGround()` button handler, after `renderReport`). The 30-second demo counts through the same handler. This is the papers check-run event. | One completed check run. | Draft text, claims, reference entries, titles, authors, DOIs, labels, results. Failed runs (thrown errors) are not counted. |
| `papers-references-export` | User clicks Export BibTeX with a non-empty export (`exp-bib` handler, after the download click). This is the papers copy/export event. | One references export. | The BibTeX content, entry count, DOIs. Empty exports ("Nothing to export") are not counted. |
| `papers-claim-mark` | User toggles Checked by hand on a claim in the papers report (`bindPapersHandcheck()`). | One toggle. | Claim text, project id, the checked value. |
| `papers-review-complete` | Every claim in the current papers report is marked checked by hand (the toggle that moves the count from below N to N, N > 0). | One completion of that report. | Claim text, project id. |
| `papers-tool-link` | User clicks a hero tool link on the papers page (`a.hero-tool-link` in `initGround()`). | One hero-link click. | Which section, draft text. |

Deliberately NOT instrumented: clipboard copies (legal Markdown export,
papers DOI list), the legal JSON export, language switches, sample
loading, and file-upload clicks as separate events (upload counts only
via the extract it triggers). The daily briefing and the opinion
translation viewer are not on the page.
Adding any of these needs a dictionary entry first, then a list entry,
then a call site — in that order.

## What is never sent, in any event

No citation text, brief content, case names, paper titles, authors,
DOIs, identifiers, query strings, notes, or any other user input or
free text. An event carries only its fixed name. This is a stronger
rule than GoatCounter's own privacy posture (cookie-free, no personal
data): even the aggregate content of what was checked stays in the
browser.

## GoatCounter's known limits (read before trusting a number)

- **Page-view heritage.** GoatCounter is built for page views; events
  are a secondary feature. Event counts are path-counted tallies, not
  a full analytics pipeline.
- **Limited attributes.** An event has a name and (at most) a path;
  there is no per-event dimension for outcome, label, language, or
  device. That is why `legal-human-review-set` cannot tell you which
  status was set, and why no event can tell you whether a check found
  anything. Do not try to recover those dimensions by encoding them
  into event names — that would break the fixed-list rule.
- **No funnel, no session.** Counts cannot be joined into "user did X
  then Y", and cannot be deduplicated per visitor. A single person
  clicking Extract ten times counts ten times.
- **Blocked traffic is invisible.** Users with blockers, and any
  failure to load `count.js`, produce no events at all. Counts are a
  lower bound on usage, and the undercount is unknowable from inside
  GoatCounter.
- **Dashboard verification pending.** The dashboard view for these
  events was never opened in this environment, and the exact grouping
  of `event: true` calls in the dashboard UI is unverified. Before
  quoting any event number externally, open the GoatCounter dashboard
  for the szzxli account, confirm each dictionary name appears as
  expected, and only then treat the counts as real.

## How to read the counts (without over-claiming)

- Counts are **usage signals only**: how often a feature is exercised.
  They are never accuracy, quality, correctness, or user-satisfaction
  measures. A rising `papers-check` count does not mean checks are
  getting better; a falling `legal-reverify` count does not mean
  fewer errors.
- Compare counts only within the same event over time, and only as
  rough direction. Cross-event comparisons ("more downloads than
  extracts") are meaningless because triggers differ (downloads
  require a report; extracts do not) and because blocked traffic
  affects pages unevenly.
- Never present a count as "users" or "lawyers" or "papers checked":
  the unit is invocations, not people and not documents. `papers-check`
  counts runs, and one run can cover any number of claims.
- If a count is zero, the first hypothesis is instrumentation or
  dashboard grouping, not "nobody uses it" — check the call site and
  the dashboard before concluding anything.

## Remaining verification (for the parent, not done here)

1. DOM click-through: exercise each trigger in a real browser
   (Extract, both report downloads, a human-review change, a
   successful re-verify, a papers check, a BibTeX export) and confirm
   no console errors and no behaviour change.
2. GoatCounter dashboard: confirm the dictionary event names appear with
   counts, and confirm the `event: true` grouping matches this note;
   correct this note if the dashboard shows otherwise.
3. Re-check after any GoatCounter script upgrade: the helper depends
   on `window.goatcounter.count` existing with this call shape.
