// ================= PLAYER =================
const player = {
  pos: new V3(), vel: new V3(), vy: 0, onGround: true, yaw: 0, pitch: 0,
  hp: 100, lastHurt: -99, points: 0, earned: 0, kills: 0, heads: 0,
  slots: [null, null], bag: [], cur: 0, ads: 0, bloom: 0, recoil: 0,
  reloadT: 0, fireCd: 0, burstLeft: 0, burstT: 0, switchT: 0, knifeT: 0, knifeCd: 0,
  best: null, sprint: false, shake: 0,
  inv: {}, stam: 100, stamT: 0, adrenT: 0, itemCd: 0,
};
const curW = () => player.slots[player.cur];
const vm = { gun: null, flash: null, kick: 0, kickR: 0, swayX: 0, swayY: 0, bobT: 0 };
const flashMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

// ---------- first-person arms ----------
const skinMat = new THREE.MeshStandardMaterial({ color: 0xb98d6c, roughness: .85 });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: .7 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x3c4634, roughness: .95 });
// hand sits at the group origin; the forearm and sleeve run toward +z (back toward the camera)
function makeArm() {
  const g = new THREE.Group();
  const part = (mat, sx, sy, sz, z) => { const m = new THREE.Mesh(unitBox, mat); m.scale.set(sx, sy, sz); m.position.z = z; g.add(m); return m; };
  part(gloveMat, .07, .085, .11, 0);
  part(gloveMat, .028, .03, .07, -.05).position.set(-.035, .03, -.02); // thumb
  part(skinMat, .06, .06, .2, .15);
  part(sleeveMat, .09, .09, .5, .48);
  return g;
}
function addHands(g, b) {
  const m = b.model, L = m.len, H = m.h;
  const r = makeArm(); r.position.set(.014, -H * .35, L * .26); r.rotation.set(.8, .32, -.1); g.add(r); // trigger hand wrapped over the top of the grip
  const l = makeArm();
  if (m.stock || L > .3) { l.position.set(-.012, -H * .42, -L / 2 - m.barrel * .28); l.rotation.set(.35, -.5, .2); } // support hand on the forend
  else { l.position.set(-.03, -H * 1.1, L * .24); l.rotation.set(.75, -.35, .15); } // cupping the pistol grip
  g.add(l); g.userData.leftHand = l;
}
const SWITCH_T = .45;
function equipView() {
  if (vm.gun) vmRoot.remove(vm.gun);
  vm.pending = false;
  const w = curW(); if (!w) return;
  vm.gun = buildGun(w, false);
  addHands(vm.gun, w.base);
  vm.flash = new THREE.Sprite(flashMat); vm.flash.scale.set(.22, .22, 1);
  vm.flash.position.set(0, vm.gun.userData.muzzleY, vm.gun.userData.muzzleZ - .04); vm.flash.visible = false;
  vm.gun.add(vm.flash);
  vmRoot.add(vm.gun);
}
function trackBest(w) { if (!player.best || w.q > player.best.q || (w.q === player.best.q && dps(w) > dps(player.best))) player.best = w; }
// lower the current gun, swap the model at the bottom of the dip, raise the new one
function reloaded(w) { w.fired = 0; (player.buf || (player.buf = {})).reload = 5; }
function beginSwitch() {
  (player.buf || (player.buf = {})).swap = 4;
  stopReload(); player.burstLeft = 0; player.spin = 0; player.switchT = SWITCH_T;
  if (vm.gun) vm.pending = true; else equipView();
  renderSlots();
}
function giveWeapon(w) {
  let i = player.slots.indexOf(null);
  if (i < 0) { // the new gun takes the held one's place; the held one goes in the bag, or on the ground if the bag is full
    i = player.cur;
    const old = player.slots[i];
    if (player.bag.length < bagMax()) { player.bag.push(old); popText(`${old.name} a táskába került (${player.bag.length}/${bagMax()})`, '#cfc6b0'); }
    else {
      itemFeed('eldobta', old.name, old.unique ? 5 : old.q); netShareDrop('w', old, spawnDrop(old, player.pos.clone().add(new V3(rand(-.4, .4), 0, rand(-.4, .4)))));
      popText(`Tele a táska · ${old.name} a földön${mission && old.owned ? ', ha itt hagyod, elveszik' : ''}`, '#ff8a70');
    }
  }
  player.slots[i] = w; player.cur = i;
  trackBest(w); noteFound(w); SND.pickup(w.q); beginSwitch();
}
function switchTo(i) {
  if (!player.slots[i] || i === player.cur) return;
  player.cur = i; beginSwitch();
}

