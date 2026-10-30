"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..", "plugin");
test("plugin entry, grants and scripts form a browser-only API 2 package", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(m.schema, 1); assert.equal(m.apiVersion, 2); assert.equal(m.id, "kai.workflows"); assert.deepEqual(m.permissions, ["models.read", "workflows.read", "workflows.write", "workflows.run"]);
  const html = fs.readFileSync(path.join(root, m.entry), "utf8"), js = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(html, /<script src="app.js"><\/script>/); assert.match(html, /href="style.css"/); assert.doesNotMatch(html, /on(?:click|load|error)=|<script>.*<\/script>/);
  assert.doesNotMatch(js, /\brequire\s*\(|\bfetch\s*\(|\beval\s*\(|innerHTML\s*=|localStorage/); new vm.Script(js);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])); for (const [, id] of js.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.has(id), "UI target exists: " + id);
});
