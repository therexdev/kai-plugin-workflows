# Reusable Quality Check node

Workflows 0.3.18 adds **Quality Check** to the Logic palette. Configure a value, one or more rules, a report field (default `quality`), and either return issues or stop on errors. The node preserves each input item and adds `{valid, issues, metrics}`. A Condition can route on `=item.quality.valid`; a bounded Loop can send issues to a reviser. Checks make no model or network calls.

| Rule | Configuration | Meaning |
| --- | --- | --- |
| Required fields | `values` | Listed immediate fields must have nonempty values. |
| JSON schema | `schema` | Uses the same supported schema subset as JSON Agents. |
| Words / characters | `min`, `max` | Unicode character count, or whitespace-delimited words excluding Markdown headings/citation markers. |
| Citations | `sources`, `style`, `min` | Presence and known IDs; supports `[S1-1]` and `[1]`, including comma/semicolon groups. |
| Forbidden / required phrases | `values` | Case-insensitive literal substring checks. |
| Exact value | `expected` | Structural equality, ignoring object key order; useful for visible-content/schema parity. |

Each rule may have a dot-separated `field` path and `severity` of `error` or `warning`. Warnings do not set `valid` to false. Limits, source/value lists and expected values accept `=` expressions. A known source can be an ID string, a number, an object with `id`, or a numbered source object with `n`. A Markdown hyperlink label is not counted as a source marker.

Limits: 1–40 rules, up to 100 values/sources per rule, count limits up to 200000. Source/phrase rules are deterministic validation, not semantic fact-checking or comprehensive language detection. Keep topic-specific requirements in the workflow.

Individual node values remain limited to 200 KB. QuickJS expression context, which contains earlier node outputs, has a separate 2 MiB aggregate limit and a 64 MiB memory limit. Existing evaluation deadlines still apply. This prevents a larger history from being mistaken for an oversized current output while keeping execution bounded.

Prompt text is not silently truncated. Public network requests still enforce the Core 24 KB message limit, so keep source packets, review instructions and artifacts concise.
