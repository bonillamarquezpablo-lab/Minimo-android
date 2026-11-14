(function(){
"use strict";
if(typeof window==="undefined"||typeof document==="undefined")return;
const pathParts=String(location.pathname||"").split("/").filter(Boolean),last=pathParts[pathParts.length-1]||"";
if(last==="inspector"||(last==="index.html"&&pathParts[pathParts.length-2]==="inspector"))return;
const Core=window.ELSN_NPC_DIALOGUE_CORE,Bridge=window.__ELSN_GAME_DIALOGUE_BRIDGE__;
if(!Core||!Bridge||typeof Bridge.getSnapshot!=="function"){
 const reason=!Core?"core-no-disponible":"puente-del-mundo-no-disponible";
 window.__ELSN_NPC_DIALOGUES__=Object.freeze({getSnapshot:()=>({ready:false,status:reason,active:false,nearbyCount:0,activeBubbleCount:0,renderedBubbleCount:0})});
 console.info("NPC dialogue: "+reason);return;
}
const MAX_BUBBLES=Core.MAX_VISIBLE_BUBBLES,RANGE=Core.MAX_RANGE_METERS,slots=[],metadata=new Map(),pending=[];
let schedulerHandle=0,positionHandle=0,lastActive=false,renderedCount=0;
let lastNearbyCount=0,lastDueCount=0,lastMessageAt=0,lastMessageKind="",lastMessageNpcId="",lastBlockReason="waiting-for-first-snapshot",lastProjectionFailures={};
const layer=document.createElement("div");layer.id="elsn-npc-dialogue-layer";layer.className="elsn-npc-dialogue-layer";layer.setAttribute("aria-hidden","true");layer.setAttribute("aria-live","polite");layer.dataset.maxBubbles=String(MAX_BUBBLES);layer.dataset.state="starting";document.body.appendChild(layer);
function makeSlot(index){const node=document.createElement("div");node.className="elsn-npc-bubble";node.dataset.slot=String(index);node.hidden=true;const role=document.createElement("span"),kind=document.createElement("span"),message=document.createElement("span");role.className="elsn-npc-bubble-role";kind.className="elsn-npc-bubble-kind";message.className="elsn-npc-bubble-message";node.append(role,kind,message);layer.appendChild(node);return{node,role,kind,message,current:null};}
for(let i=0;i<MAX_BUBBLES;i++)slots.push(makeSlot(i));
const random=()=>Math.random(),between=(a,b)=>a+random()*(b-a);
function idOf(n){return String(n&&n.parts&&(n.parts.name||(n.parts.root&&n.parts.root.name))||n&&n.name||"");}
function rootOf(n){return n&&n.parts&&n.parts.root||null;}
function worldPosition(node){if(!node)return null;try{if(typeof node.computeWorldMatrix==="function")node.computeWorldMatrix(true);return typeof node.getAbsolutePosition==="function"?node.getAbsolutePosition():node.position||null;}catch(_){return null;}}
function distance(a,b){return a&&b?Math.hypot(Number(a.x)-Number(b.x),Number(a.z)-Number(b.z)):Infinity;}
function enabled(n){const r=rootOf(n);if(!r)return false;try{return typeof r.isEnabled!=="function"||r.isEnabled();}catch(_){return false;}}
function blockingUiReason(){if(document.body.classList.contains("map-open"))return "map-open";const intro=document.getElementById("intro");if(intro&&intro.classList.contains("open"))return "intro-open";return null;}
function blockingUi(){return !!blockingUiReason();}
function snapshot(){try{return Bridge.getSnapshot();}catch(error){console.warn("NPC dialogue snapshot:",error);return null;}}
function nearbyPeople(s){if(!s||!s.active||!s.playerPosition||!Array.isArray(s.people))return[];return s.people.filter(n=>n&&n.recruited!==true&&enabled(n)).map(n=>{const p=worldPosition(rootOf(n));return{npc:n,id:idOf(n),position:p,distance:distance(p,s.playerPosition)};}).filter(x=>x.id&&x.position&&x.distance<=RANGE);}
function stateFor(id,now){let s=metadata.get(id);if(!s){s={nextAt:now+between(1200,2800),lastSpokeAt:0};metadata.set(id,s);}return s;}
function slotFor(id){return slots.find(s=>s.current&&s.current.id===id)||slots.find(s=>!s.current);}
function startBubble(npc,content,now,duration){const id=idOf(npc);if(!id||!content||!content.text)return false;const slot=slotFor(id);if(!slot)return false;const kind=["thought","speech","action"].includes(content.kind)?content.kind:"speech";slot.current={id,npc,kind,expiresAt:now+(duration||4200)};slot.role.textContent=String(content.roleName||"Habitante").slice(0,24);slot.kind.textContent=kind==="thought"?"PIENSA":kind==="action"?"HACE":"DICE";slot.message.textContent=String(content.text).slice(0,120);slot.node.dataset.kind=kind;slot.node.hidden=false;slot.node.classList.remove("is-visible");void slot.node.offsetWidth;slot.node.classList.add("is-visible");lastMessageAt=now;lastMessageKind=kind;lastMessageNpcId=id;return true;}
function clearSlot(slot){slot.current=null;slot.node.classList.remove("is-visible");slot.node.hidden=true;slot.node.style.transform="";}
function expire(now){for(const slot of slots)if(slot.current&&slot.current.expiresAt<=now)clearSlot(slot);}
function partnerFor(item,nearby){let best=null,bestDistance=7.5;for(const candidate of nearby){if(candidate.id===item.id||candidate.npc.villageIndex!==item.npc.villageIndex)continue;if(slots.some(s=>s.current&&s.current.id===candidate.id))continue;const d=distance(item.position,candidate.position);if(d<bestDistance){best=candidate;bestDistance=d;}}return best;}
function queueReply(npc,content,dueAt){pending.push({npc,content,dueAt});if(pending.length>4)pending.shift();}
function processPending(now,ids){for(let i=0;i<pending.length;){const entry=pending[i];if(entry.dueAt>now){i++;continue;}pending.splice(i,1);if(!ids.has(idOf(entry.npc)))continue;startBubble(entry.npc,entry.content,now,3900);break;}}
function schedule(now,nearby){const selected=Core.selectVisibleBubbles(nearby.map(x=>({item:x,distance:x.distance,priority:x.distance<7?2:1,visible:true})),MAX_BUBBLES).map(x=>x.item);const due=selected.filter(x=>stateFor(x.id,now).nextAt<=now&&!slots.some(s=>s.current&&s.current.id===x.id));if(!due.length)return;due.sort((a,b)=>a.distance-b.distance);const chosen=due[Math.floor(random()*Math.min(due.length,3))],state=stateFor(chosen.id,now),context={isWalking:Number(chosen.npc.parts&&chosen.npc.parts.actualMoveSpeed)>.08,playerClose:chosen.distance<7};const partner=partnerFor(chosen,nearby);if(partner&&random()<.38){const exchange=Core.chooseExchange(chosen.npc,partner.npc,random);if(startBubble(chosen.npc,exchange[0],now,4300)){queueReply(partner.npc,exchange[1],now+1450);const other=stateFor(partner.id,now);other.nextAt=now+between(18000,26000);state.nextAt=now+between(13000,19000);state.lastSpokeAt=now;other.lastSpokeAt=now;return;}}if(startBubble(chosen.npc,Core.chooseAmbientMessage(chosen.npc,context,random),now,3900)){state.lastSpokeAt=now;state.nextAt=now+between(11000,17000);}else state.nextAt=now+3500;}
function project(slot,s){
 const hide=reason=>{slot.node.hidden=true;slot.node.dataset.hiddenReason=reason;return false;};
 const c=slot.current;
 if(!c||!s||!s.scene||!s.engine||!s.camera||!s.canvas)return hide("render-context-incomplete");
 const npc=c.npc;if(!enabled(npc))return hide("npc-disabled");
 const root=rootOf(npc),rootPos=worldPosition(root);if(!rootPos)return hide("npc-position-unavailable");
 if(distance(rootPos,s.playerPosition)>RANGE)return hide("npc-outside-range");
 const BABYLON=s.BABYLON||window.BABYLON;if(!BABYLON||!BABYLON.Vector3||!BABYLON.Matrix)return hide("babylon-project-unavailable");
 try{
  const anchor=npc.parts&&npc.parts.head&&typeof npc.parts.head.getAbsolutePosition==="function"?npc.parts.head:root,ap=worldPosition(anchor);
  if(!ap)return hide("head-anchor-unavailable");
  const world=ap.clone?ap.clone():new BABYLON.Vector3(ap.x,ap.y,ap.z);world.y+=anchor===root?2.12:.48;
  const width=s.engine.getRenderWidth(),height=s.engine.getRenderHeight(),rect=s.canvas.getBoundingClientRect();
  if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return hide("canvas-size-unavailable");
  const viewport=s.camera.viewport&&typeof s.camera.viewport.toGlobal==="function"?s.camera.viewport.toGlobal(width,height):{x:0,y:0,width,height};
  const p=BABYLON.Vector3.Project(world,BABYLON.Matrix.Identity(),s.scene.getTransformMatrix(),viewport);
  if(!p||p.z<=0||p.z>=1||p.x<viewport.x||p.x>viewport.x+viewport.width||p.y<viewport.y||p.y>viewport.y+viewport.height)return hide("npc-outside-camera-frustum");
  const x=rect.left+p.x*(rect.width/width),y=rect.top+p.y*(rect.height/height),stack=slots.indexOf(slot)*9;
  slot.node.style.transform="translate3d("+x.toFixed(1)+"px,"+(y-12-stack).toFixed(1)+"px,0) translate(-50%,-100%)";
  slot.node.hidden=false;delete slot.node.dataset.hiddenReason;return true;
 }catch(_){return hide("projection-exception");}
}
function render(s){
 const uiBlock=blockingUiReason(),block=!s?"bridge-no-snapshot":!s.active?"game-not-active":document.hidden?"document-hidden":uiBlock;
 const active=!block;lastBlockReason=block||"active";layer.hidden=!active;layer.setAttribute("aria-hidden",active?"false":"true");layer.dataset.state=lastBlockReason;
 if(!active){for(const slot of slots)slot.node.hidden=true;renderedCount=0;lastProjectionFailures={};return;}
 const failures={};for(const slot of slots){if(slot.current){project(slot,s);if(slot.node.hidden){const reason=slot.node.dataset.hiddenReason||"not-visible";failures[reason]=(failures[reason]||0)+1;}}else slot.node.hidden=true;}
 renderedCount=slots.filter(slot=>slot.current&&!slot.node.hidden).length;lastProjectionFailures=failures;
}
function schedulerTick(){const now=Date.now(),s=snapshot();if(!s||!s.active||document.hidden||blockingUi()){lastNearbyCount=0;lastDueCount=0;render(s);lastActive=false;return;}if(!lastActive){for(const slot of slots)clearSlot(slot);pending.length=0;lastActive=true;}expire(now);const nearby=nearbyPeople(s),ids=new Set(nearby.map(x=>x.id));lastNearbyCount=nearby.length;processPending(now,ids);schedule(now,nearby);lastDueCount=nearby.filter(x=>stateFor(x.id,now).nextAt<=now&&!slots.some(slot=>slot.current&&slot.current.id===x.id)).length;render(s);}
function positionTick(){render(snapshot());}
function start(){if(schedulerHandle||positionHandle)return;schedulerHandle=window.setInterval(()=>{try{schedulerTick();}catch(e){console.warn("NPC dialogue scheduler recovered:",e);}},Core.SCHEDULER_INTERVAL_MS);positionHandle=window.setInterval(()=>{try{positionTick();}catch(e){console.warn("NPC bubble projection recovered:",e);}},Core.POSITION_UPDATE_MS);}
start();window.__ELSN_NPC_DIALOGUES__=Object.freeze({getSnapshot:()=>({ready:true,status:lastBlockReason,active:!!lastActive,maxVisibleBubbles:MAX_BUBBLES,nearbyCount:lastNearbyCount,dueCount:lastDueCount,activeBubbleCount:slots.filter(s=>!!s.current).length,renderedBubbleCount:renderedCount,projectionHiddenReasons:{...lastProjectionFailures},lastMessageAt,lastMessageKind,lastMessageNpcId,nearbyRangeMeters:RANGE,positionUpdateMs:Core.POSITION_UPDATE_MS,schedulerIntervalMs:Core.SCHEDULER_INTERVAL_MS})});
})();