﻿// ================= CO-OP MULTIPLAYER =================
// Everyone with the page open is in the platform's `room`; a party is a named room inside it.
// The party leader (host) runs the world: zombies, spawns, the clock, the van. Every player publishes their own
// avatar in presence (`p`); the host also publishes a compact world snapshot (`g`). Members shoot proxies of the host's
// zombies and send their hits; the host applies them and names the killer, who then adds the points and rolls their
// own loot (instanced loot, Division style). All traffic is presence: anyone may set it, it is re-asserted on
// reconnect, and rolling lists with sequence numbers turn it into an event stream.
// Without the room (a local file, a signed-out viewer) the game is exactly the single-player game.
const NET = {
  room: null, pr: null, code: null, host: false, me: null,
  mode: null, client: false,              // in a job: 'host' | 'client'
  seq: 0, hits: [], acts: [], kills: [], dmgs: [], last: {},
  avatars: new Map(), zById: new Map(), lastHit: new Map(), rv: [], job: null, seenJs: 0, hadHost: false,
  selfPos: null, selfVel: null, targets: null, keyParty: '', keyLobby: '', dirty: true,
};
const KIND_IDS = Object.keys(KINDS);
let zTarget = null, zidSeq = 0;
const netLive = () => !!NET.mode && !!mission && (state === 'paused' || state === 'station');
const pushRoll = (list, item, n) => { list.push(item); if (list.length > n) list.shift(); };

