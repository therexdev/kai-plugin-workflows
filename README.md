# KAI Workflows

Workflows is a self-contained KAI Foundation plugin. It owns agent definitions, the complete graph runner and editor, run snapshots, approvals, schedules, watch/event triggers, Copilot, suggestions and import/export. Its backend is bundled in `plugin/service`, its interface and assets in `plugin`, and its encrypted state lives in its own Core-assigned data directory. No feature engine or shared CompanionHub is imported from Core.

## Installation and trust

Version 0.3.0 requires manifest schema 2 / API 3 and the public native SDK v1. Install its signed `.kaiplugin` through Foundation → Plugins. The native backend runs with **full computer and application access**. It is not an OS sandbox. The interface remains a sandboxed renderer; that protects the renderer boundary, not the trusted native backend.

This release uses fresh plugin data. It does not open or migrate the old Koinos AI profile. Disabling/updating the plugin or quitting Core stops its owned work. Navigation and the Core tray keep enabled apps alive. No package installation scripts or npm commands run on the user's machine.

## Public service

The manifest declares `kai.workflows` as its provided service. Its methods are `list`, `get`, `listServices`, `exportService`, `propose`, `status`, `run`, `cancel`, `resume`. Other plugins declare this service in `consumes` and use `api.services.call(name, method, input, {signal})`. Methods accept JSON values. Core rejects remote/delegated service contexts. The provider retains approval authority; a caller cannot grant itself write approval.

Workflows consumes redacted connection metadata and Brain content through their services. Metadata is ephemeral; only workflow definitions/runs/agents/schedule state are saved. Selected connection actions and memory writes are executed by their owner. Agent Network may request `listServices` and `exportService` to copy a saved graph; hosted remote jobs must validate and run that copy in their separate restricted engine, never call these personal services.

QuickJS and cron-parser, their resolved dependencies, WebAssembly and licenses are bundled under `plugin/service/node_modules`; `plugin/service/dependencies.json` records pinned versions. Workflow code receives JSON values only, no host functions or Node objects, with time and memory limits.

## Workflow JSON import and export

Workflows 0.3.5 adds visible **Import JSON** and **Export JSON** controls, file or pasted-JSON import, and a versioned `.workflow.json` format. Imports create new disabled drafts; exported definitions exclude run history and live event registrations. The builder can export its current unsaved canvas. Agent steps, Copilot and Discover can use installed local models or KAI network models; individual Agent nodes can override the workflow default. Network requests go through Core’s credit service with cost review. See the [sharing guide, format and starter workflows](docs/workflow-sharing.md).

## Checks

Workflows 0.3.6 includes an [importable researched-article workflow](examples/researched-article.workflow.json): topic discovery, a budgeted outline, and separate research and writing agents for every section. It tries configured primary and fallback network models in order, reads public source excerpts, and assembles a cited draft without a QA pass. See [article workflow usage and limits](docs/article-workflow.md).

Run `npm test`. Tests cover the preserved UI, actual plugin-owned engine behavior, independent encrypted state, provider-owned review and missing-service failures. Workflows additionally tests bounded JavaScript, graph execution and a cross-plugin integration when the sibling Brain/Connections repos are present. These are synthetic local checks, not live provider/OAuth or native operating-system verification.

The original renderer/layout assets remain recorded in the existing provenance files. This does not require or restore the old runtime/profile structure.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.

## Interface language

