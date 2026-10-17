import {t,locale} from './i18n.mjs';
export function modePresentation({admin,busy,scan,connected=true}){
  if(!connected)return {label:admin?t('管理員模式'):t('一般模式'),action:t('連線說明'),hint:t('暫時無法連線，正在重試；權限狀態以上次回應為準。'),disabled:false};
  if(admin)return {label:t('管理員模式 · 已啟用'),action:t('查看權限說明'),hint:t('已取得管理員權限；系統仍可能拒絕部分路徑。'),disabled:false};
  if(busy)return {label:t('一般模式'),action:t('檔案操作中'),hint:t('檔案檢查或管理操作中，完成後才能申請。'),disabled:true};
  if(scan?.state==='scanning')return {label:t('一般模式'),action:t('停止後申請 ↗'),hint:t('點此可停止掃描，再由 Windows 詢問管理員授權。'),disabled:false};
  return {label:t('一般模式'),action:t('申請管理員 ↗'),hint:t('需要較高讀取權限時可申請；由你確認 Windows 授權。'),disabled:false};
}
export function issueExplanation(code,admin=false){
  if(['WIN32_5','EACCES','EPERM'].includes(code))return admin?t('Windows 仍拒絕存取；可能由系統服務、其他帳號或專用權限保護。管理員不等於所有檔案都可讀。'):t('存取遭拒；可申請管理員後重新掃描，部分系統位置仍可能拒絕。');
  if(['WIN32_32','WIN32_33','EBUSY'].includes(code))return t('檔案或資料夾可能正被其他程式占用；關閉相關程式後再試。');
  if(['WIN32_2','WIN32_3','ENOENT'].includes(code))return t('掃描期間位置已消失或變更；可重新掃描確認。');
  if(code==='REPARSE_POINT')return t('連結、接合點或雲端佔位項目；為避免重複計算或走訪其他位置而略過，並非一般權限錯誤。');
  return t('讀取失敗；請對照原始訊息與路徑，必要時改掃較小的範圍。');
}
export function scanPhaseText(scan,now=Date.now()){
  if(!scan)return t('尚未開始掃描');
  if(scan.state==='error')return t('掃描失敗：')+(scan.error||t('原因未提供'));
  if(scan.state==='cancelled')return scan.forced?t('已結束未回應的掃描工作 · 部分結果'):t('已停止 · 部分結果');
  if(scan.state==='done')return t('掃描已完成');
  if(scan.cancelRequested)return t('正在停止；背景工作未回應時，最多等候約 5 秒後結束');
  if(scan.phase==='indexing')return t`正在建立索引 · ${Number(scan.indexProcessed||0).toLocaleString()} / ${Number(scan.indexTotal||0).toLocaleString()} 個資料夾`;
  if(scan.phase==='starting')return t('正在啟動掃描器；第一次使用可能需要編譯');
  const seconds=Math.floor((now-(scan.lastChange||scan.started))/1000);
  return seconds>=15?t`仍在等候資料夾回應 · ${seconds} 秒沒有新的計數；可停止掃描或改選較小範圍`:t('正在讀取檔案與資料夾');
}
