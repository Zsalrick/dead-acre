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
  avatars: new Map(), zById: new Map(), job: null, seenJs: 0, hadHost: false,
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
  Object.assign(NET, { pr, code, host, hadHost: false, seenJs: 0, last: {}, dirty: true });
  pr.onPeers(() => onPartyChange(), () => partyLeave());
  publishMember(); setLobby();
  if (state === 'hub') renderHub();
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
  return NET.pr.peers().filter(p => p.presence && p.presence.m).map(p => ({ peer: p.peer, me: p.sameTab, n: p.presence.m.n, lv: +p.presence.m.lv || 1, c: p.presence.m.c, h: !!p.presence.m.h, st: p.presence.m.st }));
}
function onPartyChange() {
  const k = JSON.stringify(partyMembers().map(m => [m.n, m.lv, m.c, m.h, m.st]));
  if (k === NET.keyParty) return; NET.keyParty = k;
  if (NET.host) setLobby();
  if (state === 'hub') renderHub();
}
function publishMember() {
  if (!NET.pr) return;
  NET.pr.presence({ m: { n: myName().slice(0, 24), lv: profile ? profile.level : 1, c: profile && profile.cls, h: NET.host ? 1 : 0, st: mission ? 'job' : 'base' }, job: NET.host ? NET.job : null }).catch(() => {});
}
function partyPanel() {
  if (!NET.room) return `<div class="party off"><b>Többjátékos</b><span>A csapatjáték a claude.ai-on, bejelentkezve működik: oszd meg a játékot a barátaiddal, és ők is megnyithatják.</span></div>`;
  if (NET.joining) return `<div class="party"><b>Csatlakozás…</b></div>`;
  if (NET.p2p && !NET.code) return `<div class="party"><div class="phead"><b>Csapat</b>${hbtn('Csapat létrehozása', 'pcreate')}</div>
    <div class="pjoin"><input id="pcode" maxlength="5" placeholder="KÓD" autocomplete="off" spellcheck="false">${hbtn('Csatlakozás kóddal', 'pjoinc')}</div>
    ${NET.joinErr ? `<span class="note perr">${esc(NET.joinErr)}</span>` : '<span class="note">Hozz létre csapatot, és add meg a kódot a barátodnak, vagy írd be az övét.</span>'}</div>`;
  if (!NET.code) {
    const open = openParties();
    return `<div class="party"><div class="phead"><b>Csapat</b>${hbtn('Csapat létrehozása', 'pcreate')}</div>
      ${open.length ? `<div class="plist">${open.map(o => `<div class="prow"><span><b>${esc(o.n)}</b> csapata · ${o.m} fő · ${o.lv}. szint</span>${hbtn('Csatlakozás', `pjoin:${o.pc}`)}</div>`).join('')}</div>`
        : '<span class="note">Most nincs nyitott csapat. Hozz létre egyet, és a barátaid csatlakozhatnak.</span>'}</div>`;
  }
  const mem = partyMembers();
  return `<div class="party in"><div class="phead"><b>Csapat · ${mem.length} fő · ${NET.host ? 'te vagy a vezető' : 'tag vagy'}</b>${NET.p2p ? `<span class="pcodebig">KÓD: ${NET.code.toUpperCase()}</span>` : ''}${hbtn('Kilépés', 'pleave')}</div>
    <div class="pmem">${mem.map(m => `<span class="pm${m.h ? ' host' : ''}"><b>${esc(m.n)}</b>${m.me ? ' (te)' : ''} · ${m.lv}. szint · ${CLASSES[m.c] ? CLASSES[m.c].name : 'nincs kaszt'}${m.h ? ' · vezető' : ''}${m.st === 'job' ? ' · munkán' : ''}</span>`).join('')}</div>
    <span class="note">${NET.host ? 'Te választod a munkát: amikor elvállalsz egyet, a csapat veled jön.' : 'A csapatvezető választ munkát; amikor elindítja, veled is automatikusan indul.'}</span></div>`;
}
function partyAction(kind, a) {
  if (kind === 'pcreate') partyJoin(Math.random().toString(36).slice(2, 7), true);
  if (kind === 'pjoin' && /^[a-z0-9]{1,8}$/.test(a)) partyJoin(a, false);
  if (kind === 'pjoinc') { const c = ($('pcode') ? $('pcode').value : '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (c.length >= 4) partyJoin(c, false); }
  if (kind === 'pleave') partyLeave();
}

// ---------- job start / end ----------
function netJobStarted(opts) {
  if (!NET.pr) { NET.mode = null; NET.client = false; return; }
  NET.mode = opts.client ? 'client' : 'host'; NET.client = !!opts.client;
  NET.hits = []; NET.acts = []; NET.kills = []; NET.dmgs = []; NET.zById.clear(); NET.last = {};
  player.down = false;
  if (NET.host) NET.job = { job: mission.job, seed: opts.seed, a: opts.a, b: opts.b, js: Date.now() };
  publishMember(); setLobby();
}
function netJobEnded() {
  NET.mode = null; NET.client = false; NET.targets = null; player.down = false;
  NET.zById.clear(); if (NET.host) NET.job = null;
  NET.avatars.forEach(a => scene.remove(a.g)); NET.avatars.clear();
  if (NET.pr) NET.pr.presence({ p: null, g: null }).catch(() => {});
  publishMember(); setLobby();
}

// ---------- avatars of the other players ----------
const avatarMats = {};
function makeAvatar(m) {
  const g = new THREE.Group(), col = CLASSES[m && m.c] ? CLASSES[m.c].color : '#9aa0a6';
  const mat = avatarMats[col] || (avatarMats[col] = new THREE.MeshLambertMaterial({ color: col }));
  const box = (sx, sy, sz, y, mt = mat) => { const b = new THREE.Mesh(unitBox, mt); b.scale.set(sx, sy, sz); b.position.y = y; b.castShadow = true; g.add(b); return b; };
  box(.5, .7, .3, 1.15); box(.22, .8, .24, .4).position.x = -.13; box(.22, .8, .24, .4).position.x = .13;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), skinMat); head.position.y = 1.72; g.add(head);
  box(.38, .08, .38, 1.9, gloveMat);
  const label = textSprite([String((m && m.n) || 'Társ').slice(0, 24)], col, .42); label.position.y = 2.35; g.add(label);
  scene.add(g);
  return { g, pos: new V3(), vel: new V3(), down: false, gunKey: '', gun: null, tx: 0, tz: 0, ty: 0, yaw: 0 };
}
function updateAvatars(dt, peers) {
  const seen = new Set();
  for (const p of peers) {
    if (p.sameTab || !p.presence || !p.presence.p) continue;
    const P = p.presence.p; seen.add(p.peer);
    let a = NET.avatars.get(p.peer); if (!a) { a = makeAvatar(p.presence.m); NET.avatars.set(p.peer, a); a.pos.set(+P.x || 0, 0, +P.z || 0); }
    const px = a.pos.x, pz = a.pos.z, k = 1 - Math.exp(-dt * 12);
    a.pos.x = lerp(a.pos.x, +P.x || 0, k); a.pos.z = lerp(a.pos.z, +P.z || 0, k);
    a.vel.set((a.pos.x - px) / Math.max(dt, 1e-3), 0, (a.pos.z - pz) / Math.max(dt, 1e-3));
    a.down = !!P.dn; a.hp = +P.hp || 0; a.mh = +P.mh || 100;
    a.g.position.set(a.pos.x, a.down ? .2 : lerp(a.g.position.y, +P.y || 0, k), a.pos.z);
    a.g.rotation.set(0, (+P.yw || 0) + Math.PI, a.down ? 1.4 : 0);
    const gk = `${P.wb}:${P.wq}`;
    if (gk !== a.gunKey) {
      a.gunKey = gk; if (a.gun) a.g.remove(a.gun);
      const b = BASES.find(b => b.id === P.wb);
      if (b) { a.gun = buildGun({ base: b, q: clamp(+P.wq || 0, 0, 4) }, true); a.gun.scale.setScalar(1.3); a.gun.position.set(.2, 1.3, -.35); a.gun.rotation.y = Math.PI; a.g.add(a.gun); }
    }
  }
  for (const [peer, a] of NET.avatars) if (!seen.has(peer)) { scene.remove(a.g); NET.avatars.delete(peer); }
}
const partySize = () => 1 + [...NET.avatars.values()].length;

