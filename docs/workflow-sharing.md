# Importing, exporting and authoring workflows

Available in Workflows **0.3.5**. Requires Core 0.7.17 or newer, as before.

## Import a file or a workflow from chat

1. Open **Workflows → My workflows → Import JSON**.
2. Choose **Choose JSON file**, or paste the entire document and click **Import as draft**. A single fenced `json` block copied from chat is also accepted.
3. The new draft opens in **Settings**. Choose a **Default model** for Agent nodes that use the workflow default. Inspect any node with a model override, connection, Brain source, or sub-workflow reference and select the corresponding resource. Use **Refresh network models** to load current KAI network choices.
4. Click **Validate**, resolve any remaining errors, then **Save workflow**.
5. Click **Run** and enter the input. To use a schedule or event trigger, review its settings and explicitly enable automatic triggers.

Import always creates a new identity. Existing workflows and their run history are never overwritten. Duplicate names receive ` (imported)`, ` (imported 2)`, and so on. A file that requests enabled triggers still imports as a disabled draft. Import does not execute code, run models, register events, or grant access to write actions.

Invalid files leave existing data intact. Cancelling the file picker imports nothing; pasted text stays available. If pasted JSON is invalid, its text and the error remain in the dialog for correction.

## Export

Click **Export JSON** on a workflow row or in the builder, then choose where to save the `.workflow.json` file. Builder export includes the current canvas, including unsaved changes; it does not save or enable that workflow. Cancelled exports create no file.

Exports include the name, description, model aliases, graph, prompts, node settings and layout. They omit workflow identity, revision, run history, scheduling/watch cursors, approvals, legacy chat references and live event registration IDs. Connected-account credentials are owned by Connections and are not bundled. Prompts, request bodies, URLs, code and sample outputs are included as authored; review their contents before sharing a file.

Connection, source and sub-workflow IDs are references, not copies of those resources. Choose matching local resources after importing on another machine. Referenced sub-workflows must be transferred separately, then selected in their parent node. Model aliases are retained, but model weights are not bundled. Event subscriptions are registered for the recipient only when they enable the reviewed workflow.

## Local and KAI network agents

In **Settings**, choose a **Default model**. Each Agent node has its own **Model** override, or can use the workflow default. Labels distinguish **Local** from **KAI network**. Click **Refresh network models** in Settings or an Agent inspector to load the current catalog. Unavailable selections stay visible so a failed refresh cannot silently replace the model saved in your workflow. A computer with no local model can run a network-only workflow.

The JSON `model` field stores the exact choice: a local alias or `koinos-network:<model ID from Core's catalog>`. Agent nodes use `config.model` for overrides; an empty string inherits the workflow default. Do not invent a network model ID. Neither import nor export requires a live provider, and a missing provider never causes an automatic route change.

Network work uses Core's public credit APIs and requires the plugin's `inference.network` and `wallet.authorize` permissions. Core 0.7.23 offers **Allow once**, **Allow for Workflow**, and **Allow Always**. Allow for Workflow covers the current execution, including agent turns, section loops and continuations. It expires on completion, failure, cancellation, plugin shutdown or Core restart. A later run gets a new scope. Paused runs retain their scope while Core remains open.

Allow Always permits this plugin to use the same credit account in future runs, including scheduled background work and after restart. Revoke it in **Core Settings → Access**. Each request still checks current availability, account identity, privacy mode and credit limits. No grant buys credits or authorizes KOIN transfers. Without an applicable grant, hidden schedules and event runs pause for review; open Workflows and choose **Review & resume**. On older Core versions the plugin retains per-request review. Preview uses sample outputs and never requests a network generation.

Parallel network requests are serialized within the plugin to protect Core's credit recovery journal. A possibly charged failure is not automatically retried, even if the node has compute retries configured. Cancellation reaches the pending request; it cannot undo usage already incurred. Network answers and their returned usage/receipt metadata are saved before delivery acknowledgment and remain visible under **Network results** in run history. Runtime credit results and approvals are excluded from workflow exports.

