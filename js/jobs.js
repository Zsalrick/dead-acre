// ================= JOB TYPES =================
// survive: the classic clock · exterminate: kill a number of zombies · defense: keep a generator alive until the clock
// runs out · supply: pick up crates scattered on the map. Objective jobs have no clock: the threat rises every minute,
// and when the goal is met the van comes (EVAC_WARN seconds later). In a party the host keeps score; members follow.
const JOB_TYPES = {
  survive:     { name: 'Túlélés', label: null },
  exterminate: { name: 'Irtás', label: 'IRTÁS', desc: j => `Ölj meg ${j.goal} zombit. Nincs időkorlát.` },
  defense:     { name: 'Védelem', label: null, desc: j => `Védd meg a generátort ${fmtTime(j.dur)}-ig. Ha elpusztul, a munka elbukik.` },
  test:        { name: 'Lőtér', label: 'LŐTÉR', desc: () => 'Célbábuk, végtelen lőszer, csere a társakkal.' },
  supply:      { name: 'Utánpótlás', label: 'UTÁNPÓTLÁS', desc: j => `Gyűjts össze ${j.goal} utánpótlás-ládát. Nincs időkorlát.` },
};
const noClock = job => !!(job && (job.test || job.bounty || job.type === 'exterminate' || job.type === 'supply'));
const objDone = M => !!(M.bountyDone || M.objDone);

function setupObjective(M) {
  M.kc = 0;
  if (M.job.type === 'defense') buildGenerator(M);
  if (M.job.type === 'supply') buildCrates(M);
}
// ---------- defense: the generator ----------
function buildGenerator(M) {
  const R = MAIN_RECT, cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2;
  let spot = null;
  for (let r = 0; r < 24 && !spot; r += 2) for (let a = 0; a < 6.28 && !spot; a += .45) { const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; if (!blockedAt(x, z, 2.4)) spot = [x, z]; }
  const [x, z] = spot || [cx, cz];
  const body = matStd({ color: 0x4a5a3a, metalness: .5, roughness: .5 }), dark = matStd({ color: 0x1c1d1f, metalness: .6, roughness: .4 });
  addBox(x, z, 1.8, 1.2, 1.1, body);
  addBox(x, z, 1.9, 1.3, .12, dark, 1.1, false);
  [-.5, .5].forEach(o => { const c = put(new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, 1, 14), dark)); c.rotation.z = Math.PI / 2; c.position.set(x, .75, z + o * .9); });
  const pipe = put(new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1.2, 8), dark)); pipe.position.set(x + .6, 1.6, z - .3);
  const lampM = new THREE.MeshBasicMaterial({ color: 0x6aff6a }), lamp = put(new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), lampM)); lamp.position.set(x - .6, 1.3, z + .45);
  const light = pointLight(0x9aff7a, 1.4, 10, x, 2.2, z);
  label(['GENERÁTOR'], '#9aff7a', 1.8, x, 2.6, z);
  const max = 6000 * (1 + .3 * (M.job.diff - 1));
  M.gen = { pos: new V3(x, 0, z), hp: max, max, lampM, light, hitT: -9, target: { pos: new V3(x, 0, z), vel: new V3(), alive: true, gen: true } };
}
// ---------- supply: crates in seeded spots, the same for everyone in a party ----------
function buildCrates(M) {
  const R = MAIN_RECT, rng = mulberry(mapSeed + 991), n = M.job.goal || 6, pts = [];
  for (let tries = 0; pts.length < n && tries < 600; tries++) {
    const x = R.minX + 4 + rng() * (R.maxX - R.minX - 8), z = R.minZ + 4 + rng() * (R.maxZ - R.minZ - 8);
    if (blockedAt(x, z, 1.4) || pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 10)) continue;
    pts.push([x, z]);
  }
  const wood = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xb89a5a }), stripe = new THREE.MeshBasicMaterial({ color: 0xf2c12a });
  M.crates = pts.map(([x, z]) => {
    const g = new THREE.Group(), b = new THREE.Mesh(unitBox, wood); b.scale.set(1, .7, .7); b.position.y = .35; g.add(b);
    const s = new THREE.Mesh(unitBox, stripe); s.scale.set(1.02, .12, .72); s.position.y = .5; g.add(s);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xf2c12a, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 7; g.add(beam);
    g.position.set(x, 0, z); put(g);
    return { pos: new V3(x, 0, z), got: false, g };
  });
  M.job.goal = M.crates.length;
}
const GEN_REPAIR = 600;
function crateFocus() { // also the generator's repair spot
  const M = mission; if (!M) return null;
  if (M.gen && M.gen.hp > 0 && M.gen.hp < M.gen.max && Math.hypot(M.gen.pos.x - player.pos.x, M.gen.pos.z - player.pos.z) < 2.6) return { type: 'repair' };
  if (!M.crates) return null;
  const i = M.crates.findIndex(c => !c.got && Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 2.2);
  return i >= 0 ? { type: 'crate', i } : null;
}
function repairGen() { // points for a quarter of the generator back
  const M = mission; if (!M || !M.gen || player.points < GEN_REPAIR) return SND.deny();
  player.points -= GEN_REPAIR; SND.buy(); burst(M.gen.pos.clone().setY(1.2), 0x9aff7a, 20, 3, .6);
  if (NET.client) netAct('repair'); else M.gen.hp = Math.min(M.gen.max, M.gen.hp + M.gen.max * .25);
}
function takeCrate(i, remote) {
  const c = mission && mission.crates && mission.crates[i]; if (!c || c.got) return;
  c.got = true; c.g.visible = false;
  if (!remote) { SND.pickup(2); popText(`Utánpótlás-láda · ${mission.crates.filter(c => c.got).length}/${mission.crates.length}`, '#f2c12a'); if (NET.client) netAct('crate', i); }
}

