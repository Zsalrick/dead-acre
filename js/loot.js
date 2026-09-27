// ================= DROPS & POWER-UPS =================
const drops = [];
function spawnDrop(w, pos) {
  const g = new THREE.Group();
  const gun = buildGun(w, true); gun.scale.setScalar(1.7); gun.position.y = .7; g.add(gun);
  const col = new THREE.Color(rarColor(w));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.6 + w.q * .9, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = (2.6 + w.q * .9) / 2; g.add(beam);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(1.6, 1.6, 1); halo.position.y = .7; g.add(halo);
  const lv = textSprite([`LV ${w.level}`], rarColor(w), .55); lv.position.y = 1.45; g.add(lv);
  g.position.set(pos.x, 0, pos.z); scene.add(g);
  drops.push({ w, g, gun, t: 75, pos: g.position });
}
function removeDrop(d) {
  scene.remove(d.g);
  d.g.children.forEach(o => { if (o.material) { if (o.material.map && o.material.map !== glowTex) o.material.map.dispose(); o.material.dispose(); } if (o.geometry && o.isMesh) o.geometry.dispose(); });
  drops.splice(drops.indexOf(d), 1);
}

const POWERS = {
  max:    { lines: ['MAX', 'AMMO'], label: 'Max Ammo' },
  insta:  { lines: ['INSTA', 'KILL'], label: 'Insta-Kill' },
  double: { lines: ['2X'], label: 'Double Points' },
};
const powers = { insta: 0, double: 0 };
const powerUps = [];
function spawnPower(pos) {
  const type = pick(Object.keys(POWERS));
  const s = textSprite(POWERS[type].lines, '#b6ff8a', 1.5, 'rgba(80,255,60,.5)');
  s.position.set(pos.x, 1.1, pos.z); scene.add(s);
  powerUps.push({ type, s, t: 26 });
}
function takePower(p) {
  SND.power(); banner(POWERS[p.type].label.toUpperCase());
  if (p.type === 'max') [...player.slots, ...player.bag].forEach(w => { if (w) { w.reserve = resMax(w); w.ammo = w.mag; } });
  else powers[p.type] = 15;
}

// ================= INTERACTION =================
let focus = null; // {type, drop?}
function findFocus() {
  let best = null, bd = 2.3;
  for (const d of drops) { const dd = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z); if (dd < bd) { bd = dd; best = d; } }
  let bg = null; // whichever loot is nearest: a gun or a piece of armor
  for (const d of gearDrops) { const dd = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z); if (dd < bd) { bd = dd; bg = d; } }
  if (bg) return { type: 'gear', gd: bg, it: bg.it };
  if (best) return { type: 'drop', drop: best, w: best.w };
  const rf = reviveFocus(); if (rf) return rf;
  const cf = crateFocus(); if (cf) return cf;
  const af = areaFocus(); if (af) return af;
  if (Math.hypot(box.pos.x - player.pos.x, box.pos.z - player.pos.z) < 2.6) return { type: 'box', w: box.state === 'ready' ? box.weapon : null };
  if (Math.hypot(ammoBox.pos.x - player.pos.x, ammoBox.pos.z - player.pos.z) < 2.4) return { type: 'ammo' };
  return null;
}
function interact() {
  if (!focus) return;
  if (focus.type === 'drop' || focus.type === 'gear') return; // loot on the ground: F / hold F (game.js)
  else if (focus.type === 'crate') { takeCrate(focus.i); focus = null; }
  else if (focus.type === 'repair') repairGen();
  else if (!['box', 'ammo'].includes(focus.type)) areaInteract(focus);
  else if (focus.type === 'box') {
    if (box.state === 'idle') {
      if (player.points < SK.cost(BOX_COST)) return SND.deny();
      player.points -= SK.cost(BOX_COST); box.state = 'spin'; box.t = 2.4; box.swapT = 0; SND.buy();
    }
  } else if (focus.type === 'ammo') {
    const w = curW();
    if (player.points < SK.cost(AMMO_COST) || w.reserve >= resMax(w)) return SND.deny();
    player.points -= SK.cost(AMMO_COST); w.reserve = resMax(w); SND.buy();
  }
}
function updateBox(dt) {
  box.label.position.y = 2.1 + Math.sin(now * 2) * .12;
  box.label.visible = box.state === 'idle';
  if (box.state === 'spin') {
    box.t -= dt; box.swapT -= dt;
    if (box.swapT <= 0) {
      box.swapT = .1 + (2.4 - box.t) * .06;
      if (box.show) scene.remove(box.show);
      box.show = buildGun({ base: pick(BASES), q: Math.floor(Math.random() * 5) }, true);
      box.show.scale.setScalar(1.8); scene.add(box.show); tn(900 + Math.random() * 300, .05, .04, 'triangle');
    }
    box.show.position.set(box.pos.x, 1 + (2.4 - box.t) * .35, box.pos.z);
    if (box.t <= 0) {
      box.weapon = makeWeapon(pick(BASES), Math.max(1, rollRarity(.5)), lootLvl(1));
      scene.remove(box.show); box.show = buildGun(box.weapon, true); box.show.scale.setScalar(1.8);
      box.show.position.set(box.pos.x, 1.84, box.pos.z); scene.add(box.show);
      box.state = 'ready'; box.t = 12; SND.pickup(box.weapon.q); stats.boxSpins++;
    }
  } else if (box.state === 'ready') {
    box.t -= dt; box.show.rotation.y += dt * .8;
    box.show.position.y = 1.84 - Math.max(0, 3 - box.t) * .3;
    if (box.t <= 0) { box.state = 'idle'; scene.remove(box.show); box.show = null; }
  }
  if (box.show && box.state === 'spin') box.show.rotation.y += dt * 4;
}

