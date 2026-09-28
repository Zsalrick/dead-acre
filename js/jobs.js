// ================= JOB TYPES =================
// survive: the classic clock · exterminate: kill a number of zombies · defense: keep a generator alive until the clock
// runs out · supply: pick up crates scattered on the map. Objective jobs have no clock: the threat rises every minute,
// and when the goal is met the van comes (EVAC_WARN seconds later). In a party the host keeps score; members follow.
const JOB_TYPES = {
  survive:     { name: 'Túlélés', label: null },
  exterminate: { name: 'Irtás', label: 'IRTÁS', desc: j => `Ölj meg ${j.goal} zombit. Nincs időkorlát.` },
  defense:     { name: 'Védelem', label: null, desc: j => `Védd meg a generátort ${fmtTime(j.dur)}-ig. Ha elpusztul, a munka elbukik.` },
  escort:      { name: 'Kíséret', label: 'KÍSÉRET', desc: j => 'Kísérd el a túlélőt a furgonig. Csak akkor megy, ha valaki mellette van; ha meghal, a munka elbukik.' },
  test:        { name: 'Lőtér', label: 'LŐTÉR', desc: () => 'Célbábuk, végtelen lőszer, csere a társakkal.' },
  supply:      { name: 'Utánpótlás', label: 'UTÁNPÓTLÁS', desc: j => `Gyűjts össze ${j.goal} utánpótlás-ládát. Nincs időkorlát.` },
};
// directives (The Division): hardships you choose before a job, each paying more XP, cash and loot luck
const DIRECTIVES = {
  noregen: { name: 'Nincs regeneráció', desc: 'Az életerő nem töltődik magától, csak gyógycsomaggal.' },
  ammo:    { name: 'Szűkös lőszer', desc: 'Fele akkora tartalék lőszer.' },
  tough:   { name: 'Edzett horda', desc: 'A zombik 25%-kal többet bírnak.' },
  fragile: { name: 'Törékeny', desc: '30%-kal több sebzést kapsz.' },
  blind:   { name: 'Vakon', desc: 'Nincs iránytű és nincs életerő-csík a zombikon.' },
};
const dirOn = k => !!(mission && mission.job.dir && mission.job.dir.includes(k));
const dirCount = job => (job && job.dir ? job.dir.length : 0);
const noClock = job => !!(job && (job.test || job.type === 'escort' || job.bounty || job.type === 'exterminate' || job.type === 'supply'));
const objDone = M => !!(M.bountyDone || M.objDone);

