/* Court orders on AI use in filings. The table is static HTML generated
   from data/court-ai-orders.json (scripts/build_court_ai_orders.py).
   last_reviewed is set by hand only. This file never changes the date;
   it only collapses the table when the last review is older than
   COURT_ORDERS_STALE_DAYS, so an old table is not shown as fresh.
   No network requests, no analytics events. */
var COURT_ORDERS_STALE_DAYS = 21;

function courtOrdersIsStale(lastReviewed, now) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastReviewed || "");
  if (!m) return true;
  var reviewed = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  var today = now instanceof Date ? now : new Date();
  var ageDays = (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - reviewed) / 86400000;
  return ageDays > COURT_ORDERS_STALE_DAYS;
}

function applyCourtOrdersFreshness(now) {
  if (typeof document === "undefined") return;
  var time = document.querySelector("#court-ai-orders-reviewed time");
  var details = document.getElementById("court-ai-orders-details");
  var stale = document.getElementById("court-ai-orders-stale");
  if (!time || !details || !stale) return;
  var date = time.getAttribute("datetime");
  if (!courtOrdersIsStale(date, now)) return;
  details.open = false;
  stale.hidden = false;
  stale.textContent = "This list has not been reviewed since " + date + ". It is collapsed because it may be out of date. Check the official sources.";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { COURT_ORDERS_STALE_DAYS: COURT_ORDERS_STALE_DAYS, courtOrdersIsStale: courtOrdersIsStale };
} else {
  applyCourtOrdersFreshness();
}
