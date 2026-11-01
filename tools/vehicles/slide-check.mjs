const base = process.argv[2] === 'baseline' ? '../../game/src/vehicles/' : '../../work/vehicles/src/vehicles/';
const {getSpec} = await import(base+'tuning.js'); const {makePhysState,stepVehicle} = await import(base+'physics.js');
const mk=(type,k)=>({spec:getSpec(type),position:{x:0,z:0},heading:0,velocity:{x:0,z:k/3.6},yawRate:0,controls:{throttle:0,brake:0,steer:0,handbrake:false},ph:makePhysState()});
for (const type of ['sedan','taxi','hatch']) for(const counter of [false,true]) {
 const v=mk(type,100); let min=100,maxSlip=0,maxYaw=0;
 for(let i=0;i<240;i++){v.controls.handbrake=i<60;v.controls.steer=i<60?(counter&&i>=30?-1:1):0; stepVehicle(v,1/60,null); const f=v.velocity.x*Math.sin(v.heading)+v.velocity.z*Math.cos(v.heading); min=Math.min(min,f*3.6); maxSlip=Math.max(maxSlip,Math.abs(Math.atan2(v.velocity.x*-Math.cos(v.heading)+v.velocity.z*Math.sin(v.heading),f))); maxYaw=Math.max(maxYaw,Math.abs(v.yawRate)); if(i===59) v.h1=v.heading*180/Math.PI; }
 console.log(JSON.stringify({type,counter,yaw1:+v.h1.toFixed(1),yaw4:+(v.heading*180/Math.PI).toFixed(1),minForward:+min.toFixed(1),maxSlip:+(maxSlip*180/Math.PI).toFixed(1),peakYaw:+maxYaw.toFixed(2)}));
}
