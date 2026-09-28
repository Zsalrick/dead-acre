// ================= GEAR (helmet · chest · legs · boots) =================
// every piece has armor (adds to the shield bar), 1–3 rolled attributes by rarity, and a brand.
// Each worn piece gives its brand's core bonus; wearing 2/3/4 pieces of one brand unlocks its set bonuses.
const GEAR_SLOTS = { head: 'Sisak', chest: 'Mellvért', legs: 'Nadrág', boots: 'Csizma' };
const GEAR_KEYS = Object.keys(GEAR_SLOTS);
const GEAR_NAMES = {
  head: ['Rohamsisak', 'Terepsapka', 'Bányászsisak', 'Gázálarc'], chest: ['Golyóálló mellény', 'Taktikai mellény', 'Bőrkabát', 'Lemezpáncél'],
  legs: ['Terepnadrág', 'Térdvédős nadrág', 'Munkásnadrág', 'Páncélozott nadrág'], boots: ['Bakancs', 'Gumicsizma', 'Rohambakancs', 'Futócipő'],
};
const GEAR_LEGENDS = { head: 'A Sírásó kalapja', chest: 'Az Utolsó Szentmise', legs: 'Hajnalig', boots: 'Hét mérföld' };
// flat: a plain number that grows with level · otherwise a fraction shown as %
const GSTATS = {
  hp:      { name: 'Max életerő',      roll: [6, 14], flat: true },
  armor:   { name: 'Páncél',           roll: [8, 16], flat: true },
  stam:    { name: 'Állóképesség',     roll: [8, 18], flat: true },
  dmg:     { name: 'Fegyversebzés',    roll: [.03, .07] },
  crit:    { name: 'Kritikus esély',   roll: [.02, .05] },
  critDmg: { name: 'Kritikus sebzés',  roll: [.06, .14] },
  head:    { name: 'Fejlövés-sebzés',  roll: [.05, .12] },
  reload:  { name: 'Újratöltés',       roll: [.04, .09] },
  speed:   { name: 'Mozgás',           roll: [.02, .05] },
  regen:   { name: 'Regeneráció',      roll: [.08, .18] },
  ammo:    { name: 'Tartalék lőszer',  roll: [.06, .14] },
  expl:    { name: 'Robbanás-sebzés',  roll: [.06, .14] },
  red:     { name: 'Sebzéscsökkentés', roll: [.02, .04] },
  points:  { name: 'Pont ölésért',     roll: [.04, .1] },
};
const BRANDS = {
  ranger:    { t4: ['Célpont kijelölve', 'A fejlövés 5 mp-re megjelöli a zombit: +50% sebzést kap mindenkitől.'], name: 'Ranger Supply',      color: '#9fcf6a', tag: 'Mesterlövész',  core: ['head', .08],  sets: [[2, 'crit', .05], [3, 'critDmg', .2], [4, 'head', .3]] },
  bulwark:   { t4: ['Rendíthetetlen', 'Ha egy másodpercig egy helyben állsz, 35%-kal kevesebb sebzést kapsz.'], name: 'Bulwark Industries', color: '#8fb0d8', tag: 'Tank',          core: ['armor', 15],  sets: [[2, 'hp', 30], [3, 'red', .08], [4, 'armor', 80]] },
  gravetide: { t4: ['Vérszomj', 'Minden ölés +5% sebzés 6 mp-ig, 10-szer halmozható. Ha megütnek, elveszik.'], name: 'Gravetide',          color: '#e06a58', tag: 'Sebzés',        core: ['dmg', .04],   sets: [[2, 'dmg', .08], [3, 'critDmg', .25], [4, 'dmg', .15]] },
  hollis:    { t4: ['Második lélegzet', 'Minden ölés a max életerőd 3%-át visszatölti.'], name: 'Hollis & Hart',      color: '#e8d08a', tag: 'Túlélő',        core: ['regen', .12], sets: [[2, 'hp', 25], [3, 'regen', .4], [4, 'red', .1]] },
  sable:     { t4: ['Szélvész', 'Sprint közben 30%-kal kevesebb sebzést kapsz, és az ölés visszatölti az állóképességet.'], name: 'Sable Line',         color: '#9a8aff', tag: 'Mozgékony',     core: ['speed', .03], sets: [[2, 'reload', .12], [3, 'speed', .08], [4, 'stam', 50]] },
  cinder:    { t4: ['Láncreakció', 'A robbanással ölt zombi 40% eséllyel maga is felrobban.'], name: 'Cinder Works',       color: '#ff9a4a', tag: 'Robbantó',      core: ['expl', .1],   sets: [[2, 'expl', .15], [3, 'ammo', .25], [4, 'points', .2]] },
};
// the brand bonus of one piece grows with its rarity
const coreVal = it => { const [k, v] = BRANDS[it.brand].core, x = v * (1 + .15 * it.q); return GSTATS[k].flat ? Math.round(x) : Math.round(x * 100) / 100; };
const fmtG = (k, v) => GSTATS[k].flat ? `+${Math.round(v)}` : `+${Math.round(v * 100)}%`;
function rollG(k, q, level) {
  const S = GSTATS[k], v = rand(S.roll[0], S.roll[1]) * (1 + q * .12);
  return S.flat ? Math.round(v * (1 + .06 * (level - 1))) : Math.round(v * (1 + .03 * (level - 1)) * 100) / 100;
}
// fabric: what armor gives when taken apart; armor optimization is paid in it
const FAB = '▦';
const gearBase = it => ({ head: 12, chest: 20, legs: 14, boots: 10 }[it.slot] || 12) * (1 + .08 * (it.level - 1)) * (1 + Math.min(4, it.q) * .15);
const gStatF = (it, k) => { const S = GSTATS[k], q = Math.min(4, it.q); return (1 + q * .12) * (S.flat ? 1 + .06 * (it.level - 1) : 1 + .03 * (it.level - 1)); };
function gRolls(it) { // [key, name, 0..1 where the roll landed]
  const rows = [['armor', 'Páncél', clamp((it.armor / gearBase(it) - .9) / .2, 0, 1)]];
  for (const k in it.stats) { const S = GSTATS[k]; rows.push([k, S.name, clamp((it.stats[k] / gStatF(it, k) - S.roll[0]) / (S.roll[1] - S.roll[0]), 0, 1)]); }
  return rows;
}
const gOptCost = (it, p) => ({ fab: Math.round((3 + 10 * p) * (1 + Math.min(4, it.q) * .5)), cash: Math.round(120 * (1 + it.level / 5) * (1 + 2 * p) / 10) * 10 });
function gOptimize(it, k) {
  const row = gRolls(it).find(r => r[0] === k); if (!row || row[2] >= .999) return false;
  const np = Math.min(1, row[2] + .1);
  if (k === 'armor') it.armor = Math.max(it.armor + 1, Math.round(gearBase(it) * (.9 + .2 * np)));
  else { const S = GSTATS[k], v = (S.roll[0] + np * (S.roll[1] - S.roll[0])) * gStatF(it, k); it.stats[k] = S.flat ? Math.max(it.stats[k] + 1, Math.round(v)) : Math.max(Math.round((it.stats[k] + .01) * 100) / 100, Math.round(v * 100) / 100); }
  gearChanged(); return true;
}
function makeGear(slot, q, level, brand) {
  slot = slot || pick(GEAR_KEYS); brand = brand || pick(Object.keys(BRANDS)); q = Math.min(q, 4); // armor tops out at legendary
  const keys = Object.keys(GSTATS).filter(k => k !== 'armor'), stats = {}, n = [1, 1, 2, 2, 3][q];
  while (Object.keys(stats).length < n) { const k = pick(keys); if (!(k in stats)) stats[k] = rollG(k, q, level); }
  const armor = Math.round({ head: 12, chest: 20, legs: 14, boots: 10 }[slot] * (1 + .08 * (level - 1)) * (1 + q * .15) * rand(.9, 1.1));
  return { slot, brand, q, level, armor, stats, name: q === 4 ? GEAR_LEGENDS[slot] : `${BRANDS[brand].name.split(' ')[0]} ${pick(GEAR_NAMES[slot])}` };
}
// ---------- exotic armor (The Division): one talent that changes how you play; bosses drop them ----------
const EXO_COL = '#ff5a3a';
const EXOTICS = {
  vamp:    { slot: 'chest', name: 'Vérszívó kabát',    talent: 'Minden ölés a max életerőd 8%-át visszatölti.' },
  nova:    { slot: 'chest', name: 'Pajzsnóva mellvért', talent: 'Ha a pajzsod elfogy, lökéshullám robban körülötted.' },
  berserk: { slot: 'head',  name: 'Berzerker sisak',    talent: 'Minél kevesebb az életerőd, annál többet sebzel: legfeljebb +50%.' },
  glass:   { slot: 'head',  name: 'Üvegágyú',           talent: '+50% kritikus sebzés, de −25% max életerő.' },
  quick:   { slot: 'legs',  name: 'Gyorskezű nadrág',   talent: 'Fejlövéses ölés után a tár azonnal megtelik.' },
  league:  { slot: 'boots', name: 'Hétmérföldes csizma', talent: '+20% mozgás, a sprint nem fogyaszt állóképességet.' },
  cryo:    { slot: 'legs',  name: 'Kriosztát nadrág',   talent: 'A lelassított és fagyott zombik 30%-kal több sebzést kapnak tőled.' },
  bomber:  { slot: 'chest', name: 'Robbanómellény',     talent: 'Robbanással ölt zombi után visszakapsz egy gránátot.' },
  priest:  { slot: 'head',  name: 'Tábori lelkész sisakja', talent: 'Háromszor gyorsabban éleszted fel a társad, és felálláskor teli az élete.' },
};
function makeExotic(key, level) {
  key = EXOTICS[key] ? key : pick(Object.keys(EXOTICS));
  const E = EXOTICS[key], it = makeGear(E.slot, 4, level);
  return Object.assign(it, { exo: key, name: E.name, armor: Math.round(it.armor * 1.1) });
}
const exoOn = k => wornGear().some(it => it.exo === k);
const brand4 = k => (brandCounts()[k] || 0) >= 4; // four pieces of one brand switch on its talent
const gCol = it => it.exo ? EXO_COL : RARITIES[it.q].color;
const gearValue = it => Math.round([40, 100, 220, 450, 900][it.q] * (1 + .08 * (it.level - 1)));
const gearPrice = it => Math.round(gearValue(it) * 4 / 10) * 10;

