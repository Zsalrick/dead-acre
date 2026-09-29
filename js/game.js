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
const bountyPre = J => 75 + 15 * ((J.diff || 1) - 1), bountyPost = J => 45 + 10 * ((J.diff || 1) - 1); // a bounty: hold out, the boss, hold out again, then the van

// opts (party jobs): seed and van spots come from the host so everyone gets the same layout; client: the host runs the world
function startJob(job, opts = {}) {
  if (!opts.client && !job.test) job.dir = (profile.dirs || []).filter(k => DIRECTIVES[k]); // the host's chosen directives travel with the job
  if (noClock(job)) job.dur = 1e6; // no clock: the job ends when the goal is met
  mission = { job, t: 0, phase: 'wave', phaseT: noClock(job) ? 1e9 : WAVE_T, wave: 1, brought: [], gear: [], bossDone: !job.boss || !!opts.client, leaving: 0, intro: 0, departT: -1, arriveT: -1 };
  const seed = opts.seed || 1 + Math.floor(Math.random() * 1e9);
  loadMap(job.map, seed);
  applyMod(job.mod);
  clearZombieStuff();
  while (drops.length) removeDrop(drops[0]);
  powerUps.forEach(p => scene.remove(p.s)); powerUps.length = 0; clearResDrops();
  projs.forEach(p => scene.remove(p.m)); projs.length = 0; fireZones.length = 0;
  itemDrops.forEach(d => scene.remove(d.s)); itemDrops.length = 0; clearGearDrops();
  const P = profile;
  Object.assign(player, { points: 500, earned: 0, kills: 0, heads: 0, cur: 0, ads: 0, bloom: 0, recoil: 0, reloadT: 0, reloading: false, spin: 0,
    ffyl: 0, shotsN: 0, hitsN: 0, dmgDone: 0, stepD: 0, fireCd: 0, burstLeft: 0, switchT: 0, knifeT: 0, knifeCd: 0, best: null, yaw: 0, pitch: 0, vy: 0, lastHurt: -99,
    inv: P.inv, up: P.up, stam: maxStam(), stamT: 0, adrenT: 0, stimK: null, regenT: 0, guardT: 0, itemCd: 0, perks: {}, buf: {}, uHeat: 0, uStack: 0 });
  player.hp = maxHp(); player.shield = maxShield(); endFFYLView();
  resetSkillsRun(); applyLookFP();
  const extraGren = (hasPassive('engineer') ? 1 : 0) + rk('e_belt');
  P.inv.gren = Math.min(itemMax('gren') + (hasPassive('engineer') ? 1 : 0), P.inv.gren + extraGren);
  if (rk('m_plenty')) P.inv.med = itemMax('med');
  // the loadout comes along, topped up; `owned` marks what goes home even if the job fails
  const own = o => { const w = unpackW(o); if (w) { w.owned = true; w.ammo = w.mag; w.reserve = resMax(w); } return w; };
  player.slots = P.loadout.map(own); player.bag = (P.bag || []).map(own);
  if (!player.slots[0] && !player.slots[1] && player.bag.length) player.slots[0] = player.bag.shift();
  if (!player.slots[0]) { player.slots[0] = player.slots[1]; player.slots[1] = null; }
  [...player.slots, ...player.bag].forEach(w => w && trackBest(w));
  mission.brought = [...player.slots.filter(Boolean), ...player.bag];
  mission.gear = (P.gearBag || []).slice(); mission.worn0 = GEAR_KEYS.map(k => P.gear[k]).filter(Boolean); // the armour bag comes along; what you wore stays yours even if you took it off
  // the van drops you at one spot and picks you up at another
  const n = MAP.vans.length; let a = Math.floor(Math.random() * n), b = Math.floor(Math.random() * (n - 1)); if (b >= a) b++;
  if (opts.client) { a = clamp(opts.a, 0, n - 1); b = clamp(opts.b, 0, n - 1); }
  mission.pickup = b; placeVan(a, false);
  setupObjective(mission);
  player.pos.set(truck.pos.x, 0, truck.pos.z - Math.sign(truck.pos.z || 1) * 2.8); player.vel.set(0, 0, 0);
  player.carry = null; contractSeen = null;
  if (!job.test) { profile.inMission = { coop: !!NET.pr, code: NET.code, alone: !NET.pr, at: Date.now() }; saveProfile(); } // cleared by finishJob; still here on the next load = the job was abandoned
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
  $('intro').hidden = false; $('hud').hidden = true; mission.introS = $('introS').textContent; mission.goT = -1;
  state = 'intro'; initAudio(); lockPointer(); showLoading(job);
  netJobStarted({ seed, a, b, client: !!opts.client });
}
// the ride in: everyone sits in the back of the van (look around freely), it drives round to the gate and backs in,
// then you climb down off the tailgate and draw. The leader starts the van once everyone is seated; members follow its clock.
const SEATS = [[-.8, .62], [-.8, -.62], [-1.7, .62], [-1.7, -.62]], BED_Y = 1.3; // van space: +x is the bonnet, the tailgate at -2.4
const LOAD_MIN = 5, loadEl = M => (performance.now() - (M.loadAt || 0)) / 1000; // real seconds: a slow first frame doesn't stretch it
function mapShot() { // one picture of the map from above a corner, thinner fog so it reads
  try {
    const R = MAIN_RECT, cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2, w = R.maxX - R.minX, h = R.maxZ - R.minZ;
    const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .5, 800); cam.position.set(cx + w * .45, Math.max(w, h) * .45, cz + h * .7); cam.lookAt(cx, 0, cz);
    const fd = scene.fog.density; scene.fog.density = fd * .15; scene.updateMatrixWorld(); renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', .82); scene.fog.density = fd; return url;
  } catch (e) { return ''; }
}
function showLoading(job) {
  const L = $('loadscr'), M = MAPS[job.map], B = job.bounty && BOUNTIES[job.bounty], sp = typeof spTags === 'function' ? spTags(job) : [];
  $('lsImg').src = mapShot(); $('lsImg').hidden = !$('lsImg').src;
  $('lsEy').textContent = `${M.name}${job.test ? ' · gyakorlás' : ''}`;
  $('lsT').textContent = job.title;
  $('lsS').innerHTML = job.test ? 'Célbábuk, végtelen lőszer, nincs veszély' : `<span class="lsst" style="color:${B ? '#ff8c1a' : DIFF_COL[job.diff - 1]}">${'★'.repeat(job.diff)}${'☆'.repeat(5 - job.diff)}</span> ${DIFF_NAMES[job.diff - 1]} · Megbízó: ${job.client || '–'}`;
  const f = job.test ? [] : [
    ['Feladat', B ? `Fejvadászat: ${B.name}` : job.type && job.type !== 'survive' ? JOB_TYPES[job.type].name : 'Túlélés'],
    ['Idő', noClock(job) ? 'nincs időkorlát' : fmtTime(job.dur)], ['Zóna', `${job.lvl || profile.level}. szint`], ['Kezdő veszély', START_THREAT[job.diff - 1]],
    ['Díj', `$${job.reward} · ${job.xp} XP`],
    ...(job.mod && MODS[job.mod] ? [['Módosító', MODS[job.mod].label]] : []), ...sp.map(S => ['Különleges', `<b style="color:${S.color}">${S.name}</b>`]),
    ...(job.sec || []).map(s => ['Mellékcél', `${secOf(s).name}: ${secTxt(s, job)}`]),
    ...(job.boss && !B ? [['Főellenség', 'A Mészáros is eljön']] : []), ...((job.dir || []).length ? [['Direktívák', job.dir.map(k => DIRECTIVES[k] ? DIRECTIVES[k].name : k).join(', ')]] : []),
  ];
  $('lsF').innerHTML = f.map(([k, v]) => `<li><small>${k}</small><span>${v}</span></li>`).join('');
  L.dataset.h = ''; L.classList.remove('out'); L.hidden = false; mission.loadAt = performance.now();
}
function updateLoading(M) {
  const L = $('loadscr'); if (L.hidden) return;
  if (M.goT >= 0) { if (!L.classList.contains('out')) { L.classList.add('out'); setTimeout(() => { if (L.classList.contains('out')) L.hidden = true; }, 600); } return; }
  const mem = NET.mode ? partyMembers() : [], list = mem.length ? mem : [{ me: true, n: myName(), lv: profile.level, c: profile.cls }];
  const rows = list.map(m => ({ ...m, ok: m.me || NET.avatars.has(m.peer) })), n = rows.filter(r => r.ok).length;
  const h = rows.map(r => { const C = CLASSES[r.c]; return `<div class="lsp${r.ok ? ' ok' : ''}" style="--pc:${C ? C.color : '#c9c1a8'}"><i></i><b>${esc(r.n || '?')}${r.me ? ' <small>(te)</small>' : ''}</b><span>${C ? C.name : 'Nincs kaszt'} · ${r.lv || 1}. szint</span><em>${r.ok ? 'kész' : 'tölt…'}</em></div>`; }).join('');
  if (L.dataset.h !== h) { L.dataset.h = h; $('lsP').innerHTML = h; }
  const k = Math.min(1, loadEl(M) / LOAD_MIN) * .6 + n / rows.length * .4;
  $('lsFill').style.width = k * 100 + '%';
  $('lsTxt').textContent = loadEl(M) < LOAD_MIN ? 'Betöltés…' : n < rows.length ? `Várakozás a többiekre · ${n} / ${rows.length}` : 'Indulás';
}
const RIDE = { wait: 1.2, road: 4.4, stop: .5, back: 3.4, exit: 1.9 };
const rideLen = () => RIDE.road + RIDE.stop + RIDE.back;
function mySeat() { if (!NET.mode) return 0; const ids = partyMembers().filter(m => m.st === 'job').map(m => m.peer).sort(); return clamp(ids.indexOf(NET.me), 0, 3); }
function ridePose(t) { // t seconds into the drive: along the road outside the fence, a turn out, then reversing in through the gate
  const [x, z, ry, moving] = ridePath(t, truck.pos.x, truck.pos.z, truck.dir, truck.side);
  truck.g.position.set(x, moving ? .025 * Math.sin(now * 11) : 0, z); truck.g.rotation.y = ry; truck.g.visible = true;
}
function ridePath(t, px, pz, dir, side = pz >= 0 ? 1 : -1) { // where the van is t seconds into the drive to the spot (px, pz): [x, z, heading, moving]
  const Dd = Math.abs(px - (dir < 0 ? MAIN_RECT.minX : MAIN_RECT.maxX)) + 14, Ls = 24, R = 6, La = R * Math.PI / 2;
  let f, l, hf, hl;
  if (t < RIDE.road) { const s = smooth(clamp(t / RIDE.road, 0, 1)) * (Ls + La);
    if (s < Ls) { f = Dd; l = -30 + s; hf = 0; hl = 1; } else { const a = Math.PI - (s - Ls) / R; f = Dd + R + R * Math.cos(a); l = -R + R * Math.sin(a); hf = Math.sin(a); hl = -Math.cos(a); } }
  else if (t < RIDE.road + RIDE.stop) { f = Dd + R; l = 0; hf = 1; hl = 0; }
  else { const v = clamp((t - RIDE.road - RIDE.stop) / RIDE.back, 0, 1); f = (Dd + R) * Math.pow(1 - v, 2); l = 0; hf = 1; hl = 0; }
  const moving = t < rideLen() && Math.abs(t - RIDE.road - RIDE.stop / 2) > RIDE.stop / 2;
  return [px + dir * f, pz + side * l, Math.atan2(-side * hl, dir * hf), moving];
}
function updateIntro(dt) {
  const M = mission; M.intro += dt; updateLoading(M);
  if (M.goT < 0) { // everyone takes a seat; the leader (or you alone) starts the engine
    M.seat = mySeat();
    const want = NET.mode ? partyMembers().filter(m => !m.me).length : 0;
    if (NET.mode && want) $('introS').textContent = `A többiekre vár… ${NET.avatars.size + 1} / ${want + 1}`;
    if (!NET.client && loadEl(M) > LOAD_MIN && (NET.avatars.size >= want || loadEl(M) > 30)) M.goT = 0; // after the loading screen: at least 5 s, and everyone in (30 s at most)
    if (M.goT >= 0) { $('introS').textContent = M.introS; }
  } else {
    if (!M.engine) { M.engine = 1; if (M.goT < rideLen()) nz(rideLen() - M.goT, 150, .28, 'lowpass', .6); $('introS').textContent = M.introS; }
    M.goT += dt;
    const bt = M.goT - RIDE.road - RIDE.stop; if (bt > 0 && bt < RIDE.back && Math.floor(bt / .55) !== M.beep) { M.beep = Math.floor(bt / .55); tn(1050, .12, .045, 'square'); } // reversing
  }
  const drive = clamp(M.goT, 0, rideLen()), ex = M.goT - rideLen();
  ridePose(drive); truck.g.updateMatrixWorld();
  if (ex >= 0 && !M.parked0) { M.parked0 = 1; setVanAt(0); truck.g.visible = true; nz(.25, 900, .22, 'bandpass', 2); } // the tailgate drops
  const seat = SEATS[M.seat || 0], rot = truck.g.rotation.y, W = (x, y, z) => new V3(x, y, z).applyMatrix4(truck.g.matrixWorld);
  if (M.iry == null || (M.goT < 0 && M.iSeat !== M.seat)) { M.iSeat = M.seat; M.iry = seat[1] > 0 ? 0 : Math.PI; M.lastYaw = null; } // facing the others across the bed (the seat can change while the party sits down)
  let lx = seat[0], lz = seat[1], eye = BED_Y + .85, feet = BED_Y;
  if (ex < 0) { // seated: mouse look relative to the van, so a turn turns you too
    if (M.lastYaw != null) M.iry += player.yaw - M.lastYaw;
    player.pitch = clamp(player.pitch, -1.1, 1.1);
  } else { // stand, step to the tailgate, jump down
    if (M.iryEx == null) { M.iryEx = M.iry; M.pitchEx = player.pitch; }
    const k1 = smooth(clamp(ex / .45, 0, 1)), k2 = smooth(clamp((ex - .45) / .45, 0, 1)), k3 = clamp((ex - .9) / .5, 0, 1), k4 = clamp((ex - 1.4) / .5, 0, 1);
    const landX = -3.4 - (M.seat >> 1) * .8;
    M.iry = M.iryEx + angDiff(Math.PI / 2 - M.iryEx) * smooth(clamp(ex / .8, 0, 1)); // turn to face the gate
    player.pitch = lerp(M.pitchEx, -.12, smooth(clamp(ex / .9, 0, 1))) - .25 * Math.sin(k3 * Math.PI);
    lx = k3 > 0 ? lerp(-2.25, landX, k3) : lerp(seat[0], -2.25, k2); lz = lerp(seat[1], seat[1] * 1.3, k3);
    const top = BED_Y + 1.55; eye = k3 > 0 ? lerp(top, 1.65, k3) + Math.sin(k3 * Math.PI) * .35 - .25 * Math.sin(k4 * Math.PI) : lerp(BED_Y + .85, top, k1);
    feet = k3 > 0 ? eye - 1.65 : BED_Y; if (k3 >= 1 && !M.landed) { M.landed = 1; const p = W(lx, 0, lz); burst(new V3(p.x, .1, p.z), 0x8a7a5a, 10, 2, .5); nz(.18, 160, .45, 'lowpass', 1); tn(70, .15, .2, 'sine', 40); }
    if (ex >= RIDE.exit) { const p = W(landX, 0, lz); player.pos.set(p.x, 0, p.z); collide(player.pos, .4); clampBounds(player.pos, .4); player.yaw = rot + M.iry; player.pitch = -.12; return endIntro(); }
  }
  player.yaw = rot + M.iry; M.lastYaw = player.yaw;
  const cam = W(lx, eye, lz), fp = W(lx, Math.max(0, feet), lz); player.pos.copy(fp); // teammates see you where you are
  camera.position.copy(cam); camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  camera.fov = SET.fov; camera.updateProjectionMatrix();
  $('flash').style.background = '#000'; $('flash').style.opacity = clamp(1 - M.intro / 1.2, 0, 1);
  $('intro').style.opacity = clamp(Math.min(M.intro / .8, M.goT < 0 ? 1 : (rideLen() - .8 - M.goT) / .6), 0, 1);
}
// the ride out: walk to the tailgate, climb in, sit facing out the back, and the van pulls away (left behind: you watch it go)
const OUTRO_T = 6;
function updateOutro(M, dt, ok) { // true when it's over
  const t = M.leaving += dt;
  if (!ok) { truck.g.position.x += truck.dir * dt * (4 + t * 6); $('flash').style.background = '#000'; $('flash').style.opacity = clamp((t - .8) / 1.4, 0, 1); return t > 2.4; }
  if (!M.out) { setVanAt(0); truck.g.rotation.y = truck.dir > 0 ? 0 : Math.PI; truck.g.updateMatrixWorld(); M.out = { seat: SEATS[mySeat()], from: camera.position.clone(), yaw0: player.yaw, pitch0: player.pitch }; }
  const O = M.out, s = O.seat, rot = truck.g.rotation.y, vt = Math.max(0, t - 1.9), off = 1.8 * vt * vt;
  truck.g.position.set(truck.pos.x + truck.dir * off, vt > 0 ? .025 * Math.sin(now * 11) : 0, truck.pos.z); truck.g.visible = true; truck.g.updateMatrixWorld();
  if (vt > 0 && !M.out.go) { M.out.go = 1; nz(OUTRO_T - 1.9, 150, .3, 'lowpass', .6); }
  const W = (x, y, z) => new V3(x, y, z).applyMatrix4(truck.g.matrixWorld), back = W(-3.4, 1.65, s[1]), edge = W(-2.1, BED_Y + 1.55, s[1]), sit = W(s[0], BED_Y + .85, s[1]);
  let cam;
  if (t < .7) cam = O.from.clone().lerp(back, smooth(t / .7));
  else if (t < 1.2) { const k = (t - .7) / .5; cam = back.clone().lerp(edge, k); cam.y += Math.sin(k * Math.PI) * .35; if (!O.hop) { O.hop = 1; nz(.15, 300, .25, 'lowpass', 1); } }
  else cam = edge.clone().lerp(sit, smooth(clamp((t - 1.2) / .5, 0, 1)));
  const toVan = rot - Math.PI / 2, outBack = rot + Math.PI / 2; // facing the van while climbing, then out over the tailgate
  player.yaw = t < 1.2 ? O.yaw0 + angDiff(toVan - O.yaw0) * smooth(clamp(t / .6, 0, 1)) : toVan + angDiff(outBack - toVan) * smooth(clamp((t - 1.2) / .8, 0, 1));
  player.pitch = lerp(O.pitch0, t < 1.2 ? 0 : -.08, smooth(clamp(t / .8, 0, 1)));
  camera.position.copy(cam); camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  player.pos.set(cam.x, Math.max(0, cam.y - 1.65), cam.z); vmRoot.visible = false; $('hud').classList.add('outro');
  $('flash').style.background = '#000'; $('flash').style.opacity = clamp((t - (OUTRO_T - 1.3)) / 1.1, 0, 1);
  return t > OUTRO_T;
}
function markCarry(ext) { // what you carry right now, saved with the in-job marker: a quit is settled from this, so nothing exists twice
  const IM = profile.inMission; if (!IM || !mission) return;
  IM.live = 1; if (ext) IM.ext = 1; IM.hands = player.slots.filter(Boolean).map(packW); IM.bag = player.bag.map(packW); IM.mg = mission.gear.filter(it => IM.ext || !it.found); saveProfile();
}
function endIntro() {
  $('loadscr').hidden = true;
  const M = mission; markCarry(); vmRoot.visible = true; $('hud').classList.remove('outro');
  if (!M.landed) { setVanAt(0); truck.g.rotation.y = truck.dir > 0 ? 0 : Math.PI; truck.g.visible = true; if (M.goT >= 0) { player.pos.set(truck.pos.x - truck.dir * 3.6, 0, truck.pos.z); collide(player.pos, .4); } } // skipped the ride: stand behind the van
  M.intro = -1; M.departT = 0; state = 'playing';
  $('intro').hidden = true; $('hud').hidden = false; $('flash').style.opacity = 0; $('flash').style.background = '';
  equipView(); vm.blend = null; player.switchT = SWITCH_T / 2; SND.pickup(1); // off the tailgate: the weapon only comes up from below (starting at the top of the swap curve made it blink)
  if (!stats.jobs || M.job.test) showHelp(12); // the first job (and the testing ground): the controls on screen
  if (M.job.test) banner('LŐTÉR', 'Célbábuk előtted. Esc: leltár és vissza a bázisra.'); else { banner('1. HULLÁM', noClock(M.job) ? 'Jönnek. A furgon akkor jön, ha kész a feladat.' : 'Jönnek. A furgon az idő lejártakor jön vissza érted.'); SND.roundStart(); }
  if (!locked && !noLock) { needClick = true; $('clickHint').hidden = false; } // one click grabs the mouse
}
function updateMission(dt) {
  const M = mission; if (!M) return;
  if (M.dead) return finishJob(false);
  if (NET.mode && netAllDown()) { banner('A CSAPAT ELESETT', 'Senki nem maradt talpon.'); return finishJob(false); }
  if (M.job.test) return updateTestGround(M, dt);
  if (M.leaving) { if (updateOutro(M, dt, netExtractOk())) finishJob(netExtractOk()); return; } // driving off
  if (M.departT >= 0) { // the van leaves after dropping you off
    M.departT += dt; setVanAt(M.departT * M.departT * 2.5);
    if (!truck.g.visible && M.departT > 1) M.departT = -1;
  }
  if (M.arriveT >= 0) { // ...and backs in at the pickup spot when time is up
    M.arriveT += dt; setVanAt(vanRun() * Math.pow(1 - clamp(M.arriveT / ARRIVE_T, 0, 1), 2));
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
    if (M.job.bounty && !M.bountyBoss && M.t > bountyPre(M.job)) { M.bountyBoss = spawnBounty(M.job.bounty); SND.threat(3); banner(`${(BOUNTIES[M.job.bounty] || BOUNTIES.butcher).name.toUpperCase()} MEGÉRKEZETT`, 'Most győzd le!'); }
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
  if (NET.client) { if (!truck.parked) return popText('A furgon még nem állt meg.', '#ff8a70'); if (!(mission.boardT > 0)) { netAct('board'); banner('BESZÁLLÁS', `Tartsatok ki ${BOARD_T} mp-ig a furgon mellett!`); } return; }
  if (NET.mode && mission.boarded && !netExtractOk()) banner('LEMARADTÁL', 'A furgon nélküled ment el.');
  if (!mission.boarded) { // first press: start loading
    if (!(mission.boardT > 0)) { mission.boardT = BOARD_T; banner('BESZÁLLÁS', `Tarts ki ${BOARD_T} mp-ig a furgon mellett!`); SND.buy(); }
    if (mission.boardT > 0) return;
  }
  mission.leaving = .001; markCarry(true); // closing during the drive-off still counts as extracted
  player.vel.set(0, 0, 0);
  SND.roar(); nz(2.2, 300, .4, 'lowpass', .6);
  banner('INDULÁS', 'Munka kész.');
}
// only the two guns in your hands go home. Anything dropped on the map stays there, even your own.
// On a failed job, guns found during the job are lost too; what you brought and still hold comes back.
function addLost(w, g) { // the lost-and-found keeps what you lost on your last three failed jobs
  const P = profile; if (!w.length && !g.length) return;
  const n = P.lostN = (P.lostN || 0) + 1, L = P.lost || (P.lost = { w: [], g: [] }), keep = o => (o.lr || 0) > n - 3;
  w.forEach(o => o.lr = n); g.forEach(o => o.lr = n);
  L.w = [...L.w, ...w].filter(keep); L.g = [...L.g, ...g].filter(keep); L.at = Date.now();
  if (!L.w.length && !L.g.length) P.lost = null;
}
function settleWeapons(success, M) {
  const carried = [...player.slots.filter(Boolean), ...player.bag], soloFail = !success && !M.job.test && !NET.mode; // co-op keeps the old rule
  let keep = success ? carried : carried.filter(w => w.owned && !(soloFail && player.bag.includes(w)));
  const lost = [...carried.filter(w => !keep.includes(w)), ...M.brought.filter(w => !carried.includes(w) && !(M.destroyed || []).includes(w))];
  const P = profile, junkQ = P.junkQ == null ? -1 : P.junkQ, junk = success ? keep.filter(w => !w.owned && !w.unique && w.q <= junkQ) : [];
  const junkParts = junk.reduce((a, w) => a + PARTS[w.q], 0); P.parts = (P.parts || 0) + junkParts; // auto-salvage: marked-as-junk rarities turn into parts at home
  keep = keep.filter(w => !junk.includes(w));
  const newOnes = keep.filter(w => !w.owned); newOnes.forEach(w => w.isNew = true); // marked new in the hub until looked at
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
  const gb = [], lostG = []; // everything you carried out stays in the armour bag; what doesn't fit goes to the stash
  for (const it of M.gear) {
    const found = it.found;
    if (found) { if (!success) { lostGear.push(it); continue; } delete it.found; it.isNew = true; home.push(it); }
    if (!success && !P.gear[it.slot] && (!soloFail || (M.worn0 || []).includes(it))) P.gear[it.slot] = it; else if (soloFail) { lostG.push(it); lostGear.push(it); } else if (gb.length < bagMax()) gb.push(it); else toStash(it);
  }
  P.gearBag = gb;
  let toLost = 0; if (soloFail) { const lw = carried.filter(w => !keep.includes(w)), lg = [...lostGear.filter(it => !lostG.includes(it)), ...lostG]; toLost = lw.length + lg.length; addLost(lw.map(w => packW(Object.assign(w, { owned: false }))), lg.map(it => { delete it.found; return it; })); }
  gearChanged();
  return { junkN: junk.length, junkParts, kept: newOnes, lost, overflow, toLost, gear: success ? home : lostGear };
}
function finishJob(success, abandoned) {
  $('loadscr').hidden = true;
  const M = mission, J = M.job, P = profile, party = Math.max(M.partyMax || 1, NET.mode ? partySize() : 1);
  if (J.test) return leaveTest(M);
  const others = new Map((M.board || []).map(b => [b.n, b])); for (const a of NET.avatars.values()) others.set(a.name, { n: a.name, k: a.kc || 0, r: a.rvc || 0, d: a.dd || 0 }); // everyone seen during the job, even if they left first
  const board = NET.mode || M.board ? [{ n: myName(), k: player.kills, r: NET.revs || 0, d: Math.round(player.dmgDone || 0), me: true }, ...others.values()] : null;
  mission = null; state = 'results';
  netJobEnded();
  $('flash').style.opacity = 0; $('flash').style.background = '';
  truck.beacon.visible = truck.beam.visible = false; $('evacMark').hidden = true; $('intro').hidden = true;
  clearGearDrops(); clearFx(); if (M.esc) scene.remove(M.esc.a.g); if (M.cache && M.cache.g) scene.remove(M.cache.g);
  const w = settleWeapons(success, M);
  const secB = secBonus(J, M, success);
  // dying after the clock ran out (during evac) still pays a quarter of the fee
  const cash = success ? Math.round((J.reward + Math.floor(player.earned * .07)) * SK.cash() * (1 + .1 * (party - 1)) * (1 + .1 * dirCount(J)) * (exoOn('charm') ? 1.2 : 1)) + secB.cash : !abandoned ? Math.round(J.reward * (M.phase === 'evac' ? .25 : .1)) : 0; // falling short still pays a little
  const xp = Math.round((success ? J.xp + player.kills * 2 : Math.floor(player.kills)) * (1 + .1 * (party - 1)) * (success && stats.jobs < 5 ? 2 : 1) * (J.map === featuredMap() ? 1.25 : 1) * (1 + .15 * dirCount(J)) * (success && exoOn('charm') ? 1.2 : 1)) + secB.xp; // the first five jobs: double XP; the featured map +25%; directives +15% each
  const bd = success ? { c: [[`Munka díja${spMul(J, 'cash2') > 1 ? ' (2× pénz)' : ''}`, `$${J.reward}`], [`Pontjaid 7%-a`, `$${Math.floor(player.earned * .07)}`], SK.cash() > 1 ? ['Képesség', `×${SK.cash().toFixed(2)}`] : null, party > 1 ? [`Csapat (${party} fő)`, `+${10 * (party - 1)}%`] : null, dirCount(J) ? [`Direktívák (${dirCount(J)})`, `+${10 * dirCount(J)}%`] : null, ...secB.list.map(s => [`Mellékcél: ${secOf(s).name}`, `+$${Math.round(J.reward * .2 / 10) * 10}`])].filter(Boolean),
    x: [['Munka', `${J.xp} XP${spMul(J, 'xp2') > 1 ? ' (2× XP)' : ''}`], [`Ölések (${player.kills} × 2)`, `${player.kills * 2} XP`], party > 1 ? [`Csapat`, `+${10 * (party - 1)}%`] : null, stats.jobs < 5 ? ['Első 5 munka', '×2'] : null, J.map === featuredMap() ? ['Heti kiemelt pálya', '+25%'] : null, dirCount(J) ? ['Direktívák', `+${15 * dirCount(J)}%`] : null, ...secB.list.map(s => [`Mellékcél: ${secOf(s).name}`, `+${Math.round(J.xp * .2)} XP`])].filter(Boolean) } : null; // shown on the results
  const dHold = deepHold(J, success, cash, xp), payC = dHold ? dHold.c : cash, payX = dHold ? dHold.x : xp; // Hétvégi Meló: paid after the third job
  P.cash += payC; stats.cash += payC;
  const parts = success ? (M.parts || 0) + secB.parts : 0; P.parts = (P.parts || 0) + parts; const fabric = success ? M.fabric || 0 : 0; P.fabric = (P.fabric || 0) + fabric;
  let tierBonus = null; // clearing Rémálom always pays a legendary, sometimes a unique; the very first job a rare gun
  if (success && stats.jobs === 0 && !J.test) { tierBonus = makeWeapon(pick(BASES), 2, Math.max(1, P.level)); if (P.stash.length < stashMax()) P.stash.push(packW(tierBonus)); else P.cash += sellValue(tierBonus); noteFound(tierBonus); }
  if (success && J.tier) P.parts = (P.parts || 0) + 10 + 5 * J.tier; // Rémálom pays parts too
  if (success && J.tier) { tierBonus = Math.random() < .12 ? makeUnique(null, J.lvl) : makeWeapon(pick(BASES), 4, J.lvl); if (P.stash.length < stashMax()) P.stash.push(packW(tierBonus)); else P.cash += sellValue(tierBonus); noteFound(tierBonus); }
  const xpFrom = P.xp / xpNeed(P.level); const levelUps = addXp(payX);
  const tokens = levelUps; // one merit token per level, nothing else
  if (success && J.bounty) stats.bounties = (stats.bounties || 0) + 1;
  if (success && J.tier > (P.tier || 0)) P.tier = J.tier; // next nightmare tier unlocked
  giveTokens(tokens);
  P.inv = player.inv;
  const bm = stats.byMap[J.map] || (stats.byMap[J.map] = { done: 0, fail: 0 });
  if (success) { stats.jobs++; bm.done++; if (J.diff >= 4 && !J.test) stats.hard = (stats.hard || 0) + 1; } else { stats.fails++; bm.fail++; }
  rollBoard(); rollShop(); saveProfile();
  clearZombieStuff();
  NET.revs = 0;
  delete P.inMission;
  const deep = deepFinished(J, success); saveProfile(); // the dive's progress and reward are saved right away
  showResults({ deep, xpFrom, xpTo: P.xp / xpNeed(P.level), hostEnd: !!M.hostEnd, tierBonus, acc: player.shotsN ? Math.min(100, Math.round(player.hitsN / player.shotsN * 100)) : 0, dmg: Math.round(player.dmgDone || 0), parts, fabric, bd, partsLost: success ? 0 : M.parts || 0, board, job: J, success, abandoned, kills: player.kills, heads: player.heads, time: M.t, cash: payC, xp: payX, dHold, levelUps, tokens, ...w });
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
function hitFx(d, absorbed) { // blood where your health was hit, a blue flash where the shield took it; the bars jolt
  const flash = (f, s) => { f.style.transition = 'none'; f.style.opacity = s; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = ''; f.style.opacity = 0; })); };
  if (d > 0) flash($('hitfx'), clamp(.35 + d / Math.max(1, maxHp()) * 4, .35, 1));
  if (absorbed > 0) flash($('shfx'), clamp(.55 + absorbed / Math.max(1, maxShield()) * 3, .55, 1));
  const b = $('bl'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
}
function hurtPlayer(d, quiet) {
  if (netRedirectHurt(d)) return; // a host zombie hit another player
  if (!liveWorld() || (mission && mission.leaving) || player.down) return;
  if (player.ffyl > 0) { player.ffyl = Math.max(.05, player.ffyl - .4); return; } // hits on the ground eat into the clock
  d *= SK.taken();
  const hadShield = player.shield > 0;
  let absorbed = 0; if (player.shield > 0) { absorbed = Math.min(player.shield, d); player.shield -= absorbed; d -= absorbed; }
  if (hadShield && player.shield <= 0 && (rk('m_burst') || exoOn('nova'))) explode(player.pos.clone().setY(1), { r: 5, zdmg: 150 + zombieHp(), pr: .01, pdmg: .001, color: 0xf2d27a });
  player.hp -= d; player.lastHurt = now; if (d > 0) player.bloodN = 0;
  if (player.hp <= 0 && rk('s_wind') && !mission.wind) { mission.wind = true; player.hp = 1; banner('MÁSODIK SZÉL', 'Még nem most.'); }
  else if (player.hp <= 0 && rk('m_revive') && !mission.revived) { mission.revived = true; player.hp = maxHp() * .5; banner('FELTÁMADÁS', 'Az ég még nem vár.'); burst(player.pos.clone().setY(1), 0xf2d27a, 30, 4, 1); }
  if (!quiet) { player.shake = .25; hitFx(d, absorbed); if (d > 0) SND.hurt(); else SND.shieldHit(); }
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
let pauseWant = null; // Tab / I asks for the inventory; Esc (or losing the mouse) opens the menu
function pauseMode(m) { $('pause').dataset.mode = m; if (m === 'inv') renderPauseInv(); else renderPauseMenu(); $('keybar').hidden = m !== 'inv'; }
function renderPauseMenu(help) {
  const M = mission, J = M.job, T = JOB_TYPES[J.type], left = Math.max(0, (J.dur || 0) - (M.t || 0)); renderPauseMenu.help = !!help;
  if (help) { $('pmission').innerHTML = `<div class="eyebrow">Szünet</div><div class="pmt">Irányítás</div><div class="pmhelp">${TABS.controls().replace(/<h2>.*?<\/h2>/, '')}</div>`; return; }
  const objL = objectiveLine(M), main = M.phase === 'evac' ? ['Szállj be a furgonba', ''] : objL ? [objL, ''] : J.test ? ['Lőtér: célbábuk, nincs veszély', ''] : ['Éld túl, amíg a furgon visszajön', fmtTime(left)];
  const P = profile, ct = !J.test && P.daily ? P.daily.list.map(c => [c, cProg(c, false)]).filter(([c, p]) => !c.got && p < c.n).sort((a, b) => b[1] / b[0].n - a[1] / a[0].n)[0] : null;
  const cards = [...(J.dir || []).filter(k => DIRECTIVES[k]).map(k => `<div class="pmc dir"><small>Direktíva · ${DIRECTIVES[k].name}</small><span>${DIRECTIVES[k].desc}</span></div>`),
    J.mod && MODS[J.mod] ? `<div class="pmc mod"><small>Módosító · ${MODS[J.mod].label}</small><span>${MODS[J.mod].sub}</span></div>` : '', J.tier ? `<div class="pmc nm"><small>Rémálom +${J.tier}</small><span>Erősebb zombik, jobb zsákmány.</span></div>` : '',
    J.map === featuredMap() ? '<div class="pmc ft"><small>Heti kiemelt pálya</small><span>+25% XP</span></div>' : ''].join('');
  const team = NET.mode ? `<div class="pmteam"><h4>Csapat${NET.code ? ` · ${String(NET.code).split('-')[0].toUpperCase()}` : ''}<small>A csapatban a világ nem áll meg: a zombik közben is jönnek.</small></h4><div class="pmmem">
      <div class="pm" style="--cc:${P.cls ? CLASSES[P.cls].color : '#8a867c'}"><em class="amb">Szünetel</em><b>${esc(P.name)}</b><small>${P.cls ? CLASSES[P.cls].name : ''} · te</small></div>
      ${[...NET.avatars.values()].map(a => `<div class="pm" style="--cc:${a.col}"><em class="${a.down ? 'red' : 'pos'}">${a.down ? 'Leesett' : 'Harcol'}</em><b>${esc(a.name)}</b><small>${Math.round(Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z))} m</small></div>`).join('')}</div></div>` : '';
  const out = [M.parts ? `+${M.parts} ⚙` : '', M.fabric ? `+${M.fabric} ${FAB}` : ''].filter(Boolean).join(' · ') || '—';
  $('pmission').innerHTML = `<div class="eyebrow">Szünet · ${J.test ? 'Lőtér' : `${MAPS[J.map] ? MAPS[J.map].name : ''} · ${J.bounty ? 'Fejvadászat' : T ? T.name : 'Túlélés'} · ${'★'.repeat(J.diff)}`}</div>
    <div class="pmt">${J.title}</div>
    <div class="pmobj"><small>Feladat</small><ul><li><span>${main[0]}</span><b>${main[1]}</b></li>${secRows(J, mission)}${ct ? `<li class="ct"><span>Kontrakt: ${cDef(ct[0], false).txt(ct[0].n)}</span><b>${Math.floor(Math.max(0, ct[1]))} / ${ct[0].n}</b></li>` : ''}</ul></div>
    <div class="pmstats"><div><small>Veszélyszint</small><b class="red">${round}</b></div><div><small>Pont</small><b class="amb">${Math.floor(player.points).toLocaleString('hu-HU')}</b></div><div><small>Ölés</small><b>${player.kills}</b></div><div><small>Idő</small><b>${fmtTime(M.t || 0)}</b></div><div><small>Kijutáskor</small><b>${out}</b></div></div>
    ${cards ? `<div class="pmcards">${cards}</div>` : ''}${team}<div class="pmver">Dead Acre ${GAME_VER}</div>`;
  const q = $('quitBtn2'); q.textContent = J.test ? 'Vissza a bázisra' : quitArmed ? 'Biztos? Feladom' : 'Munka feladása'; q.classList.toggle('armed', quitArmed && !J.test);
  let w = document.querySelector('#pause .pmwarn'); if (!w) { w = document.createElement('div'); w.className = 'pmwarn'; q.after(w); }
  w.hidden = !(quitArmed && !J.test); w.innerHTML = '<b>A munka elbukik</b><span>Nincs fizetség. A munkán talált fegyverek és páncél, valamint a terepen szedett alkatrész elveszik; a sajátjaid megmaradnak.</span>';
}
function doQuit() { // giving up needs a second click; it counts as a failed job. The testing ground: leave any time
  if (mission && mission.job.test) { $('pause').hidden = true; return finishJob(true, true); }
  if (!quitArmed) { quitArmed = true; return renderPauseMenu(); }
  $('pause').hidden = true; finishJob(false, true);
}
$('pause').addEventListener('click', e => { const b = e.target.closest('[data-pm]'); if (!b) return; const a = b.dataset.pm;
  if (a === 'tab-inv' || a === 'tab-char' || a === 'tab-skill') { pinvPage(a.slice(4)); return; }
  if (a === 'fs') { toggleFS(); return; }
  if (a === 'resume') resume(); else if (a === 'inv') pauseMode('inv'); else if (a === 'menu') pauseMode('menu'); else if (a === 'settings') openSettings(); else if (a === 'help') renderPauseMenu(true); else if (a === 'quit') doQuit(); });
