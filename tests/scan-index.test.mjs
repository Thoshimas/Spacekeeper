import test from 'node:test';
import assert from 'node:assert/strict';
import {ScanIndex} from '../lib/scan-index.mjs';
import {key} from '../lib/policy.mjs';
const root='C:\\fixture';
const p=s=>root+(s?'\\'+s:'');
const dir=(s,size,files,extra={})=>({path:p(s),parent:s?p(s.includes('\\')?s.slice(0,s.lastIndexOf('\\')):''):null,name:s.split('\\').at(-1)||'fixture',size,files,errors:0,links:0,incomplete:false,contentLock:null,containsLock:null,...extra});
const folder=s=>({path:p(s),name:s.split('\\').at(-1),isFile:false,isLink:false});
const file=(s,size)=>({...folder(s),size,isFile:true});
async function fixture(){
  const nodes=[dir('',142,7,{errors:2,links:1,incomplete:true}),dir('A',15,3),dir('A\\child',10,2),dir('B',20,1),dir('untouched',100,2,{errors:2,links:1,incomplete:true})];
  return new ScanIndex(new Map(nodes.map(n=>[key(n.path),n])),root).initialize();
}
const get=(i,s)=>i.nodes.get(key(p(s)));
const listing=records=>async path=>{assert.ok(Object.hasOwn(records,path),'Unexpected disk enumeration: '+path);return records[path];};
const rootRows=(...dirs)=>[file('root.txt',7),...dirs.map(folder)];

test('rename reuses descendant totals, rewrites every path and enumerates only the parent',async()=>{
  const i=await fixture(),untouched=get(i,'untouched');
  const r=await i.apply({path:p('A'),target:p('Renamed')},listing({[root]:rootRows('Renamed','B','untouched')}));
  assert.equal(r.directoriesRead,1);assert.equal(r.folders,5);assert.equal(r.node.size,142);assert.equal(r.node.files,7);
  assert.equal(get(i,'A'),undefined);assert.equal(get(i,'A\\child'),undefined);
  assert.equal(get(i,'Renamed\\child').parent,p('Renamed'));assert.equal(get(i,'Renamed').size,15);
  assert.equal(get(i,'untouched'),untouched);assert.equal(r.node.errors,2);assert.equal(r.node.links,1);assert.ok(r.node.incomplete);
});
test('moving a directory updates both ancestor chains exactly once, preserving the root total',async()=>{
  const i=await fixture();const r=await i.apply({path:p('A'),target:p('B\\A')},listing({[root]:rootRows('B','untouched'),[p('B')]:[file('B\\own.bin',20),folder('B\\A')]}));
  assert.equal(r.directoriesRead,2);assert.equal(r.node.size,142);assert.equal(r.node.files,7);
  assert.equal(get(i,'B').size,35);assert.equal(get(i,'B').files,4);assert.equal(get(i,'B\\A\\child').parent,p('B\\A'));
});
test('recycling one file refreshes direct file sizes and propagates through all ancestors',async()=>{
  const i=await fixture();const r=await i.apply({path:p('A\\child\\gone.bin'),target:null},listing({[p('A\\child')]:[file('A\\child\\remaining.bin',6)]}));
  assert.equal(r.directoriesRead,1);assert.equal(get(i,'A\\child').size,6);assert.equal(get(i,'A').size,11);
  assert.equal(r.node.size,138);assert.equal(r.node.files,6);
});
test('file moves refresh direct contributions without treating a file as a directory node',async()=>{
  const i=await fixture();const r=await i.apply({path:p('root.txt'),target:p('B\\root.txt')},listing({[root]:['A','B','untouched'].map(folder),[p('B')]:[file('B\\own.bin',20),file('B\\root.txt',7)]}));
  assert.equal(r.node.size,142);assert.equal(r.node.files,7);assert.equal(get(i,'B').size,27);assert.equal(r.folders,5);
});
test('moving outside the scope removes the complete cached subtree and adjusts counts',async()=>{
  const i=await fixture();const r=await i.apply({path:p('A'),target:'D:\\outside\\A'},listing({[root]:rootRows('B','untouched')}));
  assert.equal(r.node.size,127);assert.equal(r.node.files,4);assert.equal(r.folders,3);assert.equal(get(i,'A\\child'),undefined);
  assert.ok(!i.nodes.has(key('D:\\outside\\A')));
});
test('renaming and recycling the scan root have defined results without expanding the scan scope',async()=>{
  const i=await fixture(),target='D:\\NewRoot';
  const r=await i.apply({path:root,target},()=>assert.fail('Root rename must reuse the existing tree'));
  assert.equal(r.root,target);assert.equal(r.node.parent,null);assert.equal(r.node.size,142);assert.equal(r.directoriesRead,0);
  assert.ok(i.nodes.has(key(target+'\\A\\child')));assert.equal(i.nodes.get(key(target+'\\A')).parent,target);
  const gone=await i.apply({path:target,target:null},()=>assert.fail('No directory remains to enumerate'));
  assert.equal(gone.rootRemoved,true);assert.equal(gone.node,null);assert.equal(gone.folders,0);
});
test('new destination ancestors are listed directly; unknown sibling trees remain incomplete',async()=>{
  const i=await fixture();const r=await i.apply({path:p('A'),target:p('new\\deep\\A')},listing({
    [root]:rootRows('B','untouched','new'),[p('new')]:[folder('new\\deep'),folder('new\\unknown'),file('new\\new.txt',4)],
    [p('new\\deep')]:[folder('new\\deep\\A')]
  }));
  assert.equal(r.directoriesRead,3);assert.equal(r.node.size,146);assert.equal(get(i,'new\\deep').size,15);
  assert.ok(get(i,'new\\unknown').incomplete);assert.equal(get(i,'new\\unknown').size,0);assert.ok(get(i,'new').incomplete);
});
test('direct name changes recalculate content protection and inheritance without disk recursion',async()=>{
  const i=await fixture();await i.apply({path:p('B\\own.bin'),target:p('B\\uninstall.exe')},listing({[p('B')]:[file('B\\uninstall.exe',20),folder('B\\unknown')]}));
  assert.match(get(i,'B').contentLock,/解除安裝/);assert.ok(get(i,'B\\unknown').inheritedLock);assert.ok(get(i,'').containsLock);
});
test('failed direct reconciliation is surfaced to the caller, never silently reported as current',async()=>{
  const i=await fixture();await assert.rejects(i.apply({path:p('A'),target:p('Renamed')},async()=>{throw new Error('access denied');}),/access denied/);
});
