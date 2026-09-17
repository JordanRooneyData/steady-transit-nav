let settingsRevision=window.STEADY_SETTINGS?.revision||null,settingsBusy=false,settingsPending=null;
try{settingsPending=JSON.parse(localStorage.getItem('steady-settings-pending-v1'));}catch{}
function rememberSettings(){try{localStorage.setItem('steady-config-v1',JSON.stringify(config));if(settingsPending)localStorage.setItem('steady-settings-pending-v1',JSON.stringify(settingsPending));else localStorage.removeItem('steady-settings-pending-v1');}catch{}}
async function saveSharedSettings(settings=config){
 settingsPending=structuredClone(settings);rememberSettings();if(settingsBusy)return false;settingsBusy=true;
 const saving=settingsPending;try{const response=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:saving}),signal:AbortSignal.timeout(12000)});if(!response.ok)return false;const record=await response.json();settingsRevision=record.revision;if(JSON.stringify(settingsPending)===JSON.stringify(saving))settingsPending=null;rememberSettings();return true;}catch{return false;}finally{settingsBusy=false;}
}
async function pollSettings(){
 if(settingsBusy||document.hidden)return;if(settingsPending){await saveSharedSettings(settingsPending);return;}
 if(view==='settings'||dialog.open||document.activeElement?.form?.id==='shift-form')return;
 settingsBusy=true;try{const response=await fetch('/api/settings',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const record=await response.json();if(record.settings&&record.revision!==settingsRevision){settingsRevision=record.revision;config=normalizeReminders({...structuredClone(defaults),...record.settings,shiftPresets:{...defaults.shiftPresets,...record.settings.shiftPresets}});rememberSettings();tracker.advance=config.reminders.early;if(view==='plan'){planTime=config.shiftPresets?.[new Date(planDate+'T12:00:00').getDay()]||config.shiftTime;updatePlan();}render();}}catch{}finally{settingsBusy=false;}
}
window.addEventListener('online',pollSettings);window.addEventListener('focus',pollSettings);document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollSettings();});setInterval(pollSettings,3000);pollSettings();
