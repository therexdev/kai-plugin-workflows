"use strict";
function computeNext(schedule, from = new Date()) {
  const s = schedule || {};
  if (s.kind === "hourly") return new Date(from.getTime() + 3600e3);
  if (s.kind === "every6h") return new Date(from.getTime() + 6 * 3600e3);
  const hour = Number.isInteger(s.hour) ? s.hour : 9;
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(hour);
  if (s.kind === "daily") {
    if (d <= from) d.setDate(d.getDate() + 1);
    return d;
  }
  if (s.kind === "weekly") {
    const day = Number.isInteger(s.day) ? s.day : 1; // 0=Sun … 6=Sat
    while (d.getDay() !== day || d <= from) d.setDate(d.getDate() + 1);
    return d;
  }
  throw new Error(`unknown schedule kind: ${s.kind}`);
}
module.exports={computeNext};
