"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { recoverSavedJSON } = require("../plugin/service/workflow-output-cache");
const schema = { type: "object", required: ["points"], properties: { points: { type: "array", minItems: 2, items: { type: "string" } } } };
const token = "root/planner/0", raw = '{"points":["one","two"}';
function run(identified = true) {
  return { retryHistory: [{}], steps: [{ token, type: "agent", status: "failed", at: 100, finishedAt: 200, error: "The model did not return JSON matching the required output. The 2-repair limit is exhausted." }, { token, type: "agent", status: "running", at: 300 }],
    networkCalls: [{ ...(identified ? { stepKey: token, attemptStartedAt: 100 } : {}), purpose: "generate", at: 150, completion: { choices: [{ message: { content: raw } }] } }] };
}
test("explicit retry can reuse a complete saved response, including the older unambiguous time-window format", () => {
  for (const identified of [true, false]) {
    const r = run(identified), before = structuredClone(r), result = recoverSavedJSON(r, token, schema);
    assert.deepEqual(JSON.parse(result.text), { points: ["one", "two"] }); assert.deepEqual(result.detail.callIndices, [0]); assert.deepEqual(r, before);
  }
});
test("saved recovery rejects wrong steps, ambiguous legacy windows, wrong schemas and unknown network outcomes", () => {
  assert.equal(recoverSavedJSON(run(), token, { $ref: "https://example.com/schema" }), null);
  for (const change of [r => { r.retryHistory = []; }, r => { r.steps[0].error = "The network reply timed out"; }, r => { r.networkCalls[0].stepKey = "another-step"; }, r => { r.networkCalls[0].attemptStartedAt = 99; }, r => { r.networkCalls[0].completion.choices[0].message.content = '{"points":["one"}'; }]) {
    const r = run(); change(r); assert.equal(recoverSavedJSON(r, token, schema), null);
  }
  const r = run(false); r.steps.push({ token: "parallel", type: "agent", at: 120, finishedAt: 180 });
  assert.equal(recoverSavedJSON(r, token, schema), null);
  // Adjacent sequential model calls are not an overlap.
  r.steps[2].finishedAt = 100; r.steps[2].at = 0; assert.ok(recoverSavedJSON(r, token, schema));
});
test("saved continuation and repair groups are assembled separately and choose a complete answer", () => {
  const r = run(); r.networkCalls[0].completion.choices[0].message.content = '{"points":["one",';
  const next = structuredClone(r.networkCalls[0]); next.purpose = "continue"; next.at = 160; next.completion.choices[0].message.content = '"two"}'; r.networkCalls.push(next);
  assert.deepEqual(recoverSavedJSON(r, token, schema).detail.callIndices, [0, 1]);
  next.purpose = "repair"; next.completion.choices[0].message.content = raw.replace("two", "three");
  const result = recoverSavedJSON(r, token, schema); assert.deepEqual(result.detail.callIndices, [1]); assert.deepEqual(JSON.parse(result.text).points, ["one", "three"]);
});
