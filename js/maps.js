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
const cornMat = new THREE.MeshLambertMaterial({ map: cornTex, alphaTest: .4, side: THREE.DoubleSide, color: 0x3e4032 }); // the dim core of a row; the stalks stand in front of it
// corn: single stalks (stem, drooping leaves, a tassel, sometimes a cob), all in one instanced mesh that sways in the wind
const cornWind = { value: 0 }, cornStalks = [];
const cornGeo = (() => {
  const col = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3), k = new THREE.Color(c); for (let i = 0; i < n; i++) k.toArray(a, i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; };
  const parts = [col(new THREE.CylinderGeometry(.009, .016, 1, 5, 1, true).translate(0, .5, 0), 0x6f8a3a)];
  for (let k = 0; k < 5; k++) { // a leaf: a strip that rises off the stem and droops
    const L = new THREE.PlaneGeometry(.34, .045, 4, 1).rotateX(-Math.PI / 2), p = L.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + .17, w = 1 - x / .4; p.setXYZ(i, x, .55 * x - 2.2 * x * x, p.getZ(i) * w); }
    L.computeVertexNormals(); L.rotateY(k * 2.4 + .3).translate(0, .28 + k * .13, 0); parts.push(col(L, k < 2 ? 0x7a8a3c : 0x5f7a30));
  }
  for (let k = 0; k < 5; k++) parts.push(col(new THREE.CylinderGeometry(.002, .005, .16, 3).translate(0, .08, 0).rotateZ(k ? .5 : 0).rotateY(k * 1.26).translate(0, .99, 0), 0xb89a4a)); // the tassel: a few thin spikes
  parts.push(col(new THREE.CylinderGeometry(.022, .016, .15, 5).rotateZ(.35).translate(.03, .56, 0), 0xa8a860)); // a cob in its husk
  parts.forEach(g => { g.deleteAttribute('uv'); });
  return THREE.BufferGeometryUtils.mergeGeometries(parts);
})();
const cornStalkMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
cornStalkMat.onBeforeCompile = s => { s.uniforms.uWind = cornWind; s.vertexShader = 'uniform float uWind;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{ vec3 o = instanceMatrix[3].xyz; float w = sin(uWind * 1.3 + o.x * .31 + o.z * .23) + .35 * sin(uWind * 3.2 + o.x * 1.7 + o.z); float h = position.y * position.y; transformed.x += w * .045 * h; transformed.z += w * .025 * h; }
#endif`); };
function cornRow(x, z, w, d, h) { // blocks like the old box did (and hides what's behind it); the look is the stalks
  const m = addBox(x, z, w, d, h, cornMat), along = w >= d; m.scale.set(along ? w * .9 : w * .35, h * .62, along ? d * .35 : d * .9); m.position.y = h * .31; m.castShadow = false;
  const len = Math.max(w, d), thick = Math.min(w, d), lines = Math.max(2, Math.round(thick / .3));
  for (let l = 0; l < lines; l++) for (let t = -len / 2 + .12; t < len / 2; t += rand(.15, .26)) {
    const a = t + rand(-.06, .06), b = (l + .5) / lines * thick - thick / 2 + rand(-.08, .08);
    cornStalks.push([along ? x + a : x + b, along ? z + b : z + a, h * rand(.85, 1.2)]);
  }
}
function flushCorn() { // one draw for the whole field
  if (!cornStalks.length) return;
  const im = new THREE.InstancedMesh(cornGeo, cornStalkMat, cornStalks.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), p = new V3(), c = new THREE.Color();
  cornStalks.forEach(([x, z, h], i) => { e.set(rand(-.07, .07), rand(0, 6.28), rand(-.07, .07)); q.setFromEuler(e); s.set(h, h, h); m.compose(p.set(x, 0, z), q, s); im.setMatrixAt(i, m);
    im.setColorAt(i, c.setRGB(1, 1, 1).lerp(new THREE.Color(0xc8a868), Math.random() < .18 ? rand(.4, .8) : rand(0, .15))); }); // a few dried-out ones
  im.receiveShadow = true; im.frustumCulled = false; mapGroup.add(im); cornStalks.length = 0;
}

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
  swift: { name: 'FUTÓK ÉJSZAKÁJA', sub: 'A zombik 35%-kal gyorsabbak, de 30%-kal több pontot érnek.', label: 'Futók éjszakája' },
  tank:  { name: 'VASBŐR', sub: 'A zombik 60%-kal többet bírnak, de 40%-kal több pontot érnek.', label: 'Vasbőr' },
  cursed: { name: 'ÁTKOZOTT FÖLD', sub: 'Gyorsabb, szívósabb zombik, sok elit köztük. Cserébe másfélszer annyi pont.', label: 'Átkozott föld' },
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
  farm: { // core + three wings: a tight farmyard to start in; the barn, the cornfield and the graveyard open it up, each with its own spawns
    name: 'Holloway-farm', desc: 'Tanyaudvar a lakóházzal és a gépszínnel. Északra, szögesdróton túl három nagy rész nyitható: a csűr, a kukoricás és a temető.', minLevel: 1,
    noScale: true, innerFence: 'rail',
    main: { minX: -66, maxX: 66, minZ: -6, maxZ: 42 }, look: { tex: 'dirt', ground: 0x9a9a88, fog: 0x0a0f18, fogD: [.022, .031], fence: 0xffffff },
    vans: [[-46, 32], [46, 32], [-58, 10], [58, 18]], ammo: [-10, 8], boxSpots: [[14, 30], [-28, 10], [26, 4], [-8, 36]],
    spawns: [[-63, 22], [63, 26], [-22, 40], [24, 40]],
    lamps: [[-22, 14], [22, 14], [-40, 36], [40, 4]],
    clear: [[40, 24, 11], [-38, 24, 10], [0, 16, 6.5], [-12, 32, 5], [56, 2, 3], [18, 2, 3.5]],
    props: [['crate', 3], ['stack', 1.5], ['hay', 3], ['barrel', 2], ['boom', 1.2], ['car', .8], ['logs', 1]], propN: [18, 24],
    power: { turret: [0, 16], gens: [[-62, -12], [16, -58], [62, -30], [-62, 2]], boxes: [[-50, 38], [34, 38], [60, 36], [-30, 2], [10, 2], [-40, -52], [0, -20], [50, -16], [-56, -30], [34, -54]] },
    quest: { radio: [40, 17.6], parts: [[-56, -44], [-36, -36], [-14, -30], [2, -47], [34, -30], [58, -52], [-60, 40], [60, 40]] },
    build() {
      // the yard: farmhouse (the radio is on its porch), machine shed with a tractor, hay, the gun emplacement in the middle
      house(40, 24, 16, 10, 6, matStd({ color: 0xcfc6b0 }), 0x3a2420, 'n');
      addBox(40, 18.4, 16, 2.4, .2, matStd({ color: 0x3a2420 }), 2.8, false);
      [[32.5, 17.4], [47.5, 17.4]].forEach(([x, z]) => addBox(x, z, .2, .2, 2.8, poleMat));
      addBox(40, 17.6, 1.6, .8, .9, matStd({ color: 0x5a3a24 })); // the porch table
      shed(-38, 24, 16, 9, 4.2); tractor(-41, 24); tractor(-33, 25.5, .5);
      { const r = mulberry(11); for (const [x, z] of [[-14, 30], [-11, 33], [-15, 34], [-9, 29], [12, 36]]) makeProp('hay', x, z, r); wagon(-6, 33, .3); }
      cylinderSolid(18, 2, 1.6, 2.2, matStd({ color: 0x7a7c78, metalness: .4, roughness: .6 })); addBox(22, 2, 3, 1.2, .8, matStd({ color: 0x4a4a44 })); // fuel tank, water trough
      addBox(56, 2, .5, .5, 10, poleMat); { const hub = put(new THREE.Group()); hub.position.set(56, 10, 2.4); // windmill
        for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(unitBox, matStd({ color: 0x8a8378 })); b.scale.set(.35, 3.2, .06); b.position.y = 1.6; const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 3; arm.add(b); hub.add(arm); }
        mapSpin.push(hub); }
      // west wing, A csűr: a big barn you can walk through (doors at both ends and one to the yard), silos behind it
      hollow(-45, -32, 26, 14, 7, barnMat, { w: [[0, 6]], e: [[0, 6]], s: [[0, 3.2]] }, 0x2b2a2c);
      { const r = mulberry(12); for (const [x, z] of [[-55, -37], [-54, -27], [-36, -37.5], [-50, -38]]) makeProp('hay', x, z, r); }
      pointLight(0xffb060, 1.6, 16, -45, 5.5, -32);
      const siloM = matStd({ color: 0x8a8e90, metalness: .3, roughness: .6 }), capM = matStd({ color: 0x5a5e60 });
      [[-60, -50, 2.6, 12], [-53, -55, 2.1, 10]].forEach(([x, z, r, h]) => { cylinderSolid(x, z, r, h, siloM); put(new THREE.Mesh(new THREE.ConeGeometry(r + .2, 2, 16), capM)).position.set(x, h + 1, z); });
      logPile(-30, -50, 12);
      // middle wing, A kukoricás: a maze of corn, loops round a clearing with the holy well
      { const r = mulberry(13), clearing = (x, z) => Math.hypot(x, z + 36) < 8;
        for (const zr of [-13, -21, -29, -43, -51]) {
          const skip = new Set([Math.floor(r() * 9), Math.floor(r() * 9), zr === -13 ? 4 : Math.floor(r() * 9)]); // a few gaps a row; the first row always opens by the gate
          for (let k = 0; k < 9; k++) { const x = -18 + k * 4.5; if (skip.has(k) || clearing(x, zr)) continue; cornRow(x, zr, 4.2, 1.2, 2.6); }
        }
        for (const [x, z] of [[-10, -17], [10, -25], [-10, -47], [10, -47], [-14, -36], [14, -36]]) if (!clearing(x, z)) cornRow(x, z, 1.2, 5, 2.6);
        scarecrow(7, -25); scarecrow(-9, -52); }
      // east wing, A temető: graves in two fields, a ruined chapel you can go into, a crypt
      for (const [x0, x1] of [[30, 42], [52, 64]]) for (let x = x0; x <= x1; x += 3) for (let z = -14; z >= -34; z -= 4) grave(x + rand(-.4, .4), z + rand(-.4, .4));
      hollow(45, -46, 11, 14, 6, matStd({ map: stoneTex }), { s: [[0, 3.4]], e: [[-2, 4.5]], n: [[3, 2.5]] }, 0x2a2224, true);
      addBox(45, -52, 2.4, 1, 1, matStd({ map: stoneTex })); // the altar
      house(60, -24, 6, 6, 4, matStd({ map: stoneTex }), 0x2a2224, 'w');
      for (const [x, z] of [[30, -44], [36, -56], [62, -44], [56, -58]]) deadTree(x, z);
    },
    areas: {
      west:   { side: 'n', at: -45, name: 'A csűr', cost: 1000, core: { minX: -66, maxX: -24, minZ: -62, maxZ: -6 }, spawns: [[-64, -40], [-36, -60]], station: ['forge', -45, -29] },
      middle: { side: 'n', at: 0, name: 'A kukoricás', cost: 750, core: { minX: -21, maxX: 21, minZ: -62, maxZ: -6 }, spawns: [[-8, -60], [8, -60]], station: ['well', 0, -36] },
      east:   { side: 'n', at: 45, name: 'A temető', cost: 1250, core: { minX: 24, maxX: 66, minZ: -62, maxZ: -6 }, spawns: [[40, -60], [64, -40]], station: ['trap', 30, -10] },
    },
  },
  chapel: { // core + three wings: the churchyard with the church you can walk into; the crypt row, the parish house and the bone garden open it up
    name: 'Szent Mihály-kápolna', desc: 'Ködös templomkert egy bejárható templom körül. Kovácsoltvas kerítésen túl nyitható: a kripták sora, a plébánia és a csontkert.', minLevel: 2,
    noScale: true, innerFence: 'iron',
    main: { minX: -46, maxX: 46, minZ: -10, maxZ: 36 }, look: { tex: 'grass', ground: 0x7a8a72, fog: 0x0c1014, fogD: [.03, .04], fence: 0x55585e },
    vans: [[-38, 26], [38, 28], [-40, 4], [40, 8]], ammo: [-14, 20], boxSpots: [[14, 30], [-28, 12], [28, 14], [-12, 32]],
    spawns: [[-44, 32], [44, 20], [-44, -6], [44, -6]],
    lamps: [[-6, 20], [6, 20], [-24, 12], [24, 12], [-16, 33], [16, 33]],
    clear: [[0, 5, 12], [0, 24, 6], [16, 26, 4], [34, -4, 4], [-14, 20, 3]],
    props: [['crate', 1], ['barrel', 1], ['stack', 1], ['logs', 1]], propN: [6, 9],
    power: { turret: [0, 24], gens: [[-42, -52], [42, -14], [-18, 66], [-44, 2]], boxes: [[-30, 34], [30, 34], [-42, -8], [42, 30], [-10, -8], [20, -40], [-20, -26], [10, 64], [-4, 48], [40, -52]] },
    quest: { radio: [3.6, -2.4], drop: [-2, 2], parts: [[-40, -18], [-21, -50], [-6, -40], [12, -48], [40, -30], [-18, 52], [16, 68], [-42, 30]],
      txt: { names: ['HARANGKÖTÉL', 'HARANGNYELV', 'CSAPSZEG'], part: 'harangalkatrész', broken: 'Néma harang', use: 'Harang megkongatása', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Kongasd meg a harangot a templomban, a torony alatt.'],
        call: ['A HARANG SZÓL…', 'Az egész környék felébredt. Egy különleges csapat tart feléd!'], done: 'A HARANG ELHALLGATOTT', where: 'a templomban' } },
    build() {
      const stone = matStd({ map: stoneTex, color: 0x8a8884 }), pale = matStd({ color: 0x9a968c, roughness: .9 }), dark = matStd({ color: 0x2a2224 }), wood = matStd({ map: woodTex, color: 0x6a5038 });
      const brass = matStd({ color: 0xb8923a, metalness: .8, roughness: .35 }), gravel = matStd({ color: 0x6e6a62, roughness: 1 });
      // the church: a nave you walk into (the main door south, a side door each way), pews, the altar, the bell tower at the north end
      hollow(0, 6, 12, 20, 7, stone, { s: [[0, 3]], e: [[3, 2.4]], w: [[-4, 2.4]] }, 0x2a2224);
      for (let z = 2; z <= 13; z += 1.9) for (const x of [-2.9, 2.9]) { addBox(x, z, 3.8, .45, .5, wood); addBox(x, z + .22, 3.8, .08, .5, wood, .5, false); }
      addBox(0, -1.8, 3.4, 1.2, 1.1, pale); addBox(0, -1.8, 3.6, 1.4, .1, matStd({ color: 0xe8e2d0 }), 1.1, false);
      addBox(0, -3.7, .15, .15, 2.4, brass, 1.4, false); addBox(0, -3.7, 1.1, .15, .15, brass, 3.1, false); // the cross over the altar
      pointLight(0xffb060, 1.3, 14, 0, 5, 4); glowSprite(0xffb060, 1.4, new V3(-2.2, 1.5, -1.6)); glowSprite(0xffb060, 1.4, new V3(2.2, 1.5, -1.6)); // candles
      [[-2.2, -1.6], [2.2, -1.6]].forEach(([x, z]) => addBox(x, z, .12, .12, 1.4, matStd({ color: 0xe8e2d0 }), 0, false));
      addBox(0, -7, 5, 5, 15, stone); // the tower, an open belfry, the spire
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(a * 2.2, -7 + b * 2.2, .6, .6, 3.4, stone, 15, false);
      addBox(0, -7, 5.4, 5.4, .4, stone, 18.4, false);
      put(new THREE.Mesh(new THREE.ConeGeometry(3.6, 7, 4), dark)).position.set(0, 22.3, -7); addBox(0, -7, .2, .2, 2.2, brass, 25.6, false); addBox(0, -7, 1, .2, .2, brass, 26.6, false);
      for (const z of [0, 5, 10]) for (const x of [-6.05, 6.05]) addBox(x, z, .06, .9, 2.6, z === 5 ? glassLit : glassDark, 2.4, false); // tall windows, one lit
      const bell = put(new THREE.Mesh(new THREE.LatheGeometry([[0, 1], [.28, .98], [.36, .7], [.44, .3], [.62, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 18), matStd({ color: 0xb8923a, metalness: .8, roughness: .35, side: THREE.DoubleSide })));
      bell.position.set(0, 15.8, -7); addBox(0, -7, 2.8, .2, .2, wood, 17.1, false);
      addBox(3.6, -3.1, .05, .05, 3, matStd({ color: 0x8a7a5a }), 1.2, false); // the bell rope hangs down inside, snapped short
      addBox(0, 22, 2.4, 12, .02, gravel, 0, false); addBox(0, 10.8, 92, 2, .02, gravel, 0, false); // gravel paths
      for (const x of [-24, 24]) addBox(x, 0, 2, 20, .02, gravel, 0, false);
      // the graves: two fields either side, rows kept clear for the paths, the vans and the spawn points
      const keep = [[0, 5, 9], [0, 24, 6], [16, 26, 3.6], [34, -4, 4], [-14, 20, 2.6], ...this.vans.map(([x, z]) => [x, z, 5]), ...this.spawns.map(([x, z]) => [x, z, 3.5]), ...this.lamps.map(([x, z]) => [x, z, 1.4])];
      for (let x = -42; x <= 42; x += 3) for (let z = -7; z <= 33; z += 3.4) {
        if (Math.abs(x) < 10 || Math.abs(z - 10.8) < 2 || Math.abs(Math.abs(x) - 24) < 2.2 && z < 11 || keep.some(([a, b, r]) => Math.hypot(x - a, z - b) < r) || Math.abs(x) > 34 && Object.values(this.vans).some(([, vz]) => Math.abs(z - vz) < 3.5)) continue;
        if (mulberry(x * 31 + z * 17)() < .82) grave(x + rand(-.3, .3), z + rand(-.3, .3));
      }
      // the old yew, a caretaker's shed with a wheelbarrow
      cylinderSolid(16, 26, .6, 3.2, barkMat); for (const [a, b, c, r] of [[0, 4.4, 0, 2.6], [1.3, 3.6, .8, 1.9], [-1.2, 3.8, -.6, 2], [.2, 5.8, -.3, 1.8]]) deco(new THREE.SphereGeometry(r, 9, 7), matStd({ color: 0x18261a, flatShading: true }), 16 + a, b, 26 + c);
      shed(34, -4, 6, 4, 2.8); addBox(33, -4, 1.2, .7, .5, wood, .3); addBox(36, -4, 2, 1, .6, matStd({ color: 0x3a3a38 }));
      // --- west wing, A kripták sora: an avenue of family tombs under cypresses, the big crypt at the end
      const tomb = (x, z, door, open) => {
        if (open) hollow(x, z, 5, 5.6, 3.6, stone, { [door]: [[0, 1.8]] }, 0x2a2224); else house(x, z, 5, 5.6, 3.6, stone, 0x2a2224, door);
        const o = door === 'e' ? [2.8, 0] : [-2.8, 0]; for (const s of [-1, 1]) addBox(x + o[0], z + s * 1.5, .5, .5, 3.6, pale);
        label([pick(['FAMÍLIA', 'NYUGODJ', 'IN PACE', 'MEMENTO'])], '#b8b2a4', .9, x + o[0] * 1.02, 3.9, z);
      };
      [-18, -26, -34, -42].forEach((z, i) => { tomb(-37, z, 'e', i === 1); tomb(-11, z, 'w', i === 2); }); // tombs a lighter stone than the church
      for (const x of [-37, -11]) for (const z of [-18, -26, -34, -42]) addBox(x, z, 5.4, 6, .3, matStd({ color: 0x4a4844 }), 3.6, false);
      const cypress = (x, z) => { deco(new THREE.CylinderGeometry(.12, .16, 1.2, 6), barkMat, x, .6, z); deco(new THREE.ConeGeometry(.9, 6.5, 8), matStd({ color: 0x142016 }), x, 4.2, z); obstacles.push({ minX: x - .4, maxX: x + .4, minZ: z - .4, maxZ: z + .4, h: 5 }); };
      for (let z = -16; z >= -44; z -= 7) { cypress(-30, z); cypress(-18, z); }
      const angel = (x, z, turn) => { const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = turn;
        deco(unitBox, stone, 0, .5, 0, 1, 1, 1, g); deco(new THREE.CylinderGeometry(.22, .34, 1.5, 8), pale, 0, 1.75, 0, 1, 1, 1, g); deco(new THREE.SphereGeometry(.17, 8, 6), pale, 0, 2.66, 0, 1, 1, 1, g);
        for (const s of [-1, 1]) deco(unitBox, pale, s * .38, 2.1, -.18, .06, 1.1, .5, g).rotation.set(.25, 0, s * .45);
        obstacles.push({ minX: x - .55, maxX: x + .55, minZ: z - .55, maxZ: z + .55, h: 3 }); };
      angel(-24, -30, 0); angel(-24, -44, Math.PI);
      hollow(-24, -51, 11, 8, 5, stone, { s: [[0, 2.6]] }, 0x2a2224); label(['HOLLOWAY CSALÁD'], '#b8b2a4', 1.3, -24, 6, -46.8); // the family crypt
      addBox(-24, -52.5, 2.4, 1, .9, pale); pointLight(0x7a9aff, .9, 9, -24, 3, -51);
      // --- east wing, A plébánia: the parish house, a dead orchard, the garden beds, a glasshouse
      const plaster = matStd({ color: 0x8e8674 });
      hollow(33, -22, 13, 9, 4.6, plaster, { w: [[0, 2.2]], s: [[3, 2]] }, 0x3a2420); addBox(37, -20, .8, .8, 3, matStd({ color: 0x5a3a2a }), 5, false);
      for (const x of [28, 31.5]) addBox(x, -17.45, 1.2, .06, 1.2, x === 28 ? glassLit : glassDark, 1.4, false); for (const x of [29, 33, 37]) addBox(x, -26.55, 1.2, .06, 1.2, glassDark, 1.4, false);
      addBox(33, -23, 2.4, 1.2, .8, wood); addBox(38, -25, 1.4, 1, 1.8, wood); addBox(29, -25.2, 2.2, .6, 2, wood); // table, a dresser, the bookshelf
      for (let x = 8; x <= 22; x += 4.5) for (let z = -48; z <= -30; z += 5) deadTree(x + rand(-.6, .6), z + rand(-.6, .6));
      const soil = matStd({ color: 0x3a2a1c });
      for (let i = 0; i < 4; i++) addBox(30 + i * 3.2, -34, 2.2, 5, .3, soil);
      const glass = new THREE.MeshLambertMaterial({ color: 0x9ab8c0, transparent: true, opacity: .22, depthWrite: false });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) addBox(38 + a * 4, -48 + b * 2.6, .12, .12, 2.6, steelMat);
      for (const [w, d, x, z] of [[8, .05, 38, -50.6], [8, .05, 38, -45.4], [.05, 5.2, 34, -48]]) addBox(x, z, w, d, 2.6, glass, 0, false);
      addBox(38, -48, 8.2, 5.4, .06, glass, 2.6, false); addBox(38, -48, 7, 1, .9, wood);
      // --- south wing, A csontkert: plague pits, the lime, the ossuary in ruins, a cart left behind
      for (const [x, z] of [[-12, 44], [10, 46], [-10, 60], [12, 58]]) { addBox(x, z, 5, 3, .03, matStd({ color: 0x14100c }), 0, false); addBox(x + 3.6, z, 1.4, 3.4, .8, soil); }
      const bone = matStd({ color: 0xd8d0b8 });
      for (let k = 0; k < 26; k++) { const x = rand(-3, 3), z = 64 + rand(-2, 2); deco(k % 3 ? new THREE.CylinderGeometry(.05, .05, .5, 5) : new THREE.SphereGeometry(.13, 7, 5), bone, x, .1, z).rotation.set(rand(0, 3), rand(0, 3), Math.PI / 2); }
      hollow(0, 64, 10, 8, 5, stone, { n: [[0, 2.6]], w: [[1, 2]] }, 0x2a2224, true);
      for (let x = -18; x <= 18; x += 2.2) for (const z of [40, 52, 70]) if (Math.abs(x) > 6 || z === 40) { if (Math.random() < .3) continue; const cx = x + rand(-.3, .3); addBox(cx, z, .12, .12, 1.3, railWood, 0, false).rotation.z = rand(-.12, .12); addBox(cx, z, .6, .1, .1, railWood, .95, false); } // wooden crosses over the mass graves
      for (const [x, z] of [[-19, 44], [19, 60], [-18, 68]]) deadTree(x, z);
      for (let k = 0; k < 6; k++) addBox(16 + (k % 3) * .8, 40 + Math.floor(k / 3) * .7, .7, .6, .4, matStd({ color: 0xd8d4c8 }), Math.floor(k / 3) * .4);
      wagon(-16, 64, true);
    },
    areas: {
      west: { side: 'n', at: -24, name: 'A kripták sora', cost: 1000, core: { minX: -46, maxX: -3, minZ: -56, maxZ: -10 }, spawns: [[-44, -54], [-5, -54]], station: ['trap', -16, -13] },
      east: { side: 'n', at: 24, name: 'A plébánia', cost: 1250, core: { minX: 3, maxX: 46, minZ: -56, maxZ: -10 }, spawns: [[5, -54], [44, -54]], station: ['well', 24, -40] },
      south: { side: 's', at: 0, name: 'A csontkert', cost: 750, core: { minX: -22, maxX: 22, minZ: 36, maxZ: 72 }, spawns: [[-20, 70], [20, 70]], station: ['forge', -12, 52] },
    },
  },
  gas: { // core + three wings: the forecourt on Route 9 with the shop you walk into; the junkyard, the motel and the truck stop open it up
    name: 'Route 9 benzinkút', desc: 'Kiégett töltőállomás az országúton: kút, bolt, egy lerobbant kamion. Drótkerítésen túl nyitható: a roncstelep, a motel és a kamionparkoló.', minLevel: 3,
    noScale: true, innerFence: 'chain',
    main: { minX: -50, maxX: 50, minZ: -12, maxZ: 34 }, look: { tex: 'asphalt', ground: 0x8a8a90, fog: 0x0b0d12, fogD: [.022, .03], fence: 0x8a8e94 },
    vans: [[-44, 29], [44, 30], [-44, 6], [44, 2]], ammo: [-14, 16], boxSpots: [[12, 24], [-34, 14], [34, -6], [-8, -8]],
    spawns: [[-48, 18], [48, 16], [-48, -8], [48, -8]],
    lamps: [[-16, 13], [16, 13], [-40, 20], [40, 21], [-36, -8], [34, -9]],
    clear: [[0, 4, 12], [-28, 2, 10], [0, 17, 6], [26, 14, 9], [24, 24, 3], [0, 30, 5]],
    props: [['car', 2.5], ['barrel', 2], ['boom', 2.5], ['crate', 1.5], ['stack', 1]], propN: [12, 16],
    power: { turret: [0, 17], gens: [[-46, -50], [46, -16], [18, 68], [-47, -2]], boxes: [[-34, 26], [34, 26], [-44, -10], [44, 12], [-6, -10], [20, -40], [-26, -36], [8, 64], [-16, 44], [40, -43]] },
    quest: { radio: [19, 11.6], drop: [-2, -1], parts: [[-40, -24], [-20, -52], [-8, -30], [12, -28], [44, -44], [-16, 66], [18, 46], [-46, 12]],
      txt: { names: ['AKKUMULÁTOR', 'INDÍTÓKULCS', 'ÉKSZÍJ'], part: 'kamionalkatrész', broken: 'Lerobbant kamion', use: 'Kamion beindítása (duda)', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Indítsd be a kamiont a töltőállomás mellett.'],
        call: ['A DUDA VÉGIGBŐGI A VIDÉKET…', 'Egy különleges csapat tart feléd. Öld meg mindet!'], done: 'A KAMION MOTORJA LEFULLADT', where: 'a kamion mellett' } },
    build() {
      const white = matStd({ color: 0xd8d6cc }), red = matStd({ color: 0xa82a22 }), concrete = matStd({ color: 0x9a9a94, roughness: 1 }), dark = matStd({ color: 0x1a1a1c });
      const rust = matStd({ color: 0x6a3a24, roughness: .9 }), wood = matStd({ map: woodTex, color: 0x6a5038 }), plaster = matStd({ color: 0xb8b4a8 });
      // Route 9: lines on the road along the south edge
      for (let x = -48; x < 48; x += 5) addBox(x, 30, 2.6, .18, .02, basic(0xd8b43a), 0, false);
      for (const z of [26.2, 33.6]) addBox(0, z, 100, .14, .02, basic(0xb8b8b0), 0, false);
      addBox(0, 6, 44, 20, .02, concrete, 0, false); // the forecourt slab
      // the canopy over three pump islands, lit from under
      for (const [a, b] of [[-9, -.5], [9, -.5], [-9, 8.5], [9, 8.5]]) addBox(a, b, .5, .5, 5.2, white);
      addBox(0, 4, 21, 11, .5, white, 5.2, false); addBox(0, 4, 21.2, 11.2, .35, red, 5.7, false);
      label(['ROUTE 9'], '#ff5a3a', 1.6, 0, 6.6, 9.8);
      for (const x of [-6, 0, 6]) { addBox(x, 4, 1.4, 4.2, .25, concrete); for (const z of [2.9, 5.1]) { addBox(x, z, .8, .55, 1.7, red, .25); addBox(x, z, .6, .57, .4, basic(0x2a3a2a), 1.3, false); } }
      glowSprite(0xe8f0ff, 3, new V3(0, 5, 4)); pointLight(0xdce8ff, 1.5, 18, 0, 4.8, 4);
      // the shop: walk in by the front door (or the side one); shelves, the counter, windows lit
      hollow(-28, 2, 16, 10, 4.2, plaster, { s: [[3, 2]], e: [[0, 2]] }, 0x3a3a3e);
      for (const x of [-34, -31]) addBox(x, 7.03, 2.4, .06, 1.5, glassLit, 1, false);
      addBox(-28, 7.1, 16.4, .3, .6, red, 4.2, false); label(['BOLT · 24 H'], '#ffd8a0', 1.3, -28, 5.4, 7.4);
      for (const z of [-1, 2]) { addBox(-32, z, 5, .7, 1.7, wood); for (let k = 0; k < 6; k++) addBox(-34.2 + k * .85, z, .5, .75, .3, basic([0xc8283a, 0x3a8ad8, 0xe8c83a][k % 3]), 1.72, false); }
      addBox(-23, -.5, .9, 4.5, 1.1, wood); addBox(-23, -1.5, .5, .5, .4, dark, 1.1, false); // the counter and the till
      pointLight(0xdcecff, 1.2, 12, -28, 3.6, 2); addBox(-28, 2, 6, .3, .08, basic(0xe8f4ff), 4.1, false); // a strip light still on
      addBox(-36.5, 7.6, 1.8, 1.2, 1.4, matStd({ color: 0x2a4a3a })); // a dumpster
      addBox(-19.6, 6.8, .9, .7, 1.3, matStd({ color: 0xd8e0e8 })); label(['JÉG'], '#9fd8ff', .7, -19.6, 1.7, 7.2);
      // the big pole sign by the road
      addBox(24, 24, .5, .5, 9, steelMat); addBox(24, 24, 5.2, .5, 3, matStd({ color: 0xe8e2d0 }), 8.5, false); label(['GAS', '$ 3.19'], '#ff5a3a', 2.4, 24, 10, 24.4);
      // the semi truck left by the pumps: cab facing west, a long trailer (its horn is the map's challenge)
      const truckRig = (x, z, col, trailer = true) => {
        addBox(x, z, 3, 2.6, 1.6, col, .6); addBox(x + .3, z, 2.4, 2.5, 1.4, col, 2.2); addBox(x - .93, z, .06, 2.1, .8, glassDark, 2.6, false);
        addBox(x - 1.52, z, .1, 2.2, .7, matStd({ color: 0x8a8e94, metalness: .6, roughness: .4 }), .8, false);
        for (const a of [-.8, 1]) for (const b of [-1.2, 1.2]) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .35, 14), dark)); w.rotation.x = Math.PI / 2; w.position.set(x + a, .55, z + b); }
        if (trailer) { addBox(x + 8.1, z, 12, 2.6, 2.9, matStd({ color: 0xb8bcc0, metalness: .3, roughness: .6 }), 1.1); for (const a of [4, 5.2, 12.6, 13.4]) for (const b of [-1.2, 1.2]) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .3, 12), dark)); w.rotation.x = Math.PI / 2; w.position.set(x + a, .5, z + b); } }
      };
      truckRig(19, 14, red); addBox(19, 12.6, .6, .06, .9, dark, 1.2, false); // the cab door hangs open
      // --- west wing, A roncstelep: walls of crushed cars, a magnet crane, the crusher, the yard office
      const wreckC = [0x6a3a24, 0x4a4a4e, 0x3a4a5a, 0x5a2a24, 0x6a6a5a, 0x2e3a2a].map(c => matStd({ color: c, roughness: .9 }));
      const stack = (x, z, n, alongX) => { const w = alongX ? 4.2 : 1.9, d = alongX ? 1.9 : 4.2; for (let k = 0; k < n; k++) addBox(x + rand(-.15, .15), z + rand(-.1, .1), w, d, .9, wreckC[(k + Math.abs(x | 0)) % wreckC.length], k * .9, false).rotation.y = rand(-.06, .06);
        obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: n * .9 }); };
      for (const [z, gaps] of [[-22, [2, 6]], [-33, [0, 5, 8]], [-44, [3, 7]]]) for (let k = 0; k < 9; k++) if (!gaps.includes(k)) stack(-46 + k * 4.4, z, 2 + (k * 7 + z) % 3, true);
      for (let k = 0; k < 6; k++) { const t = put(new THREE.Mesh(new THREE.TorusGeometry(.42, .16, 6, 12), dark)); t.rotation.x = Math.PI / 2; t.position.set(-8 + (k % 2) * .2, .16 + k * .3, -18); }
      addBox(-8, -18, 1, 1, 1.8, dark, 0, true).visible = false;
      addBox(-40, -50, 1.2, 1.2, 13, matStd({ color: 0xc8a020 })); addBox(-36, -50, 10, .7, .7, matStd({ color: 0xc8a020 }), 12.6, false);
      addBox(-32, -50, .05, .05, 6, dark, 6.6, false); put(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .4, 16), dark)).position.set(-32, 6.4, -50);
      addBox(-12, -49, 6, 3.4, 2.4, matStd({ color: 0x3a4a5a, metalness: .4 })); addBox(-12, -49, 6.2, 3.6, .5, dark, 3.2, false); label(['PRÉS'], '#ffd23f', 1, -12, 4.2, -47.2);
      addBox(-44, -16, 7, 3, 2.8, matStd({ color: 0xc8c0a0 })); addBox(-43, -14.47, 1.2, .06, .9, glassLit, 1.2, false); addBox(-46.5, -14.47, .9, .06, 2, doorMat, 0, false); label(['IRODA'], '#e8e2d0', .9, -44, 3.4, -14.3);
      // --- east wing, A motel: the long row of rooms with a walkway, the drained pool, the neon sign
      addBox(28, -51, 36, 7, 3.4, matStd({ color: 0xa89a82 })); addBox(28, -46.6, 36.6, 2.2, .2, dark, 3.2, false);
      for (let x = 11; x <= 45; x += 4.25) { addBox(x, -47.44, 1, .06, 2.2, doorMat, 0, false); addBox(x + 1.6, -47.44, 1.2, .06, 1, Math.random() < .25 ? glassLit : glassDark, 1.1, false); addBox(x - 2.1, -45.7, .15, .15, 3.2, poleMat); }
      hollow(8, -51, 4.6, 7, 3.4, matStd({ color: 0xa89a82 }), { s: [[0, 1.4]] }, 0x2a2a2e); addBox(7, -53, 2, 2.4, .6, matStd({ color: 0x7a5a6a })); // the one room with its door kicked in: a bed
      const tile = matStd({ color: 0x3a7a9a, roughness: .3 });
      addBox(24, -30, 12, 7, .02, tile, 0, false); for (const [w, d, x, z] of [[12.8, .4, 24, -33.7], [12.8, .4, 24, -26.3], [.4, 7.8, 17.8, -30], [.4, 7.8, 30.2, -30]]) addBox(x, z, w, d, .35, concrete);
      addBox(29, -33.3, .6, .06, 1.2, steelMat, 0, false); // the ladder
      addBox(12, -16, .4, .4, 8, steelMat); addBox(12, -16, 5, .4, 1.8, matStd({ color: 0x2a1a2a }), 7, false); label(['MOTEL', 'SZOBA VAN'], '#ff6ad8', 1.8, 12, 8.6, -15.6); pointLight(0xff4ac8, 1.1, 12, 12, 7, -15);
      addBox(46, -34, .9, .7, 1.9, matStd({ color: 0xc8283a })); glowSprite(0xff6a6a, 1.4, new V3(46, 1.4, -33.5));
      // --- south wing, A kamionparkoló: two rigs parked, the diner with its counter
      truckRig(-2, 44, matStd({ color: 0x2a4a7a })); truckRig(-6, 52, matStd({ color: 0x3a5a2a }));
      const chrome = matStd({ color: 0xc8ccd0, metalness: .6, roughness: .35 });
      hollow(-10, 64, 14, 8, 3.8, chrome, { e: [[0, 2]], n: [[3, 2]] }, 0x2a2a2e);
      addBox(-12, 64, 7, .9, 1.1, matStd({ color: 0xc8283a })); for (let k = 0; k < 5; k++) cylinderSolid(-15 + k * 1.5, 62.8, .25, .7, chrome);
      for (const x of [-15, -11, -7]) addBox(x, 59.97, 2, .06, 1.2, glassLit, 1.2, false);
      label(['DINER'], '#6ae8ff', 2, -10, 5.8, 59.6); pointLight(0x6ae8ff, .9, 12, -10, 4, 58);
    },
    areas: {
      west: { side: 'n', at: -26, name: 'A roncstelep', cost: 1000, core: { minX: -50, maxX: -4, minZ: -56, maxZ: -12 }, spawns: [[-48, -54], [-8, -54]], station: ['forge', -14, -27] },
      east: { side: 'n', at: 26, name: 'A motel', cost: 1250, core: { minX: 4, maxX: 50, minZ: -56, maxZ: -12 }, spawns: [[8, -40], [48, -40]], station: ['well', 40, -26] },
      south: { side: 's', at: 0, name: 'A kamionparkoló', cost: 750, core: { minX: -22, maxX: 22, minZ: 34, maxZ: 72 }, spawns: [[-20, 70], [20, 70]], station: ['tower', 14, 64] },
    },
  },
  mill: { // core + three wings: the log yard with the saw shed and the engine house; the lake shore, the logging camp and the drying yard open it up
    name: 'Fűrésztelep', desc: 'Erdei fűrésztelep: fűrészcsarnok, gépház magas kéménnyel, fűrészporégető. Korláton túl nyitható: a tópart, az erdei tábor és a szárítóudvar.', minLevel: 5,
    noScale: true, innerFence: 'rail',
    main: { minX: -48, maxX: 48, minZ: -8, maxZ: 38 }, look: { tex: 'dirt', ground: 0xa8946c, fog: 0x0a0e10, fogD: [.024, .034], fence: 0xffffff },
    vans: [[-42, 32], [42, 32]], ammo: [-4, 34], boxSpots: [[8, 32], [-36, 4], [36, 30], [-40, 20]],
    spawns: [[-46, 30], [46, 28], [-30, -6], [30, -6]],
    lamps: [[-6, 20], [6, 20], [-34, 30], [30, 26], [-40, 0], [40, 2]],
    clear: [[-18, 12, 12], [14, 2, 7], [34, 14, 7], [0, 24, 6], [-38, 28, 4], [-12, 31, 4], [24, 31, 4]],
    props: [['logs', 3], ['stack', 2], ['crate', 1.5], ['barrel', 1.5], ['boom', 1]], propN: [10, 14],
    power: { turret: [0, 24], gens: [[-88, 20], [88, -4], [20, -48], [-46, -2]], boxes: [[-38, 36], [30, 36], [-46, 12], [46, 12], [-4, -6], [-70, -4], [70, 20], [-20, -30], [20, -20], [-86, 6]] },
    quest: { radio: [12, 4], drop: [0, -2], parts: [[-80, 18], [-56, -7], [-20, -46], [22, -40], [60, 20], [86, 0], [-44, 14], [44, 34]],
      txt: { names: ['SZELEP', 'NYOMÁSMÉRŐ', 'SÍPFEJ'], part: 'gőzgépalkatrész', broken: 'Hideg gőzgép', use: 'Gőzsíp megfújása', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Fújd meg a gőzsípot a gépházban.'],
        call: ['A GŐZSÍP VÉGIGSIVÍT AZ ERDŐN…', 'Egy különleges csapat tart feléd. Öld meg mindet!'], done: 'A GŐZSÍP ELHALLGATOTT', where: 'a gépházban' } },
    build() {
      const plank = matStd({ map: plankTex, color: 0x9a8062 }), wood = matStd({ map: woodTex, color: 0x6a5038 }), dark = matStd({ color: 0x1a1a1c }), brick = matStd({ color: 0x7a4a36 });
      const rust = matStd({ color: 0x6a3a24, roughness: .9 }), steel = matStd({ color: 0xb8bcc0, metalness: .8, roughness: .3 }), logM = matStd({ color: 0x5a4028 }), cut = matStd({ color: 0xc8a878 });
      // the saw shed: open at both ends and to the yard; the head saw, the log carriage on its rails, sawdust
      hollow(-18, 12, 22, 12, 6, plank, { s: [[0, 8]], n: [[4, 5]], e: [[0, 5]], w: [[0, 4]] }, 0x3a3530);
      addBox(-18, 12, 3, 1.6, 1, dark); const blade = put(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .06, 32), steel)); blade.rotation.x = Math.PI / 2; blade.position.set(-18, 1.6, 12);
      for (const z of [10.6, 13.4]) addBox(-18, z, 20, .12, .1, steel, .05, false);
      addBox(-24, 12, 3, 2.4, .5, wood, .2); const log = put(new THREE.Mesh(new THREE.CylinderGeometry(.55, .6, 6, 12), logM)); log.rotation.z = Math.PI / 2; log.position.set(-24, 1.2, 12); rayBlockers.push(log);
      addBox(-18, 12, 20, 11, .03, matStd({ color: 0xc8b088 }), 0, false); // sawdust on the floor
      for (let k = 0; k < 5; k++) addBox(-11, 8 + k * 1.1, 4.6, .9, .25 + (k % 2) * .25, cut, 0); // fresh boards stacked
      pointLight(0xffb060, 1.2, 14, -18, 5, 12);
      // the engine house: brick, a boiler inside, a tall chimney (the whistle's up on it)
      hollow(14, 2, 9, 8, 5, brick, { s: [[-1.5, 2]], w: [[0, 2]] }, 0x2a2a2e);
      const boiler = put(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 5, 16), matStd({ color: 0x2a2c30, metalness: .5 }))); boiler.rotation.z = Math.PI / 2; boiler.position.set(15, 1.4, 1); rayBlockers.push(boiler);
      obstacles.push({ minX: 12.3, maxX: 17.7, minZ: -.4, maxZ: 2.4, h: 2.7 }); glowSprite(0xff6a1a, .7, new V3(12.4, .8, 2.3)); addBox(12.4, 2.3, .8, .1, .6, basic(0xff6a1a), .5, false); // the firebox, still warm
      cylinderSolid(19, -1, .8, 18, brick); addBox(19, -1, 1.9, 1.9, .5, brick, 17.8, false); addBox(19, -1, .25, .25, 1.2, brassMat, 18.3, false);
      // the wigwam burner: a rusty cone that ate the sawdust, glowing at the top
      cylinderSolid(34, 14, 4.2, 1, rust); put(new THREE.Mesh(new THREE.ConeGeometry(4.6, 11, 16, 1, true), matStd({ color: 0x5a3020, roughness: .9, side: THREE.DoubleSide }))).position.set(34, 6.5, 14);
      put(new THREE.Mesh(new THREE.SphereGeometry(.9, 12, 8), basic(0xff7a2a))).position.set(34, 11.4, 14); glowSprite(0xff7a2a, 4, new V3(34, 11.6, 14)); pointLight(0xff6a1a, 1.4, 20, 34, 3, 14);
      addBox(28, 14, 6, .8, .8, rust, 3.4, false).rotation.z = -.4; // the feed chute
      // log decks, a log truck
      logPile(-38, 28); logPile(-12, 31); logPile(24, 31, 12);
      addBox(-30, 36, 3, 2.4, 1.8, matStd({ color: 0x3a5a2a }), .6); addBox(-24, 36, 9, 2.4, .4, dark, .9); for (let k = 0; k < 6; k++) { const l = put(new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 8.6, 10), logM)); l.rotation.z = Math.PI / 2; l.position.set(-24, 1.6 + Math.floor(k / 3) * .6, 35.3 + (k % 3) * .7); }
      obstacles.push({ minX: -31.5, maxX: -19.5, minZ: 34.8, maxZ: 37.2, h: 2.8 });
      // --- north wing, A tópart: a still pond, the boathouse, a pier, reeds; a canoe
      const water = put(new THREE.Mesh(new THREE.CircleGeometry(1, 40), matStd({ color: 0x0e1a20, roughness: .08, metalness: .6 }))); water.rotation.x = -Math.PI / 2; water.scale.set(13, 8, 1); water.position.set(-2, .03, -36);
      obstacles.push({ minX: -13, maxX: 9, minZ: -42, maxZ: -30, h: 1.2 }); // you don't swim here
      for (let k = 0; k < 40; k++) { const a = rand(0, 6.28), x = -2 + Math.cos(a) * 13.3 * rand(.95, 1.08), z = -36 + Math.sin(a) * 8.3 * rand(.95, 1.08); if (Math.abs(x) < 3 && z > -30) continue; deco(unitBox, matStd({ color: 0x4a5a2a }), x, .6, z, .05, 1.2 + rand(0, .6), .05).rotation.set(rand(-.2, .2), 0, rand(-.2, .2)); }
      addBox(-2, -28.5, 2.2, 6, .2, wood, .35, false); for (const [a, b] of [[-1, -31], [1, -31], [-1, -26.5], [1, -26.5]]) addBox(-2 + a, b, .2, .2, .5, wood, 0, false); // the pier
      hollow(18, -38, 9, 11, 4, plank, { w: [[0, 3]], s: [[2, 2]] }, 0x2a2a2e); const canoe = put(new THREE.Mesh(new THREE.CapsuleGeometry(.45, 3.6, 4, 8), matStd({ color: 0x8a2a1c }))); canoe.rotation.x = Math.PI / 2; canoe.scale.set(1, 1, .5); canoe.position.set(18, .5, -38);
      const tree = (x, z) => { pine(x, z); obstacles.push({ minX: x - .45, maxX: x + .45, minZ: z - .45, maxZ: z + .45, h: 4 }); };
      for (const [x, z] of [[-22, -14], [22, -14], [-22, -50], [8, -50], [-10, -50], [-24, -32], [-20, -40], [14, -24], [24, -28], [4, -16], [-8, -18], [24, -50], [12, -46]]) tree(x + rand(-.8, .8), z + rand(-.8, .8));
      // --- west wing, Az erdei tábor: the bunkhouse you can walk into, tents round the campfire, the cook's table
      const logWall = matStd({ map: woodTex, color: 0x5a4028 });
      hollow(-80, 14, 12, 7, 3.6, logWall, { e: [[0, 2]] }, 0x2a2420); for (const z of [11.6, 16.4]) for (const x of [-84, -80, -76]) { addBox(x, z, 2, .9, .15, wood, .5, false); addBox(x, z, 2, .9, .15, wood, 1.6, false); }
      const tent = (x, z, col, r) => { const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = r; for (const s of [-1, 1]) deco(unitBox, matStd({ color: col, side: THREE.DoubleSide }), s * .9, 1, 0, .06, 2.4, 3.2, g).rotation.z = s * .72; obstacles.push({ minX: x - 1.6, maxX: x + 1.6, minZ: z - 1.6, maxZ: z + 1.6, h: 1.8 }); };
      [[-66, 0, 0x5a6a3a, .3], [-58, 6, 0x6a5a3a, 1.2], [-70, 8, 0x3a4a5a, -.4], [-60, -4, 0x6a4a3a, 2]].forEach(a => tent(...a));
      for (let k = 0; k < 8; k++) { const q = k / 8 * 6.28; deco(unitBox, stoneMat, -64 + Math.cos(q) * .9, .15, 3 + Math.sin(q) * .9, .35, .3, .35); }
      glowSprite(0xff8a2a, 2.4, new V3(-64, .8, 3)); pointLight(0xff7a2a, 1.6, 14, -64, 1.4, 3); addBox(-64, 3, 1, 1, .5, matStd({ color: 0x2a1a0e }), 0, false);
      addBox(-54, 18, 3, 1.2, .9, wood); for (const [x, z] of [[-86, -4], [-74, -4], [-88, 6], [-52, 22], [-68, 20], [-90, 14], [-58, 14], [-78, 22], [-50, -6]]) tree(x, z);
      // --- east wing, A szárítóudvar: sticker stacks drying in rows, the kiln, a forklift
      for (const [z, gaps] of [[-2, [1, 4]], [8, [0, 3]], [18, [2, 5]]]) for (let k = 0; k < 6; k++) if (!gaps.includes(k)) { const x = 58 + k * 4.2, n = 3 + (k + z) % 3;
        for (let l = 0; l < n; l++) addBox(x, z, 3.8, 2, .32, cut, l * .42, false); addBox(x, z, 3.9, 2.1, .06, dark, n * .42, false); obstacles.push({ minX: x - 1.9, maxX: x + 1.9, minZ: z - 1, maxZ: z + 1, h: n * .42 }); }
      hollow(84, 8, 8, 14, 5, brick, { w: [[-3, 2.4]] }, 0x2a2a2e); glowSprite(0xff5a1a, 2, new V3(84, 1, 8)); label(['SZÁRÍTÓ'], '#e8c890', 1.4, 79.8, 5.2, 8);
      addBox(66, 22, 1.4, 2.4, 1.6, matStd({ color: 0xc8a020 })); addBox(66, 20.6, 1.2, .1, 2.6, dark, 0, false); // a forklift, forks up
    },
    areas: {
      north: { side: 'n', at: 0, name: 'A tópart', cost: 750, core: { minX: -26, maxX: 26, minZ: -52, maxZ: -8 }, spawns: [[-24, -50], [24, -50]], station: ['well', -16, -22] },
      west: { side: 'w', at: 8, name: 'Az erdei tábor', cost: 1000, core: { minX: -92, maxX: -48, minZ: -8, maxZ: 24 }, spawns: [[-90, -6], [-90, 22]], station: ['forge', -72, -2] },
      east: { side: 'e', at: 8, name: 'A szárítóudvar', cost: 1250, core: { minX: 48, maxX: 92, minZ: -8, maxZ: 24 }, spawns: [[90, -6], [90, 22]], station: ['trap', 54, 14] },
    },
  },
  town: { // core + three wings: Main Street with the saloon you walk into; the railway depot, the sheriff's jail and Boot Hill open it up
    name: 'Dead Acre főutca', desc: 'Elhagyott westernváros: széles főutca, boltok, bejárható szalon. Palánkon túl nyitható: a vasútállomás, a seriffiroda és a Csizmadomb.', minLevel: 4,
    noScale: true, innerFence: 'picket',
    main: { minX: -56, maxX: 56, minZ: -14, maxZ: 26 }, look: { tex: 'dirt', ground: 0xb8a07a, fog: 0x1a130d, fogD: [.018, .026], fence: 0xb09878 },
    vans: [[-50, 6], [50, 6]], ammo: [-26, 11], boxSpots: [[18, 12], [-14, 0], [36, 1], [-38, 12]],
    spawns: [[-55, -10], [55, -10], [-55, 22], [55, 22]],
    lamps: [[-20, -.5], [20, -.5], [-34, 12.5], [34, 12.5], [-8, 12.5], [8, -.5]],
    clear: [[0, 6, 6], [0, -8, 7], [-8, 21, 4]],
    props: [['barrel', 2], ['crate', 2], ['hay', 1.5], ['stack', 1], ['boom', 1]], propN: [8, 12],
    power: { turret: [0, 6], gens: [[-52, -54], [52, -20], [-20, 62], [30.5, 22]], boxes: [[-40, 11], [40, 1], [-14, -1], [18, 12], [-30, -40], [-10, -52], [20, -24], [48, -40], [-16, 44], [16, 62]] },
    quest: { radio: [4.5, -9.6], drop: [-2, 1.6], parts: [[-40, -20], [-18, -50], [12, -20], [50, -54], [-18, 56], [20, 40], [30.5, 18], [-54.5, 20]],
      txt: { names: ['KOTTATEKERCS', 'RUGÓ', 'BILLENTYŰ'], part: 'zongoraalkatrész', broken: 'Néma pianola', use: 'Pianola beindítása', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Indítsd be a pianolát a szalonban.'],
        call: ['A PIANOLA RÁZENDÍT…', 'A zene az egész várost felverte. Egy különleges csapat tart feléd!'], done: 'A PIANOLA ELHALLGATOTT', where: 'a szalonban' } },
    build() {
      const plank = c => matStd({ map: plankTex, color: c }), wood = matStd({ map: woodTex, color: 0x6a5038 }), dark = matStd({ color: 0x1a1612 }), stone = matStd({ map: stoneTex, color: 0x9a948a });
      // Main Street: storefronts facing each other, alleys between them where the wings' gates are
      [[-48, 'SZATÓCS', 0x9a8a70, 1], [-38, 'FEGYVERBOLT', 0x7a6a5a, 0], [-21, 'BANK', null, 4], [-11, 'PATIKA', 0x8a9a78, 5], [11, 'HOTEL', 0x6a7a7a, 2], [21, 'BORBÉLY', 0xa09a88, 0], [38, 'POSTA', 0x7a8a9a, 2], [48, 'TEMETKEZŐ', 0x5a5a5a, 0]]
        .forEach(([x, n, c, lit]) => storefront(x, -8, 10, 8, 5 + (Math.abs(x) % 3), c == null ? stone : plank(c), n, 1, lit, n === 'BANK' ? '#e8d070' : '#e8c890'));
      [[-46, 'ISTÁLLÓ', null, 0, 12], [-30, 'SZABÓ', 0x8a7a9a, 1, 10], [-18, 'NYOMDA', 0x9a8a6a, 0, 10], [11, 'ÁRUHÁZ', 0xa89a7a, 3, 12], [23, 'ÜGYVÉD', 0x6a7a6a, 1, 10], [38, 'JÁTÉKTEREM', 0x7a3a3a, 7, 10], [48, 'KOCSIS', 0x8a7a5a, 0, 8]]
        .forEach(([x, n, c, lit, w]) => storefront(x, 20, w, 8, 5 + (Math.abs(x) % 2), c == null ? barnMat : plank(c), n, -1, lit, n === 'JÁTÉKTEREM' ? '#ff9a4a' : '#e8c890'));
      waterTower(-8, 21);
      // the saloon: swing doors off the boardwalk, the bar, tables, the pianola (the map's challenge)
      const sal = plank(0x8a5a3a);
      hollow(0, -8, 12, 8, 5.4, sal, { s: [[0, 2.4]] }, 0x2a2420);
      addBox(0, -3.85, 12.4, .3, 2.8, sal, 5.4, false); addBox(0, -2.7, 12, 2.6, .16, boardMat, 0, false); addBox(0, -2.6, 12, 2.6, .14, roofMat, 3.1, false);
      for (const s of [-1, 1]) addBox(s * 5.8, -1.5, .2, .2, 3.1, poleMat);
      for (const s of [-1, 1]) addBox(s * .6, -3.95, 1.1, .06, 1.1, wood, 1, false); // the swing doors
      for (const s of [-1, 1]) addBox(s * 3.6, -3.95, 1.8, .06, 1.2, glassLit, 1.4, false);
      { const s = textSprite(['SALOON'], '#ff9a4a', 3.4), sm = new THREE.MeshBasicMaterial({ map: s.material.map, transparent: true, depthWrite: false }), sg = put(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sm));
        sg.scale.set(s.scale.x, s.scale.y, 1); sg.position.set(0, 6.8, -3.65); sg.onBeforeRender = () => { if (sm.map !== s.material.map) { sm.map = s.material.map; sm.needsUpdate = true; } }; }
      addBox(-4.4, -8.6, 1, 5.4, 1.15, wood); addBox(-5.6, -8.6, .3, 5.4, 2.4, dark, 0, false); for (let k = 0; k < 8; k++) addBox(-5.5, -10.8 + k * .6, .12, .12, .35, basic([0x3a6a2a, 0x8a3a1a, 0xc8a050][k % 3]), 1.3, false);
      for (const [x, z] of [[.6, -6.2], [1.8, -9.4], [-1.4, -11]]) { cylinderSolid(x, z, .55, .8, wood); for (let k = 0; k < 3; k++) addBox(x + Math.cos(k * 2.1) * 1, z + Math.sin(k * 2.1) * 1, .4, .4, .5, wood, 0, false); }
      addBox(4.5, -11, 1.8, .8, 1.4, matStd({ color: 0x3a2014 })); addBox(4.5, -10.55, 1.5, .1, .3, basic(0xe8e2d0), .9, false); // the pianola, keys yellowed
      pointLight(0xffb060, 1.3, 12, 0, 4.2, -8); glowSprite(0xffc070, 1.2, new V3(0, 4.6, -8));
      // hitching rails, a trough, a wagon, barrels on the boardwalks
      const rail = matStd({ map: woodTex, color: 0x6a5038 });
      [[-26, -.8], [26, -.8], [-34, 12.8], [30, 12.8]].forEach(([x, z]) => { addBox(x, z, 3.4, .15, .12, rail, 1, false); [-1.6, 1.6].forEach(d => addBox(x + d, z, .15, .15, 1.1, rail)); });
      addBox(-16, 12.8, 2.6, .8, .6, rail); wagon(24, 9, false);
      // --- north-west wing, A vasútállomás: walk through the depot onto the platform; a loco and a boxcar on the track, the water tank
      hollow(-30, -24, 16, 7, 4.6, plank(0x8a6a4a), { s: [[0, 2.4]], n: [[3, 2.4]] }, 0x2a2420);
      addBox(-34, -24, 4, 1, 1.1, wood); label(['DEAD ACRE ÁLLOMÁS'], '#e8c890', 1.6, -30, 5.8, -20.3); for (const x of [-35, -25]) addBox(x, -20.47, 1.6, .06, 1.2, glassLit, 1.2, false);
      addBox(-30, -31, 40, 5, .45, stone, 0, false); // the platform
      for (let x = -55; x <= -5; x += 1.2) addBox(x, -38, .28, 2.6, .1, wood, .04, false); for (const o of [-.72, .72]) addBox(-30, -38 + o, 52, .1, .12, steelMat, .12, false);
      const loco = matStd({ color: 0x1c1c20, metalness: .4, roughness: .6 });
      { const b = put(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 6, 16), loco)); b.rotation.z = Math.PI / 2; b.position.set(-44, 2.2, -38); rayBlockers.push(b); }
      addBox(-40, -38, 3, 2.6, 3.4, loco, .6); addBox(-44, -38, 8, 2.4, .6, dark, .5); addBox(-46.4, -38, .7, .7, 2, loco, 3.2, false); addBox(-48, -38, .6, 2.4, .9, matStd({ color: 0x8a2a1c }), .3, false);
      for (const x of [-46, -43.5, -41]) for (const z of [-39.2, -36.8]) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, .2, 14), matStd({ color: 0x8a2a1c }))); w.rotation.x = Math.PI / 2; w.position.set(x, .75, z); }
      obstacles.push({ minX: -48.4, maxX: -38.5, minZ: -39.4, maxZ: -36.6, h: 3.8 });
      addBox(-26, -38, 10, 2.8, 2.8, plank(0x6a3a24), .9); addBox(-26, -39.43, 3, .06, 2.2, dark, 1, false); // a boxcar, door open
      waterTower(-48, -50); for (const [x, z] of [[-14, -50], [-8, -30]]) addBox(x, z, 1.4, 1.4, 1, wood);
      // --- north-east wing, A seriffiroda: the jail you walk into (three cells), the gallows, a corral
      hollow(30, -26, 16, 9, 4.4, stone, { s: [[-4, 2]], w: [[2, 2]] }, 0x2b2a2c); label(['SERIFF · BÖRTÖN'], '#e8c890', 1.8, 30, 5.6, -21.2);
      addBox(25, -24, 2.2, 1, .9, wood); addBox(25, -25.2, .6, .6, .9, wood);
      for (let k = 0; k < 3; k++) { const x0 = 29 + k * 3; for (let b = 0; b <= 12; b++) addBox(x0 + b * .24, -26.5, .05, .05, 2.6, blackIron, 0, b === 0 || b === 12); addBox(x0 + 1.5, -26.5, 3, .1, .1, blackIron, 2.6, false);
        obstacles.push({ minX: x0, maxX: x0 + 2.9, minZ: -26.6, maxZ: -26.4, h: 2.6 }); addBox(x0 + 1.5, -29.6, 2, .8, .4, wood, .3); } // bars, a bunk in each cell
      for (const x of [26, 34]) addBox(x, -21.47, 1.4, .06, 1, glassLit, 1.3, false);
      addBox(46, -46, 5, 5, 2.4, wood); addBox(46, -46, .3, .3, 6, wood, 2.4, false); addBox(47, -46, 2.4, .3, .3, wood, 8, false); addBox(48, -46, .04, .04, 1.4, matStd({ color: 0x8a7a5a }), 6.6, false); // the gallows
      for (let k = 0; k < 5; k++) addBox(49, -43.8 + k * .5, 1.2, .5, .2, wood, k * .5, false); // steps up
      const corral = [[10, -52, 22, -52], [10, -52, 10, -42], [22, -52, 22, -42], [10, -42, 14, -42], [18, -42, 22, -42]]; corral.forEach(([a, b, c, d]) => railFence(a, b, c, d));
      addBox(16, -48, 2.4, .8, .6, rail);
      // --- south wing, A csizmadomb: the little white church, wooden crosses in crooked rows, the undertaker's shed
      const white = plank(0xd8d4c8);
      house(12, 52, 8, 11, 6, white, 0x2a2224, 'n'); addBox(12, 47.8, 3, 3, 11, white); put(new THREE.Mesh(new THREE.ConeGeometry(2.4, 4, 4), roofMat)).position.set(12, 13, 47.8);
      addBox(12, 47.8, .25, .25, 2, basic(0x3a3230), 15, false); addBox(12, 47.8, 1.2, .25, .25, basic(0x3a3230), 16.2, false);
      put(new THREE.Mesh(new THREE.CircleGeometry(.8, 16), basic(0xffc070))).position.set(12, 8.5, 46.28);
      for (let x = -21; x <= 2; x += 2.4) for (let z = 32; z <= 62; z += 3.2) { if (Math.hypot(x + 12, z - 40) < 4 || z > 58 && x < -13 || Math.random() < .25) continue; const cx = x + rand(-.4, .4); addBox(cx, z, .14, .14, 1.4, railWood, 0, false).rotation.z = rand(-.15, .15); addBox(cx, z, .7, .1, .1, railWood, 1.05, false); graveSpots.push([cx, z + .6]); }
      shed(-18, 62, 6, 4, 2.8); for (let k = 0; k < 3; k++) addBox(-20 + k * 1.8, 62, .8, 2, .6, matStd({ color: 0x3a2a1a }), 0);
      for (const [x, z] of [[20, 30], [-22, 50], [22, 64]]) deadTree(x, z);
    },
    areas: {
      west: { side: 'n', at: -30, name: 'A vasútállomás', cost: 1000, core: { minX: -56, maxX: -4, minZ: -58, maxZ: -14 }, spawns: [[-54, -56], [-6, -56]], station: ['tower', -14, -24] },
      east: { side: 'n', at: 30, name: 'A seriffiroda', cost: 1250, core: { minX: 4, maxX: 56, minZ: -58, maxZ: -14 }, spawns: [[6, -56], [54, -56]], station: ['forge', 12, -32] },
      south: { side: 's', at: 0, name: 'A csizmadomb', cost: 750, core: { minX: -24, maxX: 24, minZ: 26, maxZ: 66 }, spawns: [[-22, 64], [22, 38]], station: ['well', -12, 40] },
    },
  },
  quarry: { // core + three wings: the pit floor with the crusher plant and the haul truck; the rock face, the machine shop and the explosives store open it up
    name: 'Kőbánya', desc: 'Nyitott kőfejtő: a gödör alján zúzómű, szállítószalag, óriás dömper. Drótkerítésen túl nyitható: a fejtőfal, a gépműhely és a robbanóanyag-raktár.', minLevel: 7,
    noScale: true, innerFence: 'chain',
    main: { minX: -50, maxX: 50, minZ: -10, maxZ: 36 }, look: { tex: 'asphalt', ground: 0xa89c88, fog: 0x11151b, fogD: [.014, .02], fence: 0x9a9488 },
    vans: [[-44, -4], [44, -4]], ammo: [4, 30], boxSpots: [[14, 6], [-36, 26], [34, 30], [-10, 32]],
    spawns: [[-48, 34], [48, 34], [-30, -8], [30, -8]],
    lamps: [],
    clear: [[-20, 2, 10], [22, 20, 7], [0, 20, 6], [-34, 16, 5], [30, -2, 4], [8, -4, 4]],
    props: [['boom', 2], ['barrel', 2], ['crate', 1.5], ['stack', 1], ['car', .5]], propN: [10, 14],
    power: { turret: [0, 20], gens: [[-90, 32], [90, 10], [-20, -52], [46, 20]], boxes: [[-44, 30], [44, 30], [-24, 32], [26, 34], [-4, -8], [-70, 10], [70, 32], [-12, -30], [18, -44], [86, 30]] },
    quest: { radio: [-6, 30], drop: [2, -1], fx: 'blast', parts: [[-86, 26], [-57, 18], [-18, -44], [20, -30], [62, 16], [88, 22], [-46, 8], [40, 8]],
      txt: { names: ['GYUTACS', 'DINAMITKÖTEG', 'GYÚJTÓKÁBEL'], part: 'robbantóeszköz', broken: 'Üres robbantóláda', use: 'Robbantás indítása', all: ['MEGVAN MIND A HÁROM ESZKÖZ', 'Indítsd a robbantást a robbantóládánál, a gödör alján.'],
        call: ['ROBBANTÁS!', 'A dörrenés felverte a bányát. Egy különleges csapat tart feléd!'], done: 'A BÁNYA ELCSENDESEDETT', where: 'a robbantóládánál' } },
    build() {
      const rng = mulberry(91), yellow = matStd({ color: 0xc8a020, roughness: .7 }), dark = matStd({ color: 0x2a2a2c }), grey = matStd({ color: 0x5a5e62 }), cliff = matStd({ color: 0x77716a, flatShading: true });
      const concrete = matStd({ color: 0x8a8a84, roughness: 1 }), gravel = matStd({ color: 0x8a8274, flatShading: true });
      // the crusher plant on its steel legs, a hopper, the conveyor climbing out of the pit to the north
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(-20 + a * 3.4, 2 + b * 2.6, .4, .4, 6, steelMat);
      addBox(-20, 2, 8, 6, 4, grey, 6, false); addBox(-20, 2, 8.4, 6.4, .3, dark, 10, false); addBox(-20, 2, 3.6, 3, 2.4, matStd({ color: 0x6a5a3a, metalness: .4 }), 1.2); // the crusher under its house
      put(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1, 3, 4, 1, true), matStd({ color: 0x4a4a4e, side: THREE.DoubleSide }))).position.set(-20, 11.6, 2); label(['ZÚZÓMŰ'], '#ffd23f', 1.6, -20, 13.8, 5);
      const belt = put(new THREE.Mesh(unitBox, dark)), a = [-20, 6.2, -1], b = [-20, 16, -40], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
      belt.scale.set(1.4, .3, L); belt.rotation.order = 'YXZ'; belt.rotation.set(-Math.asin(dy / L), Math.atan2(dx, dz), 0); belt.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); belt.castShadow = true;
      addBox(-20, -42, 3, 3, 16.4, grey); addBox(-20, -42, 3.6, 3.6, .3, dark, 16.4, false); // the loading tower the belt ends at
      for (const t of [.12, .35, .6, .85]) { const z = a[2] + dz * t; addBox(-20, z, .35, .35, a[1] + dy * t, yellow, 0, z > -9); }
      for (const [x, z, r] of [[-34, 16, 3.6], [-8, 6, 2.8], [30, -2, 3]]) { const m = put(new THREE.Mesh(new THREE.ConeGeometry(r, r * .75, 9), gravel)); m.position.set(x, r * .37, z); m.receiveShadow = true; rayBlockers.push(m); obstacles.push({ minX: x - r * .6, maxX: x + r * .6, minZ: z - r * .6, maxZ: z + r * .6, h: r * .55 }); }
      // the haul truck: a dumper taller than a house, bed raised
      { const g = put(new THREE.Group()); g.position.set(22, 0, 20); g.rotation.y = -.3; const hb = (w, h, d, m, x, y, z, rx = 0) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(w, h, d); e.position.set(x, y, z); e.rotation.x = rx; e.castShadow = true; g.add(e); };
        hb(5, 1.4, 9, dark, 0, 2.1, 0); hb(5.4, 2.6, 6.4, yellow, 0, 4.4, 1.4, -.35); hb(3, 2, 2.4, yellow, -1, 3.8, -3.6); hb(2.6, 1, .1, glassDark, -1, 4.3, -4.82); hb(5, .3, 1.2, yellow, 0, 2.9, -4.6);
        for (const [x, z] of [[-2.6, -3], [2.6, -3], [-2.6, 2.6], [2.6, 2.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 16), matStd({ color: 0x141414 })); w.rotation.z = Math.PI / 2; w.position.set(x, 1.6, z); g.add(w); }
        obstacles.push({ minX: 18.5, maxX: 25.5, minZ: 14.5, maxZ: 25.5, h: 5 }); }
      // site cabins (the lower one you can walk into), floodlights, the detonator box (the map's challenge)
      hollow(-36, 30, 8, 3.4, 2.8, matStd({ color: 0x3a5a7a }), { n: [[1.5, 1.2]] }, 0x2a2a2e); addBox(-36, 30, 8.4, 3.6, 2.6, matStd({ color: 0xb8a040 }), 3.2, false); addBox(-38, 28.27, 2.4, .06, .9, glassLit, 1.3, false);
      addBox(-37.5, 30.6, 2, .8, .8, matStd({ color: 0x6a5038 }));
      [[-44, 12], [44, 12], [-6, -6], [10, 34]].forEach(([x, z]) => floodlight(x, z));
      addBox(-6, 31, 1, .7, .7, matStd({ color: 0x8a2a1c })); addBox(-6, 31, .08, .08, .7, steelMat, .7, false); addBox(-6, 31, .5, .08, .08, steelMat, 1.4, false); // the plunger box, no plunger
      for (let k = 0; k < 3; k++) addBox(-2 + k * 1.1, 32.5, .9, .6, .5, matStd({ color: 0x9a6a3a }), 0);
      // concrete block walls for cover, a site toilet, a water bowser
      for (const [x, z, n, al] of [[8, 4, 4, true], [-4, 12, 3, false], [34, 10, 3, false], [-34, 4, 4, true], [12, 28, 3, true]]) for (let k = 0; k < n; k++) for (let l = 0; l < 2; l++) if (l === 0 || k % 2 === 0) addBox(al ? x + k * 1.7 : x, al ? z : z + k * 1.7, al ? 1.6 : .8, al ? .8 : 1.6, .8, concrete, l * .8, l === 0);
      addBox(-44, 20, 1.2, 1.2, 2.3, matStd({ color: 0x2a6a3a })); addBox(-43.39, 20, .04, .7, 1.8, doorMat, 0, false);
      { const t = put(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5, 14), matStd({ color: 0xb8bcc0, metalness: .4 }))); t.rotation.z = Math.PI / 2; t.position.set(-24, 2, 22); rayBlockers.push(t); addBox(-28, 22, 2.4, 2.4, 2.6, yellow); addBox(-24, 22, 5.4, 2, .6, dark, .4, false); obstacles.push({ minX: -29.2, maxX: -21.4, minZ: 20.8, maxZ: 23.2, h: 3 }); }
      // the rim beyond the fence: boulders along the south and the far sides
      for (let x = -48; x <= 48; x += 5 + rng() * 2) if (Math.abs(x) > 6) rock(x, 40 + rng() * 2, 2.4 + rng(), 2 + rng() * 2, rng, false);
      // --- north wing, A fejtőfal: the rock face in steps, a drill rig, blasted rock, the water pump
      for (let x = -22; x <= 22; x += 4.4) { const h = 10 + rng() * 5; addBox(x, -53, 4.6, 6, h, cliff); addBox(x, -48.5, 4.6, 3, h * .45, cliff); }
      for (let k = 0; k < 14; k++) rock(-20 + rng() * 40, -44 + rng() * 26, 1 + rng() * 1.3, .8 + rng(), rng);
      addBox(8, -36, 3, 5, 1.4, yellow, .6); addBox(8, -37.5, .5, .5, 10, grey, 1.8, false); addBox(8, -35.4, 2.2, 2, 1.8, dark, 2, false); obstacles.push({ minX: 6.5, maxX: 9.5, minZ: -38.5, maxZ: -33.5, h: 3 });
      for (const [x, z] of [[-10, -24], [-6, -30], [4, -46]]) { addBox(x, z, 1, .6, .6, matStd({ color: 0x9a6a3a })); label(['TNT'], '#ff5a3a', .6, x, 1, z); }
      // --- west wing, A gépműhely: the workshop with a dozer inside, fuel tanks, an excavator reaching over the fence
      hollow(-76, 18, 16, 10, 6, matStd({ color: 0x6a7278, metalness: .3 }), { e: [[0, 5]], n: [[3, 2]] }, 0x2a2a2e);
      addBox(-78, 18, 5, 3, 1.8, yellow, .4); addBox(-80.8, 18, .6, 3.4, 1.4, steelMat, .2, false); addBox(-77, 18, 2, 2.4, 1.6, dark, 2.2, false); // the dozer
      for (const z of [10, 13.5]) { const t = put(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 14), matStd({ color: 0xb8bcc0, metalness: .4 }))); t.rotation.z = Math.PI / 2; t.position.set(-62, 1.4, z); rayBlockers.push(t); }
      obstacles.push({ minX: -64.6, maxX: -59.4, minZ: 8.6, maxZ: 14.9, h: 2.6 });
      addBox(-86, 30, 4, 3, 1.4, dark, .4); addBox(-86, 30, 3.2, 2.8, 2, yellow, 1.8, false); { const arm = put(new THREE.Mesh(unitBox, yellow)); arm.scale.set(.6, .6, 7); arm.position.set(-86, 5, 26); arm.rotation.x = -.55; const s2 = put(new THREE.Mesh(unitBox, yellow)); s2.scale.set(.5, .5, 4); s2.position.set(-86, 5.2, 21.4); s2.rotation.x = .7; }
      for (let k = 0; k < 5; k++) { const t = put(new THREE.Mesh(new THREE.TorusGeometry(.9, .35, 6, 14), matStd({ color: 0x141414 }))); t.rotation.x = Math.PI / 2; t.position.set(-56, .35 + k * .7, 32); } obstacles.push({ minX: -57.3, maxX: -54.7, minZ: 30.7, maxZ: 33.3, h: 3.5 });
      // --- east wing, A robbanóanyag-raktár: an earth-banked bunker you walk into, magazine sheds, warning boards
      hollow(78, 24, 12, 8, 3.4, concrete, { w: [[0, 1.8]] }, 0x3a3a34); for (const s of [-1, 1]) { const bank = put(new THREE.Mesh(unitBox, gravel)); bank.scale.set(13, 2.6, 3); bank.position.set(78, 1, 24 + s * 5.4); bank.rotation.x = s * .5; }
      for (let k = 0; k < 4; k++) addBox(80 + (k % 2) * 2.4, 22 + Math.floor(k / 2) * 3, 1.6, 1, .9, matStd({ color: 0x9a6a3a }), 0);
      for (const [x, z] of [[62, 12], [70, 12], [86, 12]]) { addBox(x, z, 4, 3, 2.6, matStd({ color: 0x6a5a4a })); addBox(x, z + 1.52, 1, .06, 2, doorMat, 0, false); addBox(x, z + 1.54, 3, .02, .4, tapeMat, 2.2, false); }
      for (const [x, z] of [[56, 20], [66, 32]]) { addBox(x, z, .15, .15, 2, steelMat); addBox(x, z, 1.8, .1, 1.2, matStd({ map: hazardTex }), 1.6, false); label(['VESZÉLY', 'ROBBANÓANYAG'], '#ffd23f', .8, x, 3.3, z); }
    },
    areas: {
      north: { side: 'n', at: 0, name: 'A fejtőfal', cost: 750, core: { minX: -24, maxX: 24, minZ: -56, maxZ: -10 }, spawns: [[-18, -46], [18, -46]], station: ['well', 14, -20] },
      west: { side: 'w', at: 22, name: 'A gépműhely', cost: 1000, core: { minX: -94, maxX: -50, minZ: 6, maxZ: 36 }, spawns: [[-92, 8], [-92, 34]], station: ['forge', -64, 30] },
      east: { side: 'e', at: 22, name: 'A robbanóanyag-raktár', cost: 1250, core: { minX: 50, maxX: 94, minZ: 6, maxZ: 36 }, spawns: [[92, 8], [92, 34]], station: ['tower', 60, 28] },
    },
  },
  fair: { // core + three wings: the midway under the Ferris wheel; the ghost train, the big top and the carnies' camp open it up
    name: 'Vásártér', desc: 'Elhagyott vándorvásár: óriáskerék, körhinta, bódék, füzérlámpák. Kordonon túl nyitható: a szellemvasút, a cirkuszsátor és a lakókocsitábor.', minLevel: 9,
    noScale: true, innerFence: 'rope',
    main: { minX: -50, maxX: 50, minZ: -12, maxZ: 36 }, look: { tex: 'grass', ground: 0x76805f, fog: 0x140d18, fogD: [.02, .028], fence: 0xc8b8a0 },
    vans: [[-44, -6], [44, -6]], ammo: [-8, 24], boxSpots: [[16, 12], [-36, 30], [34, 30], [-14, -8]],
    spawns: [[-48, -10], [48, -10], [-30, 34], [30, 34]],
    lamps: [[-14, 6], [14, 6], [-38, 24], [38, 24], [-40, -8], [40, -8]],
    clear: [[0, -4, 8], [-26, 12, 7], [0, 16, 6], [26, 6, 3], [7, -4, 3]],
    props: [['crate', 1.5], ['hay', 2], ['barrel', 2], ['stack', 1], ['boom', 1]], propN: [8, 12],
    power: { turret: [0, 16], gens: [[-90, 32], [90, 4], [-20, -52], [46, 30]], boxes: [[-44, 32], [44, 12], [-22, 32], [22, 34], [-6, -10], [-70, 6], [70, 32], [-12, -30], [18, -46], [86, 30]] },
    quest: { radio: [7, -2.2], drop: [-1, 1.6], fx: 'spin', parts: [[-86, 30], [-60, 6], [-18, -44], [18, -30], [66, 34], [88, 10], [-46, 4], [40, 20]],
      txt: { names: ['BIZTOSÍTÉK', 'FOGASKERÉK', 'INDÍTÓKAR'], part: 'óriáskerék-alkatrész', broken: 'Álló óriáskerék', use: 'Óriáskerék beindítása', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Indítsd be az óriáskereket a vezérlőfülkénél.'],
        call: ['FOROG AZ ÓRIÁSKERÉK, SZÓL A ZENE…', 'A fények és a zene mindenkit idecsalt. Egy különleges csapat tart feléd!'], done: 'A VÁSÁR ELCSENDESEDETT', where: 'a vezérlőfülkénél' } },
    build() {
      const steel = matStd({ color: 0xd8d4cc, metalness: .6, roughness: .4 }), wood = matStd({ map: woodTex, color: 0x9a6a4a }), dark = matStd({ color: 0x1a1a1e });
      const colors = [0xff3a5a, 0xffd23f, 0x3ad8ff, 0x7dff7a, 0xff8a3a, 0xc05aff], cm = colors.map(c => matStd({ color: c }));
      // the Ferris wheel: it stands still until someone gets it going (the map's challenge)
      addBox(0, -4, 11, 4, .4, matStd({ color: 0x5a4a3a }));
      for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) { const leg = put(new THREE.Mesh(unitBox, steel)); leg.scale.set(.35, 13.3, .35); leg.position.set(sx * 2.4, 6.4, -4 + sz); leg.rotation.z = sx * .36; leg.castShadow = true; }
      const wheel = put(new THREE.Group()); wheel.position.set(0, 12.5, -4);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, rim = new THREE.Mesh(unitBox, steel); rim.scale.set(.25, 3.6, .25); rim.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0); rim.rotation.z = a; wheel.add(rim);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), basic(colors[k % colors.length])); bulb.position.set(Math.cos(a) * 9.3, Math.sin(a) * 9.3, .2); wheel.add(bulb); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, sp = new THREE.Mesh(unitBox, steel); sp.scale.set(.15, 9, .15); sp.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
        const car = new THREE.Mesh(unitBox, cm[k % cm.length]); car.scale.set(1.4, 1.1, 1.6); car.position.set(Math.cos(a) * 9, Math.sin(a) * 9 - 1, 0); car.castShadow = true; wheel.add(car); }
      const hubM = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 1.2, 16), steel); hubM.rotation.x = Math.PI / 2; wheel.add(hubM);
      QST.spin = wheel; pointLight(0x3ad8ff, 1.4, 24, 0, 8, 0);
      addBox(7, -4, 2.2, 2.2, 2.4, matStd({ color: 0x8a2a3a })); addBox(7, -2.87, 1.4, .06, .8, glassLit, 1.2, false); addBox(7, -4, 2.6, 2.6, .2, matStd({ color: 0xf2e8d8 }), 2.4, false); label(['VEZÉRLŐ'], '#ffd23f', .8, 7, 3.1, -2.8);
      // the carousel
      cylinderSolid(-26, 12, 5, .5, wood); addBox(-26, 12, .4, .4, 4.6, steel, .5, false);
      put(new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.4, 16), matStd({ color: 0xc8283a }))).position.set(-26, 6.3, 12); put(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 16), matStd({ color: 0xf2e8d8 }))).position.set(-26, 7.9, 12);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, x = -26 + Math.cos(a) * 3.6, z = 12 + Math.sin(a) * 3.6; addBox(x, z, .08, .08, 4.2, steel, .5, false); const h = addBox(x, z, .35, 1.1, .6, matStd({ color: k % 2 ? 0xf2e8d8 : 0x6a3a2a }), 1.2, false); h.rotation.y = -a; }
      glowSprite(0xff4a8a, 3, new V3(-26, 5, 12));
      // the strength tester: hit the pad, ring the bell
      addBox(26, 6, 1.4, 1, .4, wood); addBox(26, 5.6, .4, .3, 7, matStd({ color: 0xf2e8d8 })); for (let k = 0; k < 6; k++) addBox(26, 5.42, .5, .04, .3, cm[k], 1 + k * 1, false);
      put(new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 8), brassMat)).position.set(26, 7.3, 5.6); label(['PRÓBÁLD KI!'], '#ffd23f', .9, 26, 8.2, 6);
      // the stalls along the south side, facing the midway
      [-30, -20, -10, 10, 20, 30].forEach((x, i) => { addBox(x, 29, 5, 2.2, 1.1, wood); addBox(x, 30.3, 5, .3, 2.7, wood); addBox(x, 29.2, 5.6, 3, .15, cm[i % cm.length], 2.75, false); [-2.6, 2.6].forEach(dx => addBox(x + dx, 27.9, .12, .12, 2.75, poleMat, 0, false)); });
      label(['CÉLLÖVÖLDE'], '#ff8a3a', 1.4, -20, 3.6, 28); label(['VATTACUKOR'], '#ff9ad8', 1.3, 10, 3.6, 28); label(['LÁNGOS'], '#ffd23f', 1.3, 30, 3.6, 28);
      // festoon lights strung over the midway
      const fest = (x0, z0, x1, z1) => { for (let k = 1; k < 14; k++) { const t = k / 14; deco(new THREE.SphereGeometry(.1, 6, 4), basic(colors[k % colors.length]), x0 + (x1 - x0) * t, 4.1 - Math.sin(t * Math.PI) * .8, z0 + (z1 - z0) * t); } };
      [[-14, 6, 14, 6], [-14, 6, -38, 24], [14, 6, 38, 24], [-14, 6, 14, 24], [14, 6, -14, 24]].forEach(a => fest(...a));
      for (const [x, z] of [[-14, 24], [14, 24]]) addBox(x, z, .2, .2, 4.2, poleMat);
      // --- north wing, A szellemvasút: the dark ride's house you walk through, its track, clowns that aren't moving (yet)
      hollow(0, -38, 22, 12, 6, matStd({ color: 0x3a2a4a }), { s: [[-6, 3], [6, 3]], n: [[0, 3]] }, 0x1a121e);
      addBox(0, -31.8, 22.4, .3, 2.6, matStd({ color: 0x5a2a6a }), 6, false); label(['SZELLEMVASÚT'], '#c05aff', 2.4, 0, 7.6, -31.5);
      put(new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), matStd({ color: 0xe8e2d0 }))).position.set(0, 5.6, -31.6); for (const s of [-1, 1]) addBox(s * .45, -30.5, .35, .1, .35, dark, 5.7, false); // a skull over the doors
      for (let x = -9; x <= 9; x += 1) addBox(x, -38, .7, .1, .06, steelMat, .06, false); for (const x of [-9, 9]) for (let z = -43; z <= -33; z += 1) addBox(x, z, .1, .7, .06, steelMat, .06, false);
      for (const [x, z] of [[-4, -38], [5, -38]]) { addBox(x, z, 1.6, 1.1, .9, matStd({ color: 0x8a1a2a }), .2); addBox(x - .6, z, .2, 1, .7, matStd({ color: 0x8a1a2a }), 1.1, false); }
      pointLight(0x9a3aff, 1, 12, 0, 4, -38);
      const clown = (x, z, r) => { const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = r;
        deco(new THREE.CylinderGeometry(.35, .5, 1.4, 8), cm[(x * 7 | 0) & 3 || 0], 0, .7, 0, 1, 1, 1, g); deco(new THREE.SphereGeometry(.28, 10, 8), matStd({ color: 0xf2e8d8 }), 0, 1.65, 0, 1, 1, 1, g); deco(new THREE.SphereGeometry(.08, 6, 4), basic(0xff2a2a), 0, 1.65, .27, 1, 1, 1, g);
        deco(new THREE.ConeGeometry(.2, .5, 8), cm[1], 0, 2.05, 0, 1, 1, 1, g); obstacles.push({ minX: x - .5, maxX: x + .5, minZ: z - .5, maxZ: z + .5, h: 2 }); };
      clown(-10, -24, .4); clown(12, -26, -.5); clown(-16, -48, .9); clown(16, -50, -1);
      // --- west wing, A cirkuszsátor: the big top you walk into, the ring, the benches, the trapeze
      { const cx = -72, cz = 20, R = 11, n = 16, canvas = matStd({ color: 0xe8dcc8, side: THREE.DoubleSide }), stripe = matStd({ color: 0xb8283a, side: THREE.DoubleSide });
        for (let k = 0; k < n; k++) { if (k === 0 || k === 8) continue; const a = (k + .5) / n * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, L = 2 * R * Math.sin(Math.PI / n) + .1, seg = addBox(x, z, L, .2, 3.4, k % 2 ? canvas : stripe, 0, false); seg.rotation.y = -a + Math.PI / 2;
          for (const t of [-.33, 0, .33]) { const px = x - Math.sin(a) * L * t, pz = z + Math.cos(a) * L * t; obstacles.push({ minX: px - .75, maxX: px + .75, minZ: pz - .75, maxZ: pz + .75, h: 3.4 }); } } // a round wall: collide as a string of small squares
        const roof = put(new THREE.Mesh(new THREE.ConeGeometry(R + .8, 6, n, 1, true), matStd({ color: 0xb8283a, side: THREE.DoubleSide }))); roof.position.set(cx, 6.4, cz); addBox(cx, cz, .3, .3, 10, steel, 0, true);
        const ring = put(new THREE.Mesh(new THREE.TorusGeometry(4, .25, 6, 28), matStd({ color: 0xc8283a }))); ring.rotation.x = Math.PI / 2; ring.position.set(cx, .25, cz);
        { const f = put(new THREE.Mesh(new THREE.CircleGeometry(4, 28), matStd({ color: 0xa8905a }))); f.rotation.x = -Math.PI / 2; f.position.set(cx, .02, cz); }
        for (let k = 0; k < 10; k++) { const a = (k + 3) / 16 * Math.PI * 2; if (Math.abs(Math.sin(a)) < .3) continue; for (let r = 0; r < 3; r++) { const b = addBox(cx + Math.cos(a) * (7 + r * 1.1), cz + Math.sin(a) * (7 + r * 1.1), 3, .9, .45 + r * .45, wood, 0, false); b.rotation.y = -a + Math.PI / 2; } }
        for (const s of [-1, 1]) addBox(cx + s * 3, cz, .15, .15, 7, steel, 0, false); addBox(cx, cz, 6, .1, .1, steel, 7, false); addBox(cx, cz, 1.2, .06, .06, steel, 5.4, false);
        label(['CIRKUSZ'], '#ffd23f', 2.4, cx, 10.4, cz); pointLight(0xffc070, 1.2, 16, cx, 5, cz); }
      // --- east wing, A lakókocsitábor: caravans (one open), the fortune teller's tent, washing on a line
      const van = (x, z, col, r, open) => { const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = r; const m = matStd({ color: col });
        deco(new THREE.CapsuleGeometry(1.2, 4, 4, 10), m, 0, 1.6, 0, 1, 1, 1, g).rotation.z = Math.PI / 2; deco(unitBox, glassDark, 0, 1.9, 1.21, 1.4, .6, .05, g); deco(unitBox, open ? glassLit : dark, -1.6, 1.3, 1.22, .7, 1.6, .05, g);
        for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .2, 10), dark); w.rotation.x = Math.PI / 2; w.position.set(.6, .35, s * 1.2); g.add(w); }
        const hx = Math.abs(Math.cos(r)) * 3.2 + Math.abs(Math.sin(r)) * 1.2, hz = Math.abs(Math.sin(r)) * 3.2 + Math.abs(Math.cos(r)) * 1.2; obstacles.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h: 2.8 }); };
      [[64, 8, 0x8ab8a8, .2], [80, 10, 0xd8c8a0, -.3], [86, 24, 0xa87a9a, 1.4], [62, 30, 0x9aa8c8, 2.9]].forEach(([x, z, c, r], i) => van(x, z, c, r, i === 1));
      cylinderSolid(72, 26, 2.4, 2.4, matStd({ color: 0x5a2a6a })); put(new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 12), matStd({ color: 0xd8b04a }))).position.set(72, 3.6, 26); label(['JÖVENDŐMONDÓ'], '#ff9ad8', 1.1, 72, 5.4, 26);
      glowSprite(0x9fd8ff, 1.2, new V3(72, 1.4, 23.4));
      addBox(70, 16, .1, .1, 2.2, poleMat); addBox(78, 16, .1, .1, 2.2, poleMat); addBox(74, 16, 8, .02, .02, dark, 2.1, false); for (let k = 0; k < 5; k++) addBox(71 + k * 1.4, 16, .8, .04, .9, cm[k], 1.2, false);
    },
    areas: {
      north: { side: 'n', at: 0, name: 'A szellemvasút', cost: 1250, core: { minX: -24, maxX: 24, minZ: -56, maxZ: -12 }, spawns: [[-20, -54], [20, -54]], station: ['trap', -12, -16] },
      west: { side: 'w', at: 20, name: 'A cirkuszsátor', cost: 1000, core: { minX: -94, maxX: -50, minZ: 2, maxZ: 36 }, spawns: [[-92, 4], [-92, 34]], station: ['forge', -56, 32] },
      east: { side: 'e', at: 20, name: 'A lakókocsitábor', cost: 750, core: { minX: 50, maxX: 94, minZ: 2, maxZ: 36 }, spawns: [[92, 4], [92, 34]], station: ['well', 58, 20] },
    },
  },
  hospital: { // core + three wings: the front plaza and the lobby you walk into; the morgue behind, the car park and the quarantine camp open it up
    name: 'Szent Lukács Kórház', desc: 'Kiürített megyei kórház: bejárható előcsarnok, lezuhant mentőhelikopter, triázssátrak. Drótkerítésen túl nyitható: a hullaház, a parkolóház és a karantén-tábor.', minLevel: 13,
    noScale: true, innerFence: 'chain',
    main: { minX: -50, maxX: 50, minZ: -10, maxZ: 36 }, look: { tex: 'asphalt', ground: 0x8a8e88, fog: 0x0a1012, fogD: [.022, .03], fence: 0xb8bcc0 },
    vans: [[-44, 6], [44, 6]], ammo: [-8, 30], boxSpots: [[14, 12], [-44, 24], [36, 32], [-16, 8]],
    spawns: [[-48, 32], [48, 32], [-48, -4], [48, -4]],
    lamps: [[-10, 10], [10, 10], [-38, 14], [38, 14], [-20, 33], [20, 33]],
    clear: [[0, -4, 8], [26, 22, 9], [0, 18, 6], [-30, 20, 5], [-14, 28, 4], [-32, 30, 4]],
    props: [['crate', 1.5], ['barrel', 1.5], ['stack', 1], ['car', 1.5], ['boom', 1]], propN: [8, 12],
    power: { turret: [0, 18], gens: [[-80, 50], [90, 16], [-18, -50], [46, 34]], boxes: [[-44, 32], [44, 32], [-24, 5], [24, 5], [-6, 34], [-70, 20], [70, 48], [-14, -30], [16, -48], [86, 30]] },
    quest: { radio: [-3.5, -2.4], drop: [3, 0], parts: [[-86, 20], [-62, 40], [-18, -44], [18, -26], [56, 44], [88, 40], [-46, 14], [36, 30]],
      txt: { names: ['MIKROFON', 'ERŐSÍTŐ', 'HANGSZÓRÓ'], part: 'hangosbemondó-alkatrész', broken: 'Néma hangosbemondó', use: 'Bemondás indítása', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Indítsd a bemondást a kórház előcsarnokában.'],
        call: ['„FIGYELEM, FIGYELEM…”', 'A hangszórók az egész környéket felverték. Egy különleges csapat tart feléd!'], done: 'A HANGSZÓRÓK ELNÉMULTAK', where: 'az előcsarnokban' } },
    build() {
      const white = matStd({ color: 0xd8dcd8 }), red = basic(0xd8282a), dark = matStd({ color: 0x2a2c2e }), steel = matStd({ color: 0xa8acb0, metalness: .5, roughness: .5 });
      const olive = matStd({ color: 0x4a5a3a, roughness: .9, side: THREE.DoubleSide }), tentW = matStd({ color: 0xd8d8d0, side: THREE.DoubleSide }), concrete = matStd({ color: 0x8a8a84, roughness: 1 });
      // the hospital front: two tall blocks either side of the lobby; the lobby is the way through to the morgue
      for (const s of [-1, 1]) { addBox(s * 23, -5, 34, 10, 12, white); addBox(s * 23, -5, 34.4, 10.4, .4, dark, 12, false);
        for (let x = 8; x <= 38; x += 5) for (let y = 1.4; y < 11; y += 3.4) addBox(s * x, .03, 2.2, .06, 1.4, Math.random() < .12 ? glassLit : matStd({ color: 0x223a4a, emissive: 0x0a1a24 }), y, false); }
      hollow(0, -4, 12, 12, 6, white, { s: [[0, 3.4]], n: [[0, 6]] }, 0x3a3a3e);
      addBox(0, 2.6, 13, 3.4, .3, dark, 4, false); [-5.8, 5.8].forEach(x => addBox(x, 4, .3, .3, 4, steel)); // the entrance canopy
      label(['SZENT LUKÁCS KÓRHÁZ'], '#e8e2d0', 2.6, 0, 9, 2.2); addBox(0, 2.1, 3, .1, .8, red, 7.2, false); addBox(0, 2.1, .8, .1, 3, red, 6.1, false);
      addBox(-3.5, -4, 4, 1, 1.1, matStd({ color: 0x6a8a9a })); addBox(-3.5, -4.6, 4, .2, .3, white, 1.1, false); // the reception desk; the PA mic stand on it (the map's challenge)
      addBox(-3.5, -4, .06, .06, .5, steel, 1.1, false);
      for (let z = -8; z <= -1; z += 2.2) for (const x of [3, 4.6]) addBox(x, z, .9, 1.6, .5, matStd({ color: 0x3a5a7a }), 0, false);
      pointLight(0xdcecff, 1.1, 12, 0, 5, -4); addBox(0, -4, 6, .4, .06, basic(0xe8f4ff), 5.8, false);
      // the helipad and the crashed helicopter
      const pad = put(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, .06, 32), matStd({ color: 0x3a3c3e }))); pad.position.set(26, .03, 22); pad.receiveShadow = true;
      addBox(24.6, 22, .6, 4, .02, basic(0xe8e2d0), .07, false); addBox(27.4, 22, .6, 4, .02, basic(0xe8e2d0), .07, false); addBox(26, 22, 2.2, .6, .02, basic(0xe8e2d0), .07, false);
      const heli = put(new THREE.Group()); heli.position.set(29, 0, 24); heli.rotation.set(0, .7, .28);
      const hb = (w, h, d, m, x, y, z, rx = 0, rz = 0) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(w, h, d); e.position.set(x, y, z); e.rotation.set(rx, 0, rz); e.castShadow = true; heli.add(e); };
      hb(2.4, 2.2, 5, white, 0, 1.3, 0); hb(2.42, .4, 5.02, red, 0, 1.1, 0); hb(.6, .6, 5, white, 0, 1.8, -4.6); hb(.2, 1.6, 1, white, 0, 2.6, -7); hb(9, .1, .4, dark, 0, 2.7, 0, 0, .2); hb(.4, .1, 8, dark, .4, 2.6, .5, .15, 0);
      obstacles.push({ minX: 26.5, maxX: 31.5, minZ: 20.5, maxZ: 27.5, h: 3 }); glowSprite(0xff7a2a, 3, new V3(29.5, 2.5, 25));
      // ambulances with a light bar
      for (const [x, z, ry] of [[-30, 18, .3], [-14, 26, -.5]]) { const g = put(new THREE.Group()); g.position.set(x, 0, z); g.rotation.y = ry;
        const ab = (w, h, d, m, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(w, h, d); e.position.set(px, py, pz); e.castShadow = true; g.add(e); };
        ab(2.2, 2.2, 5, white, 0, 1.4, 0); ab(2.22, .35, 5.02, red, 0, 1.2, 0); ab(2, 1.2, 1.6, white, 0, .9, 3.2); ab(.5, .18, .3, basic(0x3a6aff), -.4, 2.6, 1.8); ab(.5, .18, .3, basic(0xff2a2a), .4, 2.6, 1.8);
        for (const [a, b] of [[-1, -1.6], [1, -1.6], [-1, 3.2], [1, 3.2]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .3, 12), dark); t.rotation.z = Math.PI / 2; t.position.set(a * 1.1, .45, b); g.add(t); }
        obstacles.push({ minX: x - 2.6, maxX: x + 2.6, minZ: z - 3, maxZ: z + 3, h: 2.4 }); }
      // triage tents with cots, sandbags
      const tent = (x, z, w, d, m, cross, door = 'n') => { const f = door === 'n' ? -1 : 1; hollow(x, z, w, d, 2.4, m, { [door]: [[0, 2]] }, cross ? 0xd8d8d0 : 0x3a4a2a); if (cross) { addBox(x + 2, z + f * (d / 2 + .05), 1.6, .05, .4, red, 1.4, false); addBox(x + 2, z + f * (d / 2 + .05), .4, .05, 1.6, red, .8, false); }
        for (let k = 0; k < Math.floor(w / 2) - 1; k++) addBox(x - w / 2 + 1.6 + k * 2, z - f * (d / 2 - 1.4), .8, 2, .45, olive, 0, false); };
      tent(-36, 30, 8, 5, tentW, true); tent(-24, 32, 6, 4, tentW, true);
      for (let k = 0; k < 6; k++) addBox(-8 + k * 1.3, 24, 1.2, .6, .5 + (k % 2) * .1, sandMat, 0);
      // --- north wing, A hullaház: the morgue you walk into (cold drawers, the slabs), body bags laid out, the reefer truck
      hollow(0, -38, 18, 10, 4, matStd({ color: 0x9a9e9a }), { s: [[0, 3]], e: [[1, 2]] }, 0x3a3a3e);
      for (let x = -7; x <= 7; x += 1.4) for (let y = .4; y < 3.2; y += 1) addBox(x, -42.75, 1.2, .1, .8, steel, y, false);
      for (const x of [-3, 3]) { addBox(x, -38, 1, 2.2, .9, steel); addBox(x, -38, .7, 1.8, .25, matStd({ color: 0x3a4a3a }), .9, false); }
      pointLight(0x9ad8ff, .9, 12, 0, 3.5, -38); label(['HULLAHÁZ'], '#9fd8ff', 1.4, 0, 5.2, -32.8);
      for (let k = 0; k < 8; k++) { const b = put(new THREE.Mesh(new THREE.CapsuleGeometry(.3, 1.4, 4, 8), matStd({ color: 0x14161a }))); b.rotation.z = Math.PI / 2; b.position.set(-16 + (k % 4) * 1.4, .3, -22 - Math.floor(k / 4) * 2.4); }
      addBox(14, -24, 2.6, 7, 3, white, .8); addBox(14, -29, 2.4, 2.4, 2.2, matStd({ color: 0x3a5a7a }), .6); addBox(14, -24, 2.7, 7.1, .5, matStd({ color: 0x2a6aa8 }), 3.3, false);
      // --- west wing, A parkolóház: a parking deck overhead on a grid of pillars, cars left in the bays, a stair tower
      addBox(-72, 32, 36, 32, .5, concrete, 3.4, false); for (let x = -86; x <= -58; x += 7) for (let z = 18; z <= 46; z += 7) addBox(x, z, .8, .8, 3.4, concrete);
      for (let x = -88; x <= -56; x += 3) for (const z of [21.5, 35.5]) addBox(x, z, .1, 3, .02, basic(0xd8d8c8), 0, false);
      for (const [x, z, c] of [[-80.5, 22, 0], [-68.5, 21.6, 1], [-62.5, 36, 2], [-83.5, 35.2, 3]]) { addBox(x, z, 1.9, 4.2, 1, carMats[c], .3); addBox(x, z + .2, 1.7, 2.2, .7, carMats[c], 1.3, false); }
      addBox(-90, 50, 4, 4, 8, concrete); addBox(-88, 50, .06, 1.2, 2.2, doorMat, 0, false); label(['P'], '#6aa8ff', 2, -90, 9, 50);
      pointLight(0xe8f0ff, .9, 14, -72, 3, 32); glowSprite(0xe8f0ff, 1.2, new V3(-72, 3.1, 32));
      // --- east wing, A karantén-tábor: army tents in rows, a watchtower, containers, the decon shower
      for (const [x, z, d] of [[60, 18, 'n'], [70, 18, 'n'], [80, 18, 'n'], [60, 30, 's'], [70, 30, 's']]) tent(x, z, 7, 5, olive, false, d);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(86 + a * 1.4, 42 + b * 1.4, .25, .25, 6, steel); addBox(86, 42, 3.4, 3.4, .25, matStd({ color: 0x5a4a3a }), 6, false); addBox(86, 42, 3.8, 3.8, .2, dark, 8.4, false);
      for (const [x, z] of [[84.3, 42], [87.7, 42]]) addBox(x, z, .1, 3.4, 1, matStd({ color: 0x5a4a3a }), 6.2, false); glowSprite(0xfff0c0, 1.6, new V3(86, 8, 42));
      for (const [x, z, c] of [[62, 46, 0x3a5a3a], [70, 46, 0x6a3a24]]) { addBox(x, z, 6, 2.6, 2.6, matStd({ color: c })); addBox(x, z + 1.32, 5.4, .04, 2.2, dark, .2, false); }
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(80 + a * 1.2, 30 + b * 1.2, .12, .12, 2.6, steel, 0, false); addBox(80, 30, 2.6, 2.6, .1, steel, 2.6, false); label(['FERTŐTLENÍTÉS'], '#ffd23f', .9, 80, 3.4, 30);
      FENCES.chain(56, 40, 76, 40);
    },
    areas: {
      north: { side: 'n', at: 0, name: 'A hullaház', cost: 1250, core: { minX: -24, maxX: 24, minZ: -54, maxZ: -10 }, spawns: [[-20, -52], [20, -52]], station: ['trap', -10, -14] },
      west: { side: 'w', at: 24, name: 'A parkolóház', cost: 1000, core: { minX: -94, maxX: -50, minZ: 12, maxZ: 54 }, spawns: [[-92, 14], [-84, 53]], station: ['forge', -56, 48] },
      east: { side: 'e', at: 24, name: 'A karantén-tábor', cost: 750, core: { minX: 50, maxX: 94, minZ: 12, maxZ: 54 }, spawns: [[92, 14], [92, 52]], station: ['well', 58, 38] },
    },
  },
  rail: {
    name: 'Vasúti rendező', desc: 'Éjszakai rendező pályaudvar: három vágány tehervagonokkal és egy tartálykocsival, víztorony, jelzőlámpák, konténerek.', minLevel: 16,
    main: { minX: -46, maxX: 46, minZ: -34, maxZ: 34 }, look: { tex: 'dirt', ground: 0x7a746a, fog: 0x0b0c10, fogD: [.022, .03], fence: 0x9a9690 },
    vans: [[-36, 26], [36, 26], [-38, -28], [38, 28]], ammo: [0, 20], boxSpots: [[-20, 4], [18, 4], [-30, -24], [30, -24], [0, 26], [-8, -8]],
    spawns: [[-43, -30], [43, -30], [-43, 4], [43, 4], [0, 31], [-24, 31], [24, 31], [-43, 18], [43, 16]],
    lamps: [[-26, 20], [26, 20], [0, 14], [-36, -6], [36, -6], [-12, -28], [14, -28]],
    clear: [[-18, -16, 12], [14, -16, 11], [-10, -4, 12], [22, -4, 9], [-26, 8, 9], [10, 8, 9], [34, 8, 5], [0, -28, 7], [-34, 22, 5], [34, 22, 5]],
    props: [['crate', 2], ['barrel', 2], ['boom', 1.5], ['stack', 2], ['logs', 1]], propN: [16, 22],
    build() {
      const rust = matStd({ color: 0x7a3a24, roughness: .9 }), green = matStd({ color: 0x2f4a36, roughness: .9 }), blue = matStd({ color: 0x2c3e5a, roughness: .9 }), dark = matStd({ color: 0x1c1d20, roughness: .8 });
      const steel = matStd({ color: 0x8a8e94, metalness: .6, roughness: .4 }), wood = matStd({ color: 0x4a3626, roughness: 1 }), tank = matStd({ color: 0x1e2226, metalness: .4, roughness: .5 }), brick = matStd({ color: 0x7a4a36 });
      // three tracks: ballast, sleepers and two rails each, across the whole yard (low: you walk over them)
      for (const tz of [-16, -4, 8]) {
        addBox(0, tz, 92, 3.4, .06, matStd({ color: 0x33312d, roughness: 1 }), 0, false);
        for (let x = -45; x <= 45; x += 1.2) addBox(x, tz, .3, 2.6, .1, wood, .04, false);
        for (const o of [-.72, .72]) addBox(0, tz + o, 92, .1, .12, steel, .12, false);
      }
      // freight cars on the tracks (a gap in every line so the yard stays open)
      const wagon = (x, z, len, m, open) => { addBox(x, z, len, 3, 2.6, m, .9); addBox(x, z, len + .2, 3.1, .2, dark, 3.5, false);
        for (const a of [-len / 2 + 1.4, len / 2 - 1.4]) for (const b of [-1.1, 1.1]) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .25, 12), dark)); w.rotation.x = Math.PI / 2; w.position.set(x + a, .5, z + b); }
        addBox(x, z - 1.52, len * .3, .04, 2, open ? dark : m, 1.2, false); };
      wagon(-24, -16, 12, rust); wagon(-10, -16, 12, green, true); wagon(20, -16, 12, blue);
      wagon(22, -4, 12, rust, true); wagon(-6, -4, 12, blue);
      wagon(-28, 8, 12, green); wagon(4, 8, 12, rust);
      { const t = put(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 11, 18), tank)); t.rotation.z = Math.PI / 2; t.position.set(-10, 2.4, 8); t.castShadow = true; rayBlockers.push(t); // the tank car
        obstacles.push({ minX: -15.5, maxX: -4.5, minZ: 6.5, maxZ: 9.5, h: 3.9 }); addBox(-10, 8, 11.4, 2.6, .5, dark, .7, false); label(['VESZÉLYES'], '#ffd23f', .7, -10, 2.4, 6.4); }
      // the station on the south side, the water tower for the engines, containers stacked by the fence
      house(0, 28, 16, 7, 5, brick, 0x2a2a2e, 'n'); label(['RENDEZŐ PÁLYAUDVAR'], '#e8e2d0', 2, 0, 7, 24.3);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(34 + a * 1.8, -24 + b * 1.8, .35, .35, 7, steel);
      { const tw = put(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 16), wood)); tw.position.set(34, 9, -24); tw.castShadow = true;
        const cap = put(new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 16), dark)); cap.position.set(34, 11.8, -24); addBox(31.2, -24, .3, .3, 5, steel, 4, false); }
      for (const [x, z, c, n] of [[-38, -24, rust, 2], [-38, -18, blue, 1], [40, 16, green, 2]]) for (let k = 0; k < n; k++) { addBox(x, z, 6, 2.6, 2.6, c, k * 2.6, k === 0); addBox(x, z - 1.32, 5.4, .04, 2.2, dark, k * 2.6 + .2, false); }
      // signal masts: a red and a green eye glowing over the tracks
      for (const [x, z] of [[-40, -10], [40, 2], [-2, -22]]) { addBox(x, z, .25, .25, 5, steel); addBox(x, z, .6, .5, 1.3, dark, 4.4, false);
        glowSprite(0xff2a1a, .8, new V3(x, 5.4, z + .3)); glowSprite(0x2aff6a, .8, new V3(x, 4.9, z + .3)); pointLight(0xff3a2a, .8, 8, x, 5, z); }
    },
    areas: {
      north: { side: 'n', at: -20, name: 'Mozdonyszín', cost: 1250, core: { minX: -36, maxX: -4, minZ: -58, maxZ: -34 }, spawns: [[-32, -55], [-8, -55]], station: ['trap', -20, -44], graves: false },
      east:  { side: 'e', at: -8, name: 'Raktárcsarnok', cost: 1000, core: { minX: 46, maxX: 68, minZ: -20, maxZ: 4 }, spawns: [[65, -17], [65, 1]], station: ['forge', 56, -8] },
      west:  { side: 'w', at: 16, name: 'Váltóház', cost: 750, core: { minX: -68, maxX: -46, minZ: 4, maxZ: 28 }, spawns: [[-65, 7], [-65, 25]], station: ['well', -56, 16] },
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
// noScale: a map laid out in real metres isn't stretched
function bigMap(B) {
  const s = B.noScale ? 1 : MAP_SCALE, sc = ([x, z]) => [x * s, z * s], m = B.main, main = { minX: m.minX * s, maxX: m.maxX * s, minZ: m.minZ * s, maxZ: m.maxZ * s }, areas = {};
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
  cornStalks.length = 0; MAP.build(); flushCorn();
  resolveVanLanes(); buildFences(); buildVanGates(); // lanes are checked against what the map built, then the fence gets its gaps
  MAP.lamps.filter(([x, z]) => !inVanLane(x, z, 1.5)).forEach(([x, z]) => lamp(x, z));
  SPAWNS.forEach(([x, z]) => { const m = put(new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, .12, 10), new THREE.MeshLambertMaterial({ color: 0x2a2116 }))); m.position.set(x, .06, z); });
  for (const k in AREAS) buildArea(AREAS[k]);
  buildPower(); buildQuest();
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
  clearRideCorridor(); clearMod(); mergeStatic(); dressMap(id, seed);
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
  const soft = s => MAP.innerFence && Object.values(AREAS).some(a => a.side === s); // a side the wings open off: the map's see-through fence, not boards
  run(R.minX - e, R.maxX + e, gaps('n'), (a, b) => soft('n') ? fenceLine(a, R.minZ - e, b, R.minZ - e) : addBox((a + b) / 2, R.minZ - e, b - a, T, H, fenceMat));
  run(R.minX - e, R.maxX + e, gaps('s'), (a, b) => soft('s') ? fenceLine(a, R.maxZ + e, b, R.maxZ + e) : addBox((a + b) / 2, R.maxZ + e, b - a, T, H, fenceMat));
  run(R.minZ - e, R.maxZ + e, gaps('w'), (a, b) => soft('w') ? fenceLine(R.minX - e, a, R.minX - e, b) : addBox(R.minX - e, (a + b) / 2, T, b - a, H, fenceMat));
  run(R.minZ - e, R.maxZ + e, gaps('e'), (a, b) => soft('e') ? fenceLine(R.maxX + e, a, R.maxX + e, b) : addBox(R.maxX + e, (a + b) / 2, T, b - a, H, fenceMat));
  if (fenceMat.map === plankTex) { fenceMat.map = plankTex.clone(); fenceMat.map.needsUpdate = true; } // its own tiling, not every plank's
  fenceMat.map.repeat.set(20, 1);
  for (const k in AREAS) { // outer fences of each area: visual + stop bullets (bounds already stop walking)
    const a = AREAS[k], c = a.core, o = .2, vis = (x, z, w, d) => MAP.innerFence ? (w > d ? fenceLine(x - w / 2, z, x + w / 2, z) : fenceLine(x, z - d / 2, x, z + d / 2)) : addBox(x, z, w, d, H, fenceMat, 0, false);
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
  a.barricade = put(MAP.innerFence ? (g.children.forEach(b => { const i = rayBlockers.indexOf(b); if (i >= 0) rayBlockers.splice(i, 1); }), lockGate(a)) : g); // a gate in the map's style, not boards
  a.sign = label([a.name.toUpperCase(), `${SK.gate(a.cost)} PONT`], '#f2a33a', 3.2, a.gate.x, 3.3, a.gate.z);
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
  [-1.01, 1.01].forEach(z => bx(paint, 2.15, .4, .08, -1.33, 1.5, z)); // the bed's side rails: the ride in is back here
  for (const [a, b] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .3, 12), dark); t.rotation.x = Math.PI / 2; t.position.set(a, .45, b * 1.05); g.add(t);
  }
  [-.6, .6].forEach(b => bx(basic(0xfff2c0), .06, .18, .3, 2.42, .95, b));
  [-.8, .8].forEach(b => bx(basic(0xff2a1a), .06, .14, .22, -2.42, 1, b)); // tail lights
  const head = new THREE.SpotLight(0xfff0c0, 2.2, 30, .5, .5, 1.5); head.target.position.set(10, 0, 0); g.add(head.target);
  put(g); put(head); truck.head = head; // the headlight lives in the scene, not in the van: hiding the van must not change the light count (every shader would rebuild)
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
  const [x, z] = MAP.vans[i]; truck.dir = vanDir(x); truck.pos.set(x, 0, z); truck.side = (MAP.vanSide || [])[i] || (z >= 0 ? 1 : -1);
  truck.g.rotation.y = truck.dir > 0 ? 0 : Math.PI;
  truck.beacon.position.set(x, 3.6, z); truck.beam.position.set(x, 20, z);
  setVanAt(parked ? 0 : vanRun());
}
// how far out the van starts: from the road beyond its gate
const vanRun = () => Math.abs(truck.pos.x - (truck.dir < 0 ? MAIN_RECT.minX : MAIN_RECT.maxX)) + 14;
// off: metres the van is away from its spot along its lane (outward)
function syncVanLight() { // every frame: the headlight follows the van, and goes dark instead of away when the van is out of sight
  const h = truck.head; if (!h) return;
  truck.g.updateMatrixWorld(); h.position.set(2.5, 1, 0).applyMatrix4(truck.g.matrixWorld); h.intensity = truck.g.visible ? 2.2 : 0;
}
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
function turretMesh(opts, small) { // the tripod turret; also the stand-in for a teammate's (net.js)
  const g = new THREE.Group(), metal = matStd({ color: opts.rocket ? 0x5a3a30 : 0x3a4250, metalness: .6, roughness: .4 });
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(unitBox, metal); l.scale.set(.08, 1.1, .08); l.position.set(Math.sin(i * 2.1) * .3, .5, Math.cos(i * 2.1) * .3); l.rotation.set(-Math.cos(i * 2.1) * .3, 0, Math.sin(i * 2.1) * .3); g.add(l); } // feet out, top in
  const head = new THREE.Group(); head.position.y = 1.15; g.add(head);
  const body = new THREE.Mesh(unitBox, metal); body.scale.set(.35, .3, .5); head.add(body);
  const barrel = new THREE.Mesh(unitBox, metal); barrel.scale.set(opts.rocket ? .18 : .08, opts.rocket ? .18 : .08, .6); barrel.position.z = .5; head.add(barrel);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .02), basic(opts.shield ? 0x7fe8ff : 0x7fb8ff)); eye.position.set(0, .06, .26); head.add(eye);
  if (small) g.scale.setScalar(.75);
  if (opts.shield) g.add(new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  return { g, head };
}
function deployTurret(cost, dur = 60, opts = {}) {
  if (opts.station ? turrets.some(t => t.station) : turrets.filter(t => !t.station).length >= (opts.max || 1)) return false;
  if (player.points < cost) return false;
  player.points -= cost; SND.buy();
  const n = opts.n || 1, fwd = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), side = new V3(-fwd.z, 0, fwd.x);
  for (let k = 0; k < n; k++) {
    const p = player.pos.clone().addScaledVector(fwd, 1.6).addScaledVector(side, n > 1 ? (k ? 1.2 : -1.2) : 0); clampBounds(p, .5);
    const { g, head } = turretMesh(opts, n > 1 || opts.small);
    g.position.copy(p); scene.add(g);
    turrets.push({ g, head, t: dur, cd: .5, rate: opts.rate || 1, station: !!opts.station, dmgMul: opts.dmgMul || 1, shield: !!opts.shield, rocket: !!opts.rocket, small: !!(n > 1 || opts.small) });
  }
  banner(n > 1 ? 'IKERTORONY' : opts.shield ? 'PAJZSTORONY' : opts.rocket ? 'RAKÉTATORONY' : 'LÖVEGTORONY TELEPÍTVE', `${Math.round(dur)} másodpercig lő mindenre, ami mozog.`);
  return true;
}
function updateTurret(dt) {
  for (let i = turrets.length - 1; i >= 0; i--) {
    const turret = turrets[i];
    turret.t -= dt; turret.cd -= dt;
    if (turret.t <= 0) { if (turret.fixed) { turret.head.rotation.x = .35; if (turret === PWR.run) PWR.run = null; banner('A LÖVEGÁLLÁS LEÁLLT', 'Keresd meg az áramdobozt, ha újra kell.'); } else scene.remove(turret.g); turrets.splice(i, 1); continue; }
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
  if (turret.rocket) { explode(aim, { r: 3.5, zdmg: (60 + zombieHp() * .8) * SK.turret(), pr: .01, pdmg: .001, turret: true }); return; }
  hurtZombie(best, (20 + zombieHp() * .09) * SK.turret() * turret.dmgMul, { color: '#9fc8ff', turret: true });
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
  player.points -= c; T.active = 20; SND.buy(); SND.explode(); if (mission) { mission.secTrap = true; secCheck(); }
  if (NET.client) netAct('trap', trapState.indexOf(T));
  banner('TŰZCSAPDA', '20 másodpercig lángokban áll a kapu.');
}
function updateAreas(dt) {
  updateTurret(dt); updateTraps(dt); updateQuest();
  if (PWR.run && PWR.run.remote && (PWR.run.t -= dt) <= 0) PWR.run = null;
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
  if (PWR.gen && !PWR.on && near(PWR.gen.pos, 2.2)) return { type: 'gen' };
  if (PWR.box && near(PWR.box.pos, 2)) return { type: 'pbox' };
  { const i = QST.parts.findIndex(q => !q.got && near(q.pos, 1.8)); if (i >= 0) return { type: 'rpart', i }; }
  if (QST.radio && QST.stage === 0 && near(QST.radio.pos, 2.4)) return { type: 'radio' };
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
    case 'gen': return '<b>[E]</b> Generátor · áram bekapcsolása';
    case 'pbox': return PWR.run ? `Lövegállás aktív · ${Math.ceil(PWR.run.t)} mp` : `<b>[E]</b> Áramdoboz · lövegállás 45 mp · ${pwCost()} pont${lack(pwCost())}`;
    case 'rpart': return `<b>[E]</b> ${QST.parts[f.i].name} felvétele (${qt().part})`;
    case 'radio': { const n = QST.parts.filter(q => q.got).length; return n < 3 ? `${qt().broken} · hiányzik ${3 - n} alkatrész` : `<b>[E]</b> ${qt().use}`; }
  }
  return '';
}
function areaInteract(f) {
  const st = f.area && AREAS[f.area].st;
  switch (f.type) {
    case 'gen': if (NET.client) return netAct('pw', 'gen'); return powerOn();
    case 'pbox': return powerBoxUse();
    case 'rpart': return questTake(f.i);
    case 'radio': return questRadio();
    case 'gate': return unlockArea(f.area);
    case 'forge': return openStation('forge');
    case 'well': return openStation('well');
    case 'trap': return activateTrap(st);
    case 'tower': return deployTurret(SK.cost(st.cost), 75, { station: true }) || SND.deny();
    case 'truck': return extract();
    case 'perk': {
      const k = AREAS[f.area].perk.key, P = PERKS[k], c = SK.cost(P.cost); player.perks = player.perks || {};
      if (player.perks[k] || player.points < c) return SND.deny();
      player.points -= c; player.perks[k] = true; SND.power(); banner(P.name.toUpperCase(), P.desc); secCheck();
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

// ---------- buildings you can walk into, and farm dressing ----------
// four walls with openings (holes: side -> [[offset from the middle, width]]), a pitched roof overhead (not a wall to bullets); ruin: no roof
function hollow(x, z, w, d, h, mat, holes = {}, roofCol = 0x2b2a2c, ruin = false) {
  const t = .4, wall = (cx, cz, len, alongX, gaps) => {
    let a = -len / 2; const segs = [];
    for (const [o, gw] of (gaps || []).slice().sort((p, q) => p[0] - q[0])) { if (o - gw / 2 > a) segs.push([a, o - gw / 2]); a = o + gw / 2; }
    if (len / 2 > a) segs.push([a, len / 2]);
    for (const [s0, s1] of segs) { const m = (s0 + s1) / 2, L = s1 - s0; if (L < .2) continue; if (alongX) addBox(cx + m, cz, L, t, h, mat); else addBox(cx, cz + m, t, L, h, mat); }
    for (const [o, gw] of gaps || []) if (!ruin) { if (alongX) addBox(cx + o, cz, gw, t, h * .22, mat, h * .78, false); else addBox(cx, cz + o, t, gw, h * .22, mat, h * .78, false); } // the lintel over each opening
  };
  wall(x, z - d / 2, w, true, holes.n); wall(x, z + d / 2, w, true, holes.s);
  wall(x - w / 2, z, d, false, holes.w); wall(x + w / 2, z, d, false, holes.e);
  if (ruin) { const r = put(new THREE.Mesh(unitBox, matStd({ color: roofCol }))); r.scale.set(w * .45, .25, d * .5); r.position.set(x - w * .2, h + .2, z - d * .2); r.rotation.z = .25; return; } // half a roof left
  const rm = matStd({ color: roofCol, roughness: .8 }), alongX = w >= d, span = alongX ? d : w, len = (alongX ? w : d) + .6;
  [-1, 1].forEach(sd => {
    const r = put(new THREE.Mesh(unitBox, rm)), slope = span / 2 / Math.cos(.55) + .3;
    if (alongX) { r.scale.set(len, .25, slope); r.position.set(x, h + span * .22, z + sd * span / 4); r.rotation.x = sd * .55; }
    else { r.scale.set(slope, .25, len); r.position.set(x + sd * span / 4, h + span * .22, z); r.rotation.z = -sd * .55; }
    r.castShadow = true;
  });
}
function tractor(x, z, turn = 0) {
  const g = new THREE.Group(), red = matStd({ color: 0x8a2a1c, roughness: .7 }), dark = matStd({ color: 0x1a1a1a });
  const b = (m, sx, sy, sz, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(sx, sy, sz); e.position.set(px, py, pz); e.castShadow = true; g.add(e); };
  b(red, 2.6, .9, 1.1, .3, 1.2, 0); b(red, 1.1, 1.3, 1.2, -.8, 2.1, 0); b(dark, 1, .9, 1.1, -.8, 2.2, 0); b(dark, .12, 1, .12, 1.2, 2, .3); // body, cab, window, exhaust
  for (const [px, r, s] of [[-.9, .85, 1], [1.2, .5, 1]]) for (const pz of [-.75, .75]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .45, 14), dark); wh.rotation.x = Math.PI / 2; wh.position.set(px, r, pz * s); g.add(wh); }
  g.position.set(x, 0, z); g.rotation.y = turn; put(g);
  obstacles.push({ minX: x - 1.8, maxX: x + 1.8, minZ: z - 1.2, maxZ: z + 1.2, h: 2.6 });
}
function scarecrow(x, z) {
  addBox(x, z, .12, .12, 2.6, poleMat);
  const cloth = matStd({ color: 0x5a4a2a }), sack = matStd({ color: 0xa89868 });
  deco(unitBox, poleMat, x, 2, z, 1.8, .1, .1); deco(unitBox, cloth, x, 1.75, z, .7, .8, .3);
  deco(new THREE.SphereGeometry(.26, 10, 8), sack, x, 2.55, z); deco(new THREE.ConeGeometry(.42, .35, 10), matStd({ color: 0x3a2a1a }), x, 2.8, z);
}
// a rail fence with barbed wire along the top: what closes off a farm's wings (see-through; the invisible bounds do the stopping)
const railWood = matStd({ color: 0x5a4632, roughness: .9 }), wireMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
function railFence(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, n = Math.max(1, Math.round(len / 3)), ang = Math.atan2(-uz, ux);
  for (let k = 0; k <= n; k++) { const x = x0 + ux * len * k / n, z = z0 + uz * len * k / n; deco(unitBox, railWood, x, .8, z, .16, 1.6, .16); }
  for (const y of [.45, .95]) { const r = deco(unitBox, railWood, (x0 + x1) / 2, y, (z0 + z1) / 2, len, .1, .06); r.rotation.y = ang; }
  const pts = []; for (const y of [1.35, 1.55]) for (let k = 0; k < n; k++) { // two strands of wire, sagging a little between posts
    for (let s = 0; s <= 6; s++) { const f = (k + s / 6) / n, sag = Math.sin(s / 6 * Math.PI) * .06; pts.push(new V3(x0 + ux * len * f, y - sag, z0 + uz * len * f)); if (s > 0 && s < 6) pts.push(pts[pts.length - 1].clone()); }
  }
  put(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
}
const steelMat = matStd({ color: 0x7a7e80, metalness: .6, roughness: .5 }), blackIron = matStd({ color: 0x1c1c1e, metalness: .5, roughness: .5 });
const chainTex = canvasTex(64, (g, S) => { g.strokeStyle = '#b8bec2'; g.lineWidth = 2.2; for (let k = -S; k <= S; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); g.beginPath(); g.moveTo(k + S, 0); g.lineTo(k, S); g.stroke(); } });
chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping;
const chainMat = new THREE.MeshLambertMaterial({ map: chainTex, alphaTest: .5, side: THREE.DoubleSide, color: 0x9aa0a4 }), picketMat = matStd({ color: 0xa8a090, roughness: .9 }), tapeMat = matStd({ map: hazardTex });
function wireLine(x0, z0, x1, z1, ys, sag = .06) { // strands of wire, sagging a little between posts every ~3 m
  const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, n = Math.max(1, Math.round(len / 3)), pts = [];
  for (const y of ys) for (let k = 0; k < n; k++) for (let s = 0; s <= 6; s++) { const f = (k + s / 6) / n; pts.push(new V3(x0 + ux * len * f, y - Math.sin(s / 6 * Math.PI) * sag, z0 + uz * len * f)); if (s > 0 && s < 6) pts.push(pts[pts.length - 1].clone()); }
  put(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
}
const fenceSeg = (x0, z0, x1, z1, step, f) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step)); for (let k = 0; k <= n; k++) f(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, k, n); return { len, ang: Math.atan2(-(z1 - z0), x1 - x0) }; };
const FENCES = {
  rail: railFence,
  chain(x0, z0, x1, z1) { // chain-link on steel posts, barbed wire on top
    const { len, ang } = fenceSeg(x0, z0, x1, z1, 3, (x, z) => deco(unitBox, steelMat, x, 1.2, z, .09, 2.4, .09));
    const top = deco(unitBox, steelMat, (x0 + x1) / 2, 2.2, (z0 + z1) / 2, len, .06, .06); top.rotation.y = ang;
    const pg = new THREE.PlaneGeometry(len, 2.1), uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / .9, uv.getY(i) * 2.1 / .9);
    const p = put(new THREE.Mesh(pg, chainMat)); p.position.set((x0 + x1) / 2, 1.1, (z0 + z1) / 2); p.rotation.y = ang;
    wireLine(x0, z0, x1, z1, [2.45, 2.62], .04);
  },
  iron(x0, z0, x1, z1) { // a cemetery's wrought iron: stone piers, black bars, spear tips
    const { len, ang } = fenceSeg(x0, z0, x1, z1, 6, (x, z) => { deco(unitBox, stoneMat, x, .95, z, .5, 1.9, .5); deco(unitBox, stoneMat, x, 1.95, z, .62, .1, .62); });
    fenceSeg(x0, z0, x1, z1, .16, (x, z, k) => { const h = k % 2 ? 1.55 : 1.7; deco(unitBox, blackIron, x, h / 2, z, .035, h, .035); deco(unitBox, blackIron, x, h + .04, z, .07, .07, .07).rotation.set(.78, 0, .78); });
    for (const y of [.25, 1.35]) { const r = deco(unitBox, blackIron, (x0 + x1) / 2, y, (z0 + z1) / 2, len, .05, .03); r.rotation.y = ang; }
  },
  rope(x0, z0, x1, z1) { // the fair: galvanised crowd barriers, hazard tape strung along the top
    const { ang } = fenceSeg(x0, z0, x1, z1, 2.3, () => {});
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.3)), ux = (x1 - x0) / n, uz = (z1 - z0) / n;
    for (let k = 0; k < n; k++) { const g = new THREE.Group(); g.position.set(x0 + ux * (k + .5), 0, z0 + uz * (k + .5)); g.rotation.y = ang; put(g);
      for (const y of [.25, 1.1]) deco(unitBox, steelMat, 0, y, 0, 2.2, .05, .05, g);
      for (let b = -1; b <= 1; b += .2) deco(unitBox, steelMat, b, .68, 0, .025, .85, .025, g);
      for (const s of [-1.05, 1.05]) { deco(unitBox, steelMat, s, .55, 0, .05, 1.1, .05, g); deco(unitBox, steelMat, s, .02, 0, .08, .04, .7, g); } }
    const tape = deco(unitBox, tapeMat, (x0 + x1) / 2, 1.3, (z0 + z1) / 2, len, .1, .01); tape.rotation.y = ang;
  },
  picket(x0, z0, x1, z1) { // the town: a whitewashed picket fence gone grey
    const pm = picketMat, { len, ang } = fenceSeg(x0, z0, x1, z1, 2.5, (x, z) => deco(unitBox, railWood, x, .75, z, .14, 1.5, .14));
    fenceSeg(x0, z0, x1, z1, .22, (x, z, k) => deco(unitBox, pm, x, .62, z, .09, 1.15 + (k % 3 === 1 ? .1 : 0), .03).rotation.y = ang);
    for (const y of [.35, .95]) { const r = deco(unitBox, railWood, (x0 + x1) / 2, y, (z0 + z1) / 2, len, .08, .05); r.rotation.y = ang; }
  },
};
function fenceLine(x0, z0, x1, z1) { (FENCES[MAP.innerFence] || railFence)(x0, z0, x1, z1); }
function lockGate(a) { // the locked way in, in the map's style
  const st = MAP.innerFence; if (st === 'rail' || !FENCES[st]) return barbGate(a);
  const g = new THREE.Group(), alongX = a.side === 'n' || a.side === 's', W = GATE_HALF * 2;
  const b = (m, sx, sy, sz, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(sx, sy, sz); e.position.set(px, py, pz); e.castShadow = true; g.add(e); return e; };
  const chainLock = h => { for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(.06, .015, 4, 10), steelMat); l.position.set(-.2 + k * .065, h + Math.sin(k / 6 * Math.PI) * -.08, .06); l.rotation.y = k % 2 ? Math.PI / 2 : 0; g.add(l); }
    b(matStd({ color: 0xb8923a, metalness: .8, roughness: .35 }), .12, .15, .06, .03, h - .2, .08); };
  if (st === 'chain') { for (const x of [-W / 2, 0, W / 2]) b(steelMat, .07, 2.2, .07, x, 1.1, 0); for (const y of [.1, 2.15]) b(steelMat, W, .06, .06, 0, y, 0);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), chainMat); p.position.y = 1.1; g.add(p);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(.35, .012, 4, 90, Math.PI * 16), new THREE.MeshBasicMaterial({ color: 0x3a3a3a })); coil.scale.set(1, 1, W * 1.2); coil.rotation.y = Math.PI / 2; coil.position.set(0, 2.5, 0); g.add(coil); chainLock(1.1); }
  if (st === 'iron') { for (let x = -W / 2; x <= W / 2 + .01; x += .16) { b(blackIron, .04, 2.1, .04, x, 1.05, 0); b(blackIron, .08, .08, .08, x, 2.15, 0).rotation.set(.78, 0, .78); } for (const y of [.3, 1.1, 1.9]) b(blackIron, W, .06, .04, 0, y, 0); chainLock(1.1); }
  if (st === 'rope') { for (const o of [-.6, .6]) { for (const y of [.25, 1.1]) b(steelMat, W * .9, .05, .05, 0, y, o); for (let x = -W * .45; x <= W * .45; x += .22) b(steelMat, .025, .85, .025, x, .68, o); }
    b(tapeMat, W, .12, .02, 0, 1.3, 0); }
  if (st === 'picket') { const pm = picketMat; for (let x = -W / 2; x <= W / 2 + .01; x += .22) b(pm, .09, 1.3, .03, x, .7, 0);
    for (const y of [.35, 1.05]) b(railWood, W, .1, .05, 0, y, .04); const d = b(railWood, Math.hypot(W, .7), .1, .05, 0, .7, .06); d.rotation.z = Math.atan2(.7, W); chainLock(.95); }
  g.children.forEach(e => { if (e.isMesh && e.geometry === unitBox) rayBlockers.push(e); });
  g.position.copy(a.gate); if (!alongX) g.rotation.y = Math.PI / 2;
  return g;
}
function barbGate(a) { // the locked way in: a steel farm gate with a coil of barbed wire in front
  const g = new THREE.Group(), steel = matStd({ color: 0x7a7e80, metalness: .6, roughness: .5 }), alongX = a.side === 'n' || a.side === 's', W = GATE_HALF * 2;
  const b = (sx, sy, sz, px, py, pz) => { const e = new THREE.Mesh(unitBox, steel); e.scale.set(sx, sy, sz); e.position.set(px, py, pz); g.add(e); rayBlockers.push(e); };
  for (const y of [.3, .75, 1.2]) b(W, .07, .07, 0, y, 0); for (const x of [-W / 2, 0, W / 2]) b(.09, 1.3, .09, x, .65, 0); // tube gate
  const coil = new THREE.Mesh(new THREE.TorusGeometry(.42, .015, 4, 90, Math.PI * 16), new THREE.MeshBasicMaterial({ color: 0x3a3a3a })); // a spring of wire, stretched along the gate
  coil.scale.set(1, 1, W * 1.2); coil.rotation.y = Math.PI / 2; coil.position.set(0, .42, .7); g.add(coil);
  g.position.copy(a.gate); if (!alongX) g.rotation.y = Math.PI / 2;
  return g;
}

