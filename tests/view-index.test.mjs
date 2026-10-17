import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewIndex} from '../lib/view-index.mjs';
import {makePolicy} from '../lib/policy.mjs';

test('bounded protected and suggestion ranking matches full ranking while yielding',async()=>{
  const nodes=Array.from({length:30000},(_,i)=>({path:`C:\\data\\${i}`,parent:'C:\\data',size:(i*7777)%100003,score:i%10}));
  for(const kind of ['protected','suggestions']){
    let decorated=0,heartbeat=false;const pulse=setImmediate(()=>{heartbeat=true;});
    const task=createViewIndex({nodes,total:nodes.length,kind,eligible:n=>n.score%2?{score:n.score,locked:'test'}:null,decorate:n=>{decorated++;return n;}});
    assert.equal(task.state,'building');await task.promise;clearImmediate(pulse);
    const compare=kind==='suggestions'?(a,b)=>b.score-a.score||b.size-a.size:(a,b)=>b.size-a.size;
    assert.deepEqual(task.rows,nodes.filter(n=>n.score%2).sort(compare).slice(0,250));
    assert.equal(decorated,250);assert.equal(task.processed,nodes.length);assert.ok(heartbeat);
  }
});
test('large installed-root indexes preserve protection boundaries and priority',()=>{
  const installs=Array.from({length:5000},(_,i)=>`D:\\Apps\\Software-${i}`);
  const p=makePolicy({env:{USERPROFILE:'C:\\Users\\Alice'},appDir:'D:\\Apps\\Software-10\\Spacekeeper',installLocations:installs});
  assert.ok(p.reason('D:\\Apps'));assert.ok(p.reason('D:\\Apps\\Software-4999\\Cache'));
  assert.equal(p.reason('D:\\Apps\\Software-49999\\Cache'),null);assert.equal(p.reason('C:\\Users\\Alice\\Downloads\\data'),null);
  assert.equal(p.reason('D:\\Apps\\Software-10\\Spacekeeper'),'系統、應用程式或設定資料固定保護');
});
test('a superseded view job stops without producing stale rows',async()=>{
  let current=true;const task=createViewIndex({nodes:[{parent:'x',size:1}],total:1,kind:'protected',eligible:()=>({locked:'x'}),decorate:n=>n,isCurrent:()=>current});
  current=false;await task.promise;assert.equal(task.state,'cancelled');assert.deepEqual(task.rows,[]);
});
