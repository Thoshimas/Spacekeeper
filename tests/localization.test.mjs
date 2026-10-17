import test from 'node:test';
import assert from 'node:assert/strict';
import {t,setLanguage,translateResponse,translateMessage,normalizeLanguage,formatCount} from '../public/i18n.mjs';
import {modePresentation,issueExplanation,scanPhaseText} from '../public/status.mjs';
import {routeLabel,connectionMessage,createApiClient} from '../public/transport.mjs';
import {appDataInfo,suggestion} from '../lib/policy.mjs';

test('English templates preserve interpolated names, paths and confirmation text exactly',()=>{
  setLanguage('en');
  try{
    const name='固定保護 <中文> & 資料夾',path='C:\\中文\\固定保護';
    assert.equal(t`查看 ${name} 詳情`,'View '+name+' details');
    assert.equal(t`請輸入原始名稱「${name}」以確認`,'Type the original name "'+name+'" to confirm');
    assert.equal(t`${path} · 固定保護`,path+' · Protected');
    assert.equal(normalizeLanguage('../../en'),'en');
    assert.equal(formatCount(1,'file'),'1 file');assert.equal(formatCount(2,'folder'),'2 folders');
  }finally{setLanguage('zh-Hant');}
});

test('first launch defaults to English and an explicit Chinese choice remains available',async()=>{
  const fresh=await import('../public/i18n.mjs?first-launch');
  assert.equal(fresh.getLanguage(),'en');assert.equal(fresh.normalizeLanguage(undefined),'en');
  assert.equal(fresh.t('固定保護'),'Protected');fresh.setLanguage('zh-Hant');assert.equal(fresh.t('固定保護'),'固定保護');
});
test('API localization changes typed messages while preserving user data and cached originals',()=>{
  const original={node:{name:'固定保護',path:'C:\\資料夾\\固定保護',locked:'磁碟根目錄固定保護',suggestion:{label:'固定保護',reason:'磁碟根目錄固定保護'}},confirmation:'固定保護',drives:[{label:'本機磁碟',path:'C:\\'}],error:'ENOENT C:\\資料夾\\固定保護',identity:['123','45']};
  const en=translateResponse(original,'en');
  assert.equal(en.node.name,original.node.name);assert.equal(en.node.path,original.node.path);assert.equal(en.confirmation,'固定保護');
  assert.equal(en.drives[0].label,'本機磁碟');assert.equal(en.node.locked,'Drive roots are protected');assert.equal(en.node.suggestion.label,'Protected');
  assert.equal(en.error,original.error);assert.deepEqual(en.identity,original.identity);assert.equal(original.node.suggestion.label,'固定保護');
  assert.equal(translateResponse(original,'zh-Hant'),original);
});
test('protection and cache reasons translate without weakening policy or rewriting unknown native errors',()=>{
  const node={path:'C:\\Users\\someone\\AppData\\Local\\pip\\Cache',size:10};
  const reason=appDataInfo(node.path).reason;
  assert.doesNotMatch(translateMessage(suggestion(node).reason,'en'),/\p{Script=Han}/u);
  assert.doesNotMatch(translateMessage('上層資料夾內容包含 Windows 系統目錄特徵','en'),/\p{Script=Han}/u);
  assert.equal(translateMessage('WIN32 5: C:\\不能更改\\資料夾','en'),'WIN32 5: C:\\不能更改\\資料夾');
  assert.match(reason,/快取/);assert.equal(suggestion({...node,locked:'fixed'}).score,-1);
});
test('English permission, scan and connection states remain actionable after repeated language changes',()=>{
  for(const lang of ['en','zh-Hant','en']){
    setLanguage(lang);const values=[...Object.values(modePresentation({busy:true})),issueExplanation('WIN32_5',true),scanPhaseText({state:'scanning',phase:'indexing',indexProcessed:20,indexTotal:100}),routeLabel('protected'),connectionMessage('operate','NETWORK_ERROR')].filter(x=>typeof x==='string');
    if(lang==='en')for(const text of values)assert.doesNotMatch(text,/\p{Script=Han}/u);else assert.equal(routeLabel('protected'),'固定保護');
  }
  assert.match(connectionMessage('operate','NETWORK_ERROR'),/unknown/);setLanguage('zh-Hant');
});
test('English transport sends language separately and preserves mutation payloads without replay',async()=>{
  setLanguage('en');let calls=0;
  try{
    const body={path:'C:\\資料夾',confirmation:'固定保護'};
    const call=createApiClient({language:()=> 'en',fetchImpl:async(_url,options)=>{calls++;assert.equal(options.headers['X-Space-Language'],'en');assert.deepEqual(JSON.parse(options.body),body);throw new TypeError('Failed to fetch');}});
    await assert.rejects(call('operate',body),error=>error.uncertain&&/unknown/.test(error.message)&&!(/\p{Script=Han}/u.test(error.message)));
    assert.equal(calls,1);
  }finally{setLanguage('zh-Hant');}
});
