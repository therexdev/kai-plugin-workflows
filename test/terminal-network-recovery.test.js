"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helper"),{createInference}=require("../plugin/service/workflow-inference");
const schema={type:"object",required:["text"],properties:{text:{type:"string",minLength:8}},additionalProperties:false};
function reply(text,{partial=false,active=false,tokens=40}={}){return {id:"a".repeat(64),choices:[{message:{content:text},finish_reason:"stop"}],usage:{completion_tokens:tokens},koin:{state:active?"streaming":"charged",receipt:{...(partial?{sequence:2}:{}),usage:{amount:"120"}}}};}
function setup(t,responses,extra={}){
 const f=fixture(t,"kai.workflows"),calls=[],saved=[],events=[];
 f.api.network.models=async()=>[{model:"primary",available:true,maxOutput:256},{model:"fallback",available:true,maxOutput:512}];
 f.api.wallet={complete:async(request,options)=>{calls.push({request,options});events.push("request");const value=responses.shift();if(value instanceof Error)throw value;assert.ok(value,"No unexpected generation");return value;},authorize:async action=>{if(action==="chat-ack")events.push("ack");}};
 const inference=createInference(f.api,async part=>{events.push("save");saved.push(part);await extra.save?.(part);});
 const run=options=>inference.run({model:"primary",modelSource:"network",fallbackModels:[{model:"fallback",modelSource:"network"}],prompt:"Write a concise answer.",maxTokens:800,maxContinuations:4,runId:"same-run",stepKey:"root/outline",attemptStartedAt:123,...options});
 return {...f,calls,saved,events,run};
}
test("a terminal signed prefix labelled stop continues through the configured fallback before completing JSON",async t=>{
 const f=setup(t,[reply('{"text":"First ',{partial:true}),reply('second."}')]);
 assert.deepEqual(JSON.parse(await f.run({outputFormat:"json",outputSchema:schema})),{text:"First second."});
 assert.deepEqual(f.calls.map(c=>c.request.model),["koinos-network:primary","koinos-network:fallback"]);
 assert.equal(f.calls[0].request.stream,true);assert.equal(f.calls[1].request.max_tokens,128);
 assert.equal(f.calls[1].request.messages.at(-2).content,'{"text":"First ');
 assert.ok(f.calls.every(c=>c.options.workflow.id==="same-run"));
 assert.deepEqual(f.events,["request","save","ack","request","save","ack"]);
 assert.equal(f.saved[0].interrupted,true);assert.equal(f.saved[0].terminal,true);assert.equal(f.saved[0].stepKey,"root/outline");assert.equal(f.saved[1].purpose,"continue");
});
test("an interrupted prose reply cannot be mistaken for complete despite stop",async t=>{
 const f=setup(t,[reply("First paragraph. ",{partial:true}),reply("Second paragraph.")]);
 assert.equal(await f.run(),"First paragraph. Second paragraph.");assert.equal(f.calls.length,2);
});
test("a still-active signed prefix is retained without acknowledgement or replacement even if its JSON parses",async t=>{
 const f=setup(t,[reply('{"text":"Complete-looking text"}',{partial:true,active:true})]);
 await assert.rejects(f.run({outputFormat:"json",outputSchema:schema}),/still completing/);
 assert.deepEqual(f.events,["request","save"]);assert.equal(f.saved[0].terminal,false);
});
test("a terminal prefix satisfying the complete JSON contract needs no extra generation",async t=>{
 const f=setup(t,[reply('{"text":"Fully provided text"}',{partial:true})]);
 assert.deepEqual(JSON.parse(await f.run({outputFormat:"json",outputSchema:schema})),{text:"Fully provided text"});assert.equal(f.calls.length,1);
});
test("unavailable fallbacks retain the original allowed route with shorter continuation chunks",async t=>{
 const f=setup(t,[reply("First ",{partial:true}),reply("last.")]);f.api.network.models=async()=>[{model:"primary",available:true,maxOutput:256},{model:"fallback",available:false,maxOutput:256}];
 assert.equal(await f.run(),"First last.");assert.deepEqual(f.calls.map(c=>c.request.model),["koinos-network:primary","koinos-network:primary"]);assert.equal(f.calls[1].request.max_tokens,128);
});
test("terminal interruption respects total token and continuation limits",async t=>{
 for(const options of [{maxTokens:40},{maxContinuations:0}]){
   const f=setup(t,[reply("Unfinished ",{partial:true,tokens:40})]);
   await assert.rejects(f.run(options),/output budget|continuation limit/);assert.equal(f.calls.length,1);assert.equal(f.saved.length,1);
 }
});
test("unknown transport outcomes and failed durable saves never start fallbacks",async t=>{
 const error=Object.assign(Error("Connection ended"),{code:"credit-response-interrupted",safeToRetry:false});
 const f=setup(t,[error]);await assert.rejects(f.run(),/Connection ended/);assert.deepEqual(f.events,["request"]);
 const broken=setup(t,[reply("Prefix ",{partial:true})],{save:()=>{throw Error("Disk full");}});await assert.rejects(broken.run(),/Disk full/);assert.deepEqual(broken.events,["request","save"]);
});
test("a terminal interruption may select only a local route explicitly allowed by model policy",async t=>{
 const f=setup(t,[reply("Network ",{partial:true})]);f.api.models.chat=async request=>{assert.equal(request.model,"local-test");return reply("local.");};
 assert.equal(await f.run({fallbackModels:[{model:"local-test",modelSource:"local"}]}),"Network local.");assert.equal(f.saved[1].source,"local");assert.equal(f.calls.length,1);
});
