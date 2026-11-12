
  await check("Workflows Start run and Run again execute through the native bridge", async()=>{
   const id="kai.workflows";
   const workflow=await appEval(id, `window.kai.call("workflows.workflow",{name:"Native run button check",graph:{version:2,nodes:[{id:"start",type:"trigger",label:"Inputs",position:{x:80,y:70},config:{kind:"manual",inputFields:[{name:"topic",type:"string",required:true},{name:"word_count",type:"integer",required:true}]}},{id:"out",type:"output",label:"Result",position:{x:80,y:220},config:{text:"{{input.topic}}: {{input.word_count}}"}}],edges:[{id:"start-out",from:"start",to:"out",port:"main",input:"main"}]}})`);
   await appEval(id, 'document.querySelector("[data-section=runs]").click();true');
   await until(()=>appEval(id,'!!document.querySelector(".wf-run-filters")'),"Run history did not open");
   await appEval(id, 'document.querySelector("[data-section=saved]").click();true');
   await until(()=>appEval(id,`!!document.querySelector('[data-wf="run"][data-id="${workflow.id}"]')`),"Saved workflow did not render");
   await appEval(id,`document.querySelector('[data-wf="run"][data-id="${workflow.id}"]').click();true`);
   await until(()=>appEval(id,'!!document.querySelector(".wf-modal")'),"Run button did not open the form");
   await appEval(id,'document.querySelector(".wf-modal button[type=submit]").click();true');
   await until(()=>appEval(id,'document.querySelector(".wf-run-error")?.textContent.includes("topic")'),"Required-input error was not visible in the dialog");
   await appEval(id,'for(const [name,value] of [["runInput0","Native topic"],["runInput1","1000"]]){const el=document.querySelector(`[name="${name}"]`);el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}document.querySelector(".wf-modal button[type=submit]").click();true');
   await until(()=>appEval(id,'!document.querySelector(".wf-modal")&&!!document.querySelector(".wf-run[open]")'),"Start run did not show the new run");
   let runs=await appEval(id,`window.kai.call("workflows.runs",{workflowId:"${workflow.id}"})`);assert.equal(runs.length,1);assert.deepEqual(runs[0].input,{topic:"Native topic",word_count:1000});
   await until(()=>appEval(id,'!!document.querySelector(".wf-run[open] [data-wf=runAgain]")'),"Native run did not finish");
   await appEval(id,'document.querySelector(".wf-run[open] [data-wf=runAgain]").click();true');
   const inputs=await appEval(id,'[document.querySelector("[name=runInput0]").value,document.querySelector("[name=runInput1]").value]');assert.deepEqual(inputs,["Native topic","1000"]);
   const file=path.join(output,"workflow-run-again.png");await application.evaluate((_electron,{id,file})=>global.__foundationCapture(file,id),{id,file});report.screenshots.push(file);
   await appEval(id,'document.querySelector(".wf-modal button[type=submit]").click();true');
   await until(()=>appEval(id,`window.kai.call("workflows.runs",{workflowId:"${workflow.id}"}).then(r=>r.length===2&&r.every(x=>x.status==="completed"))`),"Run again did not complete a second run");
   runs=await appEval(id,`window.kai.call("workflows.runs",{workflowId:"${workflow.id}"})`);assert.ok(runs.every(r=>r.steps.some(s=>s.output.includes("Native topic"))));
  });