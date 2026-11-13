"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), Model = require("../plugin/workflow-model");
const { CompanionStore, CompanionError } = require("../plugin/service/companion-store"), { CompanionWorkflows } = require("../plugin/service/companion-workflows");
const { research, focusedQuery } = require("../plugin/service/workflow-research"), { manage } = require("../plugin/service/manage");
const document = JSON.parse(fs.readFileSync(path.join(__dirname, "../examples/researched-article.workflow.json"), "utf8"));
const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
const rss = (title, url, snippet = title) => '<rss><channel><item><title>' + title + '</title><link>' + url + '</link><description>' + snippet + '</description></item></channel></rss>';
const page = text => new Response('<html><title>' + text + '</title><p>' + (text + '. ').repeat(100) + '</p></html>', { headers: { "content-type": "text/html" } });
async function settled(engine, id) {
  for (let i = 0; i < 1000; i++) { const run = engine.get(id); if (!engine.active.has(id) && ["completed", "failed", "waiting"].includes(run.status)) return run; await new Promise(r => setTimeout(r, 5)); }
  throw Error("Run did not settle");
}
function legacyArticle() {
  const spec = structuredClone(document.workflow);
  for (const n of spec.graph.nodes.filter(n => n.type === "agent")) n.config.timeoutSeconds = 180;
  for (const n of spec.graph.nodes.filter(n => n.type === "web_research")) { delete n.config.topic; if (n.id === "section_sources") n.config.query = "{{item.search_query}}"; }
  return spec;
}

test("section research excludes the reported DOES/grammar results and tries the next provider", async () => {
  const visited = [];
  const result = await research("How does AI work? The Foundation: Data and Model Training", { topic: "How does AI work?", privacyMode: () => "network", lookup, fetchImpl: async url => {
    visited.push(url);
    if (url.includes("duckduckgo.com")) return new Response('<a class="result__a" href="https://does.dc.gov/">Department of Employment Services | does</a><a class="result__a" href="https://eslteacher.org/do-vs-does/">Do vs Does in English</a>');
    if (url.includes("bing.com")) return new Response(rss("AI model training", "https://evidence.example/ai"));
    if (url === "https://evidence.example/ai") return page("AI model training uses data");
    throw Error("Unexpected destination " + url);
  } });
  assert.equal(result.provider, "bing"); assert.equal(result.sources.length, 1); assert.equal(result.sources[0].read, true);
  assert.equal(result.searches[0].rejected, 2); assert.ok(!visited.some(u => /does.dc.gov|eslteacher.org/.test(u)));
  assert.match(result.searches[0].query, /^How does AI work\?/);
  assert.ok(focusedQuery("long instructions ".repeat(40), "How does AI work?").length <= 240);
});

test("an irrelevant fetched page is excluded and the shorter topic query recovers evidence", async () => {
  const searches = [];
  const result = await research("How does AI work? Training datasets", { topic: "How does AI work?", privacyMode: () => "network", lookup, fetchImpl: async url => {
    if (url.includes("duckduckgo.com")) return new Response("");
    if (url.includes("bing.com")) { const q = new URL(url).searchParams.get("q"); searches.push(q); return new Response(rss("AI training", "https://evidence.example/" + (q === "How does AI work?" ? "correct" : "irrelevant"))); }
    if (url.endsWith("/irrelevant")) return page("Do versus does English grammar");
    if (url.endsWith("/correct")) return page("AI learns patterns from data");
    throw Error("Unexpected destination");
  } });
  assert.equal(searches.length, 2); assert.equal(searches[1], "How does AI work?");
  assert.equal(result.sources.length, 1); assert.ok(result.sources[0].url.endsWith("/correct"));
  assert.equal(result.searches[0].rejected, 1);
});

test("research fails explicitly when every source is unrelated instead of handing it to an agent", async () => {
  await assert.rejects(research("AI model training", { topic: "AI", privacyMode: () => "network", lookup, fetchImpl: async url => {
    if (url.includes("duckduckgo.com")) return new Response("");
    if (url.includes("bing.com")) return new Response(rss("AI training", "https://evidence.example/wrong"));
    return page("Department of Employment Services");
  } }), /No readable sources matching the topic/);
});

