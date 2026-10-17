import path from 'node:path';
const w = path.win32;
const systemContainers=new Set(['windows','program files','program files (x86)','programdata','recovery','system volume information','$recycle.bin','boot','efi','$winreagent','config.msi']);
export const key = p => w.normalize(p).replace(/\\+$/, '').toLowerCase();
export const within = (p, root) => key(p) === key(root) || key(p).startsWith(key(root) + '\\');

export function appDataInfo(p) {
  const k=key(p),m=/\\appdata(?:\\(local|locallow|roaming))?(?:\\(.*))?$/i.exec(k);
  if(!m)return null;
  const branch=m[1],tail=m[2]||'';
  if(!branch||!tail)return {kind:'container',reason:'AppData 分類目錄可瀏覽，不能整體修改'};
  // Settings, credentials, stores and installed binaries never become cache merely by name.
  if(branch!=='local'||/(^|\\)(programs|packages|componentstore|credentials|protect|vault|indexeddb|local storage|session storage|sessions|databases|extensions|saves|savegames|wallet)(\\|$)/.test(tail)||/^microsoft\\windows(?:\\|$)/.test(tail))return {kind:'settings',reason:'應用程式設定、帳號或程式資料；可瀏覽，修改受保護'};
  if(tail==='temp')return {kind:'container',reason:'暫存區根目錄固定保護；請進入後選擇子項目'};
  if(tail.startsWith('temp\\'))return {kind:'cache',known:true,reason:'個人暫存區子項目，關閉相關程式後逐一確認'};
  if(/^(pip\\cache|uv\\cache|npm-cache|d3dscache|nvidia\\(?:dxcache|glcache))(\\|$)/.test(tail))return {kind:'cache',known:true,reason:'已辨識的工具或圖形快取位置；關閉相關程式後確認'};
  if(/(^|\\)(cache|caches|code cache|gpucache|cache_data|cachestorage|cache2|startupcache)(\\|$)/.test(tail))return {kind:'cache',known:false,reason:'位於 AppData Local，名稱符合快取慣例；仍需確認內容與使用中的程式'};
  return {kind:'settings',reason:'應用程式設定或資料，不能整包修改；可進入查找個別快取'};
}

