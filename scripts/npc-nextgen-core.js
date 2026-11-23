(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.ELSN_NPC_NEXTGEN=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";

 // NPC-only controller primitives. This module never reads or mutates the player,
 // the gameplay camera, controls, graphics profile, scene assets or render settings.
 const ARCHETYPES=Object.freeze([
  Object.freeze({id:"vanguard",name:"Vanguardia",maxSpeed:2.42,acceleration:5.8,attackTempo:1.00,defenseBias:"block",blockChance:.28,dodgeChance:.12,attackReach:2.85,attackPower:14}),
  Object.freeze({id:"flanker",name:"Flanqueador",maxSpeed:2.56,acceleration:6.4,attackTempo:.93,defenseBias:"dodge",blockChance:.10,dodgeChance:.34,attackReach:2.72,attackPower:12}),
  Object.freeze({id:"sentinel",name:"Centinela",maxSpeed:2.16,acceleration:4.8,attackTempo:1.12,defenseBias:"block",blockChance:.38,dodgeChance:.08,attackReach:3.02,attackPower:15})
 ]);
 const finite=n=>typeof n==="number"&&Number.isFinite(n);
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const hashText=value=>{let h=2166136261;for(const c of String(value||"npc")){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
 const wrapAngle=value=>Math.atan2(Math.sin(value),Math.cos(value));
 const smoothAngle=(current,target,dt,rate=7)=>{
  if(!finite(current))current=0;
  if(!finite(target))return current;
  return current+wrapAngle(target-current)*Math.min(1,Math.max(0,dt||0)*Math.max(.1,rate||7));
 };
 const getArchetype=value=>ARCHETYPES[Math.abs(Math.floor(Number(value)||0))%ARCHETYPES.length];

 function createCombatState(id,variant=0,now=0){
  const seed=hashText(id||("npc-"+variant)),archetype=getArchetype(seed+variant);
  return {
   id:String(id||("npc-"+variant)),seed,rng:(seed^0x9e3779b9)>>>0,
   archetype:archetype.id,side:(seed&1)?1:-1,
   mode:"idle",role:"approach",lastDecisionAt:Number(now)||0,
   attack:null,attackCooldown:0,nextAttackAt:Number(now)||0,
   defense:null,nextDefenseAt:Number(now)||0,defenseEnergy:1,
   nextRoleRefreshAt:0,attentionYaw:0,attentionHeadYaw:0,
   combatEngagements:0,attacksStarted:0,attacksLanded:0,defensesUsed:0,
   locomotion:{vx:0,vz:0,speed:0,heading:0,phase:0,blocked:0},
   lastImpactAt:0,impactEnergy:0,stagger:0,recovery:0
  };
 }
 function random01(state){
  state.rng=(Math.imul(state.rng>>>0,1664525)+1013904223)>>>0;
  return state.rng/4294967296;
 }
 function getStateArchetype(state){
  return ARCHETYPES.find(item=>item.id===state.archetype)||ARCHETYPES[0];
 }

 function buildSquadPlan(candidates,now=0){
  const live=(Array.isArray(candidates)?candidates:[])
   .filter(item=>item&&item.key!==undefined&&item.alive!==false&&item.hostile!==false&&finite(Number(item.distance)))
   .map(item=>({key:String(item.key),distance:Math.max(0,Number(item.distance)),cooldown:Math.max(0,Number(item.cooldown)||0),stunned:item.stunned===true,seed:Number(item.seed)||hashText(item.key)}))
   .sort((a,b)=>a.distance-b.distance||a.seed-b.seed||a.key.localeCompare(b.key));
  const count=live.length,slotCount=count<=1?1:(count<=3?1:Math.min(3,Math.ceil(count*.34)));
  const rotation=count?Math.floor(Math.max(0,now)/10)%count:0;
  const rotated=live.slice(rotation).concat(live.slice(0,rotation));
  const roles=Object.create(null),attackerIds=[];
  for(let i=0;i<rotated.length;i++){
   const actor=rotated[i];
   let role;
   if(i<slotCount&&!actor.stunned&&actor.cooldown<=.18){role="engage";attackerIds.push(actor.key);}
   else if(i%2===0)role="flank";
   else role="pressure";
   roles[actor.key]=Object.freeze({role,slot:i<slotCount?i:-1,attackDelay:i<slotCount?i*.34:0,side:(actor.seed&1)?1:-1});
  }
  return Object.freeze({roles:Object.freeze(roles),attackerIds:Object.freeze(attackerIds),nearbyCount:count,attackerSlots:slotCount,rotation});
 }
 function getSquadRole(plan,key){
  return plan&&plan.roles?plan.roles[String(key)]||Object.freeze({role:"pressure",slot:-1,attackDelay:0,side:1}):Object.freeze({role:"pressure",slot:-1,attackDelay:0,side:1});
 }

 function getSurfaceFactor(surface,depth=0){
  const key=String(surface||"").toLowerCase(),d=Math.max(0,Number(depth)||0);
  let factor=1;
  if(/mud|bog|marsh/.test(key))factor=.78;
  else if(/snow|ice/.test(key))factor=.86;
  else if(/water|wet|shallow/.test(key))factor=.72;
  else if(/sand|beach/.test(key))factor=.91;
  else if(/wood|deck|plank/.test(key))factor=.96;
  if(d>0)factor*=clamp(1-d*.18,.56,1);
  return factor;
 }
 function computeLocomotionStep(state,input){
  const s=state&&state.locomotion?state.locomotion:(state.locomotion={vx:0,vz:0,speed:0,heading:0,phase:0,blocked:0});
  const c=input||{},dt=clamp(Number(c.dt)||0,0,.10);
  const x=Number(c.x)||0,z=Number(c.z)||0,tx=Number(c.targetX),tz=Number(c.targetZ);
  const dx=finite(tx)?tx-x:0,dz=finite(tz)?tz-z:0,distance=Math.hypot(dx,dz);
  const archetype=getStateArchetype(state);
  const surfaceFactor=getSurfaceFactor(c.surface,c.surfaceDepth);
  const slopeFactor=clamp(1-Math.max(0,Math.abs(Number(c.slope)||0)-.10)*.45,.64,1);
  const mode=String(c.mode||"move");
  let maxSpeed=Number(c.maxSpeed)||archetype.maxSpeed;
  if(mode==="flee"||mode==="sprint")maxSpeed*=1.18;
  if(mode==="approach"||mode==="flank")maxSpeed*=.96;
  if(mode==="watch"||mode==="social")maxSpeed*=.70;
  const desiredSpeed=distance<.06?0:maxSpeed*surfaceFactor*slopeFactor;
  const dirX=distance>.0001?dx/distance:0,dirZ=distance>.0001?dz/distance:0;
  const desiredVx=dirX*desiredSpeed,desiredVz=dirZ*desiredSpeed;
  const acceleration=Number(c.acceleration)||archetype.acceleration;
  const deceleration=Number(c.deceleration)||acceleration*1.65;
  const rate=desiredSpeed>s.speed?acceleration:deceleration;
  const maxChange=Math.max(.0001,rate*dt);
  const changeX=clamp(desiredVx-s.vx,-maxChange,maxChange);
  const changeZ=clamp(desiredVz-s.vz,-maxChange,maxChange);
  s.vx+=changeX;s.vz+=changeZ;
  const magnitude=Math.hypot(s.vx,s.vz);
  if(magnitude>maxSpeed&&maxSpeed>0){s.vx=s.vx/magnitude*maxSpeed;s.vz=s.vz/magnitude*maxSpeed;}
  s.speed=Math.hypot(s.vx,s.vz);
  if(s.speed>.035)s.heading=Math.atan2(s.vx,s.vz);
  s.phase+=s.speed*dt*(Math.PI*2/(s.speed>2.6?2.9:2.34));
  return Object.freeze({
   dx:s.vx*dt,dz:s.vz*dt,speed:s.speed,desiredSpeed,
   heading:s.heading,phase:s.phase,acceleration:Math.hypot(changeX,changeZ)/(dt||1),
   surfaceFactor,slopeFactor,arrived:distance<.45
  });
 }

 function computeNpcGoal(state,input){
  const c=input||{},role=String(c.role||state&&state.role||"engage");
  const px=Number(c.playerX)||0,pz=Number(c.playerZ)||0,x=Number(c.x)||0,z=Number(c.z)||0;
  const dx=x-px,dz=z-pz,d=Math.hypot(dx,dz)||1,angle=Math.atan2(dx,dz);
  const side=Number(c.side)||Number(state&&state.side)||1;
  let radius=2.15,offset=0;
  if(role==="flank"){radius=3.25;offset=side*.92;}
  else if(role==="pressure"){radius=4.15;offset=side*.42;}
  else if(role==="disengage"){radius=5.2;offset=Math.PI;}
  else if(role==="retreat"){radius=6.2;offset=Math.PI;}
  const goalAngle=angle+offset;
  return Object.freeze({x:px+Math.sin(goalAngle)*radius,z:pz+Math.cos(goalAngle)*radius,radius,angle:goalAngle,role});
 }

 // Local traversal: test a small deterministic fan of candidate steps against the game's
 // existing land/collision resolver. No global navigation mesh or new world colliders are made.
 const STEER_ANGLES=Object.freeze([0,.48,-.48,.96,-.96,1.48,-1.48,2.05,-2.05,Math.PI]);
 function chooseTraversalStep(input,isMoveValid){
  const c=input||{},x=Number(c.x),z=Number(c.z),dirX=Number(c.dirX),dirZ=Number(c.dirZ),step=Math.max(0,Number(c.step)||0);
  if(![x,z,dirX,dirZ,step].every(Number.isFinite)||step<=.0001)return null;
  const base=Math.atan2(dirX,dirZ),side=Number(c.side)<0?-1:1;
  let best=null,bestScore=Infinity;
  for(let i=0;i<STEER_ANGLES.length;i++){
   const raw=STEER_ANGLES[i],offset=i===0?0:(i%2===1?raw*side:raw*side);
   const angle=base+offset,candidate={x:x+Math.sin(angle)*step,z:z+Math.cos(angle)*step,angle,offset};
   const validation=typeof isMoveValid==="function"?isMoveValid(candidate.x,candidate.z):true;
   if(!validation)continue;
   const point=validation&&typeof validation==="object"?validation:candidate;
   const actualX=finite(Number(point.x))?Number(point.x):candidate.x;
   const actualZ=finite(Number(point.z))?Number(point.z):candidate.z;
   const progress=finite(Number(c.targetX))&&finite(Number(c.targetZ))
    ?Math.hypot(Number(c.targetX)-x,Number(c.targetZ)-z)-Math.hypot(Number(c.targetX)-actualX,Number(c.targetZ)-actualZ)
    :Math.cos(offset)*step;
   const grade=Math.max(0,Number(point.grade)||0),hazard=Math.max(0,Number(point.hazard)||0);
   const score=-progress+Math.abs(offset)*.16+grade*.44+hazard*2+(offset*side<0?.025:0);
   if(score<bestScore){bestScore=score;best={x:actualX,z:actualZ,angle,offset,progress,score};}
  }
  return best?Object.freeze(best):null;
 }

 function chooseDefense(context,state){
  const c=context||{},s=state||{};
  if(c.playerAttacking!==true||c.distance>3.9||c.distance<.65||c.now<Number(s.nextDefenseAt||0)||s.defenseEnergy<.18)return null;
  const archetype=getStateArchetype(s),roll=random01(s),block=archetype.blockChance,dodge=archetype.dodgeChance;
  let action=null;
  if(roll<block)action="block";
  else if(roll<block+dodge)action="dodge";
  if(action){
   s.nextDefenseAt=Number(c.now||0)+1.65+random01(s)*1.1;
   s.defenseEnergy=Math.max(0,s.defenseEnergy-(action==="block"?.18:.25));
   s.defensesUsed++;
  }
  return action;
 }
 function startDefense(state,kind,now=0){
  const s=state||{};
  s.defense={kind:kind==="dodge"?"dodge":"block",elapsed:0,duration:kind==="dodge"?.42:.50,startedAt:Number(now)||0,side:(s.side||1)};
  return s.defense.duration;
 }
 function advanceDefense(state,dt){
  const defense=state&&state.defense;
  if(!defense)return null;
  defense.elapsed=Math.min(defense.duration,defense.elapsed+clamp(Number(dt)||0,0,.1));
  const progress=clamp(defense.elapsed/defense.duration,0,1);
  const active=defense.kind==="block"?progress>=.16&&progress<=.74:progress>=.05&&progress<=.72;
  if(progress>=1)state.defense=null;
  return Object.freeze({kind:defense.kind,progress,active,side:defense.side,finished:progress>=1});
 }

 function startAttack(state,now=0){
  const s=state||{},archetype=getStateArchetype(s);
  const heavy=(s.attacksStarted%3===2&&archetype.id!=="flanker")||archetype.id==="sentinel"&&s.attacksStarted%2===1;
  const duration=(heavy?1.14:.88)*archetype.attackTempo;
  s.attack={style:heavy?"heavy":"quick",elapsed:0,duration,hitAt:heavy?.57:.49,hitApplied:false,startedAt:Number(now)||0};
  s.attacksStarted++;
  return Object.freeze({style:s.attack.style,duration,damage:archetype.attackPower*(heavy?1.28:1),reach:archetype.attackReach+(heavy?.16:0)});
 }
 function advanceAttack(state,dt){
  const attack=state&&state.attack;
  if(!attack)return null;
  const previous=attack.elapsed;
  attack.elapsed=Math.min(attack.duration,attack.elapsed+clamp(Number(dt)||0,0,.10));
  const p=clamp(attack.elapsed/attack.duration,0,1);
  const windupEnd=attack.style==="heavy"?.52:.43;
  const strikeEnd=attack.style==="heavy"?.69:.64;
  const hitCrossed=!attack.hitApplied&&previous/attack.duration<=attack.hitAt&&p>=attack.hitAt;
  if(hitCrossed)attack.hitApplied=true;
  const windup=clamp(p/windupEnd,0,1);
  const swing=clamp((p-windupEnd)/(strikeEnd-windupEnd),0,1);
  const recovery=clamp((p-strikeEnd)/(1-strikeEnd),0,1);
  return Object.freeze({
   style:attack.style,progress:p,windup,swing,recovery,
   hitWindow:hitCrossed,finished:p>=1,
   torsoLean:-.16*windup+.26*swing-.10*recovery,
   torsoYaw:-.22*windup+.40*swing*(state.side||1),
   armReach:attack.style==="heavy"?1.18:1.0,
   brace:clamp(windup*.7+recovery*.3,0,1)
  });
 }
 function finishAttack(state,now=0){
  if(!state)return;
  state.attack=null;state.attackCooldown=state.archetype==="flanker"?.82:(state.archetype==="sentinel"?1.22:1.02);
  state.nextAttackAt=(Number(now)||0)+state.attackCooldown;
 }

 function chooseAttack(context,state){
  const c=context||{},s=state||{},archetype=getStateArchetype(s);
  if(c.role&&c.role!=="engage")return false;
  if(c.distance>archetype.attackReach+1.0||c.distance<.68)return false;
  if(Number(c.now)<Number(s.nextAttackAt||0)||s.attack||s.defense)return false;
  if(c.slotDelay>0&&Number(c.now)<Number(s.roleAssignedAt||0)+Number(c.slotDelay))return false;
  return true;
 }

 function attentionPose(state,currentYaw,targetX,targetZ,x,z,dt,maxHeadYaw=.58){
  const s=state||{},dx=Number(targetX)-Number(x),dz=Number(targetZ)-Number(z);
  if(!Number.isFinite(dx)||!Number.isFinite(dz)||dx*dx+dz*dz<.01)return {yaw:currentYaw,headYaw:0};
  const desired=Math.atan2(dx,dz),yaw=smoothAngle(Number(currentYaw)||0,desired,dt,5.2);
  const headDelta=clamp(wrapAngle(desired-yaw),-maxHeadYaw,maxHeadYaw);
  s.attentionYaw=yaw;s.attentionHeadYaw=smoothAngle(Number(s.attentionHeadYaw)||0,headDelta,dt,6.5);
  return Object.freeze({yaw,headYaw:s.attentionHeadYaw});
 }
 function impactPose(state,elapsed,hitReact){
  const s=state||{},duration=Math.max(.12,Number(hitReact)||.4),phase=clamp(Number(elapsed||0)/duration,0,1);
  const envelope=Math.sin(Math.PI*Math.pow(phase,.72))*(1-phase*.18);
  const side=s.hitSide<0?-1:1;
  return Object.freeze({
   envelope,
   torsoPitch:-.24*envelope,
   torsoRoll:.22*side*envelope,
   headPitch:.18*envelope,
   armBrace:.72*envelope,
   legBrace:.34*envelope,
   recovery:phase>.58?clamp((phase-.58)/.42,0,1):0
  });
 }

 function recordImpact(state,directionX,now=0,strength=1){
  const s=state||{};
  s.hitSide=Number(directionX)<0?-1:1;
  s.lastImpactAt=Number(now)||0;
  s.impactEnergy=clamp(Number(strength)||1,.1,2.5);
  s.stagger=Math.max(Number(s.stagger)||0,.28+.18*s.impactEnergy);
 }
 function recover(state,dt){
  if(!state)return;
  state.stagger=Math.max(0,(Number(state.stagger)||0)-Math.max(0,Number(dt)||0));
  state.defenseEnergy=Math.min(1,(Number(state.defenseEnergy)||0)+Math.max(0,Number(dt)||0)*.16);
 }

 return Object.freeze({
  ARCHETYPES,createCombatState,buildSquadPlan,getSquadRole,
  getSurfaceFactor,computeLocomotionStep,computeNpcGoal,chooseTraversalStep,
  chooseDefense,startDefense,advanceDefense,startAttack,advanceAttack,finishAttack,chooseAttack,
  attentionPose,impactPose,recordImpact,recover,smoothAngle,wrapAngle,hashText
 });
});
