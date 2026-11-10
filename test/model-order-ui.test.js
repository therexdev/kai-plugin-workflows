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
  assert.deepEqual((await f.exported()).fallbackModels, ["local-b", "koinos-network:c", "local-d"]);
  await f.click("fallbackUp", "2"); await f.click("fallbackRemove", "0");
  assert.deepEqual((await f.exported()).fallbackModels, ["local-d", "koinos-network:c"]);
  await f.click("undo"); assert.deepEqual((await f.exported()).fallbackModels, ["local-b", "local-d", "koinos-network:c"]);
  f.select("model", "local-d"); assert.deepEqual((await f.exported()).fallbackModels, ["local-b", "koinos-network:c"]);
});
test("new agents inherit the workflow list and a custom node list clears when inheritance is restored", async () => {
  const f = fixture(); await f.click("edit", "flow"); await f.click("add", "agent");
  assert.match(f.host.innerHTML, /Use workflow model order/); assert.match(f.host.innerHTML, /Uses the workflow/);
  f.select("config.model", "local-b"); f.select("config.addFallback", "local-d");
  let w = await f.exported(), n = w.graph.nodes.at(-1);
  assert.equal(n.config.model, "local-b"); assert.deepEqual(n.config.fallbackModels, ["local-d"]);
  f.select("config.model", ""); w = await f.exported(); n = w.graph.nodes.at(-1);
  assert.equal(n.config.model, ""); assert.deepEqual(n.config.fallbackModels, []);
  assert.deepEqual(w.fallbackModels, ["local-b", "koinos-network:c"]);
});
