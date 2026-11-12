"use strict";
// Prose continuations echo an exact suffix. Removing only that verified overlap
// preserves whitespace, split words, hyphens and links without a dictionary guess.
function anchor(text) {
  if (text.length <= 128) return text;
  const suffix = text.slice(-128), start = suffix.search(/\s/);
  return start >= 0 && start < 64 ? suffix.slice(start + 1) : suffix;
}
function append(prefix, chunk, expected) {
  if (!expected) return { valid: true, text: prefix + chunk, overlap: 0 };
  // A model may repeat the full answer, or add a leading blank line. Both must
  // contain the exact requested overlap, never a fuzzy lexical approximation.
  for (const candidate of [chunk, chunk.replace(/^\s+/, "")]) {
    const repeat = candidate.startsWith(prefix) ? prefix : expected;
    if (candidate.startsWith(repeat)) {
      const suffix = candidate.slice(repeat.length);
      if (!suffix) return { valid: false, error: "The continuation repeated text without adding any new text." };
      return { valid: true, text: prefix + suffix, overlap: repeat.length };
    }
  }
  return { valid: false, error: "The continuation did not preserve the requested text boundary." };
}
function instruction(text, retry = false) {
  return (retry ? "The last continuation did not include the exact ending requested. " : "") +
    "Continue the response. Begin by copying this exact ending, including spaces and punctuation, then complete its unfinished word or sentence and the remaining text. Keep normal spacing between words. Do not restart, paraphrase the copied ending, add a heading or wrap the answer in a code fence. Exact ending (JSON-quoted): " + JSON.stringify(anchor(text));
}
module.exports = { anchor, append, instruction };
