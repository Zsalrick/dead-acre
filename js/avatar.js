// ================= THE CHARACTER: how you look (the hub's Karakter tab), what teammates see, what shows on your own hands =================
// A look is a few indices; the worn armor adds its own pieces (helmet, vest, knee pads, boots, gloves, a trinket) in its brand's colour.
const LOOK = {
  sk: { name: 'Bőrszín', opts: ['#f1d3bd', '#e2b797', '#c99670', '#a8744f', '#7d5236', '#553523'] },
  hs: { name: 'Frizura', opts: ['Kopasz', 'Rövid', 'Tüskés', 'Hosszú', 'Copf', 'Irokéz'] },
  hc: { name: 'Hajszín', opts: ['#17120e', '#3a2616', '#6a4424', '#a8763a', '#d8b46a', '#8c8c8c', '#e0e0e0', '#8e2a1a'] },
  bd: { name: 'Szakáll', opts: ['Nincs', 'Borosta', 'Bajusz', 'Kecskeszakáll', 'Teli szakáll'] },
  sh: { name: 'Felső', opts: ['kaszt', '#3a4a2e', '#2e3a4a', '#4a2e2e', '#5a4a36', '#2a2a2c', '#6a6a60', '#7a5a2a'] },
  pa: { name: 'Nadrág', opts: ['#3a3f36', '#2c3440', '#4a3f30', '#26262a', '#5a5040', '#3a2a24'] },
};
const LOOK_KEYS = Object.keys(LOOK), LOOK_DEF = { sk: 2, hs: 1, hc: 1, bd: 1, sh: 0, pa: 0, gear: 1 };
const myLook = () => Object.assign({}, LOOK_DEF, profile && profile.look);
const lookPack = L => [...LOOK_KEYS.map(k => L[k] | 0), L.gear ? 1 : 0];
const lookUnpack = a => Array.isArray(a) ? Object.fromEntries([...LOOK_KEYS.map((k, i) => [k, clamp(a[i] | 0, 0, LOOK[k].opts.length - 1)]), ['gear', a[LOOK_KEYS.length] !== 0]]) : Object.assign({}, LOOK_DEF);
const gearTone = c => '#' + new THREE.Color(c).lerp(new THREE.Color(0x3a3a32), .5).getHexString(); // brand colours are for the UI: on cloth and plates, muted
// what the worn armor looks like on you: [slot, kind, colour, exotic]
function gearVis(P = profile) {
  if (!P || !P.gear) return [];
  return GEAR_KEYS.filter(k => P.gear[k]).map(k => { const it = P.gear[k], n = it.name || '';
    const kind = k === 'head' ? (/sapka/i.test(n) ? 'cap' : /álarc/i.test(n) ? 'mask' : /bányász/i.test(n) ? 'miner' : 'helmet') : k === 'acc' ? (/óra/i.test(n) ? 'watch' : /cédula/i.test(n) ? 'tags' : /rózsa/i.test(n) ? 'beads' : 'neck') : k;
    return [k, kind, gearTone(it.exo ? '#c8402a' : (BRANDS[it.brand] ? BRANDS[it.brand].color : '#8a8a80')), it.exo ? 1 : 0]; });
}
const rigMats = new Map(), rigMat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!rigMats.has(k)) rigMats.set(k, new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o))); return rigMats.get(k); };
const darker = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
// the rig: the same joints the avatar code animates (hips, legs, torso, head, arms, a gun mount)
function buildRig(look, gv = [], clsCol = '#9aa0a6') {
  const L = Object.assign({}, LOOK_DEF, look), G = Object.fromEntries((L.gear ? gv : []).map(e => [e[0], e]));
  const skin = rigMat(LOOK.sk.opts[L.sk]), hair = rigMat(LOOK.hc.opts[L.hc], { roughness: 1 }), shirtC = L.sh ? LOOK.sh.opts[L.sh] : darker(clsCol, .75);
  const shirt = rigMat(shirtC), sleeve = rigMat(darker(shirtC, .85)), pants = rigMat(LOOK.pa.opts[L.pa]), dark = rigMat('#1c1d1c'), strap = rigMat('#2a2620');
  const boot = G.boots ? rigMat(darker(G.boots[2], .45)) : rigMat('#1a1612'), glove = G.gloves ? rigMat(darker(G.gloves[2], .5)) : skin;
  const g = new THREE.Group();
  const box = (p, m, sx, sy, sz, x, y, z, tp = 1, ax = 'y') => { const b = new THREE.Mesh(rboxGeo(sx, sy, sz, undefined, 3, tp, ax), m); b.position.set(x, y, z); b.castShadow = true; p.add(b); return b; }; // rounded pieces
  const ball = (p, m, r, x, y, z, sx = 1, sy = 1, sz = 1, part) => { const b = new THREE.Mesh(part || new THREE.SphereGeometry(r, 14, 10), m); b.position.set(x, y, z); b.scale.set(sx, sy, sz); b.castShadow = true; p.add(b); return b; };
  // legs
  const hips = new THREE.Group(); hips.position.y = .92; g.add(hips);
  const leg = x => { const Lg = new THREE.Group(); Lg.position.set(x, 0, 0); hips.add(Lg);
    box(Lg, pants, .21, .48, .23, 0, -.24, 0, .82); box(Lg, pants, .18, .42, .2, 0, -.66, 0, .78); box(Lg, strap, .06, .14, .12, x > 0 ? .11 : -.11, -.3, 0); // cargo pocket
    box(Lg, boot, .21, G.boots ? .2 : .13, .3, 0, G.boots ? -.83 : -.87, -.04); if (G.boots) box(Lg, rigMat(G.boots[2]), .22, .04, .22, 0, -.72, 0);
    if (G.legs) { const c = rigMat(G.legs[2], { roughness: .6 }); box(Lg, c, .16, .16, .06, 0, -.46, -.12); box(Lg, dark, .21, .04, .23, 0, -.4, 0); box(Lg, dark, .21, .04, .23, 0, -.52, 0); } // knee pads
    return Lg; };
  const legL = leg(-.12), legR = leg(.12);
  box(hips, pants, .42, .16, .25, 0, .02, 0); box(hips, strap, .44, .06, .27, 0, .1, 0); box(hips, rigMat('#b89a4a', { metalness: .6, roughness: .4 }), .07, .05, .02, 0, .1, -.14); // belt and buckle
  // torso
  const torso = new THREE.Group(); torso.position.y = .95; g.add(torso);
  box(torso, shirt, .4, .28, .23, 0, .13, 0, .92); box(torso, shirt, .5, .36, .27, 0, .4, 0, .84); // waist, chest
  if (G.chest) { const c = rigMat(G.chest[2], { roughness: .55 }), dc = rigMat(darker(G.chest[2], .55));
    box(torso, c, .5, .36, .3, 0, .36, 0); box(torso, dc, .1, .12, .08, -.15, .24, -.18); box(torso, dc, .1, .12, .08, 0, .24, -.18); box(torso, dc, .1, .12, .08, .15, .24, -.18);
    box(torso, dc, .08, .2, .3, -.18, .56, 0); box(torso, dc, .08, .2, .3, .18, .56, 0); if (G.chest[3]) box(torso, rigMat('#ff6a3a', { emissive: 0x6a1a08 }), .3, .03, .01, 0, .46, -.16); }
  else box(torso, sleeve, .3, .08, .26, 0, .6, .02); // collar
  box(torso, skin, .12, .1, .12, 0, .63, 0); // neck
  if (G.acc) { const ac = rigMat(G.acc[2], { metalness: .5, roughness: .4 }), k = G.acc[1];
    if (k === 'tags') { box(torso, ac, .05, .07, .01, -.02, .44, -.15); box(torso, ac, .05, .07, .01, .03, .42, -.155); }
    else if (k === 'beads') box(torso, ac, .03, .12, .01, 0, .42, -.15);
    else if (k === 'neck') { box(torso, ac, .06, .06, .01, 0, .45, -.15); } }
  // head
  const head = new THREE.Group(); head.position.set(0, .72, 0); torso.add(head);
  box(head, skin, .26, .29, .25, 0, .1, 0, .74); box(head, skin, .21, .035, .05, 0, .145, -.11); // the skull narrowing to the jaw, a brow ridge
  ball(head, skin, .03, -.135, .09, 0); ball(head, skin, .03, .135, .09, 0); // ears
  const eye = x => { box(head, rigMat('#e8e4d8'), .05, .028, .01, x, .12, -.13); box(head, dark, .022, .026, .012, x, .12, -.134); box(head, hair, .06, .014, .012, x, .155, -.13); };
  eye(-.05); eye(.05); box(head, skin, .03, .05, .035, 0, .08, -.145); box(head, rigMat('#5a2a24'), .06, .012, .01, 0, .035, -.135); // eyes, brows, nose, mouth
  const helmetOn = G.head && G.head[1] !== 'cap';
  if (!helmetOn) { // hair
    const hs = G.head && L.hs >= 2 ? 1 : L.hs, cap = (sc = 1) => { box(head, hair, .285 * sc, .09, .275 * sc, 0, .222, .006); box(head, hair, .28 * sc, .17, .07, 0, .14, .1); box(head, hair, .05, .13, .2, -.132, .16, .03); box(head, hair, .05, .13, .2, .132, .16, .03); }; // top, back and sides, over the skull
    if (hs === 1) cap(); if (hs === 2) { cap(); for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(.035, .1, 5), hair); s.position.set(Math.sin(i) * .08, .29, Math.cos(i * 1.7) * .08); s.rotation.set(Math.cos(i) * .4, 0, Math.sin(i) * .4); head.add(s); } }
    if (hs === 3) { cap(1.04); box(head, hair, .29, .3, .08, 0, .05, .115); box(head, hair, .05, .26, .18, -.14, .06, .05); box(head, hair, .05, .26, .18, .14, .06, .05); } if (hs === 4) { cap(); ball(head, hair, .05, 0, .12, .16); box(head, hair, .05, .16, .05, 0, .02, .18); }
    if (hs === 5) box(head, hair, .06, .09, .26, 0, .28, .01); }
  // beard
  const bc = rigMat(LOOK.hc.opts[L.hc], { roughness: 1, transparent: L.bd === 1, opacity: .55 });
  if (L.bd === 1) box(head, bc, .2, .08, .04, 0, .03, -.11); if (L.bd === 2) box(head, bc, .1, .025, .02, 0, .055, -.14);
  if (L.bd === 3) { box(head, bc, .06, .07, .03, 0, 0, -.13); box(head, bc, .1, .02, .02, 0, .055, -.14); } if (L.bd === 4) { box(head, bc, .24, .12, .08, 0, .01, -.08); box(head, bc, .1, .025, .02, 0, .055, -.14); }
  // head gear
  if (G.head) { const c = rigMat(G.head[2], { roughness: .5 }), k = G.head[1];
    if (k === 'cap') { box(head, c, .3, .12, .29, 0, .23, .005); box(head, c, .24, .02, .12, 0, .19, -.17); } // a cap and its peak
    else { ball(head, c, .17, 0, .13, 0, 1, .95, 1.05, new THREE.SphereGeometry(.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.85)); box(head, dark, .3, .02, .3, 0, .13, 0);
      if (k === 'miner') { box(head, dark, .07, .05, .04, 0, .22, -.16); box(head, rigMat('#fff2a0', { emissive: 0xffe060 }), .04, .03, .01, 0, .22, -.182); }
      if (k === 'mask') { box(head, dark, .2, .1, .06, 0, .06, -.13); const f = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .07, 10), rigMat(G.head[2])); f.rotation.x = Math.PI / 2; f.position.set(0, .03, -.19); head.add(f); box(head, rigMat('#9ad0e0', { roughness: .1, metalness: .4 }), .17, .045, .02, 0, .125, -.145); }
      else if (k === 'helmet') box(head, rigMat('#1a2226', { roughness: .1, metalness: .5 }), .2, .04, .03, 0, .135, -.155); } }
  // arms, hands (or gloves)
  const arm = (x, left) => { const A = new THREE.Group(); A.position.set(x, .5, 0); torso.add(A);
    ball(A, sleeve, .085, 0, 0, 0); box(A, sleeve, .14, .14, .3, 0, 0, -.12, .82, 'z'); box(A, L.sh ? skin : sleeve, .115, .115, .26, 0, -.02, -.38, .8, 'z'); box(A, glove, .12, .11, .12, 0, -.03, -.56); box(A, glove, .04, .05, .06, x > 0 ? -.07 : .07, -.01, -.54); // shoulder, upper arm, forearm, hand and thumb
    if (G.gloves) box(A, rigMat(G.gloves[2]), .125, .03, .05, 0, .02, -.49);
    if (left && G.acc && G.acc[1] === 'watch') box(A, rigMat(G.acc[2], { metalness: .6, roughness: .3 }), .12, .05, .05, 0, -.02, -.47);
    return A; };
  const armR = arm(.29), armL = arm(-.29, true);
  armR.rotation.y = .25; armL.rotation.y = -.45;
  const gunG = new THREE.Group(); gunG.position.set(.12, .46, -.5); torso.add(gunG);
  return { g, hips, legL, legR, torso, head, armL, armR, gunG };
}
// your own hands in first person: skin tone, and the gloves you wear
function applyLookFP() {
  const L = myLook(), gl = profile && profile.gear && profile.gear.gloves;
  skinMat.color.set(LOOK.sk.opts[L.sk]); gloveMat.color.set(gl && L.gear ? darker(gearTone(gl.exo ? '#c8402a' : BRANDS[gl.brand] ? BRANDS[gl.brand].color : '#24211e'), .5) : LOOK.sk.opts[L.sk]); // bare hands unless you wear gloves
  const cls = CLASSES[profile && profile.cls], shirtC = L.sh ? LOOK.sh.opts[L.sh] : darker(cls ? cls.color : '#9aa0a6', .75); sleeveMat.color.set(darker(shirtC, .85)); // the sleeve is your shirt
}
// ---------- the hub's Karakter tab: options on the left, the model turning on the right ----------
let lookView = null;
function lookTab() {
  const L = myLook(), sw = (k, v, i) => `<button class="lsw${L[k] === i ? ' on' : ''}" data-act="look:${k}:${i}" data-tip="${LOOK[k].name}"${String(v).startsWith('#') ? ` style="--sw:${v}"` : ''}>${String(v).startsWith('#') ? '' : v === 'kaszt' ? 'Kaszt színe' : v}</button>`;
  const rows = LOOK_KEYS.map(k => `<div class="lrow"><h4>${LOOK[k].name}</h4><div class="lopts${String(LOOK[k].opts[1]).startsWith('#') ? ' col' : ''}">${LOOK[k].opts.map((v, i) => sw(k, v, i)).join('')}</div></div>`).join('');
  return `<div class="looktab"><div class="lleft"><h3>Karakter</h3>${rows}
    <div class="lrow"><h4>Viselt páncél</h4><div class="lopts">${hbtn(L.gear ? 'Látszik a karakteren' : 'Rejtve', 'look:gear:' + (L.gear ? 0 : 1))}</div></div></div>
    <div class="lview"><div id="lookCv"></div></div></div>`;
}
function lookPreview() {
  const box = document.getElementById('lookCv'); if (!box) return;
  if (!lookView) { const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.outputEncoding = renderer.outputEncoding;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, .1, 20); cam.position.set(0, 1.25, -4.2); cam.lookAt(0, .95, 0);
    sc.add(new THREE.HemisphereLight(0xc8d4ff, 0x2a2018, .75)); const d = new THREE.DirectionalLight(0xffe2c0, 1.1); d.position.set(-2, 3, -3); sc.add(d); const rim = new THREE.DirectionalLight(0x8ab0ff, .6); rim.position.set(2, 2, 3); sc.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(.9, 32), new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 1 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
    lookView = { r, sc, cam, rig: null, key: '', rot: .35, drag: null };
    r.domElement.addEventListener('pointerdown', e => { lookView.drag = e.clientX; r.domElement.setPointerCapture(e.pointerId); });
    r.domElement.addEventListener('pointermove', e => { if (lookView.drag != null) { lookView.rot += (e.clientX - lookView.drag) * .012; lookView.drag = e.clientX; } });
    r.domElement.addEventListener('pointerup', () => { lookView.drag = null; });
    const loop = () => { const V = lookView, host = document.getElementById('lookCv'); if (!host || (state !== 'hub' && state !== 'paused')) { V.running = false; return; } requestAnimationFrame(loop);
      if (V.r.domElement.parentNode !== host) host.appendChild(V.r.domElement);
      const w = host.clientWidth, h = host.clientHeight; if (w && h && (V.w !== w || V.h !== h)) { V.w = w; V.h = h; V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); }
      const key = JSON.stringify([myLook(), gearVis(), profile.cls]); if (key !== V.key) { V.key = key; if (V.rig) V.sc.remove(V.rig.g); V.rig = buildRig(myLook(), gearVis(), CLASSES[profile.cls] ? CLASSES[profile.cls].color : '#9aa0a6'); V.sc.add(V.rig.g); }
      if (V.drag == null) V.rot += .004; V.rig.g.rotation.y = V.rot; const t = performance.now() / 1000; V.rig.torso.rotation.x = Math.sin(t * 1.6) * .015; V.rig.head.rotation.y = Math.sin(t * .7) * .2;
      V.rig.armR.rotation.set(-1.42 + Math.sin(t * 1.6) * .03, 0, -.08); V.rig.armL.rotation.set(-1.42 + Math.sin(t * 1.6 + 1) * .03, 0, .08); V.r.render(V.sc, V.cam); }; // the preview: arms hanging loose
    lookView.loop = loop; }
  if (!lookView.running) { lookView.running = true; lookView.loop(); }
}
HUB.look = lookTab;
