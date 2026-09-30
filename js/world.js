const OWN = new WeakSet(); // textures and materials made for one object only: freed with it (disposeTree)
// ================= RENDERER / SCENES =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
// filmic curve: deep blacks, lamps and fire roll off instead of clipping (gfx.js may lower the pixel ratio / shadows per quality)
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = .75;
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
$('game').prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f18);
scene.fog = new THREE.FogExp2(0x0a0f18, .03);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .05, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .01, 10);
vmScene.add(new THREE.HemisphereLight(0x8a9cc0, 0x2a2018, .6));
const vmSun = new THREE.DirectionalLight(0xffe2c0, .85); vmSun.position.set(1, 2, 1.5); vmScene.add(vmSun);
const vmRim = new THREE.DirectionalLight(0x9ab4ff, .45); vmRim.position.set(-2, 1, -1.5); vmScene.add(vmRim); // cool moon rim on the gun edges
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix();
});

// lights
const hemi = new THREE.HemisphereLight(0x5a6f99, 0x2a2016, .75); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa4b6ff, .7);
moon.position.set(-30, 50, -20); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 150 });
moon.shadow.bias = -.0006; moon.shadow.normalBias = .02;
scene.add(moon);
const muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(muzzleLight);
const boomLight = new THREE.PointLight(0xff8a30, 0, 26, 2); scene.add(boomLight);

