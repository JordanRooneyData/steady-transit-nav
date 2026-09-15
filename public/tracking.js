// Prototype inference engine. Input observations are simulated by app.js.
// These thresholds are illustrative, not calibrated for real-world navigation.
class JourneyTracker {
  constructor(advance=2){this.advance=advance;this.reset();}
  reset(stage=0){this.stage=stage;this.candidate=null;this.samples=0;this.uncertain=false;this.reason='Waiting for location';this.stops=4;}
  update(o){
    const fresh=Number.isFinite(o.age)&&o.age<=10;
    const accurate=Number.isFinite(o.accuracy)&&o.accuracy<=40;
    const onRoute=Number.isFinite(o.routeOffset)&&o.routeOffset<=55;
    const busAvailable=o.busAvailable&&o.busAge<=5;
    const busAgrees=!busAvailable||(o.busDistance<=70&&Math.abs(o.speed-o.busSpeed)<=3);
    const movingOnRoute=o.speed>=4&&o.headingError<=35&&onRoute;
    // A bus can pass a waiting passenger: proximity alone is never boarding.
    const boarding=movingOnRoute&&o.routeProgress>.02&&busAgrees&&o.motion!=='walking';
    this.uncertain=!fresh||!accurate||(!onRoute&&this.stage>=2&&this.stage<=4)||(this.stage>=2&&this.stage<=4&&busAvailable&&!busAgrees);
    if(this.uncertain){this.samples=0;this.candidate=null;this.reason=!fresh?'Location is out of date':!accurate?'Phone location is imprecise':'Location signals disagree';return this;}
    this.reason=busAvailable?'Phone and bus positions agree':'Phone position, direction and movement';
    let target=this.stage;
    if(this.stage===0&&o.boardingDistance<=35&&o.speed<2.5)target=1;
    if(this.stage===1&&boarding)target=2;
    const reminder=typeof this.advance==='object'?this.advance:{unit:'stops',value:Number(this.advance)||2},value=Math.max(1,Number(reminder.value)||1);
    const reminderDue=reminder.unit==='minutes'?Number.isFinite(o.buttonSeconds)&&o.buttonSeconds<=value*60:reminder.unit==='meters'?Number.isFinite(o.buttonDistance)&&o.buttonDistance<=value:Number.isFinite(o.stopsRemaining)&&o.stopsRemaining<=value;
    if(this.stage===2&&onRoute&&reminderDue)target=3;
    if(this.stage===3&&onRoute&&(o.previousStopPassed||o.destinationDistance<=80))target=4;
    if(this.stage===4&&o.destinationDistance<=40&&o.speed<1)target=5;
    // Walking near the destination and separating from the bus supports alighting.
    if(this.stage===5&&o.destinationDistance<180&&o.walkingAway&&o.speed<2.5&&(!busAvailable||o.busDistance>80))target=6;
    if(this.stage===6&&o.finalDistance<=25&&o.speed<2)target=7;
    const required=this.stage===1&&!busAvailable?5:3;
    if(target!==this.stage){if(this.candidate===target)this.samples++;else{this.candidate=target;this.samples=1;}if(this.samples>=required){this.stage=target;this.candidate=null;this.samples=0;}}
    else{this.candidate=null;this.samples=0;}
    this.stops=o.stopsRemaining;
    return this;
  }
}
if(typeof module!=='undefined')module.exports={JourneyTracker};
