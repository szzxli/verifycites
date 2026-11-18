/* CourtListener citation-lookup proxy. Used by the Cloudflare Pages
   Function (functions/api/verify.js) and by node tests. The browser
   never sees COURTLISTENER_TOKEN. If CourtListener rejects a missing
   token, the response is { ok:false, reason:"lookup_unavailable" }
   and the page must say Not checked — it must not invent a result. */

export const CL_URL = "https://www.courtlistener.com/api/rest/v4/citation-lookup/";

export const LIMITS = {
  maxCitations: 25,
  maxCitationChars: 120,
  maxBodyBytes: 20000,
  windowMs: 10 * 60 * 1000,
  maxRequestsPerIp: 10,
  citationWindowMs: 60 * 1000,
  maxCitationsPerMinute: 50,
};

const CITE_RE = /^(\d{1,4})\s+(\S(?:.*\S)?)\s+(\d{1,6})$/;

export function normalizeCitation(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function citationAllowed(text) {
  const s = normalizeCitation(text);
  if (!s || s.length > LIMITS.maxCitationChars) return false;
  if (/[\r\n]/.test(s)) return false;
  return CITE_RE.test(s);
}

export function clientIp(request) {
  const headers = request && request.headers;
  if (!headers || typeof headers.get !== "function") return "unknown";
  const cf = headers.get("cf-connecting-ip");
  if (cf) return String(cf).trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return String(xff).split(",")[0].trim();
  return "unknown";
}

function prune(stamps, now, windowMs) {
  return (stamps || []).filter((item) => now - (item.t != null ? item.t : item) < windowMs);
}

/* store: { ips: Map<ip, number[]>, citations: {t, n}[] } */
export function takeRateLimit(store, ip, citationCount, now) {
  store.ips = store.ips || new Map();
  const ipStamps = prune(store.ips.get(ip) || [], now, LIMITS.windowMs);
  if (ipStamps.length >= LIMITS.maxRequestsPerIp) return { ok: false, reason: "rate_limited" };
  const cites = prune(store.citations || [], now, LIMITS.citationWindowMs);
  const used = cites.reduce((n, item) => n + item.n, 0);
  if (used + citationCount > LIMITS.maxCitationsPerMinute) return { ok: false, reason: "rate_limited" };
  ipStamps.push(now);
  store.ips.set(ip, ipStamps);
  cites.push({ t: now, n: citationCount });
  store.citations = cites;
  return { ok: true };
}

export function trimCluster(cluster) {
  if (!cluster || typeof cluster !== "object") return null;
  let url = typeof cluster.absolute_url === "string" ? cluster.absolute_url : "";
  if (url.startsWith("/")) url = "https://www.courtlistener.com" + url;
  if (url && url.indexOf("https://www.courtlistener.com/") !== 0) url = "";
  const name = typeof cluster.case_name === "string" ? cluster.case_name : "";
  if (!name && !url) return null;
  const filed = typeof cluster.date_filed === "string" ? cluster.date_filed.slice(0, 10) : "";
  return { caseName: name, url: url, dateFiled: filed };
}

export function trimLookupItem(item) {
  const clusters = Array.isArray(item && item.clusters)
    ? item.clusters.map(trimCluster).filter(Boolean).slice(0, 5) : [];
  return {
    citation: typeof item.citation === "string" ? item.citation : "",
    normalized: Array.isArray(item.normalized_citations)
      ? item.normalized_citations.filter((s) => typeof s === "string").slice(0, 8) : [],
    status: typeof item.status === "number" ? item.status : 0,
    error: typeof item.error_message === "string" ? item.error_message.slice(0, 300) : "",
    clusters: clusters,
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const defaultStore = { ips: new Map(), citations: [] };

export async function handleVerify(request, env, fetchImpl, opts) {
  opts = opts || {};
  const store = opts.store || defaultStore;
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  if (!request || request.method !== "POST") return json({ ok: false, reason: "method" }, 405);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > LIMITS.maxBodyBytes) return json({ ok: false, reason: "too_large" }, 413);
  let raw = "";
  try {
    raw = await request.text();
  } catch (e) {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  if (raw.length > LIMITS.maxBodyBytes) return json({ ok: false, reason: "too_large" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const citations = body && Array.isArray(body.citations) ? body.citations : null;
  if (!citations || !citations.length) return json({ ok: false, reason: "bad_request" }, 400);
  if (citations.length > LIMITS.maxCitations) return json({ ok: false, reason: "too_many" }, 400);
  const clean = [];
  for (let i = 0; i < citations.length; i++) {
    if (typeof citations[i] !== "string" || !citationAllowed(citations[i])) {
      return json({ ok: false, reason: "bad_citation" }, 400);
    }
    clean.push(normalizeCitation(citations[i]));
  }
  const ip = clientIp(request);
  const gate = takeRateLimit(store, ip, clean.length, now);
  if (!gate.ok) return json({ ok: false, reason: "rate_limited" }, 429);

  const token = env && typeof env.COURTLISTENER_TOKEN === "string" ? env.COURTLISTENER_TOKEN.trim() : "";
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (token) headers.Authorization = "Token " + token;
  let response;
  try {
    response = await fetchImpl(CL_URL, {
      method: "POST",
      headers: headers,
      body: "text=" + encodeURIComponent(clean.join("\n\n")),
    });
  } catch (e) {
    return json({ ok: false, reason: "lookup_unavailable" }, 502);
  }
  if (response.status === 401 || response.status === 403) {
    return json({ ok: false, reason: "lookup_unavailable" }, 200);
  }
  if (response.status === 429) return json({ ok: false, reason: "rate_limited" }, 429);
  if (!response.ok) return json({ ok: false, reason: "lookup_unavailable" }, 502);
  let data;
  try {
    data = await response.json();
  } catch (e) {
    return json({ ok: false, reason: "lookup_unavailable" }, 502);
  }
  if (!Array.isArray(data)) return json({ ok: false, reason: "lookup_unavailable" }, 502);
  return json({ ok: true, results: data.map(trimLookupItem) }, 200);
}
