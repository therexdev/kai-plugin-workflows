# AIO reviewed article

Use Workflows 0.3.24 or later with this two-pass workflow. The updated runner allows up to 2,000 steps and 500 loop frames so longer articles can apply both revisions without hitting the previous 500-step or 150-frame cap. Requires Core 0.7.28 or later. Open **Templates → AIO researched article**, or import `examples/aio-article.workflow.json`. Import creates a new draft and preserves your existing workflows and run history. Updating the plugin alone does not replace a saved/customized graph.

Start with a topic and a body word target of 200–2400. There is no intake interview. Optional `source_urls` supplies up to ten public reference pages. Evidence retrieval still checks topic relevance and readable source passages; unavailable pages and search snippets are not verified evidence.

## QA and revision policy

The outline, each section, and the publishing extras use the same sequence:

1. Run QA on the draft, including code checks and source/editorial review where applicable.
2. If corrections are required, apply the first revision.
3. Run QA once more on that revision.
4. If corrections are still required, apply the second and final revision, save it, and continue to the next stage. There is no third model QA pass or approval gate.

A passing review exits early. Each pass can contain a source audit and an editorial reviewer; neither reviewer runs more than twice for the same artifact. Source auditing still precedes editorial review for sections and extras. An outline receives both reviews together so the first revision can address both sets of findings. Invalid structured artifacts go directly to correction.

The default `revision_limit` is 2. Setting it to 1 permits one QA pass and its correction; 0 permits one QA pass with no correction. Values above 2 are capped at 2. A non-actionable finding whose evidence and requested replacement are identical may use the next available QA pass without paying a writer to copy it. This still consumes the same two-pass allowance.

The final revision is **not automatically approved**. The run continues with its latest draft and retains all findings and original review history. Its output may say **Needs review**, while the run itself is completed. Findings recorded before final edits are labeled as not rechecked. Source warnings and BLOCKER findings remain recorded; they do not halt progression after the correction allowance.

Code checks still measure word counts, citation IDs, required structure and forbidden phrases. They report remaining problems without reopening the model QA loop. The paragraph writer retains its existing single mechanical retry; model JSON repairs and network recovery have separate bounded limits. This change does not bypass invalid JSON, missing generation output, credit consent, provider failures or network timeouts.

## What runs

1. Retrieve topic evidence and produce a compact research brief.
2. Plan the whole heading list, generate each section's requirements, then apply the bounded outline QA/revision sequence.
3. Continue from the latest outline even when its last review requested changes. Allocate exact section word targets deterministically.
4. For each section, retrieve relevant passages, create a coaching card, verify its exact quotations, draft short paragraphs and apply the bounded section QA/revision sequence. Revisions target affected paragraphs and preserve unaffected text when the allowed word range permits it.
5. Generate the direct answer, takeaways, FAQ, metadata and social copy from the latest section drafts or approved summaries plus matched source quotations. Unapproved drafts remain explicitly labeled. Their statements are not evidence: extras must be supported by the original quotations. Apply the bounded extras QA/revision sequence.
6. Derive FAQ JSON-LD from the final visible FAQ, report final code checks and run one advisory cross-section review. This final report adds no revision loop and never blocks delivery on a QA verdict. Nothing publishes automatically.

A section edited after the final QA contributes its actual final text, not the stale pre-revision summary. Source IDs and matched quotations remain available even when a section carries findings. When every section needs review, the workflow still creates the publishing pack and includes the review report.

## Editing and evidence

**Article settings and context** holds audience, language, style, verified client facts, revision limit, word tolerance and forbidden phrases. These are workflow settings, not global editorial policy. Agent nodes hold editable primary/fallback models and allowed locations. The supplied models are defaults, not a guarantee of available providers. Never put secrets in an exported workflow.

Reviewers receive the current artifact and supplied evidence. Revisers receive actionable corrections; complete previous reviews and drafts remain in the run record. Distinct findings are retained even if the model reuses an ID. A reviewer cannot revive a resolved code-check finding from a previous count. Optional citation formatting changes in an outline remain advisory when the statement text is otherwise identical.

Outline corrections may target a heading, an exact point path such as `sections[3].points[0]`, or a uniquely matching point. Ambiguous or structural corrections regenerate the necessary plan parts. Paragraph revisions use actual preserved word counts and the configured tolerance, rather than unnecessarily replacing the entire section.

Default body word tolerance is 10%. The report gives actual counts; it does not pad, silently trim, or pretend the requested length was reached. Extras are additional to the body target. Citation normalization converts supplied parenthesized IDs into square-bracket IDs; unknown IDs remain visible as failures. Matching a quotation proves only that the words occur in the source, not that a model's paraphrase is correct. Models can miss errors, and completed output is not publication approval.

## Runtime and recovery

Network work uses Core credit consent. Continuations, JSON repairs and revisions can use credits within their configured limits. Availability checks and uncertain paid requests retain their existing recovery rules. **Retry failed work** reuses eligible completed work; **Run again** starts over.

The workflow change prevents unresolved QA verdicts from stopping drafting or withholding the publishing pack. It does not guarantee factual accuracy or an error-free provider/network response. Final output and warnings stay available for review.
