# KAI Workflows

A signed, sandboxed plugin for KAI Core API 2. Build reusable local agents and manual multi-step workflows; run them on installed models and inspect saved results.

## What works

- Agent profiles with a name, local model and instructions. Adding a saved agent snapshots its instructions into a workflow.
- A step builder for local AI prompts, saved agents, saved sub-workflows, human review, JSON/CSV/text parsing and output.
- Advanced version 2 graph editing for branches, transforms, merges and splitting. Expressions run in Core's bounded QuickJS environment.
- Native approval at review steps; cancellation; encrypted run history; JSON definition import/export.
- Original safe local workflows remain available. Incompatible legacy workflows and legacy run history stay preserved; private Brain and connected-account data never enter the plugin renderer.

This release runs manually while its window remains open. It does not schedule work, access Brain or accounts, execute native code, make network requests or publish rentals. Install Agent Network separately for supported service publication/discovery. Exported definitions contain prompts: review them before sharing. Sub-workflow references are local IDs and must be recreated on another installation.

## Installation

Install the signed `kai.workflows-0.1.0.kaiplugin` release asset through KAI Core → Plugins. The matching KAI Core release must include the `kai.workflows` reviewed broker and publisher pin. Source files alone are not an installable package.

## Architecture

`plugin/` contains browser-only HTML/CSS/JavaScript. It communicates only through `window.kai.call`. Privileged execution lives in `kai-core/electron/plugin-services/workflows.js`, backed by the shared version 2 workflow runtime. No native code or secret keys are packaged here.

Permissions: `models.read`, `workflows.read`, `workflows.write`, `workflows.run`. Core authenticates the publisher, plugin ID, window, entry URL, frame and individual operation before dispatch.

Bounds: 18 builder steps / 20 graph nodes, 60 total nodes including sub-workflows, four levels of nesting, two active workflows, 120 seconds per model step, 10 minutes per active run segment, 1,024 output tokens per model call. Inputs and results remain subject to the shared runtime's size limits. Native GPU and model performance depends on the installed model.

## Development and verification

```sh
npm test
# In the sibling kai-core checkout:
node --test core/test-core/plugin-workflows.test.js
```

The repository tests validate the shipped static entry and bridge usage. Core tests exercise actual sequential inference, saved agent/sub-workflow reuse, approvals, cancellation and private legacy-data preservation using synthetic isolated profiles. These tests do not certify native keychains or real model quality.

The release operator packages `plugin/` with Core's `scripts/core/pack-plugin.js` using the pinned Ed25519 publisher key kept outside the repository. Never commit a signing key.
