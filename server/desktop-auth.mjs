import {authenticatedAccount} from './firebase-auth.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function customToken(env,uid){const service=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}'),now=Math.floor(Date.now()/1000);if(service.project_id!=='steady-transit-nav'||!service.private_key||!service.client_email)throw Error('Firebase unavailable');const head=encode({alg:'RS256',typ:'JWT'}),body=encode({iss:service.client_email,sub:service.client_email,aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:now,exp:now+120,uid}),unsigned=head+'.'+body,key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(service.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']),signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));return unsigned+'.'+btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function desktopAuthAPI(request,env){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request'},403);
 try{
  const text=await request.text();if(text.length>1500)return json({error:'Invalid request'},400);let data;try{data=JSON.parse(text);}catch{return json({error:'Invalid request'},400);}
  const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB,action=new URL(request.url).pathname.split('/').at(-1),now=Date.now();
  if(action==='start'){
   if(!/^[a-f0-9]{64}$/.test(data.challenge||''))return json({error:'Invalid request'},400);
   await db.prepare('DELETE FROM desktop_logins WHERE expires_at < ?').bind(now).run();
   const source=await digest(request.headers.get('cf-connecting-ip')||'unknown'),count=await db.prepare('SELECT COUNT(*) AS total FROM desktop_logins WHERE source = ?').bind(source).first();
   if(count.total>=5)return json({error:'Too many sign-in attempts. Try again in ten minutes.'},429);
   const id=crypto.randomUUID();await db.prepare('INSERT INTO desktop_logins (id, challenge, source, expires_at) VALUES (?, ?, ?, ?)').bind(id,data.challenge,source,now+600000).run();return json({id});
  }
  if(!/^[a-f0-9-]{36}$/.test(data.id||''))return json({error:'Invalid sign-in request'},400);
  const row=await db.prepare('SELECT * FROM desktop_logins WHERE id = ? AND expires_at > ?').bind(data.id,now).first();if(!row)return json({error:'This sign-in request expired. Start again from Steady.'},410);
  if(action==='approve'){
   const account=await authenticatedAccount(request,env);if(!account)return json({error:'This account does not have access to Steady.'},403);
   const result=await db.prepare('UPDATE desktop_logins SET user_id = ? WHERE id = ? AND user_id IS NULL AND expires_at > ?').bind(account.id,data.id,now).run();return result.meta.changes?json({approved:true}):json({error:'This sign-in request was already approved.'},409);
  }
  if(action==='poll'){
   if(!/^[a-f0-9]{64}$/.test(data.verifier||'')||await digest(data.verifier)!==row.challenge)return json({error:'Invalid sign-in request'},403);
   if(!row.user_id)return json({pending:true});
   const token=await customToken(env,row.user_id),claimed=await db.prepare('DELETE FROM desktop_logins WHERE id = ? AND user_id = ? AND expires_at > ?').bind(data.id,row.user_id,now).run();
   return claimed.meta.changes?json({token}):json({error:'This sign-in request was already used.'},410);
  }
  return json({error:'Unknown action'},404);
 }catch{return json({error:'Desktop sign-in is unavailable. Please try again.'},503);}
}
