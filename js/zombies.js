// ================= ZOMBIES =================
const zombies = [];
const ZG = {
  torso: new THREE.BoxGeometry(.62, .8, .36), head: new THREE.BoxGeometry(.42, .42, .42),
  arm: new THREE.BoxGeometry(.16, .72, .16), leg: new THREE.BoxGeometry(.21, .8, .22), eye: new THREE.BoxGeometry(.09, .05, .02),
  pus: new THREE.SphereGeometry(.09, 8, 6),
};
const SKIN = [0x6f8a5c, 0x7c8f6a, 0x8a9a74, 0x5f7456, 0x94a07c];
const CLOTH = [0x3b3f4f, 0x5a3a2a, 0x2e4a3a, 0x4a4a42, 0x6a5a3a, 0x3a2a3f];
const hatMat = new THREE.MeshLambertMaterial({ color: 0x3b2a1c });
const revolverMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: .7, roughness: .4 });
const acidMat = new THREE.MeshBasicMaterial({ color: 0x9dff3a });

// w: spawn weight for round r · max: cap alive at once · ranged: [too close, comfortable] distance band
const KINDS = {
  walker:     { name: 'Sétáló', min: 1, w: () => 10, hp: 1, dmg: 34, eye: 0xffcc33, lean: .12,
                speed: r => Math.min(2.7, 1.3 + r * .09) * rand(.85, 1.15), scale: () => rand(.92, 1.06) },
  crawler:    { name: 'Mászó', desc: 'Alacsonyan jön, nehéz eltalálni.', min: 2, w: () => 2.2, hp: .6, dmg: 25, eye: 0xffcc33, lean: 1.25, crawl: true,
                speed: () => rand(2.3, 2.9), scale: () => 1 },
  runner:     { name: 'Futó', desc: 'Gyors. Nagyon gyors.', min: 3, w: r => Math.min(6, (r - 2) * 1.2), hp: .8, dmg: 30, eye: 0xffee88, lean: .45,
                speed: () => rand(3.8, 4.6), scale: () => .95 },
  bloater:    { name: 'Puffadt', desc: 'Közelről felrobban. Lődd szét a többiek között!', min: 3, w: () => 1.6, max: 4, hp: 1.5, dmg: 0, eye: 0x9dff3a, lean: .05,
                skin: 0x8f9a3c, bloat: true, speed: () => 1.7, scale: () => 1.1 },
  gunslinger: { name: 'Pisztolyos', desc: 'Revolvere van. Célozni nem tud.', min: 4, w: r => 1.3 + r * .05, max: 3, hp: 1.1, dmg: 34, eye: 0xff8a1a, lean: .06,
                ranged: [8, 15], gun: true, speed: () => 2.3, scale: () => 1 },
  spitter:    { name: 'Köpködő', desc: 'Savat köp. Ne állj a tócsában.', min: 6, w: () => 1.3, max: 3, hp: 1, dmg: 34, eye: 0x9dff3a, lean: .2,
                ranged: [9, 16], spit: true, speed: () => 2, scale: () => 1 },
  brute:      { name: 'Behemót', desc: 'Sokat bír, nagyot üt. Mindig ritka zsákmányt ejt.', min: 5, w: r => Math.min(1.5, .4 * (r - 4)), hp: 4.5, dmg: 55,
                eye: 0xff2a2a, lean: .12, skin: 0x4f5f44, speed: () => 1.6, scale: () => 1.45 },
  leaper:     { name: 'Ugró', desc: 'Messziről rád veti magát. Amikor leguggol, lépj félre!', min: 5, w: () => 1.6, max: 4, hp: .7, dmg: 28, eye: 0xff5ad8, lean: .5,
                leap: true, skin: 0x7a8a6a, speed: () => 3, scale: () => .95 },
  armored:    { name: 'Páncélos', desc: 'Sisak és mellény: testlövésre alig sebződik, amíg a páncél le nem esik. Célozz fejre!', min: 6, w: () => 1.6, hp: 1.2, armor: 1.2, dmg: 40,
                eye: 0x9fd0ff, lean: .1, speed: r => Math.min(2.4, 1.2 + r * .07), scale: () => 1.05 },
  screamer:   { name: 'Sikoltó', desc: 'A sikolya felgyorsítja a közelben lévő zombikat. Őt lődd le először!', min: 7, w: () => 1.1, max: 2, hp: .9, dmg: 25, eye: 0xffffff, lean: .05,
                ranged: [10, 18], scream: true, skin: 0xd8d4c8, speed: () => 2.4, scale: () => .95 },
  phantom:    { name: 'Árny', desc: 'Szinte láthatatlan, amíg közel nem ér. Figyeld a szemeket.', min: 8, w: () => 1.3, max: 3, hp: .8, dmg: 34, eye: 0xb46cff, lean: .25,
                ghost: true, skin: 0x2a2436, speed: () => 3.4, scale: () => 1 },
  brood:      { name: 'Anyaboly', desc: 'Lassú és hatalmas, és folyamatosan porontyokat szül.', min: 9, w: () => .7, max: 1, hp: 6, dmg: 45, eye: 0xff9a2a, lean: .15,
                brood: true, skin: 0x7a5a4a, speed: () => 1.1, scale: () => 1.6 },
  spawnling:  { name: 'Poronty', desc: 'Az Anyaboly kicsinyei. Gyorsak, de egy lövés is elég nekik.', min: 9, w: () => 0, hp: .22, dmg: 12, eye: 0xff9a2a, lean: .3,
                skin: 0x9a7a6a, speed: () => 4.6, scale: () => .55, points: 20 },
  butcher:    { name: 'Mészáros', desc: 'Nehéz munkákon jön el az utolsó percekben. Nekiront, és a földbe csapja a bárdját.', min: 10, w: () => 0, hp: 30, dmg: 50, eye: 0xff2020, lean: .15,
                boss: true, skin: 0x6a5048, speed: () => 2.3, scale: () => 2.1, points: 1000 },
};
const eyeMats = {};
for (const k in KINDS) eyeMats[k] = new THREE.MeshBasicMaterial({ color: KINDS[k].eye });

