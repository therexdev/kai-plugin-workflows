"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), { create } = require("../plugin/service");
const Model = require("../plugin/workflow-model"), { createInference } = require("../plugin/service/workflow-inference");
const ALIAS = "koinos-network:test-network";
function setup(t, options = {}) {
  const f = fixture(t, "kai.workflows"), calls = [], localCalls = [], saved = [];
  let visible = true, mode = "network", available = true, count = 0;
  f.api.desktop.isVisible = () => visible;
  f.api.network.status = () => ({ privacyMode: mode });
  f.api.network.models = async () => [{ model: "test-network", label: "Test network model", available, maxOutput: 800 }];
  f.api.models.list = () => options.networkOnly ? [] : [{ alias: "local-test", status: "ready" }];
  f.api.models.chat = async request => { localCalls.push(request); return { choices: [{ message: { content: "Local answer" } }] }; };
  f.api.wallet = { authorize: async (action, request, signal) => {
    calls.push({ action, request, signal }); signal?.throwIfAborted();
    if (action === "chat-estimate") return { model: "test-network", unit: "USD-1e-8", allowed: true, maxCharge: "123456", maxFree: "23456", maxPaid: "100000" };
    if (action === "chat-completion") return { id: (++count).toString(16).padStart(64, "0"), choices: [{ message: { content: "Network answer " + count } }], usage: { total_tokens: 50 } };
    if (action === "chat-ack") return { state: "delivered" };
    throw Error("Unexpected action " + action);
  } };
  const inference = createInference(f.api, result => saved.push(result));
  return { ...f, inference, calls, localCalls, saved, setVisible: v => visible = v, setMode: v => mode = v, setAvailable: v => available = v };
}
async function terminal(app, id) {
  for (let i = 0; i < 150; i++) {
    const r = await app.call("workflows.runGet", { id });
    if (["completed", "failed", "waiting", "cancelled"].includes(r.status)) { await new Promise(setImmediate); return r; }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail("Run did not settle");
}
test("Core consent is reused for every continuation with the same workflow run identity", async t => {
  const f = setup(t), scopes = []; let part = 0;
  f.api.wallet.complete = async (request, options, signal) => {
    signal.throwIfAborted(); scopes.push(options.workflow);
    return { choices: [{ message: { content: ++part === 1 ? "First " : "second" }, finish_reason: part === 1 ? "length" : "stop" }], usage: { completion_tokens: 20 } };
  };
  f.api.wallet.creditAccess = async () => ({ allowed: true, duration: "workflow" }); f.setVisible(false);
  assert.equal(await f.inference.run({ model: ALIAS, prompt: "Article", runId: "run-1", workflowName: "Article", maxContinuations: 2 }), "First second");
  assert.deepEqual(scopes, [{ id: "run-1", name: "Article" }, { id: "run-1", name: "Article" }]);
  assert.equal(f.confirmations.length, 0); assert.equal(f.calls.length, 0);
  f.api.wallet.creditAccess = async () => ({ allowed: false });
  await assert.rejects(f.inference.run({ model: ALIAS, prompt: "Revoked", runId: "run-1" }), /Open Workflows/);
  assert.equal(scopes.length, 2);
});

test("configured fallbacks refresh and advance in order only after Core confirms generation never started", async t => {
  const f = setup(t), requests = [], scopes = []; let refreshes = 0;
  f.api.network.models = async () => { refreshes++; return [
    { model: "qwen25-32b", available: true, maxOutput: 256 },
    { model: "phi-4", available: true, maxOutput: 64 }
  ]; };
  f.api.wallet.complete = async (request, options) => {
    requests.push(request); scopes.push(options.workflow);
    if (requests.length === 1) throw Object.assign(Error("Provider left"), { code: "network-model-unavailable", safeToRetry: true });
    return { choices: [{ message: { content: "Researched answer" }, finish_reason: "stop" }] };
  };
  assert.equal(await f.inference.run({ model: "koinos-network:qwen25-32b", fallbackModels: ["koinos-network:phi-4"], prompt: "Research", runId: "run-reselect", workflowName: "Article" }), "Researched answer");
  assert.equal(refreshes, 2); assert.deepEqual(requests.map(r => r.model), ["koinos-network:qwen25-32b", "koinos-network:phi-4"]);
  assert.deepEqual(requests.map(r => r.max_tokens), [256, 64]);
  assert.deepEqual(scopes, [{ id: "run-reselect", name: "Article" }, { id: "run-reselect", name: "Article" }]);
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].model, "koinos-network:phi-4");
});

