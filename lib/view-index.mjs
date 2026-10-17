import {performance} from 'node:perf_hooks';

// Incremental bounded ranking: keep only the best 250 entries, yield frequently,
// and decorate only the returned rows. No filesystem reads are needed here.
export function createViewIndex({nodes,total,kind,eligible,decorate,limit=250,isCurrent=()=>true}){
  const task={state:'building',phase:'classifying',processed:0,total,matched:0,started:Date.now(),updated:Date.now(),rows:[]};
  const compare=kind==='suggestions'?(a,b)=>b.score-a.score||b.node.size-a.node.size:(a,b)=>b.node.size-a.node.size;
  const heap=[];
  const offer=item=>{
    if(heap.length===limit&&compare(item,heap[0])>=0)return;
    if(heap.length<limit){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(compare(heap[p],heap[i])>=0)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}}
    else{heap[0]=item;let i=0;while(true){let worst=i,l=i*2+1,r=l+1;if(l<heap.length&&compare(heap[l],heap[worst])>0)worst=l;if(r<heap.length&&compare(heap[r],heap[worst])>0)worst=r;if(worst===i)break;[heap[i],heap[worst]]=[heap[worst],heap[i]];i=worst;}}
  };
  task.promise=(async()=>{
    await new Promise(setImmediate);let slice=performance.now();
    for(const node of nodes){
      if(!isCurrent()||task.cancelled){task.state='cancelled';return;}
      task.processed++;
      const result=node.parent?eligible(node):null;
      if(result){task.matched++;offer({node,score:result.score||0,locked:result.locked});}
      if(task.processed%250===0&&performance.now()-slice>=8){task.updated=Date.now();await new Promise(setImmediate);slice=performance.now();}
    }
    if(!isCurrent()||task.cancelled){task.state='cancelled';return;}
    task.phase='preparing';task.rows=heap.sort(compare).map(x=>decorate(x.node,x.locked));
    task.state='done';task.phase='complete';task.finished=task.updated=Date.now();
  })().catch(error=>{task.state='error';task.error=error.message;task.updated=Date.now();});
  return task;
}
