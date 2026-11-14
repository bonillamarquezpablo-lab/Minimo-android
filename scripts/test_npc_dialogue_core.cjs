"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),Core=require("./npc-dialogue-core.js");
assert.equal(Core.MAX_VISIBLE_BUBBLES,4);assert.equal(Core.MAX_RANGE_METERS,18);assert.equal(Core.POSITION_UPDATE_MS,100);assert.equal(Core.SCHEDULER_INTERVAL_MS,1400);
assert.deepEqual(Core.ROLES.map(r=>r.id),["fisher","farmer","smith","trader"]);
for(let v=0;v<8;v++){assert.ok(Core.roleForVariant(v).name);const m=Core.chooseAmbientMessage({parts:{variant:v}},{isWalking:v%2===0},()=>.75);assert.ok(["thought","speech","action"].includes(m.kind));assert.ok(m.text.length>5&&m.text.length<=120);}
const ex=Core.chooseExchange({parts:{variant:0}},{parts:{variant:3}},()=>0);assert.equal(ex.length,2);assert.ok(ex.every(x=>x.kind==="speech"&&x.text));
const input=Array.from({length:9},(_,i)=>({id:"npc-"+i,distance:i+1,priority:i===7?4:1,visible:true})),visible=Core.selectVisibleBubbles(input,99);assert.equal(visible.length,4);assert.equal(visible[0].id,"npc-7");assert.ok(visible.every(x=>x.distance<=18));assert.deepEqual(Core.selectVisibleBubbles(input,0),[]);
const runtime=fs.readFileSync("scripts/npc-dialogue-runtime.js","utf8"),builder=fs.readFileSync("scripts/build_site.py","utf8"),worker=fs.readFileSync("sw.js","utf8"),validator=fs.readFileSync("scripts/validate_release.py","utf8");
assert.ok(runtime.includes("for(let i=0;i<MAX_BUBBLES;i++)slots.push(makeSlot(i))"));
assert.ok(runtime.includes("BABYLON.Vector3.Project"));
assert.ok(runtime.includes("Core.POSITION_UPDATE_MS"));
assert.ok(runtime.includes("Core.SCHEDULER_INTERVAL_MS"));
assert.ok(runtime.includes("lastBlockReason") && runtime.includes("projectionHiddenReasons"));
assert.ok(runtime.includes("npc-outside-camera-frustum") && runtime.includes("between(1200,2800)"));
assert.ok(!runtime.includes("new BABYLON.Mesh") && !runtime.includes("MeshBuilder") && !runtime.includes("new B.Mesh") && !runtime.includes("requestAnimationFrame"));
assert.match(builder,/__ELSN_GAME_DIALOGUE_BRIDGE__/);assert.match(builder,/npc-dialogue-core\.js/);assert.match(builder,/npc-dialogue-runtime\.js/);assert.match(builder,/npc-dialogue\.css/);assert.match(builder,/maxVisibleBubbles:4/);
assert.match(worker,/\.\/scripts\/npc-dialogue-core\.js/);assert.match(worker,/\.\/scripts\/npc-dialogue-runtime\.js/);assert.match(worker,/\.\/scripts\/npc-dialogue\.css/);assert.match(validator,/scripts\/npc-dialogue-core\.js/);assert.match(validator,/maxVisibleBubbles:4/);
console.log("NPC ambient dialogue contract: PASS (four-bubble limit, range, scheduling, projection and offline packaging).");
