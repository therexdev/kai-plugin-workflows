"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const Model = require("../plugin/workflow-model"), Transfer = require("../plugin/service/workflow-transfer");
const { fixture } = require("./helper"), { create } = require("../plugin/service");
const { CompanionStore } = require("../plugin/service/companion-store"), { createInference } = require("../plugin/service/workflow-inference");
const net = id => "koinos-network:" + id;
const reply = (text = "done", finish_reason = "stop") => ({ choices: [{ message: { content: text }, finish_reason }], usage: { completion_tokens: 8 } });
const unavailable = () => Object.assign(Error("Provider left before generation"), { code: "network-model-unavailable", safeToRetry: true });
function setup(t) {
  const f = fixture(t, "kai.workflows"), requests = [], saved = [];
  f.api.network.models = async () => ["a", "b", "c", "d", "unselected"].map(model => ({ model, available: true, maxOutput: 32 }));
  f.api.wallet = { authorize: async () => ({}), complete: async request => { requests.push(request.model); return reply(); } };
  return { ...f, requests, saved, inference: createInference(f.api, result => saved.push(result)) };
}
async function terminal(app, id) {
  for (let i = 0; i < 200; i++) {
    const run = await app.call("workflows.runGet", { id });
    if (["completed", "failed", "waiting"].includes(run.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail("Run did not settle");
}
test("ordered fallbacks skip offline primaries and never rank or add unselected models", async t => {
  const f = setup(t);
  f.api.network.models = async () => [{ model: "a", available: false }, { model: "c", available: true }, { model: "b", available: true }, { model: "unselected", available: true }];
  assert.equal(await f.inference.run({ model: net("a"), fallbackModels: [net("b"), net("c")], prompt: "Order matters" }), "done");
  assert.deepEqual(f.requests, [net("b")]);
  assert.equal(f.saved[0].requestedModel, "a"); assert.equal(f.saved[0].model, net("b"));
  await assert.rejects(f.inference.run({ model: net("missing"), prompt: "No implicit fallback" }), /None of the selected/);
  assert.equal(f.requests.length, 1);
});
test("every selected model is tried once in order after proven pre-generation unavailability", async t => {
  const f = setup(t);
  f.api.wallet.complete = async request => { f.requests.push(request.model); if (request.model !== net("d")) throw unavailable(); return reply("fourth"); };
  assert.equal(await f.inference.run({ model: net("a"), fallbackModels: [net("b"), net("c"), net("d")] }), "fourth");
  assert.deepEqual(f.requests, ["a", "b", "c", "d"].map(net));
});
test("local and network models can be mixed explicitly without inventing paid fallback", async t => {
  const f = setup(t); let catalogs = 0, local = 0;
  const catalog = f.api.network.models;
  f.api.network.models = async () => { catalogs++; return catalog(); };
  f.api.models.chat = async () => { local++; return reply("local"); };
  assert.equal(await f.inference.run({ model: "local-test", fallbackModels: [net("a")] }), "local");
  assert.equal(catalogs, 0); assert.equal(f.requests.length, 0);
  assert.equal(await f.inference.run({ model: "missing-local", fallbackModels: [net("a")] }), "done");
  assert.deepEqual(f.requests, [net("a")]);
  assert.equal(await f.inference.run({ model: net("missing"), fallbackModels: ["local-test"] }), "local");
  assert.equal(local, 2);
});
test("declines, uncertain failures, timeouts and uncertain continuations never move to a ready fallback", async t => {
  for (const scenario of ["declined", "unknown", "code-only", "partial", "cancel", "privacy", "timeout", "credits"]) {
    const f = setup(t), controller = new AbortController();
    f.api.wallet.complete = async request => {
      f.requests.push(request.model);
      if (scenario === "partial" && f.requests.length === 1) return reply("paid prefix", "length");
      if (scenario === "cancel") controller.abort();
      if (scenario === "privacy") f.api.network.status = () => ({ privacyMode: "local-only" });
      const e = scenario === "timeout" ? new DOMException("Timed out", "TimeoutError") : Error(scenario);
      if (["partial", "cancel", "privacy", "code-only"].includes(scenario)) e.code = "network-model-unavailable";
      if (["cancel", "privacy"].includes(scenario)) e.safeToRetry = true;
      throw e;
    };
    await assert.rejects(f.inference.run({ model: net("a"), fallbackModels: [net("b"), "local-test"], maxContinuations: 2, signal: controller.signal }));
    assert.deepEqual(f.requests, Array(scenario === "partial" ? 2 : 1).fill(net("a")), scenario);
    assert.equal(f.saved.length, scenario === "partial" ? 1 : 0);
  }
});
test("policies round-trip through JSON, validate order and support node inheritance", () => {
  const workflow = Model.template("ask", net("a")); workflow.fallbackModels = ["local-test", net("b")];
  const agent = workflow.graph.nodes.find(n => n.type === "agent"); agent.config.model = "";
  const imported = Transfer.parseDocument(Transfer.exportWorkflow(workflow).json);
  assert.deepEqual(Model.modelOrder(imported.graph.nodes.find(n => n.type === "agent").config, imported), [net("a"), "local-test", net("b")]);
  agent.config.model = net("c"); agent.config.fallbackModels = [net("d")];
  const custom = Transfer.parseDocument(Transfer.exportWorkflow(workflow).json);
  assert.deepEqual(Model.modelOrder(custom.graph.nodes.find(n => n.type === "agent").config, custom), [net("c"), net("d")]);
  for (const fallbackModels of ["not an array", [null], [net("a")], [net("b"), net("b")], Array.from({ length: 16 }, (_, i) => net("id" + i)), ["desktop:private"], ["koinos-network:auto-unknown"]]) {
    assert.throws(() => Transfer.parseDocument(JSON.stringify({ ...workflow, fallbackModels })));
  }
  assert.throws(() => Model.modelPolicy({ model: "", fallbackModels: [net("a")] }), /primary/);
});
test("saved task aliases migrate once to explicit lists while run history and identities remain intact", t => {
  const f = fixture(t, "kai.workflows"), options = { dataDir: f.root, safeStorage: f.api.secrets };
  const store = new CompanionStore(options), workflow = { ...Model.template("ask", net("auto-research")), id: "article", revision: 4, enabled: true };
  workflow.graph.nodes.find(n => n.type === "agent").config.model = net("auto-writing");
  const run = { id: "previous", status: "failed", spec: structuredClone(workflow), input: "preserved", networkCalls: [{ model: net("qwen25-32b") }] };
  store.change(d => { d.workflows.push(workflow); d.runs.push(run); d.workflowAgents.push({ id: "agent", model: net("auto-outline") }); d.workflowState.discovery = { model: net("auto-research"), enabled: false }; });
  const migrated = new CompanionStore(options), w = migrated.data.workflows[0];
  assert.equal(w.id, "article"); assert.equal(w.revision, 5); assert.equal(w.enabled, true);
  assert.equal(w.model, "qwen25-32b"); assert.equal(w.modelSource, "network"); assert.deepEqual(w.fallbackModels[0], { model: "deepseek-r1-32b", modelSource: "network", modelPreference: "network" });
  assert.equal(w.graph.nodes.find(n => n.type === "agent").config.model, "mistral-small-24b");
  assert.deepEqual(migrated.data.runs[0], run);
  assert.doesNotMatch(JSON.stringify([w, migrated.data.workflowAgents, migrated.data.workflowState]), /auto-(research|outline|writing)/);
  const bytes = fs.readFileSync(path.join(f.root, "state.json")); new CompanionStore(options);
  assert.deepEqual(fs.readFileSync(path.join(f.root, "state.json")), bytes);
  assert.equal(Model.importDocument(workflow).model, "qwen25-32b");
});
test("loop agents inherit workflow fallbacks and a node override uses only its own order", async t => {
  const f = setup(t), app = create(f.api); t.after(() => app.dispose());
  const workflow = Model.template("loop", net("missing")); workflow.fallbackModels = [net("a")];
  for (const n of workflow.graph.nodes.filter(n => n.type === "agent")) n.config.model = "";
  const refine = workflow.graph.nodes.find(n => n.id === "refine"); Object.assign(refine.config, { model: net("missing-override"), fallbackModels: [net("b")] });
  const saved = await app.call("workflows.workflow", workflow), { id } = await app.call("workflows.run", { id: saved.id, input: "loop" });
  const run = await terminal(app, id); assert.equal(run.status, "completed", run.error);
  assert.deepEqual(f.requests, [net("a"), net("b"), net("b")]);
  assert.deepEqual(run.frames.root.fallbackModels, [{ model: "a", modelSource: "network", modelPreference: "network" }]);
});
test("network fallback keeps graph retries from restarting a possibly paid request", async t => {
  const f = setup(t), app = create(f.api); t.after(() => app.dispose());
  f.api.wallet.complete = async request => { f.requests.push(request.model); throw Error("Outcome unknown"); };
  const workflow = Model.template("ask", "missing-local"); workflow.fallbackModels = [net("a"), net("b")];
  const agent = workflow.graph.nodes.find(n => n.type === "agent"); Object.assign(agent.config, { model: "", retries: 2 });
  const saved = await app.call("workflows.workflow", workflow), { id } = await app.call("workflows.run", { id: saved.id });
  const run = await terminal(app, id); assert.equal(run.status, "failed"); assert.match(run.error, /Outcome unknown/);
  assert.deepEqual(f.requests, [net("a")]);
});
test("generation diagnostics distinguish token budget, continuation count and empty output", async t => {
  for (const [name, options, text, expected] of [
    ["tokens", { maxTokens: 8, maxContinuations: 2 }, "prefix", /8-token output budget/],
    ["continuations", { maxTokens: 100, maxContinuations: 0 }, "prefix", /0-continuation limit/],
    ["empty", { maxTokens: 100, maxContinuations: 2 }, "", /returned no text/]
  ]) {
    const f = setup(t);
    f.api.wallet.complete = async request => { f.requests.push(request.model); return reply(text, "length"); };
    await assert.rejects(f.inference.run({ model: net("a"), fallbackModels: [net("b")], ...options }), expected, name);
    assert.deepEqual(f.requests, [net("a")]); assert.equal(f.saved.length, 1);
  }
});
test("sub-workflow snapshots keep their own fallback list", async t => {
  const f = setup(t), app = create(f.api); t.after(() => app.dispose());
  const child = Model.template("ask", net("missing")); child.fallbackModels = [net("b")];
  const savedChild = await app.call("workflows.workflow", child);
  const parent = { name: "Parent", model: net("a"), fallbackModels: [net("c")], graph: { version: 2,
    nodes: [Model.node("trigger", "start"), Model.node("sub_workflow", "child", undefined, { workflowId: savedChild.id })], edges: [Model.edge("start", "child")] } };
  const saved = await app.call("workflows.workflow", parent), { id } = await app.call("workflows.run", { id: saved.id });
  assert.equal((await terminal(app, id)).status, "completed"); assert.deepEqual(f.requests, [net("b")]);
});
test("a ready local primary runs in the background without granting its optional network fallback", async t => {
  const f = setup(t), app = create(f.api); t.after(() => app.dispose());
  f.api.desktop.isVisible = () => false;
  const workflow = Model.template("ask", "local-test"); workflow.fallbackModels = [net("a")];
  const saved = await app.call("workflows.workflow", workflow), { id } = await app.call("workflows.run", { id: saved.id });
  const run = await terminal(app, id); assert.equal(run.status, "completed", run.error); assert.deepEqual(f.requests, []);
});
