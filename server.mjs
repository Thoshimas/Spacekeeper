import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createScan,listDirectory} from './lib/scan-engine.mjs';
import { fileURLToPath } from 'node:url';
import { localPath, makePolicy, key, within, contentReason, suggestion } from './lib/policy.mjs';
import { machineInfo, shell, openWindow } from './lib/windows.mjs';
import {createViewIndex} from './lib/view-index.mjs';
import {createConnectionLog,validRequestId} from './lib/connection-log.mjs';
import {ScanIndex} from './lib/scan-index.mjs';
import {normalizeLanguage,translateResponse} from './public/i18n.mjs';
import {storagePaths,preferredLanguage,saveLanguage} from './lib/storage.mjs';

export const appDir=path.dirname(fileURLToPath(import.meta.url));
export const storage=storagePaths(appDir);
const publicDir=path.join(appDir,'public');
const secret=crypto.randomBytes(32).toString('hex');
const version=JSON.parse(fs.readFileSync(path.join(appDir,'package.json'),'utf8')).version;
const instanceId=crypto.randomUUID(),serviceStarted=Date.now();
const connectionLog=createConnectionLog(storage.runtimeDir);
let info={admin:false,drives:[],installs:[]}, policy, worker, scanIndex, currentScan=null, index=new Map(), busy=false;
let activity=[], tickets=new Map(),decorated=new Map(),pageCache=new Map(),viewCache=new Map();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const identityOf=async p=>{
  const s=await fsp.lstat(p,{bigint:true});
  return [s.dev,s.ino,s.birthtimeNs,s.mtimeNs,s.size].map(String);
};
const serializeError=e=>e.code==='EACCES'||e.code==='EPERM'?'權限不足或檔案使用中。可先關閉相關程式，或申請管理員模式後重試。':e.message;
const audit=async entry=>{
  activity.unshift({time:new Date().toISOString(),...entry}); activity=activity.slice(0,100);
  try { await fsp.mkdir(storage.dataDir,{recursive:true});await fsp.appendFile(storage.activityFile,JSON.stringify(activity[0])+'\n','utf8'); }
  catch { /* Operation results remain visible even if the portable folder is read-only. */ }
};
function resetPolicy() {
  policy=makePolicy({appDir,installLocations:info.installs,extraProtected:[...(storage.installed?[]:[path.resolve(appDir,'../../sources'),path.resolve(appDir,'../../.git'),path.resolve(appDir,'../../.agents')]),storage.dataDir]});
  decorated.clear();pageCache.clear();viewCache.clear();
}
export async function canonical(input,{directory=false}={}) {
  const p=localPath(input);
  let cursor=path.parse(p).root;
  for(const segment of p.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor=path.join(cursor,segment);
    if((await fsp.lstat(cursor)).isSymbolicLink()) throw fail('連結或接合點不可作為管理或掃描路徑。');
  }
  const stat=await fsp.lstat(p);
  if(directory && !stat.isDirectory()) throw fail('請選擇資料夾。');
  const resolved=await fsp.realpath(p);
  // A different long/short path, mapped junction, or alias must never weaken policy.
  const reason=policy.reason(p)||policy.reason(resolved);
  return {path:resolved,stat,reason};
}
const lockReason=n=>{
  if(Object.hasOwn(n,'inheritedLock'))return policy.reason(n.path)||n.contentLock||n.containsLock||n.inheritedLock||(n.isLink?'連結或接合點固定保護':n.system?'Windows System 屬性固定保護':null);
  let inherited=currentScan?.ancestorLock;
  for(let cursor=path.dirname(n.path);currentScan&&within(cursor,currentScan.root);cursor=path.dirname(cursor)){
    inherited ||= index.get(key(cursor))?.contentLock;
    if(key(cursor)===key(path.parse(cursor).root))break;
  }
  return policy.reason(n.path)||n.contentLock||n.containsLock||inherited||(n.isLink?'連結或接合點固定保護':n.system?'Windows System 屬性固定保護':null);
};
const decorate=(n,knownLock)=>{
  const cacheable=currentScan?.state!=='scanning',cached=cacheable?decorated.get(key(n.path)):null;if(cached)return cached;
  const locked=knownLock===undefined?lockReason(n):knownLock;
  const result={...n,locked,suggestion:suggestion({...n,locked})};if(cacheable)decorated.set(key(n.path),result);return result;
};
async function ancestorContentReason(p){
  // The profile is a trust boundary, not an installation directory. Inspect the
  // relevant ancestors inside it without requiring enumeration of its siblings.
  const boundary=within(p,policy.home)?policy.home:path.parse(p).root;
  for(let cursor=path.dirname(p);within(cursor,boundary)&&key(cursor)!==key(boundary);cursor=path.dirname(cursor)){
    const names=await fsp.readdir(cursor),reason=contentReason(names);
    if(reason)return '上層資料夾'+reason;
  }
  return null;
}
async function startScan(input,concurrency=4) {
  if(busy || worker) throw fail('目前有掃描或管理操作正在進行。',409);
  busy=true;
  try {
  const c=await canonical(input,{directory:true});
  index=new Map();scanIndex=null; tickets.clear();decorated.clear();pageCache.clear();viewCache.clear();
  let ancestorLock=null;
  try{ancestorLock=await ancestorContentReason(c.path);}catch{ancestorLock='上層目錄無法完成內容檢查';}
  concurrency=[1,2,4,8].includes(Number(concurrency))?Number(concurrency):4;
  currentScan={id:crypto.randomUUID(),revision:0,root:c.path,state:'scanning',phase:'starting',concurrency,engine:'native',started:Date.now(),files:0,bytes:0,folders:0,links:0,failures:0,current:c.path,errors:[],stale:false,ancestorLock};
  worker=createScan(c.path,{concurrency});
  const activeWorker=worker;
  activeWorker.on('message',async msg=>{
    if(worker!==activeWorker)return;
    if(msg.type==='progress') {
      if(msg.files!==undefined&&(msg.files!==currentScan.files||msg.folders!==currentScan.folders||msg.failures!==currentScan.failures||msg.links!==currentScan.links))currentScan.lastChange=Date.now();
      Object.assign(currentScan,msg,{lastProgress:Date.now()});
    }
    if(msg.type==='done') {
      const {nodes,...summary}=msg;
      currentScan.phase='indexing';
      currentScan.indexTotal=nodes.length;currentScan.indexProcessed=0;
      for(let i=0;i<nodes.length;i+=1000){
        for(const n of nodes.slice(i,i+1000)){
          const parentNode=n.parent?index.get(key(n.parent)):null;
          n.inheritedLock=currentScan.ancestorLock||parentNode?.contentLock||parentNode?.inheritedLock||null;
          if(currentScan.cancelRequested)n.incomplete=true;
          index.set(key(n.path),n);
        }
        currentScan.indexProcessed=Math.min(i+1000,nodes.length);currentScan.lastProgress=Date.now();await new Promise(setImmediate);
      }
      if(currentScan.cancelRequested)summary.cancelled=true;
      scanIndex=await new ScanIndex(index,currentScan.root,currentScan.ancestorLock).initialize();
      Object.assign(currentScan,summary,{state:msg.cancelled?'cancelled':'done',finished:Date.now()});
      if(summary.cancelled)currentScan.state='cancelled';
      currentScan.phase=summary.cancelled?'cancelled':'complete';
      worker=null;
    }
  });
  activeWorker.on('error',e=>{if(worker===activeWorker){currentScan.state='error';currentScan.finished=Date.now();currentScan.error=e.message;worker=null;}});
  activeWorker.on('exit',code=>{ if(code!==0&&worker===activeWorker&&currentScan.phase!=='indexing'&&currentScan.state==='scanning'){currentScan.state='error';currentScan.finished=Date.now();currentScan.error=`掃描程序結束 (${code})`;worker=null;} });
  return {scan:currentScan};
  }finally{busy=false;}
}
async function browse(input) {
  if(!currentScan || !['scanning','done','cancelled'].includes(currentScan.state)) throw fail('請先選擇掃描範圍。');
  const p=localPath(input || currentScan.root);
  if(!within(p,currentScan.root)) throw fail('路徑超出本次掃描範圍。',403);
  if(currentScan.rootRemoved)return {node:decorate({path:currentScan.root,name:path.basename(currentScan.root),size:0,files:0,missing:true}),rows:[],scan:currentScan};
  const pending=currentScan.state==='scanning';
  const node=index.get(key(p))||(pending?{path:p,parent:key(p)===key(currentScan.root)?null:path.dirname(p),name:path.basename(p)||p,size:0,files:0,incomplete:true,pendingSize:true}:null);
  if(!node) throw fail('掃描紀錄中找不到此資料夾，請重新掃描。');
  const scan=currentScan,revision=scan.revision,c=await canonical(p,{directory:true});
  if(!pending&&pageCache.has(key(p)))return {...pageCache.get(key(p)),scan:currentScan};
  const rows=[];
  let listed;
  try{listed=await listDirectory(c.path);}catch{
    const entries=await fsp.readdir(c.path,{withFileTypes:true});listed=[];
    for(let i=0;i<entries.length;i+=32){listed.push(...await Promise.all(entries.slice(i,i+32).map(async e=>{const full=path.join(c.path,e.name);try{const s=await fsp.lstat(full);return {path:full,name:e.name,size:s.isFile()?s.size:0,files:s.isFile()?1:0,isFile:s.isFile(),isLink:s.isSymbolicLink(),incomplete:!s.isFile(),errors:0,links:s.isSymbolicLink()?1:0};}catch{return {path:full,name:e.name,size:0,files:0,incomplete:true,errors:1};}})));}
  }
  for(const e of listed) {
    const full=path.join(c.path,e.name), known=index.get(key(full));
    if(known){rows.push(decorate(known));continue;}
    rows.push(decorate({...e,parent:c.path,pendingSize:pending&&!e.isFile&&!e.isLink}));
  }
  if(currentScan!==scan||scan.revision!==revision)throw fail('資料夾紀錄已更新，請重新開啟此頁。',409);
  if(pending&&currentScan.state!=='scanning')return browse(p);
  const result={node:decorate(node),rows};if(!pending)pageCache.set(key(p),result);return {...result,scan:currentScan};
}
async function viewRows(kind){
  if(currentScan?.state==='scanning')return {rows:[],pending:true,phase:'scan',scanId:currentScan.id,scanState:currentScan.state};
  if(currentScan?.state==='error')throw fail(currentScan.error||'掃描失敗，請重新選擇範圍。');
  if(!currentScan)return {rows:[],pending:false,phase:'empty'};
  let task=viewCache.get(kind);
  if(!task){
    const scan=currentScan;
    task=createViewIndex({nodes:index.values(),total:index.size,kind,decorate,isCurrent:()=>currentScan===scan&&viewCache.get(kind)===task,
      eligible:n=>{
        const score=kind==='suggestions'?suggestion({...n,locked:null}).score:0;
        if(kind==='suggestions'&&(score<50||n.size<=0))return null;
        const locked=lockReason(n);
        return (kind==='suggestions'?!locked:!!locked)?{locked,score}:null;
      }});
    viewCache.set(kind,task);
  }
  if(task.state==='error'){viewCache.delete(kind);throw fail('整理頁面失敗：'+task.error);}
  return {rows:task.rows,pending:task.state==='building',phase:task.phase,processed:task.processed,total:task.total,matched:task.matched,started:task.started,scanId:currentScan.id,scanState:currentScan.state};
}
async function inspectTree(root) {
  const ancestorLock=await ancestorContentReason(root);
  if(ancestorLock)throw fail(ancestorLock,403);
  const pending=[root]; let count=0;
  while(pending.length) {
    const p=pending.pop(),s=await fsp.lstat(p);
    if(s.isSymbolicLink()) throw fail('目標包含連結或接合點，為避免修改到其他位置，已鎖定。');
    const reason=policy.reason(p); if(reason) throw fail(reason,403);
    if(s.isDirectory()) {
      const entries=await fsp.readdir(p,{withFileTypes:true}), content=contentReason(entries.map(e=>e.name));
      if(content) throw fail(content,403);
      for(const e of entries) pending.push(path.join(p,e.name));
    }
    if(++count>300000) throw fail('此目標超過 300,000 個項目的管理檢查上限。請改選較小的子資料夾。');
  }
  await shell('inspect',{path:root},180000);
}
function validName(name) {
  if(typeof name!=='string' || !name || name.length>240 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name==='.' || name==='..') throw fail('名稱包含 Windows 禁用字元或保留名稱。');
  return name;
}
async function prepare(body) {
  if(busy||worker) throw fail('請先等候目前的工作完成。',409);
  if(!currentScan || currentScan.state!=='done' || currentScan.stale||currentScan.rootRemoved) throw fail('請先完成完整掃描，或更新未完成的操作結果。',409);
  if(!['rename','move','recycle'].includes(body.action)) throw fail('不支援的操作。');
  busy=true;
  try {
    const c=await canonical(body.path);
    if(!within(c.path,currentScan.root)) throw fail('路徑超出本次掃描範圍。',403);
    if(c.reason) throw fail(c.reason,403);
    await inspectTree(c.path);
    let destination=null,name=body.name,target=null;
    if(body.action==='rename') {
      name=validName(name); destination=path.dirname(c.path); target=path.join(destination,name);
    }
    if(body.action==='move') {
      const d=await canonical(body.destination,{directory:true});
      destination=d.path; name=path.basename(c.path); target=path.join(destination,name);
      if(within(destination,c.path)) throw fail('不能移到自己或自己的子資料夾。');
    }
    if(target) {
      if(policy.reason(target)) throw fail('新路徑受到保護。',403);
      try { await fsp.lstat(target); throw fail('目的位置已有同名項目；本程式不會覆蓋。'); }
      catch(e) { if(e.code!=='ENOENT') throw e; }
    }
    const ticket=crypto.randomBytes(24).toString('hex');
    const data={action:body.action,path:c.path,destination,name,target,identity:await identityOf(c.path),expires:Date.now()+120000};
    for(const [id,t] of tickets) if(t.expires<Date.now()) tickets.delete(id);
    tickets.set(ticket,data);
    return {ticket,path:c.path,target,action:body.action,confirmation:path.basename(c.path),expires:data.expires};
  } finally {busy=false;}
}
async function operate(body) {
  if(busy||worker) throw fail('目前有其他工作正在進行。',409);
  const t=tickets.get(body.ticket); tickets.delete(body.ticket);
  if(!t || t.expires<Date.now()) throw fail('確認已過期，請重新檢查目標。');
  if(body.confirmation!==path.basename(t.path)) throw fail('請輸入完整的原始名稱以確認。');
  busy=true;
  let handedOff=false;
  try {
    if(currentScan.stale) throw fail('資料已變更，請重新掃描。');
    const c=await canonical(t.path);
    if(c.reason) throw fail(c.reason,403);
    if(JSON.stringify(await identityOf(c.path))!==JSON.stringify(t.identity)) throw fail('目標已變更，請重新掃描。');
    await inspectTree(t.path);
    if(t.target) {
      const d=await canonical(t.destination,{directory:true});
      // An immutable container (e.g. drive root) can receive an eligible new child;
      // policy is enforced on the complete destination, never bypassed inside Windows.
      if(key(d.path)!==key(t.destination) || policy.reason(t.target)) throw fail('目的位置已變更。');
      try {await fsp.lstat(t.target);throw fail('目的位置已有同名項目。');} catch(e){if(e.code!=='ENOENT')throw e;}
    }
    handedOff=true;
    await shell('operate',t,0);
    if(fs.existsSync(t.path)) throw fail('來源仍然存在，操作可能未完成；請重新掃描檢查。');
    if(t.target&&!fs.existsSync(t.target)) throw fail('未找到預期的目的項目，請重新掃描檢查。');
    tickets.clear();decorated.clear();pageCache.clear();viewCache.clear();
    const started=Date.now();let update=null,updateError=null;
    try{
      update=await scanIndex.apply(t,listDirectory);
      if(key(update.root)!==key(currentScan.root)){
        scanIndex.ancestorLock=await ancestorContentReason(update.root);
        scanIndex.recompute([]);
      }
      Object.assign(currentScan,{root:update.root,rootRemoved:update.rootRemoved,bytes:update.node?.size||0,files:update.node?.files||0,folders:update.folders,failures:update.node?.errors||0,links:update.node?.links||0,stale:false,updated:Date.now(),revision:(currentScan.revision||0)+1,lastUpdate:{directoriesRead:update.directoriesRead,ms:Date.now()-started,change:{path:t.path,target:t.target}}});
      const remap=p=>within(p,t.path)?t.target?path.join(t.target,path.relative(t.path,p)):null:p;
      for(const field of ['errors','skipped'])currentScan[field]=(currentScan[field]||[]).flatMap(e=>{const p=remap(e.path);return p?[{...e,path:p}]:[];});
      currentScan.ancestorLock=scanIndex.ancestorLock;
    }catch(e){currentScan.stale=true;updateError=serializeError(e);}
    // In-flight queries may have populated caches while Windows was working.
    decorated.clear();pageCache.clear();viewCache.clear();
    await audit({action:t.action,path:t.path,target:t.target,result:'success'});
    try {info=await machineInfo();resetPolicy();} catch{}
    const message=updateError?'檔案操作已完成，但更新紀錄失敗：'+updateError+'。請重新掃描確認。':t.action==='recycle'?'已移至資源回收筒，大小與排序已更新。實際空間通常須清空回收筒後才會釋放。':'操作完成，大小與排序已更新，無須重新掃描。';
    return {ok:true,stale:currentScan.stale,scan:currentScan,change:{path:t.path,target:t.target},message,drives:info.drives};
  } catch(e) {
    if(handedOff) { currentScan.stale=true; tickets.clear(); }
    await audit({action:t.action,path:t.path,target:t.target,result:'failed',error:serializeError(e)});
    throw e;
  } finally {busy=false;}
}
async function routeApi(route,body,language='en') {
  switch(route) {
    case 'status': return {version,instanceId,scan:currentScan,busy,admin:info.admin,home:policy.home,drives:info.drives,activity,initialRoot:process.argv.includes('--root')?process.argv[process.argv.indexOf('--root')+1]:null};
    case 'diagnostics': {const memory=process.memoryUsage();return {version,instanceId,pid:process.pid,started:serviceStarted,scanState:currentScan?.state||null,busy,memoryMiB:{resident:Math.round(memory.rss/1048576),heap:Math.round(memory.heapUsed/1048576)},events:connectionLog.recent()};}
    case 'client-diagnostic': connectionLog.record({type:'client',route:body.route,code:body.code,requestId:body.requestId,attempts:body.attempts});return {ok:true};
    case 'language': if(!['en','zh-Hant'].includes(body.language))throw fail('Unsupported language');await saveLanguage(storage,body.language);return {ok:true};
    case 'drives': info=await machineInfo();resetPolicy();return {drives:info.drives};
    case 'scan': return startScan(body.path,body.concurrency);
    case 'cancel': if(worker){currentScan.cancelRequested=true;currentScan.phase='cancelling';worker.requestCancel();}return {ok:true};
    case 'browse': return browse(body.path);
    case 'suggestions': return viewRows('suggestions');
    case 'protected': return viewRows('protected');
    case 'prepare': return prepare(body);
    case 'operate': return operate(body);
    case 'pick': return shell('pick',{path:body.path,language},0);
    case 'open': {const c=await canonical(body.path,{directory:true});return shell('open',{path:c.path});}
    case 'recyclebin': return shell('recyclebin');
    case 'settings': return shell('settings');
    case 'elevate': {
      if(info.admin)return {ok:true,alreadyAdmin:true};
      if(busy)throw fail('檔案檢查或管理操作正在進行，完成後才能申請管理員模式。',409);
      if(worker&&!body.stopScan)throw fail('掃描中；請選擇停止掃描後申請管理員模式。',409);
      busy=true;
      try{
        if(worker){
          const active=worker;currentScan.cancelRequested=true;currentScan.phase='cancelling';active.requestCancel();
          const until=Date.now()+10000;
          while(worker===active&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
          if(worker===active)throw fail('掃描尚未停止，沒有發出提權請求。請稍候重試。',409);
        }
        return await shell('elevate',{node:process.execPath,script:fileURLToPath(import.meta.url),root:currentScan?.root,language},0);
      }finally{busy=false;}
    }
    case 'shutdown': if(busy)throw fail('請先等候管理操作完成。');busy=true;if(worker)worker.requestCancel();setTimeout(()=>process.exit(0),300);return {ok:true};
    default: throw fail('找不到此功能。',404);
  }
}
export async function startServer({port=0,launch=true,language}={}) {
  if(process.platform!=='win32')throw new Error('Spacekeeper 需要 Windows 10/11。');
  info=await machineInfo();resetPolicy();
  language=language||await preferredLanguage(appDir,storage);
  try {activity=(await fsp.readFile(storage.activityFile,'utf8')).trim().split('\n').slice(-100).reverse().map(s=>JSON.parse(s));} catch{}
  const server=http.createServer(async(req,res)=>{
    const requestLanguage=normalizeLanguage(req.headers['x-space-language']);
    const requestId=validRequestId(req.headers['x-space-request-id'])?req.headers['x-space-request-id']:crypto.randomUUID();
    const started=Date.now();let route='unknown',recorded=false;
    const record=(code,status=res.statusCode)=>{if(recorded)return;recorded=true;connectionLog.record({route,code,requestId,status,attempts:req.headers['x-space-attempt']||1,ms:Date.now()-started});};
    res.on('error',()=>record('RESPONSE_ERROR',0));
    res.on('close',()=>{if(!res.writableFinished)record('RESPONSE_CLOSED',0);});
    res.on('finish',()=>{if(res.statusCode>=400||Date.now()-started>=1500)record(res.statusCode>=400?'HTTP_ERROR':null);});
    const address=server.address(),origin=`http://127.0.0.1:${address.port}`;
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
    const send=(status,payload)=>{
      if(res.destroyed||res.writableEnded)return;
      try{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Content-Language':requestLanguage,'X-Space-Request-Id':requestId});res.end(JSON.stringify({...translateResponse(payload,requestLanguage),requestId}));}
      catch{record('RESPONSE_ERROR',0);if(!res.destroyed)res.destroy();}
    };
    try {
      if(req.headers.host!==`127.0.0.1:${address.port}`) throw fail('不接受此主機名稱。',403);
      const url=new URL(req.url,origin);
      if(url.pathname.startsWith('/api/')) {
        route=url.pathname.slice(5);
        if(req.headers['x-space-token']!==secret || (req.headers.origin&&req.headers.origin!==origin) || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))) throw Object.assign(fail('工作階段無效。請由啟動程式重新開啟。',403),{code:'SESSION_INVALID'});
        if(req.method!=='POST') throw fail('僅接受 POST。',405);
        let raw=''; for await(const chunk of req) {raw+=chunk;if(raw.length>32768)throw fail('請求太大。',413);}
        const body=raw?JSON.parse(raw):{};
        send(200,await routeApi(route,body,requestLanguage));
      } else {
        const files={'/':'index.html','/app.js':'app.js','/status.mjs':'status.mjs','/transport.mjs':'transport.mjs','/i18n.mjs':'i18n.mjs','/en.mjs':'en.mjs','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
        const name=files[url.pathname];if(!name)throw fail('找不到頁面。',404);
        const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
        const content=await fsp.readFile(path.join(publicDir,name));
        res.writeHead(200,{...headers,'Content-Type':types[path.extname(name)]});res.end(content);
      }
    } catch(e) {send(e.status||400,{error:serializeError(e),code:e.code||null});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}/?lang=${normalizeLanguage(language)}#${secret}`;
  {
    await fsp.mkdir(storage.runtimeDir,{recursive:true});
    const sessionFile=path.join(storage.runtimeDir,info.admin?'service-admin.json':'service.json');
    await fsp.writeFile(sessionFile,JSON.stringify({url,pid:process.pid,appDir,instanceId,version,admin:info.admin})+'\n','utf8');
  }
  console.log(JSON.stringify({url,pid:process.pid,admin:info.admin}));
  if(launch)openWindow(url);
  return {server,url};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  startServer({launch:!process.argv.includes('--no-open'),language:process.argv.includes('--language')?process.argv[process.argv.indexOf('--language')+1]:undefined}).catch(e=>{console.error(serializeError(e));process.exitCode=1;});
}
