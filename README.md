# KAI Workflows

The original KAI Workflows workspace, installed separately and opened in its own window. The plugin uses the original graph editor, workflow model, styles, templates, settings, run history, and Core workflow engine.

## Workspace and behavior

- **My workflows**, **Run history**, **Templates**, and **Discover workflows** use the original layout and controls.
- The full node library includes local agents and selected read tools, connected app actions, public HTTP requests, bounded JavaScript, Brain operations, branches, switches, merges, splitting, parsers, deduplication, loops, sub-workflows, approvals, and saved chat output.
- Manual runs, schedules, source changes, app changes, and live app events retain their original configuration and approval behavior. Copilot, previews, daily suggestions, validation, import/export, undo/redo, graph positioning and run snapshots use the original implementations.
- Existing workflows and run receipts come from the same encrypted profile. The plugin does not discard old graphs or hide historical runs because they predate the plugin.
- Schedules and active runs belong to the enabled feature, so closing its window does not end them. Disabling/uninstalling the plugin or quitting Core stops the feature.

Connected actions and Brain access run through reviewed Core services and preserve their original account grants and step approvals. Their separate editor windows are available through the Brain and Connections plugins. Rentals remain separate: Agent Network copies only compatible isolated service graphs and never gives a caller private Brain, connected accounts, or wallet access.

## Installation and security

Install the signed `.kaiplugin` release through KAI Core → Plugins, using the matching Core release. This renderer uses `window.kai.call` through the publisher-pinned Workflows broker. It has no Node integration, arbitrary IPC, direct network access, or access to account tokens. Workflow run results may contain the context you explicitly selected for that workflow.

Original runtime limits, privacy checks, step review, uncertain-action recovery and saved-profile guards remain in force. The former reduced plugin limits and manual-only behavior have been removed. Copy/export uses native clipboard or save dialogs without changing the editor layout.

## Source and checks

Original UI source: `therexdev/kaiapp` commit `34d17faa0526213b8fc0ac7a65aa7f2c186c6547`, `ui/workflows.js`, `ui/workflow-model.js`, and the original styles. Renderer changes are confined to the plugin shell, native clipboard bridge and dismissible notices.

Run `npm test` in this repository. In Core, run `node --test core/test-core/plugin-workflows.test.js` and the signed-plugin desktop smoke. Broker tests execute the real original graph engine against a synthetic profile, including Brain reads, selected app actions, code, saved chat output, schedules, native review and cancellation. They do not replace native platform or live external-service checks.

Packages are signed with the owner's existing publisher identity outside this repository. Never commit private signing keys.
