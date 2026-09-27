// ================= MAPS =================
// A map is data: its yard, gates into unlockable areas, the station each area holds, spawn points, where the
// mystery box / ammo crate / escape truck stand, and a build() for its buildings. loadMap() rebuilds everything.
const GATE_HALF = 2.6, BOX_COST = 950, AMMO_COST = 500;
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
const basic = c => new THREE.MeshBasicMaterial({ color: c });
function glowSprite(color, size, pos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1); s.position.copy(pos); return put(s);
}
function pointLight(color, i, d, x, y, z) { const l = new THREE.PointLight(color, i, d, 1.5); l.position.set(x, y, z); return put(l); }
function label(lines, color, size, x, y, z) { const s = textSprite(lines, color, size); s.position.set(x, y, z); return put(s); }
function lamp(x, z) {
  addBox(x, z, .2, .2, 4.2, poleMat);
  const bulb = put(new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), basic(0xffc070))); bulb.position.set(x, 4.25, z);
  const glow = glowSprite(0xffa040, 2.2, bulb.position);
  const light = pointLight(0xffa040, 1.7, 20, x, 4, z);
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
function grave(x, z) {
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

// ---------- the maps ----------
const MODS = {
  fog:   { name: 'SŰRŰ KÖD', sub: 'Alig látsz valamit.', label: 'Sűrű köd' },
  blood: { name: 'VÉRHOLD', sub: 'A zombik gyorsabbak, de másfélszer annyi pontot érnek.', label: 'Vérhold' },
  dark:  { name: 'ÁRAMSZÜNET', sub: 'A lámpák nem működnek.', label: 'Áramszünet' },
  horde: { name: 'HORDA', sub: 'Kétszer annyian jönnek, de gyengébbek.', label: 'Horda' },
  elite: { name: 'ELIT', sub: 'Az arany szeműek kétszer annyit bírnak, és biztosan zsákmányt ejtenek.', label: 'Elit zombik' },
};
const STATION_INFO = {
  forge: 'Fegyverkovács: szintemelés, ritkaság-emelés, elem.',
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
};
const MAP_IDS = Object.keys(MAPS);

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
function loadMap(id, seed) {
  MAP_ID = id; MAP = MAPS[id];
  scene.remove(mapGroup); mapGroup = new THREE.Group(); scene.add(mapGroup);
  obstacles.length = 0; rayBlockers.length = 0; rayBlockers.push(ground);
  lamps.length = 0; props.length = 0; trapState.length = 0; mapSpin.length = 0;
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
  buildFences();
  MAP.build();
  MAP.lamps.forEach(([x, z]) => lamp(x, z));
  SPAWNS.forEach(([x, z]) => { const m = put(new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, .12, 10), new THREE.MeshLambertMaterial({ color: 0x2a2116 }))); m.position.set(x, .06, z); });
  for (const k in AREAS) buildArea(AREAS[k]);
  buildBoxAndAmmo(); buildTruck();
  // dead trees beyond the fences
  const ext = allRectsBound();
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(8, 30);
    const x = clamp(Math.cos(a), -1, 1) * (Math.max(Math.abs(ext.minX), ext.maxX) + r), z = Math.sin(a) * (Math.max(Math.abs(ext.minZ), ext.maxZ) + r);
    if (Object.values(AREAS).some(A => inRect({ minX: A.core.minX - 4, maxX: A.core.maxX + 4, minZ: A.core.minZ - 4, maxZ: A.core.maxZ + 4 }, x, z))) continue;
    id === 'mill' ? pine(x, z) : deadTree(x, z);
  }
  generateProps(seed);
  baseFog = lerp(L.fogD[0], L.fogD[1], mulberry(seed + 1)());
  lamps.forEach((l, i) => { l.flicker = mulberry(seed + 7 + i)() < .35; });
  clearMod();
}
function allRectsBound() {
  const all = [MAIN_RECT, ...Object.values(AREAS).map(a => a.core)];
  return { minX: Math.min(...all.map(r => r.minX)), maxX: Math.max(...all.map(r => r.maxX)), minZ: Math.min(...all.map(r => r.minZ)), maxZ: Math.max(...all.map(r => r.maxZ)) };
}
function buildFences() {
  const R = MAIN_RECT, H = 2.3, T = .3, e = .2;
  const gaps = s => Object.values(AREAS).filter(a => a.side === s).map(a => a.at).sort((a, b) => a - b);
  const run = (from, to, gapList, place) => {
    let a = from;
    for (const g of gapList) { if (g - GATE_HALF > a) place(a, g - GATE_HALF); a = g + GATE_HALF; }
    if (to > a) place(a, to);
  };
  run(R.minX - e, R.maxX + e, gaps('n'), (a, b) => addBox((a + b) / 2, R.minZ - e, b - a, T, H, fenceMat));
  run(R.minX - e, R.maxX + e, gaps('s'), (a, b) => addBox((a + b) / 2, R.maxZ + e, b - a, T, H, fenceMat));
  run(R.minZ - e, R.maxZ + e, gaps('w'), (a, b) => addBox(R.minX - e, (a + b) / 2, T, b - a, H, fenceMat));
  run(R.minZ - e, R.maxZ + e, gaps('e'), (a, b) => addBox(R.maxX + e, (a + b) / 2, T, b - a, H, fenceMat));
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
  if (type === 'forge') {
    const metal = matStd({ color: 0x2c2d31, metalness: .6, roughness: .5 });
    addBox(x, z, 1.4, .6, .8, metal); addBox(x, z, 1.9, .5, .15, metal, .8);
    const fx = clamp(x + 6, c.minX + 3, c.maxX - 3), fz = clamp(z - 5, c.minZ + 3, c.maxZ - 3);
    addBox(fx, fz, 2.4, 2.4, 1.6, matStd({ color: 0x4a4038 }));
    put(new THREE.Mesh(new THREE.BoxGeometry(1.8, .1, 1.8), basic(0xff6a1a))).position.set(fx, 1.62, fz);
    glowSprite(0xff7a2a, 3.5, new V3(fx, 2.2, fz)); pointLight(0xff7a2a, 2, 16, fx, 2.5, fz);
    label(['KOVÁCS'], '#ffb070', 2.2, x, 2.4, z);
  } else if (type === 'well') {
    cylinderSolid(x, z, 1.45, .9, matStd({ color: 0x6a6a70 }));
    const water = put(new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), basic(0x5fd8ff))); water.rotation.x = -Math.PI / 2; water.position.set(x, .92, z);
    glowSprite(0x5fd8ff, 4, new V3(x, 1.6, z)); pointLight(0x5fd8ff, 1.6, 14, x, 2, z);
    label(['SZENT KÚT'], '#9feaff', 2.4, x, 2.6, z);
  } else if (type === 'trap') {
    const tc = a.gate.clone().addScaledVector(a.out, 2);
    a.st.zone = { minX: tc.x - 3.5, maxX: tc.x + 3.5, minZ: tc.z - 3.5, maxZ: tc.z + 3.5 };
    a.st.active = 0; a.st.cd = 0; a.st.cost = 750;
    a.st.light = pointLight(0xff6a1a, 0, 18, tc.x, 3, tc.z);
    addBox(x, z, .3, .3, 1.1, matStd({ color: 0x3a3a3a }));
    put(new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), basic(0xff3a1a))).position.set(x, 1.25, z);
    label(['CSAPDA'], '#ff8a4a', 2, x, 2.3, z);
    trapState.push(a.st);
  } else if (type === 'tower') {
    a.st.cost = 1200;
    const wood = new THREE.MeshLambertMaterial({ map: woodTex });
    const tx = clamp(cx - a.out.x * 6, c.minX + 5, c.maxX - 5), tz = clamp(cz - a.out.z * 6, c.minZ + 5, c.maxZ - 5);
    const txF = a.side === 'e' || a.side === 'w' ? cx + a.out.x * 5 : cx, tzF = a.side === 'n' || a.side === 's' ? cz + a.out.z * 5 : cz;
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) addBox(txF + dx, tzF + dz, .35, .35, 7, wood);
    addBox(txF, tzF, 7, 7, .3, wood, 7, false); addBox(txF, tzF, 7.6, 7.6, .25, matStd({ color: 0x2b2a2c }), 9.6, false);
    addBox(x, z, .9, .6, 1.3, matStd({ color: 0x2e3440, metalness: .4, roughness: .5 }));
    put(new THREE.Mesh(new THREE.PlaneGeometry(.6, .4), basic(0x7fb8ff))).position.set(x, 1.05, z + .31);
    label(['LÖVEGTORONY'], '#9fc8ff', 2.4, x, 2.3, z);
  }
}
function buildBoxAndAmmo() {
  const m = addBox(0, 0, 1.8, .9, .9, new THREE.MeshLambertMaterial({ map: woodTex, color: 0xc0b0ff }));
  box.mesh = m; box.obs = obstacles[obstacles.length - 1];
  box.label = label(['?'], '#9fe8ff', 1.4, 0, 2.1, 0); box.label.userData.text[3] = 'rgba(90,200,255,.55)'; drawTextSprite(box.label);
  box.beam = put(new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  box.light = pointLight(0x6fd6ff, 1.3, 9, 0, 1.8, 0);
  box.state = 'idle'; if (box.show) { scene.remove(box.show); box.show = null; }
  placeBox(Math.floor(mulberry(mapSeed + 3)() * BOX_SPOTS.length));
  const [ax, az] = MAP.ammo; ammoBox.pos.set(ax, 0, az);
  addBox(ax, az, 1.4, .8, .7, new THREE.MeshLambertMaterial({ color: 0x3f4f2c }));
  addBox(ax, az, 1.45, .82, .12, new THREE.MeshLambertMaterial({ color: 0xc7a03a }), .45, false);
  label(['AMMO'], '#e7c85a', 1.6, ax, 1.55, az);
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
  setVanAt(parked ? 0 : 30);
}
// off: metres the van is away from its spot along its lane (outward)
function setVanAt(off) {
  const x = truck.pos.x + truck.dir * off, z = truck.pos.z;
  truck.g.position.set(x, 0, z);
  truck.g.visible = inRect({ minX: MAIN_RECT.minX - 1.5, maxX: MAIN_RECT.maxX + 1.5, minZ: -1e4, maxZ: 1e4 }, x, z);
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
// returns false when it could not be placed; opts.rate speeds up fire, station marks the one rented at a tower
function deployTurret(cost, dur = 60, opts = {}) {
  if (opts.station ? turrets.some(t => t.station) : turrets.some(t => !t.station)) return false;
  if (player.points < cost) return false;
  player.points -= cost; SND.buy();
  const fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const p = player.pos.clone().addScaledVector(fwd, 1.6); clampBounds(p, .5);
  const g = new THREE.Group(), metal = matStd({ color: 0x3a4250, metalness: .6, roughness: .4 });
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(unitBox, metal); l.scale.set(.08, 1.1, .08); l.position.set(Math.sin(i * 2.1) * .3, .5, Math.cos(i * 2.1) * .3); l.rotation.set(Math.cos(i * 2.1) * .3, 0, -Math.sin(i * 2.1) * .3); g.add(l); }
  const head = new THREE.Group(); head.position.y = 1.15; g.add(head);
  const body = new THREE.Mesh(unitBox, metal); body.scale.set(.35, .3, .5); head.add(body);
  const barrel = new THREE.Mesh(unitBox, metal); barrel.scale.set(.08, .08, .6); barrel.position.z = .5; head.add(barrel);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .02), basic(0x7fb8ff)); eye.position.set(0, .06, .26); head.add(eye);
  g.position.copy(p); scene.add(g);
  turrets.push({ g, head, t: dur, cd: .5, rate: opts.rate || 1, station: !!opts.station });
  banner('LÖVEGTORONY TELEPÍTVE', `${Math.round(dur)} másodpercig lő mindenre, ami mozog.`);
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
  turret.cd = .18 / turret.rate;
  const dir = aim.clone().sub(from), len = dir.length();
  ray.set(from, dir.normalize()); ray.far = len;
  if (ray.intersectObjects(rayBlockers, false).length) return;
  tracer(from.clone().addScaledVector(dir, .7), aim, 0x9fc8ff, .015);
  hurtZombie(best, (20 + zombieHp() * .09) * SK.turret(), { color: '#9fc8ff' });
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
  }
  if (mission && mission.phase === 'evac' && truck.parked && near(truck.pos, 4)) return { type: 'truck' };
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
  }
}

