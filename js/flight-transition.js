import * as THREE from './vendor/three/three.module.js';
import { loadAirliner } from './airliner-model.js';
import { createAirportBackdrop } from './flight-airport.js';

// Change this number to set the cruise flight time, in seconds (0 skips cruise).
const CRUISE_DURATION_SECONDS = 4.5;
const DEPARTURE_MS = 1350;
const ARRIVAL_MS = 1250;
const CRUISE_MS = Math.max(0, CRUISE_DURATION_SECONDS * 1000);
const TOTAL_FLIGHT_MS = DEPARTURE_MS + CRUISE_MS + ARRIVAL_MS;

const KEY = 'anup-flight-arrival';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sectionNames = {home:'Home',about:'About',skills:'Skills',projects:'Projects',experience:'Experience',certifications:'Certifications',contact:'Contact'};
const pages = {
  'index.html':'Home', 'projects/others.html':'Other Projects',
  'projects/dbf.html':'DBF', 'projects/micropad.html':'Micropad',
  'projects/aircraft-preliminary-design.html':'Aircraft Design',
  'projects/aircraft-manufacturing.html':'Aircraft Manufacturing',
  'projects/final-year-project.html':'Flow Visualization',
  'projects/drone-swarm-simulation.html':'Drone Swarm Simulation'
};
const labels = new Map(Object.entries(pages).map(([path,name])=>[new URL('../'+path,import.meta.url).pathname,name]));
const canonical = path => path.endsWith('/') ? path+'index.html' : path;
let active=null, ready=null, view=null, disabled=false;
const ease = t => t*t*(3-2*t);
const mix = (a,b,t) => a+(b-a)*t;
const bounded = (t,a,b) => Math.max(0,Math.min(1,(t-a)/(b-a)));
function readTicket(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function clearTicket(){try{sessionStorage.removeItem(KEY);}catch{}}
function clearCover(){clearTimeout(window.flightArrivalGuard);document.documentElement.classList.remove('flight-pending');}
function focusDestination(destination){
  let target=destination.target;
  if(!target)target=document.querySelector('main h1, h1, main');
  if(target){if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
}
function routeFor(link){
  if(disabled||!link||link.hasAttribute('download')||link.target&&link.target!=='_self'||link.hasAttribute('data-no-flight'))return null;
  let url;try{url=new URL(link.href,location.href);}catch{return null;}
  if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol)||url.href===location.href)return null;
  const samePage=canonical(url.pathname)===canonical(location.pathname)&&url.search===location.search;
  // Anchor links within the current document keep their ordinary scrolling.
  if(samePage)return null;
  let id='';try{id=decodeURIComponent(url.hash.slice(1));}catch{return null;}
  if(!labels.has(canonical(url.pathname)))return null;
  return {url,samePage,target:null,to:sectionNames[id]||labels.get(canonical(url.pathname))};
}
function currentLabel(){
  if(canonical(location.pathname)===new URL('../index.html',import.meta.url).pathname)
    return document.querySelector('.nav-link.active')?.textContent.trim()||'Home';
  return labels.get(canonical(location.pathname))||'Portfolio';
}
function navigate(destination){
  if(destination.samePage){
    if(location.href!==destination.url.href)history.pushState(null,'',destination.url.href);
    destination.target?.scrollIntoView({behavior:'instant',block:'start'});
  }else location.assign(destination.url.href);
}
function cleanup(){
  if(active){active.cancelled=true;cancelAnimationFrame(active.frame);clearTimeout(active.guard);}
  active=null;clearCover();
  document.documentElement.classList.remove('flight-in-transit');
  if(view){view.overlay.hidden=true;view.overlay.classList.remove('flight-fading');view.airport.clear();}
}
function skip(){
  const trip=active;if(!trip)return;
  clearTicket();cleanup();
  if(!trip.navigated)navigate(trip.destination);
  if(trip.destination.samePage)focusDestination(trip.destination);
}
function withTimeout(promise,ms){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Flight scene timeout')),ms);
    promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}

