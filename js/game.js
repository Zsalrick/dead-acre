// ================= JOB FLOW =================
// a job: the van drops you off → waves with short lulls until the clock runs out → the van comes back somewhere else → results.
// `round` is the threat level: it drives zombie health, which kinds can appear and weapon drop levels.
let state = 'menu', round = 1, mission = null, spawnT = 0;
const WAVE_T = 55, LULL_T = 15, INTRO_T = 5, ARRIVE_T = 4.5;
const liveWorld = () => state === 'playing' || netLive(); // in a party the world keeps going while your menu is open
const alive = () => zombies.reduce((n, z) => n + (z.dead ? 0 : 1), 0);
// the cap ramps up inside each wave so waves build instead of starting at full pressure
const aliveCap = () => {
  const M = mission, ramp = (M && M.phase === 'wave' && !noClock(M.job) ? .6 + .4 * clamp((WAVE_T - M.phaseT) / 40, 0, 1) : 1) * (M && M.job.type === 'exterminate' ? 1.3 : 1);
  const party = NET.mode === 'host' ? 1 + .35 * (partySize() - 1) : 1;
  return Math.min(36 + 8 * (party > 1 ? partySize() - 1 : 0), Math.round(Math.min(20, 6 + round) * (M && M.phase === 'evac' ? 1.3 : 1) * roundMod.spawns * ramp * party));
};
const EVAC_WARN = 40, BOARD_T = 6;

