"use strict";
const { CompanionError } = require("./companion-store");

async function withDeadline(parent, milliseconds, message, operation) {
  const controller = new AbortController(), signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(() => controller.abort(new CompanionError(message)), milliseconds);
  timer.unref?.();
  try {
    signal.throwIfAborted();
    // Keep the credit queue occupied until Core settles, even after abort.
    // Releasing it early could overlap a request and its financial recovery.
    const result = await operation(signal);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error;
  } finally { clearTimeout(timer); }
}
module.exports = { withDeadline };
