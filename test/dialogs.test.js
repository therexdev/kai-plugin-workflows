"use strict";
const localeFixture = require("./i18n-fixture");
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../plugin/workflows.js"), "utf8"), M = require("../plugin/workflow-model");
function fixture({ state: initial = {}, manage } = {}) {
  let answer; const calls = [], reviews = [];
  const state = { models: [], workflows: [], runs: [], connections: [], sources: [], workflowState: {}, ...initial };
  const message = { textContent: "", classList: { toggle() {} } };
  const host = { isConnected: false, innerHTML: "", querySelector: selector => selector === ".wf-notice" ? message : null, querySelectorAll: () => [] };
  const window = { KaiWorkflowModel: M, kai: { dialogs: { confirm(message) { reviews.push(message); return new Promise(resolve => { answer = resolve; }); } } } };
  vm.runInNewContext(source, { window, setTimeout: () => 0, clearTimeout() {}, KaiI18n: localeFixture });
  const render = () => window.KaiWorkflows.render(host, { state, section: "saved", manage: async (action, input) => { calls.push({ action, input }); return action === "status" ? state : manage ? manage(action, input) : {}; } }); render();
  const click = (action, id = "") => host.onclick({ target: { closest: selector => selector === "[data-wf]" ? { dataset: { wf: action, id } } : null } });
  const change = value => host.oninput({ target: { dataset: { field: "label" }, value } });
  const paste = value => host.oninput({ target: { id: "wf-import-json", value } });
  const submit = value => { const button = {}, form = { dataset: { wfForm: "import" }, elements: { workflowJSON: { value } }, querySelector: () => button }; return host.onsubmit({ target: { closest: () => form }, preventDefault() {} }); };
  return { api: window.KaiWorkflows, host, calls, reviews, answer: value => answer(value), click, change, paste, submit, render };
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
  const f = fixture({ state: { workflows: [{ ...M.template("ask"), id: "saved-flow" }] } }); await f.click("run", "saved-flow"); assert.match(f.host.innerHTML, /aria-label="Close dialog"/);
  await f.click("closeModal"); assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/); assert.equal(f.calls.length, 0);
  await f.click("run", "saved-flow"); f.host.onkeydown({ key: "Escape" }); assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/); assert.equal(f.calls.length, 0);
});

test("import dialog offers file and paste routes and cancellation never imports", async () => {
  const f = fixture(); assert.match(f.host.innerHTML, /Import JSON/);
  await f.click("import"); assert.match(f.host.innerHTML, /Choose JSON file/); assert.match(f.host.innerHTML, /Import as draft/);
  f.paste('{"name":"unsent"}'); await f.click("closeModal"); assert.equal(f.calls.length, 0);
  await f.click("import"); f.host.onkeydown({ key: "Escape" }); assert.equal(f.calls.length, 0);
  assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/);
});
test("failed paste retains the user's JSON and shows the error inside the dialog", async () => {
  const f = fixture({ manage: async () => { throw Error("Invalid JSON. Paste the complete workflow document and try again."); } });
  await f.click("import"); await f.submit('{"broken":');
  assert.match(f.host.innerHTML, /Invalid JSON/); assert.match(f.host.innerHTML, /&quot;broken&quot;/);
  assert.match(f.host.innerHTML, /role="alert"/); assert.equal(f.api.isEditing(), false);
});
test("article imports render web research nodes and explicit model order in the builder", async () => {
  const text = fs.readFileSync(path.join(__dirname, "../examples/researched-article.workflow.json"), "utf8");
  const draft = { ...M.importDocument(JSON.parse(text)), id: "article-draft", draft: true };
  const f = fixture({ manage: async action => action === "importWorkflow" ? draft : {} });
  await f.click("import"); await f.submit(text);
  assert.equal(f.api.isEditing(), true);
  assert.match(f.host.innerHTML, /Web research/);
  assert.match(f.host.innerHTML, /Primary model/);
  assert.match(f.host.innerHTML, /Fallback models/);
  assert.doesNotMatch(f.host.innerHTML, /KAI network · Auto /);
  assert.match(f.host.innerHTML, /Workflow settings/);
});
test("successful paste opens the imported draft settings, while a cancelled file picker keeps the paste", async () => {
  const w = { ...M.template("ask"), id: "imported", draft: true, enabled: false };
  const f = fixture({ state: { workflows: [w] }, manage: async (action, input) => input?.text ? w : null });
  await f.click("import"); f.paste("retained input"); await f.click("importFile");
  f.render();
  assert.match(f.host.innerHTML, /retained input/); assert.equal(f.api.isEditing(), false);
  await f.submit(JSON.stringify(w)); assert.equal(f.api.isEditing(), true);
  assert.match(f.host.innerHTML, /Workflow settings/); assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/);
  assert.equal(f.calls[1].action, "importWorkflow"); assert.equal(JSON.parse(f.calls[1].input.text).name, w.name);
});
test("builder export sends the current unsaved canvas and leaves edits intact", async () => {
  const f = fixture({ manage: async () => true });
  await f.click("new"); f.change("Unsaved trigger label");
  assert.match(f.host.innerHTML, /Export JSON/);
  await f.click("exportCanvas");
  assert.equal(f.calls[0].action, "exportWorkflow");
  assert.equal(f.calls[0].input.workflow.graph.nodes[0].label, "Unsaved trigger label");
  assert.equal(f.api.hasUnsavedChanges(), true);
});
