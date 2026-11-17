"use strict";
const assert=require("node:assert/strict");
const Flight=require("./gull-flight-core.js");
function joint(){return {rotation:{x:0,y:0,z:0}};}
function bird(){
 const value={root:joint(),leftWing:joint(),rightWing:joint(),flight:{
  wingFlapAxis:"z",legBendAxis:"x",leftHip:joint(),rightHip:joint(),leftKnee:joint(),rightKnee:joint(),
  neck:joint(),head:joint(),tail:joint(),phase:.25,
  base:{rootX:0,leftWing:0,rightWing:0,leftHip:0,rightHip:0,leftKnee:0,rightKnee:0,neck:0,head:0,tail:0}
 }};
 return value;
}
const gull=bird();
assert.equal(Flight.applyFlightPose(gull,0),true);
assert.ok(gull.flight.leftHip.rotation.x>0.9,"Left upper leg must tuck backwards into the flight silhouette.");
assert.ok(gull.flight.rightHip.rotation.x>0.9,"Right upper leg must tuck backwards into the flight silhouette.");
assert.ok(gull.flight.leftKnee.rotation.x<-.95,"Left lower leg must fold at the knee.");
assert.ok(gull.flight.rightKnee.rotation.x<-.95,"Right lower leg must fold at the knee.");
assert.ok(gull.root.rotation.x>0.03,"Body must hold a slight aerodynamic flight pitch.");
const firstWing=gull.leftWing.rotation.z;
Flight.applyFlightPose(gull,.18);
assert.notEqual(gull.leftWing.rotation.z,firstWing,"Wings must continue moving on the authored flap cycle.");
assert.ok(gull.leftWing.rotation.z<0&&gull.rightWing.rotation.z>0,"The wing pivots must move in mirrored directions.");
assert.ok(Number.isFinite(gull.flight.tail.rotation.x));
assert.equal(Flight.applyFlightPose({},0),false,"Incomplete imported anatomy must be reported rather than silently animated.");
console.log("OK gull flight pose: mirrored wing cycle, tucked upper/lower legs, aerodynamic body pitch and finite articulated joints.");
