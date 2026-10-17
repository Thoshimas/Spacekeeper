import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConnectionLog,sanitizeConnectionEvent} from '../lib/connection-log.mjs';
test('connection diagnostics keep correlation fields and exclude tokens, paths and arbitrary text',()=>{
  const clean=sanitizeConnectionEvent({route:'protected',code:'NETWORK_ERROR',requestId:'00000000-0000-4000-8000-000000000001',attempts:99,token:'SECRET',path:'C:\\private',error:'sensitive data'});
  assert.equal(clean.route,'protected');assert.equal(clean.attempts,3);assert.ok(clean.requestId);assert.doesNotMatch(JSON.stringify(clean),/SECRET|private|sensitive/);
  const bad=sanitizeConnectionEvent({route:'SECRET',requestId:'SECRET',code:'SECRET'});assert.equal(bad.route,'unknown');assert.equal(bad.requestId,null);assert.equal(bad.code,null);
});
test('connection log bounds memory and rotates only its own diagnostic files',async()=>{
  const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),root=await fs.mkdtemp(path.join(workspace,'.spacekeeper-log-test-'));
  try{const log=createConnectionLog(root,{maxBytes:300});for(let i=0;i<110;i++){log.record({route:'protected',code:'NETWORK_ERROR'});await log.flush();}assert.equal(log.recent().length,100);const files=await fs.readdir(root);assert.equal(files.length,2);for(const file of files)assert.ok((await fs.stat(path.join(root,file))).size<1024);}
  finally{assert.equal(path.dirname(root),workspace);assert.ok(path.basename(root).startsWith('.spacekeeper-log-test-'));await fs.rm(root,{recursive:true,force:true});}
});
