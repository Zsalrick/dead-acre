// ================= FX =================
const particles = [];
const partGeo = new THREE.BoxGeometry(.07, .07, .07);
const PART_MAX = 400, partIM = new THREE.InstancedMesh(partGeo, new THREE.MeshBasicMaterial({ fog: false }), PART_MAX), partO = new THREE.Object3D(), partC = new THREE.Color();
partIM.frustumCulled = false; partIM.count = 0; partIM.setColorAt(0, partC); scene.add(partIM);
function updateParticles(dt) { // one draw call for every speck of blood, dirt and spark
  let n = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.t -= dt;
    if (p.t <= 0 || p.pos.y < -.1) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
    p.v.y -= 9.8 * dt; p.pos.addScaledVector(p.v, dt);
  }
  for (const p of particles) { partO.position.copy(p.pos); partO.scale.setScalar(Math.max(.05, p.t / p.life)); partO.updateMatrix(); partIM.setMatrixAt(n, partO.matrix); partIM.setColorAt(n, partC.setHex(p.c)); n++; }
  partIM.count = n; partIM.instanceMatrix.needsUpdate = true; if (partIM.instanceColor) partIM.instanceColor.needsUpdate = true;
}
function clearFx() { // the job is over: no frozen sparks or tracers behind the results screen
  particles.length = 0; partIM.count = 0; decals.length = 0; decalIM.count = 0;
  tracers.forEach(t => { scene.remove(t.m); t.m.material.dispose(); }); tracers.length = 0;
}
function burst(pos, color, n, speed = 3, life = .5) {
  for (let i = 0; i < n && particles.length < PART_MAX; i++) {
    particles.push({ pos: pos.clone(), c: color, v: new V3(rand(-1, 1), rand(.2, 1.4), rand(-1, 1)).multiplyScalar(speed), t: life * rand(.6, 1), life });
  }
}
const tracers = [];
const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
tracerGeo.translate(0, .5, 0);
const UP = new V3(0, 1, 0);
function tracer(a, b, color, width = .012) {
  const d = new V3().subVectors(b, a), len = d.length();
  if (len < .1) return;
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(a); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.set(width, len, width);
  scene.add(m); tracers.push({ m, t: .07 });
}
const dmgNums = [];
function dmgNumber(pos, val, color, big, crit, key) {
  if (key) { // rapid hits on the same zombie add up in one number instead of a pile
    const m = dmgNums.find(n => n.t > .72 && n.key === key && n.color === color);
    if (m) { m.val += val; m.el.textContent = Math.max(1, Math.round(m.val)) + (crit ? '!' : ''); m.t = .9; return; }
  }
  let n = dmgNums.find(n => n.t <= 0);
  if (!n) {
    if (dmgNums.length > 70) return;
    const el = document.createElement('div'); el.className = 'dn'; $('dmg').appendChild(el);
    n = { el, pos: new V3(), t: 0, vx: 0 }; dmgNums.push(n);
  }
  n.el.textContent = Math.max(1, Math.round(val)) + (crit ? '!' : '');
  n.el.style.color = color; n.el.style.fontSize = big ? '28px' : '19px';
  n.pos.copy(pos).add(new V3(rand(-.3, .3), rand(0, .3), rand(-.3, .3)));
  n.vx = rand(-.7, .7); n.t = .9; n.el.hidden = false; n.key = key; n.val = val; n.color = color;
}
let hitmT = 0;
function hitmarker(kill) { const h = $('hitm'); h.classList.add('on'); h.classList.toggle('kill', !!kill); hitmT = kill ? .22 : .12; }
function popPoints(n) { popText('+' + n); }
function popText(t, color) {
  const e = document.createElement('div'); e.className = 'pop'; e.textContent = t; if (color) e.style.color = color;
  const box = $('pops'); e.style.left = rand(0, 30) + 'px'; e.style.bottom = Math.min(5, box.children.length) * 24 + 'px'; // stacked, not on top of each other
  box.appendChild(e); setTimeout(() => e.remove(), 1100);
}
let bannerT = 0;
function banner(text, sub) { const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.style.opacity = 1; bannerT = 2.6; }
let flashT = 0;

