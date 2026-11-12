"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), { createInference } = require("../plugin/service/workflow-inference");
const { CompanionStore } = require("../plugin/service/companion-store");
const Model = require("../plugin/workflow-model"), Output = require("../plugin/workflow-output");
const truncated = fs.readFileSync(path.join(__dirname, "fixtures/gemma-outline-truncated.txt"), "utf8");
const tail = ' between them.","Describe common tools and their limitations."]},{"heading":"Conclusion","points":["Summarize the process.","Explain its practical limits."]}]}\n```';
const document = require("../examples/researched-article.workflow.json");
const contract = structuredClone(document.workflow.graph.nodes.find(n => n.id === "outline_agent").config.outputSchema);
contract.properties.sections.minItems = contract.properties.sections.maxItems = 5;
const reply = (content, finish_reason = "stop", tokens = 100) => ({ id: "a".repeat(64), choices: [{ message: { content }, finish_reason }], usage: { completion_tokens: tokens } });
function setup(t, responses, options = {}) {
  const f = fixture(t, "kai.workflows"), calls = [], saved = [], order = [];
  f.api.network.models = async () => [{ model: "gemma3-12b", available: true, maxOutput: 512 }];
  f.api.wallet = { complete: async (request, access) => {
    calls.push({ request, access }); order.push("request");
    const result = responses.shift(); if (result instanceof Error) throw result;
    assert.ok(result, "No unexpected generation"); return result;
  }, authorize: async action => { if (action === "chat-ack") order.push("ack"); } };
  const inference = createInference(f.api, (part, run) => { saved.push({ ...part, run }); order.push("save"); });
  return { ...f, calls, saved, order, run: extra => inference.run({ model: "gemma3-12b", modelSource: "network", runId: "existing-run", workflowName: "Article", prompt: "Create exactly five sections.", outputFormat: "json", outputSchema: contract, maxTokens: 2400, maxContinuations: 16, ...options, ...extra }) };
}
test("the reported Gemma truncation continues despite stop, null or missing finish reason, then validates five sections", async t => {
  for (const finish of ["stop", null, undefined]) {
    const first = reply(truncated, finish, 498); if (finish === undefined) delete first.choices[0].finish_reason;
    const f = setup(t, [first, reply(tail, "stop", 150)]);
    const result = JSON.parse(await f.run());
    assert.equal(result.sections.length, 5); assert.match(result.sections[3].points[0], /relationship between them\.$/);
    assert.equal(f.calls.length, 2); assert.equal(f.saved[0].completion.choices[0].message.content, truncated);
    assert.equal(f.saved[1].purpose, "continue"); assert.deepEqual(f.order, ["request", "save", "ack", "request", "save", "ack"]);
    assert.equal(f.calls[1].request.messages.at(-2).content, truncated);
    assert.ok(f.calls.every(c => c.access.workflow.id === "existing-run"));
  }
});
test("valid fenced JSON is canonicalized without another paid call even at the provider length limit", async t => {
  const f = setup(t, [reply(truncated + tail, "length")]);
  const text = await f.run(); assert.equal(text[0], "{"); assert.equal(JSON.parse(text).sections.length, 5); assert.equal(f.calls.length, 1);
});
test("a restarted continuation must independently satisfy the full schema", async t => {
  const f = setup(t, [reply(truncated), reply(truncated + tail)]);
  assert.equal(JSON.parse(await f.run()).sections.length, 5); assert.equal(f.calls.length, 2);
});
test("valid JSON with the wrong count and malformed closed JSON get bounded complete repairs", async t => {
  for (const bad of ['{"title":"Short","sections":[]}', '{"title":oops}']) {
    const f = setup(t, [reply(bad), reply(truncated + tail)]);
    assert.equal(JSON.parse(await f.run()).sections.length, 5);
    assert.equal(f.saved[1].purpose, "repair"); assert.match(f.calls[1].request.messages.at(-1).content, /corrected COMPLETE JSON/);
  }
});
test("JSON recovery respects the total output budget, continuation count and repair cap", async t => {
  const budget = setup(t, [reply('{"x":', "stop", 200), reply('"tail', "stop", 100)], { maxTokens: 300 });
  await assert.rejects(budget.run(), /300-token output budget is exhausted/);
  assert.deepEqual(budget.calls.map(c => c.request.max_tokens), [300, 100]);
  const parts = setup(t, [reply(truncated)], { maxContinuations: 0 });
  await assert.rejects(parts.run(), /0-continuation limit/); assert.equal(parts.calls.length, 1);
  const repairs = setup(t, [reply("{}"), reply("{}"), reply("{}")]);
  await assert.rejects(repairs.run(), /2-repair limit/); assert.equal(repairs.saved.length, 3);
  const noUsage = reply(truncated); delete noUsage.usage;
  await assert.rejects(setup(t, [noUsage], { maxTokens: 512 }).run(), /output budget is exhausted/);
});
test("uncertain or denied recovery never starts another model or repeats a charged request", async t => {
  for (const message of ["timed out", "credit approval denied", "unknown outcome"]) {
    const f = setup(t, [reply(truncated), Error(message)], { fallbackModels: [{ model: "other", modelSource: "network" }] });
    await assert.rejects(f.run(), new RegExp(message)); assert.equal(f.calls.length, 2); assert.equal(f.saved.length, 1);
  }
  const f = setup(t, [reply(truncated)]); f.controller.abort(Error("Stopped"));
  await assert.rejects(f.run(), /Stopped/); assert.equal(f.calls.length, 0);
});
test("invalid schema is rejected before spending, and local JSON follows the same contract", async t => {
  const f = setup(t, []);
  await assert.rejects(f.run({ outputSchema: { $ref: "https://example.com/schema" } }), /Unsupported JSON schema keyword/); assert.equal(f.calls.length, 0);
  f.api.models.chat = async () => reply(truncated + tail);
  assert.equal(JSON.parse(await f.run({ model: "local-test", modelSource: "local" })).sections.length, 5);
  assert.equal(f.calls.length, 0); assert.equal(f.saved[0].source, "local");
});
test("text output and selected read-tool requests preserve their existing semantics", async t => {
  const f = setup(t, [reply(truncated)]);
  assert.equal(await f.run({ outputFormat: "text" }), truncated); assert.equal(f.calls.length, 1);
  const tool = setup(t, [reply('{"tool":{"index":0,"arguments":{}}}')]);
  assert.deepEqual(JSON.parse(await tool.run({ allowToolCall: true })), { tool: { index: 0, arguments: {} } });
});
test("schema constraints and incomplete-JSON detection handle strings, escapes and mismatched brackets", () => {
  assert.equal(Output.inspect('{"x":"[}\\\"').incomplete, true);
  assert.equal(Output.inspect('{"x":1]').incomplete, false);
  assert.equal(Output.inspect('{"x":"done"}').valid, true);
  const schema = { type: "object", required: ["x"], additionalProperties: false, properties: { x: { type: "array", minItems: 1, maxItems: 2, items: { type: "integer", minimum: 1, maximum: 5 } } } };
  Output.checkSchema(schema); assert.equal(Output.inspect('{"x":[2]}', schema).valid, true);
  for (const value of ["{}", '{"x":[]}', '{"x":[6]}', '{"x":[2,3,4]}', '{"x":[2],"y":0}']) assert.equal(Output.inspect(value, schema).valid, false);
  assert.equal(Output.validate("😀", { minLength: 1, maxLength: 1 }), "");
  assert.equal(Output.validate({ b: 2, a: 1 }, { enum: [{ a: 1, b: 2 }] }), "");
});
test("existing article definitions gain JSON contracts once without changing models, code or historical runs", t => {
  const f = fixture(t, "kai.workflows"), store = new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets });
  const legacy = structuredClone(document.workflow), planner = legacy.graph.nodes.find(n => n.id === "outline_agent");
  delete planner.config.outputFormat; delete planner.config.outputSchema;
  planner.config.model = "gemma3-12b"; planner.config.fallbackModels = [{ model: "qwen25-14b", modelSource: "both", modelPreference: "local" }];
  legacy.id = "saved-article"; legacy.revision = 7; legacy.nextRunAt = "2026-11-14T09:00:00.000Z";
  const before = structuredClone(legacy);
  store.change(d => { d.workflows.push(legacy); d.runs.push({ id: "failed-run", status: "failed", spec: structuredClone(legacy) }); });
  const reopened = new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets });
  const upgraded = reopened.data.workflows[0], c = upgraded.graph.nodes.find(n => n.id === "outline_agent").config;
  assert.equal(c.outputFormat, "json"); assert.equal(upgraded.revision, 8); assert.equal(upgraded.id, before.id); assert.equal(upgraded.nextRunAt, before.nextRunAt);
  assert.equal(c.prompt, planner.config.prompt); assert.equal(c.model, "gemma3-12b"); assert.deepEqual(c.fallbackModels, planner.config.fallbackModels);
  assert.deepEqual(upgraded.graph.nodes.find(n => n.id === "plan"), before.graph.nodes.find(n => n.id === "plan"));
  assert.deepEqual(reopened.data.runs[0].spec, before);
  assert.equal(new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets }).data.workflows[0].revision, 8);
  assert.equal(Model.importDocument(before).graph.nodes.find(n => n.id === "outline_agent").config.outputFormat, "json");
  const custom = structuredClone(before); custom.graph.nodes.find(n => n.id === "outline_agent").config.prompt = "My custom instructions";
  assert.equal(Model.migrateOutputs(custom), false);
});
module.exports = { truncated, tail };
