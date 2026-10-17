import test from 'node:test';
import assert from 'node:assert/strict';
import {makePolicy,within,localPath,suggestion,contentReason} from '../lib/policy.mjs';
const env={SystemDrive:'C:',SystemRoot:'C:\\Windows',ProgramFiles:'C:\\Program Files',ProgramData:'C:\\ProgramData',USERPROFILE:'C:\\Users\\Tester',APPDATA:'C:\\Users\\Tester\\AppData\\Roaming',LOCALAPPDATA:'C:\\Users\\Tester\\AppData\\Local',TEMP:'C:\\Users\\Tester\\AppData\\Local\\Temp'};
const policy=makePolicy({env,appDir:'D:\\Spacekeeper',installLocations:['D:\\Apps\\PhotoEditor']});
test('system roots, aliases, ancestors and installed applications are protected',()=>{
  for(const p of ['C:\\','c:\\WINDOWS\\System32','D:\\Recovery','D:\\EFI\\Microsoft','C:\\pagefile.sys','C:\\hiberfil.sys','C:\\Users','C:\\Users\\Tester','C:\\Users\\Tester\\AppData','C:\\Users\\Other\\AppData\\Local','C:\\Users\\Other','D:\\Apps','D:\\Apps\\PhotoEditor\\bin','D:\\Spacekeeper\\public'])assert.ok(policy.reason(p),p);
});
test('path boundaries prevent false positives; normal personal folders are manageable',()=>{
  for(const p of ['C:\\Windows-old-not-system','C:\\Users\\Tester\\Documents','D:\\Apps\\OtherData','D:\\Spacekeeper-backup'])assert.equal(policy.reason(p),null,p);
  assert.equal(within('C:\\Users\\Tester2','C:\\Users\\Tester'),false);
});
test('Temp root remains fixed while individual children can be checked',()=>{
  assert.ok(policy.reason(env.TEMP));assert.equal(policy.reason(env.TEMP+'\\old-work'),null);
  assert.ok(policy.reason(env.LOCALAPPDATA+'\\App\\Config'));
});
test('nonlocal, alternate stream, device, reserved and ambiguous names are rejected',()=>{
  for(const p of ['..\\secret','C:relative','\\\\server\\share','\\\\?\\C:\\Windows','C:\\data:stream','C:\\CON.txt','C:\\foo.','C:\\foo*','C:\\foo\u0000'])assert.throws(()=>localPath(p),p);
  assert.equal(localPath('C:/Users/Tester/Documents'),'C:\\Users\\Tester\\Documents');
});
test('protection and incomplete coverage outrank cleanup hints',()=>{
  assert.equal(suggestion({path:'D:\\cache',locked:'protected'}).score,-1);
  assert.equal(suggestion({path:'D:\\cache',incomplete:true}).score,0);
  assert.ok(suggestion({path:'D:\\cache'}).reason.includes('不能保證'));
  assert.ok(suggestion({path:'D:\\.minecraft\\saves'}).score<20);
});
test('system and installed-app content signatures lock copied or relocated folders',()=>{
  assert.ok(contentReason(['System32','WinSxS']));assert.ok(contentReason(['unins000.exe','app.exe']));assert.equal(contentReason(['notes.txt','photo.jpg']),null);
});
test('AppData is navigable with precise cache exceptions; identity, settings and binaries stay protected',()=>{
  const base='C:\\Users\\Tester\\AppData\\Local\\';
  for(const p of ['App\\Cache','App\\Code Cache\\js\\a.bin','pip\\Cache','uv\\cache','NVIDIA\\DXCache'])assert.equal(policy.reason(base+p),null,p);
  for(const p of ['App\\Settings','App\\IndexedDB\\Cache','Microsoft\\Windows\\Cache','Programs\\App\\Cache','Packages\\App\\Cache'])assert.ok(policy.reason(base+p),p);
  assert.ok(policy.reason('C:\\Users\\Tester\\AppData\\Roaming\\App\\Cache'));
  assert.ok(policy.reason('D:\\Apps\\PhotoEditor\\Cache'));
  assert.equal(suggestion({path:base+'App\\Cache'}).label,'快取候選');
  const redirected=makePolicy({env:{...env,LOCALAPPDATA:'D:\\CustomProfileData'}});
  assert.ok(redirected.reason('D:\\CustomProfileData\\Account'));
});