function pivot(g, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; }
// rotting skin and blood-soaked cloth, painted once and shared; each zombie's own material tints them
function zPaint(blots, n, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = mulberry(seed);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < n; i++) { g.globalAlpha = .15 + r() * .45; g.fillStyle = blots[Math.floor(r() * blots.length)]; g.beginPath(); g.ellipse(r() * 64, r() * 64, 1 + r() * 8, 1 + r() * 5, r() * 3, 0, 7); g.fill(); }
  g.globalAlpha = .5; g.strokeStyle = '#2a0806'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); const x = r() * 64; g.moveTo(x, r() * 20); g.lineTo(x + r() * 6 - 3, 30 + r() * 34); g.stroke(); } // drips
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
}
const ZTEX = { skin: [1, 2, 3].map(k => zPaint(['#3a2a1a', '#6a1410', '#2a3a1a', '#d8d0b0', '#4a3a2a'], 26, k)), cloth: [4, 5, 6].map(k => zPaint(['#1a1210', '#6a0a08', '#000', '#8a7a60', '#3a0604'], 30, k)) };
const zBone = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 }), zGore = new THREE.MeshLambertMaterial({ color: 0x5a0a08, emissive: 0x1a0000 });
const zMouth = new THREE.MeshBasicMaterial({ color: 0x140505 }), zHair = new THREE.MeshLambertMaterial({ color: 0x1c1712 });
function mkZombie(kind) {
  const K = KINDS[kind];
  const skin = new THREE.MeshLambertMaterial({ color: K.skin || pick(SKIN), map: pick(ZTEX.skin) });
  const cloth = new THREE.MeshLambertMaterial({ color: kind === 'gunslinger' ? 0x5a4630 : pick(CLOTH), map: pick(ZTEX.cloth) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2b2e, map: pick(ZTEX.cloth) });
  const g = new THREE.Group();
  const add = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legL = pivot(g, -.14, .8, 0), legR = pivot(g, .14, .8, 0);
  const upper = pivot(g, 0, .8, 0);
  const torso = add(ZG.torso, cloth, upper, 0, .4, 0);
  const head = add(ZG.head, skin, upper, 0, 1.03, .02);
  const armL = pivot(upper, -.41, .72, 0), armR = pivot(upper, .41, .72, 0);
  const parts = [torso, head, add(ZG.arm, skin, armL, 0, -.34, 0), add(ZG.arm, skin, armR, 0, -.34, 0)];
  const legs = [add(ZG.leg, pants, legL, 0, -.4, 0), add(ZG.leg, pants, legR, 0, -.4, 0)];
  if (K.crawl) { legL.visible = legR.visible = false; upper.position.y = .3; }
  else parts.push(...legs);
  const decos = [];
  add(ZG.eye, eyeMats[kind], upper, -.1, 1.07, .235).castShadow = false; add(ZG.eye, eyeMats[kind], upper, .1, 1.07, .235).castShadow = false;
  if (!K.ghost) { // decoration: no shadows, not hit boxes
    const deco = (mat, parent, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(unitBox, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); decos.push(m); return m; };
    deco(zMouth, upper, 0, .93, .215, .24, .08, .02); deco(zBone, upper, 0, .958, .222, .18, .022, .01); // a gaping mouth with teeth
    head.rotation.z = rand(-.18, .18); head.rotation.x = rand(-.1, .15);
    if (Math.random() < .55) deco(zHair, upper, rand(-.04, .04), 1.255, -.03, .44, .07, rand(.3, .44));
    if (Math.random() < .5) { deco(zGore, upper, rand(-.12, .12), .56, .183, .3, .3, .01); for (let i = 0; i < 3; i++) deco(zBone, upper, 0, .46 + i * .09, .19, .26, .025, .02); } // an open chest
    for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) deco(zGore, pick([upper, armL, armR]), rand(-.08, .08), rand(-.5, .9), rand(.08, .19), rand(.06, .14), rand(.06, .16), .01); // wounds
    if (Math.random() < .3) { const arm = pick([armL, armR]); deco(zBone, arm, 0, -.76, 0, .05, .14, .05); deco(zGore, arm, 0, -.7, 0, .17, .04, .17); } // a torn-off hand
  }
  if (K.bloat) {
    torso.scale.set(1.55, 1.15, 1.8);
    for (let i = 0; i < 6; i++) add(ZG.pus, acidMat, upper, rand(-.4, .4), rand(.15, .7), rand(.3, .36));
  }
  if (K.spit) { head.scale.set(1.15, 1.2, 1.15); add(ZG.eye, acidMat, upper, 0, .9, .27).scale.set(2.4, 2.4, 1); }
  const metal = new THREE.MeshLambertMaterial({ color: 0x5a6068 });
  let armorParts = [];
  if (K.armor) {
    armorParts = [add(unitBox, metal, upper, 0, 1.27, .02), add(unitBox, metal, upper, 0, .45, 0), add(unitBox, metal, upper, 0, 1.13, .24)];
    armorParts[0].scale.set(.5, .16, .5); armorParts[1].scale.set(.7, .62, .44); armorParts[2].scale.set(.42, .06, .04);
  }
  if (K.leap) { parts[2].scale.y = parts[3].scale.y = 1.3; }
  if (K.scream) { add(unitBox, new THREE.MeshLambertMaterial({ color: 0xe8e4dc }), upper, 0, 1.0, -.2).scale.set(.46, .7, .12); add(unitBox, new THREE.MeshBasicMaterial({ color: 0x080404 }), upper, 0, .93, .225).scale.set(.14, .14, .02); }
  if (K.brood) {
    torso.scale.set(1.8, 1.3, 1.7);
    const sac = new THREE.MeshLambertMaterial({ color: 0xc27a3a, emissive: 0x4a2008 });
    for (let i = 0; i < 5; i++) add(ZG.pus, sac, upper, rand(-.45, .45), rand(.1, .75), rand(.28, .34)).scale.setScalar(rand(1.4, 2.2));
  }
  if (K.boss) {
    add(unitBox, new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }), upper, 0, .3, .19).scale.set(.58, .9, .04);
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .35 });
    add(unitBox, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), armR, 0, -.78, 0).scale.set(.06, .22, .06);
    add(unitBox, steel, armR, 0, -.98, .12).scale.set(.03, .32, .3);
  }
  if (K.gun) {
    add(unitBox, hatMat, upper, 0, 1.25, .02).scale.set(.66, .04, .66);
    add(unitBox, hatMat, upper, 0, 1.37, .02).scale.set(.36, .22, .36);
    add(unitBox, revolverMat, armR, 0, -.8, .02).scale.set(.05, .24, .06);
    add(unitBox, revolverMat, armR, 0, -.7, .07).scale.set(.05, .06, .1);
  }
  head.userData.head = true;
  const mats = [skin, cloth, pants];
  if (K.ghost) mats.forEach(m => { m.transparent = true; m.opacity = .12; m.depthWrite = false; });
  const merged = mergeZombieBits([upper, armL, armR, legL, legR], parts); // fewer draw calls: one mesh per material per limb
  return { decos: merged, g, parts, legL, legR, armL, armR, upper, torso, mats, armorParts };
}
// ×1.12 per threat level: guns (+7.5% per level, rarity, upgrades, gear) can keep up instead of falling hopelessly behind
function zombieHp() { return 100 * Math.pow(1.1, round - 1) * Math.pow(1.08, jobLvl() - 1) * (1 + .08 * jobTier()) * (dirOn('tough') ? 1.25 : 1); }
// the job's level: zombies and loot scale with it, so the world keeps pace with you forever
const jobLvl = () => (mission && mission.job.lvl) || (profile ? profile.level : 1);
const jobTier = () => (mission && mission.job.tier) || 0; // Rémálom +N: endless difficulty past 5 stars
const lootLvl = (x = 0) => clamp(jobLvl() + x + Math.floor(Math.random() * 3) - 1, 1, LEVEL_CAP + 2 * jobTier()); // gear tops out at 30, Rémálom tiers push it past
// any kind can turn up at any threat; below its usual threat (min) it is rarer the further below it is
function pickKind() {
  const opts = Object.keys(KINDS).filter(k => !KINDS[k].max || zombies.filter(z => !z.dead && z.kind === k).length < KINDS[k].max);
  const ws = opts.map(k => { const K = KINDS[k]; return Math.max(0, K.w(Math.max(round, K.min))) * clamp(.2 + .8 * round / K.min, .2, 1); }); // before its wave a kind is rarer, never absent
  let x = Math.random() * ws.reduce((a, b) => a + b);
  for (let i = 0; i < opts.length; i++) if ((x -= ws[i]) <= 0) return opts[i];
  return 'walker';
}
const seenKinds = new Set();
function spawnZombie(kind) {
  const all = activeSpawns(), d = ([x, z]) => Math.hypot(x - player.pos.x, z - player.pos.z);
  // not in plain sight: closer than 30 m, inside ±55° of where you look, with a clear line
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), eye = new V3(player.pos.x, 1.6, player.pos.z);
  const seen = ([x, z]) => { const D = d([x, z]); return D < 30 && ((x - player.pos.x) * fx + (z - player.pos.z) * fz) / D > .57 && hasSight(eye, new V3(x, 1.2, z)); };
  const fair = all.filter(s => d(s) > 18), hidden = fair.filter(s => !seen(s)), near = hidden.filter(s => d(s) < 45);
  const evac = mission && (mission.phase === 'evac' || mission.evacWarn) ? hidden.filter(([x, z]) => Math.hypot(x - truck.pos.x, z - truck.pos.z) < 32) : [];
  const [sx, sz] = pick(evac.length && Math.random() < .35 ? evac : near.length ? near : hidden.length ? hidden : fair.length ? fair : all);
  return spawnZombieAt(kind || pickKind(), sx + rand(-1.2, 1.2), sz + rand(-1.2, 1.2));
}
function spawnZombieAt(kind, x, zz, rise = 1) {
  const K = KINDS[kind], m = mkZombie(kind);
  const z = {
    kind, K, ...m, pos: new V3(x, 0, zz),
    hp: zombieHp() * K.hp * (K.boss ? 1 : roundMod.hp) * (NET.mode === 'host' ? 1 + .15 * (partySize() - 1) : 1) /* tougher with a bigger party */, speed: K.speed(round) * roundMod.speed, dmg: K.dmg * (1 + .08 * jobTier()), scale: K.scale(),
    armor: K.armor ? zombieHp() * K.armor : 0, leapCd: rand(1, 3), crouch: 0, leap: null, buffT: 0, broodT: 4, bossT: 5, op: .12,
    heading: 0, side: Math.random() < .5 ? -1 : 1, strafeT: rand(2, 4), walkT: rand(0, 6), rise: 1, atkCd: 0, windup: 0,
    burnT: 0, burnDps: 0, burnAcc: 0, slowT: 0, flash: 0, groanT: rand(1, 6), dead: false, deathT: 0,
    shootT: rand(1.5, 3), ammo: 6, gunReload: 0, gunKick: 0, fuse: 0,
  };
  rollTier(z, kind);
  z.rise = rise;
  z.maxHp = z.hp; z.id = ++zidSeq;
  if (NET.mode === 'host') NET.zById.set(z.id, z);
  z.g.scale.setScalar(z.scale);
  z.parts.forEach(p => p.userData.z = z);
  z.g.position.set(z.pos.x, -2.2, z.pos.z);
  scene.add(z.g); zombies.push(z);
  burst(new V3(z.pos.x, .1, z.pos.z), 0x2a2116, 12, 2.5, .8);
  if (mission) mission.spawned = (mission.spawned || 0) + 1;
  if (!seenKinds.has(kind) && !K.boss) { seenKinds.add(kind); if (K.desc) popText(`Új ellenség: ${K.name} · ${K.desc}`, '#ff8a70'); }
  return z;
}
const tmpV = new V3();
function zHeadPos(z) { return tmpV.set(z.pos.x, (z.K.crawl ? 1 : 2) * z.scale + z.g.position.y, z.pos.z).clone(); }

