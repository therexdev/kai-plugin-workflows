# Researched article workflow

Requires **Workflows 0.3.6** and Core 0.7.17+. Import `examples/researched-article.workflow.json` using **My workflows → Import JSON**, validate, and save. Run with:

```json
{"topic":"How community solar works for renters","word_count":1800}
```

The only required inputs are `topic` (1–240 characters) and `word_count` (200–5000). There are no clarification questions or QA/review agents. In Core 0.7.23 or newer, choose **Allow for Workflow** at the first network credit prompt to authorize the remaining article run, or **Allow Always** for future Workflows credit use. Revoke ongoing access in **Core Settings → Access**.

1. Public web research searches for the topic and reads up to four source excerpts.
2. A topic researcher identifies relevant topics, questions and evidence gaps.
3. An outline agent proposes a title, distinct H2 headings and section requirements. The graph attaches deterministic word budgets that sum exactly to the requested count.
4. For each section, fresh web research reads up to three source excerpts. Agent 1 prepares an evidence brief; Agent 2 writes that section against its heading, requirements and budget. Sections run in outline order.
5. The graph assembles the article, cited source URLs, outline and per-section word counts. Open the final **Article, outline and sources** output in run history for the complete result, including long articles.

The writing target excludes headings, bibliography and source markers. Model prose may differ from that target; actual whitespace-based counts are reported. No automatic editing or QA pass forces the final count. The article remains a draft. Structural checks reject an invalid outline or unknown source IDs; they do not verify every factual claim.

## Model selection

The new model choices are `koinos-network:auto-research`, `koinos-network:auto-outline` and `koinos-network:auto-writing`. They are routing policies, not provider model IDs. Before each agent begins, Workflows refreshes Core's authenticated catalog and selects only a model Core marks available to this account. Research, outlining and prose use different documented preference orders in `plugin/service/workflow-routing.js`. These are practical task heuristics, not measured benchmark rankings. Unknown live models remain fallback candidates. There is no local-model fallback.

The selected concrete model appears in the credit review and saved Network results. If it becomes unavailable before dispatch, Core stops the request. Workflows does not retry a possibly charged failure automatically.

Core may limit replies to 256 tokens. This workflow enables bounded continuation requests for an outline, brief or section that ends at a token limit. Every continuation uses the same run consent, preserves the selected model, and is saved before acknowledgment. With Allow once, Core asks again for the next request. It stops on the total token budget, continuation limit, cancellation or error; partial paid responses remain in Network results. Continuation limits bound generation; ongoing credit use requires the permission selected in Core.

## Web evidence

The Web research node uses public DuckDuckGo search, then Bing RSS, then a narrower Wikipedia fallback. It sends only the query to search services and reads public result pages with no connected credentials. DNS destinations and redirects are checked; private hosts are refused. Local-Only and cancellation stop research.

Source text is a bounded excerpt, not the entire document. Inaccessible pages are marked unreadable; snippets alone are not treated as verified evidence. If no source page can be read, the run fails instead of inventing a researched article. Web availability, source relevance and actual model writing quality vary. Models receive instructions to treat source text as untrusted data, cite only supplied evidence, and disclose gaps. No research provider API key is needed.

## Validation

`npm test` exercises import, real graph execution, a synthetic 5000-word article, all section handoffs, word budgets, live-model routing, low-capacity continuations, credit review, privacy, cancellation and blocked page destinations. It does not measure live model prose quality. The source example is reproducible with `node scripts/build-article-workflow.js`.
