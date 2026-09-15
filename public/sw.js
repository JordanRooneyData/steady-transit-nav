// Never cache account data, live predictions, or authenticated pages.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Steady · Offline</title><body style="font:18px system-ui;padding:32px;color:#163f45"><h1>You’re offline.</h1><p>Reconnect to load your saved journey and live bus information.</p><button onclick="location.reload()" style="font:inherit;padding:12px">Try again</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
