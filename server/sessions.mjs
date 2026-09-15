import {authenticatedUser} from './firebase-auth.mjs';
const sessionJSON=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function sessionDB(env){if(!env?.DB)throw Error('Session storage unavailable');return env.DB.withSession?env.DB.withSession('first-primary'):env.DB;}
const readSession=async(db,user)=>{const row=await db.prepare('SELECT version, snapshot, updated_at FROM journey_sessions WHERE user_id = ?').bind(user).first();return row?{version:row.version,state:JSON.parse(row.snapshot),updatedAt:row.updated_at}:{version:0,state:null,updatedAt:0};};
export function validSnapshot(s){return s&&[0,1].includes(s.selected)&&Number.isInteger(s.stage)&&s.stage>=0&&s.stage<=7&&Number.isFinite(s.simTime)&&s.simTime>=0&&s.simTime<86400&&[1,2,4,8].includes(s.simSpeed)&&typeof s.planDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.planDate)&&typeof s.planTime==='string'&&(s.planTime===''||/^\d{2}:\d{2}$/.test(s.planTime))&&s.config&&Array.isArray(s.config.journeys)&&s.config.journeys.length===2&&(!s.chosenPlan||(typeof s.chosenPlan.id==='string'&&typeof s.chosenPlan.route==='string'&&s.chosenPlan.route.length>0&&s.chosenPlan.route.length<=16&&Number.isFinite(s.chosenPlan.leaveAt)&&Number.isFinite(s.chosenPlan.departure)&&Number.isFinite(s.chosenPlan.arrival)));}
export async function sessionAPI(request,env){
 const user=await authenticatedUser(request,env);if(!user)return sessionJSON({error:'Sign in on this device to sync your journey.'},401);
 if(!['GET','PUT'].includes(request.method))return sessionJSON({error:'Method not allowed'},405);
 if(request.method==='PUT'&&(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json')))return sessionJSON({error:'Invalid request origin or content type'},403);
 try{
  const db=sessionDB(env),current=await readSession(db,user);if(request.method==='GET')return sessionJSON(current);
  const text=await request.text();if(text.length>32000)return sessionJSON({error:'Journey is too large'},413);let data;try{data=JSON.parse(text);}catch{return sessionJSON({error:'Invalid JSON'},400);}
  const {version,device,op,snapshot}=data;
  if(!Number.isInteger(version)||version<0||typeof device!=='string'||!/^[\w-]{12,80}$/.test(device))return sessionJSON({error:'Invalid session request'},400);
  if(version!==current.version)return sessionJSON({...current,error:'Journey changed on another device'},409);
  let next;
  if(op==='plan'||op==='simulation'||op==='live'){
   if(!validSnapshot(snapshot))return sessionJSON({error:'Invalid journey'},400);
   next={...snapshot,phase:op==='plan'?'planning':'travel',owner:device,simulation:op==='simulation'};
  }else if(op==='ready'){
   if(current.state?.phase!=='planning'||!current.state.chosenPlan)return sessionJSON({...current,error:'Choose a bus before leaving'},409);
   next={...current.state,phase:'handoff',owner:null,stage:0,simTime:0,auto:true,simulation:false};
  }else if(op==='claim'){
   if(current.state?.phase==='planning'&&current.state.chosenPlan)next={...current.state,phase:'travel',owner:device,stage:0,simTime:0,auto:true,simulation:false};
   else if(current.state?.phase==='handoff')next={...current.state,phase:'travel',owner:device};
   else return sessionJSON({...current,error:'Another device has already picked up the journey'},409);
  }else if(op==='progress'){
   if(current.state?.owner!==device||!validSnapshot(snapshot))return sessionJSON({...current,error:'Following the active device'},409);
   next={...snapshot,phase:current.state.phase,owner:device,simulation:current.state.simulation};
  }else if(op==='finish'){next={phase:'finished',owner:device};}
  else return sessionJSON({error:'Unknown session action'},400);
  const updated=Date.now(),json=JSON.stringify(next);
  const result=current.version===0?await db.prepare('INSERT INTO journey_sessions (user_id, version, snapshot, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING').bind(user,json,updated).run():await db.prepare('UPDATE journey_sessions SET version = version + 1, snapshot = ?, updated_at = ? WHERE user_id = ? AND version = ?').bind(json,updated,user,version).run();
  if(!result.meta.changes)return sessionJSON({...await readSession(db,user),error:'Journey changed on another device'},409);
  return sessionJSON({version:version+1,state:next,updatedAt:updated});
 }catch(error){console.error('Journey session unavailable:',error.message);return sessionJSON({error:'Sync is unavailable. Your current journey stays on this device.'},503);}
}
