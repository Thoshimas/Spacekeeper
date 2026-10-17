import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {key} from './policy.mjs';

export function storagePaths(appDir,{env=process.env,installed=fs.existsSync(path.join(appDir,'installation.ini'))}={}){
  const id=crypto.createHash('sha256').update(key(appDir),'utf8').digest('hex').slice(0,20);
  const dataDir=installed?path.join(env.LOCALAPPDATA||path.join(env.USERPROFILE,'AppData','Local'),'Spacekeeper','Installs',id):appDir;
  return {installed,id,dataDir,runtimeDir:path.join(dataDir,'.runtime'),activityFile:path.join(dataDir,'activity.jsonl'),preferencesFile:path.join(dataDir,'preferences.json')};
}
export async function preferredLanguage(appDir,paths){
  try{const p=JSON.parse(await fsp.readFile(paths.preferencesFile,'utf8'));if(['en','zh-Hant'].includes(p.language))return p.language;}catch{}
  try{const raw=await fsp.readFile(path.join(appDir,'installation.ini'));const text=raw[0]===255&&raw[1]===254?raw.toString('utf16le').replace(/^\uFEFF/,''):raw.toString('utf8');if(/^Language=zh-Hant\s*$/im.test(text))return 'zh-Hant';}catch{}
  return 'en';
}
export async function saveLanguage(paths,language){
  if(!['en','zh-Hant'].includes(language))throw new Error('Unsupported language');
  await fsp.mkdir(paths.dataDir,{recursive:true});
  const tmp=paths.preferencesFile+'.'+crypto.randomUUID()+'.tmp';
  try{await fsp.writeFile(tmp,JSON.stringify({language})+'\n','utf8');await fsp.rename(tmp,paths.preferencesFile);}
  finally{await fsp.unlink(tmp).catch(()=>{});}
}