const tallyHit = (amt, o) => { if (o.remote || o.chain) return; if (!o.dot && player.hitsN < player.shotsN) player.hitsN++; player.dmgDone += amt; };
function hurtZombie(z, amt, o = {}) {
  if (NET.client && mission) { if (!z.dead) { tallyHit(amt, o); if (!o.dot) z.flinch = .12; } return netHit(z, amt, o); } // a party member's hit goes to the host
  if (z.dead) return;
  if (z.invulnT > 0) { z.flash = .08; return; } // a bounty boss between phases
  if (o.remote) { if (o.insta && !z.K.boss) amt = Math.max(amt, z.hp); } // the sender already applied their own bonuses
  else {
    if (z.markT > 0) amt *= 1.5;                                   // Vadász: Jelölés
    if (z.K.boss && rk('h_boss')) amt *= 1.2;
    if (o.w && rk('h_exec') && z.hp < z.maxHp * .25) amt *= 2;
    if (powers.insta > 0 && !o.dot && !z.K.boss) amt = Math.max(amt, z.hp);
  }
  if (z.slagT > 0 && !(o.w && o.w.element === 'slag')) amt *= 1.4; // slagged: everything else hits harder
  if (z.armor > 0 && !o.head && !o.dot && !o.melee) { // armour soaks most body damage until it breaks
    z.armor -= amt * (z.acidT > 0 ? 2 : 1); amt *= .25;
    burst(new V3(z.pos.x, 1.3 * z.scale, z.pos.z), 0xc8d0d8, 2, 2, .25);
    if (z.armor <= 0) { z.armorParts.forEach(a => a.visible = false); SND.armorBreak(); burst(new V3(z.pos.x, 1.4 * z.scale, z.pos.z), 0xc8d0d8, 16, 3.5, .6); o.color = '#c8d0d8'; }
    else o.color = o.color || '#8a929a';
  }
  if (!o.remote && exoOn('cryo') && (z.slowT > 0 || (z.net && z.net.fl & 32))) amt *= 1.3; // Kriosztát
  if (!o.remote && rk('h_bounty') && (z.elite || z.K.boss)) amt *= 1 + .12 * rk('h_bounty'); // Díjvadász
  if (!o.remote) hitPerks(z, amt, o);
  z.hp -= amt; z.flash = .08; z.hitT = now; tallyHit(amt, o); if (!o.dot) z.flinch = .12;
  if (z.traits && z.traits.includes('rage') && !z.raged && z.hp > 0 && z.hp < z.maxHp * .25) { z.raged = true; z.speed *= 1.35; z.dmg *= 1.4; z.buffT = 1e6; popText(`${zName(z)} feldühödött!`, '#ff5a4a'); }
  const col = o.crit ? '#ff7a1a' : o.head ? '#ffd23f' : o.color || (o.w && o.w.element ? ELEMENTS[o.w.element].color : '#ece6d4');
  if (!o.remote) dmgNumber(zHeadPos(z), amt, col, o.head || o.crit, o.crit, z);
  if (o.w && o.w.element && !o.chain) applyElement(z, o.w, amt);
  if (o.burnDps) { z.burnT = Math.max(z.burnT, o.burnT || 3); z.burnDps = Math.max(z.burnDps, o.burnDps); z.burnBy = o.remote || null; z.burnW = o.w || z.burnW; }
  if (!o.remote) weaponOnHit(z, amt, o);
  if (o.head && !o.remote && brand4('ranger')) z.markT = Math.max(z.markT || 0, 5);
  if (z.hp <= 0) killZombie(z, o);
  else if (!o.dot && !o.remote) addPoints(10);
}
function applyElement(z, w, amt) {
  if (w.element === 'fire') { z.burnT = 3; z.burnBy = null; z.burnW = w; z.burnDps = Math.max(z.burnDps, w.dmg * w.pellets * fireRate(w) * .12); } // ~12% of the gun's DPS, the same for every gun
  else if (w.element === 'cryo') z.slowT = 2.5;
  else if (w.element === 'corrosive') { z.acidT = 4; z.acidW = w; z.acidDps = Math.max(z.acidDps || 0, w.dmg * w.pellets * fireRate(w) * .1); burst(new V3(z.pos.x, 1.2 * z.scale, z.pos.z), 0x9dff3a, 4, 2, .3); }
  else if (w.element === 'slag') { z.slagT = 5; burst(new V3(z.pos.x, 1.4 * z.scale, z.pos.z), 0xc86aff, 5, 2, .35); }
  else if (w.element === 'shock') {
    let best = null, bd = 5;
    for (const o of zombies) { if (o === z || o.dead) continue; const d = o.pos.distanceTo(z.pos); if (d < bd) { bd = d; best = o; } }
    if (best) {
      tracer(new V3(z.pos.x, 1.3 * z.scale, z.pos.z), new V3(best.pos.x, 1.3 * best.scale, best.pos.z), ELEMENTS.shock.hex, .03);
      hurtZombie(best, amt * .5, { chain: true, color: ELEMENTS.shock.color });
    }
  }
}
function addPoints(n) {
  if (powers.double > 0) n *= 2;
  n = Math.round(n * roundMod.points * (1 + G('points')));
  player.points += n; player.earned += n; stats.earned += n; popPoints(n);
}
function popBloater(z) {
  z.exploded = true; z.dead = true; z.g.visible = false; z.deathT = 2.9;
  explode(new V3(z.pos.x, 1, z.pos.z), { r: 4.2, zdmg: 90 + zombieHp() * .9, pr: 3.8, pdmg: 45, color: 0x9dff3a });
}
function killZombie(z, o) {
  if (z.dummy) { z.dead = true; z.deathT = 0; z.fallDir = 1; if (!o.remote) { hitmarker(true); SND.kill(); } if (mission && mission.dummyQ) mission.dummyQ.push({ t: 2.5, spot: z.spot }); return; }
  if (mission) mission.kc = (mission.kc || 0) + 1; // the whole party's kills (objective jobs)
  z.dead = true; z.deathT = 0; z.fallDir = Math.random() < .5 ? 1 : -1; bloodPool(z.pos.x, z.pos.z, z.scale);
  for (const k of z.traits || []) if (AFFIX[k].die) AFFIX[k].die(z);
  if (z.bounty) bountyKilled(z);
  if (o.remote) { // a party member's kill: they get the points and roll the loot
    burst(new V3(z.pos.x, 1.2 * z.scale, z.pos.z), 0x5a0a0a, 14, 3.5);
    if (z.K.bloat && !z.exploded) popBloater(z);
    return netKill(z, o);
  }
  player.kills++; stats.kills++; stats.killsBy[z.kind] = (stats.killsBy[z.kind] || 0) + 1; multiKill();
  myKill(o.w || (o.melee ? { name: 'Kés', q: 0 } : o.dot ? { name: 'Égés', q: 0 } : { name: 'Robbanás', q: 0 }), z.K.name, o.head);
  weaponOnKill(z, o);
  killPerks(z, o);
  noteBaseKill(o.w);
  if (o.head) { player.heads++; stats.heads++; if (rk('h_refund') && o.w && o.w.ammo < o.w.mag) o.w.ammo++; }
  if (SK && rk('m_vamp')) player.hp = Math.min(maxHp(), player.hp + 3 * rk('m_vamp'));
  addPoints(z.K.points || (o.melee ? 130 : o.head ? 100 : 60));
  hitmarker(true); SND.kill();
  burst(new V3(z.pos.x, 1.2 * z.scale, z.pos.z), 0x5a0a0a, 14, 3.5);
  if (z.K.bloat && !z.exploded) popBloater(z);
  dropLoot(z, new V3(z.pos.x, 0, z.pos.z));
  if (NET.mode === 'host') pushRoll(NET.kills, [++NET.seq, 'H', KIND_IDS.indexOf(z.kind), o.head ? 1 : 0, 0, Math.round(z.pos.x * 10), Math.round(z.pos.z * 10), z.elite ? 1 : 0, z.id, z.tier || 0], 16); // the party rolls its own loot
}
// what a kill drops; in a party each killer rolls their own
function dropLoot(z, p) {
  if (mission && mission.job.bounty && !z.K.boss && Math.random() < .6) return; // a bounty's adds mostly drop nothing
  const dLuck = mission ? .05 * dirCount(mission.job) + .06 * (mission.job.diff - 1) + .08 * jobTier() + (NET.mode ? .05 * (partySize() - 1) : 0) + (mission.job.map === featuredMap() ? .1 : 0) : 0; // harder jobs and bigger parties roll better loot
  const uq = q => { const T = jobTier(); if (T) { q = Math.max(q, 2); if (Math.random() < .013 * T) q = Math.max(q, 4); } return mission && (mission.job.diff >= 5 || T > 0) && Math.random() < .012 + .003 * T ? 5 : q; }; // Rémálom: at least rare, sometimes legendary; 'Mi a fasz?' and Rémálom: 1-2% uniques
  if (z.K.boss) {
    spawnDrop(makeWeapon(pick(BASES), Math.max(3, rollRarity(.3)), lootLvl(2)), p);
    spawnItem('med', p.clone().add(new V3(-1, 0, 1))); spawnItem('gren', p.clone().add(new V3(1, 0, -1)));
    if (!z.bounty && Math.random() < .03) spawnGearDrop(makeExotic(null, lootLvl(2)), p.clone().add(new V3(0, 0, 1.4)));
    if (!z.bounty) banner('A MÉSZÁROS ELESETT', 'Epikus vagy jobb fegyvert hagyott maga után.'); SND.roar();
  } else if (z.tier === 3) { // a named zombie: always a gun, rare or better, and a fair chance of armor
    if (mission && (mission.job.diff >= 4 || jobTier() > 0) && Math.random() < .02) spawnGearDrop(makeExotic(null, lootLvl(1)), p.clone().add(new V3(0, 0, 1.2)));
    spawnDrop(makeWeapon(pick(BASES), uq(Math.max(2, rollRarity(.4 + dLuck))), lootLvl()), p);
  } else if (z.elite) { // loot is scarcer now, so each drop means more
    if (mission && (mission.job.diff >= 4 || jobTier() > 0) && Math.random() < .004) spawnGearDrop(makeExotic(null, lootLvl(1)), p.clone().add(new V3(0, 0, 1.2)));
    if (Math.random() < .25) spawnDrop(makeWeapon(pick(BASES), uq(Math.max(1, rollRarity(.3 + dLuck))), lootLvl()), p);
  } else if (z.kind === 'brood') { if (Math.random() < .3) spawnDrop(makeWeapon(pick(BASES), uq(Math.max(1, rollRarity(.3))), lootLvl()), p); }
  else if (z.kind === 'brute') {
    if (Math.random() < .2) spawnDrop(makeWeapon(pick(BASES), uq(Math.max(1, rollRarity(.3))), lootLvl()), p);
    if (Math.random() < .15) spawnPower(p.clone().add(new V3(1.2, 0, 0)));
  }
  else if (z.K.gun && Math.random() < .06) spawnDrop(makeWeapon(BASES.find(b => b.id === 'revolver'), rollRarity(.1), lootLvl()), p);
  else if (Math.random() < .015 * SK.drop()) spawnDrop(makeWeapon(pick(BASES), uq(Math.max(round >= 6 ? 1 : 0, rollRarity(Math.min(.4, .02 * round) + SK.luck() + dLuck))), lootLvl()), p);
  else if (Math.random() < (round <= 3 ? .07 : .025)) spawnPower(p, 'ammo'); // ammo packs: plenty early on, when the starter guns run dry
  else if (Math.random() < .02) spawnPower(p);
  else if (Math.random() < .04) spawnItem(pick(['med', 'med', 'gren', 'gren', 'knife', 'knife', 'knife', 'adren']), p);
  // gear: the boss always drops a piece, big and elite zombies often, the rest rarely
  const addCut = mission && mission.job.bounty && !z.K.boss ? .3 : 1; // a bounty's adds are fodder
  const gc = z.K.boss ? 1 : addCut * (z.tier === 3 ? .5 : z.elite || ['brute', 'brood', 'armored', 'screamer'].includes(z.kind) ? .045 : .006 * SK.drop());
  if (Math.random() < gc) spawnGearDrop(makeGear(null, z.K.boss ? Math.max(3, rollRarity(.3 + dLuck)) : rollRarity(Math.min(.4, .02 * round) + SK.luck() + dLuck), z.K.boss ? lootLvl(2) : lootLvl()), p.clone().add(new V3(.8, 0, .8)));
}

// ---------- ranged attacks ----------
function hasSight(from, to) {
  const d = to.clone().sub(from), len = d.length();
  ray.set(from, d.normalize()); ray.far = len;
  return ray.intersectObjects(rayBlockers, false).length === 0;
}
function gunslingerFire(z, dmg = 9) {
  z.armR.updateMatrixWorld(true);
  const from = z.armR.localToWorld(new V3(0, -.95, 0));
  // aims roughly at you, misses a lot
  const aim = new V3(player.pos.x + rand(-1.2, 1.2), player.pos.y + rand(.2, 2.2), player.pos.z + rand(-1.2, 1.2));
  const dir = aim.sub(from).normalize();
  ray.set(from, dir); ray.far = 60;
  const wall = ray.intersectObjects(rayBlockers, false)[0];
  const wallD = wall ? wall.distance : 60;
  const P = new V3(player.pos.x, player.pos.y + .9, player.pos.z);
  const t = P.sub(from).dot(dir), C = from.clone().addScaledVector(dir, t);
  const miss = Math.hypot(C.x - player.pos.x, C.z - player.pos.z);
  const hit = t > 0 && t < wallD && miss < .42 && C.y > player.pos.y && C.y < player.pos.y + 1.85;
  const end = hit ? C : from.clone().addScaledVector(dir, wallD);
  tracer(from, end, 0xffb050, .018);
  burst(from, 0xffc070, 4, 1.5, .2);
  if (!hit && wall) burst(end, 0xffc070, 4, 2, .3);
  const dist = z.pos.distanceTo(player.pos);
  SND.zshot(clamp(.7 - dist / 45, .12, .7));
  if (hit) { if (liveWorld()) hurtPlayer(dmg); }
  else if (t > 0 && miss < 2.5) SND.whiz();
  z.gunKick = .5;
}
const zProjs = [], puddles = [];
const acidGeo = new THREE.SphereGeometry(.14, 8, 6);
const puddleGeo = new THREE.CircleGeometry(1.6, 20); puddleGeo.rotateX(-Math.PI / 2);
function spit(z) {
  const from = new V3(z.pos.x, 1.8 * z.scale, z.pos.z);
  const T = clamp(z.pos.distanceTo(player.pos) / 12, .6, 1.6);
  const target = new V3(player.pos.x + player.vel.x * T * .6, .05, player.pos.z + player.vel.z * T * .6);
  const v = target.sub(from).divideScalar(T); v.y += .5 * 12 * T;
  const m = new THREE.Mesh(acidGeo, acidMat); m.position.copy(from); scene.add(m);
  zProjs.push({ m, v });
  SND.spit();
}
function updateZProjs(dt) {
  for (let i = zProjs.length - 1; i >= 0; i--) {
    const p = zProjs[i], pos = p.m.position;
    p.v.y -= 12 * dt; pos.addScaledVector(p.v, dt);
    if (Math.random() < dt * 20) burst(pos, 0x9dff3a, 1, .5, .3);
    const direct = pos.distanceTo(new V3(player.pos.x, player.pos.y + 1, player.pos.z)) < .7;
    if (pos.y <= .05 || direct) {
      if (direct && liveWorld()) hurtPlayer(15);
      const pm = new THREE.Mesh(puddleGeo, new THREE.MeshBasicMaterial({ color: 0x7fe02a, transparent: true, opacity: .55, depthWrite: false }));
      pm.position.set(pos.x, .03, pos.z); scene.add(pm);
      puddles.push({ m: pm, t: 5 });
      burst(pos, 0x9dff3a, 10, 2.5, .5);
      scene.remove(p.m); zProjs.splice(i, 1);
    }
  }
  let inAcid = false; // overlapping puddles don't stack
  for (let i = puddles.length - 1; i >= 0; i--) {
    const p = puddles[i]; p.t -= dt;
    p.m.material.opacity = Math.min(.55, p.t * .4);
    if (Math.hypot(p.m.position.x - player.pos.x, p.m.position.z - player.pos.z) < 1.5 && player.pos.y < .4) inAcid = true;
    if (p.t <= 0) { scene.remove(p.m); p.m.material.dispose(); puddles.splice(i, 1); }
  }
  if (inAcid && liveWorld()) { player.acid = (player.acid || 0) + 14 * dt; if (player.acid >= 6) { player.acid -= 6; hurtPlayer(6, true); } }
  else player.acid = 0;
}
function clearZombieStuff() {
  zombies.forEach(z => { scene.remove(z.g); freeZombie(z); }); zombies.length = 0;
  zProjs.forEach(p => scene.remove(p.m)); zProjs.length = 0;
  puddles.forEach(p => scene.remove(p.m)); puddles.length = 0;
  seenKinds.clear();
}

