import { createHash } from 'node:crypto';

export const MAX_CAPTURE_SHOTS = 120;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;
const DIRECTIONS_8 = [0,45,90,135,180,225,270,315];
const DIRECTIONS_4 = [45,135,225,315];

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(label + ' debe ser un número válido.');
  return number;
}
function safeId(value, label) {
  const id = String(value || '');
  if (!ID_PATTERN.test(id)) throw new Error(label + ': identificador inválido. Usa letras, números, guiones o guiones bajos.');
  return id;
}
function validateState(shot, label) {
  finite(shot.time ?? 37, label + ': time');
  if (shot.tide !== undefined && !['natural','high','low'].includes(shot.tide)) {
    throw new Error(label + ': tide debe ser natural, high o low.');
  }
}
function validateCamera(camera, label) {
  for (const key of ['x','y','z','targetX','targetY','targetZ']) finite(camera?.[key], label + ': falta ' + key + '.');
  if (camera.y < -100 || camera.y > 500) throw new Error(label + ': altura de cámara fuera de rango.');
  if (Math.hypot(camera.x-camera.targetX,camera.y-camera.targetY,camera.z-camera.targetZ) <= .25) {
    throw new Error(label + ': la cámara no puede mirar exactamente desde el objetivo.');
  }
}
function cameraAt(target, radius, elevation, angleDegrees, targetY = target.y) {
  const angle = angleDegrees * Math.PI / 180;
  return {
    x: target.x + Math.sin(angle) * radius,
    y: elevation,
    z: target.z + Math.cos(angle) * radius,
    targetX: target.x,
    targetY,
    targetZ: target.z
  };
}
function makeStableObjectCode(item) {
  const p = item.position || {};
  const canonical = [
    item.name || 'unknown',
    item.kind || item.structuralRole || item.category || 'object',
    item.islandIndex ?? item.island ?? 'unknown-island',
    Number(p.x || 0).toFixed(1),
    Number(p.y || 0).toFixed(1),
    Number(p.z || 0).toFixed(1)
  ].join('|');
  return 'OBJ-' + createHash('sha256').update(canonical).digest('hex').slice(0, 12).toUpperCase();
}