function setupObjective(M) {
  M.kc = 0;
  if (M.job.type === 'defense') buildGenerator(M);
  if (M.job.type === 'supply') buildCrates(M);
  if (M.job.type === 'escort') buildEscort(M);
}
// ---------- defense: three generators; if any one falls the job is lost; hold E to repair (5%/s for points) ----------
const GEN_REP_RATE = .05, GEN_REP_COST = 300; // per second of holding E
function buildGenerator(M) {
  const R = MAIN_RECT, cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2, spots = [];
  for (let k = 0; k < 3; k++) { // spread round the middle, a third of a turn apart
    let spot = null;
    for (let r = 12; r < 30 && !spot; r += 2) for (let da = 0; da < 1.2 && !spot; da += .2) { const a = k * 2.094 + .5 + da, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; if (!blockedAt(x, z, 2.4) && spots.every(s => Math.hypot(s[0] - x, s[1] - z) > 10)) spot = [x, z]; }
    spots.push(spot || [cx + (k - 1) * 12, cz]);
  }
  const body = matStd({ color: 0x4a5a3a, metalness: .5, roughness: .5 }), dark = matStd({ color: 0x1c1d1f, metalness: .6, roughness: .4 }), max = 2600 * (1 + .3 * (M.job.diff - 1));
  M.gens = spots.map(([x, z], k) => {
    addBox(x, z, 1.8, 1.2, 1.1, body);
    addBox(x, z, 1.9, 1.3, .12, dark, 1.1, false);
    [-.5, .5].forEach(o => { const c = put(new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, 1, 14), dark)); c.rotation.z = Math.PI / 2; c.position.set(x, .75, z + o * .9); });
    const pipe = put(new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1.2, 8), dark)); pipe.position.set(x + .6, 1.6, z - .3);
    const lampM = new THREE.MeshBasicMaterial({ color: 0x6aff6a }), lamp = put(new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), lampM)); lamp.position.set(x - .6, 1.3, z + .45);
    const light = pointLight(0x9aff7a, 1.2, 9, x, 2.2, z), name = 'ABC'[k];
    label([`GENERÁTOR ${name}`], '#9aff7a', 1.2, x, 3.3, z);
    return { name, pos: new V3(x, 0, z), hp: max, max, lampM, light, hitT: -9, target: { pos: new V3(x, 0, z), vel: new V3(), alive: true, gen: true, gi: k } };
  });
  M.gen = M.gens[0]; // older code paths look at one generator: the first
}
// ---------- supply: crates in seeded spots; carry them one at a time, in both hands, to a drop-off van that turns up later ----------
const DROP_AT = 40; // seconds before the drop-off van arrives
function buildCrates(M) {
  const R = MAIN_RECT, rng = mulberry(mapSeed + 991), n = Math.min(M.job.goal || 6, 3 + (M.job.diff || 1)), pts = [];
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
    return { pos: new V3(x, 0, z), st: 0, by: '', g, beam }; // st: 0 on the ground, 1 carried, 2 delivered
  });
  M.job.goal = M.crates.length;
}
const myCarryId = () => NET.mode ? (NET.host ? 'H' : NET.me) : 'me';
function buildDropVan(M, x, z) { // the drop-off: a parked van with its doors open, a light bar and a beam
  const g = new THREE.Group(), paint = new THREE.MeshLambertMaterial({ color: 0x5a6a3a }), dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const bx = (m, sx, sy, sz, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(sx, sy, sz); e.position.set(px, py, pz); e.castShadow = true; g.add(e); };
  bx(paint, 2.2, 2.2, 4.6, 0, 1.4, 0); bx(paint, 2, 1.2, 1.4, 0, .9, 2.9); bx(dark, 2.1, .5, .1, 0, 2.1, -2.32); bx(new THREE.MeshBasicMaterial({ color: 0xf2c12a }), 2.24, .2, 4.64, 0, 1.9, 0);
  bx(new THREE.MeshBasicMaterial({ color: 0xffa020 }), .5, .15, .3, -.5, 2.6, 1); bx(new THREE.MeshBasicMaterial({ color: 0xffa020 }), .5, .15, .3, .5, 2.6, 1);
  for (const [a, b] of [[-1, -1.5], [1, -1.5], [-1, 2.9], [1, 2.9]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .3, 12), dark); t.rotation.z = Math.PI / 2; t.position.set(a * 1.1, .45, b); g.add(t); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dff6a, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 15; g.add(beam);
  g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); put(g); label(['LERAKÓ'], '#9dff6a', 1.1, x, 3.6, z);
  obstacles.push({ minX: x - 1.6, maxX: x + 1.6, minZ: z - 1.6, maxZ: z + 1.6, h: 2.4 });
  burst(new V3(x, .4, z), 0x8a7a5a, 30, 5, .8); SND.roar();
  M.drop = { pos: new V3(x, 0, z), g };
  banner('MEGÉRKEZETT A LERAKÓ FURGON', 'Vidd oda a ládákat: E-vel veszed fel, a furgonnál E-vel adod le.');
}
function pickDropSpot(M) { // somewhere clear, not on top of the start
  const R = MAIN_RECT, rng = mulberry(mapSeed + 4242);
  for (let k = 0; k < 400; k++) { const x = R.minX + 8 + rng() * (R.maxX - R.minX - 16), z = R.minZ + 8 + rng() * (R.maxZ - R.minZ - 16);
    if (!blockedAt(x, z, 3.2) && Math.hypot(x - truck.pos.x, z - truck.pos.z) > 22) return [x, z]; }
  return [0, 0];
}
// the actions, on the host (or solo); a party member asks for them with netAct('crate', [i, act, x, z])
function crateTake(i, by) { const c = mission.crates[i]; if (!c || c.st !== 0 || mission.crates.some(o => o.st === 1 && o.by === by)) return; c.st = 1; c.by = by; }
function crateDrop(i, x, z) { const c = mission.crates[i]; if (!c || c.st !== 1) return; c.st = 0; c.by = ''; c.pos.set(x, 0, z); }
function crateDeliver(i) { const c = mission.crates[i], M = mission; if (!c || c.st !== 1 || !M.drop) return; c.st = 2; c.by = ''; burst(M.drop.pos.clone().setY(1.2), 0xf2c12a, 18, 3, .6); SND.buy();
  popText(`Láda leadva · ${M.crates.filter(o => o.st === 2).length}/${M.crates.length}`, '#f2c12a'); }
