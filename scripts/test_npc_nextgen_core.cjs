'use strict';
const assert=require('node:assert/strict');
const Core=require('./npc-nextgen-core.js');

const a=Core.createCombatState('VillageGuard0_0',0,0);
const b=Core.createCombatState('VillageGuard0_1',1,0);
assert.notEqual(a.seed,b.seed,'NPC identities must have independent deterministic seeds.');
assert.ok(Core.ARCHETYPES.some(item=>item.id===a.archetype));

const plan=Core.buildSquadPlan([
 {key:'g0',distance:2,alive:true,hostile:true,seed:5},
 {key:'g1',distance:3,alive:true,hostile:true,seed:4},
 {key:'g2',distance:5,alive:true,hostile:true,seed:3},
 {key:'g3',distance:6,alive:true,hostile:true,seed:2}
],1);
assert.equal(plan.nearbyCount,4);
assert.equal(plan.attackerSlots,2);
assert.equal(plan.attackerIds.length,2);
assert.equal(Object.keys(plan.roles).length,4);
assert.ok(['engage','flank','pressure'].includes(Core.getSquadRole(plan,'g2').role));
assert.equal(Core.buildSquadPlan([{key:'dead',distance:1,alive:false}],0).nearbyCount,0);

const motion=Core.createCombatState('locomotion',1,0);
const first=Core.computeLocomotionStep(motion,{x:0,z:0,targetX:0,targetZ:10,dt:1/30,mode:'approach'});
const second=Core.computeLocomotionStep(motion,{x:first.dx,z:first.dz,targetX:0,targetZ:10,dt:1/30,mode:'approach'});
assert.ok(first.speed>0&&second.speed>=first.speed,'NPC acceleration must be continuous.');
assert.ok(first.dz>0&&Math.abs(first.dx)<1e-9);
const stop=Core.computeLocomotionStep(motion,{x:0,z:1,targetX:0,targetZ:1,dt:1/30,mode:'idle'});
assert.ok(stop.speed<second.speed,'NPC locomotion must decelerate instead of snapping to a stop.');
assert.ok(Core.getSurfaceFactor('mud')<Core.getSurfaceFactor('stone'));

const route=Core.chooseTraversalStep({x:0,z:0,dirX:0,dirZ:1,step:1,targetX:0,targetZ:4,side:1},(x,z)=>{
 if(Math.abs(x)<.15&&z>.2)return false;
 return {x,z,grade:0,hazard:0};
});
assert.ok(route&&route.x>.1,'Traversal steering must find a valid side-step around a blocked direct route.');

const combat=Core.createCombatState('attack-test',2,0);
combat.archetype='sentinel';
let profile=Core.startAttack(combat,0);
assert.equal(profile.style,'quick');
let frames=[];
for(let i=0;i<20;i++)frames.push(Core.advanceAttack(combat,.06));
assert.equal(frames.filter(frame=>frame&&frame.hitWindow).length,1,'One committed NPC attack must produce one hit window.');
assert.ok(frames.some(frame=>frame&&frame.windup>0&&frame.windup<1));
assert.ok(frames.some(frame=>frame&&frame.swing>0));
assert.ok(frames.some(frame=>frame&&frame.recovery>0));
Core.finishAttack(combat,1.2);
assert.equal(combat.attack,null);
assert.ok(combat.nextAttackAt>1.2);
profile=Core.startAttack(combat,2.5);
assert.equal(profile.style,'heavy','Sentinel should vary its strike rhythm with a heavier committed attack.');
frames=[];
for(let i=0;i<25;i++)frames.push(Core.advanceAttack(combat,.06));
assert.equal(frames.filter(frame=>frame&&frame.hitWindow).length,1,'The heavy NPC attack must also apply damage only once.');
assert.ok(frames.some(frame=>frame&&frame.swing>0&&frame.style==='heavy'));
Core.finishAttack(combat,4.1);

const defender=Core.createCombatState('defender',2,0);
const defensiveAction=Core.chooseDefense({playerAttacking:true,distance:1.4,now:0},defender);
assert.ok(defensiveAction==='block'||defensiveAction==='dodge'||defensiveAction===null);
if(defensiveAction){
 Core.startDefense(defender,defensiveAction,0);
 const firstFrame=Core.advanceDefense(defender,.08);
 assert.ok(firstFrame&&firstFrame.progress>0);
 assert.ok(firstFrame.kind===defensiveAction);
}

const attention=Core.attentionPose(a,0,5,0,0,0,1/30);
assert.ok(Number.isFinite(attention.yaw));
assert.ok(Math.abs(attention.headYaw)<=.58);
Core.recordImpact(a,-1,2,1.4);
assert.equal(a.hitSide,-1);
assert.ok(Core.impactPose(a,.12,.5).envelope>=0);
Core.recover(a,.2);
assert.ok(a.stagger>=0);

console.log('NPC next-generation core: PASS (squad tactics, locomotion, traversal, attack timing, defence, attention and impact recovery).');
