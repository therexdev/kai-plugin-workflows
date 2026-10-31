"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../plugin/app.js"), "utf8");
function fixture({ locked = false, canLeave = async () => true, hasUnsavedChanges = () => false } = {}) {
  const calls = [], renders = [], events = {}; let leaves = 0;
  function element(tag = "div") { return { tagName: tag, children: [], dataset: {}, className: "", textContent: "", classList: { toggle() {} }, append(...items) { this.children.push(...items); }, prepend(item) { this.children.unshift(item); }, replaceChildren(...items) { this.children = items; }, setAttribute() {}, querySelector(selector) { const cls = selector.slice(1); return this.children.flatMap(c => [c, ...(c.children || [])]).find(c => c.className === cls) || null; } }; }
  const host = element(), state = { locked, available: true, models: [], workflows: [], runs: [], connections: [], sources: [], workflowState: {} };
  const window = { addEventListener(name, handler) { events[name] = handler; }, KaiWorkflows: { render: (out, api) => renders.push({ out, api }), canLeave, hasUnsavedChanges, leave() { leaves++; } }, kai: { async call(method, input) { calls.push({ method, input }); return method === "workflows.status" ? state : { saved: input }; } } };
  vm.runInNewContext(source, { window, document: { getElementById: () => host, createElement: element }, console });
  return { host, calls, renders, state, events, get leaves() { return leaves; } };
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

test("section navigation waits for a styled review and cancellation keeps the current editor", async () => {
  let answer, reviews = 0;
  const f = fixture({ canLeave: () => { reviews++; return new Promise(resolve => { answer = resolve; }); } }); await new Promise(setImmediate);
  const before = f.host.children.slice(), pending = f.renders[0].api.navigate("runs");
  assert.equal(reviews, 1); assert.equal(f.calls.length, 1); assert.equal(f.leaves, 0);
  await f.renders[0].api.navigate("templates"); assert.equal(reviews, 1, "duplicate navigation cannot stack reviews");
  answer(false); await pending;
  assert.deepEqual(f.host.children, before); assert.equal(f.leaves, 0); assert.equal(f.renders.length, 1);
  const approved = f.renders[0].api.navigate("runs"); answer(true); await approved;
  assert.equal(f.leaves, 1); assert.equal(f.renders.at(-1).api.section, "runs");
});
test("failed review preserves the editor and unlocks navigation for a later attempt", async () => {
  let rejectReview = true;
  const f = fixture({ canLeave: async () => { if (rejectReview) throw Error("Review closed"); return true; } }); await new Promise(setImmediate);
  await f.renders[0].api.navigate("runs"); assert.equal(f.leaves, 0); assert.equal(f.renders.length, 1);
  rejectReview = false; await f.renders[0].api.navigate("runs"); assert.equal(f.leaves, 1);
});
test("unload uses a synchronous dirty guard without accepting an unresolved review Promise", async () => {
  let dirty = true, reviews = 0;
  const f = fixture({ canLeave: async () => { reviews++; return true; }, hasUnsavedChanges: () => dirty }); await new Promise(setImmediate);
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  f.events.beforeunload(event); assert.equal(event.prevented, true); assert.equal(event.returnValue, false); assert.equal(reviews, 0);
  dirty = false; const clean = { preventDefault() { throw Error("Clean editor should close"); } }; f.events.beforeunload(clean); assert.equal(reviews, 0);
});