function crateAct(i, act, x, z) { if (!NET.client) { if (act === 't') crateTake(i, myCarryId()); else if (act === 'd') crateDrop(i, x, z); else if (act === 'v') crateDeliver(i); } else netAct('crate', [i, act, Math.round(x * 10), Math.round(z * 10)]); }
function carryAct() { // E while carrying: hand it in at the van, or set it down just in front of you
  const M = mission, i = player.carry; if (i == null || !M.crates[i]) return;
  if (M.drop && Math.hypot(M.drop.pos.x - player.pos.x, M.drop.pos.z - player.pos.z) < 5) { crateAct(i, 'v'); if (!NET.client) player.carry = null; return; }
  const f = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), p = player.pos.clone().addScaledVector(f, 1.3); clampBounds(p, .6);
  crateAct(i, 'd', p.x, p.z); if (!NET.client) player.carry = null; SND.pickup(0);
}
function updateCrates(M, dt) { // every player, every frame: where each crate is and who holds it
  if (!M.crates) return;
  const me = myCarryId(), f = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  if (!NET.client) { player.carry = null; M.crates.forEach((c, i) => { if (c.st === 1 && c.by === me) player.carry = i; }); }
  if (player.carry != null && player.down) { const c = M.crates[player.carry]; crateAct(player.carry, 'd', player.pos.x, player.pos.z); if (!NET.client) player.carry = null; } // going down drops it
  for (const [i, c] of M.crates.entries()) {
    c.g.visible = c.st !== 2; c.beam.visible = c.st === 0;
    if (c.st === 1) {
      if (c.by === me) { c.pos.copy(player.pos).addScaledVector(f, .75); c.g.position.set(c.pos.x, .55, c.pos.z); c.g.rotation.y = player.yaw; }
      else if (!NET.client) { const a = NET.avatars.get(c.by); if (a) { c.pos.set(a.pos.x, 0, a.pos.z); c.g.position.set(a.pos.x, .9, a.pos.z); } }
      else c.g.position.set(c.pos.x, .9, c.pos.z);
    } else if (c.st === 0) c.g.position.set(c.pos.x, 0, c.pos.z);
  }
  if (vm.gun) vm.gun.visible = player.carry == null; // both hands on the crate
  if (!NET.client && !M.drop && M.t >= DROP_AT) { const [x, z] = pickDropSpot(M); buildDropVan(M, x, z); }
}
const GEN_REPAIR = 600;
function crateFocus() { // also the generator's repair spot
  const M = mission; if (!M) return null;
  if (M.gens) { const gi = M.gens.findIndex(G => G.hp > 0 && G.hp < G.max && Math.hypot(G.pos.x - player.pos.x, G.pos.z - player.pos.z) < 2.8); if (gi >= 0) return { type: 'repair', gi }; }
  if (M.esc && M.esc.hp > 0 && M.esc.hp < M.esc.max && Math.hypot(M.esc.pos.x - player.pos.x, M.esc.pos.z - player.pos.z) < 2.2) return { type: 'repair' };
  if (!M.crates) return null;
  if (player.carry != null) return { type: 'carry' };
  const i = M.crates.findIndex(c => c.st === 0 && Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 2.2);
  return i >= 0 ? { type: 'crate', i } : null;
}
function repairGen() { // the escort: points for a quarter back (generators are repaired by holding E, see holdRepair)
  const M = mission, T = M && M.esc; if (!T || player.points < GEN_REPAIR) return SND.deny();
  player.points -= GEN_REPAIR; SND.buy(); burst(T.pos.clone().setY(1.2), 0x9aff7a, 20, 3, .6);
  if (NET.client) netAct('repair'); else T.hp = Math.min(T.max, T.hp + T.max * .25);
}
let repAcc = 0;
function holdRepair(gi, dt) { // hold E at a generator: 5% a second, paid by the second
  const M = mission, G = M && M.gens && M.gens[gi]; if (!G || G.hp <= 0 || G.hp >= G.max) return false;
  const cost = GEN_REP_COST * dt; if (player.points < cost) { if (!M.repWarn) { M.repWarn = true; popText('Nincs elég pont a javításhoz', '#ff8a70'); SND.deny(); } return false; }
  player.points -= cost; M.repWarn = false; const add = G.max * GEN_REP_RATE * dt;
  if (NET.client) { repAcc += add; if (repAcc > G.max * .01) { netAct('repair', [gi, Math.round(repAcc)]); repAcc = 0; } G.hp = Math.min(G.max, G.hp + add); }
  else G.hp = Math.min(G.max, G.hp + add);
  if (Math.random() < dt * 14) burst(G.pos.clone().setY(1.2 + Math.random()), 0x9aff7a, 1, 1.5, .4);
  return true;
}
function takeCrate(i) { // E on a crate: both hands on it (no shooting, sprinting or jumping)
  const c = mission && mission.crates && mission.crates[i]; if (!c || c.st !== 0) return;
  crateAct(i, 't', c.pos.x, c.pos.z); if (!NET.client) player.carry = i;
  SND.pickup(2); popText(mission.drop ? 'Vidd a lerakó furgonhoz · E: letétel' : 'A lerakó furgon még nem jött meg · E: letétel', '#f2c12a');
}