// ---------- totals (cached; call gearChanged() after the worn set changes) ----------
let gearCache = null;
const wornGear = () => profile && profile.gear ? GEAR_KEYS.map(k => profile.gear[k]).filter(Boolean) : [];
function brandCounts() { // an exotic is a wildcard: it counts toward the brand you wear most
  const c = {}, w = wornGear(); w.forEach(it => { if (!it.exo) c[it.brand] = (c[it.brand] || 0) + 1; });
  const ex = w.filter(it => it.exo).length, top = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; if (ex && top) c[top] += ex;
  return c;
}
function gearTotals() {
  if (gearCache) return gearCache;
  const t = {}, add = (k, v) => t[k] = (t[k] || 0) + v, count = brandCounts();
  for (const it of wornGear()) { const e = 1 + .03 * (it.exp || 0); add('armor', it.armor * e); for (const k in it.stats) add(k, it.stats[k] * e); add(BRANDS[it.brand].core[0], coreVal(it) * e); } // expertise: +3% a level
  for (const b in count) for (const [n, k, v] of BRANDS[b].sets) if (count[b] >= n) add(k, v);
  if (vetOpen()) for (const k in SH.vet.ranks) if (VET[k] && SH.vet.ranks[k] > 0) add(k, vetVal(k, SH.vet.ranks[k])); // veteran ranks (vet.js): shared, from level 30
  return gearCache = t;
}
const G = k => gearTotals()[k] || 0;
const gearChanged = () => { gearCache = null; };