// ---------- off-hand actions: throw, use an item, knife slash ----------
const vmArm = makeArm(); vmArm.visible = false; vmScene.add(vmArm);
const armItems = {};
{
  const add = (k, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.visible = false; vmArm.add(mesh); armItems[k] = mesh; };
  add('gren', new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: .6 })), 0, .02, -.07);
  const blade = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xd5d9de, metalness: .85, roughness: .25 }));
  blade.scale.set(.012, .03, .26); add('knife', blade, 0, .01, -.18);
  const med = new THREE.Group();
  const mb = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xc23a32 })); mb.scale.set(.13, .085, .1); med.add(mb);
  const cr = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const c1 = new THREE.Mesh(unitBox, cr); c1.scale.set(.02, .06, .102); med.add(c1);
  const c2 = new THREE.Mesh(unitBox, cr); c2.scale.set(.06, .02, .102); med.add(c2);
  add('med', med, 0, .05, -.08);
  const syr = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .16, 8), new THREE.MeshStandardMaterial({ color: 0x7fc4ff, emissive: 0x2a5a8a }));
  syr.rotation.x = Math.PI / 2; add('adren', syr, 0, .02, -.12);
  armItems.blade = armItems.knife;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: .5, roughness: .5 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x5aff6a, emissive: 0x2a9a3a });
  const shellM = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: .5 });
  const bx = (mat, sx, sy, sz) => { const m = new THREE.Mesh(unitBox, mat); m.scale.set(sx, sy, sz); return m; };
  add('mag', bx(dark, .04, .13, .06), 0, .07, -.05);
  add('box', bx(dark, .1, .1, .12), 0, .06, -.07);
  add('cell', bx(glow, .045, .06, .08), 0, .05, -.06);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .06, 8), shellM); sh.rotation.z = Math.PI / 2; add('shell', sh, 0, .045, -.05);
  const bolt = new THREE.Group(), shaft = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .3, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: .7 }));
  shaft.rotation.x = Math.PI / 2; bolt.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.012, .04, 6), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: .8, roughness: .3 })); tip.rotation.x = -Math.PI / 2; tip.position.z = -.17; bolt.add(tip);
  [0, 2.1, 4.2].forEach(a => { const f = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xb03a2a })); f.scale.set(.002, .02, .05); f.position.set(Math.sin(a) * .008, Math.cos(a) * .008, .13); f.rotation.z = a; bolt.add(f); });
  add('bolt', bolt, 0, .03, -.08);
  const ld = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .03, 10), dark); ld.rotation.x = Math.PI / 2; add('loader', ld, 0, .04, -.07);
}
// pose = [x, y, z, rotX, rotY, rotZ]; keys are eased with smoothstep between them
const ARM_REST = [-.3, -.75, -.25, .6, -.3, 0];
const ARM_ANIMS = {
  throw: { dur: .6, at: .36, hide: true, keys: [[0, ARM_REST], [.22, [-.22, 0, -.25, 1.2, -.3, .2]], [.36, [-.03, -.12, -.6, .35, -.1, 0]], [.6, ARM_REST]] },
  use:   { dur: .75, at: .42, keys: [[0, ARM_REST], [.25, [-.1, -.19, -.36, .5, -.4, .1]], [.5, [-.08, -.17, -.34, .45, -.35, .05]], [.75, ARM_REST]] },
  slash: { dur: .36, at: .15, keys: [[0, [.22, -.22, -.4, .3, .7, -.3]], [.15, [-.2, -.17, -.5, .3, -.7, .3]], [.36, ARM_REST]] },
};
let armAnim = null;
function startArm(type, item, cb) {
  if (armAnim) return false;
  const A = ARM_ANIMS[type];
  armAnim = { A, t: 0, item, cb, fired: false };
  for (const k in armItems) armItems[k].visible = k === item;
  vmArm.visible = true; player.knifeT = A.dur;
  return true;
}
function armPose(A, t) {
  const K = A.keys;
  let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const [t0, a] = K[i], [t1, b] = K[i + 1], u = smooth(clamp((t - t0) / (t1 - t0), 0, 1));
  return a.map((v, j) => v + (b[j] - v) * u);
}
function updateArm(dt) {
  if (!armAnim) return;
  const a = armAnim; a.t += dt;
  const p = armPose(a.A, a.t);
  vmArm.position.set(p[0], p[1], p[2]); vmArm.rotation.set(p[3], p[4], p[5]);
  if (!a.fired && a.t >= a.A.at) { a.fired = true; if (a.A.hide) armItems[a.item].visible = false; a.cb(); }
  if (a.t >= a.A.dur) { armAnim = null; vmArm.visible = false; }
}
// reload timelines. p = progress 0..1 (per round for single loaders). keys: hand path as offsets from the gun's load port;
// gun: [roll, pitch, lift] added to the held pose; out / in / snap: when the old part leaves, the new one seats, the action closes
const RELOADS = {
  mag:      { item: 'mag', gun: [-.16, .05, .07], out: .12, in: .62, snap: .82,
              keys: [[0, 'rest'], [.2, [-.05, -.12, .04]], [.45, [-.02, -.07, .02]], [.62, [0, -.025, 0]], [.72, [0, -.025, 0]], [.92, 'rest']],
              sOut: () => SND.magOut(), sIn: () => SND.magIn(), sSnap: () => SND.bolt() },
  box:      { item: 'box', gun: [-.12, .06, .07], out: .15, in: .66, snap: .85,
              keys: [[0, 'rest'], [.25, [-.07, -.13, .05]], [.5, [-.04, -.07, .02]], [.66, [0, -.03, 0]], [.76, [0, -.03, 0]], [.94, 'rest']],
              sOut: () => SND.magOut(), sIn: () => SND.magIn(), sSnap: () => SND.bolt() },
  cell:     { item: 'cell', gun: [-.16, .05, .07], out: .12, in: .6, snap: .8,
              keys: [[0, 'rest'], [.2, [-.05, -.12, .04]], [.45, [-.02, -.07, .02]], [.6, [0, -.025, 0]], [.7, [0, -.025, 0]], [.9, 'rest']],
              sOut: () => SND.magOut(), sIn: () => SND.zap(), sSnap: () => SND.bolt() },
  revolver: { item: 'loader', gun: [-.3, .18, .07], out: .14, in: .6, snap: .8,
              keys: [[0, 'rest'], [.32, [-.1, -.1, .05]], [.52, [-.05, -.03, .01]], [.64, [-.04, -.02, 0]], [.86, 'rest']],
              sOut: () => { SND.drumOpen(); SND.brass(); }, sIn: () => SND.shellIn(), sSnap: () => SND.drumOpen() },
  break:    { item: 'shell', gun: [-.05, .25, .05], out: .1, in: .58, snap: .8,
              keys: [[0, 'rest'], [.3, [-.06, -.08, .06]], [.52, [0, .02, .02]], [.64, [0, .02, .02]], [.86, 'rest']],
              sOut: () => SND.breakOpen(), sIn: () => SND.shellIn(), sSnap: () => SND.breakClose() },
  bow:      { item: 'bolt', gun: [-.02, .12, .04], out: .1, in: .62, snap: .82,
              keys: [[0, 'rest'], [.3, [-.04, -.05, .12]], [.55, [0, .01, .03]], [.66, [0, .01, .02]], [.88, 'rest']],
              sOut: () => SND.bow(), sIn: () => SND.shellIn(), sSnap: () => SND.breakClose() },
  shell:    { item: 'shell', gun: [-.18, .04, .06], single: true,
              keys: [[0, [-.05, -.09, .05]], [.5, [0, -.015, 0]], [1, [-.05, -.09, .05]]], sIn: () => SND.shellIn() },
};
const ARM_RELOAD_ROT = [.9, -.35, .15];
function stopReload() { player.reloading = false; player.reloadT = 0; }
function startReload() {
  const w = curW();
  if (!w || player.reloading || armAnim || w.ammo >= w.mag || w.reserve <= 0 || player.switchT > 0) return;
  player.reloading = w.base.single ? 'single' : 'full';
  player.reloadT = player.reloadDur = w.reload; player.rlDone = {};
}
const reloadProgress = () => player.reloading ? clamp(1 - player.reloadT / player.reloadDur, 0, 1) : 0;
function updateReloadAnim(dt) {
  const w = curW(), U = vm.gun.userData, R = player.reloading && RELOADS[w.base.rl];
  if (U.leftHand) U.leftHand.visible = !R;
  if (U.mag) { U.mag.visible = true; U.mag.position.y = U.magY; }
  if (U.drum) U.drum.position.x += (0 - U.drum.position.x) * Math.min(1, dt * 12);
  if (!R) { if (!armAnim) vmArm.visible = false; return; }
  const p = reloadProgress(), full = player.reloading === 'full';
  const ev = (k, at, fn) => { if (fn && at != null && p >= at && !player.rlDone[k]) { player.rlDone[k] = true; fn(); } };
  if (full) { ev('out', R.out, R.sOut); ev('in', R.in, R.sIn); ev('snap', R.snap, R.sSnap); } else ev('in', .5, R.sIn);
  // the swapped part: old mag drops out and away, the new one slides up into the well
  if (U.mag && full && p > R.out && p < R.in) {
    const drop = (p - R.out) / .14;
    if (drop < 1) U.mag.position.y = U.magY - .45 * drop * drop;
    else if (p > R.in - .1) U.mag.position.y = U.magY - .12 * (R.in - p) / .1;
    else U.mag.visible = false;
  }
  if (U.drum && full) {
    const open = p > R.out && p < R.snap;
    U.drum.position.x += ((open ? -.055 : 0) - U.drum.position.x) * Math.min(1, dt * 14);
    if (open && (p < .32 || (p > R.in && p < R.snap))) U.drum.rotation.y += dt * 25;
  }
  // off-hand follows the key path, anchored to the load port so it tracks the moving gun
  vmRoot.updateMatrixWorld(true);
  const anchor = U.port.clone().applyMatrix4(vm.gun.matrixWorld), K = R.keys;
  let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
  const [t0, a] = K[i], [t1, b] = K[i + 1], u = smooth(clamp((p - t0) / (t1 - t0), 0, 1));
  const at = k => k === 'rest' ? new V3(ARM_REST[0], ARM_REST[1], ARM_REST[2]) : anchor.clone().add(new V3(k[0], k[1], k[2]));
  vmArm.position.lerpVectors(at(a), at(b), u);
  const wgt = lerp(a === 'rest' ? 0 : 1, b === 'rest' ? 0 : 1, u);
  vmArm.rotation.set(lerp(ARM_REST[3], ARM_RELOAD_ROT[0], wgt), lerp(ARM_REST[4], ARM_RELOAD_ROT[1], wgt), lerp(ARM_REST[5], ARM_RELOAD_ROT[2], wgt));
  vmArm.visible = true;
  const holding = full ? p > .16 && p < R.in : p < .55;
  for (const k in armItems) armItems[k].visible = holding && k === R.item;
}

