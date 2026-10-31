"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../plugin/workflows.js"), "utf8"), M = require("../plugin/workflow-model");
function fixture() {
  let answer; const calls = [], reviews = [];
  const state = { models: [], workflows: [], runs: [], connections: [], sources: [], workflowState: {} };
  const message = { textContent: "", classList: { toggle() {} } };
  const host = { isConnected: false, innerHTML: "", querySelector: selector => selector === ".wf-notice" ? message : null, querySelectorAll: () => [] };
  const window = { KaiWorkflowModel: M, kai: { dialogs: { confirm(message) { reviews.push(message); return new Promise(resolve => { answer = resolve; }); } } } };
  vm.runInNewContext(source, { window, setTimeout: () => 0, clearTimeout() {}, KaiI18n: { html: (parts, ...values) => typeof parts === "string" ? parts : parts.reduce((out, part, i) => out + part + (values[i] ?? ""), "") } });
  window.KaiWorkflows.render(host, { state, section: "saved", manage: async (action, input) => { calls.push({ action, input }); return action === "status" ? state : {}; } });
  const click = (action, id = "") => host.onclick({ target: { closest: selector => selector === "[data-wf]" ? { dataset: { wf: action, id } } : null } });
  const change = value => host.oninput({ target: { dataset: { field: "label" }, value } });
  return { api: window.KaiWorkflows, host, calls, reviews, answer: value => answer(value), click, change };
}
test("dirty workflow Back waits for an explicit decision and preserves declined edits", async () => {
  const f = fixture(); await f.click("new"); f.change("Edited trigger"); assert.equal(f.api.hasUnsavedChanges(), true);
  const pending = f.click("back"); assert.equal(f.api.isEditing(), true); assert.equal(f.calls.length, 0);
  f.answer(false); await pending; assert.equal(f.api.isEditing(), true); assert.equal(f.api.hasUnsavedChanges(), true); assert.equal(f.calls.length, 0);
  const approved = f.click("back"); f.answer(true); await approved; assert.equal(f.api.isEditing(), false); assert.equal(f.api.hasUnsavedChanges(), false);
});
test("a discard review cannot authorize edits made after the reviewed snapshot", async () => {
  const f = fixture(); await f.click("new"); f.change("First edit"); const pending = f.api.canLeave();
  f.change("New edit after review"); f.answer(true); assert.equal(await pending, false); assert.equal(f.api.hasUnsavedChanges(), true);
});
test("workflow deletion never treats a pending or declined dialog as approval", async () => {
  const f = fixture(), pending = f.click("delete", "kept-workflow"); assert.equal(f.calls.length, 0);
  f.answer(false); await pending; assert.equal(f.calls.length, 0);
  const approved = f.click("delete", "reviewed-workflow"); f.answer(true); await approved;
  assert.equal(f.calls[0].action, "removeWorkflow"); assert.equal(f.calls[0].input.id, "reviewed-workflow");
});

test("closing the run form with X or Escape never starts a workflow", async () => {
  const f = fixture(); await f.click("run", "saved-flow"); assert.match(f.host.innerHTML, /aria-label="Close dialog"/);
  await f.click("closeModal"); assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/); assert.equal(f.calls.length, 0);
  await f.click("run", "saved-flow"); f.host.onkeydown({ key: "Escape" }); assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/); assert.equal(f.calls.length, 0);
});
