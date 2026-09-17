const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('SteadyDesktop',{openGoogleSignIn:id=>ipcRenderer.invoke('steady-open-google-sign-in',id)});