export function expandCapturePlan(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('El plan debe contener al menos una cámara o una zona de inspección.');
  }
  const shots = [];
  const zones = [];
  const requestIds = new Set();
  for (const [index, shot] of input.entries()) {
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) throw new Error('Plan ' + index + ': objeto inválido.');
    const id = safeId(shot.id, 'Plan ' + index);
    if (requestIds.has(id)) throw new Error('Identificador de plan duplicado: ' + id);
    requestIds.add(id);
    validateState(shot, id);
    if (shot.zone) {
      const zone = shot.zone;
      if (!zone || typeof zone !== 'object') throw new Error(id + ': zone debe ser un objeto.');
      const focus = zone.focus || 'structures';
      if (!['structures','water','coast','terrain','general'].includes(focus)) {
        throw new Error(id + ': focus debe ser structures, water, coast, terrain o general.');
      }
      const radius = finite(zone.radiusMeters ?? 24, id + ': zone.radiusMeters');
      if (radius < 2 || radius > 300) throw new Error(id + ': radiusMeters debe estar entre 2 y 300.');
      const center = zone.center || {x:0,y:0,z:0};
      finite(center.x ?? 0, id + ': zone.center.x');
      finite(center.y ?? 0, id + ': zone.center.y');
      finite(center.z ?? 0, id + ': zone.center.z');
      if (zone.islandIndex !== undefined && (!Number.isInteger(zone.islandIndex) || zone.islandIndex < 0)) {
        throw new Error(id + ': islandIndex debe ser un entero no negativo.');
      }
      const maxTargets = Math.max(1, Math.min(8, Number(zone.maxTargets) || 6));
      const cameraDistanceMeters = Math.max(3, Math.min(80, Number(zone.cameraDistanceMeters) || 9));
      const angles = Array.isArray(zone.angles) && zone.angles.length
        ? zone.angles.map((value, angleIndex) => finite(value, id + ': angle ' + angleIndex))
        : DIRECTIONS_8;
      if (angles.length > 16) throw new Error(id + ': máximo 16 ángulos por zona.');
      const times = Array.isArray(zone.times) && zone.times.length
        ? zone.times.map((value, timeIndex) => finite(value, id + ': time ' + timeIndex))
        : [Number(shot.time ?? 37)];
      const tides = Array.isArray(zone.tides) && zone.tides.length
        ? zone.tides.map(String)
        : [shot.tide || 'natural'];
      if (tides.some(value => !['natural','high','low'].includes(value))) {
        throw new Error(id + ': tides solo admite natural, high o low.');
      }
      const observationPoint = zone.observationPoint && typeof zone.observationPoint === 'object'
        ? {x:finite(zone.observationPoint.x,id+': observationPoint.x'),y:finite(zone.observationPoint.y,id+': observationPoint.y'),z:finite(zone.observationPoint.z,id+': observationPoint.z')}
        : null;
      const observationHeightOffsets = Array.isArray(zone.observationHeightOffsets) && zone.observationHeightOffsets.length
        ? zone.observationHeightOffsets.map((value,offsetIndex)=>finite(value,id+': observationHeightOffsets['+offsetIndex+']'))
        : [0];
      if (observationHeightOffsets.length > 4) throw new Error(id + ': máximo 4 alturas para la cámara de observación.');
      zones.push({
        id,
        label: String(zone.label || shot.label || id),
        focus,
        islandIndex: zone.islandIndex,
        center: {x:Number(center.x || 0),y:Number(center.y || 0),z:Number(center.z || 0)},
        absolute: zone.absolute === true,
        radiusMeters: radius,
        maxTargets,
        cameraDistanceMeters,
        angles,
        times,
        tides,
        observationPoint,
        observationHeightOffsets,
        includeOverview: zone.includeOverview !== false,
        includeTopDown: zone.includeTopDown !== false
      });
      continue;
    }
    const base = shot.camera || shot;
    if (shot.orbit) {
      const orbit = shot.orbit;
      const count = Math.max(1, Math.min(48, Number(orbit.count) || 8));
      const radius = Number(orbit.radius) || Math.hypot(Number(base.x), Number(base.z));
      const elevation = finite(orbit.elevation ?? base.y, id + ': orbit.elevation');
      const target = {
        x: finite(orbit.targetX ?? base.targetX, id + ': orbit.targetX'),
        y: finite(orbit.targetY ?? base.targetY, id + ': orbit.targetY'),
        z: finite(orbit.targetZ ?? base.targetZ, id + ': orbit.targetZ')
      };
      const start = Number(orbit.startDegrees) || 0;
      const sweep = Number(orbit.sweepDegrees) || 360;
      for (let i=0;i<count;i++) {
        const angle = (start + (count === 1 ? 0 : sweep * i / count));
        const suffix = String(i+1).padStart(2,'0');
        shots.push({...shot,id:id+'-'+suffix,camera:cameraAt(target,radius,elevation,angle,target.y),orbit:undefined,zone:undefined});
      }
    } else if (shot.views && Array.isArray(shot.views)) {
      for (const [viewIndex, view] of shot.views.entries()) {
        const camera = {...base,...view};
        shots.push({...shot,id:id+'-'+String(viewIndex+1).padStart(2,'0'),camera,views:undefined,zone:undefined});
      }
    } else {
      shots.push({...shot,camera:{...base},zone:undefined});
    }
  }
  for (const shot of shots) {
    safeId(shot.id, 'Captura');
    validateState(shot, shot.id);
    validateCamera(shot.camera || shot, shot.id);
  }
  if (shots.length > MAX_CAPTURE_SHOTS) {
    throw new Error('El plan supera el máximo de ' + MAX_CAPTURE_SHOTS + ' capturas.');
  }
  if (!shots.length && !zones.length) throw new Error('El plan no ha generado ninguna captura.');
  const captureIds = new Set();
  for (const shot of shots) {
    if (captureIds.has(shot.id)) throw new Error('Identificador de captura duplicado: ' + shot.id);
    captureIds.add(shot.id);
  }
  return {shots,zones};
}

