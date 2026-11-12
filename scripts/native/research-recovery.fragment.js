  await check("Agent ten-minute deadline saves through the native builder",async()=>{
    const id="kai.workflows";
    await appEval(id,`(()=>{const e=document.querySelector('[data-field="config.timeoutSeconds"]');if(!e)throw Error('Missing deadline');e.closest('details').open=true;e.value='600';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-wf=save]').click();return true})()`);
    await until(()=>appEval(id,'document.querySelector(".wf-notice")?.textContent.includes("Workflow saved")'),"Timeout setting did not save");
    const state=await appEval(id,'window.kai.call("workflows.status",{})'), workflow=state.workflows.find(w=>w.name==="Native model locations");
    assert.equal(workflow.graph.nodes.find(n=>n.id==="agent").config.timeoutSeconds,600);
  });
  await check("Retry failed work reaches native review and cancellation preserves the run",async()=>{
    const id="kai.workflows";
    const workflow=await appEval(id,`window.kai.call("workflows.workflow",{name:"Native failed research",graph:{version:2,nodes:[{id:"start",type:"trigger",label:"Start",config:{kind:"manual"}},{id:"kept",type:"output",label:"Completed work",config:{text:"Keep this result"}},{id:"research",type:"web_research",label:"Research",config:{query:"AI training",topic:"AI",maxPages:1}}],edges:[{from:"start",to:"kept",port:"main",input:"main"},{from:"kept",to:"research",port:"main",input:"main"}]}})`);
    const run=await appEval(id,`window.kai.call("workflows.run",{id:"${workflow.id}",input:"Topic"})`);
    await until(()=>appEval(id,`window.kai.call("workflows.runGet",{id:"${run.id}"}).then(r=>r.status==="failed")`),"Local-Only research fixture did not stop");
    await appEval(id,'document.querySelector("[data-section=runs]").click();true');
    await until(()=>appEval(id,"!!document.querySelector('[data-field=runWorkflow]')"),"Run filters not ready");
    await appEval(id,"(()=>{const e=document.querySelector('[data-field=runWorkflow]');e.value='';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
    await until(()=>appEval(id,`!!document.querySelector('[data-wf="retryRun"][data-id="${run.id}"]')`),"Retry control was not shown");
    await appEval(id,`document.querySelector('[data-run="${run.id}"]').open=true;document.querySelector('[data-wf="retryRun"][data-id="${run.id}"]').click();true`);
    await until(()=>application.evaluate(()=>global.__foundationSmoke.dialogs.some(d=>/Retry failed work/.test(d.message||d.title))),"Retry did not reach native review");
    const saved=await appEval(id,`window.kai.call("workflows.runGet",{id:"${run.id}"})`);
    assert.equal(saved.status,"failed");assert.equal(saved.steps.length,3);assert.match(saved.steps[1].output,/Keep this result/);assert.equal(saved.retryHistory,undefined);
    const file=path.join(output,"workflow-retry-failed-work.png");await application.evaluate((_electron,{id,file})=>global.__foundationCapture(file,id),{id,file});report.screenshots.push(file);
  });
