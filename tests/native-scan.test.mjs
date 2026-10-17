import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createScan,listDirectory} from '../lib/scan-engine.mjs';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const run=(root,options,cancel=false)=>new Promise((resolve,reject)=>{const j=createScan(root,options);j.on('message',m=>{if(m.type==='done')resolve(m);});j.on('error',reject);if(cancel)j.requestCancel();});
test('native 1/4/8 workers match compatible totals and content rules without following junctions',{skip:process.platform!=='win32'},async()=>{
  const root=await fs.mkdtemp(path.join(workspace,'.spacekeeper-test-'));
  try{
    for(let d=0;d<25;d++){const dir=path.join(root,'資料-'+d);await fs.mkdir(dir);for(let f=0;f<12;f++)await fs.writeFile(path.join(dir,`data-${f}.bin`),Buffer.alloc(f+7));}
    await fs.mkdir(path.join(root,'WindowsCopy','System32'),{recursive:true});await fs.mkdir(path.join(root,'WindowsCopy','WinSxS'));
    await fs.symlink(root,path.join(root,'資料-0','loop'),'junction');
    const baseline=await run(root,{engine:'compat'});
    for(const concurrency of [1,4,8]){
      const r=await run(root,{concurrency});assert.equal(r.engine,'native');
      for(const k of ['files','bytes','folders','links','failures'])assert.equal(r[k],baseline[k],`${concurrency} workers: ${k}`);
      const sorted=n=>n.map(x=>[x.path,x.size,x.files,x.errors,x.links,x.contentLock,x.containsLock,x.incomplete]).sort((a,b)=>a[0].localeCompare(b[0]));
      assert.deepEqual(sorted(r.nodes),sorted(baseline.nodes));
    }
    const listed=await listDirectory(path.join(root,'資料-1'));assert.equal(listed.length,12);assert.equal(listed.reduce((a,b)=>a+b.size,0),150);
    const cancelled=await run(root,{concurrency:4},true);assert.ok(cancelled.cancelled);assert.ok(cancelled.nodes.every(n=>n.incomplete));
    const forced=await new Promise((resolve,reject)=>{const j=createScan(root,{concurrency:4});j.on('message',m=>{if(m.type==='done')resolve(m);});j.on('error',reject);j.forceStop();});assert.ok(forced.cancelled);assert.ok(forced.forced);assert.ok(forced.nodes.every(n=>n.incomplete));
  }finally{assert.equal(path.dirname(root),workspace);assert.ok(path.basename(root).startsWith('.spacekeeper-test-'));await fs.rm(root,{recursive:true,force:true});}
});
