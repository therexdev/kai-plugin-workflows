"use strict";
(() => {
  const host = document.getElementById("view-workflows");
  const sections = [["saved", "My workflows"], ["runs", "Run history"], ["templates", "Templates"], ["discover", "Discover workflows"]];
  let section = "saved", state, navigating = false;
  const manage = (action, input = {}) => window.kai.call("workflows." + action, input);
  function notice(error) {
    let node = host.querySelector(".hub-notice");
    if (!node) { node = document.createElement("div"); node.className = "hub-notice error"; node.setAttribute("role", "alert"); host.prepend(node); }
    node.textContent = error?.message || String(error);
  }
  async function show(next = section) {
    if (navigating) return;
    if (next !== section && !window.KaiWorkflows.canLeave()) return;
    navigating = true;
    try {
      state = await manage("status");
      if (next !== section) window.KaiWorkflows.leave();
      section = next;
      host.replaceChildren();
      const message = document.createElement("div"); message.className = "hub-notice"; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
      const shell = document.createElement("div"); shell.className = "hub-shell";
      const rail = document.createElement("nav"); rail.className = "hub-rail"; rail.setAttribute("aria-label", "workflows sections");
      const label = document.createElement("div"); label.className = "hub-rail-label"; label.textContent = "Workflows"; rail.append(label);
      for (const [key, label] of sections) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.section = key; button.classList.toggle("active", key === section); button.onclick = () => show(key); rail.append(button); }
      const out = document.createElement("main"); out.className = "hub-content"; shell.append(rail, out); host.append(message, shell);
      if (state.locked) { const title = document.createElement("h2"), text = document.createElement("p"); title.textContent = "Your companion data is locked"; text.textContent = "Unlock secure OS storage and reopen Workflows. Saved plugin data has been preserved."; out.append(title, text); return; }
      window.KaiWorkflows.render(out, { state, section, manage, navigate: show });
      window.KaiI18n?.translateDOM?.(host);
    } catch (error) { notice(error); }
    finally { navigating = false; }
  }
  window.addEventListener("beforeunload", event => { if (!window.KaiWorkflows.canLeave()) { event.preventDefault(); event.returnValue = false; } });
  show();
})();
