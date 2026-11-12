# AIO reviewed article

Requires Workflows 0.3.19 and Core 0.7.28 or later. Open **Templates → AIO researched article**, or import `examples/aio-article.workflow.json`. Save the disabled draft after reviewing its model order and settings. Start with a topic and an article body word target of 200–2400. No interactive intake interview runs. Optionally supply `source_urls` as a JSON array of up to ten public reference-page URLs. Supplied pages pass the same page-reading and topic checks as search discoveries; search fills the remaining source slots.

## What runs

1. Read topic evidence and prepare a compact structured research/strategy brief.
2. Plan a distinct angle and the whole heading list in one compact request, then generate and validate each section’s requirements separately. Assemble the outline deterministically, reject duplicate headings, review coverage and revise using the same small parts.
3. For each section, read sources, create a compact structured coaching card, draft prose, run mechanical checks, and review factual support, citation coverage, reader intent, clarity and repetition.
4. Revise only reported issues and recheck the result. Mechanical errors go straight to the reviser; semantic review runs after those checks pass. Accepted sections and all review attempts remain in run history.
5. Create metadata, a direct answer, takeaways and each FAQ in separate small structured requests from reviewed section summaries, then assemble and review the extras.
6. Derive FAQ JSON-LD from the final FAQ, verify parity and references, and perform a final cross-section coverage review using the reviewed section summaries and extras.

This adapts the supplied AIO Content Studio's article pipeline. It does not migrate its full application, competitor crawling, account storage or publishing integrations. Coaching and combined editorial/SEO review run inside the workflow; they are not hard-coded plugin roles. The FAQ is also a compact answer bank. Schema describes visible FAQ content; it does not promise eligibility for a search feature.

## Editing it

**Article settings and context** holds audience, language, style, verified client facts, revision limit, word tolerance and forbidden phrases. Those are workflow configuration, not global editorial policy. Do not put secrets in an exported workflow. Agent nodes hold editable primary and ordered fallback models and their allowed locations. The supplied Gemma 3 12B / Qwen 2.5 14B choices are editable defaults, not a promise that providers are online.

Review/revision prompts send the current artifact, relevant evidence and outstanding issues; full review history stays in the run record. Each section reviewer also produces a short cited summary. Extras and the final cross-section check use those summaries so long articles fit network models with 4096-token context windows. Every full section is reviewed before summarization.

Each artifact receives an initial review and at most two revisions. Change `revision_limit` to 0, 1 or 2; increasing it further requires deliberately adjusting the loop's maximum iterations and overall budgets. Code-check failures cannot be waived by a reviewer saying PASS. Minor word-count and metadata-length findings are warnings. A CHANGE_REQUEST containing only warnings is advisory; BLOCKER, empty change requests and error findings require revision. The final report discloses actual counts; it never pads or silently trims prose. Extras are additional to the body target.

A completed run can deliver **Needs review**. This means a draft exists but one or more required checks or reviewer verdicts remain unresolved. It is not publication approval. The result includes remaining issues; full decisions and previous drafts are in the relevant step inputs and outputs. Final coverage findings are reported for review, not silently expanded into another unbounded rewrite loop. Nothing publishes automatically.

The workflow canonicalizes parenthesized source IDs such as `(S1-1)` into `[S1-1]` before validation, without adding claims or sources. Unknown IDs still fail validation. The cited IDs must exist in the section's readable evidence. A code check proves identity/presence, not truth: the reviewer compares claims with source excerpts. Evidence gaps must remain explicit; neither the checker nor the model is allowed to fabricate a citation. Public search results and excerpts can be incomplete or unavailable.

## Runtime and recovery

Network work uses Core credit consent. Model continuations, JSON repairs and editorial revisions may use additional credits, all within configured limits. Paid requests with uncertain outcomes do not trigger blind retries. Use **Retry failed work** for an eligible failed model or source step to retain completed work; **Run again** starts over.

Text agents use **Verify repeated ending**. Continuations repeat an exact suffix; the runner removes only that verified overlap, preserving split words, whitespace, links and hyphens. An invalid boundary can request at most two corrections within the same token/continuation limits, advancing through the configured model order after a terminal invalid reply. JSON recovery distinguishes a valid unfinished prefix from broken syntax. Missing quotes, invalid escapes, trailing commas and repeated incomplete fragments request a bounded full repair instead of repeated continuations. JSON format corrections use that same bounded fallback policy; uncertain paid requests are never replaced blindly. Raw replies and receipts remain unchanged. Existing custom workflows retain their prior behavior; opt in per text Agent or use this new template.

The importer creates a new draft rather than overwriting your existing article workflow. Installing a plugin update alone does not replace your customized graph with this AIO pipeline.
