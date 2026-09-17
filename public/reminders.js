const DEFAULT_REMINDERS={
 early:{unit:'stops',value:2,vibration:'double',sound:false,push:true},
 button:{vibration:'triple',sound:true,push:true},
 boarding:{vibration:'double',sound:true,push:true},
 arrival:{vibration:'long',sound:true,push:true},
 earlyWalk:[{minutes:10,vibration:'double',phoneSound:true,desktopSound:true,phonePush:true,windowsPush:true}]
};

function normalizeReminders(target){
 const legacyAdvance=Math.max(1,Math.min(10,Number(target.advance)||2));
 const legacyVibration=target.vibrate===false?'off':'double',legacySound=!!target.sound;
 const saved=target.reminders||{};
 target.reminders={
  early:{...DEFAULT_REMINDERS.early,value:legacyAdvance,vibration:legacyVibration,sound:legacySound,...saved.early},
  button:{...DEFAULT_REMINDERS.button,vibration:legacyVibration,sound:legacySound,...saved.button},
  boarding:{...DEFAULT_REMINDERS.boarding,...saved.boarding},
  arrival:{...DEFAULT_REMINDERS.arrival,vibration:legacyVibration,sound:legacySound,...saved.arrival},
  earlyWalk:Array.isArray(saved.earlyWalk)&&saved.earlyWalk.length?saved.earlyWalk.map(item=>({...DEFAULT_REMINDERS.earlyWalk[0],...item})):[{...DEFAULT_REMINDERS.earlyWalk[0]}]
 };
 target.advance=target.reminders.early.unit==='stops'?Number(target.reminders.early.value)||2:2;
 return target;
}

const reminderName={early:'Approaching-your-stop reminder',boarding:'Prepare to board bus',button:'Button press reminder',arrival:'Bus destination arrival',walk:'Early walk reminder'};
const vibrationOptions=value=>[['off','Off'],['short','Short'],['long','Long'],['double','Double (short)'],['triple','Triple (short)']].map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('');
const reminderToggle=(title,name,checked,description='')=>`<label class="switchrow"><div><span>${title}</span>${description?`<small>${description}</small>`:''}</div><input type="checkbox" role="switch" name="${name}" ${checked?'checked':''} aria-label="${title}"></label>`;
const vibrationField=(name,value)=>`<label class="field"><span>Vibration</span><select name="${name}">${vibrationOptions(value)}</select></label>`;

function reminderSettings(target,type){
 const reminders=target.reminders,p=reminders[type]||reminders.early;
 let fields='';
 if(type==='early')fields=`<p class="reminder-explainer">This reminder comes before the button press when one is needed, or before getting off when no button press is needed.</p><div class="fieldrow"><label class="field"><span>Measure by</span><select name="reminderUnit"><option value="stops" ${p.unit==='stops'?'selected':''}>Stops</option><option value="minutes" ${p.unit==='minutes'?'selected':''}>Minutes</option><option value="meters" ${p.unit==='meters'?'selected':''}>Metres</option></select></label><label class="field"><span>How many</span><input type="number" name="reminderValue" min="1" max="999" value="${Number(p.value)||1}" required></label></div>${vibrationField('reminderVibration',p.vibration)}${reminderToggle('Sound','reminderSound',p.sound)}${reminderToggle('Push notification','reminderPush',p.push)}`;
 else if(type==='button'||type==='arrival'||type==='boarding')fields=`${type==='boarding'?'<p class="reminder-explainer">Alerts when your bus is under two minutes away, while you are waiting to board.</p>':''}${vibrationField('reminderVibration',p.vibration)}${reminderToggle('Sound','reminderSound',p.sound)}${reminderToggle('Push notification','reminderPush',p.push)}`;
 else fields=`<p class="reminder-explainer">Set alerts before it is time to begin walking. Clone this timer to add another alert.</p><div class="walk-reminders">${reminders.earlyWalk.map((timer,index)=>`<fieldset class="reminder-card"><legend>Early walk reminder ${index+1}</legend><div class="fieldrow"><label class="field"><span>Minutes before</span><input type="number" name="walkMinutes_${index}" min="1" max="180" value="${Number(timer.minutes)||10}" required></label>${vibrationField(`walkVibration_${index}`,timer.vibration)}</div>${reminderToggle('Phone chime',`walkPhoneSound_${index}`,timer.phoneSound)}${reminderToggle('Desktop chime',`walkDesktopSound_${index}`,timer.desktopSound)}${reminderToggle('Phone push notification',`walkPhonePush_${index}`,timer.phonePush)}${reminderToggle('Windows notification',`walkWindowsPush_${index}`,timer.windowsPush)}${index?`<button type="button" class="quiet remove-reminder" data-action="remove-walk-reminder" data-index="${index}">Remove this reminder</button>`:''}</fieldset>`).join('')}</div><button type="button" class="secondary" data-action="clone-walk-reminder">Clone early walk timer</button>`;
 return `<label class="field reminder-picker"><span>Reminder to edit</span><select id="reminder-type" name="reminderType">${Object.entries(reminderName).map(([key,label])=>`<option value="${key}" ${type===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="reminder-options"><h4>${reminderName[type]}</h4>${fields}<button type="button" class="secondary" data-action="test-reminder">${icon('bell')}Try reminder</button></div>`;
}

function captureReminderDraft(target,data,type){
 normalizeReminders(target);
 if(type==='walk'){
  target.reminders.earlyWalk=target.reminders.earlyWalk.map((timer,index)=>({...timer,minutes:Number(data.get(`walkMinutes_${index}`))||10,vibration:String(data.get(`walkVibration_${index}`)||'off'),phoneSound:data.has(`walkPhoneSound_${index}`),desktopSound:data.has(`walkDesktopSound_${index}`),phonePush:data.has(`walkPhonePush_${index}`),windowsPush:data.has(`walkWindowsPush_${index}`)}));
  return;
 }
 const current=target.reminders[type];
 current.vibration=String(data.get('reminderVibration')||'off');current.sound=data.has('reminderSound');current.push=data.has('reminderPush');
 if(type==='early'){current.unit=String(data.get('reminderUnit')||'stops');current.value=Math.max(1,Number(data.get('reminderValue'))||1);target.advance=current.unit==='stops'?current.value:2;}
}

function activeReminderPreferences(target,type,index=0){
 normalizeReminders(target);
 if(type!=='walk')return target.reminders[type];
 const timer=target.reminders.earlyWalk[index]||target.reminders.earlyWalk[0],phone=!!window.SteadyNative?.native||typeof phoneDevice!=='undefined'&&phoneDevice;
 return {vibration:timer.vibration,sound:phone?timer.phoneSound:timer.desktopSound,push:phone?timer.phonePush:timer.windowsPush};
}

function vibrationPattern(kind){return {off:[],short:[160],long:[650],double:[160,110,160],triple:[160,110,160,110,160]}[kind]||[];}

if(typeof module!=='undefined')module.exports={DEFAULT_REMINDERS,normalizeReminders,vibrationPattern};
