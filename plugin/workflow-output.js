/* Shared, bounded JSON output contracts. No schema code or remote references. */
(function (root, factory) {
  const api = factory(); if (typeof module === "object" && module.exports) module.exports = api; else root.KaiWorkflowOutput = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const object = value => !!value && typeof value === "object" && !Array.isArray(value);
  const types = ["object", "array", "string", "number", "integer", "boolean", "null"];
  const bounds = ["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum"];
  const keywords = new Set(["type", "properties", "required", "items", "additionalProperties", "enum", "description", ...bounds]);
  function checkSchema(schema = {}, dynamic = false) {
    if (JSON.stringify(schema).length > 12000) throw Error("JSON schema exceeds 12 KB.");
    let count = 0;
    function visit(s, depth) {
      if (!object(s) || depth > 12 || ++count > 256) throw Error("Use a JSON schema object with at most 12 levels and 256 fields.");
      for (const key of Object.keys(s)) if (!keywords.has(key)) throw Error("Unsupported JSON schema keyword: " + key);
      if (s.type !== undefined && !types.includes(s.type)) throw Error("Choose a supported JSON schema type.");
      if (s.description !== undefined && typeof s.description !== "string") throw Error("JSON schema descriptions must be text.");
      if (s.properties !== undefined) {
        if (!object(s.properties)) throw Error("JSON schema properties must be an object.");
        for (const child of Object.values(s.properties)) visit(child, depth + 1);
      }
      if (s.items !== undefined) visit(s.items, depth + 1);
      if (s.required !== undefined && (!Array.isArray(s.required) || s.required.some(k => typeof k !== "string") || new Set(s.required).size !== s.required.length)) throw Error("JSON schema required must be an array of unique field names.");
      if (s.additionalProperties !== undefined && typeof s.additionalProperties !== "boolean") throw Error("JSON schema additionalProperties must be true or false.");
      if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length || s.enum.length > 100)) throw Error("JSON schema enum needs 1–100 choices.");
      for (const key of bounds) if (s[key] !== undefined) {
        if (dynamic && typeof s[key] === "string" && s[key].startsWith("=")) continue;
        if (!Number.isFinite(s[key]) || !["minimum", "maximum"].includes(key) && (!Number.isInteger(s[key]) || s[key] < 0)) throw Error("JSON schema " + key + " must be a valid number.");
      }
      for (const [lo, hi] of [["minItems", "maxItems"], ["minLength", "maxLength"], ["minimum", "maximum"]]) if (typeof s[lo] === "number" && typeof s[hi] === "number" && s[lo] > s[hi]) throw Error("JSON schema " + lo + " exceeds " + hi + ".");
    }
    visit(schema, 0); return schema;
  }
  function validate(value, schema = {}, path = "$") {
    const fail = detail => path + " " + detail;
    const matches = { object: object(value), array: Array.isArray(value), string: typeof value === "string", number: typeof value === "number" && Number.isFinite(value), integer: Number.isSafeInteger(value), boolean: typeof value === "boolean", null: value === null };
    if (schema.type && !matches[schema.type]) return fail("must be " + schema.type + ".");
    if (schema.enum && !schema.enum.some(v => equal(value, v))) return fail("must match an enum choice.");
    if (object(value)) {
      for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return fail("is missing " + key + ".");
      for (const [key, v] of Object.entries(value)) {
        const child = Object.hasOwn(schema.properties || {}, key) ? schema.properties[key] : undefined;
        if (!child && schema.additionalProperties === false) return fail("has an unexpected field: " + key + ".");
        if (child) { const error = validate(v, child, path + "." + key); if (error) return error; }
      }
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) return fail("needs at least " + schema.minItems + " items.");
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return fail("needs at most " + schema.maxItems + " items.");
      if (schema.items) for (let i = 0; i < value.length; i++) { const error = validate(value[i], schema.items, path + "[" + i + "]"); if (error) return error; }
    }
    if (typeof value === "string") {
      const length = [...value].length;
      if (schema.minLength !== undefined && length < schema.minLength) return fail("is too short.");
      if (schema.maxLength !== undefined && length > schema.maxLength) return fail("is too long.");
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return fail("must be finite.");
      if (schema.minimum !== undefined && value < schema.minimum) return fail("is below " + schema.minimum + ".");
      if (schema.maximum !== undefined && value > schema.maximum) return fail("is above " + schema.maximum + ".");
    }
    return "";
  }
  function equal(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
    return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  }
  const unfence = text => text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Some providers wrap each continuation separately. Strip only standalone
  // fence lines from that new fragment, never backticks inside JSON strings.
  function continuationText(text) {
    return text.replace(/^\s*```(?:json)?[ \t]*\r?\n/i, "").replace(/(?:^|\r?\n)[ \t]*```[ \t]*$/, "");
  }
  function removeSchemaEcho(raw, schema) {
    if (!Object.keys(schema).length || raw.length > 200000 || raw[0] !== "{") return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === "{" || c === "[") { if (++depth > 64) return null; }
      else if (c === "}" || c === "]") {
        if (--depth === 0) {
          try {
            const first = JSON.parse(raw.slice(0, i + 1)), rest = raw.slice(i + 1).trim();
            // Discard only an exact copy of the requested contract which is
            // itself invalid as the answer. Multiple plausible answers stay ambiguous.
            return rest && equal(first, schema) && validate(first, schema) ? rest : null;
          } catch { return null; }
        }
      }
    }
    return null;
  }
  // Insert only a missing container closer when a later, existing closer proves
  // where that container ends. Never complete EOF, strings, values or fields.
  // The repaired document must still parse and satisfy the entire schema.
  function closeContainers(raw) {
    if (raw.length > 200000 || !/^[{[]/.test(raw)) return null;
    const stack = [], edits = []; let quoted = false, escaped = false, output = "";
    for (let offset = 0; offset < raw.length; offset++) {
      const c = raw[offset];
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === "{" || c === "[") { stack.push(c); if (stack.length > 64) return null; }
      else if (c === "}" || c === "]") {
        const expected = c === "}" ? "{" : "[";
        if (!stack.includes(expected)) return null;
        while (stack.at(-1) !== expected) {
          if (edits.length >= 8) return null;
          const insert = stack.pop() === "[" ? "]" : "}";
          edits.push({ offset, insert }); output += insert;
        }
        stack.pop();
      }
      output += c;
    }
    return !quoted && !stack.length && edits.length ? { text: output, edits } : null;
  }
  function inspect(text, schema = {}, allowToolCall = false) {
    const unfenced = unfence(text), afterEcho = removeSchemaEcho(unfenced, schema), raw = afterEcho ?? unfenced;
    let value, recovery;
    try { value = JSON.parse(raw); }
    catch {
      const repaired = closeContainers(raw);
      if (repaired) {
        try {
          const candidate = JSON.parse(repaired.text);
          // Tool arguments are not silently repaired, even for read tools.
          if (!(allowToolCall && object(candidate?.tool)) && !validate(candidate, schema)) {
            value = candidate; recovery = { kind: "missing-container-closers", edits: repaired.edits };
          }
        } catch { /* Continue or request a bounded model repair below. */ }
      }
      if (!recovery) {
        const incomplete = unfinished(raw);
        return { valid: false, incomplete, error: incomplete ? "The response is not complete, valid JSON." : "The response contains invalid JSON syntax; appending text cannot fix it." };
      }
    }
    const error = allowToolCall && object(value?.tool) ? "" : validate(value, schema);
    if (!error && afterEcho !== null) recovery = { kind: "echoed-output-schema", ...(recovery ? { syntaxRecovery: recovery } : {}) };
    return { valid: !error, incomplete: false, error, value, text: JSON.stringify(value), ...(recovery ? { recovery } : {}) };
  }
  function unfinished(raw) {
    // A continuation can only repair a grammatically valid prefix. Counting
    // brackets mistakes missing quotes, invalid escapes and commas for EOF,
    // repeatedly charging for suffixes that cannot repair an earlier error.
    if (!raw || raw.length > 200000) return false;
    const eof = {}, invalid = {}; let i = 0;
    const space = () => { while (/[\t\n\r ]/.test(raw[i] || "\0")) i++; };
    const need = () => { if (i === raw.length) throw eof; };
    function string() {
      i++;
      for (;;) {
        need(); const c = raw[i++];
        if (c === '"') return;
        if (c.charCodeAt(0) < 32) throw invalid;
        if (c !== "\\") continue;
        need(); const escape = raw[i++];
        if (escape === "u") {
          for (let n = 0; n < 4; n++) { need(); if (!/[0-9a-f]/i.test(raw[i++])) throw invalid; }
        } else if (!'"\\/bfnrt'.includes(escape)) throw invalid;
      }
    }
    function value(depth) {
      if (depth > 64) throw invalid;
      space(); need(); const c = raw[i];
      if (c === '"') { string(); return; }
      if (c === "{" || c === "[") {
        const map = c === "{", end = map ? "}" : "]"; i++; space(); need();
        if (raw[i] === end) { i++; return; }
        for (;;) {
          if (map) { if (raw[i] !== '"') throw invalid; string(); space(); need(); if (raw[i++] !== ":") throw invalid; }
          value(depth + 1); space(); need();
          if (raw[i] === end) { i++; return; }
          if (raw[i++] !== ",") throw invalid;
          space(); need(); // A trailing comma followed by a closer is invalid.
        }
      }
      const literal = { t: "true", f: "false", n: "null" }[c];
      if (literal) { for (const letter of literal) { need(); if (raw[i++] !== letter) throw invalid; } return; }
      if (c === "-") { i++; need(); }
      if (raw[i] === "0") i++;
      else {
        if (!/[1-9]/.test(raw[i] || "")) throw invalid;
        while (/[0-9]/.test(raw[i] || "")) i++;
      }
      if (raw[i] === ".") { i++; need(); if (!/[0-9]/.test(raw[i])) throw invalid; while (/[0-9]/.test(raw[i] || "")) i++; }
      if (/[eE]/.test(raw[i] || "")) {
        i++; need(); if (/[+-]/.test(raw[i])) { i++; need(); }
        if (!/[0-9]/.test(raw[i])) throw invalid; while (/[0-9]/.test(raw[i] || "")) i++;
      }
    }
    try { value(0); space(); return false; }
    catch (error) { return error === eof; }
  }
  return { checkSchema, validate, inspect, continuationText };
});