// ---------- cards ----------
function gearCard(it, act, worn) {
  const B = BRANDS[it.brand], cnt = brandCounts()[it.brand] || 0;
  const rows = [`<li class="arm"><span>Páncél</span><b>+${it.armor}</b></li>`,
    `<li class="core" style="color:${B.color}"><span>${GSTATS[B.core[0]].name} <small>márka</small></span><b>${fmtG(B.core[0], coreVal(it))}</b></li>`,
    ...Object.entries(it.stats).map(([k, v]) => `<li><span>${GSTATS[k].name}</span><b>${fmtG(k, v)}</b></li>`)].join('');
  const sets = B.sets.map(([n, k, v]) => `<li class="${cnt >= n ? 'on' : ''}"><span>${n} db</span>${GSTATS[k].name} ${fmtG(k, v)}</li>`).join('');
  return `<div class="wcard mini gcard" style="--rc:${RARITIES[it.q].color};--bc:${B.color}"><div class="head"><div class="lvl">Lv ${it.level}</div>
    <div class="rar">${RARITIES[it.q].name} · ${GEAR_SLOTS[it.slot]}</div><div class="name">${it.name}</div>
    <div class="sub"><span style="color:${B.color}">${B.name}</span> · ${B.tag}${worn != null ? ` · ${cnt}/4 viselve` : ''}</div></div>
    <ul class="gstats">${rows}</ul><ul class="gsets">${sets}</ul>${act ? `<div class="act">${act}</div>` : ''}</div>`;
}
function gearSummary() {
  const t = gearTotals(), keys = Object.keys(GSTATS).filter(k => t[k]);
  const sets = Object.entries(brandCounts()).map(([b, n]) => `<li><b style="color:${BRANDS[b].color}">${BRANDS[b].name}</b> <span>${n} db${BRANDS[b].sets.filter(s => n >= s[0]).map(s => ` · ${GSTATS[s[1]].name} ${fmtG(s[1], s[2])}`).join('')}</span></li>`).join('');
  return `<div class="gsum"><ul class="mlist">${keys.map(k => `<li><b>${GSTATS[k].name}</b><span>${fmtG(k, t[k])}</span></li>`).join('') || '<li><span>Nincs rajtad páncél.</span></li>'}</ul>
    ${sets ? `<h3>Aktív szettek</h3><ul class="mlist">${sets}</ul>` : ''}
    ${(() => { const tl = [...wornGear().filter(it => it.exo && EXOTICS[it.exo]).map(it => [EXOTICS[it.exo].name, EXOTICS[it.exo].talent, EXO_COL]), ...Object.keys(BRANDS).filter(brand4).map(k => [BRANDS[k].t4[0], BRANDS[k].t4[1], BRANDS[k].color])]; return tl.length ? `<h3>Aktív tehetségek</h3><ul class="tlist">${tl.map(([n, d, c]) => `<li><b style="color:${c}">${n}</b> ${d}</li>`).join('')}</ul>` : ''; })()}</div>`;
}

