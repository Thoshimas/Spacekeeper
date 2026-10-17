import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {storagePaths,preferredLanguage,saveLanguage} from '../lib/storage.mjs';

test('installed storage is per user and installation; portable storage stays beside the app',()=>{
  const env={LOCALAPPDATA:'C:\\Profiles\\one\\Local'},app='D:\\Apps\\Spacekeeper';
  const a=storagePaths(app,{env,installed:true}),same=storagePaths('d:\\APPS\\Spacekeeper\\',{env,installed:true}),other=storagePaths('D:\\Other\\Spacekeeper',{env,installed:true});
  assert.equal(a.id,same.id);assert.notEqual(a.id,other.id);assert.match(a.id,/^[a-f0-9]{20}$/);
  assert.ok(a.dataDir.startsWith(env.LOCALAPPDATA));assert.ok(!a.dataDir.startsWith(app));
  assert.equal(storagePaths(app,{env,installed:false}).dataDir,app);
});
test('setup language accepts UTF-8 and Windows UTF-16 INI, and saved preferences take priority',async()=>{
  const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),root=await fs.mkdtemp(path.join(workspace,'.spacekeeper-storage-test-'));
  try{
    const paths=storagePaths(root,{installed:false});assert.equal(await preferredLanguage(root,paths),'en');
    const marker=path.join(root,'installation.ini');await fs.writeFile(marker,'[Install]\nProduct=Spacekeeper\nLanguage=en\n');assert.equal(await preferredLanguage(root,paths),'en');
    await fs.writeFile(marker,Buffer.from('\uFEFF[Install]\r\nLanguage=en\r\n','utf16le'));assert.equal(await preferredLanguage(root,paths),'en');
    await fs.writeFile(marker,Buffer.from('\uFEFF[Install]\r\nLanguage=zh-Hant\r\n','utf16le'));assert.equal(await preferredLanguage(root,paths),'zh-Hant');
    await saveLanguage(paths,'en');assert.equal(await preferredLanguage(root,paths),'en');
    await saveLanguage(paths,'zh-Hant');assert.equal(await preferredLanguage(root,paths),'zh-Hant');
    await assert.rejects(saveLanguage(paths,'../../other'),/Unsupported language/);assert.equal(await preferredLanguage(root,paths),'zh-Hant');
    assert.equal((await fs.readdir(root)).filter(x=>x.endsWith('.tmp')).length,0);
  }finally{assert.equal(path.dirname(root),workspace);assert.ok(path.basename(root).startsWith('.spacekeeper-storage-test-'));await fs.rm(root,{recursive:true,force:true});}
});
