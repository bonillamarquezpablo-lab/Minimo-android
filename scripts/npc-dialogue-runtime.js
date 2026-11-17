(function(){
"use strict";
if(typeof window==="undefined"||typeof document==="undefined")return;
const pathParts=String(location.pathname||"").split("/").filter(Boolean),last=pathParts[pathParts.length-1]||"";
if(last==="inspector"||(last==="index.html"&&pathParts[pathParts.length-2]==="inspector"))return;
let bootstrapAttempts=0;
function boot(){
const Core=window.ELSN_NPC_DIALOGUE_CORE,Bridge=window.__ELSN_GAME_DIALOGUE_BRIDGE__;
if(!Core||!Bridge||typeof Bridge.getSnapshot!=="function"){
 if(bootstrapAttempts++<80){window.setTimeout(boot,125);return;}
 console.warn("NPC dialogue: no llegó el puente del mundo tras esperar a que terminara el arranque.");
 return;
}
const MAX_BUBBLES=Core.MAX_VISIBLE_BUBBLES,RANGE=Core.MAX_RANGE_METERS,BUBBLE_DURATION_MS=6000,slots=[],metadata=new Map(),relationships=new Map(),pending=[];
const SOCIAL_MEMORY_KEY="elsn-npc-social-memory-v1";
function restoreSocialMemory(){try{const raw=window.localStorage&&localStorage.getItem(SOCIAL_MEMORY_KEY);if(!raw)return;const data=JSON.parse(raw);if(!data||data.version!==1||!Array.isArray(data.pairs))return;for(const row of data.pairs.slice(-64)){if(!row||typeof row.key!=="string"||row.key.length>180)continue;relationships.set(row.key,{key:row.key,rapport:Math.max(0,Math.min(5,Number(row.rapport)||0)),exchanges:Math.max(0,Math.floor(Number(row.exchanges)||0)),recentTopics:Array.isArray(row.recentTopics)?row.recentTopics.map(x=>String(x).slice(0,40)).slice(-4):[]});}}catch(_){}}
function saveSocialMemory(){try{if(!window.localStorage)return;const pairs=Array.from(relationships.values()).slice(-64).map(row=>({key:row.key,rapport:row.rapport,exchanges:row.exchanges,recentTopics:row.recentTopics.slice(-4)}));localStorage.setItem(SOCIAL_MEMORY_KEY,JSON.stringify({version:1,pairs}));}catch(_){}}
restoreSocialMemory();
const diagnostics={bridgeReady:true,lastTickAt:0,bridgeActive:false,bridgeReportedActive:false,bridgeError:"",snapshotFailures:0,worldPeopleCount:0,resolvedPeopleCount:0,missingRootCount:0,missingIdentityCount:0,nearestNpcDistanceMeters:null,nearbyCount:0,bubblesStarted:0,projectionAttempts:0,projectionSuccesses:0,projectionFailures:{},projectionCandidateFailures:{},lastProjectionCandidate:null,lastError:""};
const positioningSamples=new Float32Array(120);let positioningCursor=0,positioningCount=0;
function recordPositioningSample(startedAt){
 const duration=Math.max(0,performance.now()-startedAt);
 positioningSamples[positioningCursor]=duration;positioningCursor=(positioningCursor+1)%positioningSamples.length;
 positioningCount=Math.min(positioningSamples.length,positioningCount+1);
 diagnostics.lastPositioningMs=Number(duration.toFixed(3));
 diagnostics.maxPositioningMs=Math.max(diagnostics.maxPositioningMs||0,duration);
}
function positioningPercentiles(){
 const values=[];for(let i=0;i<positioningCount;i++)values.push(positioningSamples[i]);values.sort((a,b)=>a-b);
 const at=p=>values.length?Number(values[Math.min(values.length-1,Math.floor((values.length-1)*p))].toFixed(3)):null;
 return {positioningSamples:positioningCount,positioningP50Ms:at(.50),positioningP95Ms:at(.95),positioningP99Ms:at(.99)};
}
let schedulerHandle=0,positionHandle=0,lastActive=false,renderedCount=0,projectionIdentity=null,projectionScratch=null,lastSnapshot=null,observedScene=null,renderObserver=null,viewportObserver=null,viewportListenersBound=false,viewportRefreshPending=false,lastCapturedCount=null,recentCaptureUntil=0;
const RANGE_SQUARED=RANGE*RANGE;
function bubbleLimit(){return window.matchMedia&&window.matchMedia("(max-width: 700px)").matches?2:MAX_BUBBLES;}
const layer=document.createElement("div");layer.id="elsn-npc-dialogue-layer";layer.className="elsn-npc-dialogue-layer";layer.setAttribute("aria-hidden","true");layer.style.position="fixed";layer.style.inset="0";layer.style.width="100%";layer.style.height="100%";layer.style.overflow="visible";layer.style.pointerEvents="none";layer.style.zIndex="1200";layer.dataset.maxBubbles=String(MAX_BUBBLES);document.body.appendChild(layer);
function makeSlot(index){const node=document.createElement("div");node.className="elsn-npc-bubble";node.dataset.slot=String(index);node.hidden=true;node.style.position="fixed";node.style.left="0";node.style.top="0";node.style.margin="0";node.style.pointerEvents="none";node.style.zIndex=String(1+index);const role=document.createElement("span"),kind=document.createElement("span"),message=document.createElement("span");role.className="elsn-npc-bubble-role";kind.className="elsn-npc-bubble-kind";message.className="elsn-npc-bubble-message";node.append(role,kind,message);layer.appendChild(node);return{node,role,kind,message,current:null,width:0,height:0,measureDirty:true};}
for(let i=0;i<MAX_BUBBLES;i++)slots.push(makeSlot(i));
const random=()=>Math.random(),between=(a,b)=>a+random()*(b-a);
function rootOf(n){return n&&(n.parts&&n.parts.root||n.root||n.actor||n);}
function idOf(n){const root=rootOf(n);return String(n&&n.parts&&(n.parts.name||(n.parts.root&&n.parts.root.name))||n&&n.name||root&&root.name||"");}
function worldPosition(node){if(!node)return null;try{const p=typeof node.getAbsolutePosition==="function"?node.getAbsolutePosition():node.position||null;return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.z))?p:null;}catch(_){return null;}}
function distance(a,b){return a&&b?Math.hypot(Number(a.x)-Number(b.x),Number(a.z)-Number(b.z)):Infinity;}
function distanceSquared(a,b){if(!a||!b)return Infinity;const dx=Number(a.x)-Number(b.x),dz=Number(a.z)-Number(b.z);return dx*dx+dz*dz;}
function enabled(n){const r=rootOf(n);if(!r)return false;try{return (typeof r.isEnabled!=="function"||r.isEnabled())&&r.isVisible!==false&&r.visibility!==0;}catch(_){return false;}}
function refreshProjectionMatrices(s){if(!s||!s.scene)return;try{const camera=s.camera||s.scene.activeCamera;if(camera){if(typeof camera.getViewMatrix==="function")camera.getViewMatrix(true);if(typeof camera.getProjectionMatrix==="function")camera.getProjectionMatrix(true);}if(typeof s.scene.updateTransformMatrix==="function")s.scene.updateTransformMatrix(true);}catch(error){diagnostics.lastError=String(error&&error.message||error);}}
function blockingUi(){if(document.body.classList.contains("map-open"))return true;const intro=document.getElementById("intro");return!!(intro&&intro.classList.contains("open")&&intro.getAttribute("aria-hidden")!=="true");}
function snapshot(){try{const value=Bridge.getSnapshot();diagnostics.bridgeError="";diagnostics.bridgeReportedActive=!!(value&&value.active);if(value)lastSnapshot=value;return value;}catch(error){diagnostics.snapshotFailures++;diagnostics.bridgeError=String(error&&error.message||error);diagnostics.lastError=diagnostics.bridgeError;console.warn("NPC dialogue snapshot:",error);return lastSnapshot;}}
function bindSceneRenderObserver(s){
 const scene=s&&s.scene;if(!scene||scene===observedScene)return;
 if(observedScene&&renderObserver&&observedScene.onAfterRenderObservable&&typeof observedScene.onAfterRenderObservable.remove==="function"){
  try{observedScene.onAfterRenderObservable.remove(renderObserver);}catch(_){}
 }
 observedScene=scene;renderObserver=null;
 const observable=scene.onAfterRenderObservable;
 if(observable&&typeof observable.add==="function"){
  renderObserver=observable.add(()=>{
   if(!lastActive||document.hidden||!lastSnapshot)return;
   try{render(lastSnapshot,true);}catch(error){diagnostics.lastError=String(error&&error.message||error);}
  });
 }
}
function handleViewportChange(){
 if(viewportRefreshPending)return;
 viewportRefreshPending=true;
 window.setTimeout(()=>{
  viewportRefreshPending=false;
  for(const slot of slots)if(slot.current)slot.measureDirty=true;
  const s=snapshot()||lastSnapshot;if(!s)return;
  try{if(s.engine&&typeof s.engine.resize==="function")s.engine.resize();}catch(error){diagnostics.lastError=String(error&&error.message||error);}
  bindSceneRenderObserver(s);refreshProjectionMatrices(s);render(s);
 },0);
}
function bindViewportObservers(s){
 if(viewportListenersBound)return;
 window.addEventListener("resize",handleViewportChange,{passive:true});
 window.addEventListener("orientationchange",handleViewportChange,{passive:true});
 if(window.visualViewport&&typeof window.visualViewport.addEventListener==="function"){
  window.visualViewport.addEventListener("resize",handleViewportChange,{passive:true});
  window.visualViewport.addEventListener("scroll",handleViewportChange,{passive:true});
 }
 if(window.screen&&window.screen.orientation&&typeof window.screen.orientation.addEventListener==="function")
  window.screen.orientation.addEventListener("change",handleViewportChange);
 if(typeof window.ResizeObserver==="function"&&s&&s.canvas){
  try{viewportObserver=new window.ResizeObserver(handleViewportChange);viewportObserver.observe(s.canvas);}catch(_){viewportObserver=null;}
 }
 viewportListenersBound=true;
}
function nearbyPeople(s){
  const people=Array.isArray(s&&s.people)?s.people:[];
  diagnostics.worldPeopleCount=people.length;
  diagnostics.resolvedPeopleCount=0;
  diagnostics.missingRootCount=0;
  diagnostics.missingIdentityCount=0;
  diagnostics.nearestNpcDistanceMeters=null;
  if(!s||!s.active||!s.playerPosition||!Number.isFinite(Number(s.playerPosition.x))||
     !Number.isFinite(Number(s.playerPosition.z))||!Array.isArray(s.people)){
    diagnostics.nearbyCount=0;return[];
  }
  const result=[],focus=s.playerPosition;
  let nearest=Infinity;
  for(let i=0;i<people.length;i++){
   const npc=people[i];
   if(!npc||npc.recruited===true||npc.alive===false||!enabled(npc))continue;
   const root=rootOf(npc),position=worldPosition(root);
   if(!root||!position){diagnostics.missingRootCount++;continue;}
   diagnostics.resolvedPeopleCount++;
   const d2=distanceSquared(position,focus);
   if(!Number.isFinite(d2))continue;
   const d=Math.sqrt(d2);
   if(d<nearest)nearest=d;
   const id=idOf(npc);
   if(!id){diagnostics.missingIdentityCount++;continue;}
   if(d2>RANGE_SQUARED)continue;
   result.push({npc,id,position,distance:d});
  }
  diagnostics.nearestNpcDistanceMeters=Number.isFinite(nearest)?Number(nearest.toFixed(2)):null;
  diagnostics.nearbyCount=result.length;
  return result;
}
function stateFor(id,now){let s=metadata.get(id);if(!s){s={nextAt:now+between(700,1500),lastSpokeAt:0,recentTopics:[],recentTexts:[] };metadata.set(id,s);}return s;}
function pairKey(a,b){return[a,b].map(String).sort().join("::");}
function pairMemory(a,b){const key=pairKey(a,b);let value=relationships.get(key);if(!value){value={key,rapport:0,exchanges:0,recentTopics:[]};relationships.set(key,value);if(relationships.size>64)relationships.delete(relationships.keys().next().value);}return value;}
function rememberPair(pair,topic){if(!pair)return;pair.exchanges++;pair.rapport=Math.min(5,pair.rapport+0.65);if(topic){pair.recentTopics.push(topic);if(pair.recentTopics.length>4)pair.recentTopics.shift();}saveSocialMemory();}
function slotFor(id){const activeSlots=slots.slice(0,bubbleLimit());return activeSlots.find(s=>s.current&&s.current.id===id)||activeSlots.find(s=>!s.current);}
function startBubble(npc,content,now,duration){const id=idOf(npc);if(!id||!content||!content.text)return false;const slot=slotFor(id);if(!slot)return false;const kind=["thought","speech","action"].includes(content.kind)?content.kind:"speech";slot.current={id,npc,kind,expiresAt:now+(duration||BUBBLE_DURATION_MS)};slot.role.textContent=String(content.roleName||"Habitante").slice(0,24);slot.kind.textContent=kind==="thought"?"PIENSA":kind==="action"?"HACE":"DICE";slot.message.textContent=String(content.text).slice(0,120);slot.node.dataset.kind=kind;slot.node.hidden=false;slot.node.style.setProperty("display","block","important");slot.node.style.setProperty("visibility","visible","important");slot.node.style.setProperty("opacity","1","important");slot.node.classList.remove("is-visible");void slot.node.offsetWidth;const measured=slot.node.getBoundingClientRect();slot.width=measured.width;slot.height=measured.height;slot.measureDirty=false;slot.node.classList.add("is-visible");diagnostics.bubblesStarted++;return true;}
function clearSlot(slot){slot.current=null;slot.node.classList.remove("is-visible");slot.node.hidden=true;slot.node.style.transform="";}
function expire(now){for(const slot of slots)if(slot.current&&slot.current.expiresAt<=now)clearSlot(slot);}
function villageOf(npc){const direct=Number(npc&&npc.villageIndex);if(Number.isFinite(direct))return direct;const nested=Number(npc&&npc.parts&&npc.parts.villageIndex);if(Number.isFinite(nested))return nested;const name=String(npc&&npc.parts&&npc.parts.name||npc&&npc.name||"");const match=/^(?:Villager_|VillageGuard)(\\d+)_/.exec(name);if(match)return Number(match[1]);return -1;}
function partnerFor(item,nearby,s){let best=null,bestDistance=7.5;for(const candidate of nearby){if(candidate.id===item.id||villageOf(candidate.npc)!==villageOf(item.npc))continue;if(slots.some(slot=>slot.current&&slot.current.id===candidate.id))continue;if(s&&!isProjectable(candidate.npc,s))continue;const d=distance(item.position,candidate.position);if(d<bestDistance){best=candidate;bestDistance=d;}}return best;}
function queueReply(npc,content,dueAt){pending.push({npc,content,dueAt});if(pending.length>4)pending.shift();}
function processPending(now,ids){for(let i=0;i<pending.length;){const entry=pending[i];if(entry.dueAt>now){i++;continue;}pending.splice(i,1);if(!ids.has(idOf(entry.npc)))continue;startBubble(entry.npc,entry.content,now,BUBBLE_DURATION_MS);break;}}
function remember(state,content){if(!content)return;if(content.topic){state.recentTopics.push(content.topic);if(state.recentTopics.length>3)state.recentTopics.shift();}if(content.text){state.recentTexts.push(content.text);if(state.recentTexts.length>5)state.recentTexts.shift();}}
function isProjectable(npc,s){
 const id=idOf(npc);
 const reject=reason=>{diagnostics.projectionCandidateFailures[reason]=(diagnostics.projectionCandidateFailures[reason]||0)+1;diagnostics.lastProjectionCandidate={id,reason};return false;};
 if(!npc||!s||!s.scene||!s.engine||!s.camera||!s.canvas||!enabled(npc))return reject("missing-scene-camera-canvas-or-disabled-npc");
 const root=rootOf(npc),rootPos=worldPosition(root);
 if(!rootPos||distance(rootPos,s.playerPosition)>RANGE)return reject("missing-root-or-outside-range");
 const BABYLON=s.BABYLON||window.BABYLON;
 if(!BABYLON||!BABYLON.Vector3||!BABYLON.Matrix)return reject("babylon-project-unavailable");
 try{
  const anchor=npc.parts&&npc.parts.head&&typeof npc.parts.head.getAbsolutePosition==="function"?npc.parts.head:root;
  const ap=worldPosition(anchor);if(!ap)return reject("head-anchor-unavailable");
  if(!projectionIdentity)projectionIdentity=BABYLON.Matrix.Identity();
  if(!projectionScratch)projectionScratch=new BABYLON.Vector3(0,0,0);
  const world=projectionScratch.copyFrom(ap);world.y+=anchor===root?2.12:.48;
  const width=s.engine.getRenderWidth(),height=s.engine.getRenderHeight(),rect=s.canvas.getBoundingClientRect();
  if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return reject("zero-rendering-viewport");
  const camera=s.scene.activeCamera||s.camera;
  const viewport=camera.viewport&&typeof camera.viewport.toGlobal==="function"?camera.viewport.toGlobal(width,height):{x:0,y:0,width,height};
  const transform=s.scene.getTransformMatrix();
  const p=BABYLON.Vector3.Project(world,projectionIdentity,transform,viewport);
  if(!p||![p.x,p.y,p.z].every(Number.isFinite))return reject("invalid-projected-point");
  diagnostics.lastProjectionCandidate={id,x:Number(p.x.toFixed(2)),y:Number(p.y.toFixed(2)),z:Number(p.z.toFixed(4)),viewport:{x:viewport.x,y:viewport.y,width:viewport.width,height:viewport.height},render:{width,height},css:{width:rect.width,height:rect.height}};
  if(!(p.z>0&&p.z<1))return reject("outside-depth");
  if(p.x<viewport.x||p.x>viewport.x+viewport.width)return reject("outside-horizontal-frustum");
  if(p.y<viewport.y||p.y>viewport.y+viewport.height)return reject("outside-vertical-frustum");
  return true;
 }catch(error){diagnostics.lastError=String(error&&error.message||error);return reject("projection-exception");}
}
function schedule(now,nearby,s){
 refreshProjectionMatrices(s);
 const world=s&&s.world||{};
 const captured=Number.isFinite(Number(world.captured))?Number(world.captured):null;
 if(captured!==null){if(lastCapturedCount!==null&&captured>lastCapturedCount)recentCaptureUntil=now+30000;lastCapturedCount=captured;}
 const inView=nearby.filter(x=>isProjectable(x.npc,s)),selected=Core.selectVisibleBubbles(inView.map(x=>({item:x,distance:x.distance,priority:x.distance<7?3:(x.distance<14?2:1),visible:true})),bubbleLimit()).map(x=>x.item);
 const due=selected.filter(x=>stateFor(x.id,now).nextAt<=now&&!slots.some(slot=>slot.current&&slot.current.id===x.id));
 if(!due.length)return;
 due.sort((a,b)=>a.distance-b.distance);
 const chosen=due[Math.floor(random()*Math.min(due.length,3))],state=stateFor(chosen.id,now);
 const partner=partnerFor(chosen,nearby,s);
 const context={isWalking:Number(chosen.npc.parts&&chosen.npc.parts.actualMoveSpeed)>.08,playerClose:chosen.distance<8,friendNearby:!!partner,night:world.night===true,daylight:world.daylight,weather:String(world.weather||""),onShip:world.onShip===true,enemyNearby:world.enemyNearby===true,healthLow:world.healthLow===true,wood:world.wood,stone:world.stone,recentCapture:world.recentCapture===true||now<recentCaptureUntil,islandName:String(world.islandName||"")};
 if(partner&&random()<.58){
  const pair=pairMemory(chosen.id,partner.id),exchange=Core.chooseExchange(chosen.npc,partner.npc,random,context,pair);
  if(exchange.length>=4&&startBubble(chosen.npc,exchange[0],now,BUBBLE_DURATION_MS)){
   remember(state,exchange[0]);queueReply(partner.npc,exchange[1],now+1550);
   queueReply(chosen.npc,exchange[2],now+3100);queueReply(partner.npc,exchange[3],now+4650);
   const other=stateFor(partner.id,now);remember(other,exchange[1]);remember(state,exchange[2]);remember(other,exchange[3]);rememberPair(pair,exchange[0].topic);
   other.nextAt=now+between(21000,28000);state.nextAt=now+between(15000,22000);
   state.lastSpokeAt=now;other.lastSpokeAt=now;return;
  }
 }
 const content=Core.chooseAmbientMessage(chosen.npc,context,random,state);
 if(startBubble(chosen.npc,content,now,BUBBLE_DURATION_MS)){
  remember(state,content);state.lastSpokeAt=now;
  state.nextAt=now+between(5600,9000);
 }else state.nextAt=now+2400;
}
function project(slot,s,occupied){
 const c=slot.current;
 const hide=reason=>{diagnostics.projectionFailures[reason]=(diagnostics.projectionFailures[reason]||0)+1;slot.node.hidden=true;return false;};
 diagnostics.projectionAttempts++;
 if(!c||!s||!s.scene||!s.engine||!s.camera||!s.canvas)return hide("missing-scene-camera-canvas");
 const npc=c.npc;if(!enabled(npc))return hide("npc-disabled");
 const root=rootOf(npc);
 try{if(root&&typeof root.computeWorldMatrix==="function")root.computeWorldMatrix(false);}catch(_){}
 const rootPos=worldPosition(root);
 if(!rootPos)return hide("npc-root-unavailable");
 if(distance(rootPos,s.playerPosition)>RANGE)return hide("outside-dialogue-range");
 const BABYLON=s.BABYLON||window.BABYLON;
 if(!BABYLON||!BABYLON.Vector3||!BABYLON.Matrix)return hide("babylon-project-unavailable");
 try{
  const anchor=npc.parts&&npc.parts.head&&typeof npc.parts.head.getAbsolutePosition==="function"?npc.parts.head:root;
  try{if(anchor&&typeof anchor.computeWorldMatrix==="function")anchor.computeWorldMatrix(false);}catch(_){}
  const ap=worldPosition(anchor);if(!ap)return hide("head-anchor-unavailable");
  if(!projectionIdentity)projectionIdentity=BABYLON.Matrix.Identity();
  if(!projectionScratch)projectionScratch=new BABYLON.Vector3(0,0,0);
  const world=projectionScratch.copyFrom(ap);world.y+=anchor===root?2.12:.48;
  const width=s.engine.getRenderWidth(),height=s.engine.getRenderHeight(),rect=s.canvas.getBoundingClientRect();
  if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return hide("zero-rendering-viewport");
  const camera=s.scene.activeCamera||s.camera;
  const viewport=camera.viewport&&typeof camera.viewport.toGlobal==="function"?camera.viewport.toGlobal(width,height):{x:0,y:0,width,height};
  const p=BABYLON.Vector3.Project(world,projectionIdentity,s.scene.getTransformMatrix(),viewport);
  if(!p||p.z<=0||p.z>=1)return hide("behind-camera");
  if(p.x<viewport.x||p.x>viewport.x+viewport.width||p.y<viewport.y||p.y>viewport.y+viewport.height)return hide("outside-screen");
  const x=rect.left+p.x*(rect.width/width),y=rect.top+p.y*(rect.height/height);
  slot.node.hidden=false;slot.node.style.setProperty("display","block","important");slot.node.style.setProperty("visibility","visible","important");slot.node.style.setProperty("opacity","1","important");
  if(slot.measureDirty||!(slot.width>0&&slot.height>0)){const measured=slot.node.getBoundingClientRect();slot.width=measured.width;slot.height=measured.height;slot.measureDirty=false;}
  if(!(slot.width>0&&slot.height>0))return hide("bubble-size-unavailable");
  let placement=Core.placeBubble({x,y},{width:slot.width,height:slot.height},{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},occupied);
  if(!placement){
   const left=Math.max(rect.left+6,Math.min(rect.right-slot.width-6,x-slot.width/2));
   const top=Math.max(rect.top+6,Math.min(rect.bottom-slot.height-6,y-slot.height- slot.height-12));
   placement={left,top,right:left+slot.width,bottom:top+slot.height};
   diagnostics.placementFallbacks=(diagnostics.placementFallbacks||0)+1;
  }
  slot.node.style.transform="translate3d("+placement.left.toFixed(1)+"px,"+placement.top.toFixed(1)+"px,0)";
  diagnostics.lastProjection={id:idOf(npc),world:{x:Number(world.x.toFixed(3)),y:Number(world.y.toFixed(3)),z:Number(world.z.toFixed(3))},screen:{x:Number(x.toFixed(1)),y:Number(y.toFixed(1))},at:Date.now()};
  occupied.push(placement);diagnostics.projectionSuccesses++;return true;
 }catch(error){diagnostics.lastError=String(error&&error.message||error);return hide("projection-exception");}
}
function render(s,matricesReady=false){const started=performance.now();if(!matricesReady)refreshProjectionMatrices(s);const active=!!(s&&s.active&&!document.hidden&&!blockingUi());layer.hidden=!active;layer.setAttribute("aria-hidden",String(!active));if(!active){for(const slot of slots)slot.node.hidden=true;renderedCount=0;recordPositioningSample(started);return;}const occupied=[];const limit=bubbleLimit();for(let i=0;i<slots.length;i++){const slot=slots[i];if(i<limit&&slot.current)project(slot,s,occupied);else slot.node.hidden=true;}renderedCount=slots.filter((slot,index)=>index<limit&&slot.current&&!slot.node.hidden).length;recordPositioningSample(started);}
function schedulerTick(){const now=Date.now(),s=snapshot();diagnostics.lastTickAt=now;diagnostics.bridgeActive=!!(s&&s.active);if(s){bindSceneRenderObserver(s);bindViewportObservers(s);}if(!s||!s.active||document.hidden||blockingUi()){render(s);lastActive=false;return;}if(!lastActive){for(const slot of slots)clearSlot(slot);pending.length=0;lastActive=true;}expire(now);const nearby=nearbyPeople(s),ids=new Set(nearby.map(x=>x.id));processPending(now,ids);schedule(now,nearby,s);render(s);}
function positionTick(){const s=snapshot();if(!s)return;bindSceneRenderObserver(s);bindViewportObservers(s);render(s);}
function start(){if(schedulerHandle||positionHandle)return;schedulerHandle=window.setInterval(()=>{try{schedulerTick();}catch(e){diagnostics.lastError=String(e&&e.message||e);console.warn("NPC dialogue scheduler recovered:",e);}},Core.SCHEDULER_INTERVAL_MS);positionHandle=window.setInterval(()=>{try{positionTick();}catch(e){diagnostics.lastError=String(e&&e.message||e);console.warn("NPC bubble projection recovered:",e);}},Core.POSITION_UPDATE_MS);}
start();window.__ELSN_NPC_DIALOGUES__=Object.freeze({getSnapshot:()=>({...diagnostics,...positioningPercentiles(),active:!!lastActive,maxVisibleBubbles:bubbleLimit(),activeBubbleCount:slots.filter(s=>!!s.current).length,renderedBubbleCount:renderedCount,activeBubbleTexts:slots.filter(s=>!!s.current).map(s=>({role:s.role.textContent,kind:s.kind.textContent,text:s.message.textContent})),lastProjection:diagnostics.lastProjection,lastPositioningMs:diagnostics.lastPositioningMs,maxPositioningMs:diagnostics.maxPositioningMs,nearbyRangeMeters:RANGE,positionUpdateMs:Core.POSITION_UPDATE_MS,schedulerIntervalMs:Core.SCHEDULER_INTERVAL_MS})});
}
boot();
})();