function updateZombies(dt) {
  let groanBudget = 1;
  aimSetup();
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i], K = z.K; hurtSrc = K.name; // whatever hurts a player in this pass is this zombie
    if (z.dead) {
      z.deathT += dt;
      z.upper.rotation.x = lerp(z.upper.rotation.x, K.crawl ? 1.5 : -1.4, dt * 6);
      z.g.rotation.z = lerp(z.g.rotation.z, (K.crawl ? .3 : 1.45) * z.fallDir, Math.min(1, dt * 5));
      z.g.position.y = z.deathT > 1.4 ? -(z.deathT - 1.4) * 1.2 : .2 * z.scale * Math.min(1, z.deathT * 4);
      if (z.deathT > 3) { scene.remove(z.g); freeZombie(z); zombies.splice(i, 1); NET.zById.delete(z.id); }
      continue;
    }
    netAim(z); // in a party the host's zombies chase the nearest living player
    if (z.traits && z.traits.includes('regen') && now - (z.hitT || -99) > 3 && z.hp < z.maxHp) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * .02 * dt);
    // status effects
    if (z.burnT > 0) {
      z.burnT -= dt; z.burnAcc += z.burnDps * dt;
      if (Math.random() < dt * 12) burst(new V3(z.pos.x + rand(-.2, .2), rand(.6, 1.9) * z.scale, z.pos.z + rand(-.2, .2)), 0xff7a20, 1, 1, .35);
      if (z.burnAcc > 0 && (z.burnAcc >= z.burnDps * .5 || z.burnT <= 0)) { const a = z.burnAcc; z.burnAcc = 0; hurtZombie(z, a, { dot: true, color: ELEMENTS.fire.color, remote: z.burnBy || undefined, w: z.burnBy ? undefined : z.burnW }); if (z.dead) continue; }
      if (z.burnT <= 0) z.burnDps = 0;
    }
    if (z.acidT > 0) { // corrosive: acid ticks, green drips
      z.acidT -= dt; z.acidAcc = (z.acidAcc || 0) + z.acidDps * dt;
      if (Math.random() < dt * 8) burst(new V3(z.pos.x + rand(-.2, .2), rand(.4, 1.6) * z.scale, z.pos.z + rand(-.2, .2)), 0x9dff3a, 1, .8, .35);
      if (z.acidAcc >= z.acidDps * .5 || z.acidT <= 0) { const a = z.acidAcc; z.acidAcc = 0; if (a > 0) hurtZombie(z, a, { dot: true, color: ELEMENTS.corrosive.color, w: z.acidW }); if (z.dead) continue; }
    }
    z.slagT = (z.slagT || 0) - dt;
    z.slowT -= dt; z.flash -= dt; z.buffT -= dt; z.markT = (z.markT || 0) - dt;
    const fuseBlink = z.fuse > 0 && Math.sin(now * 40) > 0;
    const em = z.flash > 0 || fuseBlink ? 0x777777 : z.burnT > 0 ? 0x4a1800 : z.slowT > 0 ? 0x10384a : z.buffT > 0 ? 0x4a0000 : z.markT > 0 ? 0x3a1450 : z.elite ? 0x3a2a00 : 0x0d100b; // a faint glow so they read against the dark
    for (const m of z.mats) m.emissive.setHex(em);
    if (z.dummy) { z.g.position.set(z.pos.x, 0, z.pos.z); continue; } // a target dummy: it just stands there

    if (z.rise > 0) {
      z.rise = Math.max(0, z.rise - dt * .9);
      z.g.position.set(z.pos.x, -2.2 * z.rise, z.pos.z);
      z.armL.rotation.x = z.armR.rotation.x = -2.6;
      continue;
    }
    const dx = player.pos.x - z.pos.x, dz = player.pos.z - z.pos.z, dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    if (K.ghost) { // fades in only when close or just shot
      z.op = lerp(z.op, dist < 7 || now - (z.hitT || -9) < 1.5 ? .9 : .1, Math.min(1, dt * 4));
      for (const m of z.mats) m.opacity = z.op;
    }
    if (z.bounty) bountyTick(z, dt, dist);
    if (K.leap && updateLeaper(z, dt, dist)) continue;
    if (K.boss && updateBoss(z, dt, dist, toPlayer)) continue;
    let ang = toPlayer, spMul = 1, move = dist > 1.05;
    const via = routeTarget(z.pos); // player is behind a fence: walk through the gate
    if (via) { ang = Math.atan2(via.x - z.pos.x, via.z - z.pos.z); move = true; }
    else if (K.ranged) {
      z.strafeT -= dt; if (z.strafeT <= 0) { z.strafeT = rand(1.5, 4); z.side *= -1; }
      if (dist < K.ranged[0]) ang += Math.PI;                              // back off
      else if (dist < K.ranged[1]) { ang += z.side * Math.PI / 2; spMul = .55; } // strafe
    }
    // around obstacles: a detour, once picked, is kept for a moment so zombies don't dither against long walls
    if (z.detourT > 0) { z.detourT -= dt; if (!blockedAt(z.pos.x + Math.sin(z.detourA) * 1.1, z.pos.z + Math.cos(z.detourA) * 1.1, .4)) ang = z.detourA; else z.detourT = 0; }
    else if (move && blockedAt(z.pos.x + Math.sin(ang) * 1.1, z.pos.z + Math.cos(ang) * 1.1, .4)) {
      for (const off of [.7, -.7, 1.4, -1.4, 2.1, -2.1, 2.6, -2.6]) {
        const a = ang + off * z.side;
        if (!blockedAt(z.pos.x + Math.sin(a) * 1.1, z.pos.z + Math.cos(a) * 1.1, .4)) { ang = a; z.detourA = a; z.detourT = .8; break; }
      }
    }
    // barely moved for 2 s: try the other way round; stuck far away for 6 s: replaced by a fresh spawn
    if ((z.chkT = (z.chkT || 0) + dt) > 2) {
      const moved = Math.hypot(z.pos.x - (z.chkX ?? z.pos.x), z.pos.z - (z.chkZ ?? z.pos.z));
      if (move && moved < .3) z.side *= -1;
      z.stuckT = moved < .5 && dist > 25 && !K.boss ? (z.stuckT || 0) + z.chkT : 0;
      z.chkT = 0; z.chkX = z.pos.x; z.chkZ = z.pos.z;
      if (z.stuckT >= 6) { scene.remove(z.g); freeZombie(z); zombies.splice(i, 1); NET.zById.delete(z.id); netAimEnd(); spawnZombie(z.kind); continue; }
    }
    let dh = ((ang - z.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    z.heading += dh * Math.min(1, dt * 7);
    const sp = z.speed * spMul * (z.slowT > 0 ? .45 : 1) * (z.windup > 0 ? .35 : 1) * (z.fuse > 0 ? .3 : 1) * (z.buffT > 0 ? 1.45 : 1);
    let mx = 0, mz = 0;
    if (move) { mx = Math.sin(z.heading) * sp * dt; mz = Math.cos(z.heading) * sp * dt; }
    for (const o of zombies) {
      if (o === z || o.dead || o.rise > 0) continue;
      const ox = z.pos.x - o.pos.x, oz = z.pos.z - o.pos.z, d2 = ox * ox + oz * oz, rr = .38 * (z.scale + o.scale);
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) * .5; mx += ox / d * push; mz += oz / d * push; }
    }
    z.pos.x += mx; z.pos.z += mz;
    collide(z.pos, .35 * z.scale);
    // animation
    const moving = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    z.walkT += dt * (2 + moving * 2.2);
    // poses ease toward their targets instead of snapping, so states blend into each other
    const bl = 1 - Math.exp(-dt * 9), ease = (o, k, v) => { o[k] += (v - o[k]) * bl; };
    z.amp = lerp(z.amp || 0, Math.min(.75, .15 + moving * .18), bl); // smoothed stride: crowd pushes don't twitch the legs
    const sw = Math.sin(z.walkT) * z.amp;
    z.legL.rotation.x = sw; z.legR.rotation.x = -sw;
    ease(z.upper.rotation, 'x', K.lean);
    if (z.flinch > 0) { z.flinch -= dt; z.upper.rotation.x -= z.flinch * 2.5; } // a hit jolts the torso back
    z.upper.rotation.z = Math.sin(z.walkT * .5) * .06;
    if (K.crawl) { z.armL.rotation.x = -1.3 + sw * 1.2; z.armR.rotation.x = -1.3 - sw * 1.2; }
    else {
      const reach = -1.35 + Math.sin(z.walkT * .7) * .12;
      ease(z.armL.rotation, 'x', reach - (z.windup > 0 ? .9 : 0));
      if (!K.gun) ease(z.armR.rotation, 'x', reach + .1 - (z.windup > 0 ? .9 : 0));
    }
    if (K.bloat) z.torso.scale.x = 1.55 + Math.sin(now * (z.fuse > 0 ? 30 : 3)) * (z.fuse > 0 ? .15 : .04);
    z.g.position.set(z.pos.x, Math.abs(Math.sin(z.walkT)) * .05, z.pos.z);
    z.g.rotation.y = K.ranged ? toPlayer : z.heading;
    // attacks
    z.atkCd -= dt;
    if (K.bloat) {
      if (z.fuse > 0) { z.fuse -= dt; if (z.fuse <= 0) { popBloater(z); continue; } }
      else if (dist < 2.2) { z.fuse = .75; SND.fuse(); }
    } else if (K.gun) {
      z.gunKick = Math.max(0, z.gunKick - dt * 4);
      if (z.gunReload > 0) { z.gunReload -= dt; z.armR.rotation.x = -.4; z.armR.rotation.z = now * 12; }
      else {
        z.armR.rotation.x += (-1.5 - z.gunKick - z.armR.rotation.x) * Math.min(1, dt * 14);
        z.armR.rotation.z += (0 - z.armR.rotation.z) * Math.min(1, dt * 10);
        z.shootT -= dt;
        const eye = new V3(z.pos.x, 1.6, z.pos.z);
        if (z.shootT < .35 && !z.told && dist < 30) { // aim tell: a glint and the hammer click just before the shot
          z.told = true;
          burst(new V3(z.pos.x + Math.sin(z.heading) * .5, 1.55 * z.scale, z.pos.z + Math.cos(z.heading) * .5), 0xfff0a0, 4, .3, .25);
          tn(1500, .03, clamp(.25 - dist / 150, .04, .25), 'square');
        }
        if (z.shootT <= 0 && dist < 30) {
          z.shootT = rand(1.5, 2.6); z.told = false;
          if (hasSight(eye, new V3(player.pos.x, player.pos.y + 1.4, player.pos.z))) gunslingerFire(z);
          if (--z.ammo <= 0) { z.ammo = 6; z.gunReload = 2.6; z.armR.rotation.z = 0; }
        }
      }
    } else if (K.scream) {
      z.shootT -= dt;
      if (z.shootT <= 0 && dist < 26) {
        z.shootT = rand(6, 9); z.screamT = .8;
        SND.scream(clamp(.45 - dist / 60, .1, .45));
        burst(new V3(z.pos.x, 1.8 * z.scale, z.pos.z), 0xffffff, 18, 5, .5);
        for (const o of zombies) if (o !== z && !o.dead && o.pos.distanceTo(z.pos) < 14) o.buffT = 5;
      }
      if ((z.screamT -= dt) > 0) z.upper.rotation.x = -.5;
    } else if (K.brood) {
      z.broodT -= dt;
      if (z.broodT <= 0) {
        z.broodT = 5;
        if (zombies.filter(o => !o.dead && o.kind === 'spawnling').length < 6) for (let k = 0; k < 2; k++) {
          const a = rand(0, 6.28); spawnZombieAt('spawnling', z.pos.x + Math.sin(a) * 1.4, z.pos.z + Math.cos(a) * 1.4, .35);
        }
        burst(new V3(z.pos.x, 1.2 * z.scale, z.pos.z), 0xc27a3a, 14, 3, .6); SND.spit();
      }
    } else if (K.spit && dist > 4) {
      z.shootT -= dt;
      if (z.shootT <= 0 && dist < 22) { z.shootT = rand(3, 4.5); spit(z); }
    }
    if (!K.bloat) {
      const reachD = 1.45 * z.scale;
      if (z.windup > 0) {
        z.windup -= dt;
        if (z.windup <= 0) {
          z.atkCd = 1.1;
          if (dist < reachD + .35 && liveWorld()) { hurtPlayer(z.dmg * (1 + .03 * (round - 1))); zBit(z); }
          if (!K.crawl) z.armL.rotation.x = z.armR.rotation.x = -.6;
        }
      } else if (dist < reachD && z.atkCd <= 0) z.windup = .38;
    }
    const far = dist > 24; if (z.far !== far) { z.far = far; for (const d of z.decos || []) d.visible = !far; for (const p of z.parts) p.castShadow = !far; } // detail and shadows only up close
    // groans
    z.groanT -= dt;
    if (z.groanT <= 0) { z.groanT = rand(3, 9); if (dist < 26 && groanBudget-- > 0) SND.groan(.3 * (1 - dist / 26) * (z.kind === 'brute' ? 1.6 : 1), -Math.sin(angDiff(Math.atan2(-(z.pos.x - player.pos.x), -(z.pos.z - player.pos.z)) - player.yaw))); }
  }
  netAimEnd(); hurtSrc = null;
  updateZProjs(dt);
}

