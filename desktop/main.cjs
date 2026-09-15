const {app,BrowserWindow,dialog,shell}=require('electron');
const {autoUpdater}=require('electron-updater');
const path=require('node:path');
const {isAuthBootstrapUrl,isSiteUrl,isTrustedNavigation}=require('./navigation.cjs');

const SITE='https://steady-trip.jormandollan.chatgpt.site/?desktopApp=1';
let mainWindow;

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
 mainWindow=new BrowserWindow({width:520,height:820,minWidth:390,minHeight:580,title:'Steady Companion',icon:path.join(__dirname,'../public/icons/icon.ico'),backgroundColor:'#f7fbf5',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
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
