// ================= MELEE =================
// Melee weapons sit in the gun slots and fight like Darktide: LMB tap = a chain of light swings, LMB held = a charged heavy,
// RMB = block (costs stamina), RMB + LMB = push. A swing cleaves through everything along its arc, the first one hardest;
// heavies stagger. The chainsaw's heavy saws for as long as you hold it and burns fuel (reloaded like a flamethrower).
const isMelee = w => !!(w && w.base.melee);
const MEL = { ph: 'idle', t: 0, combo: 0, pat: null, heavy: false, hit: false, charge: 0, stam: 4, stamT: 0, block: false, hs: 0, sawT: 0, idleT: 0, fury: 0, furyT: 0, press: false };
const MEL_STAM = () => 4 + (hasPassive('barbarian') ? 1 : 0) + rk('b_stam'); // block / push stamina pips
// poses of the viewmodel [x, y, z, rx, ry, rz]: where a swing starts (a) and ends (b); dir = which way it sweeps (for the cleave order)
const MEL_UP = { // held upright: knife, axe, sledgehammer
  rest: [0.3, -0.4, -0.58, -0.18, -0.08, -0.32], block: [0.02, -0.32, -0.54, 0.06, 0, -1.45], push: [0.02, -0.24, -0.92, 0.04, 0, -1.4],
  rl: { a: [0.5, -0.12, -0.48, 0.2, -0.75, -1.05], b: [-0.34, -0.4, -0.71, -0.35, 0.95, 1.05], dir: -1, arc: 110 },
  lr: { a: [-0.26, -0.12, -0.48, 0.2, 0.75, 1.05], b: [0.5, -0.42, -0.71, -0.35, -0.95, -1.05], dir: 1, arc: 110 },
  ov: { a: [0.14, 0.1, -0.44, 1.25, 0, -0.15], b: [0.04, -0.56, -0.84, -1.3, 0, -0.15], dir: 0, arc: 55 },
  stab: { a: [0.2, -0.26, -0.33, -1.45, 0, -0.1], b: [0.06, -0.2, -1.09, -1.55, 0, -0.1], dir: 0, arc: 40 },
};
const MEL_FWD = { // held forward like a gun: the chainsaw
  rest: [0.26, -0.28, -0.52, -0.08, 0.5, 0.08], block: [0.04, -0.28, -0.58, 0.1, 0, -0.9], push: [0.04, -0.26, -0.92, 0.05, 0, -0.8],
  rl: { a: [0.46, -0.26, -0.56, 0, 0.75, 0.15], b: [-0.3, -0.36, -0.69, 0, -0.75, -0.15], dir: -1, arc: 100 },
  lr: { a: [-0.26, -0.26, -0.56, 0, -0.75, -0.15], b: [0.46, -0.36, -0.69, 0, 0.75, 0.15], dir: 1, arc: 100 },
  saw: { a: [0.24, -0.27, -0.5, -0.08, 0.45, 0.08], b: [0.2, -0.25, -0.66, -0.1, 0.4, 0.06], dir: 0, arc: 70 },
};
const melPoses = w => w.base.melee.hold === 'fwd' ? MEL_FWD : MEL_UP;
const melLerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const easeIn = k => k * k, easeOut = k => 1 - (1 - k) * (1 - k);
function melSpeed(w) { return (player.stormT > 0 ? 1.25 : 1) * (player.rageT > 0 ? 1.3 : 1) * (1 + .06 * rk('b_swift')) * (1 + .15 * (w.unique === 'headsman' ? MEL.fury : 0)) * (typeof rateMul === 'function' ? rateMul(w) : 1); }
function melReset() { Object.assign(MEL, { ph: 'idle', t: 0, combo: 0, pat: null, heavy: false, hit: false, charge: 0, block: false, hs: 0, press: false }); }

