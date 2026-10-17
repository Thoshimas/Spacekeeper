import path from 'node:path';
import {key,within,contentReason} from './policy.mjs';
const w=path.win32;
const fields=['size','files','errors','links'];
const contains='包含具有系統或已安裝程式特徵的子目錄';

// Directory totals already contain descendants. Retain direct contributions and
// adjacency once, then update only changed branches; never walk the disk again.
export class ScanIndex {
  constructor(nodes,root,ancestorLock=null){this.nodes=nodes;this.root=root;this.ancestorLock=ancestorLock;this.children=new Map();this.own=new Map();}
  async initialize(){
    let i=0;
    for(const [k,n] of this.nodes){
      this.own.set(k,Object.fromEntries(fields.map(f=>[f,n[f]||0])));
      if(n.parent){const p=key(n.parent);if(!this.children.has(p))this.children.set(p,new Set());this.children.get(p).add(k);}
      if(++i%2000===0)await new Promise(setImmediate);
    }
    i=0;
    for(const [k,n] of this.nodes){
      const own=this.own.get(k);let childIncomplete=false;
      for(const c of this.children.get(k)||[]){const child=this.nodes.get(c);for(const f of fields)own[f]-=child[f]||0;childIncomplete ||= child.incomplete;}
      own.incomplete=!!n.incomplete&&(!!own.errors||!!own.links||!childIncomplete);
      if(++i%2000===0)await new Promise(setImmediate);
    }
    return this;
  }
  subtree(p){
    const pending=[key(p)],result=[];
    while(pending.length){const k=pending.pop();if(!this.nodes.has(k))continue;result.push(k);for(const c of this.children.get(k)||[])pending.push(c);}
    return result;
  }
  remove(p){
    const n=this.nodes.get(key(p));if(!n)return;
    if(n.parent)this.children.get(key(n.parent))?.delete(key(p));
    for(const k of this.subtree(p)){this.nodes.delete(k);this.own.delete(k);this.children.delete(k);}
  }
  add(p,parent,unmeasured=true){
    const k=key(p),n={path:p,parent,name:w.basename(p)||p,size:0,files:0,errors:0,links:0,incomplete:unmeasured,unmeasured,contentLock:null,containsLock:null};
    this.nodes.set(k,n);this.own.set(k,{size:0,files:0,errors:0,links:0,incomplete:unmeasured});
    if(parent){const pk=key(parent);if(!this.children.has(pk))this.children.set(pk,new Set());this.children.get(pk).add(k);}
    return n;
  }
  relocate(source,target){
    const ks=this.subtree(source),records=ks.map(k=>({node:this.nodes.get(k),own:this.own.get(k),children:this.children.get(k)}));
    const old=this.nodes.get(key(source));if(old?.parent)this.children.get(key(old.parent))?.delete(key(source));
    const mapped=p=>key(p)===key(source)?target:w.join(target,w.relative(source,p));
    for(const k of ks){this.nodes.delete(k);this.own.delete(k);this.children.delete(k);}
    const rootMoved=key(source)===key(this.root);
    if(rootMoved)this.root=target;
    for(const {node:n,own,children} of records){
      const oldPath=n.path;n.path=mapped(n.path);n.name=w.basename(n.path)||n.path;
      n.parent=rootMoved&&key(oldPath)===key(source)?null:key(oldPath)===key(source)?w.dirname(target):mapped(n.parent);
      this.nodes.set(key(n.path),n);this.own.set(key(n.path),own);
      if(children)this.children.set(key(n.path),new Set([...children].map(c=>key(mapped(c)))));
    }
    if(!rootMoved&&this.nodes.has(key(target))){const p=key(w.dirname(target));if(!this.children.has(p))this.children.set(p,new Set());this.children.get(p).add(key(target));}
  }
  refreshDirect(p,rows){
    const k=key(p),n=this.nodes.get(k);if(!n)throw new Error('更新範圍不在掃描索引中。');
    const dirs=new Set(rows.filter(e=>!e.isFile&&!e.isLink&&!e.errors).map(e=>key(e.path)));
    for(const c of [...this.children.get(k)||[]])if(!dirs.has(c))this.remove(this.nodes.get(c).path);
    for(const e of rows){if(dirs.has(key(e.path))&&!this.nodes.has(key(e.path)))this.add(e.path,p);}
    const own={size:0,files:0,errors:0,links:0,incomplete:false};
    for(const e of rows){
      if(e.isFile&&!e.isLink){own.size+=e.size||0;own.files++;}
      own.links+=e.isLink?1:0;own.errors+=e.errors||0;
    }
    own.incomplete=!!(own.errors||own.links||n.unmeasured);
    this.own.set(k,own);
    n.contentLock=key(p)===key(w.parse(p).root)?null:contentReason(rows.map(e=>e.name));
  }
  recompute(parents){
    const changed=new Set();
    for(const parent of parents)for(let p=parent;within(p,this.root);p=w.dirname(p)){
      if(this.nodes.has(key(p)))changed.add(key(p));if(key(p)===key(this.root))break;
    }
    for(const k of [...changed].sort((a,b)=>b.length-a.length)){
      const n=this.nodes.get(k),own=this.own.get(k);for(const f of fields)n[f]=own[f];
      n.incomplete=own.incomplete;n.containsLock=null;
      for(const c of this.children.get(k)||[]){const child=this.nodes.get(c);for(const f of fields)n[f]+=child[f]||0;n.incomplete ||= child.incomplete;if(child.contentLock||child.containsLock)n.containsLock=contains;}
    }
    // Path/name changes may change content inheritance, including sibling locks.
    const root=this.nodes.get(key(this.root));if(root){
      root.inheritedLock=this.ancestorLock;
      const pending=[key(this.root)];while(pending.length){const k=pending.pop(),n=this.nodes.get(k);for(const c of this.children.get(k)||[]){const child=this.nodes.get(c);child.inheritedLock=n.contentLock||n.inheritedLock||null;pending.push(c);}}
    }
    return root||null;
  }
  async apply(operation,list){
    const {path:source,target}=operation,rootChanged=key(source)===key(this.root),oldRoot=this.root;
    const parents=new Set();
    if(!rootChanged)parents.add(w.dirname(source));
    // Build missing destination ancestors using direct listings, without traversing
    // new sibling trees. Unmeasured folders remain explicitly incomplete.
    if(target&&!rootChanged&&within(target,this.root)){
      const missing=[];for(let p=w.dirname(target);!this.nodes.has(key(p));p=w.dirname(p)){if(!within(p,this.root))throw new Error('目的範圍已變更。');missing.push(p);}
      for(const p of missing.reverse()){this.add(p,w.dirname(p));parents.add(p);parents.add(w.dirname(p));}
    }
    if(target&&(rootChanged||within(target,this.root)))this.relocate(source,target);else this.remove(source);
    if(target&&!rootChanged&&within(target,this.root))parents.add(w.dirname(target));
    const paths=[...parents].filter(p=>within(p,this.root));
    const reads=await Promise.allSettled(paths.map(async p=>({p,rows:await list(p)})));
    for(const r of reads)if(r.status==='rejected')throw r.reason;
    for(const r of reads)this.refreshDirect(r.value.p,r.value.rows);
    const node=this.recompute(paths);
    return {root:this.root,rootRemoved:rootChanged&&!target,node,folders:this.nodes.size,directoriesRead:paths.length,oldRoot};
  }
}