async function createScene(){
  const {aircraft}=await loadAirliner();
  const overlay=document.createElement('div');
  overlay.id='flightTransition';overlay.hidden=true;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','flightRouteTitle');
  overlay.innerHTML=`<canvas aria-hidden="true"></canvas>
    <div class="flight-route"><div><p>ANUP BAJGAIN / IN FLIGHT</p><h2 id="flightRouteTitle"><span class="flight-from"></span><span class="flight-route-arrow" aria-hidden="true">→</span><span class="flight-to"></span></h2></div><small>A change of scenery.</small></div>
    <div class="flight-status"><div><div class="flight-status-label" role="status" aria-live="polite"></div><div class="flight-progress" aria-hidden="true"><span></span></div></div><button class="flight-skip" type="button">Skip animation</button></div>`;
  document.body.append(overlay);
  const airport=createAirportBackdrop(overlay);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas:overlay.querySelector(':scope > canvas'),alpha:true,antialias:true,powerPreference:'low-power'});}
  catch(error){overlay.remove();throw error;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x0c1523,55,115);
  const camera=new THREE.PerspectiveCamera(38,1,.1,160);camera.up.set(0,0,1);
  camera.position.set(10,-39,18);camera.lookAt(0,0,2.8);
  const sky=new THREE.HemisphereLight(0xcce7ff,0x233245,2.5);sky.position.set(0,0,30);scene.add(sky);
  const key=new THREE.DirectionalLight(0xffecd5,3.5);key.position.set(10,-15,30);scene.add(key);
  const rim=new THREE.DirectionalLight(0x6fbaff,2);rim.position.set(-20,20,15);scene.add(rim);
  const runway=new THREE.Group();scene.add(runway);
  const asphalt=new THREE.MeshStandardMaterial({color:0x172535,roughness:.95});
  const paint=new THREE.MeshBasicMaterial({color:0xa3b3c1});
  const blue=new THREE.MeshBasicMaterial({color:0x84c8ff});
  const amber=new THREE.MeshBasicMaterial({color:0xffc882});
  function box(w,d,h,material,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,d,h),material);m.position.set(x,y,z);runway.add(m);return m;}
  // The runway ends at its far threshold lights, leaving open sky beyond it.
  box(48,7,.12,asphalt,0,0,-.12);
  for(const side of [-1,1]){
    box(48,.065,.015,paint,0,side*3.2,-.045);
    for(let x=-23;x<=23;x+=5){box(.13,.13,.07,blue,x,side*3.6,-.025);}
  }
  for(let x=-14;x<=21;x+=7)box(3,.13,.015,paint,x,0,-.044);
  for(let j=0;j<5;j++)for(const side of [-1,1])box(3,.22,.02,paint,-19,side*(.6+j*.48),-.04);
  for(const x of [-23,24])for(let y=-3;y<=3;y+=.55)box(.09,.1,.04,amber,x,y,-.03);
  // A shallow terminal foundation anchors the layered hero beyond the runway.
  const terminal=new THREE.Group();runway.add(terminal);
  const foundation=new THREE.Mesh(new THREE.BoxGeometry(32,5,.8),asphalt);
  foundation.position.set(0,13,.4);terminal.add(foundation);
  const fascia=new THREE.Mesh(new THREE.BoxGeometry(32,.1,.08),blue);
  fascia.position.set(0,10.45,.84);terminal.add(fascia);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,45),new THREE.MeshBasicMaterial({color:0x0b1420,transparent:true,opacity:.6}));ground.position.set(0,-20,-.2);scene.add(ground);
  const plane=new THREE.Group();plane.add(aircraft);plane.scale.setScalar(.22);scene.add(plane);
  // Deployment gear belongs to the transition scene; the hero keeps its cruise pose.
  const gear=new THREE.Group();plane.add(gear);
  const tireMaterial=new THREE.MeshStandardMaterial({color:0x11161d,roughness:.9});
  const strutMaterial=new THREE.MeshStandardMaterial({color:0xaeb9c7,metalness:.6,roughness:.3});
  for(const [x,y] of [[-2,-2.2],[-2,2.2],[13,0]]){
    const strut=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,1.6,8),strutMaterial);strut.rotation.x=Math.PI/2;strut.position.set(x,y,-2.9);gear.add(strut);
    for(const offset of [-.2,.2]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.22,16),tireMaterial);wheel.position.set(x,y+offset,-3.68);gear.add(wheel);}
  }
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const shadowContext=shadowCanvas.getContext('2d');
  const shadowGradient=shadowContext.createRadialGradient(32,32,2,32,32,31);
  shadowGradient.addColorStop(0,'rgba(0,0,0,.8)');shadowGradient.addColorStop(1,'rgba(0,0,0,0)');
  shadowContext.fillStyle=shadowGradient;shadowContext.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(12,9),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,opacity:.2,depthWrite:false}));shadow.position.z=-.035;scene.add(shadow);
  // Soft, sparse cloud billboards provide a little motion against the open sky.
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=256;cloudCanvas.height=128;
  const cloudContext=cloudCanvas.getContext('2d');
  for(const [x,y,r] of [[63,76,38],[102,57,46],[148,61,42],[186,78,32],[128,85,43]]){
    const gradient=cloudContext.createRadialGradient(x,y,0,x,y,r);
    gradient.addColorStop(0,'rgba(255,255,255,.7)');
    gradient.addColorStop(.45,'rgba(255,255,255,.4)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    cloudContext.fillStyle=gradient;cloudContext.fillRect(x-r,y-r,r*2,r*2);
  }
  const cloudTexture=new THREE.CanvasTexture(cloudCanvas);
  const clouds=[[-25,16,8,22],[8,25,4,28],[38,12,-7,19]].map(([x,y,z,width])=>{
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTexture,color:0xffffff,transparent:true,opacity:0,depthWrite:false,fog:false}));
    sprite.scale.set(width,width/2,1);scene.add(sprite);
    return {sprite,x,y,z};
  });
  const runwayMaterials=[asphalt,paint,blue,amber];
  for(const material of runwayMaterials)material.transparent=true;
  function updateScenery(groundAmount,seconds,trackX,trackZ){
    airport.update(groundAmount,camera);
    terminal.scale.x=innerWidth<600?22/32:1;terminal.position.x=innerWidth<600?0:-3;
    runway.visible=ground.visible=shadow.visible=groundAmount>0;
    for(const material of runwayMaterials)material.opacity=groundAmount;
    ground.material.opacity=.25*groundAmount;
    for(const cloud of clouds){
      // Wrap far outside the frame so even a long custom cruise stays continuous.
      const offset=((cloud.x-seconds*2.5+60)%120+120)%120-60;
      cloud.sprite.position.set(trackX+offset,cloud.y,trackZ+cloud.z);
      cloud.sprite.material.opacity=.22*(1-groundAmount);
      cloud.sprite.visible=groundAmount<1;
    }
  }
  let cameraX=0,cameraZ=0;
  function trackCamera(x,z){
    cameraX=x;cameraZ=z;
    const mobile=innerWidth<600;
    camera.position.set((mobile?6:10)+x,mobile?-48:-39,(mobile?23:18)+z);
    camera.lookAt(x,0,2.8+z);
  }
  function resize(){
    const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;
    camera.fov=w<600?52:38;trackCamera(cameraX,cameraZ);camera.updateProjectionMatrix();
    if(active)renderer.render(scene,camera);
  }
  window.addEventListener('resize',resize);resize();
  overlay.querySelector('.flight-skip').addEventListener('click',skip);
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();skip();}if(event.key==='Tab'){event.preventDefault();overlay.querySelector('.flight-skip').focus();}});
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();disabled=true;skip();});
  return {overlay,airport,renderer,scene,camera,trackCamera,updateScenery,plane,gear,shadow,status:overlay.querySelector('.flight-status-label'),progress:overlay.querySelector('.flight-progress span')};
}
function prepare(){
  if(!ready)ready=createScene().then(result=>{view=result;return result;}).catch(error=>{disabled=true;throw error;});
  return ready;
}
function display(trip){
  clearCover();view.overlay.hidden=false;view.overlay.classList.remove('flight-fading');
  view.airport.refresh();
  // The first animation frame projects the scenery through the active camera.
  view.airport.update(0);
  document.documentElement.classList.add('flight-in-transit');
  document.getElementById('preloader')?.classList.add('hidden');
  view.overlay.querySelector('.flight-from').textContent=trip.from;
  view.overlay.querySelector('.flight-to').textContent=trip.destination.to;
  view.overlay.querySelector('.flight-skip').focus({preventScroll:true});
}
function animate(trip,phase,duration){
  return new Promise(resolve=>{
    const start=performance.now();let label='';
    const frame=now=>{
      if(trip!==active||trip.cancelled){resolve(false);return;}
      const t=duration>0?Math.min(1,(now-start)/duration):1;
      let x,z,pitch,deployed,status,trackX=0,trackZ=0;
      if(phase==='departure'){
        if(t<.43){const u=t/.43;x=mix(-13,-1,u*u);z=.91;pitch=0;deployed=1;status='On the runway';}
        else{const u=bounded(t,.43,1);x=mix(-1,32,u);z=.91+10*ease(u);pitch=-.14*Math.sin(Math.PI*Math.min(1,u*1.3));deployed=1-ease(bounded(u,.25,.7));status=u<.45?'Taking off':'In flight';trackX=32*ease(u);trackZ=10*ease(u);}
      }else if(phase==='cruise'){
        // Track the STL aircraft through open sky and faint drifting clouds.
        // Speed stays constant when the configurable cruise duration changes.
        x=32+16*t*duration/1000;z=10.91;pitch=0;deployed=0;status='Cruising';
        trackX=x;trackZ=10;
      }else{
        if(t<.6){const u=t/.6;x=mix(-25,1,u);z=.91+10*(1-ease(u));pitch=-.07*Math.sin(Math.PI*u);deployed=ease(bounded(u,0,.55));status='On approach';trackX=-25*(1-ease(u));trackZ=10*(1-ease(u));}
        else{const u=(t-.6)/.4;x=mix(1,12,1-(1-u)*(1-u));z=.91;pitch=0;deployed=1;status='Touchdown';}
      }
      view.plane.position.set(x,0,z);view.plane.rotation.y=pitch;view.gear.visible=deployed>.05;view.gear.scale.z=Math.max(.05,deployed);
      view.trackCamera(trackX,trackZ);
      view.shadow.position.x=x;view.shadow.material.opacity=.24*Math.exp(-(z-.91)*.45);view.shadow.scale.setScalar(1+(z-.91)*.06);
      if(status!==label){view.status.textContent=status;label=status;}
      const elapsed=phase==='departure'?t*DEPARTURE_MS:phase==='cruise'?DEPARTURE_MS+t*CRUISE_MS:DEPARTURE_MS+CRUISE_MS+t*ARRIVAL_MS;
      const groundAmount=phase==='departure'?1-ease(bounded(t,.65,1)):phase==='cruise'?0:ease(bounded(t,0,.5));
      view.updateScenery(groundAmount,elapsed/1000,trackX,trackZ);
      view.progress.style.transform=`scaleX(${elapsed/TOTAL_FLIGHT_MS})`;
      view.renderer.render(view.scene,view.camera);
      if(t<1)trip.frame=requestAnimationFrame(frame);else resolve(true);
    };
    trip.frame=requestAnimationFrame(frame);
  });
}
async function finish(trip){
  if(active!==trip)return;
  view.overlay.classList.add('flight-fading');
  await new Promise(resolve=>setTimeout(resolve,230));
  if(active!==trip)return;
  cleanup();focusDestination(trip.destination);
}
async function depart(destination){
  const trip={destination,from:currentLabel(),frame:0,cancelled:false,navigated:false};active=trip;
  trip.guard=setTimeout(()=>{if(active===trip)skip();},1700+DEPARTURE_MS+CRUISE_MS+2500);
  try{
    await withTimeout(prepare(),1700);if(active!==trip)return;
    display(trip);
    if(!await animate(trip,'departure',DEPARTURE_MS))return;
    if(CRUISE_MS>0&&!await animate(trip,'cruise',CRUISE_MS))return;
    try{sessionStorage.setItem(KEY,JSON.stringify({href:destination.url.href,from:trip.from,to:destination.to,time:Date.now()}));}catch{}
    trip.navigated=true;navigate(destination);
  }catch{if(active===trip)skip();}
}
async function arrive(ticket){
  clearTicket();
  const id=location.hash.slice(1);
  const destination={url:new URL(location.href),samePage:true,target:document.getElementById(id),to:String(ticket.to||'Portfolio').slice(0,100)};
  const trip={destination,from:String(ticket.from||'Portfolio').slice(0,100),frame:0,cancelled:false,navigated:true};active=trip;
  trip.guard=setTimeout(()=>{if(active===trip)skip();},4000);
  try{
    await withTimeout(prepare(),1700);if(active!==trip)return;
    display(trip);
    if(await animate(trip,'arrival',ARRIVAL_MS))await finish(trip);
  }catch{if(active===trip)skip();}
}

document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||reduced.matches)return;
  const link=event.target.closest?.('a[href]');const destination=routeFor(link);if(!destination)return;
  event.preventDefault();if(!active)depart(destination);
});
for(const name of ['pointerover','focusin'])document.addEventListener(name,event=>{
  if(!reduced.matches&&!disabled&&routeFor(event.target.closest?.('a[href]')))prepare().catch(()=>{});
},{passive:true});
reduced.addEventListener('change',()=>{if(reduced.matches){skip();clearTicket();clearCover();}});
window.addEventListener('pagehide',cleanup);
window.addEventListener('pageshow',event=>{if(event.persisted){cleanup();clearTicket();}});
const incoming=readTicket();
if(incoming&&incoming.href===location.href&&Date.now()-incoming.time<15000&&!reduced.matches)arrive(incoming);
else{clearTicket();clearCover();}
