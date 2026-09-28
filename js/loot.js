// ================= DROPS & POWER-UPS =================
const drops = [];
function spawnDrop(w, pos) {
  if (typeof player !== 'undefined' && Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) < 35) SND.drop(w.unique ? 5 : w.q);
  const g = new THREE.Group();
  const gun = buildGun(w, true); gun.scale.setScalar(1.7); gun.position.y = .7; g.add(gun);
  const col = new THREE.Color(rarColor(w));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.6 + w.q * .9, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = (2.6 + w.q * .9) / 2; g.add(beam);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(1.6, 1.6, 1); halo.position.y = .7; g.add(halo);
  const better = canUse(w) && typeof curW === 'function' && player.slots && player.slots.some(Boolean) && dps(w) > Math.max(...player.slots.filter(Boolean).map(dps));
  const lv = textSprite([`${better ? 'JOBB · ' : ''}${w.unique ? 'Egzotikus' : RARITIES[w.q].name} · ${w.name} · Lv ${w.level}`], canUse(w) ? rarColor(w) : '#ff5a4a', .5); lv.position.y = 1.45; lv.material.sizeAttenuation = false; lv.scale.multiplyScalar(.045); g.add(lv); // the same size at any distance
  if (w.q >= 4) { // legendary and unique: a fat beam, a ring on the ground and a sound you learn to love
    const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .95, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .03; g.add(ring);
    beam.scale.set(3.2, 2.2, 3.2); beam.position.y *= 2.2; halo.scale.set(3, 3, 1);
    if (typeof SND !== 'undefined' && mission) SND.legend(w.unique);
  }
  g.position.set(pos.x, 0, pos.z); scene.add(g);
  const d = { w, g, gun, t: 75, pos: g.position }; drops.push(d); return d;
}
function removeDrop(d) {
  scene.remove(d.g); d.g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  d.g.children.forEach(o => { if (o.material) { if (o.material.map && o.material.map !== glowTex) o.material.map.dispose(); o.material.dispose(); } });
  drops.splice(drops.indexOf(d), 1);
}

