import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer,appDir} from '../server.mjs';
import {shell,powershell} from '../lib/windows.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createScan} from '../lib/scan-engine.mjs';
const exec=promisify(execFile);

test('Windows end-to-end: protection and consecutive incremental rename, move, recycle', {skip:process.platform!=='win32',timeout:240000},async()=>{
  const workspace=path.resolve(appDir,'../..');
  const root=await fs.mkdtemp(path.join(workspace,'.spacekeeper-test-'));
  const auditFile=path.join(appDir,'activity.jsonl');let originalAudit=null;
  try{originalAudit=await fs.readFile(auditFile);}catch{}
  const {server,url}=await startServer({launch:false});
  const u=new URL(url),token=u.hash.slice(1),origin=u.origin;
  const request=async(route,body={},extra={})=>{
    const r=await fetch(origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Space-Token':token,'X-Space-Language':'zh-Hant',...extra},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };
  const call=async(route,body)=>{const r=await request(route,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const view=async kind=>{for(let i=0;i<300;i++){const r=await call(kind);if(!r.pending)return r;await new Promise(r=>setTimeout(r,15));}throw new Error('View timed out');};
  const scan=async()=>{
    await call('scan',{path:root});
    for(let i=0;i<300;i++){
      const r=await call('status');if(r.scan.state!=='scanning'){assert.equal(r.scan.state,'done');return r;}
      await new Promise(r=>setTimeout(r,30));
    }
    throw new Error('Scan timed out');
  };
  const compareFresh=async()=>{
    // An independent full walk is the test oracle, never part of operate().
    const fresh=await new Promise((resolve,reject)=>{const j=createScan(root,{engine:'compat'});j.on('error',reject);j.on('message',m=>{if(m.type==='done')resolve(m);});});
    const s=(await call('status')).scan;
    for(const f of ['files','folders','bytes','failures','links'])assert.equal(s[f],fresh[f],f);
    for(const n of fresh.nodes){const shown=(await call('browse',{path:n.path})).node;for(const f of ['size','files','errors','links','incomplete'])assert.equal(shown[f],n[f],n.path+': '+f);}
  };
  try{
    await fs.mkdir(path.join(root,'origin'));await fs.mkdir(path.join(root,'destination'));await fs.mkdir(path.join(root,'cache'));await fs.writeFile(path.join(root,'origin','中文 & note.txt'),'test only');
    assert.equal((await request('status',{}, {'X-Space-Token':'bad'})).status,403);
    assert.equal((await request('status',{}, {Origin:'https://untrusted.example'})).status,403);
    assert.equal((await fetch(origin+'/native/bridge.ps1')).status,404);
    assert.equal((await fetch(origin+'/')).headers.get('content-security-policy').includes("frame-ancestors 'none'"),true);
    await scan();
    let rows=(await call('browse',{path:root})).rows;assert.equal(rows.length,3);assert.equal(rows.find(n=>n.name==='origin').size,9);
    const deny=await request('prepare',{action:'rename',path:process.env.SystemRoot,name:'DoNotRun'});assert.equal(deny.status,403);
    await fs.mkdir(path.join(root,'CopiedWindows','System32'),{recursive:true});await fs.mkdir(path.join(root,'CopiedWindows','WinSxS'));
    await scan();
    const systemChild=await request('prepare',{action:'rename',path:path.join(root,'CopiedWindows','System32'),name:'DoNotRun'});assert.equal(systemChild.status,403);
    const copiedRows=(await call('browse',{path:path.join(root,'CopiedWindows')})).rows;assert.ok(copiedRows.every(n=>n.locked));
    const ticket=await call('prepare',{action:'rename',path:path.join(root,'origin'),name:'renamed'});
    assert.ok((await request('operate',{ticket:ticket.ticket,confirmation:'wrong'})).body.error);
    assert.ok(await fs.stat(path.join(root,'origin')));
    const rename=await call('prepare',{action:'rename',path:path.join(root,'origin'),name:'renamed'});
    const baseline=(await call('status')).scan;
    const renamed=await call('operate',{ticket:rename.ticket,confirmation:'origin'});
    assert.equal(renamed.stale,false);assert.equal(renamed.scan.id,baseline.id);assert.equal(renamed.scan.revision,1);assert.equal(renamed.scan.lastUpdate.directoriesRead,1);
    assert.equal(await fs.readFile(path.join(root,'renamed','中文 & note.txt'),'utf8'),'test only');
    assert.ok((await call('prepare',{action:'recycle',path:path.join(root,'cache')})).ticket);
    await compareFresh();
    const move=await call('prepare',{action:'move',path:path.join(root,'renamed'),destination:path.join(root,'destination')});
    const moved=await call('operate',{ticket:move.ticket,confirmation:'renamed'});
    assert.equal(moved.stale,false);assert.equal(moved.scan.id,baseline.id);assert.equal(moved.scan.revision,2);assert.equal(moved.scan.lastUpdate.directoriesRead,2);
    assert.equal(await fs.readFile(path.join(root,'destination','renamed','中文 & note.txt'),'utf8'),'test only');
    await compareFresh();
    const fileRename=await call('prepare',{action:'rename',path:path.join(root,'destination','renamed','中文 & note.txt'),name:'moved.txt'});
    await call('operate',{ticket:fileRename.ticket,confirmation:'中文 & note.txt'});
    const fileMove=await call('prepare',{action:'move',path:path.join(root,'destination','renamed','moved.txt'),destination:root});
    await call('operate',{ticket:fileMove.ticket,confirmation:'moved.txt'});
    assert.equal((await call('status')).scan.id,baseline.id);await compareFresh();
    const collision=await request('prepare',{action:'rename',path:path.join(root,'cache'),name:'destination'});assert.ok(collision.body.error);
    const changed=await call('prepare',{action:'rename',path:path.join(root,'cache'),name:'changed'});
    await fs.writeFile(path.join(root,'cache','new.txt'),'new');
    const stale=await request('operate',{ticket:changed.ticket,confirmation:'cache'});assert.match(stale.body.error,/變更/);
    // Recycle a dedicated test folder with one disposable test file only.
    await fs.mkdir(path.join(root,'recycle-test'));
    await fs.writeFile(path.join(root,'recycle-test','test-only.txt'),'Spacekeeper disposable test data');
    await scan();
    const recycle=await call('prepare',{action:'recycle',path:path.join(root,'recycle-test')});
    const beforeRecycle=(await call('status')).scan;
    const recycled=await call('operate',{ticket:recycle.ticket,confirmation:'recycle-test'});
    assert.equal(recycled.scan.id,beforeRecycle.id);assert.equal(recycled.stale,false);assert.equal(recycled.scan.folders,beforeRecycle.folders-1);
    await compareFresh();
    await assert.rejects(fs.stat(path.join(root,'recycle-test')));
    const recycleProbe="$s=New-Object -ComObject Shell.Application; $m=@($s.Namespace(10).Items() | Where-Object { $_.Name -eq 'recycle-test' -and $_.ExtendedProperty('System.Recycle.DeletedFrom') -eq '"+root.replace(/'/g,"''")+"' }); [Console]::Write($m.Count)";
    const probe=await exec(powershell,['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(recycleProbe,'utf16le').toString('base64')],{windowsHide:true,timeout:30000});
    assert.ok(Number(probe.stdout.trim())>0,'The dedicated test folder must exist in the actual Windows Recycle Bin');
    assert.equal((await call('status')).activity[0].action,'recycle');
    // Native System attribute and a junction must both fail even under a user-data path.
    await fs.mkdir(path.join(root,'has-link'));await fs.symlink(path.join(root,'destination'),path.join(root,'has-link','link'),'junction');
    await assert.rejects(shell('inspect',{path:path.join(root,'has-link')}),/reparse/);
    const systemFile=path.join(root,'system-attribute-test.txt');
    await fs.writeFile(systemFile,'test');
    const attrib=path.join(process.env.SystemRoot,'System32','attrib.exe');
    try{
      await exec(attrib,['+s',systemFile],{windowsHide:true});
      await assert.rejects(shell('inspect',{path:systemFile}),/System attribute/);
    }finally{await exec(attrib,['-s',systemFile],{windowsHide:true});}
    const mixed=path.join(root,'Profile','AppData','Local','Demo');
    await fs.mkdir(path.join(mixed,'Cache'),{recursive:true});await fs.mkdir(path.join(mixed,'Settings'));
    await fs.writeFile(path.join(mixed,'Cache','cached.bin'),'cache only');await fs.writeFile(path.join(mixed,'Settings','account.json'),'keep');
    const started=await call('scan',{path:root,concurrency:8});assert.equal(started.scan.concurrency,8);
    for(let i=0;i<300;i++){if((await call('status')).scan.state==='done')break;await new Promise(r=>setTimeout(r,30));}
    const appdata=path.dirname(path.dirname(mixed));
    const appdataRows=await call('browse',{path:appdata});assert.ok(appdataRows.node.locked);assert.ok(appdataRows.rows.length>0);
    const mixedRows=(await call('browse',{path:mixed})).rows;
    assert.equal(mixedRows.find(n=>n.name==='Cache').locked,null);assert.ok(mixedRows.find(n=>n.name==='Settings').locked);
    assert.equal((await request('prepare',{action:'recycle',path:path.join(mixed,'Settings')})).status,403);
    const candidate=await call('prepare',{action:'recycle',path:path.join(mixed,'Cache')});assert.ok(candidate.ticket);
    const advice=(await view('suggestions')).rows;assert.ok(advice.some(n=>n.path===path.join(mixed,'Cache')));
    const adviceAgain=await call('suggestions');assert.deepEqual(adviceAgain.rows,advice);
    const protection=(await view('protected')).rows;assert.ok(protection.some(n=>n.path===path.join(mixed,'Settings')));
    assert.ok((await call('status')).scan.links>0,'Unreadable/skipped items must not prevent the protected view');
    const logged=(await call('status')).scan;assert.ok(logged.skipped.some(n=>n.path.endsWith('has-link\\link')));assert.equal(logged.phase,'complete');
    const running=await call('scan',{path:root});
    const notYet=await call('protected');assert.ok(notYet.pending||notYet.rows);
    const status=await call('status');assert.equal(status.version,'1.0.0');
    await call('cancel');
    for(let i=0;i<300;i++){if((await call('status')).scan.state!=='scanning')break;await new Promise(r=>setTimeout(r,20));}
    assert.notEqual((await call('status')).scan.state,'scanning');await view('protected');
  }finally{
    server.closeAllConnections();await new Promise(r=>server.close(r));
    assert.equal(path.dirname(root),workspace);assert.ok(path.basename(root).startsWith('.spacekeeper-test-'));
    await fs.rm(root,{recursive:true,force:true});
    if(originalAudit)await fs.writeFile(auditFile,originalAudit);else await fs.rm(auditFile,{force:true});
  }
});
