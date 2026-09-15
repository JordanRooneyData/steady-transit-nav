const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {JourneyTracker}=require('./public/tracking.js');
const observation={age:0,accuracy:10,routeOffset:8,busAvailable:true,busAge:1,busDistance:15,busSpeed:9,speed:9,headingError:5,routeProgress:.1,boardingDistance:55,destinationDistance:1000,finalDistance:400,stopsRemaining:4,motion:'vehicle',previousStopPassed:false,walkingAway:false};
test('a passing bus or one noisy reading does not imply boarding',()=>{
 const t=new JourneyTracker();t.reset(1);
 for(let i=0;i<8;i++)t.update({...observation,speed:0,motion:'still'});
 assert.equal(t.stage,1);
 t.update(observation);t.update({...observation,accuracy:300});t.update(observation);
 assert.equal(t.stage,1);
 for(let i=0;i<3;i++)t.update(observation);
 assert.equal(t.stage,2);
});
test('phone-only boarding requires sustained movement, and stale bus data is ignored',()=>{
 const t=new JourneyTracker();t.reset(1);
 for(let i=0;i<4;i++)t.update({...observation,busAvailable:false});
 assert.equal(t.stage,1);t.update({...observation,busAvailable:false});assert.equal(t.stage,2);
 t.reset(1);for(let i=0;i<5;i++)t.update({...observation,busAge:95,busDistance:300});assert.equal(t.stage,2);
});
test('stale phone GPS holds the step; repeated fresh readings recover it',()=>{
 const t=new JourneyTracker();t.reset(3);
 const approaching={...observation,previousStopPassed:true,stopsRemaining:1,destinationDistance:250};
 for(let i=0;i<8;i++)t.update({...approaching,age:30});
 assert.equal(t.stage,3);assert.equal(t.uncertain,true);
 t.update(approaching);assert.equal(t.stage,3);
 t.update(approaching);t.update(approaching);assert.equal(t.stage,4);
});
test('stationary at the destination is not sufficient evidence of alighting',()=>{
 const t=new JourneyTracker();t.reset(5);
 for(let i=0;i<8;i++)t.update({...observation,speed:0,busSpeed:0,destinationDistance:10});
 assert.equal(t.stage,5);
 for(let i=0;i<3;i++)t.update({...observation,speed:1.2,busDistance:130,destinationDistance:45,walkingAway:true});
 assert.equal(t.stage,6);
});
test('early reminder timing supports stops, minutes and metres',()=>{
 for(const [rule,changes] of [[{unit:'stops',value:2},{stopsRemaining:2}],[{unit:'minutes',value:3},{buttonSeconds:180}],[{unit:'meters',value:250},{buttonDistance:250}]]){
  const t=new JourneyTracker(rule);t.reset(2);for(let i=0;i<3;i++)t.update({...observation,stopsRemaining:9,buttonSeconds:999,buttonDistance:999,...changes});assert.equal(t.stage,3,rule.unit);
 }
});
function appContext(){
 const elements={app:{innerHTML:''},toast:{classList:{add(){},remove(){}}},dialog:{addEventListener(){}}};
 const document={getElementById:id=>elements[id]||null,addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
 const {ROUTES:routes,TIMETABLE:timetable,PROFILE:profile}=require('./test-fixtures.cjs');
 const c={structuredClone,document,ROUTES:structuredClone(routes),TIMETABLE:structuredClone(timetable),STEADY_PROFILE:profile,localStorage:{getItem:()=>null},window:{scrollTo(){}},navigator:{},setTimeout(){},setInterval(){},clearInterval(){}};
 vm.createContext(c);for(const file of ['planner','navigation','simulation','tracking','reminders','app'])vm.runInContext(fs.readFileSync('./public/'+file+'.js','utf8'),c);return c;
}

test('both trips progress automatically at physical pace with or without bus GPS',()=>{
 for(const bus of [true,false])for(const index of [0,1]){
  const c=appContext();const result=vm.runInContext(`selected=${index};view='trip';forceDemoBus=true;useBus=${bus};resetDemo();const seen=new Set([0]);for(let i=0;i<4000&&stage<7;i++){demoTick(1,false);seen.add(stage);}JSON.stringify({seen:[...seen],time:simTime,finish:simulation.finishAt})`,c);const r=JSON.parse(result);
  assert.deepEqual(r.seen,[0,1,2,3,4,5,6,7]);assert(r.time>1000);assert(Math.abs(r.finish-r.time)<25);
 }
});
test('poor GPS holds last reliable position and correction does not instantly board',()=>{
 const c=appContext();vm.runInContext("view='trip';resetDemo(1);weakSignal=true;for(let i=0;i<15;i++)demoTick(1,false)",c);assert.equal(vm.runInContext('stage',c),1);assert.equal(vm.runInContext('simTime',c),vm.runInContext('simulation.stageTime(1)',c));
 vm.runInContext('weakSignal=false;demoTick(1,false)',c);assert.equal(vm.runInContext('stage',c),1);
});
test('GPS bus samples update every 45 seconds and walking has no position jumps',()=>{
 const c=appContext();assert(vm.runInContext(`(()=>{const s=new TripSimulation(0),a=s.sample(1),b=s.sample(2);return Math.abs(geoDistance(a.point,b.point)-1.3)<.1&&JSON.stringify(s.sample(46).busPoint)===JSON.stringify(s.sample(89).busPoint)&&JSON.stringify(s.sample(89).busPoint)!==JSON.stringify(s.sample(90).busPoint);})()`,c));
 for(const speed of [1,2,4,8]){vm.runInContext(`view='trip';resetDemo();simSpeed=${speed};for(let i=0;i<4;i++)demoTick(.25*simSpeed,false)`,c);assert.equal(vm.runInContext('simTime',c),speed);}
});
test('correct start pins, travel bearing and north-up remaining bus leg state',()=>{
 const c=appContext();assert.equal(vm.runInContext('Math.round(headingDegrees([0,0],[0,1]))',c),90);
 for(const index of [0,1]){vm.runInContext(`selected=${index};view='trip';forceDemoBus=true;resetDemo()`,c);assert(vm.runInContext('geoDistance(currentPosition.point,ROUTES.journeys[selected].start.point)<1',c));vm.runInContext('resetDemo(2)',c);assert.equal(vm.runInContext('navigationState().legIndex',c),1);assert(vm.runInContext('navigationState().remaining<ROUTES.journeys[selected].legs[1].length',c));}
});
test('button-free destination never shows STOP cue; preparation and press states are distinct',()=>{
 const c=appContext();vm.runInContext("view='trip';selected=0;resetDemo(4)",c);assert(!vm.runInContext('trip()',c).includes('physical-stop'));assert(vm.runInContext('trip()',c).includes('No button needed'));
 vm.runInContext('selected=1;resetDemo(3)',c);assert(vm.runInContext('trip()',c).includes('Not yet.'));assert(!vm.runInContext('trip()',c).includes('physical-stop'));
 vm.runInContext('resetDemo(4)',c);assert(vm.runInContext('trip()',c).includes('physical-stop'));assert(!vm.runInContext('trip()',c).includes('stops left'));
});