// ---------- gear dropped during a job: walk over it to bag it; it is yours if you extract ----------
const gearDrops = [], gearTexes = {}, gearPlane = new THREE.PlaneGeometry(1.1, 1.1 * 180 / 320);
function gearTex(it) { const u = gPic(it); return gearTexes[u] || (gearTexes[u] = new THREE.TextureLoader().load(u)); } // cached per icon, kept for the session
function spawnGearDrop(it, pos) {
  if (Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) < 35) SND.drop(it.exo ? 5 : it.q);
  const col = new THREE.Color(gCol(it)), g = new THREE.Group();
  const m = new THREE.Mesh(gearPlane, new THREE.MeshBasicMaterial({ map: gearTex(it), transparent: true, alphaTest: .1, side: THREE.DoubleSide })); // the item's own 2D picture, spinning like a dropped item in Minecraft
  m.position.y = .6; g.add(m);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2 + it.q * .8, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 1 + it.q * .4; g.add(beam);
  g.position.set(pos.x + rand(-.5, .5), 0, pos.z + rand(-.5, .5)); scene.add(g);
  const lv = textSprite([`LV ${it.level}`], RARITIES[it.q].color, .5); lv.position.y = 1.05; g.add(lv);
  const d = { it, g, m, t: 90, pos: g.position }; gearDrops.push(d); return d;
}
function updateGearDrops(dt) {
  for (let i = gearDrops.length - 1; i >= 0; i--) {
    const d = gearDrops[i]; d.t -= dt;
    d.m.rotation.y += dt * 2; d.m.position.y = .6 + Math.sin(now * 2.4 + d.pos.x) * .08; d.g.visible = d.t > 8 || Math.sin(now * 14) > 0;
    if (d.t <= 0) removeGearDrop(d);
  }
}
function removeGearDrop(d) { scene.remove(d.g); d.g.traverse(o => { if (o.geometry && o.geometry !== gearPlane) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map !== glowTex && !Object.values(gearTexes).includes(o.material.map)) o.material.map.dispose(); o.material.dispose(); } }); const i = gearDrops.indexOf(d); if (i >= 0) gearDrops.splice(i, 1); }
const gearBagMax = () => 6 + U('bag'); // armor pieces a job's bag holds
function gearSwapOut(it) { const G = mission.gear, same = G.filter(g => g.slot === it.slot), pool = same.length ? same : G; return pool.reduce((a, b) => gearScore(b) < gearScore(a) ? b : a); }
function takeGear(d) {
  if (mission && mission.gear.length >= gearBagMax()) { // full: swap with the weakest piece
    const out = gearSwapOut(d.it); mission.gear.splice(mission.gear.indexOf(out), 1); itemFeed('eldobta', out.name, out.q);
    netShareDrop('g', out, spawnGearDrop(out, player.pos.clone().add(new V3(rand(-.6, .6), 0, rand(-.6, .6)))));
  }
  if (d.it.exo) (stats.exo || (stats.exo = {}))[d.it.exo] = 1; netTookDrop(d); itemFeed('felvette', d.it.name, d.it.q); d.it.found = true; mission.gear.push(d.it); removeGearDrop(d); SND.pickup(d.it.q); popText(`${d.it.name} · a zsákba (a bázison veheted fel)`, RARITIES[d.it.q].color); }
