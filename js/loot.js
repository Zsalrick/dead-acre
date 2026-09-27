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
  const af = areaFocus(); if (af) return af;
  if (Math.hypot(box.pos.x - player.pos.x, box.pos.z - player.pos.z) < 2.6) return { type: 'box', w: box.state === 'ready' ? box.weapon : null };
  if (Math.hypot(ammoBox.pos.x - player.pos.x, ammoBox.pos.z - player.pos.z) < 2.4) return { type: 'ammo' };
  return null;
}
function interact() {
  if (!focus) return;
  if (focus.type === 'drop' || focus.type === 'gear') return; // loot on the ground: F / hold F (game.js)
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
function launchGrenade(w, from) {
  const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const m = new THREE.Mesh(grenGeo, lobMat); m.position.copy(from); scene.add(m);
  projs.push({ k: 'lob', m, v: fwd.multiplyScalar(26).add(new V3(0, 2.5, 0)), t: 6, w });
}
function throwProj(k) {
  const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const m = new THREE.Mesh(k === 'gren' ? grenGeo : knifeGeo, k === 'gren' ? grenMat : knifeMat);
  m.position.copy(camera.position).addScaledVector(fwd, .4); m.position.y -= .08; m.castShadow = true;
  scene.add(m);
  const v = fwd.multiplyScalar(k === 'gren' ? 15 : 34); if (k === 'gren') v.y += 3.5;
  projs.push({ k, m, v, t: k === 'gren' ? 1.8 : 2 });
  SND.knife();
}
function explode(p, o = {}) {
  const r = (o.r || 5) * SK.explRadius(), pr = o.pr || 3.5, pdmg = o.pdmg || 35;
  burst(p, o.color || 0xffa030, 30, 7, .7); burst(p, 0x2b2b2b, 18, 4, 1);
  boomLight.position.set(p.x, p.y + 1, p.z); boomLight.intensity = 6; SND.explode();
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
        explode(pos.clone().setY(Math.max(.3, pos.y)), { r: p.w.base.splash, zdmg: p.w.dmg * (Math.random() < critChance() ? critMult() : 1), pr: 3, pdmg: 30 });
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
        if (z) { hurtZombie(z, (120 + zombieHp() * .8) * (head ? 2 : 1), { head, color: '#ffffff' }); hitmarker(z.dead); burst(h.point, 0x5a0a0a, 8, 3); SND.hit(); }
        else burst(h.point, 0xffc070, 5, 2, .3);
        done = true;
      }
    } else {
      p.m.rotation.x += dt * 8;
      if (pos.y < .09) { pos.y = .09; p.v.y = Math.abs(p.v.y) * .35; p.v.x *= .6; p.v.z *= .6; }
      const hitObs = !inBounds(pos.x, pos.z, 0) ||
        obstacles.some(o => pos.x > o.minX && pos.x < o.maxX && pos.z > o.minZ && pos.z < o.maxZ && pos.y < o.h);
      if (hitObs) { pos.x = prev.x; pos.z = prev.z; p.v.x *= -.4; p.v.z *= -.4; }
      if (p.t <= 0) explode(pos);
    }
    if (done) { scene.remove(p.m); projs.splice(i, 1); }
  }
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