test("article reliability migration preserves custom model order, timeouts, queries and historical runs", t => {
  const f = fixture(t, "kai.workflows"), store = new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets });
  const spec = legacyArticle(), agent = spec.graph.nodes.find(n => n.id === "section_writer");
  agent.config.timeoutSeconds = 240; agent.config.model = "custom-model"; agent.config.fallbackModels = [{ model: "backup", modelSource: "both", modelPreference: "local" }];
  const originalAgent = structuredClone(agent);
  const search = spec.graph.nodes.find(n => n.id === "topic_sources"); search.config.query = "Custom query";
  const run = { id: "history", status: "failed", spec: structuredClone(spec), steps: [] };
  store.change(d => { d.workflows = [{ ...spec, id: "old", revision: 5 }]; d.runs = [run]; });
  const reopened = new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets });
  const upgraded = reopened.data.workflows[0];
  assert.equal(upgraded.revision, 6); assert.deepEqual(upgraded.graph.nodes.find(n => n.id === agent.id), originalAgent);
  assert.equal(upgraded.graph.nodes.find(n => n.id === "section_researcher").config.timeoutSeconds, 600);
  assert.equal(upgraded.graph.nodes.find(n => n.id === "topic_sources").config.query, "Custom query");
  assert.deepEqual(reopened.data.runs[0], run); assert.equal(Model.migrateReliability(upgraded), false);
});

test("retry resumes the second section, refreshes evidence and keeps the first section and outline", async t => {
  const f = fixture(t, "kai.workflows"), store = new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets });
  let fail = true, calls = [], reads = 0;
  const engine = new CompanionWorkflows({ store, connections: { list: () => [] }, models: () => [], canReviewNetwork: () => true, privacyMode: () => "network", lookup,
    fetchImpl: async url => { if (url.includes("duckduckgo.com")) return new Response(""); if (url.includes("bing.com")) return new Response(rss("AI data and training", "https://evidence.example/ai")); reads++; return page("AI data and training evidence"); },
    runLocal: async o => {
      const stage = o.prompt.match(/STAGE: (\w+)/)[1]; calls.push(stage);
      if (stage === "TOPIC_DISCOVERY") return "AI training uses data and evaluation.";
      if (stage === "OUTLINE") return JSON.stringify({ title: "How AI works", sections: Array.from({ length: 5 }, (_, i) => ({ heading: "AI section " + i, points: ["Explain training", "Explain limitations"] })) });
      if (stage === "SECTION_RESEARCH") { const s = JSON.parse(o.prompt.match(/Assigned section: (.+)/)[1]); if (s.id === 2 && fail) { fail = false; throw new CompanionError("The network reply timed out after 180 seconds. Completed parts are saved in Model results."); } assert.equal(o.timeoutSeconds, 600); return "AI evidence supports this section."; }
      const s = JSON.parse(o.prompt.match(/Assigned heading, word budget and requirements: (.+)/)[1]); return Array(s.word_count).fill("Evidence").join(" ") + " [S" + s.id + "-1]";
    } }); t.after(() => engine.stop());
  const saved = engine.save(document.workflow), id = engine.begin(saved.id, { topic: "How does AI work?", word_count: 800 });
  const failed = await settled(engine, id); assert.equal(failed.status, "failed"); assert.match(failed.error, /180 seconds/); assert.equal(reads, 3);
  assert.equal(Model.canRetryRun(failed), true);
  const firstSection = structuredClone(failed.frames["root/sections/0/loop0"]), previousSteps = structuredClone(failed.steps);
  // Recreate the actual old saved run. Explicit retry upgrades only the known defaults.
  const old = structuredClone(failed.spec);
  for (const n of old.graph.nodes.filter(n => n.type === "agent")) n.config.timeoutSeconds = 180;
  for (const n of old.graph.nodes.filter(n => n.type === "web_research")) { delete n.config.topic; if (n.id === "section_sources") n.config.query = "{{item.search_query}}"; }
  engine.patch(id, r => { r.spec.graph = old.graph; for (const frame of Object.values(r.frames)) for (const n of frame.graph.nodes) n.config = structuredClone(old.graph.nodes.find(x => x.id === n.id).config); });
  const service = { store, workflows: engine }, context = { signal: new AbortController().signal, confirm: async () => false };
  assert.equal(await manage(service, context, "retryRun", { id }), false); assert.equal(engine.get(id).status, "failed"); assert.equal(calls.length, 5);
  const prepared = engine.retryPlan(id); assert.deepEqual(prepared.refreshed, ["Read sources for this section"]);
  engine.patch(id, r => { r.finishedAt++; }); assert.throws(() => engine.retry(id, prepared.fingerprint), /changed during review/);
  context.confirm = async (title, detail) => { assert.equal(title, "Retry failed work?"); assert.match(detail.message, /additional credits/); return true; };
  const response = await manage(service, context, "retryRun", { id }); assert.equal(response.id, id);
  assert.throws(() => engine.retryPlan(id), /cannot safely retry/);
  const completed = await settled(engine, id); assert.equal(completed.status, "completed", completed.error + JSON.stringify(completed.steps.slice(-3).map(s => ({ label: s.label, status: s.status, error: s.error }))));
  assert.equal(calls.filter(s => s === "TOPIC_DISCOVERY").length, 1); assert.equal(calls.filter(s => s === "OUTLINE").length, 1);
  assert.equal(calls.filter(s => s === "SECTION_WRITING").length, 5); assert.equal(calls.filter(s => s === "SECTION_RESEARCH").length, 6);
  assert.equal(reads, 7); assert.deepEqual(completed.steps.slice(0, previousSteps.length), previousSteps);
  assert.deepEqual(completed.frames["root/sections/0/loop0"].states, firstSection.states);
  assert.match(completed.output[0].text, /Actual body words: 800/); assert.equal(completed.retryHistory.length, 1);
  assert.equal(completed.retryHistory[0].previousSpec.graph.nodes.find(n => n.type === "agent").config.timeoutSeconds, 180);
});