// opts (party jobs): seed and van spots come from the host so everyone gets the same layout; client: the host runs the world
function startJob(job, opts = {}) {
  if (noClock(job)) job.dur = 1e6; // no clock: the job ends when the goal is met
  mission = { job, t: 0, phase: 'wave', phaseT: noClock(job) ? 1e9 : WAVE_T, wave: 1, brought: [], gear: [], bossDone: !job.boss || !!opts.client, leaving: 0, intro: 0, departT: -1, arriveT: -1 };
  const seed = opts.seed || 1 + Math.floor(Math.random() * 1e9);
  loadMap(job.map, seed);
  applyMod(job.mod);
  clearZombieStuff();
  while (drops.length) removeDrop(drops[0]);
  powerUps.forEach(p => scene.remove(p.s)); powerUps.length = 0;
  projs.forEach(p => scene.remove(p.m)); projs.length = 0; fireZones.length = 0;
  itemDrops.forEach(d => scene.remove(d.s)); itemDrops.length = 0; clearGearDrops();
  const P = profile;
  Object.assign(player, { points: 500, earned: 0, kills: 0, heads: 0, cur: 0, ads: 0, bloom: 0, recoil: 0, reloadT: 0, reloading: false, spin: 0,
    ffyl: 0, shotsN: 0, hitsN: 0, dmgDone: 0, stepD: 0, fireCd: 0, burstLeft: 0, switchT: 0, knifeT: 0, knifeCd: 0, best: null, yaw: 0, pitch: 0, vy: 0, lastHurt: -99,
    inv: P.inv, up: P.up, stam: maxStam(), stamT: 0, adrenT: 0, itemCd: 0, perks: {}, buf: {}, uHeat: 0, uStack: 0 });
  player.hp = maxHp(); player.shield = maxShield(); endFFYLView();
  resetSkillsRun();
  const extraGren = (isCls('engineer') ? 1 : 0) + rk('e_belt');
  P.inv.gren = Math.min(itemMax('gren') + (isCls('engineer') ? 1 : 0), P.inv.gren + extraGren);
  if (rk('m_plenty')) P.inv.med = itemMax('med');
  // the loadout comes along, topped up; `owned` marks what goes home even if the job fails
  const own = o => { const w = unpackW(o); if (w) { w.owned = true; w.ammo = w.mag; w.reserve = resMax(w); } return w; };
  player.slots = P.loadout.map(own); player.bag = (P.bag || []).map(own);
  if (!player.slots[0] && !player.slots[1] && player.bag.length) player.slots[0] = player.bag.shift();
  if (!player.slots[0]) { player.slots[0] = player.slots[1]; player.slots[1] = null; }
  [...player.slots, ...player.bag].forEach(w => w && trackBest(w));
  mission.brought = [...player.slots.filter(Boolean), ...player.bag];
  // the van drops you at one spot and picks you up at another
  const n = MAP.vans.length; let a = Math.floor(Math.random() * n), b = Math.floor(Math.random() * (n - 1)); if (b >= a) b++;
  if (opts.client) { a = clamp(opts.a, 0, n - 1); b = clamp(opts.b, 0, n - 1); }
  mission.pickup = b; placeVan(a, false);
  setupObjective(mission);
  player.pos.set(truck.pos.x, 0, truck.pos.z - Math.sign(truck.pos.z || 1) * 2.8); player.vel.set(0, 0, 0);
  if (job.test) { player.points = 0; if (!opts.client) setupTestGround(mission); }
  player.yaw = Math.atan2(player.pos.x, player.pos.z); player.pitch = 0;
  powers.insta = powers.double = 0;
  vm.blend = null; if (vm.gun) { vmRoot.remove(vm.gun); vm.gun = null; } renderSlots(); renderInv();
  round = START_THREAT[job.diff - 1]; spawnT = 0;
  $('round').textContent = round;
  truck.beacon.visible = truck.beam.visible = false;
  ['hub', 'menu', 'results'].forEach(id => $(id).hidden = true);
  $('introT').textContent = job.title.toUpperCase(); $('introS').textContent = job.test ? 'Célbábuk, végtelen lőszer · cserélj fegyvert a társaiddal · Esc: vissza' : `${MAPS[job.map].name} · ${fmtTime(job.dur)} túlélés`;
  $('introS2').innerHTML = `${'★'.repeat(job.diff)}${'☆'.repeat(5 - job.diff)} · ${DIFF_NAMES[job.diff - 1]}${job.mod ? ` · ${MODS[job.mod].label}` : ''}${job.boss ? ' · A Mészáros is eljön' : ''}`;
  $('intro').hidden = false; $('hud').hidden = true;
  state = 'intro'; initAudio(); lockPointer();
  nz(3.2, 180, .35, 'lowpass', .6);
  netJobStarted({ seed, a, b, client: !!opts.client });
}
// cinematic: the van backs in, then the camera drops to your eyes beside it
function updateIntro(dt) {
  const M = mission, t = M.intro += dt, d = truck.dir, sd = -Math.sign(truck.pos.z || 1);
  setVanAt(30 * Math.pow(1 - clamp(t / 3, 0, 1), 2));
  const cine = new V3(truck.pos.x - d * 9, 3.2, truck.pos.z + sd * 4.5), eye = new V3(player.pos.x, 1.65, player.pos.z);
  const u = smooth(clamp((t - 3.3) / 1.4, 0, 1));
  camera.position.lerpVectors(cine, eye, u);
  const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cine, truck.g.position.clone().setY(1.2), new V3(0, 1, 0)));
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, player.yaw, 0, 'YXZ'));
  camera.quaternion.copy(q0).slerp(q1, u);
  camera.fov = SET.fov; camera.updateProjectionMatrix();
  $('flash').style.background = '#000'; $('flash').style.opacity = clamp(1 - t / 1.2, 0, 1);
  $('intro').style.opacity = clamp(Math.min(t / .8, (INTRO_T - t) / .6), 0, 1);
  if (t >= INTRO_T) endIntro();
}
function endIntro() {
  const M = mission;
  M.intro = -1; M.departT = 0; state = 'playing';
  $('intro').hidden = true; $('hud').hidden = false; $('flash').style.opacity = 0; $('flash').style.background = '';
  equipView(); player.switchT = SWITCH_T * .5;
  if (M.job.test) banner('LŐTÉR', 'Célbábuk előtted. Esc: leltár és vissza a bázisra.'); else { banner('1. HULLÁM', noClock(M.job) ? 'Jönnek. A furgon akkor jön, ha kész a feladat.' : 'Jönnek. A furgon az idő lejártakor jön vissza érted.'); SND.roundStart(); }
  if (!locked && !noLock) { needClick = true; $('clickHint').hidden = false; } // one click grabs the mouse
}
function updateMission(dt) {
  const M = mission; if (!M) return;
  if (M.dead) return finishJob(false);
  if (NET.mode && netAllDown()) { banner('A CSAPAT ELESETT', 'Senki nem maradt talpon.'); return finishJob(false); }
  if (M.job.test) return updateTestGround(M, dt);
  if (M.leaving) { // driving off
    M.leaving += dt;
    truck.g.position.x += truck.dir * dt * (4 + M.leaving * 6);
    $('flash').style.background = '#000'; $('flash').style.opacity = clamp((M.leaving - .8) / 1.4, 0, 1);
    if (M.leaving > 2.4) finishJob(netExtractOk());
    return;
  }
  if (M.departT >= 0) { // the van leaves after dropping you off
    M.departT += dt; setVanAt(M.departT * M.departT * 2.5);
    if (!truck.g.visible && M.departT > 1) M.departT = -1;
  }
  if (M.arriveT >= 0) { // ...and backs in at the pickup spot when time is up
    M.arriveT += dt; setVanAt(30 * Math.pow(1 - clamp(M.arriveT / ARRIVE_T, 0, 1), 2));
    if (M.arriveT >= ARRIVE_T) { M.arriveT = -1; setVanAt(0); popText('A furgon megérkezett · [E] beszállás', '#7dff7a'); SND.power(); }
  }
  if (M.boardT > 0) { // loading up: stay by the van until it is done
    const far = netNearestToVan() > 8; // pushed away: the countdown pauses, it doesn't reset
    if (far) { if (!M.boardWarn) { M.boardWarn = true; popText('Vissza a furgonhoz!', '#ff8a70'); } }
    else if (M.boardWarn = false, (M.boardT -= dt) <= 0) { M.boardT = 0; M.boarded = true; return extract(); }
  }
  if (M.phase === 'evac' && truck.parked && !(M.boardT > 0) && (M.parkT = (M.parkT || 0) + dt) > 45) { // the driver won't wait forever
    banner('A FURGON ELMENT', 'Nem szálltál be időben.'); return finishJob(false);
  }
  M.t += dt;
  const left = M.job.dur - M.t;
  if (updateObjective(M, dt) === 'fail') return finishJob(false);
  if (noClock(M.job) && !objDone(M)) { // objective jobs: no clock, the pressure rises every minute
    if (M.job.bounty && !M.bountyBoss && M.t > 4) M.bountyBoss = spawnBounty(M.job.bounty);
    if ((M.huntT = (M.huntT || 0) + dt) > 60) { M.huntT = 0; round++; $('round').textContent = round; M.rt = (M.rt || 0) + 1; if (NET.mode && (player.down || player.ffyl > 0)) netRevive(); } // no waves here: the downed get up every minute
  }
  if (!M.evacWarn && left <= EVAC_WARN) { // the pickup spot is known 40 s early: the last wave becomes a run across the map
    M.evacWarn = true; M.departT = -1; placeVan(M.pickup, false);
    if (NET.mode && (player.down || player.ffyl > 0)) netRevive(); // everyone gets a last chance to make it to the van
    truck.beacon.visible = truck.beam.visible = true;
    banner('A FURGON ÚTON VAN', `${EVAC_WARN} mp múlva ér a zöld jelzéshez. Indulj!`); SND.roundEnd();
    if (!M.bossDone) { // the Butcher comes from 30-45 m off the van, to cut off your run rather than camp the door
      M.bossDone = true; const vd = s => Math.abs(Math.hypot(s[0] - truck.pos.x, s[1] - truck.pos.z) - 37);
      const [sx, sz] = activeSpawns().reduce((b, s) => vd(s) < vd(b) ? s : b); spawnZombieAt('butcher', sx, sz); banner('A MÉSZÁROS', 'Az utadat állja a furgon felé.'); SND.roar();
    }
  }
  if (M.phase === 'lull' && !M.cleared) { // the break starts once the stragglers are dead (or after 20 s anyway)
    M.lullWait += dt;
    if (alive() <= 2 || M.lullWait > 12) { M.cleared = true; if (alive() <= 2) { addPoints(250); banner('HULLÁM LETISZTÍTVA', `+250 pont · ${LULL_T} mp pihenő`); } }
  }
  if (M.phase !== 'evac' && (M.phase !== 'lull' || M.cleared)) {
    M.phaseT -= dt;
    if (left <= 0) {
      M.phase = 'evac'; M.departT = -1;
      placeVan(M.pickup, false); M.arriveT = 0; nz(ARRIVE_T, 180, .3, 'lowpass', .6);
      truck.beacon.visible = truck.beam.visible = true;
      banner('IDŐ LEJÁRT', `Itt a furgon! [E], aztán tarts ki ${BOARD_T} mp-ig mellette.`); SND.roundEnd();
    } else if (M.phaseT <= 0) {
      if (M.phase === 'wave') { M.phase = 'lull'; M.phaseT = LULL_T; M.lullWait = 0; M.cleared = false; banner('A HULLÁM VÉGE', 'Öld meg a maradékot, aztán pihenhetsz.'); SND.roundEnd(); }
      else {
        M.phase = 'wave'; M.phaseT = WAVE_T; M.wave++;
        if (NET.mode && (player.down || player.ffyl > 0)) netRevive();
        if (M.wave > 1) round++;
        $('round').textContent = round;
        const r = $('round'); r.classList.remove('pulse'); void r.offsetWidth; r.classList.add('pulse');
        banner(`${M.wave}. HULLÁM`, M.wave === 1 ? 'Jönnek.' : `A veszély ${round}. szintre nőtt.`); SND.roundStart();
      }
    }
  }
  if (M.phase === 'wave' || M.phase === 'evac') {
    spawnT -= dt;
    if (spawnT <= 0 && alive() < aliveCap() && !(M.phase === 'wave' && M.phaseT < 8) && !(M.boardT > 0)) { spawnZombie(); spawnT = Math.max(.5, 1.6 - round * .08) * rand(.6, 1.2) / (M.phase === 'evac' ? 1.5 : 1); }
  }
  if ((!M.job.type || M.job.type === 'survive') && !M.evented && M.t > M.job.dur * .45 && M.phase !== 'evac') midEvent(M);
  stats.bestThreat = Math.max(stats.bestThreat, round);
}
function extract() {
  if (!mission || mission.phase !== 'evac' || mission.leaving) return;
  if (NET.client) { if (!(mission.boardT > 0)) { netAct('board'); banner('BESZÁLLÁS', `Tartsatok ki ${BOARD_T} mp-ig a furgon mellett!`); } return; }
  if (NET.mode && mission.boarded && !netExtractOk()) banner('LEMARADTÁL', 'A furgon nélküled ment el.');
  if (!mission.boarded) { // first press: start loading
    if (!(mission.boardT > 0)) { mission.boardT = BOARD_T; banner('BESZÁLLÁS', `Tarts ki ${BOARD_T} mp-ig a furgon mellett!`); SND.buy(); }
    if (mission.boardT > 0) return;
  }
  mission.leaving = .001;
  player.vel.set(0, 0, 0);
  SND.roar(); nz(2.2, 300, .4, 'lowpass', .6);
  banner('INDULÁS', 'Munka kész.');
}
// only the two guns in your hands go home. Anything dropped on the map stays there, even your own.
// On a failed job, guns found during the job are lost too; what you brought and still hold comes back.
function settleWeapons(success, M) {
  const carried = [...player.slots.filter(Boolean), ...player.bag];
  let keep = success ? carried : carried.filter(w => w.owned);
  const lost = [...carried.filter(w => !keep.includes(w)), ...M.brought.filter(w => !carried.includes(w) && !(M.destroyed || []).includes(w))];
  const P = profile, junkQ = P.junkQ == null ? -1 : P.junkQ, junk = success ? keep.filter(w => !w.owned && !w.unique && w.q <= junkQ) : [];
  const junkParts = junk.reduce((a, w) => a + PARTS[w.q], 0); P.parts = (P.parts || 0) + junkParts; // auto-salvage: marked-as-junk rarities turn into parts at home
  keep = keep.filter(w => !junk.includes(w));
  const newOnes = keep.filter(w => !w.owned);
  const hands = player.slots.map(w => w && keep.includes(w) ? w : null), bag = player.bag.filter(w => keep.includes(w));
  if (!hands[0] && !hands[1] && bag.length) hands[0] = bag.shift();
  P.loadout = hands.map(w => packW(w || null)); P.bag = bag.map(packW);
  if (!P.loadout[0] && !P.loadout[1]) P.loadout[0] = packW(makeWeapon(BASES[0], 0, 1)); // never leave the player unarmed
  newOnes.forEach(noteFound);
  // armor: pieces found on the job (it.found) only come home if you extract, even if you put them on;
  // your own pieces you took off in the field always come back (and are worn again if the found one is lost)
  let overflow = 0; const home = [], lostGear = [];
  const toStash = it => { if (P.gearStash.length < gearMax()) P.gearStash.push(it); else { P.cash += gearValue(it); overflow++; } };
  for (const k of GEAR_KEYS) { const it = P.gear[k]; if (it && it.found) { if (success) { delete it.found; home.push(it); } else { P.gear[k] = null; lostGear.push(it); } } }
  for (const it of M.gear) {
    if (it.found) { if (!success) { lostGear.push(it); continue; } delete it.found; home.push(it); }
    if (!success && !P.gear[it.slot]) P.gear[it.slot] = it; else toStash(it);
  }
  gearChanged();
  return { junkN: junk.length, junkParts, kept: newOnes, lost, overflow, gear: success ? home : lostGear };
}
function finishJob(success, abandoned) {
  const M = mission, J = M.job, P = profile, party = Math.max(M.partyMax || 1, NET.mode ? partySize() : 1);
  if (J.test) return leaveTest(M);
  const board = NET.mode || M.board ? [{ n: myName(), k: player.kills, r: NET.revs || 0, me: true }, ...(NET.avatars.size ? [...NET.avatars.values()].map(a => ({ n: a.name, k: a.kc || 0, r: a.rvc || 0 })) : M.board || [])] : null;
  mission = null; state = 'results';
  netJobEnded();
  $('flash').style.opacity = 0; $('flash').style.background = '';
  truck.beacon.visible = truck.beam.visible = false; $('evacMark').hidden = true; $('intro').hidden = true;
  clearGearDrops(); clearFx(); if (M.esc) scene.remove(M.esc.a.g); if (M.cache && M.cache.g) scene.remove(M.cache.g);
  const w = settleWeapons(success, M);
  // dying after the clock ran out (during evac) still pays a quarter of the fee
  const cash = success ? Math.round((J.reward + Math.floor(player.earned * .07)) * SK.cash() * (1 + .1 * (party - 1))) : !abandoned ? Math.round(J.reward * (M.phase === 'evac' ? .25 : .1)) : 0; // falling short still pays a little
  const xp = Math.round((success ? J.xp + player.kills * 2 : Math.floor(player.kills)) * (1 + .1 * (party - 1)) * (success && stats.jobs < 5 ? 2 : 1) * (J.map === featuredMap() ? 1.25 : 1)); // the first five jobs: double XP; the featured map +25%
  P.cash += cash; stats.cash += cash;
  const parts = success ? M.parts || 0 : 0; P.parts = (P.parts || 0) + parts;
  let tierBonus = null; // clearing Rémálom always pays a legendary, sometimes a unique; the very first job a rare gun
  if (success && stats.jobs === 0 && !J.test) { tierBonus = makeWeapon(pick(BASES), 2, Math.max(1, P.level)); if (P.stash.length < stashMax()) P.stash.push(packW(tierBonus)); else P.cash += sellValue(tierBonus); noteFound(tierBonus); }
  if (success && J.tier) P.parts = (P.parts || 0) + 10 + 5 * J.tier; // Rémálom pays parts too
  if (success && J.tier) { tierBonus = Math.random() < .3 ? makeUnique(null, J.lvl) : makeWeapon(pick(BASES), 4, J.lvl); if (P.stash.length < stashMax()) P.stash.push(packW(tierBonus)); else P.cash += sellValue(tierBonus); noteFound(tierBonus); }
  const levelUps = addXp(xp);
  const tokens = (success ? (J.diff >= 3 ? 1 : 0) + (J.diff >= 5 ? 1 : 0) + (J.boss ? 1 : 0) + (J.bounty ? 2 : 0) + (J.type && J.type !== 'survive' ? 1 : 0) : 0) + levelUps;
  if (success && J.bounty) stats.bounties = (stats.bounties || 0) + 1;
  if (success && J.tier > (P.tier || 0)) P.tier = J.tier; // next nightmare tier unlocked
  P.tokens = (P.tokens || 0) + tokens;
  P.inv = player.inv;
  const bm = stats.byMap[J.map] || (stats.byMap[J.map] = { done: 0, fail: 0 });
  if (success) { stats.jobs++; bm.done++; if (J.diff >= 4 && !J.test) stats.hard = (stats.hard || 0) + 1; } else { stats.fails++; bm.fail++; }
  rollBoard(); rollShop(); saveProfile();
  clearZombieStuff();
  NET.revs = 0;
  showResults({ hostEnd: !!M.hostEnd, tierBonus, acc: player.shotsN ? Math.min(100, Math.round(player.hitsN / player.shotsN * 100)) : 0, dmg: Math.round(player.dmgDone || 0), parts, partsLost: success ? 0 : M.parts || 0, board, job: J, success, abandoned, kills: player.kills, heads: player.heads, time: M.t, cash, xp, levelUps, tokens, ...w });
}
// back from the testing ground: whatever you carry comes home (that's how trading works), nothing is earned
function leaveTest(M) {
  mission = null; netJobEnded(); clearGearDrops(); clearFx(); settleWeapons(true, M); clearZombieStuff();
  $('flash').style.opacity = 0; $('intro').hidden = true; $('evacMark').hidden = true;
  profile.inv = player.inv; saveProfile(); showHub();
}
function hurtAt(pos, r, d) {
  const me = NET.selfPos && player.pos !== NET.selfPos ? NET.selfPos : player.pos, zt = zTarget; zTarget = null;
  if (Math.hypot(me.x - pos.x, me.z - pos.z) < r) { const P0 = player.pos; player.pos = me; hurtPlayer(d, true); player.pos = P0; }
  zTarget = zt;
  if (NET.mode === 'host') for (const [peer, a] of NET.avatars) if (!a.down && Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) < r) pushRoll(NET.dmgs, [++NET.seq, peer, Math.round(d * 10) / 10], 16);
}
let hurtSrc = null;
function hurtPlayer(d, quiet) {
  if (netRedirectHurt(d)) return; // a host zombie hit another player
  if (!liveWorld() || (mission && mission.leaving) || player.down) return;
  if (player.ffyl > 0) { player.ffyl = Math.max(.05, player.ffyl - .4); return; } // hits on the ground eat into the clock
  d *= SK.taken();
  const hadShield = player.shield > 0;
  if (player.shield > 0) { const a = Math.min(player.shield, d); player.shield -= a; d -= a; }
  if (hadShield && player.shield <= 0 && (rk('m_burst') || exoOn('nova'))) explode(player.pos.clone().setY(1), { r: 5, zdmg: 150 + zombieHp(), pr: .01, pdmg: .001, color: 0xf2d27a });
  player.hp -= d; player.lastHurt = now; if (d > 0) player.bloodN = 0;
  if (player.hp <= 0 && rk('s_wind') && !mission.wind) { mission.wind = true; player.hp = 1; banner('MÁSODIK SZÉL', 'Még nem most.'); }
  else if (player.hp <= 0 && rk('m_revive') && !mission.revived) { mission.revived = true; player.hp = maxHp() * .5; banner('FELTÁMADÁS', 'Az ég még nem vár.'); burst(player.pos.clone().setY(1), 0xf2d27a, 30, 4, 1); }
  if (!quiet) { player.shake = .25; SND.hurt(); }
  if (player.hp <= 0 && perk('second')) { player.perks.second = false; player.hp = maxHp() * .5; banner('MÁSODIK ESÉLY', 'Még egyszer.'); SND.power(); }
  if (player.hp <= 0) { player.hp = 0; player.downBy = hurtSrc || 'a horda'; killFeed(player.downBy, '#c9c1a8', '', '', 'Te', '#ff4a3a'); startFFYL(); } // on the ground: kill something before the clock runs out
}