export function createZoneInspectionShots(request, islands, candidates) {
  const zone = request.zone || request;
  const island = Number.isInteger(zone.islandIndex) ? islands?.[zone.islandIndex] : null;
  if (Number.isInteger(zone.islandIndex) && !island) {
    throw new Error(request.id + ': no existe la isla ' + zone.islandIndex + '.');
  }
  const origin = zone.absolute || !island ? {x:0,z:0} : {x:Number(island.x)||0,z:Number(island.z)||0};
  const center = {
    x: Number(zone.center?.x || 0) + origin.x,
    y: Number(zone.center?.y || 0),
    z: Number(zone.center?.z || 0) + origin.z
  };
  const stateVariants = [];
  for (const time of (zone.times || [37])) {
    for (const tide of (zone.tides || ['natural'])) stateVariants.push({time,tide});
  }
  const shots = [];
  const candidateRows = (Array.isArray(candidates) ? candidates : [])
    .filter(item => item && item.position && Number.isFinite(Number(item.position.x)) && Number.isFinite(Number(item.position.z)))
    .map(item => {
      const p = item.position;
      const distance = Math.hypot(Number(p.x)-center.x,Number(p.z)-center.z);
      return {...item,code:item.code || makeStableObjectCode(item),distanceToZoneCenterMeters:Number(distance.toFixed(2))};
    })
    .filter(item => item.distanceToZoneCenterMeters <= zone.radiusMeters)
    .sort((a,b)=>a.distanceToZoneCenterMeters-b.distanceToZoneCenterMeters || String(a.name).localeCompare(String(b.name)));
  const unique = [];
  for (const item of candidateRows) {
    const p = item.position;
    const duplicate = unique.some(other => other.name === item.name &&
      Math.hypot(Number(other.position.x)-Number(p.x),Number(other.position.z)-Number(p.z)) < .35);
    if (!duplicate) unique.push(item);
  }
  const selected = zone.focus === 'structures' ? unique.slice(0,zone.maxTargets) : [];
  const omitted = zone.focus === 'structures' ? unique.slice(zone.maxTargets) : [];
  const capturePrefix = request.id.slice(0,7)+'-'+createHash('sha256').update(request.id).digest('hex').slice(0,4);
  const addShot = (suffix, camera, purpose, target, state, subject = null) => {
    const captureId=(capturePrefix+'-'+suffix).slice(0,48);
    if(generatedIds.has(captureId)) throw new Error('ID de captura generado duplicado: '+captureId);
    generatedIds.add(captureId);
    shots.push({
      id:captureId,
      camera,
      time:state.time,
      tide:state.tide,
      zoneId:request.id,
      zoneLabel:zone.label,
      inspectionFocus:zone.focus,
      inspectionPurpose:purpose,
      worldTarget:target,
      subject
    });
  };
  const generatedIds = new Set();
  const overviewTarget = {x:center.x,y:center.y+1,z:center.z};
  for (const [stateIndex,state] of stateVariants.entries()) {
    if (zone.includeOverview) {
      const overviewAngles = zone.angles.length >= 4 ? zone.angles : DIRECTIONS_8;
      const overviewCount = Math.min(8,overviewAngles.length);
      const radius = Math.max(zone.radiusMeters*1.35,22);
      const elevation = center.y + Math.max(10,zone.radiusMeters*.42);
      for (let i=0;i<overviewCount;i++) {
        const angle = overviewAngles[i];
        addShot(
          'overview-'+String(i+1).padStart(2,'0')+'-s'+stateIndex+'-'+state.tide,
          cameraAt(overviewTarget,radius,elevation,angle,overviewTarget.y),
          'zone-overview',
          overviewTarget,
          state
        );
      }
    }
    if (zone.focus === 'structures' && selected.length) {
      // A fixed offshore observation point lets the user inspect every building from
      // one real boat/water vantage instead of relying only on synthetic orbit cameras.
      if (zone.observationPoint) {
        for (const item of selected) {
          const p = item.position;
          const bounds = item.bounds || {};
          const bottom = Number(bounds.bottomY ?? p.y ?? center.y);
          const top = Number(bounds.topY ?? (bottom+4));
          const target = {x:Number(p.x),y:Number(((bottom+top)/2).toFixed(3)),z:Number(p.z)};
          const subject = {
            code:item.code,nativeId:item.nativeId??item.uniqueId??item.nodeId??item.id??null,
            name:item.name||'Unnamed structural object',
            kind:item.kind||item.structuralRole||item.category||'unclassified',
            island:item.island||item.islandName||null,
            islandIndex:item.islandIndex??zone.islandIndex??null,
            position:item.position,bounds:item.bounds||null,
            source:item.source||'scene-structural-inventory',
            registered:item.registered??null,meshCount:item.meshCount??null,
            vertexCount:item.vertexCount??null,meshNames:item.meshNames||[],materials:item.materials||[]
          };
          for (let heightIndex=0;heightIndex<zone.observationHeightOffsets.length;heightIndex++) {
            const offset=zone.observationHeightOffsets[heightIndex];
            const camera={
              x:zone.observationPoint.x,
              y:zone.observationPoint.y+offset,
              z:zone.observationPoint.z,
              targetX:target.x,targetY:target.y,targetZ:target.z
            };
            addShot(item.code.toLowerCase()+'-water-'+String(heightIndex+1)+'-s'+stateIndex+'-'+state.tide,
              camera,'structure-water-observation',target,state,subject);
          }
        }
      }
      for (const item of selected) {
        const p = item.position;
        const bounds = item.bounds || {};
        const bottom = Number(bounds.bottomY ?? p.y ?? center.y);
        const top = Number(bounds.topY ?? (bottom+4));
        const objectHeight = Math.max(1,top-bottom);
        const target = {x:Number(p.x),y:Number(((bottom+top)/2).toFixed(3)),z:Number(p.z)};
        const distance = Math.max(zone.cameraDistanceMeters,Math.max(Number(bounds.width)||0,Number(bounds.depth)||0)*1.7,6);
        const lowElevation = target.y + Math.max(1.8,objectHeight*.38);
        const highElevation = target.y + Math.max(5,objectHeight*1.15);
        const subject = {
          code:item.code,
          nativeId:item.nativeId ?? item.uniqueId ?? item.nodeId ?? item.id ?? null,
          name:item.name || 'Unnamed structural object',
          kind:item.kind || item.structuralRole || item.category || 'unclassified',
          island:item.island || item.islandName || null,
          islandIndex:item.islandIndex ?? zone.islandIndex ?? null,
          position:item.position,
          bounds:item.bounds || null,
          source:item.source || 'scene-structural-inventory',
          registered:item.registered ?? null,
          meshCount:item.meshCount ?? null,
          vertexCount:item.vertexCount ?? null,
          meshNames:item.meshNames || [],
          materials:item.materials || []
        };
        for (let i=0;i<zone.angles.length;i++) {
          const angle = zone.angles[i];
          addShot(item.code.toLowerCase()+'-lo-'+String(i+1).padStart(2,'0')+'-s'+stateIndex+'-'+state.tide,
            cameraAt(target,distance,lowElevation,angle,target.y),'structure-low-oblique',target,state,subject);
        }
        for (let i=0;i<Math.min(4,DIRECTIONS_4.length);i++) {
          const angle = DIRECTIONS_4[i];
          addShot(item.code.toLowerCase()+'-hi-'+String(i+1).padStart(2,'0')+'-s'+stateIndex+'-'+state.tide,
            cameraAt(target,distance*1.2,highElevation,angle,target.y),'structure-high-oblique',target,state,subject);
        }
        if (zone.includeTopDown) {
          const camera = {x:target.x+.05,y:top+Math.max(8,objectHeight*1.5),z:target.z+.05,targetX:target.x,targetY:target.y,targetZ:target.z};
          addShot(item.code.toLowerCase()+'-td-s'+stateIndex+'-'+state.tide,
            camera,'structure-top-down',target,state,subject);
        }
      }
    } else {
      const nearDistance = Math.max(4,Math.min(zone.radiusMeters*.72,zone.cameraDistanceMeters));
      const farDistance = Math.max(nearDistance*1.8,zone.radiusMeters*1.35);
      const lowElevation = center.y + Math.max(2.3,zone.radiusMeters*.08);
      const highElevation = center.y + Math.max(8,zone.radiusMeters*.38);
      for (const [level,distance,elevation] of [['near',nearDistance,lowElevation],['elevated',farDistance,highElevation]]) {
        for (let i=0;i<zone.angles.length;i++) {
          const angle = zone.angles[i];
          addShot(level+'-'+String(i+1).padStart(2,'0')+'-s'+stateIndex+'-'+state.tide,
            cameraAt(overviewTarget,distance,elevation,angle,overviewTarget.y),
            zone.focus === 'water' ? 'water-surface-angle' : zone.focus === 'coast' ? 'coastline-angle' : zone.focus === 'terrain' ? 'terrain-angle' : 'zone-angle',
            overviewTarget,state);
        }
      }
      if (zone.includeTopDown) {
        const camera={x:center.x+.05,y:center.y+Math.max(18,zone.radiusMeters*1.5),z:center.z+.05,targetX:center.x,targetY:center.y,targetZ:center.z};
        addShot('topdown-s'+stateIndex+'-'+state.tide,camera,'zone-top-down',center,state);
      }
    }
  }
  const generatedIdsCheck = new Set();
  for (const shot of shots) {
    safeId(shot.id, 'Captura generada');
    validateState(shot, shot.id);
    validateCamera(shot.camera, shot.id);
    if (generatedIdsCheck.has(shot.id)) throw new Error('ID de cámara repetido en la zona: ' + shot.id);
    generatedIdsCheck.add(shot.id);
  }
  const report = {
    id:request.id,
    label:zone.label,
    focus:zone.focus,
    center,
    islandIndex:zone.islandIndex ?? null,
    radiusMeters:zone.radiusMeters,
    observationPoint:zone.observationPoint,
    observationHeightOffsets:zone.observationHeightOffsets,
    candidateCount:unique.length,
    selectedTargetCount:selected.length,
    selectedTargets:selected.map(item=>({code:item.code,nativeId:item.nativeId??item.uniqueId??item.nodeId??item.id??null,name:item.name,kind:item.kind||item.structuralRole||item.category||'unclassified',island:item.island||item.islandName||null,position:item.position,bounds:item.bounds||null,source:item.source||null})),
    omittedTargetCount:omitted.length,
    omittedTargets:omitted.map(item=>({code:item.code,name:item.name,position:item.position})),
    stateVariantCount:stateVariants.length,
    generatedShotCount:shots.length,
    note:zone.focus==='structures' && unique.length===0
      ? 'No se encontraron raíces estructurales dentro del radio indicado; se generaron cámaras de zona para comprobar el área sin afirmar que esté vacía.'
      : null
  };
  return {shots,report};
}