const POWERS = {
  max:    { lines: ['MAX', 'AMMO'], label: 'Max Ammo' },
  insta:  { lines: ['INSTA', 'KILL'], label: 'Insta-Kill' },
  double: { lines: ['2X'], label: 'Double Points' },
  ammo:   { lines: ['LŐSZER'], label: 'Lőszer', small: true }, // never rolled at random: dropped on purpose
};
const powers = { insta: 0, double: 0 };
const powerUps = [];
// ammo on the ground is typed by weapon family, with its own icon: mostly for a gun you carry, sometimes for another
const AMMO_COL = { pistol: '#e8c86a', smg: '#9fd0ff', rifle: '#ffb060', marks: '#c8a8ff', heavy: '#ff7a5a', shotgun: '#ff5a5a', energy: '#6ff0c8', explosive: '#ffd23f' };
const ammoMats = {};
// every family has its own round, drawn after the real thing: 9 mm, a mag of SMG rounds, 5.56, .308, a .50 belt, a 12-gauge shell, an energy cell, a 40 mm grenade
const ammoCanvases = {}, ammoURLs = {};
function ammoCanvas(cat, ring = true) {
  const key = cat + ring; if (ammoCanvases[key]) return ammoCanvases[key];
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'), col = AMMO_COL[cat] || '#e8c86a';
  if (ring) { g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.strokeStyle = col; g.lineWidth = 4; g.stroke(); }
  const brass = (x, y, w, h) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#8a6a28'); gr.addColorStop(.45, '#f0d080'); gr.addColorStop(1, '#8a6a28'); g.fillStyle = gr; g.fillRect(x, y, w, h); g.fillStyle = '#6a5020'; g.fillRect(x - 1, y + h - 4, w + 2, 4); };
  const copper = (x, y, w, h, sharp) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#8a4a28'); gr.addColorStop(.45, '#e8a070'); gr.addColorStop(1, '#8a4a28'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, y + h); if (sharp) { g.quadraticCurveTo(x, y + h * .35, x + w / 2, y); g.quadraticCurveTo(x + w, y + h * .35, x + w, y + h); } else { g.lineTo(x, y + h * .5); g.arc(x + w / 2, y + h * .5, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); } g.fill(); };
  const round = (x, base, w, caseH, bulH, neck, sharp) => { if (neck) { brass(x, base - caseH, w, caseH); g.fillStyle = '#c8a050'; g.beginPath(); g.moveTo(x, base - caseH); g.lineTo(x + w * .22, base - caseH - neck); g.lineTo(x + w * .78, base - caseH - neck); g.lineTo(x + w, base - caseH); g.fill(); copper(x + w * .22, base - caseH - neck - bulH, w * .56, bulH, sharp); } else { brass(x, base - caseH, w, caseH); copper(x, base - caseH - bulH, w, bulH, sharp); } };
  if (cat === 'pistol') { round(38, 88, 20, 26, 16, 0, false); round(68, 88, 20, 26, 16, 0, false); }
  else if (cat === 'smg') { g.fillStyle = '#2a2c2e'; g.fillRect(44, 58, 40, 36); g.fillStyle = '#44484c'; g.fillRect(44, 58, 40, 6); round(47, 60, 15, 16, 11, 0, false); round(66, 60, 15, 16, 11, 0, false); }
  else if (cat === 'rifle') { for (let k = 0; k < 3; k++) round(34 + k * 22, 92, 14, 36, 18, 8, true); }
  else if (cat === 'marks') { round(44, 100, 14, 46, 26, 10, true); round(70, 100, 14, 46, 26, 10, true); }
  else if (cat === 'heavy') { g.save(); g.translate(64, 62); g.rotate(-.5); for (let k = -2; k <= 2; k++) { g.fillStyle = '#3a3c3e'; g.fillRect(k * 16 - 9, 16, 18, 8); round(k * 16 - 7, 18, 14, 30, 16, 6, true); } g.restore(); }
  else if (cat === 'shotgun') { for (const x of [40, 68]) { const gr = g.createLinearGradient(x, 0, x + 22, 0); gr.addColorStop(0, '#7a1a1a'); gr.addColorStop(.45, '#e84a3a'); gr.addColorStop(1, '#7a1a1a'); g.fillStyle = gr; g.fillRect(x, 34, 22, 44); g.fillStyle = '#5a1010'; for (let k = 0; k < 4; k++) g.fillRect(x + 2 + k * 5, 34, 2, 5); brass(x - 1, 76, 24, 16); } }
  else if (cat === 'energy') { g.fillStyle = '#1e2a2a'; g.fillRect(46, 32, 36, 60); g.fillStyle = '#5a6a6a'; g.fillRect(56, 26, 16, 7); const gr = g.createLinearGradient(0, 38, 0, 88); gr.addColorStop(0, '#dfffff'); gr.addColorStop(1, col); g.fillStyle = gr; g.fillRect(51, 40, 26, 46); g.fillStyle = '#1e2a2a'; g.beginPath(); g.moveTo(67, 44); g.lineTo(57, 64); g.lineTo(64, 64); g.lineTo(60, 82); g.lineTo(71, 60); g.lineTo(64, 60); g.fill(); }
  else if (cat === 'explosive') { brass(46, 70, 36, 20); const gr = g.createLinearGradient(46, 0, 82, 0); gr.addColorStop(0, '#3a4a2a'); gr.addColorStop(.45, '#7a8a5a'); gr.addColorStop(1, '#3a4a2a'); g.fillStyle = gr; g.beginPath(); g.moveTo(46, 70); g.lineTo(46, 50); g.quadraticCurveTo(46, 28, 64, 26); g.quadraticCurveTo(82, 28, 82, 50); g.lineTo(82, 70); g.fill(); g.fillStyle = '#ffd23f'; g.fillRect(46, 56, 36, 5); }
  return ammoCanvases[key] = c;
}
const ammoURL = cat => ammoURLs[cat] || (ammoURLs[cat] = ammoCanvas(cat, false).toDataURL());
function ammoIcon(cat) { return ammoMats[cat] || (ammoMats[cat] = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ammoCanvas(cat)), transparent: true, depthWrite: false })); }
function ammoCat() { const mine = [...player.slots, ...player.bag].filter(Boolean).map(w => CAT[w.base.id]).filter(Boolean); return mine.length && Math.random() < .7 ? pick(mine) : pick([...new Set(Object.values(CAT))]); }
function spawnPower(pos, type) {
  type = type || pick(Object.keys(POWERS).filter(k => !POWERS[k].small));
  let s, cat = null;
  if (type === 'ammo') { cat = ammoCat(); s = new THREE.Sprite(ammoIcon(cat)); s.scale.set(.75, .75, 1); }
  else s = textSprite(POWERS[type].lines, '#b6ff8a', 1.5, 'rgba(80,255,60,.5)');
  s.position.set(pos.x, type === 'ammo' ? .6 : 1.1, pos.z); scene.add(s);
  powerUps.push({ type, s, t: 26, cat });
}
const ammoFits = p => [...player.slots, ...player.bag].some(w => w && CAT[w.base.id] === p.cat); // no gun for it: it stays on the ground
function takePower(p) {
  if (p.type === 'ammo') { const nm = `${CAT_NAMES[p.cat] || ''} lőszer`; itemFeed('felvette', nm, 0);
    [...player.slots, ...player.bag].forEach(w => { if (w && CAT[w.base.id] === p.cat) w.reserve = Math.min(resMax(w), w.reserve + w.mag * 2); }); SND.reload(); return popText(`+ ${nm}`, AMMO_COL[p.cat] || '#ffd27a'); }
  itemFeed('felvette', POWERS[p.type].label, 1);
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
  let br = null; for (const d of resDrops) { const dd = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z); if (dd < bd) { bd = dd; br = d; } }
  if (br) return { type: 'res', rd: br };
  if (bg) return { type: 'gear', gd: bg, it: bg.it };
  if (best) return { type: 'drop', drop: best, w: best.w };
  const rf = reviveFocus(); if (rf) return rf;
  const ch = cacheFocus(); if (ch) return ch;
  const cf = crateFocus(); if (cf) return cf;
  const af = areaFocus(); if (af) return af;
  if (MAP.range) return Math.hypot(RANGE_DESK[0] - player.pos.x, RANGE_DESK[1] - player.pos.z) < 2.6 ? { type: 'desk' } : null;
  if (Math.hypot(box.pos.x - player.pos.x, box.pos.z - player.pos.z) < 2.6) return { type: 'box', w: box.state === 'ready' ? box.weapon : null };
  if (Math.hypot(ammoBox.pos.x - player.pos.x, ammoBox.pos.z - player.pos.z) < 2.4) return { type: 'ammo' };
  return null;
}
function interact() {
  if (!focus) return;
  if (focus.type === 'drop' || focus.type === 'gear') return; // loot on the ground: F / hold F (game.js)
  else if (focus.type === 'crate') { takeCrate(focus.i); focus = null; }
  else if (focus.type === 'carry') { carryAct(); focus = null; }
  else if (focus.type === 'cache') { openCache(); focus = null; }
  else if (focus.type === 'repair') { if (focus.gi == null) repairGen(); } // generators: held, see holdRepair
  else if (focus.type === 'desk') { if (NET.client) { popText('A lőteret a vezető állítja.', '#ff8a70'); return SND.deny(); } openStation('desk'); }
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
  box.label.visible = box.state === 'idle' && !MAP.range;
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
    `<kbd>${ITEMS[k].key}</kbd><strong>${player.inv[k] || 0}</strong><span>${itemName(k)}</span></div>`).join('') +
    (isCls('necro') && augOn('cross') ? `<div class="it${player.cross > 0 ? '' : ' empty'}" style="--ic:#9d7cff" title="Kereszt: egy zombit a szolgáddá térít"><kbd>${keyName(boundKey('Digit3'))}</kbd><strong>${player.cross || 0}</strong><span>Kereszt</span></div>` : ''); // the necromancer's cross
}
function itemDesc(k) { return itemType(k).desc; }
function itemName(k) { return itemType(k).name; // the grenade / knife type you picked
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
  const mk = throwKind('med');
  if (!player.inv[k] || (k === 'med' && player.hp >= maxHp() && !(mk === 'shield' && player.shield < maxShield()))) return SND.deny();
  if (k === 'gren' && rk('e_overclock')) player.overT = Math.max(player.overT || 0, now + 4); // Túlhajtás
  const heal = SK.med();
  player.inv[k]--; player.itemCd = .45; renderInv();
  startArm(k === 'gren' || k === 'knife' ? 'throw' : 'use', k, () => {
    if (k === 'med' && mk === 'regen') { player.regenT = 6; player.regenR = heal * 1.6 / 6; SND.heal(); popText('Regenerálás · 6 mp', ITEMS.med.color); }
    else if (k === 'med') { const h = Math.round(heal * (mk === 'shield' ? .5 : mk === 'combat' ? .7 : 1)); player.hp = Math.min(maxHp(), player.hp + h); if (mk === 'shield') player.shield = maxShield(); if (mk === 'combat') player.guardT = now + 4; SND.heal(); popText(`+${h} életerő${mk === 'shield' ? ' · pajzs tele' : ''}`, ITEMS.med.color); }
    else if (k === 'adren') { const sk = throwKind('adren'); player.stimK = sk; player.adrenT = STIM_TYPES[sk].t; if (sk === 'adren') player.stam = maxStam(); SND.power(); popText(STIM_TYPES[sk].name, STIM_TYPES[sk].col); }
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
  fxExplosion(p, o.color, r); pushFx(['x', Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.z * 10), Math.round(r * 10), o.color || 0xff8a30]);
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
      player.inv[d.k]++; renderInv(); SND.pickup(0); itemFeed('felvette', ITEMS[d.k].name, 0); popText(`+1 ${ITEMS[d.k].name}`, ITEMS[d.k].color); d.t = 0;
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
// ---------- parts / fabric on the ground: picked up with F like any loot (a disconnected player's backpack) ----------
const resDrops = [];
function spawnResDrop(k, n, pos) {
  const s = textSprite([`+${n}`, k === 'fabric' ? 'anyag' : 'alkatrész'], '#e8e2d0', .7, 'rgba(0,0,0,.55)'); s.position.set(pos.x, .9, pos.z); scene.add(s);
  const d = { k, n, s, pos: s.position, t: 180 }; resDrops.push(d); return d;
}
function removeResDrop(d) { scene.remove(d.s); if (d.s.material.map) d.s.material.map.dispose(); d.s.material.dispose(); const i = resDrops.indexOf(d); if (i >= 0) resDrops.splice(i, 1); }
function takeRes(d) { netTookDrop(d); mission[d.k] = (mission[d.k] || 0) + d.n; const u = d.k === 'fabric' ? FAB : '⚙'; itemFeed('felvette', `${d.n} ${u}`, 0); SND.pickup(1); popText(`+${d.n} ${u} (kijutáskor a tiéd)`, '#e8e2d0'); removeResDrop(d); }
function updateResDrops(dt) { for (let i = resDrops.length - 1; i >= 0; i--) { const d = resDrops[i]; d.t -= dt; d.s.position.y = .9 + Math.sin(now * 2 + i) * .08; if (d.t <= 0) removeResDrop(d); } }
function clearResDrops() { while (resDrops.length) removeResDrop(resDrops[resDrops.length - 1]); }
// burning ground: molotovs (hurt zombies) and boss hazards (hurt players)
const fireZones = [];
function addFireZone(pos, r, t, hazard = 0, visual = false) { fireZones.push({ pos: pos.clone().setY(0), r, t, tick: 0, hazard, visual }); if (!visual && !hazard) pushFx(['f', Math.round(pos.x * 10), Math.round(pos.z * 10), Math.round(r * 10), Math.round(t)]); } // a teammate's copy only burns to look at
function updateFireZones(dt) {
  for (let i = fireZones.length - 1; i >= 0; i--) {
    const F = fireZones[i]; F.t -= dt; F.tick -= dt;
    for (let k = 0; k < 3; k++) { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * F.r; burst(new V3(F.pos.x + Math.sin(a) * r, .1, F.pos.z + Math.cos(a) * r), Math.random() < .5 ? 0xff6a1a : 0xffc04a, 1, 1.4, .5); }
    if (F.visual) { if (F.t <= 0) fireZones.splice(i, 1); continue; }
    if (F.tick <= 0) {
      F.tick = .5;
      if (F.hazard) { if (!NET.client) hurtAt(F.pos, F.r, F.hazard * .5); }
      else for (const z of zombies) if (!z.dead && Math.hypot(z.pos.x - F.pos.x, z.pos.z - F.pos.z) < F.r) hurtZombie(z, zombieHp() * .12, { dot: true, color: '#ff7a1a', burnDps: zombieHp() * .2, burnT: 1.5 });
      if (!F.hazard && Math.hypot(player.pos.x - F.pos.x, player.pos.z - F.pos.z) < F.r) hurtPlayer(3, true);
    }
    if (F.t <= 0) fireZones.splice(i, 1);
  }
}
