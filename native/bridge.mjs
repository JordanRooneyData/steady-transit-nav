import {Capacitor,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {LocalNotifications} from '@capacitor/local-notifications';
import {PushNotifications} from '@capacitor/push-notifications';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {initializeApp} from 'firebase/app';
import {browserLocalPersistence,getAuth,GoogleAuthProvider,onAuthStateChanged,setPersistence,signInWithPopup,signOut as webSignOut} from 'firebase/auth';
const BackgroundGeolocation=registerPlugin('BackgroundGeolocation');

const native=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
let watcher=null,notificationId=1000;
let authUser=null,webAuth=null,resolveAuth,appReady=false,booting=false,pendingUpdate=null;
const authReady=new Promise(resolve=>resolveAuth=resolve);
const firebaseConfig={projectId:'steady-transit-nav',appId:'1:752037734871:web:31cd2b29dee70af5220392',storageBucket:'steady-transit-nav.firebasestorage.app',apiKey:'AIzaSyDyzKbT1dKzKBCg0u4I8n-1nrXzaAG7Jn4',authDomain:'steady-transit-nav.firebaseapp.com',messagingSenderId:'752037734871'};

function authView(message,error=false,busy=false,switchable=false){
 const gate=document.getElementById('auth-gate'),text=document.getElementById('auth-message'),button=document.getElementById('auth-signin');if(!gate||!text||!button)return;
 if(appReady){gate.hidden=true;return;}gate.hidden=false;text.textContent=message||'Sign in to open Steady.';text.dataset.error=error?'true':'false';button.hidden=!!authUser&&!switchable;button.disabled=busy;button.textContent=switchable?'Use another account':'Continue with Google';button.dataset.switchAccount=switchable?'true':'';
}
const appScripts=['/vendor/leaflet.js','/vendor/leaflet-rotate.js','/planner.js','/navigation.js','/simulation.js','/tracking.js','/reminders.js','/app.js','/devices.js','/companion.js'];
const loadScript=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error(`Could not load ${src}`));document.head.append(script);});
async function bootstrap(){if(!authUser||appReady||booting)return;booting=true;authView('Opening your journeys…',false,true);try{const response=await fetch('/api/profile',{headers:{Accept:'application/json'}});if(!response.ok){if(response.status===403){authView('This Google account does not have access to Steady.',true,false,true);return;}throw Error('Your journeys could not be loaded.');}const data=await response.json();window.ROUTES=data.routes;window.TIMETABLE=data.timetable;window.STEADY_PROFILE=data.profile;for(const src of appScripts)await loadScript(src);appReady=true;authView();if(pendingUpdate)announceUpdate(pendingUpdate);if(native)registerPush().catch(()=>{});}catch(error){authView(error?.message||'Steady could not be opened. Please try again.',true,false,true);}finally{booting=false;}}
function setAuthUser(user){authUser=user||null;resolveAuth?.(authUser);resolveAuth=null;if(authUser)bootstrap();else authView();window.dispatchEvent(new CustomEvent('steady-auth-changed',{detail:{user:authUser}}));}
async function initializeAuthentication(){
 try{
  if(native){const result=await FirebaseAuthentication.getCurrentUser();setAuthUser(result.user);await FirebaseAuthentication.addListener('authStateChange',({user})=>setAuthUser(user));}
  else{webAuth=getAuth(initializeApp(firebaseConfig));await setPersistence(webAuth,browserLocalPersistence);onAuthStateChanged(webAuth,setAuthUser,()=>setAuthUser(null));}
 }catch{setAuthUser(null);}
}
async function signIn(){
 authView('Opening Google sign-in…',false,true);
 try{if(native){const result=await FirebaseAuthentication.signInWithGoogle({useCredentialManager:true});setAuthUser(result.user||(await FirebaseAuthentication.getCurrentUser()).user);}else await signInWithPopup(webAuth,new GoogleAuthProvider());if(native&&authUser)registerPush().catch(()=>{});}catch(error){authView(error?.message||'Google sign-in did not finish. Please try again.',true);}
}
async function signOut(){if(native)await FirebaseAuthentication.signOut();else if(webAuth)await webSignOut(webAuth);setAuthUser(null);location.reload();}
async function authToken(forceRefresh=false){await authReady;if(!authUser)return null;try{return native?(await FirebaseAuthentication.getIdToken({forceRefresh})).token:await webAuth.currentUser?.getIdToken(forceRefresh)||null;}catch{return null;}}
const originalFetch=window.fetch.bind(window);window.fetch=async(input,options={})=>{const url=new URL(input instanceof Request?input.url:input,location.href);if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);const token=await authToken();const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(options.headers||{}).forEach((value,key)=>headers.set(key,value));if(token)headers.set('Authorization',`Bearer ${token}`);return originalFetch(input,{...options,headers});};
window.SteadyAuth={ready:authReady,signIn,signOut,getToken:authToken,user:()=>authUser};
initializeAuthentication();

