import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../public/transport.mjs';
import {setLanguage} from '../public/i18n.mjs';
setLanguage('zh-Hant');
const ok=()=>new Response(JSON.stringify({rows:[1]}));

test('protected and suggestions survive two transient fetch failures with bounded retries',async()=>{
  for(const route of ['protected','suggestions']){
    let count=0;const events=[];
    const call=createApiClient({fetchImpl:async()=>{if(++count<3)throw new TypeError('Failed to fetch');return ok();},delay:async()=>{},onEvent:e=>events.push(e)});
    assert.deepEqual((await call(route)).rows,[1]);assert.equal(count,3);assert.deepEqual(events.map(e=>e.type),['retry','retry','recovered']);
  }
});
test('permanent network errors have readable context and a strict three-attempt limit',async()=>{
  let count=0;const call=createApiClient({fetchImpl:async()=>{count++;throw new TypeError('Failed to fetch');},delay:async()=>{}});
  await assert.rejects(call('protected'),e=>{assert.equal(e.code,'NETWORK_ERROR');assert.equal(e.attempts,3);assert.equal(e.uncertain,false);assert.match(e.message,/固定保護/);assert.doesNotMatch(e.message,/Failed to fetch/);return true;});assert.equal(count,3);
});
test('file mutations, scanning and elevation are never replayed after an unknown result',async()=>{
  for(const route of ['operate','prepare','scan','cancel','elevate','shutdown']){
    let count=0;const call=createApiClient({fetchImpl:async()=>{count++;throw new TypeError('Failed to fetch');},delay:async()=>{}});
    await assert.rejects(call(route),e=>{assert.equal(e.uncertain,true);if(route==='operate'){assert.match(e.message,/無法確認操作結果/);assert.doesNotMatch(e.message,/沒有發出檔案修改/);}return true;});assert.equal(count,1);
  }
});
test('navigation abort during a retry is quiet and stops subsequent fetches',async()=>{
  const controller=new AbortController(),events=[];let count=0;
  const call=createApiClient({fetchImpl:async()=>{count++;throw new TypeError('Failed to fetch');},delay:async()=>{controller.abort();throw new DOMException('Cancelled','AbortError');},onEvent:e=>events.push(e)});
  await assert.rejects(call('protected',{}, {signal:controller.signal}),{name:'AbortError'});assert.equal(count,1);assert.equal(events.at(-1).type,'cancelled');assert.ok(!events.some(e=>e.type==='failure'));
});
test('timeout and invalid responses are distinct and do not start duplicate expensive requests',async()=>{
  let count=0;const timeout=createApiClient({fetchImpl:async(_url,{signal})=>{count++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}});
  await assert.rejects(timeout('protected',{}, {timeout:5}),{code:'TIMEOUT'});assert.equal(count,1);
  const invalid=createApiClient({fetchImpl:async()=>new Response('<html>unexpected</html>')});await assert.rejects(invalid('protected'),{code:'INVALID_RESPONSE'});
  const wrongShape=createApiClient({fetchImpl:async()=>new Response('[]')});await assert.rejects(wrongShape('protected'),{code:'INVALID_RESPONSE'});
});
test('a response body interrupted after headers is retried only for read-only requests',async()=>{
  let count=0;const call=createApiClient({fetchImpl:async()=>{if(++count===1)return {ok:true,status:200,json:async()=>{throw new TypeError('terminated');}};return ok();},delay:async()=>{}});
  assert.deepEqual((await call('suggestions')).rows,[1]);assert.equal(count,2);
});
test('HTTP permission and expired sessions are handled without claiming a network failure',async()=>{
  let count=0;const denied=createApiClient({fetchImpl:async()=>{count++;return new Response(JSON.stringify({error:'固定保護',code:'EPERM'}),{status:403});}});
  await assert.rejects(denied('prepare'),e=>e.code==='EPERM'&&e.message==='固定保護');assert.equal(count,1);
  const session=createApiClient({fetchImpl:async()=>new Response(JSON.stringify({error:'invalid',code:'SESSION_INVALID'}),{status:403})});
  await assert.rejects(session('protected'),e=>e.code==='SESSION_INVALID'&&/工作階段/.test(e.message));
});
