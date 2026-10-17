import { Vector3 } from './vendor/three/three.module.js';

// Hero layers occupy vertical planes in the aircraft's world, beyond the runway.
export function createAirportBackdrop(overlay) {
  const backdrop=document.createElement('div');
  backdrop.className='flight-airport';backdrop.setAttribute('aria-hidden','true');backdrop.inert=true;
  overlay.prepend(backdrop);
  let layers=[];
  const WIDTH=1100,HEIGHT=340;

  function refresh(){
    clear();
    const source=document.querySelector('main .hero, main .intro, .detail-cover, .collection-intro');
    if(!source)return;
    const hero=source.cloneNode(true);
    hero.classList.add('flight-airport-hero');
    for(const element of [hero,...hero.querySelectorAll('*')]){
      element.removeAttribute('id');element.removeAttribute('aria-labelledby');element.removeAttribute('aria-describedby');
      for(const attribute of [...element.attributes])if(attribute.name.startsWith('on'))element.removeAttribute(attribute.name);
    }
    hero.querySelectorAll('script,iframe,video,audio,canvas').forEach(element=>element.remove());
    const aircraft=hero.querySelector('.flight-fallback');if(aircraft)aircraft.hidden=false;
    const style=getComputedStyle(source);
    const visual=hero.cloneNode(true);
    const panel=document.createElement('div');panel.className='flight-airport-glass';
    for(const [node,kind,depth] of [[panel,'panel',16],[visual,'visual',14],[hero,'copy',11]]){
      const layer=document.createElement('div');layer.className='flight-airport-layer flight-airport-'+kind;
      layer.style.fontFamily=style.fontFamily;layer.style.color=style.color;layer.style.lineHeight=style.lineHeight;
      layer.append(node);backdrop.append(layer);layers.push({element:layer,depth});
      layer.querySelectorAll('img').forEach(img=>{img.loading='eager';img.addEventListener('error',()=>{img.style.display='none';},{once:true});});
    }
  }

  // A homography maps each DOM rectangle onto its projected world-space corners.
  // Its bottom edge shares the runway perspective instead of a screen-space tilt.
  function project(element,camera,depth){
    const mobile=innerWidth<600,width=mobile?22:32,height=width*HEIGHT/WIDTH,center=mobile?0:-3;
    const corners=[[center-width/2,depth,1.4+height],[center+width/2,depth,1.4+height],[center+width/2,depth,1.4],[center-width/2,depth,1.4]].map(p=>{
      const v=new Vector3(...p).project(camera);
      return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};
    });
    const [a,b,c,d]=corners;
    const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
    const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
    const determinant=dx1*dy2-dx2*dy1;
    if(Math.abs(determinant)<1e-8)return;
    const g=(dx3*dy2-dx2*dy3)/determinant,h=(dx1*dy3-dx3*dy1)/determinant;
    const matrix=[(b.x-a.x+g*b.x)/WIDTH,(b.y-a.y+g*b.y)/WIDTH,0,g/WIDTH,
      (d.x-a.x+h*d.x)/HEIGHT,(d.y-a.y+h*d.y)/HEIGHT,0,h/HEIGHT,
      0,0,1,0,a.x,a.y,0,1];
    element.style.transform='matrix3d('+matrix.join(',')+')';
  }

  function update(amount,camera){
    backdrop.style.opacity=String(amount);backdrop.style.visibility=amount>0?'visible':'hidden';
    if(amount>0&&camera){camera.updateMatrixWorld();for(const layer of layers)project(layer.element,camera,layer.depth);}
  }
  function clear(){backdrop.replaceChildren();layers=[];}
  return {refresh,update,clear};
}