test("retry is unavailable for failed writes, uncertain work, or live sibling branches", () => {
  const make = type => ({ status: "failed", spec: { graph: {} }, frames: { root: { graph: { nodes: [{ id: "x", type }] }, states: { x: { status: "failed" } } } } });
  for (const type of ["http_request", "tool_call", "memory", "code"]) assert.equal(Model.canRetryRun(make(type)), false);
  const run = make("agent"); run.inFlight = {}; assert.equal(Model.canRetryRun(run), false); delete run.inFlight;
  run.frames.root.states.other = { status: "running" }; assert.equal(Model.canRetryRun(run), false);
});

test("retry keeps completed per-item answers and does not replay a preceding external write", async t => {
  const f = fixture(t, "kai.workflows"), store = new CompanionStore({ dataDir: f.root, safeStorage: f.api.secrets });
  let writes = 0, fail = true; const calls = [];
  const connection = { id: "app", enabled: true, allowSync: true, operations: [{ id: "create", method: "POST" }] };
  store.change(d => { d.connections = [connection]; });
  const engine = new CompanionWorkflows({ store, connections: { list: () => [connection], prepare: async () => ({ method: "POST", url: "https://app.example/record" }), execute: async () => { writes++; return "Created"; } },
    models: () => [], canReviewNetwork: () => true, privacyMode: () => "network", runLocal: async ({ prompt }) => { const item = prompt.match(/Item: (\d)/)[1]; calls.push(item); if (item === "2" && fail) { fail = false; throw new CompanionError("Network timeout"); } return "Answer " + item; } }); t.after(() => engine.stop());
  const n = Model.node, e = Model.edge;
  const saved = engine.save({ name: "Per-item recovery", model: "koinos-network:test", graph: { version: 2, nodes: [n("trigger", "start"), n("tool_call", "write", null, { connectionId: "app", operationId: "create" }), n("code", "items", null, { source: "return [{value:1},{value:2},{value:3}];" }), n("agent", "agent", null, { prompt: "Item: {{item.value}}", execution: "per_item" })], edges: [e("start", "write"), e("write", "items"), e("items", "agent")] } });
  const id = engine.begin(saved.id, "Start"); assert.equal((await settled(engine, id)).status, "waiting");
  engine.resume(id); const failed = await settled(engine, id); assert.equal(failed.status, "failed"); assert.equal(writes, 1);
  assert.equal(failed.frames.root.states.agent.cursor, 1); assert.deepEqual(calls, ["1", "2"]);
  const plan = engine.retryPlan(id); assert.deepEqual(plan.refreshed, []); engine.retry(id, plan.fingerprint);
  const completed = await settled(engine, id); assert.equal(completed.status, "completed", completed.error);
  assert.equal(writes, 1); assert.deepEqual(calls, ["1", "2", "2", "3"]);
  assert.deepEqual(completed.output.map(v => v.text), ["Answer 1", "Answer 2", "Answer 3"]);
});
test("empty question results fall back to topic terms without replacing the original query",async()=>{
 const queries=[];
 const result=await research("How does AI work?",{topic:"How does AI work?",privacyMode:()=>"network",lookup:async()=>[{address:"8.8.8.8",family:4}],fetchImpl:async url=>{
  const u=new URL(url),q=u.searchParams.get("q")||u.searchParams.get("search");if(q)queries.push(q);
  if(url.includes("bing.com")&&q==="ai")return new Response('<rss><channel><item><title>AI training explained</title><link>https://evidence.example/ai</link><description>AI training evidence</description></item></channel></rss>');
  if(url.includes("wikipedia.org"))return Response.json([q,[],[],[]]);
  if(url.includes("evidence.example"))return new Response('<html><title>AI training</title><p>AI learns from examples. '+"AI training uses data. ".repeat(50)+"</p></html>",{headers:{"content-type":"text/html"}});
  return new Response("<html></html>");
 }});
 assert.equal(queries[0],"How does AI work?");assert.equal(result.searches.at(-1).query,"ai");assert.equal(result.sources[0].read,true);
});
test("provided reference pages use normal public-target and topic checks before becoming evidence",async()=>{
 const seen=[];
 const result=await research("AI training",{topic:"AI training",sourceUrls:["http://127.0.0.1/private","https://evidence.example/ai"],maxPages:1,privacyMode:()=>"network",lookup:async()=>[{address:"8.8.8.8",family:4}],fetchImpl:async url=>{seen.push(url);return new Response('<html><title>AI training</title><p>'+"AI training uses data and examples. ".repeat(50)+"</p></html>",{headers:{"content-type":"text/html"}});}});
 assert.deepEqual(seen,["https://evidence.example/ai"]);assert.equal(result.provider,"provided");assert.equal(result.sources[0].provided,true);assert.equal(result.sources[0].read,true);
});

