# Workflows 0.3.18

- Adds a reusable Quality Check node with editable required-field, schema, count, citation, phrase and equality rules. Reports can drive workflow branches and bounded revisions.
- Adds verified-overlap prose continuation joining, preserving split words, whitespace, hyphens and links. Original paid replies remain in history; boundary correction is bounded and can advance to the next configured model after a terminal invalid reply.
- Adds the AIO researched-article template: compact structured evidence and coaching briefs, strategy, reviewed outline, section coaching, writing and targeted revisions, answer/FAQ/metadata/social pack, derived FAQ schema and final checks. Mechanical failures go directly to bounded revision; source-ID parentheses are normalized before citation validation. Remaining issues produce a visible Needs review report.
- Handles separately fenced JSON continuations and exact echoed schemas without corrupting the assembled value; saved replies can be recovered by Retry failed work without generation when their input evidence is unchanged and they satisfy the complete schema.
- Adds lightweight search fallback, last-resort topic-term searches and optional reference URLs for public web research. Slow page reads run in bounded batches; reaching the research deadline preserves verified evidence already retrieved.
- Preserves existing custom workflows and their continuation behavior. Import the new template to adopt the editorial pipeline.
- Separates bounded accumulated expression context from individual node-output limits and removes silent prompt truncation.

Requires Core 0.7.28 or later. No Core update is needed if that version is already installed. Provider availability and model quality still affect runs; completed work and review findings are retained for recovery.