// ================= TEXTURES =================
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}
const groundTex = canvasTex(256, (g, s) => {
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 32 + Math.random() * 24;
    img.data[i * 4] = v * 1.08; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * .68; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = Math.random() < .5 ? `rgba(70,82,44,${rand(.15, .35)})` : `rgba(20,16,10,${rand(.15, .35)})`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, rand(4, 26), 0, 7); g.fill();
  }
}, 34);
const woodTex = canvasTex(128, (g) => {
  g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${rand(.1, .25)})`; g.fillRect(0, i * 22, 128, 2); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,220,170,${rand(.02, .06)})`; g.fillRect(Math.random() * 128, Math.random() * 128, rand(10, 40), 1); }
  g.strokeStyle = '#3a2614'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  g.beginPath(); g.moveTo(8, 8); g.lineTo(120, 120); g.stroke();
});
const plankTex = canvasTex(128, (g) => {
  g.fillStyle = '#4a3624'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(0,0,0,${rand(.2, .45)})`; g.fillRect(i * 16, 0, 2, 128); }
  for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(255,220,170,${rand(.02, .05)})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, rand(10, 40)); }
});
plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
const barnTex = canvasTex(128, (g) => {
  g.fillStyle = '#5a1f17'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(0,0,0,${rand(.25, .5)})`; g.fillRect(i * 16, 0, 2, 128); }
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(200,180,150,${rand(.03, .1)})`; g.fillRect(Math.random() * 128, Math.random() * 128, rand(1, 3), rand(4, 20)); }
});
barnTex.wrapS = barnTex.wrapT = THREE.RepeatWrapping; barnTex.repeat.set(3, 1);
const glowTex = canvasTex(64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,220,150,.8)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
// canvas is sized to the measured text, so long labels never get clipped
let textSprites = [];
function textSprite(lines, color, scale, glow) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  s.userData.text = [lines, color, scale, glow];
  drawTextSprite(s); if (textSprites) textSprites.push(s);
  return s;
}
// the display font may still be loading at startup; redraw the labels made so far once it is ready
if (document.fonts) document.fonts.load('800 64px "Big Shoulders Display"').then(() => { textSprites.forEach(drawTextSprite); textSprites = null; }).catch(() => {});
function drawTextSprite(s) {
  const [lines, color, scale, glow] = s.userData.text;
  const FS = 64, LH = 74, PAD = 28, font = `800 ${FS}px "Big Shoulders Display", Impact, sans-serif`;
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = font;
  let w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width)) + PAD * 2), h = lines.length * LH + PAD;
  if (glow) w = h = Math.max(w, h);
  c.width = w; c.height = h;
  if (glow) {
    const gr = g.createRadialGradient(w / 2, h / 2, w * .08, w / 2, h / 2, w / 2);
    gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#000'; g.shadowBlur = 8;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * LH));
  if (s.material.map) s.material.map.dispose();
  s.material.map = new THREE.CanvasTexture(c); OWN.add(s.material.map); OWN.add(s.material); s.material.needsUpdate = true;
  // keep the old on-screen letter height: `scale` used to cover a 256px canvas with 110px (1 line) or 52px (multi-line) text
  const k = scale / 256 * (lines.length > 1 ? 52 : 110) / FS;
  s.scale.set(w * k, h * k, 1);
}

// ================= WORLD =================
const obstacles = [];   // AABBs for movement
const rayBlockers = []; // meshes that stop bullets
const matCache = new Map(); // the same plain material asked twice is the same material: static meshes merge into fewer draw calls
const matStd = (o) => { const mk = () => new THREE.MeshStandardMaterial(Object.assign({ roughness: .95, metalness: 0 }, o)); if (o && Object.values(o).some(v => v && typeof v === 'object')) return mk(); const k = JSON.stringify(o || {}); let m = matCache.get(k); if (!m) matCache.set(k, m = mk()); return m; };
// tiling bump detail for every ground texture (normal map from a noise height field; it follows the map's uv repeat)
const groundNormal = (() => {
  const S = 256, h = new Float32Array(S * S);
  for (let o = 0; o < 4; o++) { // value noise octaves, wrapped so the tile repeats seamlessly
    const n = 4 << o, gr = []; for (let i = 0; i < n * n; i++) gr.push(Math.random());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x / S * n, fy = y / S * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const v = (a, b) => gr[(b % n) * n + (a % n)], sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      h[y * S + x] += (lerp(lerp(v(x0, y0), v(x0 + 1, y0), sx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), sx), sy)) / (1 << o);
    }
  }
  for (let i = 0; i < 250; i++) { const x = Math.floor(Math.random() * S), y = Math.floor(Math.random() * S), a = rand(.1, .25); for (let k = 0; k < 4; k++) h[((y + (k >> 1)) % S) * S + (x + (k & 1)) % S] += a; } // pebbles
  return canvasTex(S, g => {
    const img = g.createImageData(S, S), at = (x, y) => h[((y + S) % S) * S + (x + S) % S];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3, dy = (at(x, y + 1) - at(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
      img.data[i] = (-dx / l * .5 + .5) * 255; img.data[i + 1] = (dy / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, 34);
})();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), matStd({ map: groundTex, color: 0x9a9a88, normalMap: groundNormal, normalScale: new THREE.Vector2(1.1, 1.1) }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground); rayBlockers.push(ground);
let mapGroup = new THREE.Group(); scene.add(mapGroup); // everything a map builds lives here so loading another map is one swap

const unitBox = new THREE.BoxGeometry(1, 1, 1);
// rounded boxes, optionally tapered (people and zombies are built from these): r the edge radius, tp the far end's scale along the axis
const RBOX = new Map();
function rboxGeo(w, h, d, r = Math.min(w, h, d) * .3, seg = 3, tp = 1, ax = 'y') {
  const key = [w, h, d, r, seg, tp, ax].map(v => typeof v === 'number' ? v.toFixed(3) : v).join(); if (RBOX.has(key)) return RBOX.get(key);
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, v = new THREE.Vector3(), inn = new THREE.Vector3(); r = Math.min(r, w / 2, h / 2, d / 2);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); inn.set(THREE.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r), THREE.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r), THREE.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r));
    const n = v.clone().sub(inn); if (n.lengthSq() > 1e-12) n.setLength(r); v.copy(inn).add(n);
    if (tp !== 1) { if (ax === 'y') { const k = THREE.MathUtils.lerp(tp, 1, (v.y + h / 2) / h); v.x *= k; v.z *= k; } else { const k = THREE.MathUtils.lerp(tp, 1, (v.z + d / 2) / d); v.x *= k; v.y *= k; } }
    p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); RBOX.set(key, g); return g;
}
function addBox(x, z, w, d, h, mat, y = 0, collide = true) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d); m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  mapGroup.add(m); rayBlockers.push(m);
  if (collide) obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: y + h });
  return m;
}
const crateMat = new THREE.MeshLambertMaterial({ map: woodTex });
const fenceMat = matStd({ map: plankTex });
const barnMat = matStd({ map: barnTex });
const roofMat = matStd({ color: 0x2b2a2c, roughness: .8 });
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6b6a66 });
const barkMat = new THREE.MeshLambertMaterial({ color: 0x1e1812 });
const poleMat = matStd({ color: 0x2a2520 });
// the barn, lamps, stations, box, props and so on are built per map in maps.js
// sky: a dome that follows the camera. Horizon = the map's fog colour (maps and mods set it), darker zenith,
// moon halo, twinkling stars and slow drifting clouds that hide the stars behind them.
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe4e9ff, fog: false, map: canvasTex(128, (g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,125,140,${rand(.08, .25)})`; g.beginPath(); g.arc(Math.random() * s, rand(.2, .8) * s, rand(3, 16), 0, 7); g.fill(); }
}) }));
moonMesh.position.set(-90, 110, -80); scene.add(moonMesh);
const skyMat = new THREE.ShaderMaterial({
  uniforms: { horizon: { value: new THREE.Color() }, moonDir: { value: moonMesh.position.clone().normalize() }, moonCol: { value: new THREE.Color() }, time: { value: 0 } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 horizon, moonDir, moonCol; uniform float time; varying vec3 vDir;
    float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(vec3(i, 1.0)), hash(vec3(i + vec2(1, 0), 1.0)), f.x), mix(hash(vec3(i + vec2(0, 1), 1.0)), hash(vec3(i + vec2(1, 1), 1.0)), f.x), f.y); }
    float fbm(vec2 p) { float v = 0.0, a = .5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= .5; } return v; }
    void main() {
      vec3 d = normalize(vDir); float h = d.y;
      vec3 zenith = horizon * .28 + vec3(.004, .007, .018);
      vec3 col = mix(horizon * 1.15, zenith, smoothstep(-.02, .5, h));
      col += horizon * .5 * exp(-abs(h) * 14.0);                               // haze band on the horizon
      float md = max(dot(d, moonDir), 0.0);
      col += moonCol * (pow(md, 60.0) * .22 + pow(md, 8.0) * .05);              // moon halo
      vec2 uv = d.xz / (h + .18) * 1.6 + vec2(time * .006, time * .002);
      float c = smoothstep(.42, .82, fbm(uv)) * smoothstep(-.02, .25, h);
      vec3 st = floor(d * 260.0); float r = hash(st);
      if (r > .996 && h > 0.0) { float s = smoothstep(.45, 0.0, length(fract(d * 260.0) - .5));
        col += vec3(.8, .86, 1.0) * s * (.6 + .4 * sin(time * (2.0 + r * 3.0) + r * 900.0)) * smoothstep(0.0, .2, h) * (r > .9993 ? 2.2 : 1.2); }
      vec3 cloud = horizon * 1.6 + moonCol * .06 * (.4 + md);                    // moonlit cloud tops
      col = mix(col, cloud, c * .85);
      gl_FragColor = vec4(col, 1.0);
    }`,
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), skyMat);
skyDome.renderOrder = -1000; skyDome.frustumCulled = false;
skyDome.onBeforeRender = (r, sc, cam) => {
  skyDome.position.copy(cam.position);
  skyMat.uniforms.horizon.value.copy(scene.fog.color); skyMat.uniforms.moonCol.value.copy(moonMesh.material.color);
  skyMat.uniforms.time.value = performance.now() / 1000;
  moonHalo.material.color.copy(moonMesh.material.color).multiplyScalar(.55);
};
scene.add(skyDome);
const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8090c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .5 }));
moonHalo.scale.set(40, 40, 1); moonMesh.add(moonHalo);

// ================= COLLISION =================
function collide(p, r) {
  clampBounds(p, r);
  for (const o of obstacles) {
    const cx = clamp(p.x, o.minX, o.maxX), cz = clamp(p.z, o.minZ, o.maxZ);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    else {
      const l = p.x - o.minX, rr = o.maxX - p.x, t = p.z - o.minZ, bt = o.maxZ - p.z, m = Math.min(l, rr, t, bt);
      if (m === l) p.x = o.minX - r; else if (m === rr) p.x = o.maxX + r; else if (m === t) p.z = o.minZ - r; else p.z = o.maxZ + r;
    }
  }
}
function blockedAt(x, z, r) {
  if (!inBounds(x, z, r)) return true;
  for (const o of obstacles) if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return true;
  return false;
}

// ================= GUN MODELS =================
const sharedCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
// a small painted studio cube for the first-person / arsenal guns: metal needs something to reflect or it reads as flat black
const gunEnv = (() => {
  const face = (k) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    if (k === 2) { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 44); gr.addColorStop(0, '#9aa4b8'); gr.addColorStop(1, '#3a4250'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; }
    if (k === 3) { g.fillStyle = '#17120e'; g.fillRect(0, 0, 64, 64); return c; }
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#3a4250'); gr.addColorStop(.55, '#6a6660'); gr.addColorStop(.62, '#2a241e'); gr.addColorStop(1, '#17120e');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    if (k === 0 || k === 4) { g.fillStyle = k ? '#d8c8a8' : '#c8d4f0'; g.fillRect(k ? 8 : 34, 12, 20, 16); } // two soft "windows" for highlights
    return c; };
  const t = new THREE.CubeTexture([0, 1, 2, 3, 4, 5].map(face)); t.needsUpdate = true; return t;
})();
const gunMatCache = {};
function gunMats(color, world) {
  const k = color + world;
  if (!gunMatCache[k]) {
    const M = world ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    const o = (metalness, roughness) => world ? {} : { metalness, roughness, envMap: gunEnv, envMapIntensity: .9 };
    gunMatCache[k] = {
      metal: new M(Object.assign({ color: 0x3c4046 }, o(.7, .38))),
      steel: new M(Object.assign({ color: 0x8a9098 }, o(.85, .28))),
      dark: new M(Object.assign({ color: 0x16181b }, o(.5, .5))),
      rub: new M(Object.assign({ color: 0x23252a }, o(.05, .85))),
      wood: new M(Object.assign({ color: 0x6a4222 }, o(0, .7))),
      brass: new M(Object.assign({ color: 0xb8923a }, o(.8, .35))),
      glass: new M(Object.assign({ color: 0x1a3040, emissive: 0x0a2030 }, o(.2, .1))),
      accent: new M({ color, emissive: color, emissiveIntensity: world ? .8 : .45 }),
    };
  }
  return gunMatCache[k];
}
// rounded-edge box (profile rounded in x/y, softly bevelled ends), cached per size
const gunGeo = {};
function roundBox(w, h, d, r) {
  const key = `rb${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${r.toFixed(3)}`;
  if (gunGeo[key]) return gunGeo[key];
  r = Math.max(.001, Math.min(r, w / 2 - .0015, h / 2 - .0015));
  const bs = Math.min(r * .4, d * .15), ww = w / 2 - bs, hh = h / 2 - bs, rr = Math.max(.0005, r - bs);
  const s = new THREE.Shape();
  s.moveTo(-ww + rr, -hh); s.lineTo(ww - rr, -hh); s.quadraticCurveTo(ww, -hh, ww, -hh + rr);
  s.lineTo(ww, hh - rr); s.quadraticCurveTo(ww, hh, ww - rr, hh); s.lineTo(-ww + rr, hh);
  s.quadraticCurveTo(-ww, hh, -ww, hh - rr); s.lineTo(-ww, -hh + rr); s.quadraticCurveTo(-ww, -hh, -ww + rr, -hh);
  const depth = Math.max(.001, d - 2 * bs);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals();
  return gunGeo[key] = g;
}
const cylGeo = (r, len, seg = 18) => gunGeo[`c${r.toFixed(4)},${len.toFixed(4)},${seg}`] || (gunGeo[`c${r.toFixed(4)},${len.toFixed(4)},${seg}`] = new THREE.CylinderGeometry(r, r, len, seg));
const torusGeo = (r, t, arc) => gunGeo[`t${r},${t},${arc}`] || (gunGeo[`t${r},${t},${arc}`] = new THREE.TorusGeometry(r, t, 6, 16, arc));

// melee weapons, built upright with the grip at the origin (the viewmodel swings them); lying along -z like a gun for the world and icons
function buildMelee(w, flat) {
  const b = w.base, kind = b.model.melee, M = gunMats(rarColor(w), flat), g = new THREE.Group(), U = g.userData;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const e = new THREE.Mesh(geo, mat); e.position.set(x, y, z); e.rotation.set(rx, ry, rz); g.add(e); return e; };
  const bx = (sx, sy, sz, mat, x, y, z, rx, ry, rz) => { const e = add(unitBox, mat, x, y, z, rx, ry, rz); e.scale.set(sx, sy, sz); return e; };
  const cy = (r, h, mat, x, y, z) => add(new THREE.CylinderGeometry(r, r, h, 10), mat, x, y, z);
  const red = new (flat ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)(Object.assign({ color: w.unique === 'thunder' ? 0x2a3a5a : 0x9a1c14 }, flat ? {} : { metalness: .4, roughness: .5 }));
  if (kind === 'knife') {
    bx(.03, .13, .036, M.rub, 0, -.01, 0); bx(.07, .014, .045, M.steel, 0, .06, 0);
    bx(.008, .19, .038, M.steel, 0, .16, -.004); bx(.009, .05, .026, M.steel, 0, .27, -.01, .45); bx(.01, .1, .006, M.accent, 0, .14, .018);
  } else if (kind === 'axe' || kind === 'maul') {
    cy(.02, .82, M.wood, 0, .17, 0); bx(.046, .09, .046, M.rub, 0, -.2, 0); bx(.044, .05, .044, M.accent, 0, .02, 0);
    if (kind === 'axe') { bx(.04, .11, .09, red, 0, .52, -.03); bx(.022, .17, .08, M.steel, 0, .52, -.11); bx(.03, .05, .07, red, 0, .52, .06, 0, 0, 0); }
    else { bx(.12, .13, .3, w.unique === 'thunder' ? red : M.metal, 0, .54, 0); bx(.124, .02, .304, M.accent, 0, .54, 0); if (w.unique === 'thunder') bx(.13, .06, .06, M.accent, 0, .54, -.13); }
  } else { // chainsaw: the rear handle at the origin, the engine in front of it, a wrap handle over the top, the bar out front
    bx(.035, .035, .16, M.rub, 0, 0, .02); bx(.035, .09, .035, M.rub, 0, .04, .1); bx(.035, .035, .1, M.rub, 0, .08, .05); // the rear handle's loop
    bx(.15, .17, .32, M.accent, 0, .03, -.2); bx(.155, .06, .22, M.dark, 0, -.07, -.18); bx(.12, .05, .1, M.metal, 0, .13, -.28); // engine, sump, air filter
    for (let i = 0; i < 4; i++) bx(.158, .01, .012, M.dark, 0, .06, -.08 - i * .04); // cooling fins
    const wrap = add(new THREE.TorusGeometry(.1, .014, 6, 16, Math.PI), M.rub, 0, .1, -.2, 0, 0, 0); wrap.rotation.set(0, 0, 0); // the wrap handle arching over the engine
    bx(.03, .09, .56, M.steel, 0, .0, -.62); bx(.036, .1, .56, M.dark, 0, 0, -.62).scale.set(.012, .1, .58); cy(.045, .036, M.steel, 0, 0, -.9).rotation.set(0, 0, Math.PI / 2);
  }
  U.sightY = .1; U.muzzleZ = -.3; U.muzzleY = .1; U.port = new THREE.Object3D(); g.add(U.port);
  if (flat && b.melee.hold !== 'fwd') { const o = new THREE.Group(); o.add(g); g.rotation.x = -Math.PI / 2; Object.assign(o.userData, U); return o; }
  if (!flat) g.scale.setScalar(.62); // in the hands: the viewmodel is drawn close to the eye
  return g;
}
function buildGun(w, world, icon) {
  if (w.base.melee) return buildMelee(w, world || icon);
  const b = w.base, m = b.model, M = gunMats(rarColor(w), world), g = new THREE.Group(), U = g.userData;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, p = g) => { const e = new THREE.Mesh(geo, mat); e.position.set(x, y, z); e.rotation.set(rx, ry, rz); p.add(e); return e; };
  const rb = (w_, h, d, r, mat, x, y, z, rx, ry, rz, p) => add(roundBox(w_, h, d, r), mat, x, y, z, rx, ry, rz, p);
  const bx = (w_, h, d, mat, x, y, z, rx, ry, rz, p) => { const e = add(unitBox, mat, x, y, z, rx, ry, rz, p); e.scale.set(w_, h, d); return e; };
  const cz = (r, len, mat, x, y, z, seg, p) => add(cylGeo(r, len, seg), mat, x, y, z, Math.PI / 2, 0, 0, p); // cylinder along z
  const L = m.len, H = m.h, W = .062;
  const rifle = !!(m.stock || L > .3), pistol = !rifle && !m.drum && !b.energy;
  const bodyMat = M.metal, furn = ['shotgun', 'dbarrel', 'lever', 'crossbow', 'launcher', 'revolver'].includes(b.id) ? M.wood : M.rub;
  const by = H * .15, bz = -L / 2 - m.barrel / 2, muzzle = -L / 2 - m.barrel;
  if (m.multi) return buildMinigun(g, M, m, world, add, rb, bx, cz);

  // receiver / frame
  if (pistol) {
    rb(W * 1.02, H * .56, L * 1.02, .012, bodyMat, 0, H * .2, 0);                         // slide
    rb(W * .94, H * .5, L * .86, .01, M.rub, 0, -H * .2, L * .05);                           // frame
    for (let i = 0; i < 5; i++) bx(W * 1.05, H * .34, .004, M.dark, 0, H * .22, L * .32 + i * .012); // slide serrations
    bx(.004, H * .2, L * .22, M.dark, W / 2 + .002, H * .28, -L * .08);                       // ejection port
    bx(.01, .012, .01, M.dark, 0, H * .5, L * .44); bx(.006, .012, .006, M.dark, 0, H * .5, -L * .44); // sights
  } else {
    rb(W, H, L, .014, bodyMat, 0, 0, 0);
    bx(.004, H * .3, L * .2, M.dark, W / 2 + .002, H * .12, -L * .06);                       // ejection port
    if (rifle) bx(.03, .012, .022, M.dark, 0, H / 2 + .006, L * .42);                         // charging handle
  }
  [-1, 1].forEach(sd => bx(.003, H * .12, L * .55, M.accent, sd * (W / 2 + .002), -H * .08, 0)); // rarity stripe
  if (rifle && !m.scope && !m.bow) { // top rail
    rb(W * .6, .012, L * .78, .003, M.dark, 0, H / 2 + .006, -L * .06);
    for (let i = 0; i < 9; i++) bx(W * .66, .007, .008, M.dark, 0, H / 2 + .014, -L * .42 + i * L * .09);
  }
  // trigger group
  add(torusGeo(H * .26, .005, Math.PI), M.dark, 0, -H / 2, L * .12, 0, Math.PI / 2, Math.PI);
  bx(.008, H * .3, .01, M.steel, 0, -H / 2 - H * .12, L * .1, .35);
  // grip
  rb(W * .8, H * 1.25, H * .5, .014, furn === M.wood && pistol ? M.rub : furn, 0, -H * .88, L * .3, .32);
  for (let i = 0; i < 4; i++) bx(W * .84, .004, H * .45, M.dark, 0, -H * .6 - i * H * .16, L * .3 + i * H * .05, .32); // grip texture

  // barrel(s)
  if (m.double) {
    [-1, 1].forEach(sd => { cz(m.br, m.barrel, M.dark, sd * m.br * 1.02, by, bz, 18); cz(m.br * 1.08, .02, M.steel, sd * m.br * 1.02, by, muzzle + .01, 18); });
    bx(.006, .006, m.barrel, M.steel, 0, by + m.br * .9, bz);                                 // rib
  } else {
    cz(m.br, m.barrel, M.dark, 0, by, bz, 20);
    if (!b.energy && !m.bow && m.barrel > .1) { // muzzle device with ports
      cz(m.br * 1.35, .04, M.metal, 0, by, muzzle + .02, 20);
      [-1, 1].forEach(sd => bx(.004, m.br * 1.2, .02, M.dark, sd * m.br * 1.35, by, muzzle + .02));
    }
    bx(.006, .022, .008, M.dark, 0, by + m.br + .011, muzzle + .035);                        // front sight post
  }
  // handguard with vents on rifles
  if (rifle && !m.pump && !m.double && !m.bow && !m.multi && m.barrel > .16) {
    const hl = m.barrel * .58, hz = -L / 2 - hl / 2;
    rb(W * 1.12, H * .72, hl, .016, M.rub, 0, by - H * .05, hz);
    for (let i = 0; i < 3; i++) [-1, 1].forEach(sd => bx(.004, H * .18, hl * .16, M.dark, sd * W * .57, by - H * .05, hz - hl * .3 + i * hl * .3));
  }

  // magazine / swapped part (a group, so the reload can drop it and slide it back)
  const magGroup = (x, y, z) => { const mg = new THREE.Group(); mg.position.set(x, y, z); g.add(mg); U.mag = mg; return mg; };
  if (m.mag) {
    if (pistol) {
      const mg = magGroup(0, -H * .88, L * .3); mg.rotation.x = .32;
      rb(W * .6, H * 1.05, H * .4, .006, M.dark, 0, 0, 0, 0, 0, 0, mg);
      rb(W * .7, .012, H * .46, .004, M.steel, 0, -H * .6, 0, 0, 0, 0, mg);                   // base plate, just below the grip
      U.port = new V3(0, -H * 1.5, L * .38);
    } else {
      const mg = magGroup(0, -H / 2, -L * .12);
      rb(W * .62, m.mag * .56, H * .5, .007, M.dark, 0, -m.mag * .28, 0, 0, 0, 0, mg);
      rb(W * .62, m.mag * .5, H * .5, .007, M.dark, 0, -m.mag * .74, -m.mag * .08, -.28, 0, 0, mg); // curved lower half
      rb(W * .7, .012, H * .56, .004, M.steel, 0, -m.mag - .004, -m.mag * .16, -.28, 0, 0, mg);
      U.port = new V3(0, -H / 2 - m.mag, -L * .12);
    }
  }
  if (m.drum) { // revolver / launcher cylinder, built along its own y so reloads spin it with rotation.y
    const d = new THREE.Group(); d.position.set(0, 0, -L * .12); d.rotation.x = Math.PI / 2; g.add(d); U.drum = d;
    add(cylGeo(H * .5, L * .36, 20), M.metal, 0, 0, 0, 0, 0, 0, d);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; bx(.008, L * .3, .008, M.dark, Math.cos(a) * H * .5, 0, Math.sin(a) * H * .5, 0, 0, 0, d); }
    add(cylGeo(H * .12, L * .38, 10), M.steel, 0, 0, 0, 0, 0, 0, d);
    U.port = new V3(-H * .5, 0, -L * .12);
    if (!rifle) { bx(.012, .03, .022, M.dark, 0, H * .52, L * .44, -.5); bx(.008, .008, m.barrel * .9, M.steel, 0, by + m.br + .004, bz); } // hammer + top rib
  }
  if (m.box) {
    const mg = magGroup(0, -H * .8, -L * .08);
    rb(W * 1.6, H * .9, H * .9, .01, M.accent, 0, 0, 0, 0, 0, 0, mg);
    rb(W * 1.62, H * .12, H * .92, .004, M.dark, 0, H * .38, 0, 0, 0, 0, mg);
    for (let i = 0; i < 5; i++) add(cylGeo(.007, .035, 8), M.brass, -W * .9, H * .35 - i * .012, -H * .2 + i * .02, 0, 0, Math.PI / 2, mg); // belt rounds
    U.port = new V3(-W, -H * 1.1, -L * .08);
  }
  if (m.tank) {
    const mg = magGroup(0, -H * .95, -L * .02);
    add(cylGeo(H * .42, L * .5, 20), M.accent, 0, 0, 0, Math.PI / 2, 0, 0, mg);
    [-1, 1].forEach(sd => add(new THREE.SphereGeometry(H * .42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.accent, 0, 0, sd * L * .25, sd * Math.PI / 2, 0, 0, mg));
    add(cylGeo(.008, L * .3, 8), M.steel, W * .4, H * .45, 0, Math.PI / 2, 0, 0, mg);           // fuel line
    add(new THREE.SphereGeometry(.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5ab8ff }), 0, by - m.br * 1.2, muzzle + .01); // pilot light
    U.port = new V3(-W, -H * 1.2, 0);
  }
  if (b.energy && !m.tank) {
    const mg = magGroup(0, -H * .6, -L * .05);
    rb(W * .75, H * .45, H * .7, .008, M.accent, 0, 0, 0, 0, 0, 0, mg);
    [-1, 1].forEach(sd => bx(.003, H * .3, H * .5, M.dark, sd * W * .38, 0, 0, 0, 0, 0, mg));
    U.port = new V3(0, -H * .85, -L * .05);
    const n = m.coil ? 5 : 3;
    for (let i = 0; i < n; i++) cz(m.br * (m.coil ? 2.2 : 1.9), .014, M.accent, 0, by, -L / 2 - .025 - i * (m.coil ? .032 : .045), 20);
    if (m.coil) cz(m.br * .5, m.barrel * 1.05, new THREE.MeshBasicMaterial({ color: 0x9fe6ff }), 0, by, bz, 10);
  }

  // stock (first person keeps a short one: the rest would sit behind the camera and fill the screen)
  if (m.stock) {
    const st = world ? m.stock : m.stock * .4;
    if (furn === M.wood) rb(W * .82, H * .9, st, .016, M.wood, 0, -H * .14, L / 2 + st / 2, .06);
    else {
      cz(.012, st * .7, M.dark, 0, -H * .05, L / 2 + st * .35, 10);
      rb(W * .8, H * .95, st * .38, .014, M.rub, 0, -H * .12, L / 2 + st * .78);
      rb(W * .84, H * 1, .012, .004, M.dark, 0, -H * .12, L / 2 + st - .006);                 // butt pad
    }
  }
  if (m.sight) { // rear aperture + front post
    rb(.026, .03, .02, .004, M.dark, 0, H / 2 + .02, L * .3);
    rb(.018, .036, .014, .003, M.dark, 0, H / 2 + .018, -L * .42);
  }
  if (m.scope) {
    const sy = H / 2 + .05;
    cz(.022, L * .55, M.dark, 0, sy, -L * .05, 20);
    cz(.03, .05, M.dark, 0, sy, -L * .05 - L * .3, 20); cz(.027, .04, M.dark, 0, sy, -L * .05 + L * .29, 20);
    cz(.028, .004, M.glass, 0, sy, -L * .05 - L * .33, 20); cz(.025, .004, M.glass, 0, sy, -L * .05 + L * .31, 20);
    add(cylGeo(.009, .025, 10), M.dark, 0, sy + .03, -L * .05); add(cylGeo(.009, .02, 10), M.dark, .03, sy, -L * .05, 0, 0, Math.PI / 2); // turrets
    [-.15, .12].forEach(t => rb(.034, .05, .014, .004, M.dark, 0, H / 2 + .02, L * t));        // rings
    bx(.001, .02, .06, M.accent, .022, sy, -L * .05);
  }
  if (m.pump) {
    rb(W * 1.2, H * .55, m.barrel * .38, .018, M.wood, 0, by - m.br * 1.9, bz + m.barrel * .1);
    for (let i = 0; i < 5; i++) bx(W * 1.24, .004, .006, M.dark, 0, by - m.br * 1.9 - H * .1, bz + m.barrel * (-.05 + i * .06));
    cz(m.br * .75, m.barrel * .9, M.dark, 0, by - m.br * 1.9, bz - m.barrel * .04, 16);         // tube magazine
  }
  if (m.lever) add(torusGeo(H * .38, .006, Math.PI * 1.3), M.steel, 0, -H * .95, L * .22, 0, Math.PI / 2, Math.PI * .85);
  if (m.bow) {
    rb(.05, .03, .06, .008, M.dark, 0, by, muzzle + .02);                                    // riser
    [-1, 1].forEach(sd => rb(.24, .018, .03, .008, M.wood, sd * .13, by + .02, muzzle + .03 + .02, 0, sd * .35, 0));
    bx(.5, .003, .003, M.accent, 0, by + .02, muzzle + .14);                                  // string
    bx(.006, .006, L * .9, M.steel, 0, H / 2 + .006, -L * .1);                                // bolt rail
  }
  if (b.single || b.rl === 'break') U.port = U.port || new V3(-W * .6, -H * .2, -L * .05);
  U.port = U.port || new V3(0, -H, -L * .1);
  U.muzzleZ = muzzle;
  U.muzzleY = by;
  U.sightY = H / 2 + (m.scope ? .05 : m.sight ? .04 : pistol ? .022 : .005);
  if (U.mag) U.magY = U.mag.position.y;
  // aim line sits just above the tallest part (rails, handles, sights), so nothing on the gun covers the crosshair while aiming
  if (!world && !m.scope) { g.updateMatrixWorld(true); U.sightY = Math.max(U.sightY, new THREE.Box3().setFromObject(g).max.y + .006); }
  return g;
}
// rotary cannon: motor housing, six-barrel cluster (U.spinner turns on its z), carry handle, belt-fed side box.
// The grips sit where addHands() puts the hands for a gun of this len / h / barrel.
const boreMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
function buildMinigun(g, M, m, world, add, rb, bx, cz) {
  // the body sits well forward of the rear grip, so the bulk stays out of the camera's face
  const U = g.userData, Y = .04, B = m.barrel * 1.1, Z = -.1, front = Z - .14, muzzle = front - B;
  rb(.11, .12, .23, .02, M.metal, 0, Y, Z - .015);                                        // receiver housing
  [-1, 1].forEach(sd => { bx(.003, .012, .18, M.accent, sd * .056, Y - .02, Z - .015); bx(.003, .045, .06, M.dark, sd * .056, Y + .02, Z + .04); }); // stripe + side plate
  for (let i = 0; i < 4; i++) bx(.07, .004, .01, M.dark, 0, Y + .061, Z - .08 + i * .028); // top vents
  cz(.038, .09, M.dark, 0, Y - .005, Z + .14, 20);                                        // electric motor
  for (let i = 0; i < 3; i++) cz(.043, .007, M.metal, 0, Y - .005, Z + .112 + i * .024, 20); // cooling fins
  cz(.03, .014, M.metal, 0, Y - .005, Z + .19, 20); cz(.008, .02, M.steel, 0, Y - .005, Z + .2, 8); // end cap + bolt
  rb(.13, .14, .03, .01, M.dark, 0, Y, front + .015);                                     // bearing plate
  cz(.062, .07, M.metal, 0, Y, front - .035, 24); cz(.066, .012, M.dark, 0, Y, front - .07, 24); // barrel shroud
  const sp = new THREE.Group(); sp.position.set(0, Y, front - B / 2); g.add(sp); U.spinner = sp;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a) * .036, y = Math.sin(a) * .036;
    cz(.0115, B, M.dark, x, y, 0, 10, sp);
    cz(.0145, .03, M.steel, x, y, -B / 2 + .015, 10, sp);                                   // muzzle crown
    cz(.0065, .032, boreMat, x, y, -B / 2 + .015, 8, sp);                                   // bore
  }
  [[-B / 2 + .06, .054, M.steel], [-.02, .052, M.metal], [B / 2 - .1, .052, M.metal]].forEach(([z, r, mat]) => cz(r, .022, mat, 0, 0, z, 24, sp)); // barrel clamps
  cz(.012, B, M.steel, 0, 0, 0, 10, sp);                                                  // centre rod
  // front handle under the barrels, rear frame with the pistol grip + trigger
  bx(.03, .018, .16, M.dark, 0, Y - .07, front - .06);
  rb(.036, .1, .042, .012, M.rub, 0, Y - .125, -.345, .15);
  for (let i = 0; i < 3; i++) bx(.038, .004, .044, M.dark, 0, Y - .1 - i * .025, -.343 + i * .004, .15);
  bx(.05, .016, .16, M.dark, 0, Y - .05, .06);
  rb(.046, .13, .06, .014, M.rub, 0, -.09, .13, .3);
  add(torusGeo(.035, .005, Math.PI), M.dark, 0, Y - .065, .07, 0, Math.PI / 2, Math.PI);
  bx(.008, .03, .01, M.steel, 0, Y - .08, .065, .35);
  // carry handle
  [Z + .06, Z - .1].forEach(z => bx(.014, .036, .018, M.dark, 0, Y + .075, z));
  cz(.009, .2, M.rub, 0, Y + .096, Z - .02, 12);
  // ammo box with the belt running up into the feed (a group, so the box reload can drop it and slide it back)
  const mg = new THREE.Group(); mg.position.set(-.1, Y - .06, Z); g.add(mg); U.mag = mg;
  rb(.07, .11, .14, .01, M.dark, 0, 0, 0, 0, 0, 0, mg);
  rb(.075, .018, .145, .005, M.metal, 0, .06, 0, 0, 0, 0, mg);                             // lid
  bx(.072, .01, .142, M.accent, 0, .034, 0, 0, 0, 0, mg);                                  // rarity band
  bx(.004, .026, .05, M.steel, -.037, 0, 0, 0, 0, 0, mg);                                  // side latch
  const belt = t => [-.02 + t * .075, .074 + Math.sin(t * Math.PI) * .026 + t * .03];
  for (let i = 0; i < 8; i++) {
    const [x, y] = belt(i / 7);
    cz(.0055, .04, M.brass, x, y, 0, 8, mg); cz(.0035, .012, M.steel, x, y, -.026, 6, mg);    // rounds
    if (i < 7) { const [x2, y2] = belt((i + 1) / 7); bx(.012, .004, .044, M.dark, (x + x2) / 2, (y + y2) / 2 - .006, 0, 0, 0, Math.atan2(y2 - y, x2 - x), mg); } // links
  }
  U.port = new V3(-.1, Y - .12, Z);
  U.muzzleZ = muzzle; U.muzzleY = Y; U.magY = mg.position.y;
  U.sightY = .1;
  if (!world) { g.updateMatrixWorld(true); U.sightY = Math.max(U.sightY, new THREE.Box3().setFromObject(g).max.y + .006); }
  return g;
}

// free the GPU side of a subtree: every geometry (shared ones just upload again when next used), and the textures and
// materials that were made for this object alone (in OWN)
function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    for (const m of n.material ? [].concat(n.material) : []) { if (m.map && OWN.has(m.map)) m.map.dispose(); if (OWN.has(m)) m.dispose(); }
  });
}
// the static parts of a map, merged into one mesh per material: hundreds of draw calls become a few dozen.
// The originals stay (hidden) for bullets and sight lines; anything that moves, opens or blows up is left alone.
function mergeStatic() {
  const BU = THREE.BufferGeometryUtils; if (!BU) return;
  const roots = new Set([truck.g, ...vanGates.map(g => g.g), ...mapSpin, QST.spin, ...props.filter(p => p.type === 'boom').map(p => p.g)]);
  for (const k in AREAS) { roots.add(AREAS[k].barricade); if (AREAS[k].chest && AREAS[k].chest.lid) roots.add(AREAS[k].chest.lid.parent); }
  const skip = new Set([box.mesh, ...lamps.map(l => l.bulb)]), by = new Map(); if (box.deco) roots.add(box.deco);
  mapGroup.updateMatrixWorld(true);
  const walk = o => { for (const c of o.children) {
    if (roots.has(c)) continue;
    if (c.isMesh && !skip.has(c) && c.visible && !Array.isArray(c.material) && !c.material.transparent && c.geometry.attributes.uv && c.geometry.attributes.normal) { let l = by.get(c.material); if (!l) by.set(c.material, l = []); l.push(c); }
    if (c.children.length) walk(c);
  } };
  walk(mapGroup);
  for (const [mat, list] of by) {
    if (list.length < 3) continue;
    const geos = list.map(m => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); g.morphAttributes = {}; return g.applyMatrix4(m.matrixWorld); });
    const merged = BU.mergeBufferGeometries(geos); geos.forEach(g => g.dispose());
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, mat); mm.castShadow = list.some(m => m.castShadow); mm.receiveShadow = true;
    mapGroup.add(mm); list.forEach(m => m.visible = false);
  }
}
