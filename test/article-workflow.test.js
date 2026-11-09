"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helper"), { createInference } = require("../plugin/service/workflow-inference");
const { CompanionStore } = require("../plugin/service/companion-store"), { CompanionWorkflows } = require("../plugin/service/companion-workflows");
const { research } = require("../plugin/service/workflow-research"), { choose } = require("../plugin/service/workflow-routing");
const Transfer = require("../plugin/service/workflow-transfer"), V = require("../plugin/service/workflow-values");
const source = fs.readFileSync(path.join(__dirname,"../examples/researched-article.workflow.json"),"utf8");
const lookup = async () => [{ address:"8.8.8.8",family:4 }];
function webMock(url) {
  if (url.includes("duckduckgo.com")) return new Response("<html></html>");
  if (url.includes("bing.com")) return new Response('<rss><channel><item><title>Original research</title><link>https://evidence.example/report</link><description>A report</description></item></channel></rss>');
  if (url === "https://evidence.example/report") return new Response("<html><title>Original research</title><p>Evidence about the requested topic. "+"Source facts and examples. ".repeat(100)+"</p></html>",{headers:{"content-type":"text/html"}});
  throw Error("Unexpected egress: "+url);
}
test("auto routing uses live readiness and distinct task preferences, never local models", () => {
  const rows = ["qwen25-32b","mistral-small-24b","phi-4"].map(id=>({alias:"koinos-network:"+id,status:"ready",maxOutput:256}));
  assert.equal(choose(rows,"koinos-network:auto-research").alias,"koinos-network:qwen25-32b");
  assert.equal(choose(rows,"koinos-network:auto-writing").alias,"koinos-network:mistral-small-24b");
  rows[0].status="unavailable";
  assert.equal(choose(rows,"koinos-network:auto-outline").alias,"koinos-network:phi-4");
  assert.throws(()=>choose([],"koinos-network:auto-research"),/online/);
});
test("network continuations respect the provider cap, review each part and retain the actual model", async t => {
  const f=fixture(t,"kai.workflows"), saved=[], requests=[];
  f.api.network.models=async()=>[{model:"qwen25-32b",available:true,maxOutput:8}];
  f.api.wallet={authorize:async(action,request)=>{
    if(action==="chat-estimate")return{model:"qwen25-32b",unit:"USD-1e-8",allowed:true,maxCharge:"0",maxFree:"0",maxPaid:"0"};
    if(action==="chat-completion"){requests.push(request);return{choices:[{message:{content:requests.length===1?'{"ok":':'true}'},finish_reason:requests.length===1?"length":"stop"}],usage:{completion_tokens:8}};}
  }};
  const inference=createInference(f.api,r=>saved.push(r));
  const answer=await inference.run({model:"koinos-network:auto-outline",prompt:"Return JSON",maxTokens:24,maxContinuations:2});
  assert.deepEqual(JSON.parse(answer),{ok:true}); assert.equal(f.confirmations.length,2);
  assert.ok(requests.every(r=>r.model==="koinos-network:qwen25-32b"&&r.max_tokens===8));
  assert.equal(requests[1].messages.at(-2).content,'{"ok":'); assert.equal(saved[1].requestedModel,"koinos-network:auto-outline");
});
test("web research reads real page bodies, distinguishes unreadable pages and blocks private destinations", async () => {
  let calls=0; const options={privacyMode:()=>"network",lookup,fetchImpl:async(...args)=>{calls++;return webMock(...args);}};
  const result=await research("article topic",options);
  assert.equal(result.sources[0].read,true); assert.match(result.sources[0].text,/Source facts/); assert.equal(result.provider,"bing");
  const before=calls;
  await assert.rejects(research("topic",{...options,privacyMode:()=>"local-only"}),/Local-Only/); assert.equal(calls,before);
  await assert.rejects(research("topic",{...options,lookup:async()=>[{address:"127.0.0.1",family:4}]}),/No readable/); assert.equal(calls,before);
  await assert.rejects(research("topic",{...options,fetchImpl:async url=>url.includes("evidence.example")?new Response("Forbidden",{status:403}):webMock(url)}),/No readable/);
  const c=new AbortController();c.abort();await assert.rejects(research("topic",{...options,signal:c.signal}),/abort/i);
});
test("article import runs two section agents in order, preserves all sections and exact budget totals at 5000 words", async t => {
  const f=fixture(t,"kai.workflows"),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}), stages=[], models=[];
  f.api.network.models=async()=>[{model:"qwen25-32b",available:true,maxOutput:4096},{model:"mistral-small-24b",available:true,maxOutput:4096}];
  f.api.wallet={authorize:async(action,request)=>{
    if(action==="chat-estimate")return{model:request.model.slice(15),unit:"USD-1e-8",allowed:true,maxCharge:"0",maxFree:"0",maxPaid:"0"};
    if(action!=="chat-completion")return{};
    const p=request.messages[1].content,stage=p.match(/STAGE: (\w+)/)[1]; stages.push(stage);models.push(request.model);
    let content;
    if(stage==="TOPIC_DISCOVERY")content="Relevant topics: origins, evidence, methods, examples, limits. https://evidence.example/report";
    if(stage==="OUTLINE"){const n=Number(p.match(/Create exactly (\d+) sections/)[1]);content=JSON.stringify({title:"Example article",sections:Array.from({length:n},(_,i)=>({heading:"Section "+(i+1),points:["Explain the evidence","Give an example"]}))});}
    if(stage==="SECTION_RESEARCH")content="The source supports this section. Explain the evidence and give an example.";
    if(stage==="SECTION_WRITING"){const s=JSON.parse(p.match(/Assigned heading, word budget and requirements: (.+)/)[1]);content=Array(s.word_count).fill("Evidence").join(" ")+" [S"+s.id+"-1]";}
    assert.ok(content,stage);return{choices:[{message:{content},finish_reason:"stop"}]};
  }};
  const inference=createInference(f.api,(result,id)=>store.change(d=>(d.runs.find(r=>r.id===id).networkCalls||=[]).push(result)));
  const engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=>"network",lookup,fetchImpl:webMock});t.after(()=>engine.stop());
  const imported=Transfer.parseDocument(source),draft=engine.save(imported,{draft:true});
  assert.equal(draft.enabled,false); assert.equal(stages.length,0);
  const saved=engine.save(draft);assert.deepEqual(engine.validate(saved).errors,[]);
  const id=engine.begin(saved.id,{topic:"A topic with evidence",word_count:5000});
  let r;for(let i=0;i<1500;i++){r=engine.get(id);if(["completed","failed","waiting"].includes(r.status))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(r.status,"completed",r.error);
  const sectionCount=r.frames.root.states.plan.outputs.main[0].sections.length;
  assert.equal(stages.length,2+2*sectionCount);assert.deepEqual(stages.slice(0,2),["TOPIC_DISCOVERY","OUTLINE"]);
  for(let i=2;i<stages.length;i+=2)assert.deepEqual(stages.slice(i,i+2),["SECTION_RESEARCH","SECTION_WRITING"]);
  assert.equal(models[0],"koinos-network:qwen25-32b");assert.equal(models.at(-1),"koinos-network:mistral-small-24b");
  const state=r.frames.root.states.sections.outputs.done[0];
  assert.equal(state.counts.reduce((n,s)=>n+s.target,0),5000);assert.equal(state.counts.reduce((n,s)=>n+s.actual,0),5000);
  assert.equal(state.counts.length,sectionCount);assert.match(r.output[0].text,/Actual body words: 5000/);
  assert.ok(r.output[0].text.length>32000);assert.match(r.output[0].text,new RegExp("## Section "+sectionCount));
});
test("article input and outline shape fail clearly without an extra QA agent", async () => {
  const doc=JSON.parse(source),nodes=doc.workflow.graph.nodes;
  const brief=nodes.find(n=>n.id==="brief").config.source;
  const scope={item:{},items:[],nodes:{},iteration:0,input:{topic:"Test",word_count:199}};
  await assert.rejects(V.evaluate(brief,scope,undefined,false),/200 and 5000/);
  scope.input.word_count=200;const b=(await V.evaluate(brief,scope,undefined,false))[0];assert.equal(b.budgets.reduce((a,b)=>a+b,0),200);
  await assert.rejects(V.evaluate(nodes.find(n=>n.id==="plan").config.source,{...scope,item:{text:'{"title":"x","sections":[]}'},nodes:{brief:b}},undefined,false),/requested number/);
  assert.equal(nodes.filter(n=>n.type==="agent").length,4);assert.ok(!nodes.some(n=>n.type==="approval"));
});