// ---------- power and the yard gun: a hidden generator turns the power on; then a power box turns up somewhere, and for points it runs the gun ----------
const PWR = { on: false, gen: null, box: null, bi: -1, uses: 0, mount: null, run: null };
const pwCost = () => SK.cost(2000 + 750 * PWR.uses); // dearer every time
function buildPower() {
  Object.assign(PWR, { on: false, gen: null, box: null, bi: -1, uses: 0, mount: null, run: null });
  const P = MAP.power; if (!P) return;
  const rng = mulberry(mapSeed + 5150), [tx, tz] = P.turret;
  for (let k = 0; k < 18; k++) { if (k === 4 || k === 13) continue; const q = k / 18 * Math.PI * 2, bx = tx + Math.cos(q) * 4.4, bz = tz + Math.sin(q) * 4.4; // sandbags, a way in north and south
    deco(unitBox, sandMat, bx, .3 + (k % 2) * .05, bz, 1.4, .55, .6).rotation.y = -q; deco(unitBox, sandMat, bx, .78, bz, 1.2, .45, .55).rotation.y = -q + .1;
    obstacles.push({ minX: bx - .55, maxX: bx + .55, minZ: bz - .55, maxZ: bz + .55, h: 1 }); }
  addBox(tx, tz, 1.4, 1.4, .6, matStd({ color: 0x3a3c40, metalness: .5 }));
  const { g, head } = turretMesh({}, false); g.position.set(tx, .6, tz); g.scale.setScalar(1.4); put(g); head.rotation.x = .35; // sagging while there's no power
  PWR.mount = { g, head, pos: new V3(tx, 0, tz) }; label(['LÖVEGÁLLÁS'], '#9fc8ff', 1.8, tx, 3.6, tz);
  const [gx, gz] = P.gens[Math.floor(rng() * P.gens.length)], gm = new THREE.Group(), green = matStd({ color: 0x3a4a2a, roughness: .7 }), dark = matStd({ color: 0x1a1a1a });
  const gb = (m, sx, sy, sz, px, py, pz) => { const e = new THREE.Mesh(unitBox, m); e.scale.set(sx, sy, sz); e.position.set(px, py, pz); e.castShadow = true; gm.add(e); };
  gb(green, 1.8, 1.1, 1, 0, .6, 0); gb(dark, 1.9, .12, 1.1, 0, 1.2, 0); gb(dark, .14, .9, .14, .7, 1.6, .3);
  const lampM = new THREE.MeshBasicMaterial({ color: 0x8a1a12 }), lampO = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), lampM); lampO.position.set(-.7, 1.3, .5); gm.add(lampO);
  gm.position.set(gx, 0, gz); put(gm); obstacles.push({ minX: gx - 1, maxX: gx + 1, minZ: gz - .6, maxZ: gz + .6, h: 1.3 });
  PWR.gen = { pos: new V3(gx, 0, gz), lampM };
}
function powerOn() { // everyone: lights up, a power box turns up
  if (PWR.on) return; PWR.on = true; PWR.gen.lampM.color.setHex(0x6aff6a); PWR.mount.head.rotation.x = 0;
  lamps.forEach(l => { if (l.light && l.light.isLight) l.light.intensity = 2.2; });
  banner('VAN ÁRAM', 'Valahol megjelent a lövegállás áramdoboza.'); SND.power();
  if (!NET.client) placePowerBox();
}
function placePowerBox(i) { // a random spot (where you can get to, if any), not the last one
  const S = MAP.power.boxes;
  if (i == null) { const ok = S.map((s, k) => k).filter(k => k !== PWR.bi && inBounds(S[k][0], S[k][1], 1)), pool = ok.length ? ok : S.map((s, k) => k).filter(k => k !== PWR.bi); i = pool[Math.floor(Math.random() * pool.length)]; }
  if (PWR.box) mapGroup.remove(PWR.box.g);
  const [x, z] = S[i], g = new THREE.Group(), grey = matStd({ color: 0x5a5e62, metalness: .5, roughness: .5 });
  const e = new THREE.Mesh(unitBox, grey); e.scale.set(.8, 1.1, .4); e.position.y = 1.2; g.add(e);
  const hz = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ map: hazardTex })); hz.scale.set(.82, .14, .42); hz.position.y = 1.55; g.add(hz);
  const pole = new THREE.Mesh(unitBox, poleMat); pole.scale.set(.12, 1.8, .12); pole.position.set(0, .9, -.3); g.add(pole);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 16, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 8; g.add(beam);
  g.position.set(x, 0, z); put(g);
  const lab = textSprite(['ÁRAMDOBOZ'], '#ffd23f', .7); lab.position.y = 2.2; g.add(lab);
  PWR.bi = i; PWR.box = { pos: new V3(x, 0, z), g };
}
function powerBoxUse() { // host / solo: pay, the yard gun runs 45 s, the box moves
  const c = pwCost(); if (PWR.run || player.points < c) return SND.deny();
  player.points -= c; if (NET.client) return netAct('pw', 'box');
  runYardGun();
}
function runYardGun() {
  const M = PWR.mount; PWR.uses++;
  PWR.run = { g: M.g, head: M.head, t: 45, cd: .5, rate: 1.4, station: true, fixed: true, dmgMul: 1.5 }; turrets.push(PWR.run);
  banner('LÖVEGÁLLÁS AKTÍV', '45 másodpercig lő mindenre a tanyaudvaron.'); SND.buy(); SND.explode();
  if (!NET.client) placePowerBox();
}

