# Workflows 0.3.5

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
