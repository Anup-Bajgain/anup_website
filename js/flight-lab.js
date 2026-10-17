import * as THREE from './vendor/three/three.module.js';
import { loadAirliner } from './airliner-model.js';
import { createAirflowPaths } from './flight-flow.js';

const canvas = document.getElementById('flightCanvas');
const fallback = document.getElementById('flightFallback');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
} catch (error) {
  fallback.hidden = false;
  canvas.hidden = true;
}
if (renderer) start().catch(error => {
  console.error('Aircraft scene could not load:', error);
  fallback.hidden = false;
  canvas.hidden = true;
  renderer.dispose();
});

async function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 500);
  camera.up.set(0, 0, 1);
  camera.position.set(53, -73, 48);
  camera.lookAt(-3, 0, 0);
  const hemi = new THREE.HemisphereLight(0xc6e3ff, 0x253345, 2.1);
  hemi.position.set(0, 0, 60); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e7, 3.4);
  key.position.set(20, -35, 55); scene.add(key);
  const rim = new THREE.DirectionalLight(0x74bcff, 2.8);
  rim.position.set(-30, 25, 18); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, .8);
  fill.position.set(30, 25, -8); scene.add(fill);

  const {aircraft, manifest} = await loadAirliner();
  scene.add(aircraft);

  // Short travelling dashes on the corrected, surface-clearing paths.
  // The previous four-dash pattern repeated every 22 model metres. Dividing
  // that spacing by 1.2 gives 20% more dashes; length is reduced to 2.5 metres.
  const flowUniforms = {
    uTime: {value: 0},
    uLight: {value: 0},
    uSpacing: {value: 22 / 1.2},
    uDashLength: {value: 2.5},
    uSpeed: {value: 10.5}
  };
  const flowMaterial = new THREE.ShaderMaterial({
    uniforms: flowUniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aAlong; attribute float aDistance;
      attribute float aLane; attribute float aStrength; attribute float aWing;
      varying float vAlong; varying float vDistance; varying float vLane;
      varying float vFocus; varying float vStrength; varying float vWing;
      void main(){
        vAlong=aAlong; vDistance=aDistance; vLane=aLane; vStrength=aStrength; vWing=aWing;
        vFocus=exp(-pow(position.x/32.0,4.0));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uLight; uniform float uSpacing;
      uniform float uDashLength; uniform float uSpeed;
      varying float vAlong; varying float vDistance; varying float vLane;
      varying float vFocus; varying float vStrength; varying float vWing;
      void main(){
        float phase=mod(vDistance-uTime*uSpeed+vLane*.173*uSpacing,uSpacing);
        float dash=smoothstep(0.,.25,phase)*(1.-smoothstep(.6,uDashLength,phase));
        float fade=smoothstep(0.,.12,vAlong)*(1.-smoothstep(.78,1.,vAlong));
        vec3 color=mix(vec3(.49,.72,.87),vec3(.18,.39,.54),uLight);
        // Darker blue maintains contrast against the bright wing skin.
        color=mix(color,vec3(.035,.25,.43),vWing*.92);
        float opacity=mix(.12+.28*vFocus,.82,vWing);
        gl_FragColor=vec4(color,fade*dash*opacity*vStrength);
      }`
  });
  for (const path of createAirflowPaths(manifest.surfaces)) {
    const points=path.points.map(p=>new THREE.Vector3(...p));
    let length=0;
    const distances=points.map((point,i)=>{
      if(i) length+=point.distanceTo(points[i-1]);
      return length;
    });
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    geometry.setAttribute('aAlong',new THREE.Float32BufferAttribute(distances.map(d=>d/length),1));
    geometry.setAttribute('aDistance',new THREE.Float32BufferAttribute(distances,1));
    geometry.setAttribute('aLane',new THREE.Float32BufferAttribute(points.map(()=>path.lane),1));
    geometry.setAttribute('aStrength',new THREE.Float32BufferAttribute(points.map(()=>path.strength),1));
    geometry.setAttribute('aWing',new THREE.Float32BufferAttribute(points.map(point=>{
      if(!path.wing)return 0;
      const {leading,chord}=path.wing;
      const enter=THREE.MathUtils.smoothstep(leading+.65-point.x,0,1.2);
      const leave=THREE.MathUtils.smoothstep(point.x-(leading-chord-.65),0,1.2);
      return enter*leave;
    }),1));
    scene.add(new THREE.Line(geometry,flowMaterial));
  }

  let frame=0,last=0,time=0,paused=reduced.matches,visible=true,light;
  function render(){renderer.render(scene,camera);}
  function schedule(){if(!paused&&visible&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);}
  function tick(now){frame=0;time+=last?Math.min((now-last)/1000,.2):0;last=now;flowUniforms.uTime.value=time;render();schedule();}
  function sync(){
    cancelAnimationFrame(frame);frame=0;last=0;
    render();schedule();
  }
  function resize(){
    const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;
    // Keep the entire airframe visible in portrait and wide hero layouts.
    camera.fov=camera.aspect<.95?43:34;camera.updateProjectionMatrix();render();
  }
  function theme(){
    const next=document.body.classList.contains('light-theme');if(next===light)return;
    light=next;flowUniforms.uLight.value=light?1:0;renderer.toneMappingExposure=light?1.05:1.25;render();
  }
  reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});
  document.addEventListener('visibilitychange',sync);
  new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync();}).observe(canvas);
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(theme).observe(document.body,{attributes:true,attributeFilter:['class']});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;visible=false;fallback.hidden=false;});
  canvas.addEventListener('webglcontextrestored',()=>{visible=true;fallback.hidden=true;sync();});
  resize();theme();sync();
  canvas.dataset.ready='true';
}
