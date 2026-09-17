const {app,BrowserWindow,dialog,shell,ipcMain}=require('electron');
const {autoUpdater}=require('electron-updater');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {isAuthBootstrapUrl,isSiteUrl,isTrustedNavigation}=require('./navigation.cjs');

const SITE='https://steady-trip.jormandollan.chatgpt.site/?desktopApp=1';
let mainWindow;
ipcMain.handle('steady-open-google-sign-in',async(event,id)=>{if(!isSiteUrl(event.senderFrame?.url)||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid sign-in request');const url='https://steady-trip.jormandollan.chatgpt.site/?desktopLogin='+id,chrome=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>path.join(base,'Google/Chrome/Application/chrome.exe')).find(file=>fs.existsSync(file));if(chrome){await new Promise((resolve,reject)=>{const child=spawn(chrome,[url],{detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});}).catch(()=>shell.openExternal(url));}else return shell.openExternal(url);});

function openExternalSafely(url){
 try{
  const target=new URL(url);
  if(target.protocol==='https:'||target.protocol==='mailto:')shell.openExternal(target.href);
 }catch{}
}

function secureWebContents(contents,{authWindow=false}={}){
 contents.setWindowOpenHandler(({url})=>{
  if(isAuthBootstrapUrl(url)||isTrustedNavigation(url)){
   return {action:'allow',overrideBrowserWindowOptions:{width:520,height:760,parent:mainWindow,autoHideMenuBar:true,backgroundColor:'#f7fbf5',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}};
  }
  openExternalSafely(url);
  return {action:'deny'};
 });
 contents.on('will-navigate',(event,url)=>{
  if(isTrustedNavigation(url))return;
  event.preventDefault();
  openExternalSafely(url);
 });
 if(authWindow){
  contents.on('did-navigate',(_event,url)=>{
   if(isSiteUrl(url)&&mainWindow&&!mainWindow.isDestroyed()){
    mainWindow.loadURL(SITE);
    const window=BrowserWindow.fromWebContents(contents);
    if(window&&!window.isDestroyed())window.close();
   }
  });
 }
}

function createWindow(){
 mainWindow=new BrowserWindow({width:520,height:820,minWidth:390,minHeight:580,title:'Steady Companion',icon:path.join(__dirname,'../public/icons/icon.ico'),backgroundColor:'#f7fbf5',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const appSession=mainWindow.webContents.session;
 appSession.setPermissionCheckHandler((_contents,permission,origin)=>permission==='notifications'&&isSiteUrl(origin));
 appSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='notifications'&&isSiteUrl(details.requestingUrl||contents.getURL())));
 mainWindow.removeMenu();
 secureWebContents(mainWindow.webContents);
 mainWindow.webContents.on('did-create-window',window=>secureWebContents(window.webContents,{authWindow:true}));
 mainWindow.loadURL(SITE);
}

function checkForUpdates(){
 if(!app.isPackaged)return;
 autoUpdater.autoDownload=true;
 autoUpdater.autoInstallOnAppQuit=true;
 autoUpdater.on('update-downloaded',async info=>{
  const result=await dialog.showMessageBox(mainWindow,{type:'info',title:'Steady update ready',message:`Steady Companion ${info.version} is ready.`,detail:'Restart now to finish updating.',buttons:['Restart and update','Later'],defaultId:0,cancelId:1});
  if(result.response===0)autoUpdater.quitAndInstall(false,true);
 });
 autoUpdater.checkForUpdatesAndNotify().catch(()=>{});
}

app.whenReady().then(()=>{createWindow();checkForUpdates();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();else checkForUpdates();});});
app.on('window-all-closed',()=>app.quit());
