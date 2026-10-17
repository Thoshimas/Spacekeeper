import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {ensureFastScanner} from '../lib/scan-engine.mjs';
const exec=promisify(execFile),app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),workspace=path.resolve(app,'../..');

test('EXE installer guard rejects unrelated folders, roots, Windows paths and junctions',{skip:process.platform!=='win32'},async()=>{
  const root=await fs.mkdtemp(path.join(workspace,'.spacekeeper-launcher-test-')),exe=path.join(app,'Spacekeeper.exe');
  const allowed=async p=>{try{await exec(exe,['--validate-install-dir',p],{windowsHide:true});return true;}catch(e){assert.ok([1,2].includes(e.code));return false;}};
  try{
    assert.equal(await allowed(path.join(root,'new folder 中文')),true);
    await fs.mkdir(path.join(root,'unrelated'));await fs.writeFile(path.join(root,'unrelated','keep.txt'),'keep');assert.equal(await allowed(path.join(root,'unrelated')),false);
    for(const p of [path.parse(root).root,process.env.SystemRoot,path.join(process.env.SystemRoot,'new-app'),process.env.USERPROFILE])assert.equal(await allowed(p),false,p);
    await fs.symlink(path.join(root,'unrelated'),path.join(root,'junction'),'junction');assert.equal(await allowed(path.join(root,'junction','new-app')),false);
    await fs.mkdir(path.join(root,'owned'));await fs.writeFile(path.join(root,'owned','installation.ini'),'[Install]\nProduct=Spacekeeper\n');assert.equal(await allowed(path.join(root,'owned')),true);
    assert.equal(await fs.readFile(path.join(root,'unrelated','keep.txt'),'utf8'),'keep');
  }finally{assert.equal(path.dirname(root),workspace);assert.ok(path.basename(root).startsWith('.spacekeeper-launcher-test-'));await fs.rm(root,{recursive:true,force:true});}
});
test('shipped native scanner matches its source and binary manifest and avoids first-run compilation',{skip:process.platform!=='win32'},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(app,'native/scanner-manifest.json'),'utf8'));
  const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  assert.equal(manifest.sourceSha256,await hash(path.join(app,'native/FastScanner.cs')));assert.equal(manifest.binarySha256,await hash(path.join(app,'native/FastScanner.exe')));
  assert.equal(await ensureFastScanner(),path.join(app,'native/FastScanner.exe'));
});
