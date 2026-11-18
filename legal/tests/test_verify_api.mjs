// Pages Function logic for /api/verify. No live CourtListener call.
// Run: node legal/tests/test_verify_api.mjs
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { handleVerify, LIMITS, citationAllowed, CL_URL } from "../../functions/api/verify-logic.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fnSrc = fs.readFileSync(path.join(here, "..", "..", "functions", "api", "verify.js"), "utf8");
assert.ok(fnSrc.includes("COURTLISTENER_TOKEN"));
assert.ok(!/Token [A-Za-z0-9]{20,}/.test(fnSrc), "no token literal in the function");

function req(body, headers) {
  const raw = JSON.stringify(body);
  const h = new Headers(Object.assign({ "content-type": "application/json", "cf-connecting-ip": "203.0.113.5" }, headers || {}));
  return {
    method: "POST",
    headers: h,
    text: async () => raw,
  };
}

const BROWN_UPSTREAM = [{
  citation: "347 U.S. 483",
  normalized_citations: ["347 U.S. 483"],
  status: 200,
  error_message: "",
  clusters: [{
    case_name: "Brown v. Board of Education",
    absolute_url: "/opinion/103486/brown-v-board-of-education/",
    date_filed: "1954-05-17",
    plain_text: "THIS MUST NOT BE FORWARDED",
    judges: "Warren",
  }],
}];
const FAKE_UPSTREAM = [{
  citation: "999 U.S. 9999",
  normalized_citations: ["999 U.S. 9999"],
  status: 404,
  error_message: "Citation not found: '999 U.S. 9999'",
  clusters: [],
}];

function upstream(status, data, seen) {
  return async (url, init) => {
    seen.push({ url, init });
    assert.strictEqual(url, CL_URL);
    return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  };
}

const store = () => ({ ips: new Map(), citations: [] });

// Without a token the upstream 401 becomes lookup_unavailable, and the call is still attempted.
{
  const seen = [];
  const res = await handleVerify(req({ citations: ["347 U.S. 483"] }), {}, upstream(401, { detail: "Authentication credentials were not provided." }, seen), { store: store(), now: 1 });
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.reason, "lookup_unavailable");
  assert.ok(!seen[0].init.headers.Authorization, "no Authorization header when the token is unset");
}

// With a token, a real citation is trimmed to name + official URL, and a fake one stays 404.
{
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    const text = decodeURIComponent(String(init.body).replace(/^text=/, ""));
    const data = [];
    if (text.includes("347 U.S. 483")) data.push(BROWN_UPSTREAM[0]);
    if (text.includes("999 U.S. 9999")) data.push(FAKE_UPSTREAM[0]);
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  const res = await handleVerify(
    req({ citations: ["347 U.S. 483", "999 U.S. 9999"] }),
    { COURTLISTENER_TOKEN: "test-token-value" },
    fetchImpl,
    { store: store(), now: 1 });
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.results[0].status, 200);
  assert.strictEqual(body.results[0].clusters[0].caseName, "Brown v. Board of Education");
  assert.strictEqual(body.results[0].clusters[0].url, "https://www.courtlistener.com/opinion/103486/brown-v-board-of-education/");
  assert.strictEqual(body.results[1].status, 404);
  assert.ok(!("plain_text" in (body.results[0].clusters[0] || {})));
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("THIS MUST NOT BE FORWARDED"));
  assert.ok(!raw.includes("test-token-value"));
  assert.strictEqual(seen[0].init.headers.Authorization, "Token test-token-value");
}

// Upstream 429 is a rate limit, not a not-found.
{
  const res = await handleVerify(req({ citations: ["347 U.S. 483"] }), { COURTLISTENER_TOKEN: "t" }, upstream(429, { wait_until: "2099-01-01T00:00:00Z" }, []), { store: store(), now: 1 });
  const body = await res.json();
  assert.strictEqual(res.status, 429);
  assert.strictEqual(body.reason, "rate_limited");
}

// Abuse limits: too many citations, a non-citation blob, and per-IP repeats.
{
  const tooMany = await handleVerify(req({ citations: new Array(LIMITS.maxCitations + 1).fill("1 U.S. 1") }), {}, async () => { throw new Error("should not fetch"); }, { store: store(), now: 1 });
  assert.strictEqual((await tooMany.json()).reason, "too_many");
  const junk = await handleVerify(req({ citations: ["please look up this whole brief about Smith"] }), {}, async () => { throw new Error("should not fetch"); }, { store: store(), now: 1 });
  assert.strictEqual((await junk.json()).reason, "bad_citation");
  assert.strictEqual(citationAllowed("347 U.S. 483"), true);
  assert.strictEqual(citationAllowed("123 F. Supp. 2d 456"), true);
  const s = store();
  let last;
  for (let i = 0; i < LIMITS.maxRequestsPerIp + 1; i++) {
    last = await handleVerify(req({ citations: ["1 U.S. 1"] }), { COURTLISTENER_TOKEN: "t" }, upstream(404, FAKE_UPSTREAM, []), { store: s, now: 1000 });
  }
  assert.strictEqual((await last.json()).reason, "rate_limited");
}

console.log("verify api tests passed");
