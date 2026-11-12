"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), { create } = require("../plugin/service");
const Model = require("../plugin/workflow-model"), Transfer = require("../plugin/service/workflow-transfer");
const { manage } = require("../plugin/service/manage");

function definition() {
  return { name: "Portable flow", model: "local-test", description: "Test workflow", enabled: true, graph: {
    version: 2, nodes: [Model.node("trigger", "start"), Model.node("code", "calculate", undefined, { source: 'return [{text:"answer",value:42}];' }), Model.node("output", "result")],
    edges: [Model.edge("start", "calculate"), Model.edge("calculate", "result")]
  } };
}
function appFixture(t) {
  const f = fixture(t, "kai.workflows"), app = create(f.api); t.after(() => app.dispose());
  return { ...f, app };
}
test("export/import preserves the definition and never overwrites or runs the source", async t => {
  const { app, calls } = appFixture(t), original = await app.call("workflows.workflow", definition());
  const apiExport = await app.call("workflows.export", { id: original.id });
  assert.equal(apiExport.schema, 1); // Preserve the documented API response.
  assert.equal(apiExport.workflow.id, undefined);
  const file = Transfer.exportWorkflow(original);
  assert.match(file.filename, /Portable-flow\.workflow\.json$/);
  assert.deepEqual(Object.keys(file.document).sort(), ["format", "version", "workflow"]);
  for (const value of [file.json, JSON.stringify(apiExport), JSON.stringify(original)]) {
    const imported = await app.call("workflows.importWorkflow", { text: value });
    assert.notEqual(imported.id, original.id); assert.equal(imported.enabled, false);
    assert.equal(imported.draft, true); assert.equal(imported.revision, 1); assert.equal(imported.nextRunAt, null);
    assert.deepEqual(imported.graph, original.graph); assert.notEqual(imported.name, original.name);
    await assert.rejects(app.call("workflows.run", { id: imported.id }), /Review and save/);
    await assert.rejects(app.call("workflows.workflowEnabled", { id: imported.id, enabled: true }), /draft/);
  }
  assert.deepEqual(await app.call("workflows.get", { id: original.id }), original);
  assert.equal((await app.call("workflows.list")).workflows.length, 4);
  assert.equal((await app.call("workflows.runs")).length, 0);
  assert.ok(!calls.some(c => /setup|execute|grant|save/.test(c.method)));
});
test("imported draft runs the real engine after review and save", async t => {
  const { app } = appFixture(t);
  const imported = await app.call("workflows.importWorkflow", { text: Transfer.exportWorkflow(definition()).json });
  await app.call("workflows.workflow", imported);
  const { id } = await app.call("workflows.run", { id: imported.id });
  for (let i = 0; i < 100; i++) {
    const run = await app.call("workflows.runGet", { id });
    if (run.status === "completed") { assert.match(JSON.stringify(run), /42/); return; }
    assert.notEqual(run.status, "failed", run.error);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Imported workflow did not complete");
});
test("transfer excludes runtime data and event registrations without changing the original", () => {
  const w = definition();
  Object.assign(w, { id: "old", revision: 12, updatedAt: 42, nextRunAt: 123, watch: { last: "private data" }, legacyTask: { lastChatId: "private" }, runs: ["private"], credentials: "secret" });
  Object.assign(w.graph.nodes[0].config, { kind: "app_event", connectionId: "connection-hint", triggerSlug: "NEW_ISSUE", triggerId: "registration", eventBinding: "account" });
  const before = structuredClone(w), out = Transfer.exportWorkflow(w).document;
  assert.deepEqual(w, before);
  assert.deepEqual(Object.keys(out.workflow).sort(), ["description", "enabled", "fallbackModels", "graph", "model", "modelPreference", "modelSource", "name"]);
  assert.doesNotMatch(JSON.stringify(out), /private|secret|registration|eventBinding|triggerId/);
  assert.equal(out.workflow.graph.nodes[0].config.connectionId, "connection-hint");
  const imported = Transfer.parseDocument(JSON.stringify(w));
  assert.equal(imported.graph.nodes[0].config.triggerId, undefined);
  assert.equal(imported.graph.nodes[0].config.eventBinding, undefined);
});
test("legacy steps, OpenHuman, UTF-8 BOM and fenced chat JSON are accepted", () => {
  const legacy = { name: "Legacy", model: "local-test", schedule: { kind: "manual" }, steps: [{ type: "prompt", text: "{{input}}" }, { type: "output", text: "{{previous}}" }] };
  assert.equal(Transfer.parseDocument(JSON.stringify(legacy)).graph.nodes[1].type, "agent");
  const foreign = { flow: { name: "Foreign", nodes: [{ id: "start", kind: "trigger", config: {} }, { id: "out", kind: "output", config: {} }], edges: [{ from_node: "start", to_node: "out" }] } };
  assert.equal(Transfer.parseDocument(JSON.stringify(foreign)).graph.edges[0].to, "out");
  const json = Transfer.exportWorkflow(definition()).json;
  for (const text of ["\uFEFF" + json, "```json\n" + json + "```", "  " + json]) assert.equal(Transfer.parseDocument(text).name, "Portable flow");
});
test("invalid documents cannot write even a partial workflow", async t => {
  const { app } = appFixture(t);
  const bad = ["{", "null", "[]", "42", "{}", JSON.stringify({ format: "other", version: 1 }), JSON.stringify({ format: "kai.workflow", version: 3, workflow: definition() }), JSON.stringify({ format: "kai.workflow", version: 1 }), JSON.stringify({ schema: 2, runtimeVersion: 2, workflow: definition() })];
  for (const mutate of [
    w => w.graph.version = 99,
    w => w.graph.nodes[0] = null,
    w => w.graph.edges[0] = null,
    w => w.graph.nodes[1].id = "start",
    w => w.graph.nodes[1].type = "shell",
    w => w.graph.nodes[1].config = [],
    w => w.graph.nodes[1].config.prompt = {},
    w => w.graph.nodes[1].config.tools = "not-an-array",
    w => w.graph.nodes[0].config.inputFields = [null],
    w => w.graph.edges[0].to = "missing",
    w => w.graph.edges[0].port = 'bad"port',
    w => w.graph.nodes.push(Model.node("trigger", "other")),
    w => w.graph.edges.push(Model.edge("result", "calculate"))
  ]) { const w = definition(); mutate(w); bad.push(JSON.stringify(w)); }
  for (const text of bad) await assert.rejects(app.call("workflows.importWorkflow", { text }));
  assert.equal((await app.call("workflows.list")).workflows.length, 0);
  assert.throws(() => Transfer.parseDocument(" ".repeat(Transfer.MAX_BYTES) + "{}"), /too large/);
  assert.throws(() => Transfer.parseDocument('["x",'.repeat(50) + "[]" + "]".repeat(50)), /deeply/);
});
test("larger partitioned workflows remain bounded on import and draft save", async t => {
  const { app } = appFixture(t), w = definition();
  for (let i = w.graph.nodes.length; i < 96; i++) w.graph.nodes.push(Model.node("code", "part" + i, undefined, { source: "return items;" }));
  assert.equal(Transfer.parseDocument(JSON.stringify(w)).graph.nodes.length, 96);
  const imported = await app.call("workflows.importWorkflow", { text: JSON.stringify(w) });
  w.graph.nodes.push(Model.node("code", "tooMany"));
  assert.throws(() => Transfer.parseDocument(JSON.stringify(w)), /1–96/);
  await assert.rejects(app.call("workflows.workflow", { ...imported, graph: w.graph, draft: true }), /1–96/);
});
test("missing machine-specific references stay editable drafts and cannot be saved ready", async t => {
  const { app } = appFixture(t), w = Model.template("ask", "model-on-another-machine");
  const imported = await app.call("workflows.importWorkflow", { text: JSON.stringify(w) });
  assert.equal(imported.draft, true);
  await assert.rejects(app.call("workflows.workflow", imported), /installed local model/);
  const child = definition(); child.graph.nodes[1] = Model.node("sub_workflow", "calculate", undefined, { workflowId: "unavailable" });
  const nested = await app.call("workflows.importWorkflow", { text: JSON.stringify(child) });
  await assert.rejects(app.call("workflows.workflow", nested), /sub-workflow/);
});
test("native file dialogs cancel without writes and save UTF-8 files that can be reimported", async t => {
  const f = fixture(t, "transfer"), w = definition(), saved = [], file = path.join(f.root, "roundtrip.json");
  w.graph.nodes[1].config.source = "//" + "界".repeat(60000) + "\nreturn items;";
  const service = { store: { requireStorage() {}, data: { workflows: [] } }, workflows: { save(spec, options) { saved.push({ spec, options }); return spec; } } };
  const ctx = { signal: f.controller.signal, dialog: { showSaveDialog: async () => ({ canceled: true }), showOpenDialog: async () => ({ canceled: true }) } };
  assert.equal(await manage(service, ctx, "exportWorkflow", { workflow: w }), false);
  assert.equal(await manage(service, ctx, "importWorkflow"), null); assert.equal(saved.length, 0);
  ctx.dialog.showSaveDialog = async (_window, options) => { assert.match(options.defaultPath, /workflow\.json$/); return { canceled: false, filePath: file }; };
  assert.equal(await manage(service, ctx, "exportWorkflow", { workflow: w }), true);
  assert.ok(fs.statSync(file).size > 160000, "Regression: old importer rejected Unicode exports over 160 KB");
  ctx.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  const imported = await manage(service, ctx, "importWorkflow");
  assert.equal(imported.graph.nodes[1].config.source, w.graph.nodes[1].config.source);
  assert.deepEqual(saved[0].options, { draft: true });
  fs.writeFileSync(file, "x".repeat(Transfer.MAX_BYTES + 1));
  await assert.rejects(manage(service, ctx, "importWorkflow"), /too large/); assert.equal(saved.length, 1);
  ctx.dialog.showSaveDialog = async () => { f.controller.abort(); return { canceled: false, filePath: path.join(f.root, "aborted.json") }; };
  await assert.rejects(manage(service, ctx, "exportWorkflow", { workflow: w }), /abort/i);
  assert.equal(fs.existsSync(path.join(f.root, "aborted.json")), false);
});

test("model-agnostic starters import, validate with a selected model and complete through the native service", async t => {
  const { app } = appFixture(t), directory = path.join(__dirname, "../examples");
  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".workflow.json"))) {
    // Network/research examples have their own end-to-end fixtures and inputs.
    if (JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")).workflow.model) continue;
    const draft = await app.call("workflows.importWorkflow", { text: fs.readFileSync(path.join(directory, file), "utf8") });
    assert.equal(draft.model, ""); assert.equal(draft.draft, true); assert.equal(draft.enabled, false);
    const saved = await app.call("workflows.workflow", { ...draft, model: "local-test" });
    const { id } = await app.call("workflows.run", { id: saved.id, input: "Synthetic input for " + file });
    let run;
    for (let i = 0; i < 100; i++) {
      run = await app.call("workflows.runGet", { id });
      if (["completed", "failed"].includes(run.status)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(run.status, "completed", file + ": " + run.error);
    assert.match(JSON.stringify(run), /Synthetic local reply/);
  }
});
