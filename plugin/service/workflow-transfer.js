"use strict";
const fs = require("node:fs"), Model = require("../workflow-model");
const { CompanionError } = require("./companion-store");
const { normalize } = require("./workflow-engine");

// Plenty of room for a pretty-printed, UTF-8 graph within the runner's 150K limit.
const MAX_BYTES = 1024 * 1024;
function parseDocument(value) {
  if (typeof value !== "string" || !value.trim()) throw new CompanionError("Paste workflow JSON or choose a JSON file.");
  if (Buffer.byteLength(value, "utf8") > MAX_BYTES) throw new CompanionError("Workflow file is too large (maximum 1 MB).");
  let raw;
  try { raw = JSON.parse(value.replace(/^\uFEFF/, "").trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1")); }
  catch { throw new CompanionError("Invalid JSON. Paste the complete workflow document and try again."); }
  // Bound nesting before the model copies the document, including unused fields.
  const visit = (v, depth = 0) => {
    if (!v || typeof v !== "object") return;
    if (depth > 40) throw new CompanionError("Workflow JSON is nested too deeply.");
    for (const child of Object.values(v)) visit(child, depth + 1);
  };
  visit(raw);
  return normalize(Model.exportDocument(raw).workflow, true);
}
function readDocument(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new CompanionError("Choose a JSON file.");
    if (stat.size > MAX_BYTES) throw new CompanionError("Workflow file is too large (maximum 1 MB).");
    const buffer = Buffer.alloc(MAX_BYTES + 1); let bytes = 0, count;
    do { count = fs.readSync(fd, buffer, bytes, buffer.length - bytes, null); bytes += count; } while (count && bytes < buffer.length);
    if (bytes > MAX_BYTES) throw new CompanionError("Workflow file is too large (maximum 1 MB).");
    return parseDocument(buffer.toString("utf8", 0, bytes));
  } finally { fs.closeSync(fd); }
}
function importWorkflow(service, spec) {
  // A fresh identity is always allocated; even same-name/ID imports cannot overwrite a workflow.
  const names = new Set(service.store.data.workflows.map(w => w.name.toLowerCase()));
  const base = spec.name; let name = base;
  for (let n = 1; names.has(name.toLowerCase()); n++) {
    const suffix = n === 1 ? " (imported)" : ` (imported ${n})`;
    name = base.slice(0, 100 - suffix.length) + suffix;
  }
  return service.workflows.save({ ...spec, name, id: undefined, enabled: false }, { draft: true });
}
function exportWorkflow(spec) {
  const document = Model.exportDocument(spec);
  document.workflow = Model.exportDocument(normalize(document.workflow, true)).workflow;
  const json = JSON.stringify(document, null, 2) + "\n";
  if (Buffer.byteLength(json, "utf8") > MAX_BYTES) throw new CompanionError("Workflow file is too large (maximum 1 MB).");
  return { document, json, filename: "KAI-" + document.workflow.name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) + ".workflow.json" };
}
module.exports = { MAX_BYTES, parseDocument, readDocument, importWorkflow, exportWorkflow };
