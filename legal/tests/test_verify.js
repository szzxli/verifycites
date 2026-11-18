// Existence check (verify.js): mocked network, no real requests.
// Run: node legal/tests/test_verify.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const V = require("../verify.js");
const { extractCitations } = require("../extract.js");

const BROWN = {
  citation: "347 U.S. 483",
  normalized: ["347 U.S. 483"],
  status: 200,
  error: "",
  clusters: [{ caseName: "Brown v. Board of Education", url: "https://www.courtlistener.com/opinion/103486/brown-v-board-of-education/", dateFiled: "1954-05-17" }]
};
const FAKE = {
  citation: "999 U.S. 9999",
  normalized: ["999 U.S. 9999"],
  status: 404,
  error: "Citation not found: '999 U.S. 9999'",
  clusters: []
};
const BIA = {
  volumes: ["30"],
  entries: [{ volume: "30", page: 1, name: "Matter of DIJI", year: 2026, url: "https://www.justice.gov/eoir/media/1460146/dl?inline" }]
};

function lookupBody(citations) {
  return {
    ok: true,
    results: citations.map(function (c) {
      if (c === "347 U.S. 483") return BROWN;
      if (c === "999 U.S. 9999") return FAKE;
      return { citation: c, normalized: [c], status: 404, error: "", clusters: [] };
    })
  };
}

const calls = [];
function mockFetch(url, opts) {
  calls.push({ url: url, opts: opts || {} });
  if (String(url).indexOf("bia-cite-index.json") >= 0) {
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(BIA); } });
  }
  if (String(url).indexOf("/api/verify") >= 0) {
    const body = JSON.parse((opts && opts.body) || "{}");
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(lookupBody(body.citations || [])); } });
  }
  return Promise.reject(new Error("unexpected " + url));
}

const text = "Brown v. Board of Education, 347 U.S. 483 (1954). Smith v. Jones, 347 U.S. 483 (1954). "
  + "See 999 U.S. 9999 (1999). Matter of DIJI, 30 I&N Dec. 1 (BIA 2026). Matter of Acosta, 19 I&N Dec. 211 (BIA 1985). "
  + "Matter of Nobody, 30 I&N Dec. 9999 (BIA 2026). INA \u00a7 208.";
const rows = extractCitations(text);

