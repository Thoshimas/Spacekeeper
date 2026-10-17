import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const native = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../native');
export const powershell = path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
export async function shell(action, payload = {}, timeout = 120000) {
  const encoded=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
  let stdout;
  try {
    ({stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',path.join(native,'bridge.ps1'),'-Action',action,'-Payload',encoded], {windowsHide:true,timeout,maxBuffer:8*1024*1024}));
  } catch(e) {
    throw Object.assign(new Error(e.killed?'Windows 處理已逾時或被取消。請檢查來源與目的位置後重新掃描。':'Windows 輔助程式無法完成。請確認 PowerShell 可執行，且未被裝置管理原則封鎖。'),{code:e.code});
  }
  let result;
  try {result=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());}
  catch {throw new Error('Windows 回傳的結果無法讀取，請關閉後重新啟動程式。');}
  if (!result.ok) throw Object.assign(new Error(result.error || 'Windows 操作未完成。'),{code:result.code});
  return result;
}
export async function machineInfo() {
  return shell('info');
}
export function openWindow(url) {
  const candidates=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles].filter(Boolean).map(p=>path.join(p,'Microsoft','Edge','Application','msedge.exe'));
  const edge=candidates.find(p=>fs.existsSync(p));
  // execFile/spawn arguments never pass file paths through a command shell.
  if(edge) {
    const child=spawn(edge,[`--app=${url}`,'--new-window'],{windowsHide:true,detached:true,stdio:'ignore'});
    child.on('error',()=>{}); child.unref();
  } else {
    shell('browser',{url}).catch(e=>process.stderr.write(e.message+'\n'));
  }
}