// ---------- special movers ----------
// leaper: crouch for a beat (the tell), then jump in an arc to where you are heading
function updateLeaper(z, dt, dist) {
  z.leapCd -= dt;
  if (z.leap) {
    const L = z.leap; L.t += dt; const u = Math.min(1, L.t / L.dur);
    z.pos.x = lerp(L.from.x, L.to.x, u); z.pos.z = lerp(L.from.z, L.to.z, u); collide(z.pos, .3);
    z.g.position.set(z.pos.x, Math.sin(u * Math.PI) * 1.8, z.pos.z); z.g.rotation.y = z.heading = L.ang;
    z.armL.rotation.x = z.armR.rotation.x = -2.2; z.upper.rotation.x = .3;
    if (u >= 1) {
      z.leap = null; z.leapCd = rand(3.5, 5);
      burst(new V3(z.pos.x, .1, z.pos.z), 0x3a3020, 10, 2.5, .5);
      if (Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z) < 1.9 && liveWorld()) { hurtPlayer(z.dmg * (1 + .03 * (round - 1))); zBit(z); }
    }
    return true;
  }
  if (z.crouch > 0) {
    z.crouch -= dt;
    z.upper.rotation.x += (1.1 - z.upper.rotation.x) * Math.min(1, dt * 12);
    z.g.position.set(z.pos.x, -.18, z.pos.z);
    if (z.crouch <= 0) {
      const to = player.pos.clone().addScaledVector(player.vel, .35), d = Math.hypot(to.x - z.pos.x, to.z - z.pos.z);
      if (d > 10) to.sub(z.pos).setLength(10).add(z.pos);
      z.leap = { t: 0, dur: .7, from: z.pos.clone(), to, ang: Math.atan2(to.x - z.pos.x, to.z - z.pos.z) };
      SND.leap();
    }
    return true;
  }
  if (z.leapCd <= 0 && dist > 4 && dist < 10 && !routeTarget(z.pos)) { z.crouch = .45; return true; }
  return false;
}
// the Butcher: winds up, charges in a straight line, and slams the ground when you are close
function updateBoss(z, dt, dist, toPlayer) {
  z.bossT -= dt;
  const face = a => { z.heading += (((a - z.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6); z.g.rotation.y = z.heading; };
  if (z.bossState === 'windup' || z.bossState === 'slamup') {
    z.stateT -= dt; face(toPlayer);
    z.armR.rotation.x += (-2.8 - z.armR.rotation.x) * Math.min(1, dt * 8);
    if (z.stateT <= 0) {
      if (z.bossState === 'windup') { z.bossState = 'charge'; z.stateT = 1.4; z.chargeAng = z.heading; z.hitDone = false; }
      else {
        z.bossState = null; z.bossT = rand(1.5, 2.5); z.armR.rotation.x = -.3;
        SND.slam(); player.shake = Math.max(player.shake, .5);
        burst(new V3(z.pos.x + Math.sin(z.heading) * 2, .2, z.pos.z + Math.cos(z.heading) * 2), 0x3a3020, 30, 5, .8);
        if (Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z) < 3.6 && liveWorld()) hurtPlayer(45);
      }
    }
    z.g.position.set(z.pos.x, 0, z.pos.z);
    return true;
  }
  if (z.bossState === 'charge') {
    z.stateT -= dt;
    z.pos.x += Math.sin(z.chargeAng) * 10 * dt; z.pos.z += Math.cos(z.chargeAng) * 10 * dt;
    const before = z.pos.clone(); collide(z.pos, .7);
    z.walkT += dt * 16; const sw = Math.sin(z.walkT) * .8; z.legL.rotation.x = sw; z.legR.rotation.x = -sw;
    z.g.position.set(z.pos.x, 0, z.pos.z); z.g.rotation.y = z.heading = z.chargeAng;
    if (!z.hitDone && dist < 2.2 && liveWorld()) { z.hitDone = true; hurtPlayer(z.dmg * (1 + .03 * (round - 1))); player.shake = .6; zBit(z); }
    if (z.stateT <= 0 || before.distanceTo(z.pos) > .05) { z.bossState = null; z.bossT = rand(5, 8); }
    return true;
  }
  if (z.bossT <= 0 && dist > 6 && dist < 30 && !routeTarget(z.pos)) { z.bossState = 'windup'; z.stateT = .9; SND.roar(); return true; }
  if (dist < 3 && z.atkCd <= 0) { z.bossState = 'slamup'; z.stateT = .7; z.atkCd = 2.5; return true; }
  return false; // otherwise walks like everyone else
}

// ---------- health bars: the zombie under the crosshair + anything hit recently ----------
const hbPool = [];
function hbEl(i) {
  if (!hbPool[i]) {
    const e = document.createElement('div'); e.className = 'hb';
    e.innerHTML = '<span></span><div class="hrow"><em></em><i><b></b></i></div>'; $('hbars').appendChild(e); hbPool[i] = e;
  }
  return hbPool[i];
}
// name tags the Borderlands 3 way: shown when you aim at an enemy or hurt it, gone ~3 s later; only within reach, a handful at once
const HB_MAX = 8, HB_NEAR = 5, HB_AIM = .15, HB_KEEP = 3, HB_FAR = 45;
let hbRayT = 0, hbAimed = null;
function updateHealthBars() {
  const blind = dirOn('blind');
  if (!blind && now - hbRayT > .1) { // the aim ray is the costly part: ten times a second is plenty
    const dt = Math.min(.3, now - hbRayT); hbRayT = now;
    const parts = []; for (const z of zombies) if (!z.dead && Math.abs(z.pos.x - player.pos.x) < 70 && Math.abs(z.pos.z - player.pos.z) < 70) parts.push(...z.parts);
    ray.set(camera.position, new V3(0, 0, -1).applyQuaternion(camera.quaternion)); ray.far = HB_FAR;
    const h = ray.intersectObjects(rayBlockers.concat(parts), false)[0], lz = (h && h.object.userData.z) || null;
    if (lz) { lz.aimT = lz === hbAimed ? (lz.aimT || 0) + dt : 0; if (lz.aimT >= HB_AIM) lz.seenT = now; }
    hbAimed = lz;
  }
  const W = innerWidth / 2, H = innerHeight / 2, v = new V3(), pick = [];
  if (!blind) for (const z of zombies) {
    if (z.dead || z.rise > .5 || z.K.boss || (z.K.ghost && z.op < .4)) continue;
    const d = Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z);
    const last = Math.max(z.hitT || -99, z.seenT || -99), pr = d > HB_FAR + (z.tier === 3 ? 15 : 0) ? -1 : now - (z.hitT || -99) < HB_KEEP ? 0 : now - (z.seenT || -99) < HB_KEEP ? 1 : d < HB_NEAR ? 2 : -1;
    if (pr >= 0) pick.push([pr, d, z, pr < 2 ? clamp((HB_KEEP - (now - last)) / .5, 0, 1) : 1]);
  }
  pick.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0;
  for (const [, , z, fade] of pick.slice(0, HB_MAX)) {
    v.set(z.pos.x, (z.K.crawl ? 1.1 : 2.25) * z.scale + z.g.position.y, z.pos.z).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
    const e = hbEl(n++);
    e.hidden = false;
    e.classList.toggle('big', z.kind === 'brute' || z.tier === 3); const tc = 't' + (z.tier || 0); if (e.dataset.t !== tc) { e.classList.remove('t0', 't1', 't2', 't3'); e.classList.add(tc); e.dataset.t = tc; }
    e.style.transform = `translate(${v.x * W + W}px,${-v.y * H + H}px) translate(-50%,-100%)`;
    e.style.zIndex = 1000 - Math.round(v.z * 1000); // the nearer one's label on top
    e.style.opacity = fade; // fades out over the last half second
    const nm = zName(z); if (e.firstChild.textContent !== nm) e.firstChild.textContent = nm;
    const bd = `<u>◆ ${mission ? mission.job.lvl || 1 : 1}</u>${jobTier() ? `<s>☠ +${jobTier()}</s>` : ''}`; if (e.dataset.bd !== bd) { e.querySelector('em').innerHTML = bd; e.dataset.bd = bd; }
    e.querySelector('b').style.width = Math.max(0, z.hp / z.maxHp * 100) + '%';
  }
  for (let i = n; i < hbPool.length; i++) hbPool[i].hidden = true;
  const boss = zombies.find(z => z.K.boss && !z.dead);
  $('bossbar').hidden = !boss;
  if (boss) { const p = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; $('bossfill').style.width = p; $('bosslag').style.width = p; $('bossname').textContent = (boss.bounty && BOUNTIES[boss.bounty] ? `${BOUNTIES[boss.bounty].name} · ${boss.phase || 1}. fázis${boss.invulnT > 0 ? ' · immunis' : ''}` : boss.K.name).toUpperCase(); }
}