(async () => {
  const sum = await V.verifyRows(rows, { fetch: mockFetch, biaFallbackUrl: "https://example.invalid/no-fallback" });
  const find = (re) => rows.find((r) => re.test(r.text + " " + (r.caseName || "")));
  const brown = find(/347 U\.S\. 483.*Brown/);
  const smith = find(/347 U\.S\. 483.*Smith/);
  const fake = find(/999 U\.S\. 9999/);
  const diji = find(/30 I&N Dec\. 1\b/);
  const acosta = find(/19 I&N Dec\. 211/);
  const nobody = find(/30 I&N Dec\. 9999/);
  const ina = find(/INA/);

  assert.strictEqual(brown.label, "VERIFIED");
  assert.strictEqual(V.verifyUserStatus(brown, "en"), "Verified \u2014 found");
  assert.strictEqual(brown.verify.recordName, "Brown v. Board of Education");
  assert.strictEqual(brown.verify.url, "https://www.courtlistener.com/opinion/103486/brown-v-board-of-education/");
  assert.ok(V.verifyStatusSentence(brown, "en").indexOf("Found means this citation exists. It does not mean it is still good law or that it supports the claim.") > 0);

  // A real citation with the wrong name is still "found": the record name is shown.
  assert.strictEqual(V.verifyUserStatus(smith, "en"), "Verified \u2014 found");
  assert.ok(V.verifyStatusSentence(smith, "en").indexOf("Smith v. Jones") > 0);
  assert.ok(V.verifyStatusSentence(smith, "en").indexOf("Brown v. Board of Education") > 0);

  assert.strictEqual(fake.label, "NOT_FOUND");
  assert.strictEqual(V.verifyUserStatus(fake, "en"), "Not found");
  assert.ok(/no matching record exists/.test(V.verifyStatusSentence(fake, "en")));

  assert.strictEqual(V.verifyUserStatus(diji, "en"), "Verified \u2014 found");
  assert.strictEqual(diji.verify.recordName, "Matter of DIJI");
  assert.ok(diji.verify.url.indexOf("justice.gov/eoir/") === 8 || diji.verify.url.indexOf("https://www.justice.gov/eoir/") === 0);

  assert.strictEqual(V.verifyUserStatus(nobody, "en"), "Not found", "volume 30 miss is a real not-found");
  assert.strictEqual(V.verifyUserStatus(acosta, "en"), "Not checked (BIA library currently covers volume 30)");
  assert.strictEqual(acosta.label, "NOT_CHECKED");
  assert.ok(V.verifyUserStatus(ina, "en").indexOf("Not checked (") === 0);
  assert.notStrictEqual(V.verifyUserStatus(ina, "en"), "Verified \u2014 found");
  assert.notStrictEqual(V.verifyUserStatus(fake, "en"), "Verified \u2014 found");

  assert.strictEqual(sum.verified, 3);
  assert.strictEqual(sum.not_found, 2);
  assert.ok(sum.not_checked >= 2);

  const posts = calls.filter((c) => String(c.url).indexOf("/api/verify") >= 0);
  assert.strictEqual(posts.length, 1, "court cites go out in one request");
  const sent = JSON.parse(posts[0].opts.body);
  assert.deepStrictEqual(Array.from(new Set(sent.citations)).sort(), ["347 U.S. 483", "999 U.S. 9999"]);
  assert.ok(!/Brown|Smith|Acosta|DIJI|INA/.test(posts[0].opts.body), "case names and the brief are not sent");
  assert.ok(calls.every((c) => !/static\.case\.law/.test(String(c.url))), "no Caselaw Access Project requests");

  for (const lang of ["en", "es", "zh"]) {
    for (const r of rows) {
      const s = V.verifyStatusSentence(r, lang);
      assert.ok(s.length > 8 && !/\{\w+\}/.test(s), lang + " unresolved: " + s);
      assert.ok(!/this (case|citation) is (still )?good law|is reliable|valid law/i.test(s), "never claims good law: " + s);
    }
  }

  // Missing token / failed lookup is Not checked, never a verdict.
  const down = extractCitations("Brown v. Board of Education, 347 U.S. 483 (1954). See 999 U.S. 9999.");
  await V.verifyRows(down, {
    fetch: function (url) {
      if (String(url).indexOf("/api/verify") >= 0) {
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, reason: "lookup_unavailable" }); } });
      }
      return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve(null); } });
    },
    biaIndexUrl: "https://example.invalid/bia",
    biaFallbackUrl: "https://example.invalid/bia-2"
  });
  down.forEach(function (r) {
    if (r.reporter === "U.S.") {
      assert.strictEqual(V.verifyUserStatus(r, "en"), "Not checked (lookup unavailable)");
      assert.notStrictEqual(r.label, "NOT_FOUND");
      assert.notStrictEqual(r.label, "VERIFIED");
    }
  });

  const limited = extractCitations("Brown v. Board of Education, 347 U.S. 483 (1954).");
  await V.verifyRows(limited, {
    fetch: function () {
      return Promise.resolve({ ok: true, status: 429, json: function () { return Promise.resolve({ ok: false, reason: "rate_limited" }); } });
    }
  });
  assert.strictEqual(V.verifyUserStatus(limited[0], "en"), "Not checked (lookup rate limited)");
  assert.notStrictEqual(limited[0].label, "NOT_FOUND");

  // A 404 from CourtListener for one cite, and a per-cite 429, stay distinct.
  const mixed = V.verifyCourtFromLookup(
    { volume: "1", reporter: "U.S.", page: "200", caseName: null },
    { status: 404, citation: "1 U.S. 200", normalized: ["1 U.S. 200"], clusters: [] });
  assert.strictEqual(V.verifyUserStatus({ verify: mixed, label: mixed.label }, "en"), "Not found");
  const held = V.verifyCourtFromLookup(
    { volume: "347", reporter: "U.S.", page: "483" },
    { status: 429, citation: "347 U.S. 483", normalized: [], clusters: [] });
  assert.strictEqual(V.verifyUserStatus({ verify: held, label: held.label }, "en"), "Not checked (lookup rate limited)");

  const src = fs.readFileSync(path.join(__dirname, "..", "verify.js"), "utf8");
  assert.ok(!/static\.case\.law/.test(src), "browser checker does not call static.case.law");
  assert.ok(src.includes('"/api/verify"'));
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.indexOf('<script src="verify.js"></script>') > 0 && html.indexOf("verify.js") < html.indexOf("app.js"));
  assert.ok(html.includes("Verified \u2014 found"));
  assert.ok(html.includes("does not mean it is still good law or that it supports the claim") || html.includes("does not mean the case is still good law or that it supports the claim"));
  // Real EOIR index (data/bia-cite-index.json): a known decision, a fake
  // page in a complete volume, and a volume the HTML lists do not cover.
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "bia-cite-index.json"), "utf8"));
  assert.ok(String(index.source).indexOf("https://www.justice.gov/eoir/ag-bia-decisions") === 0);
  const acostaRow = V.verifyBiaRow({ volume: "19", page: "211", caseName: "Matter of Acosta", reporter: "I&N Dec." }, index);
  assert.strictEqual(acostaRow.label, "VERIFIED");
  assert.strictEqual(V.verifyUserStatus({ verify: acostaRow, label: acostaRow.label }, "en"), "Verified \u2014 found");
  assert.ok(/ACOSTA/i.test(acostaRow.recordName));
  assert.ok(acostaRow.url.indexOf("https://www.justice.gov/") === 0);
  const fake19 = V.verifyBiaRow({ volume: "19", page: "9999", caseName: "Matter of Nobody", reporter: "I&N Dec." }, index);
  assert.strictEqual(fake19.label, "NOT_FOUND");
  assert.strictEqual(V.verifyUserStatus({ verify: fake19, label: fake19.label }, "en"), "Not found");
  const vol5 = V.verifyBiaRow({ volume: "5", page: "1", caseName: "Matter of X", reporter: "I&N Dec." }, index);
  assert.strictEqual(vol5.label, "NOT_CHECKED");
  assert.ok(V.verifyUserStatus({ verify: vol5, label: vol5.label }, "en").indexOf("Not checked (BIA library currently covers volumes ") === 0);
  assert.ok(index.volumes.indexOf("30") >= 0 && index.volumes.indexOf("19") >= 0);
  assert.ok(index.entries.length > 3000, "index expanded past volume 30");

  console.log("verify tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
