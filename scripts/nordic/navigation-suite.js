/* EL SIN NOMBRE — navegación integrada con el mapa original del juego.
   No crea minimapas, paneles ni botones flotantes duplicados. */
(() => {
 "use strict";
 if(window.__NorseNavigationSuite)return;
 const state={mode:"follow",camera:null,scene:null,button:null,observer:null};
 const modes=["follow","free","ship","orbit"];
 const labels={follow:"SEGUIR",free:"LIBRE",ship:"NÁUTICA",orbit:"ORBITAL"};
 function findWorld(){const B=window.BABYLON;if(!B?.Engine)return false;for(const engine of B.Engine.Instances||[]){const scene=(engine?.scenes||[]).find(s=>s&&!s.isDisposed&&s.activeCamera);if(scene){state.scene=scene;state.camera=scene.activeCamera;return true;}}return false;}
 function applyMode(mode){if(!modes.includes(mode))return false;const control=window.__ELSN_CAMERA_CONTROL;if(!control?.setMode)return false;if(control.setMode(mode)===false)return false;state.mode=mode;if(state.button)state.button.textContent="CÁMARA: "+labels[mode];return true;}
 function mountControl(){const host=document.getElementById("quickActions");if(!host)return false;if(!state.button){const button=document.createElement("button");button.id="cameraModeBtn";button.type="button";button.textContent="CÁMARA: SEGUIR";button.setAttribute("aria-label","Cambiar modo de cámara");button.addEventListener("click",()=>{const next=(modes.indexOf(state.mode)+1)%modes.length;applyMode(modes[next]);});host.appendChild(button);state.button=button;}return true;}
 function start(){if(!findWorld()){setTimeout(start,500);return;}mountControl();applyMode("follow");const body=document.body;if(body&&!state.observer){let wasRunning=body.classList.contains("game-running");state.observer=new MutationObserver(()=>{const running=body.classList.contains("game-running");if(!wasRunning&&running)applyMode("follow");wasRunning=running;});state.observer.observe(body,{attributes:true,attributeFilter:["class"]});}}
 window.__NorseNavigationSuite={version:"0.2.0",state,getStatus:()=>({mode:state.mode,originalMap:!!document.getElementById("map"),duplicateMap:false}),setMode:applyMode};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
