"use strict";
const fs=require("node:fs");
const {CompanionError}=require("./companion-store");
async function savedWorkflow(service,ctx,input){const prepared=await service.workflowEvents.prepareWorkflow(input,ctx.signal);const grant=service.needsChatGrant(prepared);const saved=service.workflows.save({...prepared,...(grant?{enabled:false}:{})});if(grant){await service.grantChat(saved,ctx.signal);if(input.enabled)service.workflows.setEnabled(saved.id,true);}return service.store.data.workflows.find(w=>w.id===saved.id);}
async function manage(service,ctx,action,input={}){if(action==="status")return service.status();service.store.requireStorage();switch(action){
      case "workflow": return savedWorkflow(service,ctx,input);
      case "workflowValidate": return service.workflows.validate(input);
      case "workflowAssist": return service.workflowAssistant.ask(input, ctx.signal);
      case "workflowDiscoverySettings": return service.workflowAssistant.configure(input);
      case "workflowDiscover": return service.workflowAssistant.ask(input, ctx.signal, true);
      case "workflowDismiss": return service.store.change(d => { if (d.workflowState) { const s = (d.workflowState.suggestions || []).find(s => s.id === input.id); if (s) d.workflowState.dismissed = [...(d.workflowState.dismissed || []), s.name.toLowerCase()].slice(-50); d.workflowState.suggestions = (d.workflowState.suggestions || []).filter(s => s.id !== input.id); } });
      case "workflowDraft": return service.workflows.save(input, { draft: true });
      case "workflowEventTypes": return service.workflowEvents.types(input.connectionId, ctx.signal);
      case "workflowEnabled": {
        const w = service.store.data.workflows.find(w => w.id === input.id);
        if (input.enabled && w?.graph?.nodes.some(n => n.type === "trigger" && n.config.kind === "app_event")) return savedWorkflow(service,ctx,{ ...w, enabled: true });
        if(input.enabled && service.needsChatGrant(w)) await service.grantChat(w,ctx.signal);
        return service.workflows.setEnabled(input.id, input.enabled);
      }
      case "workflowPreview": return service.workflows.begin(input.id, input.input, "preview", { dryRun: true });
      case "workflowReject": return service.workflows.decide(input.id, "rejected");
      case "removeWorkflow": return service.workflows.remove(input.id);
      case "run": return service.workflows.begin(input.id, input.input);
      case "cancelRun": return service.workflows.cancel(input.id);
      case "resume": {
        const run = service.workflows.get(input.id); if (!run) throw new CompanionError("Run no longer exists.");
        if (!await ctx.confirm("Resume " + run.name, run.pending || { nextStep: run.index + 1 })) throw new CompanionError("Run remains paused.");
        ctx.signal.throwIfAborted(); return service.workflows.resume(input.id);
      }
      case "exportWorkflow": {
        const w = service.store.data.workflows.find(w => w.id === input.id); if (!w) throw new CompanionError("Workflow no longer exists.");
        const result = await ctx.dialog.showSaveDialog(ctx.window, { title: "Export workflow", defaultPath: "KAI-Workflow.json", filters: [{ name: "Workflow", extensions: ["json"] }] });
        ctx.signal.throwIfAborted(); if (!result.canceled && result.filePath) { const { id: _id, ...spec } = w; fs.writeFileSync(result.filePath, JSON.stringify({ ...spec, enabled: false }, null, 2), { mode: 0o600 }); } return !result.canceled;
      }
      case "importWorkflow": {
        const result = await ctx.dialog.showOpenDialog(ctx.window, { properties: ["openFile"], filters: [{ name: "KAI workflow", extensions: ["json"] }] });
        ctx.signal.throwIfAborted(); if (result.canceled || !result.filePaths[0]) return null;
        if (fs.statSync(result.filePaths[0]).size > 160000) throw new CompanionError("Workflow file is too large.");
        const spec = require("../workflow-model").importDocument(JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"))); delete spec.id; return service.workflows.save(spec, { draft: true });
      }

 default:throw new CompanionError("Unknown Workflows action.");}}

module.exports={manage};
