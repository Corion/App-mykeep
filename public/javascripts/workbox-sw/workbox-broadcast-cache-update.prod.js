this.workbox=this.workbox||{},this.workbox.broadcastUpdate=function(t){"use strict";try{self.workbox.v["workbox:broadcast-cache-update:3.0.0-alpha.1"]=1}catch(t){}var e={CACHE_UPDATED:"CACHE_UPDATED"};const s=(t,s,a,c)=>{t.postMessage({type:e.CACHE_UPDATED,meta:c,payload:{cacheName:s,updatedUrl:a}})};class a{constructor(t,{headersToCheck:e,source:s}={}){this.t=t,this.e=e||["content-length","etag","last-modified"],this.s=s||"workbox-broadcast-cache-update"}a(){return this.c||(this.c=new BroadcastChannel(this.t)),this.c}notifyIfUpdated(t,e,a,c){((t,e,s)=>!s.some(s=>t.headers.has(s)&&e.headers.has(s))||s.every(s=>{const a=t.headers.has(s)===e.headers.has(s),c=t.headers.get(s)===e.headers.get(s);return a&&c}))(t,e,this.e)||s(this.a(),c,a,this.s)}}class c{constructor(t,e){this.h=new a(t,e)}cacheDidUpdate({cacheName:t,oldResponse:e,newResponse:s,url:a}){e&&this.h.notifyIfUpdated(e,s,t,a)}}return t.BroadcastCacheUpdate=a,t.BroadcastCacheUpdatePlugin=c,t.broadcastUpdate=s,t.messageTypes=e,t}({});
//# sourceMappingURL=workbox-broadcast-cache-update.prod.js.map