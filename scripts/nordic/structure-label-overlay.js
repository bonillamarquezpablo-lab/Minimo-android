(function(){
  "use strict";
  const params=new URLSearchParams(location.search);
  if(params.get("debug")!=="structures"||params.get("test")!=="1")return;
  const style=document.createElement("style");
  style.textContent=`
    #elsn-structure-label-layer{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;font:600 11px/1.35 system-ui,sans-serif}
    .elsn-structure-label{position:absolute;max-width:230px;min-width:120px;padding:5px 7px;border:1px solid rgba(255,210,120,.9);border-radius:6px;background:rgba(12,22,25,.92);color:#fff2d4;text-shadow:0 1px 2px #000;box-shadow:0 2px 9px #0008;white-space:normal;overflow-wrap:anywhere;transform:translate(-50%,-100%)}
    .elsn-structure-label.offshore{border-color:#ff766d;background:rgba(55,13,13,.94);color:#ffe1dd}
    .elsn-structure-label.unknown{border-color:#78c9ff;background:rgba(8,35,55,.94);color:#d9f2ff}
    #elsn-structure-label-panel{position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483001;max-width:min(330px,78vw);padding:8px 10px;border:1px solid #d8ad68;border-radius:8px;background:rgba(10,20,22,.94);color:#fff0d0;font:12px/1.45 system-ui,sans-serif;pointer-events:none;box-shadow:0 3px 12px #0008}
    #elsn-structure-label-panel strong{color:#ffd58c}
  `;
  document.head.appendChild(style);
  const layer=document.createElement("div");layer.id="elsn-structure-label-layer";
  const panel=document.createElement("div");panel.id="elsn-structure-label-panel";panel.textContent="Inspector de estructuras: esperando al mundo…";
  document.body.append(layer,panel);
  let started=false,labels=[],api=null,lastCameraPoll=0;
  const fmt=n=>Number.isFinite(Number(n))?Number(n).toFixed(1):"?";
  function start(){
    if(started)return;
    api=window.__ELSN_TEST__;
    if(!api||typeof api.auditOffshoreStructures!=="function"||typeof api.projectWorldPoint!=="function"||typeof api.sceneViewSnapshot!=="function"){
      panel.textContent="Inspector de estructuras: abre el juego con ?test=1&debug=structures";
      requestAnimationFrame(start);return;
    }
    let inventory;
    try{inventory=api.auditOffshoreStructures(500);}catch(error){
      panel.textContent="Error al inventariar estructuras: "+String(error?.message||error);return;
    }
    const rows=Array.isArray(inventory?.candidates)?inventory.candidates:[];
    const visibleRows=rows.filter(row=>row&&row.position&&row.visible&&row.enabled);
    const offshoreCount=visibleRows.filter(row=>row.offshore).length;
    panel.innerHTML="";
    const heading=document.createElement("strong");heading.textContent="INSPECTOR DE ESTRUCTURAS";panel.appendChild(heading);
    const summary=document.createElement("div");
    summary.textContent=visibleRows.length+" visibles · "+offshoreCount+" marcadas mar adentro · "+rows.length+" detectadas en "+(inventory.islandCount||"?")+" islas";
    panel.appendChild(summary);
    const hint=document.createElement("div");hint.textContent="Acércate: cada etiqueta muestra el nombre interno, isla y coordenadas X/Z.";panel.appendChild(hint);
    for(const [index,row] of visibleRows.entries()){
      const el=document.createElement("div");
      el.className="elsn-structure-label"+(row.offshore?" offshore":"")+(row.structuralClassification==="unknown-geometry-cluster"?" unknown":"");
      const title=document.createElement("strong");
      title.textContent=(row.offshore?"⚠ ":"")+String(row.name||"estructura sin nombre");
      const detail=document.createElement("div");
      detail.textContent=String(row.kind||"estructura")+" · "+String(row.island||"isla desconocida");
      const identity=document.createElement("div");
      identity.textContent="ID interno: "+(row.name||"sin nombre");
      const coords=document.createElement("div");
      coords.textContent="X "+fmt(row.position.x)+" · Y "+fmt(row.position.y)+" · Z "+fmt(row.position.z);
      const status=document.createElement("div");
      status.textContent=row.offshore?(row.issue||"posible estructura flotante"):(row.registered?"registrada":"candidata sin registrar");
      el.append(title,detail,identity,coords,status);layer.appendChild(el);
      labels.push({el,row,index});
    }
    started=true;
    panel.dataset.detected=String(rows.length);
    panel.dataset.offshore=String(offshoreCount);
    requestAnimationFrame(update);
  }
  function update(){
    if(!started)return;
    let camera;
    try{camera=api.sceneViewSnapshot()?.camera;}catch(_){}
    if(!camera){requestAnimationFrame(update);return;}
    for(const item of labels){
      const {row,el}=item,p=row.position;
      const distance=Math.hypot(p.x-camera.x,p.z-camera.z);
      if(distance>140||!row.visible||!row.enabled){el.style.display="none";continue;}
      let projected;
      try{projected=api.projectWorldPoint({x:p.x,y:(row.bounds?.topY??p.y+3.2)+.45,z:p.z});}catch(_){}
      if(!projected?.inFront||!projected?.onScreen){el.style.display="none";continue;}
      el.style.display="block";
      const viewport=api.sceneViewSnapshot()?.viewport;
      const cssWidth=viewport?.cssWidth||window.innerWidth,cssHeight=viewport?.cssHeight||window.innerHeight;
      el.style.left=(projected.normalizedX*cssWidth)+"px";el.style.top=(projected.normalizedY*cssHeight)+"px";
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(start);
})();