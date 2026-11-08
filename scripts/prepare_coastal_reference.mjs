import fs from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('dist/index.html');
let html = await fs.readFile(file, 'utf8');

if (!html.includes('<meta name="el-sin-nombre-build" content="0.6.271">')) {
  throw new Error('La referencia de captura exige exactamente EL SIN NOMBRE 0.6.271.');
}

function replaceExactlyOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('No se puede instrumentar de forma segura el marcador: ' + label);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

// Este script se inserta únicamente en dist, después de construir la copia temporal.
// El index.html de origen y el sitio publicado nunca reciben estos controles.
const seedScript = `<script>
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('test') !== '1') return;
  let state = (Number(params.get('seed') || 20261108) >>> 0) || 1;
  Object.defineProperty(window, '__ELSN_WATER_REFERENCE_MODE__', { value: true });
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
})();
</script>`;

html = replaceExactlyOnce(html, '<head>', '<head>\n' + seedScript, 'head seed script');
html = replaceExactlyOnce(
  html,
  'function updateCamera(dt){',
  'function updateCamera(dt){\n  if(window.__ELSN_WATER_REFERENCE_MODE__)return;',
  'updateCamera lock'
);
html = replaceExactlyOnce(
  html,
  'function animateWater(dt){',
  'function animateWater(dt){\n  if(window.__ELSN_WATER_REFERENCE_MODE__)dt=0;',
  'simulation clock freeze'
);

