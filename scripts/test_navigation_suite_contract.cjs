"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const serviceWorker = fs.readFileSync("sw.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const buildScript = fs.readFileSync("scripts/build_site.py", "utf8");
const navigationSource = fs.readFileSync("scripts/nordic/navigation-suite.js", "utf8");

assert.ok(serviceWorker.includes('"./scripts/nordic/navigation-suite.js"'),
  "The navigation suite must be part of the initial offline shell cache.");
assert.ok(html.includes('id="quickActions"') && html.includes('id="map"'),
  "The navigation suite must mount into the original quick actions and retain the original map.");
assert.ok(html.includes("function smoothLocalMapHeading(target,now=performance.now())"),
  "The minimap heading must be smoothed using elapsed frame time.");
assert.ok(html.includes("Math.atan2(Math.sin(target-localMapHeading),Math.cos(target-localMapHeading))"),
  "Heading smoothing must interpolate across the shortest angular path at the yaw wrap boundary.");
assert.ok(html.includes("const blend=1-Math.exp(-elapsed/.075)"),
  "Heading smoothing must use frame-rate-independent exponential interpolation.");
assert.ok(html.includes("mapClock+=dt;const mapRefreshInterval=document.body.classList.contains('map-open')?.42:.05"),
  "The local minimap must refresh at 20 Hz while the expanded world map keeps its lower refresh rate.");
assert.ok(html.includes("mg.translate(cx,cy);mg.rotate(heading-Math.PI);mg.translate(-cx,-cy);"),
  "The local minimap must rotate its world around a fixed player marker.");
assert.ok(html.includes("mg.save();mg.translate(cx,cy);mg.shadowColor="),
  "The player marker must stay fixed at the centre and face the top of the rotating minimap.");
assert.ok(html.includes("mg.rotate(heading-Math.PI);mg.fillStyle='rgba(11,28,31,.8)';"),
  "The north compass must rotate with the map.");
assert.ok(buildScript.includes('navigation_source = ROOT / "scripts" / "nordic" / "navigation-suite.js"') &&
  buildScript.includes("shutil.copy2(navigation_source, navigation_target)"),
  "The website build must package the project-owned navigation runtime.");
assert.ok(buildScript.includes('navigation_tag = \'<script src="./scripts/nordic/navigation-suite.js" defer></script>\'') &&
  buildScript.includes('html = html.replace("</body>", navigation_tag + "\\n</body>", 1)'),
  "The website build must inject the navigation module once into the generated game entry point.");

