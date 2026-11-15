/* Label definitions shared with the Python package (see legalcite/labels.py).
   The browser page (verify.js) checks court-case and I&N Dec. citations
   for existence against the Caselaw Access Project static files and the
   VerifyCites BIA library; every other row is NOT_CHECKED. No label says
   a case is good law: subsequent history is never checked. */
const LABELS = {
  VERIFIED: "Found in the named source and the case name matches. Existence only; not good law.",
  CITED: "Found in the named source; name not compared.",
  AMBIGUOUS: "This cite matches more than one case.",
  MISMATCH: "A different case or year is at this citation.",
  NOT_FOUND: "Not found in the named source (that is not proof the case does not exist).",
  INVALID_REPORTER: "The reporter abbreviation is not a recognized reporter.",
  RATE_LIMITED: "Not checked: the lookup service asked us to slow down.",
  NOT_CHECKED: "Not checked: outside coverage, or not a case citation. Check by hand using the links.",
  LOOKUP_FAILED: "Not checked: the lookup failed. Try again.",
};
const NEXT_ACTION = {
  VERIFIED: "Still read it: this does not mean it supports your point or is good law.",
  CITED: "Open the link and confirm the case name and holding.",
  AMBIGUOUS: "Open the candidates and pick the one you meant; add the case name.",
  MISMATCH: "Likely a wrong volume/page or wrong case; find the correct cite.",
  NOT_FOUND: "Find the case in an official reporter or another database before relying on it; if you can't find it anywhere, remove it.",
  INVALID_REPORTER: "Check the abbreviation; the cite may be mistyped or invalid.",
  RATE_LIMITED: "Re-run later.",
  NOT_CHECKED: "Check by hand using the links.",
  LOOKUP_FAILED: "Run the check again.",
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = { LABELS, NEXT_ACTION };
}
