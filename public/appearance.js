'use strict';
// Runs before styles/paint. Appearance never reads or writes ledger state.
(function(root){
  const key='research-ledger-appearance',choices=['system','light','dark'];
  const media=root.matchMedia('(prefers-color-scheme: dark)');
  let preference='system',storageWarning='';
  try{const saved=root.localStorage.getItem(key);if(choices.includes(saved))preference=saved;}catch(_){storageWarning='Appearance follows your selection for this visit. Browser storage is unavailable.';}
  function resolved(){return preference==='system'?(media.matches?'dark':'light'):preference;}
  function apply(){
    const theme=resolved(),html=document.documentElement;html.dataset.theme=theme;html.dataset.appearance=preference;html.style.colorScheme=theme;
    const color=document.getElementById('appThemeColor');if(color)color.content=theme==='dark'?'#202124':'#f4f3f0';
    const control=document.getElementById('appearanceSelect');if(control){control.value=preference;control.title=preference==='system'?`System appearance (currently ${theme})`:`${theme[0].toUpperCase()+theme.slice(1)} appearance`;}
    const status=document.getElementById('appearanceStatus');if(status)status.textContent=`${preference==='system'?'System':preference[0].toUpperCase()+preference.slice(1)} appearance. Currently ${theme}.`;
    const notice=document.getElementById('appearanceNotice');if(notice){notice.textContent=storageWarning;notice.hidden=!storageWarning;}
  }
  function setPreference(value){
    if(!choices.includes(value))return false;preference=value;
    try{root.localStorage.setItem(key,value);storageWarning='';}catch(_){storageWarning='Appearance changed for this visit, but could not be saved in this browser.';}
    apply();return true;
  }
  const changed=()=>{if(preference==='system')apply();};
  if(media.addEventListener)media.addEventListener('change',changed);else media.addListener(changed);
  root.addEventListener('storage',event=>{if(event.key===key||event.key===null){preference=choices.includes(event.newValue)?event.newValue:'system';apply();}});
  root.Appearance=Object.freeze({setPreference,get preference(){return preference;},get resolved(){return resolved();},key});
  apply();
  function setup(){document.getElementById('appearanceSelect')?.addEventListener('change',event=>setPreference(event.target.value));apply();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})(window);
