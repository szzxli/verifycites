# Court orders on AI use in filings

The /legal page shows a small, hand-maintained table of federal court orders
(district, courts of appeals, bankruptcy) about AI use in filings, below the
Citation-integrity news block. It is a selection, not a complete list.

- Source of truth: `data/court-ai-orders.json`.
- After editing, run `python3 scripts/build_court_ai_orders.py`; it copies the
  rows into `legal/index.html` so the table works without JavaScript.
  `--check` verifies the page matches the JSON.
- Every row needs an official court source (a `.uscourts.gov` site or the
  court's own page/PDF). Open it and confirm it says what the summary says.
  No official source, no row. Never fill in a judge, date or order from memory
  or a secondary site.
- `last_reviewed` is set by hand to the date every link was actually
  re-checked. Nothing advances it automatically. If reviews stop, the old date
  stays visible and `legal/court-orders.js` collapses the table once the date
  is more than 21 days old, with a note that it may be out of date.
- No analytics events. Test: `node legal/tests/test_court_orders.js`.
