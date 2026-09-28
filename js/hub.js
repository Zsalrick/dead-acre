// ================= THE BASE (between jobs) =================
const DIFF_NAMES = ['Könnyű', 'Normál', 'Nehéz', 'Extrém', 'Mi a fasz?'];
const DIFF_COL = ['#6fbf5a', '#d8c24a', '#f2a33a', '#e0533a', '#ff2a6a'];
const START_THREAT = [1, 3, 5, 8, 11];
const JOB_TEXT = {
  farm:   [['A Holloway-farm védelme', 'Holloway család'], ['Aratás előtti éjszaka', 'Szövetkezet'], ['Az állatok maradjanak', 'Öreg Holloway']],
  chapel: [['Éjféli mise', 'Mihály atya'], ['A sírásó kérése', 'Temetőgondnok'], ['Csengessenek még egyszer', 'Egyházközség']],
  gas:    [['Az utolsó tankolás', 'Route 9 Kft.'], ['Éjszakai műszak', 'Kutas Béla'], ['Ki kell hozni a kasszát', 'Tulajdonos']],
  mill:   [['Fűrészpor és vér', 'Kovács-fatelep'], ['A favágók hazamennének', 'Művezető'], ['Rönkök hajnalig', 'Erdészet']],
  town:   [['Délben a főutcán', 'Városi tanács'], ['A bank nem nyit ki magától', 'Első Megyei Bank'], ['Utolsó kör a szalonban', 'Kocsmáros']],
  hospital: [['Éjszakai ügyelet', 'Főorvos'], ['Kiürítés', 'Katasztrófavédelem'], ['A lezuhant helikopter', 'Mentőszolgálat']],
  fair:   [['Utolsó kör a körhintán', 'Vásárigazgató'], ['Az óriáskerék fénye', 'Mutatványos család'], ['Céllövölde zárás után', 'Bódés Feri']],
  quarry: [['A gödör alján', 'Kőbánya Kft.'], ['Robbantás előtti éjszaka', 'Bányamester'], ['Senki sem jön fel', 'Bányászszakszervezet']],
};
const stashMax = () => 40 + 10 * U('stash'), gearMax = () => 40 + 10 * U('stash'); // the Raktárbővítés upgrade adds 10 + 10 a level
const reroll = () => 50 + 40 * profile.level;
// the base's own gunsmith: dollars instead of points, so old favourites can keep up
const PARTS = [1, 2, 5, 15, 40, 80]; // salvage yield by rarity
const HFORGE = { recal: w => 10 + Math.floor(w.level / 3), level: w => 2 + Math.floor(w.level / 5), anoint: w => 12 + 10 * ((w && w.anoN) || 0), cap: () => profile.level >= LEVEL_CAP ? LEVEL_CAP + 2 * (profile.tier || 0) : profile.level };
const ITEM_PRICE = { med: 300, gren: 250, knife: 220, adren: 450 };
const shopPrice = w => Math.round(sellValue(w) * 4 / 10) * 10;

function makeJob() {
  const lvl = profile.level, maps = MAP_IDS.filter(id => MAPS[id].minLevel <= lvl);
  const map = pick(maps), maxD = lvl >= 22 ? 5 : lvl >= 16 ? 4 : lvl >= 10 ? 3 : lvl >= 5 ? 2 : 1;
  const diff = 1 + Math.floor(Math.random() * maxD);
  const dur = 300 + (diff - 1) * 45;
  const mod = Math.random() < (diff >= 2 ? .6 : .25) ? pick(Object.keys(MODS)) : null; // maps often come with a twist
  const boss = diff >= 3 && (diff === 5 || Math.random() < .35);
  const [title0, client] = pick(JOB_TEXT[map]);
  const type = diff >= 2 ? pick(['survive', 'survive', 'survive', 'exterminate', 'defense', 'supply', 'escort']) : 'survive';
  const title = type === 'survive' ? title0 : `${JOB_TYPES[type].name}: ${title0}`;
  const reward = Math.round((250 + 180 * Math.pow(diff, 1.4) + lvl * 35) * (dur / 300) * (mod ? 1.2 : 1) * (boss ? 1.3 : 1) / 10) * 10;
  return { map, diff, dur, mod, boss, title, client, type, goal: type === 'exterminate' ? 50 + 25 * diff : type === 'supply' ? 5 + diff : 0,
    reward: Math.round(reward * (type === 'survive' ? 1 : type === 'escort' ? .9 : 1.15) / 10) * 10, lvl: Math.min(LEVEL_CAP, lvl), xp: 120 * diff + (boss ? 150 : 0) + (mod ? 50 : 0) };
}
function rollBoard() {
  profile.jobs = []; // three different jobs, on different maps while there are enough maps
  const nMaps = MAP_IDS.filter(id => MAPS[id].minLevel <= profile.level).length;
  for (let k = 0; profile.jobs.length < 3 && k < 60; k++) { const j = makeJob(); if (!profile.jobs.some(o => o.title === j.title || (o.map === j.map && profile.jobs.length < nMaps))) profile.jobs.push(j); }
  while (profile.jobs.length < 3) profile.jobs.push(makeJob());
  if (!profile.jobs.some(j => j.diff === 1)) profile.jobs[0] = Object.assign(makeJob(), { diff: 1, boss: false }); // always one easy job
  const j = profile.jobs[0]; j.dur = 300; j.reward = Math.round((470 + profile.level * 35) / 10) * 10; j.xp = 120; j.lvl = profile.level;
  if (profile.level >= 3) profile.jobs.push(makeBounty());
  if (profile.level >= LEVEL_CAP) { // Rémálom +N after the cap: pick any tier you have unlocked, clear the top one to unlock the next
    let j; for (let k = 0; k < 40 && (!j || j.diff < 5); k++) j = makeJob(); // a 5-star base, so Rémálom never pays less than the board
    j.diff = 5; j.boss = true; j.dur = Math.max(j.dur, 480); j.base = { reward: j.reward, xp: j.xp, title: j.title.replace(/^.*?: /, '') };
    setTier(j, profile.tierSel ? Math.min(profile.tierSel, (profile.tier || 0) + 1) : (profile.tier || 0) + 1); profile.jobs.push(j);
  }
}
function setTier(j, T) { // pay, XP and parts grow faster than zombie health (~+26% a tier)
  j.tier = T; j.lvl = LEVEL_CAP + 2 * T;
  j.reward = Math.round(j.base.reward * 1.4 * Math.pow(1.18, T) / 10) * 10; j.xp = Math.round(j.base.xp * 1.3 * Math.pow(1.25, T));
  j.title = `Rémálom +${T}: ${j.base.title}`;
}
// a bounty: one strong boss, no clock, guaranteed legendary gun + armor
function makeBounty() {
  const lvl = profile.level, key = pick(Object.keys(BOUNTIES).filter(k => lvl >= (BOUNTIES[k].minLvl || 3))), B = BOUNTIES[key];
  const map = pick(MAP_IDS.filter(id => MAPS[id].minLevel <= lvl)), diff = Math.min(5, 2 + Math.floor(lvl / 6));
  return { map, diff, dur: 0, mod: null, boss: false, bounty: key, title: `Fejvadászat: ${B.name}`, client: 'Megyei seriff',
    reward: Math.round((700 + 300 * diff + lvl * 60) * 1.6 / 10) * 10, xp: 350 + 120 * diff, lvl: Math.min(LEVEL_CAP, lvl) }; // ×1.6: a bounty out-pays a regular job
}
function rollShop() {
  const lvl = profile.level;
  profile.shop = [0, 1, 2, 3].map(k => packW(makeWeapon(pick(BASES), Math.min(4, rollRarity(.15 + lvl * .02)), lvl + (k === 0 ? 1 : 0)))); // your level; one gun a level above to aim for · exotics only drop
  profile.gshop = [0, 1, 2].map(() => makeGear(null, rollRarity(.15 + lvl * .02), lvl));
}

