"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{fixture}=require("./helper"),{createInference}=require("../plugin/service/workflow-inference"),{CompanionStore}=require("../plugin/service/companion-store"),{CompanionWorkflows}=require("../plugin/service/companion-workflows"),Transfer=require("../plugin/service/workflow-transfer");
const source=fs.readFileSync(path.join(__dirname,"../examples/aio-article.workflow.json"),"utf8");
const lookup=async()=>[{address:"8.8.8.8",family:4}];
function web(url){if(url.includes("duckduckgo.com"))return new Response("<html></html>");if(url.includes("bing.com"))return new Response('<rss><channel><item><title>AI evidence</title><link>https://evidence.example/report</link><description>AI training evidence</description></item></channel></rss>');return new Response('<html><title>AI evidence</title><p>AI training learns from data. '+"Examples illustrate how AI learns. ".repeat(80)+"</p></html>",{headers:{"content-type":"text/html"}});}
for(const stuck of [false,true])test(stuck?"bounded reviews preserve unresolved drafts without approving them":"AIO workflow repairs missing citations, rechecks and derives schema from final FAQ",async t=>{
 const f=fixture(t,"kai.workflows"),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),calls=[];
 f.api.network.models=async()=>["qwen25-14b","gemma3-12b","phi-4"].map(model=>({model,available:true,maxOutput:256}));
 f.api.wallet={complete:async request=>{
  assert(Buffer.byteLength(JSON.stringify(request.messages))<=24000,"Never silently truncate a model packet");
  const p=request.messages[1].content;assert.doesNotMatch(p,/\{\{(?:item|nodes)\b/,"Every prompt reference must be resolved");const stage=p.match(/STAGE: (\w+)/)[1];calls.push(stage);let content;
  const packet=()=>p.includes("Packet: ")?JSON.parse(p.match(/Packet: (.+)/)[1]):({artifact:p.match(/Artifact: (.+)/)[1],context:JSON.parse(p.match(/Context: (.+)/)[1])});
  if(stage==="AIO_RESEARCH")content=JSON.stringify({intent:"Explain AI",facts:["AI learns from data. [S0-1]","Training identifies patterns. [S0-1]"],gaps:"Limited evidence.",angle:"Training versus inference"});
  else if(stage==="AIO_OUTLINE"||stage==="OUTLINE_REVIEW_REVISE"){
   const task=JSON.parse(p.match(/Task: (.+)/)[1]);
   content=JSON.stringify({lines:task.key==="meta"?["Understanding how artificial intelligence works","Explain training versus inference",...Array.from({length:task.count-2},(_,i)=>"AI topic "+(i+1))]:["Explain the evidence","Give a useful example"]});
  }
  else if(stage==="AIO_COACH")content=JSON.stringify({focus:"Explain training simply",facts:["Models learn from data."],gaps:"Limited evidence."});
  else if(stage==="AIO_WRITE"){const a=JSON.parse(p.match(/Assignment and readable evidence: (.+)/)[1]);content=Array(a.section.word_count).fill("Evidence").join(" ");}
  else if(stage.endsWith("_REVIEW")){
   let needs=false;if(stage==="SECTION_REVIEW_REVIEW"){const a=packet();needs=stuck||!a.artifact.includes("[S");}
   const advisory=stage==="OUTLINE_REVIEW_REVIEW"; content=JSON.stringify({verdict:needs||advisory?"CHANGE_REQUEST":"PASS",...(stage==="SECTION_REVIEW_REVIEW"?{summary:"AI learns patterns from training data. ["+packet().context.sources[0].id+"]"}:{}),items:needs?[{id:"citation-1",severity:"error",location:"section",evidence:"No citation",fix:"Cite supporting source [S1-1] with the section's actual ID."}]:advisory?[{id:"style-note",severity:"warning",location:"outline",evidence:"Style preference",fix:"Consider shorter headings."}]:[]});
  }
  else if(stage==="SECTION_REVIEW_REVISE"){const a=packet();content=a.artifact.replace(/\s*\[S\d+-\d+\]/g,"")+" ("+a.context.sources[0].id+")";}
  else if(stage==="AIO_EXTRAS"||stage==="EXTRAS_REVIEW_REVISE"){
   const task=JSON.parse(p.match(/Task: (.+)/)[1]),lines={meta:["Understanding how artificial intelligence works","An introduction to how artificial intelligence learns patterns from data, produces useful results, and encounters limitations.","Learn how AI works."],answer:["AI learns patterns from data and uses those patterns to produce results. [S1-1]"],takeaways:["Models learn from data.","Training identifies patterns.","Models have limitations."],faq:["How does AI work "+task.index+"?","AI learns patterns from data. (S1-1)"]}[task.key];
   content=JSON.stringify({lines});
  }
  if(stage==="AIO_OUTLINE"||stage==="AIO_EXTRAS")assert(content.length<900,"Structured requests stay small enough for short provider replies");
  assert.ok(content,"Unexpected stage: "+stage);return{choices:[{message:{content},finish_reason:"stop"}],usage:{completion_tokens:100},koin:{state:"charged"}};
 },authorize:async()=>{}};
 const inference=createInference(f.api,(part,id)=>store.change(d=>(d.runs.find(r=>r.id===id).networkCalls||=[]).push(part)));
 const engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=>"network",lookup,fetchImpl:web});t.after(()=>engine.stop());
 if(process.env.KAI_QA_DEBUG){const old=engine.logStart.bind(engine);engine.logStart=(...a)=>{console.log("step",a[3].id);return old(...a);};}
 const doc=Transfer.parseDocument(source),saved=engine.save(doc);const id=engine.begin(saved.id,{topic:"How does AI work?",word_count:stuck?200:2000});
 let r;for(let i=0;i<6000;i++){r=engine.get(id);if(process.env.KAI_QA_DEBUG && i%100===0)console.log(r.status,r.steps.at(-1)?.label,r.steps.at(-1)?.status,r.error);if(["completed","failed","waiting"].includes(r.status))break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(r.status,"completed",r.error);
 const result=r.frames.root.states.result.outputs.main[0],sections=r.frames.root.states.plan.outputs.main[0].sections;
 assert.equal(calls.filter(s=>s==="AIO_OUTLINE").length,sections.length+1);assert.equal(calls.filter(s=>s==="AIO_EXTRAS").length,7);
 assert.equal(result.counts.length,sections.length);assert.equal(result.counts.reduce((s,x)=>s+x.target,0),stuck?200:2000);
 assert.equal(result.status,stuck?"Needs review":"Passed configured checks");
 assert.equal(calls.filter(s=>s==="SECTION_REVIEW_REVISE").length,sections.length*(stuck?2:1));
 assert.equal(calls.filter(s=>s==="SECTION_REVIEW_REVIEW").length,sections.length*(stuck?2:1));
 assert.deepEqual(result.visibleFAQ,result.schema.mainEntity.map(q=>({question:q.name,answer:q.acceptedAnswer.text})));
 for(const c of result.counts)assert.equal(c.target,c.actual);
 assert.equal(result.reviews[1].history[0].issues.some(x=>x.code==="citations-missing"),true);
 assert.equal(result.reviews[1].history.at(-1).issues.some(x=>x.code==="citations-missing"),false);
 assert.equal(result.quality.valid,true);assert.equal(calls.includes("OUTLINE_REVIEW_REVISE"),false,"Advisory-only reviews do not consume revision credits");
});
test("article citation formatting keeps unknown IDs visible to validation",async()=>{
 const graph=Transfer.parseDocument(source).graph,n=graph.nodes.find(n=>n.id==='draft_packet'),V=require('../plugin/service/workflow-values'),Quality=require('../plugin/workflow-quality');
 const evidence={sources:[{id:'S1-1'},{id:'S1-2'}],settings:{revision_limit:2}};
 const packet=(await V.evaluate(n.config.source,{item:{text:'Supported claim (S1-1, S1-2). Unknown claim (S1-99).'},nodes:{evidence,coach:{text:'Use evidence.'}}},new AbortController().signal,false))[0];
 assert.equal(packet.artifact,'Supported claim [S1-1,S1-2]. Unknown claim [S1-99].');
 const result=Quality.inspect(packet.artifact,[{type:'citations',sources:evidence.sources,min:1}]);
 assert.equal(result.valid,false);assert(result.issues.some(i=>i.code==='citations-unknown'));
});