function clearGearDrops() { while (gearDrops.length) removeGearDrop(gearDrops[gearDrops.length - 1]); }

// ---------- weapons: two in hand (L, fixed slots), up to five in the bag (B), the stash at home (S) ----------
const bagMax = () => 5 + 2 * U('bag'); // the Nagyobb táska upgrade adds 2 a level
// a gun moved into a hand slot swaps with what was there; hands may never end up empty
const canUse = w => !w || !profile || w.level <= profile.level || profile.level >= LEVEL_CAP; // over your level: bag only, like The Division
const exoHandOk = (L, w, j) => !w || !w.unique || !L.some((o, k) => k !== j && o && o.unique); // one exotic gun in your hands at a time
const exoWearOk = (G, it) => !it || !it.exo || !GEAR_KEYS.some(k => k !== it.slot && G[k] && G[k].exo); // one exotic piece worn at a time
function moveGun(lists, from, i, to, j) {
  const src = lists[from], dst = lists[to], w = src && src[i];
  if (!w || !dst || (to === 'L' && !canUse(w))) return false;
  if (to === 'L' && from !== 'L' && !exoHandOk(dst, w, j)) { popText('Egyszerre csak 1 egzotikus fegyver lehet a kezedben', '#ff8a70'); SND.deny(); return false; }
  if (to === 'L') {
    const old = dst[j]; if (from === 'L' && i === j) return false;
    dst[j] = w;
    if (from === 'L') src[i] = old; else if (old) src[i] = old; else src.splice(i, 1);
    return true;
  }
  if (dst.length >= (to === 'B' ? bagMax() : to === 'K' ? SHARED_MAX : stashMax())) return false;
  if (from === 'L') { if (src.filter(Boolean).length < 2) return false; src[i] = null; } else src.splice(i, 1);
  dst.push(w); return true;
}