// ---------- rendering ----------
let hubTab = 'jobs', jobSel = 0;
// the county: where each map lies, and a hand-drawn backdrop
const MAP_LOC = { farm: [170, 300], chapel: [300, 105], gas: [560, 335], mill: [735, 110], town: [450, 215], quarry: [790, 320], fair: [615, 205], hospital: [330, 330] };
const MAP_ART = (() => {
  const L = MAP_LOC, road = (a, b) => `<path class="road" d="M${L[a][0]} ${L[a][1]} Q ${(L[a][0] + L[b][0]) / 2 + 30} ${(L[a][1] + L[b][1]) / 2 - 20} ${L[b][0]} ${L[b][1]}"/>`;
  const r = mulberry(7), trees = Array.from({ length: 140 }, () => { const x = r() * 900, y = r() * 440; return Math.hypot(x - 450, y - 215) < 70 ? '' : `<circle class="tree" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + r() * 6).toFixed(1)}"/>`; }).join('');
  const grid = Array.from({ length: 12 }, (_, i) => `<path class="grid" d="M${i * 80} 0 V440 M0 ${i * 40} H900"/>`).join('');
  return `<defs><radialGradient id="jfog" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#1c211c"/><stop offset="1" stop-color="#070908"/></radialGradient></defs>
    <rect width="900" height="440" fill="url(#jfog)"/>${grid}${trees}
    <path class="river" d="M-10 200 C 120 170 200 230 300 210 S 520 140 620 200 S 800 260 910 230"/>
    ${road('farm', 'town')}${road('chapel', 'town')}${road('town', 'gas')}${road('town', 'mill')}${road('gas', 'quarry')}${road('mill', 'quarry')}${road('town', 'fair')}${road('farm', 'hospital')}${road('hospital', 'gas')}${road('farm', 'chapel')}
    <text class="county" x="24" y="30">DEAD ACRE MEGYE</text><text class="county sm" x="24" y="48">válassz munkát a térképen</text>`;
})();
function jobCard(j, i, notReady) {
  if (!j) return '<p class="note">Nincs munka.</p>';
  const M = MAPS[j.map], lv = j.lvl || profile.level, B = j.bounty && BOUNTIES[j.bounty];
  const gl = Math.max(1, ...profile.loadout.filter(Boolean).map(o => o.level)), weak = lv - gl >= 4;
  const btn = NET.code && !NET.host ? 'A vezető választ' : notReady ? `Várakozás · ${notReady} nem kész` : NET.code ? 'Elvállaljuk' : 'Elvállalom';
  return `<article class="job${B ? ' bounty' : ''}" style="--dc:${B ? '#ff8c1a' : j.tier ? '#b05cff' : DIFF_COL[j.diff - 1]}">
    <div class="jhead"><span class="jmap">${M.name}${j.map === featuredMap() ? ' <b class="featb">★ HETI KIEMELT</b>' : ''}</span><span class="jstars" title="${DIFF_NAMES[j.diff - 1]}">${stars(j.diff)}</span></div>
    <h3>${j.title}</h3><p class="jclient">Megbízó: ${j.client} · <b>${DIFF_NAMES[j.diff - 1]}</b></p>${j.tier ? `<p class="jtier">RÉMÁLOM +${j.tier} · zóna Lv ${j.lvl} · +${10 + 5 * j.tier} ⚙ és garantált legendás a teljesítésért</p>${j.base ? `<div class="tiersel">${hbtn('−', `tier:${i}:-1`, j.tier <= 1)}<b>+${j.tier}</b>${hbtn('+', `tier:${i}:1`, j.tier >= (profile.tier || 0) + 1)}<small>Feloldva: +${(profile.tier || 0) + 1}-ig</small></div>` : ''}` : ''}
    <ul class="jfacts">${B ? `<li class="jboss"><b>${B.name}</b>: ${B.desc}</li><li class="jleg">Legalább epikus fegyver és páncél, 30% eséllyel legendás</li><li class="jleg">8% eséllyel egzotikus fegyver: ${(B.loot || []).map(k => UNIQUES[k].name).join(', ')}</li><li>Nincs időkorlát · ${lv}. szintű zombik</li>`
      : `${j.type && j.type !== 'survive' ? `<li class="jtype">${JOB_TYPES[j.type].desc(j)}</li>` : ''}<li>${noClock(j) ? 'Nincs időkorlát' : `<b>${fmtTime(j.dur)}</b> ${j.type === 'defense' ? 'védelem' : 'túlélés'}`} · <b>${lv}.</b> szintű zóna</li><li>Kezdő veszélyszint: ${START_THREAT[j.diff - 1]} (hullámonként nő)</li>`}
      ${weak ? `<li class="jwarn">Vigyázz: a legjobb fegyvered Lv ${gl}, a zóna ${lv}. szintű. Itt nagyon kevés leszel.</li>` : ''}${j.mod ? `<li class="jmod">${MODS[j.mod].label}: ${MODS[j.mod].sub}</li>` : ''}${j.boss && !B ? '<li class="jboss">A Mészáros is eljön</li>' : ''}</ul>
    <div class="jfoot"><span class="jreward">$${j.reward}<small>+${j.xp} XP</small></span>${hbtn(btn, `job:${i}`, (NET.code && !NET.host) || notReady > 0)}</div>
  </article>`;
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stars = d => '★'.repeat(d) + '<i>★</i>'.repeat(5 - d);
function showHub() {
  state = 'hub';
  if (profile && !profile.cls) hubTab = 'skills';
  if (document.pointerLockElement) document.exitPointerLock();
  ['menu', 'hud', 'pause', 'results', 'station'].forEach(id => $(id).hidden = true);
  $('hub').hidden = false;
  if (!MAP || MAP_ID !== 'farm') loadMap('farm', 1234); // the backdrop
  renderHub();
}
function renderHub() {
  const P = profile;
  $('hubSlot').textContent = `${P.name} · ${stats.jobs} kész munka${NET.code ? ` · csapat: ${partyMembers().length} fő` : ''} · ${GAME_VER}`;
  $('hubLvl').textContent = P.level;
  $('hubXp').style.width = P.xp / xpNeed(P.level) * 100 + '%';
  $('hubXpTxt').textContent = `${P.xp} / ${xpNeed(P.level)} XP${vetOpen() ? ` · veterán ${vetEarned()}${vetAvail() ? ` (+${vetAvail()})` : ''}` : ''}`;
  $('hubCash').textContent = `$${P.cash}`; $('hubParts').textContent = `${P.parts || 0} ⚙ · ${P.fabric || 0} ${FAB}`;
  rollContracts(); const claimable = [...P.daily.list.map(c => [c, false]), [P.weekly.c, true]].filter(([c, w]) => !c.got && cProg(c, w) >= c.n).length;
  document.querySelector('[data-hub="jobs"]').dataset.badge = claimable || '';
  $('hubTokens').textContent = P.tokens || 0;
  $('hubCls').textContent = P.cls ? CLASSES[P.cls].name : 'nincs kaszt'; $('hubCls').style.setProperty('--cc', P.cls ? CLASSES[P.cls].color : '');
  document.querySelectorAll('.mbtn[data-hub]').forEach(b => b.classList.toggle('on', !!(b.dataset.hub === hubTab || (b.dataset.group && HUB_GROUPS[b.dataset.group].some(([k]) => k === hubTab)))));
  const grp = Object.values(HUB_GROUPS).find(g => g.some(([k]) => k === hubTab)), sub = grp ? `<nav class="subnav">${grp.map(([k, t]) => `<button class="sbtab${k === hubTab ? ' on' : ''}" data-sub="${k}">${t}</button>`).join('')}</nav>` : '';
  const hb = $('hubBody'), same = renderHub.tab === hubTab, keep = same ? [hb.scrollTop, ...[...hb.querySelectorAll('.invl,.invd')].map(e => e.scrollTop)] : null; renderHub.tab = hubTab; hb.innerHTML = sub + HUB[hubTab](); // in a party the strip is on every tab
  if (keep) { hb.scrollTop = keep[0]; [...hb.querySelectorAll('.invl,.invd')].forEach((e, k) => { if (keep[k + 1] != null) e.scrollTop = keep[k + 1]; }); } // a click re-renders the tab: stay where you were
  updateKeybar($('hubBody'));
}
const miniCard = (w, acts) => `<div class="wcard mini" style="--rc:${rarColor(w)}"><div class="head"><div class="lvl">Lv ${w.level}</div><div class="rar">${RARITIES[w.q].name}</div>
  <div class="name">${w.name}</div><div class="sub">${w.base.name} · DPS ${dps(w)}${w.element ? ` · <span style="color:${ELEMENTS[w.element].color}">${ELEMENTS[w.element].name}</span>` : ''}</div>
  <div class="sub" style="color:#9fd0ff">${w.maker}: ${mkOf(w).perk || ''}</div></div>
  <div class="act">${acts}</div></div>`;
// key: optional shortcut (KeyboardEvent.code) shown on the button and in the key bar
let optOpen = null; // the forge's optimization panel: open for this selection only
const KEY_LABEL = { KeyO: 'O', KeyJ: 'J', KeyM: 'M', KeyC: 'C', KeyK: 'K', KeyF: 'F', KeyR: 'R', KeyT: 'T', KeyX: 'X', KeyG: 'G', KeyV: 'V', KeyB: 'B', KeyN: 'N', Digit1: '1', Digit2: '2' };
// selling and salvaging: weapons from the hands, bag or stash, armor worn or stored; favourites are locked, trash goes in bulk
const wList = sl => ({ L: profile.loadout, B: profile.bag, S: profile.stash })[sl] || [];
const wAt = (sl, i) => unpackW(wList(sl)[+i]);
function wRemove(sl, i) { const L = wList(sl); if (sl === 'L') { L[+i] = null; if (!L[0] && L[1]) { L[0] = L[1]; L[1] = null; } } else L.splice(+i, 1); }
const gearAt = (sl, k) => sl === 'W' ? profile.gear[k] : profile.gearStash[+k];
function gRemove(sl, k) { if (sl === 'W') { profile.gear[k] = null; gearChanged(); } else profile.gearStash.splice(+k, 1); }
const salvageGain = x => PARTS[x.q] + expRefund(x);
const wSellBtns = (w, sl, i, lone) => hhold(`Eladás (tartsd) $${sellValue(w)}`, `sell:${sl}:${i}`, w.fav || lone, 'KeyX') + hhold(`Szétszedés (tartsd) +${salvageGain(w)} ⚙`, `salvage:${sl}:${i}`, w.fav || lone, 'KeyB') +
  hbtn(w.fav ? '★ Kedvenc' : 'Kedvenc', `fav:${sl}:${i}`, false, 'KeyV') + hbtn(w.junk ? '🗑 Kukában' : 'Kukába', `trash:${sl}:${i}`, w.fav, 'KeyJ');
const gSellBtns = (it, sl, k) => hhold(`Eladás (tartsd) $${gearValue(it)}`, `gsell:${sl}:${k}`, it.fav, 'KeyX') + hhold(`Szétszedés (tartsd) +${PARTS[it.q]} ${FAB}${expRefund(it) ? ` +${expRefund(it)} ⚙` : ''}`, `gsalvage:${sl}:${k}`, it.fav, 'KeyB') +
  hbtn(it.fav ? '★ Kedvenc' : 'Kedvenc', `gfav:${sl}:${k}`, false, 'KeyV') + hbtn(it.junk ? '🗑 Kukában' : 'Kukába', `gtrash:${sl}:${k}`, it.fav, 'KeyJ');
function trashBar(kind) { // bulk sell / salvage everything marked as trash
  const P = profile, items = kind === 'w' ? [...P.bag, ...P.stash].map(unpackW).filter(w => w && w.junk && !w.fav) : P.gearStash.filter(it => it.junk && !it.fav);
  if (!items.length) return '';
  const cash = items.reduce((a, x) => a + (kind === 'w' ? sellValue(x) : gearValue(x)), 0), parts = items.reduce((a, x) => a + (kind === 'w' ? salvageGain(x) : PARTS[x.q]), 0);
  return `<div class="trashbar"><b>🗑 Kukában: ${items.length} db</b>${hbtn(`Összes eladása · $${cash}`, `trashsell:${kind}`)}${hbtn(`Összes szétszedése · +${parts} ${kind === 'w' ? '⚙' : FAB}`, `trashsalv:${kind}`)}</div>`;
}
// calibration: roll new stats, show old against new, keep whichever the player picks
function showRecal(w, list, i) {
  const c = unpackW(packW(w)), b = BASES.find(x => x.id === w.base.id) || w.base, n = makeWeapon(b, Math.min(4, w.q), w.level, w.mk), k = w.unique ? 1.12 : 1;
  ocStrip(c); Object.assign(c, { dmg: Math.round(n.dmg * k), rpm: n.rpm, mag: n.mag, reload: n.reload, spread: n.spread, roll: n.roll, crit: n.crit, cdmg: n.cdmg }); ocApply(c);
  const rows = [['DPS', x => dps(x)], ['Sebzés', x => x.dmg], ['Tűzgyorsaság', x => x.rpm, '/p'], ['Tár', x => x.mag], ['Újratöltés', x => x.reload, ' mp', true, 2], ['Pontosság', x => accuracy(x), '%'],
    ['Kritikus esély', x => Math.round(wCrit(x) * 1000) / 10, '%', false, 1], ['Kritikus szorzó', x => wCdmg(x), '×', false, 2], ['Dobás minősége', x => x.roll, '%']];
  const fmt = (v, u = '', dg = 0) => u === '×' ? `×${v.toFixed(dg)}` : `${+v.toFixed(dg)}${u}`;
  const tr = rows.map(([name, f, u, low, dg]) => { const a = f(w), z = f(c), d = z - a, good = low ? d < 0 : d > 0;
    return `<tr><td>${name}</td><td>${fmt(a, u, dg)}</td><td class="${Math.abs(d) < 1e-6 ? '' : good ? 'up' : 'down'}">${fmt(z, u, dg)}${Math.abs(d) < 1e-6 ? '' : good ? ' ▲' : ' ▼'}</td></tr>`; }).join('');
  const box = $('confirm'); box.classList.add('recal');
  box.querySelector('p').innerHTML = `<b>Kalibrálás · ${w.name}</b><table class="rtab"><tr><th></th><th>Régi</th><th>Új</th></tr>${tr}</table><small>OK: az új értékek maradnak · X: marad a régi (az alkatrész elfogyott)</small>`;
  const yes = box.querySelector('[data-yes]'), no = box.querySelector('[data-no]'), labels = [yes.innerHTML, no.innerHTML];
  yes.innerHTML = '<kbd>Enter</kbd>OK'; no.innerHTML = '<kbd>Esc</kbd>✕ Régi marad'; box.hidden = false;
  const done = ok => { box.hidden = true; box.classList.remove('recal'); yes.innerHTML = labels[0]; no.innerHTML = labels[1]; removeEventListener('keydown', key, true);
    if (ok) { list[i] = packW(c); SND.explode(); } saveProfile(); renderHub(); };
  const key = e => { e.stopPropagation(); e.preventDefault(); if (e.code === 'Enter') done(true); else if (e.code === 'Escape') done(false); };
  addEventListener('keydown', key, true); yes.onclick = () => done(true); no.onclick = () => done(false);
}
const CONFIRM_ACTS = ['trashsell', 'trashsalv']; // single items are held instead
let confirmOk = false;
function askConfirm(b) { // "are you sure?" before anything is sold or taken apart
  const src = [...document.querySelectorAll('#hubBody [data-act]')].find(x => x.dataset.act === b.dataset.act && x.childNodes.length) || b;
  const box = $('confirm'), lbl = [...src.childNodes].filter(n => n.nodeName !== 'KBD').map(n => n.textContent).join('').trim();
  const [k, sl, i] = b.dataset.act.split(':'), x = /^trash/.test(k) ? null : k[0] === 'g' ? gearAt(sl, i) : wAt(sl, i), what = x ? `„${x.name}”` : 'a kukába tett összes tárgyat';
  box.querySelector('p').innerHTML = `Biztosan: <b>${lbl}</b><br><small>${what} · nem vonható vissza</small>`; box.hidden = false;
  const done = ok => { box.hidden = true; removeEventListener('keydown', key, true); if (ok) { confirmOk = true; try { fireAct($('hubBody'), b.dataset.act); } finally { confirmOk = false; } } };
  const key = e => { e.stopPropagation(); e.preventDefault(); if (e.code === 'Enter' || e.code === 'KeyY') done(true); else if (e.code === 'Escape' || e.code === 'KeyN') done(false); }; // nothing else reacts while it is open
  addEventListener('keydown', key, true);
  box.querySelector('[data-yes]').onclick = () => done(true); box.querySelector('[data-no]').onclick = () => done(false);
}
const MV_TIP = { L: 'Kézbe veszed: ezzel harcolsz a munkán.', B: 'A táskába teszed: a munkára is jön, ott kézbe veheted.', S: 'A raktárba teszed: a bázison marad, biztonságban.', K: 'A karakterek közti ládába teszed: a többi mentésed is eléri.' };
const TIPS = {
  sell: 'Eladod pénzért.', gsell: 'Eladod pénzért.', fav: 'Kedvenc: nem adható el és nem szedhető szét, amíg ez be van kapcsolva.', gfav: 'Kedvenc: nem adható el és nem szedhető szét, amíg ez be van kapcsolva.',
  trash: 'Kukába jelölöd: a lista fölötti gombbal az összes kukás tárgyat egyszerre eladhatod vagy szétszedheted.', gtrash: 'Kukába jelölöd: a lista fölötti gombbal az összes kukás tárgyat egyszerre eladhatod vagy szétszedheted.',
  trashsell: 'Eladja az összes kukába jelölt tárgyat (kézben lévőt nem).', trashsalv: 'Szétszedi az összes kukába jelölt tárgyat (kézben lévőt nem).', salvage: 'Szétszeded alkatrészre (⚙). A szakértelemre költött alkatrész fele visszajár.', gsalvage: 'Szétszeded anyagra (▦): ezzel optimalizálhatod a páncélt a kovácsnál. A szakértelemre költött alkatrész fele visszajár.',
  'hforge:anoint': 'Dob egy új, véletlen felkenést: utána elfogadod, vagy megtartod a régit. Minden újradobás drágább ezen a fegyveren.',
  'hforge:recal': 'Újradobja a fegyver véletlen értékeit (sebzés, tűzgyorsaság, tár, újratöltés, pontosság, kritikus esély és szorzó). Egy ablakban látod a régit és az újat: OK-ra az új marad, X-re a régi.',
  goforge: 'A Kovácshoz: felkenés, kalibrálás, szakértelem és túlhajtás.',
  wear: 'Felveszed ezt a páncélt.', unwear: 'Leveszed: a páncélraktárba kerül.', gshare: 'A karakterek közti ládába teszed.', gunshare: 'A páncélraktáradba teszed.',
  gun: 'Megveszed: a raktárba kerül.', gbuy: 'Megveszed: a páncélraktárba kerül.', item: 'Megveszed a munkákra.', drop: 'Eldobod a földre: a csapattársad felveheti.',
  tier: 'Rémálom-fokozat: erősebb zombik, cserébe több XP, pénz és jobb zsákmány.', job: 'Elindítod ezt a munkát.', reroll: 'Új munkaajánlatok a térképre.',
  testground: 'Lőtér: próbáld ki a fegyvereidet bábukon, és cserélj a csapattal. Nincs veszély.',
  deep: 'Heti Mélyfúrás: 3 egymás utáni, egyre nehezebb munka. A végén egzotikus tárgy, 2 mag és 60 ⚙.', deepnext: 'A Mélyfúrás következő szakasza.',
  respec: 'Visszakapod a fába tett érdemérmeket, és újraoszthatod őket.', sk: 'Egy szinttel fejleszted ezt a képességet (1 érdemérem).', cls: 'Ezt a kasztot választod.',
  aug: 'A képesség-módosító megváltoztatja a kasztképességed működését. Egyszerre egy lehet aktív, szabadon váltható.', swcls: 'Átváltasz erre a kasztra. Ingyenes, a pontjaid kasztonként megmaradnak.',
  claim: 'Beváltod a teljesített kontrakt jutalmát.', bsave: 'A mostani fegyvereidet és páncélodat elmented ebbe a buildbe.', bload: 'Felveszed a buildbe mentett felszerelést.',
  pcreate: 'Csapatot hozol létre: kapsz egy kódot, amivel a barátod csatlakozhat.', pjoin: 'Csatlakozol ehhez a csapathoz.', pjoinc: 'Csatlakozás csapatkóddal.', pready: 'Jelzed a vezetőnek, hogy készen állsz.',
  pleave: 'Kilépsz a csapatból.', pcopy: 'A csapatkódot a vágólapra másolod.', preveal: 'Megmutatja vagy elrejti a csapatkódot.',
};
function actTip(act) { const p = act.split(':'); return p[0] === 'mv' ? MV_TIP[p[3]] || '' : TIPS[p[0] + ':' + p[1]] || TIPS[p[0]] || ''; }
const tipAttr = t => t ? ` data-tip="${t.replace(/"/g, '&quot;')}"` : '';
const expTip = (it, gear) => gear ? `Szakértelem: +3% a darab minden értékére szintenként (páncél, márka, statok). Most: +${3 * (it.exp || 0)}%, legfeljebb +30%.`
  : `Szakértelem: +2% sebzés ezzel a fegyverrel szintenként. Most: +${2 * (it.exp || 0)}%, legfeljebb +20%.`;
const hbtn = (label, act, off, key, tip) => `<button class="sbtn"${tipAttr(tip || actTip(act))} data-act="${act}"${key ? ` data-key="${key}"` : ''}${off ? ' disabled' : ''}>${key ? `<kbd>${KEY_LABEL[key]}</kbd>` : ''}${label}</button>`;
const hhold = (label, act, off, key) => `<button class="sbtn hold"${tipAttr('Tartsd lenyomva: a tárgy megsemmisül, és alkatrészt (⚙) kapsz érte, ha kijutsz.')} data-hact="${act}"${key ? ` data-key="${key}"` : ''}${off ? ' disabled' : ''}>${key ? `<kbd>${KEY_LABEL[key]}</kbd>` : ''}${label}</button>`;
const freeHand = L => L[0] ? L[1] ? 0 : 1 : 0;
const fieldParts = q => Math.max(1, Math.floor(PARTS[q] / 2)); // taking a gun apart in the field: half what the bench at home gets
const testJob = () => ({ map: 'range', diff: 1, dur: 1e6, mod: null, boss: false, type: 'test', test: true, title: 'Lőtér', client: '', reward: 0, xp: 0, lvl: profile.level, goal: 0 });
const HUB = {
  skills: () => skillsTab(),
  vet: () => vetTab(),
  party: () => `<div class="hubhead"><h2>Csapat</h2></div><p class="lede">Hozz létre csapatot, vagy csatlakozz egy kóddal. A vezető választja a munkát, a tagok jelzik, hogy készen állnak.</p>${partyPanel()}`,
  bweap: () => bookWeapons(), btal: () => bookTalents(), bgear: () => bookGear(), bzomb: () => bookZombies(), bboss: () => bookBounties(), bjobs: () => bookJobs(),
  coll: () => collTab(),
  jobs() { // a county map with the jobs on it (Deep Rock style); the picked one's card on the side
    const P = profile, lead = NET.code && !NET.host ? partyMembers().find(m => m.h) : null, J = lead && lead.bd && lead.bd.length ? lead.bd : P.jobs; if (!J[jobSel]) jobSel = 0; // a member sees the leader's board
    const notReady = NET.code && NET.host ? partyMembers().filter(m => !m.me && !m.rdy).length : 0;
    const loc = id => MAP_LOC[id] || [450, 220];
    const locs = MAP_IDS.map(id => { const [x, y] = loc(id), open = MAPS[id].minLevel <= P.level, feat = id === featuredMap();
      return `<g class="loc${open ? '' : ' locked'}${feat ? ' feat' : ''}" transform="translate(${x} ${y})">${feat ? '<circle r="16" class="fring"/>' : ''}<rect x="-8" y="-8" width="16" height="16" transform="rotate(45)"/><text y="30">${feat ? '★ ' : ''}${MAPS[id].name}</text>${feat ? '<text y="44" class="lk ft">heti kiemelt · +25% XP</text>' : ''}${open ? '' : `<text y="44" class="lk">${MAPS[id].minLevel}. szinttől</text>`}</g>`; }).join('');
    const marks = J.map((j, i) => {
      const [lx, ly] = loc(j.map), k = J.slice(0, i).filter(o => o.map === j.map).length, [dx, dy] = [[0, -44], [62, -6], [-62, -6], [44, 36], [-44, 36]][k % 5];
      const col = j.bounty ? '#ff8c1a' : j.tier ? '#b05cff' : DIFF_COL[j.diff - 1];
      const tag = j.bounty ? 'FEJVADÁSZAT' : j.tier ? `RÉMÁLOM +${j.tier}` : DIFF_NAMES[j.diff - 1].toUpperCase();
      return `<g class="jm${i === jobSel ? ' on' : ''}" data-act="jsel:${i}" transform="translate(${lx + dx} ${ly + dy})" style="--jc:${col}"><line x1="0" y1="0" x2="${-dx}" y2="${-dy}"/><circle class="ring" r="18"/><circle class="dot" r="${j.bounty || j.tier ? 10 : 8}"/><text y="-24">${tag}</text></g>`;
    }).join('');
    return `<details class="extras" ontoggle="hubExtras = this.open"${(window.hubExtras ?? innerHeight > 860) ? ' open' : ''}><summary>Kontraktok · Mélyfúrás · Direktívák</summary>${contractsStrip()}${deepCard()}${directivesRow()}</details><div class="hubhead"><h2>Munkák</h2><span>${hbtn('Lőtér', 'testground', NET.code && !NET.host)}${hbtn(NET.code && !NET.host ? 'Új munkák: csak a vezető' : `Új munkák · $${reroll()}`, 'reroll', P.cash < reroll() || !!(NET.code && !NET.host))}</span></div>
      <div class="jobmap"><svg viewBox="0 0 900 440" class="jsvg" role="img" aria-label="Munkatérkép">${MAP_ART}${locs}${marks}</svg><div class="jside">${hostPick()}${jobCard(J[jobSel], jobSel, notReady)}</div></div>`;
  },
  arsenal() {
    const P = profile, lists = { L: P.loadout.map(unpackW), B: P.bag.map(unpackW), S: P.stash.map(unpackW), K: SH.w.map(unpackW) }, sharedFull = SH.w.length >= SHARED_MAX;
    let [sl, si] = invSel.split(':');
    if (!lists[sl] || !lists[sl][+si]) { sl = 'L'; si = lists.L[0] ? 0 : 1; invSel = `L:${si}`; }
    const i = +si, w = lists[sl][i], bagFull = lists.B.length >= bagMax(), stashFull = lists.S.length >= stashMax(), lone = lists.L.filter(Boolean).length < 2;
    let acts = '';
    if (w && sl === 'L') acts = hbtn('Táskába', `mv:L:${i}:B`, lone || bagFull, 'KeyF') + hbtn(`${2 - i}. kézbe`, `mv:L:${i}:L:${1 - i}`, false, `Digit${2 - i}`) + hbtn('Raktárba', `mv:L:${i}:S`, lone || stashFull, 'KeyR') + hbtn('Karakterládába', `mv:L:${i}:K`, lone || sharedFull, 'KeyK') + wSellBtns(w, 'L', i, lone);
    else if (w && sl === 'K') acts = hbtn('Kézbe', `mv:K:${i}:L:${freeHand(lists.L)}`, !canUse(w), 'KeyF') + hbtn('Táskába', `mv:K:${i}:B`, bagFull, 'KeyT') + hbtn('Raktárba', `mv:K:${i}:S`, stashFull, 'KeyR');
    else if (w) acts = hbtn('Kézbe', `mv:${sl}:${i}:L:${freeHand(lists.L)}`, !canUse(w), 'KeyF') + hbtn('1. kézbe', `mv:${sl}:${i}:L:0`, !canUse(w), 'Digit1') + hbtn('2. kézbe', `mv:${sl}:${i}:L:1`, !canUse(w), 'Digit2') +
      hbtn('Karakterládába', `mv:${sl}:${i}:K`, sharedFull, 'KeyK') + (sl === 'B' ? hbtn('Raktárba', `mv:B:${i}:S`, stashFull, 'KeyR') : hbtn('Táskába', `mv:S:${i}:B`, bagFull, 'KeyT')) + wSellBtns(w, sl, i, false);
    if (w) acts += hbtn('Kovács ›', 'goforge', false, 'KeyG');
    const cmp = sl === 'L' ? lists.L[1 - i] : lists.L[0] || lists.L[1];
    const hands = lists.L.map((x, k) => x ? wTile(`L:${k}`, x, { n: `${k + 1}` }) : emptyTile(`${k + 1}. kéz üres`, 'Húzz ide egy fegyvert', null, `L:${k}`)).join('');
    const left = `<h3>Kézben</h3><div class="tiles" data-drop="L">${hands}</div>
      <h3>Táska <small>${lists.B.length} / ${bagMax()}</small></h3><div class="tiles" data-drop="B">${lists.B.map((x, k) => wTile(`B:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'A munkára is jön')}</div>
      <h3>Raktár <small>${lists.S.length} / ${stashMax()}</small></h3><div class="tiles" data-drop="S">${lists.S.map((x, k) => wTile(`S:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'A vett és talált fegyverek ide kerülnek')}</div>
      <h3>Karakterek közti láda <small>${SH.w.length} / ${SHARED_MAX} · a saját mentéseid között, nem a csapattal</small></h3><div class="tiles shared" data-drop="K">${lists.K.map((x, k) => wTile(`K:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'Tegyél ide fegyvert, és a másik mentésed is eléri')}</div>`;
    const junk = `<span class="junk"><b>Auto-szétszedés kijutáskor</b>${['Ki', 'Közönséges', 'Nem mindennapi', 'Ritka'].map((t, q) => `<button class="chip${(P.junkQ == null ? -1 : P.junkQ) === q - 1 ? ' on' : ''}" data-act="junk:${q - 1}" data-tip="${q ? `Kijutáskor a talált ${t.toLowerCase()} és gyengébb fegyvereket magától alkatrészre szedi.` : 'Nincs automatikus szétszedés.'}">${t}${q ? '-ig' : ''}</button>`).join('')}</span>`;
    return `${buildsRow(junk)}${trashBar('w')}

      ${invLayout(left, w ? weaponDetail(w, cmp, acts) : noDetail('Válassz egy fegyvert.'))}`;
  },
  gear() {
    const P = profile, st = P.gearStash;
    let [sl, si] = invSel.split(':');
    const get = () => sl === 'W' ? P.gear[si] : sl === 'G' ? st[+si] : sl === 'H' ? SH.g[+si] : null;
    if (!get()) { const k = GEAR_KEYS.find(k => P.gear[k]); [sl, si] = k ? ['W', k] : ['G', '0']; invSel = `${sl}:${si}`; }
    const it = get();
    const acts = !it ? '' : sl === 'W' ? hbtn('Leveszem', `unwear:${si}`, st.length >= gearMax(), 'KeyF') + hbtn('Kovács ›', 'goforge', false, 'KeyG') + gSellBtns(it, 'W', si) : sl === 'H' ? hbtn('Raktárba', `gunshare:${si}`, st.length >= gearMax(), 'KeyR') : hbtn('Felveszem', `wear:${si}`, !canUse(it), 'KeyF') + hbtn('Karakterládába', `gshare:${si}`, SH.g.length >= SHARED_MAX, 'KeyK') + hbtn('Kovács ›', 'goforge', false, 'KeyG') + gSellBtns(it, 'G', si);
    const worn = GEAR_KEYS.map(k => P.gear[k] ? gTile(`W:${k}`, P.gear[k]) : emptyTile(GEAR_SLOTS[k], 'Húzz ide páncélt', gearIcon(k, '#5a5a55'), 'W')).join('');
    const sorted = st.map((x, k) => [x, k]).sort((a, b) => GEAR_KEYS.indexOf(a[0].slot) - GEAR_KEYS.indexOf(b[0].slot) || b[0].q - a[0].q);
    const left = `<h3>Viselt</h3><div class="tiles worn" data-drop="W">${worn}</div>
      <h3>Páncélraktár <small>${st.length} / ${gearMax()}</small></h3><div class="tiles" data-drop="G">${sorted.map(([x, k]) => gTile(`G:${k}`, x, { cmp: P.gear[x.slot] || null })).join('') || emptyTile('Üres', 'A munkán talált páncél ide kerül')}</div>
      <h3>Karakterek közti láda <small>${SH.g.length} / ${SHARED_MAX} · a saját mentéseid között, nem a csapattal</small></h3><div class="tiles shared" data-drop="H">${SH.g.map((x, k) => gTile(`H:${k}`, x, { cmp: P.gear[x.slot] || null })).join('') || emptyTile('Üres', 'Tegyél ide páncélt a többi karakterednek')}</div>
`;
    return `${buildsRow()}${trashBar('g')}
      <p class="lede">Sisak, mellvért, nadrág, csizma. A páncél a pajzsodat növeli, minden darab márkabónuszt ad, és 2/3/4 azonos márkájú darab szettbónuszt. Kattints egy darabra a részletekért.</p>
      ${invLayout(left, it ? gearDetail(it, sl === 'G' ? P.gear[it.slot] : null, acts) : noDetail('Még nincs páncélod. A zombik dobják, és a boltban is van.'))}`;
  },
  forge() { // the smith: levels, rarity, anoint, recalibration, expertise and overclocks, away from the move/sell buttons
    const P = profile, lists = { L: P.loadout.map(unpackW), B: P.bag.map(unpackW), S: P.stash.map(unpackW) }, st = P.gearStash;
    let [sl, si] = invSel.split(':');
    const okSel = () => lists[sl] ? !!lists[sl][+si] : sl === 'W' ? !!P.gear[si] : sl === 'G' ? !!st[+si] : false;
    if (!okSel()) { sl = 'L'; si = lists.L[0] ? '0' : '1'; invSel = `L:${si}`; }
    const i = +si, w = lists[sl] && lists[sl][i], it = !w && (sl === 'W' ? P.gear[si] : st[i]);
    const gOptPanel = () => `<div class="optbox"><small>Páncél-optimalizálás · egy érték +10%-kal feljebb a tartományában, a tökéletesig · van: ${P.fabric || 0} ${FAB} (páncél szétszedéséből)</small>${gRolls(it).map(([k, n, pr]) => { const C = gOptCost(it, pr), max = pr >= .999;
      return `<div class="optrow"><span>${n}</span>${rbarP(pr)}<b>${Math.round(pr * 100)}%</b><button class="sbtn" data-act="gopt:${sl}:${si}:${k}"${max || (P.fabric || 0) < C.fab || P.cash < C.cash ? ' disabled' : ''}>${max ? 'Tökéletes' : `+10% · ${C.fab} ${FAB} · $${C.cash}`}</button></div>`; }).join('')}</div>`;
    const pp = P.parts || 0, optPanel = () => `<div class="optbox"><small>Optimalizálás · egy véletlen érték +10%-kal feljebb a tartományában, a tökéletesig</small>${OPT_STATS.map(([k, n]) => { const pr = rollOf(w, k); if (pr == null) return ''; const C = optCost(w, pr), max = pr >= .999;
        return `<div class="optrow"><span>${n}</span>${rbarP(pr)}<b>${Math.round(pr * 100)}%</b><button class="sbtn" data-act="opt:${sl}:${i}:${k}" data-tip="${n}: a dobás ${Math.round(pr * 100)}% → ${Math.round(Math.min(1, pr + OPT_STEP) * 100)}%"${max || pp < C.parts || P.cash < C.cash ? ' disabled' : ''}>${max ? 'Tökéletes' : `+10% · ${C.parts} ⚙ · $${C.cash}`}</button></div>`; }).join('')}</div>`;
    const wActs = w && (() => {
      const pp = P.parts || 0;
      return (w.q >= 2 && !w.anoPend ? hbtn(`Felkenés újradobása · ${HFORGE.anoint(w)} ⚙`, `hforge:anoint:${sl}:${i}`, pp < HFORGE.anoint(w), 'KeyN') : '') +
      (w.anoPend ? `<div class="anopend"><small>Új felkenés dobva</small><b>${anoName(w.anoPend)}: ${ANOINTS[w.anoPend]}</b><span>Most: ${w.anoint ? `${anoName(w.anoint)}: ${ANOINTS[w.anoint]}` : 'nincs'}</span>${hbtn('Elfogadom', `anoacc:${sl}:${i}`, false, null, 'Az új felkenés kerül a fegyverre.')}${hbtn('Elutasítom', `anorej:${sl}:${i}`, false, null, 'Marad a régi felkenés. Az alkatrész nem jár vissza.')}</div>` : '') +
      hbtn(optOpen === `${sl}:${i}` ? 'Optimalizálás ▲' : 'Optimalizálás ▼', 'optshow', false, 'KeyO', 'Megnyitja / bezárja: egy véletlen érték feljebb vihető a tartományában, a tökéletesig.') +
      hbtn(`Kalibrálás (új dobás) · ${HFORGE.recal(w)} ⚙`, `hforge:recal:${sl}:${i}`, pp < HFORGE.recal(w), 'KeyC') +
      hbtn((w.exp || 0) >= 10 ? 'Szakértelem: max' : `Szakértelem ${(w.exp || 0) + 1}/10 · ${expCost(w)} ⚙`, `hforge:exp:${sl}:${i}`, (w.exp || 0) >= 10 || pp < expCost(w), 'KeyM', expTip(w)) +
      ((P.oc || 0) < 1 && !w.oc ? `<div class="ocrow"><small>Túlhajtás: maggal szerelhető be. Magot ad: fejvadász első legyőzése, heti kontrakt, Mélyfúrás.</small></div>` : `<div class="ocrow"><small>Túlhajtás · első beszerelés 1 mag + 20 ⚙, csere 20 ⚙ (van: ${P.oc || 0} mag)</small>${Object.entries(OVERCLOCKS).map(([k, O]) => `<button class="chip${w.oc === k ? ' on' : ''}" data-act="ocset:${sl}:${i}:${k}" title="${O.desc}${ocFits(w, k) ? '' : ' (erre a fegyverre nem jó)'}"${w.oc === k || !ocFits(w, k) || (!w.oc && (P.oc || 0) < 1) || pp < 20 ? ' disabled' : ''}>${O.name}</button>`).join('')}</div>`);
    })();
    const gActs = it ? hbtn(optOpen === `${sl}:${si}` ? 'Optimalizálás ▲' : 'Optimalizálás ▼', 'optshow', false, 'KeyO', 'Megnyitja / bezárja: a páncél egy értéke feljebb vihető a tartományában, anyagért.') + hbtn((it.exp || 0) >= 10 ? 'Szakértelem: max' : `Szakértelem ${(it.exp || 0) + 1}/10 · ${expCost(it)} ⚙`, `gexp:${sl}:${si}`, (it.exp || 0) >= 10 || (P.parts || 0) < expCost(it), 'KeyM', expTip(it, true)) : '';
    const sec = (t, x) => x ? `<h3>${t}</h3><div class="tiles">${x}</div>` : '';
    const left = sec('Kézben', lists.L.map((x, k) => x ? wTile(`L:${k}`, x, { n: `${k + 1}` }) : '').join('')) + sec('Táska', lists.B.map((x, k) => wTile(`B:${k}`, x)).join('')) + sec('Raktár', lists.S.map((x, k) => wTile(`S:${k}`, x)).join('')) +
      sec('Viselt páncél', GEAR_KEYS.map(k => P.gear[k] ? gTile(`W:${k}`, P.gear[k]) : '').join('')) + sec('Páncélraktár', st.map((x, k) => gTile(`G:${k}`, x)).join(''));
    return `<p class="lede">Kovács: optimalizálás, felkenés, kalibrálás, szakértelem és túlhajtás (⚙ ${P.parts || 0} · mag: ${P.oc || 0}). Válassz egy fegyvert vagy páncélt.</p>
      ${invLayout(left, w ? (optOpen === `${sl}:${i}` ? optPanel() : '') + weaponDetail(w, null, wActs) : it ? (optOpen === `${sl}:${si}` ? gOptPanel() : '') + gearDetail(it, null, gActs) : noDetail('Nincs mit fejleszteni.'))}`;
  },
  stats() {
    const P = profile, ws = P.loadout.map(unpackW).filter(Boolean);
    return `<div class="statpage"><h3>Karakter</h3><ul class="mlist kv"><li><b>Kaszt</b><span>${P.cls ? CLASSES[P.cls].name : 'nincs'}</span></li><li><b>Szint</b><span>${P.level}</span></li><li><b>Max életerő</b><span>${Math.round(maxHp())}</span></li>${ws.map((w, k) => `<li><b>${k + 1}. kéz · ${w.name}</b><span>DPS ${dps(w)}</span></li>`).join('')}</ul>
      <h3>Páncél összesítve</h3>${gearSummary()}
      <p class="note">Minden fegyver, szett, tehetség és zombi leírása a Kézikönyvben van.</p></div>`;
  },
  upgrades() {
    return `<div class="hubhead"><h2>Fejlesztések</h2></div><p class="lede">Tartós fejlesztések dollárért. Minden munkára veled jönnek.</p>
      <div class="slist two">${Object.entries(UPGRADES).map(([k, u]) => {
        const l = U(k), maxed = l >= u.max, c = upCost(k);
        return srow(`${u.name} ${pips(l, u.max)}`, `${u.desc} · most: ${u.val(l)}${maxed ? '' : ` → ${u.val(l + 1)}`}`, `${l}/${u.max}`, `up:${k}`, maxed || profile.cash < c, maxed ? 'Kész' : `$${c}`);
      }).join('')}</div>`;
  },
  shop() {
    const P = profile;
    const items = Object.entries(ITEM_PRICE).map(([k, c]) => {
      const n = k === 'knife' ? 3 : 1, full = P.inv[k] >= itemMax(k);
      return srow(`<img class="sico" src="${ICONS[k]}" alt="">${ITEMS[k].name}${n > 1 ? ` ×${n}` : ''}`, `${ITEMS[k].desc} · nálad: ${P.inv[k]}/${itemMax(k)}`, `$${c}`, `item:${k}`, full || P.cash < c, full ? 'Tele' : 'Megveszem');
    }).join('');
    let [sl, si] = invSel.split(':');
    const get = () => sl === 'P' ? P.shop[+si] && unpackW(P.shop[+si]) : sl === 'Q' ? P.gshop[+si] : sl === 'I' && ITEMS[si] ? si : null;
    if (!get()) { const a = P.shop.findIndex(Boolean), b = P.gshop.findIndex(Boolean); [sl, si] = a >= 0 ? ['P', a] : ['Q', b]; invSel = `${sl}:${si}`; }
    const x = get();
    let detail = noDetail('Minden elfogyott. Munka után megújul a kínálat.');
    if (x && sl === 'P') { const c = shopPrice(x); detail = weaponDetail(x, unpackW(P.loadout[0]) || unpackW(P.loadout[1]), hbtn(`Megveszem · $${c}`, `gun:${si}`, P.cash < c || P.stash.length >= stashMax(), 'KeyF')); }
    if (x && sl === 'I') { const c = ITEM_PRICE[x], full = P.inv[x] >= itemMax(x); detail = itemDetail(x, hbtn(full ? 'Tele' : `Megveszem · $${c}`, `item:${x}`, full || P.cash < c, 'KeyF')); }
    if (x && sl === 'Q') { const c = gearPrice(x); detail = gearDetail(x, P.gear[x.slot], hbtn(`Megveszem · $${c}`, `gbuy:${si}`, P.cash < c || P.gearStash.length >= gearMax(), 'KeyF')); }
    const L0 = unpackW(P.loadout[0]) || unpackW(P.loadout[1]);
    const guns = P.shop.map((o, k) => { if (!o) return ''; const w = unpackW(o), c = shopPrice(w); return wTile(`P:${k}`, w, { cmp: L0, price: `$${c}`, cant: P.cash < c }); }).join('');
    const gear = P.gshop.map((it, k) => it ? gTile(`Q:${k}`, it, { cmp: P.gear[it.slot] || null, price: `$${gearPrice(it)}`, cant: P.cash < gearPrice(it) }) : '').join('');
    const cons = Object.entries(ITEM_PRICE).map(([k, c]) => tile(`I:${k}`, ICONS[k], itemName(k), `${ITEMS[k].desc}`, ITEMS[k].color, { val: `${P.inv[k]}/${itemMax(k)}`, valLbl: 'nálad', price: `$${c}`, cant: P.cash < c || P.inv[k] >= itemMax(k) })).join('');
    const left = `<h3>Fegyverek</h3><div class="tiles">${guns || emptyTile('Elfogyott', 'Munka után megújul')}</div>
      <h3>Páncél</h3><div class="tiles">${gear || emptyTile('Elfogyott', 'Munka után megújul')}</div>
      <h3>Felszerelés</h3><div class="tiles">${cons}</div>
      <h3>Szerencsekerék <small>pénzért bármi kijöhet, a semmitől a legendásig</small></h3><div class="slist">${srow('Pörgetés', `${SLOT_TXT}`, `$${slotCost()}`, 'slot', P.cash < slotCost() || P.stash.length >= stashMax(), 'Pörgetés')}${P.lastSlot ? `<p class="note">Legutóbb: ${P.lastSlot}</p>` : ''}</div>
      <h3>Gránát- és késfajták <small>egyszer veszed meg, utána szabadon választható</small></h3><div class="slist">${throwRows()}</div>`;
    return `<div class="hubhead"><h2>Bolt</h2></div><p class="lede">A kínálat minden munka után megújul. A vett fegyver a raktárba, a páncél a páncélraktárba kerül.</p>
      ${invLayout(left, detail)}`;
  },
  career() {
    const t = Math.round(stats.time / 60), ptime = t < 60 ? `${t} p` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const cells = [['Szint', profile.level], ['Kész munkák', stats.jobs], ['Elbukott', stats.fails], ['Ölések', stats.kills], ['Fejlövések', stats.heads],
      ['Keresett pénz', `$${stats.cash}`], ['Legendás fegyverek', stats.legendaries], ['Játékidő', ptime]];
    const maps = MAP_IDS.map(id => { const m = stats.byMap[id] || {}; return `<li><b>${MAPS[id].name}</b><span>${profile.level >= MAPS[id].minLevel ? `${m.done || 0} kész · ${m.fail || 0} elbukott` : `${MAPS[id].minLevel}. szinttől`}</span></li>`; }).join('');
    return `<div class="hubhead"><h2>Karrier</h2></div><label class="charname">Karakter neve <input id="charName" maxlength="24" value="${esc(profile.name)}"></label><div class="stats wide">${cells.map(([a, b]) => `<div>${a}<strong>${b}</strong></div>`).join('')}</div>
      <h3>Fegyvermesterség <small>ölések fegyvertípusonként · szintenként +2% sebzés azzal a típussal</small></h3><div class="mastery">${BASES.map(b => { const n = (stats.byBase || {})[b.id] || 0, t = masteryTier(b.id), next = MASTERY[t], prev = t ? MASTERY[t - 1] : 0;
        return `<div class="mst${t ? ' on' : ''}"><img src="${gunShot(b, Math.min(4, t))}" alt=""><b>${b.name}</b><small>${t ? `${MASTERY_NAMES[t - 1]} · +${2 * t}%` : 'még nincs szint'}</small><i><em style="width:${next ? Math.min(100, (n - prev) / (next - prev) * 100) : 100}%"></em></i><small>${n}${next ? ` / ${next}` : ' · max'}</small></div>`; }).join('')}</div>
      <div class="mcols"><section><h3>Pályák</h3><ul class="mlist">${maps}</ul></section>
      <section><h3>Ölések fajtánként</h3><ul class="mlist cols2">${Object.entries(KINDS).sort((a, b) => (stats.killsBy[b[0]] || 0) - (stats.killsBy[a[0]] || 0)).map(([k, K]) => `<li class="${stats.killsBy[k] ? '' : 'zero'}"><b>${K.name}</b><span>${stats.killsBy[k] || '–'}</span></li>`).join('')}</ul></section></div>`;
  },
};
enableDrag($('hubBody'));
// five tabs; Felszerelés and Fejlődés have sub-tabs
const HUB_GROUPS = { kit: [['arsenal', 'Fegyverek'], ['gear', 'Páncél'], ['forge', 'Kovács'], ['stats', 'Statisztika']], grow: [['skills', 'Képességek'], ['upgrades', 'Fejlesztések'], ['vet', 'Veterán'], ['coll', 'Gyűjtemény']],
  book: [['bweap', 'Fegyverek'], ['btal', 'Tehetségek'], ['bgear', 'Páncél'], ['bzomb', 'Zombik'], ['bboss', 'Fejvadászok'], ['bjobs', 'Munkák és pályák']] };
document.querySelectorAll('.mbtn[data-hub]').forEach(b => b.onclick = () => { hubTab = b.dataset.hub; renderHub(); });
$('hubBody').addEventListener('click', e => { const t = e.target.closest('[data-sub]'); if (t) { hubTab = t.dataset.sub; renderHub(); } });
$('hubMenuBtn').onclick = () => { saveProfile(); openMenu(); };
$('hubBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [kind, a, c] = b.dataset.act.split(':'), P = profile;
  if (CONFIRM_ACTS.includes(kind) && !confirmOk) return askConfirm(b);
  const pay = n => { if (P.cash < n) return false; P.cash -= n; return true; };
  if (kind === 'goforge') { hubTab = 'forge'; return renderHub(); }
  if (kind === 'sel') { invSel = b.dataset.act.slice(4); return renderHub(); }
  if (kind === 'jsel') { jobSel = +a; if (NET.host) publishMember(); return renderHub(); }
  if (kind === 'claim') claimContract(a);
  if (kind === 'gexp') { const it = a === 'W' ? P.gear[c] : a === 'G' ? P.gearStash[+c] : null; if (it && (it.exp || 0) < 10 && (P.parts || 0) >= expCost(it)) { P.parts -= expCost(it); it.exp = (it.exp || 0) + 1; gearChanged(); SND.explode(); } }
  if (kind === 'ocset') { const [, l, i, k] = b.dataset.act.split(':'), list = { L: P.loadout, B: P.bag, S: P.stash, K: SH.w }[l], w = list && list[+i] && unpackW(list[+i]); if (w && OVERCLOCKS[k] && ocFits(w, k) && (w.oc || (P.oc || 0) >= 1) && (P.parts || 0) >= 20 && w.oc !== k) { if (!w.oc) P.oc--; P.parts -= 20; setOverclock(w, k); list[+i] = packW(w); SND.explode(); } }
  if (kind === 'deep') { if (!P.cls || (NET.code && !NET.host)) return; return startJob(deepJob(clamp(+a, 0, 2))); }
  if (kind === 'dir' && DIRECTIVES[a] && !(NET.code && !NET.host)) { const D = P.dirs || (P.dirs = []), i = D.indexOf(a); if (i >= 0) D.splice(i, 1); else D.push(a); if (NET.host) publishMember(); }
  if (kind === 'bsave') saveBuild(+a);
  if (kind === 'bload') loadBuild(+a);
  if (kind === 'slot' && P.stash.length < stashMax() && pay(slotCost())) spinSlot();
  if (kind === 'tier') { const j = P.jobs[+a]; if (j && j.tier && j.base) { const T = clamp(j.tier + +c, 1, (P.tier || 0) + 1); setTier(j, T); P.tierSel = T; } }
  if (kind === 'junk') P.junkQ = clamp(+a, -1, 2);
  if (kind === 'testground') { if (NET.code && !NET.host) return; return startJob(testJob()); }
  if (kind === 'job') { if (!P.cls) { hubTab = 'skills'; return renderHub(); } if (NET.code && (!NET.host || partyMembers().some(m => !m.me && !m.rdy))) return; return startJob(P.jobs[+a]); }
  if (['cls', 'sk', 'respec', 'aug', 'skview', 'swcls'].includes(kind)) skillAction(kind, a);
  if (['pcreate', 'pjoin', 'pjoinc', 'pleave', 'preveal', 'pcopy', 'pready'].includes(kind)) return partyAction(kind, a);
  if (kind === 'vet' && VET[a] && vetOpen() && vetAvail() > 0) { SH.vet.ranks[a] = (SH.vet.ranks[a] || 0) + 1; saveShared(); gearChanged(); }
  if (kind === 'reroll' && !(NET.code && !NET.host) && pay(reroll())) rollBoard();
  if (kind === 'optshow') { optOpen = optOpen === invSel ? null : invSel; return renderHub(); }
  if (kind === 'gopt') { // gopt:W|G:key:stat
    const [, l, k, st] = b.dataset.act.split(':'), it = gearAt(l, k), row = it && gRolls(it).find(r => r[0] === st);
    if (row && row[2] < .999) { const C = gOptCost(it, row[2]); if ((P.fabric || 0) >= C.fab && P.cash >= C.cash && gOptimize(it, st)) { P.fabric -= C.fab; P.cash -= C.cash; SND.explode(); } }
  }
  if (kind === 'opt') { // opt:list:i:stat
    const [, l, i, k] = b.dataset.act.split(':'), list = { L: P.loadout, B: P.bag, S: P.stash, K: SH.w }[l], w = list && list[+i] && unpackW(list[+i]), pr = w && rollOf(w, k);
    if (w && pr != null && pr < .999) { const C = optCost(w, pr); if ((P.parts || 0) >= C.parts && P.cash >= C.cash && optimize(w, k)) { P.parts -= C.parts; P.cash -= C.cash; list[+i] = packW(w); SND.explode(); } }
  }
  if (kind === 'anoacc' || kind === 'anorej') { // the rolled anointment: keep it or keep the old one
    const list = { L: P.loadout, B: P.bag, S: P.stash, K: SH.w }[a], w = list && list[+c] && unpackW(list[+c]);
    if (w && w.anoPend) { if (kind === 'anoacc') w.anoint = w.anoPend; delete w.anoPend; list[+c] = packW(w); }
  }
  if (kind === 'hforge') { // hforge:level|rarity:L|B|S:i
    const [, what, l, i] = b.dataset.act.split(':'), list = { L: P.loadout, B: P.bag, S: P.stash, K: SH.w }[l], w = list && list[+i] && unpackW(list[+i]);
    const ok = what === 'recal' ? !!w : what === 'exp' ? w && (w.exp || 0) < 10 : w && w.q >= 2 && !w.anoPend, cost = w && what === 'exp' ? expCost(w) : w && HFORGE[what] ? HFORGE[what](w) : 1e9;
    if (ok && (P.parts || 0) >= cost) { P.parts -= cost; if (what === 'recal') { list[+i] = packW(w); return showRecal(w, list, +i); } else if (what === 'exp') w.exp = (w.exp || 0) + 1; else { w.anoPend = pick(Object.keys(ANOINTS).filter(k => k !== w.anoint)); w.anoN = (w.anoN || 0) + 1; } list[+i] = packW(w); SND.explode(); }
  }
  if (kind === 'up' && U(a) < UPGRADES[a].max && pay(upCost(a))) P.up[a] = U(a) + 1;
  if (kind === 'item') { const n = a === 'knife' ? 3 : 1; if (P.inv[a] < itemMax(a) && pay(ITEM_PRICE[a])) P.inv[a] = Math.min(itemMax(a), P.inv[a] + n); }
  if (kind === 'ttype') { // ttype:g|k:kind
    const T = P.throw, list = a === 'g' ? GREN_TYPES : KNIFE_TYPES, D = list[c];
    if (D) { if (!T.own.includes(c)) { if (!pay(D.price)) return; T.own.push(c); } T[a] = c; }
  }
  if (kind === 'gun') { const w = unpackW(P.shop[+a]); if (P.stash.length < stashMax() && pay(shopPrice(w))) { P.stash.push(packW(w)); P.shop[+a] = null; noteFound(w); } }
  if (kind === 'mv') { const [, f, i, t, j] = b.dataset.act.split(':'); moveGun({ L: P.loadout, B: P.bag, S: P.stash, K: SH.w }, f, +i, t, +j); }
  if (kind === 'wear' && P.gearStash[+a] && !exoWearOk(P.gear, P.gearStash[+a])) { SND.deny(); popText('Egyszerre csak 1 egzotikus páncél lehet rajtad', '#ff8a70'); }
  else if (kind === 'wear' && P.gearStash[+a] && !canUse(P.gearStash[+a])) { SND.deny(); popText(`Csak ${P.gearStash[+a].level}. szinttől viselhető`, '#ff8a70'); }
  else if (kind === 'wear') { const it = P.gearStash.splice(+a, 1)[0], old = P.gear[it.slot]; P.gear[it.slot] = it; if (old) P.gearStash.push(old); gearChanged(); }
  if (kind === 'unwear') { P.gearStash.push(P.gear[a]); P.gear[a] = null; gearChanged(); }
  if (kind === 'gshare' && P.gearStash[+a] && SH.g.length < SHARED_MAX) SH.g.push(P.gearStash.splice(+a, 1)[0]);
  if (kind === 'gunshare' && SH.g[+a] && P.gearStash.length < gearMax()) P.gearStash.push(SH.g.splice(+a, 1)[0]);
  if (kind === 'gsell') { const it = gearAt(a, c); if (it && !it.fav) { gRemove(a, c); P.cash += gearValue(it); } }
  if (kind === 'gbuy') { const it = P.gshop[+a]; if (it && P.gearStash.length < gearMax() && pay(gearPrice(it))) { P.gearStash.push(it); P.gshop[+a] = null; } }
  if (kind === 'salvage') { const w = wAt(a, c); if (w && !w.fav) { wRemove(a, c); P.parts = (P.parts || 0) + salvageGain(w); SND.salvage('w'); } } // expertise half back; the core is spent
  if (kind === 'gsalvage') { const it = gearAt(a, c); if (it && !it.fav) { gRemove(a, c); P.fabric = (P.fabric || 0) + PARTS[it.q]; P.parts = (P.parts || 0) + expRefund(it); SND.salvage('g'); } } // armor: fabric, the expertise half back in parts
  if (kind === 'fav' || kind === 'trash') { const w = wAt(a, c); if (w) { if (kind === 'fav') { w.fav = !w.fav; if (w.fav) w.junk = false; } else if (!w.fav) w.junk = !w.junk; wList(a)[+c] = packW(w); } }
  if (kind === 'gfav' || kind === 'gtrash') { const it = gearAt(a, c); if (it) { if (kind === 'gfav') { it.fav = !it.fav; if (it.fav) it.junk = false; } else if (!it.fav) it.junk = !it.junk; } }
  if (kind === 'trashsell' || kind === 'trashsalv') { // every trash-marked piece in the bag and stash (weapons) or the armor stash
    const sell = kind === 'trashsell';
    if (a === 'w') for (const sl of ['S', 'B']) { const L = wList(sl); for (let k = L.length - 1; k >= 0; k--) { const w = unpackW(L[k]); if (w && w.junk && !w.fav) { L.splice(k, 1); if (sell) P.cash += sellValue(w); else P.parts = (P.parts || 0) + salvageGain(w); } } }
    else for (let k = P.gearStash.length - 1; k >= 0; k--) { const it = P.gearStash[k]; if (it.junk && !it.fav) { P.gearStash.splice(k, 1); if (sell) P.cash += gearValue(it); else { P.fabric = (P.fabric || 0) + PARTS[it.q]; P.parts = (P.parts || 0) + expRefund(it); } } }
  }
  if (kind === 'sell') { const w = wAt(a, c); if (w && !w.fav) { wRemove(a, c); P.cash += sellValue(w); } }
  SND.buy(); saveProfile(); saveShared(); renderHub();
});

// ---------- after a job ----------
function showResults(r) {
  state = 'results';
  if (document.pointerLockElement) document.exitPointerLock();
  ['hud', 'pause', 'station'].forEach(id => $(id).hidden = true);
  const wl = (list, cls) => list.map(w => `<li class="${cls}" style="color:${rarColor(w)}">${w.name} <small>Lv ${w.level} ${w.base.name}</small></li>`).join('');
  $('resultsBody').innerHTML = `<div class="eyebrow">${r.job.title} · ${MAPS[r.job.map].name}</div>
    <div class="title">${r.success ? 'MUNKA KÉSZ' : 'ELBUKTÁL'}</div>
    <p class="lede">${r.success ? 'Beültél a furgonba, és elhajtottál. A megbízó fizet.' : r.hostEnd ? 'A csapatvezető befejezte a munkát. Részfizetést kapsz.' : r.abandoned ? 'Feladtad a munkát. A megbízó nem fizet.' : 'Elestél. Kimentettek, de a munka közben talált fegyverek odavesztek.'}</p>
    <div class="stats"><div>Ölés<strong>${r.kills}</strong></div><div>Fejlövés<strong>${r.heads}</strong></div><div>Kibírt idő<strong>${fmtTime(r.time)}</strong></div>
      <div>Pontosság<strong>${r.acc}%</strong></div><div>Sebzés<strong>${r.dmg.toLocaleString('hu-HU')}</strong></div>
      <div>Pénz<strong>+$${r.cash}</strong></div><div>XP<strong>+${r.xp}</strong></div><div>Érdemérem<strong>+${r.tokens}</strong></div></div>
    ${r.xpTo != null ? `<div class="xpanim"><small>${profile.level}. szint · ${profile.xp} / ${xpNeed(profile.level)} XP</small><i><em id="xpFill" style="width:${(r.levelUps ? 0 : r.xpFrom) * 100}%"></em></i></div>` : ''}
    ${r.board ? `<h3>Csapat</h3><table class="mtable"><tr><th>Játékos</th><th>Ölés</th><th>Sebzés</th><th>Felélesztés</th></tr>${(() => { const top = Math.max(...r.board.map(p => p.d || 0)); return r.board.sort((a, b) => (b.d || 0) - (a.d || 0) || b.k - a.k).map(p => `<tr><td>${top > 0 && p.d === top ? '★ ' : ''}${esc(p.n)}${p.me ? ' (te)' : ''}</td><td>${p.k}</td><td>${(p.d || 0).toLocaleString('hu-HU')}</td><td>${p.r}</td></tr>`).join(''); })()}</table>` : ''}
    ${profile.tokens > 0 || (vetOpen() && vetAvail() > 0) ? `<p class="note nudge">Elkölthető: ${profile.tokens > 0 ? `${profile.tokens} érdemérem (Fejlődés → Képességek)` : ''}${profile.tokens > 0 && vetOpen() && vetAvail() > 0 ? ' · ' : ''}${vetOpen() && vetAvail() > 0 ? `${vetAvail()} veterán pont (Fejlődés → Veterán)` : ''}</p>` : ''}
    ${r.levelUps ? `<p class="lvlup">Szintet léptél: ${profile.level}. szint! ${MAP_IDS.filter(id => MAPS[id].minLevel === profile.level).map(id => `Új pálya: ${MAPS[id].name}.`).join(' ')}</p>` : ''}
    ${r.deep ? `<p class="deepres">${r.deep.fail ? 'A mélyfúrás megszakadt: legközelebb elölről kezded.' : r.deep.next ? `Mélyfúrás: ${r.deep.next}/3 szakasz kész. ${NET.code && !NET.host ? hbtn('A vezető indítja a következőt', 'deepnext', true) : hbtn('Következő szakasz', 'deepnext')}` : `A HETI MÉLYFÚRÁS KÉSZ! ${r.deep.reward.name} (egzotikus${r.deep.sold ? ', a teli raktár miatt eladva' : ''}), 2 túlhajtás-mag, 60 ⚙.`}</p>` : ''}
    ${r.tierBonus ? `<h3>${r.job.tier ? 'Rémálom-jutalom' : 'Az első munkád jutalma'}</h3><ul class="wlist"><li style="color:${rarColor(r.tierBonus)}">${r.tierBonus.name} <small>Lv ${r.tierBonus.level} ${r.tierBonus.base.name} · a raktárba került</small></li></ul>` : ''}
    ${(() => { const best = [...r.kept].sort((a, b) => (b.unique ? 9 : b.q) - (a.unique ? 9 : a.q) || dps(b) - dps(a))[0]; return best && best.q >= 2 ? `<div class="bestdrop" style="--rc:${rarColor(best)}"><small>A MUNKA LEGJOBB ZSÁKMÁNYA</small><img src="${wPic(best)}" alt=""><b>${best.name}</b><span>${best.unique ? 'Egzotikus' : RARITIES[best.q].name} · Lv ${best.level} ${best.base.name} · ${dps(best)} DPS</span></div>` : ''; })()}
    ${r.kept.length ? `<h3>Hazavitt új fegyverek</h3><ul class="wlist">${wl(r.kept, '')}</ul>` : ''}
    ${r.junkN ? `<p class="note">Automatikus szétszedés: ${r.junkN} fegyver → +${r.junkParts} ⚙</p>` : ''}
    ${r.lost.length ? `<h3>Elveszett fegyverek</h3><ul class="wlist">${wl(r.lost, 'lost')}</ul>` : ''}
    ${r.gear.length ? `<h3>${r.success ? 'Hazavitt páncél' : 'Elveszett páncél'} <small>${r.gear.length} db</small></h3><ul class="wlist">${[...r.gear].sort((a, b) => (b.exo ? 9 : b.q) - (a.exo ? 9 : a.q)).slice(0, 8).map(it => `<li class="${r.success ? '' : 'lost'}" style="color:${gCol(it)}">${it.name} <small>Lv ${it.level} ${GEAR_SLOTS[it.slot]} · ${it.exo ? 'egzotikus' : BRANDS[it.brand].name}</small></li>`).join('')}${r.gear.length > 8 ? `<li><small>…és még ${r.gear.length - 8} darab a raktárban</small></li>` : ''}</ul>` : ''}
    ${r.fabric ? `<p class="lvlup">Anyag a terepen szétszedett páncélból: +${r.fabric} ${FAB}</p>` : ''}${r.parts ? `<p class="lvlup">Alkatrész a terepen szétszedett holmiból: +${r.parts} ⚙</p>` : r.partsLost ? `<p class="note">A terepen szétszedett holmi alkatrésze (${r.partsLost} ⚙) odaveszett.</p>` : ''}
    ${r.overflow ? `<p class="note">A páncélraktár megtelt: ${r.overflow} darabot automatikusan eladtunk.</p>` : ''}`;
  $('results').hidden = false;
  const f = $('xpFill'); if (f) setTimeout(() => { f.style.width = Math.min(1, r.xpTo) * 100 + '%'; }, 250); // the XP bar fills up
}
$('resultsBtn').onclick = showHub;

// renaming the character (Karrier tab)
$('hubBody').addEventListener('change', e => {
  if (e.target.id !== 'charName') return;
  profile.name = e.target.value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || profile.name;
  saveProfile(); publishMember(); renderHub();
});

function throwRows() {
  const T = profile.throw, row = (slot, key, D) => {
    const own = T.own.includes(key), on = T[slot] === key;
    return srow(`${D.name}${on ? ' <span class="vrank">nálad</span>' : ''}`, D.desc, own ? '' : `$${D.price}`, `ttype:${slot}:${key}`, on || (!own && profile.cash < D.price), on ? 'Kiválasztva' : own ? 'Kiválaszt' : 'Megveszem');
  };
  return Object.entries(GREN_TYPES).map(([k, D]) => row('g', k, D)).join('') + Object.entries(KNIFE_TYPES).map(([k, D]) => row('k', k, D)).join('');
}

// ---------- the slot machine: a cash sink with a jackpot ----------
const slotLvl = () => profile.level >= LEVEL_CAP ? LEVEL_CAP + 2 * (profile.tier || 0) : profile.level, slotCost = () => 400 + 120 * slotLvl(), SLOT_TXT = '55% semmi vagy pénz vissza · 25% ⚙ · 15% fegyver · 4% legendás · 1% egzotikus';
function spinSlot() {
  const P = profile, r = Math.random(), lv = slotLvl();
  let msg;
  if (r < .35) msg = 'Semmi. A gép nyert.';
  else if (r < .55) { const c = Math.round(slotCost() * rand(.5, 2)); P.cash += c; msg = `$${c} vissza`; }
  else if (r < .80) { const n = 4 + Math.floor(Math.random() * 10); P.parts = (P.parts || 0) + n; msg = `+${n} ⚙`; }
  else { const q = r < .95 ? Math.max(1, rollRarity(.4)) : r < .99 ? 4 : 5, w = makeWeapon(pick(BASES), q, lv); P.stash.push(packW(w)); noteFound(w); msg = `${w.name} (${w.unique ? 'egzotikus' : RARITIES[w.q].name}) a raktárba`; if (q >= 4) { banner('JACKPOT!', w.name); SND.legend(w.unique); } }
  P.lastSlot = msg; SND.sell();
}

// ---------- builds (Division loadouts): three saved sets of two guns and four armor pieces ----------
const uidOf = o => o ? (o.uid || (o.uid = Math.random().toString(36).slice(2, 10))) : null;
function saveBuild(i) {
  const P = profile; P.builds = P.builds || [];
  P.builds[i] = { w: P.loadout.map(uidOf), g: Object.fromEntries(GEAR_KEYS.map(k => [k, uidOf(P.gear[k])])), name: P.loadout.filter(Boolean).map(o => unpackW(o).base.name).join(' + ') };
}
function loadBuild(i) {
  const P = profile, B = P.builds && P.builds[i]; if (!B) return;
  const lists = [P.loadout, P.bag, P.stash, SH.w];
  B.w.forEach((u, k) => { // each hand: find the gun wherever it is now and swap it in
    if (!u || (P.loadout[k] && P.loadout[k].uid === u)) return;
    if (P.loadout[k] && P.stash.length >= stashMax()) return; // no room for the gun it replaces
    for (const L of lists) { const j = L.findIndex(o => o && o.uid === u); if (j < 0) continue;
      if (!canUse(unpackW(L[j]))) break;
      const w = L === P.loadout ? L[j] : L.splice(j, 1)[0]; if (L === P.loadout) L[j] = null;
      if (P.loadout[k]) P.stash.push(P.loadout[k]); P.loadout[k] = w; break; }
  });
  for (const k of GEAR_KEYS) { const u = B.g[k]; if (!u || (P.gear[k] && P.gear[k].uid === u)) continue;
    if (P.gear[k] && P.gearStash.length >= gearMax()) continue;
    for (const L of [P.gearStash, SH.g]) { const j = L.findIndex(it => it.uid === u); if (j < 0) continue; const it = L.splice(j, 1)[0]; if (P.gear[k]) P.gearStash.push(P.gear[k]); P.gear[k] = it; break; } }
  if (!P.loadout[0] && !P.loadout[1]) P.loadout[0] = packW(makeWeapon(BASES[0], 0, 1));
  gearChanged(); SND.power();
}
const buildsRow = (extra = '') => `<div class="builds"><b class="parts">${profile.parts || 0} ⚙ · ${profile.oc || 0} mag</b>${extra}<b>Buildek</b>${[0, 1, 2].map(i => { const B = (profile.builds || [])[i]; return `<span class="bslot"><small>${i + 1}. ${B ? esc(B.name) : 'üres'}</small>${hbtn('Betöltés', `bload:${i}`, !B)}${hbtn('Mentés', `bsave:${i}`)}</span>`; }).join('')}</div>`;

// a party member sees what the leader is looking at on the map
function hostPick() {
  if (!NET.code || NET.host) return '';
  const h = partyMembers().find(m => m.h), s = h && h.sel; if (!s || typeof s !== 'object') return '';
  const M = MAPS[s.m], d = clamp(+s.d || 1, 1, 5);
  return `<div class="hostpick"><small>A VEZETŐ VÁLASZTÁSA</small><b>${esc(String(s.t || ''))}</b><span>${M ? M.name : ''} · ${DIFF_NAMES[d - 1]}${+s.tr ? ` · Rémálom +${+s.tr}` : ''} · $${+s.r || 0}</span></div>`;
}

function hubCycle(d) { // Q / E: previous / next top tab
  const tops = [...document.querySelectorAll('.mbtn[data-hub]')], i = tops.findIndex(b => b.classList.contains('on'));
  const b = tops[(Math.max(0, i) + d + tops.length) % tops.length]; if (b) { hubTab = b.dataset.hub; renderHub(); }
}

function directivesRow() { // toggles; the leader's choice is what the party plays
  if (profile.level < 5 && !(NET.code && !NET.host)) return '';
  const off = NET.code && !NET.host, lead = off && partyMembers().find(m => m.h), D = off ? (lead && lead.dr) || [] : profile.dirs || [], n = D.length; // a member sees the leader's set
  return `<div class="dirs"><b>Direktívák</b>${Object.entries(DIRECTIVES).map(([k, d]) => `<button class="chip${D.includes(k) ? ' on' : ''}" data-act="dir:${k}" title="${d.desc}"${off ? ' disabled' : ''}>${d.name}</button>`).join('')}<small>${n ? `+${15 * n}% XP · +${10 * n}% pénz · jobb zsákmány` : 'önként vállalt nehezítés több jutalomért'}${off ? ' · a vezető választja' : ''}</small></div>`;
}

$('resultsBody').addEventListener('click', e => { const b = e.target.closest('[data-act="deepnext"]'); if (b && (!NET.code || NET.host)) { const st = deepState(); $('results').hidden = true; startJob(deepJob(st.stage)); } });

const expCost = it => Math.round((6 + 4 * (it.exp || 0)) * (1 + (it.level || 1) / 15)); // expertise: parts per level, rising
const expRefund = it => { let t = 0; for (let k = 0; k < (it.exp || 0); k++) t += Math.round((6 + 4 * k) * (1 + (it.level || 1) / 15)); return Math.floor(t / 2); };