test("outline and extras revisions regenerate small parts and recheck their assembled schemas", async t=>{
 for(const kind of ["outline","extras"]){
  const f=fixture(t,"kai.workflows"),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),prefix=kind+"_review",calls=[];
  const full=Transfer.parseDocument(source),nodes=full.graph.nodes.filter(n=>n.id.startsWith(prefix)),ids=new Set(nodes.map(n=>n.id));
  const M=require('../plugin/workflow-model');nodes.push(M.node('trigger','start'),M.node('output','out',undefined,{text:'{{previous}}'}));
  const edges=full.graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));edges.push(M.edge('start',prefix),M.edge(prefix,'out','done'));
  const context={topic:'Explain AI',settings:{},section_count:9,budgets:Array(9).fill(200),article:[],sources:[]};
  const artifact=kind==='outline'?{title:'x'.repeat(101),angle:'Evidence',sections:Array.from({length:9},(_,i)=>({heading:'Section '+(i===1?0:i),points:['First requirement','Second requirement']}))}:{title:'x'.repeat(101),meta_description:'An evidence-based description',social:'Read the article.',direct_answer:'An evidence-based answer.',takeaways:['One','Two','Three'],faq:Array.from({length:4},(_,i)=>({question:'Question '+i+'?',answer:'Answer '+i+'.'}))};
  f.api.network.models=async()=>[{model:'gemma3-12b',available:true,maxOutput:256}];
  f.api.wallet={authorize:async()=>{},complete:async request=>{
   const p=request.messages[1].content;assert.doesNotMatch(p,/\{\{(?:item|nodes)\b/);const stage=p.match(/STAGE: (\w+)/)[1];calls.push(stage);
   let value;if(stage.endsWith('_REVISE')){const task=JSON.parse(p.match(/Task: (.+)/)[1]);assert(task.count<=11);const lines=task.existing.slice();if(task.key==='meta'){lines[0]='A clear evidence-based article title';if(kind==='outline')for(let i=2;i<lines.length;i++)lines[i]='Section '+(i-2);}value={lines};}else value={verdict:'PASS',items:[]};
   return {choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}],usage:{completion_tokens:150},koin:{state:'charged'}};
  }};
  const inference=createInference(f.api,async()=>{}),engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=>"network"});
  t.after(()=>engine.stop());const w=engine.save({...full,graph:{version:2,nodes,edges}}),id=engine.begin(w.id,{artifact,context,cycle:0,limit:2,prior:[],history:[],reviewed:false});
  let run;for(let i=0;i<6000;i++){run=engine.get(id);if(run.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(run.status,'completed',run.error);const final=run.frames.root.states[prefix].outputs.done[0];assert.equal(final.status,'Passed checks');assert.equal(final.cycle,1);assert.equal(final.artifact.title,'A clear evidence-based article title');assert.equal(calls.filter(s=>s.endsWith('_REVISE')).length,kind==='outline'?10:7);assert.equal(calls.filter(s=>s.endsWith('_REVIEW')).length,1);
 }
});