// ---------- connection & party ----------
(async () => {
  let room = null; // on claude.ai: the platform's room; anywhere else: direct P2P with a party code (p2p.js)
  if (window.claude && window.claude.use) try { room = await window.claude.use('room'); } catch (e) {}
  if (!room && P2P.available()) room = P2P.lobby();
  if (!room) return;
  NET.room = room; NET.p2p = !!room.p2p;
  room.onPeers(() => { if (state === 'hub' && hubTab === 'jobs' && !NET.code) { const k = JSON.stringify(openParties()); if (k !== NET.keyLobby) { NET.keyLobby = k; renderHub(); } } }, () => {});
  if (state === 'hub') renderHub();
})();
const myName = () => (profile && profile.name) || 'Zsoldos';
function openParties() {
  if (!NET.room) return [];
  return NET.room.peers().filter(p => !p.sameTab && p.presence && p.presence.lob && p.presence.lob.open && typeof p.presence.lob.pc === 'string')
    .map(p => ({ pc: p.presence.lob.pc.replace(/[^a-z0-9]/g, '').slice(0, 8), n: p.presence.lob.n, lv: +p.presence.lob.lv || 1, m: +p.presence.lob.m || 1 }));
}
function setLobby() {
  if (!NET.room) return;
  NET.room.presence({ lob: NET.code && NET.host ? { pc: NET.code, n: myName().slice(0, 24), lv: profile ? profile.level : 1, m: partyMembers().length || 1, open: !mission } : null }).catch(() => {});
}
async function partyJoin(code, host) {
  if (!NET.room || NET.pr) return;
  if (NET.joining) return; NET.joining = true; if (state === 'hub') renderHub();
  let pr = null; try { pr = await NET.room.join('p-' + code, { host }); } catch (e) { pr = null; }
  NET.joining = false;
  if (!pr) { NET.joinErr = NET.p2p && !host ? `Nincs ilyen kódú csapat, vagy nem elérhető (${code.toUpperCase()}).` : 'Nem sikerült csatlakozni.'; if (state === 'hub') renderHub(); return; }
  NET.joinErr = '';
  Object.assign(NET, { pr, code, host, hadHost: false, seenJs: 0, last: {}, dirty: true, showCode: false, copied: false, leaveArmed: false });
  pr.onPeers(() => onPartyChange(), () => (mission && NET.mode && !mission.job.test && !mission.leaving && NET.p2p ? p2pMigrate() : partyLeave()));
  publishMember(); setLobby();
  if (state === 'hub') renderHub();
}
function fallbackCopy(t) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
async function p2pMigrate() { // P2P: the hub (the leader) is gone. The member with the lowest id opens the next hub; the rest dial in.
  if (NET.migrating) return; NET.migrating = true;
  const old = NET.pr, gen = (NET.gen || 0) + 1, base = NET.code.split('-')[0], code = `${base}-${gen}`; // PeerJS ids allow letters, digits and '-'
  NET.grace = performance.now() + 20000; // everyone is reconnecting: nobody's backpack drops meanwhile
  const was = (NET.lastPeers || []).filter(p => !p.h && p.st === 'job').map(p => (p.me ? NET.me : p.peer)).sort(), leadMe = was[0] === NET.me || !was.length;
  try { old.leave(); } catch (e) {}
  banner('A CSAPATVEZETŐ KIESETT', leadMe ? 'Te veszed át a vezetést…' : 'Újracsatlakozás az új vezetőhöz…');
  let pr = null;
  for (let k = 0; k < (leadMe ? 1 : 12) && !pr; k++) { try { pr = await NET.room.join('p-' + code, { host: leadMe }); } catch (e) { await new Promise(r => setTimeout(r, 1500)); } }
  NET.migrating = false;
  if (!pr) { banner('A CSAPAT SZÉTESETT', 'Nem sikerült újracsatlakozni.'); if (mission) finishJob(false, true); return partyLeave(); }
  Object.assign(NET, { pr, code, gen, host: leadMe, last: {}, dirty: true, bkKey: '' });
  pr.onPeers(() => onPartyChange(), () => (mission && NET.mode && !mission.job.test && NET.p2p ? p2pMigrate() : partyLeave()));
  if (leadMe) promoteToHost(); else { NET.hadHost = false; toast('ÚJRA A CSAPATBAN', ['Az új vezető viszi tovább a munkát.'], '#9dff6a'); }
  publishMember(); setLobby();
}
async function partyLeave() {
  const pr = NET.pr;
  Object.assign(NET, { pr: null, code: null, host: false, job: null, hadHost: false });
  NET.avatars.forEach(a => scene.remove(a.g)); NET.avatars.clear();
  if (pr) try { await pr.leave(); } catch (e) {}
  setLobby();
  if (state === 'hub') renderHub();
}
function partyMembers() {
  if (!NET.pr) return [];
  return NET.pr.peers().filter(p => p.presence && p.presence.m).map(p => ({ peer: p.peer, me: p.sameTab, n: p.presence.m.n, lv: +p.presence.m.lv || 1, c: p.presence.m.c, h: !!p.presence.m.h, st: p.presence.m.st, rdy: !!p.presence.m.rdy, sel: p.presence.m.sel, bd: Array.isArray(p.presence.m.bd) ? p.presence.m.bd : null, dr: Array.isArray(p.presence.m.dr) ? p.presence.m.dr.filter(k => DIRECTIVES[k]) : null }));
}
function onPartyChange() {
  const k = JSON.stringify(partyMembers().map(m => [m.n, m.lv, m.c, m.h, m.st, m.rdy, m.sel && m.sel.t, m.sel && m.sel.tr, m.dr && m.dr.join(), m.bd && m.bd.map(j => j.title).join()]));
  if (k === NET.keyParty) return; NET.keyParty = k;
  if (NET.host) setLobby();
  if (state === 'hub') renderHub();
}
function publishMember() {
  if (!NET.pr) return;
  NET.uid = NET.uid || Math.random().toString(36).slice(2, 10);
  NET.pr.presence({ m: { u: NET.uid, n: myName().slice(0, 24), lv: profile ? profile.level : 1, c: profile && profile.cls, h: NET.host ? 1 : 0, st: mission ? 'job' : 'base', rdy: NET.ready ? 1 : 0, ch: NET.chat, bd: NET.host && profile ? profile.jobs : null, dr: NET.host && profile ? profile.dirs || [] : null, sel: NET.host && typeof jobSel !== 'undefined' && profile && profile.jobs[jobSel] ? (j => ({ t: j.title, m: j.map, d: j.diff, tr: j.tier || 0, r: j.reward }))(profile.jobs[jobSel]) : null }, job: NET.host ? NET.job : null }).catch(() => {});
}
function partyPanel() {
  if (!NET.room) return `<div class="party off"><b>Többjátékos</b><span>A csapatjáték a claude.ai-on, bejelentkezve működik: oszd meg a játékot a barátaiddal, és ők is megnyithatják.</span></div>`;
  if (NET.joining) return `<div class="party"><b>Csatlakozás…</b></div>`;
  if (NET.p2p && !NET.code) return `<div class="pcards"><div class="pcard red"><small>Vezetőként</small><h3>Csapat létrehozása</h3><p>Kapsz egy 5 betűs kódot. Küldd el a barátaidnak, legfeljebb 4-en lehettek.</p>${hbtn('Létrehozás', 'pcreate')}</div>
    <div class="pcard blu"><small>Tagként</small><h3>Csatlakozás kóddal</h3><input id="pcode" maxlength="5" placeholder="KÓD" autocomplete="off" spellcheck="false">${hbtn('Csatlakozás', 'pjoinc')}${NET.joinErr ? `<p class="perr">${esc(NET.joinErr)}</p>` : ''}</div></div>`;
  if (!NET.code) {
    const open = openParties();
    return `<div class="party"><div class="phead"><b>Csapat</b>${hbtn('Csapat létrehozása', 'pcreate')}</div>
      ${open.length ? `<div class="plist">${open.map(o => `<div class="prow"><span><b>${esc(o.n)}</b> csapata · ${o.m} fő · ${o.lv}. szint</span>${hbtn('Csatlakozás', `pjoin:${o.pc}`)}</div>`).join('')}</div>`
        : '<span class="note">Most nincs nyitott csapat. Hozz létre egyet, és a barátaid csatlakozhatnak.</span>'}</div>`;
  }
  const mem = partyMembers();
  // the code is hidden until you ask (streams, screenshots); copying works without revealing it
  const codeBox = NET.p2p ? `<div class="pcode"><span class="pcodebig">KÓD: ${NET.showCode ? NET.code.toUpperCase() : '•••••'}</span>
      <div class="pcodebtns">${hbtn(NET.showCode ? 'Elrejt' : 'Megmutat', 'preveal')}${hbtn(NET.copied ? 'Másolva ✓' : 'Kód másolása', 'pcopy')}</div></div>` : '';
  return `<div class="party in"><div class="pbar">${NET.p2p ? `<div><small>Csapatkód</small><b class="pcodebig">${NET.showCode ? NET.code.split('-')[0].toUpperCase() : '•••••'}</b></div>${hbtn(NET.showCode ? 'Elrejt' : 'Megmutat', 'preveal')}${hbtn(NET.copied ? 'Másolva ✓' : 'Másolás', 'pcopy')}` : `<div><small>Csapat</small><b class="pcodebig">${mem.length} fő</b></div>`}<span class="sp"></span>${hbtn(NET.leaveArmed ? 'Biztos? Kattints újra' : 'Kilépés', 'pleave')}</div>
    <div class="pmem">${[0, 1, 2, 3].map(k => { const m = mem[k]; if (!m) return '<div class="pm empty"><b>Üres hely</b><small>várakozik…</small></div>'; const C = CLASSES[m.c];
      return `<div class="pm${m.h ? ' host' : ''}" style="--cc:${C ? C.color : '#8a867c'}"><em>${m.h ? 'Vezető' : m.rdy ? 'Kész' : 'Várakozik'}${m.st === 'job' ? ' · munkán' : ''}</em><b>${esc(m.n)}${m.me ? ' (te)' : ''}</b><small>${m.lv}. szint · ${C ? C.name : 'nincs kaszt'}</small></div>`; }).join('')}</div>${NET.host ? '' : hbtn(NET.ready ? 'Mégsem vagyok kész' : 'Kész vagyok', 'pready')}
    <span class="note">${NET.host ? 'Te választod a munkát: amikor elvállalsz egyet, a csapat veled jön.' : 'A csapatvezető választ munkát; amikor elindítja, veled is automatikusan indul.'}</span></div>`;
}
function partyAction(kind, a) {
  if (kind === 'pcreate') partyJoin(Math.random().toString(36).slice(2, 7), true);
  if (kind === 'pjoin' && /^[a-z0-9]{1,8}$/.test(a)) partyJoin(a, false);
  if (kind === 'pjoinc') { const c = ($('pcode') ? $('pcode').value : '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (c.length >= 4) partyJoin(c, false); }
  if (kind === 'pleave') { // a second click within 4 s confirms
    if (!NET.leaveArmed) { NET.leaveArmed = true; clearTimeout(NET.leaveT); NET.leaveT = setTimeout(() => { NET.leaveArmed = false; if (state === 'hub') renderHub(); }, 4000); return renderHub(); }
    NET.leaveArmed = false; clearTimeout(NET.leaveT); partyLeave();
  }
  if (kind === 'pready') { NET.ready = !NET.ready; publishMember(); renderHub(); }
  if (kind === 'preveal') { NET.showCode = !NET.showCode; renderHub(); }
  if (kind === 'pcopy' && NET.code) {
    const done = () => { NET.copied = true; renderHub(); setTimeout(() => { NET.copied = false; if (state === 'hub') renderHub(); }, 2000); };
    const txt = NET.code.toUpperCase();
    try { navigator.clipboard.writeText(txt).then(done, () => { fallbackCopy(txt); done(); }); } catch (e) { fallbackCopy(txt); done(); }
  }
}

// ---------- job start / end ----------
function netJobStarted(opts) {
  if (!NET.pr) { NET.mode = null; NET.client = false; return; }
  NET.mode = opts.client ? 'client' : 'host'; NET.client = !!opts.client;
  NET.hits = []; NET.acts = []; NET.fx = []; NET.kills = []; NET.dmgs = []; NET.tel = []; NET.bev = []; NET.kf = []; NET.drops = []; NET.pks = []; NET.zById.clear(); NET.last = {};
  player.down = false;
  if (NET.host) NET.job = { job: mission.job, seed: opts.seed, a: opts.a, b: opts.b, js: Date.now() };
  publishMember(); setLobby();
}
function netJobEnded() {
  NET.mode = null; NET.client = false; NET.targets = null; player.down = false; NET.ready = false;
  NET.zById.clear(); if (NET.host) NET.job = null;
  NET.avatars.forEach(a => { scene.remove(a.g); if (a.ring) scene.remove(a.ring); if (a.tag) a.tag.remove(); (a.tus || []).forEach(o => scene.remove(o.g)); }); NET.avatars.clear();
  if (NET.pr) NET.pr.presence({ p: null, g: null, bk: null }).catch(() => {}); // bk too: they kept their things, nothing to drop
  publishMember(); setLobby();
}

// ---------- avatars of the other players: a proper soldier in class colours, aiming where they look ----------
const avMats = {};
function avMat(col) { return avMats[col] || (avMats[col] = new THREE.MeshStandardMaterial({ color: col, roughness: .85 })); }
const avDark = new THREE.MeshStandardMaterial({ color: 0x2a2c28, roughness: .9 }), avBoot = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: .8 });
const avFlashMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
function makeAvatar(m) {
  const col = CLASSES[m && m.c] ? CLASSES[m.c].color : '#9aa0a6', cloth = avMat(col), pants = avMat('#3a3f36');
  const g = new THREE.Group();
  const box = (parent, mt, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(unitBox, mt); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
  const hips = new THREE.Group(); hips.position.y = .92; g.add(hips);
  const leg = x => { const L = new THREE.Group(); L.position.set(x, 0, 0); hips.add(L); box(L, pants, .19, .5, .21, 0, -.25, 0); box(L, pants, .17, .42, .19, 0, -.68, 0); box(L, avBoot, .2, .12, .3, 0, -.88, -.04); return L; };
  const legL = leg(-.13), legR = leg(.13);
  box(hips, avDark, .44, .14, .26, 0, .02, 0); // belt
  const torso = new THREE.Group(); torso.position.y = .95; g.add(torso);
  box(torso, cloth, .46, .56, .26, 0, .3, 0);
  box(torso, avDark, .5, .34, .3, 0, .34, 0); // plate carrier
  box(torso, avDark, .1, .12, .08, -.14, .22, -.17); box(torso, avDark, .1, .12, .08, .02, .22, -.17); // pouches
  const head = new THREE.Group(); head.position.set(0, .66, 0); torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.14, 14, 12), skinMat); face.position.y = .1; face.castShadow = true; head.add(face);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(.165, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), cloth); helm.position.y = .13; head.add(helm);
  box(head, avDark, .2, .04, .05, 0, .12, -.13); // goggles
  const arm = x => { const A = new THREE.Group(); A.position.set(x, .5, 0); torso.add(A); box(A, cloth, .13, .13, .34, 0, 0, -.15); box(A, skinMat, .1, .1, .3, 0, -.02, -.44); return A; };
  const armR = arm(.27), armL = arm(-.27);
  armR.rotation.y = .25; armL.rotation.y = -.45;
  const gunG = new THREE.Group(); gunG.position.set(.12, .46, -.5); torso.add(gunG);
  const flash = new THREE.Sprite(avFlashMat); flash.scale.set(.5, .5, 1); flash.visible = false; gunG.add(flash);
  const label = textSprite([String((m && m.n) || 'Társ').slice(0, 24)], col, .42); label.position.y = 2.25; g.add(label);
  scene.add(g);
  return { g, hips, legL, legR, torso, head, armL, armR, gunG, flash, pos: new V3(), vel: new V3(), down: false, gunKey: '', gun: null, walkT: 0, pitch: 0, yaw: 0, sh: null, flashT: 0, lastPing: null, name: (m && m.n) || 'Társ', col };
}
// ---------- world effects everyone should see: explosions, fire, barrels, abilities, zombie noises, spit ----------
function pushFx(e) { if (NET.mode && NET.fx) pushRoll(NET.fx, [++NET.seq, ...e], 20); }
const remoteAuras = [];
function playFx(e, a) {
  const [, t] = e, P = (x, z, y = 0) => new V3((+x || 0) / 10, (+y || 0) / 10, (+z || 0) / 10), dv = p => clamp(1 - Math.hypot(p.x - player.pos.x, p.z - player.pos.z) / 60, 0, 1);
  if (t === 'x') { const p = P(e[2], e[4], e[3]), r = (+e[5] || 50) / 10; fxExplosion(p, +e[6] || 0xff8a30, r); boomLight.position.set(p.x, p.y + 1.2, p.z); boomLight.color.set(+e[6] || 0xff8a30); boomLight.intensity = 10; withVol(dv(p), () => SND.explode()); }
  else if (t === 'f') addFireZone(P(e[2], e[3]), (+e[4] || 30) / 10, +e[5] || 5, 0, true);
  else if (t === 'b') { const x = (+e[2] || 0) / 10, z = (+e[3] || 0) / 10, pr = props.find(q => q.blk && Math.hypot(q.x - x, q.z - z) < .5); if (pr) blowBarrel(pr, true); }
  else if (t === 'ab') { const C = CLASSES[e[2]]; if (C && a) { popText(`${a.name}: ${C.ability.name}`, C.color); withVol(dv(a.pos) * .7, () => SND.power()); } }
  else if (t === 'au' && false) { const m = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 48), new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.copy(P(e[2], e[3])).setY(.05); scene.add(m); remoteAuras.push({ m, t: +e[4] || 8 }); }
  else if (t === 'zs') { const p = P(e[3], e[4]), f = SND[e[2]]; if (f) withVol(dv(p), () => f()); }
  else if (t === 'sp') { const from = P(e[2], e[4], e[3]), v = new V3((+e[5] || 0) / 10, (+e[6] || 0) / 10, (+e[7] || 0) / 10), m = new THREE.Mesh(acidGeo, acidMat); m.position.copy(from); scene.add(m); zProjs.push({ m, v, remote: true }); withVol(dv(from), () => SND.spit()); }
  else if (t === 'bo') { const p = P(e[3], e[4]); burst(p.clone().setY(1), +e[5] || 0xff7a1a, 30, 6, .7); withVol(dv(p), () => (SND[e[2]] || SND.roar)()); if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 14) player.shake = Math.max(player.shake, .5); }
}
function updateRemoteAuras(dt) { for (let i = remoteAuras.length - 1; i >= 0; i--) { const A = remoteAuras[i]; A.t -= dt; A.m.material.opacity = .3 + Math.sin(now * 6) * .12; if (A.t <= 0) { scene.remove(A.m); A.m.geometry.dispose(); A.m.material.dispose(); remoteAuras.splice(i, 1); } } }
function remoteShot(b, d) { // their shots: the gun's own sound, quieter with distance
  const f = clamp(1 - d / 70, 0, 1) * .7; if (f < .03) return;
  if (b && b.flame) return SND.flame(f, 'r');
  const snd = b && SND[b.snd]; if (snd) withVol(f, () => snd()); else { nz(.16, 1800, .55 * f); tn(160, .08, .2 * f, 'square', 50); }
}
function updateAvatars(dt, peers) {
  const seen = new Set();
  for (const p of peers) {
    if (p.sameTab || !p.presence) continue;
    if (!p.presence.p) { const a0 = NET.avatars.get(p.peer); if (a0) a0.bk = p.presence.bk; continue; } // left the job, not the party: no backpack to drop
    const P = p.presence.p; seen.add(p.peer); const bkNow = p.presence.bk;
    let a = NET.avatars.get(p.peer); if (a) { a.bk = bkNow; a.seenAt = performance.now(); } if (!a && NET.host) for (const L of [drops, gearDrops, resDrops]) for (const d of L.filter(d => d.bkOf === p.peer)) { netTookDrop(d); (L === drops ? removeDrop : L === gearDrops ? removeGearDrop : removeResDrop)(d); } // they're back: their backpack goes back to them
    if (!a) { const u = p.presence.m && p.presence.m.u; if (u) for (const [pid, o] of NET.avatars) if (o.uid === u) { scene.remove(o.g); if (o.ring) scene.remove(o.ring); if (o.tag) o.tag.remove(); (o.tus || []).forEach(t => scene.remove(t.g)); NET.avatars.delete(pid); } } // the same player under a new id (P2P reconnect): the old figure goes, nothing is dropped
    if (!a) { a = makeAvatar(p.presence.m); a.uid = p.presence.m && p.presence.m.u; a.seenAt = performance.now(); NET.avatars.set(p.peer, a); a.pos.set(+P.x || 0, 0, +P.z || 0); a.yaw = +P.yw || 0; a.lastPing = Array.isArray(P.pg) ? P.pg[0] : 0; } // pings made before we met are old news
    const px = a.pos.x, pz = a.pos.z, k = 1 - Math.exp(-dt * 12), tr = performance.now();
    if (P !== a.lastP) { a.lastP = P; (a.buf || (a.buf = [])).push({ t: tr, x: +P.x || 0, z: +P.z || 0, y: +P.y || 0, yw: +P.yw || 0, pt: clamp(+P.pt || 0, -1.4, 1.4) }); if (a.buf.length > 8) a.buf.shift(); }
    { const T = Array.isArray(P.tu) ? P.tu : [], key = T.map(t => `${t[0]},${t[1]},${t[2]}`).join('|'); // a teammate's turrets: stand-ins where theirs stand
      if (a.tuKey !== key) { (a.tus || []).forEach(o => scene.remove(o.g)); a.tus = T.map(t => { const m = turretMesh({ rocket: t[2] & 1, shield: t[2] & 2 }, !!(t[2] & 4)); m.g.position.set(t[0] / 10, 0, t[1] / 10); scene.add(m.g); return m; }); a.tuKey = key; }
      (a.tus || []).forEach((m, k) => { if (T[k]) m.head.rotation.y = +T[k][3] || 0; }); }
    const q = sampleAt(a.buf, tr - 110);
    a.pos.x = q.x; a.pos.z = q.z;
    a.vel.set((a.pos.x - px) / Math.max(dt, 1e-3), 0, (a.pos.z - pz) / Math.max(dt, 1e-3));
    if (P.dn && !a.down) killFeed(String(P.dby || 'a horda').slice(0, 30), '#c9c1a8', '', '', a.name, a.col);
    for (const e of fresh('fx' + p.peer, P.fx)) playFx(e, a);
    for (const [, wn, wq, kn, hd, vb] of fresh('kf' + p.peer, P.kf)) { const rc = RARITIES[wq] ? RARITIES[wq].color : '#cfc6b0'; killFeed(a.name, a.col, String(wn).slice(0, 40), rc, String(kn).slice(0, 40), vb ? rc : '#c9c1a8', hd, vb ? String(vb).slice(0, 20) : ''); }
    a.down = !!P.dn; a.kc = +P.kc || 0; a.dd = +P.dd || 0; a.rvc = +P.rvc || 0; a.hp = +P.hp || 0; a.mh = +P.mh || 100; a.au = Array.isArray(P.au) ? P.au : null;
    a.yaw = q.yw; a.pitch = q.pt;
    // body: yaw on the whole figure, pitch shared by the torso, head, arms and gun; legs walk with speed
    const speed = Math.hypot(a.vel.x, a.vel.z); a.walkT += dt * (2 + speed * 1.9);
    const sw = Math.sin(a.walkT) * Math.min(.7, speed * .14);
    a.g.position.set(a.pos.x, a.down ? .15 : q.y + Math.abs(Math.sin(a.walkT)) * Math.min(.05, speed * .01), a.pos.z);
    a.g.rotation.set(0, a.yaw, a.down ? 1.45 : 0);
    a.legL.rotation.x = sw; a.legR.rotation.x = -sw;
    if (+P.si && truck.g) { const s = SEATS[(P.si - 1) & 3], w = new V3(s[0], BED_Y + .1 - .92, s[1]).applyMatrix4(truck.g.matrixWorld); a.pos.set(w.x, 0, w.z); a.g.position.copy(w); a.g.rotation.set(0, a.yaw, 0); a.legL.rotation.x = a.legR.rotation.x = Math.PI / 2; } // riding in the back: in our own van, not lagging behind it
    a.torso.rotation.x = a.pitch * .45; a.head.rotation.x = a.pitch * .55;
    const rl = P.rl ? Math.sin(now * 9) * .35 - .5 : 0;
    a.armR.rotation.x = a.pitch * .55; a.armL.rotation.x = a.pitch * .55 + rl;
    a.gunG.rotation.x = a.pitch * .55 + (P.rl ? -.35 : 0);
    const gk = `${P.wb}:${P.wq}`;
    if (gk !== a.gunKey) {
      a.gunKey = gk; if (a.gun) a.gunG.remove(a.gun);
      const b = BASES.find(b => b.id === P.wb);
      if (b) { a.gun = buildGun({ base: b, q: clamp(+P.wq || 0, 0, 5) }, true); a.gun.scale.setScalar(1.25); a.gunG.add(a.gun); a.flash.position.set(0, 0, -((b.model.len + b.model.barrel) * 1.25 * .5) - .1); a.base = b; }
    }
    // their shots: flash, tracer toward where they aim, and the sound
    if (a.sh === null) { a.sh = +P.sh || 0; a.shPrev = a.sh; }
    if ((+P.sh || 0) > a.sh && !a.down) {
      a.sh = +P.sh; a.flashT = .06; a.flash.visible = true; a.flash.material.rotation = Math.random() * 6;
      const from = new V3(); a.flash.getWorldPosition(from);
      const dir = new V3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
      const shots = Math.min(4, Math.max(1, (+P.sh || 0) - (a.shPrev || 0))), b = a.base || {}, col = ELEMENTS[P.we] ? ELEMENTS[P.we].hex : b.tracer || 0xffd9a0; a.shPrev = +P.sh || 0;
      for (let k = 0; k < shots; k++) {
        if (b.flame) { fxFlame(from, dir, 12, false); continue; }
        for (let q = 0; q < Math.min(b.pellets || 1, 4); q++) { const d2 = dir.clone(); if ((b.pellets || 1) > 1 || k) d2.add(new V3(rand(-.05, .05), rand(-.03, .03), rand(-.05, .05))).normalize(); tracer(from, from.clone().addScaledVector(d2, b.range ? Math.min(b.range, 60) : 40), col, b.energy ? .03 : .012); }
      }
      remoteShot(a.base, Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z));
    } else a.sh = Math.max(a.sh, +P.sh || 0);
    if ((a.flashT -= dt) <= 0) a.flash.visible = false;
    // pings
    if (Array.isArray(P.pg) && P.pg[0] !== a.lastPing) { a.lastPing = P.pg[0]; addPing(p.peer, a.name, a.col, new V3(P.pg[1] / 10, P.pg[2] / 10, P.pg[3] / 10), String(P.pg[4]).slice(0, 60)); }
    // a medic's aura (Feltámasztó augment) brings back the downed
    { // their circle on the ground, following them
      if (a.au && !a.ring) { a.ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 48), new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false })); a.ring.rotation.x = -Math.PI / 2; scene.add(a.ring); }
      if (a.ring) { a.ring.visible = !!a.au; if (a.au) { a.ring.position.set(a.au[0], .04, a.au[1]); a.ring.scale.setScalar((a.au[3] || 6) / 6); } } }
    if (a.au && Math.hypot(player.pos.x - a.au[0], player.pos.z - a.au[1]) < (a.au[3] || 6)) { // a medic's circle heals the whole party
      if (player.down && a.au[2]) netRevive(); else if (!player.down) player.hp = Math.min(maxHp(), player.hp + 12 * dt);
    }
    for (const e of fresh('rv' + p.peer, P.rv)) if (e[1] === NET.me && (player.down || player.ffyl > 0)) { netRevive(e[2] ? 1 : .5); banner('FELÉLESZTETTEK', e[2] ? `${a.name} (tábori pap) teljesen rendbe hozott.` : `${a.name} felállított.`); }
    netRemoteDrops(p.peer, P);
  }
  if (performance.now() < (NET.grace || 0)) return; // reconnecting after the leader left: absent is not gone yet
  for (const [peer, a] of NET.avatars) if (!seen.has(peer)) {
    if (NET.host) { dropBackpack(a, peer); if (mission && mission.crates) mission.crates.forEach((c, i) => { if (c.st === 1 && c.by === peer) crateDrop(i, a.pos.x, a.pos.z); }); } // their crate falls where they stood
    if (profile && profile.inMission) { profile.inMission.alone = NET.avatars.size <= 1; markCarry(); } // closing now: were you the last one?
    scene.remove(a.g); if (a.ring) scene.remove(a.ring); if (a.tag) a.tag.remove(); (a.tus || []).forEach(o => scene.remove(o.g)); NET.avatars.delete(peer); }
}
const partySize = () => 1 + [...NET.avatars.values()].length;

