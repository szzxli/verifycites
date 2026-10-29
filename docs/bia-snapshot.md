# BIA precedent snapshot: design, gates, verification

Branch package for evaluation. This document states what the package
is, why it is worth doing, what was already verified, what it cannot
claim, and how it is verified before anything goes live. Nothing here
is a promise that a decision is valid, current, or supports an
argument.

## 1. Significance (why this exists)

Today a lawyer checking one immigration brief opens a different
official system for each citation type (EOIR, USCIS, State, Federal
Register, federal courts, OLRC, eCFR — twelve systems, no shared API,
identifier, or currency signal). Two pains follow:

- Fragmentation: the lawyer must first guess which system holds the
  citation, then open it by hand.
- Matching: the lawyer's real question is usually "which precedents
  apply to facts/issues like these?" About 4,250 BIA interim decisions
  exist. Nobody memorizes them; without an index, matching runs on
  experience and luck.

The snapshot turns that into one-click search: the latest cited cases
across sources, from one index. The stickiness follows from the use
case: lawyers keep the tool open on their computer, and at intake —
whether to take a case, whether it is winnable — they pull citations
and judge for themselves.

What this is NOT: it is "find", not "judge". The tool never outputs a
success-rate percentage (no outcome dataset supports one), never says
a decision is "still good law" (overruling data does not exist in any
source used here), and never judges whether a case supports an
argument. The lawyer judges; the index only helps find, completely,
and fast. Static snapshot entries stay visible under results with
official links, so users cross-check against official provisions
themselves.

## 2. What the package builds

- `scripts/bia_snapshot_poll.py` — the poller. Modes: probe (dry run),
  backfill (one volume group), poll (daily freshness: index page plus
  the current volume page only).
- `.github/workflows/bia-snapshot-poll.yml` — daily schedule plus
  manual dispatch (mode / volume_group / limit). Probe mode never
  commits. No secrets, no keys, TLS verified.
- Published files (static, same origin, read by the page):
  - `data/bia-index.json` — metadata only per decision (ID, name,
    I&N Dec. citation, year, body BIA/AG, volume, official PDF URL,
    first_seen immutable, fetch time, sha256, text length,
    extraction status). Never full decision text.
  - `data/bia-search/volNN.json` — per-volume inverted index
    (term -> decision IDs) for keyword/issue search.
  - `data/bia-manifest.json` — the verification record: per-volume
    expected vs found counts, missing IDs, extraction ok/short/
    failed, gaps, error text, timestamps.

INA and 8 CFR already have pollers in this repo
(`imm-ina-mapping-poll`, `imm8cfr-poll`); this package is BIA only.
AAO non-precedent stays manual links (no API, no enumeration,
court-ordered posting gap, and non-precedent decisions are not
citable authority).

## 3. Gates already passed (2026-10-28, verified live)

- robots.txt: justice.gov does not disallow /eoir/ paths;
  Crawl-delay: 10. uscode.house.gov robots.txt has no general
  prohibition (only Slurp is disallowed).
- Terms: the DOJ Legal Policies page states DOJ website information
  is public domain and may be copied and distributed without
  permission (citation appreciated — every entry carries source URL
  and fetch time). Seals require permission; this package uses none.
  House terms likewise state government-produced materials are not
  copyright protected. eCFR programmatic access is limited to the
  developer APIs (this package does not touch eCFR at all).
- Link shapes verified live: volume pages at /eoir/volume-NN;
  decision PDFs at /eoir/media/<number>/dl?inline (legacy PDFs under
  /sites/default/files/eoir/legacy/). Latest volume-30 entries seen
  live: ID 4266 N-L-U-, 30 I&N Dec. 195 (BIA 2026); ID 4265 MATA
  RODRIGUEZ, 30 I&N Dec. 191; ID 4264 MERCADER, 30 I&N Dec. 185.
  Page display omits the "Matter of" prefix; the indexer prepends it.
- Counts reconciled: volumes 08-29 hold about 3,300 decisions;
  volumes 01-07 about 900 more; total about 4,250.

## 4. Honesty limits (must survive into the page)

- Existence + citation + official link only. Never "still good law",
  never "currently in effect", never a validity or support verdict.
- Volumes 01-07 are NOT enumerable from volume pages (they live in
  cumulative-index PDFs). They are a recorded phase-2 gap; the script
  refuses them upfront rather than silently skipping them.
- Short extractions (under 500 characters, often scanned PDFs) are
  gaps, not index entries. Per-PDF failures are listed in
  manifest.failed and re-attempted by the next daily poll.
- A failed or blocked run writes nothing: previous published data is
  preserved. HTTP 403/429 stops the run immediately, no retry, no
  workaround.

## 5. Verification stages (all must pass before go-live)

1. Probe (CI, no commit): page structure, citation/link pairing
   counts, sample PDF extraction. Pairing mismatch or zero usable
   sample texts fails the probe.
2. Backfill, one group per dispatch: 08-10, 11-13, 14-19, 20-25,
   26-30. Groups are sized to finish inside one Actions run at
   10s/request (job cap is 6 hours). A group that exits 1 is re-run
   whole (no mid-group checkpoint in v1).
3. Count reconciliation: per-volume found vs expected counts and
   missing-ID lists from the manifest, reviewed, not assumed.
4. Sampled live cross-checks: a sample of index entries opened
   against official PDFs by hand; any mismatch blocks go-live.
5. Consensus + final review: Grok evaluation and Noor live review of
   the published files on the real site before the page reads them.

## 6. Sequencing and open items

- Noor builds this branch first. Grok evaluates significance and
  shortcomings (that is the point of this package: mutual
  shortcoming-finding, not blind merging) and picks up
  update/integration and CI dispatch when tokens allow. No rush.
- Go-live only after stage 5 (consensus + Noor live review).
- Open, separate from this package: the push channel for
  search-type-based news (mail subscription vs browser push vs
  on-page related news) and where search history lives (browser-local
  vs account). Those decisions do not block the snapshot index.
