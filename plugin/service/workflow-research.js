"use strict";
const { CompanionError } = require("./companion-store");
const { searchWeb, fetchPage, assertPublicTarget, publicPageRequest } = require("./lib/websearch");

const STOP = new Set("a an the and or of to in on for from with by at as is are was were be being been do does did how what why when where which who whom this that these those it its their them they our your can could should would will may might must have has had not no into about through between work works working explain describe discuss overview introduce introduction conclusion article section topic topics required requirement requirements provide brief briefly detail include including importance role understanding understand guide beginner beginners key use using".split(" "));
const words = text => [...new Set((String(text).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 1 && !STOP.has(w)))];
function focusedQuery(query, topic = "") {
  // Preserve the question's intent. Stop words are useful for relevance checks,
  // but stripping them from a query turns "How does AI work?" into just "ai".
  const original = String(topic || query).trim().replace(/\s+/g, " ").split(" ").slice(0, 24).join(" ").slice(0, 180);
  if (!topic || String(query).trim() === String(topic).trim()) return original;
  const known = new Set(words(topic)), extra = words(query).filter(w => !known.has(w)).slice(0, 8).join(" ");
  return (original + (extra ? " " + extra : "")).slice(0, 240);
}
function relevant(value, topic) {
  const anchors = words(topic); if (!anchors.length) return true;
  const found = new Set(words(value));
  return anchors.some(w => found.has(w));
}

