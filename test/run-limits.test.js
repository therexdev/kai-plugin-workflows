"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createClass}=require('../plugin/service/workflow-engine');
const Model=require('../plugin/workflow-model');

test('nested runs continue beyond the old caps and stop at finite run-wide limits',()=>{
 class MemoryBase {
  constructor(){this.run={steps:[],frames:{}};}
  get(){return this.run;}
  patch(key,fn){const next=structuredClone(this.run);fn(next);this.run=next;}
 }
 const Engine=createClass(MemoryBase),engine=new Engine({});
 const node=Model.node('code','check'),graph={version:2,nodes:[node],edges:[]};
 engine.run.steps=Array.from({length:500},(_,i)=>({token:'old-'+i,status:'completed'}));
 engine.logStart('run','next','root',node,[{saved:true}]);
 assert.equal(engine.run.steps.length,501);assert.deepEqual(engine.run.steps[500].input,[{saved:true}]);
 engine.run.steps=Array.from({length:1999},(_,i)=>({token:'old-'+i,status:'completed'}));
 engine.logStart('run','last','root',node,[]);
 assert.throws(()=>engine.logStart('run','over','root',node,[]),/2000-step limit/);
 assert.equal(engine.run.steps.length,2000);assert.equal(engine.run.steps.at(-1).token,'last');
 engine.run.frames=Object.fromEntries(Array.from({length:150},(_,i)=>['old-'+i,{status:'completed'}]));
 engine.frame('run','next',graph,[],{});assert.equal(Object.keys(engine.run.frames).length,151);
 engine.run.frames=Object.fromEntries(Array.from({length:499},(_,i)=>['old-'+i,{status:'completed'}]));
 engine.frame('run','last',graph,[],{});
 engine.frame('run','last',graph,[],{}); // Reusing a saved frame remains allowed.
 assert.throws(()=>engine.frame('run','over',graph,[],{}),/500-frame limit/);
 assert.equal(Object.keys(engine.run.frames).length,500);assert(engine.run.frames.last);
});
