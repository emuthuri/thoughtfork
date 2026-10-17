'use strict';
// Keep unrelated web destinations outside the notebook's app window where the browser supports it.
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');if(!link)return;
  const url=new URL(link.href,location.href);
  if(['http:','https:'].includes(url.protocol)&&url.origin!==location.origin){link.target='_blank';link.rel='noopener noreferrer';}
},true);