test("stale availability refreshes the selected model once before stopping", async t => {
  const f = setup(t); let attempts = 0, refreshes = 0;
  f.api.network.models = async () => { refreshes++; return [{ model: "phi-4", available: true, maxOutput: 64 }]; };
  f.api.wallet.complete = async () => { attempts++; throw Object.assign(Error("Availability expired"), { code: "network-models-stale", safeToRetry: true }); };
  await assert.rejects(f.inference.run({ model: "koinos-network:phi-4", prompt: "Outline" }), /Availability expired/);
  assert.equal(attempts, 2); assert.equal(refreshes, 2); assert.equal(f.saved.length, 0);
});

test("fallback selection never retries an ambiguous outcome, a single model, or a partial response", async t => {
  for (const scenario of ["unknown", "code-only", "explicit", "partial", "cancel", "privacy", "no-provider"]) {
    const f = setup(t); let attempts = 0;
    const c = new AbortController();
    f.api.wallet.complete = async () => {
      attempts++;
      if (scenario === "partial" && attempts === 1) return { choices: [{ message: { content: "Saved part" }, finish_reason: "length" }], usage: { completion_tokens: 10 } };
      if (scenario === "cancel") c.abort();
      if (scenario === "privacy") f.setMode("local-only");
      if (scenario === "no-provider") f.setAvailable(false);
      const error = Error("This network model is unavailable");
      if (scenario !== "unknown") error.code = "network-model-unavailable";
      if (!["unknown", "code-only"].includes(scenario)) error.safeToRetry = true;
      throw error;
    };
    await assert.rejects(f.inference.run({ model: ALIAS, fallbackModels: scenario === "explicit" ? [] : ["koinos-network:other-selected"], prompt: "Research", maxContinuations: 2, signal: c.signal }));
    assert.equal(attempts, scenario === "partial" ? 2 : 1, scenario);
    assert.equal(f.saved.length, scenario === "partial" ? 1 : 0, scenario);
    assert.equal(f.localCalls.length, 0);
  }
});
test("a background workflow with Core access finishes and releases its run scope", async t => {
  const f = setup(t, { networkOnly: true }), ended = [], scopes = [];
  f.api.wallet.complete = async (input, options, signal) => { scopes.push(options.workflow); return f.api.wallet.authorize("chat-completion", input, signal); };
  f.api.wallet.creditAccess = async () => ({ allowed: true, duration: "always" });
  f.api.wallet.endCreditScope = id => ended.push(id);
  const app = create(f.api); t.after(() => app.dispose());
  const saved = await app.call("workflows.workflow", Model.template("ask", ALIAS)); f.setVisible(false);
  const { id } = await app.call("workflows.run", { id: saved.id, input: "Background" });
  const run = await terminal(app, id); assert.equal(run.status, "completed", run.error);
  assert.deepEqual(ended, [id]); assert.deepEqual(scopes, [{ id, name: saved.name }]); assert.equal(f.confirmations.length, 0);
  f.api.wallet.creditAccess = async () => ({ allowed: false });
  const next = await app.call("workflows.run", { id: saved.id, input: "Revoked" });
  assert.equal((await terminal(app, next.id)).status, "waiting"); assert.deepEqual(ended, [id]);
  await app.call("workflows.cancel", { id: next.id }); assert(ended.includes(next.id));
});
test("network discovery is explicit, identifies actual availability and leaves local inference independent", async t => {
  const f = setup(t);
  assert.equal(f.inference.list().length, 1);
  const result = await f.inference.refresh();
  assert.equal(result.models.find(m => m.alias === "test-network").source, "network");
  await f.inference.run({ model: "local-test", prompt: "Local", signal: f.controller.signal });
  assert.equal(f.localCalls.length, 1); assert.equal(f.calls.length, 0);
  f.setAvailable(false); await f.inference.refresh();
  assert.equal(f.inference.list().find(m => m.alias === "test-network").networkStatus, "unavailable");
  f.setMode("local-only"); await f.inference.refresh(); assert.equal(f.inference.list().length, 1);
});
test("network requests review credits, use current Core response shape, persist then acknowledge", async t => {
  const f = setup(t), authorize = f.api.wallet.authorize;
  f.api.wallet.authorize = async (action, input, signal) => {
    if (action === "chat-ack") assert.equal(f.saved[0].completion.id, input);
    return authorize(action, input, signal);
  };
  assert.equal(await f.inference.run({ model: ALIAS, prompt: "Use network" }), "Network answer 1");
  assert.deepEqual(f.calls.map(c => c.action), ["chat-estimate", "chat-completion", "chat-ack"]);
  assert.equal(f.calls[1].request.max_tokens, 800); assert.equal(f.localCalls.length, 0);
  assert.match(f.confirmations[0].detail, /1\.23456 credits \(0\.23456 free, 1 purchased\)/);
  assert.match(f.confirmations[0].detail, /Use network/);
  const original = f.api.wallet.authorize;
  f.api.wallet.authorize = async (action, input, signal) => { const r = await original(action, input, signal); return action === "chat-completion" ? { completion: r } : r; };
  assert.equal(await f.inference.run({ model: ALIAS, prompt: "Wrapped reply" }), "Network answer 2");
});
test("declined review, missing provider, Local-Only and cancelled operations never dispatch or fall back", async t => {
  const f = setup(t); f.api.desktop.confirm = async () => false;
  await assert.rejects(f.inference.run({ model: ALIAS, prompt: "Declined" }), /cancelled/);
  assert.deepEqual(f.calls.map(c => c.action), ["chat-estimate"]);
  f.setAvailable(false); await assert.rejects(f.inference.run({ model: ALIAS, prompt: "Unavailable" }), /available/);
  f.setMode("local-only"); await assert.rejects(f.inference.run({ model: ALIAS, prompt: "Private" }), /Local-Only/);
  const c = new AbortController(); c.abort(); await assert.rejects(f.inference.run({ model: ALIAS, prompt: "Cancelled", signal: c.signal }), /abort/i);
  assert.equal(f.localCalls.length, 0); assert.equal(f.calls.length, 1);
});
test("network-only and mixed workflows survive JSON transfer and execute with exact selected routes", async t => {
  const f = setup(t, { networkOnly: true }), app = create(f.api); t.after(() => app.dispose());
  const flow = Model.template("ask", ALIAS), text = JSON.stringify(Model.exportDocument(flow));
  const draft = await app.call("workflows.importWorkflow", { text });
  assert.equal(draft.model, "test-network"); assert.equal(draft.modelSource, "network"); assert.equal(draft.graph.nodes[1].config.model, ""); assert.equal(f.calls.length, 0);
  const models = await app.call("workflows.workflowModels"); assert.equal(models.models.length, 1);
  const saved = await app.call("workflows.workflow", draft), run = await app.call("workflows.run", { id: saved.id, input: "No local model installed" });
  const r = await terminal(app, run.id); assert.equal(r.status, "completed", r.error); assert.equal(r.networkCalls[0].model, ALIAS);
  assert.equal(f.localCalls.length, 0); assert.match(r.previous, /Network answer/);
  const raw = JSON.parse(f.api.secrets.decryptString(Buffer.from(JSON.parse(fs.readFileSync(path.join(f.root, "state.json"))).encrypted, "base64")));
  assert.equal(raw.runs[0].networkCalls[0].completion.id, f.calls.find(c => c.action === "chat-ack").request);
  const exported = await app.call("workflows.export", { id: saved.id }); assert.doesNotMatch(JSON.stringify(exported), /networkCalls|Network answer/);
  f.api.models.list = () => [{ alias: "local-test", status: "ready" }];
  const mixed = Model.template("loop", "local-test"); mixed.graph.nodes.find(n => n.id === "refine").config.model = ALIAS;
  const m = await app.call("workflows.workflow", mixed), mr = await app.call("workflows.run", { id: m.id, input: "Mix routes" });
  const done = await terminal(app, mr.id); assert.equal(done.status, "completed", done.error);
  assert.equal(f.localCalls.length, 1); assert.equal(done.networkCalls.filter(c => c.source === "network").length, 2); assert.equal(done.networkCalls.filter(c => c.source === "local").length, 1);
});
test("hidden background network work waits for review and preview never spends", async t => {
  const f = setup(t, { networkOnly: true }), app = create(f.api); t.after(() => app.dispose());
  const saved = await app.call("workflows.workflow", Model.template("ask", ALIAS));
  f.setVisible(false);
  const preview = await app.call("workflows.workflowPreview", { id: saved.id, input: "Preview" });
  assert.equal((await terminal(app, preview)).status, "completed"); assert.equal(f.calls.length, 0);
  const { id } = await app.call("workflows.run", { id: saved.id, input: "Scheduled input" });
  const waiting = await terminal(app, id); assert.equal(waiting.status, "waiting"); assert.match(waiting.pending.message, /review network credits/); assert.equal(f.calls.length, 0);
  f.setVisible(true);
  await f.provided.get("kai.workflows").call("get", { id: saved.id });
  // Exercise the approved graph continuation directly, without requiring an Electron window in this fixture.
  await app.call("workflows.decide", { id, decision: "approved" });
  assert.equal((await terminal(app, id)).status, "completed"); assert.equal(f.calls.filter(c => c.action === "chat-completion").length, 1);
});
test("paid request errors remain actionable and are never retried automatically", async t => {
  const f = setup(t), authorize = f.api.wallet.authorize;
  f.api.wallet.authorize = async (action, input, signal) => { if (action === "chat-completion") { f.calls.push({ action }); throw Error("Credit request outcome is unknown; inspect Credits & Usage."); } return authorize(action, input, signal); };
  const app = create(f.api); t.after(() => app.dispose());
  const spec = Model.template("ask", ALIAS); spec.graph.nodes[1].config.retries = 2;
  const saved = await app.call("workflows.workflow", spec), { id } = await app.call("workflows.run", { id: saved.id });
  const r = await terminal(app, id); assert.equal(r.status, "failed"); assert.match(r.error, /outcome is unknown/);
  assert.equal(f.calls.filter(c => c.action === "chat-completion").length, 1); assert.equal(f.localCalls.length, 0);
});
test("parallel network calls serialize the plugin credit journal and queued cancellation is immediate", async t => {
  const f = setup(t), authorize = f.api.wallet.authorize; let release, entered;
  const started = new Promise(resolve => entered = resolve);
  f.api.wallet.authorize = async (action, input, signal) => { if (action === "chat-completion" && input.messages.at(-1).content === "First") { entered(); await new Promise(resolve => release = resolve); } return authorize(action, input, signal); };
  const a = f.inference.run({ model: ALIAS, prompt: "First" }); await started;
  const c = new AbortController(), b = f.inference.run({ model: ALIAS, prompt: "Second", signal: c.signal });
  c.abort(); await assert.rejects(b, /abort/i); release(); await a;
  const third = await f.inference.run({ model: ALIAS, prompt: "Third" }); assert.equal(third, "Network answer 2");
  assert.equal(f.calls.filter(c => c.action === "chat-completion").length, 2);
});
test("cost review follows Core language and cancellation during review cannot start generation", async t => {
  const f = setup(t), c = new AbortController(); let answer, entered;
  f.api.locale = { get: () => ({ language: "es" }) };
  const reviewing = new Promise(resolve => entered = resolve);
  f.api.desktop.confirm = async (title, detail) => { assert.match(title, /red KAI/); assert.match(detail, /Máximo estimado/); entered(); return new Promise(resolve => answer = resolve); };
  const work = f.inference.run({ model: ALIAS, prompt: "Review then cancel", signal: c.signal });
  await reviewing; c.abort(); await assert.rejects(work, /abort/i); answer(true);
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(c => c.action), ["chat-estimate"]);
});
test("failed persistence leaves the network answer unacknowledged for Core recovery", async t => {
  const f = setup(t), inference = createInference(f.api, () => { throw Error("Storage unavailable"); });
  await assert.rejects(inference.run({ model: ALIAS, prompt: "Keep the answer" }), /Storage unavailable/);
  assert.deepEqual(f.calls.map(c => c.action), ["chat-estimate", "chat-completion"]);
});
test("Copilot and saved agents accept network models without a local installation", async t => {
  const f = setup(t, { networkOnly: true }), authorize = f.api.wallet.authorize;
  f.api.wallet.authorize = async (action, input, signal) => { const value = await authorize(action, input, signal); if (action === "chat-completion") value.choices[0].message.content = JSON.stringify(Model.template("ask", ALIAS)); return value; };
  const app = create(f.api); t.after(() => app.dispose());
  const agent = await app.call("workflows.agentSave", { name: "Network agent", model: ALIAS, instructions: "Summarize inputs" }); assert.equal(agent.model, "test-network"); assert.equal(agent.modelSource, "network");
  const proposal = await app.call("workflows.workflowAssist", { model: ALIAS, request: "Make a simple answer workflow" });
  assert.equal(proposal.proposal.model, "test-network"); assert.equal(proposal.proposal.modelSource, "network"); assert.equal(proposal.report.errors.length, 0);
  const local = f.localCalls.length; assert.equal(local, 0);
});
