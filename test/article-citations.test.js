"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Model=require("../plugin/workflow-model"),V=require("../plugin/service/workflow-values");
const document=require("../examples/researched-article.workflow.json");
const source=document.workflow.graph.nodes.find(n=>n.id==="collect").config.source;
const previous="\nconst s = nodes.section, body = item.text.trim();\nif (!body) throw Error(\"The section writer returned no text.\");\nconst allowed = nodes.evidence.sources;\nfor (const match of body.matchAll(/\\[(S\\d+-\\d+)\\]/g)) if (!allowed.some(x=>x.id===match[1])) throw Error(\"Writer returned a source ID absent from the retrieved evidence.\");\nconst words = body.replace(/\\[S\\d+-\\d+\\]/g, \"\").trim().split(/\\s+/).filter(Boolean).length;\nconst cited = allowed.filter(x=>body.includes(\"[\"+x.id+\"]\")).map(({id,title,url})=>({id,title,url}));\nreturn [{topic:s.topic,title:s.title,target_words:s.target_words,sections:s.sections,index:s.index+1,\n article:s.article + (s.article ? \"\\n\\n\" : \"\") + \"## \" + s.section.heading + \"\\n\\n\" + body,\n sources:[...s.sources,...cited],counts:[...s.counts,{heading:s.section.heading,target:s.section.word_count,actual:words}],\n total_words:s.counts.reduce((n,x)=>n+x.actual,0)+words,\n plan_text:s.sections.map(x=>\"- **\"+x.heading+\"** — \"+x.word_count+\" words; \"+x.points.join(\"; \")).join(\"\\n\"),\n sources_text:[...s.sources,...cited].map(x=>\"[\"+x.id+\"]: <\"+x.url.replace(/[<>\\s]/g,encodeURIComponent)+\">\").join(\"\\n\") + \"\\n\\n\" + [...s.sources,...cited].map(x=>\"- [\"+x.id+\"] \"+x.title.replace(/[\\[\\]<>\\r\\n]/g,\" \")).join(\"\\n\"),\n counts_text:[...s.counts,{heading:s.section.heading,target:s.section.word_count,actual:words}].map(x=>\"- \"+x.heading+\": \"+x.actual+\" / \"+x.target+\" words\").join(\"\\n\")}];";
const scope=text=>({item:{text},items:[],input:{},iteration:0,nodes:{section:{topic:"AI",title:"AI",target_words:4,sections:[{heading:"AI",word_count:4,points:[]}],index:0,section:{heading:"AI",word_count:4},article:"",sources:[],counts:[]},evidence:{sources:[{id:"S1-1",title:"First",url:"https://example.com/first"},{id:"S1-2",title:"Second",url:"https://example.com/second"},{id:"S1-3",title:"Third",url:"https://example.com/third"}]}}});
test("live grouped citations retain every source and exclude all markers from word counts",async()=>{
 const [row]=await V.evaluate(source,scope("AI learns [S1-1, S1-3]. Data matters [ S1-2; S1-3 ]."),undefined,false);
 assert.deepEqual(row.sources.map(s=>s.id),["S1-1","S1-2","S1-3"]);
 assert.match(row.article,/\[S1-1\] \[S1-3\]/);
 assert.match(row.sources_text,/\[S1-3\]: <https:\/\/example.com\/third>/);
 assert.equal(row.counts[0].actual,4);
});
test("grouped citations cannot hide a source absent from readable evidence",async()=>{
 await assert.rejects(V.evaluate(source,scope("A fact [S1-1, S1-99]."),undefined,false),/source ID absent/);
});
test("collector migration is exact, idempotent and leaves model choices and customized code intact",()=>{
 const legacy=structuredClone(document.workflow),collector=legacy.graph.nodes.find(n=>n.id==="collect");collector.config.source=previous;
 const agents=JSON.stringify(legacy.graph.nodes.filter(n=>n.type==="agent"));
 assert.equal(Model.migrateReliability(legacy),true);assert.equal(collector.config.source,source);
 assert.equal(JSON.stringify(legacy.graph.nodes.filter(n=>n.type==="agent")),agents);
 assert.equal(Model.migrateReliability(legacy),false);
 collector.config.source=previous+"\n// Custom collector";assert.equal(Model.migrateReliability(legacy),false);
 assert.equal(collector.config.source,previous+"\n// Custom collector");
});