// ---------- every frame (solo or host) ----------
function updateObjective(M, dt) {
  const J = M.job;
  if (M.gen) {
    const hurt = now - M.gen.hitT < .3;
    M.gen.lampM.color.setHex(M.gen.hp <= 0 ? 0x333333 : hurt ? 0xff4a3a : M.gen.hp < M.gen.max * .3 ? 0xffa03a : 0x6aff6a);
    M.gen.light.intensity = M.gen.hp <= 0 ? 0 : hurt ? 2.5 : 1.4;
    if (hurt && Math.random() < dt * 20) burst(M.gen.pos.clone().setY(1.2), 0xffc070, 1, 2, .3);
    if (M.gen.hp <= 0 && !NET.client) { M.gen.target.alive = false; banner('A GENERÁTOR ELPUSZTULT', 'A munka elbukott.'); SND.explode(); return 'fail'; }
  }
  if (objDone(M) || NET.client) return;
  if (J.type === 'exterminate' && M.kc >= J.goal) objectiveDone(M, 'TISZTA A TEREP');
  if (J.type === 'supply' && M.crates && M.crates.length && M.crates.every(c => c.got)) objectiveDone(M, 'MINDEN LÁDA MEGVAN');
}
function objectiveDone(M, title) {
  M.objDone = true; M.job.dur = M.t + EVAC_WARN + 1;
  banner(title, 'Jön a furgon. Irány a zöld jelzés!'); SND.power();
}
// HUD: the big line up top and the line under the threat level
function objectiveTimer(M) {
  const L = M.job.bounty ? 'FEJVADÁSZAT' : JOB_TYPES[M.job.type] && JOB_TYPES[M.job.type].label;
  return noClock(M.job) && !objDone(M) ? L : null;
}
function objectiveLine(M) {
  const J = M.job;
  if (J.test) return 'Lőtér · célbábuk · Esc → Vissza a bázisra';
  if (J.type === 'exterminate' && !objDone(M)) return `Irtás · ${Math.min(M.kc || 0, J.goal)} / ${J.goal} zombi`;
  if (J.type === 'supply' && !objDone(M)) return `Utánpótlás · ${M.crates ? M.crates.filter(c => c.got).length : 0} / ${J.goal} láda · kövesd a sárga fényt`;
  if (J.type === 'defense' && M.gen && M.phase !== 'evac') return `Generátor ${Math.max(0, Math.round(M.gen.hp / M.gen.max * 100))}% · ${M.wave}. hullám`;
  return null;
}

// ---------- the testing ground: dummies that stand still and get back up, no waves, no clock, endless ammo ----------
function spawnDummy(x, z) {
  const d = spawnZombieAt('walker', x, z, 0);
  Object.assign(d, { dummy: true, speed: 0, dmg: 0, spot: [x, z], hp: zombieHp() * 40 }); d.maxHp = d.hp; d.g.position.set(x, 0, z);
  return d;
}
function setupTestGround(M) {
  M.dummyQ = [];
  const c = new V3(-truck.pos.x, 0, -truck.pos.z).normalize(), side = new V3(-c.z, 0, c.x);
  for (const [d, o] of [[9, -4], [13, 3], [18, -2], [24, 4], [30, 0], [38, -5]]) {
    const x = truck.pos.x + c.x * d + side.x * o, z = truck.pos.z + c.z * d + side.z * o;
    if (!blockedAt(x, z, 1)) spawnDummy(x, z);
  }
}
function testRefill() { [...player.slots, ...player.bag].forEach(w => { if (w && w.reserve < resMax(w)) w.reserve = resMax(w); }); }
function updateTestGround(M, dt) {
  M.t += dt; testRefill();
  for (const q of M.dummyQ) q.t -= dt;
  M.dummyQ = M.dummyQ.filter(q => q.t > 0 || (spawnDummy(q.spot[0], q.spot[1]), false));
}
