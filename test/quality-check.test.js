"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Q=require("../plugin/workflow-quality"),M=require("../plugin/workflow-model"),{fixture}=require("./helper");
test("quality checks reject missing/unknown citations and preserve grouped valid IDs",()=>{
 const rule={type:"citations",sources:[{id:"S1-1"},{id:"S1-2"}],min:1};
 assert.equal(Q.inspect("Uncited fact.",[rule]).valid,false);
 assert.equal(Q.inspect("Fact [S1-1, S1-2].",[rule]).valid,true);
 assert.equal(Q.inspect("Fact [S1-9].",[rule]).issues[0].code,"citations-unknown");
 assert.equal(Q.inspect("[S1-1](https://example.com)",[rule]).valid,false);
 assert.equal(Q.inspect("Fact [1].",[{...rule,style:"numbered",sources:[{n:1}]}]).valid,true);
});
test("count warnings are advisory; structural equality and schema enforce final parity",()=>{
 assert.equal(Q.wordCount("## Heading\n\nTwo words [S1-1]."),2);
 const report=Q.inspect({body:"Two words",faq:[{a:"yes",q:"why"}]},[{type:"words",field:"body",min:10,severity:"warning"},{type:"equals",field:"faq",expected:[{q:"why",a:"yes"}]}]);
 assert.equal(report.valid,true);assert.equal(report.issues[0].severity,"warning");
 assert.equal(Q.inspect({faq:[]},[{type:"schema",schema:{type:"object",required:["text"]}}]).valid,false);
 assert.throws(()=>Q.checkRules([{type:"words",min:-1}]));
 assert.throws(()=>Q.checkRules([{type:"equals",field:"__proto__.x",expected:1}]));
});
test("quality report drives branching without dropping the input; stop errors remain visible",async t=>{
 const f=fixture(t,"kai.workflows"),app=require("../plugin/service").create(f.api);t.after(()=>app.dispose());
 const graph={version:2,nodes:[M.node("trigger","start"),M.node("quality_check","check",undefined,{value:"=item.text",rules:[{type:"words",min:"=item.minimum"}],onFailure:"report"}),M.node("condition","route",undefined,{expression:"=item.quality.valid"}),M.node("output","good",undefined,{text:"=item.text"}),M.node("output","bad",undefined,{text:"=item.quality.issues[0].message"})],edges:[M.edge("start","check"),M.edge("check","route"),M.edge("route","good","true"),M.edge("route","bad","false")]};
 const w=await app.call("workflows.workflow",{name:"Quality",graph});
 const run=await app.call("workflows.run",{id:w.id,input:{text:"One",minimum:3}});let r;for(let i=0;i<100;i++){r=await app.call("workflows.runGet",{id:run.id});if(r.status!=="running")break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(r.status,"completed",r.error);assert.match(r.output[0].text,/outside/);assert.equal(r.frames.root.states.check.outputs.main[0].text,"One");
 graph.nodes[1].config.onFailure="stop";const w2=await app.call("workflows.workflow",{name:"Stop",graph});const run2=await app.call("workflows.run",{id:w2.id,input:{text:"One",minimum:3}});for(let i=0;i<100;i++){r=await app.call("workflows.runGet",{id:run2.id});if(r.status!=="running")break;await new Promise(r=>setTimeout(r,10));}assert.equal(r.status,"failed");assert.match(r.error,/Quality Check/);
});
test("history context has a separate bound without loosening the per-node output limit",async()=>{
 const V=require("../plugin/service/workflow-values"),large="x".repeat(220000);
 assert.equal(await V.evaluate("nodes.a.text.length",{nodes:{a:{text:large}}}),220000);
 await assert.rejects(V.evaluate("nodes.a.text",{nodes:{a:{text:large}}}),/Output exceeds 200 KB/);
 await assert.rejects(V.evaluate("1",{nodes:{a:{text:"x".repeat(2100000)}}}),/context exceeds 2 MB/);
});