// ---------- scattered props (seeded) ----------
const carMats = [0x3a4a52, 0x5a2a24, 0x4a4a3a, 0x2e3a2a].map(c => new THREE.MeshLambertMaterial({ color: c }));
const tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const barrelMat = new THREE.MeshLambertMaterial({ color: 0x4a4236 });
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
  for (const k in AREAS) { const a = AREAS[k]; pts.push([a.gate.x, a.gate.z, 5], [a.st.pos.x, a.st.pos.z, 4]); a.spawns.forEach(([x, z]) => pts.push([x, z, 3])); }
  return pts;
}
const overlaps = (x, z, r) => obstacles.some(o => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
function makeProp(type, x, z, rng) {
  const g = new THREE.Group(), obs = [], blk = [];
  const solid = (mesh, hx, hz, h) => { mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); blk.push(mesh); if (hx) obs.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h }); return mesh; };
  const boxM = (mat, sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(unitBox, mat); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); return m; };
  const turn = rng() < .5; // axis aligned so the collision boxes match
  const prop = { g, obs, blk, type, x, z };
  if (type === 'crate' || type === 'stack') {
    const s = 1.2 + rng() * .6;
    solid(boxM(crateMat, s, s, s, 0, s / 2, 0), s / 2, s / 2, s);
    if (type === 'stack') solid(boxM(crateMat, s * .8, s * .8, s * .8, rng() * .2, s + s * .4, rng() * .2));
  } else if (type === 'hay') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 1.8, 16), propHayMat);
    m.rotation.set(0, turn ? Math.PI / 2 : 0, Math.PI / 2); m.position.y = .85;
    solid(m, turn ? .9 : .85, turn ? .85 : .9, 1.7);
  } else if (type === 'barrel' || type === 'boom') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.1, 14), type === 'boom' ? boomBarrelMat : barrelMat);
    m.position.y = .55; solid(m, .42, .42, 1.1);
    if (type === 'boom') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .12, 14), basic(0xf2c12a)); band.position.y = .7; g.add(band);
      m.userData.onHit = () => blowBarrel(prop); // shooting it sets it off
    }
  } else if (type === 'car') {
    const mat = carMats[Math.floor(rng() * carMats.length)], L = 4, W = 1.9;
    const [hx, hz] = turn ? [W / 2, L / 2] : [L / 2, W / 2];
    solid(boxM(mat, turn ? W : L, .9, turn ? L : W, 0, .75, 0), hx, hz, 1.9);
    solid(boxM(mat, turn ? W * .9 : L * .5, .7, turn ? L * .5 : W * .9, 0, 1.55, 0));
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
      if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r) || overlaps(x, z, r + 1.2)) continue;
      makeProp(type, x, z, rng); placed++;
    }
  }
}

// ---------- mystery box moves ----------
function placeBox(i) {
  const [x, z] = BOX_SPOTS[i];
  box.spot = i; box.pos.set(x, 0, z);
  box.mesh.position.set(x, .45, z);
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
  activeMod = null; Object.assign(roundMod, { speed: 1, hp: 1, points: 1, elite: false, spawns: 1 });
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
}
function updateMapFx(dt) {
  mapSpin.forEach(m => m.rotation.z += dt * .4);
  if (activeMod === 'dark') return;
  for (const l of lamps) {
    if (!l.flicker) continue;
    const on = Math.sin(now * 23 + l.x) + Math.sin(now * 7.3 + l.z) > -.6 || Math.random() < .02;
    l.light.intensity = on ? 1.7 : .15; l.bulb.visible = l.glow.visible = on;
  }
}