// ================= SPRITE PARTICLES (fire, smoke, sparks) =================
// Two point clouds, one additive (fire, sparks, flashes) and one alpha-blended (smoke, dust), each a single draw call.
// Every particle carries a 3-stop colour ramp, grows from s0 to s1, drags, rises or falls, and fades out.
// They run on their own animation frame so the game loop does not need to know about them; they freeze while paused.
const FX_MAX = 1600;
const puffTex = canvasTex(128, (g, s) => {
  const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  blob(64, 64, 60, .75);
  for (let i = 0; i < 14; i++) { const a = Math.random() * 7, d = rand(8, 30); blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rand(14, 30), rand(.2, .45)); }
});
const sparkTex = canvasTex(32, (g, s) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
});
function makeFxCloud(additive, order) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(FX_MAX * 3), col = new Float32Array(FX_MAX * 4), sa = new Float32Array(FX_MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('sa', new THREE.BufferAttribute(sa, 3).setUsage(THREE.DynamicDrawUsage)); // size, angle, texture (0 puff / 1 spark)
  const mat = new THREE.ShaderMaterial({
    uniforms: { puff: { value: puffTex }, spark: { value: sparkTex }, scale: { value: 400 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
    vertexShader: `attribute vec4 pcol; attribute vec3 sa; uniform float scale, fogDensity; varying vec4 vC; varying float vAng, vFog, vTex;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float d = max(-mv.z, .05); gl_PointSize = min(sa.x * scale / d, 900.0); vC = pcol; vAng = sa.y; vTex = sa.z; vFog = exp(-fogDensity * fogDensity * d * d); }`,
    fragmentShader: `uniform sampler2D puff, spark; uniform vec3 fogColor; varying vec4 vC; varying float vAng, vFog, vTex;
      void main() { vec2 p = gl_PointCoord - .5; float c = cos(vAng), s = sin(vAng); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + .5;
        float a = (vTex > .5 ? texture2D(spark, p).a : texture2D(puff, p).a) * vC.a; if (a < .004) discard;
        ${additive ? 'gl_FragColor = vec4(vC.rgb, a * vFog);' : 'gl_FragColor = vec4(mix(fogColor, vC.rgb, vFog), a);'} }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = order; scene.add(pts);
  return { geo, pos, col, sa, mat, list: [] };
}
const fxAdd = makeFxCloud(true, 11), fxSmoke = makeFxCloud(false, 10); // fire glows on top of its own smoke
// o: {p, v, life, s0, s1, drag, g (gravity, negative rises), c: [3 Colors], a (peak alpha), fadeIn, hold (>1 stays opaque longer), spark, spin}
function fxSpawn(cloud, o) {
  if (cloud.list.length >= FX_MAX) return;
  const c = o.c;
  cloud.list.push({ x: o.p.x, y: o.p.y, z: o.p.z, vx: o.v.x, vy: o.v.y, vz: o.v.z, t: 0, life: o.life, s0: o.s0, s1: o.s1, drag: o.drag || 0, g: o.g || 0,
    c: [c[0].r, c[0].g, c[0].b, c[1].r, c[1].g, c[1].b, c[2].r, c[2].g, c[2].b], a: o.a == null ? 1 : o.a, ang: Math.random() * 6.28, spin: o.spin == null ? rand(-2, 2) : o.spin,
    tex: o.spark ? 1 : 0, fadeIn: o.fadeIn || .06, hold: o.hold || 1 });
}
// the particle just spawned starts `age` seconds into its life
function cloudAge(age) { const L = fxAdd.list; if (L.length) L[L.length - 1].t = age; }
function fxUpdate(dt) {
  const scale = renderer.getDrawingBufferSize(_fxV2).y * .5 / Math.tan(camera.fov * Math.PI / 360);
  for (const C of [fxAdd, fxSmoke]) {
    const L = C.list; let n = 0;
    C.mat.uniforms.scale.value = scale;
    C.mat.uniforms.fogColor.value.copy(scene.fog.color); C.mat.uniforms.fogDensity.value = scene.fog.density;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.t += dt;
      if (p.t >= p.life) continue;
      const u = p.t / p.life, k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.g * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.ang += p.spin * dt;
      if (p.y < .03 && p.vy < 0) { p.y = .03; p.vy *= -.3; p.vx *= .7; p.vz *= .7; }
      const c = p.c, h = u < .35 ? u / .35 : 1 + (u - .35) / .65, j = h < 1 ? 0 : 3, f = h < 1 ? h : h - 1;
      L[n++] = p;
      const o3 = (n - 1) * 3, o4 = (n - 1) * 4;
      C.pos[o3] = p.x; C.pos[o3 + 1] = p.y; C.pos[o3 + 2] = p.z;
      const al = p.a * Math.min(1, u / p.fadeIn) * (1 - Math.pow(u, p.hold)) * (1 - u * .4);
      C.col[o4] = c[j] + (c[j + 3] - c[j]) * f; C.col[o4 + 1] = c[j + 1] + (c[j + 4] - c[j + 1]) * f; C.col[o4 + 2] = c[j + 2] + (c[j + 5] - c[j + 2]) * f; C.col[o4 + 3] = al;
      C.sa[o3] = p.s0 + (p.s1 - p.s0) * Math.sqrt(u); C.sa[o3 + 1] = p.ang; C.sa[o3 + 2] = p.tex;
    }
    L.length = n;
    C.geo.setDrawRange(0, n);
    if (n) { C.geo.attributes.position.needsUpdate = C.geo.attributes.pcol.needsUpdate = C.geo.attributes.sa.needsUpdate = true; }
  }
  for (let i = fxRings.length - 1; i >= 0; i--) {
    const r = fxRings[i]; r.t += dt; const u = r.t / r.life;
    if (u >= 1) { scene.remove(r.m); r.m.material.dispose(); fxRings.splice(i, 1); continue; }
    const e = 1 - Math.pow(1 - u, 3); r.m.scale.setScalar(.3 + e * r.size); r.m.material.opacity = r.a * (1 - u) * (1 - u);
  }
  for (const d of fxScorch) if (d.m.visible && (d.t -= dt) < 5) { d.m.material.opacity = Math.max(0, d.t / 5) * .8; if (d.t <= 0) d.m.visible = false; }
}
const _fxV2 = new THREE.Vector2();
let fxLastT = 0;
function fxLoop(t) {
  requestAnimationFrame(fxLoop);
  const dt = Math.min(.05, (t - fxLastT) / 1000 || 0); fxLastT = t;
  if (typeof state !== 'undefined' && state === 'paused' && !(typeof netLive === 'function' && netLive())) return;
  fxUpdate(dt);
}
requestAnimationFrame(fxLoop);

const FIRE = [new THREE.Color(1, .66, .28), new THREE.Color(.95, .3, .05), new THREE.Color(.4, .06, .01)];
const EMBER = [new THREE.Color(1, .7, .35), new THREE.Color(1, .38, .06), new THREE.Color(.5, .08, .01)];
const _fv = new V3(), _fp = new V3();
const jit = (s) => _fv.set(rand(-s, s), rand(-s, s), rand(-s, s));
// toasts: a short note in the corner (what you got, paid, or unlocked), stacked, gone after a few seconds
function toast(title, lines, col = '#ffd23f', ms = 3800) {
  const box = document.getElementById('toasts'); if (!box) return; const e = document.createElement('div'); e.className = 'toast'; e.style.setProperty('--tc', col);
  e.innerHTML = `<b>${title}</b>${(lines || []).filter(Boolean).map(l => `<span>${l}</span>`).join('')}`; box.appendChild(e);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 450); }, ms);
}
// one flamethrower pellet: a hot core at the nozzle, a stream of growing flame puffs that slows, rises and turns to smoke,
// embers, and a splash of fire where the stream hits something
function fxFlame(from, dir, dist, hit) {
  const reach = Math.max(1.2, Math.min(dist, 18));
  fxSpawn(fxAdd, { p: from, v: _fv.copy(dir).multiplyScalar(2), life: .07, s0: .12, s1: .2, c: [FIRE[0], FIRE[0], FIRE[1]], a: .45, fadeIn: .01 });
  for (let i = 0; i < 5; i++) {
    // pre-aged along the path, so the gaps between shots fill in and the stream reads as one continuous jet
    const sp = rand(14, 19), k = sp / reach * .75, age = rand(0, .09), v = new V3().copy(dir).multiplyScalar(sp).add(jit(1.1));
    const p = _fp.copy(from).addScaledVector(v, (1 - Math.exp(-k * age)) / k); v.multiplyScalar(Math.exp(-k * age));
    fxSpawn(fxAdd, { p, v, life: clamp(reach / sp * 1.5, .3, .75) * rand(.85, 1.15), s0: rand(.14, .2), s1: rand(1, 1.6) * Math.min(1, reach / 6 + .4), drag: k, g: -rand(1.5, 3), c: FIRE, a: rand(.15, .24), fadeIn: .02 });
    cloudAge(age);
  }
  for (let i = 0; i < 3; i++) { // short-lived hot core: the first metre or two of the jet, where the main puffs fly past too fast to overlap
    const age = rand(0, .07), v = new V3().copy(dir).multiplyScalar(rand(9, 13)).add(jit(.5));
    fxSpawn(fxAdd, { p: _fp.copy(from).addScaledVector(v, age), v, life: rand(.1, .16), s0: .1, s1: rand(.4, .6), drag: 2, g: -1, c: [FIRE[0], FIRE[0], FIRE[1]], a: .3, fadeIn: .02 });
    cloudAge(age);
  }
  if (Math.random() < .35) fxSpawn(fxAdd, { p: _fp.copy(from).addScaledVector(dir, rand(.3, 1)), v: new V3().copy(dir).multiplyScalar(rand(8, 14)).add(jit(2.5)), life: rand(.7, 1.4), s0: .05, s1: .02, drag: 1.4, g: -1.2, c: EMBER, spark: true, spin: 0 });
  if (Math.random() < .3) {
    const g = rand(.05, .1);
    fxSpawn(fxSmoke, { p: _fp.copy(from).addScaledVector(dir, reach * rand(.55, 1)).add(new V3(0, .4, 0)), v: new V3(rand(-.4, .4), rand(1, 2), rand(-.4, .4)), life: rand(1.4, 2.4), s0: .6, s1: rand(2.2, 3.2), drag: .5, g: -.3,
      c: [new THREE.Color(g * 1.5, g * 1.2, g), new THREE.Color(g, g, g), new THREE.Color(g, g, g)], a: .32, fadeIn: .3 });
  }
  if (hit && Math.random() < .7) { // the jet splashes and spreads where it lands
    const end = _fp.copy(from).addScaledVector(dir, reach * .95);
    fxSpawn(fxAdd, { p: end, v: new V3(rand(-3, 3) + dir.x * 3, rand(.5, 2), rand(-3, 3) + dir.z * 3), life: rand(.4, .8), s0: .4, s1: rand(1, 1.6), drag: 2.5, g: -2.5, c: FIRE, a: .22 });
  }
  const lp = _fp.copy(from).addScaledVector(dir, Math.min(2.2, reach * .4));
  muzzleLight.position.copy(lp); muzzleLight.color.setHex(0xff8a30); muzzleLight.intensity = Math.max(muzzleLight.intensity, rand(4, 6.5));
}

// ---------- explosions ----------
const ringTex = canvasTex(128, (g) => {
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.72, 'rgba(255,255,255,.08)'); gr.addColorStop(.9, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const scorchTex = canvasTex(128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(8,6,4,.95)'); gr.addColorStop(.5, 'rgba(12,9,6,.75)'); gr.addColorStop(1, 'rgba(12,9,6,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 22; i++) { const a = Math.random() * 7, d = rand(20, 50); g.fillStyle = `rgba(6,5,4,${rand(.2, .5)})`; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rand(3, 10), 0, 7); g.fill(); }
});
const fxRings = [], fxScorch = [];
const flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function fxRing(p, color, size, life, a) {
  const m = new THREE.Mesh(flatPlane, new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(p.x, .06, p.z); scene.add(m);
  fxRings.push({ m, t: 0, life, size, a });
}
let scorchI = 0;
function fxScorchMark(p, r) {
  if (fxScorch.length < 14) {
    const m = new THREE.Mesh(flatPlane, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.renderOrder = 1; scene.add(m); fxScorch.push({ m, t: 0 });
  }
  const d = fxScorch[scorchI++ % fxScorch.length];
  d.m.position.set(p.x, .025, p.z); d.m.rotation.y = Math.random() * 6; d.m.scale.setScalar(r); d.m.material.opacity = .8; d.m.visible = true; d.t = 25;
}
// fireball, flash, shockwave, smoke column, sparks, debris and a scorch mark; `color` tints the fire (acid, energy, ...)
function fxExplosion(p, color, radius = 5) {
  const tint = new THREE.Color(color || 0xffa030), hot = tint.clone().lerp(new THREE.Color(1, .95, .8), .15), dark = tint.clone().multiplyScalar(.3);
  const near = camera.position.distanceTo(p) < 3.5, k = near ? .4 : 1; // right on top of the player: keep the screen readable
  const S = Math.min(1.4, radius / 5);
  fxSpawn(fxAdd, { p: _fp.copy(p).setY(p.y + .4), v: _fv.set(0, 0, 0), life: .14, s0: 4 * S * k, s1: 6 * S * k, c: [hot, tint, tint], a: .6, fadeIn: .01, spin: 0 });
  for (let i = 0; i < 22 * k; i++) {
    const d = new V3(rand(-1, 1), rand(-.1, 1), rand(-1, 1)).normalize(), sp = rand(2.5, 8) * S;
    fxSpawn(fxAdd, { p: _fp.copy(p).addScaledVector(d, rand(.1, .6)), v: d.multiplyScalar(sp), life: rand(.6, 1.1), s0: rand(.8, 1.4) * S, s1: rand(2.4, 3.8) * S, drag: 3.2, g: -2.5,
      c: [hot, tint, dark], a: rand(.28, .4), fadeIn: .03, hold: 2.5 });
  }
  for (let i = 0; i < 18 * k; i++) {
    const d = new V3(rand(-1, 1), rand(.1, 1), rand(-1, 1)).normalize(), g = rand(.09, .16);
    fxSpawn(fxSmoke, { p: _fp.copy(p).addScaledVector(d, rand(.2, .8)), v: d.multiplyScalar(rand(1.5, 4.5) * S), life: rand(2, 3.6), s0: 1.2 * S, s1: rand(4, 6) * S, drag: 1.6, g: -1.1,
      c: [tint.clone().multiplyScalar(.35), new THREE.Color(g, g * .95, g * .9), new THREE.Color(g * .8, g * .8, g * .8)], a: rand(.6, .8), fadeIn: .2, hold: 1.5 }); // fire-lit, then grey
  }
  if (p.y < 1.6) for (let i = 0; i < 16; i++) { // dust skirt rolling out along the ground
    const a = i / 16 * Math.PI * 2, g = rand(.12, .18);
    fxSpawn(fxSmoke, { p: _fp.set(p.x + Math.cos(a) * .6, .3, p.z + Math.sin(a) * .6), v: _fv.set(Math.cos(a) * 7 * S, .4, Math.sin(a) * 7 * S), life: rand(1, 1.6), s0: .8, s1: 2.6 * S, drag: 3, g: -.2,
      c: [new THREE.Color(g * 1.2, g, g * .8), new THREE.Color(g, g * .9, g * .75), new THREE.Color(g * .8, g * .8, g * .8)], a: .4, fadeIn: .1 });
  }
  for (let i = 0; i < 40 * k; i++) {
    const d = new V3(rand(-1, 1), rand(0, 1.2), rand(-1, 1)).normalize();
    fxSpawn(fxAdd, { p, v: d.multiplyScalar(rand(6, 17)), life: rand(.5, 1.3), s0: rand(.07, .12), s1: .03, drag: .9, g: 9.8, c: [hot, EMBER[1], EMBER[2]], spark: true, spin: 0 });
  }
  burst(p, 0x17130f, 10 * k, 6, 1.3); // chunks of debris
  if (p.y < 1.6) { fxRing(p, tint, radius * 2, .45, .6); fxRing(p, hot, radius, .25, .5); fxScorchMark(p, Math.min(5, radius * .75)); }
}

// a ground ring that grows over `t` seconds, then the attack lands (fn): you can see it coming and step out
function telegraph(pos, r, color, t, fn, kind) {
  if (NET.mode === 'host' && NET.tel) pushRoll(NET.tel, [++NET.seq, Math.round(pos.x * 10), Math.round(pos.z * 10), Math.round(r * 10), Math.round(t * 100), color, kind || ''], 6); // members see it too
  const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, .05, pos.z); scene.add(m);
  const t0 = performance.now();
  const step = () => {
    const u = (performance.now() - t0) / 1000 / t;
    if (u >= 1 || !mission) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); if (u >= 1 && mission) fn(); return; }
    m.scale.setScalar(.15 + u * r); m.material.opacity = .4 + .5 * Math.abs(Math.sin(u * 18)); requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const DECAL_N = 80, decalIM = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), new THREE.MeshBasicMaterial({ color: 0x220202, transparent: true, opacity: .72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), DECAL_N);
const decals = [], decalO = new THREE.Object3D(); let decalI = 0;
decalIM.count = 0; decalIM.frustumCulled = false; decalIM.renderOrder = 1; scene.add(decalIM);
function bloodPool(x, z, s = 1) { // where a zombie fell: a dark pool that stays for a while
  decals[decalI] = { x, z, s: s * rand(.6, 1.3), r: rand(0, 6.28), t: 30 }; decalI = (decalI + 1) % DECAL_N;
}
function updateDecals(dt) {
  let n = 0;
  for (const d of decals) {
    if (!d || d.t <= 0) continue; d.t -= dt;
    const k = d.s * Math.min(1, (30 - d.t) * 4) * Math.min(1, d.t / 3); // grows in, shrinks away
    decalO.position.set(d.x, .02, d.z); decalO.rotation.set(-Math.PI / 2, 0, d.r); decalO.scale.set(k, k * .8, 1); decalO.updateMatrix(); decalIM.setMatrixAt(n++, decalO.matrix);
  }
  decalIM.count = n; decalIM.instanceMatrix.needsUpdate = true;
}
