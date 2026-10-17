import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { contentReason } from './policy.mjs';

const flag = new Int32Array(workerData.cancel);
const nodes = [], errors = [], skipped=[],errorCounts={};
let files = 0, bytes = 0, links = 0, failures = 0, last = 0, current = workerData.root;
const stopped = () => Atomics.load(flag, 0) === 1;
const progress = () => {
  if (Date.now()-last > 200) {
    last = Date.now();
    parentPort.postMessage({ type:'progress', files, bytes, folders:nodes.length, links, failures, current });
  }
};
function failure(p, e, n) {
  failures++; n.errors++; n.incomplete = true;
  errorCounts[e.code||'ERROR']=(errorCounts[e.code||'ERROR']||0)+1;
  if (errors.length < 200) errors.push({path:p, code:e.code || 'ERROR', message:e.message});
}
function node(p, parent) {
  const n = {path:p, parent, name:path.basename(p) || p, size:0, files:0, errors:0, links:0, incomplete:false, contentLock:null,containsLock:null};
  n.index=nodes.length; nodes.push(n); return n;
}
const root = node(workerData.root, null);
const stack = [{n:root, exit:false}];
while (stack.length && !stopped()) {
  const frame = stack.pop(), n = frame.n;
  if (frame.exit) {
    if (n.parentIndex !== undefined) {
      const p = nodes[n.parentIndex];
      p.size += n.size; p.files += n.files; p.errors += n.errors; p.links += n.links;
      p.incomplete ||= n.incomplete;
      if (n.contentLock || n.containsLock) p.containsLock ||= '包含具有系統或已安裝程式特徵的子目錄';
    }
    continue;
  }
  current = n.path; progress();
  let entries;
  try { entries = fs.readdirSync(n.path, {withFileTypes:true}); }
  catch(e) { failure(n.path,e,n); entries=[]; }
  // Boot files at a volume root must not mark every personal descendant as system data.
  n.contentLock = path.parse(n.path).root===n.path?null:contentReason(entries.map(e=>e.name));
  stack.push({n,exit:true});
  const parentIndex = n.index;
  for (const e of entries) {
    if (stopped()) break;
    const p = path.join(n.path,e.name);
    try {
      const s = fs.lstatSync(p);
      if (s.isSymbolicLink()) { n.links++; links++; n.incomplete=true;if(skipped.length<200)skipped.push({path:p,code:'REPARSE_POINT',message:'連結或接合點未走訪，避免重複計算或讀取其他位置。'});continue; }
      if (s.isDirectory()) {
        const child = node(p,n.path); child.parentIndex=parentIndex;
        stack.push({n:child,exit:false});
      } else if(s.isFile()) { n.size+=s.size; n.files++; bytes+=s.size; files++; }
    } catch(e) { failure(p,e,n); }
    progress();
  }
}
const cancelled = stopped();
if (cancelled) {
  // Completed descendant totals cannot be used as complete-folder sizes after cancellation.
  for (const n of nodes) n.incomplete=true;
}
for (const n of nodes) { delete n.parentIndex; delete n.index; }
parentPort.postMessage({type:'done',nodes,errors,skipped,errorCounts,files,bytes,links,failures,cancelled,folders:nodes.length,current});
