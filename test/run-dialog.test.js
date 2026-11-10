"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const M = require("../plugin/workflow-model"), KaiI18n = require("./i18n-fixture");
const source = fs.readFileSync(path.join(__dirname, "../plugin/workflows.js"), "utf8");
const article = () => ({ ...M.importDocument(require("../examples/researched-article.workflow.json")), id: "article", draft: false });
function fixture({ workflow = article(), runs = [], manage, polling = false } = {}) {
  const calls = [], timers = new Map(); let tick = 0, section = "runs";
  const state = { models: [], workflows: [workflow], runs, connections: [], sources: [], workflowState: {} };
  const notice = { textContent: "", classList: { toggle() {} } };
  const host = { isConnected: polling, innerHTML: "", closest: () => null, querySelector: s => s === ".wf-notice" ? notice : null, querySelectorAll: () => [] };
  const window = { KaiWorkflowModel: M, kai: { dialogs: { confirm: async () => true } } };
  vm.runInNewContext(source, { window, KaiI18n, setTimeout(fn) { const id = ++tick; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  const api = { state, section, manage: async (action, input) => { calls.push({ action, input }); return action === "status" ? state : manage ? manage(action, input) : { id: "new-run" }; }, navigate: async next => { section = next; render(); } };
  const render = () => window.KaiWorkflows.render(host, { ...api, section }); render();
  const click = (action, id = workflow.id) => host.onclick({ target: { closest: s => s === "[data-wf]" ? { dataset: { wf: action, id } } : null } });
  const submit = values => { const button = {}, form = { dataset: { wfForm: "run" }, elements: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }])), querySelector: () => button }; return host.onsubmit({ target: { closest: () => form }, preventDefault() {} }); };
  return { host, calls, state, click, submit, render, controller: window.KaiWorkflows, poll: async () => { const fn = [...timers.values()].at(-1); await fn(); } };
}
test("article starts expose required inputs and keep all edits after visible validation errors", async () => {
  const f = fixture(); await f.click("run");
  assert.match(f.host.innerHTML, /topic/); assert.match(f.host.innerHTML, /word_count/); assert.doesNotMatch(f.host.innerHTML, /Run input \(optional\)/);
  await f.submit({ runInput0: "", runInput1: "1200" });
  assert.equal(f.calls.length, 0); assert.match(f.host.innerHTML, /Enter run input: topic/); assert.match(f.host.innerHTML, /value="1200"/);
  await f.submit({ runInput0: "How does AI work?", runInput1: "1200.5" });
  assert.match(f.host.innerHTML, /must be integer/); assert.match(f.host.innerHTML, /How does AI work\?/); assert.equal(f.calls.length, 0);
  await f.submit({ runInput0: "How does AI work?", runInput1: "1200" });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), { action: "run", input: { id: "article", input: { topic: "How does AI work?", word_count: 1200 } } });
  assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/);
});
test("Run again reuses the selected run input, preserves extra values, and clears status filters", async () => {
  const workflow = article(), prior = { id: "old-run", workflowId: workflow.id, spec: workflow, status: "failed", input: { topic: "Prior <topic>", word_count: 1000, extra: { keep: true } }, steps: [] };
  const f = fixture({ workflow, runs: [prior] });
  assert.match(f.host.innerHTML, /data-wf="runAgain" data-id="old-run"/);
  f.host.onchange({ target: { dataset: { field: "runStatus" }, value: "failed" } });
  await f.click("runAgain", prior.id); assert.match(f.host.innerHTML, /Prior &lt;topic&gt;/); assert.match(f.host.innerHTML, /value="1000"/);
  await f.submit({ runInput0: "New topic", runInput1: "1500" });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].input.input)), { topic: "New topic", word_count: 1500, extra: { keep: true } });
  assert.doesNotMatch(f.host.innerHTML, /value="failed" selected/);
  assert.equal(prior.input.topic, "Prior <topic>");
});
test("backend start errors stay inside the dialog, retain input, and permit a corrected retry", async () => {
  let attempts = 0;
  const f = fixture({ manage: async () => { if (++attempts === 1) throw Error("This workflow already has a running or paused run."); return { id: "started" }; } });
  await f.click("run"); await f.submit({ runInput0: "Kept topic", runInput1: "800" });
  assert.match(f.host.innerHTML, /wf-run-error error" role="alert"[^>]*>.*running or paused run/s);
  assert.match(f.host.innerHTML, /Kept topic/); assert.match(f.host.innerHTML, /value="800"/); assert.doesNotMatch(f.host.innerHTML, /type="submit" class="primary" disabled/);
  await f.submit({ runInput0: "Kept topic", runInput1: "800" }); assert.equal(attempts, 2); assert.doesNotMatch(f.host.innerHTML, /wf-modal-backdrop/);
});
test("a pending start cannot be submitted twice or lose its busy guard through Close", async () => {
  let finish; const f = fixture({ manage: () => new Promise(resolve => { finish = resolve; }) });
  await f.click("run"); const pending = f.submit({ runInput0: "Topic", runInput1: "600" });
  assert.match(f.host.innerHTML, /Starting…/); assert.match(f.host.innerHTML, /type="submit" class="primary" disabled/);
  await f.click("closeModal"); assert.equal(await f.controller.canLeave(), false);
  await f.submit({ runInput0: "Duplicate", runInput1: "900" }); assert.equal(f.calls.length, 1);
  finish({ id: "started" }); await pending; assert.equal(await f.controller.canLeave(), true);
});
test("history polling never redraws an open run form, including a poll already in progress", async () => {
  const f = fixture({ polling: true }); const pending = f.poll();
  await f.click("run"); f.host.oninput({ target: { dataset: { runField: "0" }, value: "Editing during polling" } });
  const html = f.host.innerHTML; f.state.runs = [{ changed: true }]; await pending;
  assert.equal(f.host.innerHTML, html); const count = f.calls.length; await f.poll(); assert.equal(f.calls.length, count);
  f.state.runs = []; f.render(); assert.match(f.host.innerHTML, /Editing during polling/);
});
test("plain inputs and boolean, object, array and optional typed inputs reach the run without coercion loss", async () => {
  const workflow = article(); workflow.graph.nodes[0].config.inputFields = [];
  const f = fixture({ workflow, manage: async () => { throw Error("Retry later"); } }); await f.click("run"); await f.submit({ input: "plain input" });
  assert.equal(f.calls[0].input.input, "plain input"); assert.match(f.host.innerHTML, /plain input/);
  workflow.graph.nodes[0].config.inputFields = [{ name: "flag", type: "boolean", required: true }, { name: "options", type: "object" }, { name: "items", type: "array" }, { name: "empty", type: "string" }];
  const g = fixture({ workflow }); await g.click("run"); await g.submit({ runInput0: "false", runInput1: '{"x":2}', runInput2: '["a"]', runInput3: "" });
  assert.deepEqual(JSON.parse(JSON.stringify(g.calls[0].input.input)), { flag: false, options: { x: 2 }, items: ["a"] });
});
