const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('shift times default to PM and expose only quarter-hour choices',()=>{
 const c={module:{exports:{}},exports:{},require,console};vm.createContext(c);vm.runInContext(fs.readFileSync('public/planner.js','utf8'),c);
 assert.equal(vm.runInContext("quarterTime('')",c),'13:00');
 assert.equal(vm.runInContext("quarterTime('16:07')",c),'16:00');
 assert.equal(vm.runInContext("quarterTime('16:08')",c),'16:15');
 const app=fs.readFileSync('public/app.js','utf8'),planner=fs.readFileSync('public/planner.js','utf8');
 for(const day of ['Thursday','Friday','Saturday','Sunday'])assert.ok(app.includes(day));
 assert.ok(app.includes("['00','15','30','45']"));
 assert.ok(planner.includes("timePicker('Shift starts','shiftTime'"));
 assert.ok(!planner.includes('type="time"'));
 assert.ok(!planner.includes('Choose a time in 15-minute intervals.'));
});

test('reminder editor exposes independent reminder types and clonable walk timers',()=>{
 const source=fs.readFileSync('public/reminders.js','utf8');
 for(const label of ['Early reminder','Button press reminder','Bus destination arrival','Early walk reminder','Stops','Minutes','Metres','Phone chime','Desktop chime','Phone push notification','Windows notification','Clone early walk timer','Try reminder'])assert.ok(source.includes(label),label);
 const reminders=require('./public/reminders.js');
 const target={advance:3,vibrate:true,sound:false};reminders.normalizeReminders(target);
 assert.equal(target.reminders.early.value,3);assert.notEqual(target.reminders.button,target.reminders.arrival);
 assert.notEqual(target.reminders.boarding,target.reminders.early);target.reminders.boarding.sound=true;assert.equal(target.reminders.early.sound,false);assert.ok(source.includes('Prepare to board bus'));
 assert.deepEqual(reminders.vibrationPattern('triple'),[160,110,160,110,160]);
});

test('outbound arrival and return departure keep their independent mapped points',()=>{
 const {ROUTES:routes}=require('./test-fixtures.cjs');
 assert.deepEqual(routes.journeys[0].legs[2].path.at(-1),routes.journeys[0].end.point);
 assert.notDeepEqual(routes.journeys[1].start.point,routes.journeys[0].end.point);
});
