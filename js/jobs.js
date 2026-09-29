// ================= JOB TYPES =================
// survive: the classic clock · exterminate: kill a number of zombies · defense: keep a generator alive until the clock
// runs out · supply: pick up crates scattered on the map. Objective jobs have no clock: the threat rises every minute,
// and when the goal is met the van comes (EVAC_WARN seconds later). In a party the host keeps score; members follow.
const JOB_TYPES = {
  survive:     { name: 'Túlélés', label: null },
  exterminate: { name: 'Irtás', label: 'IRTÁS', desc: j => `Ölj meg ${j.goal} zombit. Nincs időkorlát.` },
  defense:     { name: 'Védelem', label: null, desc: j => `Védd meg a generátort ${fmtTime(j.dur)}-ig. Ha elpusztul, a munka elbukik.` },
  escort:      { name: 'Kíséret', label: 'KÍSÉRET', desc: j => 'Egy túlélő ragadt a pályán, egy pisztollyal védekezik. Vidd a holmiját az asztalra, aztán várd meg vele a furgont, és ültesd be. Ha meghal, a munka elbukik.' },
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
const GEN_REP_RATE = .05, GEN_DMG = 2.5; // zombies hit a generator 2.5× as hard as a person
const genRepCost = () => 300 + 200 * ((mission && mission.job.diff) || 1); // points a second of holding E: 1300 at five stars
function buildGenerator(M) {
  const R = MAIN_RECT, cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2, spots = [];
  for (let k = 0; k < 3; k++) { // spread round the middle, a third of a turn apart
    let spot = null;
    for (let r = 12; r < 30 && !spot; r += 2) for (let da = 0; da < 1.2 && !spot; da += .2) { const a = k * 2.094 + .5 + da, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; if (!blockedAt(x, z, 2.4) && spots.every(s => Math.hypot(s[0] - x, s[1] - z) > 10)) spot = [x, z]; }
    spots.push(spot || [cx + (k - 1) * 12, cz]);
  }
  const body = matStd({ color: 0x4a5a3a, metalness: .5, roughness: .5 }), dark = matStd({ color: 0x1c1d1f, metalness: .6, roughness: .4 }), max = 2600 * (1 + .3 * (M.job.diff - 1)) * Math.pow(1.035, jobLvl() - 1); // keeps pace with how hard zombies hit
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
  popText(`${M.drop.table ? `${c.name || 'Holmi'} az asztalon` : 'Láda leadva'} · ${M.crates.filter(o => o.st === 2).length}/${M.crates.length}`, M.drop.table ? '#9dff6a' : '#f2c12a'); }
function crateAct(i, act, x, z) { if (!NET.client) { if (act === 't') crateTake(i, myCarryId()); else if (act === 'd') crateDrop(i, x, z); else if (act === 'v') crateDeliver(i); } else netAct('crate', [i, act, Math.round(x * 10), Math.round(z * 10)]); }
function carryAct() { // E while carrying: hand it in at the van, or set it down just in front of you
  const M = mission, i = player.carry; if (i == null || !M.crates[i]) return;
  if (M.drop && Math.hypot(M.drop.pos.x - player.pos.x, M.drop.pos.z - player.pos.z) < (M.drop.table ? 3 : 5)) { crateAct(i, 'v'); if (!NET.client) player.carry = null; return; }
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
// the wrench: while you repair, the gun goes down and a wrench works the bolts, clanking
const wrench = (() => { const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: .8, roughness: .35 }), grip = new THREE.MeshStandardMaterial({ color: 0xb03a22, roughness: .7 });
  const box = (m, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); g.add(b); return b; };
  box(steel, .035, .02, .3, 0, 0, 0); box(grip, .045, .03, .16, 0, 0, .1); box(steel, .09, .025, .05, 0, 0, -.16); box(steel, .03, .026, .04, -.03, 0, -.2); box(steel, .03, .026, .04, .03, 0, -.2);
  g.visible = false; vmScene.add(g); return g; })();
