# KAI Workflows

Workflows is a self-contained KAI Foundation plugin. It owns agent definitions, the complete graph runner and editor, run snapshots, approvals, schedules, watch/event triggers, Copilot, suggestions and import/export. Its backend is bundled in `plugin/service`, its interface and assets in `plugin`, and its encrypted state lives in its own Core-assigned data directory. No feature engine or shared CompanionHub is imported from Core.

## Installation and trust

Version 0.3.0 requires manifest schema 2 / API 3 and the public native SDK v1. Install its signed `.kaiplugin` through Foundation → Plugins. The native backend runs with **full computer and application access**. It is not an OS sandbox. The interface remains a sandboxed renderer; that protects the renderer boundary, not the trusted native backend.

This release uses fresh plugin data. It does not open or migrate the old Koinos AI profile. Disabling/updating the plugin or quitting Core stops its owned work. Navigation and the Core tray keep enabled apps alive. No package installation scripts or npm commands run on the user's machine.

## Public service

The manifest declares `kai.workflows` as its provided service. Its methods are `list`, `get`, `listServices`, `exportService`, `propose`, `status`, `run`, `cancel`, `resume`. Other plugins declare this service in `consumes` and use `api.services.call(name, method, input, {signal})`. Methods accept JSON values. Core rejects remote/delegated service contexts. The provider retains approval authority; a caller cannot grant itself write approval.

Workflows consumes redacted connection metadata and Brain content through their services. Metadata is ephemeral; only workflow definitions/runs/agents/schedule state are saved. Selected connection actions and memory writes are executed by their owner. Agent Network may request `listServices` and `exportService` to copy a saved graph; hosted remote jobs must validate and run that copy in their separate restricted engine, never call these personal services.

QuickJS and cron-parser, their resolved dependencies, WebAssembly and licenses are bundled under `plugin/service/node_modules`; `plugin/service/dependencies.json` records pinned versions. Workflow code receives JSON values only, no host functions or Node objects, with time and memory limits.

## Checks

Run `npm test`. Tests cover the preserved UI, actual plugin-owned engine behavior, independent encrypted state, provider-owned review and missing-service failures. Workflows additionally tests bounded JavaScript, graph execution and a cross-plugin integration when the sibling Brain/Connections repos are present. These are synthetic local checks, not live provider/OAuth or native operating-system verification.

The original renderer/layout assets remain recorded in the existing provenance files. This does not require or restore the old runtime/profile structure.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.