// ---------- bounties: one very strong boss, guaranteed legendary loot ----------
const BOUNTIES = {
  butcher: { loot: ['granny', 'reaper', 'thirteen'], name: 'A Mészáros', desc: 'Nekiront, és a földbe csapja a bárdját. Hívja a sétálókat.', hp: 5.5, tint: 0x6a1010, summon: ['walker', 12, 3] },
  pyre:    { loot: ['ash', 'bigbang'], name: 'A Hamvasztó', desc: 'Időnként lángba borítja maga körül a földet. Puffadtakat hív.', hp: 5, tint: 0xff5a1a, nova: true, summon: ['bloater', 15, 2] },
  queen:   { loot: ['honey', 'haystack'], name: 'Az Anyakirálynő', desc: 'Szünet nélkül szüli a porontyokat.', hp: 5.2, tint: 0xc27a3a, summon: ['spawnling', 5, 3] },
  frost:   { minLvl: 8, loot: ['glacier', 'honey'], name: 'A Jégkirály', desc: 'Fagyhullámot bocsát ki, ami lelassít. Futókat hív.', hp: 5.2, tint: 0x6ac8ff, frost: true, summon: ['runner', 10, 3] },
  titan:   { minLvl: 10, loot: ['anvil', 'hydra'], name: 'A Vaskolosszus', desc: 'Vastag páncél borítja, földrengető csapásokkal üt. Páncélosokat hív.', hp: 4.6, tint: 0x8a929a, slam: true, plate: .6, summon: ['armored', 22, 2] },
  bell:    { minLvl: 30, loot: ['bells', 'silent'], name: 'A Harangozó', desc: 'Megkondítja a harangot: akit a hang egyenesen elér, megszédül. Bújj fedezék mögé!', hp: 5.5, tint: 0xd8c47a, bell: true, summon: ['screamer', 16, 2] },
  doctor:  { minLvl: 13, loot: ['scalpel', 'honey'], name: 'A Főorvos', desc: 'Időnként meggyógyítja magát és a közeli zombikat. Ha a zöld kör alatt elég sebzést kap, megszakad.', hp: 5, tint: 0x6aff9a, heal: true, summon: ['runner', 11, 3] },
  shade:   { loot: ['silent', 'rod', 'sebastian'], name: 'Az Árnyék', desc: 'Eltűnik, és a hátad mögött bukkan fel. Árnyakat hív.', hp: 4.6, tint: 0x6a4aff, blink: true, summon: ['phantom', 16, 2] },
};
function spawnBounty(key) {
  const B = BOUNTIES[key] || BOUNTIES.butcher, all = activeSpawns();
  const [sx, sz] = all.reduce((b, s) => Math.abs(Math.hypot(s[0] - player.pos.x, s[1] - player.pos.z) - 38) < Math.abs(Math.hypot(b[0] - player.pos.x, b[1] - player.pos.z) - 38) ? s : b);
  const z = spawnZombieAt('butcher', sx, sz);
  z.hp *= B.hp * Math.min(1, .4 + .04 * jobLvl()); // early bounties are gentler: ×0.52 at level 3, full from level 15
  z.maxHp = z.hp; z.scale *= 1.15; z.g.scale.setScalar(z.scale); bountyLook(z, key);
  z.sumT = 6; z.novaT = 8; z.blinkT = 10; z.phase = 1; z.dmg *= 1.2; z.throwT = 4; z.slamT = 6;
  if (B.plate) z.armor = z.hp * B.plate;
 // the Colossus: break the plating first (headshots skip it)
  banner(B.name.toUpperCase(), B.desc); SND.roar();
  return z;
}
const PHASE_TXT = { 2: 'Dühöngés: gyorsabb, erősebb, és bárdot hajít.', 3: 'Utolsó erő: minden képessége elszabadul.' };
function bountyTick(z, dt, dist) {
  const B = BOUNTIES[z.bounty]; if (!B) return;
  const want = z.hp > z.maxHp * .66 ? 1 : z.hp > z.maxHp * .33 ? 2 : 3;
  if (want > (z.phase || 1)) { // a new phase: a moment of immunity, a shockwave of adds, and everything gets worse
    z.phase = want; z.invulnT = 2.5; z.dmg *= 1.25; z.speed *= 1.15; z.enraged = true; z.sumT = 1.5;
    banner(`${B.name.toUpperCase()} · ${want}. FÁZIS`, PHASE_TXT[want]); SND.roar();
    for (let k = 0; k < 32; k++) { const a = k / 32 * 6.28; burst(new V3(z.pos.x + Math.sin(a) * 3, .3, z.pos.z + Math.cos(a) * 3), B.tint, 2, 3, .6); }
    for (let k = 0; k < 3 + 2 * want; k++) { const a = rand(0, 6.28); spawnZombieAt(pick(['runner', 'walker', 'walker', 'brute', 'leaper']), z.pos.x + Math.sin(a) * 4, z.pos.z + Math.cos(a) * 4, .6); }
  }
  if (z.invulnT > 0) { z.invulnT -= dt; if (Math.random() < dt * 25) burst(new V3(z.pos.x + rand(-1, 1), rand(.5, 2.5) * z.scale, z.pos.z + rand(-1, 1)), 0xfff0b0, 1, 1.5, .4); }
  if (z.phase >= 2) { // thrown cleaver, with a tell
    z.throwT -= dt;
    if (z.throwT < .5 && !z.throwTold) { z.throwTold = true; burst(new V3(z.pos.x, 2.4 * z.scale, z.pos.z), 0xfff0a0, 6, .5, .35); tn(900, .06, .12, 'square', 500); }
    if (z.throwT <= 0) { z.throwT = z.phase === 3 ? 2.6 : 4; z.throwTold = false; if (dist < 38) gunslingerFire(z, 22 * (1 + .03 * (round - 1))); }
  }
  if (z.phase === 3) {
    if (z.bounty === 'pyre' && (z.hazT = (z.hazT == null ? 2 : z.hazT) - dt) <= 0) { z.hazT = 5; const at = new V3(player.pos.x, 0, player.pos.z); telegraph(at, 3.5, 0xff6a1a, 1, () => addFireZone(at, 3.5, 6, 18)); } // a ring first: step out
    if (z.bounty === 'queen' && (z.bruteT = (z.bruteT == null ? 4 : z.bruteT) - dt) <= 0) { z.bruteT = 12; const a = rand(0, 6.28); spawnZombieAt('brute', z.pos.x + Math.sin(a) * 3, z.pos.z + Math.cos(a) * 3, .5); }
    if (z.bounty === 'butcher') z.bossT = Math.min(z.bossT, 2.5);
  }
  if ((z.sumT -= dt) <= 0) { // calls its brood
    const [kind, every, n] = B.summon; z.sumT = every * (z.phase === 3 ? .45 : z.phase === 2 ? .7 : 1);
    if (alive() < aliveCap() + 8) for (let k = 0; k < n; k++) { const a = rand(0, 6.28); spawnZombieAt(kind, z.pos.x + Math.sin(a) * 2.5, z.pos.z + Math.cos(a) * 2.5, .5); }
  }
  if (B.nova && (z.novaT -= dt) <= 0) { // ring of fire
    z.novaT = z.phase === 3 ? 4.5 : z.phase === 2 ? 6 : 9;
    for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28; burst(new V3(z.pos.x + Math.sin(a) * 5, .2, z.pos.z + Math.cos(a) * 5), 0xff7a1a, 3, 2, .6); }
    SND.explode();
    hurtAt(z.pos, 6.5, 28 * (z.phase || 1));
  }
  if (B.frost && (z.novaT -= dt) <= 0) { // frost wave: a blue ring warns you, then it slows everyone inside
    z.novaT = z.phase === 3 ? 4.5 : z.phase === 2 ? 6 : 8;
    const at = z.pos.clone(), ph = z.phase || 1; tn(700, .8, .06, 'sine', 1400);
    telegraph(at, 8, 0x9fe6ff, .9, () => {
      for (let k = 0; k < 28; k++) { const a = k / 28 * 6.28; burst(new V3(at.x + Math.sin(a) * 6, .3, at.z + Math.cos(a) * 6), 0x9fe6ff, 3, 2.5, .7); }
      SND.armorBreak();
      if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 8) { player.chillT = 3; popText('Megdermedtél!', '#9fe6ff'); }
      hurtAt(at, 8, 18 * ph);
    }, 'frost');
  }
  if (B.slam && (z.slamT -= dt) <= 0 && dist < 16) { // a ground slam with a tell, then a charge in the last phase
    z.slamT = z.phase === 3 ? 3.5 : z.phase === 2 ? 5 : 6.5;
    burst(new V3(z.pos.x, .2, z.pos.z), 0xc8c0a8, 30, 6, .9); SND.slam(); player.shake = Math.max(player.shake, dist < 10 ? .5 : .2);
    hurtAt(z.pos, 7, 32 * (z.phase || 1));
    if (z.phase === 3) { z.chargeT = 1.6; z.speed *= 2.2; }
  }
  if (z.chargeT > 0 && (z.chargeT -= dt) <= 0) z.speed /= 2.2;
  if (B.heal && (z.healT = (z.healT == null ? 8 : z.healT) - dt) <= 0 && !z.healing) { // the heal: a green ring; enough damage while it charges breaks it
    z.healT = z.phase === 3 ? 7 : 10; z.healing = true; z.healHp = z.hp; const at = z.pos.clone();
    tn(520, 1.4, .08, 'sine', 900); popText('A Főorvos gyógyítani készül: sebezd meg!', '#6aff9a');
    telegraph(at, 10, 0x6aff9a, 1.6, () => {
      z.healing = false; if (z.dead) return;
      if (z.healHp - z.hp > z.maxHp * .06) { netBanner('MEGSZAKÍTVA', 'A csapat félbeszakította a gyógyítást.'); SND.armorBreak(); return; }
      netBanner('A FŐORVOS GYÓGYÍTOTT', 'Legközelebb sebezd a zöld kör alatt!');
      for (const q of zombies) if (!q.dead && q.pos.distanceTo(z.pos) < 10) { q.hp = Math.min(q.maxHp, q.hp + q.maxHp * .08); burst(new V3(q.pos.x, 1.5, q.pos.z), 0x6aff9a, 6, 2, .5); }
      SND.heal();
    }, 'heal');
  }
  if (B.bell && (z.bellT = (z.bellT == null ? 6 : z.bellT) - dt) <= 0) { // the bell: a huge ring you can't outrun, only hide from
    z.bellT = z.phase === 3 ? 7 : z.phase === 2 ? 9.5 : 12;
    const at = z.pos.clone(); tn(220, 1.6, .12, 'sine', 200); tn(330, 1.6, .06, 'sine', 300); popText('A harang mindjárt megszólal: fedezékbe!', '#d8c47a');
    telegraph(at, 30, 0xd8c47a, 1.5, () => bellHit(at), 'bell');
  }
  if (B.blink && (z.blinkT -= dt) <= 0 && dist > 5) { // vanishes and comes out behind you
    z.blinkT = z.phase === 3 ? 4 : z.phase === 2 ? 7 : 10;
    burst(new V3(z.pos.x, 1.2, z.pos.z), 0x6a4aff, 20, 4, .6);
    const f = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    z.pos.set(player.pos.x - f.x * 4, 0, player.pos.z - f.z * 4); collide(z.pos, .7);
    burst(new V3(z.pos.x, 1.2, z.pos.z), 0x6a4aff, 20, 4, .6); SND.leap(); SND.scream(.15); popText('MÖGÖTTED!', '#b8a8ff');
  }
}
// the bounty is done: everyone in the party gets a legendary gun and a legendary piece of armor, then the van comes
function bountyKilled(z) {
  const M = mission; if (!M || M.bountyDone) return;
  M.bountyDone = true; M.bountyAt = [z.pos.x, z.pos.z]; firstBounty(z.bounty);
  M.job.dur = M.t + EVAC_WARN + 1;
  bountyLoot(z.pos, z.bounty);
  banner(`${(BOUNTIES[z.bounty] || BOUNTIES.butcher).name.toUpperCase()} ELESETT`, 'Legendás zsákmány! Szedd fel, aztán irány a furgon.');
}
function bountyLoot(pos, key) {
  const p = new V3(pos.x, 0, pos.z), B = BOUNTIES[key];
  const rw = Math.random(), rg = Math.random(); // a gun: 8% one of this boss's exotics, 30% legendary, else epic · armor: 6% exotic, 30% legendary, else epic
  spawnDrop(B && rw < .08 ? makeUnique(pick(B.loot), lootLvl(3)) : makeWeapon(pick(BASES), rw < .38 ? 4 : 3, lootLvl(3)), p.clone().add(new V3(-1, 0, 0)));
  spawnGearDrop(rg < .06 ? makeExotic(null, lootLvl(3)) : makeGear(null, rg < .36 ? 4 : 3, lootLvl(3)), p.clone().add(new V3(1, 0, 0)));
  for (let k = 0; k < 2; k++) { const a = k / 2 * 6.28 + .4; setTimeout(() => spawnDrop(makeWeapon(pick(BASES), Math.max(1, rollRarity(.35)), lootLvl(2)), p.clone().add(new V3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6))), 250 + k * 180); } // the loot fountain
  slowmo = 1.4; for (let k = 0; k < 5; k++) tn(660 * Math.pow(1.19, k), .25, .06, 'triangle', 0, .15 + k * .12);
}

