"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),C=require("../plugin/service/workflow-continuation"),{fixture}=require("./helper"),{createInference}=require("../plugin/service/workflow-inference");
test("verified overlap preserves split words, spaces, hyphens and URLs",()=>{
 for(const [prefix,reply,expected] of [["Use the","Use the sources.","Use the sources."],["Super","Supervised learning.","Supervised learning."],["human","human-like","human-like"],["https://exa","https://example.org","https://example.org"],["Done.\n\n","Done.\n\nNext.","Done.\n\nNext."]])assert.equal(C.append(prefix,reply,C.anchor(prefix)).text,expected);
 assert.equal(C.append("Use the","sources.","Use the").valid,false);
 assert.equal(C.append("Same","Same","Same").valid,false);
 const prefix="Earlier context. ".repeat(30)+"Use the";assert.equal(C.append(prefix,C.anchor(prefix)+" sources.",C.anchor(prefix)).text,prefix+" sources.");
});
test("unverified boundaries trigger bounded repair, save raw receipts and never emit glued words",async t=>{
 const f=fixture(t,"kai.workflows"),saved=[],calls=[],chunks=[['Use the','length'],['sources.','stop'],['Use the sources.','stop']];
 f.api.network.models=async()=>[{model:"test",available:true,maxOutput:256}];
 f.api.wallet={complete:async request=>{calls.push(request);const [content,finish_reason]=chunks.shift();return{id:"a".repeat(64),choices:[{message:{content},finish_reason}],usage:{completion_tokens:10},koin:{state:"charged"}};},authorize:async()=>{}};
 const i=createInference(f.api,part=>saved.push(part));
 assert.equal(await i.run({model:"test",modelSource:"network",prompt:"Write",maxTokens:200,maxContinuations:4,continuationMode:"overlap"}),"Use the sources.");
 assert.equal(saved[1].completion.choices[0].message.content,"sources.");assert.equal(saved[1].textAssembly.valid,false);assert.equal(saved[2].textAssembly.valid,true);assert.equal(calls.length,3);assert.match(calls[2].messages.at(-1).content,/last continuation/);
});
test("a terminal boundary failure can be corrected by the next selected model without losing the prefix",async t=>{
 const f=fixture(t,'kai.workflows'),models=[],saved=[],chunks=[['Use the','length'],['sources.','stop'],['Use the sources.','stop']];
 f.api.network.models=async()=>['primary','backup'].map(model=>({model,available:true,maxOutput:256}));
 f.api.wallet={complete:async request=>{models.push(request.model);const [content,finish_reason]=chunks.shift();return{choices:[{message:{content},finish_reason}],usage:{completion_tokens:10},koin:{state:'charged'}};},authorize:async()=>{}};
 const i=createInference(f.api,part=>saved.push(part));
 assert.equal(await i.run({model:'primary',modelSource:'network',fallbackModels:[{model:'backup',modelSource:'network'}],prompt:'Write',maxTokens:200,maxContinuations:4,continuationMode:'overlap'}),'Use the sources.');
 assert.deepEqual(models,['koinos-network:primary','koinos-network:primary','koinos-network:backup']);assert.equal(saved[1].textAssembly.valid,false);
});
