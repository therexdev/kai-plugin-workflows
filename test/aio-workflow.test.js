"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{fixture}=require("./helper"),{createInference}=require("../plugin/service/workflow-inference"),{CompanionStore}=require("../plugin/service/companion-store"),{CompanionWorkflows}=require("../plugin/service/companion-workflows"),Transfer=require("../plugin/service/workflow-transfer");
const source=fs.readFileSync(path.join(__dirname,"../examples/aio-article.workflow.json"),"utf8");
const lookup=async()=>[{address:"8.8.8.8",family:4}];
test('concise model context preserves complete evidence, conditions and requirements',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values');
 const passage='This service cannot provide legal advice.\n- It cannot change court decisions. '+ 'Complete evidence. '.repeat(120);
 const quote={id:'S1-1',text:passage},section={heading:'Check eligibility',points:['Preserve every condition'],word_count:344};
 const context={topic:'Hiring an attorney',settings:{audience:'Residents',language:'English',style:'Clear',client_facts:['Verified client fact'],banned_phrases:['Guarantee'],source_urls:['https://example.org'],revision_limit:2},section,previous_section:'Earlier supported text',sources:[{id:'S1-1',title:'Referral eligibility',url:'https://example.org',text:passage}],article:[{heading:section.heading,requirements:section.points,status:'Passed checks',summary:'A conditional summary',evidence:[quote,quote]}],source_quotations:[quote,quote]};
 const item={artifact:'Current artifact',context,prior:[{id:'finding'}]};
 const output=(await V.evaluate(graph.nodes.find(n=>n.id==='section_review_prompt_context').config.source,{item},new AbortController().signal,false))[0];
 assert.deepEqual(output.context,context);assert.equal(output.artifact,item.artifact);assert.deepEqual(output.prior,item.prior);
 assert.deepEqual(output.prompt_context.sources,[{id:'S1-1',title:'Referral eligibility',text:passage}]);
 assert.deepEqual(output.prompt_context.section,section);assert.deepEqual(output.prompt_context.source_quotations,[quote]);
 assert.deepEqual(output.prompt_context.settings.client_facts,context.settings.client_facts);
 assert.deepEqual(output.prompt_context.settings.banned_phrases,['Guarantee']);
 assert.equal(output.prompt_context.article[0].evidence,undefined);assert.equal(output.prompt_context.settings.source_urls,undefined);
 assert(JSON.stringify(output.prompt_context).length<JSON.stringify(context).length/2);
});
test('a targeted outline correction preserves unrelated headings and requirements without model calls',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),signal=new AbortController().signal;
 const evaluate=(id,scope)=>V.evaluate(graph.nodes.find(n=>n.id===id).config.source,scope,signal,false);
 const original={title:'Choosing legal help',angle:'A supported decision guide',sections:[{heading:'Find candidates',points:['Use referrals','Check public status']},{heading:'Ask about costs',points:['List unsupported prices','Explain payment terms']},{heading:'Next steps',points:['Arrange a consultation','Review the agreement']}]};
 const context={section_count:3,budgets:[160,344,120],settings:{},sources:[]};
 const prior=[{id:'unsupported',severity:'error',location:'Ask about costs',fix:'Ask about prices instead of inventing them.'}];
 const initial=(await evaluate('outline_review_revise',{item:{artifact:original,context,prior}}))[0];
 assert.equal(initial.tasks.length,1);assert.equal(initial.tasks[0].index,1);
 const assigned=(await evaluate('outline_review_revise_task',{item:initial}))[0];
 assert.equal(assigned.task.heading,'Ask about costs');assert.deepEqual(assigned.task.existing,original.sections[1].points);
 const revised=['Ask how fees are calculated','Request the applicable payment terms'];
 const collected=(await evaluate('outline_review_revise_collect',{item:{json:{lines:revised}},nodes:{outline_review_revise_task:assigned}}))[0];
 const result=(await evaluate('outline_review_revise_done',{item:collected}))[0].json;
 assert.deepEqual(result,{...original,sections:original.sections.map((s,i)=>i===1?{...s,points:revised}:s)});
 for(const location of ['Ask about costs section','Section: ASK ABOUT COSTS','Sections: ASK ABOUT COSTS','sections[1].points[0]','$.sections[1].points','sections[1].points[1]']){
  const targeted=(await evaluate('outline_review_revise',{item:{artifact:original,context,prior:[{...prior[0],location}]}}))[0];assert.deepEqual(targeted.tasks.map(t=>t.index),[1]);
 }
 const duplicatePoint=(await evaluate('outline_review_revise',{item:{artifact:original,context,prior:[{...prior[0],location:'sections[1].points[0]',fix:'Remove duplicate content, keep in section 0.'}]}}))[0];
 assert.deepEqual(duplicatePoint.tasks.map(t=>t.index),[1]);
 for(const finding of [{...prior[0],location:'$'},{...prior[0],fix:'Rename this heading.'},{...prior[0],fix:'Merge duplicate headings.'},...['sections[1].heading','sections[9].points[0]','sections[1].points[9]','sections[1].points[0].unknown'].map(location=>({...prior[0],location}))]){
  const full=(await evaluate('outline_review_revise',{item:{artifact:original,context,prior:[finding]}}))[0];assert.equal(full.tasks.length,4);assert.deepEqual(full.values,[]);
 }
});
test('an unresolved outline delivers its findings without starting paid drafting',async t=>{
 const f=fixture(t,'kai.workflows'),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),M=require('../plugin/workflow-model'),full=Transfer.parseDocument(source),pick=id=>full.graph.nodes.find(n=>n.id===id);let calls=0;
 const engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[{alias:'local-test',status:'ready'}],runLocal:async()=>{calls++;return 'Draft started';}});t.after(()=>engine.stop());
 const graph={version:2,nodes:[M.node('trigger','start'),pick('outline_accepted'),pick('outline_hold'),M.node('agent','draft',undefined,{model:'local-test',prompt:'Draft the article'})],edges:[M.edge('start','outline_accepted'),M.edge('outline_accepted','outline_hold','false'),M.edge('outline_accepted','draft','true')]};
 const saved=engine.save({...full,graph});
 for(const status of ['Needs review','Passed checks']){
  const id=engine.begin(saved.id,{status,artifact:{title:'Saved outline'},prior:[{fix:'Remove the unsupported requirement'}]});let run;for(let i=0;i<100;i++){run=engine.get(id);if(run.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(run.status,'completed',run.error);assert.equal(calls,status==='Needs review'?0:1);
  if(status==='Needs review'){assert.match(run.output[0].text,/Status: Needs review/);assert.match(run.output[0].text,/Remove the unsupported requirement/);assert.equal(run.frames.root.states.draft.status,'skipped');}
 }
});
test('outline factual and editorial findings share the first revision without losing colliding IDs',async t=>{
 const f=fixture(t,'kai.workflows'),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),full=Transfer.parseDocument(source),M=require('../plugin/workflow-model');
 const nodes=full.graph.nodes.filter(n=>n.id.startsWith('outline_review')),ids=new Set(nodes.map(n=>n.id)),calls=[];
 nodes.push(M.node('trigger','start'),M.node('output','out',undefined,{text:'{{previous}}'}));
 const edges=full.graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));edges.push(M.edge('start','outline_review'),M.edge('outline_review','out','done'));
 let revised=false;
 f.api.network.models=async()=>[{model:'gemma3-12b',available:true,maxOutput:256}];
 f.api.wallet={authorize:async()=>{},complete:async request=>{
  const p=request.messages[1].content,stage=p.match(/STAGE: (\w+)/)[1];calls.push(stage);let value;
  if(stage==='OUTLINE_REVIEW_FACTS')value={verdict:revised?'PASS':'CHANGE_REQUEST',items:revised?[]:[{id:'wrong-agency',severity:'error',location:'Check licensing',evidence:'Get a licence from the directory',fix:'Check the licence with the Licensing Board.'}]};
  else if(stage==='OUTLINE_REVIEW_REVISE'){const task=JSON.parse(p.match(/Task: (.+)/)[1]);assert.ok([0,1].includes(task.index));revised=task.index===1;value={lines:task.index===0?['Check the licence with the Licensing Board','Ask about relevant experience']:['Ask which services the fee covers','Request written terms']};}
  else {assert.equal(stage,'OUTLINE_REVIEW_REVIEW');value={verdict:revised?'PASS':'CHANGE_REQUEST',items:revised?[]:[{id:'wrong-agency',severity:'error',location:'Discuss costs',evidence:'Ask about fees',fix:'Ask which services the fee covers.'}]};}
  return {choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}],usage:{completion_tokens:100},koin:{state:'charged'}};
 }};
 const inference=createInference(f.api,async()=>{}),engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=> 'network'});t.after(()=>engine.stop());
 const artifact={title:'Choose a provider',angle:'Check relevant qualifications',sections:[{heading:'Check licensing',points:['Get a licence from the directory','Ask about relevant experience']},{heading:'Discuss costs',points:['Ask about fees','Request written terms']},{heading:'Next steps',points:['Compare the options','Ask remaining questions']}]};
 const context={topic:'Choose a provider',section_count:3,budgets:[100,100,100],settings:{},sources:[{id:'S0-1',text:'The directory lists members. Only the Licensing Board issues licences.'}]};
 const saved=engine.save({...full,graph:{version:2,nodes,edges}}),id=engine.begin(saved.id,{artifact,context,cycle:0,limit:2,prior:[],history:[],reviewed:false});
 let run;for(let i=0;i<6000;i++){run=engine.get(id);if(run.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(run.status,'completed',run.error);const result=run.frames.root.states.outline_review.outputs.done[0];
 assert.equal(result.status,'Passed checks');assert.equal(result.cycle,1);
 assert.deepEqual(result.artifact.sections.slice(2),artifact.sections.slice(2));
 assert.equal(result.artifact.sections[1].points[0],'Ask which services the fee covers');
 assert.deepEqual(result.history[0].issues.map(i=>i.id),['source-wrong-agency','wrong-agency']);
 assert.deepEqual(calls,['OUTLINE_REVIEW_FACTS','OUTLINE_REVIEW_REVIEW','OUTLINE_REVIEW_REVISE','OUTLINE_REVIEW_REVISE','OUTLINE_REVIEW_FACTS','OUTLINE_REVIEW_REVIEW']);
});
test('identical evidence and fix repeat review without rewriting or waiving unresolved findings',async t=>{
 for(const scenario of ['resolves','repeats','blocker']){
  const f=fixture(t,'kai.workflows'),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),full=Transfer.parseDocument(source),M=require('../plugin/workflow-model');
  const nodes=full.graph.nodes.filter(n=>n.id.startsWith('outline_review')),ids=new Set(nodes.map(n=>n.id)),calls=[];
  nodes.push(M.node('trigger','start'),M.node('output','out',undefined,{text:'{{previous}}'}));
  const edges=full.graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));edges.push(M.edge('start','outline_review'),M.edge('outline_review','out','done'));
  let audits=0;const sentence='Review written agreements before hiring.';
  f.api.network.models=async()=>[{model:'gemma3-12b',available:true,maxOutput:256}];
  f.api.wallet={authorize:async()=>{},complete:async request=>{
   const p=request.messages[1].content,stage=p.match(/STAGE: (\w+)/)[1];calls.push(stage);let value;
   if(stage==='OUTLINE_REVIEW_FACTS'){
    const bad=++audits===1||scenario!=='resolves';
    value={verdict:bad?(scenario==='blocker'?'BLOCKER':'CHANGE_REQUEST'):'PASS',items:bad?[{id:'agreement',severity:'error',location:'Next steps',evidence:sentence,fix:sentence}]:[]};
   }else{assert.equal(stage,'OUTLINE_REVIEW_REVIEW','A no-op finding must not spend on artifact revision');value={verdict:'PASS',items:[]};}
   return {choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}],usage:{completion_tokens:80},koin:{state:'charged'}};
  }};
  const inference=createInference(f.api,async()=>{}),engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=> 'network'});t.after(()=>engine.stop());
  const artifact={title:'Choose a provider',angle:'Check evidence',sections:[{heading:'Compare options',points:['Ask about experience','Ask about fees']},{heading:'Next steps',points:[sentence,'Keep a copy']}]};
  const context={topic:'Choose a provider',section_count:2,budgets:[100,100],settings:{},sources:[{id:'S0-1',text:sentence}]};
  const saved=engine.save({...full,graph:{version:2,nodes,edges}}),id=engine.begin(saved.id,{artifact,context,cycle:0,limit:2,prior:[],history:[],reviewed:false});
  let run;for(let i=0;i<6000;i++){run=engine.get(id);if(run.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(run.status,'completed',run.error);const result=run.frames.root.states.outline_review.outputs.done[0];
  assert.deepEqual(result.artifact,artifact);assert.equal(result.status,scenario==='resolves'?'Passed checks':'Needs review');
  assert.equal(audits,scenario==='resolves'?2:3);assert.equal(result.cycle,scenario==='resolves'?1:2);
  assert.equal(result.history[0].repeatReview,true);assert.equal(result.history[0].issues[0].severity,'error');
  if(scenario==='blocker')assert.equal(result.review.verdict,'BLOCKER');
  assert(!calls.some(s=>s.endsWith('_REVISE')));
 }
});
test('optional outline citation toggles stay advisory without waiving factual changes or blockers',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),signal=new AbortController().signal;
 const sentence='Listed providers must carry insurance.',finding={id:'same',severity:'error',location:'Eligibility',evidence:sentence,fix:'Listed providers must carry insurance [S0-1].'};
 const packet={artifact:{title:'Plan'},context:{},cycle:1,limit:2,history:[],checks:{valid:true,issues:[],metrics:[]}};
 const judge=async(items,verdict='CHANGE_REQUEST')=>(await V.evaluate(graph.nodes.find(n=>n.id==='outline_review_judge').config.source,{item:{json:{verdict:'PASS',items:[]}},nodes:{outline_review_checks:packet,outline_review_facts_decision:{json:{verdict,items}}}},signal,false))[0];
 for(const item of [finding,{...finding,evidence:finding.fix,fix:sentence}]){
  const out=await judge([item]);assert.equal(out.status,'Passed checks');assert.equal(out.needsRevision,false);
  assert.equal(out.history[0].issues[0].classification,'outline-citation-format');assert.equal(out.history[0].issues[0].severity,'warning');
  assert.equal(out.history[0].citationOnlyFindings[0].severity,'error');assert.deepEqual(out.artifact,packet.artifact);
 }
 for(const item of [{...finding,fix:'Listed providers need no insurance [S0-1].'},{...finding,evidence:'Cost is 100.',fix:'Cost is 200 [S0-1].'},{...finding,evidence:finding.fix,fix:'Listed providers must carry insurance [S0-2].'},{...finding,fix:sentence}]){
  const out=await judge([item]);assert.equal(out.status,'Needs review');assert.equal(out.history[0].citationOnlyFindings.length,0);
 }
 const real={...finding,id:'guarantee',evidence:'Membership guarantees competence.',fix:'Delete the unsupported guarantee.'};
 const mixed=await judge([finding,real]);assert.equal(mixed.status,'Needs review');assert.equal(mixed.prior.find(i=>i.id==='source-guarantee').severity,'error');
 assert.equal((await judge([{...finding,fix:sentence},real])).repeatReview,false,'Actual factual changes still require a revision');
 assert.equal((await judge([finding],'BLOCKER')).status,'Needs review');
 const section={...packet,artifact:sentence,context:{section:{word_count:160}},checks:{valid:true,issues:[],metrics:[{type:'words',actual:160,min:144,max:176}]}};
 const kept=(await V.evaluate(graph.nodes.find(n=>n.id==='section_review_judge').config.source,{item:{json:{verdict:'CHANGE_REQUEST',items:[finding],summary:''},sourceAudit:true},nodes:{section_review_checks:section}},signal,false))[0];
 assert.equal(kept.status,'Needs review');assert.equal(kept.history[0].citationOnlyFindings.length,0);
 packet.checks.valid=false;packet.checks.issues=[{id:'check-0-0',severity:'error',code:'schema',message:'Required field missing.'}];
 assert.equal((await judge([{...finding,fix:sentence}])).repeatReview,false,'Mechanical errors still require a revision');
});
function web(url){if(url.includes("duckduckgo.com"))return new Response("<html></html>");if(url.includes("bing.com"))return new Response('<rss><channel><item><title>AI evidence</title><link>https://evidence.example/report</link><description>AI training evidence</description></item></channel></rss>');return new Response('<html><title>AI evidence</title><p>AI training learns from data. '+"Examples illustrate how AI learns. ".repeat(80)+"</p></html>",{headers:{"content-type":"text/html"}});}
for(const stuck of [false,true])test(stuck?"bounded reviews preserve unresolved drafts without approving them":"AIO workflow repairs missing citations, rechecks and derives schema from final FAQ",async t=>{
 const f=fixture(t,"kai.workflows"),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),calls=[];
 f.api.network.models=async()=>["qwen25-14b","gemma3-12b","phi-4"].map(model=>({model,available:true,maxOutput:256}));
 f.api.wallet={complete:async request=>{
  assert(Buffer.byteLength(JSON.stringify(request.messages))<=24000,"Never silently truncate a model packet");
  const p=request.messages[1].content;assert.doesNotMatch(p,/\{\{(?:item|nodes)\b/,"Every prompt reference must be resolved");const stage=p.match(/STAGE: (\w+)/)[1];calls.push(stage);let content;
  const packet=()=>p.includes("Packet: ")?JSON.parse(p.match(/Packet: (.+)/)[1]):({artifact:p.match(/Artifact: ([^\n]*)/)[1],context:JSON.parse(p.match(/(?:Context|Source context): (.+)/)[1])});
  if(stage==="AIO_RESEARCH")content=JSON.stringify({intent:"Explain AI",facts:["AI learns from data. [S0-1]","Training identifies patterns. [S0-1]"],gaps:"Limited evidence.",angle:"Training versus inference"});
  else if(stage==="AIO_OUTLINE"||stage==="OUTLINE_REVIEW_REVISE"){
   const task=JSON.parse(p.match(/Task: (.+)/)[1]);
   content=JSON.stringify({lines:task.key==="meta"?["Understanding how artificial intelligence works","Explain training versus inference",...Array.from({length:task.count-2},(_,i)=>"AI topic "+(i+1))]:["Explain the evidence","Give a useful example"]});
  }
  else if(stage==="AIO_COACH")content=JSON.stringify({focus:"Explain training simply",facts:[{claim:"AI training learns from data.",source_id:JSON.parse(p.match(/Packet: (.+)/)[1]).sources[0].id,quote:"AI training learns from data."}],gaps:"Limited evidence."});
  else if(stage==="AIO_WRITE"){const a=JSON.parse(p.match(/Assignment and readable evidence: (.+)/)[1]);assert.ok(p.includes("Write about "+a.section.word_count+" words"));content=Array(a.section.word_count).fill("Evidence").join(" ");}
  else if(stage.endsWith("_FACTS")){const unresolved=stuck&&stage==="SECTION_REVIEW_FACTS";content=JSON.stringify({verdict:unresolved?"CHANGE_REQUEST":"PASS",items:unresolved?[{id:"unsupported",severity:"error",location:"section",evidence:"Unsupported claim",fix:"Remove the unsupported claim"}]:[],...(stage.startsWith("SECTION")?{summary:"AI learns from data."}:{})});}
  else if(stage.endsWith("_REVIEW")){
   let needs=false;if(stage==="SECTION_REVIEW_REVIEW"){const a=packet();needs=stuck||!a.artifact.includes("[S");}
   const advisory=stage==="OUTLINE_REVIEW_REVIEW"; content=JSON.stringify({verdict:needs||advisory?"CHANGE_REQUEST":"PASS",...(stage==="SECTION_REVIEW_REVIEW"?{summary:"AI learns patterns from training data. ["+packet().context.sources[0].id+"]"}:{}),items:needs?[{id:"citation-1",severity:"error",location:"section",evidence:"No citation",fix:"Cite supporting source [S1-1] with the section's actual ID."}]:advisory?[{id:"style-note",severity:"warning",location:"outline",evidence:"Style preference",fix:"Consider shorter headings."}]:[]});
  }
  else if(stage==="SECTION_REVIEW_REVISE"){const a=packet();content=(a.artifact||Array(a.context.section.word_count).fill("Evidence").join(" ")).replace(/\s*\[S\d+-\d+\]/g,"")+" ("+a.context.sources[0].id+")";}
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
 assert.equal(calls.filter(s=>s==="AIO_OUTLINE").length,sections.length+1);assert.equal(calls.filter(s=>s==="AIO_EXTRAS").length,stuck?0:7);
 assert.equal(result.counts.length,sections.length);assert.equal(result.counts.reduce((s,x)=>s+x.target,0),stuck?200:2000);
 assert.equal(result.status,stuck?"Needs review":"Passed configured checks");
 assert.equal(calls.filter(s=>s==="SECTION_REVIEW_REVISE").length,sections.length*(stuck?2:1));
 assert.equal(calls.filter(s=>s==="SECTION_REVIEW_REVIEW").length,sections.length*(stuck?0:1));
 assert.deepEqual(result.visibleFAQ,(result.schema?.mainEntity||[]).map(q=>({question:q.name,answer:q.acceptedAnswer.text})));
 if(stuck){assert.equal(result.schema,null);assert.equal(result.extras.withheld,true);assert.equal(calls.some(s=>s.startsWith("EXTRAS_REVIEW")),false);}
 for(const c of result.counts)assert.equal(c.target,c.actual);
 assert.equal(result.reviews[1].history[0].issues.some(x=>x.code==="citations-missing"),true);
 assert.equal(result.reviews[1].history.at(-1).issues.some(x=>x.code==="citations-missing"),false);
 assert.equal(result.quality.valid,true);assert.equal(calls.includes("OUTLINE_REVIEW_REVISE"),false,"Advisory-only reviews do not consume revision credits");
});
test("article citation formatting keeps unknown IDs visible to validation",async()=>{
 const graph=Transfer.parseDocument(source).graph,n=graph.nodes.find(n=>n.id==='draft_packet'),V=require('../plugin/service/workflow-values'),Quality=require('../plugin/workflow-quality');
 const evidence={sources:[{id:'S1-1'},{id:'S1-2'}],settings:{revision_limit:2}};
 const packet=(await V.evaluate(n.config.source,{item:{text:'Supported claim (S1-1, S1-2). Unknown claim (S1-99).'},nodes:{evidence,verified_coach:{items:[{facts:[]}] }}},new AbortController().signal,false))[0];
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
   let value;if(stage.endsWith('_REVISE')){const task=JSON.parse(p.match(/Task: (.+)/)[1]);assert(task.count<=11);const lines=task.existing.length?task.existing.slice():['Fresh requirement for '+task.heading,'Use supporting evidence'];if(kind==='outline'&&task.key==='section'&&task.index===1){assert.equal(task.heading,'Section 1');assert.deepEqual(task.existing,[]);assert.match(task.instruction,/heading changed/);}if(task.key==='meta'){lines[0]='A clear evidence-based article title';if(kind==='outline')for(let i=2;i<lines.length;i++)lines[i]='Section '+(i-2);}value={lines};}else value={verdict:'PASS',items:[]};
   return {choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}],usage:{completion_tokens:150},koin:{state:'charged'}};
  }};
  const inference=createInference(f.api,async()=>{}),engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=>"network"});
  t.after(()=>engine.stop());const w=engine.save({...full,graph:{version:2,nodes,edges}}),id=engine.begin(w.id,{artifact,context,cycle:0,limit:2,prior:[],history:[],reviewed:false});
  let run;for(let i=0;i<6000;i++){run=engine.get(id);if(run.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(run.status,'completed',run.error);const final=run.frames.root.states[prefix].outputs.done[0];assert.equal(final.status,'Passed checks');assert.equal(final.cycle,1);assert.equal(final.artifact.title,'A clear evidence-based article title');assert.equal(calls.filter(s=>s.endsWith('_REVISE')).length,kind==='outline'?10:7);assert.equal(calls.filter(s=>s.endsWith('_REVIEW')).length,1);
 }
});

