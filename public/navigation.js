const geoDistance=(a,b)=>{const r=Math.PI/180,dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r;return 6371000*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2));};
function pathLengths(path){let sum=0;return path.map((p,i)=>{if(i)sum+=geoDistance(path[i-1],p);return sum;});}
function pathPoint(path,fraction){const ds=pathLengths(path),target=ds.at(-1)*Math.max(0,Math.min(1,fraction));let i=1;while(i<ds.length-1&&ds[i]<target)i++;const f=(target-ds[i-1])/(ds[i]-ds[i-1]||1);return path[i-1].map((n,k)=>n+(path[i][k]-n)*f);}
function remainingPath(path,fraction){const ds=pathLengths(path),target=ds.at(-1)*fraction;return [pathPoint(path,fraction),...path.filter((p,i)=>ds[i]>target)];}
function headingDegrees(a,b){const r=Math.PI/180,dl=(b[1]-a[1])*r;return (Math.atan2(Math.sin(dl)*Math.cos(b[0]*r),Math.cos(a[0]*r)*Math.sin(b[0]*r)-Math.sin(a[0]*r)*Math.cos(b[0]*r)*Math.cos(dl))*180/Math.PI+360)%360;}
function walkingBearing(path,fraction){const a=pathPoint(path,Math.min(.99,fraction)),b=pathPoint(path,Math.min(1,fraction+.015));return headingDegrees(a,b);}
function approachState(journey,sample){
 const shape=TIMETABLE.shapes[chosenPlan.shape]||[],board=journey.legs[1].stops[0].point,v=vehicleFor(chosenPlan,liveData);let path=shape.filter(p=>p[2]<=chosenPlan.shapeStart).map(p=>p.slice(0,2));path.push(board);if(path.length<2)path=[sample.point,board];
 if(v){let idx=0,best=Infinity;path.forEach((p,i)=>{const d=geoDistance(p,v.point);if(d<best){idx=i;best=d;}});path=[v.point,...path.slice(idx+1)];if(path.length<2)path.push(board);}
 const eta=busETA();return {journey,leg:{mode:'bus',path,length:pathLengths(path).at(-1),stops:[]},legIndex:0,fraction:0,remaining:v?pathLengths(path).at(-1):null,destination:j().from,instruction:eta!==null&&eta<120&&eta>=0?'Prepare to board. Your bus is nearly here.':v?'Your bus is on its way.':'Waiting for GPS for your bus.',point:sample.point,busPoint:v?.point||null,busApproach:true};
}
function navigationState(){
 const journey=ROUTES.journeys[selected],fallback={point:journey.start.point,navLeg:0,navFraction:0};
 const sample=currentPosition||fallback;if(view==='trip'&&stage===1&&simulation&&(forceDemoBus||!chosenPlan)){const fix=simulation.sample(simTime);let path=simulation.approachPath;const distances=pathLengths(path),remaining=Math.min(distances.at(-1),Math.max(0,simulation.boardAt-Math.floor(simTime/45)*45)*8);path=remainingPath(path,1-remaining/(distances.at(-1)||1));return {journey,leg:{mode:'bus',path,length:remaining,stops:[]},legIndex:0,fraction:0,remaining,destination:j().from,point:sample.point,busPoint:useBus?fix.busPoint:null,busApproach:true,simulated:true};}if(chosenPlan&&(view==='plan'||stage===1)&&!forceDemoBus)return approachState(journey,sample);const legIndex=stage<=1?0:stage<=5?1:2,leg=journey.legs[legIndex];
 const fraction=sample.navLeg===legIndex?sample.navFraction:sample.navLeg>legIndex?1:0;
 const remaining=Math.max(0,leg.length*(1-fraction));
 const destination=legIndex===0?j().from:legIndex===1?j().to:(selected===0?'Work':'Home');
 let instruction='';
 if(stage===1)instruction=`Wait at ${j().from}`;
 else if(legIndex===1){const upcoming=leg.stops.find(s=>s.distance>fraction*leg.length+10);instruction=stage===4?(selected===0?`Arriving at ${j().place}. No button needed.`:'Your stop is next. Press the button.'):stage===5?(selected===0?'Time to depart.':'Get off here when the bus has stopped.'):`Next: ${upcoming?.name||j().to}`;}
 else{
  const step=leg.steps.findLast(s=>s.at<=fraction*leg.length)||leg.steps[0];
  const nextStep=leg.steps[leg.steps.indexOf(step)+1];
  instruction=stage===7?'You’ve reached your destination.':nextStep&&remaining>30?`${nextStep.type==='arrive'?'Arrive at your destination':`${nextStep.modifier.includes('left')?'Turn left':nextStep.modifier.includes('right')?'Turn right':'Continue'}${nextStep.name?' onto '+nextStep.name:''}`} in ${Math.max(10,Math.round((nextStep.at-fraction*leg.length)/10)*10)} m`:`Continue to ${destination}`;
 }
 return {journey,leg,legIndex,fraction,remaining,destination,instruction,point:sample.point,busPoint:legIndex===1&&useBus?sample.busPoint:null,simulated:true};
}
const metres=n=>n>=1000?`${(n/1000).toFixed(1)} km`:`${Math.round(n/10)*10} m`;
function navigationCard(){const n=navigationState();return `<section class="navigation-card" aria-label="Map and directions"><div class="map-wrap"><div id="journey-map" aria-label="Street map following the current journey leg"></div><span class="map-demo">${n.busApproach?(n.simulated?'Simulated bus · GPS every 45s':n.busPoint?'Live bus GPS':'Waiting for bus GPS'):'Simulated position'}${n.leg.mode==='walk'?' · Travel up':' · N ↑'}</span><div id="map-error" class="map-error" hidden>Map tiles couldn’t load. Route and directions are still available.</div></div><div class="nav-instruction">${icon(n.leg.mode==='bus'?'bus':'walk')}<div>${n.leg.mode==='walk'?`<strong>${tracker.uncertain?'Waiting for a clearer location':esc(n.instruction)}</strong>`:''}<span>${n.remaining===null?'GPS not yet available':metres(n.remaining)+' remaining'} · ${esc(n.destination)}</span></div></div><div class="map-source"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="https://gtfs.adelaidemetro.com.au/" target="_blank" rel="noopener">Adelaide Metro route data</a></div></section>`;}
let routeMap=null,mapLayers=null,positionMarker=null,busMarker=null,remainingLayer=null,mapKey='';
function disposeMap(){if(routeMap){routeMap.remove();routeMap=null;}mapKey='';mapLayers=null;positionMarker=null;busMarker=null;remainingLayer=null;}
function syncMap(){
 const container=document.getElementById('journey-map');if(!container||typeof L==='undefined')return;
 const n=navigationState(),key=`${selected}:${n.legIndex}:${n.busApproach?'approach':'travel'}:${chosenPlan?.id||'demo'}`;
 if(!routeMap){
  routeMap=L.map(container,{zoomControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,boxZoom:false,keyboard:false,tap:false,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false,rotate:true,bearing:0,rotateControl:false,touchRotate:false,shiftKeyRotate:false});routeMap.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap',keepBuffer:6,updateWhenZooming:false}).on('tileerror',()=>{const error=document.getElementById('map-error');if(error)error.hidden=false;}).addTo(routeMap);
  mapLayers=L.layerGroup().addTo(routeMap);
 }
 if(key!==mapKey){
  mapKey=key;mapLayers.clearLayers();busMarker=null;
  L.polyline(n.leg.path,{color:'#94a6aa',weight:3,opacity:.5,dashArray:n.leg.mode==='walk'?'8 9':null}).addTo(mapLayers);
  remainingLayer=L.polyline(n.leg.path,{color:'#163f45',weight:6,opacity:1,dashArray:n.leg.mode==='walk'?'8 9':null}).addTo(mapLayers);
  if(n.legIndex===1)n.leg.stops.forEach(s=>L.circleMarker(s.point,{radius:5,color:'#163f45',weight:2,fillColor:'#fff',fillOpacity:1}).bindTooltip(esc(s.name)).addTo(mapLayers));
  L.marker(n.leg.path.at(-1),{icon:L.divIcon({className:'destination-pin',html:icon(n.busApproach||n.legIndex===0?'bus':n.legIndex===1?'pin':selected===0?'shop':'home'),iconSize:[32,32],iconAnchor:[16,16]})}).bindTooltip(esc(n.destination)).addTo(mapLayers);
  positionMarker=L.marker(n.point,{rotateWithView:true,rotation:0,icon:L.divIcon({className:'travel-arrow',html:'<svg viewBox="0 0 32 32"><path d="M16 2 L28 28 L16 23 L4 28 Z"/></svg>',iconSize:[32,32],iconAnchor:[16,16]})}).bindTooltip('Simulated traveller · arrow points in direction of travel').addTo(mapLayers);
 }
 const ahead=remainingPath(n.leg.path,n.fraction);remainingLayer.setLatLngs(ahead.length>=2?ahead:[n.point,n.leg.path.at(-1)]);positionMarker.setLatLng(n.point);positionMarker.setRotation((n.busApproach?(currentPosition?.heading||0):walkingBearing(n.leg.path,n.fraction))*Math.PI/180);
 if(n.busPoint){if(!busMarker)busMarker=L.marker(n.busPoint,{icon:L.divIcon({className:'live-bus-pin',html:icon('bus'),iconSize:[36,36],iconAnchor:[18,18]})}).bindTooltip(n.simulated?'Simulated bus · last GPS fix':'Live position of your selected bus').addTo(mapLayers);busMarker.setLatLng(n.busPoint);}else if(busMarker){mapLayers.removeLayer(busMarker);busMarker=null;}
 routeMap.invalidateSize({pan:false});
 if(n.leg.mode==='walk'){if(typeof syncWalkingMainView==='function')syncWalkingMainView(n);else{routeMap.setBearing(-walkingBearing(n.leg.path,n.fraction));routeMap.setView(n.point,17,{animate:false});}}
 else{routeMap.setBearing(0);routeMap.fitBounds(L.latLngBounds(ahead.length>=2?ahead:[n.point,n.leg.path.at(-1)]),{padding:[35,35],maxZoom:16,animate:false});}
}
function mapDirectionsLink(){const n=navigationState();const origin=n.point.join(','),destination=n.leg.path.at(-1).join(',');return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${n.legIndex===1?'transit':'walking'}`;}
