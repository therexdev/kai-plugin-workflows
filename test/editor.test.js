"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../plugin/app.js"), "utf8"), html = fs.readFileSync(path.join(__dirname, "../plugin/index.html"), "utf8");
function fixture() {
  const nodes = new Map(), calls = [];
  function element(tag = "div") {
    return { tagName: tag.toUpperCase(), isConnected: true, hidden: false, value: "", textContent: "", children: [], dataset: {}, events: {}, classList: { toggle() {} },
      get childElementCount() { return this.children.length; },
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      addEventListener(event, fn) { this.events[event] = fn; }, setAttribute() {}, scrollIntoView() {}, focus() {}, click() { return this.events.click?.({ currentTarget: this }); } };
  }
  for (const [, tag, id] of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)) nodes.set(id, element(tag));
  const context = vm.createContext({ console, setInterval() {}, document: { getElementById: id => nodes.get(id), createElement: element, querySelectorAll: () => [], querySelector: () => null }, window: {
    confirm: () => false, KaiPluginNotice: { attach: () => ({ show() {}, clear() {} }) },
    kai: { async call(method, input) {
      calls.push({ method, input });
      if (method === "workflows.list") return { workflows: [] };
      if (method === "workflows.agents") return [];
      if (method === "models.list") return [{ alias: "local", status: "ready" }];
      if (method === "workflows.save") return { id: "saved", ...input };
      throw Error("Unexpected broker call " + method);
    } },
  } });
  vm.runInContext(source, context);
  return { context, nodes, calls, run: code => vm.runInContext(code, context) };
}
const graph = { version: 2, custom: { preserve: true }, nodes: [
  { id: "start", type: "trigger", label: "Start", config: { kind: "manual" }, position: { x: 60, y: 20 } },
  { id: "branch", type: "condition", label: "Choose", config: { expression: "=item.ok", nested: { unknown: "keep" } }, position: { x: 60, y: 220 } },
  { id: "yes", type: "output", label: "Yes", config: { text: "Approved" }, position: { x: 20, y: 450 } },
  { id: "no", type: "output", label: "No", config: { text: "Declined" }, position: { x: 350, y: 450 } },
], edges: [ { id: "a", from: "start", to: "branch", port: "main", input: "main" }, { id: "b", from: "branch", to: "yes", port: "true", input: "main" }, { id: "c", from: "branch", to: "no", port: "false", input: "main" } ] };
test("opening and saving a branched graph preserves all connections, positions and unknown settings", async () => {
  const f = fixture(); await new Promise(setImmediate);
  f.context.imported = { id: "existing", name: "Original", description: "Saved graph", model: "local", graph };
  f.run("openDraft(imported)"); f.nodes.get("flow-name").value = "Renamed";
  await f.nodes.get("save-flow").click();
  const saved = f.calls.find(c => c.method === "workflows.save").input;
  assert.equal(saved.id, "existing"); assert.equal(saved.name, "Renamed");
  assert.deepEqual(JSON.parse(JSON.stringify(saved.graph)), graph);
  assert.equal(Object.hasOwn(saved, "steps"), false, "canvas must not convert a branched graph to linear steps");
});
test("declining a fresh builder replacement keeps the original graph intact", async () => {
  const f = fixture(); await new Promise(setImmediate);
  f.context.imported = { id: "existing", name: "Original", model: "local", graph };
  f.run("openDraft(imported)"); await f.nodes.get("advanced-toggle").click();
  const draft = JSON.parse(JSON.stringify(f.run("draft()")));
  assert.deepEqual(draft.graph, graph); assert.equal(Object.hasOwn(draft, "steps"), false);
  assert.equal(f.calls.some(c => c.method === "workflows.save"), false);
});
