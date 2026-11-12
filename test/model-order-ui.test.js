"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const Model = require("../plugin/workflow-model"), KaiI18n = require("./i18n-fixture");
function fixture() {
  const calls = [], w = { ...Model.template("ask", "local-a"), id: "flow", fallbackModels: ["local-b", "koinos-network:c"] };
  const state = { workflows: [w], runs: [], connections: [], sources: [], workflowState: {}, models: ["a", "b", "d"].map(x => ({ alias: "local-" + x, status: "ready", source: "local" })).concat({ alias: "koinos-network:c", status: "unavailable", source: "network" }) };
  const inspector = { scrollTop: 0 }, notice = { textContent: "", classList: { toggle() {} } };
  const host = { isConnected: false, innerHTML: "", querySelector: s => s === ".wf-inspector" ? inspector : s === ".wf-notice" ? notice : null, querySelectorAll: () => [] };
  const window = { KaiWorkflowModel: Model };
  vm.runInNewContext(fs.readFileSync(require.resolve("../plugin/workflows.js"), "utf8"), { window, KaiI18n, setTimeout: () => 0, clearTimeout() {} });
  window.KaiWorkflows.render(host, { state, section: "saved", manage: async (action, input) => { calls.push({ action, input: structuredClone(input) }); return action === "status" ? state : true; } });
  const click = (action, id = "") => host.onclick({ target: { closest: s => s === "[data-wf]" ? { dataset: { wf: action, id } } : null } });
  const select = (field, value) => host.onchange({ target: { dataset: { field }, value } });
  const exported = async () => { await click("exportCanvas"); return calls.at(-1).input.workflow; };
  return { host, click, select, exported };
}
test("builder adds, reorders, removes and exports explicit fallbacks with undo", async () => {
  const f = fixture(); await f.click("edit", "flow"); await f.click("inspector", "settings");
  assert.match(f.host.innerHTML, /Primary model/); assert.match(f.host.innerHTML, /Fallback models/);
  assert.doesNotMatch(f.host.innerHTML, /auto-research|auto-outline|auto-writing/);
  f.select("addFallback", "local-d");
  assert.deepEqual((await f.exported()).fallbackModels.map(m => m.model), ["local-b", "c", "local-d"]);
  await f.click("fallbackUp", "2"); await f.click("fallbackRemove", "0");
  assert.deepEqual((await f.exported()).fallbackModels.map(m => m.model), ["local-d", "c"]);
  await f.click("undo"); assert.deepEqual((await f.exported()).fallbackModels.map(m => m.model), ["local-b", "local-d", "c"]);
  f.select("model", "local-d"); assert.deepEqual((await f.exported()).fallbackModels.map(m => m.model), ["local-b", "c"]);
});
test("new agents inherit the workflow list and a custom node list clears when inheritance is restored", async () => {
  const f = fixture(); await f.click("edit", "flow"); await f.click("add", "agent");
  assert.match(f.host.innerHTML, /Use workflow model order/); assert.match(f.host.innerHTML, /Uses the workflow/);
  f.select("config.model", "local-b"); f.select("config.addFallback", "local-d");
  let w = await f.exported(), n = w.graph.nodes.at(-1);
  assert.equal(n.config.model, "local-b"); assert.deepEqual(n.config.fallbackModels.map(m => m.model), ["local-d"]);
  f.select("config.model", ""); w = await f.exported(); n = w.graph.nodes.at(-1);
  assert.equal(n.config.model, ""); assert.deepEqual(n.config.fallbackModels.map(m => m.model), []);
  assert.deepEqual(w.fallbackModels.map(m => m.model), ["local-b", "c"]);
});
test("model and location controls export both preferences, fallback locations and node overrides", async () => {
  const f = fixture(); await f.click("edit", "flow"); await f.click("inspector", "settings");
  assert.match(f.host.innerHTML, /Local only/); assert.match(f.host.innerHTML, /Network only/); assert.match(f.host.innerHTML, /Local and network/);
  assert.match(f.host.innerHTML, /class="wf-model-preference" hidden/);
  f.select("modelSource", "both"); f.select("modelPreference", "network");
  f.select("fallbackModels.0.modelSource", "both"); f.select("fallbackModels.0.modelPreference", "local");
  let w = await f.exported();
  assert.equal(w.model, "local-a"); assert.equal(w.modelSource, "both"); assert.equal(w.modelPreference, "network");
  assert.deepEqual(w.fallbackModels[0], { model: "local-b", modelSource: "both", modelPreference: "local" });
  assert.equal(w.fallbackModels[1].modelSource, "network");
  await f.click("add", "agent"); f.select("config.model", "local-d"); f.select("config.modelSource", "network");
  w = await f.exported(); assert.equal(w.graph.nodes.at(-1).config.modelSource, "network");
  assert.equal(w.modelSource, "both");
});
test("agent JSON format and schema survive builder editing and export", async () => {
  const f = fixture(); await f.click("edit", "flow"); await f.click("add", "agent");
  f.select("config.outputFormat", "json");
  assert.match(f.host.innerHTML, /JSON schema \(optional\)/); assert.match(f.host.innerHTML, /Maximum JSON repairs/);
  const w = await f.exported(); assert.equal(w.graph.nodes.at(-1).config.outputFormat, "json");
  f.select("config.outputFormat", "text"); assert.doesNotMatch(f.host.innerHTML, /Maximum JSON repairs/);
});