function pause(note) {
  if (state !== 'playing' || (mission && mission.leaving)) return;
  state = 'paused'; mouseDown = rmb = false; pausedAt = performance.now(); quitArmed = false;
  $('pauseNote').textContent = note || (noLock ? 'Az egér itt nem zárolható: mozgasd az egeret az ablakon belül, vagy fordulj a nyilakkal.' : '');
  $('pauseInfo').textContent = mission.job.test ? 'Lőtér · a fegyvereidet és a páncélt eldobhatod a társaidnak' : `Munka közben${NET.mode ? ' · a játék nem áll meg a csapatban' : ''}`;
  pauseMode(pauseWant || 'menu'); pauseWant = null;
  $('pause').hidden = false;
}
// the inventory: move guns between hands and bag, drop them, see the gear you found
function ammoRows() { // reserve rounds by family, over the guns in hand and in the bag
  const by = {}; for (const w of [...player.slots, ...player.bag]) if (w) { const k = CAT[w.base.id], e = by[k] || (by[k] = { n: 0, max: 0, guns: [] }); e.n += w.reserve; e.max += resMax(w); e.guns.push(w.base.name); }
  return Object.entries(by).map(([k, e]) => `<div class="amr" style="--ac:${AMMO_COL[k]}"><div><b>${CAT_NAMES[k].replace(/^./, c => c.toUpperCase())}</b><span>${e.n} / ${e.max}</span></div><i><em style="width:${e.max ? e.n / e.max * 100 : 0}%"></em></i><small>${e.guns.join(', ')}</small></div>`).join('') || '<p class="note">Nincs fegyvered.</p>';
}
// an accidental Ctrl+W, F5 or closed tab: during a job the browser asks first; in real fullscreen the keys are caught outright (Chrome, Edge)
addEventListener('beforeunload', e => { if (profile) { e.preventDefault(); e.returnValue = ''; } }); // always ask once a character is loaded, in the hub too
function toggleFS() {
  if (document.fullscreenElement) return document.exitFullscreen();
  const el = document.documentElement; if (!el.requestFullscreen) return;
  el.requestFullscreen().then(() => {
    if (!(navigator.keyboard && navigator.keyboard.lock)) return toast('TELJES KÉPERNYŐ', ['Ez a böngésző nem tudja elkapni a Ctrl+W-t (csak Chrome, Edge, Opera, Brave).', 'Kilépéskor a játék rákérdez, mielőtt bezárnád.'], '#ff8a30', 7000);
    navigator.keyboard.lock().then(() => toast('BILLENTYŰZÁR BE', ['A Ctrl+W, Ctrl+T, Ctrl+N most a játéké, nem zár be semmit.', 'Kilépés a teljes képernyőből: tartsd nyomva az Esc-et, vagy Y.'], '#6fd08a', 6000))
      .catch(err => toast('A BILLENTYŰZÁR NEM ÁLLT BE', [`A böngésző elutasította (${err && err.name || 'ismeretlen ok'}).`, 'Kilépéskor a játék rákérdez, mielőtt bezárnád.'], '#ff5a4a', 8000));
  }).catch(err => toast('NINCS TELJES KÉPERNYŐ', [`A böngésző nem engedte (${err && err.name || 'ismeretlen ok'}).`], '#ff5a4a', 6000));
}
document.addEventListener('fullscreenchange', () => document.querySelectorAll('.fslbl').forEach(s => { const hub = !!s.closest('.hsys'); s.textContent = document.fullscreenElement ? (hub ? 'KILÉPÉS' : 'Kilépés a teljes képernyőből') : (hub ? 'TELJES KÉPERNYŐ' : 'Teljes képernyő'); }));
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-fs]')) toggleFS(); });
// F11 is the browser's own fullscreen: it doesn't catch Ctrl+W. Say so, and point at Y
const IN_APP = /DeadAcreApp/.test(navigator.userAgent); // the desktop app: F11 is its own fullscreen there, and no browser shortcut closes it
const fsWarn = () => { if (IN_APP || performance.now() - (fsWarn.t || -1e9) < 4000) return; fsWarn.t = performance.now(); toast('NE AZ F11-ET HASZNÁLD', ['A böngésző teljes képernyője nem véd: a Ctrl+W így is bezárja a játékot.', 'Nyomd meg az Y gombot: a játék saját teljes képernyője a billentyűket is elkapja.'], '#ff8a30', 7000); SND.deny && SND.deny(); };
addEventListener('keydown', e => { if (e.code === 'F11') { e.preventDefault(); fsWarn(); } }, true);
addEventListener('resize', () => { if (!document.fullscreenElement && innerHeight >= screen.height - 2 && innerWidth >= screen.width - 2) fsWarn(); }); // F11 got through anyway
let pinvTab = 'inv';
const syncGearBag = () => { if (mission) profile.gearBag = mission.gear.filter(it => !it.found); }; // a save mid-job keeps the armour bag right
function pinvPage(t) { pinvTab = t; invSel = ''; document.querySelectorAll('.pinvtabs button').forEach(x => x.classList.toggle('on', x.dataset.pm === 'tab-' + t)); renderPauseInv(); } // the in-game inventory's pages: the kit, or your character in what you wear
function renderPauseChar() {
  const G = profile.gear, MG = mission.gear, test = mission.job.test; let [sl, si] = invSel.split(':');
  const get = () => sl === 'W' ? G[si] : sl === 'M' ? MG[+si] : null;
  if (!get()) { const k = GEAR_KEYS.find(k => G[k]); [sl, si] = k ? ['W', k] : ['M', '0']; invSel = `${sl}:${si}`; }
  const x = get(), worn = GEAR_KEYS.filter(k => G[k]).length, own = MG.filter(it => !it.found).length;
  const destroy = test || !x ? '' : hhold(`Szétszedés (tartsd) +${fieldParts(x.q)} ${FAB}`, `gdestroy:${si}`, false, 'KeyX');
  const detail = !x ? '<div class="invd"></div>' : sl === 'M' ? gearDetail(x, G[x.slot], hbtn('Felveszem', `wear:${si}`, !canUse(x), 'KeyF') + destroy)
    : gearDetail(x, null, hbtn('Leveszem', `unwear:${si}`, false, 'KeyF'));
  const left = `<h3>Viselt <small>${worn} / ${GEAR_KEYS.length}${maxShield() ? ` · pajzs ${Math.round(maxShield())}` : ''}</small></h3><div class="tiles bag" data-drop="W">${GEAR_KEYS.map(k => G[k] ? gTile(`W:${k}`, G[k], { tag: G[k].found ? 'új' : '' }) : emptyTile(`${GEAR_SLOTS[k]} · üres`, '', null, 'W')).join('')}</div>
    <h3>Páncél-táska <small>${own} / ${bagMax()}${MG.length > own ? ` · ${MG.length - own} talált` : ''}</small></h3><div class="tiles bag" data-drop="M">${MG.map((it, k) => gTile(`M:${k}`, it, { cmp: G[it.slot] || null, tag: it.found ? 'új' : '' })).join('') || emptyTile('Üres', '')}</div>`;
  const mid = `<div class="lview pchar"><div id="lookCv"></div></div>`;
  const lo = $('loadout'); keepScroll(lo, () => { lo.innerHTML = invLayout(left, detail, mid); markCta(lo); }); updateKeybar(lo); lookPreview();
}
function renderPauseSkills() { // the skill trees, to look at only: nothing to spend or switch in the field
  const lo = $('loadout'); keepScroll(lo, () => { lo.innerHTML = `<div class="pskill">${skillsTab()}</div>`; });
  lo.querySelectorAll('[data-act]').forEach(b => { const k = b.dataset.act.split(':')[0]; if (k !== 'skview' && k !== 'sknode') { b.disabled = true; b.removeAttribute('data-key'); } });
  lo.querySelectorAll('.ksfoot .sbtn, .kbuild .sbtn, .khead .sbtn, .kabil .sbtn').forEach(b => b.remove()); // no spending, no switching
  updateKeybar(lo);
}
function renderPauseInv() {
  if (pinvTab === 'skill') return renderPauseSkills();
  if (pinvTab === 'char') return renderPauseChar();
  const L = player.slots, B = player.bag, bagFull = B.length >= bagMax(), lone = L.filter(Boolean).length < 2, MG = mission.gear;
  let [sl, si] = invSel.split(':');
  const get = () => sl === 'L' ? L[+si] : sl === 'B' ? B[+si] : null;
  if (!get()) { sl = 'L'; si = String(player.cur); invSel = `L:${si}`; }
  const i = +si, x = get(), tag = w => w.owned ? 'saját' : 'új';
  let detail;
  const test = mission.job.test, destroyBtn = (act, it, off) => test ? '' : hhold(`Szétszedés (tartsd) +${fieldParts(it.q)} ${act[0] === 'g' ? FAB : '⚙'}`, act, off, 'KeyX');
  {
    const acts = sl === 'L' ? hbtn('Táskába', `mv:L:${i}:B`, lone || bagFull, 'KeyF') + hbtn(`${2 - i}. kézbe`, `mv:L:${i}:L:${1 - i}`, false, `Digit${2 - i}`) + hbtn('Eldob', `drop:L:${i}`, lone, 'KeyG') + destroyBtn(`destroy:L:${i}`, x, lone)
      : hbtn(`Kézbe → ${bestHand(L, x) + 1}. kéz`, `mv:B:${i}:L:${bestHand(L, x)}`, !canUse(x), 'KeyF') + hbtn('1. kézbe', `mv:B:${i}:L:0`, !canUse(x), 'Digit1') + hbtn('2. kézbe', `mv:B:${i}:L:1`, !canUse(x), 'Digit2') + hbtn('Eldob', `drop:B:${i}`, false, 'KeyG') + destroyBtn(`destroy:B:${i}`, x, false);
    detail = weaponDetail(x, sl === 'L' ? L[1 - i] : L[player.cur], `<small class="note">${x.owned ? 'Saját' : 'Új: csak evakuálással a tiéd'} · lőszer ${x.ammo}/${x.reserve}</small>${acts}`);
  }
  const bagFree = Math.max(0, bagMax() - B.length), foundG = MG.filter(it => it.found).length;
  const left = `<h3>Kézben <small>${L.filter(Boolean).length} / 2 · görgő vagy 1 / 2</small></h3><div class="tiles hands" data-drop="L">${L.map((w, k) => w ? wTile(`L:${k}`, w, { n: `${k + 1}`, tag: w.owned ? '' : 'új' }) : emptyTile(`${k + 1}. kéz üres`, 'Húzz ide egy fegyvert', null, `L:${k}`)).join('')}</div>
    <h3>Táska <small>${B.length} / ${bagMax()} · a munkán felvett fegyverek</small></h3><div class="tiles bag" data-drop="B">${B.map((w, k) => wTile(`B:${k}`, w, { cmp: curW(), tag: w.owned ? '' : 'új', sub: w.base.name })).join('')}${Array.from({ length: bagFree }, () => emptyTile('Üres', 'F: felvétel a földről', null, 'B')).join('')}</div>`;
  const mid = `<h3>Lőszer <small>tartalék a fegyvereid szerint</small></h3><div class="amrs">${ammoRows()}</div>
    <h3>Tárgyak</h3><div class="itrs">${ITEM_KEYS.map(k => `<div class="itr" style="--ic:${ITEMS[k].color}" data-tip="${itemDesc(k).replace(/"/g, '&quot;')}"><kbd>${ITEMS[k].key}</kbd><span>${itemName(k)}</span><b>${player.inv[k]}</b></div>`).join('')}</div>
    ${test ? '' : `<div class="pout"><small>Kijutáskor a tiéd</small><span>+${mission.parts || 0} ⚙ alkatrész · +${mission.fabric || 0} ${FAB} anyag${foundG ? ` · ${foundG} talált páncél` : ''}${player.bag.filter(w => !w.owned).length ? ` · ${player.bag.filter(w => !w.owned).length} új fegyver` : ''}</span><p>Ha elesel, a talált zsákmány elveszik.</p></div>`}`;
  const lo = $('loadout');
  keepScroll(lo, () => { lo.innerHTML = invLayout(left, detail, mid); markCta(lo); });
  updateKeybar($('loadout'));
}
enableDrag($('pause'), $('loadout'), true);
$('loadout').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || state !== 'paused') return;
  const [kind, f, i, t, j] = b.dataset.act.split(':'), held = curW();
  if (pinvTab === 'skill') { if (kind === 'skview' || kind === 'sknode') { skillAction(kind, f); renderPauseInv(); } return; } // looking only
  if (kind === 'sel') { invSel = b.dataset.act.slice(4); renderPauseInv(); return selDbl($('loadout'), invSel); }
  if (kind === 'mv') moveGun({ L: player.slots, B: player.bag }, f, +i, t, +j);
  if (kind === 'gdrop') { setTimeout(syncGearBag); const it = mission.gear.splice(+f, 1)[0]; if (it) itemFeed('eldobta', it.name, it.q); if (it) netShareDrop('g', it, spawnGearDrop(it, player.pos.clone().add(new V3(rand(-.6, .6), 0, rand(-.6, .6))))); invSel = ''; }
  if (kind === 'destroy') { // parts are paid out only if you extract
    const w = f === 'L' ? player.slots[+i] : player.bag[+i];
    if (!w || (f === 'L' && player.slots.filter(Boolean).length < 2)) return;
    if (f === 'L') player.slots[+i] = null; else player.bag.splice(+i, 1);
    SND.salvage('w'); itemFeed('szétszedte', `${w.name} · +${fieldParts(w.q)} ⚙`, w.unique ? 5 : w.q); mission.parts = (mission.parts || 0) + fieldParts(w.q); (mission.destroyed || (mission.destroyed = [])).push(w); invSel = '';
  }
  if (kind === 'gdestroy') { const it = mission.gear.splice(+f, 1)[0]; if (it) { SND.salvage('g'); itemFeed('szétszedte', `${it.name} · +${fieldParts(it.q)} ${FAB}`, it.q); mission.fabric = (mission.fabric || 0) + fieldParts(it.q); } invSel = ''; syncGearBag(); }
  if (kind === 'wear' || kind === 'unwear') { // swap armor in the field; shield and health keep their share of the new maximum
    const G0 = profile.gear, hpF = player.hp / maxHp(), shF = maxShield() ? player.shield / maxShield() : 1;
    if (kind === 'wear' && mission.gear[+f] && !exoWearOk(profile.gear, mission.gear[+f])) { SND.deny(); popText('Egyszerre csak 1 egzotikus páncél lehet rajtad', '#ff8a70'); return renderPauseInv(); }
    if (kind === 'wear' && mission.gear[+f] && !canUse(mission.gear[+f])) { SND.deny(); popText(`Csak ${mission.gear[+f].level}. szinttől viselhető`, '#ff8a70'); return renderPauseInv(); }
    if (kind === 'wear') { const it = mission.gear.splice(+f, 1)[0], old = G0[it.slot]; G0[it.slot] = it; if (old) mission.gear.push(old); invSel = `W:${it.slot}`; }
    else { mission.gear.push(G0[f]); G0[f] = null; invSel = `M:${mission.gear.length - 1}`; }
    gearChanged(); syncGearBag(); player.hp = Math.max(1, maxHp() * hpF); player.shield = maxShield() * shF;
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
addEventListener('blur', () => pause());

addEventListener('keydown', e => {
  if (document.activeElement === $('chatIn')) return; // typing in the chat
  if (!$('settings').hidden) { if (!bindKey(e) && e.code === 'Escape') closeSettings(); return; }
  const c = keyCode(e.code) || ''; if (c) keys[c] = true;
  if (e.code === 'KeyY' && !e.repeat && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { toggleFS(); return; } // Y: fullscreen, anywhere
  if (state === 'hub' && (e.code === 'KeyQ' || e.code === 'KeyE') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { hubCycle(e.code === 'KeyE' ? 1 : -1); return; }
  if (state === 'hub' && invKey(e, $('hubBody'))) return;
  if (state === 'hub' && e.code === 'Enter' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { const b = document.querySelector(hubTab === 'jobs' ? '#hubBody .jc-foot .sbtn' : hubTab === 'skills' ? '#hubBody .ksfoot .sbtn' : null); if (b) { if (!b.disabled) b.click(); else SND.deny(); return; } }
  if (state === 'hub' && hubTab === 'swheel' && e.code === 'Space') { e.preventDefault(); const b = document.querySelector('#hubBody [data-act="slot"]'); if (b && !b.disabled) b.click(); return; }
  if (state === 'paused' && !$('pause').hidden && $('pause').dataset.mode === 'menu' && e.code === 'Escape' && performance.now() - pausedAt > 400) { resume(); return; }
  if (state === 'paused' && !$('pause').hidden && $('pause').dataset.mode === 'inv' && e.code === 'Escape') { closePauseForClick(); return; } // Esc closes the inventory (the mouse comes back on the next click)
  if (state === 'paused' && !$('pause').hidden && $('pause').dataset.mode === 'inv' && (e.code === 'KeyQ' || e.code === 'KeyE')) { const T = ['inv', 'char', 'skill']; pinvPage(T[(T.indexOf(pinvTab) + (e.code === 'KeyE' ? 1 : 2)) % 3]); return; }
  if (state === 'paused' && !$('pause').hidden && $('pause').dataset.mode === 'inv' && invKey(e, $('loadout'))) return;
  if (state === 'station' && (e.code === 'Escape' || e.code === 'KeyE')) { closeStation(e.code === 'Escape'); return; }
  if (state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP') && noLock) { resume(); return; }
  if (state === 'paused' && e.code === 'Escape' && !$('pause').hidden && performance.now() - pausedAt > 400) { closePauseForClick(); return; }
  if (e.code === 'Tab') e.preventDefault();
  if (state === 'paused' && (c === 'KeyI' || e.code === 'Tab')) { if ($('pause').dataset.mode === 'menu') pauseMode('inv'); else resume(); return; }
  if (state === 'playing' && (c === 'KeyI' || e.code === 'Tab') && !(mission && mission.leaving)) { pauseWant = 'inv'; if (locked) document.exitPointerLock(); else pause(); return; }
  if (state !== 'playing' || (mission && mission.leaving) || player.down) return;
  if (player.ffyl > 0 && !['KeyR', 'Digit1', 'Digit2', 'Escape', 'KeyP', 'KeyZ'].includes(c)) return; // on the ground: shoot, reload, swap
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat && c !== 'Space') return; // a held key fires once
  if (player.carry != null && ['KeyR', 'Digit1', 'Digit2', 'KeyH', 'KeyG', 'KeyQ', 'KeyT', 'KeyV', 'KeyC'].includes(c)) { SND.deny(); return popText('Mindkét kezed a ládán · E: letétel', '#ff8a70'); }
  if (c === 'KeyR') startReload();
  else if (c === 'KeyE') interact();
  else if (c === 'Digit1') switchTo(0);
  else if (c === 'Digit2') switchTo(1);
  else if (c === 'KeyH') useItem('med');
  else if (c === 'KeyG') useItem('gren');
  else if (c === 'KeyQ') useItem('knife');
  else if (c === 'KeyT') useItem('adren'); // X is for taking loot apart
  else if (c === 'KeyV') knife();
  else if (c === 'KeyC') useAbility();
  else if (c === 'Digit3') useCross();
  else if (c === 'KeyZ') doPing();
  else if (e.code === 'F1') { e.preventDefault(); showHelp(10); }
  else if ((e.code === 'Escape' || e.code === 'KeyP') && !locked) pause();
});

addEventListener('keyup', e => { const c = keyCode(e.code); if (c) keys[c] = false; });
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
  if ((state !== 'playing' && state !== 'intro') || !(locked || noLock)) return; // in the van you can look around
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
    p.s.position.y = (p.cat ? .6 : 1.1) + Math.sin(now * 3) * .15; p.s.visible = p.t > 6 || Math.sin(now * 16) > 0;
    if (Math.hypot(p.s.position.x - player.pos.x, p.s.position.z - player.pos.z) < 1.4 && (p.type !== 'ammo' || ammoFits(p))) { takePower(p); p.t = 0; }
    if (p.t <= 0) { scene.remove(p.s); if (!p.cat) { p.s.material.map.dispose(); p.s.material.dispose(); } powerUps.splice(i, 1); } // ammo icons are shared
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
function gearGroundCard(it, act) { // armor on the ground: the same card as a gun, with its armor against what you wear
  const B = BRANDS[it.brand], worn = profile.gear[it.slot], d = worn ? it.armor - worn.armor : 0;
  return `<div class="gck" style="color:${gCol(it)}">${it.exo ? 'Egzotikus' : RARITIES[it.q].name} · Lv ${it.level} · a földön${rollTagP(gRoll(it))}</div><div class="gcn">${it.name}</div>
    <div class="gcs">${GEAR_SLOTS[it.slot]} · ${it.exo ? 'egzotikus, bármely márkához számít' : `<span style="color:${B.color}">${B.name}</span> · ${B.tag}`}</div>
    <div class="gcst"><div><small>Páncél</small><b>${it.armor}${d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>` : ''}</b></div>${it.exo ? '' : `<div><small>${GSTATS[B.core[0]].name}</small><b>${fmtG(B.core[0], coreVal(it))}</b></div>`}${Object.entries(it.stats).slice(0, 1).map(([k, v]) => `<div><small>${GSTATS[k].name}</small><b>${fmtG(k, v)}</b></div>`).join('')}</div>
    ${it.exo && EXOTICS[it.exo] ? `<div class="gcx" style="color:${EXO_COL}">${EXOTICS[it.exo].talent}</div>` : ''}
    <div class="act">${act}</div>`;
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
  const el = w.element ? ELEMENTS[w.element] : null, cc = c && c !== w ? c : null;
  const st = (lbl, v, shown, cv, low) => { const d = cc == null ? 0 : v - cv, good = low ? d < 0 : d > 0; return `<div><small>${lbl}</small><b>${shown}${cc && Math.abs(d) > 1e-6 ? `<em class="${good ? 'up' : 'down'}">${good ? '▲' : '▼'}${Math.abs(+d.toFixed(1))}</em>` : ''}</b></div>`; };
  return `<div class="gck">${w.unique ? 'Egzotikus' : RARITIES[w.q].name} · Lv ${w.level} · a földön${rollTag(w)}</div><div class="gcn">${w.name}</div>
    <div class="gcs">${w.base.name} · ${w.maker}${el ? ` · <span style="color:${el.color}">${el.name}</span>` : ''}</div>
    <div class="gcst">${st('DPS', dps(w), dps(w), cc && dps(cc))}${st('Tár', w.mag, w.mag, cc && cc.mag)}${st('Pontosság', accuracy(w), accuracy(w) + '%', cc && accuracy(cc))}</div>
    ${w.unique && UNIQUES[w.unique] ? `<div class="gcx" style="color:#ff5a4a">${UNIQUES[w.unique].name}: ${UNIQUES[w.unique].trick}</div>` : w.tal && TALENTS[w.tal] ? `<div class="gcx" style="color:#ffd23f">${TALENTS[w.tal].name}: ${TALENTS[w.tal].desc}</div>` : ''}
    <div class="act">${action}</div>`;
}
let contractSeen = null;
function contractWatch() { // a contract finished during a job: say so (claim it at the base)
  const P = profile; if (!P || !P.daily || !mission || mission.job.test) return;
  const done = [...P.daily.list.map(c => [c, false]), P.weekly ? [P.weekly.c, true] : null].filter(Boolean).filter(([c, w]) => !c.got && cProg(c, w) >= c.n).map(([c]) => c.txt || c.id);
  if (contractSeen) for (const t of done) if (!contractSeen.includes(t)) toast('KONTRAKT TELJESÍTVE', [`${t}`, 'A jutalmat a bázison veheted át (Munkák).'], '#9dff6a', 5000);
  contractSeen = done;
}
function modHudText() { // what makes this job harder or richer, for the corner of the screen
  const J = mission && mission.job; if (!J || J.test) return '';
  const L = []; if (J.mod && MODS[J.mod]) L.push(`<b>${MODS[J.mod].label}</b><small>${MODS[J.mod].sub}</small>`);
  for (const k of J.dir || []) if (DIRECTIVES[k]) L.push(`<b class="dir">${DIRECTIVES[k].name}</b>`);
  if (J.tier) L.push(`<b class="nm">Rémálom +${J.tier}</b>`); if (J.map === featuredMap()) L.push('<b class="ft">Heti kiemelt pálya · +25% XP</b>');
  return L.join('');
}
// what is working for (or against) you right now, as small icons over the item bar (Borderlands style): a timer or a stack count
function buffIcons(w) {
  const B = player.buf || {}, L = [], seen = player.bufSeen || (player.bufSeen = {}), add = (ic, name, col, v, max) => { const key = name.split(':')[0]; if (!seen[key] || now - seen[key].last > 1) seen[key] = { t: now }; seen[key].last = now; L.push(`<span class="bf${/Lelassítva/.test(name) ? ' bad' : ''}" style="--bc:${col}" data-tip="${name}">${now - seen[key].t < 2.5 ? `<em>${key}</em>` : ''}<i>${ic}</i>${v != null ? `<b>${v}</b>` : ''}${max ? `<u style="width:${clamp(v / max, 0, 1) * 100}%"></u>` : ''}</span>`); };
  const sec = t => Math.max(0, Math.ceil(t));
  if (player.adrenT > 0) { const S = STIM_TYPES[player.stimK || 'adren']; add(S.ic, `${S.name}: ${S.desc.replace(/^\d+ mp: /, '')}`, S.col, sec(player.adrenT), S.t); }
  if (player.regenT > 0) add('+', 'Regenerálás', '#ff5a5a', sec(player.regenT), 6);
  if (now < (player.guardT || 0)) add('▲', 'Harci csomag: fele sebzés', '#ff9a7a', sec(player.guardT - now), 4);
  if (player.stormT > 0) add('∞', 'Tűzvihar: nem fogy a tár', '#ff8a3a', sec(player.stormT), 11);
  if (player.eyeT > 0) add('◎', 'Halálszem: amit eltalálsz, megjelölődik', '#b46cff', sec(player.eyeT), 20);
  if (now < (player.overT || 0)) add('↯', 'Pörgés: +40% tűzgyorsaság', '#ffd23f', sec(player.overT - now), 8);
  if (powers.insta > 0) add('✖', 'Insta-Kill', '#b6ff8a', sec(powers.insta), 15);
  if (powers.double > 0) add('2×', 'Dupla pont', '#b6ff8a', sec(powers.double), 15);
  if (w && w.tal === 'frenzy' && now < (player.frenzyT || 0)) add('✦', 'Vérszomj: +20% sebzés', '#ff5a4a', sec(player.frenzyT - now), 5);
  if (w && w.tal === 'bread' && player.bread) add('◐', 'Kenyérkosár: a következő fejlövés +40%', '#ffd23f');
  if (w && w.tal === 'optimist') add('▼', `Optimista: +${Math.round(30 * (1 - w.ammo / Math.max(1, w.mag)))}% sebzés`, '#9fd0ff', `${Math.round(30 * (1 - w.ammo / Math.max(1, w.mag)))}%`);
  if (w && w.anoint === 'reload' && B.reload > 0) add('✧', `${anoName('reload')}: +50% sebzés`, '#6ff0c8', sec(B.reload), 5);
  if (w && w.anoint === 'swap' && B.swap > 0) add('✧', `${anoName('swap')}: +40% sebzés`, '#6ff0c8', sec(B.swap), 4);
  if (w && w.anoint === 'ability' && B.ability > 0) add('✧', `${anoName('ability')}: +50% tűzgyorsaság`, '#6ff0c8', sec(B.ability), 8);
  if (w && w.anoint === 'first' && (w.fired || 0) < 3) add('✧', `${anoName('first')}: dupla sebzés`, '#6ff0c8', 3 - (w.fired || 0));
  if (w && w.anoint === 'lowhp' && player.hp < maxHp() * .35) add('✧', `${anoName('lowhp')}: +60% sebzés`, '#6ff0c8');
  if (w && w.unique === 'hydra' && now < (player.hydraUntil || 0)) add('∞', 'Hidra: nem fogy a tár', '#ff3b3b', sec(player.hydraUntil - now), 3);
  if (w && w.unique === 'reaper' && player.uStack) add('☠', 'Kaszás: halmozott sebzés', '#ff3b3b', player.uStack);
  if (player.bloodN && now < (player.bloodT || 0)) add('♦', `Vérszomj (Gravetide): +${5 * player.bloodN}% sebzés`, '#e06a58', player.bloodN);
  if (typeof exoOn === 'function' && exoOn('berserk') && player.hp < maxHp()) add('♥', `Berzerker: +${Math.round(50 * (1 - player.hp / maxHp()))}% sebzés`, '#ff5a3a', `${Math.round(50 * (1 - player.hp / maxHp()))}%`);
  if (player.chillT > 0) add('❄', 'Lelassítva', '#8ff0ff', sec(player.chillT), 3);
  return L.join('');
}
function updateHUDFx(dt) { if (typeof updateRemoteAuras === 'function') updateRemoteAuras(dt); }
function updateHUD() {
  if ((updateHUD.cw = (updateHUD.cw || 0) + 1) % 60 === 0) contractWatch();
  if (updateHUD.cw % 300 === 0 && profile.inMission && mission) { profile.inMission.alone = !NET.mode || NET.avatars.size === 0; markCarry(); } // were you the last one there?
  const w = curW();
  focus = findFocus();
  highlightDrops(focus && (focus.drop ? focus.drop.g : focus.gd ? focus.gd.g : null));
  let card = '', prompt = '';
  if (focus) {
    if (focus.type === 'gear') { const worn = profile.gear[focus.it.slot], full = mission.gear.length >= gearBagMax(), out = full && gearSwapOut(focus.it);
      card = gearGroundCard(focus.it, (full ? `<span class="bagfull"><b>TELE A PÁNCÉLZSÁK ${mission.gear.length}/${gearBagMax()}</b><span><kbd>F</kbd>Csere: <i style="color:${RARITIES[out.q].color}">${out.name}</i> a földre kerül</span></span>`
        : `<span><kbd>F</kbd>A zsákba ${mission.gear.length}/${gearBagMax()}</span>`) + `<span>Viselt: ${worn ? `${worn.name} · ${worn.armor} páncél` : 'semmi'}</span>` + scrapHint(focus.it.q, true), true); }
    else if (focus.w) { const ok = canUse(focus.w), bagTxt = player.bag.length < bagMax() ? `Táskába ${player.bag.length}/${bagMax()}` : 'Tele a táska';
      card = cardHTML(focus.w, (ok ? `<span><kbd>F</kbd>${player.slots.includes(null) ? 'Kézbe' : bagTxt}</span><span><kbd>F</kbd>tartsd: Csere</span>` : `<span class="lvlock"><kbd>F</kbd>${bagTxt} · ${focus.w.level}. szinttől használhatod</span>`) + scrapHint(focus.w.q), curW()); }
    else if (focus.type === 'cache') prompt = '<b>[E]</b> Utánpótlás-láda kinyitása';
    else if (focus.type === 'revive') prompt = `<b>[E]</b> nyomva: ${esc(focus.name)} felélesztése`;
    else if (focus.type === 'res') prompt = `<b>[F]</b> ${focus.rd.n} ${focus.rd.k === 'fabric' ? FAB + ' anyag' : '⚙ alkatrész'} felvétele`;
    else if (focus.type === 'crate') prompt = '<b>[E]</b> Láda felvétele (két kézzel)';
    else if (focus.type === 'carry') prompt = mission.drop && Math.hypot(mission.drop.pos.x - player.pos.x, mission.drop.pos.z - player.pos.z) < 5 ? '<b>[E]</b> Láda leadása' : '<b>[E]</b> Láda letétele';
    else if (focus.type === 'desk') prompt = NET.client ? 'Lőtér-vezérlő · csak a vezető állíthatja' : '<b>[E]</b> Lőtér-vezérlő: a célbábuk rangja, fajtája, tulajdonsága';
    else if (focus.type === 'repair') prompt = focus.gi != null ? `<b>[E]</b> nyomva: ${mission.gens[focus.gi].name} generátor javítása · +5%/mp · ${genRepCost()} pont/mp${player.points < genRepCost() ? ' (kevés a pont)' : ''}` : `<b>[E]</b> Túlélő ellátása (+25%) · ${GEN_REPAIR} pont${player.points < GEN_REPAIR ? ' (kevés a pont)' : ''}`;
    else if (!['box', 'ammo', 'drop', 'gear', 'desk', 'carry', 'res'].includes(focus.type)) prompt = areaPrompt(focus);
    else if (focus.type === 'box') prompt = box.state === 'spin' ? 'A doboz pörög…' : `<b>[E]</b> Rejtélyes doboz · ${SK.cost(BOX_COST)} pont${player.points < SK.cost(BOX_COST) ? ' (kevés a pont)' : ''}`;
    else if (focus.type === 'ammo') prompt = `<b>[E]</b> Lőszer feltöltése · ${SK.cost(AMMO_COST)} pont${w.reserve >= resMax(w) ? ' (tele)' : player.points < SK.cost(AMMO_COST) ? ' (kevés a pont)' : ''}`;
  }
  setHTML('card', card); $('card').hidden = !card;
  if (focus && (focus.w || focus.it)) $('card').style.setProperty('--rc', focus.w ? rarColor(focus.w) : gCol(focus.it));
  { const hp = xHold > 0 ? xHold / HOLD_T : fHold > .12 && !fLatch ? fHold / SWAP_HOLD : 0, C = $('card'); C.style.setProperty('--hp', Math.min(1, hp)); C.classList.toggle('hx', xHold > 0); C.classList.toggle('hf', !(xHold > 0) && hp > 0); } // red sweep: taking it apart, green: swapping
  setHTML('prompt', prompt.replace(/<b>\[(\w+)\]<\/b>/g, '<kbd class="pk">$1</kbd>')); $('prompt').hidden = !prompt; // [E] as a key cap

  setHTML('points', `${Math.floor(player.points).toLocaleString('hu-HU')}<small>PONT</small>`);
  if (profile && profile.cls) {
    const C = CLASSES[profile.cls], cd = player.abilCd, active = abilActive();
    setHTML('ability', `<span class="abtx"><b>${C.ability.name}</b><small>${active ? 'aktív' : cd > 0 ? Math.ceil(cd) + ' mp' : 'kész'}</small></span><span class="abring" style="--p:${Math.round((active ? 1 : clamp(1 - cd / (abilityCd() || 1), 0, 1)) * 100)}%"><kbd>C</kbd></span>`);
    $('ability').className = cd > 0 && !active ? 'cd' : 'ready'; $('ability').style.setProperty('--cc', C.color);
  } else setHTML('ability', '');
  $('hpfill').style.width = player.hp / maxHp() * 100 + '%'; $('hplag').style.width = player.hp / maxHp() * 100 + '%'; // the red lag bar catches up late (CSS)
  $('stamfill').style.width = (stimOn('adren') ? 100 : player.stam / maxStam() * 100) + '%';
  $('stam').classList.toggle('full', !stimOn('adren') && player.stam >= maxStam() - .5);
  $('hp').classList.toggle('low', player.hp / maxHp() < .3);
  $('hud').classList.toggle('ads', player.ads > .6);
  $('shield').hidden = !maxShield(); $('shieldfill').style.width = (maxShield() ? player.shield / maxShield() * 100 : 0) + '%';
  setHTML('hpn', Math.ceil(player.hp)); setHTML('shn', maxShield() ? Math.ceil(player.shield) : '');
  if (!locked && !noLock && !lockPending && !needClick) { needClick = true; $('clickHint').hidden = false; } // lost the mouse somehow: say so
  $('adsDot').style.opacity = player.ads > .6 && !w.base.scopeView ? 1 : 0;
  $('vig').style.opacity = clamp((1 - player.hp / maxHp()) * 1.1, 0, .7);
  $('eyefx').classList.toggle('on', player.eyeT > 0); $('aurafx').classList.toggle('on', inHolyAura());
  if (mission) {
    const M = mission, left = Math.max(0, M.job.dur - M.t);
    const noc = noClock(M.job) && !objDone(M);
    setHTML('timer', M.phase === 'evac' ? (M.boardT > 0 ? fmtTime(M.boardT) : truck.parked ? fmtTime(Math.max(0, 45 - (M.parkT || 0))) : '0:00') : noc ? fmtTime(M.t) : fmtTime(left));
    setHTML('timerLbl', M.job.test ? 'LŐTÉR' : M.phase === 'evac' ? (M.boardT > 0 ? 'BESZÁLLÁS' : truck.parked ? 'A FURGON INDUL' : 'JÖN A FURGON') : noc ? (objectiveTimer(M) || 'ELTELT IDŐ') : M.evacWarn ? 'A FURGON ÚTON' : 'A FURGONIG');
    $('timer').classList.toggle('evac', M.phase === 'evac'); $('timerLbl').classList.toggle('evac', M.phase === 'evac' || !!M.evacWarn);
    setHTML('left', M.phase === 'lull' ? `Pihenő · ${Math.ceil(M.phaseT)} mp` : M.phase === 'evac' ? (M.boardWarn ? 'MEGÁLLT: vissza a furgonhoz!' : truck.parked ? '[E] beszállás · maradj a furgonnál' : 'menj a zöld jelzéshez') : `${M.wave}. hullám · ${alive()} zombi a pályán`);
    { // the objective tracker: the job, what to do, and a contract that is close
      const J = M.job, T = J.test ? 'Lőtér' : J.bounty ? 'Fejvadászat' : JOB_TYPES[J.type] ? JOB_TYPES[J.type].name : 'Túlélés';
      setHTML('objK', `${J.test ? 'Lőtér' : MAPS[J.map].name} · ${T}${J.test ? '' : ` · ${'★'.repeat(J.diff)}`}`); setHTML('objN', J.title);
      const main = M.phase === 'evac' ? ['Szállj be a furgonba', M.boardT > 0 ? `${Math.ceil(M.boardT)} mp` : ''] : objectiveLine(M) ? (L => { const m = L.match(/^(.*?) · (\d+ \/ \d+[^·]*)(.*)$/); return m ? [m[1] + m[3], m[2]] : [L, '']; })(objectiveLine(M)) : ['Éld túl, amíg a furgon visszajön', fmtTime(left)];
      const P = profile, ct = !J.test && P.daily ? P.daily.list.map(c => [c, cProg(c, false)]).filter(([c, p]) => !c.got && p < c.n).sort((a, b) => b[1] / b[0].n - a[1] / a[0].n)[0] : null;
      setHTML('objL', `<li><span>${main[0]}</span><b>${main[1]}</b></li>${secRows(J, mission)}${ct ? `<li class="ct"><span>Kontrakt: ${cDef(ct[0], false).txt(ct[0].n)}</span><b>${Math.floor(Math.max(0, ct[1]))} / ${ct[0].n}</b></li>` : ''}`);
      setHTML('objD', [...(J.dir || []).filter(k => DIRECTIVES[k]).map(k => `<i data-tip="${DIRECTIVES[k].desc}">${DIRECTIVES[k].name}</i>`), J.mod && MODS[J.mod] ? `<i class="mod" data-tip="${MODS[J.mod].sub}">${MODS[J.mod].label}</i>` : '', J.tier ? `<i class="nm">Rémálom +${J.tier}</i>` : ''].join(''));
    }
    updateEvacMark(M.phase === 'evac' || !!M.evacWarn);
  }
  setHTML('wname', `<span class="lvtag" style="--rc:${rarColor(w)}">Lv ${w.level}</span><span style="color:${rarColor(w)}">${w.name}</span>`);
  setHTML('wsub', `${w.unique ? 'Egzotikus' : RARITIES[w.q].name} · ${w.base.name}${w.element ? ` · <span style="color:${ELEMENTS[w.element].color}">${ELEMENTS[w.element].name}</span>` : ''}`);
  const lowAmmo = w.ammo === 0 || (w.mag > 3 && w.ammo <= Math.ceil(w.mag * .25)); // a one-bolt crossbow is never 'low'
  setHTML('mag', w.ammo); $('mag').classList.toggle('low', lowAmmo);
  setHTML('res', '/ ' + w.reserve); $('res').classList.toggle('none', w.reserve === 0);
  $('magfill').style.width = clamp(w.ammo / Math.max(1, w.mag), 0, 1) * 100 + '%'; $('magbar').classList.toggle('low', lowAmmo);
  const hint = player.reloading ? 'Újratöltés…' : w.ammo === 0 && w.reserve === 0 ? 'Nincs lőszer' : lowAmmo && w.reserve > 0 ? 'R · Újratöltés' : '';
  setHTML('hint', hint);
  $('rlhint').hidden = !hint || player.ads > .6; $('rlhint').firstChild.textContent = hint;
  $('rlfill').style.width = player.reloading ? reloadProgress() * 100 + '%' : '0';
  setHTML('powers', Object.keys(player.perks || {}).filter(k => player.perks[k] && PERKS[k]).map(k => `<span class="pw perk" style="color:#${PERKS[k].color.toString(16).padStart(6, '0')}">${PERKS[k].name}</span>`).join(''));
  setHTML('buffs', buffIcons(w));
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
  const b = el.firstChild, want = off ? 'arrow' : 'down'; if (b.dataset.ic !== want) { b.dataset.ic = want; b.innerHTML = ic(want); } b.style.transform = off ? `rotate(${Math.atan2(-y, x)}rad)` : '';
  const dist = Math.round(Math.hypot(truck.pos.x - player.pos.x, truck.pos.z - player.pos.z));
  el.lastChild.textContent = truck.parked && dist < 5 ? '[E] Beszállás' : `Furgon · ${dist} m`;
}

