(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.ELSN_NPC_VILLAGE_BRAIN=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const ROLES=Object.freeze([
  Object.freeze({id:"fisher",workRadius:5.7,angleBias:.12}),
  Object.freeze({id:"farmer",workRadius:4.5,angleBias:.88}),
  Object.freeze({id:"smith",workRadius:3.4,angleBias:2.28}),
  Object.freeze({id:"trader",workRadius:4.9,angleBias:-.82})
 ]);
 const ROLE_IDS=Object.freeze(ROLES.map(role=>role.id));
 const STEER_OFFSETS=Object.freeze([.48,-.48,.94,-.94,1.42,-1.42,2.05,-2.05,Math.PI]);
 const finite=value=>typeof value==="number"&&Number.isFinite(value);
 const hashText=value=>{let hash=2166136261;for(const char of String(value||"")){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;};
 const roleForVariant=value=>ROLES[Math.abs(Math.floor(Number(value)||0))%ROLES.length];
 function createState(name,variant,now=0){
  const seed=hashText(name||("villager-"+variant)),role=roleForVariant(variant);
  return {seed,role:role.id,mode:"work",nextDecisionAt:Number(now)+1.2+(seed%1800)/1000,
   nextSocialAt:Number(now)+8+(seed%11000)/1000,blockedCount:0,replans:0,
   socialApproaches:0,threatResponses:0,lookPhase:(seed%6283)/1000,
   goalX:null,goalZ:null,lastGoalAt:0,lastModeAt:0};
 }
 function chooseMode(context,state){
  const c=context||{},s=state||{},now=Number(c.now)||0;
  if(c.threatNearby===true){s.socialUntil=0;return "flee";}
  if(c.night===true||(finite(c.daylight)&&c.daylight<.16)){s.socialUntil=0;return "rest";}
  if(s.mode==="social"&&now<Number(s.socialUntil||0))return "social";
  if(c.playerNearby===true){
   if(c.claimed===true&&now>=Number(s.nextSocialAt||0)){
    s.socialUntil=now+7.5+(s.seed%2500)/1000;
    s.nextSocialAt=now+24+(s.seed%9000)/1000;
    return "social";
   }
   return "watch";
  }
  s.socialUntil=0;
  return "work";
 }
 function goalCandidates(input){
  const c=input||{},mode=String(c.mode||"work"),role=roleForVariant(c.variant),homeX=Number(c.homeX),homeZ=Number(c.homeZ);
  if(!finite(homeX)||!finite(homeZ))return [];
  const currentX=finite(Number(c.x))?Number(c.x):homeX,currentZ=finite(Number(c.z))?Number(c.z):homeZ;
  const seed=Number(c.seed)||0,baseAngle=finite(Number(c.homeAngle))?Number(c.homeAngle):0,spin=(seed%997)/997*.42;
  let preferredAngle=baseAngle+role.angleBias+spin,radius=role.workRadius;
  if(mode==="rest"){preferredAngle=baseAngle+Math.PI+(seed%5)*.12;radius=1.55;}
  if(mode==="flee"){
   const tx=finite(Number(c.threatX))?Number(c.threatX):currentX-Math.cos(baseAngle)*4;
   const tz=finite(Number(c.threatZ))?Number(c.threatZ):currentZ-Math.sin(baseAngle)*4;
   preferredAngle=Math.atan2(currentX-tx,currentZ-tz);radius=5.6;
  }
  if(mode==="social"){
   const px=Number(c.playerX),pz=Number(c.playerZ);
   if(!finite(px)||!finite(pz))return [];
   const dx=px-currentX,dz=pz-currentZ,d=Math.hypot(dx,dz)||1,stop=2.55;
   const gx=px-dx/d*stop,gz=pz-dz/d*stop,hx=gx-homeX,hz=gz-homeZ,hd=Math.hypot(hx,hz),scale=hd>8?8/hd:1;
   const safeX=homeX+hx*scale,safeZ=homeZ+hz*scale,a=Math.atan2(safeX-homeX,safeZ-homeZ),r=Math.min(8,Math.hypot(safeX-homeX,safeZ-homeZ));
   return [0,.55,-.55,1.1,-1.1,Math.PI].map(offset=>({x:homeX+Math.sin(a+offset)*r,z:homeZ+Math.cos(a+offset)*r,angle:a+offset,radius:r}));
  }
  if(mode==="watch"){
   const px=Number(c.playerX),pz=Number(c.playerZ);
   if(finite(px)&&finite(pz)){preferredAngle=Math.atan2(px-currentX,pz-currentZ);radius=2;}
  }
  const offsets=[0,.48,-.48,.98,-.98,1.48,-1.48,2.10,-2.10,Math.PI];
  const radii=mode==="rest"?[1.15,1.8,2.4]:mode==="flee"?[5.8,4.9,6.8,3.8]:[radius,radius+1.15,radius-1,radius+2];
  const result=[];
  for(let ri=0;ri<radii.length;ri++)for(let oi=0;oi<offsets.length;oi++){
   const r=Math.max(.85,radii[ri]),a=preferredAngle+offsets[(oi+(seed%offsets.length))%offsets.length];
   result.push({x:homeX+Math.sin(a)*r,z:homeZ+Math.cos(a)*r,angle:a,radius:r,order:ri*offsets.length+oi});
  }
  return result;
 }
 function chooseGoal(input,isValid){
  const candidates=goalCandidates(input);
  if(!candidates.length)return null;
  const c=input||{},x=finite(Number(c.x))?Number(c.x):Number(c.homeX),z=finite(Number(c.z))?Number(c.z):Number(c.homeZ);
  let best=null,bestScore=Infinity;
  for(const candidate of candidates.slice(0,16)){
   if(typeof isValid==="function"&&!isValid(candidate.x,candidate.z))continue;
   const distance=Math.hypot(candidate.x-x,candidate.z-z),rolePenalty=Math.abs(candidate.radius-roleForVariant(c.variant).workRadius)*.04;
   const score=distance+rolePenalty+(candidate.order||0)*.001;
   if(score<bestScore){best=candidate;bestScore=score;}
  }
  return best?Object.freeze({x:best.x,z:best.z,angle:best.angle,radius:best.radius}):null;
 }
 function chooseStep(input,isMoveValid){
  const c=input||{},x=Number(c.x),z=Number(c.z),targetX=Number(c.targetX),targetZ=Number(c.targetZ),step=Math.max(0,Number(c.step)||0);
  if(![x,z,targetX,targetZ,step].every(Number.isFinite)||step<=.0001)return null;
  const dx=targetX-x,dz=targetZ-z,distance=Math.hypot(dx,dz);
  if(distance<=.0001)return null;
  const stride=Math.min(step,distance),heading=Math.atan2(dx,dz),candidateAt=angle=>({x:x+Math.sin(angle)*stride,z:z+Math.cos(angle)*stride,angle});
  const direct=candidateAt(heading);
  if(typeof isMoveValid!=="function"||isMoveValid(direct.x,direct.z))return Object.freeze(direct);
  let best=null,bestScore=Infinity;
  const side=Number(c.side)<0?-1:1;
  for(let i=0;i<4;i++){
   const offset=STEER_OFFSETS[i]*(i%2===0?side:1),candidate=candidateAt(heading+offset);
   if(!isMoveValid(candidate.x,candidate.z))continue;
   const remaining=Math.hypot(targetX-candidate.x,targetZ-candidate.z),score=remaining+Math.abs(offset)*.24+(offset*side<0?.035:0);
   if(score<bestScore){best=candidate;bestScore=score;}
  }
  return best?Object.freeze(best):null;
 }
 function smoothAngle(current,target,dt,rate=7){
  if(!finite(current)||!finite(target))return finite(current)?current:0;
  const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  return current+delta*Math.min(1,Math.max(0,Number(dt)||0)*Math.max(.1,Number(rate)||7));
 }
 // NPC-only locomotion profile: acceleration, braking, turn response and gait are
 // derived from NPC intent. It never reads or writes the player controller.
 function computeLocomotion(input,state){
  const c=input||{},s=state||{},dt=Math.min(.12,Math.max(0,Number(c.dt)||0));
  const mode=String(c.mode||"work"),distance=Math.max(0,Number(c.distance)||0);
  const base=Number.isFinite(Number(c.baseSpeed))?Math.max(.05,Number(c.baseSpeed)):.78;
  const desired=mode==="flee"?Math.max(1.25,base*1.48):mode==="social"?.72:mode==="watch"?.34:mode==="rest"?.20:base;
  const moving=c.moving===true&&distance>.04;
  const target=moving?desired:0,accel=target>s.speed?3.1:5.4;
  const previous=finite(s.speed)?s.speed:0;
  s.speed=previous+(target-previous)*Math.min(1,dt*accel);
  const turn=Math.abs(Number(c.turnAngle)||0);
  const turnScale=1-Math.min(.34,turn/Math.PI*.34);
  const speed=Math.max(0,s.speed*turnScale);
  const gait=!moving||speed<.12?"idle":mode==="flee"?"run":speed>.88?"jog":"walk";
  return Object.freeze({speed,gait,turnRate:gait==="idle"?2.8:(gait==="run"?8.8:7.2),strideScale:gait==="run"?1.22:(gait==="jog"?1.08:1),acceleration:dt>0?(s.speed-previous)/dt:0});
 }
 function evaluateThreat(input){
  const c=input||{},distance=Math.max(0,Number(c.distance)||0),facing=finite(Number(c.facingDot))?Number(c.facingDot):0;
  const hostile=c.hostile===true,armed=c.armed===true,attacking=c.attacking===true;
  if(!hostile)return Object.freeze({score:0,level:"none",response:"ignore"});
  const score=(distance<3?4:distance<7?2.4:distance<13?1:0)+(armed?1.2:0)+(attacking?2.2:0)+(facing>.35?.6:0);
  return Object.freeze({score,level:score>=5?"critical":score>=3?"high":score>=1.5?"medium":"low",response:score>=5?"evade":score>=3?"defend":score>=1.5?"watch":"monitor"});
 }
 function chooseCombatIntent(input,state){
  const c=input||{},threat=evaluateThreat(c);
  if(c.healthRatio!==undefined&&Number(c.healthRatio)<.22)return "retreat";
  if(threat.response==="evade")return "evade";
  if(threat.response==="defend")return "guard";
  if(c.allyDown===true&&c.canAssist===true)return "assist";
  if(c.targetStaggered===true&&c.inRange===true)return "punish";
  if(c.inRange===true&&c.staminaRatio!==undefined&&Number(c.staminaRatio)>.28)return "attack";
  if(c.targetVisible===true)return "approach";
  return "patrol";
 }
 function formationOffset(index,count,spacing=1.35){
  const total=Math.max(1,Math.floor(Number(count)||1)),slot=Math.max(0,Math.floor(Number(index)||0))%total;
  const row=Math.floor(Math.sqrt(slot)),column=slot-row*row;
  return Object.freeze({x:(column-row)*Math.max(.5,Number(spacing)||1.35),z:row===0?0:-row*Math.max(.5,Number(spacing)||1.35),row,width:row*2+1});
 }
 function attackTelegraph(elapsed,duration){
  const t=Math.max(0,Number(elapsed)||0),d=Math.max(.12,Number(duration)||.9),p=Math.min(1,t/d);
  return Object.freeze({progress:p,phase:p<.32?"anticipation":p<.58?"strike":p<.82?"recovery":"recovering",canImpact:p>=.32&&p<.58,canChain:p>=.82});
 }
 return Object.freeze({ROLES,ROLE_IDS,roleForVariant,createState,chooseMode,goalCandidates,chooseGoal,chooseStep,smoothAngle,computeLocomotion,evaluateThreat,chooseCombatIntent,formationOffset,attackTelegraph});
});
