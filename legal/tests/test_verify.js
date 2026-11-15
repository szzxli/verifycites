// Existence check (verify.js): mocked network, no real requests.
// Run: node legal/tests/test_verify.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const V = require("../verify.js");
const { extractCitations } = require("../extract.js");

const REPORTERS_META = [{ slug: "us", short_name: "U.S." }, { slug: "f3d", short_name: "F.3d" }];
const US_347 = [{ name: "BROWN v. BOARD OF EDUCATION OF TOPEKA", name_abbreviation: "Brown v. Board of Education", first_page: "483", last_page: "496", decision_date: "1954-05-17", file_name: "0483-01" }];
const BIA = { entries: [{ id: 4240, display_name: "Matter of DIJI", citation: "30 I&N Dec. 1", year: 2026, volume: "30", pdf_url: "https://www.justice.gov/eoir/media/1460146/dl?inline" }] };
const calls = [];
function mockFetch(url) {
  calls.push(url);
  const ok = (j) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(j) });
  if (url.endsWith("ReportersMetadata.json")) return ok(REPORTERS_META);
  if (url.endsWith("/us/347/CasesMetadata.json")) return ok(US_347);
  if (url.includes("/CasesMetadata.json")) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
  if (url.endsWith("bia-index.json")) return ok(BIA);
  return Promise.reject(new Error("unexpected " + url));
}
const text = "Brown v. Board of Education, 347 U.S. 483 (1954). Smith v. Jones, 347 U.S. 483 (1954). Foo v. Bar, 347 U.S. 9999 (1954). "
  + "See 8 F.3d 100 (1993). Matter of DIJI, 30 I&N Dec. 1 (BIA 2026). Matter of Acosta, 19 I&N Dec. 211 (BIA 1985). INA \u00a7 208.";
const rows = extractCitations(text);

(async () => {
  const sum = await V.verifyRows(rows, { fetch: mockFetch, cache: {} });
  const by = Object.fromEntries(rows.map((r) => [r.text + (r.caseName ? "|" + r.caseName : ""), r]));
  const find = (re) => rows.find((r) => re.test(r.text + " " + (r.caseName || "")));
  assert.strictEqual(find(/347 U\.S\. 483.*Brown/).label, "VERIFIED");
  assert.ok(find(/347 U\.S\. 483.*Brown/).verify.url.endsWith("/us/347/html/0483-01.html"));
  assert.strictEqual(find(/347 U\.S\. 483.*Smith/).label, "MISMATCH");
  assert.strictEqual(find(/347 U\.S\. 9999/).label, "NOT_FOUND");
  assert.strictEqual(find(/8 F\.3d 100/).label, "NOT_CHECKED", "volume missing from CAP = outside coverage, never NOT_FOUND");
  assert.strictEqual(find(/30 I&N Dec\. 1\b/).label, "VERIFIED");
  assert.strictEqual(find(/19 I&N Dec\. 211/).label, "NOT_CHECKED", "BIA volume outside the library");
  assert.strictEqual(find(/INA/).label, "NOT_CHECKED");
  assert.strictEqual(sum.total, rows.length);
  assert.strictEqual(sum.verified, 2);
  assert.strictEqual(sum.mismatch, 1);
  assert.strictEqual(sum.not_found, 1);
  assert.strictEqual(sum.not_checked, 3);
  // Same volume is downloaded once (cache), and only public URLs are requested.
  assert.strictEqual(calls.filter((u) => u.endsWith("/us/347/CasesMetadata.json")).length, 1);
  assert.ok(calls.every((u) => /^https:\/\/static\.case\.law\/|bia-index\.json$/.test(u)), "only static.case.law and the BIA index");
  assert.ok(calls.every((u) => !/Brown|Smith|Foo|Acosta|DIJI/.test(u)), "no case name or text in any URL");
  // Sentences: fixed forms, in three languages, never "good law".
  for (const lang of ["en", "es", "zh"]) {
    for (const r of rows) {
      const s = V.verifyStatusSentence(r, lang);
      assert.ok(s.length > 10 && !/\{\w+\}/.test(s), lang + " unresolved placeholder: " + s);
      assert.ok(!/is good law|still good law|valid law|reliable/i.test(s), "never implies good law: " + s);
    }
  }
  assert.ok(/^Verified: found in Caselaw Access Project/.test(V.verifyStatusSentence(find(/347 U\.S\. 483.*Brown/), "en")));
  assert.ok(/^Not found in Caselaw Access Project/.test(V.verifyStatusSentence(find(/347 U\.S\. 9999/), "en")));
  assert.ok(/^Not checked: outside coverage/.test(V.verifyStatusSentence(find(/19 I&N/), "en")));
  assert.ok(/Subsequent history and good-law status are not checked/.test(V.VERIFY_TEXT.en.note));

  // Network failure and timeout become LOOKUP_FAILED, not a verdict.
  const bad = extractCitations("Brown v. Board of Education, 347 U.S. 483 (1954).");
  await V.verifyRows(bad, { fetch: () => Promise.reject(new Error("offline")), cache: {} });
  assert.strictEqual(bad[0].label, "LOOKUP_FAILED");
  const slow = extractCitations("Brown v. Board of Education, 347 U.S. 483 (1954).");
  await V.verifyRows(slow, { fetch: () => new Promise(() => {}), cache: {}, timeoutMs: 50 });
  assert.strictEqual(slow[0].label, "LOOKUP_FAILED");
  assert.ok(/timeout/.test(slow[0].verify.params.err));

  // Year handling: off by one is a note, off by more is a mismatch.
  const y1 = V.verifyCourtRow({ reporter: "U.S.", volume: "347", page: "483", caseName: "Brown v. Board of Education", year: "1955" }, "us", US_347);
  assert.strictEqual(y1.label, "VERIFIED"); assert.strictEqual(y1.code, "ok_year1");
  const y2 = V.verifyCourtRow({ reporter: "U.S.", volume: "347", page: "483", caseName: "Brown v. Board of Education", year: "1990" }, "us", US_347);
  assert.strictEqual(y2.label, "MISMATCH");
  const nn = V.verifyCourtRow({ reporter: "U.S.", volume: "347", page: "483", caseName: null, year: null }, "us", US_347);
  assert.strictEqual(nn.label, "CITED");
  // Page inside a case is NOT_FOUND with the containing case named.
  const inside = V.verifyCourtRow({ reporter: "U.S.", volume: "347", page: "490", caseName: null }, "us", US_347);
  assert.strictEqual(inside.label, "NOT_FOUND"); assert.strictEqual(inside.code, "nf_court_inside");

  // Page wiring: script loaded, no third-party fetch other than static.case.law.
  const src = fs.readFileSync(path.join(__dirname, "..", "verify.js"), "utf8");
  assert.ok(!/localStorage|document\.cookie|innerHTML/.test(src));
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.indexOf('<script src="verify.js"></script>') > 0 && html.indexOf("verify.js") < html.indexOf("app.js"));
  assert.ok(html.includes('id="verifyProgress"'));
  console.log("verify tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