// ---------- host: zombies chase the nearest living player ----------
function netAim(z) {
  if (!NET.targets) return;
  if (!z.tgt || (z.tgtT = (z.tgtT || 0) - 1 / 60) <= 0) {
    z.tgtT = .4; let best = NET.targets[0], bd = Infinity;
    for (const T of NET.targets) { if (!T.alive) continue; const d = Math.hypot(T.pos.x - z.pos.x, T.pos.z - z.pos.z); if (d < bd) { bd = d; best = T; } }
    z.tgt = best;
  }
  player.pos = z.tgt.pos; player.vel = z.tgt.vel; zTarget = z.tgt;
}
function netAimEnd() { if (!NET.targets) return; player.pos = NET.selfPos; player.vel = NET.selfVel; zTarget = null; }
// a zombie aimed at a remote player: the damage goes to them instead of the host
function netRedirectHurt(d) {
  if (!zTarget || !zTarget.remote) return false;
  pushRoll(NET.dmgs, [++NET.seq, zTarget.peer, Math.round(d * 10) / 10], 16);
  return true;
}
function netNearestToVan() {
  let d = player.down ? Infinity : Math.hypot(player.pos.x - truck.pos.x, player.pos.z - truck.pos.z);
  if (NET.mode) for (const a of NET.avatars.values()) if (!a.down) d = Math.min(d, Math.hypot(a.pos.x - truck.pos.x, a.pos.z - truck.pos.z));
  return d;
}
const netExtractOk = () => !NET.mode || (!player.down && Math.hypot(player.pos.x - truck.pos.x, player.pos.z - truck.pos.z) < 10);

