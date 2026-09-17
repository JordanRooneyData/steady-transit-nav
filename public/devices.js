// Shared state is account-scoped on the server. This ID only identifies the active tab.
let deviceId;try{deviceId=sessionStorage.getItem('steady-device')||crypto.randomUUID();sessionStorage.setItem('steady-device',deviceId);}catch{deviceId=crypto.randomUUID();}
const deviceParams=new URLSearchParams(location.search),phoneDevice=!deviceParams.has('desktopApp')&&!!(window.SteadyNative?.native||navigator.userAgentData?.mobile||matchMedia('(pointer: coarse)').matches),widgetOnly=deviceParams.has('widget');
let shared={version:0,state:null},syncReady=false,syncBusy=false,syncError='',localControl=false,sendQueue=Promise.resolve(),lastSent='',pipWindow=null,installPrompt=null,pendingApply=false,lastDeparturePush=new Set();
const isSharedFollower=()=>!localControl&&shared.state&&shared.state.phase!=='finished'&&shared.state.owner!==deviceId;
const takeLocalControl=()=>{localControl=true;};
function journeySnapshot(){return {selected,stage,simTime:Number(simTime)||0,simSpeed,auto,planDate:planDate||localDate(),planTime,chosenPlan,config,boardAlerted};}
function syncLabel(){return syncError||(!syncReady?'Connecting your devices…':shared.state?.phase==='handoff'?'Ready for your phone':isSharedFollower()?'Following your other device':'Synced across your devices');}
function deviceActions(){return `<div class="device-actions">${phoneDevice?`<button class="primary" data-device="ready" ${syncBusy?'disabled':''}>Start trip ${icon('arrow')}</button>`:'<button class="secondary" data-device="widget">Popout timer</button>'}<p class="sync-caption" role="status">${esc(syncLabel())}</p><small>${phoneDevice?'Start navigation when you’re ready to go. Journeys opened from your desktop still start automatically.':'Keep this countdown open. When you’re ready to go, open Steady on your phone and navigation will start automatically.'}</small></div>`;}
function handoffScreen(){const state=shared.state;return `<main class="shell"><div class="eyebrow">${state?.phase==='handoff'?'READY WHEN YOU ARE':'JOURNEY ON YOUR PHONE'}</div><h1>${state?.phase==='handoff'?'Your phone can take it from here.':'Following along.'}</h1><p>${state?.phase==='handoff'?'Open Steady on your phone, signed into the same account. Your journey will appear automatically.':'Your phone is running the journey. This screen stays in sync.'}</p>${state?.chosenPlan?`<div class="instruction"><strong>Bus ${esc(state.chosenPlan.route)}</strong><br>${esc(config.journeys[state.selected].title)}</div>`:''}<p class="sync-caption">${esc(syncLabel())}</p><button class="secondary" data-device="install">Open on your phone</button><button class="quiet" data-device="continue-here">Continue on this device</button><button class="quiet" data-action="confirm-end">Finish trip</button></main>`;}
function adoptSession(record,force=false){
 if(record.version<shared.version)return;const changed=record.version!==shared.version;shared=record;syncReady=true;
 const s=record.state;if(!s){updateDeviceUI();return;}
 if((changed||force)&&!localControl&&(view==='settings'||dialog.open||document.activeElement?.form?.id==='shift-form'))pendingApply=true;
 if((changed||force||pendingApply)&&!localControl&&(s.owner!==deviceId||force)&&view!=='settings'&&!dialog.open&&document.activeElement?.form?.id!=='shift-form'){
  pendingApply=false;stopAuto();stopPlanning();planningError='';
  if(s.phase==='finished'){chosenPlan=null;view='home';}
   else{
    selected=s.selected;planDate=s.planDate;planTime=s.planTime;chosenPlan=s.chosenPlan;boardAlerted=!!s.boardAlerted;forceDemoBus=!!s.simulation;
   if(s.phase==='planning'){stage=0;tripStarted=false;currentPosition={point:ROUTES.journeys[selected].start.point,navLeg:0,navFraction:0};tracker.reset();view='plan';startLive();startPlanClock();}
   else if(s.phase==='handoff'){view='handoff';tripStarted=true;}
   else{if(typeof liveMode!=='undefined')liveMode=!s.simulation;tripStarted=true;resetDemo(s.stage);simTime=s.simTime;lastObservation=Math.floor(simTime);currentPosition=s.simulation?simulation.sample(simTime):null;stage=s.stage;tracker.reset(stage);simSpeed=s.simSpeed;view=(!phoneDevice&&s.owner!==deviceId)?'handoff':'trip';if(s.auto&&s.owner===deviceId&&!widgetOnly&&!document.hidden)startAuto();}
  }
  mapKey='';render();
 }
 updateDeviceUI();if(s.phase==='handoff'&&phoneDevice&&!widgetOnly&&!syncBusy&&!document.hidden)syncWrite('claim');
}
async function pollSession(){if(syncBusy||localControl||document.hidden&&!pipWindow)return;try{const r=await fetch('/api/session',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(r.status===401?'Sign in with the same account on both devices.':'Sync unavailable. Keeping this device’s state.');const record=await r.json();syncError='';adoptSession(record,!syncReady&&view==='home');if(phoneDevice&&shared.state?.phase==='planning'&&shared.state.owner!==deviceId&&shared.state.chosenPlan&&view==='plan'&&!widgetOnly&&!document.hidden)await syncWrite('claim');}catch(e){syncError=e.message;updateDeviceUI();}}
function syncWrite(op,snapshot=journeySnapshot()){
 sendQueue=sendQueue.then(async()=>{
  syncBusy=true;updateDeviceUI();try{
   const r=await fetch('/api/session',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,snapshot,device:deviceId,version:shared.version}),signal:AbortSignal.timeout(12000)});if(r.status===401)throw Error('Sign in with the same account on both devices.');const record=await r.json();
   if(r.status===409){localControl=false;syncError='Another device updated this journey. Showing its latest state.';adoptSession(record,true);return false;}
   if(!r.ok)throw Error(record.error||'Could not sync. Please try again.');
   syncError='';localControl=false;lastSent=JSON.stringify(snapshot);adoptSession(record,op==='ready'||op==='claim');return true;
  }catch(e){syncError=e.message;return false;}finally{syncBusy=false;updateDeviceUI();}
 });return sendQueue;
}
async function readyToLeave(){if(syncBusy)return;if(!chosenPlan){toast('Choose your bus first.');return;}if(!shared.state||shared.state.phase!=='planning'){if(!await syncWrite('plan')){toast(syncError);return;}}const ok=await syncWrite('ready');if(!ok)toast(syncError);else if(phoneDevice)await syncWrite('claim');}
async function maybeSendDeparturePush(){const s=shared.state,p=s?.chosenPlan;if(!p||!['planning','handoff'].includes(s.phase)||Date.now()>p.leaveAt+1800000)return;normalizeReminders(config);for(const [index,timer] of config.reminders.earlyWalk.entries()){const due=p.leaveAt-Number(timer.minutes||10)*60000,key=`${p.id}:${p.leaveAt}:${index}:${timer.minutes}`;if(Date.now()<due||lastDeparturePush.has(key))continue;lastDeparturePush.add(key);const prefs=activeReminderPreferences(config,'walk',index),message=`${timer.minutes} minute${Number(timer.minutes)===1?'':'s'} until it’s time to start walking for bus ${p.route}.`;notify(prefs,false,message);if(!phoneDevice&&timer.phonePush){try{const response=await fetch('/api/notifications/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'departure',index,minutes:Number(timer.minutes)}),signal:AbortSignal.timeout(12000)});if(!response.ok&&response.status!==409)lastDeparturePush.delete(key);}catch{lastDeparturePush.delete(key);}}}}
function widgetMarkup(){const s=shared.state,p=s?.chosenPlan||chosenPlan,planning=s?.phase==='planning'||!s,leave=p?.leaveAt;return `<main class="countdown-widget"><div class="widget-brand">steady <span>DESKTOP</span></div><div class="eyebrow">${planning?'TIME UNTIL YOU LEAVE':s?.phase==='handoff'?'PHONE HANDOFF':'ON YOUR PHONE'}</div><div class="widget-time" data-widget-clock>${planning&&leave?leave<=Date.now()?'Time to leave':countdown(leave):planning?'Choose your bus':s?.phase==='handoff'?'Ready to go':'Journey in progress'}</div><p>${planning&&leave?`Leave ${s?.selected===1?'work':'home'} at <strong>${clockText(leave)}</strong> · Bus ${esc(p.route)}`:s?.phase==='handoff'?'Open Steady on your phone to continue.':'Your current journey is synced.'}</p><div class="sync-caption" role="status">${esc(syncLabel())}</div><small>${planning?'Open Steady on your phone when you’re ready to go. Navigation will start automatically.':pipWindow?'Keep the original Steady tab open.':'Compact window. Always-on-top depends on your browser.'}</small></main>`;}
function updateDeviceUI(){
 for(const root of [document,pipWindow?.document].filter(Boolean)){root.querySelectorAll('[data-device="ready"]').forEach(el=>el.disabled=syncBusy||!chosenPlan);root.querySelectorAll('.sync-caption').forEach(el=>el.textContent=syncLabel());const holder=root.getElementById('widget-root');if(holder){const active=root.activeElement?.dataset?.device;holder.innerHTML=widgetMarkup();if(active)holder.querySelector(`[data-device="${active}"]`)?.focus({preventScroll:true});}}
}
async function openDesktopWidget(){
 if('documentPictureInPicture' in window){try{pipWindow=await window.documentPictureInPicture.requestWindow({width:360,height:310});pipWindow.document.title='Steady · Leave countdown';const css=pipWindow.document.createElement('link');css.rel='stylesheet';css.href=new URL('/style.css',location.href).href;pipWindow.document.head.append(css);pipWindow.document.body.innerHTML='<div id="widget-root"></div>';pipWindow.document.addEventListener('click',deviceClick);const clock=pipWindow.setInterval(updateDeviceUI,1000);pipWindow.addEventListener('pagehide',()=>{clearInterval(clock);pipWindow=null;});updateDeviceUI();return;}catch{}}
 const opened=window.open('/?widget=1','steady-countdown','popup,width=370,height=350');if(!opened)toast('Allow a pop-up to open the desktop countdown.');else toast('Compact countdown opened. This browser may not keep it above other windows.');
}
function showInstall(){showDialog(`<h2>Steady on your phone</h2><p>Open this address on your phone and sign in with the same account you use here.</p><a class="phone-link" href="${location.origin}" target="_blank" rel="noopener">${esc(location.host)}</a><button class="secondary" data-device="copy-link">Copy phone link</button>${installPrompt?'<button class="primary" data-device="install-now">Install Steady</button>':''}<p><strong>Android:</strong> Open in Chrome → menu ⋮ → Add to Home screen → Install.</p><p><strong>iPhone:</strong> Open in Safari → Share → Add to Home Screen.</p><p>Your desktop journey syncs when you open Steady. This is the installable prototype: foreground phone GPS is available; keep the screen on during a journey.</p><button class="quiet" data-action="dismiss">Done</button>`);}
async function deviceClick(e){const b=e.target.closest('[data-device]');if(!b||b.disabled)return;const action=b.dataset.device;if(action==='ready')await readyToLeave();else if(action==='widget')openDesktopWidget();else if(action==='install')showInstall();else if(action==='install-now'&&installPrompt){await installPrompt.prompt();installPrompt=null;closeDialog();}else if(action==='copy-link'){try{await navigator.clipboard.writeText(location.origin);toast('Link copied.');}catch{toast('Copy the address shown above.');}}else if(action==='continue-here'){if(shared.state?.phase==='handoff')await syncWrite('claim');else{takeLocalControl();view='trip';startAuto();render();await syncWrite(typeof liveMode!=='undefined'&&liveMode?'live':'simulation');}}}
document.addEventListener('click',deviceClick);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
window.addEventListener('online',pollSession);window.addEventListener('focus',pollSession);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollSession();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
setInterval(async()=>{
 if(syncBusy||document.hidden&&!pipWindow)return;
 if(syncReady&&shared.state?.owner===deviceId&&['planning','travel'].includes(shared.state.phase)&&!localControl&&view!=='settings'&&!dialog.open){const snapshot=journeySnapshot(),fingerprint=JSON.stringify(snapshot);if(fingerprint!==lastSent){await syncWrite('progress',snapshot);return;}}
 await pollSession();await maybeSendDeparturePush();
},3000);
if(widgetOnly)document.body.classList.add('widget-only');
render();pollSession();