The same model choices are available to Copilot and Discover. Automatic network suggestions require the visible app and a cost review; local suggestions continue to work in the background.

## JSON format, version 1

Use a UTF-8 `.json` file. The recommended envelope is:

```json
{
  "format": "kai.workflow",
  "version": 1,
  "workflow": {
    "name": "Echo input",
    "description": "Keep supplied input in run history.",
    "model": "",
    "enabled": false,
    "graph": {
      "version": 2,
      "nodes": [
        {
          "id": "start",
          "type": "trigger",
          "label": "Run manually",
          "position": { "x": 100, "y": 60 },
          "config": { "kind": "manual" }
        },
        {
          "id": "result",
          "type": "output",
          "label": "Keep result",
          "position": { "x": 100, "y": 230 },
          "config": { "text": "{{input}}", "saveChat": false }
        }
      ],
      "edges": [
        { "id": "start:main:result:main", "from": "start", "to": "result", "port": "main", "input": "main" }
      ]
    }
  }
}
```

The [JSON Schema](workflow.schema.json) describes the envelope and structural fields. The runner also validates graph semantics and local dependencies. Supported node types, default settings and output ports are defined in [workflow-model.js](../plugin/workflow-model.js). Use `{{input}}` for the run input and `{{previous}}` for the previous result. Expressions start with `=` and use the existing bounded JavaScript environment.

Use one trigger, 1–60 nodes, and at most 160 edges. Node IDs must start with a letter and contain only letters, numbers, `_` or `-`, with a maximum of 64 characters. Close cycles through a bounded Loop node. Missing setup, such as an unselected connection, can be corrected in a draft; malformed node types, references, unsupported versions and unbounded graph cycles are rejected during import. Files are limited to 1 MiB; the existing runner limit of 150,000 JSON characters per graph still applies.

For compatibility, the importer also accepts older plain KAI workflow definitions, legacy `steps` documents, the existing `{ "schema": 1, "runtimeVersion": 2, "workflow": ... }` API envelope, and the previously supported OpenHuman `flow` format. New file exports use `kai.workflow` version 1. The `workflows.export` API keeps its existing envelope but now returns a definition without runtime state. The `exportService` API used by Agent Network is unchanged.

## Starter workflows

Workflows **0.3.6** also includes [Researched article](../examples/researched-article.workflow.json). Give it `{"topic":"Your article topic","word_count":1800}`. It fetches web evidence and uses automatic task-specific network routing for topic research, outlining, and a researcher/writer pair per section. See [setup, credit reviews and limits](article-workflow.md).

| File | Input to paste when running | Result |
| --- | --- | --- |
| [KAI release notes](../examples/kai-release-notes.workflow.json) | Commit/change notes, release status, test results and update steps | A public update distinguishing released work from pending work |
| [Bug report triage](../examples/bug-triage.workflow.json) | A bug report, environment details and redacted logs | A structured issue, hypotheses, verification steps and regression checklist |
| [SEO content brief](../examples/seo-content-brief.workflow.json) | Client/audience goals, keywords, existing URLs and relevant performance data | A content brief with an outline, internal link suggestions and evidence gaps |

All three use a manual trigger, two Agent steps and a result in run history. Choose an installed local model or refresh and choose a KAI network model as the default before saving. You can also override the model on individual Agent nodes to mix local and network inference. They do not fetch live sources, publish, send messages or write to Brain. Their output quality depends on the selected model and the supplied input. Automated tests exercise import, save and execution with synthetic local and network model responses; they do not evaluate writing quality on a real model.

## Release validation

Run `npm test`, `node scripts/verify-package.js --source` and the native integration tests with sibling Brain and Connections repositories available. Before publishing, exercise the native file pickers in installed Core on Windows, macOS and Linux; verify cancellation, Unicode filenames, re-import, locale changes and draft review. Then follow the existing publisher signing and catalog process in the README. Source validation and a version bump alone do not create a signed update.
