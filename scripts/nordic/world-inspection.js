(function (root) {
  'use strict';

  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const safeCall = (fn, fallback = null) => {
    try { return typeof fn === 'function' ? fn() : fallback; }
    catch (_) { return fallback; }
  };
  const round = (value, digits = 3) => finite(value) ? Number(value.toFixed(digits)) : null;

  function readPosition(node) {
    if (!node) return null;
    const position = safeCall(() => node.getAbsolutePosition ? node.getAbsolutePosition() : node.position);
    if (!position) return null;
    return {
      x: round(position.x, 3),
      y: round(position.y, 3),
      z: round(position.z, 3)
    };
  }

  function readBounds(mesh) {
    try {
      if (typeof mesh.computeWorldMatrix === 'function') mesh.computeWorldMatrix(true);
      const info = typeof mesh.getBoundingInfo === 'function' ? mesh.getBoundingInfo() : null;
      const box = info && info.boundingBox;
      const min = box && box.minimumWorld;
      const max = box && box.maximumWorld;
      if (!min || !max) return { available: false, min: null, max: null, size: null, finite: null };
      const values = [min.x, min.y, min.z, max.x, max.y, max.z];
      const valid = values.every(finite);
      if (!valid) return {
        available: true, min: null, max: null, size: null, finite: false
      };
      return {
        available: true,
        min: { x: round(min.x), y: round(min.y), z: round(min.z) },
        max: { x: round(max.x), y: round(max.y), z: round(max.z) },
        size: {
          x: round(max.x - min.x), y: round(max.y - min.y), z: round(max.z - min.z)
        },
        finite: true
      };
    } catch (error) {
      return { available: false, min: null, max: null, size: null, finite: null, error: String(error && error.message || error) };
    }
  }

  function actorRecord(actor, role) {
    const candidate = actor && (actor.parts && actor.parts.root || actor.root || actor.actor || actor);
    if (!candidate || typeof candidate !== 'object') return null;
    const position = readPosition(candidate);
    return {
      role,
      name: String(candidate.name || actor.name || role),
      position,
      alive: actor.alive === undefined ? null : actor.alive === true,
      faction: actor.faction == null ? null : String(actor.faction),
      recruited: actor.recruited === true,
      enabled: safeCall(() => typeof candidate.isEnabled === 'function' ? candidate.isEnabled() : candidate.isVisible !== false, null),
      finitePosition: !!position && finite(position.x) && finite(position.y) && finite(position.z)
    };
  }

  function mapActors(values, role, limit) {
    const source = Array.isArray(values) ? values : [];
    return {
      count: source.length,
      returned: source.slice(0, limit).map(actor => actorRecord(actor, role)).filter(Boolean),
      truncated: Math.max(0, source.length - limit)
    };
  }

  function mapStructureAudit(audit) {
    if (!audit || typeof audit !== 'object') return null;
    const fields = [
      'safe', 'status', 'reason', 'name', 'kind', 'island', 'islandIndex',
      'x', 'z', 'rootY', 'centerGroundY', 'footingY', 'anchorErrorMeters',
      'minimumFootingGroundY', 'minimumDryGroundY', 'minimumDryClearanceMeters',
      'maximumFootprintReliefMeters', 'dryLandMarginMeters', 'islandRadiusRatio',
      'footprintRadiusMeters', 'enabled', 'distanceToCameraMeters',
      'visibilityLimitMeters', 'lastAction'
    ];
    const structures = (Array.isArray(audit.structures) ? audit.structures : []).map(row => {
      const result = {};
      for (const field of fields) {
        if (row && row[field] !== undefined) result[field] = row[field];
      }
      return result;
    });
    return {
      schema: audit.schema == null ? null : audit.schema,
      total: finite(audit.total) ? audit.total : structures.length,
      groundedCount: finite(audit.groundedCount) ? audit.groundedCount : null,
      unsafeCount: finite(audit.unsafeCount) ? audit.unsafeCount : null,
      unsafeVisibleBeforeRepair: finite(audit.unsafeVisibleBeforeRepair) ? audit.unsafeVisibleBeforeRepair : null,
      visibleInvalidAfterRepair: finite(audit.visibleInvalidAfterRepair) ? audit.visibleInvalidAfterRepair : null,
      hiddenUnsafe: finite(audit.hiddenUnsafe) ? audit.hiddenUnsafe : null,
      hiddenByDistance: finite(audit.hiddenByDistance) ? audit.hiddenByDistance : null,
      repaired: finite(audit.repaired) ? audit.repaired : null,
      untrackedRootCount: finite(audit.untrackedRootCount) ? audit.untrackedRootCount : null,
      untrackedRoots: Array.isArray(audit.untrackedRoots) ? audit.untrackedRoots.slice(0, 100) : [],
      structures
    };
  }

  function capture(context = {}, options = {}) {
    const scene = context.scene;
    if (!scene || !Array.isArray(scene.meshes)) {
      throw new Error('Babylon scene is not available for world inspection.');
    }
    const maxMeshes = Math.max(100, Math.min(5000, Math.floor(Number(options.maxMeshes) || 2500)));
    const maxActors = Math.max(20, Math.min(500, Math.floor(Number(options.maxActors) || 180)));
    const includeMeshes = options.includeMeshes !== false;
    const allMeshes = scene.meshes;
    const selectedMeshes = includeMeshes ? allMeshes.slice(0, maxMeshes) : [];
    const meshRows = selectedMeshes.map(mesh => {
      const position = readPosition(mesh);
      const rotation = mesh.rotationQuaternion
        ? { quaternion: safeCall(() => ({
            x: round(mesh.rotationQuaternion.x), y: round(mesh.rotationQuaternion.y),
            z: round(mesh.rotationQuaternion.z), w: round(mesh.rotationQuaternion.w)
          })) }
        : {
            x: round(mesh.rotation && mesh.rotation.x),
            y: round(mesh.rotation && mesh.rotation.y),
            z: round(mesh.rotation && mesh.rotation.z)
          };
      const scaling = mesh.scaling ? {
        x: round(mesh.scaling.x), y: round(mesh.scaling.y), z: round(mesh.scaling.z)
      } : null;
      const bounds = readBounds(mesh);
      const vertices = safeCall(() => typeof mesh.getTotalVertices === 'function' ? mesh.getTotalVertices() : null);
      const indices = safeCall(() => typeof mesh.getTotalIndices === 'function' ? mesh.getTotalIndices() : null);
      const enabled = safeCall(() => typeof mesh.isEnabled === 'function' ? mesh.isEnabled() : mesh.isVisible !== false, null);
      return {
        uniqueId: finite(mesh.uniqueId) ? mesh.uniqueId : null,
        name: String(mesh.name || mesh.id || 'unnamed-mesh'),
        id: mesh.id == null ? null : String(mesh.id),
        parent: mesh.parent ? String(mesh.parent.name || mesh.parent.id || 'unnamed-parent') : null,
        position,
        rotation,
        scaling,
        bounds,
        vertices: finite(vertices) ? vertices : null,
        indices: finite(indices) ? indices : null,
        enabled,
        visible: mesh.isVisible !== false,
        visibility: finite(mesh.visibility) ? mesh.visibility : null,
        checkCollisions: mesh.checkCollisions === true,
        material: mesh.material ? String(mesh.material.name || 'unnamed-material') : null,
        skeleton: mesh.skeleton ? {
          name: String(mesh.skeleton.name || 'unnamed-skeleton'),
          bones: Array.isArray(mesh.skeleton.bones) ? mesh.skeleton.bones.length : null
        } : null
      };
    });

    const textures = Array.isArray(scene.textures) ? scene.textures : [];
    const textureRows = textures.slice(0, 1000).map(texture => ({
      name: String(texture && (texture.name || texture.url) || 'unnamed-texture'),
      ready: safeCall(() => typeof texture.isReady === 'function' ? texture.isReady() : null, null),
      width: safeCall(() => {
        const size = typeof texture.getSize === 'function' ? texture.getSize() : null;
        return size && finite(size.width) ? size.width : null;
      }),
      height: safeCall(() => {
        const size = typeof texture.getSize === 'function' ? texture.getSize() : null;
        return size && finite(size.height) ? size.height : null;
      })
    }));
    const pendingTextures = textureRows.filter(texture => texture.ready === false).length;
    const unknownTextureReadiness = textureRows.filter(texture => texture.ready === null).length;

    const terrainHeightAt = typeof context.terrainHeightAt === 'function' ? context.terrainHeightAt : null;
    const islands = (Array.isArray(context.land) ? context.land : []).map((island, index) => {
      const samples = [];
      if (terrainHeightAt && finite(island.x) && finite(island.z) && finite(island.r)) {
        for (const ratio of [0, 0.35, 0.7]) {
          const directions = ratio === 0 ? [0] : Array.from({ length: 8 }, (_, direction) => direction * Math.PI / 4);
          for (const angle of directions) {
            const x = island.x + Math.cos(angle) * island.r * ratio;
            const z = island.z + Math.sin(angle) * island.r * ratio;
            const y = safeCall(() => terrainHeightAt(x, z), null);
            samples.push({ x: round(x), z: round(z), radiusRatio: ratio, y: y === null || y === undefined ? null : round(Number(y), 3) });
          }
        }
      }
      const validHeights = samples.map(sample => sample.y).filter(finite);
      const minimum = validHeights.length ? Math.min(...validHeights) : null;
      const maximum = validHeights.length ? Math.max(...validHeights) : null;
      return {
        index,
        name: String(island.name || 'Island ' + (index + 1)),
        center: { x: round(island.x), z: round(island.z) },
        radius: round(island.r, 2),
        centerTerrainY: samples.find(sample => sample.radiusRatio === 0)?.y ?? null,
        terrainHeights: {
          sampleCount: samples.length,
          validSampleCount: validHeights.length,
          minimum,
          maximum,
          range: minimum === null || maximum === null ? null : round(maximum - minimum, 3),
          samples
        },
        terrainMesh: context.islandTerrainMeshes && context.islandTerrainMeshes[index]
          ? String(context.islandTerrainMeshes[index].name || 'terrain-mesh') : null
      };
    });

    const player = context.player || null;
    const playerRoot = player && player.root;
    const playerPosition = readPosition(playerRoot);
    const playerGroundY = playerPosition && terrainHeightAt
      ? round(safeCall(() => terrainHeightAt(playerPosition.x, playerPosition.z), null), 3) : null;
    const playerActor = playerRoot ? actorRecord({ root: playerRoot, alive: true }, 'player') : null;
    if (playerActor) {
      playerActor.groundY = playerGroundY;
      playerActor.groundClearance = playerGroundY === null ? null : round(playerPosition.y - playerGroundY, 3);
      const diagnostics = context.playerDiagnostics && typeof context.playerDiagnostics === 'object' ? context.playerDiagnostics : {};
      playerActor.modelReady = diagnostics.modelReady === true;
      playerActor.manualLocomotion = diagnostics.manualLocomotion === true;
      playerActor.action = diagnostics.action == null ? null : String(diagnostics.action);
      playerActor.mode = diagnostics.mode == null ? null : String(diagnostics.mode);
      playerActor.animation = {
        current: diagnostics.currentGroup == null ? null : String(diagnostics.currentGroup),
        currentPlaying: diagnostics.currentGroupPlaying === true,
        walk: diagnostics.walkGroup == null ? null : String(diagnostics.walkGroup),
        walkPlaying: diagnostics.walkPlaying === true,
        run: diagnostics.runGroup == null ? null : String(diagnostics.runGroup),
        runPlaying: diagnostics.runPlaying === true
      };
    }

    const structuresAudit = mapStructureAudit(context.lastHabitableStructureAudit);
    const registry = Array.isArray(context.habitableStructureRegistry) ? context.habitableStructureRegistry : [];
    const registeredStructures = registry.slice(0, 500).map(entry => {
      const rootNode = entry && entry.root;
      return {
        name: String(rootNode && (rootNode.name || rootNode.id) || entry && entry.kind || 'unnamed-structure'),
        kind: entry && entry.kind ? String(entry.kind) : null,
        islandIndex: finite(entry && entry.islandIndex) ? entry.islandIndex : null,
        footprintRadius: finite(entry && entry.footprintRadius) ? round(entry.footprintRadius, 2) : null,
        baseOffset: finite(entry && entry.baseOffset) ? round(entry.baseOffset, 3) : null,
        lastStatus: entry && entry.lastStatus ? String(entry.lastStatus) : null,
        lastAction: entry && entry.lastAction ? String(entry.lastAction) : null,
        position: readPosition(rootNode),
        enabled: rootNode ? safeCall(() => typeof rootNode.isEnabled === 'function' ? rootNode.isEnabled() : rootNode.isVisible !== false, null) : null
      };
    });

    const animationGroups = Array.isArray(scene.animationGroups) ? scene.animationGroups : [];
    const animationRows = animationGroups.slice(0, 500).map(group => ({
      name: String(group.name || 'unnamed-animation'),
      playing: group.isPlaying === true,
      from: finite(group.from) ? group.from : null,
      to: finite(group.to) ? group.to : null,
      targetedAnimations: Array.isArray(group.targetedAnimations) ? group.targetedAnimations.length : null
    }));

    const villageRows = (Array.isArray(context.villages) ? context.villages : []).map((village, index) => ({
      index,
      name: String(village.name || 'Aldea ' + (index + 1)),
      claimed: village.claimed === true,
      guardCount: Array.isArray(village.guards) ? village.guards.length : 0,
      aliveGuardCount: Array.isArray(village.guards) ? village.guards.filter(guard => guard && guard.alive !== false).length : 0,
      position: { x: round(village.x), z: round(village.z) }
    }));

    const meshTransformIssues = meshRows.filter(mesh =>
      !mesh.position || !finite(mesh.position.x) || !finite(mesh.position.y) || !finite(mesh.position.z) ||
      mesh.bounds.finite === false
    ).map(mesh => ({
      uniqueId: mesh.uniqueId, name: mesh.name, position: mesh.position,
      boundsFinite: mesh.bounds.finite
    }));

    const collisionMeshes = meshRows.filter(mesh => mesh.checkCollisions).length;
    const worldColliders = Array.isArray(context.worldColliders) ? context.worldColliders : [];
    const colliderRows = worldColliders.slice(0, 1500).map((collider, index) => ({
      index,
      name: String(collider && (collider.name || collider.id || collider.node?.name || collider.mesh?.name) || 'world-collider-' + index),
      type: collider && collider.type != null ? String(collider.type) : null,
      x: round(collider?.x, 3),
      z: round(collider?.z, 3),
      radius: finite(collider?.r) ? round(collider.r, 3) : null,
      halfWidth: finite(collider?.hx) ? round(collider.hx, 3) : null,
      halfDepth: finite(collider?.hz) ? round(collider.hz, 3) : null,
      active: collider && collider.active === undefined ? true : !!(collider && collider.active)
    }));
    const invalidColliderCount = colliderRows.filter(collider => collider.x === null || collider.z === null).length;
    const terrainRanges = islands.map(island => island.terrainHeights.range).filter(finite);
    const overallTerrainRange = terrainRanges.length
      ? { minimum: round(Math.min(...islands.map(island => island.terrainHeights.minimum).filter(finite)), 3),
          maximum: round(Math.max(...islands.map(island => island.terrainHeights.maximum).filter(finite)), 3) }
      : null;
    const enemyShipCrew = (Array.isArray(context.enemyShips) ? context.enemyShips : [])
      .flatMap(vessel => Array.isArray(vessel && vessel.crew) ? vessel.crew : []);
    const actorSets = {
      player: playerActor,
      hostileVillageGuards: mapActors(context.enemies, 'hostile-village-guard', maxActors),
      campGuards: mapActors(context.campGuards, 'camp-guard', maxActors),
      companions: mapActors(context.companions, 'companion', maxActors),
      enemyShipCrew: mapActors(enemyShipCrew, 'enemy-ship-crew', maxActors),
      wildlife: mapActors(context.ambientFauna, 'wildlife', maxActors),
      ambientPeople: mapActors(context.ambientPeople, 'ambient-person', maxActors),
      ambientBirds: mapActors(context.ambientBirds, 'ambient-bird', maxActors)
    };

    const runtime = context.runtime && typeof context.runtime === 'object' ? context.runtime : {};
    return {
      schemaVersion: 1,
      kind: 'babylon-world-inspection',
      capturedAt: new Date().toISOString(),
      source: 'Babylon.js runtime · same-origin game scene',
      runtime: {
        gameStarted: runtime.gameStarted === true,
        worldUpdatePhase: runtime.worldUpdatePhase == null ? null : String(runtime.worldUpdatePhase),
        worldUpdateCount: finite(runtime.worldUpdateCount) ? runtime.worldUpdateCount : null,
        fps: finite(runtime.fps) ? runtime.fps : null,
        graphicsProfile: runtime.graphicsProfile == null ? null : String(runtime.graphicsProfile)
      },
      scene: {
        meshCount: allMeshes.length,
        transformNodeCount: Array.isArray(scene.transformNodes) ? scene.transformNodes.length : null,
        materialCount: Array.isArray(scene.materials) ? scene.materials.length : null,
        textureCount: textures.length,
        pendingTextureCount: pendingTextures,
        unknownTextureReadinessCount: unknownTextureReadiness,
        animationGroupCount: animationGroups.length,
        playingAnimationGroupCount: animationRows.filter(row => row.playing).length,
        activeMeshCount: safeCall(() => scene.getActiveMeshes && scene.getActiveMeshes().length, null),
        totalVertices: safeCall(() => scene.getTotalVertices && scene.getTotalVertices(), null),
        collisionsEnabled: scene.collisionsEnabled === true,
        collisionEnabledMeshCount: collisionMeshes,
        worldColliderCount: worldColliders.length
      },
      collisions: {
        sceneCollisionsEnabled: scene.collisionsEnabled === true,
        collisionEnabledMeshCount: collisionMeshes,
        customColliderCount: worldColliders.length,
        returned: colliderRows.length,
        truncated: Math.max(0, worldColliders.length - colliderRows.length),
        invalidPositionCount: invalidColliderCount,
        items: colliderRows
      },
      terrain: {
        islandsSampled: islands.filter(island => island.terrainHeights.validSampleCount > 0).length,
        sampleCount: islands.reduce((sum, island) => sum + island.terrainHeights.validSampleCount, 0),
        overallHeightRange: overallTerrainRange
      },
      islands: {
        expectedCount: 13,
        count: islands.length,
        complete: islands.length === 13,
        items: islands
      },
      actors: {
        player: actorSets.player,
        hostileVillageGuards: actorSets.hostileVillageGuards,
        campGuards: actorSets.campGuards,
        companions: actorSets.companions,
        wildlife: actorSets.wildlife,
        ambientPeople: actorSets.ambientPeople,
        ambientBirds: actorSets.ambientBirds,
        enemyShipCrew: actorSets.enemyShipCrew,
        villages: villageRows
      },
      structures: {
        registeredCount: registry.length,
        registered: registeredStructures,
        auditAvailable: !!structuresAudit,
        audit: structuresAudit
      },
      animations: {
        count: animationGroups.length,
        playingCount: animationRows.filter(row => row.playing).length,
        items: animationRows
      },
      textures: {
        count: textures.length,
        pendingCount: pendingTextures,
        unknownReadinessCount: unknownTextureReadiness,
        items: textureRows
      },
      meshes: {
        count: allMeshes.length,
        returned: meshRows.length,
        truncated: Math.max(0, allMeshes.length - meshRows.length),
        included: includeMeshes,
        items: meshRows,
        invalidTransformCount: meshTransformIssues.length,
        invalidTransforms: meshTransformIssues.slice(0, 100)
      },
      captureLimits: { maxMeshes, maxActors },
      dataQuality: {
        sceneAvailable: true,
        islandRegistryComplete: islands.length === 13,
        fullMeshInventory: includeMeshes && meshRows.length === allMeshes.length,
        structureAuditAvailable: !!structuresAudit,
        textureReadinessComplete: textureRows.length === textures.length,
        colliderInventoryComplete: colliderRows.length === worldColliders.length,
        terrainSamplesAvailable: islands.every(island => island.terrainHeights.validSampleCount > 0)
      }
    };
  }

  root.ELSNWorldInspection = Object.freeze({ schemaVersion: 1, capture });
})(typeof window !== 'undefined' ? window : globalThis);
