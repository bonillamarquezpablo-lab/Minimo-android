(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ELSN_GULL_FLIGHT_CORE=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const FLAP_HZ=8.8,WING_OPEN=.78,WING_AMPLITUDE=.82;
  const HIP_TUCK=1.02,KNEE_FOLD=-1.18;
  function validRotation(node){
    return !!(node&&node.rotation&&Number.isFinite(Number(node.rotation.x))&&
      Number.isFinite(Number(node.rotation.y))&&Number.isFinite(Number(node.rotation.z)));
  }
  function applyFlightPose(bird,elapsed){
    const f=bird&&bird.flight;
    if(!f||!validRotation(bird.root)||!f.leftWing||!f.rightWing||
       !f.leftHip||!f.rightHip||!f.leftKnee||!f.rightKnee)return false;
    const phase=(Number(elapsed)||0)*FLAP_HZ+(Number(f.phase)||0);
    const flap=Math.sin(phase)*WING_AMPLITUDE;
    const tuckWave=Math.sin(phase*.5);
    f.leftWing.rotation[f.wingFlapAxis]=f.base.leftWing-WING_OPEN-flap;
    f.rightWing.rotation[f.wingFlapAxis]=f.base.rightWing+WING_OPEN+flap;
    f.leftHip.rotation[f.legBendAxis]=f.base.leftHip+HIP_TUCK+tuckWave*.035;
    f.rightHip.rotation[f.legBendAxis]=f.base.rightHip+HIP_TUCK+tuckWave*.035;
    f.leftKnee.rotation[f.legBendAxis]=f.base.leftKnee+KNEE_FOLD-tuckWave*.045;
    f.rightKnee.rotation[f.legBendAxis]=f.base.rightKnee+KNEE_FOLD-tuckWave*.045;
    bird.root.rotation[f.legBendAxis]=f.base.rootPitch+.055+Math.sin(phase*.5)*.018;
    if(f.neck&&validRotation(f.neck))f.neck.rotation[f.legBendAxis]=f.base.neck+.018*Math.sin(phase*.5);
    if(f.head&&validRotation(f.head))f.head.rotation[f.legBendAxis]=f.base.head-.018*Math.sin(phase*.5);
    if(f.tail&&validRotation(f.tail))f.tail.rotation.x=f.base.tail+Math.sin((Number(elapsed)||0)*2.7+(Number(f.phase)||0))*.045;
    return true;
  }
  return Object.freeze({applyFlightPose,FLAP_HZ,WING_OPEN,WING_AMPLITUDE,HIP_TUCK,KNEE_FOLD});
});