test('coaching excludes fabricated quotations and unresolved sections cannot seed extras',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),signal=new AbortController().signal;
 const evaluate=(id,context)=>V.evaluate(graph.nodes.find(n=>n.id===id).config.source,context,signal,false);
 const quote='AI training learns from data only when data is available.';
 const cards=await evaluate('verified_coach',{item:{json:{focus:'Training',facts:[{claim:'Supported',source_id:'S1-1',quote},{claim:'Invented',source_id:'S1-1',quote:'Training guarantees perfect results.'},{claim:'Wrong ID',source_id:'S1-99',quote}],gaps:'Limited evidence.'}},nodes:{evidence:{sources:[{id:'S1-1',text:quote}]}}});
 assert.deepEqual(cards[0].facts,[{claim:'Supported',source_id:'S1-1',quote}]);assert.match(cards[0].gaps,/Unmatched/);
 const packet=(await evaluate('aio_packet',{item:{title:'Draft',topic:'AI',settings:{},digests:[{heading:'Safe',status:'Passed checks',summary:quote},{heading:'Unsafe',status:'Needs review',summary:'Invented'}]}}))[0];
 assert.equal(packet.article.length,1);assert.equal(packet.article[0].heading,'Safe');assert.deepEqual(packet.withheld,['Unsafe']);
});
test('section and total word budgets block approval instead of issuing warnings',()=>{
 const graph=Transfer.parseDocument(source).graph,Quality=require('../plugin/workflow-quality');
 for(const id of ['section_review_checks','final_checks']){
  const rule=graph.nodes.find(n=>n.id===id).config.rules.find(r=>r.type==='words');
  assert.notEqual(rule.severity,'warning');
  const result=Quality.inspect(rule.field?{[rule.field]:'Only three words'}:'Only three words',[{...rule,min:100,max:120}]);
  assert.equal(result.valid,false);assert.equal(result.issues[0].severity,'error');
 }
});

