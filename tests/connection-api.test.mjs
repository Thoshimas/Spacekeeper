import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startServer} from '../server.mjs';

test('API correlates failures, redacts client diagnostics and survives a disconnected request',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const {server,url}=await startServer({launch:false});const u=new URL(url),token=u.hash.slice(1),origin=u.origin;
  const id='00000000-0000-4000-8000-000000000002';
  const call=async(route,body={},headers={})=>{const r=await fetch(origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Space-Token':token,'X-Space-Request-Id':id,...headers},body:JSON.stringify(body)});return {response:r,body:await r.json()};};
  try{
    const invalid=await call('status',{}, {'X-Space-Token':'wrong'});assert.equal(invalid.response.status,403);assert.equal(invalid.body.code,'SESSION_INVALID');assert.equal(invalid.body.requestId,id);assert.equal(invalid.response.headers.get('x-space-request-id'),id);
    await call('client-diagnostic',{route:'protected',code:'NETWORK_ERROR',requestId:id,attempts:3,token:'DO-NOT-LOG',path:'C:\\DO-NOT-LOG',message:'DO-NOT-LOG'});
    let snapshot=(await call('diagnostics')).body;assert.ok(snapshot.events.some(e=>e.type==='client'&&e.requestId===id));assert.doesNotMatch(JSON.stringify(snapshot),/DO-NOT-LOG/);assert.ok(snapshot.memoryMiB.resident>0);
    await new Promise(resolve=>{
      const request=http.request(origin+'/api/status',{method:'POST',headers:{'Content-Type':'application/json','X-Space-Token':token,'X-Space-Request-Id':id}});
      request.on('error',()=>resolve());request.write('{"incomplete":');setTimeout(()=>{request.destroy();resolve();},30);
    });
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal((await call('status')).response.status,200);snapshot=(await call('diagnostics')).body;
    assert.ok(snapshot.events.some(e=>e.code==='RESPONSE_CLOSED'));
    assert.equal((await fetch(origin+'/transport.mjs')).status,200);assert.equal((await fetch(origin+'/.runtime/connection.jsonl')).status,404);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