// ---------- a map's hidden challenge (the farm: the radio). Three parts lie hidden; fix the radio, beat who answers, get the reward ----------
const QST = { parts: [], stage: 0, wave: [], radio: null };
const QTXT = { names: ['ELEKTRONCSŐ', 'AKKUMULÁTOR', 'ANTENNA'], part: 'rádióalkatrész', broken: 'Rossz rádió', use: 'Rádió megjavítása', all: ['MEGVAN MIND A HÁROM ALKATRÉSZ', 'Javítsd meg a rádiót a lakóház tornácán.'],
  call: ['VALAKI VÁLASZOLT A RÁDIÓN…', 'Egy különleges csapat tart feléd. Öld meg mindet!'], done: 'A RÁDIÓ ELHALLGATOTT', where: 'a tornácon' };
const qt = () => Object.assign({}, QTXT, MAP.quest && MAP.quest.txt);
function buildQuest() {
  QST.parts = []; QST.stage = 0; QST.wave = []; QST.radio = null;
  const Q = MAP.quest; if (!Q) return;
  const rng = mulberry(mapSeed + 777), spots = Q.parts.slice(), names = qt().names;
  const [rx, rz] = Q.radio, radio = new THREE.Group(), brown = matStd({ color: 0x4a3020 });
  if (!Q.txt) { // the farm's radio; other maps build their own thing in build()
    const rb = new THREE.Mesh(unitBox, brown); rb.scale.set(.6, .38, .3); rb.position.y = 1.1; radio.add(rb);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(.08, 12), new THREE.MeshBasicMaterial({ color: 0xd8b060 })); dial.position.set(.14, 1.12, .16); radio.add(dial); }
  radio.position.set(rx, 0, rz); put(radio); QST.radio = { pos: new V3(rx, 0, rz) };
  for (let k = 0; k < 3; k++) {
    const [x, z] = spots.splice(Math.floor(rng() * spots.length), 1)[0], g = new THREE.Group();
    const m = new THREE.Mesh(k === 2 ? new THREE.CylinderGeometry(.03, .03, .8, 6) : unitBox, matStd({ color: [0x6a8aa0, 0x3a3a30, 0x9a9aa0][k], metalness: .6, roughness: .4 }));
    if (k !== 2) m.scale.set(.3, .22, .2); m.position.y = .35; g.add(m);
    g.add(Object.assign(glowSprite(0x9fe8ff, .8, new V3(0, .45, 0)), {})); // a faint glint: hidden, not invisible
    g.position.set(x, 0, z); put(g);
    QST.parts.push({ pos: new V3(x, 0, z), g, got: false, name: names[k] });
  }
}
function questTake(i) { // everyone asks, the host decides
  const p = QST.parts[i]; if (!p || p.got) return;
  if (NET.client) return netAct('pw', 'part' + i);
  questGot(i);
}
function questGot(i) {
  const p = QST.parts[i]; if (!p || p.got) return; p.got = true; mapGroup.remove(p.g); SND.pickup(3);
  const n = QST.parts.filter(q => q.got).length;
  const T = qt(); if (n < 3) popText(`${T.part[0].toUpperCase() + T.part.slice(1)}: ${p.name} · ${n}/3`, '#9fe8ff'); else banner(...T.all);
}
function questRadio() {
  if (QST.stage !== 0 || QST.parts.some(q => !q.got)) return SND.deny();
  if (NET.client) return netAct('pw', 'radio');
  QST.stage = 1; const d = (mission && mission.job.diff) || 1, S = activeSpawns().slice().sort((a, b) => Math.hypot(b[0] - QST.radio.pos.x, b[1] - QST.radio.pos.z) - Math.hypot(a[0] - QST.radio.pos.x, a[1] - QST.radio.pos.z));
  for (let k = 0; k < 5 + 2 * d; k++) { const [sx, sz] = S[k % Math.min(3, S.length)], z = spawnZombieAt(pick(['brute', 'runner', 'walker', 'leaper']), sx + rand(-2, 2), sz + rand(-2, 2)); setZTier(z, 2); QST.wave.push(z); }
  banner(...qt().call); SND.roar();
  questFx();
}
function questFx() { // what the challenge sets off, for everyone
  const f = MAP.quest && MAP.quest.fx;
  if (f === 'blast') for (let k = 0; k < 5; k++) setTimeout(() => { fxExplosion(new V3(-20 + k * 10, 6, -50), 0xff8a30, 6); SND.explode(); }, k * 260); // the rock face goes up
  if (f === 'spin' && QST.spin && !mapSpin.includes(QST.spin)) mapSpin.push(QST.spin); // the wheel turns again
}
function updateQuest() { // host / solo: the answer beaten -> the reward on the porch
  if (QST.stage !== 1 || NET.client || QST.wave.some(z => !z.dead)) return;
  QST.stage = 2; const M = mission, d = (M && M.job.diff) || 1, [ox, oz] = MAP.quest.drop || [0, -2], at = QST.radio.pos.clone().add(new V3(ox, 0, oz));
  if (M) { M.parts = (M.parts || 0) + 20 + 8 * d; M.fabric = (M.fabric || 0) + 15 + 6 * d; }
  if (Math.random() < .5) spawnDrop(makeWeapon(pick(BASES), Math.max(2, rollRarity(.5)), lootLvl(1)), at); else spawnGearDrop(makeGear(null, Math.max(2, rollRarity(.5)), lootLvl(1)), at);
  burst(at.clone().setY(1), 0x9fe8ff, 40, 5, .9); SND.legend && SND.legend(false);
  banner(qt().done, `+${20 + 8 * d} ⚙ és +${15 + 6 * d} ${FAB} (kijutáskor) · egy ritka tárgy ${qt().where}`);
}
// the party: what the host sends, what a member does with it
const pwState = () => PWR.gen ? [PWR.on ? 1 : 0, PWR.bi, PWR.uses, PWR.run ? Math.round(PWR.run.t) : 0, QST.parts.reduce((m, q, i) => m | (q.got ? 1 << i : 0), 0), QST.stage] : null;
function pwApply(s) {
  if (!PWR.gen || !Array.isArray(s)) return;
  if (+s[0] && !PWR.on) powerOn();
  if (+s[1] >= 0 && +s[1] !== PWR.bi && MAP.power.boxes[+s[1]]) placePowerBox(+s[1]);
  PWR.uses = +s[2] || 0; if (+s[3] > 0 && !PWR.run) { PWR.run = { t: +s[3], remote: true }; banner('LÖVEGÁLLÁS AKTÍV', 'Egy társad bekapcsolta.'); } if (PWR.run && PWR.run.remote) PWR.run.t = +s[3]; if (!(+s[3] > 0) && PWR.run && PWR.run.remote) PWR.run = null;
  QST.parts.forEach((q, i) => { if ((+s[4] & (1 << i)) && !q.got) questGot(i); }); if (!QST.stage && +s[5]) questFx(); QST.stage = +s[5] || QST.stage;
}
function pwAct(a) { // host: a member's request
  if (a === 'gen') { if (!PWR.on) powerOn(); }
  else if (a === 'box') { if (!PWR.run) runYardGun(); }
  else if (a === 'radio') questRadio();
  else if (/^part\d$/.test(a)) questGot(+a.slice(4));
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
  if (MAP.power) [...MAP.power.boxes, ...MAP.power.gens].forEach(([x, z]) => pts.push([x, z, 2])); // the power box and the generator need room
  if (MAP.quest) MAP.quest.parts.forEach(([x, z]) => pts.push([x, z, 1.5]));
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
function blowBarrel(p, remote) {
  if (p.gone) return; p.gone = true; if (!remote) pushFx(['b', Math.round(p.x * 10), Math.round(p.z * 10)]);
  const i = props.indexOf(p); if (i >= 0) props.splice(i, 1);
  mapGroup.remove(p.g);
  p.obs.forEach(o => { const k = obstacles.indexOf(o); if (k >= 0) obstacles.splice(k, 1); });
  p.blk.forEach(b => { const k = rayBlockers.indexOf(b); if (k >= 0) rayBlockers.splice(k, 1); });
  if (!remote) explode(new V3(p.x, .8, p.z), { r: 5.5, zdmg: (200 + zombieHp() * 1.2) * (rk('e_barrel') ? 2 : 1), pr: 4.5, pdmg: 40 }); // the teammate's copy just goes away: their explosion arrives as its own effect
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
  if (mission) { mission.secBox = true; secCheck(); }
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
  if (key === 'swift') { roundMod.speed = 1.35; roundMod.points = 1.3; }
  if (key === 'tank') { roundMod.hp = 1.6; roundMod.points = 1.4; }
  if (key === 'cursed') { roundMod.speed = 1.2; roundMod.hp = 1.2; roundMod.elite = true; roundMod.points = 1.5; scene.fog.color.setHex(0x120a18); scene.background.setHex(0x120a18); moonMesh.material.color.setHex(0xb07aff); }
  rain.visible = key === 'storm';
}
function updateMapFx(dt) {
  for (const m of mist) { m.position.x += m.userData.v * dt; if (m.position.x > m.userData.hi) m.position.x = m.userData.lo; } // the ground mist drifts
  mapSpin.forEach(m => m.rotation.z += dt * .4); cornWind.value += dt;
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
const vanGates = [], roadMat = new THREE.MeshStandardMaterial({ color: 0x2e2c28, roughness: 1 }), dirtMat = new THREE.MeshStandardMaterial({ color: 0x4a4032, roughness: 1 });
const gateMat = new THREE.MeshStandardMaterial({ color: 0x6a6e72, metalness: .6, roughness: .45 }), gateBar = new THREE.MeshStandardMaterial({ color: 0xc8a23a, metalness: .3, roughness: .6 });
function buildVanGates() {
  vanGates.length = 0;
  for (const [vi, [vx, z]] of MAP.vans.entries()) {
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
    const road = new THREE.Mesh(new THREE.PlaneGeometry(40, VAN_HALF * 2 - .4), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(d * 20, .015, 0); road.receiveShadow = true; g.add(road);
    const side = (MAP.vanSide || [])[vi] || (z >= 0 ? 1 : -1), along = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 38), dirtMat); along.rotation.x = -Math.PI / 2; along.position.set(d * 14.2, .012, -side * 17); along.receiveShadow = true; g.add(along); // the county road the van comes down
    const turn = new THREE.Mesh(new THREE.CircleGeometry(5.5, 20), dirtMat); turn.rotation.x = -Math.PI / 2; turn.position.set(d * 17, .013, -side * 2.5); turn.receiveShadow = true; g.add(turn);
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
  // the side it comes down the road from: the one clear of the areas outside the fence
  const areaHit = r => Object.values(AREAS).some(A => rectsHit(r, { minX: A.core.minX - 1.5, maxX: A.core.maxX + 1.5, minZ: A.core.minZ - 1.5, maxZ: A.core.maxZ + 1.5 }));
  MAP.vanSide = MAP.vans.map(([x, z]) => { const pref = z >= 0 ? 1 : -1; return [pref, -pref].find(s => !rideRects(x, z, s).some(areaHit)) || pref; });
}
// the whole drive in (along the fence, the turn, the reverse through the gate): whatever stands outside the fence in its way goes,
// trees and other grouped props included
function rideCorridor() {
  return MAP.vans.flatMap(([vx, vz], i) => rideRects(vx, vz, (MAP.vanSide || [])[i]));
}
function rideRects(vx, vz, side) {
  const rects = [];
  {
    for (let t = 0; t <= rideLen(); t += .25) { const [x, z, ry] = ridePath(t, vx, vz, vanDir(vx), side || (vz >= 0 ? 1 : -1)), cs = Math.cos(ry), sn = Math.sin(ry); let r = null;
      for (const [lx, lz] of [[2.6, 1.3], [2.6, -1.3], [-2.6, 1.3], [-2.6, -1.3]]) { const cx = x + lx * cs + lz * sn, cz = z - lx * sn + lz * cs; r = r ? { minX: Math.min(r.minX, cx), maxX: Math.max(r.maxX, cx), minZ: Math.min(r.minZ, cz), maxZ: Math.max(r.maxZ, cz) } : { minX: cx, maxX: cx, minZ: cz, maxZ: cz }; }
      rects.push({ minX: r.minX - .8, maxX: r.maxX + .8, minZ: r.minZ - .8, maxZ: r.maxZ + .8 }); }
  }
  return rects;
}
function clearRideCorridor() {
  const rects = rideCorridor(), box = new THREE.Box3(), outside = b => (b.min.x + b.max.x) / 2 < MAIN_RECT.minX - 1 || (b.min.x + b.max.x) / 2 > MAIN_RECT.maxX + 1 || (b.min.z + b.max.z) / 2 < MAIN_RECT.minZ - 1 || (b.min.z + b.max.z) / 2 > MAIN_RECT.maxZ + 1;
  mapGroup.updateMatrixWorld(true);
  for (const c of [...mapGroup.children]) {
    if (c.isInstancedMesh) continue; box.setFromObject(c); if (box.isEmpty()) continue;
    const s = box.getSize(new V3()); if (s.x > 30 || s.z > 30 || box.max.y < .15 || !outside(box)) continue; // ground, roads, the fence line stay
    const R = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
    if (Object.values(AREAS).some(A => rectsHit(R, { minX: A.core.minX - .5, maxX: A.core.maxX + .5, minZ: A.core.minZ - .5, maxZ: A.core.maxZ + .5 }))) continue; // an area's own buildings stay
    if (rects.some(q => rectsHit(q, R))) { mapGroup.remove(c); const i = rayBlockers.indexOf(c); if (i >= 0) rayBlockers.splice(i, 1); }
  }
  for (let i = obstacles.length - 1; i >= 0; i--) { const o = obstacles[i]; if (o.gate) continue; const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
    if ((cx < MAIN_RECT.minX - 1 || cx > MAIN_RECT.maxX + 1 || cz < MAIN_RECT.minZ - 1 || cz > MAIN_RECT.maxZ + 1) && rects.some(q => rectsHit(q, o))) obstacles.splice(i, 1); }
}
const inVanLane = (x, z, pad) => (MAP.vans || []).some(([vx, vz]) => { const R = laneRect(vx, vz); return x > R.minX - pad && x < R.maxX + pad && z > R.minZ - pad && z < R.maxZ + pad; });

// ---------- set dressing: grass and gravel underfoot, a treeline (or a far town) on the horizon, mist drifting low ----------
// all instanced, all for looks: nothing here blocks, and it is added after mergeStatic so it stays instanced
const mist = [];
const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
function tuftGeo(blades, h, w) { // a clump of thin triangles, darker at the root
  const pos = [], col = [];
  for (let i = 0; i < blades; i++) { const a = i / blades * Math.PI + Math.random() * .5, lean = (Math.random() - .5) * .25, hh = h * (.7 + Math.random() * .5), dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    pos.push(-dx, 0, -dz, dx, 0, dz, lean * Math.cos(a + 1.57), hh, lean * Math.sin(a + 1.57)); col.push(.35, .35, .35, .35, .35, .35, 1, 1, 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function scatter(geo, mat, n, place, scale) {
  if (!geo.attributes.color) { geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)); } mat.vertexColors = true; // r128 only tints instances through vertex colours
  const im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V3(), s = new V3(); let k = 0;
  for (let tries = 0; k < n && tries < n * 4; tries++) { const at = place(); if (!at) continue; e.set(at.rx || 0, Math.random() * 6.28, at.rz || 0, 'YXZ'); q.setFromEuler(e); const sc = scale(); s.set(sc, sc * (at.sy || 1), sc); p.set(at.x, at.y || 0, at.z); m.compose(p, q, s); im.setMatrixAt(k++, m); if (at.c && im.setColorAt) im.setColorAt(k - 1, at.c); }
  im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; mapGroup.add(im); return im;
}
function dressMap(id, seed) {
  mist.length = 0;
  const L = MAP.look, R = MAIN_RECT, rng = mulberry(seed + 4242), rr = (a, b) => a + rng() * (b - a), ext = allRectsBound(), hard = L.tex === 'asphalt';
  const inside = () => { const x = rr(ext.minX - 6, ext.maxX + 6), z = rr(ext.minZ - 6, ext.maxZ + 6); if (blockedAt(x, z, .35) || inVanLane(x, z, 1)) return null; return { x, z }; };
  const base = new THREE.Color(L.ground), tint = (lo, hi) => base.clone().lerp(new THREE.Color(lo), .55).offsetHSL(0, 0, rr(-.05, hi));
  // grass (not on the asphalt maps): a few thousand clumps, the map's own green-brown
  if (!hard && id !== 'quarry') {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    scatter(tuftGeo(5, .42, .07), mat, id === 'town' ? 1600 : 4200, () => { const a = inside(); if (a) a.c = tint(id === 'town' ? 0x6a5a30 : 0x3f5a26, .06); return a; }, () => rr(.6, 1.5));
  }
  // gravel, stones and litter everywhere
  const stone = new THREE.MeshLambertMaterial({ color: 0xffffff });
  scatter(new THREE.DodecahedronGeometry(.12, 0), stone, hard ? 500 : id === 'quarry' ? 1400 : 700, () => { const a = inside(); if (a) { a.c = new THREE.Color(hard ? 0x3a3c40 : id === 'quarry' ? 0x8a8a90 : 0x5a554a).offsetHSL(0, 0, rr(-.06, .08)); a.sy = rr(.4, .8); a.y = .02; } return a; }, () => rr(.5, 2.2));
  // puddles on the hard ground: dark, glossy, catching the lamps
  if (hard) { const pm = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: .08, metalness: .7, transparent: true, opacity: .85 });
    scatter(new THREE.CircleGeometry(1, 16), pm, 40, () => { const a = inside(); if (a) { a.rx = -Math.PI / 2; a.y = .018; a.sy = rr(.4, .9); } return a; }, () => rr(.6, 2)); }
  // the horizon: pines (or dead trees) round the whole yard, far town blocks behind the asphalt maps
  const far = (lo, hi) => { const a = rng() * 6.28, d = rr(lo, hi), cx = (ext.minX + ext.maxX) / 2, cz = (ext.minZ + ext.maxZ) / 2, rx = (ext.maxX - ext.minX) / 2, rz = (ext.maxZ - ext.minZ) / 2;
    const x = cx + Math.cos(a) * (rx + d), z = cz + Math.sin(a) * (rz + d); return inVanLane(x, z, 6) ? null : { x, z }; };
  const dark = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (id === 'gas' || id === 'hospital' || id === 'town') scatter(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), dark, 90, () => { const a = far(55, 120); if (a) { a.sy = rr(.4, 1.6); a.c = new THREE.Color(0x15161a).offsetHSL(0, 0, rr(-.02, .03)); } return a; }, () => rr(8, 16));
  const pine = new THREE.ConeGeometry(1, 3.2, 7).translate(0, 2.2, 0), trunk = new THREE.CylinderGeometry(.18, .22, .9, 6).translate(0, .45, 0);
  const treeGeo = THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeBufferGeometries([pine.toNonIndexed(), trunk.toNonIndexed()]) : pine;
  scatter(treeGeo, dark, id === 'quarry' ? 120 : 320, () => { const a = far(40, 110); if (a) a.c = new THREE.Color(id === 'fair' ? 0x121a14 : 0x0f1612).offsetHSL(0, 0, rr(-.02, .03)); return a; }, () => rr(2.2, 5));
  // low mist: a few big soft sheets, drifting slowly across
  const mm = new THREE.MeshBasicMaterial({ map: mistTex, color: new THREE.Color(L.fog).lerp(new THREE.Color(0x9aa4b4), .5), transparent: true, opacity: .07, depthWrite: false });
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mm); m.rotation.x = -Math.PI / 2; const w = rr(22, 40); m.scale.set(w, w * rr(.4, .7), 1);
    m.position.set(rr(ext.minX, ext.maxX), rr(.4, 1.4), rr(ext.minZ, ext.maxZ)); m.userData = { v: rr(.25, .7), lo: ext.minX - 25, hi: ext.maxX + 25 }; m.renderOrder = 2; mapGroup.add(m); mist.push(m); }
}