// ================= INPUT =================
const keys = {};
let mouseDown = false, rmb = false, clickQueued = 0, locked = false, hadLock = false, noLock = false, lockPending = false;
function lockPointer() {
  lockPending = true;
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(lockFailed); } catch (e) { lockFailed(); }
}
// a lock request without a click behind it (a party job the leader started, a key press) is refused by the browser:
// then wait for a click instead of giving up on mouse look
let lastClick = -1e9;
addEventListener('mousedown', () => { lastClick = performance.now(); }, true);
function lockFailed() {
  if (!lockPending) return; lockPending = false;
  if (performance.now() - lastClick > 1500) { if (state === 'playing') { needClick = true; $('clickHint').hidden = false; } return; }
  if (hadLock) pause('Nem sikerült befogni az egeret. Kattints újra a Folytatásra.');
  else noLock = true;
}
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) { locked = hadLock = true; lockPending = false; }
  else { locked = false; if (state === 'playing') pause(); }
});
let quitArmed = false, pausedAt = 0;
function pause(note) {
  if (state !== 'playing' || (mission && mission.leaving)) return;
  state = 'paused'; mouseDown = rmb = false; pausedAt = performance.now(); quitArmed = false; $('quitBtn').textContent = mission && mission.job.test ? 'Vissza a bázisra' : 'Munka feladása';
  $('pauseNote').textContent = note || (noLock ? 'Az egér itt nem zárolható: mozgasd az egeret az ablakon belül, vagy fordulj a nyilakkal.' : '');
  $('pauseInfo').textContent = mission.job.test ? 'Lőtér · a fegyvereidet és a páncélt eldobhatod a társaidnak' : `Szünet · ${mission.job.title} · ${round}. szintű veszély · ${player.points} pont${mission.parts ? ` · ${mission.parts} ⚙ evakuáláskor` : ''}`;
  renderPauseInv();
  $('pause').hidden = false;
}
// the inventory: move guns between hands and bag, drop them, see the gear you found
function renderPauseInv() {
  const L = player.slots, B = player.bag, bagFull = B.length >= bagMax(), lone = L.filter(Boolean).length < 2, MG = mission.gear;
  let [sl, si] = invSel.split(':');
  const get = () => sl === 'L' ? L[+si] : sl === 'B' ? B[+si] : sl === 'M' ? MG[+si] : sl === 'W' ? profile.gear[si] : null;
  if (!get()) { sl = 'L'; si = String(player.cur); invSel = `L:${si}`; }
  const i = +si, x = get(), tag = w => w.owned ? 'saját' : 'új';
  let detail;
  const test = mission.job.test, destroyBtn = (act, it, off) => test ? '' : hhold(`Szétszedés (tartsd) +${fieldParts(it.q)} ⚙`, act, off, 'KeyX');
  if (sl === 'M') detail = gearDetail(x, profile.gear[x.slot], `<small class="note">${x.found ? 'Talált: csak evakuálással a tiéd, akkor is, ha felveszed.' : 'Saját, levetted.'}</small>` + hbtn('Felveszem', `wear:${si}`, false, 'KeyF') + destroyBtn(`gdestroy:${si}`, x, false));
  else if (sl === 'W') detail = gearDetail(x, null, `<small class="note">${x.found ? 'Talált: csak evakuálással a tiéd.' : 'Saját.'}</small>` + hbtn('Leveszem', `unwear:${si}`, false, 'KeyF'));
  else {
    const acts = sl === 'L' ? hbtn('Táskába', `mv:L:${i}:B`, lone || bagFull, 'KeyF') + hbtn(`${2 - i}. kézbe`, `mv:L:${i}:L:${1 - i}`, false, `Digit${2 - i}`) + hbtn('Eldob', `drop:L:${i}`, lone, 'KeyG') + destroyBtn(`destroy:L:${i}`, x, lone)
      : hbtn('Kézbe', `mv:B:${i}:L:${player.cur}`, !canUse(x), 'KeyF') + hbtn('1. kézbe', `mv:B:${i}:L:0`, !canUse(x), 'Digit1') + hbtn('2. kézbe', `mv:B:${i}:L:1`, !canUse(x), 'Digit2') + hbtn('Eldob', `drop:B:${i}`, false, 'KeyG') + destroyBtn(`destroy:B:${i}`, x, false);
    detail = weaponDetail(x, sl === 'L' ? L[1 - i] : L[player.cur], `<small class="note">${x.owned ? 'Saját' : 'Új: csak evakuálással a tiéd'} · lőszer ${x.ammo}/${x.reserve}</small>${acts}`);
  }
  const left = `<h3>Kézben</h3><div class="tiles" data-drop="L">${L.map((w, k) => w ? wTile(`L:${k}`, w, { n: `${k + 1}`, tag: w.owned ? '' : 'új' }) : emptyTile(`${k + 1}. kéz üres`, 'Húzz ide egy fegyvert', null, `L:${k}`)).join('')}</div>
    <h3>Táska <small>${B.length} / ${bagMax()}</small></h3><div class="tiles" data-drop="B">${B.map((w, k) => wTile(`B:${k}`, w, { cmp: curW(), tag: w.owned ? '' : 'új' })).join('') || emptyTile('Üres', 'Ha új fegyvert veszel fel, a kézben lévő ide kerül')}</div>
    <h3>Viselt páncél</h3><div class="tiles worn" data-drop="W">${GEAR_KEYS.map(k => profile.gear[k] ? gTile(`W:${k}`, profile.gear[k], { tag: profile.gear[k].found ? 'új' : '' }) : emptyTile(GEAR_SLOTS[k], 'Húzz ide páncélt', gearIcon(k, '#5a5a55'), 'W')).join('')}</div>
    <h3>Páncél a zsákban <small>a talált darab csak evakuálással a tiéd</small></h3><div class="tiles" data-drop="M">${MG.map((it, k) => gTile(`M:${k}`, it, { cmp: profile.gear[it.slot] || null, tag: it.found ? 'új' : '' })).join('') || emptyTile('Még semmi', 'A zombik dobják, rálépve felveszed')}</div>
    <h3>Tárgyak</h3><div class="invlist">${ITEM_KEYS.map(k => `<div><img src="${ICONS[k]}" alt=""><span>[${ITEMS[k].key}] ${k === 'gren' ? GREN_TYPES[throwKind('gren')].name : k === 'knife' ? KNIFE_TYPES[throwKind('knife')].name : ITEMS[k].name}<small>${k === 'gren' ? GREN_TYPES[throwKind('gren')].desc : k === 'knife' ? KNIFE_TYPES[throwKind('knife')].desc : ITEMS[k].desc}</small></span><strong>${player.inv[k]}/${itemMax(k)}</strong></div>`).join('')}</div>`;
  $('loadout').innerHTML = invLayout(left, detail);
  updateKeybar($('loadout'));
}
enableDrag($('pause'), $('loadout'), true);
$('loadout').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || state !== 'paused') return;
  const [kind, f, i, t, j] = b.dataset.act.split(':'), held = curW();
  if (kind === 'sel') { invSel = b.dataset.act.slice(4); return renderPauseInv(); }
  if (kind === 'mv') moveGun({ L: player.slots, B: player.bag }, f, +i, t, +j);
  if (kind === 'gdrop') { const it = mission.gear.splice(+f, 1)[0]; if (it) itemFeed('eldobta', it.name, it.q); if (it) netShareDrop('g', it, spawnGearDrop(it, player.pos.clone().add(new V3(rand(-.6, .6), 0, rand(-.6, .6))))); invSel = ''; }
  if (kind === 'destroy') { // parts are paid out only if you extract
    const w = f === 'L' ? player.slots[+i] : player.bag[+i];
    if (!w || (f === 'L' && player.slots.filter(Boolean).length < 2)) return;
    if (f === 'L') player.slots[+i] = null; else player.bag.splice(+i, 1);
    itemFeed('szétszedte', w.name, w.unique ? 5 : w.q); mission.parts = (mission.parts || 0) + fieldParts(w.q); (mission.destroyed || (mission.destroyed = [])).push(w); invSel = '';
  }
  if (kind === 'gdestroy') { const it = mission.gear.splice(+f, 1)[0]; if (it) { itemFeed('szétszedte', it.name, it.q); mission.parts = (mission.parts || 0) + fieldParts(it.q); } invSel = ''; }
  if (kind === 'wear' || kind === 'unwear') { // swap armor in the field; shield and health keep their share of the new maximum
    const G0 = profile.gear, hpF = player.hp / maxHp(), shF = maxShield() ? player.shield / maxShield() : 1;
    if (kind === 'wear') { const it = mission.gear.splice(+f, 1)[0], old = G0[it.slot]; G0[it.slot] = it; if (old) mission.gear.push(old); invSel = `W:${it.slot}`; }
    else { mission.gear.push(G0[f]); G0[f] = null; invSel = `M:${mission.gear.length - 1}`; }
    gearChanged(); player.hp = Math.max(1, maxHp() * hpF); player.shield = maxShield() * shF;
  }
  if (kind === 'drop') {
    const w = f === 'L' ? player.slots[+i] : player.bag[+i];
    if (!w || (f === 'L' && player.slots.filter(Boolean).length < 2)) return;
    if (f === 'L') player.slots[+i] = null; else player.bag.splice(+i, 1);
    itemFeed('eldobta', w.name, w.unique ? 5 : w.q); netShareDrop('w', w, spawnDrop(w, player.pos.clone().add(new V3(rand(-.6, .6), 0, rand(-.6, .6)))));
  }
  if (!player.slots[player.cur]) player.cur = 1 - player.cur;
  if (curW() !== held) { stopReload(); equipView(); }
  renderSlots(); renderPauseInv(); SND.buy();
});
function resume() { $('pause').hidden = true; $('clickHint').hidden = true; state = 'playing'; initAudio(); if (!noLock) lockPointer(); }
// Esc cannot grab the mouse again (browsers refuse pointer lock from Esc): close the inventory and resume on the next click
function closePauseForClick() { $('pause').hidden = true; $('clickHint').hidden = false; }
$('resumeBtn').onclick = resume;
// giving up needs a second click; it counts as a failed job
$('quitBtn').onclick = () => {
  if (mission && mission.job.test) { $('pause').hidden = true; return finishJob(true, true); } // the testing ground: leave any time
  if (!quitArmed) { quitArmed = true; $('quitBtn').textContent = 'Biztos? Nincs fizetség'; return; }
  $('pause').hidden = true; finishJob(false, true);
};
addEventListener('blur', () => pause());

