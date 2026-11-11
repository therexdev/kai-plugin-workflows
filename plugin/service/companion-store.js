"use strict";
const common=require("./state");
class CompanionStore extends common.ScopedStore {constructor(options){super(options,{version:1,workflows:[],runs:[],workflowAgents:[],workflowState:{},settings:{}});this.metadata={connections:[],sources:[],notes:[],goals:[]};this.attach();
 if(!this.locked && this.available()) {
  const Model=require("../workflow-model"), values=[...this.data.workflows,...this.data.workflowAgents,this.data.workflowState.discovery].filter(Boolean);
  const oldPolicy=v=>v && (v.modelSource===undefined || v.modelPreference===undefined || /^koinos-network:/.test(v.model||"") || v.fallbackModels?.some(m=>typeof m==="string"));
  const legacy=v=>oldPolicy(v) || v.graph?.nodes.some(n=>n.type==="agent" && oldPolicy(n.config));
  if(values.some(legacy)) this.change(d=>{
   for(const w of d.workflows) if(Model.migrateModels(w)){w.revision=(w.revision||0)+1;w.updatedAt=Date.now();}
   for(const a of d.workflowAgents) Model.migrateModels(a);
   if(d.workflowState.discovery) Model.migrateModels(d.workflowState.discovery);
  });
 }
 }attach(){for(const key of Object.keys(this.metadata))Object.defineProperty(this.data,key,{enumerable:false,configurable:true,get:()=>this.metadata[key]});}change(fn){const result=super.change(fn);this.attach();return result;}}
module.exports={...common,CompanionStore};
