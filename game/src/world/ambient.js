// Procedural Bombay ambience. All beds and stingers share the existing ambient bus.
// Event clocks use AudioContext time, so debug.step cannot pile up a burst of scheduled sounds.
export function createAmbient(game, fields) {
  let A=null,t=0;
  const stats={crowd:0,surf:0,rush:0,nearTrain:0,events:{honk:0,vendor:0,train:0,bell:0,crow:0},peak:0};
  const rnd=()=>Math.random();
  function init() {
    const au=game.audio,ac=au.ensure(),out=au.bus('ambient');
    const bed=(type,f,q=0.7)=>{
      const src=ac.createBufferSource();src.buffer=au.noiseBuffer();src.loop=true;
      const fl=ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;
      const gain=ac.createGain();gain.gain.value=0;src.connect(fl).connect(gain).connect(out);src.start();return {gain:gain.gain,filter:fl};
    };
    A={ac,out,sea:bed('lowpass',480),surf:bed('bandpass',1250,.5),hum:bed('lowpass',170),crowd:bed('bandpass',480,1.2),chatter:bed('bandpass',920,1.5),cr:bed('bandpass',4700,12),next:{crow:ac.currentTime+4,honk:ac.currentTime+2,vendor:ac.currentTime+9,train:ac.currentTime+7,bell:ac.currentTime+16}};
  }
  function tone(f,d,v,type='sine',end=f,delay=0,pan=0) {
    const {ac,out}=A,at=ac.currentTime+.03+delay,o=ac.createOscillator(),g=ac.createGain(),p=ac.createStereoPanner();
    o.type=type;o.frequency.setValueAtTime(f,at);o.frequency.exponentialRampToValueAtTime(Math.max(1,end),at+d);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(v,at+.035);g.gain.exponentialRampToValueAtTime(.00001,at+d);
    p.pan.value=pan;o.connect(g).connect(p).connect(out);o.start(at);o.stop(at+d+.03);
    o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();};stats.peak=Math.max(stats.peak,v);
  }
  function event(kind,gain) {
    if(gain<.001)return;stats.events[kind]++;
    const pan=rnd()*1.4-.7;
    if(kind==='honk') {const f=260+rnd()*90,d=.22+rnd()*.35;tone(f,d,gain,'triangle',f*.98,0,pan);tone(f*1.25,d,gain*.6,'sine',f*1.24,0,pan);}
    if(kind==='train') for(const f of [146.8,185,220]) tone(f,2.8,gain/3,'triangle',f*.97,0,pan);
    if(kind==='bell') for(let j=0;j<3;j++) for(const [f,k] of [[740,1],[1490,.3],[2015,.16]]) tone(f,1.5,gain*k,'sine',f,j*.8,pan);
    if(kind==='crow') for(let j=0;j<2;j++) tone(570,0.23,gain,'sawtooth',410,j*.36,pan);
    if(kind==='vendor') {
      // Three syllables, softly voiced through a vowel formant; an evocative chai call, not speech samples.
      const {ac,out}=A,at=ac.currentTime+.03;
      for(let j=0;j<3;j++) {
        const o=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain(),p=ac.createStereoPanner();
        o.type='sawtooth';o.frequency.setValueAtTime(165+j*17,at+j*.42);o.frequency.exponentialRampToValueAtTime(130,at+j*.42+.38);
        f.type='bandpass';f.Q.value=2;f.frequency.setValueAtTime(j===1?1100:650,at+j*.42);f.frequency.linearRampToValueAtTime(500,at+j*.42+.38);
        g.gain.setValueAtTime(0,at+j*.42);g.gain.linearRampToValueAtTime(gain,at+j*.42+.09);g.gain.exponentialRampToValueAtTime(.00001,at+j*.42+.4);
        p.pan.value=pan;o.connect(f).connect(g).connect(p).connect(out);o.start(at+j*.42);o.stop(at+j*.42+.42);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();p.disconnect();};
      }
    }
  }
  return {stats:()=>({...stats,events:{...stats.events},ready:!!A}),update(dt,city){
    if(!game.audio?.ready)return;
    if(!A)init();
    t+=dt;const cam=game.camera.position,now=A.ac.currentTime,h=city.timeOfDay;
    let seaDist=Infinity;const shore=game.roads.seaEdge;
    for(let j=1;j<shore.length;j++) {const a=shore[j-1],b=shore[j],dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((cam.x-a[0])*dx+(cam.z-a[1])*dz)/(dx*dx+dz*dz)));seaDist=Math.min(seaDist,Math.hypot(cam.x-a[0]-u*dx,cam.z-a[1]-u*dz));}
    const coast=Math.exp(-seaDist/38),day=h>6&&h<22?1:.25,rush=(h>8&&h<10)||(h>17&&h<20)?1:.35;
    const count=(game.peds||[]).reduce((n,p)=>n+(p.position&&Math.hypot(p.position.x-cam.x,p.position.z-cam.z)<45?1:0),0);
    const fort=Math.exp(-Math.hypot(cam.x-110,cam.z-80)/330);
    const crowd=Math.min(1,.15+count/35)*Math.max(coast,fort)*day;
    const swell=.65+.35*Math.sin(t*.52)*Math.sin(t*.22+1);
    const smooth=(bed,v,tc=.5)=>bed.gain.setTargetAtTime(v,now,tc);
    smooth(A.sea,.14*coast*swell,.3);smooth(A.surf,.085*coast*Math.max(.1,swell-.4),.2);
    smooth(A.hum,.035*(.5+rush)*(.5+.5*day));
    smooth(A.crowd,.036*crowd*(.8+.2*Math.sin(t*1.7)));smooth(A.chatter,.017*crowd*(.65+.35*Math.sin(t*2.3+1)));
    A.crowd.filter.frequency.setTargetAtTime(430+80*Math.sin(t*.71),now,.2);A.chatter.filter.frequency.setTargetAtTime(900+160*Math.sin(t*.43),now,.3);
    smooth(A.cr,h>19||h<6?.018*(.3+.7*Math.max(0,Math.sin(t*2.1)))*(1-coast*.7):0);
    const stations=[[-273,55],[198,-440]],train=Math.max(...stations.map(([x,z])=>Math.exp(-Math.hypot(cam.x-x,cam.z-z)/125)));
    const temple=Math.exp(-Math.hypot(cam.x-185,cam.z-120)/220);
    Object.assign(stats,{crowd:+crowd.toFixed(3),surf:+coast.toFixed(3),rush,nearTrain:+train.toFixed(3)});
    for(const kind of Object.keys(A.next)) if(now>A.next[kind]) {
      const wait={crow:7+rnd()*10,honk:(3+rnd()*6)/(rush+.3),vendor:20+rnd()*20,train:35+rnd()*22,bell:40+rnd()*35}[kind];A.next[kind]=now+wait;
      const gain={crow:city.lightLevel>.5?.009:0,honk:.011*(.4+rush)*day,vendor:h>7&&h<22?.018*crowd:0,train:.029*train,bell:.012*temple*day}[kind];event(kind,gain);
    }
  }};
}