test('length revisions get one explicit rewrite instruction and retain the factual audit gate',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),judge=graph.nodes.find(n=>n.id==='section_review_judge'),signal=new AbortController().signal;
 const issue={id:'words',severity:'error',code:'words',message:'Outside range',actual:203,min:144,max:176};
 const state={artifact:'Draft',context:{section:{word_count:160}},cycle:0,limit:2,history:[],checks:{valid:false,issues:[issue],metrics:[{type:'words',actual:203,min:144,max:176}]}};
 const output=(await V.evaluate(judge.config.source,{item:{json:{verdict:'CHANGE_REQUEST',items:[{id:'words',severity:'error',location:'$',evidence:'203 words',fix:'Write 144–176 words.'}],summary:''}},nodes:{section_review_checks:state}},signal,false))[0];
 assert.equal(output.prior.length,1);assert.equal(output.prior[0].fix,'Write 144–176 words.');assert.match(output.revisionInstruction,/SHORTEN.*203.*144–176/);assert.match(output.revisionInstruction,/Remove about 43 words/);assert.match(output.revisionInstruction,/changing citations alone does not fix length/);
 assert.equal(output.needsRevision,true);assert.equal(output.status,'Needs review');
 const revise=graph.nodes.find(n=>n.id==='section_review_revise');assert.match(revise.config.prompt,/Mandatory revision: \{\{item.revisionInstruction\}\}/);
 assert.ok(graph.edges.some(e=>e.from==='section_review_ready'&&e.to==='section_review_facts'));
});

