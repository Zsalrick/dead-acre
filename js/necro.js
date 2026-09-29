// ================= NEKROMANTA: the dead you killed fight for you =================
// Each player runs their own minions (like turrets): they hunt the nearest zombie and their hits count as yours.
// The host's zombies go for them too (AIM), teammates see stand-ins, and damage to a teammate's minion goes back to them.
const minions = [];
let necroKills = [], minSeq = 0; // the last few you killed: { kind, x, z, elite }
const minMax = () => augOn('legion') ? 3 : rk('n_twin') ? 2 : 1;
const minDur = () => 60 + 15 * rk('n_time');
function necroOnKill(kind, x, z, elite) {
  if (!isCls('necro')) return;
  if (KINDS[kind] && !KINDS[kind].boss) { necroKills.push({ kind, x, z, elite }); if (necroKills.length > 3) necroKills.shift(); }
  const heal = 1 + 2 * rk('n_leech'); player.hp = Math.min(maxHp(), player.hp + heal);
  for (const m of minions) if (!m.dead && rk('n_elite')) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * .1);
}
function raiseMinion(kind, x, zz, o = {}) {
  const K = KINDS[kind]; if (!K) return null;
  const pw = (o.mul || 1) * (rk('n_elite') ? 1.5 : 1);
  const m = { kind, K, ...mkZombie(kind), pos: new V3(x, 0, zz), scale: K.scale(), heading: player.yaw + Math.PI, walkT: 0, atkCd: 0, rise: o.rise ?? 1, t: minDur(), id: ++minSeq, dead: false, deathT: 0, side: 1 };
  m.maxHp = m.hp = zombieHp() * Math.max(1, K.hp) * 1.25 * (1 + .2 * rk('n_bond')) * pw; // full health and a bit more
  m.dmg = zombieHp() * .3 * Math.sqrt(Math.max(1, K.hp)) * 1.25 * (1 + .15 * rk('n_rage')) * pw;
  m.speed = K.speed(round) * 1.25;
  m.target = { pos: m.pos, vel: new V3(), alive: true, minion: m, taunt: rk('n_taunt') > 0 };
  for (const mt of m.mats) { mt.emissive.setHex(0x1c5a2c); mt.transparent = false; mt.opacity = 1; }
  m.g.scale.setScalar(m.scale); m.g.position.set(x, -2.2 * m.rise, zz); scene.add(m.g);
  burst(new V3(x, .3, zz), 0x7dff9a, 18, 3, .8);
  minions.push(m); chAdd('necro_use');
  while (minions.filter(q => !q.dead).length > minMax()) minionDie(minions.find(q => !q.dead)); // the oldest goes first
  return m;
}
function useRaise() { // the class ability: the last kill (two with Kettős rítus, three with Légió) stands back up
  const n = augOn('legion') ? 3 : rk('n_twin') ? 2 : 1, list = necroKills.splice(-n);
  if (!list.length) { popText('Még nincs kit feltámasztani: ölj meg egy zombit', '#ff8a70'); return false; }
  for (const k of list) raiseMinion(k.kind, k.x, k.z, { mul: augOn('legion') ? .6 : 1 });
  if (augOn('cross')) player.cross = 1;
  banner('FELTÁMASZTÁS', `${list.map(k => KINDS[k.kind].name).join(', ')} · ${minDur()} mp-ig veled harcol`);
  return true;
}
function minionDie(m) {
  if (!m || m.dead) return;
  m.dead = true; m.deathT = 0; m.fallDir = Math.random() < .5 ? 1 : -1;
  burst(new V3(m.pos.x, 1.2 * m.scale, m.pos.z), 0x7dff9a, 14, 3);
  if (rk('n_blast')) explode(new V3(m.pos.x, 1, m.pos.z), { r: 5, zdmg: 150 + zombieHp() * 1.5, pr: .01, color: 0x7dff9a });
  if (augOn('soulswap')) { player.hp = Math.min(maxHp(), player.hp + maxHp() * .25); player.abilCd = Math.max(0, player.abilCd - 15); }
}
function hurtMinion(m, d) { if (!m || m.dead) return; m.hp -= d; m.flash = .08; if (m.hp <= 0) minionDie(m); }
// the host's zombies may go for any minion in the party
function minionTargets() {
  const T = minions.filter(m => !m.dead && !(m.rise > 0)).map(m => m.target);
  if (NET.mode) for (const [peer, a] of NET.avatars) for (const s of a.mnP || []) T.push(s.target);
  return T;
}
function updateMinions(dt) {
  for (let i = minions.length - 1; i >= 0; i--) {
    const m = minions[i], K = m.K;
    if (m.dead) {
      m.deathT += dt;
      m.upper.rotation.x = lerp(m.upper.rotation.x, K.crawl ? 1.5 : -1.4, dt * 6);
      m.g.rotation.z = lerp(m.g.rotation.z, (K.crawl ? .3 : 1.45) * m.fallDir, Math.min(1, dt * 5));
      m.g.position.y = m.deathT > 1.4 ? -(m.deathT - 1.4) * 1.2 : .2 * m.scale * Math.min(1, m.deathT * 4);
      if (m.deathT > 3) { scene.remove(m.g); freeZombie(m); minions.splice(i, 1); }
      continue;
    }
    if ((m.t -= dt) <= 0) { minionDie(m); continue; }
    m.flash = (m.flash || 0) - dt;
    for (const mt of m.mats) mt.emissive.setHex(m.flash > 0 ? 0x777777 : m.t < 5 && Math.sin(now * 12) > 0 ? 0x0a200f : 0x1c5a2c); // blinks out its last seconds
    if (m.rise > 0) { m.rise = Math.max(0, m.rise - dt * 1.2); m.g.position.set(m.pos.x, -2.2 * m.rise, m.pos.z); m.armL.rotation.x = m.armR.rotation.x = -2.6; continue; }
    // the nearest zombie within 30 m, or back to you
    if ((m.seekT = (m.seekT || 0) - dt) <= 0) { m.seekT = .4; let bd = 30; m.tgt = null; for (const z of zombies) { if (z.dead || z.rise > 0 || z.dummy) continue; const d = Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z); if (d < bd) { bd = d; m.tgt = z; } } }
    if (m.tgt && m.tgt.dead) m.tgt = null;
    const goal = m.tgt ? m.tgt.pos : player.pos, dx = goal.x - m.pos.x, dz = goal.z - m.pos.z, dist = Math.hypot(dx, dz);
    const reach = m.tgt ? 1.2 * m.scale + .35 * m.tgt.scale : 2.5, move = dist > reach;
    let ang = Math.atan2(dx, dz);
    if (move && blockedAt(m.pos.x + Math.sin(ang) * 1.1, m.pos.z + Math.cos(ang) * 1.1, .4)) for (const off of [.7, -.7, 1.4, -1.4, 2.1, -2.1]) { const a = ang + off * m.side; if (!blockedAt(m.pos.x + Math.sin(a) * 1.1, m.pos.z + Math.cos(a) * 1.1, .4)) { ang = a; break; } }
    m.heading += angDiff(ang - m.heading) * Math.min(1, dt * 7);
    const sp = m.speed * (m.tgt ? 1 : dist > 8 ? 1.6 : .8);
    let mx = 0, mz = 0; if (move) { mx = Math.sin(m.heading) * sp * dt; mz = Math.cos(m.heading) * sp * dt; }
    m.pos.x += mx; m.pos.z += mz; collide(m.pos, .35 * m.scale);
    if ((m.stuckT = (m.stuckT || 0) + dt) > 2) { m.stuckT = 0; m.side *= -1; }
    const moving = Math.hypot(mx, mz) / Math.max(dt, 1e-4), bl = 1 - Math.exp(-dt * 9);
    m.walkT += dt * (2 + moving * 2.2); m.amp = lerp(m.amp || 0, Math.min(.75, .15 + moving * .18), bl);
    const sw = Math.sin(m.walkT) * m.amp;
    m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.upper.rotation.x += (K.lean - m.upper.rotation.x) * bl;
    m.atkCd -= dt;
    if (!K.crawl) { const r = -1.35 - (m.atkCd > .6 ? .9 : 0); m.armL.rotation.x += (r - m.armL.rotation.x) * bl; m.armR.rotation.x += (r - m.armR.rotation.x) * bl; }
    m.g.position.set(m.pos.x, Math.abs(Math.sin(m.walkT)) * .05, m.pos.z); m.g.rotation.y = m.heading;
    if (m.tgt && dist < reach + .3 && m.atkCd <= 0) { // a swing: its hits are yours (points, kills, the loot)
      m.atkCd = .9; const tg = m.tgt;
      hurtZombie(tg, m.dmg, { minion: true, color: '#7dff9a' });
      if (rk('n_plague')) for (const z of zombies) if (z !== tg && !z.dead && Math.hypot(z.pos.x - tg.pos.x, z.pos.z - tg.pos.z) < 4) hurtZombie(z, m.dmg * .4, { minion: true, chain: true, color: '#7dff9a' });
    }
  }
  if (player.cross == null) player.cross = 0;
}
// the cross (Megtérítés): the zombie you look at, within 25 m, joins you
function useCross() {
  if (!isCls('necro') || !augOn('cross')) return;
  if (!(player.cross > 0)) { SND.deny(); return popText('Nincs kereszted: a Feltámasztás ad egyet', '#ff8a70'); }
  const ray = new THREE.Raycaster(camera.position.clone(), new V3(0, 0, -1).applyQuaternion(camera.quaternion), 0, 25), parts = [];
  for (const z of zombies) if (!z.dead && !z.dummy) parts.push(...z.parts);
  const h = ray.intersectObjects(rayBlockers.concat(parts), false)[0], z = h && h.object.userData.z;
  if (!z) { SND.deny(); return popText('Nézz egy zombira (25 m-en belül)', '#ff8a70'); }
  if (z.K.boss || z.bounty) { SND.deny(); return popText('Ez a lélek túl erős a kereszthez', '#ff8a70'); }
  player.cross--; SND.power();
  const x = z.pos.x, zz = z.pos.z;
  if (NET.client) { netAct('conv', z.id); z.dead = true; z.deathT = 2.9; z.g.visible = false; } // the host takes it off the map
  else convertZombie(z);
  raiseMinion(z.kind, x, zz, { rise: 0 });
  banner('MEGTÉRÍTÉS', `${KINDS[z.kind].name} · mostantól veled harcol`);
  renderInv();
}
function convertZombie(z) { // it leaves the horde without dying: no loot, no points
  const i = zombies.indexOf(z); if (i < 0 || z.dead) return;
  scene.remove(z.g); freeZombie(z); zombies.splice(i, 1); NET.zById.delete(z.id);
}
function resetMinions() { for (const m of minions) { scene.remove(m.g); freeZombie(m); } minions.length = 0; necroKills = []; player.cross = 0; }
// ---------- the top-left list and the tags over them ----------
function minionHud() {
  const live = minions.filter(m => !m.dead);
  return live.map(m => `<div class="mate minion" style="--pc:#7dff9a"><div class="mh"><b>${KINDS[m.kind].name} <small>szolga</small></b><span>${Math.ceil(m.t)} mp</span></div><i><em style="width:${clamp(m.hp / m.maxHp, 0, 1) * 100}%"></em></i></div>`).join('');
}
function updateMinionTags() {
  const W = innerWidth, H = innerHeight;
  const all = [...minions.filter(m => !m.dead && !(m.rise > .5)).map(m => ({ m, own: true })), ...(NET.mode ? [...NET.avatars.values()].flatMap(a => (a.mnP || []).map(s => ({ m: s, own: false, who: a.name }))) : [])];
  for (const m of minions) if (m.tag && (m.dead || m.rise > .5)) m.tag.hidden = true;
  for (const { m, own, who } of all) {
    let el = m.tag; if (!el) { el = m.tag = document.createElement('div'); el.className = 'matetag minion'; $('pings').appendChild(el); }
    const v = new V3(m.pos.x, 2.3 * (m.scale || 1), m.pos.z).project(camera), on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) < 45;
    el.hidden = !on; if (!on) continue;
    el.style.transform = `translate(${(v.x + 1) / 2 * W}px,${(1 - v.y) / 2 * H}px) translate(-50%,-100%)`; el.style.setProperty('--pc', '#7dff9a');
    const h = `<b>${own ? 'SZOLGA' : `${esc(who || '')} SZOLGÁJA`} <small>${Math.ceil(m.t)} mp</small></b><i><em style="width:${clamp(m.hp / m.maxHp, 0, 1) * 100}%"></em></i>`;
    if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
  }
}
// ---------- party: what we send, and a teammate's minions as stand-ins ----------
const minionPresence = () => { const L = minions.filter(m => !m.dead && !(m.rise > 0)); return L.length ? L.map(m => [m.id, KIND_IDS.indexOf(m.kind), Math.round(m.pos.x * 10), Math.round(m.pos.z * 10), Math.round(m.heading * 100), Math.round(m.hp / m.maxHp * 100), Math.ceil(m.t), rk('n_taunt') ? 1 : 0]) : null; };
function syncRemoteMinions(a, peer, arr) {
  const list = Array.isArray(arr) ? arr.slice(0, 3) : [], seen = new Set();
  a.mnP = a.mnP || [];
  for (const e of list) {
    const [id, ki, x, z, h, hp, t, taunt] = e, kind = KIND_IDS[ki]; if (!kind) continue; seen.add(id);
    let s = a.mnP.find(q => q.id === id);
    if (!s) { s = { id, kind, K: KINDS[kind], ...mkZombie(kind), pos: new V3(x / 10, 0, z / 10), scale: KINDS[kind].scale(), walkT: 0, maxHp: 100 }; s.g.scale.setScalar(s.scale); for (const mt of s.mats) mt.emissive.setHex(0x1c5a2c); scene.add(s.g); s.target = { pos: s.pos, vel: new V3(), alive: true, remote: true, peer, mi: id }; a.mnP.push(s); }
    s.nx = x / 10; s.nz = z / 10; s.h = h / 100; s.hp = clamp(+hp || 0, 0, 100); s.t = +t || 0; s.target.taunt = !!taunt;
  }
  a.mnP = a.mnP.filter(s => { if (seen.has(s.id)) return true; scene.remove(s.g); freeZombie(s); if (s.tag) s.tag.remove(); return false; });
}
function updateRemoteMinions(dt) {
  if (!NET.mode) return;
  const k = 1 - Math.exp(-dt * 10);
  for (const a of NET.avatars.values()) for (const s of a.mnP || []) {
    const px = s.pos.x, pz = s.pos.z; s.pos.x = lerp(s.pos.x, s.nx, k); s.pos.z = lerp(s.pos.z, s.nz, k);
    const mv = Math.hypot(s.pos.x - px, s.pos.z - pz) / Math.max(dt, 1e-4); s.walkT += dt * (2 + mv * 2.2);
    const sw = Math.sin(s.walkT) * Math.min(.75, .15 + mv * .18); s.legL.rotation.x = sw; s.legR.rotation.x = -sw; s.upper.rotation.x = s.K.lean;
    if (!s.K.crawl) s.armL.rotation.x = s.armR.rotation.x = -1.35;
    s.g.position.set(s.pos.x, 0, s.pos.z); s.g.rotation.y = s.h;
  }
}
function dropRemoteMinions(a) { (a.mnP || []).forEach(s => { scene.remove(s.g); freeZombie(s); if (s.tag) s.tag.remove(); }); a.mnP = []; }
