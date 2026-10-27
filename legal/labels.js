/* Label definitions shared with the Python package (see legalcite/labels.py).
   Browser mode labels every citation NOT_CHECKED: the page makes no API
   calls, so nothing is verified here. */
const LABELS = {
  VERIFIED: "Found in CourtListener and the case name matches.",
  CITED: "Found in CourtListener; name not compared or only partly matches.",
  AMBIGUOUS: "This cite matches more than one case.",
  MISMATCH: "A case exists at this cite, but it is a different case from the one named.",
  NOT_FOUND: "Valid citation format, but CourtListener has no case at this cite.",
  INVALID_REPORTER: "The reporter abbreviation is not a recognized reporter.",
  RATE_LIMITED: "Not checked: the lookup service asked us to slow down.",
  NOT_CHECKED: "Not checked (browser mode \u2014 no lookup). Check by hand using the links.",
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
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = { LABELS, NEXT_ACTION };
}