test('source warnings block approval and subsequent content edits keep the word budget',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),signal=new AbortController().signal;
 const audit={verdict:'PASS',summary:'Claim summary',items:[{id:'scope',severity:'warning',location:'Paragraph 1',evidence:'These services share terms',fix:'Specify which service has these terms.'}]};
 const normalize=graph.nodes.find(n=>n.id==='section_review_facts_decision');
 const out=(await V.evaluate(normalize.config.source,{item:{json:audit}},signal,false))[0];
 assert.equal(out.json.verdict,'CHANGE_REQUEST');assert.equal(out.json.items[0].severity,'error');assert.equal(audit.items[0].severity,'warning');
 const judge=graph.nodes.find(n=>n.id==='section_review_judge'),packet={artifact:'Draft',context:{},cycle:1,limit:2,history:[],checks:{valid:true,issues:[],metrics:[{type:'words',actual:170,min:144,max:176}]}};
 const judged=(await V.evaluate(judge.config.source,{item:out,nodes:{section_review_checks:packet}},signal,false))[0];
 assert.equal(judged.status,'Needs review');assert.equal(judged.needsRevision,true);assert.match(judged.revisionInstruction,/fresh section.*160.*144–176/);assert.equal(judged.revisionArtifact,'');assert.equal(judged.artifact,packet.artifact);
});