const testApi = String.raw`
if(window.__ELSN_WATER_REFERENCE_MODE__){
 const referenceFiniteStats=values=>{
  const sorted=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if(!sorted.length)return {count:0,mean:null,max:null,p95:null};
  const percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
  return {
   count:sorted.length,
   mean:Number((sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(6)),
   max:Number(sorted[sorted.length-1].toFixed(6)),
   p95:Number(percentile(.95).toFixed(6))
  };
 };
 const referenceSeededRandom=()=>{
  let state=0x2710C0DE;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 };
 function referenceAnalyticFadeAt(x,z){
  const dx=x-waterFocusX,dz=z-waterFocusZ,d2=dx*dx+dz*dz;
  if(d2>WATER_DETAIL_RADIUS_SQ)return 1;
  const t=Math.max(0,Math.min(1,(WATER_DETAIL_RADIUS_SQ-d2)/(WATER_DETAIL_RADIUS_SQ-WATER_DETAIL_FADE_START_SQ)));
  return t*t*(3-2*t);
 }
 function referenceSample100(){
  const random=referenceSeededRandom(),vertexCount=waterBase.length/3,samples=[],errors=[];
  const groups={inside:[],boundary:[],far:[]},candidates={inside:[],boundary:[],far:[]};
  for(let vertex=0;vertex<vertexCount;vertex++){
   const offset=vertex*3,x=waterBase[offset],z=waterBase[offset+2],distance=Math.hypot(x-waterFocusX,z-waterFocusZ);
   const group=distance<WATER_DETAIL_RADIUS-5?'inside':distance<=WATER_DETAIL_RADIUS+5?'boundary':'far';
   candidates[group].push(vertex);
  }
  const targets={inside:34,boundary:33,far:33};
  for(const group of Object.keys(targets)){
   const pool=candidates[group];
   if(!pool.length)throw new Error('No hay vértices disponibles para la zona LOD: '+group);
   for(let i=0;i<targets[group];i++){
    const vertex=pool[Math.floor(random()*pool.length)];
    const offset=vertex*3,x=waterBase[offset],z=waterBase[offset+2],fade=referenceAnalyticFadeAt(x,z);
    const analytic=waterHeight(x,z,oceanTime,fade),rendered=waterPositions[offset+1],error=rendered-analytic;
    samples.push({vertex,x:Number(x.toFixed(3)),z:Number(z.toFixed(3)),group,fade:Number(fade.toFixed(5)),analytic:Number(analytic.toFixed(6)),rendered:Number(rendered.toFixed(6)),error:Number(error.toFixed(6))});
    groups[group].push(Math.abs(error));
   }
  }
  for(const values of Object.values(groups))errors.push(...values);
  return {
   requested:100,actual:samples.length,
   absoluteErrorMeters:referenceFiniteStats(errors),
   byRegion:Object.fromEntries(Object.entries(groups).map(([key,value])=>[key,referenceFiniteStats(value)])),
   samples
  };
 }
 function referenceLodBoundary(){
  let pairCount=0;
  const actualHeightSteps=[],shortWaveResiduals=[],normalAngleSteps=[],grid=waterGridSize,vertexCount=waterBase.length/3;
  const dotAngle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])));
  const compare=(aVertex,bVertex)=>{
   const ao=aVertex*3,bo=bVertex*3,ax=waterBase[ao],az=waterBase[ao+2],bx=waterBase[bo],bz=waterBase[bo+2];
   const ad=Math.hypot(ax-waterFocusX,az-waterFocusZ),bd=Math.hypot(bx-waterFocusX,bz-waterFocusZ);
   if(!((ad<=WATER_DETAIL_RADIUS&&bd>WATER_DETAIL_RADIUS)||(bd<=WATER_DETAIL_RADIUS&&ad>WATER_DETAIL_RADIUS)))return;
   pairCount++;
   const actualDelta=waterPositions[bo+1]-waterPositions[ao+1];
   const longWaveDelta=waterFarHeight(ax,az,oceanTime)-waterFarHeight(bx,bz,oceanTime);
   actualHeightSteps.push(actualDelta);
   shortWaveResiduals.push(actualDelta+longWaveDelta);
   const an=[waterNormals[ao],waterNormals[ao+1],waterNormals[ao+2]],bn=[waterNormals[bo],waterNormals[bo+1],waterNormals[bo+2]];
   normalAngleSteps.push(dotAngle(an,bn));
  };
  for(let vertex=0;vertex<vertexCount;vertex++){
   const row=Math.floor(vertex/grid),col=vertex-row*grid;
   if(col+1<grid)compare(vertex,vertex+1);
   if(row+1<grid)compare(vertex,vertex+grid);
  }
  return {
   boundaryPairs:pairCount,
   actualAdjacentHeightStepMeters:referenceFiniteStats(actualHeightSteps),
   shortWaveSeamResidualMeters:referenceFiniteStats(shortWaveResiduals),
   actualAdjacentNormalAngleRadians:referenceFiniteStats(normalAngleSteps)
  };
 }
 function referenceSolverResidual(){
  const island=land[0],islandIndex=0,errors=[];
  for(let i=0;i<72;i++){
   const angle=i*Math.PI*2/72,cs=Math.cos(angle),sn=Math.sin(angle),radius=shorelineFoamRadius(island,angle,oceanTime,islandIndex,cs,sn);
   if(!Number.isFinite(radius))continue;
   const x=island.x+cs*radius,z=island.z+sn*radius,terrainY=terrainHeightOnIsland(island,x,z)+terrainDeformationAt(islandIndex,x,z);
   errors.push(Math.abs(terrainY-coastalWaterHeight(x,z,oceanTime)));
  }
  return {samples:errors.length,absoluteResidualMeters:referenceFiniteStats(errors)};
 }
 function referenceSnapshot(){
  const panel=document.getElementById('waterShoreDebugPanel'),panelMetrics=panel?panel.querySelector('pre'):null,canvas=document.getElementById('renderCanvas');
  let renderer='no disponible',webglVersion=null;
  try{
   const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
   if(gl){
    webglVersion=(typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext)?'WebGL2':'WebGL1';
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
   }
  }catch(error){renderer='error: '+String(error);}
  const active=window.__elSinNombreWaterDebug||null,target=camera.getTarget();
  return {
   buildVersion:(document.querySelector('meta[name="el-sin-nombre-build"]')||{}).content||'unknown',
   simulationSeconds:Number(oceanTime.toFixed(3)),
   tideMode:Number.isFinite(debugForcedTideOffset)?(debugForcedTideOffset>0?'forced-high':'forced-low'):'natural',
   tideOffsetMeters:Number(tideOffsetAt(oceanTime).toFixed(6)),
   shorelineSolver:referenceSolverResidual(),
   analyticalVsDrawnVertices:referenceSample100(),
   lodBoundary:referenceLodBoundary(),
   camera:{
    name:new URLSearchParams(location.search).get('cam')||'shore',
    position:{x:Number(camera.position.x.toFixed(3)),y:Number(camera.position.y.toFixed(3)),z:Number(camera.position.z.toFixed(3))},
    target:{x:Number(target.x.toFixed(3)),y:Number(target.y.toFixed(3)),z:Number(target.z.toFixed(3))}
   },
   profile:isPerformanceMode?'Rendimiento':'Calidad',
   waterMesh:{
    subdivisions:waterSubdivisions,
    vertices:waterBase.length/3,
    detailRadiusMeters:WATER_DETAIL_RADIUS,
    detailFadeStartMeters:Number(Math.sqrt(WATER_DETAIL_FADE_START_SQ).toFixed(3))
   },
   webgl:{version:webglVersion,renderer},
   waterPanel:{
    settings:active,
    metricsText:panelMetrics?panelMetrics.textContent:null,
    sliders:panel?Array.from(panel.querySelectorAll('input[type="range"]')).map(input=>({label:input.getAttribute('aria-label'),value:Number(input.value)})):[]
   },
   physicalBackwashVelocity:'no implementado',
   fpsAndFrameTimes:{status:'no medidos en CI; medir en Galaxy S26 Ultra mediante ?debug=1'}
  };
 }
 window.__ELSN_WATER_REFERENCE_API__={
  get ready(){
   return !!(firstFrameRendered&&startupAssetsReady&&startScreenShown&&scene&&scene.activeCamera===camera);
  },
  setScenarioFromUrl(){
   const params=new URLSearchParams(location.search),seconds=Math.max(0,Number(params.get('t')||0)),tide=params.get('tide')||'natural',cameraName=params.get('cam')||'shore';
   if(!Number.isFinite(seconds))throw new Error('El instante ?t= debe ser numérico.');
   if(!['high','low','natural'].includes(tide))throw new Error('Marea de prueba no válida: '+tide);
   if(!['shore','mid','lod'].includes(cameraName))throw new Error('Cámara de prueba no válida: '+cameraName);
   const island=land[0];
   onShip=false;
   if(player.root.parent)player.root.parent=null;
   player.root.position.x=island.x;player.root.position.z=island.z;
   player.root.setEnabled(false);
   syncActiveBeachIsland();
   const previousForcedTide=debugForcedTideOffset;
   debugForcedTideOffset=null;
   const referenceShorelineRadius=shorelineFoamRadius(island,0,0,0,1,0);
   debugForcedTideOffset=previousForcedTide;
   const shoreRadius=Number.isFinite(referenceShorelineRadius)?referenceShorelineRadius:island.r;
   const shoreX=island.x+shoreRadius,anchorFallback=!Number.isFinite(referenceShorelineRadius);
   const referenceCameraPresets={
    shore:{position:[shoreX+1.0,2.8,island.z],target:[shoreX-4.0,.30,island.z]},
    mid:{position:[shoreX+35.0,13.0,island.z+8.0],target:[shoreX,.24,island.z]},
    lod:{position:[shoreX+90.0,23.0,island.z],target:[shoreX,.22,island.z]}
   };
   const preset=referenceCameraPresets[cameraName];
   debugForcedTideOffset=tide==='high'?.28:tide==='low'?-.28:null;
   oceanTime=seconds;updateWaterWaveTime(oceanTime);
   camera.position.copyFromFloats(preset.position[0],preset.position[1],preset.position[2]);
   camera.setTarget(v(preset.target[0],preset.target[1],preset.target[2]));
   camera.fov=.78;scene.activeCamera=camera;skyDome.position.copyFrom(camera.position);
   waterFocusX=NaN;waterFocusZ=NaN;waterActiveVertexOffsets=waterActiveVertexStorage.subarray(0,0);
   waterNormals.fill(0);for(let normalIndex=1;normalIndex<waterNormals.length;normalIndex+=3)waterNormals[normalIndex]=1;
   oceanDepthVertexColors.set(oceanDepthBaseColors);
   if(waterNormalBuffer&&waterNormalBuffer.isUpdatable())waterNormalBuffer.updateDirectly(waterNormals,0);
   else ground.updateVerticesData(B.VertexBuffer.NormalKind,waterNormals,false);
   if(waterColorBuffer&&waterColorBuffer.isUpdatable())waterColorBuffer.updateDirectly(oceanDepthVertexColors,0);
   else ground.updateVerticesData(B.VertexBuffer.ColorKind,oceanDepthVertexColors,false);
   syncActiveTidalFoamIsland();syncNordicWaterReflectionIsland();
   for(const foam of tidalFoamMeshes){foam.lastShoreline.fill(NaN);foam.retreatResidue.fill(0);foam.foamCenter.fill(NaN);}
   waterAccumulator=waterVertexStep;waterFarAccumulator=waterFarStep;waterNormalAccumulator=waterNormalStep;tidalFoamAccumulator=TIDAL_FOAM_UPDATE_STEP;
   refreshWaterDetailRegion();
   animateWater(0);scene.activeCamera=camera;
   gameStarted=false;startScreenShown=true;
   document.body.classList.remove('booting','boot-failed','intro-open');
   if(introOverlay){introOverlay.classList.remove('open');introOverlay.style.setProperty('display','none','important');}
   const loading=document.getElementById('loading');if(loading)loading.style.setProperty('display','none','important');
   const modal=document.getElementById('modal');if(modal)modal.style.setProperty('display','none','important');
   if(window.__elSinNombreWaterDebugRefresh)window.__elSinNombreWaterDebugRefresh();
   return referenceSnapshot();
  },
  snapshot:referenceSnapshot,
  shorelineAnchorFallback:()=>anchorFallback
 };
}
`;

html = replaceExactlyOnce(html, 'engine.runRenderLoop(()=>{', testApi + '\nengine.runRenderLoop(()=>{', 'test runtime API');
await fs.writeFile(file, html, 'utf8');
console.log('Preparación CI aplicada solo a dist/index.html; no se modifica el código fuente del juego.');
