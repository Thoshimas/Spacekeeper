import test from 'node:test';
import assert from 'node:assert/strict';
import {modePresentation,issueExplanation,scanPhaseText} from '../public/status.mjs';
import {setLanguage} from '../public/i18n.mjs';
setLanguage('zh-Hant');

test('administrator, scanning, busy and offline modes have actionable explanations',()=>{
  const admin=modePresentation({admin:true,busy:false});assert.equal(admin.disabled,false);assert.match(admin.label,/已啟用/);
  const scan=modePresentation({admin:false,scan:{state:'scanning'}});assert.equal(scan.disabled,false);assert.match(scan.action,/停止/);
  const busy=modePresentation({admin:false,busy:true});assert.equal(busy.disabled,true);assert.match(busy.hint,/檔案/);
  assert.match(modePresentation({connected:false}).hint,/重試/);
});
test('permission denial, skipping and a stalled scan have distinct explanations',()=>{
  assert.match(issueExplanation('WIN32_5',true),/仍拒絕/);assert.match(issueExplanation('REPARSE_POINT'),/並非一般權限錯誤/);
  assert.equal(scanPhaseText({state:'done',phase:'indexing'}),'掃描已完成');
  assert.match(scanPhaseText({state:'scanning',started:1000},21000),/沒有新的計數/);
  assert.match(scanPhaseText({state:'scanning',phase:'indexing',indexProcessed:100,indexTotal:300}),/100 \/ 300/);
});
