import fs from 'node:fs/promises';
import path from 'node:path';
const routes=new Set(['status','browse','suggestions','protected','drives','diagnostics','scan','cancel','prepare','operate','elevate','pick','open','recyclebin','settings','shutdown','client-diagnostic']);
const codes=new Set(['NETWORK_ERROR','TIMEOUT','INVALID_RESPONSE','SESSION_INVALID','RESPONSE_CLOSED','RESPONSE_ERROR','HTTP_ERROR','REQUEST_ERROR']);
export const validRequestId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function sanitizeConnectionEvent(input={}){
  const number=(value,max)=>Number.isFinite(Number(value))?Math.max(0,Math.min(max,Math.round(Number(value)))):0;
  return {time:new Date().toISOString(),type:input.type==='client'?'client':'request',route:routes.has(input.route)?input.route:'unknown',code:codes.has(input.code)?input.code:null,requestId:validRequestId(input.requestId)?input.requestId:null,status:number(input.status,599),attempts:number(input.attempts,3),ms:number(input.ms,86400000)};
}
export function createConnectionLog(directory,{maxBytes=262144}={}){
  const recent=[],file=path.join(directory,`connection-${process.pid}.jsonl`);let queue=Promise.resolve(),pending=0;
  const record=input=>{
    const event=sanitizeConnectionEvent(input);recent.push(event);if(recent.length>100)recent.shift();
    if(pending>=100)return;pending++;
    queue=queue.then(async()=>{
      await fs.mkdir(directory,{recursive:true});
      const bytes=(await fs.stat(file).catch(()=>({size:0}))).size;
      if(bytes>=maxBytes){const previous=file+'.previous';await fs.rm(previous,{force:true});await fs.rename(file,previous);}
      await fs.appendFile(file,JSON.stringify(event)+'\n','utf8');
    }).catch(()=>{}).finally(()=>{pending--;});
  };
  return {record,recent:()=>recent.slice(),flush:()=>queue};
}