// ---------- unique tricks and anointments that fire on hits and kills (the shooter's side) ----------
function weaponOnHit(z, amt, o) {
  const w = o.w; if (!w || o.dot) return;
  if (o.chain && w.oc !== 'leech') return; // a bounce or a chain doesn't set off the gun's tricks again
  if (w.unique === 'honey') player.hp = Math.min(maxHp(), player.hp + amt * .02);
  if (w.unique === 'silent' && o.head) explode(zHeadPos(z), { r: 3.5, zdmg: amt * .5, pr: .01, pdmg: .001, color: 0xb0c8ff });
  if (w.unique === 'anvil') { if (z.armor > 0 && z.K.boss) z.armor -= z.maxHp * .1; else if (z.armor > 0) { z.armor = 0; z.armorParts.forEach(a => a.visible = false); SND.armorBreak(); } if (!z.K.boss) { const d = new V3(z.pos.x - player.pos.x, 0, z.pos.z - player.pos.z).setLength(1.2); z.pos.add(d); collide(z.pos, .5); } }
  if (w.unique === 'bells' && (player.bellN = (player.bellN || 0) + 1) % 9 === 0) { burst(new V3(z.pos.x, 1.5, z.pos.z), 0xd8c47a, 20, 4, .6); tn(440, .9, .08, 'sine', 430); for (const q of zombies) if (!q.dead && q.pos.distanceTo(z.pos) < 6) { q.slowT = 2.5; q.flinch = .3; } }
  if (w.unique === 'scalpel' && o.crit) { z.burnT = Math.max(z.burnT, 3); z.burnDps = Math.max(z.burnDps, amt * .5 / 3); z.burnW = w; }
  if (w.oc === 'exploder' && w.ammo === 0 && w.mag >= 6 && !o.chain) explode(new V3(z.pos.x, 1, z.pos.z), { r: 3, zdmg: amt * 2, pr: .01, pdmg: .001, color: 0xffb04a });
  if (w.oc === 'leech') player.hp = Math.min(maxHp(), player.hp + Math.min(amt * .01, maxHp() * .015));
  if (w.oc === 'ricochet' && !o.chain && Math.random() < .25) { const q = zombies.filter(q => !q.dead && q !== z && q.pos.distanceTo(z.pos) < 8).sort((a, b) => a.pos.distanceTo(z.pos) - b.pos.distanceTo(z.pos))[0]; if (q) { tracer(new V3(z.pos.x, 1.5, z.pos.z), new V3(q.pos.x, 1.5, q.pos.z), 0xffe0a0, .012); hurtZombie(q, amt * .5, { w, chain: true }); } }
  if (w.element === 'leech' && !o.chain) { const s = Math.floor(now), cap = maxHp() * .04; if (player.leechS !== s) { player.leechS = s; player.leechUsed = 0; } // lifesteal with a per-second ceiling
    const h = Math.min(amt * .03, cap - player.leechUsed); if (h > 0) { player.leechUsed += h; player.hp = Math.min(maxHp(), player.hp + h); } }
  if (w.tal && !o.chain) talentHit(z, amt, o, w);
  if (w.unique === 'sebastian') explode(new V3(z.pos.x, 1, z.pos.z), { r: 3.5, zdmg: amt * .7, pr: .01, pdmg: .001 });
  if (z.markT > 0 && augOn('execute') && z.hp > 0 && z.hp < z.maxHp * .3) { const rest = z.hp; z.markT = 0; hurtZombie(z, rest + 1, { color: '#b46cff' }); }
}
function talentHit(z, amt, o, w) { // the extra damage lands as a chained hit, so it can't set the talents off again
  const extra = k => { if (!z.dead && z.hp > 0) hurtZombie(z, amt * k, { w, chain: true, color: '#ffd23f' }); };
  if (w.tal === 'bread') { if (!o.head) player.bread = true; else if (player.bread) { player.bread = false; extra(.4); } }
  const d = Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z);
  if (w.tal === 'close' && d < 10) extra(.25);
  if (w.tal === 'ranger' && d > 25) extra(.25);
  if (w.tal === 'frost' && (player.frostN = (player.frostN || 0) + 1) % 5 === 0) z.slowT = Math.max(z.slowT || 0, 2);
}
function weaponOnKill(z, o) {
  const w = o.w;
  if (z.markT > 0 && augOn('plague')) for (const q of zombies) if (!q.dead && q !== z && q.pos.distanceTo(z.pos) < 8) q.markT = Math.max(q.markT || 0, 6);
  if (!w) return;
  if (w.unique === 'granny') w.ammo = w.mag;
  if (w.unique === 'hydra') player.hydraUntil = now + 3;
  if (w.unique === 'glacier' && (z.slowT > 0 || (z.net && z.net.fl & 32))) { burst(new V3(z.pos.x, 1.2, z.pos.z), 0x9fe6ff, 18, 4, .6); for (const q of zombies) if (!q.dead && q !== z && q.pos.distanceTo(z.pos) < 4.5) { q.slowT = 3; hurtZombie(q, zombieHp() * .3, { color: '#9fe6ff', chain: true }); } }
  if (w.unique === 'ash' && (z.burnT > 0 || (z.net && z.net.fl & 16))) explode(new V3(z.pos.x, 1, z.pos.z), { r: 3.5, zdmg: zombieHp() * 1.2, pr: .01, pdmg: .001, color: 0xff7a1a });
  if (w.unique === 'reaper' && o.head) player.uStack = Math.min(3, (player.uStack || 0) + 1);
  if (w.tal === 'frenzy') player.frenzyT = now + 5;
  if (w.tal === 'feast' && o.head) player.hp = Math.min(maxHp(), player.hp + maxHp() * .04);
  if (w.tal === 'scav') w.ammo = Math.min(w.mag, w.ammo + Math.ceil(w.mag * .15));
  if (w.anoint === 'killheal') player.hp = Math.min(maxHp(), player.hp + maxHp() * .06);
  if (w.anoint === 'boom' && Math.random() < .2) explode(new V3(z.pos.x, 1, z.pos.z), { r: 4, zdmg: zombieHp() * .8, pr: .01, pdmg: .001 });
}

// kills close together: DUPLA, TRIPLA… with a few bonus points
const MULTI = ['', '', 'DUPLA', 'TRIPLA', 'NÉGYES', 'ÖTÖS', 'MÉSZÁRLÁS'];
function multiKill() {
  player.mk = now - (player.mkT || -9) < 1.3 ? (player.mk || 1) + 1 : 1; player.mkT = now;
  if (player.mk >= 2) { const n = Math.min(player.mk, MULTI.length - 1); popText(`${MULTI[n]} ÖLÉS! +${25 * player.mk}`, '#ffd23f'); addPoints(25 * player.mk); tn(500 + 120 * n, .12, .07, 'triangle'); }
}

// a headshot kill takes the head off: everything above the shoulders goes, in a red spray
function headPop(z) {
  for (const c of z.upper.children) if (c.position.y > .85) c.visible = false;
  const h = new V3(z.pos.x, 2 * z.scale, z.pos.z); burst(h, 0x7a0a0a, 22, 4.5, .7); burst(h, 0xd8d0b8, 5, 3, .5); nz(.12, 900, .35, 'bandpass', 2);
}

// a bounty's look, the same for the host and for party members: its tint and the glowing weak point on its back
function bountyLook(z, key) {
  const B = BOUNTIES[key]; if (!B || z.bountyLooked) return; z.bounty = key; z.bountyLooked = true;
  const tint = new THREE.Color(B.tint); z.mats.forEach(m => m.color && m.color.lerp(tint, .45));
  const weak = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 8), new THREE.MeshBasicMaterial({ color: B.tint }));
  weak.position.set(0, .55, -.3); weak.userData.z = z; weak.userData.weak = true; z.upper.add(weak); z.parts.push(weak);
  const wg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: B.tint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); wg.scale.set(1.1, 1.1, 1); weak.add(wg);
}