// ---------- host: zombies chase the nearest living player ----------
// what the zombies may go for this frame: party members (host), the generator on a defense job; null = only you
let AIM = null;
function aimSetup() {
  AIM = NET.targets ? NET.targets.slice() : null;
  if (mission && mission.gens) for (const G of mission.gens) if (G.hp > 0) (AIM || (AIM = [{ pos: player.pos, vel: player.vel, alive: !player.down, remote: false }])).push(G.target);
  if (mission && mission.esc && mission.esc.target.alive) (AIM || (AIM = [{ pos: player.pos, vel: player.vel, alive: !player.down, remote: false }])).push(mission.esc.target);
  if (AIM) { NET.selfPos = player.pos; NET.selfVel = player.vel; }
}
function netAim(z) {
  if (!AIM) return;
  if (!z.tgt || !AIM.includes(z.tgt) || (z.tgtT = (z.tgtT || 0) - 1 / 60) <= 0) {
    z.tgtT = .4; let best = AIM[0], bd = Infinity;
    for (const T of AIM) { if (!T.alive) continue; const d = Math.hypot(T.pos.x - z.pos.x, T.pos.z - z.pos.z) * (T.gen ? .6 : 1); if (d < bd) { bd = d; best = T; } }
    z.tgt = best;
    const gens = AIM.filter(T => T.gen && T.alive); if (gens.length && z.id % 5 < 3 && !z.K.boss) z.tgt = gens.reduce((a, b) => Math.hypot(b.pos.x - z.pos.x, b.pos.z - z.pos.z) < Math.hypot(a.pos.x - z.pos.x, a.pos.z - z.pos.z) ? b : a); // on a defense job 3 in 5 zombies go for the nearest generator
  }
  player.pos = z.tgt.pos; player.vel = z.tgt.vel; zTarget = z.tgt;
  sndVol = z.tgt.remote && NET.selfPos ? clamp(1 - Math.hypot(z.pos.x - NET.selfPos.x, z.pos.z - NET.selfPos.z) / 45, 0, 1) : 1; // its noises are where it is, not where its target is
}
function netAimEnd() { sndVol = 1; if (!AIM) return; player.pos = NET.selfPos; player.vel = NET.selfVel; zTarget = null; }
// a zombie aimed at a remote player: the damage goes to them instead of the host
function netRedirectHurt(d) {
  if (zTarget && zTarget.gen) { const M = mission; if (M && zTarget.esc && M.esc) { M.esc.hp -= d; M.esc.hitT = now; } else if (M && M.gens && M.gens[zTarget.gi]) { const G = M.gens[zTarget.gi]; G.hp -= d; G.hitT = now; } return true; } // the generator is sturdier than a person
  if (!zTarget || !zTarget.remote) return false;
  pushRoll(NET.dmgs, [++NET.seq, zTarget.peer, Math.round(d * 10) / 10, hurtSrc], 16);
  return true;
}
function netNearestToVan() {
  let d = player.down ? Infinity : Math.hypot(player.pos.x - truck.pos.x, player.pos.z - truck.pos.z);
  if (NET.mode) for (const a of NET.avatars.values()) if (!a.down) d = Math.min(d, Math.hypot(a.pos.x - truck.pos.x, a.pos.z - truck.pos.z));
  return d;
}
const netExtractOk = () => !NET.mode || !player.down; // the party extracts together: everyone still standing makes it, wherever they are

// ---------- players going down and coming back ----------
function netDown() {
  player.down = true; player.hp = 0; mouseDown = rmb = false; stopReload();
  banner('ELESTÉL', 'A következő hullámban visszatérsz, ha a csapat kitart.'); SND.hurt();
}
function netRevive(frac = .5) {
  if (!player.down && !(player.ffyl > 0)) return;
  const wasDown = player.down; endFFYLView();
  player.down = false; player.hp = maxHp() * frac; player.lastHurt = now;
  const mates = [...NET.avatars.values()].filter(a => !a.down);
  if (wasDown && mates.length) { const a = pick(mates); player.pos.set(a.pos.x + rand(-1, 1), 0, a.pos.z + rand(-1, 1)); collide(player.pos, .42); }
  banner('VISSZATÉRTÉL', 'A csapat kitartott.'); SND.power();
}
function netAllDown() { return player.down && ![...NET.avatars.values()].some(a => !a.down); }

