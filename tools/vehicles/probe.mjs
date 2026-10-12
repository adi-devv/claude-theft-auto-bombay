import { getSpec } from '../../work/vehicles/src/vehicles/tuning.js';
import { makePhysState, stepVehicle } from '../../work/vehicles/src/vehicles/physics.js';
const DT=1/60;
const type=process.argv[2]||'sedan', kmh=+process.argv[3]||50, mode=process.argv[4]||'steady';
const v={spec:getSpec(type),position:{x:0,z:0},heading:0,velocity:{x:0,z:kmh/3.6},yawRate:0,controls:{throttle:0,brake:0,steer:0,handbrake:false},ph:makePhysState()};
v.ph.gear=2;
const fwd=()=>v.velocity.x*Math.sin(v.heading)+v.velocity.z*Math.cos(v.heading);
for(let i=0;i<300;i++){const t=i*DT;
 if(mode==='steady'){v.controls.steer=1; const u=fwd(); v.controls.throttle=u<kmh/3.6?0.6:0;}
 if(mode==='slalom'){v.controls.steer=Math.sign(Math.sin(2*Math.PI*t/2)); const u=fwd(); v.controls.throttle=u<kmh/3.6?0.6:0;}
 if(mode==='low'){v.velocity.z=i?v.velocity.z:0; v.controls.throttle=t<1?0.4:0; v.controls.steer=t>0.5?1:0; v.controls.brake=t>3?1:0;}
 stepVehicle(v,DT,null);
 if(i%6===0) console.log(t.toFixed(2),'u',fwd().toFixed(1),'beta',(v.ph.beta*57.3).toFixed(1),'yaw',(v.yawRate*57.3).toFixed(0),'steerA',(v.ph.steerAngle*57.3).toFixed(1),'aF',(v.ph.slipF*57.3).toFixed(1),'aR',(v.ph.slipR*57.3).toFixed(1),'g',v.ph.gear,'F',v.ph.driveF.toFixed(0),'ay',v.ph.ayF.toFixed(1));
}
