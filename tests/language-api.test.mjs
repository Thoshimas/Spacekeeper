import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startServer,appDir} from '../server.mjs';

test('English launcher URL and API preserve one scan while switching response language',{skip:process.platform!=='win32',timeout:90000},async()=>{
  const workspace=path.resolve(appDir,'../..'),root=await fs.mkdtemp(path.join(workspace,'.spacekeeper-language-test-'));
  const {server,url}=await startServer({launch:false,language:'en'}),u=new URL(url);
  const call=async(route,body={},lang='en')=>{const response=await fetch(u.origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Space-Token':u.hash.slice(1),'X-Space-Language':lang},body:JSON.stringify(body)});return {status:response.status,language:response.headers.get('content-language'),body:await response.json()};};
  try{
    assert.equal(u.searchParams.get('lang'),'en');
    await fs.mkdir(path.join(root,'固定保護'));await fs.writeFile(path.join(root,'固定保護','中文 sample.txt'),'data');
    await fs.mkdir(path.join(root,'WindowsCopy','System32'),{recursive:true});await fs.mkdir(path.join(root,'WindowsCopy','WinSxS'));
    await call('scan',{path:root});
    for(let i=0;i<300;i++){if((await call('status')).body.scan.state==='done')break;await new Promise(r=>setTimeout(r,20));}
    const en=await call('browse',{path:root}),zh=await call('browse',{path:root},'zh-Hant');
    assert.equal(en.language,'en');assert.equal(zh.language,'zh-Hant');assert.equal(en.body.scan.id,zh.body.scan.id);
    assert.deepEqual(en.body.rows.map(n=>n.path),zh.body.rows.map(n=>n.path));assert.ok(en.body.rows.some(n=>n.name==='固定保護'));
    assert.doesNotMatch(en.body.rows.find(n=>n.name==='WindowsCopy').locked,/\p{Script=Han}/u);
    assert.match(zh.body.rows.find(n=>n.name==='WindowsCopy').locked,/\p{Script=Han}/u);
    const denied=await call('prepare',{action:'rename',path:process.env.SystemRoot,name:'DoNotRun'});
    assert.equal(denied.status,403);assert.doesNotMatch(denied.body.error,/\p{Script=Han}/u);
    const prepared=await call('prepare',{action:'rename',path:path.join(root,'固定保護'),name:'renamed'});
    assert.equal(prepared.status,200);assert.equal(prepared.body.confirmation,'固定保護');
    for(const file of ['/i18n.mjs','/en.mjs'])assert.equal((await fetch(u.origin+file)).status,200);
    assert.equal((await fetch(u.origin+'/README.en.md')).status,404);
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    assert.equal(path.dirname(root),workspace);assert.ok(path.basename(root).startsWith('.spacekeeper-language-test-'));await fs.rm(root,{recursive:true,force:true});
  }
});