// ---------- client: hits on proxies go to the host ----------
function netHit(z, amt, o) {
  if (z.dead || z.invulnT > 0) return;
  amt *= Math.min(3, Math.pow(1.08, Math.max(0, jobLvl() - profile.level))); // level catch-up for members below the job's level
  if (z.markT > 0) amt *= 1.5;
  if (z.K.boss && rk('h_boss')) amt *= 1.2;
  if (o.w && rk('h_exec') && z.hp < z.maxHp * .25) amt *= 2;
  if (rk('h_bounty') && (z.elite || z.K.boss)) amt *= 1 + .12 * rk('h_bounty');
  if (exoOn('cryo') && z.net && z.net.fl & 32) amt *= 1.3;
  hitPerks(z, amt, o);
  const insta = powers.insta > 0 && !o.dot && !z.K.boss;
  z.hp -= z.armor > 0 && !o.head && !o.dot && !o.melee && !insta ? amt * .25 : amt; z.flash = .08; z.hitT = now;
  const col = o.crit ? '#ff7a1a' : o.head ? '#ffd23f' : o.color || (o.w && o.w.element ? ELEMENTS[o.w.element].color : '#ece6d4');
  dmgNumber(zHeadPos(z), amt, col, o.head || o.crit, o.crit);
  let burn = 0, fl = (o.head ? 1 : 0) | (o.crit ? 2 : 0) | (o.melee ? 4 : 0) | (o.dot ? 8 : 0) | (insta ? 32 : 0);
  if (o.burnDps) burn = Math.round(o.burnDps);
  NET.lastHit.set(z.id, { w: o.w, head: !!o.head });
  if (o.w && o.w.element && !o.chain) {
    if (o.w.element === 'fire') burn = Math.round(o.w.dmg * o.w.pellets * fireRate(o.w) * .12);
    else if (o.w.element === 'cryo') fl |= 16;
    else if (o.w.element === 'corrosive') { fl |= 64; burn = Math.round(o.w.dmg * o.w.pellets * fireRate(o.w) * .1); }
    else if (o.w.element === 'slag') fl |= 128;
    else applyElement(z, o.w, amt); // shock: the arc hits another proxy, which is sent too
  }
  pushRoll(NET.hits, [++NET.seq, z.id, Math.round(amt), fl, burn], 24);
  if (z.hp <= 0 && !z.K.boss && !z.predDead) { z.predDead = performance.now(); proxyDie(z); if (o.head) headPop(z); hitmarker(true); }
  if (!o.dot) { addPoints(10); weaponOnHit(z, amt, o); }
}
const netAct = (type, arg) => pushRoll(NET.acts, [++NET.seq, type, arg == null ? 0 : arg], 8);

// ---------- host: a remote player's kill ----------
function netKill(z, o) {
  const pts = z.K.points || (o.melee ? 130 : o.head ? 100 : 60);
  pushRoll(NET.kills, [++NET.seq, o.remote, KIND_IDS.indexOf(z.kind), o.head ? 1 : 0, pts, Math.round(z.pos.x * 10), Math.round(z.pos.z * 10), z.elite ? 1 : 0, z.id, z.tier || 0], 16);
  teamLoot(z.kind, z.pos, z.elite, z.tier); // the host's own share of a member's kill
}
function teamLoot(kind, pos, elite, tier) { // loot is personal: a mate's kill still drops something for you, at 60% of the odds
  const K = KINDS[kind]; if (!K || !mission || mission.job.test || (K.boss && mission.job.bounty) || (!K.boss && Math.random() > .6)) return; // the Butcher drops for everyone
  dropLoot({ K, kind, elite: !!elite, tier: +tier || 0 }, new V3(pos.x, 0, pos.z));
}
// the killer's side: points, stats and their own loot roll
function netOwnKill(e) {
  const [, , ki, head, pts, x, zz, elite] = e, kind = KIND_IDS[ki]; if (!kind || (mission && mission.job.test)) return;
  player.kills++; stats.kills++; stats.killsBy[kind] = (stats.killsBy[kind] || 0) + 1; myKill(curW(), KINDS[kind].name, head); noteBaseKill(curW());
  if (head) { player.heads++; stats.heads++; }
  if (rk('m_vamp')) player.hp = Math.min(maxHp(), player.hp + 3 * rk('m_vamp'));
  addPoints(+pts || 60); hitmarker(true); SND.kill();
  const zid = e[8], lh = NET.lastHit.get(zid) || {}, pz = zombies.find(q => q.id === zid) || { pos: new V3(x / 10, 0, zz / 10), burnT: 0 };
  weaponOnKill(pz, { w: lh.w, head: !!head }); killPerks(pz.K ? pz : Object.assign(pz, { K: KINDS[kind] }), { w: lh.w, head: !!head }); NET.lastHit.delete(zid);
  dropLoot({ K: KINDS[kind], kind, elite: !!elite, tier: +e[9] || 0 }, new V3(x / 10, 0, zz / 10));
}

// ---------- the world snapshot ----------
function buildSnapshot() {
  const M = mission, zs = [];
  for (const z of zombies) {
    if (z.dead) continue;
    const fl = (z.rise > 0 ? 1 : 0) | (z.windup > 0 || z.bossState ? 2 : 0) | (z.elite ? 4 : 0) | (z.K.armor && z.armor <= 0 ? 8 : 0) | (z.burnT > 0 ? 16 : 0)
      | (z.slowT > 0 ? 32 : 0) | (z.buffT > 0 ? 64 : 0) | (z.K.ghost && z.op > .5 ? 128 : 0) | (z.fuse > 0 ? 256 : 0) | (z.crouch > 0 ? 512 : 0) | (z.markT > 0 ? 1024 : 0) | ((AFFIX_KEYS.indexOf((z.traits || [])[0]) + 1) << 11) | ((AFFIX_KEYS.indexOf((z.traits || [])[1]) + 1) << 15) | ((z.tier || 0) << 19) | (z.acidT > 0 ? 1 << 21 : 0) | (z.slagT > 0 ? 1 << 22 : 0);
    zs.push([z.id, KIND_IDS.indexOf(z.kind), Math.round(z.pos.x * 10), Math.round(z.pos.z * 10), Math.round(z.g.rotation.y * 100), Math.max(0, Math.round(z.hp / z.maxHp * 100)), fl, Math.round(z.g.position.y * 10), Math.round(z.scale * 100), Math.round(z.maxHp)]);
    if (zs.length >= 90) break;
  }
  const keys = Object.keys(AREAS);
  return {
    t: Math.round(M.t * 10) / 10, ph: M.phase, pt: Math.round((M.phaseT || 0) * 10) / 10, w: M.wave, r: round, cl: M.cleared ? 1 : 0,
    ew: M.evacWarn ? 1 : 0, pk: M.pickup, vo: Math.round((truck.g.position.x - truck.pos.x) * truck.dir * 100) / 100, bt: Math.round((M.boardT || 0) * 10) / 10,
    pa: Math.round((M.parkT || 0) * 10) / 10, lv: M.leaving ? 1 : 0, ar: keys.reduce((m, k, i) => m | (AREAS[k].unlocked ? 1 << i : 0), 0),
    kc: M.kc || 0, rt: M.rt || 0, be: NET.bev, ca: M.cache && M.cache.t > 0 ? [Math.round(M.cache.x * 10), Math.round(M.cache.z * 10), Math.round(M.cache.t)] : null, tl: NET.tel, gh: M.gens ? M.gens.map(G => Math.round(G.hp / G.max * 1000) / 1000) : null, es: M.esc ? [Math.round(M.esc.pos.x * 10), Math.round(M.esc.pos.z * 10), Math.round(M.esc.hp / M.esc.max * 1000), Math.hypot(M.esc.vel.x, M.esc.vel.z) > .1 ? 1 : 0, M.esc.leg, Math.round(M.esc.pos.distanceTo(M.esc.end))] : null, cr: M.crates ? M.crates.map(c => [Math.round(c.pos.x * 10), Math.round(c.pos.z * 10), c.st, c.by || '']) : null, dv: M.drop ? [Math.round(M.drop.pos.x * 10), Math.round(M.drop.pos.z * 10)] : null, od: M.objDone ? 1 : 0,
    tr: trapState.map(T => T.active > 0 ? Math.round(T.active * 10) / 10 : -Math.round((T.cd || 0) * 10) / 10), z: zs, k: NET.kills, d: NET.dmgs, bk: M.bountyAt ? M.bountyAt.map(v => Math.round(v * 10) / 10) : null,
    bb: (b => b ? [b.id, b.bounty, b.phase || 1, b.invulnT > 0 ? 1 : 0] : null)(zombies.find(z => z.bounty && !z.dead)),
    hz: fireZones.filter(F => F.hazard).map(F => [Math.round(F.pos.x * 10), Math.round(F.pos.z * 10), Math.round(F.r * 10)]),
    du: M.job.dur, dn: NET.deny || [], iv: M.intro >= 0 ? Math.round(M.goT * 100) / 100 : 99,
  };
}
function myPresence() {
  const w = curW();
  return { x: Math.round(player.pos.x * 100) / 100, y: Math.round(player.pos.y * 100) / 100, z: Math.round(player.pos.z * 100) / 100, yw: Math.round(player.yaw * 100) / 100,
    pt: Math.round(player.pitch * 100) / 100, si: mission && mission.intro >= 0 && mission.goT < rideLen() ? (mission.seat | 0) + 1 : 0, sh: NET.shots || 0, kc: player.kills, dd: Math.round(player.dmgDone || 0), rvc: NET.revs || 0, rl: player.reloading ? 1 : 0, pg: NET.ping || null,
    au: aura ? [Math.round(aura.pos.x * 10) / 10, Math.round(aura.pos.z * 10) / 10, augOn('revive') ? 1 : 0, aura.r] : null, rv: NET.rv,
    wb: w ? w.base.id : null, wq: w ? w.q : 0, hp: Math.ceil(player.hp), mh: maxHp(), dn: player.down || player.ffyl > 0 ? 1 : 0, dby: player.down || player.ffyl > 0 ? player.downBy : null, kf: NET.kf, fx: NET.fx, we: w ? w.element || '' : '', tu: turrets.filter(t => !t.station).map(t => [Math.round(t.g.position.x * 10), Math.round(t.g.position.z * 10), (t.rocket ? 1 : 0) | (t.shield ? 2 : 0) | (t.small ? 4 : 0), Math.round(t.head.rotation.y * 100) / 100]), h: NET.hits, a: NET.acts, dr: (NET.drops = (NET.drops || []).filter(e => performance.now() - e[5] < 4000)).map(e => e.slice(0, 5)), pk: NET.pks };
}
// only take list entries newer than what was seen; the first sight of a sender skips its history
function fresh(key, list) {
  if (!Array.isArray(list)) return [];
  const top = list.reduce((m, e) => Math.max(m, +e[0] || 0), 0);
  if (!(key in NET.last)) { NET.last[key] = top; return []; }
  const out = list.filter(e => +e[0] > NET.last[key]); NET.last[key] = Math.max(NET.last[key], top); return out;
}

