import {authenticatedAccount} from './firebase-auth.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function readSettings(env){const row=await env.DB.prepare('SELECT payload FROM private_profiles WHERE id = ?').bind('settings').first();return row?JSON.parse(row.payload):{settings:null,revision:null};}
export async function settingsAPI(request,env){
 if(!await authenticatedAccount(request,env))return json({error:'Sign in to access settings.'},403);
 if(!['GET','PUT'].includes(request.method))return json({error:'Method not allowed'},405);
 try{
  if(request.method==='GET')return json(await readSettings(env));
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request'},403);
  const text=await request.text();if(text.length>32000)return json({error:'Settings are too large'},413);
  let settings;try{settings=JSON.parse(text).settings;}catch{return json({error:'Invalid settings'},400);}
  if(!settings||typeof settings.name!=='string'||!Array.isArray(settings.journeys)||settings.journeys.length!==2||!settings.reminders||!settings.shiftPresets)return json({error:'Invalid settings'},400);
  const record={settings,revision:crypto.randomUUID()};
  await env.DB.prepare('INSERT INTO private_profiles (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at').bind('settings',JSON.stringify(record),Date.now()).run();
  return json(record);
 }catch{return json({error:'Settings sync is unavailable. Your changes remain on this device.'},503);}
}
