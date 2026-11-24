import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.FAUNA_TEST_URL || process.env.INSPECTOR_TEST_URL || 'http://127.0.0.1:4175/';
const SKINNING_MODE = String(process.env.FAUNA_SKINNING_MODE || 'cpu').toLowerCase();
if (!['cpu', 'gpu'].includes(SKINNING_MODE)) throw new Error('FAUNA_SKINNING_MODE must be cpu or gpu.');
const OUT = path.resolve(process.env.FAUNA_CAPTURE_OUTPUT || 'artifacts/fauna-visual-captures');
const VIEWPORT = { width: 1600, height: 900 };
const FAUNA_ROSTER_TIMEOUT_MS = 240000;
const FAUNA_CAPTURE_MAX_RUNTIME_MS = 22 * 60 * 1000;
const FAUNA_PAGE_EVALUATE_TIMEOUT_MS = 90000;
const FAUNA_HEAVY_EVALUATION_TIMEOUT_MS = 120000;
const captureStartedAt = Date.now();
const ANGLES = [
  { id: 'front', degrees: 0 },
  { id: 'right', degrees: 90 },
  { id: 'rear', degrees: 180 },
  { id: 'left', degrees: 270 }
];
const manifest = {
  schema: 1, capturedAt: new Date().toISOString(), finishedAt: null,
  gameVersion: null, renderer: 'Chromium headless + ANGLE SwiftShader',
  skinningAcceptance: SKINNING_MODE.toUpperCase() + ' skinning explicitly forced in touch emulation; SwiftShader visual diagnosis only, not a physical-device performance measurement',
  viewport: VIEWPORT, readOnlySceneCapture: true, startup: null,
  readiness: null, scene: null, fauna: [], captures: [],
  warnings: [], failures: [], consoleErrors: [], pageErrors: [], verdict: 'incomplete',
  progress: {stage:'queued',elapsedMs:0,updatedAt:new Date().toISOString()}, currentCapture:null
};
const round = (value, digits = 4) =>
  Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const vector = value => value ? {x:round(value.x),y:round(value.y),z:round(value.z)} : null;