// ---------- every frame ----------
function netTick(dt) {
  if (!NET.pr || NET.migrating) return;
  const peers = NET.pr.peers(), me = peers.find(p => p.sameTab); NET.me = me ? me.peer : null;
  for (const p of peers) if (!p.sameTab && p.presence && p.presence.m) for (const [, t] of fresh('ch' + p.peer, p.presence.m.ch)) chatAdd(p.presence.m.n, t);
  const host = peers.find(p => !p.sameTab && p.presence && p.presence.m && p.presence.m.h);
  if (NET.host && host && mission && host.presence.m.st === 'job' && NET.me && host.peer < NET.me && host.presence.g) return stepDown(); // two leaders after a split: the lower id keeps the job
  if (!NET.host && !host && !NET.hadHost && NET.rejoinT && performance.now() - NET.rejoinT > 6000) { NET.rejoinT = 0; toast('A CSAPAT MÁR NEM ÉL', ['Nincs kihez visszacsatlakozni.'], '#ff8a70'); return partyLeave(); }
  if (host) NET.rejoinT = 0;
  if (!NET.host) {
    if (host) NET.hadHost = true;
    else if (NET.hadHost) { // the leader left
      if (NET.p2p && mission && !mission.job.test) return; // P2P: p2pMigrate handles it (or gives up)
      if (mission && NET.client && !mission.job.test && !mission.leaving) { // mid-job: the member with the lowest id takes over; the others wait for them
        const next = successorPeer(peers);
        if (next === NET.me) { promoteToHost(); return; }
        NET.waitHost = NET.waitHost || performance.now();
        if (performance.now() - NET.waitHost < 9000) return;
      }
      NET.waitHost = 0;
      if (mission && NET.client) { banner('A CSAPATVEZETŐ KILÉPETT', 'A munka véget ért.'); finishJob(false, true); }
      partyLeave(); return;
    }
    NET.waitHost = 0;
    const J = host && host.presence.job, G = host && host.presence.g;
    if (J && G && J.js !== NET.seenJs && (state === 'hub' || state === 'results') && J.job && MAPS[J.job.map]) {
      NET.seenJs = J.js; startJob(J.job, { seed: +J.seed || 1, a: J.a | 0, b: J.b | 0, client: true });
    }
  }
  if (!mission || !NET.mode) return;
  updateAvatars(dt, peers);
  if (NET.avatars.size) { mission.partyMax = Math.max(mission.partyMax || 1, partySize()); { const B = new Map((mission.board || []).map(b => [b.n, b])); for (const a of NET.avatars.values()) B.set(a.name, { n: a.name, k: a.kc || 0, r: a.rvc || 0, d: a.dd || 0 }); mission.board = [...B.values()]; } } // kept for the results, even if the host leaves first
  { const bk = mission.job.test ? null : { w: player.bag.map(packW), g: mission.gear, pa: mission.parts || 0, fa: mission.fabric || 0 }, key = JSON.stringify(bk); // the backpack, sent when it changes
    if (key !== NET.bkKey) { NET.bkKey = key; markCarry(); NET.pr.presence({ bk }).catch(() => {}); } }
  NET.lastPeers = peers.filter(p => p.presence && p.presence.m).map(p => ({ peer: p.peer, me: p.sameTab, h: !!p.presence.m.h, st: p.presence.m.st }));
  const out = { p: myPresence() };
  if (NET.host) {
    NET.selfPos = player.pos; NET.selfVel = player.vel;
    NET.targets = [{ pos: player.pos, vel: player.vel, alive: !player.down, remote: false }];
    for (const [peer, a] of NET.avatars) NET.targets.push({ pos: a.pos, vel: a.vel, alive: !a.down && performance.now() - (a.seenAt || 0) < 1500, remote: true, peer }); // a figure left over while reconnecting isn't prey
    for (const p of peers) { // members' hits and actions
      if (p.sameTab || !p.presence || !p.presence.p) continue;
      for (const [, zid, dmg, fl, burn] of fresh('h' + p.peer, p.presence.p.h)) {
        const z = NET.zById.get(zid); if (!z || z.dead) continue;
        if (fl & 64) { z.acidT = 4; z.acidDps = Math.max(z.acidDps || 0, Math.min(+burn || 0, 1e6)); z.acidBy = p.peer; z.acidW = null; }
        else if (burn > 0) { z.burnT = 3; z.burnDps = Math.max(z.burnDps, Math.min(+burn, 1e6)); z.burnBy = p.peer; }
        if (fl & 128) z.slagT = 5;
        if (fl & 16) z.slowT = 2.5;
        hurtZombie(z, clamp(+dmg || 0, 0, 1e7), { remote: p.peer, head: !!(fl & 1), crit: !!(fl & 2), melee: !!(fl & 4), dot: !!(fl & 8), insta: !!(fl & 32) });
      }
      for (const [, type, arg] of fresh('a' + p.peer, p.presence.p.a)) netHostAct(type, arg, p.peer);
    }
    out.g = buildSnapshot();
  } else if (host && host.presence.g) {
    if (host.presence.g !== NET.lastG) { NET.lastG = host.presence.g; NET.gFrom = host.peer; applySnapshot(host.presence.g, host.peer); } // only new snapshots
  } else if (mission && !mission.leaving && NET.hadHost && (!host || NET.gFrom === host.peer)) { // the host's job is over (a brand-new host hasn't sent its first snapshot yet)
    if (mission.job.test) { banner('A LŐTÉR BEZÁRT', 'A vezető visszament a bázisra; ami nálad van, hazajött.'); finishJob(true, true); return; }
    banner('A MUNKA VÉGET ÉRT', 'A csapatvezető befejezte.'); mission.hostEnd = true; finishJob(false, false); return;
  }
  NET.pr.presence(out).catch(() => {});
}
const successorPeer = peers => peers.filter(p => p.presence && p.presence.m && !p.presence.m.h && p.presence.m.st === 'job').map(p => p.peer).sort()[0];
function stepDown() { // back to member: our copy of the world goes, the other leader's snapshots take over
  clearZombieStuff(); NET.zById.clear(); NET.host = false; NET.mode = 'client'; NET.client = true; NET.hadHost = true; NET.lastG = null; NET.job = null;
  for (const L of [drops, gearDrops, resDrops]) for (const d of L.filter(d => d.bkOf)) (L === drops ? removeDrop : L === gearDrops ? removeGearDrop : removeResDrop)(d); // backpacks we dropped for players who were only cut off
  banner('ÚJRA EGY CSAPAT', 'A kapcsolat helyreállt, a másik vezető viszi tovább.'); publishMember();
}
function promoteToHost() { // this member becomes the leader: the proxies become the real zombies, the clock and the spawns carry on here
  const M = mission; NET.host = true; NET.mode = 'host'; NET.client = false; NET.hadHost = false; NET.waitHost = 0;
  let maxId = 0; for (const z of zombies) { maxId = Math.max(maxId, z.id || 0); z.net = null; z.predDead = 0; if (!z.dead) NET.zById.set(z.id, z); }
  zidSeq = Math.max(zidSeq, maxId + 1);
  if (M.job.bounty) M.bountyBoss = zombies.find(z => z.bounty && !z.dead) || (M.bountyDone || M.t > bountyPre(M.job) + 3 ? true : null);
  NET.job = { job: M.job, seed: mapSeed, a: 0, b: M.pickup || 0, js: Date.now() };
  NET.tel = []; NET.bev = []; NET.kills = []; NET.dmgs = []; NET.lastG = null; NET.deny = []; NET.takenBy = new Map();
  M.evented = M.evented || M.t > M.job.dur * .45; M.bossDone = !M.job.boss || M.evacWarn || M.phase === 'evac'; // what the old host already did
  for (const z of zombies) if (z.bounty && !z.dead && !z.bInit) { z.bInit = 1; for (const [k, v] of [['sumT', 6], ['novaT', 8], ['blinkT', 10], ['throwT', 4], ['slamT', 6]]) if (!(z[k] >= 0)) z[k] = v; z.phase = z.phase || 1; z.dmg *= 1.2; } // the bounty's tricks
  if (M.crates) M.crates.forEach((c, i) => { if (c.st === 1 && c.by === 'H') crateDrop(i, c.pos.x, c.pos.z); else if (c.st === 1 && c.by === NET.me) c.by = 'H'; }); // the old leader's crate falls, mine is now the leader's
  if (M.phase === 'evac' && M.arriveT < 0 && !M.leaving) { const vo = Math.max(0, (truck.g.position.x - truck.pos.x) * truck.dir); if (vo > .05) M.arriveT = ARRIVE_T * (1 - Math.sqrt(clamp(vo / vanRun(), 0, 1))); } // the van was still backing in
  if (M.esc) { const E = M.esc; if (E.net) E.pos.copy(E.net); if (E.leg !== 1) E.end = E.path2.length ? E.path2[E.path2.length - 1] : E.end; E.path = gridPath(E.pos, E.end); E.goal = E.path.shift() || E.end.clone(); if (E.leg !== 1) E.path2 = []; } // the survivor walks on from where they are
  banner('TE LETTÉL A VEZETŐ', 'A csapatvezető kiesett, a munka folytatódik.'); SND.power();
  try { NET.pr.presence({ g: buildSnapshot() }).catch(() => {}); } catch (e) {} // the first snapshot goes out with (before) the leader flag
  publishMember(); setLobby();
}
function netHostAct(type, arg, peer) {
  const M = mission; if (!M) return;
  const keys = Object.keys(AREAS);
  if (type === 'gate' && keys[arg] && !AREAS[keys[arg]].unlocked) { openArea(keys[arg]); banner(`${AREAS[keys[arg]].name.toUpperCase()} MEGNYÍLT`, 'Egy társad nyitotta meg.'); }
  if (type === 'trap' && trapState[arg] && trapState[arg].active <= 0 && trapState[arg].cd <= 0) trapState[arg].active = 20;
  if (type === 'crate' && Array.isArray(arg)) { const [i, act, x, z] = arg; if (act === 't') crateTake(i | 0, peer); else if (act === 'd') crateDrop(i | 0, x / 10, z / 10); else if (act === 'v') crateDeliver(i | 0); }
  if (type === 'mark' && Array.isArray(arg)) for (const id of arg.slice(0, 40)) { const z = NET.zById.get(id); if (z && !z.dead) z.markT = 10; }
  if (type === 'repair') { if (Array.isArray(arg) && M.gens) { const G = M.gens[arg[0] | 0]; if (G && G.hp > 0) G.hp = Math.min(G.max, G.hp + Math.min(+arg[1] || 0, G.max * .2)); } else { const T = M.esc; if (T && T.hp > 0) T.hp = Math.min(T.max, T.hp + T.max * .25); } }
  if (type === 'board' && M.phase === 'evac' && truck.parked && !(M.boardT > 0) && !M.leaving) { M.boardT = BOARD_T; banner('BESZÁLLÁS', `Tartsatok ki ${BOARD_T} mp-ig a furgon mellett!`); }
}