let wrenchT = 0;
function showWrench(on, dt) {
  wrench.visible = on; if (!on) { wrenchT = 0; return; }
  vmRoot.visible = false; wrenchT += dt;
  const turn = (wrenchT * 2.6) % 1, pull = turn < .6 ? turn / .6 : 1 - (turn - .6) / .4; // a pull, then back for the next bite
  wrench.scale.setScalar(.55); wrench.position.set(.2 - pull * .04, -.2 + pull * .02, -.55); wrench.rotation.set(-.7, .15, -.3 + pull * .8);
  if (wrenchT - (showWrench.last || 0) > 1 / 2.6) { showWrench.last = wrenchT; nz(.06, 2600, .22, 'bandpass', 6); tn(1400 + Math.random() * 300, .05, .05, 'triangle', 900); nz(.05, 700, .12, 'lowpass', 2, .03); } // ratchet clank
}
function holdRepair(gi, dt) { // hold E at a generator: 5% a second, paid by the second
  const M = mission, G = M && M.gens && M.gens[gi]; if (!G || G.hp <= 0 || G.hp >= G.max) return false;
  const cost = genRepCost() * dt; if (player.points < cost) { if (!M.repWarn) { M.repWarn = true; popText('Nincs elég pont a javításhoz', '#ff8a70'); SND.deny(); } return false; }
  player.points -= cost; M.repWarn = false; const add = G.max * GEN_REP_RATE * dt;
  if (NET.client) { repAcc += add; if (repAcc > G.max * .01) { netAct('repair', [gi, Math.round(repAcc)]); repAcc = 0; } G.hp = Math.min(G.max, G.hp + add); }
  else G.hp = Math.min(G.max, G.hp + add);
  if (Math.random() < dt * 14) burst(G.pos.clone().setY(1.2 + Math.random()), Math.random() < .5 ? 0xffd27a : 0x9aff7a, 1, 1.5, .4); // sparks
  return true;
}
function takeCrate(i) { // E on a crate: both hands on it (no shooting, sprinting or jumping)
  const c = mission && mission.crates && mission.crates[i]; if (!c || c.st !== 0) return;
  crateAct(i, 't', c.pos.x, c.pos.z); if (!NET.client) player.carry = i;
  if (!NET.client) { SND.pickup(2); popText(mission.drop && mission.drop.table ? 'Vidd az asztalhoz (zöld fény) · E: letétel' : mission.drop ? 'Vidd a lerakó furgonhoz · E: letétel' : 'A lerakó furgon még nem jött meg · E: letétel', '#f2c12a'); } // a member hears it when the host confirms
}

// ---------- every frame (solo or host) ----------
function updateObjective(M, dt) {
  const J = M.job; updateCrates(M, dt);
  if (M.gens) for (const G of M.gens) {
    const hurt = now - G.hitT < .3;
    G.lampM.color.setHex(G.hp <= 0 ? 0x333333 : hurt ? 0xff4a3a : G.hp < G.max * .3 ? 0xffa03a : 0x6aff6a);
    G.light.intensity = G.hp <= 0 ? 0 : hurt ? 2.5 : 1.2;
    if (hurt && Math.random() < dt * 20) burst(G.pos.clone().setY(1.2), 0xffc070, 1, 2, .3);
    if (G.hp <= 0 && !NET.client) { G.target.alive = false; M.failNote = `A ${G.name} generátor elpusztult. A munka közben talált fegyverek odavesztek.`; banner(`A ${G.name} GENERÁTOR ELPUSZTULT`, 'A munka elbukott.'); SND.explode(); return 'fail'; }
  }
  if (M.esc) { updateEscortLook(M, dt); if (!NET.client && M.esc.hp <= 0 && M.esc.ph !== 'in') { M.esc.target.alive = false; M.failNote = 'A túlélő meghalt. A munka közben talált fegyverek odavesztek.'; banner('A TÚLÉLŐ MEGHALT', 'A munka elbukott.'); SND.roar(); return 'fail'; } }
  if (M.esc && !NET.client) updateEscort(M, dt); // the survivor keeps going after the goal: packing, the van, the seat
  if (objDone(M) || NET.client) return;
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
  if (J.type === 'escort' && M.esc && M.esc.ph !== 'in') { const E = M.esc, hp = `túlélő ${Math.max(0, Math.round(E.hp / E.max * 100))}%`, n = M.crates ? M.crates.filter(c => c.st === 2).length : 0;
    return E.ph === 'hold' ? `Kíséret · ${hp} · holmik az asztalon ${n} / ${M.crates.length}${player.carry != null ? ' · vidd az asztalhoz (zöld fény)' : ''}` : E.ph === 'table' ? `Kíséret · ${hp} · összepakol, fedezd` : E.ph === 'wait' ? `Kíséret · ${hp} · jön a furgon, védd meg` : `Kíséret · ${hp} · a furgonhoz megy`; }
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
  M.dummyQ = M.dummyQ.filter(q => q.t > 0 || (zombies.some(z => z.dummy && !z.dead && z.spot[0] === q.spot[0] && z.spot[1] === q.spot[1]) || spawnDummy(q.spot[0], q.spot[1]), false)); // never two on one spot
}

