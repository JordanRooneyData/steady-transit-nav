import {authenticatedUser} from './firebase-auth.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function database(env){if(!env?.DB)throw Error('Notification storage unavailable');return env.DB.withSession?env.DB.withSession('first-primary'):env.DB;}
const encode=value=>btoa(typeof value==='string'?value:String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const pemBytes=pem=>Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
let accessCache={token:'',until:0,key:''};

async function firebaseAccess(env){
 const service=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}'),now=Math.floor(Date.now()/1000);
 if(!service.project_id||!service.client_email||!service.private_key)throw Error('Firebase is not configured');
 if(accessCache.key===service.client_email&&accessCache.until>now+60)return {token:accessCache.token,project:service.project_id};
 const header=encode(JSON.stringify({alg:'RS256',typ:'JWT'})),claims=encode(JSON.stringify({iss:service.client_email,sub:service.client_email,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600,scope:'https://www.googleapis.com/auth/firebase.messaging'})),unsigned=`${header}.${claims}`;
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(service.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=encode(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned)));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})});
 if(!response.ok)throw Error('Firebase authorization failed');
 const result=await response.json();accessCache={token:result.access_token,until:now+(result.expires_in||3600),key:service.client_email};
 return {token:result.access_token,project:service.project_id};
}

async function sendFirebase(env,device,title,body){
 const auth=await firebaseAccess(env),response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(auth.project)}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token:device,notification:{title,body},android:{priority:'high',notification:{channel_id:'journey',sound:'default'}}}})});
 return {ok:response.ok,remove:response.status===404||response.status===400};
}

export async function notificationDeviceAPI(request,env){
 const user=await authenticatedUser(request,env);
 if(!user)return json({error:'Sign in on this device to enable notifications.'},401);
 if(!['PUT','DELETE'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request origin or content type'},403);
 let data;try{data=await request.json();}catch{return json({error:'Invalid JSON'},400);}
 const token=typeof data.token==='string'?data.token.trim():'';
 if(token.length<32||token.length>4096||data.platform!=='android')return json({error:'Invalid notification device'},400);
 try{
  const db=database(env);
  if(request.method==='DELETE')await db.prepare('DELETE FROM notification_devices WHERE token = ? AND user_id = ?').bind(token,user).run();
  else{const now=Date.now();await db.prepare('INSERT INTO notification_devices (token, user_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at').bind(token,user,data.platform,now,now).run();}
  return json({ok:true});
 }catch(error){console.error('Notification device unavailable:',error.message);return json({error:'Notifications could not be connected.'},503);}
}

export async function notificationSendAPI(request,env){
 const user=await authenticatedUser(request,env);if(!user)return json({error:'Sign in to send journey alerts.'},401);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request origin or content type'},403);
 let data;try{data=await request.json();}catch{return json({error:'Invalid JSON'},400);}
 if(data.op!=='departure')return json({error:'Unknown notification'},400);
 try{
  const db=database(env),row=await db.prepare('SELECT snapshot FROM journey_sessions WHERE user_id = ?').bind(user).first();
  if(!row)return json({error:'No planned journey'},409);const state=JSON.parse(row.snapshot),plan=state.chosenPlan,now=Date.now(),index=Math.max(0,Math.floor(Number(data.index)||0)),saved=state.config?.reminders?.earlyWalk?.[index],minutes=Math.max(1,Math.min(180,Number(data.minutes)||Number(saved?.minutes)||1));
  if(saved&&(!saved.phonePush||Number(saved.minutes)!==minutes))return json({error:'Departure alert settings changed'},409);
  if(!['planning','handoff'].includes(state.phase)||!plan||now<plan.leaveAt-minutes*60000||now>plan.leaveAt+1800000)return json({error:'Departure alert is not due'},409);
  const eventKey=`${user}:departure:${plan.id}:${plan.leaveAt}:${index}:${minutes}`,claimed=await db.prepare('INSERT INTO notification_deliveries (event_key, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(event_key) DO NOTHING').bind(eventKey,user,now).run();
  if(!claimed.meta.changes)return json({ok:true,sent:0,duplicate:true});
  const devices=await db.prepare('SELECT token FROM notification_devices WHERE user_id = ?').bind(user).all(),body=`${minutes} minute${minutes===1?'':'s'} until it’s time to start walking for bus ${plan.route}.`,results=await Promise.all((devices.results||[]).map(async({token})=>({token,...await sendFirebase(env,token,'Start walking soon',body)})));
  await Promise.all(results.filter(r=>r.remove).map(r=>db.prepare('DELETE FROM notification_devices WHERE token = ?').bind(r.token).run()));
  return json({ok:true,sent:results.filter(r=>r.ok).length});
 }catch(error){console.error('Push notification failed:',error.message);return json({error:'The phone alert could not be sent.'},503);}
}
