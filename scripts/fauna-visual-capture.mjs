import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.FAUNA_TEST_URL || process.env.INSPECTOR_TEST_URL || 'http://127.0.0.1:4175/';
const OUT = path.resolve('artifacts/fauna-visual-captures');
const VIEWPORT = { width: 1600, height: 900 };
const ANGLES = [
  { id: 'front', degrees: 0 },
  { id: 'right', degrees: 90 },
  { id: 'rear', degrees: 180 },
  { id: 'left', degrees: 270 }
];
const manifest = {
  schema: 1, capturedAt: new Date().toISOString(), finishedAt: null,
  gameVersion: null, renderer: 'Chromium headless + ANGLE SwiftShader',
  viewport: VIEWPORT, readOnlySceneCapture: true, startup: null,
  readiness: null, scene: null, fauna: [], captures: [],
  warnings: [], failures: [], consoleErrors: [], pageErrors: [], verdict: 'incomplete'
};
const round = (value, digits = 4) =>
  Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const vector = value => value ? {x:round(value.x),y:round(value.y),z:round(value.z)} : null;
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
    browser=await chromium.launch({headless:true,timeout:60000,args:[
      '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-webgl2',
      '--ignore-gpu-blocklist','--disable-dev-shm-usage','--force-color-profile=srgb'
    ]});
    const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,ignoreHTTPSErrors:true});
    const page=await context.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    await page.addInitScript(()=>{
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
    });
    page.on('pageerror',error=>manifest.pageErrors.push(String(error?.stack||error)));
    page.on('console',message=>{if(message.type()==='error')manifest.consoleErrors.push(message.text());});

    const navigationStarted=Date.now();
    await page.goto(BASE_URL+'?test=1&fauna-inspector=1',{waitUntil:'domcontentloaded',timeout:90000});
    const audioGate=page.locator('#audioGateStart');
    if(await audioGate.isVisible().catch(()=>false))await audioGate.click();
    await page.locator('#chooseQuality').waitFor({state:'visible',timeout:60000});
    await page.locator('#chooseQuality').click();
    await page.locator('#continueUnnamed').waitFor({state:'visible',timeout:30000});
    await page.locator('#continueUnnamed').click();
    const faunaWaitStarted=Date.now();
    try {
      await page.waitForFunction(()=>{
        const scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||window.BABYLON?.EngineStore?.LastCreatedScene;
        const roots=scene?(scene.transformNodes||[]).filter(node=>
          /^(?:WildlifeActor_(?:deer|stag|wolf)_\\d+|RealSeagullActor_\\d+)$/.test(String(node?.name||''))&&!node.isDisposed?.()
        ): [];
        const land=roots.filter(node=>/^WildlifeActor_/.test(String(node.name||''))).length;
        const birds=roots.filter(node=>/^RealSeagullActor_/.test(String(node.name||''))).length;
        return window.__elSinNombreStartupSmoke?.worldReady===true||
          document.body.classList.contains('boot-failed')||land>=3||birds>=1;
      },undefined,{timeout:120000,polling:250});
    } catch(error) {
      manifest.warnings.push({code:'startup-did-not-reach-fauna-roster',message:String(error?.message||error)});
    }
    manifest.startupDiagnostic=await page.evaluate(()=>{
      const safe=(fn,fallback=null)=>{try{return fn();}catch(_){return fallback;}};
      const B=window.BABYLON||null,scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||B?.EngineStore?.LastCreatedScene||null;
      const roots=scene?(scene.transformNodes||[]).filter(node=>
        /^(?:WildlifeActor_(?:deer|stag|wolf)_\\d+|RealSeagullActor_\\d+)$/.test(String(node?.name||''))&&!node.isDisposed?.()
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
    });
    manifest.startup={
      worldReady:manifest.startupDiagnostic.worldReady,
      bootFailed:manifest.startupDiagnostic.bootFailed,
      durationMs:Date.now()-navigationStarted,
      waitedMs:Date.now()-faunaWaitStarted
    };
    manifest.gameVersion=await page.evaluate(()=>document.querySelector('meta[name="el-sin-nombre-build"]')?.content||null);
    manifest.readiness=manifest.startupDiagnostic.faunaReadiness;
    manifest.cameraTextureReadiness=manifest.startup.worldReady
      ?await page.evaluate(()=>window.__ELSN_TEST__?.prepareCaptureFrame?window.__ELSN_TEST__.prepareCaptureFrame({timeoutMs:120000}):null)
      :null;
    if(!manifest.startup.worldReady){
      await page.screenshot({path:path.join(OUT,'startup-stalled-before-world-ready.png'),fullPage:true}).catch(()=>{});
    }
    if(manifest.startup.worldReady){
      await page.locator('#intro.open').waitFor({state:'visible',timeout:60000});
      await page.locator('#newGameChoice').waitFor({state:'visible',timeout:30000});
      await page.locator('#newGameChoice').click();
      await page.waitForFunction(()=>document.body.classList.contains('game-running'),undefined,{timeout:30000,polling:100});
    }
    const initial=await page.evaluate(()=>{
      const scene=window.__ELSN_FAUNA_CAPTURE_SCENE__||window.__ELSN_FAUNA_CAPTURE_BABYLON__?.EngineStore?.LastCreatedScene;
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
          const lo=bounds?.minimumWorld,hi=bounds?.maximumWorld;
          if(lo&&hi){
            min.x=Math.min(min.x,lo.x);min.y=Math.min(min.y,lo.y);min.z=Math.min(min.z,lo.z);
            max.x=Math.max(max.x,hi.x);max.y=Math.max(max.y,hi.y);max.z=Math.max(max.z,hi.z);
          }
          const vertices=Number(mesh.getTotalVertices?.())||0;
          const indices=Number(mesh.getTotalIndices?.())||0;
          const skinned=!!mesh.skeleton||Number(mesh.numBoneInfluencers)>0;
          totalVertices+=vertices;totalIndices+=indices;
          if(skinned)skinnedVertices+=vertices;
          if(mesh.isVisible!==false&&mesh.isEnabled?.()!==false&&Number(mesh.visibility??1)>0)visibleMeshCount++;
          if(mesh.skeleton)skeletons.add(mesh.skeleton);
          if(mesh.material){
            materials.set(mesh.material.uniqueId??mesh.material.name,mesh.material);
            for(const texture of mesh.material.getActiveTextures?.()||[])textures.set(texture.uniqueId??texture.name,texture);
          }
          const local=bounds?{
            min:{x:number(bounds.minimum.x),y:number(bounds.minimum.y),z:number(bounds.minimum.z)},
            max:{x:number(bounds.maximum.x),y:number(bounds.maximum.y),z:number(bounds.maximum.z)}
          }:null;
          return {
            name:String(mesh.name||mesh.id||''),vertices,indices,skinned,
            skeleton:mesh.skeleton?.name||null,enabled:mesh.isEnabled?.()!==false,
            visible:mesh.isVisible!==false,visibility:number(mesh.visibility??1),
            material:mesh.material?.name||null,localBounds:local,
            worldBounds:lo&&hi?{min:{x:number(lo.x),y:number(lo.y),z:number(lo.z)},max:{x:number(hi.x),y:number(hi.y),z:number(hi.z)}}:null
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
    });
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
    const expected=Number(initial.expectedWildlifeCount||manifest.readiness?.requested||landAnimals.length);
    const loaded=Number(manifest.readiness?.loaded??landAnimals.length);
    if(expected!==loaded||loaded!==landAnimals.length)manifest.warnings.push({
      code:'fauna-count-mismatch',requested:expected,loaded,sceneActors:landAnimals.length
    });
    const expectedBirds=Number(initial.expectedBirdCount||birds.length);
    if(expectedBirds!==birds.length)manifest.warnings.push({
      code:'gull-count-mismatch',requested:expectedBirds,loaded:birds.length
    });
    for(const animal of manifest.fauna){
      const d=animal.bounds?.dimensions;
      const horizontal=d?Math.max(d.width,d.depth):null;
      const maxExtent=d?Math.max(d.width,d.height,d.depth):0;
      if(!d||!(horizontal>.1)||(animal.role==='ambient-bird'?!(maxExtent>.1&&maxExtent<=.8):!(d.height>.1)))manifest.warnings.push({code:'invalid-world-bounds',animal:animal.id,bounds:animal.bounds});
      if(animal.role!=='ambient-bird'&&d&&horizontal<d.height*.24)manifest.warnings.push({code:'extremely-narrow-world-silhouette',animal:animal.id,dimensions:d});
      if(animal.visibleMeshCount<1)manifest.warnings.push({code:'no-visible-meshes',animal:animal.id});
      if(animal.role==='ambient-bird'){
        if(!animal.flightRig?.complete)manifest.warnings.push({code:'gull-flight-rig-incomplete',animal:animal.id,flightRig:animal.flightRig});
        if(animal.flightRig?.complete&&!animal.flightRig.animationPlaying)manifest.warnings.push({code:'gull-flight-animation-stopped',animal:animal.id,flightRig:animal.flightRig});
        if(!(Number(animal.flightRig?.targetedAnimations)>0))manifest.warnings.push({code:'gull-flight-tracks-missing',animal:animal.id,flightRig:animal.flightRig});
      }else if(animal.skinnedVertices<600||animal.boneCount<12)manifest.warnings.push({
        code:'weak-skinning-or-rig',animal:animal.id,skinnedVertices:animal.skinnedVertices,boneCount:animal.boneCount
      });
      if(!animal.animationGroups.length)manifest.warnings.push({code:animal.role==='ambient-bird'?'gull-animation-group-missing':'no-linked-animation-groups',animal:animal.id});
      if(!animal.textures.length||animal.textures.some(texture=>texture.ready===false||texture.ready===null))manifest.warnings.push({
        code:'texture-readiness-review',animal:animal.id,textures:animal.textures
      });
    }
    saveManifest();

    const apiReady=await page.evaluate(()=>!!window.__ELSN_TEST__?.setCamera&&!!window.__ELSN_TEST__?.captureCanvas&&!!window.__ELSN_TEST__?.sceneViewSnapshot);
    assert.ok(apiReady,'Falta la API de cámara y captura del Inspector Center.');
    for(const animal of manifest.fauna){
      for(const angle of ANGLES){
        const view=await page.evaluate(async({animalId,angleDegrees})=>{
          const api=window.__ELSN_TEST__,scene=window.__ELSN_FAUNA_CAPTURE_SCENE__;
          const root=scene?.getTransformNodeByName?.(animalId);
          if(!api||!root)throw new Error('El actor de fauna desapareció durante las capturas: '+animalId);
          root.computeWorldMatrix?.(true);
          const meshes=root.getChildMeshes?.(false)||[];
          let min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
          for(const mesh of meshes){
            mesh.computeWorldMatrix?.(true);
            const bb=mesh.getBoundingInfo?.()?.boundingBox,lo=bb?.minimumWorld,hi=bb?.maximumWorld;
            if(lo&&hi){
              min.x=Math.min(min.x,lo.x);min.y=Math.min(min.y,lo.y);min.z=Math.min(min.z,lo.z);
              max.x=Math.max(max.x,hi.x);max.y=Math.max(max.y,hi.y);max.z=Math.max(max.z,hi.z);
            }
          }
          if(!Number.isFinite(min.x)||!Number.isFinite(max.x))throw new Error('El animal no tiene límites mundiales medibles: '+animalId);
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
          api.setCamera(camera);
          await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
          api.render();
          const readback=api.sceneViewSnapshot?.()||null;
          const actual=readback?.camera||null,actualTarget=readback?.target||null;
          const near=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=.20;
          const cameraVerified=!!actual&&!!actualTarget&&
            near(actual.x,camera.x)&&near(actual.y,camera.y)&&near(actual.z,camera.z)&&
            near(actualTarget.x,camera.targetX)&&near(actualTarget.y,camera.targetY)&&near(actualTarget.z,camera.targetZ);
          if(!cameraVerified)throw new Error('La cámara no alcanzó el animal: '+JSON.stringify({expected:camera,readback}));
          const hidden=[];
          for(const other of scene.transformNodes||[]){
            if(other!==root&&(/^(?:WildlifeActor_(?:deer|stag|wolf)_\d+|RealSeagullActor_\d+)$/.test(String(other?.name||'')))){
              const wasEnabled=other.isEnabled?.()!==false;
              if(wasEnabled){other.setEnabled(false);hidden.push(other);}
            }
          }
          api.render();
          const png=api.captureCanvas();
          for(const other of hidden)other.setEnabled(true);
          return {camera,readback,target,position:(()=>{const p=root.getAbsolutePosition?.()||root.position;return p?{x:Number(p.x),y:Number(p.y),z:Number(p.z)}:null;})(),png};
        },{animalId:animal.id,angleDegrees:angle.degrees});
        const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(view.png||'');
        assert.ok(match,'No se obtuvo PNG válido para '+animal.id+' / '+angle.id);
        const buffer=Buffer.from(match[1],'base64');
        assert.ok(buffer.length>1000,'PNG vacío o incompleto: '+animal.id+' / '+angle.id);
        const file=animal.id+'-'+angle.id+'.png';
        fs.writeFileSync(path.join(OUT,file),buffer);
        manifest.captures.push({
          id:animal.id+'-'+angle.id,file,subject:animal.id,kind:animal.kind,angle:angle.id,
          camera:view.camera,cameraVerified:true,cameraReadback:view.readback,
          target:view.target,positionAtCapture:view.position,bytes:buffer.length
        });
        saveManifest();
      }
    }
    manifest.verdict=manifest.warnings.length?'captured-with-review-warnings':'captured';
    assert.equal(manifest.captures.length,manifest.fauna.length*ANGLES.length,'Faltan vistas de fauna.');
    assert.equal(manifest.pageErrors.length,0,'Errores JavaScript: '+manifest.pageErrors.join(' | '));
  }catch(error){
    manifest.failures.push(String(error?.stack||error));
    manifest.verdict='failed';
    throw error;
  }finally{
    manifest.finishedAt=new Date().toISOString();
    saveManifest();
    if(browser)await browser.close();
  }
  console.log('FAUNA VISUAL CAPTURE '+manifest.verdict+': '+manifest.captures.length+' vistas para '+manifest.fauna.length+' animales.');
}
main().catch(error=>{console.error('[FAUNA_VISUAL_CAPTURE_FATAL]',error);process.exitCode=1;});
