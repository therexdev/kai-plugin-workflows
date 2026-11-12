# Workflows 0.3.16

Network Agent steps now receive verified stream results through the existing Core SDK. When a provider job ends with a charged, signed partial reply, Workflows saves that original reply and receipt, then continues the text through the next configured model/location where available. If no fallback is available it can continue on the original allowed route. Continuation requests use smaller output chunks after a cutoff, preserve the step input, and remain within its total token, continuation, time and credit-approval limits. The graph advances only after the output is complete; JSON must pass the full configured schema.

Fixes the reported `The network response ended before the provider finished` failure. An eligible Retry failed work can retrieve the same terminal prefix retained by Core from an older Workflows version instead of requesting the original outline again. New continuation work can use credits. Unknown transport outcomes, still-running provider work, invalid signatures and failed saves do not authorize replacements. Verified partial replies are labeled in Model results. Requires Core 0.7.28+; no newer Core or workflow reimport is required.

# Workflows 0.3.15

Fixes the reported complete five-section outline that failed three times because its final `points` array omitted a closing `]`. JSON Agents now attempt a bounded local punctuation correction before asking the model to regenerate. It inserts missing container closers only where an existing outer closer identifies the boundary, then parses and validates the full configured schema. It does not invent sections, values or string endings, complete a truncated tail, or repair tool arguments. Original model responses and paid receipts remain unchanged in Model results; successful corrections are labeled. Existing token, continuation and model-repair limits remain in effect.

**Retry failed work** can recover an already saved output rejected for JSON formatting, validate it, and continue without another outline generation. It only reuses results attributed to that failed step and attempt. Older runs require a non-overlapping model-attempt time window; uncertain or ambiguous matches use the normal reviewed retry path. Completed research stays saved, previous failures stay visible, and downstream model work can still use credits. No reimport is needed. Core **0.7.28+** remains the minimum; this update does not require a newer Core release.

Search queries retain the original question instead of reducing “How does AI work?” to “ai”. Section details are bounded and appended to that question. DuckDuckGo descriptions now stay with their own result titles when ads are skipped or a result has no snippet. Source-topic filtering and readable-page checks remain active; these do not guarantee factual accuracy.

# Workflows 0.3.14

Requires **KAI Core 0.7.28+**. Update Core and restart it first, then update Workflows from the in-app catalog. Core 0.7.28 removes the independent three-minute plugin API cutoff for model calls. Workflows now supports 5–600 seconds per model reply and defaults new Agent nodes to ten minutes. Recognized article workflow agents using the previous 180-second default upgrade to 600 seconds; custom timeouts and model order are preserved. Continuations remain bounded by the existing 15-minute response and token budgets.

**Retry failed work** appears on eligible failed model/research runs. After explicit review, it keeps the completed outline, sections and other steps, resumes the failed step, and refreshes its private source-reading chain when safe. It does not restart completed model steps or writes. Historical attempts remain visible. A failed model step may need recovery or a new generation and additional credits; it is never retried automatically. Unknown in-flight work and failed external writes cannot use this control. **Run again** still starts a complete new run.

Article section searches now use the topic and heading rather than long writing instructions. A configurable **Required source topic** excludes results and page excerpts without topic keywords, tries another provider when results are unrelated, and retries a shorter topic search when no readable evidence is found. This rejects the reported employment/English-grammar results for an AI article; keyword matching is a relevance filter, not factual verification. If no matching readable source is found, the research step stops clearly.

Existing recognized article definitions receive these default fixes without reimporting. Retrying an old eligible run also updates its recognized defaults and retains its original specification in retry history. Provider outages, unavailable models and poor generated content can still prevent completion; saved work remains available.

# Workflows 0.3.13

Agent nodes now support **Output format → JSON**, an optional JSON schema, and up to two format repairs. A JSON step completes only after the response parses and matches its contract. Fenced JSON is normalized; incomplete JSON continues even when a provider reports `stop` or omits its finish reason. Wrong shapes receive bounded complete repairs. Every accepted raw response is saved before acknowledgment, and all recovery calls share the output token budget, continuation limit, model policy and Core credit consent. Uncertain requests and denied credit approval are not retried.

