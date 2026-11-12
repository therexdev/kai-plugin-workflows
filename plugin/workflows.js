"use strict";
(() => {
  const M = window.KaiWorkflowModel, esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const date = n => n ? new Date(n).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never";
  const btn = (label, action, id = "", cls = "") => KaiI18n.html`<button type="button" class="${cls}" data-wf="${action}" data-id="${esc(id)}" data-i18n="${esc(label)}">${esc(label)}</button>`;
  const select = (path, label, values, value) => KaiI18n.html`<label class="wf-field"><span>${KaiI18n.content(label)}</span><select data-field="${esc(path)}" aria-label="${esc(KaiI18n.t(label))}">${values.map(v => { const [key, text] = Array.isArray(v) ? v : [v, v]; return KaiI18n.html`<option value="${esc(key)}" ${String(key) === String(value) ? "selected" : ""}>${KaiI18n.content(text)}</option>`; }).join("")}</select></label>`;
  function modelOptions(value, fallback = "Choose a model") {
    const models = new Map();
    for (const m of data.models || []) {
      if (/^koinos-network:auto-/.test(m.alias)) continue;
      const id = M.modelId(m.alias), previous = models.get(id);
      models.set(id, { ...m, status: previous?.status === "ready" ? "ready" : m.status });
    }
    const choices = [["", fallback], ...[...models].map(([id, m]) => [id, KaiI18n.message`${KaiI18n.literal(m.label || id)}${m.status === "ready" ? "" : " · " + KaiI18n.t("Unavailable")}`])];
    if (value && !choices.some(([key]) => key === value)) choices.push([value, KaiI18n.message`${KaiI18n.literal(value)} · ${KaiI18n.message(["Unavailable"])}`]);
    return choices;
  }
  function sourceFields(choice, sourcePath, preferencePath, showAvailability = true) {
    const row = (data.models || []).find(m => M.modelId(m.alias) === choice.model), local = M.localReady(data.models, choice.model), network = row?.networkStatus || (row?.source === "network" ? row.status : "unknown");
    return KaiI18n.html`<div class="wf-model-locations">${select(sourcePath, "Run on", [["local", "Local only"], ["network", "Network only"], ["both", "Local and network"]], choice.modelSource)}<div class="wf-model-preference" ${choice.modelSource === "both" ? "" : "hidden"}>${select(preferencePath, "Try first", [["local", "Local first"], ["network", "Network first"]], choice.modelPreference)}</div>${choice.model && showAvailability ? KaiI18n.html`<small class="wf-model-availability">${KaiI18n.content(local ? "Local: Ready" : "Local: Not ready")}<br>${KaiI18n.content(data.networkModels?.privacyMode === "local-only" ? "Network: Disabled by Local-Only" : network === "ready" ? "Network: Available" : network === "unknown" ? "Network: Refresh to check" : "Network: Unavailable")}</small>` : ""}</div>`;
  }
  function simpleModelFields(prefix, input, label = "Model") {
    const choice = M.modelChoice(input);
    return select(prefix + "Model", label, modelOptions(choice.model), choice.model) + sourceFields(choice, prefix + "ModelSource", prefix + "ModelPreference", false);
  }
  function modelFields(input, prefix = "", inherit = false) {
    const policy = M.modelPolicy(input), fallbacks = policy.fallbackModels;
    const primary = select(prefix + "model", "Primary model", modelOptions(policy.model, inherit ? "Use workflow model order" : "Choose a model"), policy.model);
    if (inherit && !policy.model) return primary + KaiI18n.html`<p class="hub-help">Uses the workflow's primary model, locations and fallback order.</p>`;
    const selectedModels = [policy.model, ...fallbacks.map(m => m.model)];
    const available = modelOptions("").filter(([alias]) => alias && !selectedModels.includes(alias));
    return primary + sourceFields(policy, prefix + "modelSource", prefix + "modelPreference") + KaiI18n.html`<div class="wf-model-order"><h4>Fallback models</h4><p class="hub-help">For each model, try its preferred location, then its other allowed location, before moving down this list.</p>${fallbacks.map((choice, i) => KaiI18n.html`<div class="wf-model-fallback"><div class="wf-model-choice">${select(prefix + "fallbackModels." + i + ".model", KaiI18n.message`Fallback ${i + 1}`, modelOptions(choice.model).filter(([key]) => key && (key === choice.model || !selectedModels.includes(key))), choice.model)}${sourceFields(choice, prefix + "fallbackModels." + i + ".modelSource", prefix + "fallbackModels." + i + ".modelPreference")}</div><div class="wf-model-actions"><button type="button" data-wf="fallbackUp" data-id="${i}" aria-label="Move fallback up" title="Move fallback up" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-wf="fallbackDown" data-id="${i}" aria-label="Move fallback down" title="Move fallback down" ${i === fallbacks.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-wf="fallbackRemove" data-id="${i}" aria-label="Remove fallback" title="Remove fallback">×</button></div></div>`).join("")}${policy.model && fallbacks.length < 15 ? select(prefix + "addFallback", "Add fallback model", [["", "Choose a model"], ...available], "") : ""}<p class="hub-help">Local uses this computer without network credits. Network sends input to a provider and requires Core credit approval. Unknown request outcomes stop the run.</p></div>`;
  }
  const defaultModel = () => data.models.find(m => M.localReady(data.models, m.alias))?.alias || "";
  function networkControls() { return KaiI18n.html`<div class="wf-network-models">${btn("Refresh network models", "networkModels")}<p class="hub-help">Network steps send input to a provider and use credits. Core can approve one request, this workflow run, or ongoing access. Revoke ongoing access in Core Settings → Access.</p>${data.networkModels?.error ? KaiI18n.html`<p class="hub-help error">${esc(data.networkModels.error)}</p>` : ""}</div>`; }
  const field = (path, label, value = "", kind = "text", hint = "") => KaiI18n.html`<label class="wf-field"><span>${KaiI18n.content(label)}</span>${["area", "json", "code"].includes(kind) ? KaiI18n.html`<textarea rows="${kind === "code" ? 9 : 4}" data-field="${esc(path)}" data-format="${kind}" spellcheck="${kind === "area"}">${esc(kind === "json" ? JSON.stringify(value, null, 2) : value)}</textarea>` : KaiI18n.html`<input type="${kind === "number" ? "number" : "text"}" data-field="${esc(path)}" data-format="${kind}" value="${esc(value)}"/>`}${hint ? KaiI18n.html`<small>${KaiI18n.content(hint)}</small>` : ""}</label>`;
  const check = (path, label, value) => KaiI18n.html`<label class="wf-check"><input type="checkbox" data-field="${esc(path)}" data-format="bool" ${value ? "checked" : ""}/><span>${KaiI18n.content(label)}</span></label>`;
  const empty = (title, detail) => KaiI18n.html`<div class="hub-empty"><strong data-i18n="${esc(title)}">${title}</strong><p data-i18n="${esc(detail)}">${detail}</p></div>`;
  let host, api, data, section, draft = null, savedJSON = "", selected = "", inspector = "node", undo = [], redo = [], zoom = .85, pan = { x: 25, y: 10 }, linking = null, filter = "", runFilter = "", runStatus = "", runId = "", modal = null, proposal = null, busy = false, timer, invalid = "", copied = null;
  const eventChoices = {};
  const clone = M.clone, currentNode = () => draft?.graph.nodes.find(n => n.id === selected), dirty = () => draft && JSON.stringify(draft) !== savedJSON;
  function notice(text, error = false) { const el = host?.querySelector(".wf-notice"); if (el) { KaiI18n.setText(el, text); el.classList.toggle("error", error); } }
  async function refresh() { data = await api.manage("status"); }
  function history() { undo.push(clone(draft)); if (undo.length > 50) undo.shift(); redo = []; }
  function commit(fn) { history(); fn(); invalid = ""; draw(); }
  function open(item) { draft = M.fromLegacy(item); savedJSON = JSON.stringify(draft); selected = draft.graph.nodes[0]?.id || ""; undo = []; redo = []; proposal = null; invalid = ""; inspector = "node"; zoom = .85; pan = { x: 25, y: 10 }; runId = ""; draw(); }
  function newFlow() { const trigger = M.node("trigger", "start", { x: 80, y: 70 }); trigger.label = KaiI18n.t(trigger.label); open({ name: KaiI18n.t("New workflow"), description: "", model: defaultModel(), enabled: false, graph: { version: 2, nodes: [trigger], edges: [] } }); }
  function render(out, options) { clearTimeout(timer); host = out; api = options; data = options.state; section = options.section; draw(); poll(); }
  function draw() {
    if (!host) return;
    // Replacing a focused field can synchronously dispatch change/blur. Its
    // input is already in the draft; detach delegates to prevent nested draws.
    host.onchange = null; host.oninput = null;
    host.innerHTML = KaiI18n.html`<div class="wf-workspace ${draft ? "wf-builder" : ""}"><div class="wf-notice" role="status" aria-live="polite"></div>${!draft && data.workflowState?.eventRelay?.error ? KaiI18n.html`<div class="hub-pending"><b>Live app events need attention</b><p>${esc(data.workflowState.eventRelay.error)}</p></div>` : ""}${draft ? builder() : section === "runs" ? runs() : section === "discover" ? discoveries() : section === "templates" ? templateCards() : saved()}${modal ? modalHTML() : ""}</div>`;
    host.onclick = click; host.onchange = change; host.oninput = input; host.onsubmit = submit; host.onkeydown = keydown; host.onpointerdown = pointerdown;
    const viewport = host.querySelector(".wf-viewport"); if (viewport) viewport.addEventListener("wheel", wheel, { passive: false });
    if (draft) paint();
  }
  function saved() {
    const workflows = data.workflows.filter(w => (w.name + " " + w.description).toLowerCase().includes(filter.toLowerCase()));
    return KaiI18n.html`<div class="wf-heading"><div><h2>Your routines, connected</h2><p>Build a flow once. Run it when you need it, on a schedule, or when something changes.</p></div><div class="hub-actions">${btn("Import JSON", "import")}${btn("New workflow", "new", "", "primary")}</div></div><div class="wf-prompt-bar"><span class="wf-spark">✦</span><input id="wf-quick-prompt" placeholder="Describe a routine you'd like KAI to build…" aria-label="Describe a workflow"/>${btn("Build with KAI", "quickBuild")}</div><div class="wf-list-tools"><input id="wf-filter" aria-label="Search workflows" placeholder="Search workflows" value="${esc(filter)}"/><span>${data.workflows.length} saved · ${data.workflows.filter(w => w.enabled).length} enabled</span></div><div class="wf-saved-list">${workflows.map(w => { const last = data.runs.find(r => r.workflowId === w.id), graph = M.fromLegacy(w).graph, t = graph.nodes.find(n => n.type === "trigger")?.config; return KaiI18n.html`<article class="wf-saved"><div class="wf-flow-icon">⑂</div><div class="wf-saved-info"><button data-wf="edit" data-id="${esc(w.id)}" class="wf-name">${esc(w.name)}</button><p>${esc(w.description || graph.nodes.filter(n => n.type !== "trigger").map(n => n.label).slice(0, 4).join(" → "))}</p><div class="wf-meta"><span>${graph.nodes.length} nodes</span><span>${KaiI18n.content(w.draft ? "Draft · review needed" : triggerLabel(t))}</span>${last ? KaiI18n.html`<span class="hub-badge ${esc(last.status)}">${KaiI18n.content(last.status)}</span><span>${date(last.startedAt)}</span>` : KaiI18n.html`<span>Never run</span>`}</div>${w.nextRunAt ? KaiI18n.html`<small>Next run ${date(w.nextRunAt)}</small>` : ""}${w.watch?.error ? KaiI18n.html`<p class="error">${esc(w.watch.error)}</p>` : ""}${w.legacyTask ? KaiI18n.html`<small>Moved from Tasks${KaiI18n.content(w.legacyTask.needsModel ? " · choose a model" : "")}${KaiI18n.content(w.legacyTask.lastChatId ? " · previous answers remain in Chat" : "")}</small>` : ""}</div><div class="wf-row-actions"><button data-wf="toggle" data-id="${esc(w.id)}" class="wf-toggle ${w.enabled ? "on" : ""}" role="switch" aria-checked="${!!w.enabled}" aria-label="Enable ${esc(w.name)}" ${w.draft ? "disabled" : ""}><span></span></button>${!w.draft ? btn("Run", "run", w.id, "primary") : ""}${btn("Export JSON", "export", w.id)}<details class="wf-menu"><summary aria-label="More actions for ${esc(w.name)}">•••</summary><div>${btn("Open builder", "edit", w.id)}${btn("Duplicate", "duplicate", w.id)}${btn("Run history", "history", w.id)}${btn("Delete", "delete", w.id)}</div></details></div></article>`; }).join("") || empty("Make room for the work you enjoy", "Start from a template or build your own flow.")}</div><div class="wf-section-heading"><h3>Start from a template</h3>${btn("View all templates", "templates")}</div>${templateCards(true)}`;
  }
  function triggerLabel(c = {}) { return { manual: "On demand", schedule: "Scheduled", source_change: "Source changes", app_change: "App changes", app_event: "App events" }[c.kind] || "On demand"; }
  function templateCards(compact = false) { return KaiI18n.html`${compact ? "" : KaiI18n.html`<div class="wf-heading"><div><h2>A useful place to start</h2><p>Every template opens in the builder so you can choose models, apps, and the steps you want.</p></div></div>`}<div class="wf-templates">${M.templates.slice(0, compact ? 4 : undefined).map(([key, name, detail]) => KaiI18n.html`<button type="button" class="wf-template" data-wf="template" data-id="${key}"><span class="wf-template-icon">${key === "loop" ? "↻" : key === "event" ? "⚡" : "⑂"}</span><strong>${KaiI18n.content(name)}</strong><p>${KaiI18n.content(detail)}</p><small>Use template →</small></button>`).join("")}</div>`; }
  function runs() {
    const list = data.runs.filter(r => (!runFilter || r.workflowId === runFilter) && (!runStatus || r.status === runStatus));
    return KaiI18n.html`<div class="wf-heading"><div><h2>Every run, step by step</h2><p>Inspect inputs, results, timings, and decisions. Paused runs wait here for you.</p></div></div><div class="wf-run-filters">${select("runWorkflow", "Workflow", [["", "All workflows"], ...data.workflows.map(w => [w.id, KaiI18n.literal(w.name)])], runFilter)}${select("runStatus", "Status", [["", "All statuses"], "running", "waiting", "completed", "failed", "interrupted", "cancelled"], runStatus)}</div><div class="hub-run-list">${list.map(runCard).join("") || empty("No runs here yet", "Run a saved workflow to see its progress and results.")}</div>`;
  }
  function networkResults(r) {
    if (!r.networkCalls?.length) return "";
    return KaiI18n.html`<details class="wf-network-results"><summary>Model results</summary>${r.networkCalls.map(call => {
      const amount = call.completion?.koin?.receipt?.usage?.amount;
      const used = typeof amount === "string" && /^(0|[1-9]\d{0,19})$/.test(amount) ? (BigInt(amount) / 100000n + "." + String(BigInt(amount) % 100000n).padStart(5, "0")).replace(/\.?0+$/, "") : null;
      return KaiI18n.html`<div><b>${esc(call.model)}</b><small>${KaiI18n.content(call.source === "local" ? "Local · No network credits" : "KAI network")}</small>${used !== null ? KaiI18n.html`<p>${KaiI18n.content(KaiI18n.message`Credits used: ${used}`)}</p>` : ""}${call.interrupted ? KaiI18n.html`<p class="hub-help">Verified partial network reply saved.</p>` : ""}${call.outputRecovery ? KaiI18n.html`<p class="hub-help">JSON punctuation repaired locally; no extra model call.</p>` : ""}<pre>${esc(call.completion?.choices?.[0]?.message?.content || "")}</pre></div>`;
    }).join("")}</details>`;
  }
  function runCard(r) { return KaiI18n.html`<details class="hub-card hub-run wf-run" data-run="${esc(r.id)}" ${["waiting", "running", "interrupted"].includes(r.status) ? "open" : ""}><summary><span><b>${esc(r.name)}</b><small>${date(r.startedAt)} · ${esc(r.trigger)}${KaiI18n.content(r.dryRun ? " · simulated preview" : "")}</small></span><span class="hub-badge ${esc(r.status)}">${KaiI18n.content(r.status)}</span></summary><div class="hub-run-body"><div class="hub-actions">${r.spec.graph ? btn("View on canvas", "runCanvas", r.id) : ""}${M.canRetryRun(r) ? btn("Retry failed work", "retryRun", r.id, "primary") : ""}${["waiting", "interrupted"].includes(r.status) && !r.inFlight ? btn("Review & resume", "resume", r.id, "primary") : ""}${r.status === "waiting" ? btn("Reject", "reject", r.id) : ""}${["running", "waiting", "interrupted"].includes(r.status) ? btn("Cancel run", "cancel", r.id) : btn("Run again", "runAgain", r.id)}</div>${r.pending ? KaiI18n.html`<div class="hub-pending"><b>Waiting for your decision</b><pre>${esc(JSON.stringify(r.pending, null, 2))}</pre></div>` : ""}${r.error ? KaiI18n.html`<p class="error">${esc(r.error)}</p>` : ""}${networkResults(r)}${r.steps.map((s, i) => KaiI18n.html`<details class="wf-run-step"><summary><span class="wf-step-status ${esc(s.status)}">${s.status === "completed" ? "✓" : s.status === "running" ? "◌" : "!"}</span>${i + 1}. ${esc(s.label)}<small>${KaiI18n.content(s.status)}${s.durationMs != null ? " · " + (s.durationMs / 1000).toFixed(1) + "s" : ""}${s.attempts > 1 ? " · " + s.attempts + " attempts" : ""}</small></summary>${s.frameId && s.frameId !== "root" ? KaiI18n.html`<p class="hub-help">${esc(s.frameId)}</p>` : ""}${s.input ? KaiI18n.html`<b>Input</b><pre>${esc(JSON.stringify(s.input, null, 2))}</pre>` : ""}${s.recovery?.source === "saved-model-results" ? KaiI18n.html`<p class="hub-help">Used saved model output; no new model call.</p>` : ""}<b>Output</b><pre>${esc(s.error || (s.type === "output" && s.items?.length ? s.items.map(v => v.text ?? JSON.stringify(v)).join("\n\n") : s.output) || "Running…")}</pre></details>`).join("")}</div></details>`; }
  function discoveries() { const suggestions = data.workflowState?.suggestions || [], settings = data.workflowState?.discovery || {}; return KaiI18n.html`<div class="wf-heading"><div><h2>Discover useful routines</h2><p>KAI can suggest workflows from your goals, personal notes, and connected apps. You choose what to build.</p></div></div>${networkControls()}<form class="wf-discover-form" data-wf-form="discover">${simpleModelFields("discover", { model: defaultModel() })}${check("discoverBrain", "Use my personal Brain notes and goals for suggestions", true)}<button class="primary" ${busy ? "disabled" : ""}>${KaiI18n.content(busy ? "Finding ideas…" : "Find suggestions")}</button></form><form class="wf-discover-form" data-wf-form="discoverySettings">${check("discoveryEnabled", "Suggest new routines automatically once a day", settings.enabled)}${simpleModelFields("discovery", settings.model ? settings : { model: defaultModel() }, "Model for daily suggestions")}${check("discoveryBrain", "Include my personal Brain notes and goals", settings.includeBrain)}<button>Save suggestion settings</button><p class="hub-help">Runs while KAI is open. Suggestions wait for your review and never enable a workflow automatically.${settings.lastAt ? " Last checked: " + date(settings.lastAt) : ""}</p>${settings.error ? KaiI18n.html`<p class="error">${esc(settings.error)}</p>` : ""}</form><div class="wf-templates">${suggestions.map(s => KaiI18n.html`<article class="hub-card"><span class="hub-badge">Suggested for you</span><h3>${esc(s.name)}</h3><p>${esc(s.request)}</p><p><b>Why:</b> ${esc(s.reason)}</p><div class="hub-actions">${btn("Build this", "buildSuggestion", s.id, "primary")}${btn("Dismiss", "dismiss", s.id)}</div></article>`).join("") || empty("Ideas start with your context", "Choose a model and find suggestions. Nothing is saved or enabled until you review it.")}</div>`; }
  function builder() {
    const report = M.validateGraph(draft.graph), last = data.runs.find(r => r.id === runId), readOnly = !!runId;
    return KaiI18n.html`<div class="wf-builder-header">${btn("← Back", "back")}<div class="wf-builder-title"><h2>${esc(draft.name)}</h2><small>${KaiI18n.content(readOnly ? KaiI18n.message`${KaiI18n.message(["Run snapshot ·"])} ${KaiI18n.message([last?.status || ""])}` : dirty() ? "Unsaved changes" : draft.id ? "Saved workflow" : "New workflow")}</small></div><div class="wf-builder-actions">${btn("Copilot", "inspector", "copilot", inspector === "copilot" ? "active" : "")}${!readOnly ? btn("Settings", "inspector", "settings") + btn("Export JSON", "exportCanvas") + btn("Save workflow", "save", "", "primary") : ""}${draft.id && !draft.draft && !readOnly ? btn("Run", "run", draft.id) : ""}</div></div><div class="wf-builder-tools"><div>${btn("Undo", "undo")}${btn("Redo", "redo")}${btn("Add node", "palette")}${btn("Auto arrange", "arrange")}</div><div>${btn("Validate", "validate")}${draft.id && !draft.draft ? btn("Preview", "preview", draft.id) : ""}${btn("Run details", "inspector", "runs")}</div></div>${report.errors.length || invalid ? KaiI18n.html`<div class="wf-validation error">${esc(invalid || report.errors[0].message)}${report.errors.length > 1 ? ` (+${report.errors.length - 1} more)` : ""}</div>` : KaiI18n.html`<div class="wf-canvas-hint">${KaiI18n.content(linking ? "Choose the input dot on the destination node. Escape cancels." : "Drag nodes to arrange them. Connect an output to another node's input. Scroll to pan; Ctrl + scroll to zoom.")}</div>`}<div class="wf-builder-body"><aside class="wf-palette" aria-label="Node library"><input id="wf-node-search" placeholder="Find a node" aria-label="Find a node"/>${["Start", "Actions", "Logic", "Finish"].map(group => KaiI18n.html`<div class="wf-palette-group"><h3>${KaiI18n.content(group)}</h3>${M.catalog.filter(n => n.group === group).map(n => KaiI18n.html`<button type="button" data-wf="add" data-id="${n.type}" data-i18n-attrs="${esc(JSON.stringify({title:n.description}))}" title="${esc(KaiI18n.t(n.description))}"><span>${n.icon}</span>${KaiI18n.content(n.name)}</button>`).join("")}</div>`).join("")}</aside><div class="wf-viewport" tabindex="0" role="region" aria-label="Workflow canvas"><div class="wf-stage"><svg class="wf-edges" aria-label="Node connections"></svg><div class="wf-nodes">${draft.graph.nodes.map(nodeHTML).join("")}</div></div><div class="wf-canvas-controls">${btn("−", "zoomOut") }<span id="wf-zoom">${Math.round(zoom * 100)}%</span>${btn("+", "zoomIn")}${btn("Fit", "fit")}</div></div><aside class="wf-inspector" aria-label="Workflow inspector">${inspectorHTML()}</aside></div>${last && ["waiting", "running", "interrupted"].includes(last.status) ? KaiI18n.html`<div class="wf-running-strip"><span>${esc(last.name)} · ${KaiI18n.content(last.status)}</span>${last.status === "waiting" ? btn("Review & resume", "resume", last.id, "primary") : ""}${btn("Cancel run", "cancel", last.id)}</div>` : ""}`;
  }
  function nodeHTML(n) { const run = data.runs.find(r => r.id === runId), state = run?.frames?.root?.states?.[n.id]?.status || "", outputs = M.ports(n).filter(p => p !== "error" || n.config.onError === "route"); return KaiI18n.html`<article class="wf-node ${selected === n.id ? "selected" : ""} ${esc(state)}" data-node="${esc(n.id)}" tabindex="0" aria-label="${esc(n.label)} node"><button class="wf-input-port" data-wf="connectTo" data-id="${esc(n.id)}" aria-label="Connect to ${esc(n.label)}" title="Input"></button><div class="wf-node-heading" data-drag-node="${esc(n.id)}"><span class="wf-node-icon type-${n.type}">${M.meta(n.type)?.icon || "◇"}</span><div><strong>${esc(n.label)}</strong><small>${KaiI18n.content(M.meta(n.type)?.name || n.type)}${state ? " · " + KaiI18n.content(state) : ""}</small></div></div><p>${KaiI18n.content(summary(n))}</p><div class="wf-output-ports">${outputs.map(p => KaiI18n.html`<button type="button" data-wf="connectFrom" data-id="${esc(n.id)}" data-port="${esc(p)}" aria-label="${esc(n.label)} ${esc(p)} output">${esc(p)}<i></i></button>`).join("")}</div></article>`; }
  function summary(n) {
    const c = n.config, literal = value => KaiI18n.literal(String(value || "").slice(0, 100));
    if (n.type === "trigger") return triggerLabel(c);
    if (n.type === "agent") return literal(c.prompt);
    if (n.type === "tool_call") { const name = data.connections.find(x => x.id === c.connectionId)?.name; return name ? literal(name) : "Choose an app action"; }
    if (n.type === "web_research") return c.query ? literal(c.query) : "Search query";
    if (n.type === "http_request") return KaiI18n.message`${c.method || "GET"} ${c.connectionId ? KaiI18n.message(["Saved API connection"]) : String(c.url || "").slice(0, 100)}`;
    if (n.type === "memory") return KaiI18n.message`${KaiI18n.message([{ search: "Search", read: "Read", remember: "Remember", forget: "Forget" }[c.operation] || c.operation])} · ${String(c.query || c.title || "Brain").slice(0, 100)}`;
    if (n.type === "loop") return KaiI18n.message`Up to ${c.maxIterations} iterations`;
    if (n.type === "sub_workflow") { const name = data.workflows.find(w => w.id === c.workflowId)?.name; return name ? literal(name) : "Choose a workflow"; }
    return c.expression || c.text || c.source ? literal(c.expression || c.text || c.source) : M.meta(n.type)?.description || "";
  }
  function inspectorHTML() {
    if (inspector === "copilot") return KaiI18n.html`<h3>Build with KAI</h3><p class="hub-help">Describe what you want to add or change. Review the proposed graph before applying it.</p>${networkControls()}<form data-wf-form="assist">${simpleModelFields("assist", draft.model ? draft : { model: defaultModel() })}${field("assistRequest", "What should this workflow do?", "", "area")}<button class="primary" ${busy || runId ? "disabled" : ""}>${KaiI18n.content(busy ? "Designing…" : "Suggest changes")}</button></form>${proposal ? KaiI18n.html`<div class="wf-proposal"><h4>${esc(proposal.proposal.name)}</h4><p>${esc(proposal.proposal.description)}</p><p>${proposal.proposal.graph.nodes.length} nodes · ${proposal.proposal.graph.edges.length} connections</p>${proposal.report.errors.map(e => KaiI18n.html`<p class="error">${esc(e.message)}</p>`).join("")}${btn("Apply to canvas", "applyProposal", "", "primary")}${btn("Dismiss proposal", "dismissProposal")}</div>` : ""}`;
    if (inspector === "settings") return KaiI18n.html`<h3>Workflow settings</h3>${networkControls()}<fieldset ${runId ? "disabled" : ""}>${field("name", "Workflow name", draft.name)}${field("description", "Purpose", draft.description, "area")}${modelFields(draft)}${check("enabled", "Enable automatic triggers", draft.enabled)}<p class="hub-help">Schedules and watches run while KAI is open. App writes and Brain changes pause for your review.</p>${btn("Save as draft", "saveDraft")}</fieldset><details><summary>Workflow JSON</summary><textarea id="wf-document" rows="14" spellcheck="false">${esc(JSON.stringify(draft, null, 2))}</textarea>${!runId ? btn("Apply JSON", "applyJSON") : ""}</details>`;
    if (inspector === "runs") { const list = data.runs.filter(r => r.workflowId === draft.id).slice(0, 8); return KaiI18n.html`<h3>Recent runs</h3>${list.map(r => KaiI18n.html`<button class="wf-run-link" data-wf="selectRun" data-id="${esc(r.id)}"><b>${KaiI18n.content(r.status)}</b><small>${date(r.startedAt)}</small></button>`).join("") || KaiI18n.html`<p class="hub-help">Save and run this workflow to inspect it here.</p>`}${runId ? runCard(data.runs.find(r => r.id === runId)) : ""}`; }
    const n = currentNode(); if (!n) return KaiI18n.html`<h3>Choose a node</h3><p class="hub-help">Select a node to edit its settings and see its connections.</p>`;
    const c = n.config, f = (key, label, kind = "text", hint = "") => field("config." + key, label, c[key] ?? "", kind, hint), s = (key, label, choices) => select("config." + key, label, choices, c[key]), b = (key, label) => check("config." + key, label, c[key]);
    let fields = "";
    if (n.type === "trigger") {
      fields += s("kind", "When to run", [["manual", "On demand"], ["schedule", "On a schedule"], ["app_change", "When an app's data changes"], ["source_change", "When a Brain source changes"], ["app_event", "When an app event arrives"]]);
      if (c.kind === "schedule") { const v = c.schedule || {}, sf = (k, label, kind = "text") => field("config.schedule." + k, label, v[k] ?? "", kind); fields += select("config.schedule.kind", "Schedule", [["hourly", "Every hour"], ["every6h", "Every 6 hours"], ["daily", "Daily"], ["weekly", "Weekly"], ["interval", "Custom interval"], ["at", "Once at a date/time"], ["cron", "Cron expression"]], v.kind || "daily"); if (["daily", "weekly"].includes(v.kind)) fields += KaiI18n.html`<div class="wf-field-pair">${sf("hour", "Hour (0–23)", "number")}${sf("minute", "Minute (0–59)", "number")}</div>`; if (v.kind === "weekly") fields += select("config.schedule.day", "Day", [[0, "Sunday"], [1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"]], v.day ?? 1); if (v.kind === "interval") fields += sf("minutes", "Every N minutes", "number"); if (v.kind === "at") fields += sf("at", "Date and time (ISO, with offset)"); if (v.kind === "cron") fields += sf("expression", "Cron: minute hour day month weekday"); if (["daily", "weekly", "cron"].includes(v.kind)) fields += sf("timezone", "Time zone (blank = this computer)"); }
      if (c.kind === "app_change") fields += connectionFields(n, true);
      if (c.kind === "app_event") { const schema = (eventChoices[c.connectionId] || []).find(t => t.slug === c.triggerSlug)?.config; fields += s("connectionId", "Connected app account", [["", "Choose an app"], ...data.connections.filter(x => x.provider === "composio" && x.enabled && x.allowSync).map(x => [x.id, KaiI18n.literal(x.name)])]) + btn("Load available events", "loadEvents", c.connectionId) + s("triggerSlug", "Event type", [["", "Choose an event"], ...(eventChoices[c.connectionId] || (c.triggerSlug ? [{slug:c.triggerSlug,name:c.triggerSlug}] : [])).map(x => [x.slug, KaiI18n.literal(x.name)])]) + (schema?.properties ? Object.entries(schema.properties).map(([key, p]) => field("config.triggerConfig." + key, key.replace(/_/g, " ") + ((schema.required || []).includes(key) ? " *" : ""), c.triggerConfig?.[key] ?? "", ["object", "array"].includes(p.type) ? "json" : ["boolean", "number", "integer"].includes(p.type) ? "value" : "text", esc(p.description || ""))).join("") : f("triggerConfig", "Event settings (JSON)", "json")) + KaiI18n.html`<p class="hub-help">Enable the workflow to register this event. KAI uses your account server to receive signed events. Existing Composio webhook destinations are kept.</p>`; }
      if (c.kind === "source_change") fields += s("sourceId", "Brain source", [["", "Choose a source"], ...data.sources.map(x => [x.id, KaiI18n.literal(x.name)])]);
      if (["app_change", "source_change"].includes(c.kind)) fields += f("intervalMinutes", "Check every N minutes", "number", "The first check establishes a baseline; later changes start a run.");
      fields += KaiI18n.html`<details><summary>Run input fields</summary>${f("inputFields", "Fields (name, type, required)", "json")}</details>`;
    }
    if (n.type === "agent") fields += networkControls() + s("profile", "Agent role", ["assistant", "planner", "researcher", "writer", "analyst"]) + modelFields(c, "config.", true) + f("prompt", "Instructions", "area") + f("maxTurns", "Maximum turns", "number") + f("maxTokens", "Output token budget", "number") + f("maxContinuations", "Maximum continuations", "number") + select("config.outputFormat", "Output format", [["text", "Text"], ["json", "JSON"]], c.outputFormat || "text") + (c.outputFormat === "json" ? field("config.outputSchema", "JSON schema (optional)", c.outputSchema || {}, "json") + field("config.maxFormatRepairs", "Maximum JSON repairs", c.maxFormatRepairs ?? 2, "number") + KaiI18n.html`<p class="hub-help">JSON is validated before the next step. Continuations and repairs share the output token budget and may use credits.</p>` : select("config.continuationMode", "Join continued replies", [["overlap", "Verify repeated ending"], ["exact", "Append exactly as returned"]], c.continuationMode || "exact")) + KaiI18n.html`<details><summary>Selected read tools</summary><p class="hub-help">Choose read actions from Connections. Outbound changes use separate App action nodes.</p>${data.connections.filter(x => x.enabled && x.allowSync).flatMap(conn => conn.operations.filter(o => o.method === "GET").map(o => KaiI18n.html`<label class="wf-check"><input type="checkbox" data-read-tool="${esc(conn.id)}" data-operation="${esc(o.id)}" ${(c.tools || []).some(t => t.connectionId === conn.id && t.operationId === o.id) ? "checked" : ""}/><span>${esc(conn.name)} · ${esc(o.name)}</span></label>`)).join("") || "No background read actions selected in Connections yet."}</details>`;
    if (n.type === "tool_call") fields += connectionFields(n);
    if (n.type === "web_research") fields += f("query", "Search query") + f("topic", "Required source topic (optional)") + f("maxPages", "Maximum source pages", "number") + field("config.sourceUrls", "Reference URLs (JSON array or expression)", typeof c.sourceUrls === "string" ? c.sourceUrls : JSON.stringify(c.sourceUrls || []), "value");
    if (n.type === "http_request") { fields += s("connectionId", "Authentication", [["", "Public endpoint (no credentials)"], ...data.connections.filter(x => x.enabled && x.provider !== "composio").map(x => [x.id, KaiI18n.literal(x.name)])]); if (c.connectionId) fields += connectionFields(n, false, true); else fields += s("method", "Method", ["GET", "POST", "PUT", "PATCH", "DELETE"]) + f("url", "Endpoint URL") + f("headers", "Headers (Accept / Content-Type)", "json") + f("body", "Request body", "json"); }
    if (n.type === "code") fields += KaiI18n.html`<p class="hub-help">JavaScript with <code>items</code>, <code>item</code>, <code>input</code>, and <code>nodes</code>. Return JSON data. Files and network are unavailable.</p>` + f("source", "JavaScript", "code");
    if (n.type === "sub_workflow") fields += s("workflowId", "Saved workflow", [["", "Choose a workflow"], ...data.workflows.filter(w => w.id !== draft.id && !w.draft).map(w => [w.id, KaiI18n.literal(w.name)])]);
    if (n.type === "memory") { fields += s("operation", "Brain action", [["search", "Search memories"], ["recall", "Recall context"], ["people", "Find people"], ["goals", "Read active goals"], ["remember", "Remember (review first)"], ["forget", "Forget a note (review first)"]]); if (["search", "recall", "people"].includes(c.operation)) fields += f("query", "Search for") + f("limit", "Maximum matches", "number"); if (c.operation === "remember") fields += f("title", "Memory title") + f("value", "What to remember", "area"); if (c.operation === "forget") fields += s("noteId", "Personal note", [["", "Choose a note"], ...data.notes.filter(n => !n.sourceId).map(n => [n.id, KaiI18n.literal(n.title)])]); }
    if (n.type === "approval") fields += f("text", "What should be reviewed?", "area") + KaiI18n.html`<p class="hub-help">Connect Approved and Rejected outputs to the next steps.</p>`;
    if (n.type === "condition") fields += f("expression", "Value or expression") + s("operator", "Condition", [["truthy", "Is true / has a value"], ["equals", "Equals"], ["contains", "Contains"], ["greater", "Greater than"], ["less", "Less than"], ["empty", "Is empty"]]) + (!["truthy", "empty"].includes(c.operator) ? f("value", "Compare with") : "");
    if (n.type === "switch") fields += f("expression", "Route by expression") + f("cases", "Case names (JSON array)", "json");
    if (n.type === "merge") fields += s("mode", "Combine branches", [["append", "Append all items"], ["position", "Combine by position"], ["key", "Combine by matching key"]]) + (c.mode === "key" ? f("key", "Matching field") : "") + KaiI18n.html`<p class="hub-help">Use distinct destination input names (A and B) for position or key merges.</p>`;
    if (n.type === "split_out") fields += f("field", "Array expression") + b("keepFields", "Keep the original item's fields");
    if (n.type === "transform") fields += f("set", "Field mapping (JSON)", "json", 'For example: {"title":"=item.json.title"}') + b("keepFields", "Keep other fields");
    if (n.type === "quality_check") {
      fields += f("value", "Value to check") + s("onFailure", "When checks find errors", [["report", "Return issues for a revision or branch"], ["stop", "Stop this step"]]) + f("resultField", "Report field") + KaiI18n.html`<p class="hub-help">Checks preserve the input and add a report with valid, issues and metrics. Citation checks verify IDs; a reviewer must assess support for claims. Limits and lists accept = expressions.</p>`;
      fields += (c.rules || []).map((r, i) => {
        const base = "config.rules." + i + ".", rf = (key, label, kind = "text") => field(base + key, label, kind === "value" && r[key] !== undefined && !(typeof r[key] === "string" && r[key].startsWith("=")) ? JSON.stringify(r[key]) : r[key] ?? "", kind);
        return KaiI18n.html`<fieldset><legend>Rule ${i + 1}</legend>${select(base + "type", "Check", [["required", "Required fields"], ["schema", "JSON schema"], ["words", "Word count"], ["characters", "Character count"], ["citations", "Source citations"], ["forbidden", "Forbidden phrases"], ["contains", "Required phrases"], ["equals", "Exact value"]], r.type)}${rf("field", "Field path (blank = whole value)")}${select(base + "severity", "Severity", [["error", "Error"], ["warning", "Warning"]], r.severity || "error")}${["words", "characters", "citations"].includes(r.type) ? rf("min", "Minimum", "value") + (r.type !== "citations" ? rf("max", "Maximum", "value") : "") : ""}${["required", "forbidden", "contains"].includes(r.type) ? rf("values", "Values (JSON or expression)", "value") : ""}${r.type === "schema" ? rf("schema", "JSON schema", "json") : ""}${r.type === "equals" ? rf("expected", "Expected value (JSON or expression)", "value") : ""}${r.type === "citations" ? select(base + "style", "Citation style", [["source-id", "Source IDs [S1-1]"], ["numbered", "Numbers [1]"]], r.style || "source-id") + rf("sources", "Known sources (JSON or expression)", "value") : ""}${btn("Remove rule", "qualityRemove", i)}</fieldset>`;
      }).join("") + btn("Add rule", "qualityAdd");
    }
    if (n.type === "output_parser") fields += s("format", "Output format", ["json", "text", "csv"]) + f("field", "Value to parse") + f("required", "Required fields (comma-separated)");
    if (n.type === "dedup") fields += f("key", "Stable item key", "text", "For example =item.id. Missing keys fail the node.") + s("scope", "Remember seen items", [["workflow", "Across workflow runs"], ["run", "Within this batch"]]);
    if (n.type === "loop") fields += f("maxIterations", "Maximum iterations (1–50)", "number") + f("condition", "Continue while (optional expression)") + s("onExceeded", "At the limit", [["continue", "Continue through Done"], ["error", "Fail the run"]]) + KaiI18n.html`<p class="hub-help">Connect Body to the repeated steps, then connect their last output back to this loop's input.</p>`;
    if (n.type === "output") fields += f("text", "Result", "area") + b("saveChat", "Also save the answer in Chat history");
    if (["agent", "tool_call", "http_request", "web_research", "memory", "sub_workflow"].includes(n.type)) fields += s("execution", "Process input", [["once", "Once for the whole input"], ["per_item", "Once for each item"]]);
    const edges = draft.graph.edges.filter(e => e.from === n.id || e.to === n.id);
    return KaiI18n.html`<div class="wf-inspector-heading"><span class="wf-node-icon">${M.meta(n.type)?.icon}</span><h3>${KaiI18n.content(M.meta(n.type)?.name)}</h3></div><fieldset ${runId ? "disabled" : ""}>${field("label", "Node name", n.label)}${fields}<details class="wf-advanced"><summary>Errors, review & sample data</summary>${s("onError", "If this node fails", [["stop", "Stop run"], ["continue", "Continue with error data"], ["route", "Follow Error output"]])}${f("retries", "Read / compute retries (0–2)", "number")}${f("timeoutSeconds", n.type === "agent" ? "Model reply timeout (5–600 seconds)" : "Model reply timeout (5–180 seconds)", "number")}${n.type === "agent" && M.modelOrder(n.config, draft).some(m => /^koinos-network:/.test(m)) ? KaiI18n.html`<p class="hub-help">Each network reply gets its own timeout. Continuations can run for up to 15 minutes total. Completed parts are saved in Model results.</p>` : ""}${b("requireApproval", "Review before this node")}${f("sampleOutput", "Simulated output for Preview", "json")}</details><details class="wf-advanced"><summary>Data from earlier nodes</summary><p class="hub-help">Use =item.field, =item.json.field, =nodes.ID.text, or {{previous}}. Expressions use JavaScript.</p>${draft.graph.nodes.filter(x => x.id !== n.id).map(x => KaiI18n.html`<button type="button" class="wf-expression" data-wf="copyExpr" data-id="${esc(x.id)}">=nodes.${esc(x.id)}.text</button>`).join("")}</details><h4>Connections</h4><div class="wf-edge-list">${edges.map(e => KaiI18n.html`<div><span>${esc(e.from)} <b>${esc(e.port)}</b> → ${esc(e.to)} <small>${esc(e.input)}</small></span>${btn("×", "removeEdge", e.id)}</div>`).join("") || KaiI18n.html`<p class="hub-help">Connect this node on the canvas.</p>`}</div><div class="wf-edge-form">${select("linkPort", "Output", M.ports(n), "main")}${select("linkTarget", "Next node", [["", "Choose a node"], ...draft.graph.nodes.filter(x => x.id !== n.id && x.type !== "trigger").map(x => [x.id, KaiI18n.literal(x.label)])], "")}${field("linkInput", "Destination input", "main")}${btn("Connect nodes", "addEdge")}</div><div class="hub-actions">${btn("Duplicate node", "duplicateNode")}${n.type !== "trigger" ? btn("Delete node", "deleteNode") : ""}</div></fieldset>`;
  }
  function connectionFields(n, read = false, hideConnection = false) {
    const c = n.config, connections = data.connections.filter(x => x.enabled && (!read || x.allowSync)), conn = connections.find(x => x.id === c.connectionId), op = conn?.operations.find(o => o.id === c.operationId);
    return `${!hideConnection ? select("config.connectionId", "Connected account", [["", "Choose an account"], ...connections.map(x => [x.id, KaiI18n.literal(x.name)])], c.connectionId) : ""}${select("config.operationId", "Action", [["", "Choose an action"], ...(conn?.operations || []).filter(o => !read || o.method === "GET").map(o => [o.id, o.name + (o.method === "GET" ? " · read" : " · review")])], c.operationId)}${op?.schema ? Object.entries(op.schema.properties || {}).slice(0, 25).map(([key, p]) => field("config.variables." + key, key.replace(/_/g, " ") + ((op.schema.required || []).includes(key) ? " *" : ""), c.variables?.[key] ?? (p.type === "object" ? {} : p.type === "array" ? [] : ""), ["object", "array"].includes(p.type) ? "json" : ["number", "integer", "boolean"].includes(p.type) ? "value" : "text", esc(String(p.description || "").slice(0, 180)))).join("") : field("config.variables", "Path variables (JSON)", c.variables || {}, "json")}${conn?.provider !== "composio" && op?.method !== "GET" ? field("config.body", "Request body (JSON)", c.body || {}, "json") : ""}`;
  }
  function modalHTML() {
    if (modal.kind === "import") return KaiI18n.html`<div class="wf-modal-backdrop"><section class="wf-modal" role="dialog" aria-modal="true" aria-label="Import workflow"><div class="wf-heading"><h3>Import workflow</h3><button type="button" class="wf-dialog-close" data-wf="closeModal" aria-label="Close dialog" title="Close">×</button></div><form data-wf-form="import"><p class="hub-help">Choose a JSON file or paste a workflow from chat. It will be added as a new draft with automatic triggers off.</p>${btn("Choose JSON file", "importFile")}<label class="wf-field"><span>Or paste workflow JSON</span><textarea name="workflowJSON" id="wf-import-json" rows="10" spellcheck="false" placeholder="Paste workflow JSON here">${esc(modal.text || "")}</textarea></label><p class="hub-help">After importing, review the nodes and choose your model, connections and any sub-workflows before saving.</p><p class="wf-import-error error" role="alert">${KaiI18n.content(modal.error || "")}</p><button class="primary">Import as draft</button></form></section></div>`;
    const w = data.workflows.find(w => w.id === modal.id), active = data.runs.find(r => r.workflowId === modal.id && ["running", "waiting", "interrupted"].includes(r.status));
    return KaiI18n.html`<div class="wf-modal-backdrop"><section class="wf-modal" role="dialog" aria-modal="true" aria-label="Start workflow"><div class="wf-heading"><h3>${esc(w?.name || "Start workflow")}</h3><button type="button" class="wf-dialog-close" data-wf="closeModal" aria-label="Close dialog" title="Close" ${modal.submitting ? "disabled" : ""}>×</button></div><form data-wf-form="run" novalidate aria-busy="${!!modal.submitting}">${modal.fields.length ? modal.fields.map((f, i) => runField(f, i)).join("") : KaiI18n.html`<label class="wf-field"><span>${KaiI18n.content(w?.graph?.nodes.find(n => n.type === "trigger")?.config.inputFields?.length ? "Run input" : "Run input (optional)")}</span><textarea name="input" data-run-input rows="6" placeholder="A topic, prompt, or JSON input">${esc(modal.text)}</textarea></label>`}${active ? KaiI18n.html`<p class="hub-help">Finish or cancel the existing run before starting another.</p>${btn("View active run", "activeRun", active.id)}` : ""}<p class="hub-help">${KaiI18n.content(modal.preview ? "Preview uses sample outputs for model, app, and memory nodes. No requests or changes are made." : "Writes and Brain changes pause for your review.")}</p><p class="wf-run-error error" role="alert" tabindex="-1">${KaiI18n.content(modal.error || "")}</p><button type="submit" class="primary" ${modal.submitting ? "disabled" : ""}>${KaiI18n.content(modal.submitting ? "Starting…" : modal.preview ? "Start preview" : "Start run")}</button></form></section></div>`;
  }
  function startDialog(id, preview, previous, origin) {
    const w = data.workflows.find(w => w.id === id);
    if (!w) throw Error("Workflow no longer exists.");
    const fields = w.graph?.nodes.find(n => n.type === "trigger")?.config.inputFields || [];
    const supported = fields.every(f => ["string", "number", "integer", "boolean", "object", "array"].includes(f.type));
    const structured = previous && typeof previous === "object" && !Array.isArray(previous);
    modal = { kind: "run", id, preview, origin, fields: supported ? fields : [], values: Object.create(null), base: structured ? clone(previous) : {}, text: typeof previous === "string" ? previous : previous === undefined ? "" : JSON.stringify(previous, null, 2) };
    for (const f of modal.fields) { const value = structured ? previous[f.name] : undefined; modal.values[f.name] = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2); }
    draw(); host.querySelector('.wf-modal input,.wf-modal textarea,.wf-modal select')?.focus();
  }
  function runField(f, i) {
    const value = modal.values[f.name] ?? "", name = "runInput" + i, attrs = `name="${name}" data-run-field="${i}" ${f.required ? "required" : ""}`;
    let control;
    if (["number", "integer"].includes(f.type)) control = KaiI18n.html`<input ${attrs} type="number" step="${f.type === "integer" ? "1" : "any"}" value="${esc(value)}"/>`;
    else if (f.type === "boolean") control = KaiI18n.html`<select ${attrs}><option value="" ${value === "" ? "selected" : ""}>Choose a value</option><option value="true" ${value === "true" ? "selected" : ""}>True</option><option value="false" ${value === "false" ? "selected" : ""}>False</option></select>`;
    else control = KaiI18n.html`<textarea ${attrs} rows="${f.type === "string" ? 2 : 4}" spellcheck="${f.type === "string"}">${esc(value)}</textarea>`;
    return KaiI18n.html`<label class="wf-field"><span>${esc(f.name)} · ${KaiI18n.content(f.required ? "Required" : "Optional")}</span>${control}${["object", "array"].includes(f.type) ? KaiI18n.html`<small>Enter valid JSON.</small>` : ""}</label>`;
  }
  function readRunInput(form, m) {
    if (!m.fields.length) return m.text = form.elements.input.value;
    const values = { ...m.base };
    // Capture every field before validating, so even a failed submission keeps edits.
    for (const [i, f] of m.fields.entries()) m.values[f.name] = form.elements["runInput" + i].value;
    for (const [i, f] of m.fields.entries()) {
      const raw = m.values[f.name], el = form.elements["runInput" + i];
      if (el.validity?.badInput) throw Error(KaiI18n.t(KaiI18n.message`Enter a valid number for ${f.name}.`));
      if (!raw.trim()) { if (f.required) throw Error(KaiI18n.t(KaiI18n.message`Enter run input: ${f.name}`)); delete values[f.name]; continue; }
      let value = raw;
      if (f.type !== "string") {
        try { value = ["number", "integer"].includes(f.type) ? Number(raw) : JSON.parse(raw); } catch { throw Error(KaiI18n.t(KaiI18n.message`Run input ${f.name} must be ${f.type}.`)); }
        const valid = f.type === "integer" ? Number.isInteger(value) : f.type === "number" ? Number.isFinite(value) : f.type === "array" ? Array.isArray(value) : f.type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value) : typeof value === f.type;
        if (!valid) throw Error(KaiI18n.t(KaiI18n.message`Run input ${f.name} must be ${f.type}.`));
      }
      Object.defineProperty(values, f.name, { value, enumerable: true, writable: true, configurable: true });
    }
    return values;
  }
  function paint() {
    const stage = host.querySelector(".wf-stage"); if (!stage || !draft) return;
    // CSP forbids HTML style attributes. Set validated geometry through CSSOM.
    for (const n of draft.graph.nodes) { const el = host.querySelector(`[data-node="${n.id}"]`); if (el) { el.style.left = n.position.x + "px"; el.style.top = n.position.y + "px"; } }
    stage.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    const svg = host.querySelector(".wf-edges"); svg.innerHTML = draft.graph.edges.map(e => {
      const a = draft.graph.nodes.find(n => n.id === e.from), b = draft.graph.nodes.find(n => n.id === e.to); if (!a || !b) return "";
      const origin = stage.getBoundingClientRect(), from = host.querySelector(`[data-wf="connectFrom"][data-id="${a.id}"][data-port="${e.port}"] i`)?.getBoundingClientRect(), to = host.querySelector(`[data-wf="connectTo"][data-id="${b.id}"]`)?.getBoundingClientRect();
      const x1 = from ? (from.x + from.width / 2 - origin.x) / zoom : a.position.x + 240, y1 = from ? (from.y + from.height / 2 - origin.y) / zoom : a.position.y + 112, x2 = to ? (to.x + to.width / 2 - origin.x) / zoom : b.position.x, y2 = to ? (to.y + to.height / 2 - origin.y) / zoom : b.position.y + 53;
      const d = `M${x1},${y1} C${x1 + 70},${y1} ${x2 - 70},${y2} ${x2},${y2}`;
      return KaiI18n.html`<g class="wf-edge" data-wf="selectEdge" data-id="${esc(e.id)}"><path class="wf-edge-hit" d="${d}"/><path d="${d}"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}">${esc(e.port === "main" ? "" : e.port)}</text></g>`;
    }).join(""); const label = host.querySelector("#wf-zoom"); if (label) label.textContent = Math.round(zoom * 100) + "%";
  }
  function fit() { const rect = host.querySelector(".wf-viewport")?.getBoundingClientRect(); if (!rect || !draft.graph.nodes.length) return; const minX = Math.min(...draft.graph.nodes.map(n => n.position.x)), minY = Math.min(...draft.graph.nodes.map(n => n.position.y)), width = Math.max(...draft.graph.nodes.map(n => n.position.x + 260)) - minX, height = Math.max(...draft.graph.nodes.map(n => n.position.y + 140)) - minY; zoom = Math.max(.18, Math.min(1, (rect.width - 60) / width, (rect.height - 60) / height)); pan = { x: (rect.width - width * zoom) / 2 - minX * zoom, y: 25 - minY * zoom }; paint(); }
  function setValue(target, path, value) { const parts = path.split("."); for (const key of parts) if (["__proto__", "constructor", "prototype"].includes(key)) throw Error("Unsupported field."); for (const key of parts.slice(0, -1)) { if (!target[key] || typeof target[key] !== "object") target[key] = {}; target = target[key]; } target[parts.at(-1)] = value; }
  function readField(el) { return el.dataset.format === "bool" ? el.checked : el.dataset.format === "number" ? Number(el.value) : el.dataset.format === "value" ? (el.value.startsWith("=") ? el.value : JSON.parse(el.value)) : el.dataset.format === "json" ? JSON.parse(el.value || "null") : el.value; }
  function input(e) {
    const el = e.target;
    if (el.id === "wf-import-json" && modal?.kind === "import") { modal.text = el.value; return; }
    if (modal?.kind === "run") {
      if (el.dataset.runField !== undefined) { const f = modal.fields[Number(el.dataset.runField)]; if (f) modal.values[f.name] = el.value; return; }
      if (el.hasAttribute?.("data-run-input")) { modal.text = el.value; return; }
    }
    if (el.id === "wf-filter") { filter = el.value; const position = el.selectionStart; draw(); const input = host.querySelector("#wf-filter"); input.focus(); input.setSelectionRange(position, position); return; }
    if (el.id === "wf-node-search") { for (const b of host.querySelectorAll('[data-wf="add"]')) b.hidden = !b.textContent.toLowerCase().includes(el.value.toLowerCase()); return; }
    if (el.dataset.field?.endsWith("addFallback")) return;
    if (!el.dataset.field || !draft || runId || /^(assist|discover|link|run)/.test(el.dataset.field)) return;
    try {
      const path = el.dataset.field, target = inspector === "settings" ? draft : currentNode(); if (!target) return;
      if (el.dataset.format === "json") readField(el); // Keep invalid JSON text available for correction.
      if (!el.dataset.history) { history(); el.dataset.history = "1"; }
      if (path.endsWith("addFallback")) return;
      if (/^config\.rules\.\d+\.(min|max)$/.test(path) && el.value === "") { const parts = path.split("."); delete target.config.rules[Number(parts[2])][parts[3]]; } else setValue(target, path, readField(el)); invalid = ""; const title = host.querySelector(".wf-builder-title small"); if (title) KaiI18n.setText(title, "Unsaved changes");
    } catch { invalid = "Enter valid JSON before saving this node."; notice(invalid, true); }
  }
  function change(e) {
    const el = e.target;
    if (el.dataset.field === "runWorkflow") { runFilter = el.value; draw(); return; } if (el.dataset.field === "runStatus") { runStatus = el.value; draw(); return; }
    if (el.dataset.readTool && currentNode() && !runId) { history(); const tools = currentNode().config.tools ||= []; const key = el.dataset.readTool, op = el.dataset.operation; currentNode().config.tools = tools.filter(t => !(t.connectionId === key && t.operationId === op)); if (el.checked) currentNode().config.tools.push({ connectionId: key, operationId: op }); return; }
    if (draft && !runId && el.dataset.field?.endsWith("addFallback")) {
      const target = inspector === "settings" ? draft : currentNode()?.config;
      if (target?.model && el.value && !(target.fallbackModels || []).some(m => m.model === el.value) && target.model !== el.value && (target.fallbackModels || []).length < 15) commit(() => { (target.fallbackModels ||= []).push(M.modelChoice({ model: el.value, modelSource: target.modelSource, modelPreference: target.modelPreference })); });
      return;
    }
    if (/modelSource$|ModelSource$/.test(el.dataset.field || "")) {
      const preference = el.closest?.(".wf-model-locations")?.querySelector(".wf-model-preference");
      if (preference) preference.hidden = el.value !== "both";
    }
    if (/^config\.rules\.\d+\.type$/.test(el.dataset.field || "") && currentNode() && !runId) {
      const index = Number(el.dataset.field.split(".")[2]), type = el.value;
      commit(() => { currentNode().config.rules[index] = { type, severity: "error", ...({required:{values:["text"]},schema:{schema:{type:"object"}},words:{min:1},characters:{min:1},citations:{min:1,sources:[],style:"source-id"},forbidden:{values:["TODO"]},contains:{values:["Required phrase"]},equals:{expected:""}}[type] || {}) }; }); return;
    }
    input(e);
    if (draft && !runId && ["model", "config.model"].includes(el.dataset.field)) {
      const target = el.dataset.field === "model" ? draft : currentNode()?.config;
      if (target) target.fallbackModels = target.model ? (target.fallbackModels || []).filter(m => m.model !== target.model) : [];
    }
    if (!draft || runId || !el.dataset.field || /^(assist|discover|link|run)/.test(el.dataset.field)) return;
    if (["config.connectionId", "config.operationId"].includes(el.dataset.field)) { if (el.dataset.field === "config.connectionId") { currentNode().config.operationId = ""; delete currentNode().config.triggerId; delete currentNode().config.triggerSlug; } currentNode().config.variables = {}; }
    if (el.dataset.field === "config.kind" && currentNode()?.type === "trigger") { currentNode().config.schedule ||= { kind: "daily", hour: 9, minute: 0, day: 1 }; currentNode().config.intervalMinutes ||= 5; }
    if (el.dataset.field === "config.schedule.kind") { const s = currentNode().config.schedule; s.hour ??= 9; s.minute ??= 0; s.day ??= 1; s.minutes ??= 30; s.expression ||= "0 9 * * 1-5"; }
    if (!invalid) { const scroll = host.querySelector(".wf-inspector")?.scrollTop || 0; draw(); host.querySelector(".wf-inspector").scrollTop = scroll; }
  }
  async function click(e) {
    const button = e.target.closest("[data-wf]");
    if (!button) { const n = e.target.closest("[data-node]"); if (n && !e.target.closest("input,textarea,select")) { selected = n.dataset.node; inspector = "node"; draw(); } return; }
    const action = button.dataset.wf, id = button.dataset.id, wasBusy = busy; if (busy && !["cancel", "closeModal"].includes(action)) return;
    try {
      if (runId && ["add", "duplicateNode", "deleteNode", "removeEdge", "addEdge", "connectTo", "connectFrom", "undo", "redo", "applyJSON", "save", "saveDraft", "arrange", "fallbackUp", "fallbackDown", "fallbackRemove", "qualityAdd", "qualityRemove"].includes(action)) return notice("This canvas is a saved run snapshot. Open the workflow to edit it.");
      if (["fallbackUp", "fallbackDown", "fallbackRemove"].includes(action)) {
        const target = inspector === "settings" ? draft : currentNode()?.config, index = Number(id);
        if (target && Number.isInteger(index) && index >= 0 && index < (target.fallbackModels || []).length) commit(() => {
          const list = target.fallbackModels;
          if (action === "fallbackRemove") list.splice(index, 1);
          else { const next = index + (action === "fallbackUp" ? -1 : 1); if (next >= 0 && next < list.length) [list[index], list[next]] = [list[next], list[index]]; }
        });
      }
      if (action === "qualityAdd" && currentNode()?.type === "quality_check" && currentNode().config.rules.length < 40) commit(() => currentNode().config.rules.push({type:"characters",min:1,severity:"error"}));
      if (action === "qualityRemove" && currentNode()?.type === "quality_check" && currentNode().config.rules.length > 1) commit(() => currentNode().config.rules.splice(Number(id),1));
      if (action === "networkModels") { busy = true; notice("Loading network models…"); const result = await api.manage("workflowModels"); data.models = result.models; data.networkModels = result.networkModels; draw(); notice(result.networkModels.error || "Network models refreshed.", !!result.networkModels.error); }
      if (action === "loadEvents") { const result = await api.manage("workflowEventTypes", { connectionId: id }); eventChoices[id] = result.items; draw(); }
      if (action === "new") newFlow();
      if (action === "edit") open(data.workflows.find(w => w.id === id));
      if (action === "duplicate") { const w = clone(data.workflows.find(w => w.id === id)); delete w.id; w.name += " copy"; w.enabled = false; delete w.legacyTask; open(w); }
      if (action === "template") open(M.template(id, defaultModel(), data.connections.find(c => c.enabled)));
      if (action === "templates") await api.navigate("templates");
      if (action === "back") { if (!await canLeave()) return; draft = null; runId = ""; linking = null; await refresh(); draw(); }
      if (action === "inspector") { inspector = id; draw(); }
      if (action === "palette") host.querySelector(".wf-palette")?.classList.toggle("show");
      if (action === "add") { if (id === "trigger" && draft.graph.nodes.some(n => n.type === "trigger")) throw Error("A workflow has one trigger. Select it to change how the workflow starts."); commit(() => { const anchor = currentNode()?.position || { x: 80, y: 70 }; selected = "n" + Date.now().toString(36); const position = { x: anchor.x, y: anchor.y + 180 }; while (draft.graph.nodes.some(n => Math.abs(n.position.x - position.x) < 260 && Math.abs(n.position.y - position.y) < 160)) position.y += 180; const n = M.node(id, selected, position); n.label = KaiI18n.t(n.label); draft.graph.nodes.push(n); inspector = "node"; }); }
      if (action === "duplicateNode") { const n = currentNode(); if (!n || n.type === "trigger") return; commit(() => { const copied = clone(n); copied.id = "n" + Date.now().toString(36); copied.position.x += 40; copied.position.y += 160; draft.graph.nodes.push(copied); selected = copied.id; }); }
      if (action === "deleteNode") { const n = currentNode(); if (!n || n.type === "trigger") return; commit(() => { draft.graph.nodes = draft.graph.nodes.filter(x => x.id !== n.id); draft.graph.edges = draft.graph.edges.filter(x => x.from !== n.id && x.to !== n.id); selected = ""; }); }
      if (action === "removeEdge") commit(() => { draft.graph.edges = draft.graph.edges.filter(e => e.id !== id); });
      if (action === "selectEdge") { const edge = draft.graph.edges.find(e => e.id === id); if (edge) { selected = edge.from; inspector = "node"; draw(); notice("Connection selected. Remove it in the node's Connections list."); } }
      if (action === "connectFrom") { linking = { from: id, port: button.dataset.port }; notice("Choose the destination node's input dot."); }
      if (action === "connectTo" && linking) { connect(linking.from, id, linking.port); linking = null; }
      if (action === "addEdge") { const get = key => host.querySelector(`[data-field="${key}"]`)?.value; if (!get("linkTarget")) throw Error("Choose the destination node."); connect(selected, get("linkTarget"), get("linkPort"), get("linkInput")); }
      if (action === "undo" && undo.length) { redo.push(clone(draft)); draft = undo.pop(); draw(); } if (action === "redo" && redo.length) { undo.push(clone(draft)); draft = redo.pop(); draw(); }
      if (action === "zoomIn") { zoom = Math.min(1.8, zoom * 1.2); paint(); } if (action === "zoomOut") { zoom = Math.max(.18, zoom / 1.2); paint(); } if (action === "fit") fit();
      if (action === "arrange") { commit(() => { const levels = new Map([[draft.graph.nodes.find(n => n.type === "trigger")?.id, 0]]); for (let i = 0; i < draft.graph.nodes.length; i++) for (const edge of draft.graph.edges) if (levels.has(edge.from) && !levels.has(edge.to)) levels.set(edge.to, levels.get(edge.from) + 1); const counts = {}; for (const n of draft.graph.nodes) { const level = levels.get(n.id) ?? 0; n.position = { x: 60 + (counts[level] || 0) * 310, y: 50 + level * 170 }; counts[level] = (counts[level] || 0) + 1; } }); fit(); }
      if (action === "validate") { const report = await api.manage("workflowValidate", draft); notice((report.errors.length ? KaiI18n.literal(report.errors.map(e => e.message).join(" ")) : KaiI18n.message`The flow is valid.${report.nextRunAt ? " Next scheduled run: " + date(report.nextRunAt) : ""}${report.warnings.length ? " " + report.warnings.map(w => w.message).join(" ") : ""}`), !!report.errors.length); }
      if (["save", "saveDraft"].includes(action)) { if (invalid) throw Error(invalid); busy = true; const w = await api.manage(action === "saveDraft" ? "workflowDraft" : "workflow", draft); await refresh(); draft = M.fromLegacy(w); savedJSON = JSON.stringify(draft); draw(); notice((action === "saveDraft" ? KaiI18n.message(["Draft saved. Review it before enabling or running."]) : KaiI18n.message(["Workflow saved."]))); }
      if (action === "toggle") { const w = data.workflows.find(w => w.id === id); await api.manage("workflowEnabled", { id, enabled: !w.enabled }); await refresh(); draw(); }
      if (action === "delete") { if (!await window.kai.dialogs.confirm(KaiI18n.t(KaiI18n.message(["Delete this workflow and its run history?"])))) return; await api.manage("removeWorkflow", { id }); await refresh(); draw(); }
      if (action === "import") { modal = { kind: "import", text: "" }; draw(); host.querySelector('#wf-import-json')?.focus(); }
      if (action === "importFile") { busy = true; const w = await api.manage("importWorkflow"); if (w) await imported(w); }
      if (action === "export" || action === "exportCanvas") {
        if (action === "exportCanvas" && invalid) throw Error(invalid);
        busy = true;
        const saved = await api.manage("exportWorkflow", action === "exportCanvas" ? { workflow: clone(draft) } : { id });
        if (saved) notice("Workflow JSON exported. The file includes prompts and node settings; review them before sharing.");
      }
      if (["run", "preview", "runAgain"].includes(action)) { if (draft && !runId && dirty()) throw Error("Save the changes before running this workflow."); const previous = action === "runAgain" ? data.runs.find(r => r.id === id) : null; startDialog(previous?.workflowId || id, action === "preview", previous?.input, { action, id }); }
      if (action === "activeRun") { modal = null; draft = null; runId = ""; runFilter = data.runs.find(r => r.id === id)?.workflowId || ""; runStatus = ""; await api.navigate("runs"); host.querySelector(`[data-run="${id}"]`)?.setAttribute("open", ""); }
      if (action === "closeModal") closeModal();
      if (action === "history") { draft = null; runFilter = id; await api.navigate("runs"); }
      if (["runCanvas", "selectRun"].includes(action)) { const run = data.runs.find(r => r.id === id); open(run.spec); runId = id; inspector = "runs"; draw(); fit(); }
      if (action === "retryRun") { await api.manage("retryRun", { id }); await refresh(); draw(); }
      if (action === "resume") { await api.manage("resume", { id }); await refresh(); draw(); }
      if (action === "reject") { await api.manage("workflowReject", { id }); await refresh(); draw(); }
      if (action === "cancel") { await api.manage("cancelRun", { id }); await refresh(); draw(); }
      if (action === "refresh") { await refresh(); draw(); }
      if (action === "quickBuild") { const request = host.querySelector("#wf-quick-prompt").value; newFlow(); inspector = "copilot"; draw(); host.querySelector('[data-field="assistRequest"]').value = request; }
      if (action === "applyProposal" && proposal) { commit(() => { draft = { ...proposal.proposal, ...(draft.id ? { id: draft.id } : {}), enabled: false }; selected = draft.graph.nodes[0]?.id; proposal = null; inspector = "node"; }); fit(); }
      if (action === "dismissProposal") { proposal = null; draw(); }
      if (action === "applyJSON") { const raw = JSON.parse(host.querySelector("#wf-document").value), doc = M.importDocument(raw); commit(() => { draft = { ...doc, ...(draft.id ? { id: draft.id } : {}) }; }); }
      if (action === "copyExpr") { const text = "=nodes." + id + ".text"; await window.kai.call("workflows.copyText", { text }); notice(KaiI18n.message`Copied ${text}`); }
      if (action === "dismiss") { await api.manage("workflowDismiss", { id }); await refresh(); draw(); }
      if (action === "buildSuggestion") { const suggestion = data.workflowState.suggestions.find(s => s.id === id); open(M.template(suggestion.template, defaultModel(), data.connections.find(c => c.enabled))); draft.name = suggestion.name; inspector = "copilot"; draw(); host.querySelector('[data-field="assistRequest"]').value = suggestion.request; }
    } catch (error) { transferError(error); } finally { if (!wasBusy) busy = false; poll(); }
  }
  function connect(from, to, port = "main", input = "main") { if (draft.graph.nodes.find(n => n.id === to)?.type === "trigger") throw Error("Connect to an action or logic node, not the trigger."); const edge = M.edge(from, to, port, input || "main"); if (draft.graph.edges.some(e => e.id === edge.id)) throw Error("These ports are already connected."); commit(() => draft.graph.edges.push(edge)); }
  async function imported(w) {
    await refresh(); modal = null; open(w); inspector = "settings"; draw();
    notice("Imported as a new draft. Choose your model and review the nodes before saving.");
  }
  function transferError(error) {
    if (modal) { modal.error = error.message; modal.submitting = false; draw(); host.querySelector('.wf-modal [role="alert"]')?.focus(); }
    else notice(error.message, true);
  }
  async function submit(e) {
    const form = e.target.closest("[data-wf-form]"); if (!form) return; e.preventDefault(); if (busy) return; busy = true;
    const button = form.querySelector('button:not([type="button"])'); if (button) button.disabled = true;
    try {
      const type = form.dataset.wfForm, get = key => form.querySelector(`[data-field="${key}"]`), source = prefix => ({ modelSource: get(prefix + "ModelSource").value, modelPreference: get(prefix + "ModelPreference").value });
      if (type === "import") { const text = form.elements.workflowJSON.value; modal.text = text; const w = await api.manage("importWorkflow", { text }); await imported(w); }
      if (type === "run") {
        const m = modal, input = readRunInput(form, m); m.submitting = true; m.error = ""; draw();
        const result = await api.manage(m.preview ? "workflowPreview" : "run", { id: m.id, input });
        modal = null; draft = null; runId = ""; runFilter = m.id; runStatus = ""; draw();
        await api.navigate("runs");
        const card = host.querySelector(`[data-run="${typeof result === "string" ? result : result.id}"]`); card?.setAttribute("open", ""); card?.scrollIntoView?.({ block: "nearest" });
        notice((m.preview ? KaiI18n.message(["Preview started with simulated capability outputs."]) : KaiI18n.message(["Workflow started."])));
      }
      if (type === "assist") { notice("KAI is designing the flow…"); proposal = await api.manage("workflowAssist", { request: get("assistRequest").value, model: get("assistModel").value, ...source("assist"), fallbackModels: get("assistModel").value === draft.model ? draft.fallbackModels || [] : [], workflow: draft }); draw(); notice("Review the proposed changes, then apply them to the canvas."); }
      if (type === "discoverySettings") { await api.manage("workflowDiscoverySettings", { enabled: get("discoveryEnabled").checked, model: get("discoveryModel").value, ...source("discovery"), fallbackModels: get("discoveryModel").value === data.workflowState?.discovery?.model ? data.workflowState.discovery.fallbackModels || [] : [], includeBrain: get("discoveryBrain").checked }); await refresh(); draw(); }
      if (type === "discover") { notice("Looking for useful routines…"); await api.manage("workflowDiscover", { model: get("discoverModel").value, ...source("discover"), includeBrain: get("discoverBrain").checked }); await refresh(); draw(); }
    } catch (error) { transferError(error); } finally { busy = false; if (button) button.disabled = false; host.querySelectorAll('[data-wf-form="assist"] button,[data-wf-form="discover"] button').forEach(b => { b.disabled = false; KaiI18n.setText(b, b.closest('[data-wf-form="assist"]') ? "Suggest changes" : "Find suggestions"); }); poll(); }
  }
  function pointerdown(e) {
    if (!draft || e.button !== 0) return;
    const heading = e.target.closest("[data-drag-node]"), viewport = e.target.closest(".wf-viewport"), port = e.target.closest('[data-wf="connectFrom"]');
    if (port && !runId) { const from = port.dataset.id, output = port.dataset.port; const finish = ev => { window.removeEventListener("pointerup", finish); const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-wf="connectTo"]'); if (target) { try { connect(from, target.dataset.id, output); linking = null; } catch (error) { notice(error.message, true); } } }; window.addEventListener("pointerup", finish, { once: true }); return; }
    if (heading && !runId) {
      e.preventDefault(); const n = draft.graph.nodes.find(n => n.id === heading.dataset.dragNode), start = { x: e.clientX, y: e.clientY, ...n.position }, old = { ...n.position }; history(); selected = n.id;
      const move = ev => { n.position = { x: Math.max(0, Math.min(6000, Math.round((old.x + (ev.clientX - e.clientX) / zoom) / 10) * 10)), y: Math.max(0, Math.min(12000, Math.round((old.y + (ev.clientY - e.clientY) / zoom) / 10) * 10)) }; const nodeEl = host.querySelector(`[data-node="${n.id}"]`); if (nodeEl) { nodeEl.style.left = n.position.x + "px"; nodeEl.style.top = n.position.y + "px"; } paint(); };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); inspector = "node"; draw(); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true }); return;
    }
    if (viewport && !e.target.closest("button,[data-node],.wf-edge")) { e.preventDefault(); const old = { ...pan }; const move = ev => { pan = { x: old.x + ev.clientX - e.clientX, y: old.y + ev.clientY - e.clientY }; paint(); }; const up = () => { window.removeEventListener("pointermove", move); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true }); }
  }
  function wheel(e) { e.preventDefault(); if (e.ctrlKey || e.metaKey) { const old = zoom, rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top; zoom = Math.max(.18, Math.min(1.8, zoom * (e.deltaY < 0 ? 1.08 : .92))); pan = { x: x - (x - pan.x) * zoom / old, y: y - (y - pan.y) * zoom / old }; } else { pan.x -= e.deltaX; pan.y -= e.deltaY; } paint(); }
  function closeModal() {
    if (modal?.submitting) return;
    const previous = modal; modal = null; draw();
    if (previous) [...host.querySelectorAll("[data-wf]")].find(button => previous.kind === "import" ? button.dataset.wf === "import" : button.dataset.id === previous.origin.id && button.dataset.wf === previous.origin.action)?.focus();
  }
  function keydown(e) {
    if (e.key === "Escape") { linking = null; if (modal) closeModal(); else draw(); return; }
    if (modal && e.key === "Tab") {
      const controls = [...(host.querySelector(".wf-modal")?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') || [])];
      const first = controls[0], last = controls.at(-1);
      if (first && e.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (first && !e.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { e.preventDefault(); first.focus(); }
      return;
    }
    if (modal || !draft || e.target.matches("input,textarea,select") || runId) return;
    if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) { e.preventDefault(); const action = e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo"; host.querySelector(`[data-wf="${action}"]`)?.click(); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); host.querySelector('[data-wf="deleteNode"]')?.click(); }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && currentNode()) { e.preventDefault(); commit(() => { const p = currentNode().position; p.x = Math.max(0, p.x + (e.key === "ArrowRight" ? 20 : e.key === "ArrowLeft" ? -20 : 0)); p.y = Math.max(0, p.y + (e.key === "ArrowDown" ? 20 : e.key === "ArrowUp" ? -20 : 0)); }); }
  }
  function poll() { clearTimeout(timer); if (!host?.isConnected || host.closest('[hidden]')) return; timer = setTimeout(async () => { if (!host?.isConnected || host.closest('[hidden]')) return; if (!busy && !modal && (section === "runs" || runId || inspector === "runs" && draft)) { try { const before = JSON.stringify(data.runs); await refresh(); if (!busy && !modal && before !== JSON.stringify(data.runs) && !host.querySelector("input:focus,textarea:focus,select:focus")) { const opened = [...host.querySelectorAll("details[open]")].map(el => el.dataset.run).filter(Boolean); draw(); for (const id of opened) host.querySelector(`[data-run="${id}"]`)?.setAttribute("open", ""); } } catch { /* keep the last view */ } } poll(); }, 2000); }
  async function canLeave() {
    if (modal?.submitting) return false;
    if (!dirty() || runId) return true;
    const reviewed = draft, snapshot = JSON.stringify(draft);
    const approved = await window.kai.dialogs.confirm(KaiI18n.t(KaiI18n.message(["Discard unsaved workflow changes?"])));
    return approved === true && draft === reviewed && JSON.stringify(draft) === snapshot;
  }
  window.KaiWorkflows = { render, canLeave, hasUnsavedChanges: () => !!dirty() && !runId, leave: () => { if (host) { host.onchange = null; host.oninput = null; } draft = null; runId = ""; modal = null; clearTimeout(timer); }, isEditing: () => !!draft };
})();
