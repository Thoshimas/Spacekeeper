import {t} from './i18n.mjs';
export const readOnlyRoutes=new Set(['status','browse','suggestions','protected','drives','diagnostics']);
const labels={status:'狀態更新',browse:'開啟資料夾',suggestions:'清理建議',protected:'固定保護',drives:'磁碟容量',diagnostics:'連線紀錄',scan:'開始掃描',cancel:'停止掃描',prepare:'修改前檢查',operate:'檔案操作',elevate:'申請管理員',pick:'選擇資料夾',shutdown:'結束程式'};
export const routeLabel=route=>t(labels[route]||'本機請求');
export const connectionEventLabel=event=>({NETWORK_ERROR:t('本機連線中斷'),TIMEOUT:t('回應逾時'),INVALID_RESPONSE:t('回應不完整'),SESSION_INVALID:t('工作階段失效'),recovered:t('已重新連線'),retry:t('正在重試')})[event.code||event.type]||t('連線事件');
export function connectionMessage(route,code){
  const label=routeLabel(route),readOnly=readOnlyRoutes.has(route);
  if(code==='SESSION_INVALID')return t('工作階段已失效。請使用 Spacekeeper.exe 重新開啟的新視窗，舊視窗無法連到新的工作階段。');
  const reason=code==='TIMEOUT'?t('回應逾時'):code==='INVALID_RESPONSE'?t('回傳資料不完整或格式不正確'):t('與本機服務的連線中斷');
  if(readOnly)return t`「${label}」${reason}。這次只讀取資料，沒有發出檔案修改指令；可重試此頁。`;
  if(route==='operate')return t`「${label}」${reason}，目前無法確認操作結果。請先查看操作紀錄與來源／目的位置，重新掃描確認後再決定，避免重複執行。`;
  return t`「${label}」${reason}，尚未收到結果。請先確認目前狀態，再決定是否重試；程式不會自動重送這項操作。`;
}
export function abortableDelay(ms,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
export function createApiClient({fetchImpl=globalThis.fetch,token,language=()=> 'en',onEvent=()=>{},requestId=()=>crypto.randomUUID(),delay=abortableDelay}={}){
  return async function call(route,data={},options={}){
    const id=requestId(),readOnly=readOnlyRoutes.has(route),limit=readOnly&&options.retries!==0?3:1;
    const emit=event=>{if(options.events===false)return;try{onEvent({route,requestId:id,readOnly,time:new Date().toISOString(),...event});}catch{}};
    for(let attempt=1;attempt<=limit;attempt++){
      if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const controller=new AbortController(),timeout=options.timeout??(['operate','pick','elevate'].includes(route)?0:route==='prepare'?240000:route==='browse'?20000:10000);
      let timedOut=false,response=null,stage='fetch';
      const timer=timeout?setTimeout(()=>{timedOut=true;controller.abort();},timeout):null;
      const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
      try{
        if(options.signal?.aborted)abort();
        response=await fetchImpl('/api/'+route,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Space-Token':typeof token==='function'?token():token||'','X-Space-Request-Id':id,'X-Space-Attempt':String(attempt),'X-Space-Language':typeof language==='function'?language():language},body:JSON.stringify(data)});
        stage='body';const body=await response.json();
        if(!body||typeof body!=='object'||Array.isArray(body))throw new SyntaxError('Invalid response');
        if(!response.ok)throw Object.assign(new Error(body.error||t('操作未完成')),{apiError:true,code:body.code||'HTTP_ERROR',httpStatus:response.status});
        emit({type:attempt>1?'recovered':'success',attempts:attempt});return body;
      }catch(error){
        if(options.signal?.aborted){emit({type:'cancelled',attempts:attempt});throw new DOMException('Cancelled','AbortError');}
        if(error.apiError&&error.code!=='SESSION_INVALID')throw error;
        const code=error.apiError?error.code:timedOut?'TIMEOUT':stage==='body'&&error instanceof SyntaxError?'INVALID_RESPONSE':'NETWORK_ERROR';
        const retry=code==='NETWORK_ERROR'&&attempt<limit;
        const event={type:retry?'retry':'failure',code,attempts:attempt,httpStatus:response?.status||0};
        emit(event);
        if(retry){clearTimeout(timer);try{await delay(attempt===1?300:900,options.signal);}catch(e){if(options.signal?.aborted)emit({type:'cancelled',attempts:attempt});throw e;}continue;}
        throw Object.assign(new Error(connectionMessage(route,code)),{code,route,requestId:id,attempts:attempt,uncertain:!readOnly&&code!=='SESSION_INVALID',httpStatus:response?.status||0});
      }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
    }
  };
}
