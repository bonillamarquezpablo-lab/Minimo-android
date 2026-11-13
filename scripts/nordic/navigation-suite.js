/* EL SIN NOMBRE — navegación integrada con el mapa original del juego.
   Unifica los controles secundarios en un solo menú; no sustituye controles de combate.
   No crea minimapas ni altera la cámara, el render ni el perfil gráfico. */
(() => {
 "use strict";
 if(window.__NorseNavigationSuite)return;
 const state={mode:"follow",camera:null,scene:null,button:null,observer:null,menuButton:null,menuPanel:null};
 const modes=["follow","free","ship","orbit"];
 const labels={follow:"SEGUIR",free:"LIBRE",ship:"NÁUTICA",orbit:"ORBITAL"};
 const MENU_STYLE_ID="norse-single-menu-styles";
 function findWorld(){const B=window.BABYLON;if(!B?.Engine)return false;for(const engine of B.Engine.Instances||[]){const scene=(engine?.scenes||[]).find(s=>s&&!s.isDisposed&&s.activeCamera);if(scene){state.scene=scene;state.camera=scene.activeCamera;return true;}}return false;}
 function applyMode(mode){if(!modes.includes(mode))return false;const control=window.__ELSN_CAMERA_CONTROL;if(!control?.setMode)return false;if(control.setMode(mode)===false)return false;state.mode=mode;if(state.button)state.button.textContent="CÁMARA: "+labels[mode];return true;}
 function installMenuStyles(){
  if(document.getElementById(MENU_STYLE_ID))return;
  const style=document.createElement("style");style.id=MENU_STYLE_ID;
  style.textContent=[
   "#quickActions.game-menu-host{position:fixed!important;top:calc(env(safe-area-inset-top,0px) + 116px)!important;left:max(8px,env(safe-area-inset-left,0px) + 8px)!important;right:auto!important;bottom:auto!important;display:block!important;width:auto!important;max-width:none!important;min-width:0!important;z-index:25!important;pointer-events:none!important;transform:none!important;margin:0!important}",
   "#quickActions.game-menu-host>#gameMenuToggle{display:block!important;width:112px!important;min-width:112px!important;max-width:none!important;min-height:42px!important;margin:0!important;padding:9px 12px!important;border:1px solid #d8ad68!important;border-radius:8px!important;background:linear-gradient(145deg,#263b39,#101f22)!important;color:#f3dfb7!important;font:900 11px/1.1 Georgia,serif!important;letter-spacing:1.2px!important;white-space:nowrap!important;box-shadow:0 5px 16px #0009,inset 0 1px #fff2!important;pointer-events:auto!important;touch-action:manipulation!important}",
   "#quickActions.game-menu-host>#gameMenuPanel{position:absolute!important;left:0!important;right:auto!important;top:calc(100% + 7px)!important;width:min(88vw,360px)!important;max-width:min(88vw,360px)!important;max-height:min(64dvh,490px)!important;overflow-y:auto!important;overscroll-behavior:contain!important;display:none!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-content:start!important;gap:7px!important;margin:0!important;padding:10px!important;border:1px solid rgba(216,173,104,.88)!important;border-radius:11px!important;background:linear-gradient(155deg,rgba(23,39,39,.985),rgba(5,14,17,.985))!important;box-shadow:0 14px 38px #000d,inset 0 1px #fff2!important;backdrop-filter:blur(14px)!important;pointer-events:auto!important}",
   "#quickActions.game-menu-host>#gameMenuPanel:not([hidden]){display:grid!important}",
   "#quickActions.game-menu-host>#gameMenuPanel>button{box-sizing:border-box!important;width:100%!important;min-width:0!important;max-width:none!important;min-height:40px!important;margin:0!important;padding:8px 7px!important;border:1px solid rgba(216,173,104,.72)!important;border-radius:7px!important;background:linear-gradient(145deg,#263b39,#101f22)!important;color:#f0dfbd!important;font:800 9px/1.2 Georgia,serif!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:center!important;box-shadow:0 3px 10px #0007,inset 0 1px #fff1!important;pointer-events:auto!important;touch-action:manipulation!important}",
   "#quickActions.game-menu-host>#gameMenuPanel>button:active,#quickActions.game-menu-host>#gameMenuToggle:active{filter:brightness(1.12)!important;transform:translateY(1px)!important}",
   "@media(orientation:landscape){#quickActions.game-menu-host>#gameMenuPanel{width:min(58vw,380px)!important;max-width:min(58vw,380px)!important;max-height:70dvh!important}}",
   "@media(prefers-reduced-motion:reduce){#quickActions.game-menu-host button{transition:none!important}}"
  ].join("\n");
  (document.head||document.body).appendChild(style);
 }
 function setMenuOpen(open){if(!state.menuPanel||!state.menuButton)return;const isOpen=!!open;state.menuPanel.hidden=!isOpen;state.menuButton.setAttribute("aria-expanded",String(isOpen));state.menuButton.setAttribute("aria-label",isOpen?"Cerrar menú del juego":"Abrir menú del juego");}
 function mountMenu(){
  const host=document.getElementById("quickActions");if(!host||state.menuButton)return false;
  const controls=Array.from(host.children||[]).filter(node=>node.id!=="gameMenuToggle"&&node.id!=="gameMenuPanel");
  const panel=document.createElement("div");panel.id="gameMenuPanel";panel.hidden=true;panel.setAttribute("role","group");panel.setAttribute("aria-label","Ajustes y acciones secundarias del juego");
  controls.forEach(control=>panel.appendChild(control));
  const button=document.createElement("button");button.id="gameMenuToggle";button.type="button";button.textContent="☰  MENÚ";button.setAttribute("aria-label","Abrir menú del juego");button.setAttribute("aria-controls","gameMenuPanel");button.setAttribute("aria-expanded","false");
  button.addEventListener("click",()=>setMenuOpen(!!panel.hidden));
  panel.addEventListener("click",event=>{const target=event.target?.closest?.("button");if(target)setMenuOpen(false);});
  host.classList.add("game-menu-host");host.appendChild(button);host.appendChild(panel);
  state.menuButton=button;state.menuPanel=panel;installMenuStyles();
  document.addEventListener("keydown",event=>{if(event.key==="Escape")setMenuOpen(false);});
  return true;
 }
 function mountControl(){
  const host=document.getElementById("quickActions");if(!host)return false;
  if(!state.button){const button=document.createElement("button");button.id="cameraModeBtn";button.type="button";button.textContent="CÁMARA: SEGUIR";button.setAttribute("aria-label","Cambiar modo de cámara");button.addEventListener("click",()=>{const next=(modes.indexOf(state.mode)+1)%modes.length;applyMode(modes[next]);});host.appendChild(button);state.button=button;}
  return true;
 }
 function start(){if(!findWorld()){setTimeout(start,500);return;}mountControl();mountMenu();applyMode("follow");const body=document.body;if(body&&!state.observer){let wasRunning=body.classList.contains("game-running");state.observer=new MutationObserver(()=>{const running=body.classList.contains("game-running");if(!wasRunning&&running)applyMode("follow");wasRunning=running;});state.observer.observe(body,{attributes:true,attributeFilter:["class"]});}}
 window.__NorseNavigationSuite={version:"0.3.0",state,getStatus:()=>({mode:state.mode,originalMap:!!document.getElementById("map"),duplicateMap:false,menuMounted:!!state.menuPanel,menuControls:state.menuPanel?.children?.length||0}),setMode:applyMode};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