// ================= SHOOTING =================
const ray = new THREE.Raycaster();
function currentSpread() {
  const w = curW(), hip = w.spread, ads = w.base.adsSpread != null ? w.base.adsSpread : hip * .35;
  let s = lerp(hip, ads * SK.ads(), player.ads);
  s *= 1 + Math.hypot(player.vel.x, player.vel.z) / 5.2 * .35 * (1 - player.ads * .8);
  if (!player.onGround) s *= 1.6;
  return s + player.bloom;
}
// where the drawn gun's muzzle appears on screen, placed 1.2 m in front of the world camera
function muzzleWorld() {
  if (!vm.gun) return camera.position.clone();
  vmRoot.updateMatrixWorld(true);
  const v = new V3(0, vm.gun.userData.muzzleY, vm.gun.userData.muzzleZ).applyMatrix4(vm.gun.matrixWorld).project(vmCamera);
  v.z = .5; v.unproject(camera);
  return v.sub(camera.position).normalize().multiplyScalar(1.2).add(camera.position);
}
// per-shot damage from anointments and unique tricks
function shotMul(w) {
  let m = 1; const a = w.anoint, B = player.buf || {};
  if (a === 'reload' && B.reload > 0) m *= 1.5;
  if (a === 'lowhp' && player.hp < maxHp() * .35) m *= 1.6;
  if (a === 'first' && (w.fired || 0) < 3) m *= 2;
  if (a === 'swap' && B.swap > 0) m *= 1.4;
  if (w.tal === 'optimist') m *= 1 + .3 * (1 - w.ammo / Math.max(1, w.mag));
  if (w.tal === 'frenzy' && now < (player.frenzyT || 0)) m *= 1.2;
  if (w.unique === 'thirteen' && w.ammo === 0) m *= 5;
  if (w.unique === 'reaper' && player.uStack) { m *= 1 + player.uStack; player.uStack = 0; }
  return m;
}
// fire-rate multiplier: anointment, the Haystack's spin-up, the Double Tap perk
const rateMul = w => (w.anoint === 'ability' && player.buf && player.buf.ability > 0 ? 1.5 : 1) * (now < (player.overT || 0) ? 1.4 : 1) * (w.unique === 'haystack' ? 1 + (player.uHeat || 0) : 1) * (player.perks && player.perks.tap ? 1.25 : 1);
function shoot() {
  const w = curW(), b = w.base; player.shotsN += w.pellets || 1;
  if (!(player.stormT > 0) && !(w.unique === 'hydra' && now < (player.hydraUntil || 0))) w.ammo--; // Tűzvihar: the mag does not drain
  const sm = shotMul(w), forceCrit = w.unique === 'thirteen' && w.ammo === 0; w.fired = (w.fired || 0) + 1;
  NET.shots = (NET.shots || 0) + 1; // partners hear and see it
  if (b.flame) { if ((vm.flameN = (vm.flameN || 0) + 1) % 3 === 0) SND.flame(); } else SND[b.snd]();
  vm.kick = .06 + b.kick; vm.kickR = b.kick * 4;
  if (vm.flash) { vm.flash.visible = true; vm.flash.material.rotation = Math.random() * 6; vm.flashT = .045; }
  const mz = muzzleWorld(); muzzleLight.position.copy(mz); muzzleLight.intensity = 3; muzzleLight.color.set(b.energy ? 0x60ff70 : 0xffb060);
  const kick = b.kick * (1 - player.ads * .4); player.pitch += kick; player.recoil += kick; // fully recovers: aim returns to where you pointed
  player.bloom = Math.min(w.spread * .6, player.bloom + w.spread * .08 * SK.bloom());
  if (b.lob) return launchGrenade(w, mz, sm);

  const spread = currentSpread() * Math.PI / 180;
  const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new V3(1, 0, 0).applyQuaternion(camera.quaternion), up = new V3(0, 1, 0).applyQuaternion(camera.quaternion);
  const targets = rayBlockers.slice();
  for (const z of zombies) if (!z.dead) targets.push(...z.parts);
  const tally = new Map();
  const color = b.tracer || (b.energy ? 0x5aff6a : w.element ? ELEMENTS[w.element].hex : 0xffd9a0);
  for (let p = 0; p < w.pellets; p++) {
    const a = Math.random() * Math.PI * 2, r = Math.tan(spread) * Math.sqrt(Math.random());
    const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    ray.set(camera.position, dir); ray.far = b.range;
    let end = camera.position.clone().addScaledVector(dir, b.range), pierce = (b.pierce || 1) + rk('s_pierce'), basePierce = b.pierce || 1, hitN = 0;
    const seen = new Set();
    for (const h of ray.intersectObjects(targets, false)) {
      const z = h.object.userData.z;
      if (z) {
        if (seen.has(z)) continue;
        seen.add(z);
        const fall = !b.flame && h.distance > b.range * .5 ? lerp(1, .4, (h.distance - b.range * .5) / (b.range * .5)) : 1;
        const head = !!h.object.userData.head, weak = !!h.object.userData.weak; // a boss's weak point counts as a head, and hurts more
        const t = tally.get(z) || { amt: 0, head: false, crit: false }, pf = hitN++ >= basePierce ? .6 : 1; // targets pierced thanks to Átütő erő take 60%
        const crit = forceCrit || Math.random() < critChance();
        t.amt += w.dmg * sm * SK.dmg(w) * fall * (head ? (b.headMult || 2) * headBonus() : 1) * (crit ? critMult() : 1) * (weak ? 3 : 1) * (rk('h_long') && h.distance > 25 ? 1 + .1 * rk('h_long') : 1) * pf;
        t.head = t.head || head || weak; t.crit = t.crit || crit; tally.set(z, t);
        burst(h.point, 0x5a0a0a, 3, 2.2, .4);
        if (--pierce <= 0) { end = h.point; break; }
      } else {
        end = h.point;
        burst(h.point, b.energy ? 0x5aff6a : 0xffc070, 4, 2, .3);
        if (h.object.userData.onHit) h.object.userData.onHit(h.point); // e.g. explosive barrels
        break;
      }
    }
    if (b.splash) {
      burst(end, 0x5aff6a, 14, 4, .45);
      for (const z of zombies) {
        if (z.dead || tally.has(z)) continue;
        if (Math.hypot(z.pos.x - end.x, z.pos.z - end.z) < b.splash) tally.set(z, { amt: w.dmg * sm * .6, head: false });
      }
    }
    if (b.flame) { // a stream of fire from the nozzle instead of a tracer
      const fd = end.clone().sub(mz), fl = fd.length();
      fxFlame(mz, fd.divideScalar(fl || 1), fl, camera.position.distanceTo(end) < b.range - .2);
    } else if (p < 4 || Math.random() < .5) tracer(mz, end, color, b.energy ? .03 : .012);
  }
  if (b.chain) { // tesla: every direct hit arcs to nearby zombies, weaker each hop
    for (const [z0, t0] of [...tally]) {
      let from = z0, amt = t0.amt;
      for (let k = 0; k < b.chain; k++) {
        let next = null, bd = 6;
        for (const o of zombies) { if (o.dead || tally.has(o)) continue; const d = o.pos.distanceTo(from.pos); if (d < bd) { bd = d; next = o; } }
        if (!next) break;
        amt *= .7; tally.set(next, { amt, head: false, crit: false });
        tracer(new V3(from.pos.x, 1.3 * from.scale, from.pos.z), new V3(next.pos.x, 1.3 * next.scale, next.pos.z), 0x7fd8ff, .025);
        from = next;
      }
    }
  }
  const burnAug = player.stormT > 0 && augOn('ignite'); // Tűzvihar augment: burning rounds
  for (const [z, t] of tally) hurtZombie(z, t.amt, { head: t.head, crit: t.crit, w, burnDps: burnAug ? t.amt * .3 : 0 });
  if (tally.size) { hitmarker(false); [...tally.values()].some(t => t.head) ? SND.head() : SND.hit(); }
}
function knife() {
  if (player.knifeCd > 0 || armAnim) return;
  stopReload(); player.knifeCd = .6; SND.knife();
  startArm('slash', 'blade', () => {
    const fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    let best = null, bd = 2.3;
    for (const z of zombies) {
      if (z.dead || z.rise > .3) continue;
      const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fwd.x + dz * fwd.z) / d > .45) { bd = d; best = z; }
    }
    if (best) { hurtZombie(best, Math.max(150 + round * 12, zombieHp() * .45), { melee: true, color: '#ece6d4' }); burst(zHeadPos(best).setY(1.3), 0x5a0a0a, 8, 3); hitmarker(best.dead); }
  });
}
function updateWeapon(dt) {
  const w = curW(); if (!w || player.down) return;
  player.fireCd -= dt; player.switchT = Math.max(0, player.switchT - dt); player.knifeCd -= dt; player.knifeT = Math.max(0, player.knifeT - dt);
  player.bloom = Math.max(0, player.bloom - dt * w.spread * 2.5);
  clickQueued -= dt;
  if (player.reloading) {
    const wantsFire = w.base.mode === 'auto' ? mouseDown : clickQueued > 0;
    if (player.reloading === 'single' && wantsFire && w.ammo > 0) { stopReload(); SND.pump(); vm.kick = .04; } // firing interrupts round-by-round loading
    else {
      player.reloadT -= dt * (player.adrenT > 0 ? 1.6 : 1) * reloadMul();
      if (player.reloadT <= 0) {
        if (player.reloading === 'single') {
          w.ammo++; w.reserve--;
          if (w.ammo < w.mag && w.reserve > 0) { player.reloadT = player.reloadDur; player.rlDone = {}; }
          else { stopReload(); SND.pump(); vm.kick = .04; reloaded(w); }
        } else { const n = Math.min(w.mag - w.ammo, w.reserve); w.ammo += n; w.reserve -= n; stopReload(); reloaded(w); }
      }
    }
  }
  const busy = player.reloading || player.switchT > 0 || player.knifeT > 0;
  const B = player.buf || (player.buf = {}); for (const k in B) B[k] = Math.max(0, B[k] - dt);
  if (w.unique === 'haystack') player.uHeat = clamp((player.uHeat || 0) + (mouseDown && !busy && w.ammo > 0 ? dt / 4 : -dt / 1.5), 0, 1);
  if (w.base.spin) { // minigun spins up before it fires
    player.spin = clamp((player.spin || 0) + (mouseDown && !busy ? dt / .55 : -dt / .8), 0, 1);
    if (player.spin > .05 && (vm.spinSnd = (vm.spinSnd || 0) - dt) <= 0) { vm.spinSnd = .09; SND.spin(player.spin); }
    if (player.spin < 1) return;
  }
  if (player.burstLeft > 0) {
    player.burstT -= dt;
    if (player.burstT <= 0 && !busy) {
      if (w.ammo > 0) { shoot(); player.burstLeft--; player.burstT = 60 / w.rpm; } else player.burstLeft = 0;
    }
    return;
  }
  const wants = w.base.mode === 'auto' ? mouseDown : clickQueued > 0;
  if (!wants || busy || player.fireCd > 0) return;
  clickQueued = 0;
  if (w.ammo <= 0) { if (w.reserve > 0) startReload(); else { SND.dry(); if (now - (player.dryMsgT || -9) > 2.5) { player.dryMsgT = now; popText(`Nincs lőszer! Válts fegyvert, vagy lőszerláda ${Math.round(Math.hypot(ammoBox.pos.x - player.pos.x, ammoBox.pos.z - player.pos.z))} m`, '#ff8a70'); } } player.fireCd = .25; return; }
  player.sprint = false;
  if (w.base.mode === 'burst') { player.burstLeft = w.base.burst; player.burstT = 0; player.fireCd = w.base.burstDelay + (w.base.burst - 1) * 60 / w.rpm; }
  else { shoot(); player.fireCd = 60 / w.rpm / (player.stormT > 0 ? 1.4 : 1) / rateMul(w); }
  if (w.ammo <= 0 && w.reserve > 0) setTimeout(() => { if (curW() === w && state === 'playing') startReload(); }, 250);
}

