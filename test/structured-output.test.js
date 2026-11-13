"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), { createInference } = require("../plugin/service/workflow-inference");
const { CompanionStore } = require("../plugin/service/companion-store");
const Model = require("../plugin/workflow-model"), Output = require("../plugin/workflow-output");
const truncated = fs.readFileSync(path.join(__dirname, "fixtures/gemma-outline-truncated.txt"), "utf8");
const tail = ' between them.","Describe common tools and their limitations."]},{"heading":"Conclusion","points":["Summarize the process.","Explain its practical limits."]}]}\n```';
const document = require("../examples/researched-article.workflow.json");
const missingBracket = fs.readFileSync(path.join(__dirname, "fixtures/gemma-outline-missing-bracket.txt"), "utf8");
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

test("the reported complete Gemma outline is repaired locally without paid format-repair calls", async t => {
  for (const raw of [missingBracket, missingBracket.replace("Address ethical concerns like bias and privacy.", "Address bias and privacy concerns."), missingBracket.replace("Address ethical concerns like bias and privacy.", "Address bias & privacy concerns.")]) {
    const f = setup(t, [reply(raw, "stop", 498)], { maxFormatRepairs: 0, maxContinuations: 0, maxTokens: 512 });
    const answer = JSON.parse(await f.run());
    assert.equal(answer.sections.length, 5); assert.equal(answer.sections[4].points.length, 2); assert.equal(f.calls.length, 1);
    assert.equal(f.saved[0].completion.choices[0].message.content, raw);
    assert.equal(f.saved[0].outputRecovery.kind, "missing-container-closers");
    assert.deepEqual(f.saved[0].outputRecovery.edits.map(e => e.insert), ["]"]);
    assert.deepEqual(f.order, ["request", "save", "ack"]);
    const repaired = raw.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "").replace(/"}]}$/, '"]}]}');
    assert.deepEqual(answer, JSON.parse(repaired));
  }
});

test("local and continued JSON use the same punctuation repair and preserve strings verbatim", async t => {
  const f = setup(t, []); f.api.models.chat = async () => reply(missingBracket);
  assert.equal(JSON.parse(await f.run({ model: "local-test", modelSource: "local" })).sections.length, 5);
  assert.equal(f.saved[0].source, "local"); assert.equal(f.calls.length, 0);
  const split = missingBracket.indexOf('"Generative AI:'), network = setup(t, [reply(missingBracket.slice(0, split)), reply(missingBracket.slice(split))]);
  assert.equal(JSON.parse(await network.run()).sections.length, 5); assert.equal(network.calls.length, 2); assert.equal(network.saved[1].purpose, "continue");
  const value = { points: ['literal ] } \\" quotation', 'emoji 😀 and backslash \\'] }, text = JSON.stringify(value), bad = text.slice(0, -2) + "}";
  assert.deepEqual(Output.inspect(bad, { type: "object" }).value, value);
});