// ---------- client: follow the host's world ----------
// members render the host's world ~2 snapshots in the past, interpolating between samples: smooth even when packets bunch up
const angDiff = d => ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const interpDelay = () => clamp((NET.gInt || 50) * 2.2, 70, 260);
function sampleAt(buf, rt) {
  let a = buf[0], b = null;
  for (let k = 0; k < buf.length; k++) if (buf[k].t <= rt) { a = buf[k]; b = buf[k + 1] || null; }
  if (!b) return a;
  const u = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1), o = {};
  for (const key in a) o[key] = key === 'h' || key === 'yw' ? a[key] + angDiff(b[key] - a[key]) * u : key === 't' ? rt : lerp(a[key], b[key], u);
  return o;
}
function applySnapshot(g, hostPeer) {
  const M = mission; if (!M || typeof g !== 'object') return;
  const tr = performance.now(); if (NET.gLast) NET.gInt = lerp(NET.gInt || 50, clamp(tr - NET.gLast, 10, 500), .15); NET.gLast = tr;
  // clock, phase, threat
  const was = { ph: M.phase, w: M.wave, ew: M.evacWarn, cl: M.cleared };
  if (Array.isArray(g.bk) && !M.bountyDone) { if (M.job.bounty) firstBounty(M.job.bounty); M.bountyDone = true; M.job.dur = (+g.t || 0) + EVAC_WARN + 1; bountyLoot({ x: +g.bk[0] || 0, z: +g.bk[1] || 0 }, M.job.bounty); banner(BOUNTIES[M.job.bounty] ? `${BOUNTIES[M.job.bounty].name.toUpperCase()} ELESETT` : 'A CÉLPONT ELESETT', 'Legendás zsákmány! Szedd fel, aztán irány a furgon.'); }
  Object.assign(M, { t: +g.t || 0, phase: g.ph, phaseT: +g.pt || 0, wave: +g.w || 1, cleared: !!g.cl, evacWarn: !!g.ew, pickup: g.pk | 0, boardT: +g.bt || 0, parkT: +g.pa || 0 });
  if (M.intro >= 0 && g.iv != null) { const v = +g.iv; if (v < 0) M.goT = -1; else if (M.goT < 0 || Math.abs(M.goT - v) > .3) M.goT = Math.min(v, rideLen() + (M.goT > rideLen() ? M.goT - rideLen() : 0)); } // the ride follows the leader
  if (+g.du > 0) M.job.dur = +g.du; // the host's clock is the clock (bounty and objective end times)
  for (const [, peer, nid] of fresh('dn' + hostPeer, g.dn)) if (peer === NET.me) revokeTake(nid);
  if (round !== g.r) { round = +g.r || 1; $('round').textContent = round; }
  if (M.wave > was.w) { banner(`${M.wave}. HULLÁM`, `A veszély ${round}. szintre nőtt.`); SND.roundStart(); if (player.down || player.ffyl > 0) netRevive(); }
  else if (M.phase === 'lull' && was.ph === 'wave') { banner('A HULLÁM VÉGE', 'Öljétek meg a maradékot.'); SND.roundEnd(); }
  if (M.evacWarn && !was.ew && (player.down || player.ffyl > 0)) netRevive();
  if (M.evacWarn && !was.ew) { banner('A FURGON ÚTON VAN', `${EVAC_WARN} mp múlva ér a zöld jelzéshez. Induljatok!`); SND.roundEnd(); }
  if (M.phase === 'evac' && was.ph !== 'evac') { banner('IDŐ LEJÁRT', `Itt a furgon! [E], aztán tarts ki ${BOARD_T} mp-ig mellette.`); SND.roundEnd(); }
  // the van
  if ((M.evacWarn || M.phase === 'evac') && M.pickPlaced !== M.pickup) { M.pickPlaced = M.pickup; M.departT = -1; placeVan(M.pickup, false); truck.beacon.visible = truck.beam.visible = true; }
  if (M.pickPlaced != null && !M.leaving) setVanAt(Math.max(0, +g.vo || 0));
  if (g.lv && !M.leaving) { M.leaving = .001; M.extractOk = netExtractOk(); if (M.extractOk) markCarry(true); banner(M.extractOk ? 'INDULÁS' : 'LEMARADTÁL', M.extractOk ? 'Munka kész.' : 'A furgon nélküled ment el.'); }
  // areas and traps
  const keys = Object.keys(AREAS);
  keys.forEach((k, i) => { if ((g.ar & (1 << i)) && !AREAS[k].unlocked) openArea(k); });
  if (Array.isArray(g.tr)) g.tr.forEach((v, i) => { const T = trapState[i]; if (!T) return; if (+v < 0) { T.active = 0; T.cd = -v; } else T.active = +v || 0; });
  // zombies
  const live = new Set();
  if (Array.isArray(g.z)) for (const e of g.z) {
    const [id, ki, x, zz, h, hp, fl, y, sc, mh] = e, kind = KIND_IDS[ki]; if (!kind) continue;
    live.add(id);
    let z = NET.zById.get(id);
    if (!z) {
      z = spawnZombieAt(kind, x / 10, zz / 10, fl & 1 ? 1 : 0);
      z.id = id; z.elite = !!(fl & 4); z.scale = (+sc || 100) / 100; z.g.scale.setScalar(z.scale);
      NET.zById.set(id, z);
      const bk = Array.isArray(g.bb) && g.bb[0] === id && BOUNTIES[g.bb[1]] ? g.bb[1] : null;
      if (bk) { bountyLook(z, bk); SND.threat(3); }
      if (z.K.boss) { banner(bk ? BOUNTIES[bk].name.toUpperCase() : 'A MÉSZÁROS', bk ? BOUNTIES[bk].desc : 'Az utadat állja a furgon felé.'); SND.roar(); }
      z.traits = [AFFIX_KEYS[((fl >> 11) & 15) - 1], AFFIX_KEYS[((fl >> 15) & 15) - 1]].filter(Boolean); z.affix = z.traits[0] || null; { const nt = (fl >> 19) & 3, heard = NET.heard || (NET.heard = new Set()); if (nt >= 2 && !heard.has(id) && Math.hypot(x / 10 - player.pos.x, zz / 10 - player.pos.z) < 60) { heard.add(id); SND.threat(nt); } z.tier = nt; }
    }
    if (z.dead && z.predDead) { if (tr - z.predDead > 700) resurrect(z); else continue; } // our kill wasn't confirmed: it gets back up
    if (+mh > 0) z.maxHp = +mh; // the host's number, ranks and party size included
    const hpv = clamp(+hp || 0, 0, 100) / 100 * z.maxHp;
    if (hpv < z.hp || now - (z.hitT || -9) > .4) z.hp = hpv;
    z.net = { x: x / 10, z: zz / 10, h: h / 100, y: (+y || 0) / 10, fl }; if (fl & 1024) z.markT = Math.max(z.markT || 0, .3);
    (z.buf || (z.buf = [])).push({ t: tr, x: x / 10, z: zz / 10, h: h / 100, y: (+y || 0) / 10 }); if (z.buf.length > 8) z.buf.shift();
  }
  for (const [id, z] of NET.zById) if (!live.has(id)) { NET.zById.delete(id); proxyDie(z); }
  if (Array.isArray(g.bb)) { const bz = NET.zById.get(g.bb[0]); if (bz) { if (BOUNTIES[g.bb[1]]) bountyLook(bz, g.bb[1]); bz.phase = g.bb[2]; bz.invulnT = g.bb[3] ? .5 : 0; } }
  NET.hz = Array.isArray(g.hz) ? g.hz : [];
  for (const [, t, s] of fresh('be' + hostPeer, g.be)) { banner(String(t).slice(0, 40), String(s || '').slice(0, 80)); if (/FÁZIS/.test(t)) SND.roar(); }
  if (Array.isArray(g.ca) && !M.cache) { M.cache = { x: (+g.ca[0] || 0) / 10, z: (+g.ca[1] || 0) / 10, t: clamp(+g.ca[2] || 0, 0, 60) }; buildCache(M.cache); banner('UTÁNPÓTLÁS-LÁDA', 'A térkép túloldalán, 60 mp-ig nyitható.'); }
  for (const [, x, z, r, t, col, kind] of fresh('tl' + hostPeer, g.tl)) { // the host's warnings: same ring here; the frost wave chills us too
    const at = new V3((+x || 0) / 10, 0, (+z || 0) / 10), R = clamp((+r || 0) / 10, .5, 30);
    if (kind === 'heal') { tn(520, 1.4, .08, 'sine', 900); popText('A Főorvos gyógyítani készül: sebezd meg!', '#6aff9a'); }
    if (kind === 'bell') { tn(220, 1.6, .12, 'sine', 200); tn(330, 1.6, .06, 'sine', 300); popText('A harang mindjárt megszólal: fedezékbe!', '#d8c47a'); }
    telegraph(at, R, +col || 0xffffff, clamp((+t || 0) / 100, .1, 3), () => { if (kind === 'boom' || kind === 'fire') { fxExplosion(at.clone().setY(.6), +col || 0xffd23f, R); withVol(clamp(1 - Math.hypot(at.x - player.pos.x, at.z - player.pos.z) / 60, 0, 1), () => SND.explode()); } if (kind === 'bell') bellHit(at); if (kind === 'frost' && Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < R) { player.chillT = 3; popText('Megdermedtél!', '#9fe6ff'); } });
  }
  M.kc = +g.kc || 0;
  if (g.rt != null && M.rt != null && g.rt !== M.rt && (player.down || player.ffyl > 0)) netRevive(); M.rt = g.rt;
  if (M.esc && Array.isArray(g.es)) { const E = M.esc, hp = (+g.es[2] || 0) / 1000 * E.max; if (hp < E.hp - 1) E.hitT = now; E.hp = hp; E.net = new V3((+g.es[0] || 0) / 10, 0, (+g.es[1] || 0) / 10); E.moving = !!g.es[3]; E.leg = +g.es[4] || E.leg; E.netDist = +g.es[5] || 0; }
  if (M.gens && Array.isArray(g.gh)) M.gens.forEach((G, k) => { const hp = (+g.gh[k] || 0) * G.max; if (hp < G.hp - 1) G.hitT = now; G.hp = hp; });
  if (M.crates && Array.isArray(g.cr)) { const had = player.carry; player.carry = null; M.crates.forEach((c, i) => { const e = g.cr[i]; if (!e) return; if (c.st !== 2 && +e[2] === 2) { burst(new V3(c.pos.x, 1.2, c.pos.z), 0xf2c12a, 14, 3, .5); popText(`Láda leadva · ${g.cr.filter(q => +q[2] === 2).length}/${g.cr.length}`, '#f2c12a'); SND.buy(); } if (+e[2] === 1 && e[3] === NET.me && had !== i) { SND.pickup(2); popText('Vidd a lerakó furgonhoz · E: letétel', '#f2c12a'); } c.st = +e[2] || 0; c.by = e[3] || ''; if (!(c.st === 1 && c.by === NET.me)) c.pos.set(e[0] / 10, 0, e[1] / 10); if (c.st === 1 && c.by === NET.me) player.carry = i; }); }
  if (g.dv && !M.drop) buildDropVan(M, g.dv[0] / 10, g.dv[1] / 10);
  if (M.crates) updateCrates(M, 0);
  if (g.od && !M.objDone) { M.objDone = true; M.job.dur = M.t + EVAC_WARN + 1; banner('CÉL TELJESÍTVE', 'Jön a furgon. Irány a zöld jelzés!'); }
  // kills credited to me, and damage the host's zombies did to me
  for (const e of fresh('k' + hostPeer, g.k)) if (e[1] === NET.me) netOwnKill(e); else teamLoot(KIND_IDS[e[2]], { x: e[5] / 10, z: e[6] / 10 }, e[7], e[9]);
  for (const e of fresh('d' + hostPeer, g.d)) if (e[1] === NET.me && !player.down) { hurtSrc = typeof e[3] === 'string' ? e[3].slice(0, 30) : null; hurtPlayer(+e[2] || 0); hurtSrc = null; }
}
function resurrect(z) { z.dead = false; z.predDead = 0; z.deathT = 0; z.g.rotation.z = 0; z.g.visible = true; z.upper.children.forEach(c => c.visible = true); }
function proxyDie(z) {
  if (z.dead) return;
  z.dead = true; z.deathT = 0; z.fallDir = Math.random() < .5 ? 1 : -1; bloodPool(z.pos.x, z.pos.z, z.scale);
  burst(new V3(z.pos.x, 1.2 * z.scale, z.pos.z), 0x5a0a0a, 10, 3);
  if (z.K.bloat && z.net && z.net.fl & 256) { z.g.visible = false; burst(new V3(z.pos.x, 1, z.pos.z), 0x9dff3a, 30, 6, .7); SND.explode(); }
}
// proxies glide to the host's positions and animate themselves
function updateProxies(dt) {
  for (const z of zombies) { const f = z.net && z.net.fl; if (!f || z.dead) continue; if ((f & (1 << 21)) && Math.random() < dt * 8) burst(new V3(z.pos.x + rand(-.2, .2), rand(.4, 1.6) * z.scale, z.pos.z + rand(-.2, .2)), 0x9dff3a, 1, .8, .35); if ((f & (1 << 22)) && Math.random() < dt * 6) burst(new V3(z.pos.x, rand(.6, 1.8) * z.scale, z.pos.z), 0xc86aff, 1, .6, .35); } // the host's acid and slag
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i], K = z.K, s = z.net;
    if (z.dead) {
      z.deathT += dt;
      z.upper.rotation.x = lerp(z.upper.rotation.x, K.crawl ? 1.5 : -1.4, dt * 6);
      z.g.rotation.z = lerp(z.g.rotation.z, (K.crawl ? .3 : 1.45) * z.fallDir, Math.min(1, dt * 5));
      z.g.position.y = z.deathT > 1.4 ? -(z.deathT - 1.4) * 1.2 : .2 * z.scale * Math.min(1, z.deathT * 4);
      if (z.deathT > 3) { scene.remove(z.g); freeZombie(z); zombies.splice(i, 1); }
      continue;
    }
    if (!s) continue;
    const k = 1 - Math.exp(-dt * 12), px = z.pos.x, pz = z.pos.z, q = z.buf && z.buf.length ? sampleAt(z.buf, performance.now() - interpDelay()) : s;
    z.pos.x = q.x; z.pos.z = q.z; z.rise = s.fl & 1 ? .5 : 0;
    z.g.position.set(z.pos.x, q.y, z.pos.z);
    z.g.rotation.y = q.h;
    z.flash -= dt; z.markT = (z.markT || 0) - dt;
    const em = z.flash > 0 || (s.fl & 256 && Math.sin(now * 40) > 0) ? 0x777777 : s.fl & 16 ? 0x4a1800 : s.fl & 32 ? 0x10384a : s.fl & 64 ? 0x4a0000 : z.markT > 0 ? 0x3a1450 : s.fl & 4 ? 0x3a2a00 : 0x0d100b;
    for (const m of z.mats) m.emissive.setHex(player.eyeT > 0 && !(z.flash > 0) ? 0xb01818 : em); // Halálszem: every zombie lit red
    if (K.ghost) { z.op = lerp(z.op || .1, s.fl & 128 ? .9 : .1, Math.min(1, dt * 4)); for (const m of z.mats) m.opacity = z.op; }
    if (z.armorParts && s.fl & 8) z.armorParts.forEach(a => a.visible = false);
    if (s.fl & 16 && Math.random() < dt * 12) burst(new V3(z.pos.x, rand(.6, 1.9) * z.scale, z.pos.z), 0xff7a20, 1, 1, .35);
    const moving = Math.hypot(z.pos.x - px, z.pos.z - pz) / Math.max(dt, 1e-4);
    z.walkT += dt * (2 + moving * 2.2);
    z.amp = lerp(z.amp || 0, Math.min(.75, .15 + moving * .18), k);
    const sw = Math.sin(z.walkT) * z.amp;
    z.legL.rotation.x = sw; z.legR.rotation.x = -sw;
    z.upper.rotation.x = lerp(z.upper.rotation.x, s.fl & 512 ? 1.1 : K.lean, k); if (z.flinch > 0) { z.flinch -= dt; z.upper.rotation.x -= z.flinch * 26 * dt; }
    if (K.crawl) { z.armL.rotation.x = -1.3 + sw * 1.2; z.armR.rotation.x = -1.3 - sw * 1.2; }
    else { const reach = -1.35 - (s.fl & 2 ? .9 : 0); z.armL.rotation.x = lerp(z.armL.rotation.x, reach, k); if (!K.gun) z.armR.rotation.x = lerp(z.armR.rotation.x, reach, k); else z.armR.rotation.x = -1.5; }
    if (K.bloat) z.torso.scale.x = 1.55 + Math.sin(now * (s.fl & 256 ? 30 : 3)) * (s.fl & 256 ? .15 : .04);
    if ((z.groanT -= dt) <= 0) { z.groanT = rand(3, 9); const d = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z); if (d < 26) SND.groan(.22 * (1 - d / 26)); }
  }
}
// the client's side of the job: its own van animations; everything else comes from the snapshot
function clientMission(dt) {
  const M = mission; if (!M) return;
  if (M.job.test) testRefill();
  if (M.gen || M.esc) updateObjective(M, dt); // looks only; the host decides the outcome
  if (M.leaving) { if (updateOutro(M, dt, !!M.extractOk)) finishJob(!!M.extractOk); return; }
  if (M.departT >= 0) { M.departT += dt; setVanAt(M.departT * M.departT * 2.5); if (!truck.g.visible && M.departT > 1) M.departT = -1; }
  for (const [x, z, r] of NET.hz || []) for (let k = 0; k < 3; k++) { const a = rand(0, 6.28), d = Math.sqrt(Math.random()) * r / 10; burst(new V3(x / 10 + Math.sin(a) * d, .1, z / 10 + Math.cos(a) * d), Math.random() < .5 ? 0xff6a1a : 0xffc04a, 1, 1.4, .5); }
  stats.bestThreat = Math.max(stats.bestThreat, round);
}

