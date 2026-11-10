"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { fixture } = require("./helper"), { create } = require("../plugin/service");
const Model = require("../plugin/workflow-model"), { createInference } = require("../plugin/service/workflow-inference");
const ALIAS = "koinos-network:timed-model";
const reply = (content, reason = "stop") => ({ choices: [{ message: { content }, finish_reason: reason }], usage: { completion_tokens: 8 } });
async function flush() { for (let i = 0; i < 8; i++) await new Promise(setImmediate); }
function setup(t, { ignoreAbort = false } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // Advance native AbortSignal deadlines with the same test clock, so this
  // catches the old graph-level 180-second deadline as well as reply timers.
  t.mock.method(AbortSignal, "timeout", ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return controller.signal;
  });
  const f = fixture(t, "kai.workflows"), pending = [], saved = [];
  f.api.network.models = async () => [{ model: "timed-model", available: true, maxOutput: 8 }];
  f.api.wallet = {
    authorize: async () => ({}),
    complete: (request, options, signal) => new Promise((resolve, reject) => {
      pending.push({ request, options, signal, resolve, reject });
      if (!ignoreAbort) signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  };
  return { ...f, pending, saved, inference: createInference(f.api, result => saved.push(result)) };
}

test("an existing imported 180-second agent finishes continuations taking longer than three minutes", async t => {
  const f = setup(t), app = create(f.api); t.after(() => app.dispose());
  const spec = Model.template("ask", ALIAS), agent = spec.graph.nodes.find(n => n.type === "agent");
  Object.assign(agent.config, { timeoutSeconds: 180, maxTokens: 24, maxContinuations: 2 });
  const saved = await app.call("workflows.workflow", spec), { id } = await app.call("workflows.run", { id: saved.id });
  await flush(); assert.equal(f.pending.length, 1);
  t.mock.timers.tick(130000); f.pending[0].resolve(reply("First ", "length")); await flush();
  assert.equal(f.pending.length, 2); t.mock.timers.tick(130000);
  assert.equal(f.pending[1].signal.aborted, false);
  f.pending[1].resolve(reply("second")); await flush();
  const run = await app.call("workflows.runGet", { id });
  assert.equal(run.status, "completed", run.error); assert.equal(run.networkCalls.length, 2);
  assert.equal(run.previous, "First second");
  assert.deepEqual(f.pending.map(p => p.options.workflow.id), [id, id]);
});

test("a slow individual reply fails clearly, retains completed parts and never retries", async t => {
  const f = setup(t);
  const work = f.inference.run({ model: ALIAS, fallbackModels: ["local-test"], prompt: "Outline", timeoutSeconds: 180, maxTokens: 24, maxContinuations: 2 });
  const stopped = assert.rejects(work, /network reply timed out after 180 seconds.*Network results/);
  await flush(); f.pending[0].resolve(reply("Saved outline prefix", "length")); await flush();
  t.mock.timers.tick(180000); await stopped; await flush();
  assert.equal(f.pending.length, 2); assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].completion.choices[0].message.content, "Saved outline prefix");
});

test("run history identifies a reply timeout instead of hiding it behind a generic node failure", async t => {
  const f = setup(t), app = create(f.api); t.after(() => app.dispose());
  const spec = Model.template("ask", ALIAS), agent = spec.graph.nodes.find(n => n.type === "agent");
  Object.assign(agent.config, { timeoutSeconds: 5, retries: 2 });
  const saved = await app.call("workflows.workflow", spec), { id } = await app.call("workflows.run", { id: saved.id });
  await flush(); t.mock.timers.tick(5000); await flush();
  const run = await app.call("workflows.runGet", { id });
  assert.equal(run.status, "failed"); assert.match(run.error, /network reply timed out after 5 seconds/);
  assert.doesNotMatch(run.error, /This node failed/); assert.equal(f.pending.length, 1);
});

test("reply deadlines do not expire while another request owns the credit queue", async t => {
  const f = setup(t), a = f.inference.run({ model: ALIAS, prompt: "First", timeoutSeconds: 5 });
  const b = f.inference.run({ model: ALIAS, prompt: "Second", timeoutSeconds: 5 });
  await flush(); assert.equal(f.pending.length, 1);
  t.mock.timers.tick(4000); f.pending[0].resolve(reply("First")); assert.equal(await a, "First"); await flush();
  t.mock.timers.tick(4000); assert.equal(f.pending[1].signal.aborted, false);
  f.pending[1].resolve(reply("Second")); assert.equal(await b, "Second");
});

test("the full network response stops at 15 minutes even when individual replies keep finishing", async t => {
  const f = setup(t), work = f.inference.run({ model: ALIAS, prompt: "Long response", timeoutSeconds: 180, maxTokens: 200, maxContinuations: 16 });
  const stopped = assert.rejects(work, /15-minute limit/);
  await flush();
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(150000); f.pending[i].resolve(reply("Part " + i, "length")); await flush(); }
  assert.equal(f.saved.length, 5); assert.equal(f.pending.length, 6);
  t.mock.timers.tick(150000); await stopped;
  assert.equal(f.pending[5].signal.aborted, true); assert.equal(f.saved.length, 5);
});

test("a timed-out Core operation retains its queue slot until it actually settles", async t => {
  const f = setup(t, { ignoreAbort: true }), first = f.inference.run({ model: ALIAS, prompt: "First", timeoutSeconds: 5 });
  const stopped = assert.rejects(first, /timed out after 5 seconds/);
  await flush(); t.mock.timers.tick(5000);
  const second = f.inference.run({ model: ALIAS, prompt: "Second", timeoutSeconds: 5 });
  await flush(); assert.equal(f.pending.length, 1); assert.equal(f.pending[0].signal.aborted, true);
  f.pending[0].resolve(reply("Late answer remains in Core recovery")); await stopped; await flush();
  assert.equal(f.saved.length, 0); assert.equal(f.pending.length, 2);
  f.pending[1].resolve(reply("Second")); assert.equal(await second, "Second");
});
