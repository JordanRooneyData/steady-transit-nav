import {timetableAPI} from './timetable.mjs';
import {sessionAPI} from './sessions.mjs';
import {notificationDeviceAPI,notificationSendAPI} from './notifications.mjs';
import {authenticatedUser} from './firebase-auth.mjs';
import {profileAPI} from './profile.mjs';
// Read-only, fixed-origin access to Adelaide Metro's two public live feeds.
export function blocks(text,name){
 const out=[],re=new RegExp('\\b'+name+'\\s*\\{','g');let m;
 while((m=re.exec(text))){let depth=1,quoted=false,escaped=false,i=re.lastIndex,start=i;for(;i<text.length&&depth;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}')depth--;}if(depth===0)out.push(text.slice(start,i-1));re.lastIndex=i;}return out;
}
const scalar=(text,name)=>{const m=text.match(new RegExp('(?:^|\\s)'+name+':\\s*("(?:[^"\\\\]|\\\\.)*"|[^\\s}]+)'));if(!m)return null;return m[1][0]==='"'?JSON.parse(m[1]):m[1];};
export function parseFeed(text,kind){
 const header=blocks(text,'header')[0]||'',timestamp=Number(scalar(header,'timestamp'));
 const entries=[];
 for(const entity of blocks(text,'entity')){
  const trip=blocks(entity,'trip')[0]||'',route=scalar(trip,'route_id');if(!route)continue;
  const common={tripId:scalar(trip,'trip_id'),date:scalar(trip,'start_date'),route,relationship:scalar(trip,'schedule_relationship')||'SCHEDULED'};
  if(kind==='vehicles'){const v=blocks(entity,'vehicle')[0]||'',p=blocks(v,'position')[0]||'';const lat=Number(scalar(p,'latitude')),lon=Number(scalar(p,'longitude'));if(!p||!Number.isFinite(lat)||!Number.isFinite(lon))continue;entries.push({...common,point:[lat,lon],bearing:Number(scalar(p,'bearing'))||0,speed:Number(scalar(p,'speed'))||0,timestamp:Number(scalar(v,'timestamp'))||timestamp});}
  else{const u=blocks(entity,'trip_update')[0]||'';entries.push({...common,stops:blocks(u,'stop_time_update').map(s=>{const a=blocks(s,'arrival')[0]||'',d=blocks(s,'departure')[0]||'';return {id:scalar(s,'stop_id'),arrival:Number(scalar(a,'time'))||null,departure:Number(scalar(d,'time'))||null,relationship:scalar(s,'schedule_relationship')||'SCHEDULED'};})});}
 }
 return {timestamp,entries};
}
let liveCache=null,cacheUntil=0,pending=null;
async function readLive(){
 if(Date.now()<cacheUntil&&liveCache)return liveCache;if(pending)return pending;
 pending=(async()=>{const results=await Promise.allSettled(['vehicle_positions','trip_updates'].map(async name=>{const r=await fetch('https://gtfs.adelaidemetro.com.au/v1/realtime/'+name+'/debug',{signal:AbortSignal.timeout(10000),headers:{Accept:'text/plain'}});if(!r.ok)throw new Error('Feed unavailable');return parseFeed(await r.text(),name==='vehicle_positions'?'vehicles':'updates');}));
  const [v,t]=results.map(r=>r.status==='fulfilled'?r.value:null);liveCache={fetchedAt:Math.floor(Date.now()/1000),vehicles:v,updates:t,status:v&&t?'available':v||t?'partial':'unavailable'};cacheUntil=Date.now()+15000;return liveCache;
 })();try{return await pending;}finally{pending=null;}
}
export default {async fetch(request,env){const url=new URL(request.url);
 if(url.pathname==='/api/session')return sessionAPI(request,env);
 if(url.pathname==='/api/notifications/device')return notificationDeviceAPI(request,env);
 if(url.pathname==='/api/notifications/send')return notificationSendAPI(request,env);
 if(url.pathname==='/api/profile')return profileAPI(request,env);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(url.pathname==='/api/timetable'){if(!await authenticatedUser(request,env))return Response.json({error:'Unauthorized'},{status:401});return timetableAPI(env);}
 if(url.pathname==='/api/live'){if(!await authenticatedUser(request,env))return Response.json({error:'Unauthorized'},{status:401});try{return Response.json(await readLive(),{headers:{'Cache-Control':'private, max-age=10'}});}catch{return Response.json({status:'unavailable',vehicles:null,updates:null},{status:503});}}
 const name=url.pathname==='/'?'/index.html':url.pathname,asset=ASSETS[name];if(!asset)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
}};
