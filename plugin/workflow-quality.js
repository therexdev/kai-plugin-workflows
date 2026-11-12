/* Deterministic, configurable checks shared by the builder and runner. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./workflow-output") : root.KaiWorkflowOutput);
  if (typeof module === "object" && module.exports) module.exports = api; else root.KaiWorkflowQuality = api;
})(typeof window === "object" ? window : globalThis, function (Output) {
  "use strict";
  const kinds = ["required", "schema", "words", "characters", "citations", "forbidden", "contains", "equals"];
  const object = x => x && typeof x === "object" && !Array.isArray(x);
  const dynamic = x => typeof x === "string" && x.startsWith("=");
  const citePattern = style => style === "numbered" ? /\[\s*(\d+(?:\s*[,;]\s*\d+)*)\s*\](?!\()/g : /\[\s*(S\d+-\d+(?:\s*[,;]\s*S\d+-\d+)*)\s*\](?!\()/g;
  function citations(text, style = "source-id") {
    return [...new Set([...String(text).matchAll(citePattern(style))].flatMap(m => m[1].split(/[,;]/).map(s => s.trim())))];
  }
  function wordCount(text) {
    return String(text).replace(citePattern("source-id"), "").replace(citePattern("numbered"), "")
      .replace(/^#{1,6}\s+.*$/gm, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim().split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
  }
  function checkRules(rules, allowDynamic = false) {
    if (!Array.isArray(rules) || !rules.length || rules.length > 40) throw Error("Use 1–40 quality rules.");
    for (const r of rules) {
      if (!object(r) || !kinds.includes(r.type)) throw Error("Choose a supported quality rule.");
      if (r.severity !== undefined && !["error", "warning"].includes(r.severity)) throw Error("Quality severity must be error or warning.");
      if (r.field !== undefined && (typeof r.field !== "string" || r.field.length > 200 || r.field.split(".").some(k => ["__proto__", "constructor", "prototype"].includes(k)))) throw Error("Choose a valid quality field path.");
      for (const k of ["min", "max"]) if (r[k] !== undefined && !(allowDynamic && dynamic(r[k])) && (!Number.isSafeInteger(r[k]) || r[k] < 0 || r[k] > 200000)) throw Error("Quality limits must be whole numbers from 0 to 200000.");
      if (typeof r.min === "number" && typeof r.max === "number" && r.min > r.max) throw Error("The minimum quality limit exceeds the maximum.");
      if (["words", "characters"].includes(r.type) && r.min === undefined && r.max === undefined) throw Error("Add a minimum or maximum count.");
      if (r.type === "schema") Output.checkSchema(r.schema || {}, allowDynamic);
      if (["required", "forbidden", "contains"].includes(r.type)) {
        if (!(allowDynamic && dynamic(r.values)) && (!Array.isArray(r.values) || !r.values.length || r.values.length > 100 || r.values.some(v => typeof v !== "string" || !v || v.length > 200))) throw Error("Enter 1–100 nonempty quality values of up to 200 characters.");
      }
      if (r.type === "citations") {
        if (r.style !== undefined && !["numbered", "source-id"].includes(r.style)) throw Error("Choose numbered or source-ID citations.");
        if (!(allowDynamic && dynamic(r.sources)) && (!Array.isArray(r.sources) || r.sources.length > 100 || r.sources.some(s => !(typeof s === "string" || Number.isSafeInteger(s) || object(s) && (typeof s.id === "string" || Number.isSafeInteger(s.n)))))) throw Error("Citation rules need a list of known source IDs.");
      }
      if (r.type === "equals" && !Object.hasOwn(r, "expected")) throw Error("Equality checks need an expected value.");
    }
    return rules;
  }
  function path(value, field) {
    if (!field) return value;
    for (const key of field.split(".")) { if (value == null || !Object.hasOwn(Object(value), key)) return undefined; value = value[key]; }
    return value;
  }
  function inspect(value, rules) {
    checkRules(rules);
    if (JSON.stringify({ value, rules }).length > 200000) throw Error("Quality input exceeds 200 KB.");
    const issues = [], metrics = [];
    rules.forEach((r, index) => {
      const v = path(value, r.field), location = r.field || "$", severity = r.severity || "error";
      const issue = (code, message, detail = {}) => issues.push({ id: "check-" + (index + 1) + "-" + (issues.length + 1), rule: index, severity, location, code, message, ...detail });
      if (r.type === "required") {
        for (const key of r.values) if (!object(v) || !Object.hasOwn(v, key) || v[key] === null || v[key] === undefined || typeof v[key] === "string" && !v[key].trim() || Array.isArray(v[key]) && !v[key].length) issue("required", "Required field is empty or missing: " + key, { field: key });
      } else if (r.type === "schema") {
        const error = Output.validate(v, r.schema); if (error) issue("schema", error);
      } else if (r.type === "equals") {
        const canonical = x => Array.isArray(x) ? x.map(canonical) : object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
        if (JSON.stringify(canonical(v)) !== JSON.stringify(canonical(r.expected))) issue("equals", "Value does not match the expected value.");
      } else {
        if (typeof v !== "string") { issue("type", "This quality rule requires text."); return; }
        if (["words", "characters"].includes(r.type)) {
          const actual = r.type === "words" ? wordCount(v) : [...v].length;
          metrics.push({ rule: index, location, type: r.type, actual, ...(r.min === undefined ? {} : { min: r.min }), ...(r.max === undefined ? {} : { max: r.max }) });
          if (r.min !== undefined && actual < r.min || r.max !== undefined && actual > r.max) issue(r.type, r.type + " count is outside the configured range.", { actual, min: r.min, max: r.max });
        } else if (r.type === "citations") {
          const ids = citations(v, r.style), known = new Set(r.sources.map(s => String(object(s) ? s.id ?? s.n : s)));
          metrics.push({ rule: index, location, type: "citations", actual: ids.length, ids });
          if (ids.length < (r.min ?? 1)) issue("citations-missing", "Text needs at least " + (r.min ?? 1) + " known source citation(s).", { actual: ids.length });
          const unknown = ids.filter(id => !known.has(id)); if (unknown.length) issue("citations-unknown", "Citations are absent from the supplied evidence: " + unknown.join(", "), { ids: unknown });
        } else {
          const normalized = v.toLocaleLowerCase(), values = r.values.filter(s => r.type === "contains" ? !normalized.includes(s.toLocaleLowerCase()) : normalized.includes(s.toLocaleLowerCase()));
          if (values.length) issue(r.type, r.type === "contains" ? "Required text is missing." : "Text contains a forbidden phrase.", { values });
        }
      }
    });
    return { valid: !issues.some(i => i.severity === "error"), issues, metrics };
  }
  return { kinds, checkRules, inspect, wordCount, citations };
});