requestAnimationFrame(frame);

// ---------- pings: Z or the middle mouse button marks a spot (or a zombie) for the whole party ----------
const pings = [];
const pingTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.moveTo(32, 6); g.lineTo(58, 32); g.lineTo(32, 58); g.lineTo(6, 32); g.closePath(); g.stroke(); return new THREE.CanvasTexture(c); })();
function doPing() {
  if (!mission || state !== 'playing') return;
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion), targets = rayBlockers.slice();
  for (const z of zombies) if (!z.dead) targets.push(...z.parts);
  ray.set(camera.position, dir); ray.far = 150;
  const h = ray.intersectObjects(targets, false)[0];
  const pos = h ? h.point.clone() : camera.position.clone().addScaledVector(dir, 60);
  let kind = h && h.object.userData.z ? 'z|' + h.object.userData.z.K.name : 'p';
  if (kind === 'p') { // loot near the spot: say what it is
    const near = [...drops.map(d => [d, d.w.name, d.w.unique ? 5 : d.w.q]), ...gearDrops.map(d => [d, d.it.name, d.it.q])].map(e => [e, Math.hypot(e[0].pos.x - pos.x, e[0].pos.z - pos.z)]).filter(e => e[1] < 2.5).sort((a, b) => a[1] - b[1])[0];
    if (near) { const [d, name, q] = near[0]; pos.set(d.pos.x, .4, d.pos.z); kind = `l|${q}|${name}`; }
  }
  NET.ping = [(NET.ping ? NET.ping[0] : 0) + 1, Math.round(pos.x * 10), Math.round(pos.y * 10), Math.round(pos.z * 10), kind];
  addPing('me', myName(), CLASSES[profile.cls] ? CLASSES[profile.cls].color : '#f2a33a', pos, kind);
}
function addPing(owner, name, col, pos, kind) {
  const old = pings.findIndex(p => p.owner === owner); if (old >= 0) removePing(old);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pingTex, color: new THREE.Color(col), transparent: true, depthTest: false }));
  sp.scale.set(.9, .9, 1); sp.position.copy(pos).add(new V3(0, .6, 0)); sp.renderOrder = 999; scene.add(sp);
  const el = document.createElement('div'); el.className = 'ping'; el.style.setProperty('--pc', col); $('pings').appendChild(el);
  pings.push({ owner, name: String(name).slice(0, 24), pos, kind, t: 8, sp, el });
  tn(1100, .07, .12, 'sine'); tn(1650, .09, .1, 'sine', 0, .07);
}
function removePing(i) { const p = pings[i]; scene.remove(p.sp); p.sp.material.dispose(); p.el.remove(); pings.splice(i, 1); }
function updatePings(dt) {
  const W = innerWidth, H = innerHeight;
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i]; p.t -= dt;
    if (p.t <= 0 || !mission) { removePing(i); continue; }
    p.sp.material.opacity = Math.min(1, p.t) * (.7 + Math.sin(now * 8) * .3);
    const v = p.pos.clone().add(new V3(0, .6, 0)).project(camera); let x = v.x, y = v.y; const behind = v.z > 1;
    if (behind) { x = -x; y = -y; }
    const k = Math.max(Math.abs(x) / .92, Math.abs(y) / .85); if (behind || k > 1) { x /= k; y /= k; }
    p.el.style.transform = `translate(${(x + 1) / 2 * W}px,${(1 - y) / 2 * H}px) translate(-50%,-110%)`;
    const [pk, a1, a2] = String(p.kind).split('|'), loot = pk === 'l' && RARITIES[+a1];
    p.el.textContent = `${pk === 'z' ? `${(a1 || 'zombi').toUpperCase()} · ` : loot ? `${String(a2 || '').slice(0, 40)} · ` : ''}${p.name} · ${Math.round(Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z))} m`;
    if (loot) p.el.style.setProperty('--pc', loot.color);
    p.el.style.opacity = Math.min(1, p.t);
  }
}

// ---------- reviving a downed mate: hold E next to them ----------
const reviveT = () => 10 * (1 - .15 * U('revive')) / (exoOn('priest') ? 3 : 1); // 10 s, faster with the upgrade and the chaplain's helmet
function reviveFocus() {
  if (!NET.mode || player.down || player.ffyl > 0) return null;
  for (const [peer, a] of NET.avatars) if (a.down && Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z) < 2.2) return { type: 'revive', peer, name: a.name };
  return null;
}
function reviveMate(peer) { NET.revs = (NET.revs || 0) + 1; pushRoll(NET.rv, [++NET.seq, peer, isCls('medic') ? 1 : 0], 6); SND.power(); popText('Felélesztetted a társad', '#6dff9a'); }
// ---------- teammates on screen: name + HP over their head, and a party list ----------
function updateMatesHud() {
  const box = $('mates'), W = innerWidth, H = innerHeight; if (!box) return;
  const list = NET.mode ? [...NET.avatars.entries()] : [];
  box.hidden = !list.length;
  let html = '';
  for (const [peer, a] of list) {
    const pct = a.mh ? clamp(a.hp / a.mh, 0, 1) : 0;
    html += `<div class="mate${a.down ? ' down' : ''}" style="--pc:${a.col}"><div class="mh"><b>${esc(a.name)}</b><span>${a.down ? 'LEESETT' : `${Math.round(Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z))} m`}</span></div><i><em style="width:${pct * 100}%"></em></i></div>`;
    let el = a.tag; if (!el) { el = a.tag = document.createElement('div'); el.className = 'matetag'; $('pings').appendChild(el); }
    const v = new V3(a.pos.x, (a.down ? .8 : 2.5), a.pos.z).project(camera), off = v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
    el.hidden = false; // always on screen: through walls, and pinned to the edge when they are behind you
    const cl = new V3(a.pos.x, 2.5, a.pos.z).sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
    let x = v.x, y = v.y, edge = 0;
    if (cl.z > 0 || off) { edge = cl.x >= 0 ? 1 : -1; x = edge * .92; y = clamp(off && cl.z <= 0 ? v.y : 0, -.7, .7); } // behind you or off screen: on that side's edge
    el.style.transform = `translate(${(x + 1) / 2 * W}px,${(1 - y) / 2 * H}px) translate(-50%,-100%)`;
    el.style.setProperty('--pc', a.col);
    el.innerHTML = a.down ? `<span>ELESETT · [E] felélesztés · ${Math.round(Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z))} m</span>` : `<b>${esc(a.name)} <small>${Math.round(Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z))} m</small></b><i><em style="width:${pct * 100}%"></em></i>`;
    el.classList.toggle('down', a.down); el.dataset.edge = edge;
  }
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  // the escort's survivor: tagged like a teammate, always on screen (blind directive or not)
  const E = mission && mission.esc, show = E && E.target && E.target.alive && E.hp > 0 && state !== 'intro';
  let et = updateMatesHud.esc; if (!et) { et = updateMatesHud.esc = document.createElement('div'); et.className = 'matetag esc'; $('pings').appendChild(et); }
  et.hidden = !show; if (!show) return;
  const p = NET.client && E.net ? E.net : E.pos, v = new V3(p.x, 2.4, p.z).project(camera), off = v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
  const cl = new V3(p.x, 2.4, p.z).sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
  let x = v.x, y = v.y, edge = 0;
  if (cl.z > 0 || off) { edge = cl.x >= 0 ? 1 : -1; x = edge * .92; y = clamp(off && cl.z <= 0 ? v.y : 0, -.35, .3); } // pinned to a side, clear of the corners
  et.style.transform = `translate(${(x + 1) / 2 * W}px,${(1 - y) / 2 * H}px) translate(-50%,-100%)`; et.style.setProperty('--pc', '#7dcf5a'); et.dataset.edge = edge;
  const h = `<b>TÚLÉLŐ <small>${Math.round(Math.hypot(p.x - player.pos.x, p.z - player.pos.z))} m${E.waiting ? ' · vár rád' : ''}</small></b><i><em style="width:${clamp(E.hp / E.max, 0, 1) * 100}%"></em></i>`;
  if (et.dataset.h !== h) { et.dataset.h = h; et.innerHTML = h; }
}

