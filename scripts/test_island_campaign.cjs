'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const land=html.match(/const land=\[([\s\S]*?)\];/);
assert.ok(land,'No se encuentra la definición del archipiélago.');
assert.equal((land[1].match(/\{x:/g)||[]).length,13,'El mapa debe contener exactamente trece islas.');
assert.match(html,/<b id="captured">0\/13<\/b>/,'El HUD debe mostrar 0/13 desde el primer fotograma.');
assert.doesNotMatch(html,/<b id="captured">0\/4<\/b>/,'No debe quedar el contador antiguo 0/4.');
assert.match(html,/for\(let islandIndex=4;islandIndex<land\.length;islandIndex\+\+\)makeIslandGarrison\(islandIndex\);/);
assert.match(html,/function makeIslandGarrison\\(islandIndex\\)/);
assert.match(html,/function settlementHousePosition\\(island,x,z,scale=1\\)/,
  "Village huts must use an explicit safe interior placement function.");
assert.match(html,/const houseSpecs=\\[\\[x,z,\\.90\\],\\[x-7,z\\+7,\\.66\\],\\[x\\+8,z-5,\\.62\\]\\]/,
  "The three existing hut positions and scales must be preserved before safety projection.");
assert.match(html,/settlementHousePosition\\(land\\[index\\],hx,hz,scale\\)/,
  "Every hut must be grounded against its own island, not a different nearest island.");
const placementSource=html.match(/function settlementHousePosition\\(island,x,z,scale=1\\)\\{[\\s\\S]*?\\n \\}/);
assert.ok(placementSource,"The full deterministic settlement placement function must be present.");
const settlementHousePosition=new Function(placementSource[0]+"; return settlementHousePosition;")();
const testSettlements=[
  {island:{x:0,z:0,r:60},houses:[[31,-17,.90],[24,-10,.66],[39,-22,.62]]},
  {island:{x:135,z:14,r:31},houses:[[135,14,.90],[128,21,.66],[143,9,.62]]},
  {island:{x:-132,z:45,r:33},houses:[[-132,45,.90],[-139,52,.66],[-124,40,.62]]},
  {island:{x:28,z:143,r:33},houses:[[28,143,.90],[21,150,.66],[36,138,.62]]}
];
for(const settlement of testSettlements)for(const [x,z,scale] of settlement.houses){
  const placed=settlementHousePosition(settlement.island,x,z,scale);
  const distance=Math.hypot(placed.x-settlement.island.x,placed.z-settlement.island.z);
  const footprint=Math.hypot(2.01*scale,2.64*scale);
  assert.ok(distance+footprint<=settlement.island.r*.76-1.25+1e-8,
    "The complete hut footprint must remain at least 1.25 m inside the grass/sand transition.");
}
const movedBeachHut=settlementHousePosition(testSettlements[0].island,39,-22,.62);
assert.equal(movedBeachHut.adjusted,true,"The outer Raven village hut must be moved inward off the beach transition.");
assert.ok(Math.hypot(movedBeachHut.x,movedBeachHut.z)<Math.hypot(39,-22),
  "A hut overlapping the coast must be moved toward the island centre.");
assert.match(html,/function claimVillage\(vl,restoring=false\)/);
assert.match(html,/captured\+'\/'\+land\.length/);
assert.match(html,/function updateIslandInvasion\(dt\)/,'La fase naval debe tener una actualización activa.');
assert.match(html,/updateIslandInvasion\(dt\);/,'La actualización naval debe estar conectada al bucle principal.');
assert.match(html,/function spawnIslandInvasionWave\(\)/);
assert.match(html,/function invasionDisembark\(ship,vl\)/);
assert.match(html,/invasionDisembark\(raider,invasionTarget\)/,'Los barcos deben alcanzar la costa y ejecutar el desembarco.');
assert.match(html,/raider\.islandInvasionShip&&raider\.invasionPhase==='sailing'/,'Los barcos deben tener una fase de navegación de invasión.');
assert.match(html,/function loseIslandHolding\(vl\)/,'El asedio debe poder hacer caer un territorio.');
assert.match(html,/if\(attacker\.islandInvader\)return landIslandIndex\(x,z\)===attacker\.targetVillageIndex;/,'Los invasores deben poder combatir en la isla sitiada.');
assert.match(html,/const islandInvaders=enemies\.filter\(g=>g&&g\.alive&&g\.islandInvader&&g\.targetVillageIndex===vl\.index\)/,'Los invasores deben impedir la reconquista hasta ser derrotados.');
assert.match(html,/islandInvasion:snapshotIslandInvasion\(\)/,'El estado de la invasión debe guardarse.');
assert.match(html,/restoreIslandInvasion\(d\.islandInvasion\)/,'El estado de la invasión debe recuperarse.');
assert.match(html,/function snapshotIslandInvasion\(\)/);
assert.match(html,/function resetIslandInvasion\(\)/);
console.log('OK: 13 islas, HUD inicial, puestos, combate, navegación, desembarco, asedio, pérdida/reconquista y guardado de invasión.');