const AFFIX = {
  fire:  { name: 'Tüzes', on: z => {}, die: z => { const at = z.pos.clone(); telegraph(at, 3.2, 0xff6a1a, .7, () => { burst(new V3(at.x, .5, at.z), 0xff7a1a, 24, 4, .6); SND.explode(); hurtAt(at, 3.2, 25 * affixMul()); }); } },
  boom:  { name: 'Robbanó', on: z => {}, die: z => { const at = z.pos.clone(); telegraph(at, 4.5, 0xffd23f, 1, () => { burst(new V3(at.x, .8, at.z), 0xffd23f, 30, 6, .7); SND.explode(); hurtAt(at, 4.5, 40 * affixMul()); }); } },
  frost: { name: 'Fagyos', on: z => {}, die: z => { const at = z.pos.clone(); telegraph(at, 5, 0x9fe6ff, .8, () => { burst(new V3(at.x, .5, at.z), 0x9fe6ff, 24, 4, .6); if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 5) player.chillT = 2.5; }, 'frost'); } },
  fast:  { name: 'Gyors', on: z => { z.speed *= 1.4; } },
  tough: { name: 'Szívós', on: z => { z.hp *= 1.8; z.maxHp = z.hp; z.scale *= 1.1; z.g.scale.setScalar(z.scale); } },
  vamp:  { name: 'Vérszívó', on: z => {} },
  regen: { name: 'Regeneráló', on: z => {} },
  rage:  { name: 'Dühöngő', on: z => {} },
};
const AFFIX_DESC = { fire: 'Halálakor lángra lobbantja maga körül a földet.', boom: 'Halálakor felrobban: fuss, amikor villog a kör.', frost: 'Halálakor fagyhullám: aki benne áll, lelassul.',
  fast: '40%-kal gyorsabb.', tough: '80%-kal több életerő, nagyobb termet.', vamp: 'Ha megüt, visszatölti az életereje 12%-át.', regen: 'Ha 3 mp-ig nem sebzik, másodpercenként 2%-ot gyógyul.',
  rage: '25% életerő alatt feldühödik: 35%-kal gyorsabb, 40%-kal nagyobbat üt.' };
// ranks: each one tougher, with its own bar colour; elites get one trait, named zombies two and a name
const ZTIERS = [
  { name: '',           hp: 1,   sc: 1,    n: 0, col: '#ff5a4a' },
  { name: 'Veterán',    hp: 1.6, sc: 1.04, n: 0, col: '#b48cff' },
  { name: 'Elit',       hp: 2.6, sc: 1.08, n: 1, col: '#ffd23f' },
  { name: 'Nevesített', hp: 4.5, sc: 1.15, n: 2, col: '#ff8c1a' },
];
const NAMED = ['Véres Jani', 'Csonka Béla', 'Rozsdás Pista', 'Vak Lajos', 'Sánta Feri', 'Hentes Karcsi', 'Néma Gizi', 'Rothadt Tibi', 'Kampós Józsi', 'Fekete Özvegy',
  'Sápadt Marika', 'Görbe Laci', 'Vasfogú Ödön', 'Szürke Bözsi', 'Korhadt Gyuri', 'Üres Szemű Zoli'];
function setZTier(z, tier, traits) {
  const was = ZTIERS[z.tier || 0], T = ZTIERS[tier]; z.tier = tier;
  z.hp *= T.hp / was.hp; if (z.maxHp) z.maxHp *= T.hp / was.hp; z.scale *= T.sc / was.sc; if (z.g) z.g.scale.setScalar(z.scale);
  const add = traits || AFFIX_KEYS.filter(k => !(z.traits || []).includes(k)).sort(() => Math.random() - .5).slice(0, Math.max(0, T.n - (z.traits || []).length));
  z.traits = [...(z.traits || []), ...add]; add.forEach(k => AFFIX[k].on(z));
  z.elite = tier >= 2; z.affix = z.traits[0] || null;
}
function rollTier(z, kind) {
  if (z.K.boss || kind === 'spawnling' || NET.client || !mission || mission.job.test) return;
  const d = mission.job.diff - 1, t = jobTier(), r = Math.random();
  const w = Math.min(20, round - 1), pN = .006 + .003 * d + .004 * t + .0015 * w, pE = .03 + .012 * d + .02 * t + .006 * w + (roundMod.elite ? .2 : 0), pV = .14 + .03 * d + .03 * t + .012 * w;
  const tier = r < pN ? 3 : r < pN + pE ? 2 : r < pN + pE + pV ? 1 : 0;
  if (tier) setZTier(z, tier);
}
const zName = z => { const T = ZTIERS[z.tier || 0], tr = (z.traits || []).map(k => AFFIX[k].name);
  const kn = z.dummy ? `Célbábu · ${z.K.name}` : z.K.name;
  return (z.tier === 3 ? `„${NAMED[z.id % NAMED.length]}” · ${kn}` : (T.name ? T.name + ' ' : '') + kn) + (tr.length ? ` (${tr.join(', ')})` : ''); };
function zBit(z) { if (z.traits && z.traits.includes('vamp') && !z.dead) { z.hp = Math.min(z.maxHp, z.hp + z.maxHp * .12); burst(new V3(z.pos.x, 1.4 * z.scale, z.pos.z), 0xb3141b, 8, 2, .4); } }
const AFFIX_KEYS = Object.keys(AFFIX);
const affixMul = () => (1 + .03 * (round - 1)) * (1 + .08 * jobTier());

// the bell reaches you only if the bell tower can see you: cover saves you
function bellHit(at) {
  SND.roar(); tn(110, 2.5, .25, 'sine', 108); burst(new V3(at.x, 3, at.z), 0xd8c47a, 30, 6, .8);
  if (player.down || Math.hypot(player.pos.x - at.x, player.pos.z - at.z) > 30) return;
  if (!hasSight(new V3(at.x, 2.6, at.z), new V3(player.pos.x, 1.6, player.pos.z))) return popText('A fedezék megvédett!', '#7dff7a');
  player.chillT = 2.2; player.shake = .9; hurtPlayer(14); popText('A harang elkábított!', '#d8c47a');
}

// what your gear and skills do when you kill: the same for the host, solo, and a party member's confirmed kills
function killPerks(z, o) {
  if (exoOn('vamp')) player.hp = Math.min(maxHp(), player.hp + maxHp() * .08);
  if (brand4('gravetide')) { player.bloodN = Math.min(10, (now < (player.bloodT || 0) ? player.bloodN || 0 : 0) + 1); player.bloodT = now + 6; }
  if (brand4('hollis')) player.hp = Math.min(maxHp(), player.hp + maxHp() * .03);
  if (brand4('sable') && player.sprint) player.stam = maxStam();
  if (rk('h_ricochet') && o.head && o.w && !o.chain) { const q = zombies.filter(q => !q.dead && q !== z && q.pos.distanceTo(z.pos) < 10).sort((a, b) => a.pos.distanceTo(z.pos) - b.pos.distanceTo(z.pos))[0]; if (q) { tracer(new V3(z.pos.x, 1.8, z.pos.z), new V3(q.pos.x, 1.6, q.pos.z), 0xffe0a0, .015); setTimeout(() => hurtZombie(q, o.w.dmg * SK.dmg(o.w) * 1.5, { w: o.w, chain: true, head: true }), 60); } } // Gellert
  if (rk('e_chain') && !o.w && !o.melee && !o.dot && Math.random() < .3) setTimeout(() => explode(new V3(z.pos.x, 1, z.pos.z), { r: 3.5, zdmg: zombieHp() * .8, pr: .01, pdmg: .001, color: 0xff9a4a }), 150); // Láncrobbanás
  if (exoOn('bomber') && !o.w && !o.melee && !o.dot) player.inv.gren = Math.min(itemMax('gren'), player.inv.gren + 1); // Robbanómellény
  if (brand4('cinder') && !o.w && !o.melee && !o.dot && Math.random() < .4) setTimeout(() => explode(new V3(z.pos.x, 1, z.pos.z), { r: 3.5, zdmg: zombieHp() * .9, pr: .01, pdmg: .001, color: 0xff9a4a }), 120);
  if (o.head && o.w && exoOn('quick')) o.w.ammo = o.w.mag;
  if (o.head && !z.K.boss && z.upper) headPop(z);
}

// on-hit skills, for the shooter (host, solo or party member): lifesteal capped at 6% max HP a second, crit blasts
function hitPerks(z, amt, o) {
  if (!o.dot && rk('m_steal')) { if (now - (player.stealT || 0) > 1) { player.stealT = now; player.stealN = 0; } const h = Math.min(amt * .01 * rk('m_steal'), maxHp() * .02, maxHp() * .06 - (player.stealN || 0)); if (h > 0) { player.stealN = (player.stealN || 0) + h; player.hp = Math.min(maxHp(), player.hp + h); } }
  if (o.crit && o.w && !o.chain && rk('s_blast') && Math.random() < .1 * rk('s_blast')) setTimeout(() => explode(new V3(z.pos.x, 1, z.pos.z), { r: 3, zdmg: amt * .6, pr: .01, pdmg: .001, color: 0xffb04a }), 0);
}

// merge a zombie's decorations and eyes: per limb, per material, head-level bits apart from body bits (headshots hide the former)
function mergeZombieBits(pivots, hitParts) {
  const BU = THREE.BufferGeometryUtils, out = []; if (!BU) return out;
  const keep = new Set(hitParts);
  for (const pv of pivots) {
    const groups = new Map();
    for (const c of pv.children) {
      if (!c.isMesh || keep.has(c) || c.children.length || Array.isArray(c.material)) continue;
      const k = c.material.uuid + (c.position.y > .85 ? 'h' : 'b'); let l = groups.get(k); if (!l) groups.set(k, l = []); l.push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) { out.push(...list); continue; }
      const head = list[0].position.y > .85, oy = head ? 1 : 0, geos = list.map(m => { m.updateMatrix(); const g2 = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); for (const k of Object.keys(g2.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g2.deleteAttribute(k); g2.applyMatrix4(m.matrix); g2.translate(0, -oy, 0); return g2; });
      const mg = geos.every(g2 => g2.attributes.uv) ? BU.mergeBufferGeometries(geos) : null; geos.forEach(g2 => g2.dispose());
      if (!mg) { out.push(...list); continue; }
      mg.userData.own = true; const mm = new THREE.Mesh(mg, list[0].material); mm.position.y = oy; mm.castShadow = false;
      list.forEach(m => pv.remove(m)); pv.add(mm); out.push(mm);
    }
  }
  return out;
}
function freeZombie(z) { z.mats.forEach(m => m.dispose()); z.g.traverse(o => { if (o.geometry && o.geometry.userData.own) o.geometry.dispose(); }); }

function firstBounty(key) { const B = stats.bk || (stats.bk = {}); if (!B[key]) { profile.oc = (profile.oc || 0) + 1; popText('Első győzelem ellene: +1 túlhajtás-mag', '#a88aff'); } B[key] = 1; }