// ---------- what a player drops in a party shows up for everyone; whoever picks it up takes it from all ----------
// ponytail: two players grabbing the same drop in the same instant both get it; fine among friends
function netShareDrop(kind, obj, d) {
  if (!NET.mode || !d || !NET.drops) return;
  const s = ++NET.seq; d.nid = NET.me + ':' + s;
  NET.drops.push([s, kind, kind === 'w' ? packW(obj) : obj, Math.round(d.pos.x * 10) / 10, Math.round(d.pos.z * 10) / 10, performance.now()]);
}
function netTookDrop(d) {
  if (!NET.mode || !d || !d.nid || !NET.pks) return; pushRoll(NET.pks, [++NET.seq, d.nid], 8);
  if (NET.host) (NET.takenBy || (NET.takenBy = new Map())).set(d.nid, 'H'); else (NET.mine || (NET.mine = new Map())).set(d.nid, d); // a member's pickup stands unless the host saw someone else first
}
function revokeTake(nid) { // someone got there first: what we picked up goes
  const d = NET.mine && NET.mine.get(nid); if (!d || !mission) return; NET.mine.delete(nid);
  if (d.it) { const i = mission.gear.indexOf(d.it); if (i >= 0) mission.gear.splice(i, 1); for (const k of GEAR_KEYS) if (profile.gear[k] === d.it) { profile.gear[k] = null; gearChanged(); } }
  else if (d.k) mission[d.k] = Math.max(0, (mission[d.k] || 0) - d.n);
  else if (d.w) { const i = player.bag.indexOf(d.w); if (i >= 0) player.bag.splice(i, 1); else { const s = player.slots.indexOf(d.w); if (s >= 0) { if (player.slots.filter(Boolean).length > 1) { player.slots[s] = null; if (player.cur === s) player.cur = 1 - s; } else { const w = makeWeapon(BASES[0], 0, Math.max(1, profile.level)); w.ammo = w.mag; w.reserve = resMax(w); player.slots[s] = w; } equipView(); renderSlots(); } } }
  popText('Egy társad előbb vette fel', '#ff8a70'); SND.deny();
}
const tagBk = (d, peer) => { d.bkOf = peer || '?'; return d; };
function dropBackpack(a, peer) { // a teammate dropped out: their bag, found armor, parts and fabric stay where they stood, for anyone to pick up
  const M = mission, b = a.bk; if (!M || M.job.test || M.leaving || !b || typeof b !== 'object') return;
  const spot = () => new V3(a.pos.x + rand(-1.2, 1.2), 0, a.pos.z + rand(-1.2, 1.2)); let n = 0;
  for (const o of (Array.isArray(b.w) ? b.w : []).slice(0, 20)) { if (!o || !BASES.some(x => x.id === o.base)) continue; const w = unpackW(cleanStrs(Object.assign({}, o))); w.owned = false; w.ammo = w.mag; w.reserve = resMax(w); netShareDrop('w', w, tagBk(spawnDrop(w, spot()), peer)); n++; }
  for (const o of (Array.isArray(b.g) ? b.g : []).slice(0, 12)) { if (!o || !GEAR_SLOTS[o.slot] || !BRANDS[o.brand] || typeof o.stats !== 'object') continue; const it = cleanStrs(Object.assign({}, o, { stats: Object.assign({}, o.stats) })); delete it.found; netShareDrop('g', it, tagBk(spawnGearDrop(it, spot()), peer)); n++; }
  for (const [k, v] of [['parts', b.pa], ['fabric', b.fa]]) if (+v > 0) { const c = Math.min(9999, +v | 0); netShareDrop('r', { q: 0, k, n: c }, tagBk(spawnResDrop(k, c, spot()), peer)); n++; }
  if (n) toast(`${a.name.toUpperCase()} KIESETT`, ['A hátizsákja tartalma ott maradt, ahol állt: bárki felveheti.'], '#ff8a70', 6000);
}
const cleanStrs = o => { for (const k in o) if (typeof o[k] === 'string') o[k] = o[k].replace(/[<>&"]/g, ''); return o; }; // peers are untrusted: names end up in innerHTML
function netRemoteDrops(peer, P) {
  for (const [s, kind, o, x, z] of fresh('dr' + peer, P.dr)) {
    if (!o || typeof o !== 'object' || !(o.q >= 0 && o.q <= 5)) continue;
    const pos = new V3(+x || 0, 0, +z || 0), nid = peer + ':' + s;
    if (kind === 'w' && BASES.some(b => b.id === o.base)) {
      const w = unpackW(cleanStrs(Object.assign({}, o))); w.owned = false; w.ammo = w.mag; w.reserve = resMax(w);
      spawnDrop(w, pos).nid = nid;
    } else if (kind === 'r' && (o.k === 'parts' || o.k === 'fabric') && +o.n > 0) spawnResDrop(o.k, Math.min(9999, +o.n | 0), pos).nid = nid;
    else if (kind === 'g' && GEAR_SLOTS[o.slot] && BRANDS[o.brand] && o.stats && typeof o.stats === 'object') {
      const it = cleanStrs(Object.assign({}, o, { stats: Object.assign({}, o.stats) })); delete it.found;
      spawnGearDrop(it, pos).nid = nid;
    }
  }
  for (const [, nid] of fresh('pk' + peer, P.pk)) {
    if (NET.host) { const T = NET.takenBy || (NET.takenBy = new Map()), by = T.get(nid); if (by && by !== peer) { pushRoll(NET.deny || (NET.deny = []), [++NET.seq, peer, nid], 8); continue; } T.set(nid, peer); }
    const d = drops.find(q => q.nid === nid); if (d) removeDrop(d);
    const g = gearDrops.find(q => q.nid === nid); if (g) removeGearDrop(g);
    const r = resDrops.find(q => q.nid === nid); if (r) removeResDrop(r);
  }
}
// ---------- compass along the top: where you look, your mates, the van ----------
const CARD = [['É', 0], ['ÉNY', Math.PI / 4], ['NY', Math.PI / 2], ['DNY', 3 * Math.PI / 4], ['D', Math.PI], ['DK', -3 * Math.PI / 4], ['K', -Math.PI / 2], ['ÉK', -Math.PI / 4]];
function updateCompass() {
  const el = $('compassIn'); if (!el || !mission) return;
  $('compass').hidden = dirOn('blind'); if (dirOn('blind')) return;
  let row = 0; const span = Math.PI * .6, at = (b, cls, txt, col) => { const r = angDiff(b - player.yaw); if (Math.abs(r) > span) return ''; const low = !/^(cc|tk)/.test(cls); return `<i class="${cls}" style="left:${(50 - r / span * 50).toFixed(1)}%${col ? `;--pc:${col}` : ''}${low ? `;top:${14 + (row++ % 2) * 11}px` : ''}">${txt}</i>`; };
  const bear = (x, z) => Math.atan2(-(x - player.pos.x), -(z - player.pos.z));
  let h = Array.from({ length: 24 }, (_, k) => k % 3 ? at(k * Math.PI / 12, 'tk', '') : '').join('') + CARD.map(([t, b]) => at(b, t === 'É' ? 'cc big n' : t.length === 1 ? 'cc big' : 'cc', t)).join('');
  for (const a of NET.avatars.values()) h += at(bear(a.pos.x, a.pos.z), 'cm', `${esc(a.name)} <small>${Math.round(Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z))} m</small>`, a.col);
  if (truck.beacon.visible) h += at(bear(truck.pos.x, truck.pos.z), 'cv', 'FURGON');
  const w = curW(); if (w && w.reserve < w.mag && !mission.job.test) h += at(bear(ammoBox.pos.x, ammoBox.pos.z), 'cv ammo', `LŐSZER ${Math.round(Math.hypot(ammoBox.pos.x - player.pos.x, ammoBox.pos.z - player.pos.z))} m`);
  if (mission.gens) for (const G of mission.gens) if (G.hp > 0) h += at(bear(G.pos.x, G.pos.z), 'cv', `GEN ${G.name} ${Math.round(G.hp / G.max * 100)}%`);
  if (mission.esc && mission.esc.target.alive) h += at(bear(mission.esc.pos.x, mission.esc.pos.z), 'cv', 'TÚLÉLŐ');
  const dist = p => Math.round(Math.hypot(p.x - player.pos.x, p.z - player.pos.z));
  if (mission.crates) { if (player.carry != null && mission.drop) h += at(bear(mission.drop.pos.x, mission.drop.pos.z), 'cv', `LERAKÓ ${dist(mission.drop.pos)} m`); else { const c = mission.crates.filter(c => c.st === 0).sort((a, b) => dist(a.pos) - dist(b.pos))[0]; if (c) h += at(bear(c.pos.x, c.pos.z), 'cv ammo', `LÁDA ${dist(c.pos)} m`); if (mission.drop) h += at(bear(mission.drop.pos.x, mission.drop.pos.z), 'cv', 'LERAKÓ'); } }
  if (mission.cache && mission.cache.t > 0) h += at(bear(mission.cache.x, mission.cache.z), 'cv ammo', `UTÁNPÓTLÁS ${Math.round(mission.cache.t)} mp`);
  { const bz = zombies.find(z => z.bounty && !z.dead); if (bz) h += at(bear(bz.pos.x, bz.pos.z), 'cv', `CÉLPONT ${dist(bz.pos)} m`); }
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
}

// ---------- kill feed, top right: who killed what with what, and who went down to what ----------
function killFeed(a, aCol, wName, wCol, b, bCol, head, verb) {
  const box = $('kfeed'); if (!box) return;
  const el = document.createElement('div'); el.className = 'kf';
  if (verb && bCol && (bCol === RARITIES[4].color || bCol === RARITIES[5].color || bCol === EXO_COL)) el.classList.add('big');
  el.innerHTML = `<b style="color:${aCol}">${esc(a)}</b>${verb ? ` <i class="kv">${esc(verb)}</i>` : wName ? ` <i style="color:${wCol}">[${esc(wName)}]</i>` : ' <i>⟶</i>'} <b style="color:${bCol}">${esc(b)}</b>${head ? ' <em>FEJLÖVÉS</em>' : ''}`;
  box.prepend(el); while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
}
// picking up, dropping and taking things apart go in the feed too, for the whole party
function itemFeed(verb, name, q) {
  const col = CLASSES[profile.cls] ? CLASSES[profile.cls].color : '#f2a33a';
  killFeed(myName(), col, '', '', name, RARITIES[q] ? RARITIES[q].color : '#cfc6b0', false, verb);
  if (NET.mode && NET.kf) pushRoll(NET.kf, [++NET.seq, '', q, String(name).slice(0, 40), 0, verb], 6);
}
function myKill(w, kindName, head) {
  const col = CLASSES[profile.cls] ? CLASSES[profile.cls].color : '#f2a33a', wq = w.unique ? 5 : w.q || 0;
  killFeed(myName(), col, w.unique || w.q >= 4 || !w.base ? w.name : w.base.name, RARITIES[wq] ? RARITIES[wq].color : '#cfc6b0', kindName, '#c9c1a8', head);
  if (NET.mode && NET.kf) pushRoll(NET.kf, [++NET.seq, String(w.name).slice(0, 40), wq, kindName, head ? 1 : 0], 6);
}
// ---------- party chat: Enter opens it, Enter sends, Esc closes ----------
NET.chat = [];
function chatAdd(name, text, me) {
  const log = $('chatLog'); if (!log) return;
  const el = document.createElement('div'); el.className = 'cl' + (me ? ' me' : '');
  const b = document.createElement('b'); b.textContent = String(name).slice(0, 24) + ': '; el.appendChild(b); el.appendChild(document.createTextNode(String(text).slice(0, 120)));
  log.appendChild(el); while (log.children.length > 30) log.firstChild.remove();
  setTimeout(() => el.classList.add('old'), 10000);
  if (!me) tn(880, .05, .06, 'sine');
}
function chatOpen() {
  const inp = $('chatIn'); if (!NET.code || !inp.hidden) return false;
  for (const k in keys) keys[k] = false; mouseDown = rmb = false;
  $('chat').classList.add('open'); inp.hidden = false; inp.value = ''; inp.focus(); return true;
}
function chatClose() { const inp = $('chatIn'); inp.blur(); inp.hidden = true; $('chat').classList.remove('open'); }
$('chatIn').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    const t = $('chatIn').value.trim().slice(0, 120);
    if (t) { pushRoll(NET.chat, [Date.now(), t], 6); publishMember(); chatAdd(myName(), t, true); }
    chatClose();
  } else if (e.code === 'Escape') chatClose();
});
addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && ['playing', 'hub', 'paused', 'results'].includes(state) && chatOpen()) e.preventDefault();
});
function updateChatVis() { const on = !!NET.code && ['playing', 'hub', 'paused', 'results', 'intro'].includes(state); if ($('chat').hidden === on) $('chat').hidden = !on; }
setInterval(updateChatVis, 250);

// a banner the whole party sees (host side): boss events and the like
function netBanner(t, s) { banner(t, s); if (NET.mode === 'host' && NET.bev) pushRoll(NET.bev, [++NET.seq, t, s], 4); }
