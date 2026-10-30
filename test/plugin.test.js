"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..", "plugin");
test("complete original Workflows renderer is packaged behind the reviewed bridge", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")), html = fs.readFileSync(path.join(root, manifest.entry), "utf8");
  assert.equal(manifest.id, "kai.workflows"); assert.deepEqual(manifest.permissions, ["models.read", "workflows.read", "workflows.write", "workflows.run"]);
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) { assert.ok(fs.existsSync(path.join(root, asset)), asset); if (asset.endsWith(".js")) new vm.Script(fs.readFileSync(path.join(root, asset), "utf8")); }
  assert.doesNotMatch(html, /on(?:click|load|error)=|<script>/);
  const ui = fs.readFileSync(path.join(root, "workflows.js"), "utf8");
  for (const capability of ["workflowEventTypes", "workflowEnabled", "workflowDiscoverySettings", "workflowDiscover", "workflowPreview", "workflowReject", "workflowDraft", "workflowAssist", "importWorkflow", "exportWorkflow"]) assert.match(ui, new RegExp(capability));
  assert.match(ui, /Run snapshot/); assert.match(ui, /wf-viewport/); assert.match(ui, /wf-inspector/); assert.match(ui, /data-wf="connectTo"/); assert.match(ui, /workflows.copyText/);
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(/);
});
test("original node catalog retains public research, connected actions, code, memory and looping", () => {
  const model = require("../plugin/workflow-model.js");
  for (const type of ["trigger", "agent", "tool_call", "http_request", "code", "memory", "loop", "sub_workflow", "approval", "output"]) assert.ok(model.catalog.some(n => n.type === type), type);
});