// ---------- every frame (solo or host) ----------
function updateObjective(M, dt) {
  const J = M.job; updateCrates(M, dt);
  if (M.gens) for (const G of M.gens) {
    const hurt = now - G.hitT < .3;
    G.lampM.color.setHex(G.hp <= 0 ? 0x333333 : hurt ? 0xff4a3a : G.hp < G.max * .3 ? 0xffa03a : 0x6aff6a);
    G.light.intensity = G.hp <= 0 ? 0 : hurt ? 2.5 : 1.2;
    if (hurt && Math.random() < dt * 20) burst(G.pos.clone().setY(1.2), 0xffc070, 1, 2, .3);
    if (G.hp <= 0 && !NET.client) { G.target.alive = false; banner(`A ${G.name} GENERÁTOR ELPUSZTULT`, 'A munka elbukott.'); SND.explode(); return 'fail'; }
  }
  if (M.esc) { updateEscortLook(M, dt); if (!NET.client && M.esc.hp <= 0) { M.esc.target.alive = false; banner('A TÚLÉLŐ MEGHALT', 'A munka elbukott.'); SND.roar(); return 'fail'; } }
  if (objDone(M) || NET.client) return;
  if (M.esc) updateEscort(M, dt);
  if (J.type === 'exterminate' && M.kc >= J.goal) objectiveDone(M, 'TISZTA A TEREP');
  if (J.type === 'supply' && M.crates && M.crates.length && M.crates.every(c => c.st === 2)) objectiveDone(M, 'MINDEN LÁDA LEADVA');
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
  if (J.bounty && M.phase !== 'evac') { const B = BOUNTIES[J.bounty] || BOUNTIES.butcher, boss = zombies.some(z => z.bounty && !z.dead);
    if (M.bountyDone) return M.bountyEnd ? `Fejvadászat 3/3 · tarts ki a furgonig · ${fmtTime(Math.max(0, M.bountyEnd - M.t))}` : 'Fejvadászat 3/3 · tarts ki, amíg a furgon jön';
    if (boss || M.t >= bountyPre(J)) return `Fejvadászat 2/3 · győzd le: ${B.name}`;
    return `Fejvadászat 1/3 · tarts ki · ${B.name} ${fmtTime(Math.max(0, bountyPre(J) - M.t))} múlva érkezik`; }
  if (J.type === 'escort' && M.esc && !objDone(M)) return `Kíséret · túlélő ${Math.max(0, Math.round(M.esc.hp / M.esc.max * 100))}% · ${M.esc.leg === 1 ? 'a holmijáért' : 'a furgonig'} ${Math.round(NET.client ? M.esc.netDist || 0 : M.esc.pos.distanceTo(M.esc.end))} m${M.esc.waiting ? ' · VÁR RÁD' : ''}`;
  if (J.type === 'exterminate' && !objDone(M)) return `Irtás · ${Math.min(M.kc || 0, J.goal)} / ${J.goal} zombi`;
  if (J.type === 'supply' && !objDone(M)) return `Utánpótlás · ${M.crates ? M.crates.filter(c => c.st === 2).length : 0} / ${J.goal} leadva · ${player.carry != null ? (M.drop ? 'vidd a zöld fényű furgonhoz' : 'a lerakó még nem jött meg') : M.drop ? 'hozd a ládákat (sárga fény) a lerakóhoz' : `a lerakó furgon ${Math.max(0, Math.ceil(DROP_AT - M.t))} mp múlva jön · gyűjtsd a ládákat`}`;
  if (J.type === 'defense' && M.gens && M.phase !== 'evac') return `Generátorok · ${M.gens.map(G => `${G.name} ${Math.max(0, Math.round(G.hp / G.max * 100))}%`).join(' · ')} · ${M.wave}. hullám · E nyomva: javítás`;
  return null;
}

