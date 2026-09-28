// ================= MAPS =================
// A map is data: its yard, gates into unlockable areas, the station each area holds, spawn points, where the
// mystery box / ammo crate / escape truck stand, and a build() for its buildings. loadMap() rebuilds everything.
const VAN_HALF = 2.2, GATE_HALF = 2.6, BOX_COST = 950, AMMO_COST = 1200; // the crate refills only the gun in your hand
let MAP = null, MAP_ID = 'farm', MAIN_RECT = { minX: -38, maxX: 38, minZ: -38, maxZ: 38 }, AREAS = {}, SPAWNS = [], BOX_SPOTS = [];
const lamps = [], props = [];
let mapSeed = 1, baseFog = .03;
const ammoBox = { pos: new V3() };
const box = { pos: new V3(), state: 'idle', t: 0, weapon: null, show: null, swapT: 0, spot: 0, uses: 0, limit: 5 };
const truck = { pos: new V3(), g: null, beacon: null, dir: 1, obs: null, parked: true };
const mapSpin = []; // windmill blades and the like
// corn stalks with a ragged, see-through top
const cornTex = canvasTex(128, (g, S) => {
  for (let i = 0; i < 26; i++) {
    const x = i / 26 * S + rand(-2, 2), top = rand(4, 34), c = Math.floor(rand(70, 120));
    g.strokeStyle = `rgb(${c * .75},${c},${c * .4})`; g.lineWidth = rand(2, 4);
    g.beginPath(); g.moveTo(x, S); g.lineTo(x + rand(-3, 3), top); g.stroke();
    for (let k = 0; k < 4; k++) { const y = rand(top + 8, S - 6), l = rand(8, 18) * (Math.random() < .5 ? -1 : 1); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * .6, y - 8, x + l, y + rand(-2, 6)); g.stroke(); }
    g.fillStyle = '#b39a4a'; g.fillRect(x - 2, top - 4, 4, 6);
  }
});
cornTex.wrapS = THREE.RepeatWrapping; cornTex.repeat.set(4, 1);
const cornMat = new THREE.MeshLambertMaterial({ map: cornTex, alphaTest: .4, side: THREE.DoubleSide });