Previously imported researched-article workflows with the original outline instructions automatically gain the JSON contract on update. It requires a title, the requested number of sections, and a heading with two requirements per section. Model selections, prompts, code, schedules and past run snapshots are preserved. Customized outline prompts can opt in through the Agent's Output format and JSON schema controls. The updated import example asks for shorter requirements to fit provider reply limits.

Update Workflows to **0.3.13** from the in-app catalog, then start a new run of the existing workflow. Core **0.7.25+** is required; no new Core or server deployment is required for JSON recovery. A failed historical run remains unchanged. Recovery may use additional credits within the configured limits; it cannot guarantee model quality or network availability.

Validation includes replaying the reported Gemma truncation, full article graph completion with synthetic responses, credit/error boundaries, saved-workflow migration and real Core native UI/bridge checks. These checks do not claim a live paid run on the user's provider computers.

## Previous release: Workflows 0.3.12

Choose a model once, then choose **Run on → Local only, Network only, or Local and network**. When both are allowed, choose **Local first** or **Network first**. Each primary and ordered fallback model has these controls, with separate availability shown for this computer and the network. Agent nodes can inherit the entire workflow policy or override it. Copilot and Discover also support model locations.

If a continuation's selected provider becomes unavailable, Workflows can use the next configured location or model only when Core confirms that the new request never started. It carries forward the accepted text and remaining output budget. Unknown outcomes, timeouts, declined credit approval and cancellation still stop the run. **Model results** shows the actual local or network route for each accepted part and network credit usage when available.

Existing workflows retain their original local/network choices, IDs, schedules and history. New exports use JSON format version 2; older imports remain supported. The researched-article example includes explicit location settings and retains its existing model order and prompts. Local means this computer, with no network credits; another computer on the same account is not automatically a local runtime.

Update Workflows from the in-app catalog. Core 0.7.25+ is required; Core 0.7.27 is recommended for transient network-check retries. Existing workflows need no reimport. For article workflows with Agent overrides, edit those controls or select **Use workflow model order** to inherit the workflow settings. Synthetic tests and native UI checks do not establish live provider availability or article quality.

## Previous release: Workflows 0.3.11

Choose a primary model and an ordered list of fallback models for each workflow. Agent steps can inherit that order or override it. Add, move and remove local or KAI network choices in the builder; JSON import/export and saved agents preserve the same order.

The Auto research, Auto outline and Auto writing menu entries are removed. Existing workflows using them migrate to explicit editable model lists, preserving workflow identities, schedules and previous run history. The researched-article example now includes explicit model lists.

Unavailable models are skipped. Fallback after a network rejection requires Core's explicit confirmation that generation never started. Declined credit consent, credit errors, timeouts, uncertain requests and partial replies stop rather than starting another generation. Network-capable nodes cannot repeat a possibly charged request through generic node retries.

Generation-limit errors now identify the output token budget, continuation count or empty unfinished reply, while preserving partial results.

Requires KAI Core 0.7.25 or later. Update Workflows from the in-app catalog; existing article workflows do not require reimporting. Synthetic routing, transfer, migration, renderer and native bridge checks do not establish live provider availability or model output quality.

## Previous release: Workflows 0.3.10

Fixes run controls appearing unresponsive when the article input is missing or a prior run is still active. Start failures now appear inside the run dialog and retain entered values. Workflows with declared inputs show separate fields with type validation, including topic and word count for researched articles.

Run again restores the selected run’s original input for review and editing. Starting a run shows progress, prevents duplicate submissions and opens the new run with history filters cleared. History polling preserves open forms. An existing running or paused run can be opened from the dialog for review or cancellation; it is never silently replaced.

Requires Core 0.7.25, which includes the network reply transport fix. Update Workflows from the in-app catalog. Existing workflows need no reimport. Verified with 75 plugin tests, browser checks and real Core native Start run / Run again checks using a synthetic profile and no paid operations.

## Previous release: 0.3.9

Fixes article agents timing out at 180 seconds while assembling several network replies. The configured model timeout now applies separately to each network reply, after the request reaches the front of the credit queue. Continuations have a 15-minute total response limit and keep the existing token and continuation budgets.

Individual reply timeouts now identify the actual time limit in run history. Completed parts remain in Network results; timed-out or uncertain credit requests are never automatically retried, and the queue stays occupied until Core settles the request. The editor explains the timeout behavior in all supported languages. Local model deadlines are unchanged.