// ---------- players going down and coming back ----------
function netDown() {
  player.down = true; player.hp = 0; mouseDown = rmb = false; stopReload();
  banner('ELESTÉL', 'A következő hullámban visszatérsz, ha a csapat kitart.'); SND.hurt();
}
function netRevive() {
  if (!player.down) return;
  player.down = false; player.hp = maxHp() * .5; player.lastHurt = now;
  const mates = [...NET.avatars.values()].filter(a => !a.down);
  if (mates.length) { const a = pick(mates); player.pos.set(a.pos.x + rand(-1, 1), 0, a.pos.z + rand(-1, 1)); collide(player.pos, .42); }
  banner('VISSZATÉRTÉL', 'A csapat kitartott.'); SND.power();
}
function netAllDown() { return player.down && ![...NET.avatars.values()].some(a => !a.down); }

// ---------- client: hits on proxies go to the host ----------
function netHit(z, amt, o) {
  if (z.dead) return;
  if (z.markT > 0) amt *= 1.5;
  if (z.K.boss && rk('h_boss')) amt *= 1.2;
  if (o.w && rk('h_exec') && z.hp < z.maxHp * .25) amt *= 2;
  const insta = powers.insta > 0 && !o.dot && !z.K.boss;
  z.hp -= z.armor > 0 && !o.head && !o.dot && !o.melee && !insta ? amt * .25 : amt; z.flash = .08; z.hitT = now;
  const col = o.crit ? '#ff7a1a' : o.head ? '#ffd23f' : o.color || (o.w && o.w.element ? ELEMENTS[o.w.element].color : '#ece6d4');
  dmgNumber(zHeadPos(z), amt, col, o.head || o.crit, o.crit);
  let burn = 0, fl = (o.head ? 1 : 0) | (o.crit ? 2 : 0) | (o.melee ? 4 : 0) | (o.dot ? 8 : 0) | (insta ? 32 : 0);
  if (o.w && o.w.element && !o.chain) {
    if (o.w.element === 'fire') burn = Math.round(o.w.dmg * o.w.pellets * fireRate(o.w) * .12);
    else if (o.w.element === 'cryo') fl |= 16;
    else applyElement(z, o.w, amt); // shock: the arc hits another proxy, which is sent too
  }
  pushRoll(NET.hits, [++NET.seq, z.id, Math.round(amt), fl, burn], 24);
  if (!o.dot) addPoints(10);
}
const netAct = (type, arg) => pushRoll(NET.acts, [++NET.seq, type, arg == null ? 0 : arg], 8);

