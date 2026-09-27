// ================= FX =================
const particles = [];
const partGeo = new THREE.BoxGeometry(.07, .07, .07);
const partMats = {};
function burst(pos, color, n, speed = 3, life = .5) {
  if (!partMats[color]) partMats[color] = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n && particles.length < 350; i++) {
    const m = new THREE.Mesh(partGeo, partMats[color]);
    m.position.copy(pos); scene.add(m);
    particles.push({ m, v: new V3(rand(-1, 1), rand(.2, 1.4), rand(-1, 1)).multiplyScalar(speed), t: life * rand(.6, 1), life });
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
function dmgNumber(pos, val, color, big, crit) {
  let n = dmgNums.find(n => n.t <= 0);
  if (!n) {
    if (dmgNums.length > 70) return;
    const el = document.createElement('div'); el.className = 'dn'; $('dmg').appendChild(el);
    n = { el, pos: new V3(), t: 0, vx: 0 }; dmgNums.push(n);
  }
  n.el.textContent = Math.max(1, Math.round(val)) + (crit ? '!' : '');
  n.el.style.color = color; n.el.style.fontSize = big ? '28px' : '19px';
  n.pos.copy(pos).add(new V3(rand(-.3, .3), rand(0, .3), rand(-.3, .3)));
  n.vx = rand(-.7, .7); n.t = .9; n.el.hidden = false;
}
let hitmT = 0;
function hitmarker(kill) { const h = $('hitm'); h.classList.add('on'); h.classList.toggle('kill', !!kill); hitmT = kill ? .22 : .12; }
function popPoints(n) { popText('+' + n); }
function popText(t, color) {
  const e = document.createElement('div'); e.className = 'pop'; e.textContent = t; if (color) e.style.color = color;
  e.style.left = rand(0, 60) + 'px'; $('pops').appendChild(e); setTimeout(() => e.remove(), 900);
}
let bannerT = 0;
function banner(text, sub) { const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.style.opacity = 1; bannerT = 2.6; }
let flashT = 0;
