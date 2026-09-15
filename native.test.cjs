const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Android shell points at the existing Steady Site',()=>{
 const config=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));
 assert.equal(config.appId,'au.com.steadytrip.app');
 assert.equal(config.server.url,'https://steady-trip.jormandollan.chatgpt.site');
 assert.equal(config.android.useLegacyBridge,true);
 assert.deepEqual(config.server.allowNavigation,['steady-trip.jormandollan.chatgpt.site']);
});

test('native bridge is loaded before journey scripts',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.includes('/native-runtime.js'));assert.ok(!html.includes('/app.js'));
 const bridge=fs.readFileSync('native/bridge.mjs','utf8');
 assert.match(bridge,/fetch\('\/api\/profile'[\s\S]*for\(const src of appScripts\)await loadScript/);
 assert.match(bridge,/distanceFilter:3/);
 assert.match(bridge,/checkForUpdate/);
 assert.match(bridge,/pendingUpdate/);
 assert.match(bridge,/assets\?\.find/);
 assert.match(bridge,/FirebaseAuthentication\.signInWithGoogle/);
 assert.match(bridge,/Authorization/);
});

test('Firebase sign-in gates the public app before journey scripts run',()=>{const html=fs.readFileSync('public/index.html','utf8'),css=fs.readFileSync('public/style.css','utf8'),config=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));assert.ok(html.includes('id="auth-gate"'));assert.ok(html.includes('Continue with Google'));assert.ok(css.includes('.auth-gate'));assert.deepEqual(config.plugins.FirebaseAuthentication.providers,['google.com']);});

test('Windows companion isolates the remote Site from Node',()=>{
 const main=fs.readFileSync('desktop/main.cjs','utf8');
 assert.match(main,/nodeIntegration:false/);
 assert.match(main,/contextIsolation:true/);
 assert.match(main,/checkForUpdatesAndNotify/);
 assert.match(main,/secureWebContents/);
 assert.match(main,/setPermissionRequestHandler/);
 assert.match(main,/permission==='notifications'&&isSiteUrl/);
});

test('desktop Firebase sign-in navigation stays inside the trusted app session',()=>{
 const {isAuthBootstrapUrl,isSiteUrl,isTrustedNavigation}=require('./desktop/navigation.cjs');
 assert.equal(isAuthBootstrapUrl('about:blank'),true);
 assert.equal(isAuthBootstrapUrl('file:///C:/Windows/System32/calc.exe'),false);
 assert.equal(isTrustedNavigation('https://steady-transit-nav.firebaseapp.com/__/auth/handler'),true);
 assert.equal(isTrustedNavigation('https://accounts.google.com/o/oauth2/auth'),true);
 assert.equal(isTrustedNavigation('https://auth.openai.com/oauth/authorize'),false);
 assert.equal(isTrustedNavigation('https://example.com/auth.openai.com'),false);
 assert.equal(isTrustedNavigation('file:///C:/Windows/System32/calc.exe'),false);
 assert.equal(isSiteUrl('https://steady-trip.jormandollan.chatgpt.site/callback?code=example'),true);
});
