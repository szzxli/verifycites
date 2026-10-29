# Contributing / testing verifycites.com

## Test without counting (humans and agents)

Open any page once with `?nocount=1`, e.g. <https://verifycites.com/?nocount=1>.
That browser then counts nothing in GoatCounter (page views and events) until you open a page with `?nocount=0`.
It sets GoatCounter's own `skipgc` flag in localStorage, the same one `#toggle-goatcounter` sets.

- Automated / headless browsers start with a fresh profile: add `?nocount=1` to **every** URL you open.
- URLs containing `v=`, `cb=`, `cachebust`, `_=` or `nocount` are never counted, so cache-busting test URLs stay out of the stats.
- Local copies (`localhost`, `file://`) are never counted.

Details: [docs/analytics.md](docs/analytics.md). Test: `node legal/tests/test_goatcounter_guard.js`.

## Links to the other sites

Links from these pages to li jun's other sites (soc-skills, soc-home-lab) carry `?ref=verifycites` (before any `#fragment`). Links to third-party sites and to GitHub are not tagged.
