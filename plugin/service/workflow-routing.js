"use strict";
const { CompanionError } = require("./companion-store");
// Explicit, editable task preferences, not a benchmark claim. Unknown models
// remain eligible after known task choices; readiness always comes from Core.
const preferences = {
  research: ["qwen25-32b", "deepseek-r1-32b", "phi-4", "qwen25-14b", "gemma3-27b", "mistral-small-24b", "gemma3-12b", "llama31-8b", "koinos-smart", "gemma3-4b", "mistral-7b", "koinos-balanced", "lfm3-1.7b", "koinos-fast"],
  outline: ["qwen25-32b", "phi-4", "qwen25-14b", "deepseek-r1-32b", "mistral-small-24b", "gemma3-27b", "gemma3-12b", "koinos-smart", "llama31-8b", "gemma3-4b", "mistral-7b", "lfm3-1.7b", "koinos-balanced", "koinos-fast"],
  writing: ["mistral-small-24b", "gemma3-27b", "qwen25-32b", "qwen25-14b", "gemma3-12b", "llama31-8b", "phi-4", "koinos-smart", "mistral-7b", "gemma3-4b", "koinos-balanced", "lfm3-1.7b", "koinos-fast", "deepseek-r1-32b"]
};
function choose(catalog, alias) {
  const task = alias?.match(/^koinos-network:auto-(research|outline|writing)$/)?.[1];
  const ready = catalog.filter(m => m.status === "ready" && !/^koinos-network:auto-/.test(m.alias));
  if (!task) return ready.find(m => m.alias === alias);
  const rank = m => { const i = preferences[task].indexOf(m.alias.slice(15)); return i < 0 ? preferences[task].length : i; };
  const selected = ready.sort((a, b) => rank(a) - rank(b) || (b.maxOutput || 0) - (a.maxOutput || 0) || a.alias.localeCompare(b.alias))[0];
  if (!selected) throw new CompanionError("No eligible KAI network model is online for this task. Refresh and run again when a provider is available.");
  return selected;
}
module.exports = { choose, preferences };