Requires Core 0.7.24. Update Workflows in the in-app catalog after any active run finishes or is cancelled. Existing article workflow imports need no edits; run them again after the update.

## Previous release: 0.3.8

Automatic research, outline and writing models now refresh eligibility and try another suitable online model when Core confirms the previous selection failed before generation started. Selection is bounded to three attempts, recalculates the new model's output limit, and retains the same workflow credit permission.

Explicit model choices, partially delivered responses, cancelled requests and uncertain credit outcomes are not automatically restarted. Completed results record the actual model used. Local-Only and provider eligibility remain enforced.

Requires Core 0.7.24 for safe fallback. Update Core and restart it, then update Workflows in Plugins. Existing researched-article imports need no edits: open Run history and choose Run again.

## Previous release: 0.3.7

Adds Core-owned credit consent for an entire workflow run or ongoing plugin access. At the first network step, choose **Allow for Workflow** to cover all later agents, loops and continuations in this run, or **Allow Always** for future runs. **Allow once** remains available.

Granted workflows can run in the background. Core remembers Always access across restarts for the same plugin publisher and credit account; revoke it in **Core Settings → Access**. Cancelling, finishing or failing a workflow releases its run approval. Hidden runs without a grant pause for review. Local-Only, credit estimates, available balances and provider verification remain enforced.

Requires Core 0.7.23 for the new controls. Older Core retains per-request review. No additional manifest permissions. Includes consent, lifecycle, background execution and continuation regression coverage.

## Previous release: 0.3.6

Adds an importable researched-article workflow. Supply an article topic and a target of 200–5000 words. A researcher maps relevant topics, an outline agent creates headings and requirements, and a separate researcher and writer handle each section. The final output contains the article, source URLs, outline and actual word counts. There is no QA agent or clarification round.

Automatic network choices refresh Core availability before every agent and apply different preferences for research, outlining and prose. The concrete model is shown in credit review and saved with the result. Public web research reads source excerpts and fails when no page is readable. Local-Only, cancellation, public-address checks and existing credit review remain enforced; no new permissions are requested.

Bounded, separately reviewed continuations support Core's short reply limits without silently presenting a truncated article. Full output text remains visible in run history. Includes translations, import/graph validation and synthetic end-to-end coverage through 5000 words. Model rankings are task heuristics; prose quality and exact word count are not guaranteed without an editing pass. Requires Core 0.7.17 or newer.

## Previous release

Workflows 0.3.5

Import a workflow from a JSON file or paste its JSON directly from chat. Imported workflows open as new disabled drafts, with unique identities and names; review the nodes and selected model/connections before saving and running.

Export JSON is now visible on each workflow and in the builder. Builder export includes unsaved canvas changes. New files use a documented, versioned format and leave out run history, watch state and event registration IDs. Older plain KAI exports, the API export envelope and the existing OpenHuman format remain supported. Exported files containing non-English text can be reimported within the documented size limits.

Workflow Agent nodes, Copilot and Discover now support KAI network models as well as installed local models. Network-only and mixed workflows preserve their choices in JSON. Refresh the catalog to choose a model; network requests use Core credits with per-request cost review, respect Local-Only, and pause for review when the app is hidden. Possible charged failures are never automatically retried, and network results are saved before acknowledgment. The update adds the inference.network and wallet.authorize permissions.

Includes validation, cancellation/error handling, translations for all five interface languages, a JSON schema, and starter files for KAI release notes, bug report triage and SEO content briefs. Requires Core 0.7.17 or newer.

## Previous release

Workflows 0.3.4

Completes translation coverage for menus, forms, dialogs, tooltips and changing status text in English, Spanish, Brazilian Portuguese, French and German. Open views follow the language saved in Core Settings, including labels created after the view loads. Drafts, names, code and other user content remain intact.

Includes readable offline catalogs, reproducible generation, contributor documentation and regression tests for live language changes. Requires Core 0.7.17 or newer.

## Previous release

Workflows 0.3.3

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer.

## Previous release

Workflows 0.3.2

The sidebar now starts at the left edge, with consistent compact spacing, rounded blue selected buttons, hover states and keyboard focus. The same navigation design is used in Brain, Connections, Workflows and Agent Network. Narrow windows wrap navigation without hiding sections. Existing data and functionality are unchanged.