// ---------- escort: a survivor holed up on the map with a weak pistol. Their things lie around: carry them to a table.
// Then they pack at the table, the van is called, and when it's parked they walk over and take the passenger seat.
// Phases: hold (fights where they stand) · table (walks to the table) · wait (by the table, the van is coming) · van · in
const ESC_PH = ['hold', 'table', 'wait', 'van', 'in'];
const ESC_ITEMS = [['HÁTIZSÁK', 0x5a6a3a], ['RUHACSOMAG', 0x6a4a6a], ['GYÓGYSZER', 0xd8d8d0], ['KONZERVEK', 0x8a8a8a], ['RÁDIÓ', 0x3a3c40], ['FOTÓALBUM', 0x7a4a2a], ['SZERSZÁMOK', 0x9a2a1a], ['TAKARÓ', 0x3a5a8a]];
function buildEscort(M) { // same on every machine: seeded from the map
  const R = MAIN_RECT, rng = mulberry(mapSeed + 3131);
  const spot = (away, r, avoid = []) => { for (let k = 0; k < 600; k++) { const x = R.minX + 6 + rng() * (R.maxX - R.minX - 12), z = R.minZ + 6 + rng() * (R.maxZ - R.minZ - 12);
    if (!blockedAt(x, z, r) && Math.hypot(x - truck.pos.x, z - truck.pos.z) > away && avoid.every(p => Math.hypot(p.x - x, p.z - z) > 10)) return new V3(x, 0, z); } return new V3(rng() * 10 - 5, 0, rng() * 10 - 5); };
  // the table (where their things go)
  const tp = spot(16, 2.2), tg = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ map: woodTex, color: 0x9a7a4a });
  const tb = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(unitBox, wood); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.castShadow = true; tg.add(b); };
  tb(2.2, .12, 1.1, 0, .9, 0); for (const [x, z] of [[-1, -.45], [1, -.45], [-1, .45], [1, .45]]) tb(.1, .9, .1, x, .45, z);
  const tbeam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dff6a, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); tbeam.position.y = 15; tg.add(tbeam);
  tg.position.copy(tp); tg.rotation.y = rng() * Math.PI; put(tg); label(['ASZTAL'], '#9dff6a', 1.1, tp.x, 2.4, tp.z);
  obstacles.push({ minX: tp.x - 1.1, maxX: tp.x + 1.1, minZ: tp.z - 1.1, maxZ: tp.z + 1.1, h: 1 });
  M.drop = { pos: tp.clone(), g: tg, table: true };
  // the survivor, with a grey pistol
  const sp = spot(14, 1.2, [tp]), a = makeAvatar({ n: 'Túlélő', c: null }); scene.add(a.g);
  const gun = buildGun({ base: BASES.find(b => b.id === 'pistol') || BASES[0], q: 0 }, true); gun.scale.setScalar(1.25); a.gunG.add(gun); a.gunG.visible = true;
  const max = 1350 * (1 + .3 * (M.job.diff - 1)) * Math.pow(1.035, jobLvl() - 1); // they hold out the whole job now, not just a walk
  M.esc = { a, pos: a.pos.copy(sp), vel: new V3(), hp: max, max, hitT: -9, ph: 'hold', path: null, goal: null, shootT: 1, aimAt: null, packT: 0, side: 0, sideT: 0, last: sp.clone(), lastT: 0 };
  M.esc.target = { pos: M.esc.pos, vel: M.esc.vel, alive: true, gen: true, esc: true };
  a.g.children.forEach(o => { if (o.isSprite && o.position.y > 2) o.visible = false; }); // no name over their head: the HUD tag shows who and how far
  // their things, spread out, away from the table and from them
  const n = Math.min(8, 3 + (M.job.diff || 1)), pts = [];
  for (let k = 0; k < n; k++) pts.push(spot(8, 1.2, [tp, sp, ...pts]));
  M.crates = pts.map((p, k) => {
    const [name, col] = ESC_ITEMS[k % ESC_ITEMS.length], g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: col });
    const b = new THREE.Mesh(unitBox, m); b.scale.set(.8, .5, .55); b.position.y = .25; b.castShadow = true; g.add(b);
    const strap = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x2a2218 })); strap.scale.set(.82, .08, .57); strap.position.y = .4; g.add(strap);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dff6a, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 7; g.add(beam);
    const t = textSprite([name], '#cfe8c0', .35); t.position.y = 1.1; g.add(t);
    g.position.copy(p); put(g);
    return { pos: p.clone(), st: 0, by: '', g, beam, name };
  });
  M.job.goal = M.crates.length;
}
function escWalk(E, to, dt, speed = 1.9) { // along a grid path to `to`; true on arrival
  if (!E.path || !E.dest || E.dest.distanceTo(to) > .5) { E.dest = to.clone(); E.path = gridPath(E.pos, to); E.goal = E.path.shift() || to.clone(); }
  const d = Math.hypot(E.goal.x - E.pos.x, E.goal.z - E.pos.z);
  if (d < (E.path.length ? 1.2 : 1.8)) { if (E.path.length) { E.goal = E.path.shift(); return false; } E.vel.set(0, 0, 0); return true; }
  const dir = new V3(E.goal.x - E.pos.x, 0, E.goal.z - E.pos.z).divideScalar(d);
  if (E.sideT > 0) { E.sideT -= dt; dir.set(dir.x - dir.z * E.side * 1.6, 0, dir.z + dir.x * E.side * 1.6).normalize(); }
  E.vel.copy(dir).multiplyScalar(speed); E.pos.addScaledVector(E.vel, dt); collide(E.pos, .4); clampBounds(E.pos, .4);
  if ((E.lastT += dt) > .8) { if (E.pos.distanceTo(E.last) < .6 && E.sideT <= 0) { E.side = Math.random() < .5 ? -1 : 1; E.sideT = 1.4; } E.last.copy(E.pos); E.lastT = 0; }
  return false;
}
function escShoot(E, dt) { // a weak pistol: the nearest zombie in sight within 16 m, about once a second
  if ((E.shootT -= dt) > 0) return;
  const eye = new V3(E.pos.x, 1.5, E.pos.z); let best = null, bd = 16;
  for (const z of zombies) { if (z.dead || z.rise > .3 || z.dummy) continue; const d = Math.hypot(z.pos.x - E.pos.x, z.pos.z - E.pos.z); if (d < bd && hasSight(eye, new V3(z.pos.x, 1.2 * z.scale, z.pos.z))) { bd = d; best = z; } }
  if (!best) { E.shootT = .4; E.aimAt = null; return; }
  E.shootT = rand(.8, 1.3); E.aimAt = best;
  const to = new V3(best.pos.x + rand(-.3, .3), 1.2 * best.scale, best.pos.z + rand(-.3, .3)), from = eye.clone().add(to.clone().sub(eye).normalize().multiplyScalar(.6));
  tracer(from, to, 0xc8c8c8, .012); burst(from, 0xffe0a0, 3, 1.2, .15);
  SND.zshot(clamp(.45 - Math.hypot(E.pos.x - player.pos.x, E.pos.z - player.pos.z) / 60, .05, .45));
  if (Math.random() < .75) hurtZombie(best, zombieHp() * .12, { esc: true, color: '#c8c8c8' }); // weak, and misses a quarter of the time
}
function updateEscort(M, dt) { // host / solo
  const E = M.esc; if (E.ph === 'in') return;
  if (E.ph !== 'van') escShoot(E, dt);
  if ((E.ambushT = (E.ambushT == null ? 25 : E.ambushT) - dt) <= 0) { // an ambush every 25 s: they come for the survivor
    E.ambushT = 25; const s = activeSpawns().reduce((b, q) => Math.hypot(q[0] - E.pos.x, q[1] - E.pos.z) < Math.hypot(b[0] - E.pos.x, b[1] - E.pos.z) ? q : b);
    for (let k = 0; k < 2 + M.job.diff; k++) { const z = spawnZombieAt(pick(['runner', 'walker', 'walker']), s[0] + rand(-2, 2), s[1] + rand(-2, 2)); z.tgt = E.target; z.tgtT = 6; }
    popText('Rajtaütés! A túlélőre mennek.', '#ff8a70');
  }
  if (E.ph === 'hold') { E.vel.set(0, 0, 0); if (M.crates.length && M.crates.every(c => c.st === 2)) { E.ph = 'table'; banner('MINDEN AZ ASZTALON', 'A túlélő odamegy összepakolni. Fedezd!'); SND.power(); } return; }
  if (E.ph === 'table') { if (escWalk(E, M.drop.pos, dt)) { if ((E.packT += dt) > 2.5) { E.ph = 'wait'; objectiveDone(M, 'A TÚLÉLŐ ÖSSZEPAKOLT'); } } return; }
  if (E.ph === 'wait') { E.vel.set(0, 0, 0); if (truck.parked) { E.ph = 'van'; E.path = null; popText('A túlélő a furgonhoz indul', '#7dff7a'); } return; }
  const tp = new V3(truck.pos.x, 0, truck.pos.z);
  if (E.ph === 'van' && !E.vanSpot) E.vanSpot = E.pos.clone().sub(tp).setY(0).normalize().multiplyScalar(3).add(tp); // beside the van, on their side of it
  if (E.ph === 'van' && (Math.hypot(E.pos.x - tp.x, E.pos.z - tp.z) < 3.8 || escWalk(E, E.vanSpot, dt, 2.4))) { // in the passenger seat: safe
    E.ph = 'in'; E.vel.set(0, 0, 0); E.target.alive = false; E.a.g.visible = false; banner('A TÚLÉLŐ BESZÁLLT', 'Az anyósülésen ül. Most ti jöttök!'); SND.buy();
  }
}
function updateEscortLook(M, dt) { // everyone: walks, turns to shoot, flinches when hit, gone once seated
  const E = M.esc, a = E.a; if (E.ph === 'in') { a.g.visible = false; return; }
  const speed = NET.client ? (E.moving ? 2.1 : 0) : Math.hypot(E.vel.x, E.vel.z);
  if (NET.client && E.net) E.pos.lerp(E.net, Math.min(1, dt * 8));
  a.walkT += dt * (2 + speed * 1.9); const sw = Math.sin(a.walkT) * Math.min(.7, speed * .14);
  a.g.position.set(E.pos.x, 0, E.pos.z); a.legL.rotation.x = sw; a.legR.rotation.x = -sw; a.armL.rotation.x = -sw * .8;
  const Z = E.aimAt && !E.aimAt.dead ? E.aimAt.pos : null, to = Z || (NET.client ? E.net : E.goal);
  a.armR.rotation.x = Z ? -1.5 : sw * .8; // the pistol comes up when there's something to shoot
  if (to && (Z || speed > .1) && Math.hypot(to.x - E.pos.x, to.z - E.pos.z) > .05) a.g.rotation.y = Math.atan2(-(to.x - E.pos.x), -(to.z - E.pos.z));
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

// ---------- secondary objectives: one or two per job, each pays +20% money, +20% XP and some parts on a successful job ----------
const KIND_ACC = { walker: 'Sétálót', runner: 'Futót', crawler: 'Mászót', spitter: 'Köpködőt', brute: 'Behemótot', armored: 'Páncélost', leaper: 'Ugrót', bloater: 'Puffadtat' };
const SECONDARY = {
  areas: { name: 'Feltáró', txt: s => 'Nyisd ki az összes területet', n: () => Object.keys(AREAS).length || 1, prog: M => Object.values(AREAS).filter(a => a.unlocked).length, can: j => Object.keys(MAPS[j.map].areas || {}).length > 0 },
  kind: { name: 'Célzott irtás', txt: (s, n) => `Ölj meg ${n} ${KIND_ACC[s.kind] || KINDS[s.kind].name}`, n: (s, d) => ({ walker: 25 + 10 * d, runner: 10 + 4 * d, crawler: 8 + 3 * d, spitter: 5 + 2 * d, brute: 2 + d, armored: 4 + 2 * d, leaper: 4 + 2 * d, bloater: 4 + 2 * d })[s.kind] || 10, prog: (M, s) => (M.secK || {})[s.kind] || 0, can: () => true },
  heads: { name: 'Mesterlövő', txt: (s, n) => `${n} fejlövéses ölés`, n: (s, d) => 12 + 8 * d, prog: M => M.secH || 0, can: () => true },
  melee: { name: 'Közelharc', txt: (s, n) => `Ölj meg ${n} zombit késsel`, n: (s, d) => 4 + 2 * d, prog: M => M.secMelee || 0, can: () => true },
  elite: { name: 'Elitvadász', txt: (s, n) => `Ölj meg ${n} elit zombit`, n: (s, d) => 1 + d, prog: M => M.secE || 0, can: j => j.diff >= 2 },
  perk: { name: 'Vásárló', txt: () => 'Vegyél egy perket egy automatából', n: () => 1, prog: M => Object.keys(player.perks || {}).length ? 1 : 0, can: () => true },
  box: { name: 'Szerencsejátékos', txt: () => 'Vegyél fegyvert a rejtélyes ládából', n: () => 1, prog: M => M.secBox ? 1 : 0, can: () => true },
  trap: { name: 'Tűzoltó ellen', txt: () => 'Gyújtsd be a tűzcsapdát', n: () => 1, prog: M => M.secTrap ? 1 : 0, can: j => Object.values(MAPS[j.map].areas || {}).some(a => a.station && a.station[0] === 'trap') },
  nomed: { name: 'Kemény fickó', txt: () => 'Ne használj gyógycsomagot', n: () => 1, prog: M => M.secMed ? 0 : 1, end: true, can: () => true },
};
function rollSecondary(j) { // on the job: [{ k, kind? }]
  const pool = Object.keys(SECONDARY).filter(k => SECONDARY[k].can(j)), out = [], n = j.diff >= 2 ? 2 : 1;
  while (out.length < n && pool.length) { const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0], s = { k };
    if (k === 'kind') s.kind = pick(j.diff >= 3 ? ['walker', 'runner', 'crawler', 'spitter', 'brute', 'armored'] : j.diff >= 2 ? ['walker', 'runner', 'crawler', 'spitter'] : ['walker', 'runner', 'crawler']);
    out.push(s); }
  return out;
}
const secOf = s => SECONDARY[s.k];
const secN = (s, j) => secOf(s).n(s, j.diff || 1);
const secTxt = (s, j) => secOf(s).txt(s, secN(s, j));
function secState(s, M) { const n = secN(s, M.job), p = Math.min(n, secOf(s).prog(M, s)); return { n, p, done: p >= n, end: !!secOf(s).end }; }
function secKill(kind, head, melee, elite) { const M = mission; if (!M || !M.job.sec) return; (M.secK || (M.secK = {}))[kind] = (M.secK[kind] || 0) + 1; if (head) M.secH = (M.secH || 0) + 1; if (melee) M.secMelee = (M.secMelee || 0) + 1; if (elite) M.secE = (M.secE || 0) + 1; secCheck(); }
function secCheck() { // a toast the moment one is met (the no-medkit one only counts at the end)
  const M = mission; if (!M || !M.job.sec) return;
  M.job.sec.forEach((s, i) => { const st = secState(s, M); if (st.done && !st.end && !(M.secDone || (M.secDone = {}))[i]) { M.secDone[i] = 1; toast('MELLÉKCÉL TELJESÍTVE', [`${secOf(s).name}: ${secTxt(s, M.job)}`, 'A jutalom sikeres kijutáskor jár.'], '#9dff6a'); SND.power(); } });
}
function secBonus(J, M, success) { // what the finished ones pay
  const done = success && J.sec ? J.sec.filter(s => secState(s, M).done) : [];
  return { list: done, cash: done.length * Math.round(J.reward * .2 / 10) * 10, xp: done.length * Math.round(J.xp * .2), parts: done.length * (3 + (J.diff || 1)) };
}
const secRows = (J, M) => (J.sec || []).map(s => { const st = M ? secState(s, M) : null; return `<li class="sec${st && st.done ? ' done' : ''}"><span>Mellékcél: ${secTxt(s, J)}</span><b>${!st ? '' : st.end ? (st.done ? 'tartva' : 'elbukva') : st.done ? '✓' : `${st.p} / ${st.n}`}</b></li>`; }).join('');
