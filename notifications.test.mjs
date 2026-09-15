import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDeviceAPI,notificationSendAPI} from './server/notifications.mjs';

function request(body,headers={}){return new Request('https://steady.test/api/notifications/device',{method:'PUT',headers:{origin:'https://steady.test','content-type':'application/json',authorization:'Bearer firebase-test-token',...headers},body:JSON.stringify(body)});}

test('notification device registration is authenticated and stored',async()=>{
 let values;
 const env={TEST_AUTH_USER:'test-user',DB:{prepare(){return {bind(...bound){values=bound;return {run:async()=>({meta:{changes:1}})};}};}}};
 const response=await notificationDeviceAPI(request({token:'x'.repeat(64),platform:'android'}),env);
 assert.equal(response.status,200);
 assert.deepEqual(values.slice(0,3),['x'.repeat(64),'test-user','android']);
});

test('notification device registration rejects bad tokens',async()=>{
 const response=await notificationDeviceAPI(request({token:'short',platform:'android'}),{TEST_AUTH_USER:'test-user'});
 assert.equal(response.status,400);
});

test('notification device registration requires a Firebase user',async()=>{
 const response=await notificationDeviceAPI(request({token:'x'.repeat(64),platform:'android'},{authorization:'', 'oai-authenticated-user-id':'spoofed'}),{});
 assert.equal(response.status,401);
});

test('due departure alerts are claimed once even when no phone is registered',async()=>{
 const plan={id:'trip-1',route:'R1',leaveAt:Date.now()};
 const env={TEST_AUTH_USER:'test-user',DB:{prepare(sql){return {bind(){if(sql.startsWith('SELECT snapshot'))return {first:async()=>({snapshot:JSON.stringify({phase:'planning',chosenPlan:plan})})};if(sql.startsWith('INSERT INTO notification_deliveries'))return {run:async()=>({meta:{changes:1}})};if(sql.startsWith('SELECT token'))return {all:async()=>({results:[]})};throw Error(sql);}};}}};
 const response=await notificationSendAPI(new Request('https://steady.test/api/notifications/send',{method:'POST',headers:{origin:'https://steady.test','content-type':'application/json',authorization:'Bearer firebase-test-token'},body:JSON.stringify({op:'departure'})}),env);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,sent:0});
});

test('departure pushes cannot be sent before the alert window',async()=>{
 const env={TEST_AUTH_USER:'test-user',DB:{prepare(){return {bind(){return {first:async()=>({snapshot:JSON.stringify({phase:'planning',chosenPlan:{id:'trip-1',route:'R1',leaveAt:Date.now()+120000}})})};}};}}};
 const response=await notificationSendAPI(new Request('https://steady.test/api/notifications/send',{method:'POST',headers:{origin:'https://steady.test','content-type':'application/json',authorization:'Bearer firebase-test-token'},body:JSON.stringify({op:'departure'})}),env);
 assert.equal(response.status,409);
});