// ---------- the testing ground: dummies that stand still and get back up, no waves, no clock, endless ammo ----------
function spawnDummy(x, z) {
  const S = (mission && mission.range) || {}, d = spawnZombieAt(S.kind || 'walker', x, z, 0);
  Object.assign(d, { dummy: true, speed: 0, dmg: 0, spot: [x, z], heading: Math.PI }); // the same health it would have on a job at your level and this wave
  if (S.rank) setZTier(d, S.rank, S.rank >= 2 && S.trait ? [S.trait] : []);
  d.maxHp = d.hp; d.g.position.set(x, 0, z);
  return d;
}
const RANGE_KINDS = ['walker', 'crawler', 'runner', 'brute', 'armored'], RANGE_TRAITS = ['rage', 'regen', 'tough', 'fast', 'vamp'];
function resetDummies(M) { // clear the lanes and stand five new targets up with the desk's settings
  for (const z of zombies) if (z.dummy && !z.dead) { z.dead = true; z.deathT = 2.9; z.g.visible = false; }
  round = M.range.wave; $('round').textContent = round;
  M.dummyQ = []; for (const [x, d] of RANGE_LANES) spawnDummy(x, RANGE_LINE - d);
}
function setupTestGround(M) {
  M.range = { rank: 0, kind: 'walker', trait: null, wave: 1 };
  resetDummies(M);
}
function testRefill() { [...player.slots, ...player.bag].forEach(w => { if (w && w.reserve < resMax(w)) w.reserve = resMax(w); }); }
function updateTestGround(M, dt) {
  M.t += dt; testRefill();
  for (const q of M.dummyQ) q.t -= dt;
  M.dummyQ = M.dummyQ.filter(q => q.t > 0 || (spawnDummy(q.spot[0], q.spot[1]), false));
}

