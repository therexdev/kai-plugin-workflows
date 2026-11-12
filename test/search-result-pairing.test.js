"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { parseDdgHtml } = require("../plugin/service/lib/websearch");
const { focusedQuery } = require("../plugin/service/workflow-research");
test("search retains the original question and adds bounded section details", () => {
  assert.equal(focusedQuery("How does AI work?", "How does AI work?"), "How does AI work?");
  assert.equal(focusedQuery("How does AI work? Data and training", "How does AI work?"), "How does AI work? data training");
  assert.equal(focusedQuery("How does AI work?"), "How does AI work?");
  assert.ok(focusedQuery("detail ".repeat(100), "How does AI work?").length <= 240);
});
test("search snippets stay with their titles when ads are skipped or a result has no description", () => {
  const html = '<a class="result__a" href="https://duckduckgo.com/y.js?ad_provider=x">Ad</a><a class="result__snippet">Generate images with an advertiser</a>' +
    '<a href="https://openai.com/" class="result__a">OpenAI</a><a class="result__snippet">Research and deployment</a>' +
    '<a class="result__a" href="https://gemini.google.com/">Gemini</a>' +
    '<a class="result__a" href="https://ibm.com/think/topics/artificial-intelligence">IBM AI</a><div class="result__snippet">AI technology explained</div>';
  const result = parseDdgHtml(html);
  assert.deepEqual(result.map(r => [r.title, r.snippet]), [["OpenAI", "Research and deployment"], ["Gemini", ""], ["IBM AI", "AI technology explained"]]);
});
