export const WORLD_INSPECTION_SCHEMA_VERSION = 1;

const finite = value => typeof value === 'number' && Number.isFinite(value);

export function analyzeWorldInspectionSnapshot(snapshot) {
  if (!snapshot || snapshot.kind !== 'babylon-world-inspection' || snapshot.schemaVersion !== 1) {
    return {
      schemaVersion: WORLD_INSPECTION_SCHEMA_VERSION,
      status: 'unavailable',
      severity: 'unknown',
      summary: { issues: 0, warnings: 0, evidenceGaps: 1 },
      findings: [{ severity: 'unknown', code: 'snapshot-unavailable', message: 'Babylon.js no ha proporcionado un inventario válido del mundo.' }]
    };
  }

  const findings = [];
  const add = (severity, code, message, evidence = null) => findings.push({ severity, code, message, evidence });

  const islands = snapshot.islands || {};
  if (islands.count !== 13 || islands.complete !== true) {
    add('high', 'island-registry-incomplete', 'El registro del archipiélago no contiene exactamente las 13 islas esperadas.', {
      expected: 13, observed: finite(islands.count) ? islands.count : null
    });
  }

  const invalidTransforms = snapshot.meshes?.invalidTransforms || [];
  if (invalidTransforms.length) {
    add('high', 'mesh-transform-invalid', 'Hay mallas con posiciones no finitas o límites mundiales inválidos.', {
      count: snapshot.meshes.invalidTransformCount ?? invalidTransforms.length,
      meshes: invalidTransforms.slice(0, 30)
    });
  }

  const audit = snapshot.structures?.audit;
  if (!audit) {
    add('info', 'structure-audit-unavailable', 'La auditoría de cimentación todavía no ha generado una muestra; no se asume que las estructuras estén correctas o incorrectas.');
  } else {
    const visibleUnsafe = (audit.structures || []).filter(row => row.safe === false && row.enabled === true);
    if (visibleUnsafe.length) {
      add('high', 'unsafe-structure-visible', 'Hay estructuras marcadas como inseguras que siguen visibles. Requieren inspección de coordenadas y huella.', {
        count: visibleUnsafe.length,
        structures: visibleUnsafe.slice(0, 40).map(row => ({
          name: row.name, kind: row.kind, island: row.island, islandIndex: row.islandIndex,
          x: row.x, z: row.z, reason: row.reason, dryLandMarginMeters: row.dryLandMarginMeters,
          anchorErrorMeters: row.anchorErrorMeters
        }))
      });
    }
    const hiddenUnsafe = (audit.structures || []).filter(row => row.safe === false && row.enabled === false);
    if (hiddenUnsafe.length) {
      add('info', 'unsafe-structure-hidden', 'La auditoría existente mantiene ocultas algunas estructuras inseguras; se informa de ellas sin volver a modificarlas.', {
        count: hiddenUnsafe.length,
        structures: hiddenUnsafe.slice(0, 30).map(row => ({
          name: row.name, kind: row.kind, island: row.island, reason: row.reason
        }))
      });
    }
    if ((audit.untrackedRootCount || 0) > 0) {
      add('medium', 'structure-roots-untracked', 'Se han encontrado raíces estructurales sin seguimiento en el registro de cimentación.', {
        count: audit.untrackedRootCount, names: (audit.untrackedRoots || []).slice(0, 50)
      });
    }
  }


  const terrainObjects = snapshot.terrainObjects || {};
  const terrainObjectItems = Array.isArray(terrainObjects.items) ? terrainObjects.items : [];
  const fullyBuried = terrainObjectItems.filter(item => item.status === 'fully-buried');
  const penetrating = terrainObjectItems.filter(item => item.status === 'penetrates-terrain');
  if ((terrainObjects.fullyBuriedCount || fullyBuried.length) > 0) {
    add('high', 'visible-meshes-below-terrain', 'Hay mallas visibles cuyo volumen completo queda por debajo de la altura muestreada del terreno. Se incluyen sus coordenadas y límites mundiales.', {
      count: terrainObjects.fullyBuriedCount ?? fullyBuried.length,
      complete: terrainObjects.complete === true,
      objects: fullyBuried.slice(0, 60).map(item => ({
        uniqueId: item.uniqueId, name: item.name, id: item.id, parent: item.parent,
        worldPosition: item.worldPosition, bounds: item.bounds, terrain: item.terrain,
        nearestIsland: item.nearestIsland
      }))
    });
  }
  if ((terrainObjects.penetratingCount || penetrating.length) > 0) {
    add('medium', 'visible-meshes-intersect-terrain', 'Hay mallas visibles que penetran el terreno por encima del umbral de 8 cm; deben revisarse antes de moverlas porque algunas raíces o apoyos pueden ser intencionados.', {
      count: terrainObjects.penetratingCount ?? penetrating.length,
      complete: terrainObjects.complete === true,
      objects: penetrating.slice(0, 60).map(item => ({
        uniqueId: item.uniqueId, name: item.name, id: item.id, parent: item.parent,
        worldPosition: item.worldPosition, bounds: item.bounds, terrain: item.terrain,
        nearestIsland: item.nearestIsland
      }))
    });
  }
  if (terrainObjects.complete !== true) {
    add('info', 'terrain-object-audit-incomplete', 'La auditoría de objetos bajo terreno no cubrió todas las mallas visibles o no dispuso de la función de altura del terreno.', {
      checked: terrainObjects.checkedCount ?? null,
      candidates: terrainObjects.candidateCount ?? null,
      unmeasurable: terrainObjects.unmeasurableCount ?? null,
      returned: terrainObjects.returned ?? terrainObjectItems.length,
      truncated: terrainObjects.truncated ?? null
    });
  }

  const wildlife = snapshot.actors?.wildlife;
  const wildlifeActors = Array.isArray(wildlife?.returned) ? wildlife.returned : [];
  if (wildlife && finite(wildlife.count) && wildlife.count > 0) {
    const malformed = wildlifeActors.filter(actor => !actor || !actor.visualIntegrity ||
      actor.visualIntegrity.hasMeshes !== true || actor.visualIntegrity.hasSkinnedMesh !== true ||
      actor.visualIntegrity.hasSkeleton !== true || actor.visualIntegrity.hasFinitePosition !== true ||
      actor.visualIntegrity.hasVisibleGeometry !== true || actor.visualIntegrity.hasFiniteBounds !== true ||
      actor.visualIntegrity.plausibleBounds !== true);
    if (malformed.length) add('high', 'wildlife-visual-rig-invalid',
      'Uno o varios animales tienen geometría, esqueleto, límites, posición o visibilidad incompletos o fuera de escala.',
      { count:malformed.length, animals:malformed.slice(0,30).map(actor=>({
        name:actor&&actor.name,kind:actor&&actor.kind,position:actor&&actor.position,
        meshCount:actor&&actor.meshCount,skinnedMeshCount:actor&&actor.skinnedMeshCount,
        bounds:actor&&actor.bounds,visualIntegrity:actor&&actor.visualIntegrity,
        skeletons:actor&&actor.skeletons,meshes:actor&&actor.meshes
      })) });
    const expectedSpecies = ['deer','stag','wolf'];
    const loadedSpecies = new Set(wildlifeActors.map(actor=>actor&&actor.kind).filter(Boolean));
    const missingSpecies = expectedSpecies.filter(kind=>!loadedSpecies.has(kind));
    if (missingSpecies.length) add('high','wildlife-species-missing',
      'La captura no contiene todas las especies obligatorias de la isla inicial.',
      {missingSpecies,loadedSpecies:Array.from(loadedSpecies),requested:wildlife.count});
    const animationFaults = wildlifeActors.filter(actor=>actor&&actor.activeMode!=='distance-idle'&&
      actor.activeAnimation&&actor.playingAnimationGroups===0);
    if (animationFaults.length) add('high','wildlife-animation-not-playing',
      'Hay animales con un modo de animación activo pero sin ningún AnimationGroup reproduciéndose.',
      {count:animationFaults.length,animals:animationFaults.slice(0,30).map(actor=>({
        name:actor.name,kind:actor.kind,activeMode:actor.activeMode,activeAnimation:actor.activeAnimation,
        animationGroups:actor.animationGroups
      }))});
    const invalidAnimationRoster = wildlifeActors.filter(actor=>!actor||!Array.isArray(actor.animationGroups)||
      actor.animationGroups.length===0||actor.animationGroups.every(group=>!group||!(group.targetedAnimations>0)));
    if (invalidAnimationRoster.length) add('high','wildlife-animation-clips-missing',
      'Uno o varios animales no exponen clips de animación dirigidos a su esqueleto.',
      {count:invalidAnimationRoster.length,animals:invalidAnimationRoster.slice(0,30).map(actor=>({
        name:actor&&actor.name,kind:actor&&actor.kind,animationGroups:actor&&actor.animationGroups
      }))});
    const pendingAnimalTextures = wildlifeActors.filter(actor=>actor&&
      (actor.textureReadiness?.pending>0||actor.textureReadiness?.unknown>0));
    if (pendingAnimalTextures.length) add('medium','wildlife-textures-not-ready',
      'Hay animales con texturas pendientes o con disponibilidad no verificable en el instante de la captura.',
      {count:pendingAnimalTextures.length,animals:pendingAnimalTextures.slice(0,30).map(actor=>({
        name:actor.name,kind:actor.kind,textureReadiness:actor.textureReadiness
      }))});
    if (wildlife.truncated>0) add('info','wildlife-inventory-truncated',
      'El inventario individual de fauna está limitado y no contiene todos los animales.',
      {returned:wildlifeActors.length,total:wildlife.count,truncated:wildlife.truncated});
  } else if (snapshot.actors && snapshot.actors.wildlife) {
    add('high','wildlife-inventory-empty','El inventario del mundo no contiene ningún animal cargado.');
  }
  const birds = snapshot.actors?.ambientBirds;
  const birdActors = Array.isArray(birds?.returned) ? birds.returned : [];
  if (birds && finite(birds.count) && birds.count > 0) {
    const invalidFlightRigs = birdActors.filter(actor => !actor || actor.visualIntegrity?.hasMeshes !== true ||
      actor.visualIntegrity?.hasFinitePosition !== true || actor.visualIntegrity?.hasVisibleGeometry !== true ||
      actor.visualIntegrity?.hasFiniteBounds !== true || actor.visualIntegrity?.plausibleBounds !== true ||
      actor.visualIntegrity?.hasFlightRig !== true || actor.flightRig?.complete !== true);
    if (invalidFlightRigs.length) add('high','ambient-bird-flight-rig-invalid',
      'Una o varias gaviotas tienen mallas, pivotes anatómicos o límites de vuelo incompletos.',
      {count:invalidFlightRigs.length,birds:invalidFlightRigs.slice(0,30).map(actor=>({
        name:actor&&actor.name,position:actor&&actor.position,meshCount:actor&&actor.meshCount,
        bounds:actor&&actor.bounds,flightRig:actor&&actor.flightRig,visualIntegrity:actor&&actor.visualIntegrity
      }))});
    const stoppedFlight = birdActors.filter(actor => actor && actor.flightRig?.complete === true &&
      actor.flightRig.animationPlaying !== true);
    if (stoppedFlight.length) add('high','ambient-bird-flight-not-playing',
      'Hay gaviotas con el rig de vuelo montado pero su AnimationGroup no está reproduciéndose.',
      {count:stoppedFlight.length,birds:stoppedFlight.slice(0,30).map(actor=>({
        name:actor.name,animationGroupName:actor.flightRig?.animationGroupName,
        animationPlaying:actor.flightRig?.animationPlaying,targetedAnimations:actor.flightRig?.targetedAnimations
      }))});
    const pendingBirdTextures = birdActors.filter(actor =>
      actor?.textureReadiness?.pending > 0 || actor?.textureReadiness?.unknown > 0);
    if (pendingBirdTextures.length) add('medium','ambient-bird-textures-not-ready',
      'Hay gaviotas con texturas pendientes o cuya disponibilidad no se puede verificar.',
      {count:pendingBirdTextures.length,birds:pendingBirdTextures.slice(0,30).map(actor=>({
        name:actor.name,textureReadiness:actor.textureReadiness
      }))});
    if (birds.truncated > 0) add('info','ambient-bird-inventory-truncated',
      'El inventario individual de gaviotas está limitado y no contiene todos los actores.',
      {returned:birdActors.length,total:birds.count,truncated:birds.truncated});
  } else if (snapshot.actors && snapshot.actors.ambientBirds && Number(birds.count) > 0) {
    add('high','ambient-bird-inventory-empty','El inventario declara gaviotas, pero no contiene fichas individuales.');
  }
  const pendingTextures = snapshot.textures?.pendingCount;
  if (finite(pendingTextures) && pendingTextures > 0) {
    add('medium', 'textures-pending-at-capture', 'Había texturas pendientes en el instante de la captura. Esto no demuestra un fallo de carga.', {
      pending: pendingTextures, total: snapshot.textures.count
    });
  }
  const unknownTextures = snapshot.textures?.unknownReadinessCount;
  if (finite(unknownTextures) && unknownTextures > 0) {
    add('info', 'texture-readiness-unknown', 'Babylon.js no expuso el estado de disponibilidad de todas las texturas.', {
      unknown: unknownTextures, total: snapshot.textures.count
    });
  }

  if (snapshot.meshes?.truncated > 0) {
    add('info', 'mesh-inventory-truncated', 'El inventario de mallas supera el límite de la captura y está incompleto.', {
      returned: snapshot.meshes.returned, total: snapshot.meshes.count, omitted: snapshot.meshes.truncated
    });
  }
  if ((snapshot.collisions?.invalidPositionCount || 0) > 0) {
    add('high', 'collision-position-invalid', 'Hay colisionadores del mundo con coordenadas no válidas.', {
      count: snapshot.collisions.invalidPositionCount,
      examples: (snapshot.collisions.items || []).filter(item => item.x === null || item.z === null).slice(0, 30)
    });
  }
  if ((snapshot.collisions?.truncated || 0) > 0) {
    add('info', 'collider-inventory-truncated', 'El inventario de colisionadores está limitado y no incluye todos los registros.', {
      returned: snapshot.collisions.returned, total: snapshot.collisions.customColliderCount
    });
  }
  if (snapshot.terrain?.islandsSampled !== 13) {
    add('info', 'terrain-sampling-incomplete', 'No se pudieron obtener muestras de altura para todas las islas.', {
      expected: 13, sampled: snapshot.terrain?.islandsSampled ?? 0
    });
  }

  if (snapshot.dataQuality?.structureAuditAvailable !== true) {
    // Already represented by structure-audit-unavailable.
  }
  if (snapshot.dataQuality?.islandRegistryComplete !== true || snapshot.dataQuality?.fullMeshInventory !== true) {
    add('info', 'world-evidence-incomplete', 'La captura no contiene una evidencia completa de todos los elementos del mundo.');
  }

  const counts = {
    issues: findings.filter(item => ['high', 'medium'].includes(item.severity)).length,
    warnings: findings.filter(item => item.severity === 'info').length,
    evidenceGaps: findings.filter(item => item.code === 'structure-audit-unavailable' || item.code === 'world-evidence-incomplete' || item.code === 'mesh-inventory-truncated').length
  };
  const severity = findings.some(item => item.severity === 'high') ? 'high'
    : findings.some(item => item.severity === 'medium') ? 'medium'
    : findings.length ? 'info' : 'none';
  return {
    schemaVersion: WORLD_INSPECTION_SCHEMA_VERSION,
    status: severity === 'high' || severity === 'medium' ? 'findings' : (findings.length ? 'incomplete-or-informational' : 'no-issues-observed'),
    severity,
    summary: counts,
    findings
  };
}