// ---------- host: a remote player's kill ----------
function netKill(z, o) {
  const pts = z.K.points || (o.melee ? 130 : o.head ? 100 : 60);
  pushRoll(NET.kills, [++NET.seq, o.remote, KIND_IDS.indexOf(z.kind), o.head ? 1 : 0, pts, Math.round(z.pos.x * 10), Math.round(z.pos.z * 10), z.elite ? 1 : 0], 16);
}
// the killer's side: points, stats and their own loot roll
function netOwnKill(e) {
  const [, , ki, head, pts, x, zz, elite] = e, kind = KIND_IDS[ki]; if (!kind) return;
  player.kills++; stats.kills++; stats.killsBy[kind] = (stats.killsBy[kind] || 0) + 1;
  if (head) { player.heads++; stats.heads++; }
  if (rk('m_vamp')) player.hp = Math.min(maxHp(), player.hp + 3 * rk('m_vamp'));
  addPoints(+pts || 60); hitmarker(true); SND.kill();
  dropLoot({ K: KINDS[kind], kind, elite: !!elite }, new V3(x / 10, 0, zz / 10));
}

// ---------- the world snapshot ----------
function buildSnapshot() {
  const M = mission, zs = [];
  for (const z of zombies) {
    if (z.dead) continue;
    const fl = (z.rise > 0 ? 1 : 0) | (z.windup > 0 || z.bossState ? 2 : 0) | (z.elite ? 4 : 0) | (z.K.armor && z.armor <= 0 ? 8 : 0) | (z.burnT > 0 ? 16 : 0)
      | (z.slowT > 0 ? 32 : 0) | (z.buffT > 0 ? 64 : 0) | (z.K.ghost && z.op > .5 ? 128 : 0) | (z.fuse > 0 ? 256 : 0) | (z.crouch > 0 ? 512 : 0);
    zs.push([z.id, KIND_IDS.indexOf(z.kind), Math.round(z.pos.x * 10), Math.round(z.pos.z * 10), Math.round(z.g.rotation.y * 100), Math.max(0, Math.round(z.hp / z.maxHp * 100)), fl, Math.round(z.g.position.y * 10), Math.round(z.scale * 100)]);
    if (zs.length >= 48) break;
  }
  const keys = Object.keys(AREAS);
  return {
    t: Math.round(M.t * 10) / 10, ph: M.phase, pt: Math.round((M.phaseT || 0) * 10) / 10, w: M.wave, r: round, cl: M.cleared ? 1 : 0,
    ew: M.evacWarn ? 1 : 0, pk: M.pickup, vo: Math.round((truck.g.position.x - truck.pos.x) * truck.dir * 100) / 100, bt: Math.round((M.boardT || 0) * 10) / 10,
    pa: Math.round((M.parkT || 0) * 10) / 10, lv: M.leaving ? 1 : 0, ar: keys.reduce((m, k, i) => m | (AREAS[k].unlocked ? 1 << i : 0), 0),
    tr: trapState.map(T => Math.max(0, Math.round(T.active * 10) / 10)), z: zs, k: NET.kills, d: NET.dmgs, bk: M.bountyAt ? M.bountyAt.map(v => Math.round(v * 10) / 10) : null,
  };
}
function myPresence() {
  const w = curW();
  return { x: Math.round(player.pos.x * 100) / 100, y: Math.round(player.pos.y * 100) / 100, z: Math.round(player.pos.z * 100) / 100, yw: Math.round(player.yaw * 100) / 100,
    wb: w ? w.base.id : null, wq: w ? w.q : 0, hp: Math.ceil(player.hp), mh: maxHp(), dn: player.down ? 1 : 0, h: NET.hits, a: NET.acts };
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
  if (!NET.pr) return;
  const peers = NET.pr.peers(), me = peers.find(p => p.sameTab); NET.me = me ? me.peer : null;
  const host = peers.find(p => !p.sameTab && p.presence && p.presence.m && p.presence.m.h);
  if (!NET.host) {
    if (host) NET.hadHost = true;
    else if (NET.hadHost) { // the leader left
      if (mission && NET.client) { banner('A CSAPATVEZETŐ KILÉPETT', 'A munka véget ért.'); finishJob(false, true); }
      partyLeave(); return;
    }
    const J = host && host.presence.job, G = host && host.presence.g;
    if (J && G && J.js !== NET.seenJs && (state === 'hub' || state === 'results') && J.job && MAPS[J.job.map]) {
      NET.seenJs = J.js; startJob(J.job, { seed: +J.seed || 1, a: J.a | 0, b: J.b | 0, client: true });
    }
  }
  if (!mission || !NET.mode) return;
  updateAvatars(dt, peers);
  const out = { p: myPresence() };
  if (NET.host) {
    NET.selfPos = player.pos; NET.selfVel = player.vel;
    NET.targets = [{ pos: player.pos, vel: player.vel, alive: !player.down, remote: false }];
    for (const [peer, a] of NET.avatars) NET.targets.push({ pos: a.pos, vel: a.vel, alive: !a.down, remote: true, peer });
    for (const p of peers) { // members' hits and actions
      if (p.sameTab || !p.presence || !p.presence.p) continue;
      for (const [, zid, dmg, fl, burn] of fresh('h' + p.peer, p.presence.p.h)) {
        const z = NET.zById.get(zid); if (!z || z.dead) continue;
        if (burn > 0) { z.burnT = 3; z.burnDps = Math.max(z.burnDps, Math.min(+burn, 1e6)); z.burnBy = p.peer; }
        if (fl & 16) z.slowT = 2.5;
        hurtZombie(z, clamp(+dmg || 0, 0, 1e7), { remote: p.peer, head: !!(fl & 1), crit: !!(fl & 2), melee: !!(fl & 4), dot: !!(fl & 8), insta: !!(fl & 32) });
      }
      for (const [, type, arg] of fresh('a' + p.peer, p.presence.p.a)) netHostAct(type, arg);
    }
    out.g = buildSnapshot();
  } else if (host && host.presence.g) {
    applySnapshot(host.presence.g, host.peer);
  } else if (mission && !mission.leaving && NET.hadHost) { // the host's job is over
    banner('A MUNKA VÉGET ÉRT', 'A csapatvezető befejezte.'); finishJob(false, true); return;
  }
  NET.pr.presence(out).catch(() => {});
}
function netHostAct(type, arg) {
  const M = mission; if (!M) return;
  const keys = Object.keys(AREAS);
  if (type === 'gate' && keys[arg] && !AREAS[keys[arg]].unlocked) { openArea(keys[arg]); banner(`${AREAS[keys[arg]].name.toUpperCase()} MEGNYÍLT`, 'Egy társad nyitotta meg.'); }
  if (type === 'trap' && trapState[arg] && trapState[arg].active <= 0 && trapState[arg].cd <= 0) trapState[arg].active = 20;
  if (type === 'board' && M.phase === 'evac' && truck.parked && !(M.boardT > 0) && !M.leaving) { M.boardT = BOARD_T; banner('BESZÁLLÁS', `Tartsatok ki ${BOARD_T} mp-ig a furgon mellett!`); }
}

