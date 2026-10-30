"use strict";
const common=require("./state");
class CompanionStore extends common.ScopedStore {constructor(options){super(options,{version:1,workflows:[],runs:[],workflowAgents:[],workflowState:{},settings:{}});this.metadata={connections:[],sources:[],notes:[],goals:[]};this.attach();}attach(){for(const key of Object.keys(this.metadata))Object.defineProperty(this.data,key,{enumerable:false,configurable:true,get:()=>this.metadata[key]});}change(fn){const result=super.change(fn);this.attach();return result;}}
module.exports={...common,CompanionStore};
