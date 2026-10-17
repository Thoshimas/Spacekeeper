import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
async function fixture(){return fs.mkdtemp(path.join(workspace,'.spacekeeper-test-'));}
async function cleanup(p){assert.equal(path.dirname(p),workspace);assert.ok(path.basename(p).startsWith('.spacekeeper-test-'));await fs.rm(p,{recursive:true,force:true});}
async function scan(root,cancelled=false){
  const cancel=new SharedArrayBuffer(4);if(cancelled)Atomics.store(new Int32Array(cancel),0,1);
  const w=new Worker(new URL('../lib/scan-worker.mjs',import.meta.url),{workerData:{root,cancel}});
  return new Promise((resolve,reject)=>{w.on('message',m=>{if(m.type==='done')resolve(m);});w.on('error',reject);});
}
test('nested scan aggregates exact logical bytes, Unicode and empty folders',async()=>{
  const root=await fixture();try{
    await fs.mkdir(path.join(root,"資料 & '筆記'"));await fs.mkdir(path.join(root,'empty'));
    await fs.writeFile(path.join(root,'a.bin'),Buffer.alloc(123));await fs.writeFile(path.join(root,"資料 & '筆記'",'b.bin'),Buffer.alloc(321));
    const r=await scan(root);assert.equal(r.bytes,444);assert.equal(r.files,2);assert.equal(r.nodes.find(n=>n.path===root).size,444);assert.equal(r.nodes.find(n=>n.name==='empty').size,0);
  }finally{await cleanup(root);}
});
test('directory junctions are skipped and cannot create cycles or double counting',async()=>{
  const root=await fixture();try{
    await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data','a'),Buffer.alloc(100));await fs.symlink(root,path.join(root,'data','loop'),'junction');
    const r=await scan(root);assert.equal(r.bytes,100);assert.equal(r.links,1);assert.equal(r.nodes.length,2);assert.ok(r.nodes[0].incomplete);
  }finally{await cleanup(root);}
});
test('cancellation never presents partial folder totals as complete',async()=>{
  const root=await fixture();try{const r=await scan(root,true);assert.ok(r.cancelled);assert.ok(r.nodes.every(n=>n.incomplete));}finally{await cleanup(root);}
});
test('content signatures protect their own subtree without contaminating sibling folders',async()=>{
  const root=await fixture();try{
    await fs.mkdir(path.join(root,'CopyWindows','System32'),{recursive:true});await fs.mkdir(path.join(root,'CopyWindows','WinSxS'));
    await fs.mkdir(path.join(root,'Documents'));
    const r=await scan(root);
    assert.ok(r.nodes.find(n=>n.name==='CopyWindows').contentLock);
    assert.ok(r.nodes.find(n=>n.path===root).containsLock);
    assert.equal(r.nodes.find(n=>n.path===root).contentLock,null);
    assert.equal(r.nodes.find(n=>n.name==='Documents').contentLock,null);
  }finally{await cleanup(root);}
});
