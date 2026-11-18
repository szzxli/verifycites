/* Cloudflare Pages Function: POST /api/verify
   Forwards extracted citations to CourtListener's citation-lookup API.
   Set the secret COURTLISTENER_TOKEN in the Pages project (Settings →
   Environment variables → Production and Preview, encrypted). The token
   is read from the server environment only and is never sent to the browser.
   If the token is missing and CourtListener requires one, the response is
   { ok: false, reason: "lookup_unavailable" }. */
import { handleVerify } from "./verify-logic.mjs";

export async function onRequestPost(context) {
  return handleVerify(context.request, context.env, fetch);
}
