import {t,locale,initLocalization,getLanguage,formatCount} from './i18n.mjs';
/* All filesystem data comes from the local authenticated API. No demo disk values. */
'use strict';
import {modePresentation,issueExplanation,scanPhaseText} from './status.mjs';
import {createApiClient,routeLabel,connectionEventLabel} from './transport.mjs';
initLocalization();
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const size=n=>{if(!Number.isFinite(n))return '—';if(n===0)return '0 B';const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return `${(n/1024**i).toLocaleString('en-US',{maximumFractionDigits:i===0?0:2})} ${['B','KiB','MiB','GiB','TiB'][i]}`;};
const number=n=>Number(n||0).toLocaleString('en-US');
const parent=p=>p.replace(/[\\/]+$/,'').replace(/[^\\/]+$/,'') || p;
const leaf=p=>p.replace(/[\\/]+$/,'').split(/[\\/]/).pop()||p;
const pathKey=p=>(p||'').replace(/[\\/]+$/,'').toLowerCase();
const inside=(p,root)=>pathKey(p)===pathKey(root)||pathKey(p).startsWith(pathKey(root)+'\\');
const snapshotKey=s=>s?`${s.id}:${s.revision||0}`:null;
const state={scan:null,rows:[],visible:[],node:null,selected:null,view:'overview',drives:[],history:[],home:null,limit:100,suggestionRows:[],busy:false,lastScanId:null,lastFinished:null};
let pollTimer,toastTimer,modalSubmit=null,modalWorking=false,pendingPoll=null,lastDriveRender=null,navigationId=0,loadingTimer=null,navigationController=null,token=location.hash.slice(1);
if(/^[a-f0-9]{64}$/.test(token)){sessionStorage.setItem('spacekeeper-token',token);history.replaceState(null,'',location.pathname+location.search);}
else token=sessionStorage.getItem('spacekeeper-token');
let connectionEvents=[];try{connectionEvents=JSON.parse(localStorage.getItem('spacekeeper-connection-events')||'[]').filter(x=>x&&typeof x.route==='string').slice(-30);}catch{}
const connectionProblems=new Map(),pendingDiagnostics=[];
const api=createApiClient({token:()=>token,language:getLanguage,onEvent:onConnectionEvent});
try{state.resume=JSON.parse(sessionStorage.getItem('spacekeeper-language-view')||'null');sessionStorage.removeItem('spacekeeper-language-view');}catch{}
$('languageSelect').onchange=async()=>{
  if(modalWorking){$('languageSelect').value=getLanguage();return;}
  const language=$('languageSelect').value;
  try{await api('language',{language});}catch{ /* The current window can still switch using browser storage. */ }
  try{localStorage.setItem('spacekeeper-language',language);sessionStorage.setItem('spacekeeper-language-view',JSON.stringify({scanId:state.scan?.id,path:state.node?.path,view:state.view,sort:$('sort').value,query:$('search').value,selected:state.selected?.path,limit:state.limit}));}catch{}
  const url=new URL(location.href);url.searchParams.set('lang',language);location.replace(url.href);
};
function onConnectionEvent(event){
  if(state.closed)return;
  if(event.type==='cancelled'){if(connectionProblems.get(event.route)?.requestId===event.requestId)connectionProblems.delete(event.route);renderConnection();return;}
  if(event.type==='success'){connectionProblems.delete(event.route);renderConnection();return;}
  connectionEvents.push(event);connectionEvents=connectionEvents.slice(-30);
  try{localStorage.setItem('spacekeeper-connection-events',JSON.stringify(connectionEvents));}catch{}
  if(['retry','failure'].includes(event.type)){
    connectionProblems.set(event.route,event);
    if(event.type==='failure'){
      pendingDiagnostics.push(event);if(pendingDiagnostics.length>30)pendingDiagnostics.shift();
      if(event.code==='SESSION_INVALID'){state.sessionInvalid=true;state.connected=false;renderMode();}
      else if(event.route!=='status')void checkService();
      else state.connected=false;
    }
  }else if(event.type==='recovered'){connectionProblems.delete(event.route);toast(t`「${routeLabel(event.route)}」已重新連線，查詢已完成。`);}
  renderConnection();
}
function renderConnection(){
  const panel=$('connectionNotice');if(!panel)return;
  if(!connectionProblems.size){panel.classList.add('hidden');return;}
  const event=[...connectionProblems.values()].at(-1);
  const reason=event.code==='TIMEOUT'?t('等候回應逾時'):event.code==='INVALID_RESPONSE'?t('回傳資料不完整'):t('連線中斷，沒有收到完整回應');
  const service=state.checkingService?t('正在確認本機服務狀態。'):state.connected===true?t('本機服務仍有回應，可重試此頁。'):t('暫時無法確認本機服務狀態，正在重連。');
  $('connectionMessage').textContent=event.code==='SESSION_INVALID'?t('工作階段已失效，請從 Spacekeeper.exe 開出的新視窗繼續。'):event.type==='retry'?t`「${routeLabel(event.route)}」連線暫時中斷，正在重新查詢（${event.attempts} / 2 次重試）。`:`「${routeLabel(event.route)}」${reason}。${service}${event.readOnly?t(' 本次只讀取資料。'):t(' 操作結果尚待確認，請勿直接重複執行。')}`;
  panel.classList.remove('hidden');
}
async function checkService(){
  if(state.checkingService||state.closed)return;state.checkingService=true;
  try{const r=await api('status',{}, {retries:0,events:false,timeout:4000});state.connected=true;state.admin=r.admin;renderMode();}
  catch{state.connected=false;renderMode();}finally{state.checkingService=false;renderConnection();}
}
async function flushDiagnostics(){
  if(state.flushingDiagnostics||!pendingDiagnostics.length)return;state.flushingDiagnostics=true;
  try{while(pendingDiagnostics.length){const e=pendingDiagnostics[0];await api('client-diagnostic',{route:e.route,code:e.code,requestId:e.requestId,attempts:e.attempts},{events:false,timeout:3000,retries:0});pendingDiagnostics.shift();}}
  catch{}finally{state.flushingDiagnostics=false;}
}
async function showConnectionDetails(){
  let server=null;try{server=await api('diagnostics',{}, {retries:0,events:false,timeout:4000});}catch{}
  const events=connectionEvents.slice(-12).reverse();
  showModal({title:t('本機連線紀錄'),description:server?t`本機服務有回應 · v${server.version} · 程序 ${server.pid}`:t('暫時無法取得服務狀態；以下保留這個視窗最近的連線紀錄。'),fields:t`<p class="modal-warning">只記錄請求名稱、時間、重試次數與識別碼，不記錄連線權杖、檔案路徑或檔案內容。若「檔案操作」未收到回應，請先核對結果再操作。</p><div class="issue-list">${events.map(e=>t`<article class="issue-entry"><strong>${esc(routeLabel(e.route))} · ${esc(connectionEventLabel(e))}</strong><p>${esc(new Date(e.time).toLocaleString(locale()))} · ${number(e.attempts)} 次請求</p><small>識別碼 ${esc(e.requestId)}</small></article>`).join('')||t('<p>這個視窗尚未記錄到連線異常。</p>')}</div>`,button:t('了解'),submit:async()=>{modalWorking=false;closeModal();}});
}
function toast(message,error=false){$('toast').textContent=message;$('toast').className='toast'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6000);}
function notice(message,error=false){$('notice').textContent=message;$('notice').className='notice'+(error?' error':'');}
function beginLoading(label){
  navigationController?.abort();navigationController=new AbortController();
  const id=++navigationId,started=Date.now();state.loading=true;clearInterval(loadingTimer);
  $('loadingLabel').textContent=label;$('loadingElapsed').textContent=t('請稍候');$('loadingStrip').classList.remove('hidden');$('viewNotice').classList.add('hidden');
  document.querySelector('main').setAttribute('aria-busy','true');
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('loading',b.dataset.view===state.view));
  loadingTimer=setInterval(()=>{$('loadingElapsed').textContent=t`已等候 ${Math.floor((Date.now()-started)/1000)} 秒`;},500);
  return id;
}
function endLoading(id){if(id!==navigationId)return;state.loading=false;clearInterval(loadingTimer);$('loadingStrip').classList.add('hidden');document.querySelector('main').setAttribute('aria-busy','false');document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('loading'));}
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function viewNotice(message,retry=false){const panel=$('viewNotice');panel.textContent=message;panel.classList.remove('hidden');if(retry){const b=document.createElement('button');b.textContent=t('重新載入此頁');b.onclick=()=>setView(state.view);panel.appendChild(b);}}
function renderMode(){const m=modePresentation({...state,connected:state.connected!==false});if(state.sessionInvalid)m.hint=t('工作階段已失效，請從 Spacekeeper.exe 開出的新視窗繼續。');$('modeLabel').textContent=m.label;document.querySelector('.mode-link').textContent=m.action;$('modeHint').textContent=m.hint;$('elevate').disabled=m.disabled;$('elevate').title=m.hint;$('elevate').classList.toggle('is-admin',!!state.admin);}
function statValue(id,bytes){const i=bytes>0?Math.min(4,Math.floor(Math.log(bytes)/Math.log(1024))):0;$(id).innerHTML=`${(bytes/1024**i).toLocaleString('en-US',{maximumFractionDigits:1})} <small>${['B','KiB','MiB','GiB','TiB'][i]}</small>`;}
function currentDrive(){const root=($('pathInput').value||state.node?.path||state.home||'').slice(0,2).toLowerCase();return state.drives.find(d=>d.path.slice(0,2).toLowerCase()===root);}
function renderDrives(){
  const chosen=currentDrive();
  const signature=JSON.stringify([state.drives,chosen?.path]);if(signature===lastDriveRender)return;lastDriveRender=signature;
  $('drives').innerHTML=state.drives.map((d,i)=>t`<button class="drive ${d===chosen?'selected':''}" data-drive="${i}" title="${esc(d.path)}"><span class="drive-line">${icon('disk')}<span class="drive-label">${esc(d.label||t('本機磁碟'))} (${esc(d.path.slice(0,2))})</span></span><span class="drive-meter"><span style="width:${((d.total-d.free)/d.total*100).toFixed(1)}%"></span></span><small>${size(d.free)} 可用 / ${size(d.total)}</small></button>`).join('')||t('<p class="muted">沒有可用的本機磁碟</p>');
  if(chosen){statValue('usedValue',chosen.total-chosen.free);statValue('freeValue',chosen.free);$('usedFoot').textContent=t`${chosen.path.slice(0,2)} · 共 ${size(chosen.total)}，已使用 ${((chosen.total-chosen.free)/chosen.total*100).toFixed(1)}%`;$('usedBar').style.width=((chosen.total-chosen.free)/chosen.total*100)+'%';$('freeFoot').textContent=chosen.free/chosen.total<.1?t('可用空間少於 10%，可以開始整理了'):t('磁碟剩餘容量 · 即時查詢值');}
}
function renderScan(){
  const s=state.scan,scanning=s?.state==='scanning';
  $('progressPanel').classList.toggle('hidden',!scanning);$('cancelButton').classList.toggle('hidden',!scanning);$('scanButton').classList.toggle('hidden',!!scanning);
  $('chooseFolder').disabled=!!scanning||state.busy;$('scanButton').disabled=state.busy;$('pathInput').disabled=!!scanning||state.busy;
  renderMode();
  $('scanWorkers').disabled=!!scanning||state.busy;
  if(!s)return;
  statValue('scannedValue',s.bytes);$('scannedFoot').textContent=`${formatCount(s.files,'file')} · ${formatCount(s.folders,'folder')}`;
  const seconds=Math.round(((s.finished||Date.now())-s.started)/1000);
  $('scanTime').textContent=t`${scanning?t('掃描中'):s.state==='cancelled'?t('已停止 · 部分資料'):t('掃描用時')} ${seconds} 秒 · ${number(s.failures)} 無法讀取 · ${number(s.links)} 連結略過`;
  if(scanning){
    $('scanNumbers').textContent=`${formatCount(s.files,'file')} · ${size(s.bytes)}`;$('scanCurrent').textContent=s.current;
    $('scanPhaseLabel').textContent=scanPhaseText(s);
    $('scanEngineLabel').textContent=t`${s.engine==='native'?t('Windows 快速列舉'):t('相容掃描模式')} · ${s.concurrency||1} 個背景工作 · ${Math.round(s.files/Math.max(.001,(Date.now()-s.started)/1000)).toLocaleString('en-US')} 個檔案／秒${s.fallbackReason?t(' · 快速引擎未能啟動，已使用相容模式'):''}。`;
  }
  if(s.state==='error'){
    notice(s.error||t('掃描失敗，請重新選擇範圍。'),true);
    $('treemap').innerHTML='<div class="empty-map">'+icon('info')+t('<strong style="margin-top:14px">掃描未完成</strong><p>請查看上方訊息，再重新掃描或選擇其他資料夾。</p></div>');
    $('mapTotal').textContent=t('沒有完整掃描資料');
  }
  else if(s.stale)notice(t('檔案已變更，目前地圖是操作前的紀錄。請按「重新掃描」更新，再繼續管理。'));
  else if(s.state==='cancelled')notice(t('掃描已停止，大小為部分結果。管理功能暫停，請完成完整掃描後再操作。'));
  else if(s.state==='done')$('notice').classList.add('hidden');
  if(s.rootRemoved)notice(t('這個掃描範圍已移至回收筒；紀錄已清空。可選擇其他資料夾繼續整理。'));
  $('scanHealth').classList.remove('hidden');$('scanHealthTitle').textContent=scanPhaseText(s);
  $('scanHealthText').textContent=t`${state.admin?t('管理員模式'):t('一般模式')} · ${number(s.failures)} 項無法讀取 · ${number(s.links)} 個連結／佔位項目略過。${s.state==='done'?t('讀取錯誤不會阻止開啟固定保護頁面；受影響大小可能偏低。'):s.partialReason||t('掃描只讀取檔案資訊。')}`;
  if(s.updated&&!s.stale)$('scanHealthText').textContent+=t(' 大小與排序已依操作更新。');
  $('scanIssues').classList.toggle('hidden',!(s.failures||s.links));
  if(!scanning)$('scanButton').innerHTML=t('重新掃描 ')+icon('refresh');
}
async function loadBrowse(p,selectPath=null,{background=false}={}){
  const id=background?navigationId:beginLoading(t('正在開啟資料夾…'));
  try{
  if(!background)await nextPaint();
  const result=await api('browse',{path:p},{signal:background?undefined:navigationController.signal});
  if(background){if(state.scan?.id!==result.scan?.id||(state.node?.path&&state.node.path!==p))return;}
  else if(id!==navigationId)return;
  state.rows=result.rows;state.node=result.node;state.scan=result.scan;state.limit=100;
  state.selected=selectPath?state.rows.find(n=>n.path===selectPath)||null:null;
  if(!background&&state.view!=='overview')state.view='overview';
  $('search').value='';renderView();renderAll();
  }catch(e){if(e.name!=='AbortError')throw e;}finally{if(!background)endLoading(id);}
}
function renderBreadcrumbs(){
  if(!state.node)return;
  const p=state.node.path,root=state.scan.root,tail=p.slice(root.length).split('\\').filter(Boolean),crumbs=[{name:root,path:root}];let running=root;
  for(const name of tail){running=running.replace(/\\$/,'')+'\\'+name;crumbs.push({name,path:running});}
  $('breadcrumbs').innerHTML=crumbs.map((c,i)=>`${i?'<span>›</span>':''}<button data-crumb="${esc(c.path)}" class="${i===crumbs.length-1?'current':''}">${esc(c.name)}</button>`).join('');
}
// Balanced area partition: every positive byte has proportional area, including the Other tile.
function partition(items,x,y,w,h,out=[]){
  if(items.length===1){out.push({...items[0],x,y,w,h});return out;}
  const total=items.reduce((a,b)=>a+b.weight,0);let acc=0,k=1;
  for(let i=0;i<items.length-1;i++){acc+=items[i].weight;k=i+1;if(acc>=total/2)break;}
  const a=items.slice(0,k),b=items.slice(k),ratio=a.reduce((v,n)=>v+n.weight,0)/total;
  if(w>=h){partition(a,x,y,w*ratio,h,out);partition(b,x+w*ratio,y,w*(1-ratio),h,out);}
  else{partition(a,x,y,w,h*ratio,out);partition(b,x,y+h*ratio,w,h*(1-ratio),out);}
  return out;
}
function renderMap(){
  if(!state.node)return;
  const all=state.rows.filter(n=>n.size>0).sort((a,b)=>b.size-a.size),display=all.slice(0,11).map(n=>({item:n,weight:n.size}));
  if(all.length>11)display.push({item:{name:t`其他 ${all.length-11} 項`,size:all.slice(11).reduce((a,b)=>a+b.size,0),other:true},weight:all.slice(11).reduce((a,b)=>a+b.size,0)});
  if(!display.length){$('treemap').innerHTML='<div class="empty-map">'+icon('folder')+t('<strong>此層沒有已讀取的檔案大小</strong><p>資料夾可能為空，或內容尚未完整讀取。</p></div>');$('mapTotal').textContent='0 B';return;}
  const rect=$('treemap').getBoundingClientRect(),palette=['#bf8268','#c9aa83','#c6bd9e','#aaad8b','#cba38b','#c0ad8e','#adb39a','#d2ba99','#b6a18a','#c2bea4','#b79d86'];
  const tiles=partition(display,0,0,rect.width-2,rect.height-2);
  $('treemap').innerHTML=tiles.map((tile,i)=>{
    const n=tile.item,compact=tile.w<120||tile.h<100,tiny=tile.w<72||tile.h<51,locked=!!n.locked;
    const color=locked?'#b2b4a2':n.suggestion?.tone==='good'?'#8f9f81':palette[i%palette.length];
    return `<button class="map-tile ${compact?'compact':''} ${tiny?'tiny':''} ${state.selected?.path===n.path&&!n.other?'selected':''}" style="left:${tile.x}px;top:${tile.y}px;width:${tile.w}px;height:${tile.h}px;background:${color}" data-map="${i}" data-path="${esc(n.path||'')}" title="${esc(n.name)} · ${size(n.size)}${locked?t(' · 固定保護'):''}" aria-label="${esc(n.name)}，${size(n.size)}${locked?t('，固定保護'):''}"><span class="map-tile-top">${icon(locked?'lock':n.isFile?'file':'folder')}<b>${esc(n.name)}</b></span><span class="tile-values"><strong>${size(n.size)}</strong>${!compact?`<small>${locked?t('固定保護'):n.isFile?t('檔案'):formatCount(n.files,'file')}</small>`:''}</span></button>`;
  }).join('');
  $('treemap').querySelectorAll('[data-map]').forEach((b,i)=>{
    const n=tiles[i].item;
    b.onclick=()=>n.other?toast(t('其餘項目列在下方清單，可使用搜尋與排序查看。')):selectItem(n);
    b.ondblclick=()=>{if(!n.other&&!n.isFile&&!n.isLink)loadBrowse(n.path).catch(e=>toast(e.message,true));};
  });
  $('mapTotal').textContent=t`此層合計 ${size(all.reduce((a,b)=>a+b.size,0))}${state.node.incomplete?t(' · 部分資料'):''}`;
}
function sourceRows(){return state.view==='suggestions'?state.suggestionRows:state.view==='protected'?state.protectedRows||[]:state.rows;}
function renderList(){
  let rows=[...sourceRows()],query=$('search').value.toLowerCase();
  if(query)rows=rows.filter(n=>n.name.toLowerCase().includes(query)||n.path.toLowerCase().includes(query));
  const sort=$('sort').value;
  rows.sort(sort==='priority'?(a,b)=>b.suggestion.score-a.suggestion.score||b.size-a.size:sort==='name'?(a,b)=>a.name.localeCompare(b.name,locale()):(a,b)=>b.size-a.size||a.name.localeCompare(b.name));
  state.visible=rows.slice(0,state.limit);$('rowCount').textContent=rows.length;
  const total=state.rows.reduce((a,b)=>a+b.size,0);
  $('fileRows').innerHTML=state.visible.map((n,i)=>{
    const pct=total?n.size/total*100:0,global=state.view!=='overview';
    return t`<tr tabindex="0" data-row="${i}" class="${n.locked?'locked-row':''} ${state.selected?.path===n.path?'selected':''}" aria-selected="${state.selected?.path===n.path}"><td><div class="file-cell"><span class="folder-icon ${n.locked?'locked':''}">${icon(n.locked?'lock':n.isFile?'file':'folder')}</span><span class="file-text"><span class="file-name" title="${esc(n.path)}">${esc(n.name)}</span><span class="file-sub" title="${esc(n.path)}">${global?esc(n.path):n.isLink?t('連結 · 略過'):n.isFile?t('檔案'):`${formatCount(n.files,'file')}${n.incomplete?t(' · 部分資料'):''}`}</span></span></div></td><td class="size-cell">${n.incomplete?'≥ ':''}${size(n.size)}</td><td>${global?'<span class="muted">—</span>':`<span class="share-line"><span class="share-bar"><span style="width:${Math.min(100,pct)}%"></span></span>${pct.toFixed(1)}%</span>`}</td><td><span class="badge ${n.suggestion.tone}" title="${esc(n.suggestion.reason)}">${n.locked?icon('lock'):''}${esc(n.suggestion.label)}</span></td><td><button class="row-action" data-detail="${i}" aria-label="查看 ${esc(n.name)} 詳情">${icon(n.locked?'lock':'arrow')}</button></td></tr>`;
  }).join('')||`<tr><td colspan="5" class="table-empty">${state.scan?t('沒有符合條件的項目。'):t('掃描完成後，項目會顯示在這裡。')}</td></tr>`;
  $('moreRows').classList.toggle('hidden',rows.length<=state.limit);
  $('fileRows').querySelectorAll('[data-row]').forEach(row=>{
    const i=+row.dataset.row,n=state.visible[i];
    if(!n.isFile&&!n.isLink){const old=row.querySelector('.file-name'),button=document.createElement('button');button.className='file-name folder-link';button.textContent=n.name;button.dataset.enter=i;button.title=t('開啟查看；保護只限制修改');old.replaceWith(button);if(n.locked)row.querySelector('.file-sub').textContent+=t(' · 可瀏覽');}
    if(n.pendingSize)row.querySelector('.size-cell').textContent=t('計算中…');
  });
  $('tableStatus').textContent=state.scan?t`顯示 ${state.visible.length} / ${rows.length} 項${state.view==='suggestions'||state.view==='protected'?t(' · 最多列出 250 項'):''}${state.scan.stale?t(' · 待重新掃描'):''}`:t('尚未掃描');
}
function selectItem(n){
  state.selected=n;
  // Preserve the clicked DOM nodes so a second click can fire a real double-click.
  $('fileRows').querySelectorAll('[data-row]').forEach(row=>{const selected=state.visible[+row.dataset.row]?.path===n.path;row.classList.toggle('selected',selected);row.setAttribute('aria-selected',String(selected));});
  $('treemap').querySelectorAll('[data-map]').forEach(tile=>tile.classList.toggle('selected',tile.dataset.path===n.path));
  renderDetail();
}
function renderDetail(){
  $('detailContent').scrollTop=0;
  const n=state.selected;if(!n){
    $('detailContent').innerHTML='<div class="detail-illustration">'+icon('folder')+t('<span class="detail-leaf"></span></div><h3>每份資料，都有它的位置。</h3><p>選取一個項目，查看大小、清理建議與可用操作。</p><div class="detail-tip">')+icon('shield')+t('<span>保護判斷會結合路徑、已安裝程式紀錄與內容特徵；無法保證辨認所有重要資料。</span></div>');return;
  }
  const disabled=n.locked||state.scan?.stale||state.scan?.state!=='done'||state.busy;
  $('detailContent').innerHTML=t`<div class="detail-name">${icon(n.isFile?'file':'folder')}<h3>${esc(n.name)}</h3></div><div class="detail-path">${esc(n.path)}</div><div class="detail-size">${n.incomplete?'≥ ':''}${size(n.size)}</div><div class="detail-facts"><span>${n.isFile?t('檔案'):t('資料夾')} · 邏輯大小</span><span>${formatCount(n.isFile?1:n.files,'file')}</span></div><div class="advice-box ${n.locked?'locked':''}"><strong>${icon(n.locked?'lock':'spark')}${esc(n.suggestion.label)}</strong><p>${esc(n.suggestion.reason)}</p></div><div class="detail-actions"><button id="detailBrowse" class="button wide">${icon(n.isFile?'external':'folder')}${n.isFile?t('在檔案總管查看位置'):t('進入資料夾')}</button><button id="detailRename" class="button" ${disabled?'disabled':''}>${icon('edit')}重新命名</button><button id="detailMove" class="button" ${disabled?'disabled':''}>${icon('arrow')}移動到…</button><button id="detailRecycle" class="button wide delete" ${disabled?'disabled':''}>${icon('trash')}移至資源回收筒</button></div>${n.locked?'<div class="detail-tip">'+icon('shield')+t('<span>固定保護不受管理員模式影響。</span></div>'):n.incomplete?'<div class="detail-tip">'+icon('info')+t('<span>讀取不完整。修改前會再次檢查，無法完整檢查的目標不執行操作。</span></div>'):''}`;
  if(!n.isFile&&!n.isLink)$('detailBrowse').innerHTML=icon('folder')+t('開啟查看（不修改）');
  if(n.pendingSize)$('detailContent').querySelector('.detail-size').textContent=t('計算中…');
  const tip=$('detailContent').querySelector('.detail-tip span');if(n.locked&&tip)tip.textContent=t('保護只限制修改；你仍可開啟、逐層查看裡面的資料夾。');
  $('detailBrowse').onclick=()=>{if(n.isFile||n.isLink)api('open',{path:parent(n.path)}).catch(e=>toast(e.message,true));else loadBrowse(n.path).catch(e=>toast(e.message,true));};
  $('detailRename').onclick=()=>manage('rename',n);$('detailMove').onclick=()=>manage('move',n);$('detailRecycle').onclick=()=>manage('recycle',n);
}
function renderView(){
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.classList.toggle('loading',state.loading&&b.dataset.view===state.view);if(b.dataset.view===state.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const titles={overview:[t('空間總覽'),t('讓空間，回到你手中。'),t('看清每一份占用，再決定哪些值得留下。')],suggestions:[t('清理建議'),t('從值得檢查的地方開始。'),t('這些是整理線索，每一份資料仍由你決定。')],protected:[t('固定保護'),t('把重要的，穩穩留下。'),t('Windows、開機、程式與關鍵資料，固定鎖定管理操作。')],history:[t('操作紀錄'),t('每一步整理，都有跡可循。'),t('查看本機管理結果，需要還原時可開啟資源回收筒。')]};
  const heading=titles[state.view];$('topTitle').textContent=heading[0];$('pageTitle').textContent=heading[1];$('pageDescription').textContent=heading[2];
  $('historyArea').classList.toggle('hidden',state.view!=='history');$('analysisArea').classList.toggle('hidden',state.view==='history');
  $('analysisArea').classList.toggle('list-view',['suggestions','protected'].includes(state.view));
  $('listTitle').childNodes[0].textContent=state.view==='suggestions'?t('建議檢查清單 '):state.view==='protected'?t('受保護項目 '):t('資料夾與檔案 ');
  $('listSubtitle').textContent=state.view==='suggestions'?t('從完整掃描範圍挑選，可能包含上下層資料夾；大小不可相加。'):state.view==='protected'?t('保護限制修改，仍可點資料夾名稱逐層查看；最多列出 250 項。'):t('點資料夾名稱開啟；點右側按鈕查看詳情與管理操作');
  if(state.pendingView&&['suggestions','protected'].includes(state.view))$('listSubtitle').textContent=t('掃描仍在進行；完成後會自動更新完整結果。');
  renderList();renderDetail();renderMap();
}
async function setView(view,{preserve=false,selectedPath=null}={}){
  const query=$('search').value,sort=$('sort').value;
  const id=beginLoading({suggestions:t('正在整理清理建議…'),protected:t('正在載入受保護項目…'),history:t('正在載入操作紀錄…'),overview:t('正在載入空間總覽…')}[view]);
  state.view=view;state.limit=100;state.selected=null;$('search').value='';
  state.pendingView=false;
  renderView();renderHistory();if(!preserve)window.scrollTo({top:0,behavior:'instant'});
  try{
    await nextPaint();
    if(['suggestions','protected'].includes(view)){
      const signal=navigationController.signal,started=Date.now();
      while(id===navigationId){
        const r=await api(view,{}, {signal});if(id!==navigationId)return;
        if(view==='suggestions'){state.suggestionRows=r.rows;$('sort').value='priority';}else{state.protectedRows=r.rows;$('sort').value='size';}
        state.pendingView=!!r.pending;
        if(!r.pending)break;
        if(r.phase==='scan'){viewNotice(t`掃描仍在進行：${number(state.scan?.files)} 個檔案已讀取。這個清單等待掃描結束後分類；無法讀取 ${number(state.scan?.failures)} 項、略過 ${number(state.scan?.links)} 個連結並不代表程式停止。可用上方「停止掃描」查看部分結果。`);break;}
        $('loadingLabel').textContent=t`正在判定保護與整理順序 · ${number(r.processed)} / ${number(r.total)} 個資料夾 · 已找到 ${number(r.matched)} 項`;
        if(Date.now()-started>60000)throw new Error(t('頁面整理超過 60 秒，已停止等待。掃描結果仍保留；請重試並查看掃描狀態與原因。'));
        await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},300);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
      }
    }
    if(view==='overview'&&!state.node&&state.scan&&['done','cancelled'].includes(state.scan.state)){const r=await api('browse',{path:state.scan.root});if(id!==navigationId)return;state.rows=r.rows;state.node=r.node;}
    if(id===navigationId){if(preserve){$('search').value=query;$('sort').value=sort;state.selected=sourceRows().find(n=>pathKey(n.path)===pathKey(selectedPath))||null;}renderView();renderHistory();renderBreadcrumbs();}
  }catch(e){if(id===navigationId&&e.name!=='AbortError'&&!['NETWORK_ERROR','TIMEOUT','INVALID_RESPONSE','SESSION_INVALID'].includes(e.code))viewNotice(e.message,true);}
  finally{endLoading(id);}
}
function renderHistory(){
  const labels={rename:t('重新命名'),move:t('移動'),recycle:t('移至回收筒')};
  $('historyList').innerHTML=state.history.map(h=>`<div class="history-entry"><span>${esc(new Date(h.time).toLocaleString(locale()))}</span><span>${esc(labels[h.action]||h.action)}</span><strong>${esc(h.path)}${h.target?'<small>→ '+esc(h.target)+'</small>':''}${h.error?'<small>'+esc(h.error)+'</small>':''}</strong><span class="badge ${h.result==='success'?'good':'review'}">${h.result==='success'?t('已完成'):t('未完成')}</span></div>`).join('')||t('<div class="history-empty">還沒有管理紀錄。從一次仔細的整理開始。</div>');
}
function renderAll(){renderScan();renderDrives();renderBreadcrumbs();renderMap();renderList();renderDetail();}
function showModal({title,description='',fields='',button=t('確認'),symbol='info',submit}){
  $('modalTitle').textContent=title;$('modalDescription').textContent=description;$('modalFields').innerHTML=fields;$('modalIcon').innerHTML=icon(symbol);$('modalError').textContent='';$('confirmModal').textContent=button;$('confirmModal').className='button primary';$('confirmModal').disabled=false;$('cancelModal').disabled=false;$('closeModal').disabled=false;modalSubmit=submit;modalWorking=false;
  if(!$('modal').open)$('modal').showModal();
}
function closeModal(){if(!modalWorking)$('modal').close();}
async function manage(action,n){
  const names={rename:t('重新命名'),move:t('移動到其他位置'),recycle:t('移至資源回收筒')};
  const fields=`<div class="modal-path">${esc(n.path)}</div>${action==='rename'?t`<label class="field-label" for="newName">新的名稱</label><input id="newName" class="modal-input" value="${esc(n.name)}" autocomplete="off" required>`:action==='move'?t('<label class="field-label" for="destination">目的資料夾（完整路徑）</label><div class="destination-field"><input id="destination" class="modal-input" placeholder="例如 D:\\資料" required><button id="pickDestination" type="button" class="button small">選擇…</button></div>'):''}<p class="modal-warning">${action==='recycle'?t('先放入資源回收筒，仍會占用磁碟空間。本程式不提供永久刪除；回收筒無法接收時，操作會回報失敗或取消。'):action==='move'?t('跨磁碟移動可能需要較長時間；中途取消或失敗時，請檢查來源與目的位置。已有同名項目時不覆蓋。'):t('新名稱會在操作前檢查，同名項目不覆蓋。')}</p>`;
  showModal({title:names[action],description:t('先檢查目標，再確認修改。系統與連結保護始終啟用。'),fields,button:t('檢查並繼續'),symbol:action==='recycle'?'trash':action==='move'?'arrow':'edit',submit:async()=>{
    const result=await api('prepare',{action,path:n.path,name:$('newName')?.value,destination:$('destination')?.value});
    modalWorking=false;
    showModal({title:t('確認這次修改'),description:t`${names[action]}：${n.name}`,fields:t`<div class="modal-path">${esc(result.path)}${result.target?'<br>→ '+esc(result.target):''}</div><label class="field-label" for="confirmation">請輸入原始名稱「${esc(result.confirmation)}」以確認</label><input id="confirmation" class="modal-input" autocomplete="off" required><p class="modal-warning">${action==='recycle'?t('移至資源回收筒後，請自行確認是否清空；清空後無法由回收筒還原。'):t('確認有效期為兩分鐘。操作前會重新檢查目標。')}</p>`,button:t('確認 ')+(action==='recycle'?t('移至回收筒'):action==='move'?t('移動'):t('重新命名')),symbol:'shield',submit:async()=>{
      const r=await api('operate',{ticket:result.ticket,confirmation:$('confirmation').value});
      modalWorking=false;closeModal();if(r.drives)state.drives=r.drives;if(pendingPoll)await pendingPoll.catch(()=>{});await poll();renderAll();toast(r.message,!!r.stale);
    }});
    $('confirmation').focus();
  }});
  if($('pickDestination'))$('pickDestination').onclick=async()=>{const b=$('pickDestination');b.disabled=true;try{const r=await api('pick',{path:state.home});if(r.path)$('destination').value=r.path;}catch(e){$('modalError').textContent=e.message;}finally{b.disabled=false;}};
}
function showScanErrors(){
  const s=state.scan;if(!s)return;
  const entries=(items)=>items.map(e=>`<article class="issue-entry"><strong>${esc(e.path)}</strong><small>${esc(e.code)}</small><p>${esc(issueExplanation(e.code,state.admin))}</p>${e.message?t`<p class="issue-original">原始訊息：${esc(e.message)}</p>`:''}</article>`).join('');
  const counts=Object.entries(s.errorCounts||{}).map(([code,count])=>t`${esc(code)}：${number(count)} 項`).join(' · ');
  showModal({title:t('掃描狀態與原因'),description:t`${scanPhaseText(s)} · ${state.admin?t('已是管理員模式'):t('一般模式')}\n無法讀取 ${number(s.failures)} 項；連結／佔位項目略過 ${number(s.links)} 個。這些項目不會讓固定保護清單停止整理。`,fields:t`<div class="modal-warning">${state.admin?t('已取得管理員權限，仍可能遇到 Windows 專用保護。'):t('權限不足時，可關閉此視窗後申請管理員並重新掃描。')}<br>連結略過是避免重複計算的掃描規則，提升權限也不會自動沿連結走訪。<br>兩類各最多保留前 200 筆路徑。</div>${counts?`<p>${counts}</p>`:''}<div class="issue-list"><h3>無法讀取</h3>${entries(s.errors||[])||t('<p>沒有保存的讀取錯誤。</p>')}<h3>連結／佔位項目略過</h3>${entries(s.skipped||[])||`<p>${s.links?t('此掃描沒有保存連結路徑；新版重新掃描後可查看。'):t('沒有略過項目。')}</p>`}</div>`,button:t('知道了'),submit:async()=>{modalWorking=false;closeModal();}});
}
function protectionHelp(){showModal({title:t('保護規則'),symbol:'shield',description:t('系統保護在一般與管理員模式都會執行。'),fields:t('<div class="modal-warning">固定保護 Windows、開機、復原、分頁檔、預設程式目錄、登錄的安裝位置、AppData 設定與程式自身。所有受保護資料夾仍可開啟查看。AppData 會逐層區分設定與快取：可辨識的 Local 快取及 Temp 子項目可個別檢查，帳號、設定、資料庫與程式安裝內容繼續保護。<br><br>內容若含 Windows 或解除安裝器特徵也會鎖定。連結、接合點與原生 System 屬性會在操作前拒絕。<br><br>保護不能辨認所有應用程式與個人重要資料。可管理的項目仍可能重要，請先確認。<br><br>大小是可讀取檔案的邏輯大小，未扣除硬連結重複，也未估算壓縮、稀疏檔案、雲端佔位或回收筒的實際釋放量。</div>'),button:t('了解'),submit:async()=>{modalWorking=false;closeModal();}});}
async function beginScan(p){
  if(!p?.trim()){toast(t('請輸入完整路徑或選擇資料夾。'),true);return;}
  const id=beginLoading(t('準備掃描…'));try{
  await nextPaint();
  const r=await api('scan',{path:p.trim(),concurrency:Number($('scanWorkers').value)});if(id!==navigationId)return;
  state.scan=r.scan;state.node=null;state.rows=[];state.selected=null;state.suggestionRows=[];state.protectedRows=[];state.view='overview';state.lastFinished=null;$('notice').classList.add('hidden');$('pathInput').value=r.scan.root;$('search').value='';
  $('treemap').innerHTML=t('<div class="empty-map"><span class="spinner"></span><strong style="margin-top:16px">正在讀取資料夾</strong><p>地圖會在掃描完成後呈現。</p></div>');
  $('detailContent').innerHTML='<div class="detail-illustration">'+icon('folder')+t('</div><h3>正在整理你的資料</h3><p>掃描只讀取檔案資訊。你可以隨時停止。</p>');
  $('breadcrumbs').textContent=r.scan.root;$('mapTotal').textContent=t('掃描中');$('candidateValue').innerHTML=t('— <small>個</small>');$('suggestionCount').textContent='—';
  renderView();renderAll();await loadBrowse(r.scan.root,null,{background:true});await poll();
  }finally{endLoading(id);}
}
async function chooseFolder(){
  $('chooseFolder').disabled=true;
  try{const r=await api('pick',{path:$('pathInput').value||state.home});if(r.path){$('pathInput').value=r.path;await beginScan(r.path);}}
  catch(e){toast(e.message,true);}finally{renderScan();}
}
async function pollInner(){
  const oldBusy=state.busy,oldStale=state.scan?.stale;
  const r=await api('status');state.connected=true;state.sessionInvalid=false;state.scan=r.scan;state.drives=r.drives;state.history=r.activity;state.home=r.home;state.busy=r.busy;state.admin=r.admin;
  renderConnection();void flushDiagnostics();
  // Permission controls update before any directory listing or page computation.
  renderScan();renderDrives();renderHistory();
  if(!state.initialized){state.initialized=true;$('pathInput').value=r.initialRoot||r.scan?.root||r.home;}
  if(state.resume&&state.resume.scanId!==r.scan?.id)state.resume=null;
  if(state.resume&&r.scan&&['done','cancelled'].includes(r.scan.state)&&!state.node){
    const saved=state.resume;state.node={path:saved.path||r.scan.root};state.view=['overview','suggestions','protected','history'].includes(saved.view)?saved.view:'overview';
    $('sort').value=['size','name','priority'].includes(saved.sort)?saved.sort:'size';$('search').value=saved.query||'';state.limit=saved.limit||100;
  }
  if(r.scan&&['done','cancelled'].includes(r.scan.state)&&state.lastFinished!==snapshotKey(r.scan)){
    const updated=state.lastFinished?.startsWith(r.scan.id+':'),stamp=snapshotKey(r.scan),id=navigationId;
    const change=updated?r.scan.lastUpdate?.change:null;
    const remap=p=>p&&change&&inside(p,change.path)?change.target?change.target+p.slice(change.path.length):null:p;
    let p=remap(state.node?.path)||parent(change?.path||r.scan.root);
    if(!inside(p,r.scan.root))p=r.scan.root;
    const selected=remap(state.selected?.path||state.resume?.selected);
    try{
      const result=await api('browse',{path:p});
      if(id===navigationId&&snapshotKey(state.scan)===stamp){
        state.rows=result.rows;state.node=result.node;state.scan=result.scan;state.lastFinished=stamp;
        state.selected=result.rows.find(n=>pathKey(n.path)===pathKey(selected))||null;
        $('pathInput').value=r.scan.root;
        if(['suggestions','protected'].includes(state.view))await setView(state.view,{preserve:true,selectedPath:selected});
        else {renderView();renderAll();}
        state.resume=null;
      }
    }catch(e){if(e.name!=='AbortError')viewNotice(t('紀錄已更新，但開啟資料夾失敗：')+e.message,true);}
  }
  if(r.scan?.state==='done'&&state.suggestionScanId!==snapshotKey(r.scan)&&!state.suggestionPolling){
    state.suggestionPolling=true;
    void api('suggestions').then(suggestions=>{
      if(snapshotKey(state.scan)!==snapshotKey(r.scan))return;
      if(suggestions.pending)return;
      state.suggestionScanId=snapshotKey(r.scan);state.suggestionRows=suggestions.rows;
      $('candidateValue').innerHTML=t`${suggestions.rows.length>=250?'250+':suggestions.rows.length} <small>個</small>`;$('suggestionCount').textContent=suggestions.rows.length>=250?'250+':suggestions.rows.length;
    }).catch(e=>{if(!state.suggestionErrorShown){state.suggestionErrorShown=true;viewNotice(t('清理建議尚未就緒：')+e.message,true);}}).finally(()=>{state.suggestionPolling=false;});
  }
  renderScan();renderDrives();renderHistory();if(state.selected&&(oldBusy!==state.busy||oldStale!==state.scan?.stale))renderDetail();
}
function poll(){if(!pendingPoll)pendingPoll=pollInner().finally(()=>{pendingPoll=null;});return pendingPoll;}
$('scanButton').onclick=()=>beginScan($('pathInput').value).catch(e=>toast(e.message,true));$('pathInput').onkeydown=e=>{if(e.key==='Enter')$('scanButton').click();};
$('chooseFolder').onclick=chooseFolder;$('emptyChoose').onclick=chooseFolder;
$('cancelButton').onclick=()=>api('cancel').then(()=>toast(t('正在停止掃描，保留已讀取的部分結果。'))).catch(e=>toast(e.message,true));
$('cancelLoading').onclick=()=>{navigationController?.abort();endLoading(navigationId);navigationId++;state.pendingView=false;viewNotice(t('已取消這次等待；背景分類可能繼續執行。可重新載入此頁。'),true);};
$('scanIssues').onclick=showScanErrors;
$('connectionDetails').onclick=showConnectionDetails;$('connectionDetailsFooter').onclick=showConnectionDetails;
$('reconnect').onclick=async()=>{await pollSafely();if(state.connected!==false)await setView(state.view);};
$('refreshDrives').onclick=()=>api('drives').then(r=>{state.drives=r.drives;renderDrives();toast(t('磁碟容量已更新。'));}).catch(e=>toast(e.message,true));
$('drives').onclick=e=>{const b=e.target.closest('[data-drive]');if(b)beginScan(state.drives[+b.dataset.drive].path).catch(e=>toast(e.message,true));};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view).catch(e=>toast(e.message,true)));
$('seeSuggestions').onclick=()=>setView('suggestions').catch(e=>toast(e.message,true));
$('search').oninput=()=>{state.limit=100;renderList();};$('sort').onchange=()=>{state.limit=100;renderList();};$('moreRows').onclick=()=>{state.limit+=100;renderList();};
$('fileRows').onclick=e=>{if(state.loading||e.detail>1)return;const enter=e.target.closest('[data-enter]');if(enter){loadBrowse(state.visible[+enter.dataset.enter].path).catch(err=>toast(err.message,true));return;}const row=e.target.closest('[data-row]');if(row)selectItem(state.visible[+row.dataset.row]);};
$('fileRows').ondblclick=e=>{if(state.loading||e.target.closest('[data-enter],[data-detail]'))return;const row=e.target.closest('[data-row]');if(!row)return;const n=state.visible[+row.dataset.row];if(!n.isFile&&!n.isLink)loadBrowse(n.path).catch(e=>toast(e.message,true));};
$('fileRows').onkeydown=e=>{const row=e.target.closest('[data-row]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectItem(state.visible[+row.dataset.row]);}};
$('breadcrumbs').onclick=e=>{const b=e.target.closest('[data-crumb]');if(b)loadBrowse(b.dataset.crumb).catch(e=>toast(e.message,true));};
$('protectionHelp').onclick=protectionHelp;$('closeModal').onclick=closeModal;$('cancelModal').onclick=closeModal;
$('modal').addEventListener('cancel',e=>{if(modalWorking)e.preventDefault();});
$('modalForm').onsubmit=async e=>{
  e.preventDefault();if(modalWorking||!modalSubmit)return;
  modalWorking=true;$('confirmModal').disabled=true;$('cancelModal').disabled=true;$('closeModal').disabled=true;$('modalError').textContent='';const label=$('confirmModal').textContent;$('confirmModal').textContent=t('檢查與處理中…');
  try{await modalSubmit();}catch(err){$('modalError').textContent=err.message;await poll().catch(()=>{});}
  finally{modalWorking=false;$('confirmModal').disabled=false;$('cancelModal').disabled=false;$('closeModal').disabled=false;if($('confirmModal').textContent===t('檢查與處理中…'))$('confirmModal').textContent=label;}
};
$('elevate').onclick=()=>{
  if(state.connected===false){viewNotice(t('本機服務暫時無法連線，正在重試。若持續失敗，請重新執行 Spacekeeper.exe。'),true);return;}
  if(state.admin){showModal({title:t('管理員模式已啟用'),description:t('這個視窗已取得管理員權限，不需要再次申請。'),fields:t('<p class="modal-warning">部分 Windows 系統服務、其他帳號或專用保護的位置仍可能無法讀取。可透過「查看原因與路徑」確認。固定保護規則仍限制修改，不影響逐層瀏覽。</p>'),button:t('了解'),symbol:'shield',submit:async()=>{modalWorking=false;closeModal();}});return;}
  const stopScan=state.scan?.state==='scanning';
  showModal({title:stopScan?t('停止掃描並申請管理員'):t('以管理員模式重新開啟'),description:(stopScan?t('先停止目前掃描，保留部分結果，再開啟 Windows 授權視窗。\n'):'')+t('請由你確認 Windows 授權。新的管理員視窗會開啟，目前視窗保留原有權限。'),fields:t('<p class="modal-warning">切換後請使用新視窗並重新掃描。系統保護仍然有效，不會自動接管擁有權或更改檔案權限。</p>'),button:stopScan?t('停止後申請'):t('申請管理員'),symbol:'shield',submit:async()=>{const r=await api('elevate',{stopScan});modalWorking=false;closeModal();toast(r.alreadyAdmin?t('已是管理員模式。'):t('管理員視窗已請求開啟，請確認 Windows 授權結果。'));}});
};
$('quit').onclick=()=>showModal({title:t('結束 Spacekeeper'),description:t('關閉本機服務；頁面將停止連線。進行中的管理操作完成前不能退出。'),button:t('結束'),submit:async()=>{state.closed=true;try{await api('shutdown');clearInterval(pollTimer);modalWorking=false;closeModal();notice(t('應用程式已結束。可以關閉這個視窗，或重新執行啟動程式。'));$('chooseFolder').disabled=true;$('scanButton').disabled=true;}catch(e){state.closed=false;throw e;}}});
$('openRecycle').onclick=()=>api('recyclebin').catch(e=>toast(e.message,true));$('windowsCleanup').onclick=()=>api('settings').catch(e=>toast(e.message,true));
document.querySelector('.brand').onclick=e=>{e.preventDefault();setView('overview').catch(err=>toast(err.message,true));};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderMap,100);});
const pollSafely=()=>state.closed?Promise.resolve():poll().catch(e=>{if(state.closed)return;state.connected=false;renderMode();renderConnection();notice(t('本機連線暫時無法更新：')+e.message+t('；每 3 秒重試。若持續失敗，請重新執行 Spacekeeper.exe。'),true);});
void pollSafely();pollTimer=setInterval(pollSafely,3000);
