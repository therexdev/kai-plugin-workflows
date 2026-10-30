"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
const {fixture}=require("./helper"),Model=require("../plugin/workflow-model");
const brainPath=path.resolve(__dirname,"../../kai-plugin-brain/plugin/service"),connectionsPath=path.resolve(__dirname,"../../kai-plugin-connections/plugin/service");
test("separate installed Brain, Connections and Workflows integrate through declared service RPC",{skip:!fs.existsSync(brainPath)||!fs.existsSync(connectionsPath)},async t=>{
 const f=fixture(t,"integration"),registry=new Map(),apps=[],network=[];
 for(const [id,module]of [["kai.brain",brainPath],["kai.connections",connectionsPath],["kai.workflows",path.resolve(__dirname,"../plugin/service")]]){
  const dir=path.join(f.root,id);fs.mkdirSync(dir);const api={...f.api,plugin:{...f.api.plugin,id,dataDir:dir},network:{...f.api.network,fetch:async(url,options)=>{network.push({url,options});return new Response('{"value":"connected read"}');}},services:{provide(name,spec){registry.set(name,spec);return()=>registry.delete(name);},async call(name,method,input={},options={}){const target=registry.get(name);if(!target)throw Error("Service unavailable: "+name);assert.ok(target.methods.includes(method),name+"."+method);return target.call(method,input,{...options,caller:{id}});}}};apps.push(require(module).create(api));
 }
 const [brain,connections,workflows]=apps;t.after(async()=>{for(const app of apps)await app.dispose();});
 await brain.call("brain.ui.note",{title:"Project",text:"a private project note"});
 const c=await connections.call("connections.save",{name:"API",baseUrl:"https://api.example.com",auth:"bearer",secret:"only-connections-has-this",allowSync:true,allowAgent:true,operations:[{id:"read",name:"Read",method:"GET",path:"/records"}]});
 const nodes=[Model.node("trigger","start"),Model.node("tool_call","read",undefined,{connectionId:c.id,operationId:"read",variables:{},body:{}}),Model.node("memory","memory",undefined,{operation:"search",query:"project",limit:8}),Model.node("output","out")],edges=[Model.edge("start","read"),Model.edge("read","memory"),Model.edge("memory","out")];
 const w=await workflows.call("workflows.workflow",{name:"Cross-plugin read",graph:{version:2,nodes,edges}});const run=await workflows.call("workflows.run",{id:w.id});let result;for(let i=0;i<100;i++){result=await workflows.call("workflows.runGet",{id:run.id});if(["completed","failed","waiting"].includes(result.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(result.status,"completed",result.error);assert.match(JSON.stringify(result),/private project note/);assert.equal(network.length,1);assert.equal(network[0].options.headers.Authorization,"Bearer only-connections-has-this");
 const disk=id=>{const env=JSON.parse(fs.readFileSync(path.join(f.root,id,"state.json")));return JSON.parse(f.api.secrets.decryptString(Buffer.from(env.encrypted,"base64")));};
 assert.equal(disk("kai.brain").notes.length,1);assert.equal(disk("kai.connections").connections.length,1);assert.equal(disk("kai.workflows").workflows.length,1);assert.equal(Object.hasOwn(disk("kai.workflows"),"connections"),false);assert.doesNotMatch(JSON.stringify(disk("kai.workflows")),/only-connections-has-this/);
 for(const app of apps)await app.dispose();
});