test('a short uncited section receives factual and mechanical fixes in its first revision',async t=>{
 const f=fixture(t,'kai.workflows'),store=new CompanionStore({dataDir:f.root,safeStorage:f.api.secrets}),full=Transfer.parseDocument(source),M=require('../plugin/workflow-model');
 const nodes=full.graph.nodes.filter(n=>n.id.startsWith('section_review')),ids=new Set(nodes.map(n=>n.id)),calls=[];
 nodes.push(M.node('trigger','start'),M.node('output','out',undefined,{text:'{{previous}}'}));
 const edges=full.graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));edges.push(M.edge('start','section_review'),M.edge('section_review','out','done'));
 let revised=false;
 f.api.network.models=async()=>[{model:'gemma3-12b',available:true,maxOutput:256}];
 f.api.wallet={authorize:async()=>{},complete:async request=>{
  const p=request.messages[1].content,stage=p.match(/STAGE: (\w+)/)[1];calls.push(stage);let content;
  if(stage==='SECTION_REVIEW_FACTS')content=JSON.stringify({verdict:revised?'PASS':'CHANGE_REQUEST',items:revised?[]:[{id:'unsupported-assurance',severity:'error',location:'Sentence 1',evidence:'Listing guarantees success.',fix:'Remove the unsupported guarantee.'}],summary:'The directory lists participating providers.'});
  else if(stage==='SECTION_REVIEW_REVISE'){
   assert.match(p,/Remove the unsupported guarantee/);assert.match(p,/144–176/);assert.match(p,/known source citation/);assert.match(p,/Artifact: \nContext:/,'Do not feed the rejected prose back as the revision basis');
   revised=true;content=Array(160).fill('Supported').join(' ')+' [S1-1]';
  }else {assert.equal(stage,'SECTION_REVIEW_REVIEW');content=JSON.stringify({verdict:'PASS',items:[],summary:'Participating providers are listed. [S1-1]'});}
  return {choices:[{message:{content},finish_reason:'stop'}],usage:{completion_tokens:150},koin:{state:'charged'}};
 }};
 const inference=createInference(f.api,async()=>{}),engine=new CompanionWorkflows({store,connections:{list:()=>[]},models:()=>[],runLocal:o=>inference.run(o),canReviewNetwork:()=>true,privacyMode:()=> 'network'});t.after(()=>engine.stop());
 const context={topic:'Choose a provider',section:{word_count:160},settings:{word_tolerance:0.1,banned_phrases:['TODO']},sources:[{id:'S1-1',text:'This directory lists participating providers.'}]};
 const w=engine.save({...full,graph:{version:2,nodes,edges}}),id=engine.begin(w.id,{artifact:'Listing guarantees success. '+Array(113).fill('Draft').join(' '),context,cycle:0,limit:2,prior:[],history:[],reviewed:false});
 let run;for(let i=0;i<6000;i++){run=engine.get(id);if(run.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(run.status,'completed',run.error);const result=run.frames.root.states.section_review.outputs.done[0];
 assert.equal(result.status,'Passed checks');assert.equal(result.cycle,1);
 assert.deepEqual(calls,['SECTION_REVIEW_FACTS','SECTION_REVIEW_REVISE','SECTION_REVIEW_FACTS','SECTION_REVIEW_REVIEW']);
 assert.ok(result.history[0].issues.some(i=>i.code==='words'));assert.ok(result.history[0].issues.some(i=>i.code==='citations-missing'));assert.ok(result.history[0].issues.some(i=>i.id==='unsupported-assurance'));
});