// ---------- escort: a survivor walks to the pickup van, but only with someone beside them; zombies want them too ----------
function buildEscort(M) {
  const a = makeAvatar({ n: 'Túlélő', c: null }); scene.add(a.g); a.gunG.visible = false;
  const start = new V3(truck.pos.x, 0, truck.pos.z - Math.sign(truck.pos.z || 1) * 4.5), [gx, gz] = MAP.vans[M.pickup];
  const max = 900 * (1 + .3 * (M.job.diff - 1));
  const end = new V3(gx, 0, gz - Math.sign(gz || 1) * 3), far = BOX_SPOTS.map(([x, z]) => new V3(x, 0, z)).sort((p, q) => Math.min(q.distanceTo(start), q.distanceTo(end)) - Math.min(p.distanceTo(start), p.distanceTo(end)))[0];
  const p1 = gridPath(start, far || end), p2 = far ? gridPath(far, end) : [];
  M.esc = { a, pos: a.pos.copy(start), vel: new V3(), goal: p1.shift(), path: p1, path2: p2, end: far || end, leg: far ? 1 : 2, hp: max, max, hitT: -9, side: 0, sideT: 0, last: start.clone(), lastT: 0, waiting: false };
  M.esc.target = { pos: M.esc.pos, vel: M.esc.vel, alive: true, gen: true, esc: true };
  const tag = textSprite(['TÚLÉLŐ'], '#7dff7a', .6); tag.position.y = 2.3; a.g.add(tag);
}
function updateEscort(M, dt) { // host / solo: walk, wait, sidestep when stuck, arrive
  const E = M.esc, near = [player, ...NET.avatars.values()].some(p => !p.down && Math.hypot(p.pos.x - E.pos.x, p.pos.z - E.pos.z) < 10);
  E.waiting = !near;
  const to = E.goal.clone().sub(E.pos); to.y = 0; const d = to.length();
  if (d < (E.path.length ? 1.3 : 2.5)) { // along the route: the next point, then their things, then the van
    if (E.path.length) { E.goal = E.path.shift(); return; }
    if (E.leg === 1) { E.leg = 2; E.path = E.path2; E.end = E.path[E.path.length - 1] || E.goal; E.goal = E.path.shift() || E.goal; banner('MEGVAN A HOLMIJA', 'Most irány a furgon!'); SND.power(); return; }
    E.target.alive = false; E.vel.set(0, 0, 0); return objectiveDone(M, 'A TÚLÉLŐ BIZTONSÁGBAN');
  }
  if ((E.ambushT = (E.ambushT == null ? 18 : E.ambushT) - dt) <= 0) { // an ambush every 20 s: they come for the survivor
    E.ambushT = 20; const s = activeSpawns().reduce((b, q) => Math.hypot(q[0] - E.pos.x, q[1] - E.pos.z) < Math.hypot(b[0] - E.pos.x, b[1] - E.pos.z) ? q : b);
    for (let k = 0; k < 2 + M.job.diff; k++) { const z = spawnZombieAt(pick(['runner', 'walker', 'walker']), s[0] + rand(-2, 2), s[1] + rand(-2, 2)); z.tgt = E.target; z.tgtT = 6; }
    popText('Rajtaütés! A túlélőre mennek.', '#ff8a70');
  }
  if (!near) { E.vel.set(0, 0, 0); return; }
  to.divideScalar(d);
  if (E.sideT > 0) { E.sideT -= dt; to.set(to.x + -to.z * E.side * 1.6, 0, to.z + to.x * E.side * 1.6).normalize(); }
  E.vel.copy(to).multiplyScalar(1.7); E.pos.addScaledVector(E.vel, dt); collide(E.pos, .4); clampBounds(E.pos, .4);
  if ((E.lastT += dt) > .8) { if (E.pos.distanceTo(E.last) < .6 && E.sideT <= 0) { E.side = Math.random() < .5 ? -1 : 1; E.sideT = 1.4; } E.last.copy(E.pos); E.lastT = 0; }
}
function updateEscortLook(M, dt) { // everyone: the figure walks, flinches when hit
  const E = M.esc, a = E.a, speed = NET.client ? (E.moving ? 2.3 : 0) : Math.hypot(E.vel.x, E.vel.z);
  if (NET.client && E.net) E.pos.lerp(E.net, Math.min(1, dt * 8));
  a.walkT += dt * (2 + speed * 1.9); const sw = Math.sin(a.walkT) * Math.min(.7, speed * .14);
  a.g.position.set(E.pos.x, 0, E.pos.z); a.legL.rotation.x = sw; a.legR.rotation.x = -sw; a.armL.rotation.x = -sw * .8; a.armR.rotation.x = sw * .8;
  const to = NET.client && E.net ? E.net : E.goal; if (speed > .1 && Math.hypot(to.x - E.pos.x, to.z - E.pos.z) > .05) a.g.rotation.y = Math.atan2(-(to.x - E.pos.x), -(to.z - E.pos.z));
  if (now - E.hitT < .2 && Math.random() < dt * 30) burst(new V3(E.pos.x, 1.2, E.pos.z), 0x8a0a0a, 1, 2, .3);
}

