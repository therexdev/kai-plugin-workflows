"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
class CompanionError extends Error {}
const copy=v=>v===undefined?undefined:structuredClone(v),id=()=>crypto.randomUUID();
function text(v,max,label="Text"){if(typeof v!=="string"||!v.trim()||v.length>max)throw new CompanionError(`${label} is required (maximum ${max} characters).`);return v.trim();}
function matches(v,shape){if(Array.isArray(shape))return Array.isArray(v);if(shape&&typeof shape==="object")return !!v&&typeof v==="object"&&!Array.isArray(v)&&Object.entries(shape).every(([k,x])=>matches(v[k],x));return typeof v===typeof shape;}
class ScopedStore {
 constructor({dataDir,safeStorage},initial){this.file=path.join(dataDir,"state.json");this.storage=safeStorage;this.locked=false;this.data=copy(initial);this.revision=null;fs.mkdirSync(dataDir,{recursive:true,mode:0o700});try{const b=this.bytes();if(b){this.requireStorage();const envelope=JSON.parse(b);if(envelope.version!==1||typeof envelope.encrypted!=="string")throw Error("Invalid storage");const saved=JSON.parse(this.storage.decryptString(Buffer.from(envelope.encrypted,"base64")));if(saved.version!==1||!matches(saved,initial))throw Error("Invalid storage");this.data=saved;this.revision=this.hash(b);}}catch(e){this.locked=true;this.loadError=e.message;}}
 hash(b){return b===null?null:crypto.createHash("sha256").update(b).digest("hex");}
 bytes(){let s;try{s=fs.lstatSync(this.file);}catch(e){if(e.code==="ENOENT")return null;throw e;}if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>36*1024*1024)throw Error("Unsafe plugin state file; original preserved");return fs.readFileSync(this.file);}
 available(){return this.storage.isEncryptionAvailable()&&this.storage.getSelectedStorageBackend?.()!=="basic_text";}
 requireStorage(){if(this.locked||!this.available())throw new CompanionError("Unlock secure OS storage and reopen this app. Saved plugin data has been preserved.");}
 change(fn){this.requireStorage();if(this.hash(this.bytes())!==this.revision)throw Error("Plugin state changed outside this app. Reopen before editing.");const next=copy(this.data),result=fn(next);this.beforeCommit?.(next);const raw=JSON.stringify(next);if(Buffer.byteLength(raw)>24*1024*1024)throw Error("Plugin data exceeds 24 MB. Export and remove older records.");const out=JSON.stringify({version:1,encrypted:this.storage.encryptString(raw).toString("base64")}),tmp=this.file+"."+id()+".tmp";try{fs.writeFileSync(tmp,out,{flag:"wx",mode:0o600});if(this.hash(this.bytes())!==this.revision)throw Error("Plugin state changed while saving");fs.renameSync(tmp,this.file);this.revision=this.hash(Buffer.from(out));this.data=next;}finally{fs.rmSync(tmp,{force:true});}return copy(result);}
}
module.exports={ScopedStore,CompanionError,copy,id,text};
