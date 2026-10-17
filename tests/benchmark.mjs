import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createScan,ensureFastScanner} from '../lib/scan-engine.mjs';
const appDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=process.argv[2];if(!root)throw new Error('Pass an explicit local benchmark folder. This benchmark only reads metadata.');
const run=(options)=>new Promise((resolve,reject)=>{
  const started=performance.now(),j=createScan(root,options);let last=0;
  const timeout=setTimeout(()=>j.requestCancel(),60000);
  j.on('message',m=>{
    if(m.type==='progress'&&performance.now()-last>5000){last=performance.now();console.log(JSON.stringify({progress:true,engine:m.engine||options.engine||'native',workers:options.concurrency||1,files:m.files,folders:m.folders,seconds:Math.round((performance.now()-started)/1000)}));}
    if(m.type==='done'){clearTimeout(timeout);resolve({engine:m.engine||options.engine,workers:options.engine==='compat'?1:options.concurrency,ms:Math.round(performance.now()-started),files:m.files,folders:m.folders,bytes:m.bytes,errors:m.failures,links:m.links,cancelled:!!m.cancelled});}
  });j.on('error',e=>{clearTimeout(timeout);reject(e);});
});
await ensureFastScanner();
console.log('Read-only metadata benchmark; warming filesystem caches.');
await run({engine:'native',concurrency:4});
const results=[];
for(const options of [{engine:'compat'},{concurrency:1},{concurrency:4},{concurrency:8},{engine:'compat'},{concurrency:4}]){const r=await run(options);results.push(r);console.log(JSON.stringify(r));}
await fs.writeFile(path.join(appDir,'.runtime','benchmark-v1.1.json'),JSON.stringify({root,at:new Date().toISOString(),notes:'Warm filesystem caches; background applications may change counts. Includes process startup, traversal, serialization and IPC. Excludes first compilation and web view indexing.',results},null,2));
