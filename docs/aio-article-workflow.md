# AIO reviewed article

Requires Workflows 0.3.18 and Core 0.7.28 or later. Open **Templates → AIO researched article**, or import `examples/aio-article.workflow.json`. Save the disabled draft after reviewing its model order and settings. Start with a topic and an article body word target of 200–2400. No interactive intake interview runs. Optionally supply `source_urls` as a JSON array of up to ten public reference-page URLs. Supplied pages pass the same page-reading and topic checks as search discoveries; search fills the remaining source slots.

## What runs

1. Read topic evidence and prepare a research/strategy brief.
2. Plan a distinct angle, headings and requirements, then review and revise the outline.
3. For each section, read sources, create an evidence-backed coaching card, draft prose, run mechanical checks, and review factual support, citation coverage, reader intent, clarity and repetition.
4. Revise only reported issues and recheck the result. Accepted sections and all review attempts remain in run history.
5. Create a direct answer, takeaways, four FAQ answers, metadata and social copy from the completed article, then review them.
6. Derive FAQ JSON-LD from the final FAQ, verify parity and references, and perform a final coverage/continuity review.

This adapts the supplied AIO Content Studio's article pipeline. It does not migrate its full application, competitor crawling, account storage or publishing integrations. Coaching and combined editorial/SEO review run inside the workflow; they are not hard-coded plugin roles. The FAQ is also a compact answer bank. Schema describes visible FAQ content; it does not promise eligibility for a search feature.

## Editing it

**Article settings and context** holds audience, language, style, verified client facts, revision limit, word tolerance and forbidden phrases. Those are workflow configuration, not global editorial policy. Do not put secrets in an exported workflow. Agent nodes hold editable primary and ordered fallback models and their allowed locations. The supplied model choices are defaults, not a promise that providers are online.

Each artifact receives an initial review and at most two revisions. Change `revision_limit` to 0, 1 or 2; increasing it further requires deliberately adjusting the loop's maximum iterations and overall budgets. Code-check failures cannot be waived by a reviewer saying PASS. Minor word-count and metadata-length findings are warnings. The final report discloses actual counts; it never pads or silently trims prose. Extras are additional to the body target.

A completed run can deliver **Needs review**. This means a draft exists but one or more required checks or reviewer verdicts remain unresolved. It is not publication approval. The result includes remaining issues; full decisions and previous drafts are in the relevant step inputs and outputs. Final coverage findings are reported for review, not silently expanded into another unbounded rewrite loop. Nothing publishes automatically.

The cited IDs must exist in the section's readable evidence. A code check proves identity/presence, not truth: the reviewer compares claims with source excerpts. Evidence gaps must remain explicit; neither the checker nor the model is allowed to fabricate a citation. Public search results and excerpts can be incomplete or unavailable.

## Runtime and recovery

Network work uses Core credit consent. Model continuations, JSON repairs and editorial revisions may use additional credits, all within configured limits. Paid requests with uncertain outcomes do not trigger blind retries. Use **Retry failed work** for an eligible failed model or source step to retain completed work; **Run again** starts over.

Text agents use **Verify repeated ending**. Continuations repeat an exact suffix; the runner removes only that verified overlap, preserving split words, whitespace, links and hyphens. An invalid boundary can request at most two corrections within the same token/continuation limits. Raw replies and receipts remain unchanged. Existing custom workflows retain their prior behavior; opt in per text Agent or use this new template.

The importer creates a new draft rather than overwriting your existing article workflow. Installing a plugin update alone does not replace your customized graph with this AIO pipeline.
