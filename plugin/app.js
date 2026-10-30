"use strict";
const $ = id => document.getElementById(id), state = { workflows: [], agents: [], models: [], steps: [], editing: null, agentId: null, launchId: null, runId: null, advanced: false, polling: false, selectedStep: 0 };
const call = (method, input) => window.kai.call(method, input);
const banner = window.KaiPluginNotice.attach($("notice"), { focusTarget: () => document.querySelector("nav button.active") });
function notice(message, error = false, force = true) { banner.show(message, { error, force }); }
function act(fn) { return async event => { const button = event?.currentTarget; if (button?.tagName === "BUTTON") button.disabled = true; try { await fn(event); } catch (e) { notice(e.message || String(e), true); } finally { if (button?.isConnected) button.disabled = false; } }; }
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, fn, className = "small") { const node = el("button", text, className); node.addEventListener("click", act(fn)); return node; }
function field(label, input) { const node = el("label", label); node.append(input); return node; }
function input(value, change, area = false) { const node = el(area ? "textarea" : "input"); node.value = value || ""; if (area) node.rows = 3; node.addEventListener("input", () => change(node.value)); return node; }
function select(options, value, change) { const node = el("select"); for (const [id, label] of options) { const option = el("option", label); option.value = id; node.append(option); } node.value = value || ""; node.addEventListener("change", () => change(node.value)); return node; }
function fillModels(node, value = "") { node.replaceChildren(); const options = [["", "Choose an installed model"], ...state.models.map(m => [m.alias, m.label || m.alias])]; for (const [id, label] of options) { const option = el("option", label); option.value = id; node.append(option); } node.value = value; }
function tab(name) { if (name !== "workflows") closeEditor(); document.querySelectorAll(".panel").forEach(node => { node.hidden = node.id !== name; }); document.querySelectorAll("nav button").forEach(node => (node.classList.toggle("active", node.dataset.tab === name), node.setAttribute("aria-current", node.dataset.tab === name ? "page" : "false"))); if (name === "runs") void refreshRuns().catch(e => notice(e.message, true)); }
function empty(container, message) { if (!container.childElementCount) container.append(el("div", message, "empty")); }
async function refresh() {
  const [flows, agents, models] = await Promise.all([call("workflows.list"), call("workflows.agents"), call("models.list")]);
  state.workflows = flows.workflows; state.agents = agents; state.models = models.filter(m => m.status === "ready");
  $("flow-count").textContent = state.workflows.length; $("agent-count").textContent = agents.length; renderFlows(); renderAgents();
  if (!state.models.length) notice("Install a local model in KAI Core to create reasoning steps. Output and review flows work without a model.");
}
function renderFlows() {
  const container = $("flow-list"); container.replaceChildren();
  for (const flow of state.workflows.filter(flow => `${flow.name} ${flow.description || ""}`.toLowerCase().includes($("workflow-filter").value.trim().toLowerCase()))) {
    const card = el("article", undefined, "card flow-row"), info = el("div", undefined, "flow-info");
    card.append(el("span", "⑂", "flow-icon"), info); info.append(el("h3", flow.name), el("p", flow.description || "A reusable sequence of local steps."), el("div", flow.runnable ? "Manual flow" : "Preserved flow", "badge"));
    if (flow.unavailableReason) info.append(el("p", flow.unavailableReason, "unavailable"));
    const actions = el("div", undefined, "actions");
    if (!flow.unavailableReason) {
      actions.append(button("Run →", () => openLaunch(flow), "small primary"), button("Edit", async () => openDraft(await call("workflows.get", { id: flow.id }))), button("Export", async () => { $("exchange").hidden = false; $("exchange-json").value = JSON.stringify(await call("workflows.export", { id: flow.id }), null, 2); $("exchange").scrollIntoView({ behavior: "smooth" }); }), button("Delete", async () => { if (!window.confirm("Delete this workflow and its plugin run history?")) return; await call("workflows.remove", { id: flow.id }); await refresh(); }, "small danger"));
    }
    card.append(actions); container.append(card);
  }
  empty(container, $("workflow-filter").value.trim() ? "No workflows match your search." : "No workflows yet. Start from a template or build your own flow.");
}
function newDraft() { state.editing = null; state.selectedStep = 0; state.steps = [{ type: "agent", label: "Think", text: "Respond to this request:\n{{input}}" }, { type: "output", label: "Result", text: "{{previous}}" }]; state.advanced = false; $("flow-name").value = ""; $("flow-description").value = ""; fillModels($("flow-model"), state.models[0]?.alias); showEditor(); }
function closeEditor() { $("editor").hidden = true; $("workflow-library").hidden = false; }
function showEditor() { tab("workflows"); $("workflow-library").hidden = true; $("exchange").hidden = true; $("editor").hidden = false; $("editor-title").textContent = state.editing ? "Edit workflow" : "New workflow"; renderSteps(); $("editor").scrollIntoView({ behavior: "smooth", block: "start" }); }
function openDraft(flow) {
  state.editing = flow.id || null; $("flow-name").value = flow.name || "Imported workflow"; $("flow-description").value = flow.description || ""; fillModels($("flow-model"), flow.model || ""); state.advanced = true; $("graph-json").value = JSON.stringify(flow.graph, null, 2); state.steps = []; showEditor(); notice("Review the graph before saving. Existing graph definitions are edited without losing their settings.");
}
const STEP_TYPES = [["agent", "Local agent"], ["saved_agent", "Saved agent"], ["sub_workflow", "Saved workflow"], ["approval", "Human review"], ["output_parser", "Parse output"], ["output", "Result"]];
function renderCanvas() {
  const canvas = $("workflow-canvas"); canvas.replaceChildren();
  if (state.advanced) {
    try {
      const graph = JSON.parse($("graph-json").value);
      if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw Error("Graph needs nodes and connections.");
      canvas.append(el("p", "Saved graph · connections and settings remain in Graph JSON", "hint"));
      for (const node of graph.nodes) {
        const card = el("article", undefined, "flow-node");
        card.append(el("small", node.type), el("strong", node.label || node.id));
        const next = graph.edges.filter(edge => edge.from === node.id).map(edge => `${edge.port || "main"} → ${graph.nodes.find(n => n.id === edge.to)?.label || edge.to}`);
        if (next.length) card.append(el("p", next.join(" · ")));
        canvas.append(card);
      }
    } catch { canvas.append(el("p", "Complete the graph JSON to view its nodes.", "hint")); }
    return;
  }
  const trigger = el("div", undefined, "flow-node trigger-node"); trigger.append(el("small", "TRIGGER"), el("strong", "Run manually")); canvas.append(trigger);
  state.steps.forEach((step, index) => {
    canvas.append(el("div", undefined, "flow-connector"));
    const node = button("", () => { state.selectedStep = index; renderSteps(); }, "flow-node" + (index === state.selectedStep ? " selected" : ""));
    node.setAttribute("aria-pressed", String(index === state.selectedStep));
    node.setAttribute("aria-label", `Edit step ${index + 1}: ${step.label || step.type}`);
    node.append(el("small", `${index + 1} · ${STEP_TYPES.find(t => t[0] === step.type)?.[1] || step.type}`), el("strong", step.label || "Untitled step"), el("p", step.text || (step.type === "output_parser" ? "Parse " + (step.format || "json") : "Choose its settings")));
    canvas.append(node);
  });
}
function addStep(type = "agent") {
  if (state.advanced) return;
  if (state.steps.length >= 18) return notice("A flow can contain up to 18 steps.", true);
  state.steps.push({ type, label: STEP_TYPES.find(t => t[0] === type)?.[1] || "Step", text: "{{previous}}" });
  state.selectedStep = state.steps.length - 1; renderSteps();
}
function renderSteps() {
  state.selectedStep = Math.max(0, Math.min(state.selectedStep, state.steps.length - 1));
  renderCanvas(); $("step-palette").hidden = state.advanced;
  $("steps").hidden = state.advanced; $("add-step").hidden = state.advanced; $("graph-editor").hidden = !state.advanced; $("template").hidden = state.advanced;
  $("advanced-toggle").textContent = state.advanced ? "Start fresh in step builder" : "Graph JSON";
  const container = $("steps"); container.replaceChildren();
  state.steps.forEach((s, index) => {
    if (index !== state.selectedStep) return;
    const row = el("article", undefined, "step"), head = el("div", undefined, "step-head"), controls = el("div", undefined, "actions");
    controls.append(button("↑", () => { if (index) { [state.steps[index - 1], state.steps[index]] = [state.steps[index], state.steps[index - 1]]; state.selectedStep--; } renderSteps(); }), button("↓", () => { if (index < state.steps.length - 1) { [state.steps[index + 1], state.steps[index]] = [state.steps[index], state.steps[index + 1]]; state.selectedStep++; } renderSteps(); }), button("Remove", () => { state.steps.splice(index, 1); renderSteps(); }, "small danger"));
    head.append(el("span", "STEP " + String(index + 1).padStart(2, "0"), "step-num"), controls); row.append(head);
    const grid = el("div", undefined, "form-grid"); grid.append(field("Action", select(STEP_TYPES, s.type, value => { s.type = value; renderSteps(); })), field("Label", input(s.label, value => { s.label = value; renderCanvas(); }))); row.append(grid);
    if (s.type === "saved_agent") row.append(field("Agent", select([["", "Choose a saved agent"], ...state.agents.map(a => [a.id, a.name])], s.agentId, value => s.agentId = value)));
    if (s.type === "sub_workflow") row.append(field("Workflow", select([["", "Choose a saved workflow"], ...state.workflows.filter(w => w.runnable && w.id !== state.editing).map(w => [w.id, w.name])], s.workflowId, value => s.workflowId = value)));
    if (s.type === "agent") row.append(field("Model", select([["", "Use the flow's default model"], ...state.models.map(m => [m.alias, m.label || m.alias])], s.model, value => s.model = value)));
    if (["agent", "saved_agent", "approval", "output"].includes(s.type)) row.append(field(s.type === "approval" ? "Review message" : s.type === "output" ? "Result template" : "Prompt", input(s.text, value => { s.text = value; renderCanvas(); }, true)));
    if (s.type === "output_parser") { row.append(field("Format", select([["json", "JSON"], ["csv", "CSV"], ["text", "Text"]], s.format || "json", value => s.format = value)), field("Required fields (comma separated)", input(s.required, value => s.required = value))); }
    container.append(row);
  });
}
function draft() { return { ...(state.editing ? { id: state.editing } : {}), name: $("flow-name").value, description: $("flow-description").value, model: $("flow-model").value, ...(state.advanced ? { graph: JSON.parse($("graph-json").value) } : { steps: state.steps }) }; }
function renderAgents() {
  const container = $("agent-list"); container.replaceChildren();
  for (const a of state.agents) { const card = el("article", undefined, "card"), actions = el("div", undefined, "actions"); card.append(el("div", "LOCAL AGENT", "badge"), el("h3", a.name), el("p", a.instructions.slice(0, 160)), el("span", a.model, "hint")); actions.append(button("Edit", () => editAgent(a)), button("Delete", async () => { if (!window.confirm("Delete this saved agent? Existing workflow copies will remain.")) return; await call("workflows.agentRemove", { id: a.id }); await refresh(); }, "small danger")); card.append(actions); container.append(card); }
  empty(container, "Create a reusable agent such as an editor, planner or reviewer. Each uses an installed local model.");
}
function editAgent(a = {}) { state.agentId = a.id || null; $("agent-name").value = a.name || ""; $("agent-instructions").value = a.instructions || ""; fillModels($("agent-model"), a.model || state.models[0]?.alias); $("agent-editor").hidden = false; $("agent-editor").scrollIntoView({ behavior: "smooth" }); }
function openLaunch(flow) { state.launchId = flow.id; $("launch-title").textContent = "Run · " + flow.name; $("run-input").value = ""; $("launch").hidden = false; $("launch").scrollIntoView({ behavior: "smooth" }); $("run-input").focus(); }
async function refreshRuns() {
  const runs = await call("workflows.runs"), container = $("run-list"); container.replaceChildren();
  for (const r of runs) { const card = el("article", undefined, "card"); card.append(el("div", r.status.toUpperCase(), "badge"), el("h3", r.name), el("p", new Date(r.startedAt).toLocaleString()), button("View result", async () => { state.runId = r.id; await showRun(); })); container.append(card); }
  empty(container, "Completed, paused and stopped runs appear here. Earlier app history stays preserved in its original storage.");
}
async function showRun() {
  if (!state.runId) return; const r = await call("workflows.runGet", { id: state.runId }); state.pollStatus = r.status;
  $("run-detail").hidden = false; $("run-title").textContent = r.name; $("run-status").textContent = r.status.toUpperCase(); $("run-output").textContent = r.error || (r.status === "waiting" ? JSON.stringify(r.pending, null, 2) : r.previous || "Waiting for the local model…");
  const actions = $("run-actions"); actions.replaceChildren();
  if (r.status === "waiting") actions.append(button("Approve and continue", async () => { await call("workflows.decide", { id: r.id, decision: "approved" }); await showRun(); }, "primary"), button("Reject", async () => { await call("workflows.decide", { id: r.id, decision: "rejected" }); await showRun(); }));
  if (["running", "waiting", "interrupted"].includes(r.status)) actions.append(button("Stop run", async () => { await call("workflows.cancel", { id: r.id }); await showRun(); await refreshRuns(); }, "danger"));
  const steps = $("run-steps"); steps.replaceChildren(); for (const s of r.steps || []) { const details = el("details"); details.append(el("summary", s.label + " · " + s.status), el("pre", s.output || s.error || "Running…")); steps.append(details); }
  return r;
}
document.querySelectorAll("nav button").forEach(node => node.addEventListener("click", () => tab(node.dataset.tab)));
$("new-flow").addEventListener("click", newDraft); $("editor-close").addEventListener("click", closeEditor);
$("add-step").addEventListener("click", () => addStep());
document.querySelectorAll("[data-add-step]").forEach(node => node.addEventListener("click", () => addStep(node.dataset.addStep)));
$("workflow-filter").addEventListener("input", renderFlows);
$("graph-json").addEventListener("input", renderCanvas);
$("writing-template").addEventListener("click", () => { newDraft(); $("template").click(); });
$("simple-template").addEventListener("click", newDraft);
$("exchange-close").addEventListener("click", () => $("exchange").hidden = true);
$("run-close").addEventListener("click", () => { $("run-detail").hidden = true; state.runId = null; });
$("template").addEventListener("click", () => { state.steps = [{ type: "agent", label: "Plan", text: "Create a concise outline for this request:\n{{input}}" }, { type: "agent", label: "Draft", text: "Write a useful draft from this outline:\n{{previous}}" }, { type: "approval", label: "Review", text: "Review this draft:\n{{previous}}" }, { type: "agent", label: "Refine", text: "Improve the clarity of this draft while preserving its meaning:\n{{previous}}" }, { type: "output", label: "Final result", text: "{{previous}}" }]; if (!$("flow-name").value) $("flow-name").value = "Plan, draft and refine"; renderSteps(); });
$("advanced-toggle").addEventListener("click", act(async () => { if (state.advanced) { if (!window.confirm("Replace this graph with a fresh step builder draft?")) return; state.advanced = false; state.steps = [{ type: "agent", text: "{{input}}" }, { type: "output", text: "{{previous}}" }]; } else { const saved = await call("workflows.save", draft()); state.editing = saved.id; $("graph-json").value = JSON.stringify(saved.graph, null, 2); state.advanced = true; await refresh(); notice("Workflow saved. You can now edit its version 2 graph."); } renderSteps(); }));
$("save-flow").addEventListener("click", act(async () => { const saved = await call("workflows.save", draft()); state.editing = saved.id; await refresh(); notice("Workflow saved. Run it from the library when ready."); closeEditor(); }));
$("import-toggle").addEventListener("click", () => $("exchange").hidden = !$("exchange").hidden);
$("import-flow").addEventListener("click", act(() => { const raw = JSON.parse($("exchange-json").value), flow = raw.workflow || raw; if (!flow.graph) throw Error("Paste a workflow with a version 2 graph."); openDraft({ ...flow, id: undefined }); notice("Imported as an unsaved draft. Review the graph, then save."); }));
$("new-agent").addEventListener("click", () => editAgent()); $("agent-close").addEventListener("click", () => $("agent-editor").hidden = true);
$("save-agent").addEventListener("click", act(async () => { await call("workflows.agentSave", { ...(state.agentId ? { id: state.agentId } : {}), name: $("agent-name").value, instructions: $("agent-instructions").value, model: $("agent-model").value }); await refresh(); $("agent-editor").hidden = true; notice("Agent saved. Choose Saved agent when adding a workflow step."); }));
$("launch-close").addEventListener("click", () => $("launch").hidden = true);
$("start-run").addEventListener("click", act(async () => { const r = await call("workflows.run", { id: state.launchId, input: $("run-input").value }); state.runId = r.id; $("launch").hidden = true; tab("runs"); await showRun(); notice("Run started locally. Keep this plugin window open."); }));
$("refresh-runs").addEventListener("click", act(refreshRuns));
setInterval(async () => { if (state.polling || !state.runId || $("runs").hidden || ["completed", "failed", "cancelled"].includes(state.pollStatus)) return; state.polling = true; try { const r = await showRun(); if (["completed", "failed", "cancelled"].includes(r.status)) await refreshRuns(); } catch (e) { notice(e.message, true, false); } finally { state.polling = false; } }, 1800);
void refresh().catch(e => notice(e.message || "Open this plugin from KAI Core to connect to its local runtime.", true));