function logProgress(stage, detail = '') {
  const elapsedMs = Date.now() - captureStartedAt;
  console.log('[FAUNA_PROGRESS] ' + JSON.stringify({stage,elapsedMs,detail}));
}
function setStage(stage, detail = '') {
  manifest.progress = {stage,elapsedMs:Date.now()-captureStartedAt,updatedAt:new Date().toISOString()};
  saveManifest();
  logProgress(stage,detail);
}
function assertCaptureDeadline(stage) {
  const elapsedMs = Date.now()-captureStartedAt;
  if (elapsedMs > FAUNA_CAPTURE_MAX_RUNTIME_MS) {
    throw new Error('[FAUNA_CAPTURE_DEADLINE] ' + stage + ' exceeded ' +
      FAUNA_CAPTURE_MAX_RUNTIME_MS + ' ms; elapsed=' + elapsedMs +
      ' ms; lastCapture=' + JSON.stringify(manifest.currentCapture));
  }
}
async function evaluateWithTimeout(page, pageFunction, arg, label, timeoutMs = FAUNA_PAGE_EVALUATE_TIMEOUT_MS) {
  assertCaptureDeadline(label);
  let timer = null;
  const evaluation = arg === undefined ? page.evaluate(pageFunction) : page.evaluate(pageFunction,arg);
  try {
    return await Promise.race([
      evaluation,
      new Promise((_,reject) => {
        timer = setTimeout(() => reject(new Error('[FAUNA_EVALUATE_TIMEOUT] ' + label +
          ' exceeded ' + timeoutMs + ' ms; lastCapture=' + JSON.stringify(manifest.currentCapture))),timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function saveManifest() {
  fs.mkdirSync(OUT,{recursive:true});
  const target=path.join(OUT,'manifest.json'),temporary=target+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(manifest,null,2)+'\n');
  fs.renameSync(temporary,target);
}
async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try {
    setStage('launching-browser','Chromium headless + SwiftShader');
    browser=await chromium.launch({headless:true,timeout:60000,args:[
      '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-webgl2',
      '--ignore-gpu-blocklist','--disable-dev-shm-usage','--force-color-profile=srgb'
    ]});
    const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,ignoreHTTPSErrors:true,hasTouch:true});
    const page=await context.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    await page.addInitScript(({mode})=>{
      // The same scene can be captured in CPU and GPU skinning modes for a controlled A/B.
      window.__ELSN_FORCE_CPU_SKINNING__=mode==='cpu';
      window.__ELSN_FORCE_GPU_SKINNING__=mode==='gpu';
      let babylonValue=null;
      const hook=B=>{
        try{
          if(!B?.Scene?.prototype||B.Scene.prototype.__elsnFaunaCaptureHook)return;
          const render=B.Scene.prototype.render;
          Object.defineProperty(B.Scene.prototype,'__elsnFaunaCaptureHook',{value:true});
          B.Scene.prototype.render=function(...args){
            window.__ELSN_FAUNA_CAPTURE_SCENE__=this;
            window.__ELSN_FAUNA_CAPTURE_BABYLON__=B;
            return render.apply(this,args);
          };
        }catch(_){}
      };
      try{
        Object.defineProperty(window,'BABYLON',{
          configurable:true,enumerable:true,
          get(){return babylonValue;},
          set(value){babylonValue=value;hook(value);}
        });
      }catch(_){}
    }, {mode:SKINNING_MODE});
    page.on('pageerror',error=>manifest.pageErrors.push(String(error?.stack||error)));
    page.on('console',message=>{if(message.type()==='error')manifest.consoleErrors.push(message.text());});

    const navigationStarted=Date.now();
    setStage('loading-built-release',BASE_URL);
    await page.goto(BASE_URL+'?test=1&fauna-inspector=1',{waitUntil:'domcontentloaded',timeout:90000});
    logProgress('release-html-loaded','domcontentloaded');
    const audioGate=page.locator('#audioGateStart');
    if(await audioGate.isVisible().catch(()=>false))await audioGate.click();
    await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});
    await page.locator('#continueUnnamed').click();
    const faunaWaitStarted=Date.now();
    setStage('waiting-for-complete-world-startup','worldReady resource barrier; maximum 240 s');
    try {
      await page.waitForFunction(()=>{
        // Only the complete startup barrier is authoritative; actor roots can exist while
        // the fauna loader, native rigs, audio and shader warm-up are still incomplete.
        return window.__elSinNombreStartupSmoke?.worldReady===true||
          document.body.classList.contains('boot-failed');
      },undefined,{timeout:FAUNA_ROSTER_TIMEOUT_MS,polling:250});
      logProgress('complete-world-startup-ready','worldReady=true');
    } catch(error) {
      manifest.warnings.push({code:'startup-did-not-reach-fauna-roster',message:String(error?.message||error)});
    }
    setStage('collecting-startup-diagnostics');
    manifest.startupDiagnostic=await evaluateWithTimeout(page,()=>{
      const safe=(fn,fallback=null)=>{try{return fn();}catch(_){return fallback;}};
      const B=window.BABYLON||null,scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||B?.EngineStore?.LastCreatedScene||null;
      const roots=scene?(scene.transformNodes||[]).filter(node=>
        /^(?:WildlifeActor_(?:deer|stag|wolf)_\d+|RealSeagullActor_\d+)$/.test(String(node?.name||''))&&!node.isDisposed?.()
      ): [];
      const world=typeof window.getGameWorldInspectionSnapshot==='function'
        ?safe(()=>window.getGameWorldInspectionSnapshot({includeMeshes:false,maxActors:200}),null):null;
      return {
        worldReady:window.__elSinNombreStartupSmoke?.worldReady===true,
        bootFailed:document.body.classList.contains('boot-failed'),bodyClass:document.body.className,
        loadText:document.getElementById('loadText')?.textContent||null,
        progress:{
          percent:document.getElementById('elsnStartupProgressPercent')?.textContent||null,
          stage:document.getElementById('elsnStartupProgressStage')?.textContent||null,
          action:document.getElementById('elsnStartupProgressAction')?.textContent||null,
          elapsed:document.getElementById('elsnStartupProgressElapsed')?.textContent||null,
          trackWidth:document.getElementById('loadProgressBar')?.style.width||null
        },
        recorder:window.__elSinNombreStartupSmoke||null,
        resourceGate:window.__ELSN_STARTUP_RESOURCE_GATE__||null,
        scene:scene?{
          meshCount:scene.meshes?.length||0,transformNodeCount:scene.transformNodes?.length||0,
          materialCount:scene.materials?.length||0,textureCount:scene.textures?.length||0,
          pendingTextures:(scene.textures||[]).filter(texture=>safe(()=>texture.isReady?.(),false)===false).length,
          animationGroupCount:scene.animationGroups?.length||0,
          waitingItems:safe(()=>scene.getWaitingItemsCount?.(),null),
          fps:safe(()=>scene.getEngine?.().getFps?.(),null)
        }:null,
        faunaReadiness:safe(()=>window.__ELSN_WILDLIFE_DIAGNOSTICS__?.getSnapshot?.(),null),
        actorRoots:roots.map(root=>({
          name:String(root.name||''),enabled:safe(()=>root.isEnabled?.(),null),
          position:root.position?{x:root.position.x,y:root.position.y,z:root.position.z}:null,
          meshCount:safe(()=>root.getChildMeshes?.(false)?.length,0)
        })),
        landInventory:world?.actors?.wildlife?.returned||[],
        birdInventory:world?.actors?.ambientBirds?.returned||[]
      };
    },undefined,'startup-diagnostics',60000);
    manifest.startup={
      worldReady:manifest.startupDiagnostic.worldReady,
      bootFailed:manifest.startupDiagnostic.bootFailed,
      durationMs:Date.now()-navigationStarted,
      waitedMs:Date.now()-faunaWaitStarted
    };
    manifest.gameVersion=await page.evaluate(()=>document.querySelector('meta[name="el-sin-nombre-build"]')?.content||null);
    manifest.readiness=manifest.startupDiagnostic.faunaReadiness;
    manifest.cameraTextureReadiness=manifest.startup.worldReady
      ?await evaluateWithTimeout(page,()=>window.__ELSN_TEST__?.prepareCaptureFrame?window.__ELSN_TEST__.prepareCaptureFrame({timeoutMs:60000}):null,undefined,'camera-and-texture-readiness',75000)
      :null;
    if(!manifest.startup.worldReady||manifest.startup.bootFailed||manifest.startupDiagnostic.resourceGate?.ready===false){
      const blocker={
        worldReady:manifest.startup.worldReady,
        bootFailed:manifest.startup.bootFailed,
        bodyClass:manifest.startupDiagnostic.bodyClass,
        progress:manifest.startupDiagnostic.progress,
        resourceGate:manifest.startupDiagnostic.resourceGate,
        scene:manifest.startupDiagnostic.scene,
        faunaReadiness:manifest.startupDiagnostic.faunaReadiness
      };
      await page.screenshot({path:path.join(OUT,'startup-stalled-before-world-ready.png'),fullPage:true}).catch(()=>{});
      manifest.verdict='startup-stalled-before-world-ready';
      manifest.failures.push('La captura visual se bloquea: el arranque no alcanzó worldReady con la barrera de recursos completa. '+JSON.stringify(blocker));
      saveManifest();
      throw new Error('No se permite aceptar fauna ni capturas mientras el juego siga en booting o la barrera de recursos no esté lista: '+JSON.stringify(blocker));
    }
    if(manifest.startup.worldReady){
      setStage('entering-read-only-gameplay-for-fauna-capture');
      await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});
      await page.locator('#newGameChoice').waitFor({state:'visible',timeout:30000});
      await page.locator('#newGameChoice').click();
      await page.waitForFunction(()=>document.body.classList.contains('game-running'),undefined,{timeout:30000,polling:100});
    }
    setStage('measuring-live-fauna-rigs-and-bounds');
    const initial=await evaluateWithTimeout(page,()=>{
      const scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||window.__ELSN_FAUNA_CAPTURE_BABYLON__?.EngineStore?.LastCreatedScene||window.BABYLON?.EngineStore?.LastCreatedScene;
      const api=window.__ELSN_TEST__;
      if(!scene)return {build:api?.build||null,scene:null,gameWildlife:[],expectedWildlifeCount:0,expectedBirdCount:0,fauna:[]};
      const number=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(4)):null;
      const vec=value=>value?{x:number(value.x),y:number(value.y),z:number(value.z)}:null;
      const gameDiagnostics=typeof window.getGameHealthDebug==='function'?window.getGameHealthDebug():null;
      const ancestorsContain=(node,root)=>{
        let current=node,depth=0;
        while(current&&depth++<48){if(current===root)return true;current=current.parent;}
        return false;
      };
      const worldSnapshot=typeof window.getGameWorldInspectionSnapshot==='function'?window.getGameWorldInspectionSnapshot({includeMeshes:false,maxActors:200}):null;
      const birdDiagnostics=worldSnapshot?.actors?.ambientBirds?.returned||[];
      const actors=(scene.transformNodes||[]).filter(node=>
        (/^WildlifeActor_(?:deer|stag|wolf)_\d+$/.test(String(node?.name||''))||/^RealSeagullActor_\d+$/.test(String(node?.name||'')))&&!node.isDisposed?.()
      );
      const fauna=actors.map(root=>{
        const isBird=/^RealSeagullActor_\d+$/.test(String(root?.name||''));
        root.computeWorldMatrix?.(true);
        const meshes=(root.getChildMeshes?.(false)||[]).filter(mesh=>
          mesh&&!mesh.isDisposed?.()&&Number(mesh.getTotalVertices?.())>0
        );
        const skeletons=new Set();
        const materials=new Map(),textures=new Map();
        let min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
        let totalVertices=0,totalIndices=0,skinnedVertices=0,visibleMeshCount=0;
        const meshRows=meshes.map(mesh=>{
          mesh.computeWorldMatrix?.(true);
          const bounds=mesh.getBoundingInfo?.()?.boundingBox;
          const vertices=Number(mesh.getTotalVertices?.())||0;
          const indices=Number(mesh.getTotalIndices?.())||0;
          const skinned=!!mesh.skeleton&&Number(mesh.numBoneInfluencers)>0;
          let lo=bounds?.minimumWorld||null,hi=bounds?.maximumWorld||null;
          let localMin=bounds?.minimum||null,localMax=bounds?.maximum||null;
          let boundsBasis='babylon-native-world';
          if(skinned){
            // Measure the original bind-pose vertex buffer through the exact bone
            // matrices used by Babylon's shader. Never feed already CPU-deformed
            // positions back through the skeleton (that would skin twice).
            const B=window.BABYLON;
            const positions=typeof mesh.setPositionsForCPUSkinning==='function'
              ?mesh.setPositionsForCPUSkinning()
              :mesh.getVerticesData?.(B?.VertexBuffer?.PositionKind||'position');
            const indices=mesh.getVerticesData?.(B?.VertexBuffer?.MatricesIndicesKind||'matricesIndices');
            const weights=mesh.getVerticesData?.(B?.VertexBuffer?.MatricesWeightsKind||'matricesWeights');
            const extras=Number(mesh.numBoneInfluencers)>4;
            const indicesExtra=extras?mesh.getVerticesData?.(B?.VertexBuffer?.MatricesIndicesExtraKind||'matricesIndicesExtra'):null;
            const weightsExtra=extras?mesh.getVerticesData?.(B?.VertexBuffer?.MatricesWeightsExtraKind||'matricesWeightsExtra'):null;
            mesh.skeleton?.prepare?.(true);
            const bones=mesh.skeleton?.getTransformMatrices?.(mesh);
            const world=mesh.getWorldMatrix?.(),wm=world?.m;
            if(!positions||positions.length<3||!indices||!weights||!bones||bones.length<16||!wm||wm.length<16||
               (extras&&(!indicesExtra||!weightsExtra))){
              throw new Error('Faltan buffers o matrices de skinning para medir '+String(mesh.name||mesh.id||'malla esqueletizada')+'.');
            }
            localMin={x:Infinity,y:Infinity,z:Infinity};
            localMax={x:-Infinity,y:-Infinity,z:-Infinity};
            lo={x:Infinity,y:Infinity,z:Infinity};hi={x:-Infinity,y:-Infinity,z:-Infinity};
            const influences=extras?8:4;
            for(let p=0,vertex=0;p+2<positions.length;p+=3,vertex++){
              const x=Number(positions[p]),y=Number(positions[p+1]),z=Number(positions[p+2]);
              if(![x,y,z].every(Number.isFinite))throw new Error('Vértice original no finito en '+String(mesh.name||mesh.id||'malla esqueletizada')+'.');
              localMin.x=Math.min(localMin.x,x);localMin.y=Math.min(localMin.y,y);localMin.z=Math.min(localMin.z,z);
              localMax.x=Math.max(localMax.x,x);localMax.y=Math.max(localMax.y,y);localMax.z=Math.max(localMax.z,z);
              let sx=0,sy=0,sz=0,sw=0,active=0;
              for(let slot=0;slot<influences;slot++){
                const idata=slot<4?indices:indicesExtra,wdata=slot<4?weights:weightsExtra,at=vertex*4+(slot%4);
                const weight=Number(wdata?.[at]||0);if(!(weight>0))continue;
                const joint=Math.floor(Number(idata?.[at])),offset=joint*16;
                if(!Number.isFinite(joint)||joint<0||offset+15>=bones.length)throw new Error('Índice de hueso inválido en '+String(mesh.name||mesh.id||'malla esqueletizada')+'.');
                sx+=weight*(bones[offset]*x+bones[offset+4]*y+bones[offset+8]*z+bones[offset+12]);
                sy+=weight*(bones[offset+1]*x+bones[offset+5]*y+bones[offset+9]*z+bones[offset+13]);
                sz+=weight*(bones[offset+2]*x+bones[offset+6]*y+bones[offset+10]*z+bones[offset+14]);
                sw+=weight*(bones[offset+3]*x+bones[offset+7]*y+bones[offset+11]*z+bones[offset+15]);active++;
              }
              if(!active)continue;
              if(!Number.isFinite(sw)||Math.abs(sw)<1e-10)throw new Error('Pesos de skinning inválidos en '+String(mesh.name||mesh.id||'malla esqueletizada')+'.');
              const x1=sx/sw,y1=sy/sw,z1=sz/sw,ww=wm[3]*x1+wm[7]*y1+wm[11]*z1+wm[15];
              if(!Number.isFinite(ww)||Math.abs(ww)<1e-10)throw new Error('Matriz mundial inválida en '+String(mesh.name||mesh.id||'malla esqueletizada')+'.');
              const iw=1/ww,point={x:(wm[0]*x1+wm[4]*y1+wm[8]*z1+wm[12])*iw,y:(wm[1]*x1+wm[5]*y1+wm[9]*z1+wm[13])*iw,z:(wm[2]*x1+wm[6]*y1+wm[10]*z1+wm[14])*iw};
              if(![point.x,point.y,point.z].every(Number.isFinite))throw new Error('Transformación no finita en '+String(mesh.name||mesh.id||'malla esqueletizada')+'.');
              lo.x=Math.min(lo.x,point.x);lo.y=Math.min(lo.y,point.y);lo.z=Math.min(lo.z,point.z);
              hi.x=Math.max(hi.x,point.x);hi.y=Math.max(hi.y,point.y);hi.z=Math.max(hi.z,point.z);
            }
            boundsBasis='babylon-bone-matrices-world';
          }
          if(lo&&hi){
            min.x=Math.min(min.x,lo.x);min.y=Math.min(min.y,lo.y);min.z=Math.min(min.z,lo.z);
            max.x=Math.max(max.x,hi.x);max.y=Math.max(max.y,hi.y);max.z=Math.max(max.z,hi.z);
          }
          totalVertices+=vertices;totalIndices+=indices;
          if(skinned)skinnedVertices+=vertices;
          if(mesh.isVisible!==false&&mesh.isEnabled?.()!==false&&Number(mesh.visibility??1)>0)visibleMeshCount++;
          if(mesh.skeleton)skeletons.add(mesh.skeleton);
          if(mesh.material){
            materials.set(mesh.material.uniqueId??mesh.material.name,mesh.material);
            for(const texture of mesh.material.getActiveTextures?.()||[])textures.set(texture.uniqueId??texture.name,texture);
          }
          const local=localMin&&localMax?{
            min:{x:number(localMin.x),y:number(localMin.y),z:number(localMin.z)},
            max:{x:number(localMax.x),y:number(localMax.y),z:number(localMax.z)}
          }:null;
          return {
            name:String(mesh.name||mesh.id||''),vertices,indices,skinned,
            skeleton:mesh.skeleton?.name||null,alwaysSelectAsActiveMesh:mesh.alwaysSelectAsActiveMesh===true,enabled:mesh.isEnabled?.()!==false,
            visible:mesh.isVisible!==false,visibility:number(mesh.visibility??1),
            material:mesh.material?.name||null,localBounds:local,
            worldBounds:lo&&hi?{min:{x:number(lo.x),y:number(lo.y),z:number(lo.z)},max:{x:number(hi.x),y:number(hi.y),z:number(hi.z)},basis:boundsBasis}:null,
            parentChain:(()=>{const rows=[];let node=mesh;while(node&&rows.length<8){rows.push({name:String(node.name||''),type:node.getClassName?.()||node.constructor?.name||'',parent:String(node.parent?.name||''),position:vec(node.position),scaling:vec(node.scaling)});node=node.parent;}return rows;})()
          };
        });
        const isDescendant=node=>ancestorsContain(node,root);
        const animationGroups=(scene.animationGroups||[]).filter(group=>
          (group.targetedAnimations||[]).some(entry=>{
            const target=entry.target?.getTransformNode?.()||entry.target;
            return isDescendant(target);
          })
        ).map(group=>({
          name:String(group.name||''),isPlaying:!!group.isPlaying,
          from:number(group.from),to:number(group.to),speedRatio:number(group.speedRatio),
          targetedAnimations:(group.targetedAnimations||[]).length
        }));
        const bones=new Set();
        for(const skeleton of skeletons)for(const bone of skeleton.bones||[])bones.add(bone);
        const textureRows=[...textures.values()].map(texture=>{
          const size=texture.getSize?.()||{};
          return {
            name:String(texture.name||''),url:texture.url||null,
            ready:typeof texture.isReady==='function'?!!texture.isReady():null,
            width:size.width||null,height:size.height||null
          };
        });
        const position=root.getAbsolutePosition?.()||root.position;
        const validBounds=Number.isFinite(min.x)&&Number.isFinite(max.x);
        const dimensions=validBounds?{width:number(max.x-min.x),height:number(max.y-min.y),depth:number(max.z-min.z)}:null;
        const kind=isBird?'gull':(String(root.name).split('_')[1]||'unknown');
        const index=Number(String(root.name).split('_').at(-1));
        const actorDiagnostic=isBird
          ? (birdDiagnostics.find(item=>item.name===String(root.name))||birdDiagnostics[index]||null)
          : ((gameDiagnostics?.wildlife||[]).find(item=>item.kind===kind&&item.island===0)||null);
        return {
          id:String(root.name),index,kind,role:isBird?'ambient-bird':'wildlife',islandIndex:actorDiagnostic?.island??null,
          position:vec(position),rotation:vec(root.rotation),scaling:vec(root.scaling),
          bounds:validBounds?{min:vec(min),max:vec(max),dimensions}:null,
          sourceDimensions:actorDiagnostic?.dimensions||null,
          meshCount:meshes.length,visibleMeshCount,totalVertices,totalIndices,skinnedVertices,
          skeletonCount:skeletons.size,boneCount:bones.size,
          skeletons:[...skeletons].map(skeleton=>({
            name:String(skeleton.name||''),boneCount:(skeleton.bones||[]).length,
            transformNode:String(skeleton.transformNode?.name||skeleton._transformNode?.name||'')||null,
            roots:(skeleton.bones||[]).filter(bone=>!bone.getParent?.()).map(bone=>String(bone.name||'')),
            sampleBones:(skeleton.bones||[]).slice(0,12).map(bone=>({
              name:String(bone.name||''),parent:String(bone.getParent?.()?.name||'')||null,
              linkedNode:String(bone.getTransformNode?.()?.name||bone._linkedTransformNode?.name||'')||null,
              linkedParent:String(bone.getTransformNode?.()?.parent?.name||bone._linkedTransformNode?.parent?.name||'')||null
            }))
          })),
          flightRig:isBird?(actorDiagnostic?.flightRig||null):null,
          activeMode:actorDiagnostic?.activeMode||null,
          meshNames:meshRows.map(row=>row.name),meshes:meshRows,
          materials:[...materials.values()].map(material=>({name:String(material.name||''),type:material.getClassName?.()||material.constructor?.name||'unknown'})),
          textures:textureRows,animation:actorDiagnostic?.animation||null,animationGroups
        };
      });
      return {
        build:api?.build||null,
        scene:{meshCount:scene.meshes?.length||0,transformNodeCount:scene.transformNodes?.length||0},
        gameWildlife:typeof window.getGameHealthDebug==='function'?window.getGameHealthDebug()?.wildlife||[]:[],
        expectedWildlifeCount:Number(worldSnapshot?.actors?.wildlife?.count)||0,
        expectedBirdCount:Number(worldSnapshot?.actors?.ambientBirds?.count)||0,
        fauna
      };
    },undefined,'live-fauna-rig-analysis',FAUNA_HEAVY_EVALUATION_TIMEOUT_MS);
    manifest.scene=initial.scene;
    manifest.gameWildlife=initial.gameWildlife;
    manifest.fauna=initial.fauna;
    if(!manifest.fauna.length){
      manifest.verdict='startup-stalled-before-fauna-actors';
      manifest.failures.push('No se encontraron actores de fauna en la escena; el estado de arranque y la captura de pantalla quedaron guardados para localizar la dependencia bloqueada.');
      saveManifest();
      throw new Error('No se encontró fauna montada. Estado de arranque: '+JSON.stringify(manifest.startupDiagnostic));
    }
    const landAnimals=manifest.fauna.filter(animal=>animal.role!=='ambient-bird');
    const birds=manifest.fauna.filter(animal=>animal.role==='ambient-bird');
    const expected=Number(manifest.readiness?.requested||initial.expectedWildlifeCount||landAnimals.length);
    const readinessLoaded=Number(manifest.readiness?.loaded);
    const loaded=manifest.startup.worldReady&&Number.isFinite(readinessLoaded)?readinessLoaded:landAnimals.length;
    if(expected!==landAnimals.length||(manifest.startup.worldReady&&expected!==loaded))manifest.warnings.push({
      code:'fauna-count-mismatch',requested:expected,loaded,sceneActors:landAnimals.length,
      source:manifest.startup.worldReady?'startup-resource-gate':'live-scene-inventory'
    });
    const expectedBirds=Number(initial.expectedBirdCount||birds.length);
    if(expectedBirds!==birds.length)manifest.warnings.push({
      code:'gull-count-mismatch',requested:expectedBirds,loaded:birds.length
    });
    for(const animal of manifest.fauna){
      if(animal.role!=='ambient-bird'){
        const unprotectedSkinnedMeshes=(animal.meshes||[]).filter(mesh=>mesh.skinned&&mesh.alwaysSelectAsActiveMesh!==true);
        if(unprotectedSkinnedMeshes.length)manifest.warnings.push({
          code:'skinned-mesh-frustum-culling-enabled',animal:animal.id,
          meshes:unprotectedSkinnedMeshes.map(mesh=>({name:mesh.name,vertices:mesh.vertices,bounds:mesh.worldBounds}))
        });
      }
      const d=animal.bounds?.dimensions;
      const horizontalMin=d?Math.min(d.width,d.depth):null;
      const horizontalMax=d?Math.max(d.width,d.depth):null;
      const maxExtent=d?Math.max(d.width,d.height,d.depth):0;
      // A complete quadruped must have plausible depth as well as width. A long pair of
      // antlers/legs can inflate the maximum extent while the torso itself is missing.
      const minimumBodyDepth=d?Math.max(.16,d.height*.30):null;
      if(!d||!(horizontalMax>.1)||(animal.role==='ambient-bird'?!(maxExtent>.1&&maxExtent<=1.0):(!(d.height>.1)||!(horizontalMin>=minimumBodyDepth))))manifest.warnings.push({code:'invalid-world-bounds',animal:animal.id,bounds:animal.bounds,minimumBodyDepth});
      if(animal.role!=='ambient-bird'&&d&&horizontalMin<d.height*.30)manifest.warnings.push({code:'extremely-narrow-world-silhouette',animal:animal.id,dimensions:d,minimumBodyDepth});
      if(animal.visibleMeshCount<1)manifest.warnings.push({code:'no-visible-meshes',animal:animal.id});
      if(animal.role==='ambient-bird'){
        if(!animal.flightRig?.complete)manifest.warnings.push({code:'gull-flight-rig-incomplete',animal:animal.id,flightRig:animal.flightRig});
        if(animal.flightRig?.complete&&!animal.flightRig.animationPlaying)manifest.warnings.push({code:'gull-flight-animation-stopped',animal:animal.id,flightRig:animal.flightRig});
        if(!/fly/i.test(String(animal.flightRig?.animationGroupName||'')))manifest.warnings.push({code:'gull-native-flight-clip-missing',animal:animal.id,flightRig:animal.flightRig});
        if(Number(animal.flightRig?.targetedAnimations)<100)manifest.warnings.push({code:'gull-native-flight-tracks-incomplete',animal:animal.id,flightRig:animal.flightRig});
      }else if(animal.skinnedVertices<600||animal.boneCount<12)manifest.warnings.push({
        code:'weak-skinning-or-rig',animal:animal.id,skinnedVertices:animal.skinnedVertices,boneCount:animal.boneCount
      });
      if(!animal.animationGroups.length)manifest.warnings.push({code:animal.role==='ambient-bird'?'gull-animation-group-missing':'no-linked-animation-groups',animal:animal.id});
      if(!animal.materials.length)manifest.warnings.push({
        code:'missing-materials',animal:animal.id,meshNames:animal.meshNames
      });
      if(animal.textures.some(texture=>texture.ready===false||texture.ready===null))manifest.warnings.push({
        code:'texture-readiness-review',animal:animal.id,textures:animal.textures
      });
    }
    saveManifest();

    const captureCapabilities=await page.evaluate(()=>({
      apiReady:!!window.__ELSN_TEST__?.render&&!!window.__ELSN_TEST__?.captureCanvas,
      sceneReady:!!(window.__ELSN_FAUNA_CAPTURE_SCENE__||window.BABYLON?.EngineStore?.LastCreatedScene),
      canvasReady:!!document.getElementById('renderCanvas')
    }));
    manifest.captureMode=captureCapabilities.apiReady?'game-test-api':'temporary-babylon-camera';
    if(!captureCapabilities.sceneReady||!captureCapabilities.canvasReady){
      manifest.verdict='scene-not-created-before-fauna-inspection';
      manifest.warnings.push({code:'fauna-scene-unavailable',capabilities:captureCapabilities});
      saveManifest();
      throw new Error('Babylon todavía no ha creado una escena/canvas utilizable: '+JSON.stringify(captureCapabilities)+' · '+JSON.stringify(manifest.startupDiagnostic));
    }
    setStage('capturing-four-verified-views','actors='+manifest.fauna.length+'; viewsPerActor='+ANGLES.length);
    for(const animal of manifest.fauna){
      assertCaptureDeadline('before actor '+animal.id);
      logProgress('actor-capture-started',animal.id);
      for(const angle of ANGLES){
        assertCaptureDeadline('before view '+animal.id+'/'+angle.id);
        manifest.currentCapture={animalId:animal.id,angle:angle.id,startedAt:new Date().toISOString()};
        manifest.progress={stage:'capturing-'+animal.id+'-'+angle.id,elapsedMs:Date.now()-captureStartedAt,updatedAt:new Date().toISOString()};
        saveManifest();
        logProgress('view-capture-started',animal.id+'/'+angle.id);
        const view=await evaluateWithTimeout(page,async({animalId,angleDegrees,measuredBounds})=>{
          const api=window.__ELSN_TEST__,scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||window.BABYLON?.EngineStore?.LastCreatedScene;
          const number=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(4)):null;
          const ancestorsContain=(node,root)=>{let current=node,depth=0;while(current&&depth++<48){if(current===root)return true;current=current.parent;}return false;};
          const root=scene?.getTransformNodeByName?.(animalId);
          if(!scene||!root)throw new Error('No se encuentra la escena o el actor de fauna para capturar: '+animalId+' · api='+!!api);
          root.computeWorldMatrix?.(true);
          const meshes=root.getChildMeshes?.(false)||[];
          const min=measuredBounds?.min,max=measuredBounds?.max;
          if(!min||!max||![min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isFinite))
            throw new Error('No hay límites anatómicos esqueletizados válidos para encuadrar '+animalId);
          const target={x:(min.x+max.x)/2,y:(min.y+max.y)/2,z:(min.z+max.z)/2};
          const width=max.x-min.x,depth=max.z-min.z,height=max.y-min.y;
          const isBird=/^RealSeagullActor_\d+$/.test(animalId);
          const radius=Math.max(isBird?1.15:2.8,width*1.8,depth*1.8,height*2.0);
          const yaw=Number(root.rotation?.y)||0;
          const radians=yaw+angleDegrees*Math.PI/180;
          const camera={
            x:target.x+Math.sin(radians)*radius,
            y:target.y+Math.max(.35,height*.36),
            z:target.z+Math.cos(radians)*radius,
            targetX:target.x,targetY:target.y,targetZ:target.z
          };
          const hidden=[];
          for(const other of scene.transformNodes||[]){
            if(other!==root&&(/^(?:WildlifeActor_(?:deer|stag|wolf)_\d+|RealSeagullActor_\d+)$/.test(String(other?.name||'')))){
              const wasEnabled=other.isEnabled?.()!==false;
              if(wasEnabled){other.setEnabled(false);hidden.push(other);}
            }
          }
          let readback=null,cameraVerified=false,png=null,bindPosePng=null,imageIntegrity=null,temporaryCamera=null,previousCamera=null,previousActiveCameras=null;
          try{
            const B=window.BABYLON,canvas=document.getElementById('renderCanvas');
            if(!B?.UniversalCamera||!canvas)throw new Error('No se puede crear una cámara temporal Babylon para una captura visual aislada.');
            previousCamera=scene.activeCamera;
            previousActiveCameras=scene.activeCameras;
            temporaryCamera=new B.UniversalCamera('FaunaInspectorTemporaryCamera',new B.Vector3(camera.x,camera.y,camera.z),scene);
            temporaryCamera.setTarget(new B.Vector3(camera.targetX,camera.targetY,camera.targetZ));
            if(previousCamera){
              temporaryCamera.fov=Number(previousCamera.fov)||temporaryCamera.fov;
              temporaryCamera.minZ=Number(previousCamera.minZ)||temporaryCamera.minZ;
              temporaryCamera.maxZ=Number(previousCamera.maxZ)||temporaryCamera.maxZ;
              temporaryCamera.layerMask=Number(previousCamera.layerMask)||temporaryCamera.layerMask;
            }
            // Babylon renders activeCameras instead of activeCamera when the array is non-empty.
            // Clear that list for this isolated capture, otherwise the screenshot can silently
            // show the player's camera while a readback of the unused temporary camera passes.
            scene.activeCameras=[];
            scene.activeCamera=temporaryCamera;
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const cameraOwnsRender=()=>scene.activeCamera===temporaryCamera&&
              (!Array.isArray(scene.activeCameras)||scene.activeCameras.length===0);
            if(!cameraOwnsRender())throw new Error('Babylon no está renderizando con la cámara temporal del animal: '+JSON.stringify({
              activeCamera:scene.activeCamera?.name||null,
              activeCameras:(scene.activeCameras||[]).map(item=>String(item?.name||'')),
              expected:temporaryCamera.name
            }));
            const captureFrame=()=>{
              if(api?.render&&api?.captureCanvas){api.render();return api.captureCanvas();}
              scene.render();return canvas.toDataURL('image/png');
            };
            // Render the visible subject exactly once, then verify the active camera
            // against the frame just captured. The prior implementation rendered once
            // for verification and immediately rendered the same view again for PNG.
            png=captureFrame();
            const activeCamera=scene.activeCamera;
            const actualPosition=activeCamera?.position;
            const capturedTarget=activeCamera?.getTarget?.();
            readback={
              camera:actualPosition?{x:actualPosition.x,y:actualPosition.y,z:actualPosition.z}:null,
              target:capturedTarget?{x:capturedTarget.x,y:capturedTarget.y,z:capturedTarget.z}:null,
              source:'active-babylon-camera',
              cameraName:activeCamera?.name||null
            };
            const actual=readback?.camera||null,verifiedTarget=readback?.target||null;
            const near=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=.20;
            cameraVerified=cameraOwnsRender()&&!!actual&&!!verifiedTarget&&
              near(actual.x,camera.x)&&near(actual.y,camera.y)&&near(actual.z,camera.z)&&
              near(verifiedTarget.x,camera.targetX)&&near(verifiedTarget.y,camera.targetY)&&near(verifiedTarget.z,camera.targetZ);
            readback={...readback,renderCamera:scene.activeCamera?.name||null,activeCameras:(scene.activeCameras||[]).map(item=>String(item?.name||''))};
            if(!cameraVerified)throw new Error('La captura no utilizó la cámara Babylon dirigida al animal: '+JSON.stringify({expected:camera,readback}));
            // Capture the same view once without this actor. A raster comparison proves
            // that the PNG contains the animal itself, not just a valid non-empty canvas.
            const actorWasEnabled=root.isEnabled?.()!==false;
            let backgroundPng=null;
            try{
              // Render the actor-hidden control frame immediately, without yielding two
              // browser frames. This freezes water/sky/foliage animation drift in the diff.
              root.setEnabled(false);
              backgroundPng=captureFrame();
            }finally{
              root.setEnabled(actorWasEnabled);
              // The next capture renders the restored subject and world. Avoid a
              // third full SwiftShader frame just to restore visibility.
            }
            if(backgroundPng){
              const imageData=async dataUrl=>{
                const image=new Image();image.src=dataUrl;await image.decode();
                const surface=document.createElement('canvas');surface.width=image.naturalWidth;surface.height=image.naturalHeight;
                const context=surface.getContext('2d',{willReadFrequently:true});
                if(!context)throw new Error('No se pudo crear el lector raster de capturas de fauna.');
                context.drawImage(image,0,0);return {width:surface.width,height:surface.height,data:context.getImageData(0,0,surface.width,surface.height).data};
              };
              const [visibleRaster,hiddenRaster]=await Promise.all([imageData(png),imageData(backgroundPng)]);
              const B=window.BABYLON,engine=scene.getEngine?.();
              const viewport=temporaryCamera.viewport.toGlobal(visibleRaster.width,visibleRaster.height);
              const transform=scene.getTransformMatrix?.();
              if(!B?.Vector3?.Project||!B?.Matrix?.Identity||!viewport||!transform)
                throw new Error('No se pudo proyectar el volumen anatómico a la imagen para verificar la silueta de '+animalId);
              const projected=[];
              for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
                const point=B.Vector3.Project(new B.Vector3(x,y,z),B.Matrix.Identity(),transform,viewport);
                if(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z)&&point.z>=0&&point.z<=1)
                  projected.push({x:point.x,y:point.y});
              }
              if(projected.length<4)throw new Error('El volumen anatómico queda fuera de la cámara de captura: '+animalId);
              const paddingX=Math.max(8,(Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x)))*.12);
              const paddingY=Math.max(8,(Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)))*.18);
              const projectedBounds={
                left:Math.max(0,Math.floor(Math.min(...projected.map(p=>p.x))-paddingX)),
                top:Math.max(0,Math.floor(Math.min(...projected.map(p=>p.y))-paddingY)),
                right:Math.min(visibleRaster.width-1,Math.ceil(Math.max(...projected.map(p=>p.x))+paddingX)),
                bottom:Math.min(visibleRaster.height-1,Math.ceil(Math.max(...projected.map(p=>p.y))+paddingY))
              };
              if(projectedBounds.right<=projectedBounds.left||projectedBounds.bottom<=projectedBounds.top)
                throw new Error('La proyección del animal produce un rectángulo vacío: '+animalId+' · '+JSON.stringify(projectedBounds));
              const sampleStep=Math.max(1,Math.floor(Math.max(visibleRaster.width,visibleRaster.height)/800));
              let changedPixels=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;
              for(let y=projectedBounds.top;y<=projectedBounds.bottom;y+=sampleStep){
                for(let x=projectedBounds.left;x<=projectedBounds.right;x+=sampleStep){
                  const offset=(y*visibleRaster.width+x)*4;
                  const delta=Math.max(
                    Math.abs(visibleRaster.data[offset]-hiddenRaster.data[offset]),
                    Math.abs(visibleRaster.data[offset+1]-hiddenRaster.data[offset+1]),
                    Math.abs(visibleRaster.data[offset+2]-hiddenRaster.data[offset+2])
                  );
                  if(delta>=28){changedPixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
                }
              }
              const widthPx=maxX>=minX?maxX-minX+sampleStep:0,heightPx=maxY>=minY?maxY-minY+sampleStep:0;
              const projectedSamples=Math.max(1,
                Math.ceil((projectedBounds.right-projectedBounds.left+1)/sampleStep)*
                Math.ceil((projectedBounds.bottom-projectedBounds.top+1)/sampleStep)
              );
              const fillRatio=changedPixels/projectedSamples;
              imageIntegrity={
                changedPixels,sampleStep,widthPx,heightPx,fillRatio:number(fillRatio),projectedBounds,
                source:'same-frame-projected-animal-bounds-raster-diff',
                valid:changedPixels>=140&&widthPx>=12&&heightPx>=10&&fillRatio>=.008
              };
              if(!imageIntegrity.valid)throw new Error('La captura contiene muy poca silueta real del animal; no se acepta como PNG válido: '+animalId+' · '+JSON.stringify(imageIntegrity));
            }
            if(!isBird&&angleDegrees===0){
              const canvas=document.getElementById('renderCanvas');
              const ownGroups=(scene.animationGroups||[]).filter(group=>(group.targetedAnimations||[]).some(entry=>{
                const targetNode=entry.target?.getTransformNode?.()||entry.target;
                return ancestorsContain(targetNode,root);
              }));
              const playing=ownGroups.filter(group=>group.isPlaying).map(group=>({group,speed:number(group.speedRatio)||1,from:number(group.from),to:number(group.to)}));
              const savedMeshes=meshes.map(mesh=>({mesh,skeleton:mesh.skeleton,influencers:mesh.numBoneInfluencers,shader:mesh.computeBonesUsingShaders}));
              try{
                playing.forEach(entry=>entry.group.stop());
                savedMeshes.forEach(entry=>{entry.mesh.skeleton=null;entry.mesh.numBoneInfluencers=0;entry.mesh.computeBonesUsingShaders=false;});
                scene.render();
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                bindPosePng=api?.captureCanvas?api.captureCanvas():canvas?.toDataURL('image/png')||null;
              }finally{
                savedMeshes.forEach(entry=>{entry.mesh.skeleton=entry.skeleton;entry.mesh.numBoneInfluencers=entry.influencers;entry.mesh.computeBonesUsingShaders=entry.shader;});
                playing.forEach(entry=>entry.group.start(true,entry.speed,entry.from,entry.to));
                scene.render();
              }
            }
          }finally{
            for(const other of hidden)other.setEnabled(true);
            if(temporaryCamera){
              scene.activeCamera=previousCamera;
              if(previousActiveCameras!==null&&previousActiveCameras!==undefined)scene.activeCameras=previousActiveCameras;
              temporaryCamera.dispose();
              // The next camera setup renders the restored scene. Avoid an additional
              // full SwiftShader frame solely for cleanup on every one of four views.
            }
          }
          return {camera,readback,cameraVerified,target,position:(()=>{const p=root.getAbsolutePosition?.()||root.position;return p?{x:Number(p.x),y:Number(p.y),z:Number(p.z)}:null;})(),png,imageIntegrity,bindPosePng};
        },{animalId:animal.id,angleDegrees:angle.degrees,measuredBounds:animal.bounds},
        'view '+animal.id+'/'+angle.id,FAUNA_PAGE_EVALUATE_TIMEOUT_MS);
        const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(view.png||'');
        assert.ok(match,'No se obtuvo PNG válido para '+animal.id+' / '+angle.id);
        const buffer=Buffer.from(match[1],'base64');
        assert.ok(buffer.length>1000,'PNG vacío o incompleto: '+animal.id+' / '+angle.id);
        assert.ok(view.imageIntegrity?.valid===true,'La captura no demuestra la presencia raster visible del animal: '+animal.id+' / '+angle.id+' · '+JSON.stringify(view.imageIntegrity));
        const file=animal.id+'-'+angle.id+'.png';
        fs.writeFileSync(path.join(OUT,file),buffer);
        manifest.captures.push({
          id:animal.id+'-'+angle.id,file,subject:animal.id,kind:animal.kind,angle:angle.id,
          camera:view.camera,cameraVerified:view.cameraVerified===true,cameraReadback:view.readback,
          target:view.target,positionAtCapture:view.position,imageIntegrity:view.imageIntegrity,bytes:buffer.length
        });
        if(angle.id==='front'&&view.bindPosePng){
          const bindMatch=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(view.bindPosePng);
          assert.ok(bindMatch,'No se obtuvo PNG de diagnóstico sin skinning para '+animal.id);
          const bindBuffer=Buffer.from(bindMatch[1],'base64');
          assert.ok(bindBuffer.length>1000,'PNG de bind pose vacío: '+animal.id);
          const bindFile=animal.id+'-bindpose.png';
          fs.writeFileSync(path.join(OUT,bindFile),bindBuffer);
          manifest.captures.push({id:animal.id+'-bindpose',file:bindFile,subject:animal.id,kind:animal.kind,angle:'bindpose-no-skinning',camera:view.camera,cameraVerified:view.cameraVerified===true,bytes:bindBuffer.length});
        }
        manifest.currentCapture=null;
        manifest.progress={stage:'view-complete',elapsedMs:Date.now()-captureStartedAt,updatedAt:new Date().toISOString()};
        saveManifest();
        logProgress('view-capture-complete',animal.id+'/'+angle.id+'; completed='+manifest.captures.length);
      }
      logProgress('actor-capture-complete',animal.id);
    }
    manifest.verdict=manifest.warnings.length?'captured-with-review-warnings':'captured';
    const visualCaptureCount=manifest.captures.filter(capture=>ANGLES.some(angle=>angle.id===capture.angle)).length;
    const bindPoseCaptureCount=manifest.captures.filter(capture=>capture.angle==='bindpose-no-skinning').length;
    assert.equal(visualCaptureCount,manifest.fauna.length*ANGLES.length,'Faltan vistas cardinales de fauna; las capturas bind-pose son evidencia adicional y no cuentan como ángulos de cámara.');
    assert.ok(bindPoseCaptureCount<=manifest.fauna.length,'Hay más capturas bind-pose que actores inspeccionados.');
    assert.equal(manifest.warnings.length,0,'La aceptación visual de fauna no puede pasar con anomalías pendientes: '+JSON.stringify(manifest.warnings));
    assert.equal(manifest.pageErrors.length,0,'Errores JavaScript: '+manifest.pageErrors.join(' | '));
  }catch(error){
    manifest.failures.push(String(error?.stack||error));
    manifest.verdict='failed';
    throw error;
  }finally{
    manifest.finishedAt=new Date().toISOString();
    manifest.elapsedMs=Date.now()-captureStartedAt;
    manifest.currentCapture=null;
    manifest.progress={stage:manifest.verdict==='failed'?'failed':'finished',elapsedMs:manifest.elapsedMs,updatedAt:manifest.finishedAt};
    saveManifest();
    if(browser){
      await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))]);
    }
    logProgress('capture-process-closed',manifest.verdict+'; totalMs='+manifest.elapsedMs);
  }
  console.log('FAUNA VISUAL CAPTURE '+manifest.verdict+': '+manifest.captures.length+' vistas para '+manifest.fauna.length+' animales.');
}
main().catch(error=>{console.error('[FAUNA_VISUAL_CAPTURE_FATAL]',error);process.exitCode=1;});