const asphaltTex = canvasTex(256, (g, s) => {
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) { const v = 40 + Math.random() * 22; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 1.05; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(10,10,10,${rand(.2, .5)})`; g.lineWidth = rand(.5, 2); g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rand(-20, 20); y += rand(-20, 20); g.lineTo(x, y); } g.stroke(); }
}, 30);
const grassTex = canvasTex(256, (g, s) => {
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) { const v = 26 + Math.random() * 22; img.data[i * 4] = v * .8; img.data[i * 4 + 1] = v * 1.1; img.data[i * 4 + 2] = v * .7; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${rand(10, 40)},${rand(40, 70)},${rand(10, 30)},${rand(.15, .35)})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, rand(4, 20), 0, 7); g.fill(); }
}, 34);
const stoneTex = canvasTex(128, (g) => {
  g.fillStyle = '#6a6a66'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16 % 2) * 12; x < 128; x += 24) { g.fillStyle = `rgba(0,0,0,${rand(.05, .2)})`; g.fillRect(x, y, 22, 14); }
});
stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.repeat.set(3, 2);

// ---------- small builders (all add to mapGroup) ----------
const put = o => { mapGroup.add(o); return o; };
const basicCache = new Map(), basic = c => basicCache.get(c) || (basicCache.set(c, new THREE.MeshBasicMaterial({ color: c })), basicCache.get(c));
function glowSprite(color, size, pos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1); s.position.copy(pos); return put(s);
}
const LIGHT_POOL = Array.from({ length: 16 }, () => { const l = new THREE.PointLight(0xffffff, 0, 10, 1.5); scene.add(l); return l; }); let lightNext = 0;
function pointLight(color, i, d, x, y, z) { // from the pool; past 16 a map light only glows (a stand-in the code can still set)
  const l = LIGHT_POOL[lightNext++]; if (!l) return { isLight: false, intensity: 0, position: new V3(), color: new THREE.Color(), distance: 0 };
  l.color.setHex(color); l.intensity = i; l.distance = d; l.position.set(x, y, z); return l;
}
const mapLabels = [];
function label(lines, color, size, x, y, z) { const s = textSprite(lines, color, size); s.position.set(x, y, z); s.material.depthTest = false; s.renderOrder = 6; s.userData.base = s.scale.clone(); mapLabels.push(s); return put(s); } // signs read through posts and shrink up close

// ---------- set dressing for stations and shops ----------
const panelCache = {};
function panelTex(key, w, h, draw) { // a painted sign, drawn once per key
  if (panelCache[key]) return panelCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return panelCache[key] = t;
}
function deco(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = sx * sy * sz > .02; (parent || mapGroup).add(m); return m; }
const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: .8, roughness: .35 }), brassMat = new THREE.MeshStandardMaterial({ color: 0xb8923a, metalness: .8, roughness: .35 });
const sandMat = new THREE.MeshLambertMaterial({ color: 0x8a7a58 });
const hazardTex = panelTex('hazard', 128, 32, (g, w, h) => { g.fillStyle = '#e8b82a'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; for (let x = -h; x < w; x += 24) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 12 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
function lamp(x, z) {
  addBox(x, z, .2, .2, 4.2, poleMat);
  const bulb = put(new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), basic(0xffc070))); bulb.position.set(x, 4.25, z);
  const glow = glowSprite(0xffa040, 2.2, bulb.position);
  const light = lamps.filter(l => l.light.isLight).length < 7 ? pointLight(0xffa040, 1.7, 20, x, 4, z) : { intensity: 0 };
  lamps.push({ x, z, light, bulb, glow, flicker: false });
}
// a building: solid walls + gable roof + a dark door on one side
function house(x, z, w, d, h, wallMat, roofCol = 0x2b2a2c, door = 's') {
  addBox(x, z, w, d, h, wallMat);
  const rm = matStd({ color: roofCol, roughness: .8 });
  const alongX = w >= d, span = alongX ? d : w, len = (alongX ? w : d) + .6;
  [-1, 1].forEach(sd => {
    const r = put(new THREE.Mesh(unitBox, rm));
    const slope = span / 2 / Math.cos(.55) + .3;
    if (alongX) { r.scale.set(len, .25, slope); r.position.set(x, h + span * .22, z + sd * span / 4); r.rotation.x = sd * .55; }
    else { r.scale.set(slope, .25, len); r.position.set(x + sd * span / 4, h + span * .22, z); r.rotation.z = -sd * .55; }
    r.castShadow = true;
  });
  const dm = matStd({ color: 0x140c08 }), dw = Math.min(3, (door === 'n' || door === 's' ? w : d) * .35);
  if (door === 's') addBox(x, z + d / 2 + .03, dw, .06, h * .65, dm, 0, false);
  if (door === 'n') addBox(x, z - d / 2 - .03, dw, .06, h * .65, dm, 0, false);
  if (door === 'e') addBox(x + w / 2 + .03, z, .06, dw, h * .65, dm, 0, false);
  if (door === 'w') addBox(x - w / 2 - .03, z, .06, dw, h * .65, dm, 0, false);
}
// open shed: posts you collide with, a roof you can shoot under
function shed(x, z, w, d, h, roofCol = 0x3a3530) {
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) addBox(x + a * (w / 2 - .2), z + b * (d / 2 - .2), .3, .3, h, poleMat);
  addBox(x, z, w + .6, d + .6, .25, matStd({ color: roofCol }), h, false);
}
function cylinderSolid(x, z, r, h, mat, y = 0) {
  const m = put(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat)); m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true; rayBlockers.push(m);
  obstacles.push({ minX: x - r * .85, maxX: x + r * .85, minZ: z - r * .85, maxZ: z + r * .85, h: y + h });
  return m;
}
const graveSpots = [];
function grave(x, z) {
  graveSpots.push([x, z]);
  const m = put(new THREE.Mesh(unitBox, stoneMat)); m.scale.set(.62, rand(.7, 1.1), .16);
  m.position.set(x, .45, z); m.rotation.set(rand(-.15, .15), rand(-.3, .3), rand(-.15, .15)); m.castShadow = true;
}
function deadTree(x, z) {
  const t = new THREE.Group(), h = rand(5, 9);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(.15, .35, h, 6), barkMat); tr.position.y = h / 2; t.add(tr);
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.04, .12, rand(1.5, 3), 5), barkMat);
    b.position.y = h * rand(.5, .9); b.rotation.set(rand(-1.1, 1.1), rand(0, 6), rand(-1.1, 1.1)); t.add(b);
  }
  t.position.set(x, 0, z); put(t);
}
function pine(x, z) {
  const t = new THREE.Group(), h = rand(7, 12);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(.18, .3, h * .5, 6), barkMat); tr.position.y = h * .25; t.add(tr);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(h * .22, h * .8, 7), new THREE.MeshLambertMaterial({ color: 0x1c2a1c })); cone.position.y = h * .6; t.add(cone);
  t.position.set(x, 0, z); put(t);
}
function logPile(x, z, n = 9) {
  const m = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    const l = put(new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 5, 10), m));
    l.rotation.z = Math.PI / 2; l.position.set(x, .35 + row * .62, z - 1.1 + col * .72 + (row % 2) * .35); l.castShadow = true; rayBlockers.push(l);
  }
  obstacles.push({ minX: x - 2.5, maxX: x + 2.5, minZ: z - 1.6, maxZ: z + 1.6, h: 2 });
}
// western storefront: solid body, a tall false front on the street side (face = +1: street toward +z), boardwalk, porch, sign
const glassLit = basic(0xffb45a), glassDark = basic(0x101418), doorMat = matStd({ color: 0x140c08 });
function storefront(x, z, w, d, h, mat, sign, face, lit, signCol = '#e8c890') {
  addBox(x, z, w, d, h, mat);
  addBox(x, z, w + .3, d + .3, .25, roofMat, h, false);
  const fz = z + face * d / 2;
  addBox(x, fz - face * .14, w + .4, .3, h + 2.2, mat, 0, false);
  addBox(x, fz + face * .03, 1.6, .06, 2.4, doorMat, 0, false);
  [-1, 1].forEach((s, i) => addBox(x + s * w * .3, fz + face * .04, 1.7, .06, 1.3, lit & (1 << i) ? glassLit : glassDark, 1, false));
  addBox(x, fz + face * .04, 2.2, .06, 1, lit & 4 ? glassLit : glassDark, h - 1.6, false);
  addBox(x, fz + face * 1.25, w, 2.5, .16, boardMat, 0, false);
  addBox(x, fz + face * 1.3, w, 2.6, .14, roofMat, 3.1, false);
  [-1, 1].forEach(s => addBox(x + s * (w / 2 - .2), fz + face * 2.4, .2, .2, 3.1, poleMat));
  // painted sign flat on the false front (a billboard sprite would cut into the facade)
  const s = textSprite([sign], signCol, 3), sm = new THREE.MeshBasicMaterial({ map: s.material.map, transparent: true, depthWrite: false });
  const sg = put(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sm));
  sg.scale.set(s.scale.x, s.scale.y, 1); sg.position.set(x, h + 1.1, fz + face * .06); sg.rotation.y = face > 0 ? 0 : Math.PI;
  sg.onBeforeRender = () => { if (sm.map !== s.material.map) { sm.map = s.material.map; sm.needsUpdate = true; } }; // font loaded late
  addBox(x, fz + face * .03, Math.min(w, s.scale.x * .85), .05, 1.4, matStd({ color: 0x2a2018 }), h + .4, false);
}
function waterTower(x, z) {
  const wood = matStd({ map: plankTex, color: 0x8a7058 });
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(x + a * 2.2, z + b * 2.2, .35, .35, 9, poleMat);
  addBox(x, z, 5.4, 5.4, .3, wood, 8.8, false);
  put(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4.2, 16), wood)).position.set(x, 11.2, z);
  put(new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 16), roofMat)).position.set(x, 14.3, z);
  label(['DEAD ACRE'], '#d8d0b8', 2.2, x, 11.4, z + 3.2);
}
function wagon(x, z, turn) {
  const wood = matStd({ map: woodTex, color: 0x7a5a3a }), L = 4.2, W = 1.8, [hx, hz] = turn ? [W / 2, L / 2] : [L / 2, W / 2];
  addBox(x, z, hx * 2, hz * 2, .7, wood, .7); // collider reaches the ground
  const cover = put(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, L * .8, 12, 1, true, 0, Math.PI), matStd({ color: 0xc8bca0, side: THREE.DoubleSide })));
  cover.rotation.set(0, turn ? Math.PI / 2 : 0, Math.PI / 2); // half cylinder: arch on top, axis along the wagon
  cover.position.set(x, 1.4, z); rayBlockers.push(cover);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const t = put(new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .12, 14), wood));
    t.rotation.set(turn ? 0 : Math.PI / 2, 0, turn ? Math.PI / 2 : 0);
    t.position.set(x + (turn ? a * (W / 2 + .1) : a * L * .32), .6, z + (turn ? b * L * .32 : b * (W / 2 + .1)));
  }
}
// quarry rock: a flat-shaded dodecahedron, collider = the square inside it
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const rockMats = [0x7a746a, 0x8e877a, 0x5e5a54].map(c => matStd({ color: c, flatShading: true }));
function rock(x, z, r, h, rng, solid = true, y = 0) {
  const m = put(new THREE.Mesh(rockGeo, rockMats[Math.floor(rng() * 3)]));
  m.scale.set(r, h, r * (.85 + rng() * .3)); m.rotation.set(rng() * .5, rng() * 6.3, rng() * .5);
  m.position.set(x, y + h * .55, z); m.castShadow = solid; m.receiveShadow = true; rayBlockers.push(m);
  if (solid) obstacles.push({ minX: x - r * .72, maxX: x + r * .72, minZ: z - r * .72, maxZ: z + r * .72, h: h * 1.4 });
}
// tall floodlight: a map lamp (so the blackout mod and flicker work) with a cold, far-reaching beam
function floodlight(x, z) {
  addBox(x, z, .3, .3, 9, poleMat);
  addBox(x, z, 1.4, .4, .7, matStd({ color: 0x2a2c30 }), 8.9, false);
  const bulb = put(new THREE.Mesh(new THREE.BoxGeometry(1.1, .45, .1), basic(0xe8f0ff))); bulb.position.set(x, 9.2, z);
  const glow = glowSprite(0xbcd4ff, 4, bulb.position);
  const light = pointLight(0xcfe0ff, 1.7, 38, x, 8.6, z);
  lamps.push({ x, z, light, bulb, glow, flicker: false });
}

// ---------- the maps ----------
const MODS = {
  fog:   { name: 'SŰRŰ KÖD', sub: 'Alig látsz valamit.', label: 'Sűrű köd' },
  blood: { name: 'VÉRHOLD', sub: 'A zombik gyorsabbak, de másfélszer annyi pontot érnek.', label: 'Vérhold' },
  dark:  { name: 'ÁRAMSZÜNET', sub: 'A lámpák nem működnek.', label: 'Áramszünet' },
  horde: { name: 'HORDA', sub: 'Kétszer annyian jönnek, de gyengébbek.', label: 'Horda' },
  storm: { name: 'VIHAR', sub: 'Zuhog az eső, villámlik, alig látni. A zaj elnyeli a lövéseid: +15% pont.', label: 'Vihar' },
  elite: { name: 'ELIT', sub: 'Az arany szeműek kétszer annyit bírnak, és biztosan zsákmányt ejtenek.', label: 'Elit zombik' },
};
// perk machines (one per area, CoD style): bought with points, last for the job
const PERKS = {
  jug:    { name: 'Nehézpáncél', desc: '+50% max életerő erre a munkára', cost: 2500, color: 0xff4a4a },
  speed:  { name: 'Gyorskezű', desc: '+30% újratöltési sebesség', cost: 2000, color: 0x4aff8a },
  tap:    { name: 'Duplacsapás', desc: '+25% tűzgyorsaság', cost: 2000, color: 0xffd04a },
  runner: { name: 'Futóláb', desc: '+15% mozgás és végtelen sprint', cost: 1500, color: 0x4ac8ff },
  second: { name: 'Második esély', desc: 'egyszer elesés helyett 50% élettel felállsz', cost: 1500, color: 0xff8aff },
};
const STATION_INFO = {
  forge: 'Fegyverkovács: elem beégetése a kézben lévő fegyverbe.',
  trap:  'Tűzcsapda: 20 mp-ig lángba borítja a kaput, minden átkelő zombi elég.',
  well:  'A víz gyógyít, és felszerelést vehetsz pontokért.',
  tower: 'Automata lövegtorony telepíthető.',
};
const MAPS = {
  farm: {
    name: 'Holloway-farm', desc: 'Nagy tanya csűrrel, silókkal és kukoricással. Hátul, az északi kerítésen három megnyitható rész.', minLevel: 1,
    main: { minX: -54, maxX: 54, minZ: -42, maxZ: 42 }, look: { tex: 'dirt', ground: 0x9a9a88, fog: 0x0a0f18, fogD: [.022, .031], fence: 0xffffff },
    vans: [[-24, 37], [24, 38], [-44, -33], [44, 2]], ammo: [-4, 8], boxSpots: [[4, -6], [-30, 4], [30, -6], [-12, 26], [16, 8], [-40, -8]],
    spawns: [[-51, 14], [-51, -12], [51, -16], [51, 22], [0, 40], [-44, 40], [40, 40], [-17, -40], [17, -40]],
    lamps: [[-14, -4], [14, 4], [-6, 24], [22, -14], [-36, 2], [40, 12], [0, -30], [-30, 30]],
    clear: [[-28, -22, 11], [28, -24, 8], [-46, 14, 6], [6, -14, 2.6], [18, 22, 11], [38, 22, 11]],
    props: [['crate', 4], ['stack', 2], ['hay', 4], ['barrel', 2], ['boom', 1.5], ['car', 1.2], ['logs', 1.5]], propN: [30, 38],
    build() {
      house(-28, -22, 18, 12, 7, barnMat, 0x2b2a2c, 's');
      house(28, -24, 12, 9, 5, matStd({ color: 0xcfc6b0 }), 0x3a2420, 's');
      addBox(28, -18.6, 12, 2.4, .2, matStd({ color: 0x3a2420 }), 2.8, false); // porch roof
      [[22.5, -17.6], [33.5, -17.6]].forEach(([x, z]) => addBox(x, z, .2, .2, 2.8, poleMat));
      const siloM = matStd({ color: 0x8a8e90, metalness: .3, roughness: .6 }), capM = matStd({ color: 0x5a5e60 });
      [[-46, 10, 2.4, 11], [-46, 18, 2, 9]].forEach(([x, z, r, h]) => { cylinderSolid(x, z, r, h, siloM); put(new THREE.Mesh(new THREE.ConeGeometry(r + .2, 2, 16), capM)).position.set(x, h + 1, z); });
      cylinderSolid(6, -14, 1.25, 1, matStd({ color: 0x55544f }));
      // corn: short rows you can walk between, tall enough to hide a crawler
      for (let r = 0; r < 5; r++) for (const x0 of [10, 19, 28, 37]) for (const dx of [1.3, 5.7]) addBox(x0 + dx + (r % 2 ? .8 : -.8), 14 + r * 3.4, 2.4, .7, 2.1, cornMat);
      // windmill
      addBox(-12, -32, .5, .5, 10, poleMat);
      const hub = put(new THREE.Group()); hub.position.set(-12, 10, -31.6);
      for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(unitBox, matStd({ color: 0x8a8378 })); b.scale.set(.35, 3.2, .06); b.position.y = 1.6; const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 3; arm.add(b); hub.add(arm); }
      mapSpin.push(hub);
    },
    areas: {
      north: { side: 'n', at: 0, name: 'Szent kút', cost: 750, core: { minX: -12, maxX: 12, minZ: -66, maxZ: -42 }, spawns: [[-8, -62], [8, -62]], station: ['well', 0, -54] },
      west:  { side: 'n', at: -34, name: 'Kovácsműhely', cost: 1000, core: { minX: -50, maxX: -18, minZ: -68, maxZ: -42 }, spawns: [[-46, -64], [-22, -64]], station: ['forge', -34, -56] },
      east:  { side: 'n', at: 34, name: 'Temető', cost: 1250, core: { minX: 18, maxX: 50, minZ: -68, maxZ: -42 }, spawns: [[46, -64], [22, -64]], station: ['trap', 25, -50], graves: true },
    },
  },
  chapel: {
    name: 'Szent Mihály-kápolna', desc: 'Ködös temető egy romos kápolna körül. Kisebb, de szorosabb.', minLevel: 2,
    main: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, look: { tex: 'grass', ground: 0x7a8a72, fog: 0x0c1014, fogD: [.034, .044], fence: 0x55585e },
    vans: [[12, 25], [-14, 24], [20, -22]], ammo: [-12, 16], boxSpots: [[14, 0], [-15, -4], [18, -20], [-18, 20]],
    spawns: [[-27, 0], [27, 0], [0, 27], [-26, 26], [26, -26], [-26, -26], [26, 26]],
    lamps: [[-8, 4], [8, 4], [-20, -20], [20, 12]],
    clear: [[0, -14, 10], [0, -23, 4]],
    props: [['crate', 2], ['barrel', 2], ['boom', 1.5], ['logs', 1.5], ['stack', 1]], propN: [12, 16],
    build() {
      house(0, -12, 12, 16, 7, matStd({ map: stoneTex }), 0x2a2224, 's');
      addBox(0, -22, 4.5, 4.5, 13, matStd({ map: stoneTex }));
      addBox(0, -22, 8, 4.5, 5, matStd({ map: stoneTex })); // apse: no dead-end corners between house and tower
      put(new THREE.Mesh(new THREE.ConeGeometry(3.4, 4, 4), matStd({ color: 0x2a2224 }))).position.set(0, 15, -22);
      const r = mulberry(7);
      for (let i = 0; i < 70; i++) { const x = (r() * 2 - 1) * 27, z = (r() * 2 - 1) * 27; if (Math.abs(x) < 9 && z < 0) continue; if (Math.hypot(x, z - 14) < 6) continue; grave(x, z); }
    },
    areas: {
      east: { side: 'e', at: 0, name: 'Kripta', cost: 1000, core: { minX: 30, maxX: 52, minZ: -12, maxZ: 12 }, spawns: [[49, -9], [49, 9]], station: ['trap', 33, 7], graves: true },
      west: { side: 'w', at: 0, name: 'Szentelt forrás', cost: 1000, core: { minX: -52, maxX: -30, minZ: -12, maxZ: 12 }, spawns: [[-49, -9], [-49, 9]], station: ['well', -42, 0] },
    },
  },
  gas: {
    name: 'Route 9 benzinkút', desc: 'Kiégett benzinkút az országút mellett, sok autóroncs és robbanó hordó.', minLevel: 3,
    main: { minX: -36, maxX: 36, minZ: -26, maxZ: 26 }, look: { tex: 'asphalt', ground: 0x8a8a90, fog: 0x0b0d12, fogD: [.024, .032], fence: 0x8a8e94 },
    vans: [[24, 18], [-26, 18], [24, -17]], ammo: [-6, 14], boxSpots: [[16, 2], [-22, 6], [10, -18], [-28, -18]],
    spawns: [[-33, 0], [33, 0], [0, -23], [0, 23], [-30, 20], [30, -20], [-30, -20], [20, 23]],
    lamps: [[-10, -4], [22, -4], [-2, 20], [-28, 10]],
    clear: [[-20, -16, 8], [6, -8, 9], [28, -20, 3]],
    props: [['car', 3], ['barrel', 2], ['boom', 2.5], ['crate', 1.5], ['stack', 1]], propN: [16, 22],
    build() {
      house(-20, -16, 12, 8, 4.5, matStd({ color: 0xb8b4a8 }), 0x3a3a3e, 's');
      label(['GAS'], '#ff5a3a', 2.4, -20, 7.2, -11.8);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(6 + a * 6.5, -8 + b * 3.5, .4, .4, 5, matStd({ color: 0x9a9ea4 }));
      addBox(6, -8, 16, 10, .5, matStd({ color: 0xd8d4c8 }), 5, false);
      [2, 10].forEach(x => { addBox(x, -8, .7, .5, 1.5, matStd({ color: 0xa82a22 })); });
      for (let x = -34; x < 34; x += 5) addBox(x, 20.5, 2.6, .18, .02, basic(0xd8b43a), 0, false);
      addBox(28, -20, .3, .3, 5, poleMat); addBox(28, -20, 6, .3, 3, matStd({ color: 0x6a4a3a }), 5, false);
    },
    areas: {
      north: { side: 'n', at: 0, name: 'Szerviz garázs', cost: 1000, core: { minX: -14, maxX: 14, minZ: -48, maxZ: -26 }, spawns: [[-10, -45], [10, -45]], station: ['forge', 0, -38] },
      east:  { side: 'e', at: 0, name: 'Motel', cost: 1250, core: { minX: 36, maxX: 58, minZ: -12, maxZ: 12 }, spawns: [[55, -9], [55, 9]], station: ['tower', 40, 7] },
    },
  },
  mill: {
    name: 'Fűrésztelep', desc: 'Erdei fűrésztelep rönkökkel és fészerekkel, három megnyitható résszel.', minLevel: 5,
    main: { minX: -34, maxX: 34, minZ: -34, maxZ: 34 }, look: { tex: 'dirt', ground: 0xa8946c, fog: 0x0a0e10, fogD: [.026, .036], fence: 0xffffff },
    vans: [[-20, 28], [22, 27], [-24, -16]], ammo: [8, 14], boxSpots: [[16, 4], [-14, -6], [24, -6], [-22, 16]],
    spawns: [[-31, 0], [31, 0], [0, -31], [0, 31], [-31, -31], [31, 31], [31, -31], [-31, 31]],
    lamps: [[-8, 0], [10, -2], [-20, 12], [18, 20]],
    clear: [[0, -14, 10], [-20, -20, 4], [22, 18, 4], [18, -24, 4]],
    props: [['logs', 4], ['stack', 2], ['crate', 2], ['barrel', 1.5], ['boom', 1.5]], propN: [18, 24],
    build() {
      shed(0, -14, 16, 10, 5);
      addBox(0, -14, 6, 1.4, 1, matStd({ color: 0x4a4a4e }));
      const blade = put(new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .06, 24), matStd({ color: 0xb8bcc0, metalness: .8, roughness: .3 })));
      blade.rotation.x = Math.PI / 2; blade.position.set(0, 1.4, -14);
      logPile(-20, -20); logPile(22, 18);
      house(18, -24, 6, 5, 3.4, matStd({ map: plankTex }), 0x3a2a20, 'n');
    },
    areas: {
      south: { side: 's', at: 0, name: 'Tópart', cost: 750, core: { minX: -14, maxX: 14, minZ: 34, maxZ: 56 }, spawns: [[-10, 53], [10, 53]], station: ['well', 0, 45] },
      north: { side: 'n', at: 0, name: 'Erdei tábor', cost: 1250, core: { minX: -14, maxX: 14, minZ: -56, maxZ: -34 }, spawns: [[-10, -53], [10, -53]], station: ['tower', 5, -38] },
      west:  { side: 'w', at: 0, name: 'Hordóraktár', cost: 1000, core: { minX: -56, maxX: -34, minZ: -12, maxZ: 12 }, spawns: [[-53, -9], [-53, 9]], station: ['trap', -37, 7] },
    },
  },
  town: {
    name: 'Dead Acre főutca', desc: 'Elhagyott westernváros: széles főutca, két oldalt boltok, köztük sikátorok, mögöttük udvarok.', minLevel: 4,
    main: { minX: -45, maxX: 45, minZ: -30, maxZ: 30 }, look: { tex: 'dirt', ground: 0xb8a07a, fog: 0x1a130d, fogD: [.018, .026], fence: 0xb09878 },
    vans: [[-30, 5], [30, -5], [-42, -25], [40, 26]], ammo: [0, -4.5], boxSpots: [[8, 2], [-26, -24], [26, -24], [-26, 24], [6, 23]],
    spawns: [[-43, -7], [-43, -14], [-42, 24], [-26, -28], [8, -28], [43, -24], [43, 6], [26, 28], [-25, 28]],
    lamps: [[-26, -7], [-9, 7], [8, -7], [26, 7], [-33, -22], [36, -22]],
    // alleys between the storefronts stay open, and so does the lot under the water tower
    clear: [[0, 16, 6], [-20, 2, 3], [24, 3, 3], ...[-42, -26, -9, 8, 24.5, 41.5].flatMap(x => [-10, -13, -16].map(z => [x, z, 2.5])),
      ...[-41.5, -25, 25.75, 41.75].flatMap(x => [10, 13, 16].map(z => [x, z, 2.5]))],
    props: [['car', 1.5], ['barrel', 2], ['boom', 1.5], ['crate', 2], ['stack', 1.5], ['hay', 1.5]], propN: [22, 30],
    build() {
      const plank = c => matStd({ map: plankTex, color: c });
      storefront(-34, -13, 10, 8, 5.5, plank(0x9a8a70), 'SZATÓCS', 1, 1);
      storefront(-18, -13, 10, 8, 6, matStd({ map: stoneTex, color: 0xb0a898 }), 'BANK', 1, 4, '#e8d070');
      storefront(0, -13, 10, 8, 7, plank(0x8a5a3a), 'SALOON', 1, 7, '#ff9a4a');
      storefront(16, -13, 10, 8, 8, plank(0x6a7a7a), 'HOTEL', 1, 2);
      storefront(33, -13, 10, 8, 5, plank(0xa09a88), 'BORBÉLY', 1, 0);
      storefront(-33, 13, 10, 8, 5.5, plank(0x7a8a9a), 'POSTA', -1, 2);
      storefront(-17, 13, 10, 8, 5, plank(0x8a9a78), 'PATIKA', -1, 5, '#9fe0a0');
      storefront(17, 13, 10, 8, 6, barnMat, 'ISTÁLLÓ', -1, 0);
      waterTower(0, 16);
      // the church at the east end: white boards, a steeple and a cross
      const white = plank(0xd8d4c8);
      house(34, 15, 8, 11, 6.5, white, 0x2a2224, 'n');
      addBox(34, 11.2, 3, 3, 11, white);
      put(new THREE.Mesh(new THREE.ConeGeometry(2.4, 4, 4), roofMat)).position.set(34, 13, 11.2);
      addBox(34, 11.2, .25, .25, 2, basic(0x3a3230), 15, false); addBox(34, 11.2, 1.2, .25, .25, basic(0x3a3230), 16.2, false);
      put(new THREE.Mesh(new THREE.CircleGeometry(.8, 16), basic(0xffc070))).position.set(34, 8.5, 9.68);
      wagon(-20, 2, false); wagon(24, 3, false);
      // hitching rails and a trough along the boardwalks
      const rail = matStd({ map: woodTex, color: 0x6a5038 });
      [[-26, -5.2], [8, 5.2]].forEach(([x, z]) => { addBox(x, z, 3.4, .15, .12, rail, 1, false); [-1.6, 1.6].forEach(d => addBox(x + d, z, .15, .15, 1.1, rail)); });
      addBox(-9, 5.6, 2.6, .8, .6, rail);
      // in the areas: the bank's vault, the sheriff's jail
      addBox(-63, 0, 4, 10, 4.5, matStd({ map: stoneTex, color: 0x9a948a }));
      const vd = put(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, .3, 20), matStd({ color: 0x8a8e94, metalness: .7, roughness: .35 }))); vd.rotation.z = Math.PI / 2; vd.position.set(-60.9, 2, 0);
      house(55, -8, 8, 5, 4, plank(0x8a7a60), 0x2b2a2c, 'n');
      label(['SERIFF'], '#e8c890', 2, 55, 5.6, -5);
    },
    areas: {
      bank:     { side: 'w', at: 0, name: 'Bankszéf', cost: 1000, core: { minX: -67, maxX: -45, minZ: -12, maxZ: 12 }, spawns: [[-64, -9], [-64, 9]], station: ['forge', -56, -6] },
      sheriff:  { side: 'e', at: 0, name: 'Seriffiroda', cost: 1250, core: { minX: 45, maxX: 67, minZ: -12, maxZ: 12 }, spawns: [[64, -9], [64, 9]], station: ['tower', 49, 7] },
      cemetery: { side: 's', at: 0, name: 'Csizmadomb', cost: 750, core: { minX: -12, maxX: 12, minZ: 30, maxZ: 52 }, spawns: [[-9, 49], [9, 49]], station: ['trap', 6, 34], graves: true },
    },
  },
  quarry: {
    name: 'Kőbánya', desc: 'Nyitott kőfejtő: sziklafal körben, nagy üres gödör, messzire látni. A peremről jönnek.', minLevel: 7,
    main: { minX: -42, maxX: 42, minZ: -38, maxZ: 38 }, look: { tex: 'asphalt', ground: 0xa89c88, fog: 0x11151b, fogD: [.014, .02], fence: 0x9a9488 },
    vans: [[-30, -22], [30, -24], [-34, 27], [31, 28]], ammo: [4, 10], boxSpots: [[12, -6], [-16, 6], [28, -4], [-6, 22], [-28, -8], [2, -24]],
    spawns: [[-36, -34], [0, -35], [36, -34], [-39, -9], [-39, 13], [39, -11], [39, 22], [-22, 35], [22, 35]],
    lamps: [[-20, 20], [22, 20]],
    clear: [[-26, 16, 5], [28, 16, 4], [8, 20, 5], [24, -14, 3], [-4, 4, 6], [-12, -21, 3], [-9, -16, 3], [14, 4, 4], [-18, -6, 4]],
    props: [['boom', 2.5], ['barrel', 2], ['crate', 1.5], ['stack', 1], ['logs', .5], ['car', .6]], propN: [14, 20],
    build() {
      const rng = mulberry(91), M = this.main, cliff = matStd({ color: 0x77716a, flatShading: true });
      // the rim: boulders along the fence, with openings for the gates, the van lanes and the spawn ramps
      const k = M.maxZ / 38, open = { w: [0, -22, 27, -9, 13], e: [12, -24, 28, -11, 22], s: [0, -22, 22] }; // openings follow the map's scale
      for (const sd in open) open[sd] = open[sd].map(v => v * k);
      const edge = (side, from, to, at) => {
        for (let t = from; t <= to; t += 3.5 + rng() * 1.5) {
          if (open[side].some((o, i) => Math.abs(t - o) < (i ? 5.5 : 6.5) * k)) continue;
          const r = 3 + rng() * 1.3, off = 1.2 + rng();
          if (side === 'w') rock(M.minX - off, t, r, r * (.8 + rng() * .5), rng);
          if (side === 'e') rock(M.maxX + off, t, r, r * (.8 + rng() * .5), rng);
          if (side === 's') rock(t, M.maxZ + off, r, r * (.8 + rng() * .5), rng);
        }
      };
      edge('w', -32 * k, 36 * k); edge('e', -32 * k, 36 * k); edge('s', -36 * k, 36 * k);
      // the north face: two stepped cliffs with a ramp between them
      [-1, 1].forEach(s => {
        addBox(s * 15, -34.5, 22, 7, 8, cliff); addBox(s * 15, -29.5, 22, 3, 3.5, cliff);
        for (let k = 0; k < 4; k++) rock(s * (6 + k * 5.5), -35 + rng() * 2, 2.5 + rng() * 2, 2 + rng() * 2, rng, false, 7);
        rock(s * 5, -36.5, 1.6, 2.5, rng);
      });
      // the pit wall beyond the fence
      for (let i = 0; i < 68; i++) {
        const a = i / 34 * Math.PI * 2, r = (i < 34 ? 12 : 30) + rng() * 6, x = Math.sin(a) * (M.maxX + r), z = -Math.cos(a) * (M.maxZ + r);
        if (Object.values(this.areas).some(A => x > A.core.minX - 6 && x < A.core.maxX + 6 && z > A.core.minZ - 6 && z < A.core.maxZ + 6)) continue;
        rock(x, z, 7 + rng() * 5, 8 + rng() * 8, rng, false);
      }
      // conveyor from the hopper up onto the cliff
      const belt = put(new THREE.Mesh(unitBox, matStd({ color: 0x2a2a2c }))), a = [-8, 1.3, -13], b = [-16, 8.4, -31];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
      belt.scale.set(1.3, .3, L); belt.rotation.order = 'YXZ'; belt.rotation.set(-Math.asin(dy / L), Math.atan2(dx, dz), 0);
      belt.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); belt.castShadow = true; rayBlockers.push(belt);
      for (const t of [.25, .5, .75]) addBox(a[0] + dx * t, a[2] + dz * t, .3, .3, a[1] + dy * t, matStd({ color: 0x8a6a1a }));
      addBox(-8, -12, 2.4, 2.4, 1.6, matStd({ color: 0x6a5a3a, metalness: .4, roughness: .6 }));
      // tower crane
      const yellow = matStd({ color: 0xc8a020, roughness: .7 });
      addBox(24, -14, 3, 3, .8, matStd({ color: 0x6a6a66 })); addBox(24, -14, 1, 1, 18, yellow);
      addBox(28, -14, 24, .8, .9, yellow, 17.6, false); addBox(19, -14, 2.4, 1.6, 1.6, matStd({ color: 0x4a4a4e }), 16.8, false);
      addBox(25.5, -14, 1.6, 1.4, 1.4, yellow, 16.6, false);
      addBox(35, -14, .06, .06, 11, basic(0x222222), 6.6, false); addBox(35, -14, 2.2, 1.4, 1.2, rockMats[0], 5.4, false);
      put(new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), basic(0xff3020))).position.set(40, 18.3, -14);
      // site cabins (two stacked) and a haul truck
      const cabin = (x, z, y, col, lit) => {
        addBox(x, z, 8, 3, 2.8, matStd({ color: col }), y, !y);
        addBox(x - 1.8, z + 1.52, 2.4, .05, .9, lit ? glassLit : glassDark, y + 1.3, false);
        addBox(x + 2.2, z + 1.52, 1, .05, 2.1, doorMat, y, false);
      };
      cabin(-26, 16, 0, 0x3a5a7a, true); cabin(-26, 16, 2.8, 0xb8a040, false); cabin(28, 16, 0, 0x8a3a2a, true);
      addBox(-26, 16, 8.3, 3.3, .15, roofMat, 5.6, false);
      addBox(8, 20, 7.4, 3.4, 1.2, matStd({ color: 0x2a2a2a }), .9);
      addBox(9.3, 20, 4.8, 3.6, 1.8, yellow, 2.1, false); addBox(5.2, 20, 1.8, 2.8, 1.8, yellow, 2.1, false);
      addBox(4.3, 20, .06, 2.2, .9, glassDark, 2.8, false);
      for (const [wx, wz] of [[5.6, 18.2], [5.6, 21.8], [10.6, 18.2], [10.6, 21.8]]) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .8, 14), tireMat)); w.rotation.x = Math.PI / 2; w.position.set(wx, 1, wz); }
      // rock piles and gravel mounds in the pit; a slurry puddle in the middle
      for (const [cx, cz, n] of [[14, 4, 3], [-18, -6, 4], [-30, 34, 2]]) for (let k = 0; k < n; k++) rock(cx + (rng() - .5) * 3, cz + (rng() - .5) * 3, 1.2 + rng(), 1 + rng(), rng);
      const gravel = matStd({ color: 0x8a8274, flatShading: true });
      for (const [x, z, r] of [[-30, -28, 3.5], [16, 30, 3]]) { const m = put(new THREE.Mesh(new THREE.ConeGeometry(r, r * .7, 9), gravel)); m.position.set(x, r * .35, z); m.receiveShadow = true; rayBlockers.push(m); obstacles.push({ minX: x - r * .6, maxX: x + r * .6, minZ: z - r * .6, maxZ: z + r * .6, h: r * .5 }); }
      const pond = put(new THREE.Mesh(new THREE.CircleGeometry(5, 24), matStd({ color: 0x1a242a, roughness: .12, metalness: .5 })));
      pond.rotation.x = -Math.PI / 2; pond.scale.set(1.3, 1, 1); pond.position.set(-4, .03, 4);
      [[-20, -24], [20, -26], [-30, 6], [30, 4], [0, 28]].forEach(([x, z]) => floodlight(x, z));
      // in the areas: the machine shop shed and the control tower's hut
      shed(-55, 6, 8, 6, 4); addBox(-55, 6, 3, 1.4, 1.1, matStd({ color: 0x3a3c40, metalness: .5 }));
      addBox(50, 3, 5, 3, 3, matStd({ color: 0x5a5e62 })); label(['KŐBÁNYA KFT.'], '#d8d0b8', 2, 50, 4.4, 4.7);
    },
    areas: {
      west:  { side: 'w', at: 0, name: 'Gépműhely', cost: 1000, core: { minX: -64, maxX: -42, minZ: -12, maxZ: 12 }, spawns: [[-61, -9], [-61, 9]], station: ['forge', -54, -4] },
      east:  { side: 'e', at: 12, name: 'Irányítótorony', cost: 1250, core: { minX: 42, maxX: 64, minZ: 0, maxZ: 24 }, spawns: [[61, 3], [61, 21]], station: ['tower', 46, 19] },
      south: { side: 's', at: 0, name: 'Zagytó', cost: 750, core: { minX: -12, maxX: 12, minZ: 38, maxZ: 60 }, spawns: [[-9, 57], [9, 57]], station: ['well', 0, 48] },
    },
  },
  fair: {
    name: 'Vásártér', desc: 'Elhagyott vándorvásár: óriáskerék, körhinta, sátrak és bódék. Színes fények a ködben.', minLevel: 9,
    main: { minX: -44, maxX: 44, minZ: -34, maxZ: 34 }, look: { tex: 'grass', ground: 0x76805f, fog: 0x140d18, fogD: [.02, .028], fence: 0xc8b8a0 },
    vans: [[-34, 26], [34, 26], [-36, -26], [36, -24]], ammo: [8, 14], boxSpots: [[-10, 2], [14, -4], [-30, -14], [30, 22], [2, 20], [-16, 24]],
    spawns: [[-41, -20], [-41, 12], [41, -8], [41, 18], [0, -31], [-26, -31], [26, -31], [-14, 31], [14, 31]],
    lamps: [[-8, -6], [10, 6], [-28, 20], [28, -2], [0, 26], [-20, -24]],
    clear: [[0, -18, 7], [-22, 6, 7], [24, 12, 8], [30, -14, 6], [0, 30, 5], [-18, 22, 4], [-26, 22, 4], [18, 22, 4], [26, 22, 4], [-10, 22, 4], [10, 22, 4]],
    props: [['crate', 2], ['hay', 2], ['barrel', 2], ['stack', 1], ['boom', 1]], propN: [18, 24],
    build() {
      const steel = matStd({ color: 0xd8d4cc, metalness: .6, roughness: .4 }), wood = matStd({ map: woodTex, color: 0x9a6a4a });
      const colors = [0xff3a5a, 0xffd23f, 0x3ad8ff, 0x7dff7a, 0xff8a3a, 0xc05aff];
      // the Ferris wheel: it keeps turning, lights on
      addBox(0, -18, 11, 4, .4, matStd({ color: 0x5a4a3a }));
      for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) { const leg = put(new THREE.Mesh(unitBox, steel)); leg.scale.set(.35, 13.3, .35); leg.position.set(sx * 2.4, 6.4, -18 + sz); leg.rotation.z = sx * .36; leg.castShadow = true; }
      const wheel = put(new THREE.Group()); wheel.position.set(0, 12.5, -18);
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, rim = new THREE.Mesh(unitBox, steel); rim.scale.set(.25, 3.6, .25); rim.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0); rim.rotation.z = a; wheel.add(rim);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), basic(colors[k % colors.length])); bulb.position.set(Math.cos(a) * 9.3, Math.sin(a) * 9.3, .2); wheel.add(bulb);
      }
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, sp = new THREE.Mesh(unitBox, steel); sp.scale.set(.15, 9, .15); sp.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
        const car = new THREE.Mesh(unitBox, matStd({ color: colors[k % colors.length] })); car.scale.set(1.4, 1.1, 1.6); car.position.set(Math.cos(a) * 9, Math.sin(a) * 9 - 1, 0); car.castShadow = true; wheel.add(car);
      }
      const hubM = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 1.2, 16), steel); hubM.rotation.x = Math.PI / 2; wheel.add(hubM);
      mapSpin.push(wheel); pointLight(0x3ad8ff, 1.6, 26, 0, 8, -14);
      // the carousel
      cylinderSolid(-22, 6, 5, .5, wood);
      addBox(-22, 6, .4, .4, 4.6, steel, .5, false);
      const roof = put(new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.4, 16), matStd({ color: 0xc8283a }))); roof.position.set(-22, 6.3, 6); roof.castShadow = true;
      put(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 16), matStd({ color: 0xf2e8d8 }))).position.set(-22, 7.9, 6);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, x = -22 + Math.cos(a) * 3.6, z = 6 + Math.sin(a) * 3.6; addBox(x, z, .08, .08, 4.2, steel, .5, false); const h = addBox(x, z, .35, 1.1, .6, matStd({ color: k % 2 ? 0xf2e8d8 : 0x6a3a2a }), 1.2, false); h.rotation.y = -a; }
      pointLight(0xff4a8a, 1.4, 16, -22, 3.5, 6);
      // two big tents
      cylinderSolid(24, 12, 6, 3, matStd({ color: 0xe8dcc8 }));
      put(new THREE.Mesh(new THREE.ConeGeometry(6.6, 4, 16), matStd({ color: 0xb8283a }))).position.set(24, 5, 12);
      addBox(24, 12, .15, .15, 3, steel, 7, false);
      cylinderSolid(30, -14, 4.2, 2.6, matStd({ color: 0xe0c85a }));
      put(new THREE.Mesh(new THREE.ConeGeometry(4.7, 3.2, 16), matStd({ color: 0x3a5ab8 }))).position.set(30, 4.2, -14);
      label(['CIRKUSZ'], '#ffd23f', 2.4, 24, 9.8, 12);
      // a row of stalls with striped awnings
      [-26, -18, -10, 10, 18, 26].forEach((x, i) => {
        addBox(x, 22, 5, 2.2, 1.1, wood); addBox(x, 20.7, 5, .3, 2.7, wood);
        addBox(x, 21.8, 5.6, 3, .15, matStd({ color: colors[i % colors.length] }), 2.75, false);
        [-2.6, 2.6].forEach(dx => addBox(x + dx, 23.1, .12, .12, 2.75, poleMat, 0, false));
      });
      label(['CÉLLÖVÖLDE'], '#ff8a3a', 1.6, -18, 3.8, 22.3); label(['VATTACUKOR'], '#ff9ad8', 1.4, 10, 3.8, 22.3);
      // the gate arch
      [-4.5, 4.5].forEach(dx => addBox(dx, 31, .45, .45, 6, matStd({ color: 0xc8283a })));
      addBox(0, 31, 9.6, .5, 1.3, matStd({ color: 0xf2e8d8 }), 5.4, false);
      label(['VÁSÁR'], '#ffd23f', 3, 0, 7.6, 31);
    },
    areas: {
      north: { side: 'n', at: 22, name: 'Szellemvasút', cost: 1250, core: { minX: 10, maxX: 34, minZ: -56, maxZ: -34 }, spawns: [[14, -53], [30, -53]], station: ['trap', 22, -42], graves: true },
      west:  { side: 'w', at: 0, name: 'Lövöldebódé', cost: 1000, core: { minX: -66, maxX: -44, minZ: -12, maxZ: 12 }, spawns: [[-63, -9], [-63, 9]], station: ['forge', -54, -4] },
      east:  { side: 'e', at: 4, name: 'Elsősegély-sátor', cost: 750, core: { minX: 44, maxX: 66, minZ: -8, maxZ: 16 }, spawns: [[63, -5], [63, 13]], station: ['well', 54, 4] },
    },
  },
  hospital: {
    name: 'Szent Lukács Kórház', desc: 'Kiürített megyei kórház: U alakú főépület, lezuhant mentőhelikopter a leszállón, mentőautók az udvaron.', minLevel: 13,
    main: { minX: -46, maxX: 46, minZ: -36, maxZ: 36 }, look: { tex: 'asphalt', ground: 0x8a8e88, fog: 0x0a1012, fogD: [.022, .03], fence: 0xb8bcc0 },
    vans: [[-36, 26], [36, 26], [-38, -30], [38, -4]], ammo: [6, 6], boxSpots: [[-8, 2], [10, -4], [-32, -14], [32, -20], [0, 28], [-18, 22]],
    spawns: [[-43, -30], [43, -30], [-43, 10], [43, 4], [0, 33], [-20, 33], [20, 33], [-43, 0], [43, 20]],
    lamps: [[-10, 6], [10, 6], [-28, 14], [28, 20], [0, -8], [-36, -20], [36, -26]],
    clear: [[0, -20, 19], [-22, -6, 10], [22, -6, 10], [0, 18, 8], [-30, 20, 4], [32, 14, 4], [-12, 8, 3], [12, 10, 3]],
    props: [['crate', 1.5], ['barrel', 1.5], ['stack', 1], ['car', 1.5], ['boom', 1.5]], propN: [16, 22],
    build() {
      const white = matStd({ color: 0xd8dcd8 }), red = basic(0xd8282a), dark = matStd({ color: 0x2a2c2e }), steel = matStd({ color: 0xa8acb0, metalness: .5, roughness: .5 });
      // the U: main block and two wings around a courtyard
      house(0, -20, 36, 10, 9, white, 0x3a3a3e, 's');
      house(-22, -6, 8, 18, 7, white, 0x3a3a3e, 'e');
      house(22, -6, 8, 18, 7, white, 0x3a3a3e, 'w');
      for (let x = -15; x <= 15; x += 5) addBox(x, -14.94, 2.2, .06, 1.4, matStd({ color: 0x223a4a, emissive: 0x0a1a24 }), 5.4, false); // windows
      addBox(0, -14.9, 3.4, .1, .9, red, 7.2, false); addBox(0, -14.9, .9, .1, 3.4, red, 5.95, false); // the red cross
      label(['SZENT LUKÁCS KÓRHÁZ'], '#e8e2d0', 2.6, 0, 10.6, -14.6);
      addBox(0, -13.4, 8, 3, .3, dark, 3.4, false); [-3.6, 3.6].forEach(x => addBox(x, -12.2, .25, .25, 3.4, steel, 0, false)); // entrance canopy
      // helipad with a crashed ambulance helicopter
      const pad = put(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, .06, 32), matStd({ color: 0x3a3c3e }))); pad.position.set(0, .03, 18); pad.receiveShadow = true;
      addBox(-1.4, 18, .6, 4, .02, basic(0xe8e2d0), .07, false); addBox(1.4, 18, .6, 4, .02, basic(0xe8e2d0), .07, false); addBox(0, 18, 2.2, .6, .02, basic(0xe8e2d0), .07, false);
      const heli = put(new THREE.Group()); heli.position.set(3, 0, 20); heli.rotation.set(0, .7, .28);
      const hb = (w, h, d, m, x, y, z, rx = 0, rz = 0) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(w, h, d); e.position.set(x, y, z); e.rotation.set(rx, 0, rz); e.castShadow = true; heli.add(e); };
      hb(2.4, 2.2, 5, white, 0, 1.3, 0); hb(2.42, .4, 5.02, red, 0, 1.1, 0); hb(.6, .6, 5, white, 0, 1.8, -4.6); hb(.2, 1.6, 1, white, 0, 2.6, -7);
      hb(9, .1, .4, dark, 0, 2.7, 0, 0, .2); hb(.4, .1, 8, dark, .4, 2.6, .5, .15, 0);
      obstacles.push({ minX: .5, maxX: 5.5, minZ: 16.5, maxZ: 23.5, h: 3 });
      glowSprite(0xff7a2a, 3.2, new V3(3.5, 2.5, 21)); pointLight(0xff6a1a, 1.8, 14, 3.5, 2.5, 21);
      // ambulances with a light bar
      for (const [x, z, ry] of [[-30, 20, .3], [32, 14, -.5]]) {
        const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = ry;
        const ab = (w, h, d, m, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(w, h, d); e.position.set(px, py, pz); e.castShadow = true; g.add(e); };
        ab(2.2, 2.2, 5, white, 0, 1.4, 0); ab(2.22, .35, 5.02, red, 0, 1.2, 0); ab(2, 1.2, 1.6, white, 0, .9, 3.2); ab(.5, .18, .3, basic(0x3a6aff), -.4, 2.6, 1.8); ab(.5, .18, .3, basic(0xff2a2a), .4, 2.6, 1.8);
        for (const [a, b] of [[-1, -1.6], [1, -1.6], [-1, 3.2], [1, 3.2]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .3, 12), dark); t.rotation.z = Math.PI / 2; t.position.set(a * 1.1, .45, b); g.add(t); }
        obstacles.push({ minX: x - 3, maxX: x + 3, minZ: z - 3.4, maxZ: z + 3.4, h: 2.4 });
      }
      // gurneys pushed into the courtyard
      for (const [x, z, r] of [[-12, 8, .4], [12, 10, -.7], [-6, -4, 1.2], [8, 2, .2]]) {
        const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = r;
        const top = new THREE.Mesh(unitBox, white); top.scale.set(.8, .12, 2); top.position.y = .9; g.add(top);
        for (const [a, b] of [[-.35, -.9], [.35, -.9], [-.35, .9], [.35, .9]]) { const l = new THREE.Mesh(unitBox, steel); l.scale.set(.05, .9, .05); l.position.set(a, .45, b); g.add(l); }
        obstacles.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, h: 1 });
      }
    },
    areas: {
      north: { side: 'n', at: 28, name: 'Hullaház', cost: 1250, core: { minX: 16, maxX: 40, minZ: -58, maxZ: -36 }, spawns: [[20, -55], [36, -55]], station: ['trap', 28, -44], graves: false },
      west:  { side: 'w', at: 12, name: 'Gyógyszertár', cost: 750, core: { minX: -68, maxX: -46, minZ: 0, maxZ: 24 }, spawns: [[-65, 3], [-65, 21]], station: ['well', -56, 12] },
      east:  { side: 'e', at: -10, name: 'Ügyelet', cost: 1000, core: { minX: 46, maxX: 68, minZ: -22, maxZ: 2 }, spawns: [[65, -19], [65, -1]], station: ['forge', 56, -12] },
    },
  },
  range: {
    name: 'Lőtér · Elhagyatott ház', desc: 'Egy elhagyott ház a kertjével, körben erdő. Lőállás öt sávval és egy vezérlőasztal.', minLevel: 1, range: true,
    main: { minX: -34, maxX: 34, minZ: -28, maxZ: 28 }, look: { tex: 'grass', ground: 0x7d8c5c, fog: 0x0c1410, fogD: [.012, .016], fence: 0x8a7a60 },
    vans: [[-20, 23], [20, 24]], ammo: [0, 0], boxSpots: [[0, 0]], spawns: [[-31, -25], [31, -25]],
    lamps: [[-18, 24], [18, 24], [-18, -8], [18, -8]],
    clear: [[0, 12, 17], [0, -12, 17], [0, -28, 12], [-32, -20, 8], [-34, 4, 5]],
    props: [['crate', 1], ['barrel', 1], ['logs', 2], ['hay', 1]], propN: [6, 9],
    build() {
      const wall = matStd({ color: 0x9a8f7a }), dark = matStd({ color: 0x1a1c1e }), plank = matStd({ color: 0x6a5238 }), green = matStd({ color: 0x3f6a2e }), soil = matStd({ color: 0x3a2a1c }), pk = matStd({ color: 0xb8b0a0 });
      // the firing line, the control desk behind it, five lanes with a distance board over each target
      addBox(0, RANGE_LINE, 36, .18, .02, basic(0xe8e2d0), .005, false);
      const [dx, dz] = RANGE_DESK; addBox(dx, dz, 3.2, 1, .12, plank, .92); [[-1.4, -.4], [1.4, -.4], [-1.4, .4], [1.4, .4]].forEach(([a, b]) => addBox(dx + a, dz + b, .12, .12, .92, plank, 0, false));
      addBox(dx, dz + .3, 2.6, .12, .5, dark, 1.04, false).rotation.x = -.5;
      [[-.9, 0xff4a3a], [-.45, 0xffd23f], [0, 0x7dff7a], [.45, 0x6fb4ff], [.9, 0xb48cff]].forEach(([a, c]) => addBox(dx + a, dz + .15, .22, .12, .06, basic(c), 1.2, false));
      label(['VEZÉRLŐ · E'], '#ffd23f', .45, dx, 1.9, dz);
      for (const [x, d] of RANGE_LANES) {
        const z = RANGE_LINE - d;
        addBox(x, (z + RANGE_LINE) / 2, .06, d, .015, basic(0x5a5a50), .004, false);
        [-1.3, 1.3].forEach(o => addBox(x + o, z - .6, .15, .15, 3.6, plank, 0, false));
        addBox(x, z - .6, 2.9, .12, .9, plank, 3.2, false);
        label([`${d} m`], '#ffd23f', 1.3, x, 3.65, z - .5);
      }
      // the house to the west: boarded windows, a sagging porch
      house(-32, -20, 12, 10, 6, wall, 0x3a2a24, 'e');
      for (const z of [-23, -17]) { addBox(-25.94, z, .06, 2, 1.4, dark, 2.4, false); addBox(-25.9, z, .08, 2.3, .25, plank, 3, false).rotation.x = .12; }
      addBox(-24.6, -20, 3, 12, .2, plank, 3, false); [[-23.2, -25.5], [-23.2, -14.5]].forEach(([x, z]) => addBox(x, z, .2, .2, 3, plank));
      addBox(-23.2, -20, .2, .2, 2.4, plank).rotation.x = .25;
      house(-34, 6, 6, 7, 3.6, plank, 0x2a2420, 'e');
      // the garden to the east: beds, a scarecrow, a swing, a table, a picket fence
      for (let i = 0; i < 3; i++) { addBox(24 + i * 4, -8, 3, 1.4, .3, soil); for (let k = 0; k < 4; k++) { const b = put(new THREE.Mesh(new THREE.SphereGeometry(.35 + (k % 2) * .12, 7, 5), green)); b.position.set(22.9 + i * 4 + k * .7, .45, -8 + (k % 2 ? .3 : -.3)); } }
      const sc = put(new THREE.Group()); sc.position.set(30, 0, -2); [[.12, 2.2, .12, 0, 1.1, 0], [1.6, .12, .12, 0, 1.7, 0], [.6, .7, .4, 0, 1.55, 0], [.4, .4, .4, 0, 2.2, 0]].forEach(([w, h, d, x, y, z], i) => { const m = new THREE.Mesh(unitBox, i === 2 ? matStd({ color: 0x7a3a2a }) : i === 3 ? matStd({ color: 0xc8a860 }) : plank); m.scale.set(w, h, d); m.position.set(x, y, z); sc.add(m); });
      obstacles.push({ minX: 29.6, maxX: 30.4, minZ: -2.4, maxZ: -1.6, h: 2.4 });
      [-2, 2].forEach(o => addBox(30 + o, 10, .2, .2, 3, plank)); addBox(30, 10, 4.4, .2, .2, plank, 3); addBox(30, 10, 1, .5, .08, plank, .8, false);
      addBox(24, 4, 2, 1.2, .1, plank, .9); [[-.8, -.4], [.8, -.4], [-.8, .4], [.8, .4]].forEach(([a, b]) => addBox(24 + a, 4 + b, .1, .1, .9, plank, 0, false));
      for (let z = -14; z <= 14; z += 1.2) addBox(20, z, .08, .12, 1, pk, 0, false);
      for (const y of [.35, .75]) addBox(20.05, 0, .05, 28, .08, pk, y, false);
      // woods: pines round the edges
      for (let i = 0; i < 70; i++) { const x = -43 + mulberry(mapSeed + i * 13)() * 86, z = -35 + mulberry(mapSeed + i * 29 + 5)() * 70;
        if (Math.abs(x) < 38 && Math.abs(z) < 30) continue; if (inVanLane(x, z, 3)) continue; pine(x, z); }
    },
    areas: {},
  },
};
const RANGE_LINE = 24, RANGE_DESK = [0, 26.6], RANGE_LANES = [[-12, 10], [-6, 20], [0, 30], [6, 40], [12, 55]]; // the testing ground: firing line z, desk, [lane x, distance]
const MAP_IDS = Object.keys(MAPS).filter(k => !MAPS[k].range); // the testing ground is not a job map

// ---------- bounds & routing ----------
const SIDE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const inRect = (R, x, z, r = 0) => x >= R.minX + r && x <= R.maxX - r && z >= R.minZ + r && z <= R.maxZ - r;
function allowedRects() { const a = [MAIN_RECT]; for (const k in AREAS) if (AREAS[k].unlocked) a.push(AREAS[k].rect); return a; }
function inBounds(x, z, r) { return allowedRects().some(R => inRect(R, x, z, r)); }
function clampBounds(p, r) {
  let bx = p.x, bz = p.z, bd = Infinity;
  for (const R of allowedRects()) {
    const x = clamp(p.x, R.minX + r, R.maxX - r), z = clamp(p.z, R.minZ + r, R.maxZ - r), d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d === 0) return;
    if (d < bd) { bd = d; bx = x; bz = z; }
  }
  p.x = bx; p.z = bz;
}
function regionOf(p) {
  if (inRect(MAIN_RECT, p.x, p.z)) return 'main';
  for (const k in AREAS) if (inRect(AREAS[k].core, p.x, p.z)) return k;
  return 'main';
}
// where a zombie should head to reach the player across a fence: a point just past the gate
function routeTarget(zp) {
  const zr = regionOf(zp), pr = regionOf(player.pos);
  if (zr === pr) return null;
  const a = AREAS[zr !== 'main' ? zr : pr];
  return a.gate.clone().addScaledVector(a.out, zr === 'main' ? 3 : -3);
}
function activeSpawns() {
  const s = SPAWNS.slice();
  for (const k in AREAS) if (AREAS[k].unlocked) s.push(...AREAS[k].spawns);
  return s;
}

// ---------- loading ----------
const MAP_SCALE = 1.3;
function bigMap(B) {
  const s = MAP_SCALE, sc = ([x, z]) => [x * s, z * s], m = B.main, main = { minX: m.minX * s, maxX: m.maxX * s, minZ: m.minZ * s, maxZ: m.maxZ * s }, areas = {};
  for (const k in B.areas) { // each unlockable area slides out with its fence
    const d = B.areas[k], [ox, oz] = SIDE[d.side];
    const dx = ox > 0 ? main.maxX - m.maxX : ox < 0 ? main.minX - m.minX : 0, dz = oz > 0 ? main.maxZ - m.maxZ : oz < 0 ? main.minZ - m.minZ : 0, mv = ([x, z]) => [x + dx, z + dz];
    areas[k] = Object.assign({}, d, { core: { minX: d.core.minX + dx, maxX: d.core.maxX + dx, minZ: d.core.minZ + dz, maxZ: d.core.maxZ + dz }, spawns: d.spawns.map(mv), station: [d.station[0], ...mv(d.station.slice(1))] });
  }
  const ring = [[main.minX + 7, main.minZ + 7], [main.maxX - 7, main.minZ + 7], [main.minX + 7, main.maxZ - 7], [main.maxX - 7, main.maxZ - 7]];
  return Object.assign(Object.create(B), { main, areas, spawns: B.spawns.map(sc), vans: B.vans.map(sc), lamps: [...B.lamps, ...ring], propN: B.propN.map(n => Math.round(n * s * s)) });
}
function loadMap(id, seed) {
  MAP_ID = id; MAP = bigMap(MAPS[id]); mapSeed = seed;
  scene.remove(mapGroup); disposeTree(mapGroup); mapGroup = new THREE.Group(); scene.add(mapGroup);
  LIGHT_POOL.forEach(l => l.intensity = 0); lightNext = 0;
  obstacles.length = 0; rayBlockers.length = 0; rayBlockers.push(ground);
  graveSpots.length = 0; lamps.length = 0; props.length = 0; trapState.length = 0; mapSpin.length = 0; mapLabels.length = 0;
  turrets.forEach(t => scene.remove(t.g)); turrets.length = 0;
  MAIN_RECT = MAP.main; SPAWNS = MAP.spawns; BOX_SPOTS = MAP.boxSpots;
  // look
  const L = MAP.look;
  ground.material.map = L.tex === 'asphalt' ? asphaltTex : L.tex === 'grass' ? grassTex : groundTex; ground.material.color.setHex(L.ground); ground.material.needsUpdate = true;
  fenceMat.color.setHex(L.fence);
  // areas
  AREAS = {};
  for (const k in MAP.areas) {
    const d = MAP.areas[k], c = d.core, [ox, oz] = SIDE[d.side], M = MAIN_RECT;
    const gate = d.side === 'n' ? new V3(d.at, 0, M.minZ) : d.side === 's' ? new V3(d.at, 0, M.maxZ) : d.side === 'e' ? new V3(M.maxX, 0, d.at) : new V3(M.minX, 0, d.at);
    const rect = Object.assign({}, c); // overlap 2 m into the yard so the gate gap is walkable
    if (d.side === 'n') rect.maxZ += 2; if (d.side === 's') rect.minZ -= 2; if (d.side === 'e') rect.minX -= 2; if (d.side === 'w') rect.maxX += 2;
    AREAS[k] = Object.assign({}, d, { core: c, rect, gate, out: new V3(ox, 0, oz), unlocked: false, desc: STATION_INFO[d.station[0]] });
  }
  MAP.build();
  resolveVanLanes(); buildFences(); buildVanGates(); // lanes are checked against what the map built, then the fence gets its gaps
  MAP.lamps.filter(([x, z]) => !inVanLane(x, z, 1.5)).forEach(([x, z]) => lamp(x, z));
  SPAWNS.forEach(([x, z]) => { const m = put(new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, .12, 10), new THREE.MeshLambertMaterial({ color: 0x2a2116 }))); m.position.set(x, .06, z); });
  for (const k in AREAS) buildArea(AREAS[k]);
  buildBoxAndAmmo(); buildTruck();
  // dead trees beyond the fences
  const ext = allRectsBound();
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(8, 30);
    const x = clamp(Math.cos(a), -1, 1) * (Math.max(Math.abs(ext.minX), ext.maxX) + r), z = Math.sin(a) * (Math.max(Math.abs(ext.minZ), ext.maxZ) + r);
    if (Object.values(AREAS).some(A => inRect({ minX: A.core.minX - 4, maxX: A.core.maxX + 4, minZ: A.core.minZ - 4, maxZ: A.core.maxZ + 4 }, x, z)) || inVanLane(x, z, 3)) continue;
    id === 'mill' || id === 'range' ? pine(x, z) : deadTree(x, z);
  }
  generateProps(seed);
  baseFog = lerp(L.fogD[0], L.fogD[1], mulberry(seed + 1)());
  lamps.forEach((l, i) => { l.flicker = mulberry(seed + 7 + i)() < .35; });
  clearMod(); mergeStatic();
}
function allRectsBound() {
  const all = [MAIN_RECT, ...Object.values(AREAS).map(a => a.core)];
  return { minX: Math.min(...all.map(r => r.minX)), maxX: Math.max(...all.map(r => r.maxX)), minZ: Math.min(...all.map(r => r.minZ)), maxZ: Math.max(...all.map(r => r.maxZ)) };
}
function buildFences() {
  const R = MAIN_RECT, H = 2.3, T = .3, e = .2;
  const vanSide = x => vanDir(x) < 0 ? 'w' : 'e';
  const gaps = s => [...Object.values(AREAS).filter(a => a.side === s).map(a => [a.at, GATE_HALF]), ...MAP.vans.filter(([x]) => vanSide(x) === s).map(([, z]) => [z, VAN_HALF])].sort((a, b) => a[0] - b[0]);
  const run = (from, to, gapList, place) => {
    let a = from;
    for (const [g, h] of gapList) { if (g - h > a) place(a, g - h); a = Math.max(a, g + h); }
    if (to > a) place(a, to);
  };
  run(R.minX - e, R.maxX + e, gaps('n'), (a, b) => addBox((a + b) / 2, R.minZ - e, b - a, T, H, fenceMat));
  run(R.minX - e, R.maxX + e, gaps('s'), (a, b) => addBox((a + b) / 2, R.maxZ + e, b - a, T, H, fenceMat));
  run(R.minZ - e, R.maxZ + e, gaps('w'), (a, b) => addBox(R.minX - e, (a + b) / 2, T, b - a, H, fenceMat));
  run(R.minZ - e, R.maxZ + e, gaps('e'), (a, b) => addBox(R.maxX + e, (a + b) / 2, T, b - a, H, fenceMat));
  if (fenceMat.map === plankTex) { fenceMat.map = plankTex.clone(); fenceMat.map.needsUpdate = true; } // its own tiling, not every plank's
  fenceMat.map.repeat.set(20, 1);
  for (const k in AREAS) { // outer fences of each area: visual + stop bullets (bounds already stop walking)
    const a = AREAS[k], c = a.core, o = .2, vis = (x, z, w, d) => addBox(x, z, w, d, H, fenceMat, 0, false);
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2, w = c.maxX - c.minX, d = c.maxZ - c.minZ;
    if (a.side !== 's') vis(cx, c.minZ - o, w, T); if (a.side !== 'n') vis(cx, c.maxZ + o, w, T);
    if (a.side !== 'e') vis(c.minX - o, cz, T, d); if (a.side !== 'w') vis(c.maxX + o, cz, T, d);
  }
}
const boardMat = new THREE.MeshLambertMaterial({ map: woodTex, color: 0x8a7a6a });
function buildArea(a) {
  // barricade + price sign in the gate gap
  const g = new THREE.Group(), alongX = a.side === 'n' || a.side === 's';
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(unitBox, boardMat);
    b.scale.set(GATE_HALF * 2.3, .28, .12); b.position.y = .4 + i * .5; b.rotation.z = (i % 2 ? 1 : -1) * rand(.1, .25);
    b.castShadow = true; g.add(b); rayBlockers.push(b);
  }
  g.position.copy(a.gate); if (!alongX) g.rotation.y = Math.PI / 2;
  a.barricade = put(g);
  a.sign = label([a.name.toUpperCase(), `${a.cost} PONT`], '#f2a33a', 3.2, a.gate.x, 3.3, a.gate.z);
  if (a.graves) for (let x = a.core.minX + 5; x <= a.core.maxX - 4; x += 3) for (let z = a.core.minZ + 3; z <= a.core.maxZ - 3; z += 4) grave(x + rand(-.5, .5), z + rand(-.5, .5));
  // the unique station
  const [type, x, z] = a.station, pos = new V3(x, 0, z), c = a.core, cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
  a.st = { type, pos };
  // the back corners of the area: a perk machine in one, a loot chest in the other (whichever is farther from the station)
  const deep = a.side === 'n' ? [c.minZ + 2.5] : a.side === 's' ? [c.maxZ - 2.5] : a.side === 'e' ? [c.maxX - 2.5] : [c.minX + 2.5];
  const corners = (a.side === 'n' || a.side === 's' ? [[c.minX + 2.5, deep[0]], [c.maxX - 2.5, deep[0]]] : [[deep[0], c.minZ + 2.5], [deep[0], c.maxZ - 2.5]])
    .sort((p, q) => Math.hypot(q[0] - x, q[1] - z) - Math.hypot(p[0] - x, p[1] - z));
  const keys = Object.keys(PERKS).filter(k => !Object.values(AREAS).some(o => o.perk && o.perk.key === k)), pk = keys[Math.floor(mulberry(Math.round(mapSeed + c.minX * 7 + c.minZ * 13))() * keys.length)], P = PERKS[pk]; // no perk twice on a map
  const [mx, mz] = corners[0], [chx, chz] = corners[1];
  a.perk = { key: pk, pos: new V3(mx, 0, mz) };
  addBox(mx, mz, 1, 1, 2.1, matStd({ color: new THREE.Color(P.color).multiplyScalar(.28).getHex(), metalness: .4, roughness: .5 }));
  addBox(mx, mz, 1.02, 1.02, .1, new THREE.MeshBasicMaterial({ color: P.color }), 2, false);
  { const hex = '#' + P.color.toString(16).padStart(6, '0'), face = new THREE.Group(); face.position.set(mx, 0, mz); face.rotation.y = Math.atan2(cx - mx, cz - mz); mapGroup.add(face);
    const tex = panelTex('perk' + pk, 128, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hex); gr.addColorStop(1, '#101014'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(10, 96, w - 20, 110); g.fillStyle = '#fff'; g.font = 'bold 20px Impact, sans-serif'; g.textAlign = 'center'; g.fillText(P.name.toUpperCase(), w / 2, 60);
      for (let k = 0; k < 3; k++) { g.fillStyle = hex; g.fillRect(24 + k * 30, 120, 18, 60); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(28 + k * 30, 110, 10, 12); }
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12); });
    deco(new THREE.PlaneGeometry(.9, 1.8), new THREE.MeshBasicMaterial({ map: tex }), 0, 1.02, .511, 1, 1, 1, face);
    deco(unitBox, brassMat, 0, .3, .52, .3, .06, .04, face); deco(unitBox, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 2.2, .1, 1.15, .18, .9, face); }
  glowSprite(P.color, 2.4, new V3(mx, 1.7, mz)); pointLight(P.color, 1.2, 8, mx, 2.2, mz);
  label([P.name.toUpperCase()], '#' + P.color.toString(16).padStart(6, '0'), 1.6, mx, 2.7, mz);
  a.chest = { pos: new V3(chx, 0, chz), open: false };
  const chest = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ map: woodTex, color: 0x9a6a3a }), band = matStd({ color: 0xb8923a, metalness: .8, roughness: .35 });
  const cb = new THREE.Mesh(unitBox, wood); cb.scale.set(1.3, .6, .8); cb.position.y = .3; chest.add(cb);
  const lid = new THREE.Group(); lid.position.set(0, .6, -.4); const lm = new THREE.Mesh(unitBox, wood); lm.scale.set(1.32, .22, .82); lm.position.set(0, .11, .4); lid.add(lm);
  [-.45, .45].forEach(bx => { const b = new THREE.Mesh(unitBox, band); b.scale.set(.08, .24, .84); b.position.set(bx, .11, .4); lid.add(b); });
  chest.add(lid); chest.position.set(chx, 0, chz); put(chest); a.chest.lid = lid;
  obstacles.push({ minX: chx - .65, maxX: chx + .65, minZ: chz - .4, maxZ: chz + .4, h: .9 });
  if (type === 'forge') {
    const metal = matStd({ color: 0x2c2d31, metalness: .6, roughness: .5 });
    addBox(x, z, 1.4, .6, .8, metal); addBox(x, z, 1.9, .5, .15, metal, .8);
    const fx = clamp(x + 6, c.minX + 3, c.maxX - 3), fz = clamp(z - 5, c.minZ + 3, c.maxZ - 3);
    addBox(fx, fz, 2.4, 2.4, 1.6, matStd({ color: 0x4a4038 }));
    put(new THREE.Mesh(new THREE.BoxGeometry(1.8, .1, 1.8), basic(0xff6a1a))).position.set(fx, 1.62, fz);
    glowSprite(0xff7a2a, 3.5, new V3(fx, 2.2, fz)); pointLight(0xff7a2a, 2, 16, fx, 2.5, fz);
    label(['KOVÁCS'], '#ffb070', 2.2, x, 2.4, z);
    deco(new THREE.ConeGeometry(.22, .7, 10), metal, x - 1.25, .88, z, 1, 1, 1).rotation.z = Math.PI / 2; // anvil horn
    deco(unitBox, ironMat, x + .1, 1.02, z, .08, .08, .7).rotation.x = .3; deco(unitBox, ironMat, x + .1, 1.06, z - .32, .22, .16, .14); // hammer
    const brick = matStd({ color: 0x5a3a2a, roughness: .9 });
    deco(new THREE.CylinderGeometry(.35, .45, 4.2, 10), brick, fx + .7, 3.7, fz + .7); // chimney
    for (let k = 0; k < 4; k++) deco(unitBox, brick, fx, .3 + k * .42, fz + 1.22, 2.5, .38, .06); // brick courses on the front
    deco(unitBox, matStd({ color: 0x6a4a2a }), fx - 1.7, .7, fz, .7, .35, 1.1).rotation.z = .25; // bellows
    deco(unitBox, poleMat, x + 1.8, 1.1, z + .8, .1, 2.2, .1); deco(unitBox, poleMat, x + 1.8, 2.1, z + .8, 1.4, .08, .08);
    for (let k = 0; k < 3; k++) deco(unitBox, ironMat, x + 1.35 + k * .45, 1.6, z + .8, .05, .9, .05); // tools hanging
    glowSprite(0xff5a1a, 1.6, new V3(fx, 1.9, fz));
  } else if (type === 'well') {
    cylinderSolid(x, z, 1.45, .9, matStd({ color: 0x6a6a70 }));
    const water = put(new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), basic(0x3a9ac0))); water.rotation.x = -Math.PI / 2; water.position.set(x, .92, z);
    glowSprite(0x5fd8ff, 2.2, new V3(x, 1.4, z)); pointLight(0x5fd8ff, 1.1, 12, x, 2, z);
    label(['SZENT KÚT'], '#9feaff', 2.2, x, 3.5, z);
    for (let k = 0; k < 14; k++) { const q = k / 14 * Math.PI * 2; deco(unitBox, stoneMat, x + Math.cos(q) * 1.5, .5 + (k % 2) * .08, z + Math.sin(q) * 1.5, .6, 1, .42).rotation.y = -q; }
    for (const s2 of [-1, 1]) deco(unitBox, poleMat, x + s2 * 1.45, 1.5, z, .14, 2.9, .14);
    deco(unitBox, matStd({ color: 0x4a3024 }), x, 3.05, z - .45, 3.4, .1, 1.3).rotation.x = .45; deco(unitBox, matStd({ color: 0x4a3024 }), x, 3.05, z + .45, 3.4, .1, 1.3).rotation.x = -.45;
    deco(unitBox, poleMat, x, 2.5, z, 2.9, .09, .09); deco(unitBox, poleMat, x, 1.95, z, .02, 1.1, .02);
    deco(new THREE.CylinderGeometry(.18, .14, .3, 10), matStd({ color: 0x6a4a2a }), x, 1.3, z);
  } else if (type === 'trap') {
    const tc = a.gate.clone().addScaledVector(a.out, 2);
    a.st.zone = { minX: tc.x - 3.5, maxX: tc.x + 3.5, minZ: tc.z - 3.5, maxZ: tc.z + 3.5 };
    a.st.active = 0; a.st.cd = 0; a.st.cost = 750;
    a.st.light = pointLight(0xff6a1a, 0, 18, tc.x, 3, tc.z);
    addBox(x, z, .3, .3, 1.1, matStd({ color: 0x3a3a3a }));
    put(new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), basic(0xff3a1a))).position.set(x, 1.25, z);
    label(['CSAPDA'], '#ff8a4a', 2, x, 2.3, z);
    const hz = new THREE.MeshLambertMaterial({ map: hazardTex });
    deco(unitBox, hz, x, .75, z, .34, 1.5, .34); glowSprite(0xff6a1a, 1.4, new V3(x, 1.5, z));
    deco(unitBox, hz, x, 1.12, z, .32, .06, .32); deco(unitBox, hz, x, .02, z, 1.4, .02, 1.4);
    deco(unitBox, ironMat, x + .2, 1.2, z, .05, .45, .05).rotation.z = -.5; deco(new THREE.SphereGeometry(.07, 8, 6), basic(0xd82a1a), x + .31, 1.4, z);
    const along = a.side === 'n' || a.side === 's';
    for (let k = -2; k <= 2; k++) { const nx = along ? tc.x + k * 1.4 : tc.x, nz = along ? tc.z : tc.z + k * 1.4; deco(new THREE.CylinderGeometry(.09, .12, .5, 8), ironMat, nx, .25, nz); deco(new THREE.SphereGeometry(.06, 6, 5), basic(0xff6a1a), nx, .52, nz); }
    trapState.push(a.st);
  } else if (type === 'tower') {
    a.st.cost = 1200;
    const wood = new THREE.MeshLambertMaterial({ map: woodTex });
    const tx = clamp(cx - a.out.x * 6, c.minX + 5, c.maxX - 5), tz = clamp(cz - a.out.z * 6, c.minZ + 5, c.maxZ - 5);
    const txF = a.side === 'e' || a.side === 'w' ? cx + a.out.x * 5 : cx, tzF = a.side === 'n' || a.side === 's' ? cz + a.out.z * 5 : cz;
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) addBox(txF + dx, tzF + dz, .35, .35, 7, wood);
    addBox(txF, tzF, 7, 7, .3, wood, 7, false); addBox(txF, tzF, 7.6, 7.6, .25, matStd({ color: 0x2b2a2c }), 9.6, false);
    addBox(x, z, .8, .8, 1.3, matStd({ color: 0x2e3440, metalness: .4, roughness: .5 }));
    { const f = new THREE.Group(); f.position.set(x, 0, z); f.rotation.y = Math.atan2(cx - x, cz - z); mapGroup.add(f); deco(new THREE.PlaneGeometry(.6, .4), basic(0x7fb8ff), 0, 1.05, .41, 1, 1, 1, f); } // the screen faces the way you come in
    label(['LÖVEGTORONY'], '#9fc8ff', 2.4, x, 2.3, z);
    for (let k = 0; k < 16; k++) { const q = k / 16 * Math.PI * 2; deco(unitBox, sandMat, txF + Math.cos(q) * 4.3, .25 + (k % 2) * .05, tzF + Math.sin(q) * 4.3, .9, .42, .5).rotation.y = -q; }
    for (let k = 0; k < 9; k++) deco(unitBox, poleMat, txF + 3.35, .4 + k * .75, tzF, .08, .06, .7);
    for (const s2 of [-.35, .35]) deco(unitBox, poleMat, txF + 3.35, 3.5, tzF + s2, .08, 7, .08);
    deco(unitBox, matStd({ color: 0x3a3e46, metalness: .5 }), x, 1.45, z, .7, .12, .5); // console top
    deco(unitBox, basic(0x7fb8ff), x, 1.53, z, .5, .03, .3); glowSprite(0x7fb8ff, 1.3, new V3(x, 1.7, z));
  }
}
function buildBoxAndAmmo() {
  const m = addBox(0, 0, 1.8, .9, .9, new THREE.MeshLambertMaterial({ map: woodTex, color: 0xc0b0ff }));
  box.mesh = m; box.obs = obstacles[obstacles.length - 1];
  box.label = label(['?'], '#9fe8ff', 1.4, 0, 2.1, 0); box.label.userData.text[3] = 'rgba(90,200,255,.55)'; drawTextSprite(box.label);
  box.beam = put(new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  box.light = pointLight(0x6fd6ff, 1.3, 9, 0, 1.8, 0);
  box.deco = new THREE.Group(); mapGroup.add(box.deco);
  for (const c of [...mapGroup.children]) if (c.isMesh && c.material === stoneMat && BOX_SPOTS.some(([bx, bz]) => Math.hypot(c.position.x - bx, c.position.z - bz) < 1.8)) mapGroup.remove(c); // no gravestones through the box
  const qTex = panelTex('qmark', 128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#9fe8ff'; g.font = 'bold 56px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#5fd8ff'; g.shadowBlur = 12; g.fillText('? ? ?', w / 2, h / 2 + 2); });
  for (const s2 of [-1, 1]) deco(new THREE.PlaneGeometry(1.5, .5), new THREE.MeshBasicMaterial({ map: qTex, transparent: true, depthWrite: false }), 0, .45, s2 * .47, 1, 1, 1, box.deco).rotation.y = s2 < 0 ? Math.PI : 0;
  for (const bx of [-.7, 0, .7]) deco(unitBox, ironMat, bx, .45, 0, .08, .94, .96, box.deco);
  for (const [bx, bz] of [[-.88, -.43], [.88, -.43], [-.88, .43], [.88, .43]]) deco(unitBox, brassMat, bx, .45, bz, .1, .96, .1, box.deco);
  deco(unitBox, new THREE.MeshBasicMaterial({ color: 0x6fd6ff }), 0, .91, 0, 1.7, .02, .8, box.deco);
  box.state = 'idle'; if (box.show) { scene.remove(box.show); box.show = null; }
  placeBox(Math.floor(mulberry(mapSeed + 3)() * BOX_SPOTS.length));
  if (MAP.range) { [box.mesh, box.deco, box.label, box.beam].forEach(o => o.visible = false); box.light.intensity = 0; box.obs.minX = box.obs.maxX = 1e4; ammoBox.pos.set(1e4, 0, 1e4); return; } // the testing ground sells nothing
  const [ax, az] = MAP.ammo; ammoBox.pos.set(ax, 0, az);
  addBox(ax, az, 1.4, .8, .7, new THREE.MeshLambertMaterial({ color: 0x3f4f2c }));
  addBox(ax, az, 1.45, .82, .12, new THREE.MeshLambertMaterial({ color: 0xc7a03a }), .45, false);
  const stTex = panelTex('ammo', 128, 64, (g, w, h) => { g.fillStyle = '#3f4f2c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8e2c0'; g.font = 'bold 26px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('LŐSZER', w / 2, 30); g.font = '14px monospace'; g.fillText('7.62 · 12G · 9MM', w / 2, 52); });
  for (const s2 of [-1, 1]) deco(new THREE.PlaneGeometry(1.2, .55), new THREE.MeshLambertMaterial({ map: stTex }), ax, .36, az + s2 * .41).rotation.y = s2 < 0 ? Math.PI : 0;
  for (const s2 of [-1, 1]) deco(unitBox, ironMat, ax + s2 * .72, .45, az, .04, .12, .3);
  for (let k = 0; k < 3; k++) deco(unitBox, matStd({ color: 0x4a5a32, metalness: .3 }), ax + 1.15, .22 + (k === 2 ? .44 : 0), az - .25 + (k % 2) * .5, .45, .44, .3);
  for (let k = 0; k < 6; k++) deco(new THREE.CylinderGeometry(.03, .03, .16, 6), brassMat, ax - .5 + k * .2, .79, az, 1, 1, 1).rotation.z = Math.PI / 2;
  label(['LŐSZER'], '#e7c85a', 1.6, ax, 1.55, az);
}
// the van: it drops you off, leaves, and comes back for you at another spot when time is up.
// It parks facing the nearest side fence, so it backs in and drives straight out.
const vanDir = x => x <= 0 ? -1 : 1;
function buildTruck() {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0x3a5a7a }), dark = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const bx = (m, sx, sy, sz, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(sx, sy, sz); e.position.set(px, py, pz); e.castShadow = true; g.add(e); return e; };
  bx(paint, 4.8, .9, 2.1, 0, .85, 0); bx(paint, 1.9, .9, 2, .7, 1.75, 0);
  bx(new THREE.MeshLambertMaterial({ color: 0x9ab8d0, emissive: 0x0a141c }), 1.92, .6, 1.8, .7, 1.8, 0);
  bx(dark, .1, .5, 2.1, -2.35, 1.4, 0);
  for (const [a, b] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .3, 12), dark); t.rotation.x = Math.PI / 2; t.position.set(a, .45, b * 1.05); g.add(t);
  }
  [-.6, .6].forEach(b => bx(basic(0xfff2c0), .06, .18, .3, 2.42, .95, b));
  [-.8, .8].forEach(b => bx(basic(0xff2a1a), .06, .14, .22, -2.42, 1, b)); // tail lights
  const head = new THREE.SpotLight(0xfff0c0, 2.2, 30, .5, .5, 1.5); head.position.set(2.5, 1, 0); head.target.position.set(10, 0, 0); g.add(head, head.target);
  put(g);
  truck.g = g;
  truck.obs = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: 2.2 }; obstacles.push(truck.obs);
  truck.beacon = glowSprite(0x6aff6a, 4, new V3()); truck.beacon.visible = false;
  truck.beam = put(new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6aff6a, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  truck.beam.visible = false;
  placeVan(0, true);
}
// parked: collision on and the van standing there; otherwise it is only the destination
function placeVan(i, parked) {
  const [x, z] = MAP.vans[i]; truck.dir = vanDir(x); truck.pos.set(x, 0, z);
  truck.g.rotation.y = truck.dir > 0 ? 0 : Math.PI;
  truck.beacon.position.set(x, 3.6, z); truck.beam.position.set(x, 20, z);
  setVanAt(parked ? 0 : vanRun());
}
// how far out the van starts: from the road beyond its gate
const vanRun = () => Math.abs(truck.pos.x - (truck.dir < 0 ? MAIN_RECT.minX : MAIN_RECT.maxX)) + 14;
// off: metres the van is away from its spot along its lane (outward)
function setVanAt(off) {
  const x = truck.pos.x + truck.dir * off, z = truck.pos.z;
  truck.g.position.set(x, 0, z);
  truck.g.visible = inRect({ minX: MAIN_RECT.minX - 40, maxX: MAIN_RECT.maxX + 40, minZ: -1e4, maxZ: 1e4 }, x, z); // seen coming down the road, then through its gate
  truck.parked = off < .05;
  Object.assign(truck.obs, truck.parked ? { minX: x - 2.4, maxX: x + 2.4, minZ: z - 1.1, maxZ: z + 1.1 } : { minX: 1e4, maxX: 1e4, minZ: 1e4, maxZ: 1e4 });
}

// ---------- unlocking ----------
function openArea(k) {
  const a = AREAS[k]; if (!a || a.unlocked) return;
  a.unlocked = true; mapGroup.remove(a.barricade, a.sign);
  a.barricade.children.forEach(b => { const i = rayBlockers.indexOf(b); if (i >= 0) rayBlockers.splice(i, 1); });
}
function unlockArea(k) {
  const a = AREAS[k];
  const c = SK.gate(a.cost);
  if (a.unlocked || player.points < c) return SND.deny();
  player.points -= c; openArea(k);
  if (NET.client) netAct('gate', Object.keys(AREAS).indexOf(k));
  burst(a.gate.clone().setY(1), 0x6b4a2b, 24, 4, .8);
  banner(`${a.name.toUpperCase()} MEGNYÍLT`, a.desc); SND.buy(); SND.explode();
}

// ---------- stations ----------
const trapState = [];
const turrets = [];
// returns false when it could not be placed; opts: rate (fire speed), station (the rented one at a tower),
// n (how many; the Ikertorony augment places two small ones), dmgMul, shield (dome: -50% damage inside), rocket (explosive shots)
function deployTurret(cost, dur = 60, opts = {}) {
  if (opts.station ? turrets.some(t => t.station) : turrets.some(t => !t.station)) return false;
  if (player.points < cost) return false;
  player.points -= cost; SND.buy();
  const n = opts.n || 1, fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), side = new V3(-fwd.z, 0, fwd.x);
  for (let k = 0; k < n; k++) {
    const p = player.pos.clone().addScaledVector(fwd, 1.6).addScaledVector(side, n > 1 ? (k ? 1.2 : -1.2) : 0); clampBounds(p, .5);
    const g = new THREE.Group(), metal = matStd({ color: opts.rocket ? 0x5a3a30 : 0x3a4250, metalness: .6, roughness: .4 });
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(unitBox, metal); l.scale.set(.08, 1.1, .08); l.position.set(Math.sin(i * 2.1) * .3, .5, Math.cos(i * 2.1) * .3); l.rotation.set(Math.cos(i * 2.1) * .3, 0, -Math.sin(i * 2.1) * .3); g.add(l); }
    const head = new THREE.Group(); head.position.y = 1.15; g.add(head);
    const body = new THREE.Mesh(unitBox, metal); body.scale.set(.35, .3, .5); head.add(body);
    const barrel = new THREE.Mesh(unitBox, metal); barrel.scale.set(opts.rocket ? .18 : .08, opts.rocket ? .18 : .08, .6); barrel.position.z = .5; head.add(barrel);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .02), basic(opts.shield ? 0x7fe8ff : 0x7fb8ff)); eye.position.set(0, .06, .26); head.add(eye);
    if (n > 1) g.scale.setScalar(.75);
    if (opts.shield) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(dome);
    }
    g.position.copy(p); scene.add(g);
    turrets.push({ g, head, t: dur, cd: .5, rate: opts.rate || 1, station: !!opts.station, dmgMul: opts.dmgMul || 1, shield: !!opts.shield, rocket: !!opts.rocket });
  }
  banner(n > 1 ? 'IKERTORONY' : opts.shield ? 'PAJZSTORONY' : opts.rocket ? 'RAKÉTATORONY' : 'LÖVEGTORONY TELEPÍTVE', `${Math.round(dur)} másodpercig lő mindenre, ami mozog.`);
  return true;
}
function updateTurret(dt) {
  for (let i = turrets.length - 1; i >= 0; i--) {
    const turret = turrets[i];
    turret.t -= dt; turret.cd -= dt;
    if (turret.t <= 0) { scene.remove(turret.g); turrets.splice(i, 1); continue; }
    fireTurret(turret);
  }
}
function fireTurret(turret) {
  const from = turret.g.position.clone().setY(1.2);
  let best = null, bd = 28;
  for (const z of zombies) { if (z.dead || z.rise > .2) continue; const d = Math.hypot(z.pos.x - from.x, z.pos.z - from.z); if (d < bd) { bd = d; best = z; } }
  if (!best) return;
  const aim = new V3(best.pos.x, 1.2 * best.scale, best.pos.z);
  turret.head.lookAt(aim);
  if (turret.cd > 0) return;
  turret.cd = (turret.rocket ? 1.2 : .18) / turret.rate;
  const dir = aim.clone().sub(from), len = dir.length();
  ray.set(from, dir.normalize()); ray.far = len;
  if (ray.intersectObjects(rayBlockers, false).length) return;
  tracer(from.clone().addScaledVector(dir, .7), aim, turret.rocket ? 0xffa050 : 0x9fc8ff, turret.rocket ? .04 : .015);
  if (turret.rocket) { explode(aim, { r: 3.5, zdmg: (60 + zombieHp() * .8) * SK.turret(), pr: .01, pdmg: .001 }); return; }
  hurtZombie(best, (20 + zombieHp() * .09) * SK.turret() * turret.dmgMul, { color: '#9fc8ff' });
  if (rk('e_fire')) { best.burnT = 2; best.burnDps = Math.max(best.burnDps, zombieHp() * .15); }
  const s = Math.max(0, 1 - player.pos.distanceTo(from) / 40);
  nz(.08, 2400, .25 * s, 'bandpass', .8); tn(160, .05, .08 * s, 'square', 60);
}
function updateTraps(dt) {
  for (const T of trapState) {
    T.cd = Math.max(0, T.cd - dt);
    if (T.active <= 0) { T.light.intensity = 0; continue; }
    T.active -= dt; T.light.intensity = 2.5 + Math.random();
    const Z = T.zone;
    for (let i = 0; i < 4; i++) burst(new V3(rand(Z.minX, Z.maxX), .1, rand(Z.minZ, Z.maxZ)), Math.random() < .5 ? 0xff6a1a : 0xffc050, 1, 1.5, .6);
    if (!NET.client) for (const z of zombies) if (!z.dead && inRect(Z, z.pos.x, z.pos.z)) { z.burnT = 1; z.burnDps = Math.max(z.burnDps, zombieHp() * .45); }
    if (inRect(Z, player.pos.x, player.pos.z)) hurtPlayer(4 * dt, true);
    if (T.active <= 0) { T.cd = 40; banner('A CSAPDA KIALUDT', 'Újratöltés: 40 mp'); }
  }
}
function activateTrap(T) {
  const c = SK.cost(T.cost);
  if (T.active > 0 || T.cd > 0 || player.points < c) return SND.deny();
  player.points -= c; T.active = 20; SND.buy(); SND.explode();
  if (NET.client) netAct('trap', trapState.indexOf(T));
  banner('TŰZCSAPDA', '20 másodpercig lángokban áll a kapu.');
}
function updateAreas(dt) {
  updateTurret(dt); updateTraps(dt);
  for (const k in AREAS) {
    const a = AREAS[k];
    if (a.unlocked && a.st.type === 'well' && Math.hypot(player.pos.x - a.st.pos.x, player.pos.z - a.st.pos.z) < 3.4) {
      player.hp = Math.min(maxHp(), player.hp + 15 * dt);
      if (Math.random() < dt * 6) burst(player.pos.clone().setY(.3), 0x5fd8ff, 1, 1, .6);
    }
  }
}
function areaFocus() {
  const p = player.pos, near = (v, r) => Math.hypot(v.x - p.x, v.z - p.z) < r;
  for (const k in AREAS) {
    const a = AREAS[k];
    if (!a.unlocked && near(a.gate, 3.2)) return { type: 'gate', area: k };
    if (a.unlocked && near(a.st.pos, a.st.type === 'well' ? 3.4 : 2.4)) return { type: a.st.type, area: k };
    if (a.unlocked && a.perk && near(a.perk.pos, 2)) return { type: 'perk', area: k };
    if (a.unlocked && a.chest && !a.chest.open && near(a.chest.pos, 2)) return { type: 'chest', area: k };
  }
  if (mission && mission.phase === 'evac' && truck.parked && !(mission.boardT > 0) && !mission.leaving && near(truck.pos, 4)) return { type: 'truck' }; // once someone has started boarding, nobody else presses it
  return null;
}
function areaPrompt(f) {
  const pts = player.points, lack = c => pts < c ? ' (kevés a pont)' : '', a = AREAS[f.area], st = a && a.st;
  switch (f.type) {
    case 'gate': return `<b>[E]</b> ${a.name} megnyitása · ${SK.gate(a.cost)} pont${lack(SK.gate(a.cost))}`;
    case 'forge': return '<b>[E]</b> Kovácsműhely';
    case 'well': return '<b>[E]</b> Szent kút · a víz gyógyít';
    case 'trap': return st.active > 0 ? `Csapda ég · ${Math.ceil(st.active)} mp` : st.cd > 0 ? `Csapda töltődik · ${Math.ceil(st.cd)} mp` : `<b>[E]</b> Tűzcsapda · ${SK.cost(st.cost)} pont${lack(SK.cost(st.cost))}`;
    case 'tower': { const t = turrets.find(t => t.station); return t ? `Lövegtorony aktív · ${Math.ceil(t.t)} mp` : `<b>[E]</b> Lövegtorony telepítése · ${SK.cost(st.cost)} pont${lack(SK.cost(st.cost))}`; }
    case 'truck': return '<b>[E]</b> Beszállás és indulás';
    case 'perk': { const P = PERKS[a.perk.key]; return player.perks && player.perks[a.perk.key] ? `${P.name} · már megvan` : `<b>[E]</b> ${P.name} · ${P.desc} · ${SK.cost(P.cost)} pont${lack(SK.cost(P.cost))}`; }
    case 'chest': return '<b>[E]</b> Zsákmányláda kinyitása';
  }
  return '';
}
function areaInteract(f) {
  const st = f.area && AREAS[f.area].st;
  switch (f.type) {
    case 'gate': return unlockArea(f.area);
    case 'forge': return openStation('forge');
    case 'well': return openStation('well');
    case 'trap': return activateTrap(st);
    case 'tower': return deployTurret(SK.cost(st.cost), 75, { station: true }) || SND.deny();
    case 'truck': return extract();
    case 'perk': {
      const k = AREAS[f.area].perk.key, P = PERKS[k], c = SK.cost(P.cost); player.perks = player.perks || {};
      if (player.perks[k] || player.points < c) return SND.deny();
      player.points -= c; player.perks[k] = true; SND.power(); banner(P.name.toUpperCase(), P.desc);
      if (k === 'jug') player.hp = maxHp();
      return;
    }
    case 'chest': { // a one-time chest in each area: a good gun and a piece of armor, rolled for whoever opens it
      const ch = AREAS[f.area].chest; ch.open = true; ch.lid.rotation.x = -1.6; SND.pickup(3);
      const p = ch.pos.clone();
      spawnDrop(makeWeapon(pick(BASES), Math.max(2, rollRarity(.5)), lootLvl(1)), p.clone().add(new V3(-.8, 0, 1.2)));
      spawnGearDrop(makeGear(null, Math.max(2, rollRarity(.4)), lootLvl(1)), p.clone().add(new V3(.8, 0, 1.2)));
      burst(p.clone().setY(1), 0xffd070, 30, 4, .8); banner('ZSÁKMÁNYLÁDA', 'Ritka vagy jobb fegyver és páncél.');
      return;
    }
  }
}

// ---------- scattered props (seeded) ----------
const carMats = [0x3a4a52, 0x5a2a24, 0x4a4a3a, 0x2e3a2a].map(c => new THREE.MeshLambertMaterial({ color: c }));
const tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const barrelMat = new THREE.MeshLambertMaterial({ color: 0x6a5a44 });
const boomBarrelMat = new THREE.MeshLambertMaterial({ color: 0x9a1c14, emissive: 0x2a0400 });
const logMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
const propHayMat = new THREE.MeshLambertMaterial({ color: 0x9c8443 });
function keepClearPoints() {
  const pts = [[ammoBox.pos.x, ammoBox.pos.z, 2.6], ...MAP.clear];
  MAP.vans.forEach(([x, z]) => {
    const d = vanDir(x), edge = d > 0 ? MAIN_RECT.maxX : MAIN_RECT.minX;
    for (let t = x - d * 4; d > 0 ? t <= edge : t >= edge; t += d * 3) pts.push([t, z, 3]);
    pts.push([x, z - Math.sign(z || 1) * 2.8, 2.5]);
  });
  BOX_SPOTS.forEach(([x, z]) => pts.push([x, z, 3.2]));
  SPAWNS.forEach(([x, z]) => pts.push([x, z, 3]));
  lamps.forEach(l => pts.push([l.x, l.z, 1.5]));
  for (const k in AREAS) { const a = AREAS[k]; pts.push([a.gate.x, a.gate.z, 5], [a.st.pos.x, a.st.pos.z, 4]); if (a.perk) pts.push([a.perk.pos.x, a.perk.pos.z, 2.5]); if (a.chest) pts.push([a.chest.pos.x, a.chest.pos.z, 2.5]); a.spawns.forEach(([x, z]) => pts.push([x, z, 3])); }
  return pts;
}
const overlaps = (x, z, r) => obstacles.some(o => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
// prop details: shared materials so the merge keeps them to a few draw calls
const twineMat = new THREE.MeshLambertMaterial({ color: 0x5a4a2a }), rimMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: .6, roughness: .5 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2630, metalness: .6, roughness: .2 }), bumperMat = new THREE.MeshStandardMaterial({ color: 0x8a8e92, metalness: .8, roughness: .3 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xe8e2c0 }), tailMat = new THREE.MeshBasicMaterial({ color: 0x8a1a12 }), rustMat = new THREE.MeshLambertMaterial({ color: 0x6a3a1a });
const logEndMat = new THREE.MeshLambertMaterial({ map: panelTex('logend', 64, 64, (g, w, h) => { g.fillStyle = '#b08a5a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,60,30,.6)'; g.lineWidth = 2; for (let r = 4; r < 32; r += 5) { g.beginPath(); g.arc(32, 32, r, 0, 7); g.stroke(); } }) });
const flameTex = panelTex('flame', 64, 64, (g, w, h) => { g.fillStyle = '#e8b82a'; g.beginPath(); g.moveTo(32, 4); g.lineTo(60, 58); g.lineTo(4, 58); g.closePath(); g.fill(); g.fillStyle = '#111'; g.font = 'bold 34px Impact'; g.textAlign = 'center'; g.fillText('!', 32, 52); });
const crateEdge = new THREE.MeshLambertMaterial({ color: 0x3a2818 }), crateStencils = ['TÖRÉKENY', 'LŐSZER', 'KONZERV', 'ORVOSI', 'GYÚLÉKONY'].map(t => new THREE.MeshLambertMaterial({ map: panelTex('st' + t, 128, 48, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(20,14,8,.75)'; g.font = 'bold 22px Impact, sans-serif'; g.textAlign = 'center'; g.fillText(t, w / 2, 32); }), transparent: true }));
function crateTrim(g, s, y0, ox, rng, oz = 0) { // dark edges, iron corners and sometimes a stencil
  const e = .07;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const m = new THREE.Mesh(unitBox, crateEdge); m.scale.set(e, s, e); m.position.set(ox + a * s / 2, y0 + s / 2, oz + b * s / 2); g.add(m); }
  for (const y of [0, s]) for (const [a, b, sx, sz] of [[0, -1, s, e], [0, 1, s, e], [-1, 0, e, s], [1, 0, e, s]]) { const m = new THREE.Mesh(unitBox, crateEdge); m.scale.set(sx, e, sz); m.position.set(ox + a * s / 2, y0 + y, oz + b * s / 2); g.add(m); }
  if (rng() < .5) { const p = new THREE.Mesh(new THREE.PlaneGeometry(s * .8, s * .3), crateStencils[Math.floor(rng() * crateStencils.length)]); p.position.set(ox, y0 + s * .55, oz + s / 2 + .005); g.add(p); }
}
function makeProp(type, x, z, rng) {
  const g = new THREE.Group(), obs = [], blk = [];
  const solid = (mesh, hx, hz, h) => { mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); blk.push(mesh); if (hx) obs.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h }); return mesh; };
  const boxM = (mat, sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(unitBox, mat); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); return m; };
  const turn = rng() < .5; // axis aligned so the collision boxes match
  const prop = { g, obs, blk, type, x, z };
  if (type === 'crate' || type === 'stack') {
    const s = 1.2 + rng() * .6;
    solid(boxM(crateMat, s, s, s, 0, s / 2, 0), s / 2, s / 2, s);
    crateTrim(g, s, 0, 0, rng);
    if (type === 'stack') { const t = s * .8, ox = rng() * .2, oz = rng() * .2; solid(boxM(crateMat, t, t, t, ox, s + t / 2, oz)); crateTrim(g, t, s, ox, rng, oz); }
  } else if (type === 'hay') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 1.8, 16), propHayMat);
    m.rotation.set(0, turn ? Math.PI / 2 : 0, Math.PI / 2); m.position.y = .85;
    solid(m, turn ? .9 : .85, turn ? .85 : .9, 1.7);
    for (const o of [-.45, .45]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.865, .865, .06, 16), twineMat); b.rotation.copy(m.rotation); b.position.set(turn ? 0 : o, .85, turn ? o : 0); g.add(b); }
  } else if (type === 'barrel' || type === 'boom') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.1, 14), type === 'boom' ? boomBarrelMat : barrelMat);
    m.position.y = .55; solid(m, .42, .42, 1.1);
    for (const y of [.2, .9]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.435, .435, .06, 14), rimMat); r.position.y = y; g.add(r); }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .02, 14), rimMat); lid.position.y = 1.105; g.add(lid);
    if (type === 'boom') { const sign = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), new THREE.MeshBasicMaterial({ map: flameTex, transparent: true })); sign.position.set(0, .45, .425); g.add(sign); }
    if (type === 'boom') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .12, 14), basic(0xf2c12a)); band.position.y = .7; g.add(band);
      m.userData.onHit = () => blowBarrel(prop); // shooting it sets it off
    }
  } else if (type === 'car') {
    const mat = carMats[Math.floor(rng() * carMats.length)], L = 4, W = 1.9;
    const [hx, hz] = turn ? [W / 2, L / 2] : [L / 2, W / 2];
    solid(boxM(mat, turn ? W : L, .9, turn ? L : W, 0, .75, 0), hx, hz, 1.9);
    solid(boxM(mat, turn ? W * .9 : L * .5, .7, turn ? L * .5 : W * .9, 0, 1.55, 0));
    const along = (a, c, sa, sc, y, sy, m2) => g.add(boxM(m2, turn ? sc : sa, sy, turn ? sa : sc, turn ? c : a, y, turn ? a : c));
    along(0, 0, L * .52, W * .92, 1.58, .5, glassMat); // windows round the cabin
    along(0, 0, L * .3, W * .94, 1.58, .5, glassMat);
    for (const e of [-1, 1]) { along(e * L * .5, 0, .12, W * .9, .55, .22, bumperMat); for (const s2 of [-1, 1]) along(e * L * .5, s2 * W * .34, .04, .3, .88, .16, e > 0 ? headMat : tailMat); }
    if (rng() < .6) along((rng() - .5) * L * .6, (rng() < .5 ? -1 : 1) * W * .5, .9, .02, .8, .5, rustMat);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .25, 12), tireMat);
      t.rotation.set(turn ? Math.PI / 2 : 0, 0, turn ? 0 : Math.PI / 2);
      t.position.set(turn ? a * W * .5 : a * L * .32, .38, turn ? b * L * .32 : b * W * .5); g.add(t);
    }
  } else if (type === 'logs') {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, 2.6, 10), logMat);
      if (turn) m.rotation.set(Math.PI / 2, 0, 0); else m.rotation.set(0, 0, Math.PI / 2);
      m.position.set(turn ? (i - 1) * .55 : 0, .28, turn ? 0 : (i - 1) * .55);
      if (i === 2) m.position.set(0, .75, 0);
      solid(m);
      for (const e of [-1, 1]) { const ring = new THREE.Mesh(new THREE.CircleGeometry(.27, 10), logEndMat); const p0 = m.position; if (turn) { ring.position.set(p0.x, p0.y, e * 1.301); if (e < 0) ring.rotation.y = Math.PI; } else { ring.position.set(e * 1.301, p0.y, p0.z); ring.rotation.y = e * Math.PI / 2; } g.add(ring); }
    }
    obs.push(turn ? { minX: x - .9, maxX: x + .9, minZ: z - 1.3, maxZ: z + 1.3, h: 1 } : { minX: x - 1.3, maxX: x + 1.3, minZ: z - .9, maxZ: z + .9, h: 1 });
  }
  g.position.set(x, 0, z); put(g);
  obstacles.push(...obs); rayBlockers.push(...blk);
  props.push(prop);
  return prop;
}
function blowBarrel(p) {
  if (p.gone) return; p.gone = true;
  const i = props.indexOf(p); if (i >= 0) props.splice(i, 1);
  mapGroup.remove(p.g);
  p.obs.forEach(o => { const k = obstacles.indexOf(o); if (k >= 0) obstacles.splice(k, 1); });
  p.blk.forEach(b => { const k = rayBlockers.indexOf(b); if (k >= 0) rayBlockers.splice(k, 1); });
  explode(new V3(p.x, .8, p.z), { r: 5.5, zdmg: (200 + zombieHp() * 1.2) * (rk('e_barrel') ? 2 : 1), pr: 4.5, pdmg: 40 });
}
function generateProps(seed) {
  mapSeed = seed;
  const rng = mulberry(seed), R = (a, b) => a + rng() * (b - a), types = MAP.props;
  const clear = keepClearPoints();
  const pickType = () => { let x = rng() * types.reduce((a, t) => a + t[1], 0); for (const [t, w] of types) if ((x -= w) <= 0) return t; return types[0][0]; };
  const zones = [[MAIN_RECT, MAP.propN[0] + Math.floor(rng() * (MAP.propN[1] - MAP.propN[0]))]];
  for (const k in AREAS) zones.push([AREAS[k].core, 3 + Math.floor(rng() * 3)]);
  for (const [Z, n] of zones) {
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 30; tries++) {
      const x = R(Z.minX + 3, Z.maxX - 3), z = R(Z.minZ + 3, Z.maxZ - 3), type = pickType();
      const r = type === 'car' ? 3 : type === 'logs' ? 1.8 : 1.3;
      if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r) || overlaps(x, z, r + 1.2) || graveSpots.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < r + .8)) continue;
      makeProp(type, x, z, rng); placed++;
    }
  }
}

// ---------- mystery box moves ----------
function placeBox(i) {
  const [x, z] = BOX_SPOTS[i];
  box.spot = i; box.pos.set(x, 0, z);
  box.mesh.position.set(x, .45, z); if (box.deco) box.deco.position.set(x, 0, z);
  Object.assign(box.obs, { minX: x - .9, maxX: x + .9, minZ: z - .45, maxZ: z + .45 });
  box.label.position.set(x, 2.1, z); box.beam.position.set(x, 15, z); box.light.position.set(x, 1.8, z);
  box.uses = 0; box.limit = 4 + Math.floor(Math.random() * 4);
}
function boxUsed() {
  if (++box.uses < box.limit || BOX_SPOTS.length < 2) return;
  const old = box.pos.clone();
  let i; do i = Math.floor(Math.random() * BOX_SPOTS.length); while (i === box.spot);
  placeBox(i);
  burst(old.setY(1), 0x9fe8ff, 30, 4, 1); burst(box.pos.clone().setY(1), 0x9fe8ff, 30, 4, 1);
  banner('A DOBOZ ELKÖLTÖZÖTT', 'Keresd a kék fénycsóvát.'); SND.power();
}

// ---------- job modifier (one per job, shown on the job card) ----------
let activeMod = null;
const roundMod = { speed: 1, hp: 1, points: 1, elite: false, spawns: 1 };
function clearMod() {
  activeMod = null; if (typeof rain !== 'undefined') rain.visible = false; Object.assign(roundMod, { speed: 1, hp: 1, points: 1, elite: false, spawns: 1 });
  const L = MAP.look;
  scene.fog.density = baseFog; scene.fog.color.setHex(L.fog); scene.background.setHex(L.fog);
  moonMesh.material.color.setHex(0xe4e9ff); moon.color.setHex(0xa4b6ff);
  lamps.forEach(l => { l.bulb.visible = l.glow.visible = true; l.light.intensity = 1.7; });
}
function applyMod(key) {
  clearMod(); if (!key) return;
  activeMod = key;
  if (key === 'fog') scene.fog.density = baseFog * 2.1;
  if (key === 'blood') { roundMod.speed = 1.25; roundMod.points = 1.5; moonMesh.material.color.setHex(0xff3a2a); moon.color.setHex(0xff6a5a); scene.fog.color.setHex(0x1a0808); scene.background.setHex(0x1a0808); }
  if (key === 'dark') lamps.forEach(l => { l.bulb.visible = l.glow.visible = false; l.light.intensity = 0; });
  if (key === 'horde') { roundMod.hp = .6; roundMod.spawns = 1.8; roundMod.points = .7; }
  if (key === 'elite') roundMod.elite = true;
  if (key === 'storm') { scene.fog.density = baseFog * 1.6; roundMod.points = 1.15; scene.fog.color.setHex(0x0a0e14); scene.background.setHex(0x0a0e14); }
  rain.visible = key === 'storm';
}
function updateMapFx(dt) {
  mapSpin.forEach(m => m.rotation.z += dt * .4);
  updateVanGates(dt);
  if (rain.visible) updateRain(dt);
  for (const s of mapLabels) { const d = Math.hypot(s.position.x - player.pos.x, s.position.z - player.pos.z); if (s.userData.base) s.scale.copy(s.userData.base).multiplyScalar(clamp(d / 9, .45, 1)); }
  for (const s of mapLabels) s.material.opacity = clamp(1.5 - Math.hypot(s.position.x - player.pos.x, s.position.z - player.pos.z) / 16, .12, 1); // signs fade with distance
  if (activeMod === 'dark') return;
  for (const l of lamps) {
    if (!l.flicker) continue;
    const on = Math.sin(now * 23 + l.x) + Math.sin(now * 7.3 + l.z) > -.6 || Math.random() < .02;
    l.light.intensity = on ? 1.7 : .15; l.bulb.visible = l.glow.visible = on;
  }
}

// rain: a box of streaks that follows the camera; now and then the sky flashes and thunder rolls in a moment later
const RAIN_N = 1400, rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = rand(-30, 30), y = rand(0, 22), z = rand(-30, 30); rainPos.set([x, y, z, x + .05, y - .6, z], i * 6); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x8aa0b8, transparent: true, opacity: .35, depthWrite: false }));
rain.visible = false; rain.frustumCulled = false; scene.add(rain);
let boltT = 6;
function updateRain(dt) {
  const a = rainGeo.attributes.position.array, fall = 26 * dt;
  for (let i = 0; i < RAIN_N; i++) { const o = i * 6; a[o + 1] -= fall; a[o + 4] -= fall; if (a[o + 4] < 0) { a[o + 1] += 22; a[o + 4] += 22; } }
  rainGeo.attributes.position.needsUpdate = true; rain.position.set(camera.position.x, 0, camera.position.z);
  if ((boltT -= dt) <= 0) { // lightning
    boltT = rand(6, 14); const f = $('flash'); f.style.background = '#cfe0ff'; f.style.opacity = .55; flashT = .35; setTimeout(() => { if (f.style.background.includes('207')) f.style.background = ''; }, 450);
    setTimeout(() => { if (activeMod === 'storm') { nz(2.5, 120, .9, 'lowpass', .7); tn(40, 1.8, .4, 'sine', 28); } }, rand(300, 1400));
  }
}

// the van's gates: a real gap in the fence with two swinging leaves, lit posts and a road leading away
const vanGates = [];
const gateMat = new THREE.MeshStandardMaterial({ color: 0x6a6e72, metalness: .6, roughness: .45 }), gateBar = new THREE.MeshStandardMaterial({ color: 0xc8a23a, metalness: .3, roughness: .6 });
function buildVanGates() {
  vanGates.length = 0;
  for (const [vx, z] of MAP.vans) {
    const d = vanDir(vx), x = d < 0 ? MAIN_RECT.minX - .2 : MAIN_RECT.maxX + .2, g = new THREE.Group(); g.position.set(x, 0, z);
    const leaves = [-1, 1].map(s => {
      const hinge = new THREE.Group(); hinge.position.set(0, 0, s * VAN_HALF); g.add(hinge);
      const L = VAN_HALF - .1, frame = (w, h, dd, px, py, pz, m) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(w, h, dd); e.position.set(px, py, pz); e.castShadow = true; hinge.add(e); };
      frame(.12, .12, L, 0, 2.1, -s * L / 2, gateMat); frame(.12, .12, L, 0, .25, -s * L / 2, gateMat); frame(.12, 2, .12, 0, 1.15, -s * L, gateMat);
      for (let k = 1; k < 5; k++) frame(.05, 1.85, .05, 0, 1.17, -s * L * k / 5, gateMat);
      frame(.08, .12, L * 1.02, 0, 1.2, -s * L / 2, gateBar);
      return { hinge, s };
    });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(unitBox, gateMat); p.scale.set(.45, 3, .45); p.position.set(0, 1.5, s * (VAN_HALF + .15)); p.castShadow = true; g.add(p); const cap = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), basic(0xffb040)); cap.position.set(0, 3.15, s * (VAN_HALF + .15)); g.add(cap); }
    const road = new THREE.Mesh(new THREE.PlaneGeometry(40, VAN_HALF * 2 - .4), new THREE.MeshStandardMaterial({ color: 0x2e2c28, roughness: 1 })); road.rotation.x = -Math.PI / 2; road.position.set(d * 20, .015, 0); road.receiveShadow = true; g.add(road);
    put(g); vanGates.push({ g, leaves, x, z, d, open: 0 });
  }
}
function updateVanGates(dt) { // open while the van is close to its gate, closed otherwise
  for (const G of vanGates) {
    const near = truck.g.visible && !truck.parked && Math.abs(truck.g.position.z - G.z) < 1 && Math.abs(truck.g.position.x - G.x) < 24;
    G.open += ((near ? 1 : 0) - G.open) * Math.min(1, dt * 5);
    for (const { hinge, s } of G.leaves) hinge.rotation.y = -s * G.d * G.open * 1.7;
  }
}

// every van needs a clear lane: from its spot to the fence and 44 m of road beyond, clear of buildings, rocks and locked areas.
// A blocked lane slides along the fence until it finds room.
function laneRect(x, z) { const d = vanDir(x), edge = d < 0 ? MAIN_RECT.minX : MAIN_RECT.maxX, a = x - d * 3, b = edge + d * 44; return { minX: Math.min(a, b), maxX: Math.max(a, b), minZ: z - VAN_HALF - .4, maxZ: z + VAN_HALF + .4 }; }
const rectsHit = (R, S) => R.minX < S.maxX && R.maxX > S.minX && R.minZ < S.maxZ && R.maxZ > S.minZ;
function laneClear(x, z) {
  const R = laneRect(x, z);
  if (z - VAN_HALF < MAIN_RECT.minZ + 2 || z + VAN_HALF > MAIN_RECT.maxZ - 2) return false;
  if (obstacles.some(o => !o.gate && rectsHit(R, o))) return false;
  return !Object.values(AREAS).some(A => rectsHit(R, { minX: A.core.minX - 2, maxX: A.core.maxX + 2, minZ: A.core.minZ - 2, maxZ: A.core.maxZ + 2 }));
}
function resolveVanLanes() {
  MAP.vans = MAP.vans.map(([x, z]) => {
    for (const dz of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, -12, 15, -15, 18, -18]) if (laneClear(x, z + dz)) return [x, z + dz];
    return [x, z];
  });
  // then clear the road outside the fence of anything the map put there for looks (rocks, rubble): the van drives on it
  const box = new THREE.Box3();
  for (const [x, z] of MAP.vans) {
    const d = vanDir(x), edge = d < 0 ? MAIN_RECT.minX : MAIN_RECT.maxX, R = { minX: Math.min(edge, edge + d * 44), maxX: Math.max(edge, edge + d * 44), minZ: z - VAN_HALF - .6, maxZ: z + VAN_HALF + .6 };
    mapGroup.updateMatrixWorld(true);
    for (const c of [...mapGroup.children]) { if (!c.isMesh) continue; box.setFromObject(c); if (box.max.x > R.minX && box.min.x < R.maxX && box.max.z > R.minZ && box.min.z < R.maxZ && (d < 0 ? box.min.x + box.max.x < 2 * edge : box.min.x + box.max.x > 2 * edge)) { mapGroup.remove(c); const i = rayBlockers.indexOf(c); if (i >= 0) rayBlockers.splice(i, 1); } }
    for (let i = obstacles.length - 1; i >= 0; i--) if (rectsHit(R, obstacles[i]) && (d < 0 ? obstacles[i].minX + obstacles[i].maxX < 2 * edge : obstacles[i].minX + obstacles[i].maxX > 2 * edge)) obstacles.splice(i, 1);
  }
}
const inVanLane = (x, z, pad) => (MAP.vans || []).some(([vx, vz]) => { const R = laneRect(vx, vz); return x > R.minX - pad && x < R.maxX + pad && z > R.minZ - pad && z < R.maxZ + pad; });