// ================= ITEMS =================
function renderInv() {
  $('inv').innerHTML = ITEM_KEYS.map(k => `<div class="it${player.inv[k] ? '' : ' empty'}" style="--ic:${ITEMS[k].color}" title="${ITEMS[k].name}">` +
    `<b>${ITEMS[k].key}</b><img src="${ICONS[k]}" alt=""><strong>${player.inv[k] || 0}</strong><span>${ITEMS[k].name}</span></div>`).join('');
}
function sell() {
  if (!focus) return;
  let w;
  if (focus.type === 'drop') { w = focus.drop.w; removeDrop(focus.drop); }
  else if (focus.type === 'box' && box.state === 'ready') { w = box.weapon; box.state = 'idle'; scene.remove(box.show); box.show = null; boxUsed(); }
  else return;
  focus = null;
  const v = sellValue(w);
  player.points += v; player.earned += v; popText(`+${v} eladva`, rarColor(w)); SND.sell();
}
function useItem(k) {
  if (!k || player.itemCd > 0 || armAnim || player.reloading) return;
  if (!player.inv[k] || (k === 'med' && player.hp >= maxHp())) return SND.deny();
  const heal = SK.med();
  player.inv[k]--; player.itemCd = .45; renderInv();
  startArm(k === 'gren' || k === 'knife' ? 'throw' : 'use', k, () => {
    if (k === 'med') { player.hp = Math.min(maxHp(), player.hp + heal); SND.heal(); popText(`+${heal} életerő`, ITEMS.med.color); }
    else if (k === 'adren') { player.adrenT = 12; player.stam = maxStam(); SND.power(); }
    else throwProj(k);
  });
}
const projs = [];
const grenGeo = new THREE.SphereGeometry(.09, 10, 8), grenMat = new THREE.MeshLambertMaterial({ color: 0x3d4a2a });
const knifeGeo = new THREE.BoxGeometry(.025, .05, .34), knifeMat = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: .8, roughness: .3 });
const lobMat = new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: .5 });
function launchGrenade(w, from, mul = 1) {
  const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const m = new THREE.Mesh(grenGeo, lobMat); m.position.copy(from); scene.add(m);
  projs.push({ k: 'lob', m, v: fwd.multiplyScalar(26).add(new V3(0, 2.5, 0)), t: 6, w, mul });
}
function throwProj(k) {
  const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const type = throwKind(k), m = new THREE.Mesh(k === 'gren' ? grenGeo : knifeGeo, k === 'gren' ? (GREN_MATS[type] || grenMat) : (KNIFE_MATS[type] || knifeMat));
  m.position.copy(camera.position).addScaledVector(fwd, .4); m.position.y -= .08; m.castShadow = true;
  scene.add(m);
  const v = fwd.multiplyScalar(k === 'gren' ? 15 : 34); if (k === 'gren') v.y += 3.5;
  projs.push({ k, type, m, v, t: k === 'gren' ? (type === 'molotov' ? 3 : 1.8) : 2, bounces: type === 'ricochet' ? 2 : 0, hitSet: new Set() });
  SND.knife();
}
function explode(p, o = {}) {
  const r = (o.r || 5) * SK.explRadius(), pr = o.pr || 3.5, pdmg = o.pdmg || 35;
  fxExplosion(p, o.color, r);
  boomLight.position.set(p.x, p.y + 1.2, p.z); boomLight.color.set(o.color || 0xff8a30); boomLight.intensity = 10; SND.explode();
  const dmg = (o.zdmg || 150 + zombieHp() * 1.1) * SK.explMul();
  for (const z of zombies) {
    if (z.dead) continue;
    const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z);
    if (d < r) hurtZombie(z, dmg * (1 - d / r * .6), { color: '#ffa030' });
  }
  const pd = player.pos.distanceTo(p);
  if (pd < 12) player.shake = Math.max(player.shake, .45 * (1 - pd / 12));
  if (pd < pr && liveWorld()) hurtPlayer(Math.round(pdmg * (1 - pd / pr * .7)));
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i], pos = p.m.position, prev = pos.clone();
    p.t -= dt;
    p.v.y -= (p.k === 'gren' ? 16 : 5) * dt;
    pos.addScaledVector(p.v, dt);
    let done = p.t <= 0;
    if (p.k === 'lob') { // launcher round: bursts on whatever it touches first
      p.v.y -= 4 * dt; // 5 m/s² above + 4 here: flatter arc than a hand grenade
      if (Math.random() < dt * 30) burst(pos, 0x8a8a80, 1, .4, .4);
      const hitZ = zombies.some(z => !z.dead && Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z) < .8 * z.scale && pos.y < 2.2 * z.scale);
      if (pos.y < .1 || hitZ || !inBounds(pos.x, pos.z, 0) || obstacles.some(o => pos.x > o.minX && pos.x < o.maxX && pos.z > o.minZ && pos.z < o.maxZ && pos.y < o.h) || done) {
        const zd = p.w.dmg * (p.mul || 1) * (Math.random() < critChance() ? critMult() : 1);
        explode(pos.clone().setY(Math.max(.3, pos.y)), { r: p.w.base.splash, zdmg: zd, pr: 3, pdmg: 30 });
        if (p.w.unique === 'bigbang') for (let k = 0; k < 3; k++) { const a = k * 2.1 + rand(0, .5), q = pos.clone().add(new V3(Math.sin(a) * 3, 0, Math.cos(a) * 3)).setY(.3); setTimeout(() => mission && explode(q, { r: p.w.base.splash * .7, zdmg: zd * .5, pr: 2, pdmg: 15 }), 250 + k * 120); }
        done = true;
      }
    } else if (p.k === 'knife') {
      p.m.lookAt(pos.clone().add(p.v));
      const seg = pos.clone().sub(prev), len = seg.length();
      ray.set(prev, seg.normalize()); ray.far = len;
      const targets = rayBlockers.slice();
      for (const z of zombies) if (!z.dead) targets.push(...z.parts);
      const h = ray.intersectObjects(targets, false)[0];
      if (h) {
        const z = h.object.userData.z, head = !!h.object.userData.head;
        if (z) { knifeHit(p, z, head, h.point); done = !p.redirected; p.redirected = false; }
        else { burst(h.point, 0xffc070, 5, 2, .3); if (p.type === 'blast') explode(h.point.clone(), { r: 3, zdmg: 90 + zombieHp() * .9, pr: 2.5, pdmg: 15 }); done = true; }
      }
    } else {
      if (p.type === 'sticky' && !p.stuck) { const z = zombies.find(z => !z.dead && Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z) < .7 * z.scale && pos.y < 2 * z.scale); if (z) { p.stuck = z; p.off = new V3(pos.x - z.pos.x, 0, pos.z - z.pos.z).setLength(.3); SND.hit(); } }
      if (p.stuck) { if (p.stuck.dead && !p.stuck.g.parent) p.stuck = null; else { pos.set(p.stuck.pos.x + p.off.x, 1.2 * p.stuck.scale, p.stuck.pos.z + p.off.z); p.v.set(0, 0, 0); } }
      if (p.type === 'molotov' && pos.y < .12 && !p.stuck) { p.t = 0; } // shatters when it lands
      p.m.rotation.x += dt * 8;
      if (pos.y < .09) { pos.y = .09; p.v.y = Math.abs(p.v.y) * .35; p.v.x *= .6; p.v.z *= .6; }
      const hitObs = !inBounds(pos.x, pos.z, 0) ||
        obstacles.some(o => pos.x > o.minX && pos.x < o.maxX && pos.z > o.minZ && pos.z < o.maxZ && pos.y < o.h);
      if (hitObs) { pos.x = prev.x; pos.z = prev.z; p.v.x *= -.4; p.v.z *= -.4; }
      if (p.t <= 0) detonate(p);
    }
    if (done) { scene.remove(p.m); projs.splice(i, 1); }
  }
  updateFireZones(dt);
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 18);
}
const itemDrops = [];
const itemSpriteMats = {};
function spawnItem(k, pos) {
  if (!itemSpriteMats[k]) itemSpriteMats[k] = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ICON_CANVAS[k]), transparent: true, depthWrite: false });
  const s = new THREE.Sprite(itemSpriteMats[k]); s.scale.set(.6, .6, 1);
  s.position.set(pos.x + rand(-.3, .3), .5, pos.z + rand(-.3, .3)); scene.add(s);
  itemDrops.push({ k, s, t: 40 });
}
function updateItemDrops(dt) {
  for (let i = itemDrops.length - 1; i >= 0; i--) {
    const d = itemDrops[i]; d.t -= dt;
    d.s.position.y = .5 + Math.sin(now * 3 + i) * .08; d.s.visible = d.t > 6 || Math.sin(now * 16) > 0;
    if (Math.hypot(d.s.position.x - player.pos.x, d.s.position.z - player.pos.z) < 1.4 && player.inv[d.k] < itemMax(d.k)) {
      player.inv[d.k]++; renderInv(); SND.pickup(0); popText(`+1 ${ITEMS[d.k].name}`, ITEMS[d.k].color); d.t = 0;
    }
    if (d.t <= 0) { scene.remove(d.s); itemDrops.splice(i, 1); }
  }
}

