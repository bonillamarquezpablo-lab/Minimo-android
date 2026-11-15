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
const MAX_BUBBLES=Core.MAX_VISIBLE_BUBBLES,RANGE=Core.MAX_RANGE_METERS,slots=[],metadata=new Map(),pending=[];
const diagnostics={bridgeReady:true,lastTickAt:0,bridgeActive:false,worldPeopleCount:0,nearbyCount:0,bubblesStarted:0,projectionAttempts:0,projectionSuccesses:0,projectionFailures:{},lastError:""};
let schedulerHandle=0,positionHandle=0,lastActive=false,renderedCount=0,projectionIdentity=null,projectionScratch=null;
const RANGE_SQUARED=RANGE*RANGE;
const layer=document.createElement("div");layer.id="elsn-npc-dialogue-layer";layer.className="elsn-npc-dialogue-layer";layer.setAttribute("aria-hidden","true");layer.style.zIndex="2147483000";layer.dataset.maxBubbles=String(MAX_BUBBLES);document.body.appendChild(layer);
function makeSlot(index){const node=document.createElement("div");node.className="elsn-npc-bubble";node.dataset.slot=String(index);node.hidden=true;const role=document.createElement("span"),kind=document.createElement("span"),message=document.createElement("span");role.className="elsn-npc-bubble-role";kind.className="elsn-npc-bubble-kind";message.className="elsn-npc-bubble-message";node.append(role,kind,message);layer.appendChild(node);return{node,role,kind,message,current:null};}
for(let i=0;i<MAX_BUBBLES;i++)slots.push(makeSlot(i));
const random=()=>Math.random(),between=(a,b)=>a+random()*(b-a);
function rootOf(n){return n&&(n.parts&&n.parts.root||n.root||n.actor||null);}
function idOf(n){const root=rootOf(n);return String(n&&n.parts&&(n.parts.name||(n.parts.root&&n.parts.root.name))||n&&n.name||root&&root.name||"");}
function worldPosition(node){if(!node)return null;try{const p=typeof node.getAbsolutePosition==="function"?node.getAbsolutePosition():node.position||null;return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.z))?p:null;}catch(_){return null;}}
function distance(a,b){return a&&b?Math.hypot(Number(a.x)-Number(b.x),Number(a.z)-Number(b.z)):Infinity;}
function distanceSquared(a,b){if(!a||!b)return Infinity;const dx=Number(a.x)-Number(b.x),dz=Number(a.z)-Number(b.z);return dx*dx+dz*dz;}
function enabled(n){const r=rootOf(n);if(!r)return false;try{return (typeof r.isEnabled!=="function"||r.isEnabled())&&r.isVisible!==false&&r.visibility!==0;}catch(_){return false;}}
function blockingUi(){if(document.body.classList.contains("map-open"))return true;const intro=document.getElementById("intro");return!!(intro&&intro.classList.contains("open"));}
function snapshot(){try{return Bridge.getSnapshot();}catch(error){console.warn("NPC dialogue snapshot:",error);return null;}}
function nearbyPeople(s){
 diagnostics.worldPeopleCount=Array.isArray(s&&s.people)?s.people.length:0;
 if(!s||!s.active||!s.playerPosition||!Number.isFinite(Number(s.playerPosition.x))||!Number.isFinite(Number(s.playerPosition.z))||!Array.isArray(s.people)){diagnostics.nearbyCount=0;return[];}
 const result=[],people=s.people,focus=s.playerPosition;
 for(let i=0;i<people.length;i++){
  const npc=people[i];if(!npc||npc.recruited===true||!enabled(npc))continue;
  const root=rootOf(npc);if(!root)continue;
  const position=worldPosition(root);if(!position)continue;
  const d2=distanceSquared(position,focus);if(!Number.isFinite(d2)||d2>RANGE_SQUARED)continue;
  const id=idOf(npc);if(!id)continue;
  result.push({npc,id,position,distance:Math.sqrt(d2)});
 }
 diagnostics.nearbyCount=result.length;
 return result;
}
function stateFor(id,now){let s=metadata.get(id);if(!s){s={nextAt:now+between(1200,2800),lastSpokeAt:0};metadata.set(id,s);}return s;}
function slotFor(id){return slots.find(s=>s.current&&s.current.id===id)||slots.find(s=>!s.current);}
function startBubble(npc,content,now,duration){const id=idOf(npc);if(!id||!content||!content.text)return false;const slot=slotFor(id);if(!slot)return false;const kind=["thought","speech","action"].includes(content.kind)?content.kind:"speech";slot.current={id,npc,kind,expiresAt:now+(duration||3900)};slot.role.textContent=String(content.roleName||"Habitante").slice(0,24);slot.kind.textContent=kind==="thought"?"PIENSA":kind==="action"?"HACE":"DICE";slot.message.textContent=String(content.text).slice(0,120);slot.node.dataset.kind=kind;slot.node.hidden=false;slot.node.classList.remove("is-visible");void slot.node.offsetWidth;slot.node.classList.add("is-visible");diagnostics.bubblesStarted++;return true;}
function clearSlot(slot){slot.current=null;slot.node.classList.remove("is-visible");slot.node.hidden=true;slot.node.style.transform="";}
function expire(now){for(const slot of slots)if(slot.current&&slot.current.expiresAt<=now)clearSlot(slot);}
function partnerFor(item,nearby){let best=null,bestDistance=7.5;for(const candidate of nearby){if(candidate.id===item.id||candidate.npc.villageIndex!==item.npc.villageIndex)continue;if(slots.some(s=>s.current&&s.current.id===candidate.id))continue;const d=distance(item.position,candidate.position);if(d<bestDistance){best=candidate;bestDistance=d;}}return best;}
function queueReply(npc,content,dueAt){pending.push({npc,content,dueAt});if(pending.length>4)pending.shift();}
function processPending(now,ids){for(let i=0;i<pending.length;){const entry=pending[i];if(entry.dueAt>now){i++;continue;}pending.splice(i,1);if(!ids.has(idOf(entry.npc)))continue;startBubble(entry.npc,entry.content,now,3900);break;}}
function schedule(now,nearby){const selected=Core.selectVisibleBubbles(nearby.map(x=>({item:x,distance:x.distance,priority:x.distance<7?2:1,visible:true})),MAX_BUBBLES).map(x=>x.item);const due=selected.filter(x=>stateFor(x.id,now).nextAt<=now&&!slots.some(s=>s.current&&s.current.id===x.id));if(!due.length)return;due.sort((a,b)=>a.distance-b.distance);const chosen=due[Math.floor(random()*Math.min(due.length,3))],state=stateFor(chosen.id,now),context={isWalking:Number(chosen.npc.parts&&chosen.npc.parts.actualMoveSpeed)>.08,playerClose:chosen.distance<7};const partner=partnerFor(chosen,nearby);if(partner&&random()<.38){const exchange=Core.chooseExchange(chosen.npc,partner.npc,random);if(startBubble(chosen.npc,exchange[0],now,4300)){queueReply(partner.npc,exchange[1],now+1450);const other=stateFor(partner.id,now);other.nextAt=now+between(18000,26000);state.nextAt=now+between(19000,28000);state.lastSpokeAt=now;other.lastSpokeAt=now;return;}}if(startBubble(chosen.npc,Core.chooseAmbientMessage(chosen.npc,context,random),now,3900)){state.lastSpokeAt=now;state.nextAt=now+between(10000,16000);}else state.nextAt=now+3500;}
function project(slot,s){
 const c=slot.current;
 const hide=reason=>{diagnostics.projectionFailures[reason]=(diagnostics.projectionFailures[reason]||0)+1;slot.node.hidden=true;return false;};
 diagnostics.projectionAttempts++;
 if(!c||!s||!s.scene||!s.engine||!s.camera||!s.canvas)return hide("missing-scene-camera-canvas");
 const npc=c.npc;if(!enabled(npc))return hide("npc-disabled");
 const root=rootOf(npc),rootPos=worldPosition(root);
 if(!rootPos)return hide("npc-root-unavailable");
 if(distance(rootPos,s.playerPosition)>RANGE)return hide("outside-dialogue-range");
 const BABYLON=s.BABYLON||window.BABYLON;
 if(!BABYLON||!BABYLON.Vector3||!BABYLON.Matrix)return hide("babylon-project-unavailable");
 try{
  const anchor=npc.parts&&npc.parts.head&&typeof npc.parts.head.getAbsolutePosition==="function"?npc.parts.head:root;
  const ap=worldPosition(anchor);if(!ap)return hide("head-anchor-unavailable");
  if(!projectionIdentity)projectionIdentity=BABYLON.Matrix.Identity();
  if(!projectionScratch)projectionScratch=new BABYLON.Vector3(0,0,0);
  const world=projectionScratch.copyFrom(ap);world.y+=anchor===root?2.12:.48;
  const width=s.engine.getRenderWidth(),height=s.engine.getRenderHeight(),rect=s.canvas.getBoundingClientRect();
  if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return hide("zero-rendering-viewport");
  const viewport=s.camera.viewport&&typeof s.camera.viewport.toGlobal==="function"?s.camera.viewport.toGlobal(width,height):{x:0,y:0,width,height};
  const p=BABYLON.Vector3.Project(world,projectionIdentity,s.scene.getTransformMatrix(),viewport);
  if(!p||p.z<=0||p.z>=1)return hide("behind-camera");
  if(p.x<viewport.x||p.x>viewport.x+viewport.width||p.y<viewport.y||p.y>viewport.y+viewport.height)return hide("outside-screen");
  const x=rect.left+p.x*(rect.width/width),y=rect.top+p.y*(rect.height/height),stack=slots.indexOf(slot)*9;
  slot.node.style.transform="translate3d("+x.toFixed(1)+"px,"+(y-12-stack).toFixed(1)+"px,0) translate(-50%,-100%)";
  slot.node.hidden=false;diagnostics.projectionSuccesses++;return true;
 }catch(error){diagnostics.lastError=String(error&&error.message||error);return hide("projection-exception");}
}
function render(s){const active=!!(s&&s.active&&!document.hidden&&!blockingUi());layer.hidden=!active;if(!active){for(const slot of slots)slot.node.hidden=true;renderedCount=0;return;}for(const slot of slots){if(slot.current)project(slot,s);else slot.node.hidden=true;}renderedCount=slots.filter(slot=>slot.current&&!slot.node.hidden).length;}
function schedulerTick(){const now=Date.now(),s=snapshot();diagnostics.lastTickAt=now;diagnostics.bridgeActive=!!(s&&s.active);if(!s||!s.active||document.hidden||blockingUi()){render(s);lastActive=false;return;}if(!lastActive){for(const slot of slots)clearSlot(slot);pending.length=0;lastActive=true;}expire(now);const nearby=nearbyPeople(s),ids=new Set(nearby.map(x=>x.id));processPending(now,ids);schedule(now,nearby);render(s);}
function positionTick(){render(snapshot());}
function start(){if(schedulerHandle||positionHandle)return;schedulerHandle=window.setInterval(()=>{try{schedulerTick();}catch(e){diagnostics.lastError=String(e&&e.message||e);console.warn("NPC dialogue scheduler recovered:",e);}},Core.SCHEDULER_INTERVAL_MS);positionHandle=window.setInterval(()=>{try{positionTick();}catch(e){diagnostics.lastError=String(e&&e.message||e);console.warn("NPC bubble projection recovered:",e);}},Core.POSITION_UPDATE_MS);}
start();window.__ELSN_NPC_DIALOGUES__=Object.freeze({getSnapshot:()=>({...diagnostics,active:!!lastActive,maxVisibleBubbles:MAX_BUBBLES,activeBubbleCount:slots.filter(s=>!!s.current).length,renderedBubbleCount:renderedCount,nearbyRangeMeters:RANGE,positionUpdateMs:Core.POSITION_UPDATE_MS,schedulerIntervalMs:Core.SCHEDULER_INTERVAL_MS})});
}
boot();
})();