addEventListener('keydown', e => {
  if (document.activeElement === $('chatIn')) return; // typing in the chat
  keys[e.code] = true;
  if (!$('settings').hidden) { if (e.code === 'Escape') closeSettings(); return; }
  if (state === 'hub' && invKey(e, $('hubBody'))) return;
  if (state === 'paused' && !$('pause').hidden && invKey(e, $('loadout'))) return;
  if (state === 'station' && (e.code === 'Escape' || e.code === 'KeyE')) { closeStation(e.code === 'Escape'); return; }
  if (state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP') && noLock) { resume(); return; }
  if (state === 'paused' && e.code === 'Escape' && !$('pause').hidden && performance.now() - pausedAt > 400) { closePauseForClick(); return; }
  if (e.code === 'Tab') e.preventDefault();
  if (state === 'paused' && (e.code === 'KeyI' || e.code === 'Tab')) { resume(); return; }
  if (state === 'playing' && (e.code === 'KeyI' || e.code === 'Tab') && !(mission && mission.leaving)) { if (locked) document.exitPointerLock(); else pause(); return; }
  if (state !== 'playing' || (mission && mission.leaving) || player.down) return;
  if (player.ffyl > 0 && !['KeyR', 'Digit1', 'Digit2', 'Escape', 'KeyP', 'KeyZ'].includes(e.code)) return; // on the ground: shoot, reload, swap
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyE') interact();
  else if (e.code === 'Digit1') switchTo(0);
  else if (e.code === 'Digit2') switchTo(1);
  else if (e.code === 'KeyH') useItem('med');
  else if (e.code === 'KeyG') useItem('gren');
  else if (e.code === 'KeyQ') useItem('knife');
  else if (e.code === 'KeyX') useItem('adren');
  else if (e.code === 'KeyV') knife();
  else if (e.code === 'KeyC') useAbility();
  else if (e.code === 'KeyZ') doPing();
  else if ((e.code === 'Escape' || e.code === 'KeyP') && !locked) pause();
});

addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => {
  if (state === 'paused' && $('pause').hidden && $('settings').hidden) { resume(); return; }
  if (state !== 'playing') return;
  if (needClick || (!locked && !noLock && !lockPending)) { needClick = false; $('clickHint').hidden = true; lockPointer(); return; } // back from a station via Esc, or the mouse was never grabbed
  if (e.button === 0) { mouseDown = true; clickQueued = .15; }
  if (e.button === 1) { e.preventDefault(); doPing(); }
  if (e.button === 2) rmb = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmb = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (state === 'playing') switchTo(1 - player.cur); }, { passive: true });