test('a reviewer cannot revive a resolved mechanical error from prior history',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),judge=graph.nodes.find(n=>n.id==='section_review_judge'),signal=new AbortController().signal;
 const old={id:'check-2-1',severity:'error',location:'$',evidence:'203 words',fix:'Write 144–176 words (currently 203).'};
 const packet={artifact:'Current draft',context:{},cycle:1,limit:2,history:[],checks:{valid:true,issues:[],metrics:[{type:'words',actual:170,min:144,max:176}]}};
 const judgeWith=async items=>(await V.evaluate(judge.config.source,{item:{json:{verdict:'CHANGE_REQUEST',items,summary:'Current summary'}},nodes:{section_review_checks:packet}},signal,false))[0];
 const resolved=await judgeWith([old]);assert.equal(resolved.status,'Passed checks');assert.equal(resolved.needsRevision,false);assert.deepEqual(resolved.history[0].ignoredModelFindings,[old]);
 const factual={id:'unsupported-claim',severity:'error',location:'Paragraph 2',evidence:'Unproven guarantee',fix:'Remove the guarantee.'};
 const mixed=await judgeWith([old,factual]);assert.equal(mixed.status,'Needs review');assert.deepEqual(mixed.prior,[factual]);
 packet.checks={valid:false,issues:[{...old,code:'words',message:'Outside range'}],metrics:[{type:'words',actual:203,min:144,max:176}]};
 const active=await judgeWith([old]);assert.equal(active.status,'Needs review');assert.equal(active.history[0].ignoredModelFindings.length,0);
});

