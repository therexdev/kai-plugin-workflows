"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../plugin/app.js"), "utf8");
function fixture({ locked = false } = {}) {
  const calls = [], renders = [];
  function element(tag = "div") { return { tagName: tag, children: [], dataset: {}, className: "", textContent: "", classList: { toggle() {} }, append(...items) { this.children.push(...items); }, prepend(item) { this.children.unshift(item); }, replaceChildren(...items) { this.children = items; }, setAttribute() {}, querySelector(selector) { const cls = selector.slice(1); return this.children.flatMap(c => [c, ...(c.children || [])]).find(c => c.className === cls) || null; } }; }
  const host = element(), state = { locked, available: true, models: [], workflows: [], runs: [], connections: [], sources: [], workflowState: {} };
  const window = { addEventListener() {}, KaiWorkflows: { render: (out, api) => renders.push({ out, api }), canLeave: () => true, leave() {} }, kai: { async call(method, input) { calls.push({ method, input }); return method === "workflows.status" ? state : { saved: input }; } } };
  vm.runInNewContext(source, { window, document: { getElementById: () => host, createElement: element }, console });
  return { host, calls, renders, state };
}
test("original workspace exposes all four sections and forwards complete graph settings", async () => {
  const f = fixture(); await new Promise(setImmediate);
  assert.equal(f.calls[0].method, "workflows.status");
  const rail = f.host.children[1].children[0]; assert.deepEqual(rail.children.slice(1).map(b => b.textContent), ["My workflows", "Run history", "Templates", "Discover workflows"]);
  const graph = { version: 2, nodes: [{ id: "start", type: "trigger", config: { kind: "schedule", schedule: { kind: "interval", minutes: 15 } } }, { id: "body", type: "loop", config: { maxIterations: 5 } }], edges: [] };
  await f.renders[0].api.manage("workflow", { name: "Full graph", enabled: true, graph });
  assert.deepEqual(f.calls.at(-1), { method: "workflows.workflow", input: { name: "Full graph", enabled: true, graph } });
  await f.renders[0].api.navigate("discover"); assert.equal(f.renders.at(-1).api.section, "discover");
});
test("locked original storage remains a visible recovery state", async () => {
  const f = fixture({ locked: true }); await new Promise(setImmediate);
  assert.equal(f.renders.length, 0); assert.match(f.host.children[1].children[1].children[0].textContent, /data is locked/);
  assert.equal(f.calls.length, 1);
});