// ---------- client: follow the host's world ----------
function applySnapshot(g, hostPeer) {
  const M = mission; if (!M || typeof g !== 'object') return;
  // clock, phase, threat
  const was = { ph: M.phase, w: M.wave, ew: M.evacWarn, cl: M.cleared };
  if (Array.isArray(g.bk) && !M.bountyDone) { M.bountyDone = true; M.job.dur = (+g.t || 0) + EVAC_WARN + 1; bountyLoot({ x: +g.bk[0] || 0, z: +g.bk[1] || 0 }); banner('A CÉLPONT ELESETT', 'Legendás zsákmány! Szedd fel, aztán irány a furgon.'); }
  Object.assign(M, { t: +g.t || 0, phase: g.ph, phaseT: +g.pt || 0, wave: +g.w || 1, cleared: !!g.cl, evacWarn: !!g.ew, pickup: g.pk | 0, boardT: +g.bt || 0, parkT: +g.pa || 0 });
  if (round !== g.r) { round = +g.r || 1; $('round').textContent = round; }
  if (M.wave > was.w) { banner(`${M.wave}. HULLÁM`, `A veszély ${round}. szintre nőtt.`); SND.roundStart(); if (player.down) netRevive(); }
  else if (M.phase === 'lull' && was.ph === 'wave') { banner('A HULLÁM VÉGE', 'Öljétek meg a maradékot.'); SND.roundEnd(); }
  if (M.evacWarn && !was.ew && player.down) netRevive();
  if (M.evacWarn && !was.ew) { banner('A FURGON ÚTON VAN', `${EVAC_WARN} mp múlva ér a zöld jelzéshez. Induljatok!`); SND.roundEnd(); }
  if (M.phase === 'evac' && was.ph !== 'evac') { banner('IDŐ LEJÁRT', `Itt a furgon! [E], aztán ${BOARD_T} mp-ig mellette.`); SND.roundEnd(); }
  // the van
  if ((M.evacWarn || M.phase === 'evac') && M.pickPlaced !== M.pickup) { M.pickPlaced = M.pickup; M.departT = -1; placeVan(M.pickup, false); truck.beacon.visible = truck.beam.visible = true; }
  if (M.pickPlaced != null && !M.leaving) setVanAt(Math.max(0, +g.vo || 0));
  if (g.lv && !M.leaving) { M.leaving = .001; M.extractOk = netExtractOk(); banner(M.extractOk ? 'INDULÁS' : 'LEMARADTÁL', M.extractOk ? 'Munka kész.' : 'A furgon nélküled ment el.'); }
  // areas and traps
  const keys = Object.keys(AREAS);
  keys.forEach((k, i) => { if ((g.ar & (1 << i)) && !AREAS[k].unlocked) openArea(k); });
  if (Array.isArray(g.tr)) g.tr.forEach((v, i) => { if (trapState[i]) trapState[i].active = +v || 0; });
  // zombies
  const live = new Set();
  if (Array.isArray(g.z)) for (const e of g.z) {
    const [id, ki, x, zz, h, hp, fl, y, sc] = e, kind = KIND_IDS[ki]; if (!kind) continue;
    live.add(id);
    let z = NET.zById.get(id);
    if (!z) {
      z = spawnZombieAt(kind, x / 10, zz / 10, fl & 1 ? 1 : 0);
      z.id = id; z.elite = !!(fl & 4); z.scale = (+sc || 100) / 100; z.g.scale.setScalar(z.scale);
      NET.zById.set(id, z);
      if (z.K.boss) { banner('A MÉSZÁROS', 'Megérkezett.'); SND.roar(); }
    }
    const hpv = clamp(+hp || 0, 0, 100) / 100 * z.maxHp;
    if (hpv < z.hp || now - (z.hitT || -9) > .4) z.hp = hpv;
    z.net = { x: x / 10, z: zz / 10, h: h / 100, y: (+y || 0) / 10, fl };
  }
  for (const [id, z] of NET.zById) if (!live.has(id)) { NET.zById.delete(id); proxyDie(z); }
  // kills credited to me, and damage the host's zombies did to me
  for (const e of fresh('k' + hostPeer, g.k)) if (e[1] === NET.me) netOwnKill(e);
  for (const e of fresh('d' + hostPeer, g.d)) if (e[1] === NET.me && !player.down) hurtPlayer(+e[2] || 0);
}
function proxyDie(z) {
  if (z.dead) return;
  z.dead = true; z.deathT = 0; z.fallDir = Math.random() < .5 ? 1 : -1;
  burst(new V3(z.pos.x, 1.2 * z.scale, z.pos.z), 0x5a0a0a, 10, 3);
  if (z.K.bloat && z.net && z.net.fl & 256) { z.g.visible = false; burst(new V3(z.pos.x, 1, z.pos.z), 0x9dff3a, 30, 6, .7); SND.explode(); }
}
// proxies glide to the host's positions and animate themselves
function updateProxies(dt) {
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i], K = z.K, s = z.net;
    if (z.dead) {
      z.deathT += dt;
      z.upper.rotation.x = lerp(z.upper.rotation.x, K.crawl ? 1.5 : -1.4, dt * 6);
      z.g.rotation.z = lerp(z.g.rotation.z, (K.crawl ? .3 : 1.45) * z.fallDir, Math.min(1, dt * 5));
      z.g.position.y = z.deathT > 1.4 ? -(z.deathT - 1.4) * 1.2 : .2 * z.scale * Math.min(1, z.deathT * 4);
      if (z.deathT > 3) { scene.remove(z.g); z.mats.forEach(m => m.dispose()); zombies.splice(i, 1); }
      continue;
    }
    if (!s) continue;
    const k = 1 - Math.exp(-dt * 12), px = z.pos.x, pz = z.pos.z;
    z.pos.x = lerp(z.pos.x, s.x, k); z.pos.z = lerp(z.pos.z, s.z, k); z.rise = s.fl & 1 ? .5 : 0;
    z.g.position.set(z.pos.x, lerp(z.g.position.y, s.y, k), z.pos.z);
    z.g.rotation.y += ((((s.h - z.g.rotation.y) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;
    z.flash -= dt; z.markT = (z.markT || 0) - dt;
    const em = z.flash > 0 || (s.fl & 256 && Math.sin(now * 40) > 0) ? 0x777777 : s.fl & 16 ? 0x4a1800 : s.fl & 32 ? 0x10384a : s.fl & 64 ? 0x4a0000 : z.markT > 0 ? 0x3a1450 : s.fl & 4 ? 0x3a2a00 : 0;
    for (const m of z.mats) m.emissive.setHex(em);
    if (K.ghost) { z.op = lerp(z.op || .1, s.fl & 128 ? .9 : .1, Math.min(1, dt * 4)); for (const m of z.mats) m.opacity = z.op; }
    if (z.armorParts && s.fl & 8) z.armorParts.forEach(a => a.visible = false);
    if (s.fl & 16 && Math.random() < dt * 12) burst(new V3(z.pos.x, rand(.6, 1.9) * z.scale, z.pos.z), 0xff7a20, 1, 1, .35);
    const moving = Math.hypot(z.pos.x - px, z.pos.z - pz) / Math.max(dt, 1e-4);
    z.walkT += dt * (2 + moving * 2.2);
    z.amp = lerp(z.amp || 0, Math.min(.75, .15 + moving * .18), k);
    const sw = Math.sin(z.walkT) * z.amp;
    z.legL.rotation.x = sw; z.legR.rotation.x = -sw;
    z.upper.rotation.x = lerp(z.upper.rotation.x, s.fl & 512 ? 1.1 : K.lean, k);
    if (K.crawl) { z.armL.rotation.x = -1.3 + sw * 1.2; z.armR.rotation.x = -1.3 - sw * 1.2; }
    else { const reach = -1.35 - (s.fl & 2 ? .9 : 0); z.armL.rotation.x = lerp(z.armL.rotation.x, reach, k); if (!K.gun) z.armR.rotation.x = lerp(z.armR.rotation.x, reach, k); else z.armR.rotation.x = -1.5; }
    if (K.bloat) z.torso.scale.x = 1.55 + Math.sin(now * (s.fl & 256 ? 30 : 3)) * (s.fl & 256 ? .15 : .04);
    if ((z.groanT -= dt) <= 0) { z.groanT = rand(3, 9); const d = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z); if (d < 26) SND.groan(.22 * (1 - d / 26)); }
  }
}
// the client's side of the job: its own van animations; everything else comes from the snapshot
function clientMission(dt) {
  const M = mission; if (!M) return;
  if (M.leaving) {
    M.leaving += dt;
    truck.g.position.x += truck.dir * dt * (4 + M.leaving * 6);
    $('flash').style.background = '#000'; $('flash').style.opacity = clamp((M.leaving - .8) / 1.4, 0, 1);
    if (M.leaving > 2.4) finishJob(!!M.extractOk);
    return;
  }
  if (M.departT >= 0) { M.departT += dt; setVanAt(M.departT * M.departT * 2.5); if (!truck.g.visible && M.departT > 1) M.departT = -1; }
  stats.bestThreat = Math.max(stats.bestThreat, round);
}

requestAnimationFrame(frame);