class Element {
  constructor(tagName) {
    this.tagName=String(tagName).toUpperCase();this.id="";this.type="";this.textContent="";this.hidden=false;this.attributes={};
    this.children=[];this.parentElement=null;this.listeners={};
    const values=new Set();
    this.classList={add:name=>values.add(name),remove:name=>values.delete(name),contains:name=>values.has(name),toggle:(name,force)=>{const on=force===undefined?!values.has(name):!!force;if(on)values.add(name);else values.delete(name);return on;}};
  }
  appendChild(child){if(child.parentElement){const prior=child.parentElement.children.indexOf(child);if(prior>=0)child.parentElement.children.splice(prior,1);}this.children.push(child);child.parentElement=this;return child;}
  addEventListener(type,handler){(this.listeners[type] ||= []).push(handler);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  closest(selector){return selector==="button"&&this.tagName==="BUTTON"?this:null;}
}
const calls=[];
const host=new Element("div");host.id="quickActions";
const existingIds=["progressBtn","saveBtn","audioToggle","rotateScreenBtn","buildCabinBtn","villagerModelBtn"];
for(const id of existingIds){const item=new Element("button");item.id=id;item.type="button";item.textContent=id;item.addEventListener("click",()=>calls.push(id));if(id==="villagerModelBtn")item.hidden=true;host.appendChild(item);}
const head=new Element("head");
let readyHandler=null;
const body={classList:{contains:()=>false}};
const contextWindow={BABYLON:{Engine:{Instances:[{scenes:[{isDisposed:false,activeCamera:{}}]}]}},__ELSN_CAMERA_CONTROL:{setMode(mode){calls.push(mode);return true;}}};
const contextDocument={readyState:"loading",body,head,addEventListener(type,handler){if(type==="DOMContentLoaded")readyHandler=handler;},getElementById(id){if(id==="quickActions")return host;if(id==="map")return {};if(id==="norse-single-menu-styles")return head.children.find(x=>x.id===id)||null;return null;},createElement(tag){return new Element(tag);}};
class MockMutationObserver{constructor(callback){this.callback=callback;}observe(){}}
const sandbox={window:contextWindow,document:contextDocument,MutationObserver:MockMutationObserver,setTimeout(){throw new Error("Unexpected retry timer when the scene is available.");},console};

vm.runInNewContext(navigationSource,sandbox,{filename:"navigation-suite.js"});
assert.equal(typeof readyHandler,"function","The module must wait for DOM readiness.");
readyHandler();
assert.deepEqual(calls,["follow"],"The navigation suite must start in follow mode.");
assert.equal(host.children.length,2,"The quick-actions strip must become one menu trigger and one menu panel.");
const menuButton=host.children.find(x=>x.id==="gameMenuToggle");
const menuPanel=host.children.find(x=>x.id==="gameMenuPanel");
assert.ok(menuButton&&menuPanel,"The single MENÚ trigger and its panel must be mounted.");
assert.equal(menuButton.textContent,"☰  MENÚ");
assert.equal(menuButton.getAttribute("aria-expanded"),"false");
assert.equal(menuPanel.hidden,true);
assert.deepEqual(menuPanel.children.map(x=>x.id),[...existingIds,"cameraModeBtn"],"All original quick actions and the camera mode must remain inside the menu.");
assert.equal(menuPanel.children.find(x=>x.id==="audioToggle").listeners.click.length,1,"Moving existing controls must preserve their event handlers.");
assert.equal(menuPanel.children.find(x=>x.id==="villagerModelBtn").hidden,true,"Originally hidden controls must remain hidden.");

menuButton.listeners.click[0]();
assert.equal(menuPanel.hidden,false,"Tapping MENÚ must expand its options.");
assert.equal(menuButton.getAttribute("aria-expanded"),"true");
menuPanel.children[0].listeners.click[0]();
menuPanel.listeners.click[0]({target:menuPanel.children[0]});
assert.equal(menuPanel.hidden,true,"Choosing an option must close the menu.");
assert.deepEqual(calls,["follow","progressBtn"]);

const cameraButton=menuPanel.children.find(x=>x.id==="cameraModeBtn");
assert.equal(cameraButton.textContent,"CÁMARA: SEGUIR");
const expected=[["free","CÁMARA: LIBRE"],["ship","CÁMARA: NÁUTICA"],["orbit","CÁMARA: ORBITAL"],["follow","CÁMARA: SEGUIR"]];
for(const [mode,label] of expected){cameraButton.listeners.click[0]();assert.equal(contextWindow.__NorseNavigationSuite.state.mode,mode);assert.equal(cameraButton.textContent,label);}
assert.deepEqual(calls,["follow","progressBtn","free","ship","orbit","follow"]);
assert.equal(contextWindow.__NorseNavigationSuite.setMode("invalid"),false);
assert.deepEqual(JSON.parse(JSON.stringify(contextWindow.__NorseNavigationSuite.getStatus())),{mode:"follow",originalMap:true,duplicateMap:false,menuMounted:true,menuControls:7});
vm.runInNewContext(navigationSource,sandbox,{filename:"navigation-suite-second-load.js"});
assert.equal(host.children.length,2,"Repeated module evaluation must not create duplicate controls.");
console.log("NAVIGATION SUITE TESTS PASSED: rotating player-following minimap, single menu and preserved controls.");