// ---------- grenade and knife kinds ----------
const GREN_MATS = { molotov: new THREE.MeshStandardMaterial({ color: 0x6a4a1a, emissive: 0x3a1a00, roughness: .3 }), cryo: new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x1a4a5a }),
  shock: new THREE.MeshStandardMaterial({ color: 0x7d8dff, emissive: 0x2a2a8a }), sticky: new THREE.MeshStandardMaterial({ color: 0x9dff3a, emissive: 0x2a5a0a }) };
const KNIFE_MATS = { poison: new THREE.MeshStandardMaterial({ color: 0x7fe05a, emissive: 0x1a4a0a, metalness: .6 }), blast: new THREE.MeshStandardMaterial({ color: 0xff7a3a, emissive: 0x5a1a00, metalness: .6 }),
  ricochet: new THREE.MeshStandardMaterial({ color: 0xb8c8ff, emissive: 0x1a2a5a, metalness: .9, roughness: .2 }) };
function detonate(p) {
  const pos = p.m.position.clone().setY(Math.max(.3, p.m.position.y));
  if (p.type === 'molotov') { addFireZone(pos, 4, 6); explode(pos, { r: 2.5, zdmg: 40 + zombieHp() * .3, pr: 1.5, pdmg: 8, color: 0xff7a1a }); return; }
  if (p.type === 'cryo') {
    explode(pos, { r: 4, zdmg: 60 + zombieHp() * .5, pr: 2.5, pdmg: 10, color: 0x8ff0ff });
    for (const z of zombies) if (!z.dead && z.pos.distanceTo(pos) < 6) hurtZombie(z, 1, { w: { element: 'cryo' }, chain: false, dot: true, color: '#8ff0ff' });
    return;
  }
  if (p.type === 'shock') {
    explode(pos, { r: 3, zdmg: 60 + zombieHp() * .4, pr: 2, pdmg: 10, color: 0x7d8dff });
    const near = zombies.filter(z => !z.dead && z.pos.distanceTo(pos) < 10).sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos)).slice(0, 6);
    let from = pos;
    for (const z of near) { const to = new V3(z.pos.x, 1.3 * z.scale, z.pos.z); tracer(from, to, 0x7d8dff, .04); hurtZombie(z, 80 + zombieHp() * .9, { color: ELEMENTS.shock.color }); from = to; }
    SND.zap(); return;
  }
  if (p.type === 'sticky') { explode(pos, { r: 5.5, zdmg: (150 + zombieHp() * 1.1) * 1.5, pr: 3.5, pdmg: 35 }); return; }
  explode(pos);
}
function knifeHit(p, z, head, point) {
  if (p.hitSet.has(z)) { p.redirected = true; return; }
  p.hitSet.add(z);
  const base = (120 + zombieHp() * .8) * (head ? 2 : 1);
  if (p.type === 'poison') hurtZombie(z, base * .5, { head, color: '#7fe05a', burnDps: zombieHp() * .3, burnT: 5 });
  else if (p.type === 'blast') { hurtZombie(z, base * .6, { head, color: '#ff9a5a' }); explode(point.clone(), { r: 3, zdmg: 90 + zombieHp() * .9, pr: 2.5, pdmg: 15 }); }
  else hurtZombie(z, base, { head, color: '#ffffff' });
  hitmarker(z.dead); burst(point, 0x5a0a0a, 8, 3); SND.hit();
  if (p.bounces > 0) { // ricochet to the nearest other zombie
    const next = zombies.filter(o => !o.dead && !p.hitSet.has(o) && o.pos.distanceTo(z.pos) < 10).sort((a, b) => a.pos.distanceTo(z.pos) - b.pos.distanceTo(z.pos))[0];
    if (next) { p.bounces--; p.redirected = true; p.t = 2; const to = new V3(next.pos.x, 1.3 * next.scale, next.pos.z); p.m.position.copy(point); p.v.copy(to.sub(point).setLength(30)); p.v.y += 1; }
  }
}
// burning ground: molotovs (hurt zombies) and boss hazards (hurt players)
const fireZones = [];
function addFireZone(pos, r, t, hazard = 0) { fireZones.push({ pos: pos.clone().setY(0), r, t, tick: 0, hazard }); }
function updateFireZones(dt) {
  for (let i = fireZones.length - 1; i >= 0; i--) {
    const F = fireZones[i]; F.t -= dt; F.tick -= dt;
    for (let k = 0; k < 3; k++) { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * F.r; burst(new V3(F.pos.x + Math.sin(a) * r, .1, F.pos.z + Math.cos(a) * r), Math.random() < .5 ? 0xff6a1a : 0xffc04a, 1, 1.4, .5); }
    if (F.tick <= 0) {
      F.tick = .5;
      if (F.hazard) { if (!NET.client) hurtAt(F.pos, F.r, F.hazard * .5); }
      else for (const z of zombies) if (!z.dead && Math.hypot(z.pos.x - F.pos.x, z.pos.z - F.pos.z) < F.r) hurtZombie(z, zombieHp() * .12, { dot: true, color: '#ff7a1a', burnDps: zombieHp() * .2, burnT: 1.5 });
      if (!F.hazard && Math.hypot(player.pos.x - F.pos.x, player.pos.z - F.pos.z) < F.r) hurtPlayer(3, true);
    }
    if (F.t <= 0) fireZones.splice(i, 1);
  }
}
