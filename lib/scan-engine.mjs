import {EventEmitter} from 'node:events';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Worker} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {shell} from './windows.mjs';
import {storagePaths} from './storage.mjs';
const appDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let buildPromise;
const exec=promisify(execFile);
export async function listDirectory(root){
  const executable=await ensureFastScanner();
  const {stdout}=await exec(executable,[root,'1','list'],{windowsHide:true,maxBuffer:128*1024*1024,timeout:60000});
  const result=JSON.parse(stdout.replace(/^\uFEFF/,''));if(result.type==='fatal')throw new Error(result.error);return result.rows;
}
export async function ensureFastScanner(){
  if(!buildPromise)buildPromise=(async()=>{
    const code=await fs.readFile(path.join(appDir,'native/FastScanner.cs'));
    try{
      const manifest=JSON.parse(await fs.readFile(path.join(appDir,'native/scanner-manifest.json'),'utf8'));
      const prebuilt=path.join(appDir,'native/FastScanner.exe');
      if(manifest.sourceSha256===crypto.createHash('sha256').update(code).digest('hex')&&manifest.binarySha256===crypto.createHash('sha256').update(await fs.readFile(prebuilt)).digest('hex'))return prebuilt;
    }catch{}
    const hash=crypto.createHash('sha256').update(code).digest('hex').slice(0,20);
    const dir=storagePaths(appDir).runtimeDir;await fs.mkdir(dir,{recursive:true});
    const executable=path.join(dir,`scanner-${hash}.exe`);
    try{await fs.access(executable);return executable;}catch{}
    const temporary=path.join(dir,`scanner-build-${process.pid}-${crypto.randomUUID()}.exe`);
    try{
      await shell('compileScan',{output:temporary},60000);
      try{await fs.rename(temporary,executable);}catch(e){try{await fs.access(executable);await fs.unlink(temporary);}catch{throw e;}}
      return executable;
    }catch(e){await fs.unlink(temporary).catch(()=>{});throw e;}
  })().catch(e=>{buildPromise=null;throw e;});
  return buildPromise;
}
export function createScan(root,{concurrency=4,engine='native'}={}){
  const job=new EventEmitter();let cancelled=false,child=null,compat=null,flag=null,settled=false,cancelTimer=null;
  const done=summary=>{
    if(settled)return;settled=true;clearTimeout(cancelTimer);
    job.emit('message',{...summary,type:'done'});job.emit('exit',0);
  };
  const failed=error=>{if(settled)return;settled=true;clearTimeout(cancelTimer);job.emit('error',error);job.emit('exit',1);};
  const partial=forced=>({nodes:[{path:root,parent:null,name:path.basename(root)||root,size:0,files:0,errors:0,links:0,incomplete:true,contentLock:null,containsLock:null}],files:0,bytes:0,folders:1,links:0,failures:0,errors:[],skipped:[],cancelled:true,forced,partialReason:forced?'掃描器未及時回應停止，已結束背景工作；只有已確認的部分結果，請重新掃描。':null});
  job.forceStop=()=>{
    if(settled)return;
    done(partial(true));
    if(child&&!child.killed)child.kill();
    if(compat)void compat.terminate();
  };
  job.requestCancel=()=>{
    if(settled)return;cancelled=true;
    if(flag)Atomics.store(flag,0,1);
    if(child&&!child.killed)child.stdin.write('cancel\n',()=>{});
    if(!cancelTimer)cancelTimer=setTimeout(job.forceStop,5000);
  };
  const fallback=reason=>{
    const cancel=new SharedArrayBuffer(4);flag=new Int32Array(cancel);if(cancelled)Atomics.store(flag,0,1);
    job.emit('message',{type:'progress',engine:'compat',concurrency:1,phase:'scanning',fallbackReason:reason||null});
    compat=new Worker(new URL('./scan-worker.mjs',import.meta.url),{workerData:{root,cancel},execArgv:[]});
    compat.on('message',m=>{if(settled)return;if(m.type==='done')done(m);else job.emit('message',m);});
    compat.on('error',failed);compat.on('exit',c=>{if(!settled)failed(new Error(`相容掃描程序提前結束 (${c})。`));});
  };
  setImmediate(async()=>{
    try{
      if(settled)return;
      if(cancelled){done(partial(false));return;}
      if(engine==='compat'||process.platform!=='win32'){fallback();return;}
      job.emit('message',{type:'progress',engine:'native',concurrency,phase:'starting'});
      let executable;
      try{executable=await ensureFastScanner();}catch(e){if(!settled)fallback(e.message);return;}
      if(settled)return;
      if(cancelled){done(partial(false));return;}
      const nodes=[];let complete=null,fatal=null,stderr='';
      child=spawn(executable,[root,String(concurrency)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      child.stdin.on('error',()=>{});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
      job.emit('message',{type:'progress',phase:'scanning'});
      createInterface({input:child.stdout}).on('line',line=>{
        if(settled)return;
        try{const m=JSON.parse(line);if(m.type==='batch')nodes.push(...m.nodes);else if(m.type==='complete')complete=m;else if(m.type==='fatal')fatal=m.error;else job.emit('message',m);}
        catch{fatal='快速掃描器回傳了無法讀取的資料。';}
      });
      child.on('error',e=>{fatal=e.message;});
      child.on('close',code=>{
        if(settled)return;
        if(code===0&&complete&&!fatal)done({...complete,nodes,engine:'native',concurrency});
        else failed(new Error(fatal||'快速掃描器未能完成。'+stderr));
      });
      if(cancelled)job.requestCancel();
    }catch(e){failed(e);}
  });
  return job;
}
