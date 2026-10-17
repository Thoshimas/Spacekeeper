import {english} from './en.mjs';
let language='en';
export const normalizeLanguage=value=>value==='zh-Hant'?'zh-Hant':'en';
export const getLanguage=()=>language;
export const setLanguage=value=>language=normalizeLanguage(value);
export const locale=()=>language==='en'?'en-US':'zh-Hant';
export function formatCount(value,type){
  const n=Number(value||0),count=n.toLocaleString(locale());
  if(!['file','folder'].includes(type))throw new Error('Unsupported count type');
  return language==='en'?`${count} ${type}${n===1?'':'s'}`:`${count} 個${type==='file'?'檔案':'資料夾'}`;
}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern=new RegExp(Object.keys(english).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
const cache=new Map();
export function translateLiteral(value,lang=language){
  const source=String(value??'');if(normalizeLanguage(lang)!=='en')return source;
  if(!cache.has(source))cache.set(source,source.replace(pattern,match=>english[match]));
  return cache.get(source);
}
// Tagged templates translate authored fragments only. Interpolated values may
// contain any language (including folder names) and are never translated.
export function t(source,...values){
  if(Array.isArray(source)&&Object.hasOwn(source,'raw'))return source.map((part,i)=>translateLiteral(part)+(i<values.length?String(values[i]):'')).join('');
  return translateLiteral(source);
}
export function translateMessage(value,lang='zh-Hant'){
  if(typeof value!=='string'||normalizeLanguage(lang)!=='en')return value;
  if(Object.hasOwn(english,value))return english[value];
  for(const prefix of ['上層資料夾','整理頁面失敗：','快速掃描器未能完成。'])if(value.startsWith(prefix))return english[prefix]+translateMessage(value.slice(prefix.length),lang);
  const suffix='。可管理不代表可以直接刪除。';
  if(value.endsWith(suffix)&&Object.hasOwn(english,value.slice(0,-suffix.length)))return english[value.slice(0,-suffix.length)]+english[suffix];
  const prefix='檔案操作已完成，但更新紀錄失敗：',ending='。請重新掃描確認。';
  if(value.startsWith(prefix)&&value.endsWith(ending))return english[prefix]+translateMessage(value.slice(prefix.length,-ending.length),lang)+english[ending];
  const exited=/^(掃描程序結束|相容掃描程序提前結束) \((-?\d+)\)。?$/.exec(value);
  if(exited)return `${exited[1]==='掃描程序結束'?'Scanner':'Compatibility scanner'} exited (${exited[2]}).`;
  // Unknown/native errors remain verbatim: they can contain a real user path.
  return value;
}
const messageFields=new Set(['error','message','reason','locked','contentLock','containsLock','inheritedLock','ancestorLock','partialReason','fallbackReason']);
export function translateResponse(value,lang='zh-Hant',parent=''){
  if(normalizeLanguage(lang)!=='en'||value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(item=>translateResponse(item,lang,parent));
  return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,typeof item==='string'&&(messageFields.has(field)||(field==='label'&&parent==='suggestion'))?translateMessage(item,lang):translateResponse(item,lang,field)]));
}
export function initLocalization(){
  let saved;try{saved=localStorage.getItem('spacekeeper-language');}catch{}
  const requested=new URL(location.href).searchParams.get('lang');
  setLanguage(requested==='en'||requested==='zh-Hant'?requested:saved);
  try{localStorage.setItem('spacekeeper-language',language);}catch{}
  document.documentElement.lang=language;document.title=t(document.title);
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode())if(!node.parentElement.closest('script,style,[data-i18n-skip]'))node.nodeValue=t(node.nodeValue);
  for(const element of document.querySelectorAll('[aria-label],[title],[placeholder],[data-screen-label]')){
    if(element.closest('[data-i18n-skip]'))continue;
    for(const attr of ['aria-label','title','placeholder','data-screen-label'])if(element.hasAttribute(attr))element.setAttribute(attr,t(element.getAttribute(attr)));
  }
  const select=document.getElementById('languageSelect');if(select)select.value=language;
}
