// A virtual clock drives physical movement. GPS cadence is independent of playback speed.
class TripSimulation {
 constructor(index){
  this.index=index;this.journey=ROUTES.journeys[index];const [walk,bus,post]=this.journey.legs;
  const service=TIMETABLE.services.find(s=>s.direction===index),shape=TIMETABLE.shapes[service?.shape]||[];this.approachPath=shape.filter(p=>p[2]<=service.shapeStart).map(p=>p.slice(0,2));this.approachPath.push(bus.stops[0].point);if(this.approachPath.length<2)this.approachPath=bus.path.slice(0,20).reverse();
  this.walkEnd=walk.length/1.3;this.boardAt=this.walkEnd+120;this.segments=[];let t=this.boardAt;
  for(let i=1;i<bus.stops.length;i++){
   const start=bus.stops[i-1].distance,end=bus.stops[i].distance,distance=end-start;
   // Smooth acceleration and deceleration, with an urban cruise speed of 43 km/h.
   const duration=Math.max(18,distance/12+12);
   this.segments.push({start,end,at:t,duration});t+=duration+(i===bus.stops.length-1?0:8);
  }
  this.arriveAt=t;this.alightAt=t+20;this.finishAt=this.alightAt+post.length/1.3;
  this.pressAt=index===0?t:this.segments.at(-1).at+3;
 }
 ride(t){const bus=this.journey.legs[1];if(t<this.boardAt)return {distance:0,speed:0};
  for(const s of this.segments){if(t<s.at)return {distance:s.start,speed:0};if(t<=s.at+s.duration){const u=(t-s.at)/s.duration,a=Math.min(.25,6/s.duration);let f,v;if(u<a){f=u*u/(2*a*(1-a));v=u/(a*(1-a));}else if(u>1-a){f=1-(1-u)*(1-u)/(2*a*(1-a));v=(1-u)/(a*(1-a));}else{f=(u-a/2)/(1-a);v=1/(1-a);}return {distance:s.start+(s.end-s.start)*f,speed:(s.end-s.start)/s.duration*v};}}
  return {distance:bus.length,speed:0};
 }
 bus(t){const leg=this.journey.legs[1];if(t<this.boardAt){const approach=this.approachPath,fraction=Math.max(0,1-(this.boardAt-t)*8/pathLengths(approach).at(-1));return {point:pathPoint(approach,fraction),speed:fraction>0?8:0};}const r=this.ride(t);return {point:pathPoint(leg.path,r.distance/leg.length),speed:r.speed};}
 sample(t){
  const [walk,bus,post]=this.journey.legs,r=this.ride(t);let navLeg,navFraction,speed,motion;
  if(t<this.boardAt){navLeg=0;navFraction=Math.min(1,t/this.walkEnd);speed=t<this.walkEnd?1.3:0;motion=speed?'walking':'still';}
  else if(t<this.alightAt){navLeg=1;navFraction=r.distance/bus.length;speed=r.speed;motion=speed?'vehicle':'still';}
  else{navLeg=2;navFraction=Math.min(1,(t-this.alightAt)*1.3/post.length);speed=navFraction<1?1.3:0;motion=speed?'walking':'still';}
  const point=pathPoint(this.journey.legs[navLeg].path,navFraction),fixTime=Math.floor(t/45)*45,fix=this.bus(fixTime);
  return {point,navLeg,navFraction,speed,motion,heading:walkingBearing(this.journey.legs[navLeg].path,navFraction),age:0,accuracy:8,routeOffset:5,headingError:3,
   busAvailable:t<this.alightAt,busAge:t-fixTime,busPoint:fix.point,busSpeed:fix.speed,busDistance:geoDistance(point,fix.point),routeProgress:r.distance/bus.length,
   boardingDistance:geoDistance(point,bus.stops[0].point),destinationDistance:navLeg===2?geoDistance(point,bus.stops.at(-1).point):bus.length-r.distance,
   finalDistance:navLeg===2?post.length*(1-navFraction):post.length,stopsRemaining:bus.stops.filter(s=>s.distance>r.distance+1).length,
   previousStopPassed:t>=this.segments.at(-1).at+3,buttonSeconds:Math.max(0,this.pressAt-t),buttonDistance:Math.max(0,(this.pressAt-t)*Math.max(4,r.speed||7)),walkingAway:navLeg===2};
 }
 stageTime(stage){return [0,this.walkEnd+1,this.boardAt+35,Math.max(this.boardAt+40,this.pressAt-115),this.segments.at(-1).at+4,this.arriveAt+1,this.alightAt+1,this.finishAt][stage];}
}