// ================= PLAYER UPDATE =================
function updatePlayer(dt) {
  if (player.down) { // down in a party: watch a living teammate over the shoulder until someone picks you up
    const mate = [...NET.avatars.values()].find(a => !a.down);
    if (mate) { camera.position.set(mate.pos.x + Math.sin(mate.yaw) * 3.2, 2.6, mate.pos.z + Math.cos(mate.yaw) * 3.2); camera.lookAt(mate.pos.x, 1.4, mate.pos.z); $('vig').style.opacity = .35; }
    else { camera.position.set(player.pos.x, .45, player.pos.z); camera.rotation.set(player.pitch * .5, player.yaw, .4); $('vig').style.opacity = .85; }
    camera.fov = SET.fov; camera.updateProjectionMatrix(); return;
  }
  const ff = player.ffyl > 0; if (ff) updateFFYL(dt);
  if (player.chillT > 0) player.chillT -= dt;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (keys.ArrowLeft) player.yaw += dt * 2.4; if (keys.ArrowRight) player.yaw -= dt * 2.4;
  if (keys.ArrowUp) player.pitch = Math.min(1.5, player.pitch + dt * 1.8); if (keys.ArrowDown) player.pitch = Math.max(-1.5, player.pitch - dt * 1.8);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const mv = new V3(-sy * f + cy * s, 0, -cy * f - sy * s);
  if (mv.lengthSq() > 0) mv.normalize();
  const adren = player.adrenT > 0;
  player.sprint = !ff && keys.ShiftLeft && f > 0 && !rmb && !mouseDown && player.knifeT <= 0 && !player.reloading && (adren || player.stam > (player.sprint ? 0 : 15));
  if (player.sprint && !adren && !perk('runner') && !exoOn('league')) { player.stam = Math.max(0, player.stam - 20 * dt); player.stamT = .9; }
  else if ((player.stamT -= dt) <= 0) player.stam = Math.min(maxStam(), player.stam + 28 * (1 + .15 * U('stamina')) * dt);
  player.adrenT = Math.max(0, player.adrenT - dt); player.itemCd -= dt;
  const speed = (ff ? .9 : 1) * (ff ? 1 : player.sprint ? 8.2 : 5.2 * (1 - player.ads * .4)) * (adren ? 1.3 : 1) * speedMul() * (player.chillT > 0 ? .55 : 1) * (1 - .35 * (player.spin || 0) * (rk('s_heavy') ? 0 : 1));
  const k = 1 - Math.exp(-(player.onGround ? 12 : 3) * dt);
  player.vel.x = lerp(player.vel.x, mv.x * speed, k); player.vel.z = lerp(player.vel.z, mv.z * speed, k);
  player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
  if (player.onGround && Math.hypot(player.vel.x, player.vel.z) > 1 && (player.stepD += Math.hypot(player.vel.x, player.vel.z) * dt) > 2) { player.stepD = 0; SND.step(player.sprint); }
  if (keys.Space && player.onGround && !ff) { player.vy = 6.2; player.onGround = false; }
  player.vy -= 18 * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  collide(player.pos, .42);
  for (const z of zombies) {
    if (z.dead || z.rise > .2) continue;
    const dx = player.pos.x - z.pos.x, dz = player.pos.z - z.pos.z, d = Math.hypot(dx, dz), r = .42 + .38 * z.scale;
    if (d < r && d > 1e-4) { const k = NET.client ? .25 : 1; player.pos.x += (z.pos.x + dx / d * r - player.pos.x) * k; player.pos.z += (z.pos.z + dz / d * r - player.pos.z) * k; } // a member's proxies glide: push softly, no camera jumps
  }
  collide(player.pos, .42);
  if (Math.hypot(player.vel.x, player.vel.z) > .6) player.stillT = now; // Bulwark: standing still
  if (!ff) updateVitals(dt);
  if (!ff && rk('e_drone') && turrets.some(t => Math.hypot(t.g.position.x - player.pos.x, t.g.position.z - player.pos.z) < 6)) player.hp = Math.min(maxHp(), player.hp + 6 * rk('e_drone') * dt); // Javítódrón
  // ads
  const w = curW();
  const adsTarget = rmb && !player.sprint && player.knifeT <= 0 ? 1 : 0;
  player.ads += (adsTarget - player.ads) * Math.min(1, dt * 13);
  camera.fov = lerp(SET.fov, SET.fov / w.base.zoom, player.ads); camera.updateProjectionMatrix();
  // recoil recovery
  const rec = player.recoil * Math.min(1, dt * 10); player.recoil -= rec; player.pitch -= rec;
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * .06;
  const bob = player.onGround ? Math.sin(vm.bobT) * .035 * Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 5) * (1 - player.ads) : 0;
  camera.position.set(player.pos.x + rand(-sh, sh), player.pos.y + (ff ? .55 : 1.65) + bob, player.pos.z + rand(-sh, sh));
  camera.rotation.set(player.pitch, player.yaw, ff ? .18 : 0);
}
function updateVM(dt) {
  if (!vm.gun) return;
  const w = curW(), ads = player.ads, sightY = vm.gun.userData.sightY;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  vm.bobT += dt * (2 + speed * 1.7);
  vm.bobA = lerp(vm.bobA || 0, (1 - ads * .9) * Math.min(1, speed / 5) * (player.onGround ? 1 : .3), Math.min(1, dt * 8));
  // target pose: the smoothed layer blends ADS, sprint, reload, switch and off-hand actions into each other
  let x = lerp(.23, 0, ads), y = lerp(-.2, -sightY, ads), z = lerp(-.52, -.4, ads), rx = 0, ry = 0, rz = 0;
  if (player.sprint) { ry += .55; rx -= .15; x -= .04; y -= .03; }
  const RL = player.reloading && RELOADS[w.base.rl];
  if (RL) {
    const p = reloadProgress(), e = player.reloading === 'single' ? 1 : smooth(clamp(p / .12, 0, 1)) * smooth(clamp((1 - p) / .15, 0, 1));
    rz += RL.gun[0] * e; rx += RL.gun[1] * e; y += RL.gun[2] * e; x -= .03 * e; // bring the gun up and in so the hands are on screen
    if (RL.snap && p > RL.snap && p < RL.snap + .08) z += .012 * Math.sin((p - RL.snap) / .08 * Math.PI); // small action slap
  }
  if (player.switchT > 0) { const p = Math.sin((1 - player.switchT / SWITCH_T) * Math.PI); y -= .32 * p; rx -= .45 * p; }
  if (vm.pending && player.switchT <= SWITCH_T / 2) equipView();
  if (armAnim) { y -= .06; x += .05; rz -= .12; }
  const k = 1 - Math.exp(-dt * (ads > .5 ? 24 : player.reloading ? 9 : 14)), b = vm.blend || (vm.blend = { p: new V3(x, y, z), r: new V3() });
  b.p.x += (x - b.p.x) * k; b.p.y += (y - b.p.y) * k; b.p.z += (z - b.p.z) * k;
  b.r.x += (rx - b.r.x) * k; b.r.y += (ry - b.r.y) * k; b.r.z += (rz - b.r.z) * k;
  // additive layers on top: walk bob, mouse sway, recoil kick
  vm.swayX = lerp(vm.swayX, 0, Math.min(1, dt * 8)); vm.swayY = lerp(vm.swayY, 0, Math.min(1, dt * 8));
  vm.kick = lerp(vm.kick, 0, Math.min(1, dt * 18)); vm.kickR = lerp(vm.kickR, 0, Math.min(1, dt * 14));
  const bx = Math.cos(vm.bobT * .5) * .014 * vm.bobA, by = -Math.abs(Math.sin(vm.bobT * .5)) * .014 * vm.bobA;
  vmRoot.position.set(b.p.x + bx + vm.swayX, b.p.y + by + vm.swayY, b.p.z + vm.kick);
  vmRoot.rotation.set(b.r.x + vm.kickR, b.r.y, b.r.z);
  updateArm(dt);
  updateReloadAnim(dt);
  if (vm.gun.userData.spinner) vm.gun.userData.spinner.rotation.z += dt * 45 * (player.spin || 0);
  if (vm.flashT > 0) { vm.flashT -= dt; if (vm.flashT <= 0) vm.flash.visible = false; }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 60);
  const scoped = w.base.scopeView && ads > .85;
  vmRoot.visible = !scoped; $('scope').hidden = !scoped;
}