// ================= LOOP =================
let now = 0, last = performance.now();
loadMap('farm', 1234);
refreshMenu();

let slowmo = 0; // a moment of slow motion (a bounty falls)
let fpsN = 0, fpsT = 0;
function frame(t) { requestAnimationFrame(frame); gameStep(t); }
// a party's leader in a hidden tab (alt-tab, another tab): the browser stops animation frames, so a worker's clock keeps the world going for everyone
{ try { const wk = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'], { type: 'text/javascript' })));
  wk.onmessage = () => { if (document.hidden && NET.mode === 'host' && mission && liveWorld()) gameStep(performance.now()); }; } catch (e) {} }
function gameStep(t) {
  const cap = FPS_CAPS[SET.fpsCap] || 0; if (cap && t - last < 1000 / cap - 1) return; // the frame limiter: skip until the next slot
  let dt = Math.min(.05, (t - last) / 1000); last = t;
  fpsN++; if (t - fpsT > 500) { const e = $('fps'); e.hidden = !SET.showFps; if (SET.showFps) e.textContent = `${Math.round(fpsN * 1000 / (t - fpsT))} FPS`; fpsN = 0; fpsT = t; }
  if (slowmo > 0) { slowmo -= dt; dt *= .35; }
  netTick(dt); updateHUDFx(dt);
  if (state === 'menu' || state === 'hub' || state === 'results') {
    now += dt;
    camera.position.set(Math.sin(now * .05) * 22, 5.5, Math.cos(now * .05) * 22);
    camera.lookAt(0, 1.5, 0);
    if (box.label) box.label.position.y = 2.1 + Math.sin(now * 2) * .12;
  } else if (state === 'intro') {
    now += dt; updateIntro(dt); updateMapFx(dt);
  } else if (state === 'playing' || netLive()) {
    now += dt;
    if (state === 'playing' && !(mission && mission.leaving)) updatePlayer(dt); // the ride out moves the camera itself
    else if (state !== 'paused' && (player.ads || camera.fov !== SET.fov)) { player.ads = 0; camera.fov = SET.fov; camera.updateProjectionMatrix(); } // no zoom left over in the van
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
    updateItemDrops(dt); updateGearDrops(dt); updateResDrops(dt); updatePings(dt); updateMatesHud(); updateCompass();
    updateAreas(dt); if (mission) updateCache(mission, dt);
    updateMapFx(dt);
    if (state === 'playing') updateSellHold(dt);
    if (state === 'playing') updateHealthBars();
    if (hitmT > 0 && (hitmT -= dt) <= 0) $('hitm').classList.remove('on');
    if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').style.opacity = 0;
    if (flashT > 0) { flashT -= dt; $('flash').style.opacity = Math.max(0, flashT * 1.6); }
    if (state === 'playing') { updateHUD(); tickStats(dt); }
    if (state === 'paused' && !$('pause').hidden && $('pause').dataset.mode === 'menu' && !renderPauseMenu.help && (step.pm = (step.pm || 0) + dt) > .5) { step.pm = 0; renderPauseMenu(); } // in a party the clock keeps running on the pause screen
  }
  playMusic(['menu', 'hub', 'results'].includes(state) ? 'hub' : MUSIC[MAP_ID] ? MAP_ID : 'farm');
  const kb = (state === 'hub' || (state === 'paused' && !$('pause').hidden && $('pause').dataset.mode === 'inv')) && $('settings').hidden && $('keybar').innerHTML !== '';
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
  const w = f.type === 'drop' ? f.drop.w : box.weapon, exoOk = exoHandOk(player.slots, w, player.slots.indexOf(null) >= 0 ? player.slots.indexOf(null) : swap ? player.cur : -1), ok = canUse(w) && exoOk, hand = ok ? player.slots.indexOf(null) : -1;
  if (!ok) swap = false; // above your level: it can only ride in the bag
  if (!swap && hand < 0 && player.bag.length >= bagMax()) { popText(ok ? 'Tele a táska · tartsd nyomva az F-et a cseréhez' : `${w.level}. szintű: csak a táskába teheted, de tele van`, '#ff8a70'); return SND.deny(); }
  if (f.type === 'drop') { netTookDrop(f.drop); removeDrop(f.drop); } else { box.state = 'idle'; scene.remove(box.show); box.show = null; boxUsed(); }
  focus = null; itemFeed('felvette', w.name, w.unique ? 5 : w.q); if (w.unique || w.q >= 3) toast(w.unique ? 'EGZOTIKUS FEGYVER' : `${RARITIES[w.q].name.toUpperCase()} FEGYVER`, [`${w.name} · Lv ${w.level} · DPS ${dps(w)}`, w.unique && UNIQUES[w.unique] ? UNIQUES[w.unique].trick : w.tal && TALENTS[w.tal] ? `Tehetség: ${TALENTS[w.tal].name}` : ''], rarColor(w));
  if (swap || hand >= 0) return giveWeapon(w);
  player.bag.push(w); trackBest(w); noteFound(w); SND.pickup(w.q);
  popText(ok ? `${w.name} a táskába (${player.bag.length}/${bagMax()})` : !exoOk ? `${w.name} a táskába · egyszerre csak 1 egzotikus fegyver lehet kézben` : `${w.name} a táskába · ${w.level}. szinttől használhatod`, ok ? rarColor(w) : '#ff8a70');
}
let reviveHold = 0, xHold = 0;
const scrapHint = (q, gear) => mission && mission.job.test ? '' : `<span class="scrap"><kbd>X</kbd>tartsd: szétszedés +${fieldParts(Math.min(4, q))} ${gear ? FAB : '⚙'}</span>`;
function scrapGround(f) { // parts are paid out only if you extract, like taking it apart from the bag
  const it = f.type === 'gear' ? f.gd.it : f.drop.w, q = it.unique ? 5 : it.q;
  if (f.type === 'gear') { netTookDrop(f.gd); removeGearDrop(f.gd); } else { netTookDrop(f.drop); removeDrop(f.drop); }
  const gear = f.type === 'gear', n = fieldParts(Math.min(4, q)), u = gear ? FAB : '⚙'; if (gear) mission.fabric = (mission.fabric || 0) + n; else mission.parts = (mission.parts || 0) + n;
  itemFeed('szétszedte', `${it.name} · +${n} ${u}`, q); SND.salvage(gear ? 'g' : 'w'); popText(`${it.name} szétszedve · +${n} ${u} kijutáskor`, '#c8c0a8');
}
function updateSellHold(dt) {
  if (focus && focus.type === 'revive') { // hold E next to a downed mate
    if (keys.KeyE) { reviveHold += dt; if (reviveHold >= reviveT()) { reviveMate(focus.peer); reviveHold = 0; } } else reviveHold = 0;
    $('hold').hidden = reviveHold <= 0; $('holdLbl').textContent = 'Felélesztés…'; $('holdfill').style.width = reviveHold / reviveT() * 100 + '%'; return;
  }
  reviveHold = 0;
  const repOn = !!(focus && focus.type === 'repair' && focus.gi != null && keys.KeyE && mission.gens[focus.gi].hp < mission.gens[focus.gi].max); showWrench(repOn, dt);
  if (focus && focus.type === 'repair' && focus.gi != null) { const on = keys.KeyE && holdRepair(focus.gi, dt); $('hold').hidden = !on; if (on) { const G = mission.gens[focus.gi]; $('holdLbl').textContent = `${G.name} generátor javítása…`; $('holdfill').style.width = G.hp / G.max * 100 + '%'; } return; }
  if (focus && (focus.type === 'gear' || focus.type === 'drop') && !mission.job.test && keys.KeyX) { // hold X over loot on the ground: take it apart for parts
    xHold += dt; $('hold').hidden = false; $('holdLbl').textContent = 'Szétszedés…'; $('holdfill').style.width = Math.min(1, xHold / HOLD_T) * 100 + '%';
    if (xHold >= HOLD_T) { scrapGround(focus); xHold = 0; focus = null; fLatch = true; }
    return;
  }
  xHold = 0;
  if (focus && focus.type === 'res') { if (keys.KeyF && !fLatch) { takeRes(focus.rd); focus = null; fLatch = true; } else if (!keys.KeyF) fLatch = false; $('hold').hidden = true; return; }
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

// the controls card: on the first job, in the testing ground, and on F1
let helpT = 0;
function showHelp(sec) { const h = $('helpcard'); h.querySelectorAll('[data-k]').forEach(k => k.textContent = keyName(boundKey(k.dataset.k))); h.hidden = false; h.classList.remove('fade'); clearTimeout(helpT); helpT = setTimeout(() => { h.classList.add('fade'); helpT = setTimeout(() => h.hidden = true, 700); }, sec * 1000); }