test("research retains verified evidence when a different page exhausts the time budget",async()=>{
 const result=await research("AI training",{topic:"AI training",timeoutMs:100,maxPages:3,privacyMode:()=>"network",lookup,fetchImpl:async(url,{signal}={})=>{
  if(url.includes("duckduckgo.com"))return new Response('<a class="result__a" href="https://evidence.example/fast">AI training</a><a class="result__a" href="https://evidence.example/slow">AI training delays</a>');
  if(url.endsWith("/fast"))return page("AI training uses data");
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(page("AI training late")),1000);signal.addEventListener("abort",()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});
 }});
 assert.equal(result.sources.filter(s=>s.read).length,1);assert.equal(result.sources[0].url,"https://evidence.example/fast");assert.match(result.note,/time limit/);
});

test("research deadline without evidence is specific and cancellation never releases partial results",async()=>{
 const options={topic:"AI training",timeoutMs:60,privacyMode:()=>"network",lookup,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(new Response("")),1000);signal.addEventListener("abort",()=>{clearTimeout(timer);reject(signal.reason);},{once:true});})};
 await assert.rejects(research("AI training",options),/Web research reached its time limit/);
 const stop=new AbortController();stop.abort(new Error("User cancelled"));
 await assert.rejects(research("AI training",{...options,signal:stop.signal}),/User cancelled/);
});

test("provided sources are ranked across all URLs and late conditional paragraphs remain intact",async()=>{
 const qualification="This assistance excludes criminal cases. An exception must be checked directly with the provider.";
 const visited=[];
 const result=await research("Hiring an attorney costs legal aid eligibility",{topic:"Hiring an attorney",sourceUrls:Array.from({length:4},(_,i)=>"https://evidence.example/"+i),maxPages:1,privacyMode:()=>"network",lookup,fetchImpl:async url=>{
  visited.push(url);
  const late=url.endsWith('/3')?'<p>Legal aid costs and eligibility depend on the program and income.</p><p>'+qualification+'</p>':'';
  return new Response('<html><title>Hiring an attorney</title>'+Array.from({length:35},(_,i)=>'<p>Hiring an attorney requires careful preparation. General introduction '+i+'.</p>').join('')+late+'</html>',{headers:{'content-type':'text/html'}});
 }});
 assert.equal(visited.length,4);assert.equal(result.sources.length,1);assert.equal(result.sources[0].url,'https://evidence.example/3');
 assert.match(result.sources[0].text,/Legal aid costs and eligibility/);assert.ok(result.sources[0].text.includes(qualification));assert.ok(result.sources[0].text.length<=2200);
});
test("passage selection keeps long paragraphs useful and never cuts a sentence into evidence",()=>{
 const {selectPassages}=require('../plugin/service/workflow-research');
 const text='AI training learns from data. '+('Examples illustrate how AI learns. '.repeat(100));
 const excerpt=selectPassages('AI evidence\n\n'+text,'AI training','AI');
 assert.match(excerpt,/AI training learns from data\./);assert.ok(excerpt.length<=2200);assert.ok(excerpt.endsWith('.'));
 assert.equal(selectPassages('x'.repeat(2400),'x',''), '');
});