async function allowNotifications(){
 let local=await LocalNotifications.checkPermissions();
 if(local.display!=='granted')local=await LocalNotifications.requestPermissions();
 return local.display==='granted';
}

async function notify({title='Steady',body,urgent=false,sound=true,vibration=true}={}){
 if(!native||!body||!await allowNotifications())return false;
 const channelId=`journey-${sound?'sound':'silent'}-${vibration?'vibrate':'still'}`;
 await LocalNotifications.createChannel({id:channelId,name:'Journey alerts',description:'Alerts for the active Steady journey',importance:urgent?5:4,visibility:1,vibration,sound:sound?'default':undefined});
 await LocalNotifications.schedule({notifications:[{id:++notificationId,title,body,channelId,schedule:{at:new Date(Date.now()+100)},sound:sound?'default':undefined,extra:{url:'/'}}]});
 return true;
}

async function startBackgroundLocation(onLocation,onError){
 if(!native)return false;
 if(watcher)await BackgroundGeolocation.removeWatcher({id:watcher}).catch(()=>{});
 watcher=await BackgroundGeolocation.addWatcher({
  backgroundTitle:'Steady journey active',
  backgroundMessage:'Steady is following your walk and will alert you at the right stop.',
  requestPermissions:true,
  stale:false,
  distanceFilter:3
 },(location,error)=>{
  if(error){onError?.(error);return;}
  if(!location)return;
  onLocation?.({coords:{latitude:location.latitude,longitude:location.longitude,accuracy:location.accuracy,altitude:location.altitude,altitudeAccuracy:location.altitudeAccuracy,heading:location.bearing,speed:location.speed},timestamp:location.time||Date.now()});
 });
 return true;
}

async function stopBackgroundLocation(){
 if(!watcher)return;
 const id=watcher;watcher=null;
 await BackgroundGeolocation.removeWatcher({id}).catch(()=>{});
}

async function registerPush(){
 if(!native)return {available:false};
 const permission=await PushNotifications.requestPermissions();
 if(permission.receive!=='granted')return {available:true,granted:false};
 await PushNotifications.addListener('registration',async({value})=>{
  await fetch('/api/notifications/device',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value,platform:'android'})}).catch(()=>{});
 });
 await PushNotifications.register();
 return {available:true,granted:true};
}

async function checkForUpdate(){
 if(!native)return null;
 const repository=document.querySelector('meta[name="steady-release-repository"]')?.content;
 if(!repository)return null;
 try{
  const current=(await App.getInfo()).version;
  const response=await fetch(`https://api.github.com/repos/${repository}/releases/latest`,{headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)return null;
  const release=await response.json(),latest=String(release.tag_name||'').replace(/^v/,'');
  const newer=latest.localeCompare(current,undefined,{numeric:true,sensitivity:'base'})>0,asset=release.assets?.find(item=>item.name?.endsWith('.apk')),update=newer?{version:latest,url:asset?.browser_download_url||release.html_url}:null;
  if(update){pendingUpdate=update;if(appReady)announceUpdate(update);}
  return update;
 }catch{return null;}
}
function announceUpdate(update){window.dispatchEvent(new CustomEvent('steady-update-available',{detail:update}));pendingUpdate=null;}

async function openUpdate(url){if(native&&url)await Browser.open({url});}

if(native){
 window.SteadyNative={native:true,notify,startBackgroundLocation,stopBackgroundLocation,registerPush,checkForUpdate,openUpdate};
 window.addEventListener('DOMContentLoaded',async()=>{await authReady;if(authUser)registerPush().catch(()=>{});checkForUpdate().catch(()=>{});},{once:true});
 App.addListener('appStateChange',({isActive})=>{if(isActive)checkForUpdate().catch(()=>{});});
}
window.addEventListener('DOMContentLoaded',()=>{document.getElementById('auth-signin')?.addEventListener('click',event=>event.currentTarget.dataset.switchAccount?signOut().catch(()=>authView('Could not switch accounts. Please try again.',true,false,true)):signIn());document.addEventListener('click',event=>{if(event.target.closest('[data-auth-signout]'))signOut().catch(()=>authView('Could not sign out. Please try again.',true));});if(authUser)bootstrap();else authView('Sign in to open Steady.');},{once:true});
