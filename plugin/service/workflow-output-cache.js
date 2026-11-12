"use strict";
const Output = require("../workflow-output");

// An explicit retry may reuse a paid answer that the previous parser rejected.
// It must belong to this exact failed attempt and satisfy today's full schema.
// Older releases lack step IDs: accept their time window only if no other model
// attempt overlaps it. Ambiguous, interrupted or unrelated results are ignored.
function recoverSavedJSON(run, token, schema) {
  if (!run.retryHistory?.length) return null;
  const failed = [...run.steps].reverse().find(s => s.token === token && s.status === "failed");
  if (!failed || !/^The model did not return JSON matching the required output\./.test(failed.error || "") || !Number.isFinite(failed.at) || !Number.isFinite(failed.finishedAt)) return null;
  try { Output.checkSchema(schema); } catch { return null; }
  const overlapping = run.steps.some(s => s !== failed && s.type === "agent" && s.at < failed.finishedAt && (s.finishedAt ?? Infinity) > failed.at);
  let answer = "", parts = [], started = false, recovered = null;
  for (const [index, call] of (run.networkCalls || []).entries()) {
    const identified = call.stepKey !== undefined;
    if (identified ? call.stepKey !== token || call.attemptStartedAt !== failed.at
      : overlapping || !Number.isFinite(call.at) || call.at < failed.at || call.at > failed.finishedAt) continue;
    const text = call.completion?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.length > 200000) return null;
    if (call.purpose === "generate" || call.purpose === "repair") { answer = ""; parts = []; started = true; }
    else if (call.purpose !== "continue" || !started) continue;
    answer += call.purpose === "continue" ? Output.continuationText(text) : text; parts.push(index); if (answer.length > 200000) return null;
    let checked = Output.inspect(answer, schema);
    if (!checked.valid && call.purpose === "continue") { const replacement = Output.inspect(text, schema); if (replacement.valid) { checked = replacement; parts = [index]; } }
    if (checked.valid) recovered = { text: checked.text, detail: { source: "saved-model-results", callIndices: [...parts], previousAttemptAt: failed.at, ...(checked.recovery ? { outputRecovery: checked.recovery } : {}) } };
  }
  return recovered;
}
module.exports = { recoverSavedJSON };
