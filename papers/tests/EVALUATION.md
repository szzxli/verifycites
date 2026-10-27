# Evaluation sets — Phase 3 (trust & quality system)

Measured on 2026-10-27 from the `site-p3` tree. Legal and papers are
reported **separately — there is no blended score**. PRD-style metric
thresholds (e.g. "100% mapping accuracy", "≥95% evidence completeness")
are **suggested targets, not results**; only the numbers below were
actually run. Anything not run is listed as NOT RUN with its reason,
never as a number.

## Legal domain

- **Dataset:** synthetic fixtures in `legal/tests/test_evaluation.js`.
  Set A: 3 known citations (Brown 347 U.S. 483, Obergefell 576 U.S. 644,
  Roe 410 U.S. 113) + 2 decoy lines (a "12,000 students" line, a "page
  483" line). Set B: 6 labelled rows for structure flags (2 clean,
  1 duplicate, 1 missing-year, 1 missing-year + no-case-name,
  1 missing-year + no-case-name + unknown reporter).
- **Measured:** set A extraction — 3/3 found, 0 false positives
  (precision 3/3, recall 3/3 on this fixture set). Set B structure
  flags — 6/6 rows exactly matching their labels (no false-positive
  flags on clean rows, no missed flags on flagged rows).
- **NOT RUN — human-review agreement:** needs at least two independent
  human reviewers marking the same report rows; no such data exists in
  this repo. Human-status/machine-label separation IS covered by
  `test_report.js` (changing a human status never changes the machine
  label/category), but that is separation, not agreement.
- **NOT RUN — live CourtListener verification accuracy:** browser mode
  makes no lookup; the CLI path needs the user's own token and was not
  run in this environment.

## Papers domain

- **Dataset:** synthetic evidence objects in
  `papers/tests/evaluation.js`. Size: 8 items (matched, unverified /
  record missing, chimeric, fabricated, rate-limited, invalid DOI,
  retracted, stale) with known expected categories and identifier
  statuses.
- **Measured (renderer, not live accuracy):** display-category mapping
  8/8 (matched 3, field mismatch 2, not found 1, cannot determine 1,
  retrieval failed 1); identifier-comparison statuses 6/6 checked
  (Matches, Missing in record, Not compared, Missing in record,
  Not compared — check failed, Not compared). These measure the display
  mapping on synthetic evidence, NOT registry lookup accuracy.
- **Live-registry spot checks (run, not a benchmark):**
  `papers/tests/network.js` — 37 passed, 0 failed on 2026-10-27,
  including a real DOI resolving to CITED and genuine 404s / empty
  searches resolving to FABRICATED. This is a spot check, not a
  precision/recall benchmark: it has no labelled corpus and must not be
  quoted as an accuracy rate.
- **NOT RUN — live-registry precision/recall benchmark:** would need a
  labelled corpus of real citations plus registry quota; no such corpus
  exists in this repo.
- **NOT RUN — human-review agreement:** no human labels exist for
  papers items in this repo.

## What changed in Phase 3 that these sets cover

- Legal: check-basis section (what was checked, source, browser-local
  run time, per-item time not recorded) in the on-page report and both
  downloads; mixed reports do not invent a basis for CLI rows.
- Papers: check-basis block in the report summary (what was checked,
  registry sources, browser-local run time, per-item time not
  recorded); per-item scope line now states item time is not recorded;
  identifier status "Missing in record" is now consistent with the
  other four field rows, except RATE_LIMITED (check failed) and
  INVALID_DOI (no lookup made), which keep "Not compared" wording.
