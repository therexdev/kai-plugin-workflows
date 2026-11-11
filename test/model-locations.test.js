"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), { create } = require("../plugin/service");
const { createInference } = require("../plugin/service/workflow-inference"), { CompanionStore } = require("../plugin/service/companion-store");
const Model = require("../plugin/workflow-model"), Transfer = require("../plugin/service/workflow-transfer");
const reply = (text, finish_reason = "stop") => ({ choices: [{ message: { content: text }, finish_reason }], usage: { completion_tokens: 8 } });
const unavailable = () => Object.assign(Error("This model is only being shared by your own computer or account."), { code: "network-model-unavailable", safeToRetry: true });
function setup(t) {
  const f = fixture(t, "kai.workflows"), calls = [], saved = [], state = { local: ["a", "b"], network: ["a", "b"], catalogs: 0, privacy: "network" };
  f.api.models.list = () => ["a", "b", "custom-model"].map(alias => ({ alias, label: "Model " + alias, status: state.local.includes(alias) ? "ready" : "not-installed" }));
  f.api.models.chat = async request => { calls.push({ source: "local", request }); return state.localReply?.(request) || reply("local"); };
  f.api.network.status = () => ({ privacyMode: state.privacy });
  f.api.network.models = async () => { state.catalogs++; return ["a", "b"].map(model => ({ model, label: "Model " + model, available: state.network.includes(model), maxOutput: 16 })); };
  f.api.wallet = { authorize: async () => ({}), complete: async (request, options) => { calls.push({ source: "network", request, options }); return state.networkReply?.(request) || reply("network"); } };
  return { ...f, state, calls, saved, inference: createInference(f.api, part => saved.push(part)) };
}
test("one model choice honors all three locations and both preferences", async t => {
  for (const [modelSource, modelPreference, expected] of [["local", "network", "local"], ["network", "local", "network"], ["both", "local", "local"], ["both", "network", "network"]]) {
    const f = setup(t);
    assert.equal(await f.inference.run({ model: "a", modelSource, modelPreference, prompt: "Same model" }), expected);
    assert.deepEqual(f.calls.map(c => c.source), [expected]);
    assert.equal(f.calls[0].request.model, expected === "network" ? "koinos-network:a" : "a");
    if (expected === "local") assert.equal(f.state.catalogs, 0);
  }
});
test("allowed locations for the primary are exhausted before the next model", async t => {
  const f = setup(t); f.state.networkReply = () => { throw unavailable(); };
  assert.equal(await f.inference.run({ model: "a", modelSource: "both", modelPreference: "network", fallbackModels: [{ model: "b", modelSource: "local" }] }), "local");
  assert.deepEqual(f.calls.map(c => c.request.model), ["koinos-network:a", "a"]);
  f.calls.length = 0; f.state.local = ["b"];
  assert.equal(await f.inference.run({ model: "a", modelSource: "both", modelPreference: "local", fallbackModels: [{ model: "b", modelSource: "both", modelPreference: "local" }] }), "local");
  assert.deepEqual(f.calls.map(c => c.request.model), ["koinos-network:a", "b"]);
});
test("missing local or network capacity only uses locations explicitly allowed", async t => {
  const f = setup(t); f.state.local = [];
  await assert.rejects(f.inference.run({ model: "a", modelSource: "local" }), /None of the selected/);
  assert.equal(f.state.catalogs, 0); assert.equal(f.calls.length, 0);
  assert.equal(await f.inference.run({ model: "a", modelSource: "both", modelPreference: "local" }), "network");
  f.calls.length = 0; f.state.local = ["a"]; f.state.network = [];
  await assert.rejects(f.inference.run({ model: "a", modelSource: "network" }), /available/);
  assert.equal(f.calls.length, 0);
  assert.equal(await f.inference.run({ model: "a", modelSource: "both", modelPreference: "network" }), "local");
  assert.equal(f.calls.length, 1);
});
test("Core Local-Only permits an explicitly allowed local route without network discovery or credits", async t => {
  const f = setup(t); f.state.privacy = "local-only";
  assert.equal(await f.inference.run({ model: "a", modelSource: "both", modelPreference: "network" }), "local");
  await assert.rejects(f.inference.run({ model: "a", modelSource: "network" }), /Local-Only/);
  assert.equal(f.state.catalogs, 0); assert.deepEqual(f.calls.map(c => c.source), ["local"]);
});
test("unified discovery keeps one ID and separate local and network availability", async t => {
  const f = setup(t); f.state.local = ["a"]; f.state.network = ["b"];
  const { models } = await f.inference.refresh();
  assert.equal(models.filter(m => m.alias === "a").length, 1);
  assert.deepEqual(models.map(m => [m.alias, m.localStatus, m.networkStatus]), [["a", "ready", "unavailable"], ["b", "not-installed", "ready"], ["custom-model", "not-installed", "unknown"]]);
  assert.equal(Model.localReady(models, "b"), false);
});
test("a new continuation can move from a self-only network model to local while preserving the accepted JSON prefix", async t => {
  const f = setup(t); let parts = 0;
  f.state.networkReply = () => { if (++parts === 1) return reply('{"sections":[', "length"); throw unavailable(); };
  f.state.localReply = request => {
    assert.equal(request.messages.at(-2).content, '{"sections":[');
    assert.match(request.messages.at(-1).content, /Continue exactly/);
    assert.equal(request.max_tokens, 32);
    return reply("]}");
  };
  const text = await f.inference.run({ model: "a", modelSource: "both", modelPreference: "network", prompt: "Outline", maxTokens: 40, maxContinuations: 2, runId: "article" });
  assert.deepEqual(JSON.parse(text), { sections: [] });
  assert.deepEqual(f.calls.map(c => c.request.model), ["koinos-network:a", "koinos-network:a", "a"]);
  assert.deepEqual(f.saved.map(c => [c.source, c.part]), [["network", 0], ["local", 1]]);
  assert.deepEqual(f.calls.filter(c => c.source === "network").map(c => c.options.workflow.id), ["article", "article"]);
});
test("continuations stay with the successful fallback and retain the remaining budget", async t => {
  const f = setup(t); let parts = 0;
  f.state.networkReply = request => {
    if (request.model === "koinos-network:a" && parts++) throw unavailable();
    return reply(request.model === "koinos-network:a" ? "A" : "B", f.saved.length < 2 ? "length" : "stop");
  };
  assert.equal(await f.inference.run({ model: "a", modelSource: "network", fallbackModels: [{ model: "b", modelSource: "network" }], maxTokens: 26, maxContinuations: 3 }), "ABB");
  assert.deepEqual(f.calls.map(c => c.request.model), ["koinos-network:a", "koinos-network:a", "koinos-network:b", "koinos-network:b"]);
  assert.equal(f.calls.at(-1).request.max_tokens, 10);
  assert.equal(f.calls.at(-1).request.messages.at(-2).content, "AB");
});
test("uncertain or denied continuations never fall back to local or repeat completed generation", async t => {
  for (const reason of ["unknown", "declined", "timeout", "no-proof", "cancel"]) {
    const f = setup(t), controller = new AbortController(); let count = 0;
    f.state.networkReply = () => {
      if (++count === 1) return reply("saved", "length");
      if (reason === "cancel") controller.abort(Error("Stopped"));
      throw Object.assign(Error(reason), reason === "no-proof" ? { code: "network-model-unavailable" } : {});
    };
    await assert.rejects(f.inference.run({ model: "a", modelSource: "both", modelPreference: "network", maxContinuations: 2, signal: controller.signal }));
    assert.equal(f.calls.length, 2); assert.equal(f.saved.length, 1); assert.ok(f.calls.every(c => c.source === "network"));
  }
});
test("a failed local generation cannot send its input to the network", async t => {
  const f = setup(t); f.state.localReply = () => { throw Error("Local outcome unknown"); };
  await assert.rejects(f.inference.run({ model: "a", modelSource: "both", modelPreference: "local" }), /Local outcome unknown/);
  assert.equal(f.state.catalogs, 0); assert.deepEqual(f.calls.map(c => c.source), ["local"]);
});
test("location policies round-trip through workflow and node JSON with independent fallback preferences", () => {
  const workflow = { ...Model.template("ask", "a"), modelSource: "both", modelPreference: "network", fallbackModels: [{ model: "b", modelSource: "both", modelPreference: "local" }] };
  const parsed = Transfer.parseDocument(Transfer.exportWorkflow(workflow).json);
  assert.equal(parsed.modelSource, "both"); assert.equal(parsed.modelPreference, "network");
  assert.deepEqual(parsed.fallbackModels, [{ model: "b", modelSource: "both", modelPreference: "local" }]);
  assert.deepEqual(Model.modelOrder(parsed.graph.nodes.find(n => n.type === "agent").config, parsed), ["koinos-network:a", "a", "b", "koinos-network:b"]);
  for (const bad of [{ modelSource: "auto" }, { modelPreference: "fastest" }, { fallbackModels: [{ model: "b", modelSource: "elsewhere" }] }]) assert.throws(() => Transfer.parseDocument(JSON.stringify({ ...workflow, ...bad })));
});
test("installed definitions migrate sources once without changing history or broadening old routes", t => {
  const f = setup(t), options = { dataDir: f.root, safeStorage: f.api.secrets }, store = new CompanionStore(options);
  const workflow = { ...Model.template("ask", "koinos-network:a"), id: "saved", revision: 8, enabled: true, fallbackModels: ["b", "koinos-network:b"] };
  const run = { id: "old", spec: structuredClone(workflow), status: "failed", input: "kept", networkCalls: [{ model: "koinos-network:a" }] };
  store.change(d => { d.workflows.push(workflow); d.runs.push(run); });
  const updated = new CompanionStore(options);
  assert.deepEqual(Model.modelOrder(updated.data.workflows[0]), ["koinos-network:a", "b", "koinos-network:b"]);
  assert.equal(updated.data.workflows[0].modelSource, "network"); assert.equal(updated.data.workflows[0].revision, 9); assert.equal(updated.data.workflows[0].enabled, true);
  assert.deepEqual(updated.data.runs[0], run);
  const file = path.join(f.root, "state.json"), bytes = fs.readFileSync(file); new CompanionStore(options); assert.deepEqual(fs.readFileSync(file), bytes);
});
test("graph loops inherit location preferences and local work never asks for network credit access", async t => {
  const f = setup(t); f.api.desktop.isVisible = () => false;
  const app = create(f.api); t.after(() => app.dispose());
  const workflow = { ...Model.template("loop", "a"), modelSource: "both", modelPreference: "local" };
  for (const n of workflow.graph.nodes.filter(n => n.type === "agent")) n.config.model = "";
  const saved = await app.call("workflows.workflow", workflow), { id } = await app.call("workflows.run", { id: saved.id });
  let run; for (let i = 0; i < 100; i++) { run = await app.call("workflows.runGet", { id }); if (["completed", "failed", "waiting"].includes(run.status)) break; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.equal(run.status, "completed", run.error); assert.equal(run.frames.root.modelSource, "both"); assert.equal(run.frames.root.modelPreference, "local");
  assert.ok(f.calls.length > 1); assert.ok(f.calls.every(c => c.source === "local")); assert.equal(f.state.catalogs, 0);
});
