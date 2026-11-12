// Native Core verification with a synthetic profile; no wallet or paid models.
const fs = require('node:fs'), Module = require('node:module');
const path = require('node:path');
const coreRoot = path.resolve(process.env.KAI_SMOKE_SOURCE_ROOT || path.join(__dirname, '../../kai-core'));
const harness = path.join(coreRoot, 'scripts/foundation/apps-smoke.js');
const marker = '  const persistent=report.plugins.find';
const checks = fs.readFileSync(__dirname + '/native/run-buttons.fragment.js','utf8') + fs.readFileSync(__dirname + '/native/model-locations.fragment.js','utf8') + fs.readFileSync(__dirname + '/native/json-output.fragment.js','utf8') + fs.readFileSync(__dirname + '/native/research-recovery.fragment.js','utf8') + fs.readFileSync(__dirname + '/native/terminal-recovery.fragment.js','utf8') + fs.readFileSync(__dirname + '/native/quality.fragment.js','utf8');
let source=fs.readFileSync(harness,'utf8');
if(!source.includes(marker))throw Error('Native smoke insertion point changed');
source=source.replace(marker,checks+marker);
source=source.replace("async function check(name,run){try{await run();", "async function check(name,run){try{await new Promise(resolve=>setTimeout(resolve,1100));await run();");
const m=new Module(harness,module);m.filename=harness;m.paths=Module._nodeModulePaths(require('node:path').dirname(harness));m._compile(source,harness);