function passageScore(value, query, topic = "") {
  const found = new Set(words(value)), base = new Set(words(topic));
  return words(query).reduce((n, w) => n + (found.has(w) ? base.has(w) ? 1 : 4 : 0), 0);
}
function selectPassages(text, query, topic = "", maxChars = 2200) {
  const blocks = String(text).split(/\n\s*\n/).filter(Boolean).flatMap(block => {
    if (block.length <= maxChars) return [block];
    // Lists include their governing introduction. An oversized list is not
    // evidence for isolated bullets whose conditions would be lost.
    if (/\n- /.test(block)) return [];
    // Long HTML paragraphs are grouped at sentence boundaries, not cut mid-rule.
    const chunks = []; let chunk = "";
    for (const sentence of block.split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u)) {
      if (chunk && chunk.length + sentence.length + 1 > Math.floor(maxChars / 2)) { chunks.push(chunk); chunk = ""; }
      chunk += (chunk ? " " : "") + sentence;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  const ranked = blocks.map((text, index) => ({ text, index, score: passageScore(text, query, topic) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set(); let size = 0;
  const keep = index => {
    const block = blocks[index];
    if (!block || selected.has(index) || size + block.length + (selected.size ? 9 : 0) > maxChars) return false;
    size += block.length + (selected.size ? 9 : 0); selected.add(index); return true;
  };
  for (const block of ranked) {
    if (selected.size && !block.score) continue;
    if (keep(block.index)) { keep(block.index + 1); keep(block.index - 1); }
  }
  // A sentence exceeding the entire budget is omitted rather than cut before
  // a condition or exception. Evidence is always an excerpt of the page.
  return [...selected].sort((a, b) => a - b).map(i => blocks[i]).join("\n\n[...]\n\n");
}

async function research(query, { signal, privacyMode, fetchImpl = fetch, lookup, maxPages = 3, topic = "", sourceUrls = [], timeoutMs = 90000 } = {}) {
  query = String(query || "").trim();
  topic = String(topic || "").trim().slice(0, 240);
  if (!query || query.length > 400) throw new CompanionError("Enter a web research query of 1–400 characters.");
  const check = () => { signal?.throwIfAborted(); if (privacyMode() === "local-only") throw new CompanionError("Local-Only blocks web research."); };
  if (!Array.isArray(sourceUrls) || sourceUrls.length > 10 || sourceUrls.some(u => typeof u !== "string" || u.length > 2000)) throw new CompanionError("Use at most ten public source URLs.");
  check();
  const controller = new AbortController(), deadline = AbortSignal.timeout(timeoutMs), combined = AbortSignal.any([...(signal ? [signal] : []), controller.signal, deadline]);
  const searches = [], sources = [], seen = new Set(), limit = Math.max(1, Math.min(5, Number(maxPages) || 3));
  let provider = "none";
  const result = () => ({ query, topic, provider, searches, retrievedAt: new Date().toISOString(),
    sources: sources.filter(s => s.read).sort((a, b) => passageScore(b.title + " " + b.text, query, topic) - passageScore(a.title + " " + a.text, query, topic)).slice(0, limit)
      .concat(sources.filter(s => !s.read).slice(0, 5)) });
  const pageEvidence = page => ({ ...page, text: selectPassages(page.text, query, topic), read: true, excerpt: true });
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
    // Keep the full question first. Some providers return an empty result set
    // for natural-language questions; try topic terms only as a last resort.
    const terms = words(topic || query).slice(0, 8).join(" ");
    const queries = [...new Set([topic ? focusedQuery(query, topic) : query, ...(topic ? [focusedQuery(topic)] : []), ...(terms ? [terms] : [])])];
    // Explicit references are read through the same DNS, redirect, byte and
    // topic checks as search discoveries. They are never treated as evidence
    // until their actual page text was retrieved.
    const references = [...new Set(sourceUrls)].slice(0, 10);
    for (let offset = 0; offset < references.length; offset += 3) {
      await Promise.all(references.slice(offset, offset + 3).map(async url => {
        seen.add(url);
        try {
          const page = await fetchPage(url, { fetchImpl: safeFetch, lookup, maxChars: 24000 });
          if (topic && !relevant(page.title + " " + page.text, topic)) return;
          const evidence = pageEvidence(page);
          if (evidence.text) sources.push({ url, ...evidence, provided: true });
        } catch { check(); combined.throwIfAborted(); }
      }));
    }
    if (sources.some(s => s.read)) provider = "provided";
    for (const searchQuery of queries) {
      if (sources.filter(s => s.read).length >= limit) break;
      let rejected = 0;
      const result = await searchWeb(searchQuery, { fetchImpl: safeFetch, acceptResult: candidate => {
        const keep = !topic || relevant(candidate.title + " " + candidate.snippet, topic);
        if (!keep) rejected++; return keep;
      } }); check(); combined.throwIfAborted();
      provider = result.source; searches.push({ query: searchQuery, provider, rejected });
      // Read independent pages in small batches. A slow destination must not
      // consume the entire research budget before other evidence is attempted.
      const candidates = result.results.filter(candidate => {
        if (seen.has(candidate.url) || seen.size >= 10) return false;
        seen.add(candidate.url); return true;
      });
      for (let offset = 0; offset < candidates.length; offset += 3) {
        const batch = candidates.slice(offset, offset + 3);
        await Promise.all(batch.map(async candidate => {
          check(); combined.throwIfAborted();
          try {
            const page = await fetchPage(candidate.url, { fetchImpl: safeFetch, lookup, maxChars: 24000 });
            if (topic && !relevant(page.title + " " + page.text, topic)) { searches.at(-1).rejected++; return; }
            const evidence = pageEvidence(page);
            if (evidence.text) sources.push({ ...candidate, ...evidence });
          } catch {
            check(); combined.throwIfAborted();
            sources.push({ ...candidate, read: false, text: "", note: "Page unavailable; snippet is discovery only, not verified evidence." });
          }
        }));
        if (sources.filter(s => s.read).length >= limit) break;
      }
      if (sources.some(s => s.read)) break;
    }
    if (!sources.some(s => s.read)) throw new CompanionError(topic ? "No readable sources matching the topic were retrieved. Unrelated search results were excluded; use a more specific topic." : "No readable sources were retrieved. Try a more specific topic or run again; no researched article was generated.");
    return result();
  } catch (error) {
    // Preserve evidence already read when only the research deadline expires.
    // Explicit cancellation and Local-Only always win over partial results.
    check();
    if (!deadline.aborted || controller.signal.aborted) throw error;
    if (sources.some(s => s.read)) return { ...result(), note: "Research time limit reached; using the verified pages already read." };
    throw new CompanionError("Web research reached its time limit before any source could be read. Supply public reference URLs or retry failed work when search is reachable.");
  } finally { controller.abort(); clearInterval(timer); }
}
module.exports = { research, focusedQuery, relevant, selectPassages };