// ---------- the frame ----------
function updateMelee(dt, w, busy) {
  const M = w.base.melee, P = melPoses(w), dur = 60 / w.rpm / melSpeed(w);
  if (MEL.furyT > 0 && (MEL.furyT -= dt) <= 0) MEL.fury = 0;
  if (MEL.hs > 0) { MEL.hs -= dt; return; } // hit-stop: the blade bites for a moment
  MEL.stamT -= dt; if (!MEL.block && MEL.stamT <= 0) MEL.stam = Math.min(MEL_STAM(), MEL.stam + dt * .9);
  const pressed = clickQueued > 0; // a fresh click this frame (or just now)
  if (busy) { if (MEL.ph !== 'idle') melReset(); return; }
  MEL.block = rmb && (MEL.ph === 'idle' || MEL.ph === 'rec') && MEL.stam > 0 && !player.sprint;
  if (rmb && pressed && (MEL.ph === 'idle' || MEL.ph === 'rec')) { clickQueued = 0; return melPush(w); }
  if (MEL.block) { MEL.ph = 'idle'; return; }
  switch (MEL.ph) {
    case 'idle':
      if ((MEL.idleT += dt) > .8) MEL.combo = 0;
      if (pressed || mouseDown && !MEL.press) { clickQueued = 0; melWind(w); }
      break;
    case 'wind': { // winding up: let go early = a light swing, keep holding = it becomes a heavy
      MEL.t += dt; const windT = Math.max(.08, dur * .22);
      if (mouseDown && MEL.t > .24) { MEL.ph = 'charge'; MEL.heavy = true; MEL.pat = P[M.heavyPat]; MEL.charge = 0; MEL.t = 0; SND.swing(1, true); }
      else if (!mouseDown && MEL.t >= windT) melStrike(w, false);
      break; }
    case 'charge':
      MEL.charge = Math.min(1, MEL.charge + dt / (.55 / melSpeed(w)));
      if (M.saw && MEL.charge >= .35) { if (w.ammo > 0) { MEL.ph = 'saw'; MEL.t = 0; MEL.sawT = 0; } else if (!mouseDown) melStrike(w, true); else if (now - (MEL.dryT || -9) > 1.5) { MEL.dryT = now; SND.dry(); popText('Nincs üzemanyag! [R] Újratöltés', '#ff8a70'); } break; }
      if (!mouseDown) melStrike(w, true);
      break;
    case 'saw': // the chainsaw's heavy: it eats through whatever is in front for as long as you hold it and have fuel
      MEL.t += dt; MEL.sawT -= dt; w.ammo = Math.max(0, w.ammo - dt * 12);
      if ((MEL.sndT = (MEL.sndT || 0) - dt) <= 0) { MEL.sndT = .1; SND.saw(1); }
      if (MEL.sawT <= 0) { MEL.sawT = .09; melHit(w, P.saw, { mul: .38, cleave: 6, reach: 2.3, stag: .25, saw: true }); }
      if (!mouseDown || w.ammo <= 0) { MEL.ph = 'rec'; MEL.t = 0; MEL.recT = .3; MEL.from = P.saw.b; }
      break;
    case 'strike': {
      const T = MEL.strikeT; MEL.t += dt;
      if (!MEL.hit && MEL.t >= T * .5) { MEL.hit = true; melSwingHit(w); } // the blade is at the middle of its arc: that's where it connects
      if (MEL.t >= T + .06) { MEL.ph = 'rec'; MEL.t = 0; MEL.recT = dur * (MEL.heavy ? .5 : .38); MEL.from = MEL.pat.b; } // a beat of follow-through at the end
      break; }
    case 'rec': // recovering: a click from a third of the way in chains the next swing
      MEL.t += dt;
      if (MEL.t > MEL.recT * .3 && (pressed || mouseDown && !MEL.press)) { clickQueued = 0; melWind(w); break; }
      if (MEL.t >= MEL.recT) { MEL.ph = 'idle'; MEL.idleT = 0; }
      break;
    case 'push':
      MEL.t += dt; if (!MEL.hit && MEL.t > .12) { MEL.hit = true; melPushHit(w); }
      if (MEL.t >= .42) { MEL.ph = 'idle'; MEL.idleT = 0; }
      break;
  }
  MEL.press = mouseDown;
}
function melWind(w) {
  const M = w.base.melee, chain = M.light; MEL.pat = melPoses(w)[chain[MEL.combo % chain.length]]; MEL.combo++;
  MEL.rush = player.sprint && rk('b_charge') > 0; // Roham: a swing out of a sprint
  Object.assign(MEL, { ph: 'wind', t: 0, heavy: false, hit: false, charge: 0, idleT: 0, from: null }); player.sprint = false;
}
function melStrike(w, heavy) {
  const dur = 60 / w.rpm / melSpeed(w);
  Object.assign(MEL, { ph: 'strike', t: 0, hit: false, heavy, strikeT: Math.max(.12, dur * (heavy ? .4 : .32)) });
  if (!heavy) MEL.pat = MEL.pat || melPoses(w)[w.base.melee.light[0]];
  SND.swing(heavy ? 1 : 0); player.buf = player.buf || {};
}
function melSwingHit(w) {
  const M = w.base.melee, H = MEL.heavy, c = .6 + .4 * MEL.charge, ch = MEL.rush ? 1.5 : 1, cl = rk('b_cleave'); MEL.rush = false;
  const pat = H && rk('b_whirl') ? Object.assign({}, MEL.pat, { arc: 360, dir: 0 }) : MEL.pat; // Forgószél
  melHit(w, pat, H ? { mul: M.heavy * c * (1 + .15 * rk('b_heavy')) * ch, cleave: M.heavyCleave + cl + (rk('b_whirl') ? 4 : 0), reach: M.reach * 1.12, stag: M.stagger * 1.6 + (ch > 1 ? 1 : 0), heavy: true }
    : { mul: ch, cleave: M.cleave + cl, reach: M.reach, stag: M.stagger + (ch > 1 ? 1 : 0) });
}
// who a swing reaches: in front, within its arc, sorted the way the blade travels; the first takes it all, the rest a falling share
function melTargets(reach, arc, dir) {
  const y = player.yaw, cy = Math.cos(y), sy = Math.sin(y), out = [];
  for (const z of zombies) {
    if (z.dead || z.rise > .3) continue;
    const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z, d = Math.hypot(dx, dz) - .35 * (z.scale || 1);
    if (d > reach || Math.abs((z.pos.y || 0) - player.pos.y) > 2.2) continue;
    const a = Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy) * 180 / Math.PI; // left < 0 < right
    if (Math.abs(a) > arc / 2 + (d < .7 ? 40 : 0)) continue;
    out.push({ z, a, d });
  }
  return out.sort((p, q) => dir > 0 ? p.a - q.a : dir < 0 ? q.a - p.a : p.d - q.d);
}
const _mDir = new V3();
function melAimHead(z) { // the crosshair on its head
  camera.getWorldDirection(_mDir); const h = zHeadPos(z), o = camera.position, vx = h.x - o.x, vy = h.y - o.y, vz = h.z - o.z, t = vx * _mDir.x + vy * _mDir.y + vz * _mDir.z;
  if (t <= 0) return false; const mx = vx - _mDir.x * t, my = vy - _mDir.y * t, mz = vz - _mDir.z * t; return mx * mx + my * my + mz * mz < .32 * .32 * (z.scale || 1);
}
function melHit(w, pat, o) {
  const T = melTargets(o.reach, pat.arc, pat.dir).slice(0, o.cleave); if (!T.length) { if (!o.saw) SND.swing(0, false, true); return; }
  const blunt = w.base.melee.blunt, fuelOut = w.base.melee.saw && w.ammo <= 0;
  T.forEach((t, k) => {
    const z = t.z, head = melAimHead(z) || (k === 0 && pat === melPoses(w).ov && player.pitch > -.05), crit = Math.random() < critChance();
    let amt = w.dmg * SK.dmg(w) * o.mul * Math.max(.4, 1 - .2 * k) * (fuelOut ? .45 : 1);
    if (head) amt *= (w.base.headMult || 1.5) * headBonus(); if (crit) amt *= critMult();
    if (head && rk('b_exec') && z.hp < z.maxHp * .2) amt = Math.max(amt, z.hp + 1); // Lefejezés
    const hp0 = z.hp; hurtZombie(z, amt, { melee: true, w, head, crit, stag: o.stag * (k ? .7 : 1), from: player.pos, color: head ? null : '#ece6d4' });
    burst(zHeadPos(z).setY(head ? zHeadPos(z).y : 1.2 * (z.scale || 1)), 0x6a0a0a, o.saw ? 3 : 7, 3, .5);
    if (z.dead && w.unique === 'headsman') { MEL.fury = Math.min(5, MEL.fury + 1); MEL.furyT = 3; player.hp = Math.min(maxHp(), player.hp + maxHp() * .03); }
    if (k === 0) hitmarker(z.dead);
    if (hp0 > 0 && z.dead && !o.saw) player.shake = Math.max(player.shake, .06);
  });
  if (player.rageT > 0) player.hp = Math.min(maxHp(), player.hp + maxHp() * (o.saw ? .004 : .02)); // Vérfürdő: every blow that lands heals
  if (o.saw) SND.sawHit(); else { blunt ? SND.blunt() : SND.chop(); MEL.hs = o.heavy ? .09 : .045; player.shake = Math.max(player.shake, o.heavy ? .12 : .05); vm.kick = o.heavy ? .05 : .025; }
  if (o.heavy && w.unique === 'thunder') thunderClap(w, T[0].z.pos);
}
function thunderClap(w, at) { // Mennydörgés: the heavy blow rings out, and everything around it takes a jolt
  burst(new V3(at.x, .4, at.z), 0x8fd8ff, 26, 6, .7); SND.zap && SND.zap();
  for (const z of zombies) if (!z.dead && Math.hypot(z.pos.x - at.x, z.pos.z - at.z) < 5) hurtZombie(z, w.dmg * SK.dmg(w) * .7, { melee: true, w, stag: 1.2, from: at, color: '#8fd8ff' });
}
function melPush(w) {
  if (MEL.stam < 1) { SND.dry(); return; }
  MEL.stam -= 1; MEL.stamT = 1; Object.assign(MEL, { ph: 'push', t: 0, hit: false, block: false }); SND.push();
}
function melPushHit(w) { // a shove: everything close in front staggers back, nobody is hurt much
  const sh = rk('b_push'); // Vállas lökés: it hurts, and it throws further
  for (const t of melTargets(2.6, 120, 0).slice(0, 6)) { const z = t.z; hurtZombie(z, Math.max(1, w.dmg * (sh ? .5 * SK.dmg(w) : .08)), { melee: true, w, stag: sh ? 2.6 : 1.3, from: player.pos, color: '#cfcabd' }); }
  player.shake = Math.max(player.shake, .06);
}
// the zombie reels: its swing is broken off, it slows, and a hard blow knocks it back a step
function staggerZ(z, s, from) {
  if (z.dead || !(s > 0)) return; if (z.K && z.K.boss) s *= .25;
  z.windup = 0; z.atkCd = Math.max(z.atkCd || 0, .5 + .6 * s); z.slowT = Math.max(z.slowT || 0, .4 + .6 * s); z.flinch = .3;
  if (from && s >= 1) { const d = new V3(z.pos.x - from.x, 0, z.pos.z - from.z); if (d.lengthSq() > .001) { z.pos.add(d.setLength(.45 * Math.min(2, s))); collide(z.pos, .5); } }
}
// a blocked blow: only from the front, costs stamina (more for hard hits), and the attacker is thrown off a little
function melBlocked(d, from) {
  const w = curW(); if (!MEL.block || !isMelee(w) || MEL.stam <= 0) return d;
  const src = from || zombies.reduce((b, z) => { if (z.dead) return b; const q = Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z); return q < 4 && (!b || q < b.q) ? { q, pos: z.pos, z } : b; }, null);
  const p = src && (src.pos || src); if (!p) return d;
  const dx = p.x - player.pos.x, dz = p.z - player.pos.z, ahead = (-dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw)) / (Math.hypot(dx, dz) || 1);
  if (ahead < .35) return d;
  const free = player.rageT > 0 || now < (player.ironT || 0) || Math.random() < .3 * rk('b_guard'); // Vérfürdő / Tökéletes hárítás: no stamina
  if (!free) MEL.stam = Math.max(0, MEL.stam - clamp(d / 30, .5, 2)); MEL.stamT = 1; SND.block(); vm.kick = .04;
  if (src && src.z) { src.z.atkCd = Math.max(src.z.atkCd, .9); src.z.windup = 0; if (free && rk('b_guard')) staggerZ(src.z, 1.2, player.pos); }
  if (src && src.z && exoOn('gladiator')) hurtZombie(src.z, Math.max(d * 4, zombieHp() * .35), { melee: true, w, stag: 1.4, from: player.pos, color: '#ff9a6a' }); // Gladiátor-karvédő: the block hits back
  if (player.rageT > 0 && augOn('avatar')) return 0; // Élő bástya: the block takes it all
  if (MEL.stam <= 0) { popText('Kitartás elfogyott!', '#ff8a70'); MEL.block = false; }
  return d * .12;
}
// the viewmodel pose for this frame (updateVM blends it); null = not a melee weapon
function meleePose(w) {
  const P = melPoses(w), R = P.rest, k = MEL.t;
  if (player.sprint && MEL.ph === 'idle') return [R[0] - .04, R[1] - .06, R[2], R[3] - .25, R[4] + .5, R[5]];
  if (MEL.block) return P.block;
  switch (MEL.ph) {
    case 'wind': return melLerp(R, MEL.pat.a, easeOut(clamp(k / .12, 0, 1)));
    case 'charge': { const a = MEL.pat.a, j = MEL.charge >= 1 ? Math.sin(now * 50) * .004 : 0; return melLerp(a, [a[0] + .06, a[1] + .08 + j, a[2] + .14, a[3] + .25, a[4] - .1, a[5] - .1], MEL.charge); }
    case 'saw': { const b = P.saw.b, j = Math.sin(now * 70) * .006; return [b[0] + j, b[1] + j, b[2], b[3], b[4], b[5]]; }
    case 'strike': return melLerp(MEL.pat.a, MEL.pat.b, smooth(clamp(k / MEL.strikeT, 0, 1))); // speeds up into the target, slows through it
    case 'rec': return melLerp(MEL.from || R, R, easeOut(clamp(k / MEL.recT, 0, 1)));
    case 'push': return melLerp(R, P.push, Math.sin(clamp(k / .42, 0, 1) * Math.PI));
  }
  return R;
}
// the stamina pips under the crosshair while you block or push
function updateMeleeHud() {
  const el = $('melstam'); if (!el) return; const w = curW(), on = state === 'playing' && isMelee(w) && (MEL.block || MEL.stam < MEL_STAM() - .01);
  el.hidden = !on; if (!on) return;
  const n = MEL_STAM(); el.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--f:${clamp(MEL.stam - i, 0, 1)}"></i>`).join('');
}