test("local syntax recovery cannot invent missing values, sections, string endings or tool arguments", () => {
  const points = { type: "object", required: ["points"], properties: { points: { type: "array", minItems: 2, items: { type: "string" } } } };
  for (const bad of ['{"points":["a","unfinished', '{"points":["a","b"]', '{"points":["a",}', '{"points":["a"}', '{"points":["a","b",}', '{"points":oops}', '{"points":["a","b"]} prose']) assert.equal(Output.inspect(bad, points).valid, false, bad);
  const short = missingBracket.replace(/\{"heading":"The Future[\s\S]*?\}\]\}/, ']}');
  assert.equal(Output.inspect(short, contract).valid, false);
  assert.equal(Output.inspect('{"tool":{"index":0,"arguments":{"ids":[1,2}}}', {}, true).valid, false);
  assert.equal(Output.inspect('{"x":' + '['.repeat(9) + '1}').valid, false, "Repair count is bounded");
});
test("the live Qwen outline's repeated closing brace needs no paid repair and retains its raw reply", async t => {
  const raw = '{"lines":["Evaluate each attorney\'s experience and success in DUI cases.","Compare client reviews and testimonials for each attorney."]}}';
  const schema = { type: "object", required: ["lines"], additionalProperties: false, properties: { lines: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } } } };
  const f = setup(t, [reply(raw)], { outputSchema: schema, maxFormatRepairs: 0, maxContinuations: 0 });
  assert.deepEqual(JSON.parse(await f.run()), JSON.parse(raw.slice(0, -1)));
  assert.equal(f.calls.length, 1); assert.equal(f.saved[0].completion.choices[0].message.content, raw);
  assert.deepEqual(f.saved[0].outputRecovery, { kind: "repeated-trailing-closers", edits: [{ offset: raw.length - 1, remove: "}" }] });
  assert.deepEqual(f.order, ["request", "save", "ack"]);
});
test("trailing-closer recovery preserves quoted punctuation and rejects ambiguity, incomplete content and tool calls", () => {
  const value = { points: ['literal ] } \\" quotation', 'emoji 😀 and backslash \\'] }, raw = JSON.stringify(value);
  const schema = { type: "object", required: ["points"], properties: { points: { type: "array", minItems: 2, items: { type: "string" } } } };
  assert.deepEqual(Output.inspect(raw + ' }\n}', schema).value, value);
  assert.deepEqual(Output.inspect('["literal ]",{"x":"}"}]]', { type: "array", minItems: 2 }).value, ['literal ]', { x: '}' }]);
  for (const bad of [raw + ']', raw + '{}', raw + ' true', raw + '} prose', raw + ',}', raw + '}'.repeat(9), '{"points":["one"]}}', '{"points":["one","two"}}', '{"points":["one","unfinished}}']) {
    assert.equal(Output.inspect(bad, schema).valid, false, bad);
  }
  assert.equal(Output.inspect('{"tool":{"index":0,"arguments":{}}}}', {}, true).valid, false);
  assert.equal(Output.inspect('['.repeat(65) + '0' + ']'.repeat(66), {}).valid, false);
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

test("only valid JSON prefixes qualify for a continuation, including partial numbers and escapes", () => {
 for (const prefix of ['{"x":"unfinished', '{"x":tru', '{"x":-1.2e+', '[null,', '"\\u12', '{"x" : ']) assert.equal(Output.inspect(prefix).incomplete, true, prefix);
 for (const bad of ['{"x":"missing quote\n]}', '{"x":01', '{"x":truX', '{"x":1,]', '{"x" "y', '{"x":"\\q', '[,', '[true false', '{"x":NaN', '"\\u1z']) assert.equal(Output.inspect(bad).incomplete, false, bad);
 const value={text:'quoted " string \\ newline\n',nested:[true,null,-1.25e9,{emoji:'😀'}]};
 const json=JSON.stringify(value);for(let i=1;i<json.length;i++)assert.equal(Output.inspect(json.slice(0,i)).incomplete,true,'valid prefix '+i);
 assert.equal(Output.inspect('['.repeat(66)+'0').incomplete,false,'Prefix parser is bounded');
});
test("captured paid DUI outline fragments request repair as soon as the prefix becomes invalid", async t => {
 const parts=require('./fixtures/dui-outline-broken-prefix.json');
 for(const pair of [[parts[0],parts[1]],[parts[3],parts[4]]]) {
  assert.equal(Output.inspect(pair[0].text).incomplete,true);
  assert.equal(Output.inspect(pair.map(p=>p.text).join('')).incomplete,false);
  const f=setup(t,[...pair.map(p=>reply(p.text,p.finish,256)),reply(truncated+tail)]);
  assert.equal(JSON.parse(await f.run()).sections.length,5);
  assert.deepEqual(f.saved.map(p=>p.purpose),['generate','continue','repair']);
  assert.equal(f.calls.length,3,'No repeated closing-bracket requests');
 }
});
test("an identical unfinished fragment stops continuation and uses bounded repair", async t => {
 const f=setup(t,[reply('{"x":"'),reply('repeated'),reply('repeated'),reply(truncated+tail)]);
 assert.equal(JSON.parse(await f.run()).sections.length,5);
 assert.deepEqual(f.saved.map(p=>p.purpose),['generate','continue','continue','repair']);
});

test("captured seven-section live outline joins per-fragment fences without a paid repair",async t=>{
 const parts=require('./fixtures/gemma-fragment-fences.json'),schema=structuredClone(contract);schema.properties.sections.minItems=schema.properties.sections.maxItems=7;
 const f=setup(t,parts.map((text,i)=>reply(text,i?'stop':'length',i?182:256)),{outputSchema:schema,maxFormatRepairs:0});
 const result=JSON.parse(await f.run());assert.equal(result.sections.length,7);assert.equal(f.calls.length,2);
 assert.equal(f.saved[1].jsonAssembly.removedFenceLines,true);assert.equal(f.saved[1].completion.choices[0].message.content,parts[1]);
 assert.match(result.sections[3].points[1],/data volume/);
 assert.equal(Output.continuationText('literal ```json backticks'), 'literal ```json backticks');
});

test("fence-only JSON continuations spend a repair instead of exhausting repeated continuations",async t=>{
 const f=setup(t,[reply(truncated),reply('```json\n'),reply(truncated+tail)]);
 assert.equal(JSON.parse(await f.run()).sections.length,5);assert.deepEqual(f.saved.map(x=>x.purpose),['generate','continue','repair']);
});
test("a terminal format failure uses the next selected model within the shared repair budget",async t=>{
 const f=setup(t,[reply('{}','stop',100),reply(truncated+tail,'stop',300)],{fallbackModels:[{model:'qwen25-14b',modelSource:'network'}],maxTokens:1000});
 f.api.network.models=async()=>[{model:'gemma3-12b',available:true,maxOutput:512},{model:'qwen25-14b',available:true,maxOutput:512}];
 assert.equal(JSON.parse(await f.run()).sections.length,5);
 assert.deepEqual(f.calls.map(x=>x.request.model),['koinos-network:gemma3-12b','koinos-network:qwen25-14b']);
 assert.deepEqual(f.saved.map(x=>x.purpose),['generate','repair']);assert(f.calls[1].request.max_tokens<=900);
});
test("an exact echoed schema is removed only when it cannot be the requested answer",async t=>{
 const valid=JSON.parse(await setup(t,[reply(truncated+tail)]).run()),raw='```json\n'+JSON.stringify(contract)+'\n'+JSON.stringify(valid)+'\n```';
 const f=setup(t,[reply(raw)]);assert.deepEqual(JSON.parse(await f.run()),valid);assert.equal(f.calls.length,1);assert.equal(f.saved[0].outputRecovery.kind,'echoed-output-schema');assert.equal(f.saved[0].completion.choices[0].message.content,raw);
 assert.equal(Output.inspect(JSON.stringify({type:'object'})+'\n'+JSON.stringify(valid),contract).valid,false,'A different schema cannot be discarded');
 assert.equal(Output.inspect(JSON.stringify(contract)+'\n'+JSON.stringify(valid)+'\n{}',contract).valid,false,'Multiple answer candidates stay invalid');
 assert.equal(Output.inspect('{"type":"object"}\n{}',{type:'object'}).valid,false,'An already-valid first value cannot be discarded');
});