test('long audit evidence remains valid when the verdict agrees with its findings',()=>{
 const graph=Transfer.parseDocument(source).graph,Output=require('../plugin/workflow-output'),reply=require('./fixtures/aio-audit-long-evidence.json');
 assert.ok(reply.items[0].evidence.length>220);
 const schema=graph.nodes.find(n=>n.id==='section_review_facts').config.outputSchema;
 assert.ok(Output.validate(reply,schema),'PASS with findings is contradictory even when the quotation fits');
 const consistent={...reply,verdict:'CHANGE_REQUEST'};assert.equal(Output.validate(consistent,schema),'');
 const tooLarge=structuredClone(consistent);tooLarge.items[0].evidence='x'.repeat(601);assert.ok(Output.validate(tooLarge,schema));
});

test('a short section receives only the missing paragraph and the combined draft is rechecked',async()=>{
 const graph=Transfer.parseDocument(source).graph,V=require('../plugin/service/workflow-values'),Q=require('../plugin/workflow-quality'),signal=new AbortController().signal;
 const issue={id:'check-2-1',code:'words',severity:'error',location:'$',message:'Outside range',actual:299,min:309,max:379};
 const packet={artifact:Array(299).fill('Existing').join(' ')+' [S2-1]',context:{section:{word_count:344}},cycle:0,limit:2,history:[],checks:{valid:false,issues:[issue],metrics:[{type:'words',actual:299,min:309,max:379}]}};
 const json={verdict:'CHANGE_REQUEST',items:[{id:issue.id,severity:'error',location:'$',evidence:issue.message,fix:'Write 309–379 words.'}],summary:''};
 const node=id=>graph.nodes.find(n=>n.id===id);
 const judged=(await V.evaluate(node('section_review_judge').config.source,{item:{json},nodes:{section_review_checks:packet}},signal,false))[0];
 assert.equal(judged.revisionMode,'append');assert.match(judged.revisionInstruction,/45 words \(allowed 10–80\)/);
 const revised=(await V.evaluate(node('section_review_keep').config.source,{item:{text:Array(45).fill('Additional').join(' ')+' [S2-1]'},nodes:{section_review_judge:judged}},signal,false))[0];
 assert.ok(revised.artifact.startsWith(packet.artifact+'\n\n'));assert.equal(Q.wordCount(revised.artifact),344);assert.equal(revised.reviewed,false);
 packet.checks.issues.push({...issue,id:'check-4-2',code:'forbidden'});
 const mixed=(await V.evaluate(node('section_review_judge').config.source,{item:{json},nodes:{section_review_checks:packet}},signal,false))[0];assert.equal(mixed.revisionMode,'replace');
});