// a walkable route: breadth-first search on a 1 m grid of the yard, then every 4th step as a waypoint
function gridPath(a, b) {
  const R = MAIN_RECT, W = Math.floor(R.maxX - R.minX), H = Math.floor(R.maxZ - R.minZ);
  const cell = p => clamp(Math.round(p.z - R.minZ), 0, H - 1) * W + clamp(Math.round(p.x - R.minX), 0, W - 1);
  const free = new Uint8Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) free[j * W + i] = blockedAt(R.minX + i, R.minZ + j, .75) ? 0 : 1;
  const s = cell(a), t = cell(b), prev = new Int32Array(W * H).fill(-1), q = [s]; free[s] = free[t] = 1; prev[s] = s;
  for (let h = 0; h < q.length && prev[t] < 0; h++) {
    const c = q[h], i = c % W, j = (c / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (prev[n] >= 0 || !free[n] || (di && dj && (!free[j * W + ni] || !free[nj * W + i]))) continue; prev[n] = c; q.push(n);
    }
  }
  if (prev[t] < 0) return [b.clone()];
  const pts = []; for (let c = t; c !== s; c = prev[c]) pts.push(new V3(R.minX + c % W, 0, R.minZ + ((c / W) | 0)));
  pts.reverse(); const out = pts.filter((p, k) => k % 4 === 3); out.push(b.clone()); return out;
}

// ---------- mid-job event (Division incursion beat): an elite squad comes in, and a cache drops somewhere for 60 s ----------
function midEvent(M) {
  M.evented = true;
  const [sx, sz] = pick(activeSpawns());
  for (let k = 0; k < 3; k++) { const z = spawnZombieAt(pick(['brute', 'runner', 'walker']), sx + rand(-2, 2), sz + rand(-2, 2)); if ((z.tier || 0) < 2) setZTier(z, 2); }
  const [cx, cz] = BOX_SPOTS.map(p => p).sort((a, b) => Math.hypot(b[0] - player.pos.x, b[1] - player.pos.z) - Math.hypot(a[0] - player.pos.x, a[1] - player.pos.z))[0];
  M.cache = { x: cx + 2.5, z: cz + 1.5, t: 60 }; buildCache(M.cache);
  banner('ELIT OSZTAG ÉS UTÁNPÓTLÁS', 'Egy láda érkezett a térkép túloldalára: 60 mp-ig nyitható. Az elitek már úton vannak.'); SND.roundStart();
}
function buildCache(C) {
  const g = new THREE.Group(), m = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x3a3a2a, emissive: 0x6a4a00, roughness: .6 }));
  m.scale.set(1.2, .7, .8); m.position.y = .35; g.add(m);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 30, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 15; g.add(beam); g.position.set(C.x, 0, C.z); scene.add(g); C.g = g;
}
function cacheFocus() {
  const C = mission && mission.cache; if (!C || C.opened || C.t <= 0) return null;
  return Math.hypot(C.x - player.pos.x, C.z - player.pos.z) < 2.2 ? { type: 'cache' } : null;
}
function openCache() { // each player opens it once and rolls their own loot
  const C = mission.cache; if (!C || C.opened) return; C.opened = true; C.g.children[0].material.emissive.setHex(0x111111); C.g.children[1].visible = false;
  const p = new V3(C.x, 0, C.z);
  spawnDrop(makeWeapon(pick(BASES), Math.max(2, rollRarity(.6)), lootLvl(1)), p.clone().add(new V3(-1, 0, 1)));
  if (Math.random() < .5) spawnGearDrop(makeGear(null, Math.max(2, rollRarity(.5)), lootLvl(1)), p.clone().add(new V3(1, 0, 1)));
  spawnItem('gren', p.clone().add(new V3(0, 0, 1.5))); SND.power(); popText('Utánpótlás-láda kinyitva!', '#ffd23f');
}
function updateCache(M, dt) {
  const C = M.cache; if (!C) return;
  C.t -= dt; if (C.g) C.g.visible = C.t > 0 && (C.t > 8 || Math.sin(now * 14) > 0);
  if (C.t <= 0 && C.g) { scene.remove(C.g); C.g = null; }
}