addEventListener('mousemove', e => {
  if (state !== 'playing' || !(locked || noLock)) return;
  const s = .0022 * SET.sens * (camera.fov / SET.fov) * (player.ads > .5 ? SET.adsSens : 1);
  player.yaw -= e.movementX * s; player.pitch -= e.movementY * s * (SET.invertY ? -1 : 1);
  player.pitch = clamp(player.pitch, -1.5, 1.5);
  vm.swayX = clamp(vm.swayX - e.movementX * .00012, -.03, .03);
  vm.swayY = clamp(vm.swayY + e.movementY * .00012, -.03, .03);
});

// ================= FX / WORLD UPDATE =================
function updateFx(dt) {
  updateParticles(dt); updateDecals(dt);
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.t -= dt; t.m.material.opacity = Math.max(0, t.t / .07) * .85;
    if (t.t <= 0) { scene.remove(t.m); t.m.material.dispose(); tracers.splice(i, 1); }
  }
  const W = innerWidth / 2, H = innerHeight / 2, v = new V3();
  for (const n of dmgNums) {
    if (n.t <= 0) continue;
    n.t -= dt; n.pos.y += dt * 1.3; n.pos.x += n.vx * dt;
    v.copy(n.pos).project(camera);
    if (n.t <= 0 || v.z > 1) { n.el.hidden = true; continue; }
    const k = clamp(1.4 - n.pos.distanceTo(camera.position) / 40, .55, 1); // far away numbers are smaller
    n.el.style.transform = `translate(${v.x * W + W}px,${-v.y * H + H}px) translate(-50%,-50%) scale(${k.toFixed(2)})`;
    n.el.style.opacity = Math.min(1, n.t * 2.5);
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.t -= dt;
    d.gun.rotation.y += dt * 1.2; d.gun.position.y = .7 + Math.sin(now * 2 + i) * .08;
    d.g.visible = d.t > 8 || Math.sin(now * 14) > 0;
    if (d.t <= 0) removeDrop(d);
  }
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const p = powerUps[i]; p.t -= dt;
    p.s.position.y = 1.1 + Math.sin(now * 3) * .15; p.s.visible = p.t > 6 || Math.sin(now * 16) > 0;
    if (Math.hypot(p.s.position.x - player.pos.x, p.s.position.z - player.pos.z) < 1.4) { takePower(p); p.t = 0; }
    if (p.t <= 0) { scene.remove(p.s); p.s.material.map.dispose(); p.s.material.dispose(); powerUps.splice(i, 1); }
  }
  for (const k in powers) powers[k] = Math.max(0, powers[k] - dt);
}