This plugin follows the language saved in KAI Core Settings and applies changes to open views. English, Spanish, Brazilian Portuguese, French and German are supported through bundled offline catalogs. User content and identifiers stay literal. These source changes require Core 0.7.17+ for the live locale API; release the Core update before publishing a new signed plugin package and catalog entry. See the [public localization API](https://github.com/therexdev/kai-core/blob/main/docs/foundation/PLUGIN_AUTHOR_GUIDE.md#shared-language-and-localization-core-0717).

[Interface language and translation guide](docs/localization.md).

Workflows 0.3.7 uses Core 0.7.23 credit consent: **Allow for Workflow** authorizes the rest of the current run, and **Allow Always** permits future runs. Manage ongoing permissions in **Core Settings → Access**. Granted runs can continue in the background; without a grant, unattended network steps pause for review.

Workflows 0.3.8 with Core 0.7.24 refreshes and reselects automatic network models when Core confirms no generation was dispatched. It tries at most three selections and preserves explicit model choices, partial answers and credit recovery. Update Core first, then Workflows; existing article workflow imports need no changes.

Workflows 0.3.9 applies a graph agent’s model timeout to each network reply after it leaves the credit queue. Continuations have a 15-minute total response deadline, with the existing generation budget. Completed parts remain in Network results; a timed-out request is never automatically retried. Existing article workflows do not need to be reimported.

Workflows 0.3.12 gives each primary and fallback model a separate **Run on** choice: **Local only**, **Network only**, or **Local and network**. When both are allowed, choose **Local first** or **Network first**. Existing definitions preserve their original locations. JSON version 2, saved agents and workflow assistance keep the full policy. Continuations can advance only when Core confirms the new request never started, preserving accepted text and remaining budget. See [configuration and execution rules](docs/workflow-sharing.md#primary-and-fallback-models).

## Structured agent output

Choose **Output format → JSON** on an Agent to require parseable JSON before downstream nodes run. Leave **JSON schema (optional)** empty for any JSON value, or define the required shape. Supported schema keywords are `type` (a single object, array, string, number, integer, boolean or null), `properties`, `required`, `items`, `additionalProperties` (boolean), `enum`, `description`, `minItems`, `maxItems`, `minLength`, `maxLength`, `minimum` and `maximum`. Other keywords, including remote references, are rejected before generation. Numeric bounds can use workflow expressions such as `"=nodes.brief.section_count"`.

JSON strings wrapped in a Markdown fence are parsed and re-serialized without the fence. Incomplete strings/containers trigger continuation even if the provider reports `stop`. Complete but malformed JSON or a schema mismatch can request a corrected complete response, at most twice (configurable as 0–2). All calls share the Agent's **Output token budget** and **Maximum continuations** (default four for JSON when unset). Setting continuations to zero disables further generation. Raw parts remain in Model results; only validated JSON reaches the Agent output's `json` field and canonical `text` field. Text-mode behavior is unchanged. Selected read-tool requests are validated by the existing selected-tool checks and may precede a final JSON answer.

Provider APIs do not yet expose constrained JSON decoding through the public Core network request contract. These checks enforce what the workflow accepts, not what a model can always generate. Exhaustion fails at the Agent with a specific reason and saved responses; unknown/denied paid requests never trigger blind retry. No incomplete outline is silently filled with invented sections.

## Slow requests and failed sections

With Workflows 0.3.14 and Core 0.7.28, each Agent reply can wait 5–600 seconds (new default: 600), within the 15-minute total response limit. Update and restart Core before installing the plugin update. Known article imports automatically upgrade the old 180-second default while preserving custom model policies and timeout settings.

Use **Retry failed work** on an eligible failed run to preserve completed sections and restart the failed model, web research, or pure Condition step. A condition retry retains the completed model response it was routing. A model step's private source-reading chain is refreshed when safe. Review is explicit because a timed-out request may require recovery or another paid generation. Old attempts and accepted model parts remain in history. **Run again** starts over. Runs with uncertain in-flight work or failed external writes require their existing recovery path.

Web research can specify **Required source topic (optional)**. Topic keywords anchor a concise search and filter search results and read excerpts; an unsuccessful section query falls back to the shorter topic query. No readable matching evidence produces a clear research error. This heuristic helps remove off-topic results, but does not validate claims. The article example uses the original topic and section heading automatically.

## Local JSON correction and saved output recovery

Workflows 0.3.15 corrects up to eight missing JSON container closers where an existing closing bracket or brace establishes the boundary. It changes punctuation only, then requires parsing and the complete output schema to pass. Truncated strings/tails, missing data, incorrect section counts, and tool arguments are never filled in. Original replies and receipts remain visible; a note identifies a local correction without another paid model call.

On **Retry failed work**, a JSON Agent without selected tools can reuse its saved failed-attempt output when the corrected response validates. New results carry exact step/attempt identifiers. Older results require an unambiguous time window with no overlapping model step. The recovered step is labeled; future steps still run normally and may use credits. Unknown network outcomes and unrelated/ambiguous results are not reused. Existing retry review and credit permissions apply.

### Interrupted network output

Network Agents save verified partial replies from terminal provider jobs and continue within the step's existing limits. After an interrupted job, the next selected fallback route is preferred and the requested chunk size is reduced; if fallbacks are unavailable the original allowed route remains eligible. This uses the public Core credits API and normal workflow consent. A charged prefix is not treated as completed prose, and JSON still must satisfy the complete output contract. Unknown or still-running outcomes stop without starting replacement work. Model results retain the original receipt and identify partial replies. Core 0.7.28+ is supported.

## Reusable quality checks and AIO articles

Workflows 0.3.18 adds a configurable Quality Check node and verified-overlap text continuations. The new **AIO researched article** template keeps editorial policy in the workflow: research, outline review, per-section coaching/writing/revision, cited evidence, answer/FAQ/metadata/social outputs from reviewed section summaries, derived FAQ schema and a final review report. Unresolved drafts are labeled **Needs review**, not silently approved. Existing workflows are preserved; import the new template to use this pipeline. See [AIO setup and limits](docs/aio-article-workflow.md) and [reusable quality rules](docs/quality-checks.md).

Workflows 0.3.19 builds and revises outlines and publishing extras in small validated parts. Invalid JSON prefixes use bounded repair instead of repeated continuation calls. Import the updated AIO template to use the smaller tasks; existing custom graphs are preserved.

Workflows 0.3.20 selects relevant passages across all supplied reference URLs, retains nearby context, and adds independent source audits to the AIO template. Section and total word budgets are required checks; unmatched coaching quotations and unresolved section summaries cannot supply the publishing extras. Import the updated template to adopt these changes.