export function localPath(input) {
  if (typeof input !== 'string' || !/^[a-z]:[\\/]/i.test(input) || /[\x00-\x1f*?<>|]/.test(input) || input.slice(2).includes(':')) {
    throw new Error('請使用完整的本機路徑，例如 C:\\Users。網路、裝置路徑與萬用字元不支援。');
  }
  const p = w.normalize(input);
  if (p.slice(3).split('\\').some(s => s && (/[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))) throw new Error('不支援 Windows 保留名稱或結尾為空格、句點的路徑。');
  return p;
}

export function makePolicy({ env = process.env, appDir, installLocations = [], extraProtected = [] } = {}) {
  const systemDrive = env.SystemDrive || 'C:';
  const home = env.USERPROFILE || systemDrive + '\\Users\\Default';
  const homeKey=key(home),appKey=key(appDir||''),redirectedRoots=[env.APPDATA,env.LOCALAPPDATA].filter(Boolean).map(key);
  const protectedRoots = [
    env.SystemRoot || systemDrive + '\\Windows', env.ProgramFiles, env['ProgramFiles(x86)'],
    env.ProgramData,
    ...installLocations, ...extraProtected, appDir,
  ].filter(Boolean).map(key);
  // Resolve the earliest matching protected root in O(path depth). The former
  // scan over every installed location dominated full-drive protection views.
  const trie={children:new Map(),rootIndex:Infinity,minIndex:Infinity};
  protectedRoots.forEach((root,i)=>{
    let node=trie;node.minIndex=Math.min(node.minIndex,i);
    for(const part of root.split('\\')){
      if(!node.children.has(part))node.children.set(part,{children:new Map(),rootIndex:Infinity,minIndex:Infinity});
      node=node.children.get(part);node.minIndex=Math.min(node.minIndex,i);
    }
    node.rootIndex=Math.min(node.rootIndex,i);
  });
  const protectedMatch=k=>{
    let node=trie,match=Infinity;
    for(const part of k.split('\\')){
      node=node.children.get(part);if(!node)return match;
      match=Math.min(match,node.rootIndex);
    }
    return Math.min(match,node.minIndex);
  };
  return {
    home,
    reason(p) {
      const k = key(p), root = w.parse(p).root;
      if (k === key(root)) return '磁碟根目錄固定保護';
      if (/^[a-z]:\\users\\[^\\]+$/i.test(k)) return '使用者個人目錄不能整體修改';
      if(systemContainers.has(k.slice(3).split('\\',1)[0]))return 'Windows、開機、復原或已安裝程式路徑';
      if (['hiberfil.sys','pagefile.sys','swapfile.sys','bootmgr','bootnxt','ntldr','ntdetect.com','bcd'].includes(w.basename(p).toLowerCase())) return '系統、分頁或開機檔案';
      const match=protectedMatch(k);
      if(Number.isFinite(match)){
        const r=protectedRoots[match];
        if(k===r||k.startsWith(r+'\\'))return r===appKey?'Spacekeeper 程式自身固定保護':'系統、應用程式或設定資料固定保護';
        return '包含受保護路徑，不能整體修改';
      }
      const appData=appDataInfo(p);
      if(appData&&appData.kind!=='cache')return appData.reason;
      if(!appData&&redirectedRoots.some(r=>k===r||k.startsWith(r+'\\')))return '重新導向的應用程式設定資料；可瀏覽，修改受保護';
      if(k===homeKey||homeKey.startsWith(k+'\\'))return '使用者個人目錄不能整體修改';
      return null;
    }
  };
}

export function contentReason(names) {
  const set = new Set(names.map(n => n.toLowerCase()));
  if (set.has('system32') && (set.has('winsxs') || set.has('explorer.exe'))) return '內容包含 Windows 系統目錄特徵';
  if (set.has('bootmgr') || (set.has('bcd') && set.has('boot.sdi'))) return '內容包含開機檔案特徵';
  if ([...set].some(n => /^(unins\d*|uninstall)\.exe$/.test(n))) return '內容包含程式解除安裝器，請使用 Windows 應用程式設定';
  return null;
}

export function suggestion(item, env = process.env) {
  if (item.locked) return { score: -1, label: '固定保護', reason: item.locked, tone: 'locked' };
  if (item.incomplete || item.errors || item.links) return { score: 0, label: '資料不完整', reason: '有未讀取項目或連結，請先檢查內容。', tone: 'review' };
  const p = item.path.toLowerCase(), name = w.basename(p);
  const appData=appDataInfo(p);
  if(appData?.kind==='cache')return {score:appData.known?85:70,label:'快取候選',reason:appData.reason+'。可管理不代表可以直接刪除。',tone:'good'};
  if (env.TEMP && within(p, env.TEMP)) return { score: 85, label: '優先檢查', reason: '位於暫存區。關閉相關程式後，確認內容已不再使用。', tone: 'good' };
  if (['cache','.cache','caches','tmp','temp'].includes(name)) return { score: 70, label: '優先檢查', reason: '名稱符合快取或暫存慣例；僅為線索，不能保證可刪除。', tone: 'good' };
  if (['downloads','下載'].includes(name) || /\.(zip|7z|rar|iso|msi)$/.test(name)) return { score: 50, label: '確認後整理', reason: '下載或封存資料；請確認是否仍需保留，未驗證有其他副本。', tone: 'review' };
  if (/backup|備份|备份|saves|minecraft/.test(p)) return { score: 5, label: '保留與確認', reason: '可能包含備份、遊戲存檔或版本資料。請確認可還原副本與最新進度。', tone: 'review' };
  return { score: 20, label: '自行確認', reason: '一般使用者資料，請檢查內容後決定；大小不代表可以刪除。', tone: 'neutral' };
}