// ================= HUD =================
const hudCache = {};
function setHTML(id, html) { if (hudCache[id] !== html) { hudCache[id] = html; $(id).innerHTML = html; } }
function renderSlots() {
  $('slots').innerHTML = player.slots.map((w, i) => w
    ? `<div class="slot${i === player.cur ? ' on' : ''}" style="--sc:${rarColor(w)}"><b>${i + 1}</b>${w.base.name} <em>Lv ${w.level}</em></div>`
    : `<div class="slot"><b>${i + 1}</b>üres</div>`).join('');
}
function statRows(w, c) {
  const row = (label, val, shown, cmp, lowBetter, big) => {
    let d = '';
    if (c && cmp !== undefined) {
      const diff = val - cmp;
      if (Math.abs(diff) > 1e-6) {
        const good = lowBetter ? diff < 0 : diff > 0;
        d = `<span class="${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(+diff.toFixed(2))}</span>`;
      }
    }
    return `<tr${big ? ' class="big"' : ''}><td>${label}</td><td>${shown}</td><td>${d}</td></tr>`;
  };
  return row('DPS', dps(w), dps(w), c && dps(c), false, true) +
    row('Sebzés', w.dmg * w.pellets, w.pellets > 1 ? `${w.dmg}×${w.pellets}` : w.dmg, c && c.dmg * c.pellets) +
    row('Tűzgyorsaság', w.rpm, `${w.rpm}/p`, c && c.rpm) +
    row('Pontosság', accuracy(w), accuracy(w) + '%', c && accuracy(c)) +
    row(w.base.single ? 'Töltés / db' : 'Újratöltés', w.reload, w.reload.toFixed(w.base.single ? 2 : 1) + ' mp', c && c.reload, true) +
    row('Tár', w.mag, w.mag, c && c.mag);
}
function cardHTML(w, action, c) {
  const el = w.element ? ELEMENTS[w.element] : null;
  return `<div class="head"><div class="lvl">Lv ${w.level}</div><div class="rar">${RARITIES[w.q].name}</div><div class="name">${w.name}</div>
    <div class="sub">${w.maker} · ${w.base.name}</div>${c && c !== w ? `<span class="verdict ${dps(w) >= dps(c) ? 'up">JOBB' : 'down">GYENGÉBB'}</span>` : ''}</div>
    <div class="wperk">${w.maker}: ${mkOf(w).perk || ''}</div>
    <table>${statRows(w, c)}</table>
    ${el ? `<div class="elem" style="color:${el.color}">${el.name}: ${el.desc}</div>` : ''}
    ${w.unique && UNIQUES[w.unique] ? `<div class="duniq"><b>Egyedi:</b> ${UNIQUES[w.unique].trick}</div>` : ''}
    ${w.anoint && ANOINTS[w.anoint] ? `<div class="danoint"><b>Felkenés:</b> ${ANOINTS[w.anoint]}</div>` : ''}
    ${w.flavor ? `<div class="flav">${w.flavor}</div>` : ''}
    <div class="act">${action}</div>`;
}
function updateHUD() {
  const w = curW();
  focus = findFocus();
  let card = '', prompt = '';
  if (focus) {
    if (focus.type === 'gear') { const worn = profile.gear[focus.it.slot]; card = gearCard(focus.it, `<span><kbd>F</kbd>A zsákba</span><span>Viselt: ${worn ? `${worn.name} · ${worn.armor} páncél` : 'semmi'}</span>`, true); }
    else if (focus.w) card = cardHTML(focus.w, `<span><kbd>F</kbd>${player.slots.includes(null) ? 'Kézbe' : player.bag.length < bagMax() ? `Táskába ${player.bag.length}/${bagMax()}` : 'Tele a táska'}</span><span><kbd>F</kbd>tartsd: Csere</span>`, curW());
    else if (focus.type === 'cache') prompt = '<b>[E]</b> Utánpótlás-láda kinyitása';
    else if (focus.type === 'revive') prompt = `<b>[E]</b> nyomva: ${esc(focus.name)} felélesztése`;
    else if (focus.type === 'crate') prompt = '<b>[E]</b> Utánpótlás-láda felvétele';
    else if (focus.type === 'repair') prompt = `<b>[E]</b> ${mission && mission.esc ? 'Túlélő ellátása' : 'Generátor javítása'} (+25%) · ${GEN_REPAIR} pont${player.points < GEN_REPAIR ? ' (kevés a pont)' : ''}`;
    else if (!['box', 'ammo', 'drop', 'gear'].includes(focus.type)) prompt = areaPrompt(focus);
    else if (focus.type === 'box') prompt = box.state === 'spin' ? 'A doboz pörög…' : `<b>[E]</b> Rejtélyes doboz · ${SK.cost(BOX_COST)} pont${player.points < SK.cost(BOX_COST) ? ' (kevés a pont)' : ''}`;
    else if (focus.type === 'ammo') prompt = `<b>[E]</b> Lőszer feltöltése · ${SK.cost(AMMO_COST)} pont${w.reserve >= resMax(w) ? ' (tele)' : player.points < SK.cost(AMMO_COST) ? ' (kevés a pont)' : ''}`;
  }
  setHTML('card', card); $('card').hidden = !card; $('card').classList.toggle('plain', !!(focus && focus.type === 'gear'));
  if (focus && focus.w) $('card').style.setProperty('--rc', rarColor(focus.w));
  setHTML('prompt', prompt); $('prompt').hidden = !prompt;

  setHTML('points', `${player.points}<small>PONT</small>`);
  if (profile && profile.cls) {
    const C = CLASSES[profile.cls], cd = player.abilCd, active = player.stormT > 0 || aura;
    setHTML('ability', `<kbd>C</kbd>${C.ability.name} · ${active ? 'aktív' : cd > 0 ? Math.ceil(cd) + ' mp' : 'KÉSZ'}<i style="width:${active ? 100 : clamp(1 - cd / (abilityCd() || 1), 0, 1) * 100}%"></i>`);
    $('ability').className = cd > 0 && !active ? 'cd' : 'ready'; $('ability').style.setProperty('--cc', C.color);
  } else setHTML('ability', '');
  $('hpfill').style.width = player.hp / maxHp() * 100 + '%';
  $('stamfill').style.width = (player.adrenT > 0 ? 100 : player.stam / maxStam() * 100) + '%';
  $('stam').classList.toggle('full', player.adrenT <= 0 && player.stam >= maxStam() - .5);
  $('hp').classList.toggle('low', player.hp / maxHp() < .3);
  $('hud').classList.toggle('ads', player.ads > .6);
  $('shield').hidden = !maxShield(); $('shieldfill').style.width = (maxShield() ? player.shield / maxShield() * 100 : 0) + '%';
  setHTML('hplbl', `<span>ÉLETERŐ</span><span><b>${Math.ceil(player.hp)}</b>${maxShield() ? `<b class="sh">${Math.ceil(player.shield)}</b>` : ''}</span>`);
  if (!locked && !noLock && !lockPending && !needClick) { needClick = true; $('clickHint').hidden = false; } // lost the mouse somehow: say so
  $('adsDot').style.opacity = player.ads > .6 && !w.base.scopeView ? 1 : 0;
  $('vig').style.opacity = clamp((1 - player.hp / maxHp()) * 1.1, 0, .7);
  if (mission) {
    const M = mission, left = Math.max(0, M.job.dur - M.t);
    setHTML('timer', M.phase === 'evac' ? 'EVAKUÁCIÓ' : objectiveTimer(M) || fmtTime(left));
    $('timer').classList.toggle('evac', M.phase === 'evac');
    setHTML('left', M.job.bounty && !M.bountyDone ? `Célpont: ${(BOUNTIES[M.job.bounty] || BOUNTIES.butcher).name} · ${alive()} zombi a pályán` : !M.evacWarn && M.phase !== 'evac' && objectiveLine(M) ? objectiveLine(M) : M.phase === 'lull' ? `Pihenő · ${Math.ceil(M.phaseT)} mp` :
      M.phase === 'evac' ? (M.boardT > 0 ? `Beszállás · ${Math.ceil(M.boardT)} mp${M.boardWarn ? ' · MEGÁLLT: vissza a furgonhoz!' : ' · maradj a furgonnál'}` : truck.parked ? `A furgon vár még ${Math.max(0, Math.ceil(45 - (M.parkT || 0)))} mp · [E] beszállás` : 'Jön a furgon · menj a zöld jelzéshez') :
      M.evacWarn ? `A furgon ${Math.ceil(left)} mp múlva ér ide · indulj a zöld jelzéshez` : `${M.wave}. hullám · ${alive()} zombi a pályán`);
    updateEvacMark(M.phase === 'evac' || !!M.evacWarn);
  }
  setHTML('wname', `<span class="lvtag" style="--rc:${rarColor(w)}">Lv ${w.level}</span> <span style="color:${rarColor(w)}">${w.name}</span>`);
  setHTML('wsub', `${RARITIES[w.q].name} · ${w.base.name}${w.element ? ` · <span style="color:${ELEMENTS[w.element].color}">${ELEMENTS[w.element].name}</span>` : ''}`);
  const lowAmmo = w.ammo === 0 || (w.mag > 3 && w.ammo <= Math.ceil(w.mag * .25)); // a one-bolt crossbow is never 'low'
  setHTML('mag', w.ammo); $('mag').classList.toggle('low', lowAmmo);
  setHTML('res', '/ ' + w.reserve); $('res').classList.toggle('none', w.reserve === 0);
  const hint = player.reloading ? 'Újratöltés…' : w.ammo === 0 && w.reserve === 0 ? 'Nincs lőszer' : lowAmmo && w.reserve > 0 ? '[R] Újratöltés' : '';
  setHTML('hint', hint);
  $('rlhint').hidden = !hint || player.ads > .6; $('rlhint').firstChild.textContent = hint;
  $('rlfill').style.width = player.reloading ? reloadProgress() * 100 + '%' : '0';
  setHTML('powers', Object.keys(player.perks || {}).filter(k => player.perks[k] && PERKS[k]).map(k => `<span class="pw perk" style="color:#${PERKS[k].color.toString(16).padStart(6, '0')}">${PERKS[k].name}</span>`).join('') + Object.entries(powers).filter(([, t]) => t > 0).map(([k, t]) => `<span class="pw">${POWERS[k].label} ${Math.ceil(t)}<i style="width:${t / 15 * 100}%"></i></span>`).join('') +
    (player.adrenT > 0 ? `<span class="pw adren">Adrenalin ${Math.ceil(player.adrenT)}<i style="width:${player.adrenT / 12 * 100}%"></i></span>` : ''));
  if (card && bannerT > 0) $('banner').style.opacity = .25;
  // crosshair
  const cross = $('cross');
  cross.style.opacity = player.ads > .6 || player.sprint ? 0 : 1;
  const gap = 4 + Math.tan(currentSpread() * Math.PI / 180) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2;
  cross.querySelector('.t').style.transform = `translateY(${-gap - 9}px)`;
  cross.querySelector('.b').style.transform = `translateY(${gap}px)`;
  cross.querySelector('.l').style.transform = `translateX(${-gap - 9}px)`;
  cross.querySelector('.r').style.transform = `translateX(${gap}px)`;
}

// green marker on the van; slides to the screen edge and points the way when it is off screen
function updateEvacMark(on) {
  const el = $('evacMark'); el.hidden = !on; if (!on) return;
  const v = truck.pos.clone().setY(2.8).project(camera);
  let x = v.x, y = v.y; const behind = v.z > 1;
  if (behind) { x = -x; y = -y; }
  const k = Math.max(Math.abs(x) / .9, Math.abs(y) / .8), off = behind || k > 1;
  if (off) { x /= k; y /= k; }
  el.style.transform = `translate(${(x + 1) / 2 * innerWidth}px,${(1 - y) / 2 * innerHeight}px) translate(-50%,-50%)`;
  const b = el.firstChild; b.textContent = off ? '➤' : '▼'; b.style.transform = off ? `rotate(${Math.atan2(-y, x)}rad)` : '';
  const dist = Math.round(Math.hypot(truck.pos.x - player.pos.x, truck.pos.z - player.pos.z));
  el.lastChild.textContent = truck.parked && dist < 5 ? '[E] Beszállás' : `Furgon · ${dist} m`;
}

// ================= LOOP =================
let now = 0, last = performance.now();
loadMap('farm', 1234);
refreshMenu();

let slowmo = 0; // a moment of slow motion (a bounty falls)
function frame(t) {
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (t - last) / 1000); last = t;
  if (slowmo > 0) { slowmo -= dt; dt *= .35; }
  netTick(dt);
  if (state === 'menu' || state === 'hub' || state === 'results') {
    now += dt;
    camera.position.set(Math.sin(now * .05) * 22, 5.5, Math.cos(now * .05) * 22);
    camera.lookAt(0, 1.5, 0);
    if (box.label) box.label.position.y = 2.1 + Math.sin(now * 2) * .12;
  } else if (state === 'intro') {
    now += dt; updateIntro(dt); updateMapFx(dt);
  } else if (state === 'playing' || netLive()) {
    now += dt;
    if (state === 'playing') updatePlayer(dt);
    NET.client ? updateProxies(dt) : updateZombies(dt);
    scene.updateMatrixWorld();
    if (state === 'playing') updateWeapon(dt);
    updateVM(dt);
    updateBox(dt);
    NET.client ? clientMission(dt) : updateMission(dt);
    updateSkills(dt);
    if (!(state === 'playing' || netLive())) return;
    updateFx(dt);
    updateProjs(dt);
    updateItemDrops(dt); updateGearDrops(dt); updatePings(dt); updateMatesHud(); updateCompass();
    updateAreas(dt); if (mission) updateCache(mission, dt);
    updateMapFx(dt);
    if (state === 'playing') updateSellHold(dt);
    if (state === 'playing') updateHealthBars();
    if (hitmT > 0 && (hitmT -= dt) <= 0) $('hitm').classList.remove('on');
    if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').style.opacity = 0;
    if (flashT > 0) { flashT -= dt; $('flash').style.opacity = Math.max(0, flashT * 1.6); }
    if (state === 'playing') { updateHUD(); tickStats(dt); }
  }
  playMusic(['menu', 'hub', 'results'].includes(state) ? 'hub' : MAP_ID);
  const kb = (state === 'hub' || (state === 'paused' && !$('pause').hidden)) && $('settings').hidden && $('keybar').innerHTML !== '';
  if ($('keybar').hidden === kb) $('keybar').hidden = !kb;
  const cur = state === 'playing' ? 'none' : 'default';
  if (renderer.domElement.style.cursor !== cur) renderer.domElement.style.cursor = cur;
  gfxRender(state === 'playing' || state === 'paused'); // world + viewmodel, with bloom when the quality setting allows (gfx.js)
}
// the loop starts at the end of net.js, the last script, so every system exists on the first frame

// ================= LOOT KEYS =================
// F tap: into the bag (or an empty hand) · F held: swap with the gun in your hand (it goes to the bag, or the ground if full)
// E held: sell for points
const SWAP_HOLD = .4, SELL_HOLD = .8;
let fHold = 0, fLatch = false, sellHold = 0, sellLatch = false, needClick = false;
const lootFocus = () => focus && (focus.type === 'drop' || (focus.type === 'box' && box.state === 'ready')) ? focus : null;
function takeLoot(f, swap) {
  const w = f.type === 'drop' ? f.drop.w : box.weapon, ok = canUse(w), hand = ok ? player.slots.indexOf(null) : -1;
  if (!ok) swap = false; // above your level: it can only ride in the bag
  if (!swap && hand < 0 && player.bag.length >= bagMax()) { popText(ok ? 'Tele a táska · tartsd nyomva az F-et a cseréhez' : `${w.level}. szintű: csak a táskába teheted, de tele van`, '#ff8a70'); return SND.deny(); }
  if (f.type === 'drop') { netTookDrop(f.drop); removeDrop(f.drop); } else { box.state = 'idle'; scene.remove(box.show); box.show = null; boxUsed(); }
  focus = null; itemFeed('felvette', w.name, w.unique ? 5 : w.q);
  if (swap || hand >= 0) return giveWeapon(w);
  player.bag.push(w); trackBest(w); noteFound(w); SND.pickup(w.q);
  popText(ok ? `${w.name} a táskába (${player.bag.length}/${bagMax()})` : `${w.name} a táskába · ${w.level}. szinttől használhatod`, ok ? rarColor(w) : '#ff8a70');
}
let reviveHold = 0;
function updateSellHold(dt) {
  if (focus && focus.type === 'revive') { // hold E next to a downed mate
    if (keys.KeyE) { reviveHold += dt; if (reviveHold >= reviveT()) { reviveMate(focus.peer); reviveHold = 0; } } else reviveHold = 0;
    $('hold').hidden = reviveHold <= 0; $('holdLbl').textContent = 'Felélesztés…'; $('holdfill').style.width = reviveHold / reviveT() * 100 + '%'; return;
  }
  reviveHold = 0;
  if (focus && focus.type === 'gear') { if (keys.KeyF && !fLatch) { takeGear(focus.gd); focus = null; fLatch = true; } else if (!keys.KeyF) fLatch = false; $('hold').hidden = true; return; }
  const f = lootFocus();
  if (keys.KeyF) { if (f && !fLatch && (fHold += dt) >= SWAP_HOLD) { takeLoot(f, true); fLatch = true; } }
  else { if (fHold > 0 && !fLatch && f) takeLoot(f, false); fHold = 0; fLatch = false; }
  // no selling in the field: guns and armor are sold at the base
  const swapping = fHold > .12 && !fLatch;
  $('hold').hidden = !swapping;
  $('holdLbl').textContent = 'Csere…';
  $('holdfill').style.width = fHold / SWAP_HOLD * 100 + '%';
}
