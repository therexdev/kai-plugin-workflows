  await check("Quality rules and continuation mode work in the native canvas; AIO template loads",async()=>{
    const id="kai.workflows";
    const result=await appEval(id,`(async()=>{
      const imported=window.KaiWorkflowModel.template('aio');
      const report=window.KaiWorkflowModel.validateGraph(imported.graph);
      if(report.errors.length)throw Error(JSON.stringify(report.errors));
      const state=await window.kai.call('workflows.status',{});
      const host=document.querySelector('.wf-workspace').parentElement;
      window.KaiWorkflows.render(host,{state,section:'templates',manage:(action,input={})=>window.kai.call('workflows.'+action,input),navigate:async()=>{}});
      document.querySelector('[data-wf=template][data-id=aio]').click();
      return {nodeIds:imported.graph.nodes.map(n=>n.id),hasQuality:!!window.KaiWorkflowQuality,hasTemplate:!!document.querySelector('[data-wf=template][data-id=aio]')};
    })()`);
    const expected=JSON.parse(fs.readFileSync(path.join(sources,'kai-plugin-workflows/plugin/templates/aio-article.workflow.json'),'utf8')).workflow.graph;
    assert.deepEqual(result.nodeIds,expected.nodes.map(n=>n.id));assert.equal(result.hasQuality,true);
    await until(()=>appEval(id,'!!document.querySelector("[data-node=section_review_checks]")'),"AIO template did not open");
    await appEval(id,'document.querySelector("[data-node=section_review_checks]").click();true');
    const checkFields=await appEval(id,'({field:document.querySelector("[data-field=\\\"config.rules.2.sources\\\"]")?.value,onFailure:document.querySelector("[data-field=\\\"config.onFailure\\\"]")?.value})');
    assert.equal(checkFields.field,'=item.context.sources');assert.equal(checkFields.onFailure,'report');
    await appEval(id,'document.querySelector("[data-wf=qualityAdd]").click();true');
    assert.equal(await appEval(id,'!!document.querySelector("[data-field=\\\"config.rules.4.type\\\"]")'),true);
    await appEval(id,'document.querySelectorAll("[data-wf=qualityRemove]")[4].click();document.querySelector("[data-node=writer]").click();true');
    assert.equal(await appEval(id,'document.querySelector("[data-field=\\\"config.continuationMode\\\"]").value'),'overlap');
    await appEval(id,'document.querySelector("[data-wf=save]").click();true');
    await until(async()=>{const notice=await appEval(id,'document.querySelector(".wf-notice")?.textContent');if(notice && !notice.includes("Saving") && !notice.includes("Workflow saved"))throw Error("Quality workflow save: "+notice);return notice?.includes("Workflow saved");},"Quality workflow save failed");
    const state=await appEval(id,'window.kai.call("workflows.status",{})');
    assert.equal(state.workflows.find(w=>w.name==='AIO researched article · reviewed').graph.nodes.find(n=>n.id==='section_review_checks').config.rules.length,4);
    const file=path.join(output,'workflow-aio-quality.png');await application.evaluate((_electron,{id,file})=>global.__foundationCapture(file,id),{id,file});report.screenshots.push(file);
  });