// ================= FIGHT FOR YOUR LIFE (Borderlands) =================
// at 0 HP you drop: you can only shoot. Kill a zombie before the clock runs out and you get back up.
// Every fall in the same job leaves less time. Out of time: solo the job fails, in a party you wait for a mate.
function startFFYL() {
  const M = mission; M.downs = (M.downs || 0) + 1;
  player.ffyl = player.ffylMax = Math.max(5, 15 - 3 * (M.downs - 1)) + U('swind') + 3 * rk('m_soul');
  player.ffylK = player.kills; player.hp = 0; player.sprint = false; player.shake = .4;
  SND.hurt(); SND.down(); // the box in the middle says it; no banner on top of it
  $('ffyl').hidden = false; renderer.domElement.style.filter = 'saturate(.25) contrast(1.15)';
}
function endFFYLView() { player.ffyl = 0; $('ffyl').hidden = true; renderer.domElement.style.filter = ''; }
function updateFFYL(dt) {
  if (player.kills > player.ffylK) { // second wind
    const L = U('swind'); endFFYLView();
    player.hp = maxHp() * (.2 + .2 * L); if (L >= 2) player.shield = maxShield(); player.lastHurt = now;
    banner('ÚJRA TALPON!', 'Második szél.'); SND.power(); return;
  }
  player.ffyl -= dt;
  $('ffylBar').style.width = clamp(player.ffyl / player.ffylMax, 0, 1) * 100 + '%'; $('ffylT').textContent = Math.max(0, player.ffyl).toFixed(1) + ' mp';
  if (player.ffyl <= 0) { endFFYLView(); if (NET.mode) netDown(); else mission.dead = true; }
}
