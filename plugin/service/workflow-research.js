"use strict";
const { CompanionError } = require("./companion-store");
const { searchWeb, fetchPage, assertPublicTarget, publicPageRequest } = require("./lib/websearch");

async function research(query, { signal, privacyMode, fetchImpl = fetch, lookup, maxPages = 3 } = {}) {
  query = String(query || "").trim();
  if (!query || query.length > 400) throw new CompanionError("Enter a web research query of 1–400 characters.");
  const check = () => { signal?.throwIfAborted(); if (privacyMode() === "local-only") throw new CompanionError("Local-Only blocks web research."); };
  check();
  const controller = new AbortController(), combined = AbortSignal.any([...(signal ? [signal] : []), controller.signal, AbortSignal.timeout(60000)]);
  const timer = setInterval(() => { if (privacyMode() === "local-only") controller.abort(); }, 100); timer.unref?.();
  // The bundled search helper uses fixed providers. Bound every response and
  // pin public DNS, including each page redirect. Never send account headers.
  const safeFetch = async (url, options = {}) => {
    check(); combined.throwIfAborted();
    const addresses = await assertPublicTarget(url, { lookup });
    const requestSignal = AbortSignal.any([combined, ...(options.signal ? [options.signal] : [])]);
    const response = await (fetchImpl === fetch ? publicPageRequest : fetchImpl)(url, { ...options, method: "GET", redirect: options.redirect === "manual" ? "manual" : "error", addresses, signal: requestSignal });
    const parts = []; let bytes = 0;
    for await (const part of response.body || []) { check(); requestSignal.throwIfAborted(); if ((bytes += part.length) > 2 * 1024 * 1024) throw new CompanionError("Research page exceeds 2 MB."); parts.push(part); }
    check(); requestSignal.throwIfAborted();
    return new Response(Buffer.concat(parts), { status: response.status, headers: response.headers });
  };
  try {
    const result = await searchWeb(query, { fetchImpl: safeFetch }); check(); combined.throwIfAborted();
    const sources = [];
    for (const candidate of result.results.slice(0, Math.max(1, Math.min(5, Number(maxPages) || 3)))) {
      check(); combined.throwIfAborted();
      try {
        const page = await fetchPage(candidate.url, { fetchImpl: safeFetch, lookup, maxChars: 2200 });
        sources.push({ ...candidate, ...page, read: true, excerpt: true });
      } catch {
        check(); combined.throwIfAborted();
        sources.push({ ...candidate, read: false, text: "", note: "Page unavailable; snippet is discovery only, not verified evidence." });
      }
    }
    if (!sources.some(s => s.read)) throw new CompanionError("No readable sources were retrieved. Try a more specific topic or run again; no researched article was generated.");
    return { query, provider: result.source, retrievedAt: new Date().toISOString(), sources };
  } finally { clearInterval(timer); }
}
module.exports = { research };
