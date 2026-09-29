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
  rail:   [['Az utolsó szerelvény', 'MÁV rendező'], ['Váltóállítás éjjel', 'Forgalmista'], ['Rakomány a harmadik vágányon', 'Szállítmányozó']],
  quarry: [['A gödör alján', 'Kőbánya Kft.'], ['Robbantás előtti éjszaka', 'Bányamester'], ['Senki sem jön fel', 'Bányászszakszervezet']],
};
const stashMax = () => 40 + 10 * U('stash'), gearMax = () => 40 + 10 * U('stash'); // the Raktárbővítés upgrade adds 10 + 10 a level
const reroll = () => 50 + 40 * profile.level;
// the base's own gunsmith: dollars instead of points, so old favourites can keep up
const PARTS = [1, 2, 5, 15, 40, 80]; // salvage yield by rarity
const HFORGE = { recal: w => 10 + Math.floor(w.level / 3), level: w => 2 + Math.floor(w.level / 5), anoint: w => 12 + 10 * ((w && w.anoN) || 0), cap: () => profile.level >= LEVEL_CAP ? LEVEL_CAP + 2 * (profile.tier || 0) : profile.level };
const ITEM_PRICE = { med: 300, gren: 250, knife: 220, adren: 450 };
const shopPrice = w => Math.round(sellValue(w) * 4 / 10) * 10;

// XP by difficulty (steeper at the top) and length; objectives, twists and the Butcher add a little. A bounty: a bit over a job of its stars
const jobXp = (diff, dur, o = {}) => Math.round((150 + 110 * Math.pow(diff, 1.25)) * Math.max(1, (dur || 300) / 300) * (o.mod ? 1.15 : 1) * (o.boss ? 1.2 : 1) * (o.type && o.type !== 'survive' ? 1.25 : 1) / 10) * 10;
// special twists: each has its own 15% chance on a job, shown on the map and the card
const SPECIALS = {
  cash2: { name: 'Aranyláz', short: '2× PÉNZ', desc: 'Dupla pénz a munkáért.', color: '#f0c040' },
  xp2: { name: 'Tanulságos éjszaka', short: '2× XP', desc: 'Dupla tapasztalat a munkáért.', color: '#7fd0ff' },
};
const rollSpecials = () => Object.keys(SPECIALS).filter(() => Math.random() < .15);
const spMul = (j, k) => (j.sp || []).includes(k) ? 2 : 1;
function withSpecials(j) { j.sec = rollSecondary(j); j.sp = rollSpecials(); j.reward *= spMul(j, 'cash2'); j.xp *= spMul(j, 'xp2'); j.xv = 2; return j; }
const spTags = j => (j.sp || []).filter(k => SPECIALS[k]).map(k => SPECIALS[k]);
function fixBoard() { // boards rolled before the XP rework keep their old numbers otherwise
  for (const j of profile.jobs || []) if (j.xv !== 2 && !j.tier && !j.deep) { j.xp = j.bounty ? Math.round(jobXp(j.diff, 300) * 1.1 / 10) * 10 : jobXp(j.diff, j.dur, j); j.xv = 2; }
}
function makeJob0() {
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
    reward: Math.round(reward * (type === 'survive' ? 1 : type === 'escort' ? .9 : 1.15) / 10) * 10, lvl: Math.min(LEVEL_CAP, lvl), xp: jobXp(diff, dur, { mod, boss, type }) };
}
const makeJob = () => withSpecials(makeJob0());
// a job can be taken easier than it came: 1 star up to the stars it spawned with; pay, XP, time and goal follow
const payBase = (d, dur, boss, lvl) => (250 + 180 * Math.pow(d, 1.4) + lvl * 35) * (dur / 300) * (boss ? 1.3 : 1);
function setDiff(j, d) {
  if (!j.d0) j.d0 = j.diff, j.b0 = { reward: j.reward, xp: j.xp, dur: j.dur, boss: j.boss, goal: j.goal };
  const B = j.b0, d0 = j.d0, lvl = j.lvl || profile.level; d = clamp(d, 1, d0);
  const dur = d === d0 ? B.dur : 300 + (d - 1) * 45, boss = B.boss && d >= 3, o = { mod: j.mod, boss, type: j.type };
  j.diff = d; j.dur = dur; j.boss = boss;
  j.reward = Math.round(B.reward * payBase(d, dur, boss, lvl) / payBase(d0, B.dur, B.boss, lvl) / 10) * 10;
  j.xp = Math.round(B.xp * jobXp(d, dur, o) / jobXp(d0, B.dur, { mod: j.mod, boss: B.boss, type: j.type }) / 10) * 10;
  if (j.type === 'exterminate') j.goal = 50 + 25 * d; else if (j.type === 'supply') j.goal = 5 + d;
}
function rollBoard() {
  profile.jobs = []; // three different jobs, on different maps while there are enough maps
  const nMaps = MAP_IDS.filter(id => MAPS[id].minLevel <= profile.level).length;
  for (let k = 0; profile.jobs.length < 3 && k < 60; k++) { const j = makeJob(); if (!profile.jobs.some(o => o.title === j.title || (o.map === j.map && profile.jobs.length < nMaps))) profile.jobs.push(j); }
  while (profile.jobs.length < 3) profile.jobs.push(makeJob());
  if (!profile.jobs.some(j => j.diff === 1)) profile.jobs[0] = Object.assign(makeJob(), { diff: 1, boss: false }); // always one easy job
  const j = profile.jobs[0]; j.dur = 300; j.reward = Math.round((470 + profile.level * 35) / 10) * 10 * spMul(j, 'cash2'); j.xp = jobXp(1, 300) * spMul(j, 'xp2'); j.lvl = profile.level;
  if (profile.level >= 3) profile.jobs.push(withSpecials(makeBounty()));
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
    reward: Math.round((700 + 300 * diff + lvl * 60) * 1.6 / 10) * 10, xp: Math.round(jobXp(diff, 300) * 1.1 / 10) * 10, lvl: Math.min(LEVEL_CAP, lvl) }; // ×1.6: a bounty out-pays a regular job
}
// what is new, and where: weapons by kind, armor by slot, unspent merit tokens
function newCounts() {
  const P = profile, wc = {}, gs = {}; let w = 0, g = 0;
  for (const o of [...(P.stash || []), ...(P.bag || [])]) if (o && o.isNew) { w++; const c = CAT[typeof o.base === 'string' ? o.base : o.base && o.base.id]; if (c) wc[c] = (wc[c] || 0) + 1; }
  for (const it of P.gearStash || []) if (it && it.isNew) { g++; gs[it.slot] = (gs[it.slot] || 0) + 1; }
  return { w, g, wc, gs, tok: P.cls && P.tokens > 0 ? P.tokens : 0 };
}
function rollShop() {
  const lvl = profile.level;
  const more = 2 * Math.floor(Math.min(30, lvl) / 10); // +2 guns and +2 armor pieces at levels 10, 20 and 30
  profile.shop = Array.from({ length: 4 + more }, (_, k) => k).map(k => packW(makeWeapon(pick(BASES), Math.min(4, rollRarity(.15 + lvl * .02)), lvl + (k === 0 ? 1 : 0)))); // your level; one gun a level above to aim for · exotics only drop
  profile.gshop = Array.from({ length: 3 + more }).map(() => makeGear(null, rollRarity(.15 + lvl * .02), lvl));
  profile.shopMore = more;
}
function topUpShop() { // reached level 10/20/30 since the last restock: the new places fill now (bought ones stay bought)
  const lvl = profile.level, more = 2 * Math.floor(Math.min(30, lvl) / 10), had = profile.shopMore ?? Math.max(0, (profile.shop || []).length - 4); // older saves don't know: guess from what is on the shelf
  if (more <= had || !profile.shop) return;
  for (let k = had; k < more; k++) { profile.shop.push(packW(makeWeapon(pick(BASES), Math.min(4, rollRarity(.15 + lvl * .02)), lvl))); (profile.gshop || (profile.gshop = [])).push(makeGear(null, rollRarity(.15 + lvl * .02), lvl)); }
  profile.shopMore = more; saveProfile();
}

// ---------- rendering ----------
const jobMap = { h: 440, k: 1 }; // the jobs map's height in map units and its text scale, fitted to the box on screen
let hubTab = 'jobs', jobSel = 0, wFilter = 'all', gFilter = 'all'; // the arsenal / armor list filters
// the county: where each map lies, and a hand-drawn backdrop
const MAP_LOC = { range: [110, 150], farm: [170, 300], chapel: [300, 105], gas: [560, 335], mill: [735, 110], town: [450, 215], quarry: [790, 320], fair: [615, 205], hospital: [330, 330], rail: [860, 215] };
const MAP_ART = (() => {
  const L = MAP_LOC, road = (a, b) => `<path class="road" d="M${L[a][0]} ${L[a][1]} Q ${(L[a][0] + L[b][0]) / 2 + 30} ${(L[a][1] + L[b][1]) / 2 - 20} ${L[b][0]} ${L[b][1]}"/>`;
  const r = mulberry(7), trees = Array.from({ length: 140 }, () => { const x = r() * 900, y = r() * 440; return Math.hypot(x - 450, y - 215) < 70 ? '' : `<circle class="tree" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + r() * 6).toFixed(1)}"/>`; }).join('');
  const grid = Array.from({ length: 12 }, (_, i) => `<path class="grid" d="M${i * 80} 0 V440 M0 ${i * 40} H900"/>`).join('');
  return `<defs><radialGradient id="jfog" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#1c211c"/><stop offset="1" stop-color="#070908"/></radialGradient></defs>
    ${grid}${trees}
    <path class="river" d="M-10 200 C 120 170 200 230 300 210 S 520 140 620 200 S 800 260 910 230"/>
    ${road('farm', 'town')}${road('chapel', 'town')}${road('town', 'gas')}${road('town', 'mill')}${road('gas', 'quarry')}${road('mill', 'quarry')}${road('town', 'fair')}${road('farm', 'hospital')}${road('hospital', 'gas')}${road('farm', 'chapel')}${road('fair', 'rail')}${road('quarry', 'rail')}
`;
})();
function jobCard(j, i, notReady) {
  if (j === 'range') { const off = NET.code && !NET.host;
    return `<article class="jcard" style="--dc:#5fb4e8"><div class="jc-top"><small>DEAD ACRE MEGYE · LŐTÉR</small><small style="color:#5fb4e8">GYAKORLÁS</small></div>
      <h2>Lőtér</h2><p class="jc-sub">Célbábuk, végtelen lőszer, nincs veszély.</p>
      <ul class="jc-facts"><li>Próbáld ki a fegyvereidet a bábukon: 5 sáv, állítható távolsággal, fajtával és ranggal.</li><li>A csapattársaiddal itt cserélhetsz: amit eldobsz, a másik felveheti.</li><li>Nem kapsz érte pénzt, XP-t vagy fegyvermesterséget.</li></ul>
      <div class="jc-foot"><div></div>${hbtn(off ? 'A vezető választ' : 'Belépés a lőtérre', 'testground', off)}</div></article>`; }
  if (!j) return '<p class="note">Nincs munka.</p>';
  const M = MAPS[j.map], lv = j.lvl || profile.level, B = j.bounty && BOUNTIES[j.bounty], col = B ? '#ff8c1a' : j.tier ? '#b05cff' : DIFF_COL[j.diff - 1];
  const gl = Math.max(1, ...profile.loadout.filter(Boolean).map(o => o.level)), weak = lv - gl >= 4;
  const off = NET.code && !NET.host, lead = off && partyMembers().find(m => m.h), D = off ? (lead && lead.dr) || [] : profile.dirs || [], n = D.length;
  const btn = off ? 'A vezető választ' : notReady ? `Várakozás · ${notReady} nem kész` : NET.code ? 'Elvállaljuk' : 'Elvállalom';
  const type = B ? 'Fejvadászat' : j.type && j.type !== 'survive' ? JOB_TYPES[j.type].name : 'Munka';
  const facts = B ? [`<b>${B.name}</b>: ${B.desc}`, 'Legalább epikus fegyver és páncél, 30% eséllyel legendás', `5% eséllyel egzotikus fegyver: ${(B.loot || []).map(k => UNIQUES[k].name).join(', ')}`, `Nincs időkorlát · ${lv}. szintű zombik`]
    : [...(j.type && j.type !== 'survive' ? [JOB_TYPES[j.type].desc(j)] : []), `${noClock(j) ? 'Nincs időkorlát' : `${fmtTime(j.dur)} ${j.type === 'defense' ? 'védelem' : 'túlélés'}`} · ${lv}. szintű zóna`, `Kezdő veszélyszint: ${START_THREAT[j.diff - 1]} (hullámonként nő)`];
  if (j.boss && !B) facts.push('<span class="jboss">A Mészáros is eljön</span>');
  const dirs = profile.level >= 5 || off ? `<div class="jc-dirs"><h4>Direktívák<small>${off ? 'a vezető választja' : 'önként vállalt nehezítés több jutalomért'}</small></h4>${Object.entries(DIRECTIVES).map(([k, d]) => `<button class="jdir${D.includes(k) ? ' on' : ''}" data-act="dir:${k}"${off ? ' disabled' : ''}><i></i><b>${d.name}</b><small>${d.desc}</small></button>`).join('')}</div>` : '';
  return `<article class="jcard${B ? ' bounty' : ''}" style="--dc:${col}">
    ${hostPick()}
    <div class="jc-top"><small>${M.name}${j.map === featuredMap() ? ' · ★ heti kiemelt' : ''}</small><small style="color:${col}">${type}</small></div>
    <h2>${j.title}</h2>
    <p class="jc-sub"><span class="jstars">${stars(j.diff)}</span> Megbízó: ${j.client} · ${DIFF_NAMES[j.diff - 1]}</p>
    ${!B && !j.tier && !j.deep && (j.d0 || j.diff) > 1 ? `<div class="tiersel diffsel">${hbtn('−', `jdiff:${i}:-1`, off || j.diff <= 1)}<b style="color:${col}">${stars(j.diff)}</b>${hbtn('+', `jdiff:${i}:1`, off || j.diff >= (j.d0 || j.diff))}<small>${off ? 'a vezető állítja' : `Könnyíthetsz rajta: 1 és ${j.d0 || j.diff} csillag között`}</small></div>` : ''}
    ${j.tier ? `<p class="jtier">RÉMÁLOM +${j.tier} · zóna Lv ${j.lvl} · +${10 + 5 * j.tier} ⚙ és garantált legendás</p>${j.base ? `<div class="tiersel">${hbtn('−', `tier:${i}:-1`, j.tier <= 1)}<b>+${j.tier}</b>${hbtn('+', `tier:${i}:1`, j.tier >= (profile.tier || 0) + 1)}<small>Feloldva: +${(profile.tier || 0) + 1}-ig</small></div>` : ''}` : ''}
    <ul class="jc-facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>
    ${weak ? `<p class="jwarn">Vigyázz: a legjobb fegyvered Lv ${gl}, a zóna ${lv}. szintű. Itt nagyon kevés leszel.</p>` : ''}
    ${j.mod ? `<div class="jmodbox"><small>Módosító · ${MODS[j.mod].label}</small><span>${MODS[j.mod].sub}</span></div>` : ''}
    ${spTags(j).map(S => `<div class="jmodbox jsp" style="--sc:${S.color}"><small>Különleges · ${S.name}</small><span>${S.desc}</span></div>`).join('')}
    ${(j.sec || []).length ? `<div class="jsec"><small>Mellékcélok · egyenként +$${Math.round(j.reward * .2 / 10) * 10}, +${Math.round(j.xp * .2)} XP, +${3 + j.diff} ⚙</small>${j.sec.map(s => `<span>${secOf(s).name}: ${secTxt(s, j)}</span>`).join('')}</div>` : ''}
    ${dirs}
    <div class="jc-foot"><div class="jc-pay"><b>$${Math.round(j.reward * (1 + .1 * n))}</b><small>+${Math.round(j.xp * (1 + .15 * n))} XP${n ? ` · direktívák: +${10 * n}% pénz, +${15 * n}% XP` : ''}</small></div>${off ? `<button class="sbtn rdyb${NET.ready ? ' on' : ''}" data-act="pready">${NET.ready ? '✓ Kész vagyok · a vezető indít' : 'Kész vagyok'}</button>` : hbtn(btn, `job:${i}`, notReady > 0)}</div>
  </article>`;
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stars = d => '★'.repeat(d) + '<i>★</i>'.repeat(5 - d);
function showHub() {
  $('loadscr').hidden = true;
  state = 'hub';
  if (profile && !profile.cls) hubTab = 'skills';
  if (document.pointerLockElement) document.exitPointerLock();
  ['menu', 'hud', 'pause', 'results', 'station'].forEach(id => $(id).hidden = true);
  $('hub').hidden = false;
  if (!MAP || MAP_ID !== 'farm') loadMap('farm', 1234); // the backdrop
  renderHub();
}
function renderHub() {
  if (profile) { topUpShop(); fixBoard(); }
  setTimeout(() => { if (hubTab === 'look') lookPreview(); });
  const P = profile;
  $('hubSlot').textContent = P.name; $('hubJobs').textContent = `${stats.jobs} kész munka${NET.code ? ` · csapat ${partyMembers().length} fő` : ''}`;
  $('hubLvl').textContent = P.level;
  $('hubXp').style.width = P.xp / xpNeed(P.level) * 100 + '%';
  $('hubXpTxt').textContent = `${P.xp} / ${xpNeed(P.level)}`; $('hubLvlBox').dataset.tip = `${P.xp} / ${xpNeed(P.level)} XP${P.level >= LEVEL_CAP ? ' a következő veterán pontig' : ' a következő szintig'}${vetOpen() ? ` · veterán ${vetEarned()}${vetAvail() ? ` (+${vetAvail()} elkölthető)` : ''}` : ''}`;
  $('hubCash').textContent = `$${P.cash}`; $('hubParts').innerHTML = `<span data-tip="Alkatrész: fegyverek szétszedéséből. A kovácsnál költheted."><i>⚙</i>${P.parts || 0}</span><span data-tip="Anyag: páncél szétszedéséből. A páncél optimalizálására."><i>${FAB}</i>${P.fabric || 0}</span><span data-tip="Túlhajtás-mag: fejvadász első legyőzése, heti kontrakt, Mélyfúrás. Túlhajtás beszereléséhez."><i>◆</i>${P.oc || 0}</span>`;
  rollContracts(); const claimable = [...P.daily.list.map(c => [c, false]), [P.weekly.c, true]].filter(([c, w]) => !c.got && cProg(c, w) >= c.n).length;
  document.querySelector('[data-hub="jobs"]').dataset.badge = claimable || '';
  { const N = newCounts(); document.querySelector('[data-hub="arsenal"]').dataset.badge = N.w + N.g || ''; document.querySelector('[data-hub="skills"]').dataset.badge = N.tok || ''; }
  document.querySelector('[data-hub="shop"]').dataset.badge = P.lost ? P.lost.w.length + P.lost.g.length : ''; // something to buy back
  $('hubTokens').textContent = P.tokens || 0;
  $('hubCls').textContent = P.cls ? CLASSES[P.cls].name : 'nincs kaszt'; $('hubCls').style.setProperty('--cc', P.cls ? CLASSES[P.cls].color : '');
  document.querySelectorAll('.mbtn[data-hub]').forEach(b => b.classList.toggle('on', !!(b.dataset.hub === hubTab || (b.dataset.group && HUB_GROUPS[b.dataset.group].some(([k]) => k === hubTab)))));
  const grp = Object.values(HUB_GROUPS).find(g => g.some(([k]) => k === hubTab)); $('hubSub').hidden = !grp; $('hubSub').innerHTML = grp ? grp.map(([k, t]) => `<button class="sbtab${k === hubTab ? ' on' : ''}" data-sub="${k}" data-badge="${({ arsenal: 'w', gear: 'g', skills: 'tok' })[k] ? newCounts()[({ arsenal: 'w', gear: 'g', skills: 'tok' })[k]] || '' : ''}">${t}</button>`).join('') : ''; // which sub-page has something new
  if (P.abandonNote) { const n = P.abandonNote; delete P.abandonNote; saveProfile();
    if (n === 'lost') toast('A MUNKÁT FÉLBEHAGYTAD', ['Kiléptél munka közben: a kézben és a táskában lévő fegyvereid és a páncélod elveszett.', 'Bolt → Elveszett bolt: drágán visszavásárolhatod őket.'], '#ff5a4a', 9000);
    else { toast('KIESTÉL A CSAPATBÓL', ['A hátizsákod tartalma a csapatnál maradt, a pályán.', P.rejoin ? 'Visszacsatlakozhatsz: Csapat fül.' : ''], '#ff8a70', 9000); if (P.rejoin) hubTab = 'party'; } }
  const hb = $('hubBody'), same = renderHub.tab === hubTab; renderHub.tab = hubTab;
  if (same) keepScroll(hb, () => { hb.innerHTML = HUB[hubTab](); markCta(hb); }); else { hb.innerHTML = HUB[hubTab](); markCta(hb); hb.scrollTop = 0; } // a click re-renders the tab: stay where you were
  updateKeybar($('hubBody'));
  fitJobMap();
}
function fitJobMap() { // after a render: size the map to its box; one more render if it changed
  const b = hubTab === 'jobs' && document.querySelector('#hubBody .jmapbox'); if (!b || !b.clientWidth) return;
  const h = Math.round(clamp(900 * (b.clientHeight - 150) / b.clientWidth, 380, 1400)), k = +clamp(900 / b.clientWidth, .8, 1.35).toFixed(2); // a small map keeps its labels small too, or they pile up
  if (Math.abs(h - jobMap.h) > 12 || Math.abs(k - jobMap.k) > .05) { jobMap.h = h; jobMap.k = k; keepScroll($('hubBody'), () => { $('hubBody').innerHTML = HUB.jobs(); markCta($('hubBody')); }); }
}
addEventListener('resize', () => { if (state === 'hub' && hubTab === 'jobs') fitJobMap(); });
const miniCard = (w, acts) => `<div class="wcard mini" style="--rc:${rarColor(w)}"><div class="head"><div class="lvl">Lv ${w.level}</div><div class="rar">${RARITIES[w.q].name}</div>
  <div class="name">${w.name}</div><div class="sub">${w.base.name} · DPS ${dps(w)}${w.element ? ` · <span style="color:${ELEMENTS[w.element].color}">${ELEMENTS[w.element].name}</span>` : ''}</div>
  <div class="sub" style="color:#9fd0ff">${w.maker}: ${mkOf(w).perk || ''}</div></div>
  <div class="act">${acts}</div></div>`;
// key: optional shortcut (KeyboardEvent.code) shown on the button and in the key bar
const OC_HELP = 'A túlhajtás-mag (◆) ritka nyersanyag: minden fejvadász első legyőzése, a heti kontrakt és a Mélyfúrás ad belőle. Egy túlhajtás beszereléséhez kell egy.';
const KEY_LABEL = { KeyU: 'U', KeyO: 'O', KeyJ: 'J', KeyM: 'M', KeyC: 'C', KeyK: 'K', KeyF: 'F', KeyR: 'R', KeyT: 'T', KeyX: 'X', KeyG: 'G', KeyV: 'V', KeyB: 'B', KeyN: 'N', Digit1: '1', Digit2: '2' };
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
  box.querySelector('p').innerHTML = `<b>Kalibrálás · ${w.name}</b><table class="rtab"><tr><th></th><th>Régi</th><th>Új</th></tr>${tr}</table><small>Enter / OK: az új értékek maradnak · Esc: marad a régi (az alkatrész elfogyott)</small>`;
  const yes = box.querySelector('[data-yes]'), no = box.querySelector('[data-no]'), labels = [yes.innerHTML, no.innerHTML];
  yes.innerHTML = '<kbd>Enter</kbd>OK'; no.innerHTML = '<kbd>Esc</kbd>✕ Régi marad'; box.hidden = false;
  const done = ok => { box.hidden = true; box.classList.remove('recal'); yes.innerHTML = labels[0]; no.innerHTML = labels[1]; removeEventListener('keydown', key, true);
    if (ok) { list[i] = packW(c); SND.explode(); } saveProfile(); renderHub(); };
  const key = e => { e.stopPropagation(); e.preventDefault(); if (e.code === 'Enter') done(true); else if (e.code === 'Escape') done(false); };
  addEventListener('keydown', key, true); yes.onclick = () => done(true); no.onclick = () => done(false);
}
// what an action changed, as a toast: money, parts, fabric, cores, tokens, and anything that arrived in your storage
let slotCostPaid = 0;
const lostPrice = (x, k) => Math.round((k === 'w' ? sellValue(x) : gearValue(x)) * 6 / 10) * 10; // buying your own lost gear back: six times what it sells for
const hubSnap = () => { const P = profile; return { cash: P.cash, parts: P.parts || 0, fab: P.fabric || 0, oc: P.oc || 0, tok: P.tokens || 0, st: P.stash.slice(), gs: P.gearStash.slice(), vet: vetSpent ? vetSpent() : 0 }; };
const TOAST_TITLE = { gun: 'Fegyver megvéve', gbuy: 'Páncél megvéve', item: 'Tárgy megvéve', ttype: 'Gránát- / késfajta', up: 'Fejlesztés', sell: 'Eladva', gsell: 'Eladva', salvage: 'Szétszedve', gsalvage: 'Szétszedve',
  trashsell: 'A kuka eladva', trashsalv: 'A kuka szétszedve', opt: 'Optimalizálva', gopt: 'Optimalizálva', hforge: 'Kovács', gexp: 'Szakértelem', ocset: 'Túlhajtás', anoacc: 'Felkenés elfogadva', claim: 'Kontrakt jutalma',
  vet: 'Veterán rang', sk: 'Képesség tanulva', aug: 'Képesség-módosító', respec: 'Pontok visszaadva', slot: 'Szerencsekerék', reroll: 'Új munkák', wear: 'Páncél felvéve', unwear: 'Páncél levéve' };
function hubToast(kind, B, act) {
  const P = profile, L = [], d = (x, y, u) => { const v = x - y; if (v) L.push(`${v > 0 ? '+' : '−'}${u === '$' ? '$' : ''}${Math.abs(Math.round(v))}${u !== '$' ? ' ' + u : ''}`); };
  d(P.cash, B.cash, '$'); d(P.parts || 0, B.parts, '⚙'); d(P.fabric || 0, B.fab, FAB); d(P.oc || 0, B.oc, '◆'); d(P.tokens || 0, B.tok, 'érdemérem');
  const newW = P.stash.filter(o => !B.st.includes(o)).map(unpackW).filter(Boolean), newG = P.gearStash.filter(o => !B.gs.includes(o));
  newW.forEach(w => L.push(`<i style="color:${rarColor(w)}">${w.name}</i> a raktárban`)); newG.forEach(it => L.push(`<i style="color:${gCol(it)}">${it.name}</i> a páncélraktárban`));
  const [, x1, x2, x3] = (act || '').split(':'), D = [];
  if (kind === 'up' && UPGRADES[x1]) D.push(`${UPGRADES[x1].name} ${U(x1)}/${UPGRADES[x1].max} · ${UPGRADES[x1].val(U(x1))}`);
  if (kind === 'sk' && P.cls) { const d = CLASSES[P.cls].tree.find(t => t[0] === x1); if (d) D.push(`${d[1]} ${rk(x1)}/${d[2]}`); }
  if (kind === 'aug') { const d = (AUGMENTS[P.cls] || []).find(t => t[0] === x1); if (d) D.push(d[1]); }
  if (kind === 'opt') { const w = wAt(x1, x2), st = OPT_STATS.find(o => o[0] === x3); if (w && st) D.push(`${st[1]}: dobás ${Math.round(rollOf(w, x3) * 100)}%`); }
  if (kind === 'gopt') { const it = gearAt(x1, x2), r = it && gRolls(it).find(o => o[0] === x3); if (r) D.push(`${r[1]}: dobás ${Math.round(r[2] * 100)}%`); }
  if (kind === 'hforge' && x1 === 'exp') { const w = wAt(x2, x3); if (w) D.push(`Szakértelem ${w.exp}/10 · +${2 * w.exp}% sebzés`); }
  if (kind === 'hforge' && x1 === 'anoint') D.push('Új felkenés dobva: döntsd el a kovácsnál');
  if (kind === 'gexp') { const it = gearAt(x1, x2); if (it) D.push(`Szakértelem ${it.exp}/10 · +${3 * it.exp}% minden értékre`); }
  if (kind === 'ocset' && OVERCLOCKS[x3]) D.push(`${OVERCLOCKS[x3].name}: ${OVERCLOCKS[x3].desc}`);
  if (kind === 'ttype') { const T = TYPE_LISTS[x1] && TYPE_LISTS[x1][x2]; if (T) D.push(T.name); }
  if (kind === 'wear') { const it = GEAR_KEYS.map(k => P.gear[k]).find(g => g && !B.st.includes(g) && B.gs.includes(g)); if (it) D.push(`<i style="color:${gCol(it)}">${it.name}</i> rajtad`); }
  if (kind === 'vet' && GSTATS[x1]) D.push(`${GSTATS[x1].name}: ${SH.vet.ranks[x1]}. rang`);
  if (kind === 'slot') return; // the wheel shows its own result when it stops
  if (kind === 'bsave') D.push(`${+x1 + 1}. build mentve`); if (kind === 'bload') D.push(`${+x1 + 1}. build felvéve`);
  if (kind === 'junk') D.push(+x1 < 0 ? 'Auto-szétszedés kikapcsolva' : `Kijutáskor szétszedi: ${RARITIES[+x1].name} és gyengébb`);
  if (kind === 'dir' && DIRECTIVES[x1]) D.push(`${DIRECTIVES[x1].name}: ${(P.dirs || []).includes(x1) ? 'bekapcsolva' : 'kikapcsolva'}`);
  if (kind === 'wear') { L.length = 0; }
  const TT = Object.assign({}, TOAST_TITLE, { bsave: 'Build', bload: 'Build', junk: 'Auto-szétszedés', dir: 'Direktíva', hforge: x1 === 'exp' ? 'Szakértelem' : x1 === 'anoint' ? 'Felkenés' : 'Kovács' });
  if ((!L.length && !D.length) || !TT[kind]) return;
  return toast(TT[kind], [...D, L.slice(0, 5).join(' · ')], newW[0] ? rarColor(newW[0]) : L[0] && L[0][0] === '+' ? '#9dff6a' : '#ffd23f');
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
const HOLD_TIP = { sell: 'Tartsd lenyomva: eladod pénzért.', gsell: 'Tartsd lenyomva: eladod pénzért.', salvage: 'Tartsd lenyomva: szétszeded alkatrészre (⚙).', gsalvage: 'Tartsd lenyomva: szétszeded anyagra (▦).' };
const hhold = (label, act, off, key) => `<button class="sbtn hold"${tipAttr(HOLD_TIP[act.split(':')[0]] || 'Tartsd lenyomva: a tárgy megsemmisül; az alkatrészt (⚙) vagy anyagot (▦) kijutáskor kapod meg.')} data-hact="${act}"${key ? ` data-key="${key}"` : ''}${off ? ' disabled' : ''}>${key ? `<kbd>${KEY_LABEL[key]}</kbd>` : ''}${label}</button>`;
const freeHand = L => L[0] ? L[1] ? 0 : 1 : 0;
function bestHand(L, w) { // where a gun goes: the other exotic's hand, an empty hand, the hand with the same kind of gun, else the weaker one
  const u = o => o && (typeof o.base === 'string' ? unpackW(o) : o), W = u(w), H = L.map(u);
  if (!W) return freeHand(L);
  if (W.unique) { const e = H.findIndex(h => h && h.unique); if (e >= 0) return e; }
  if (!H[0]) return 0; if (!H[1]) return 1;
  const same = H.findIndex(h => CAT[h.base.id] === CAT[W.base.id]); if (same >= 0) return same;
  return dps(H[0]) <= dps(H[1]) ? 0 : 1;
}
const fieldParts = q => Math.max(1, Math.floor(PARTS[q] / 2)); // taking a gun apart in the field: half what the bench at home gets
const testJob = () => ({ map: 'range', diff: 1, dur: 1e6, mod: null, boss: false, type: 'test', test: true, title: 'Lőtér', client: '', reward: 0, xp: 0, lvl: profile.level, goal: 0 });
const HUB = {
  skills: () => skillsTab(),
  vet: () => vetTab(),
  party: () => `<div class="pwrap"><h2>Csapat</h2><p class="lede">Hozz létre csapatot, vagy csatlakozz egy kóddal. A vezető választja a munkát, a tagok jelzik, hogy készen állnak.${NET.p2p ? ' Nem kell fiók: a böngészők közvetlenül kapcsolódnak.' : ''}</p>${profile.rejoin && profile.rejoin.until > Date.now() && !NET.code ? `<div class="rejoin"><b>Visszacsatlakozás</b><span>Munka közben estél ki. Ha a csapat még játszik, visszaállhatsz közéjük.</span>${hbtn(`Vissza a csapatba (${String(profile.rejoin.code || '').split('-')[0].toUpperCase()})`, 'prejoin')}</div>` : ''}${partyPanel()}</div>`,
  bweap: () => bookView(bookWeapons()), btal: () => bookView(bookTalents()), bgear: () => bookView(bookGear()), bzomb: () => bookView(bookZombies()), bboss: () => bookView(bookBounties()), bjobs: () => bookView(bookJobs()),
  coll: () => collTab(),
  jobs() { // contracts on the left, the county map in the middle (Deep Rock style), the picked job on the right
    const P = profile, lead = NET.code && !NET.host ? partyMembers().find(m => m.h) : null, J = lead && lead.bd && lead.bd.length ? lead.bd : P.jobs; if (jobSel !== 'range' && !J[jobSel]) jobSel = 0; // a member sees the leader's board
    const notReady = NET.code && NET.host ? partyMembers().filter(m => !m.me && !m.rdy).length : 0, off = NET.code && !NET.host;
    const MH = jobMap.h, sy = MH / 440, loc = id => { const p = MAP_LOC[id] || [450, 220]; return [p[0], p[1] * sy]; }, jobAt = id => J.filter(o => o.map === id); // the county stretches to the box; text keeps its size
    const locs = MAP_IDS.map(id => { const [x, y] = loc(id), open = MAPS[id].minLevel <= P.level, feat = id === featuredMap(), has = jobAt(id).length;
      const sub = !open ? `${MAPS[id].minLevel}. szinttől` : feat ? 'heti kiemelt · +25% XP' : has ? '' : 'nincs munka';
      return `<g class="loc${open ? '' : ' locked'}${feat ? ' feat' : ''}${has ? ' has' : ''}" transform="translate(${x} ${y}) scale(${jobMap.k})">${feat ? '<circle r="21" class="fring"/>' : ''}${has ? '' : '<rect x="-7" y="-7" width="14" height="14" transform="rotate(45)"/>'}<text class="ln" y="${has ? 34 : 30}">${MAPS[id].name}</text>${sub ? `<text class="ls" y="${has ? 48 : 44}">${sub}</text>` : ''}</g>`; }).join('');
    const marks = J.map((j, i) => {
      const [lx, ly] = loc(j.map), k = J.slice(0, i).filter(o => o.map === j.map).length, [dx, dy] = [[0, 0], [60, -34], [-60, -34], [60, 34], [-60, 34]][k % 5].map(v => v * jobMap.k);
      const col = j.bounty ? '#ff8c1a' : j.tier ? '#b05cff' : DIFF_COL[j.diff - 1], tag = j.bounty ? 'FEJVADÁSZAT' : j.tier ? `RÉMÁLOM +${j.tier}` : DIFF_NAMES[j.diff - 1].toUpperCase(), tw = tag.length * 8 + 16;
      return `<g class="jm${i === jobSel ? ' on' : ''}" data-act="jsel:${i}" transform="translate(${lx + dx} ${ly + dy}) scale(${jobMap.k})" style="--jc:${col}">${k ? `<line x1="0" y1="0" x2="${-dx / jobMap.k}" y2="${-dy / jobMap.k}"/>` : ''}<circle class="ring" r="18"/><circle class="dot" r="${j.bounty || j.tier ? 14 : 12}"/><circle class="core" r="${j.bounty || j.tier ? 6 : 5}"/><rect class="tagb" x="${-tw / 2}" y="-44" width="${tw}" height="17"/><text class="tag" y="-32">${tag}</text>${k ? `<text class="ls" y="30">$${j.reward}${spTags(j).map(S => `<tspan fill="${S.color}"> · ${S.short}</tspan>`).join('')}</text>` : `<text class="lpay" y="62">$${j.reward}${spTags(j).map(S => `<tspan fill="${S.color}"> · ${S.short}</tspan>`).join('')}</text>`}${spTags(j).length ? `<circle class="spring" r="23" style="stroke:${spTags(j)[0].color}"/>` : ''}</g>`;
    }).join('');
    const [rx, ry] = loc('range'), range = `<g class="jm range${jobSel === 'range' ? ' on' : ''}" data-act="jsel:range" transform="translate(${rx} ${ry}) scale(${jobMap.k})" style="--jc:#5fb4e8"><circle class="ring" r="16"/><rect class="sq" x="-9" y="-9" width="18" height="18"/><rect class="tagb" x="-40" y="-40" width="80" height="17"/><text class="tag" y="-28">GYAKORLÁS</text><text class="ln" y="30">Lőtér</text><text class="ls" y="44">fegyverteszt, nincs veszély</text></g>`;
    const claim = [...P.daily.list.map(c => [c, false]), [P.weekly.c, true]].filter(([c, w]) => !c.got && cProg(c, w) >= c.n).length;
    const legend = `<div class="jlegend">${DIFF_NAMES.slice(0, 3).map((n, k) => `<span><i style="background:${DIFF_COL[k]}"></i>${n}</span>`).join('')}<span><i style="background:#ff8c1a"></i>Fejvadászat</span><span><i class="sq" style="background:#5fb4e8"></i>Lőtér</span><span><i class="dm"></i>Zárolt</span></div>`;
    return `<div class="jobs3">
      <div class="jleft"><div class="jlh"><h3>Kontraktok</h3><small>${claim ? `${claim} begyűjthető` : ''}</small></div>${contractsStrip()}${deepCard()}</div>
      <div class="jmapbox"><div class="jmaphead"><div><div class="jmt">Dead Acre megye</div><small>Válassz helyszínt a térképen</small></div>${hbtn(off ? 'Új munkák: csak a vezető' : `↻ Új munkák · $${reroll()}`, 'reroll', P.cash < reroll() || !!off)}</div>
        <svg viewBox="-40 -10 980 ${MH + 20}" class="jsvg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Munkatérkép" style="--k:${jobMap.k}"><g transform="scale(1 ${sy})">${MAP_ART}</g><g class="jmk">${locs}${range}${marks}</g></svg>${legend}</div>
      <div class="jside">${jobCard(jobSel === 'range' ? 'range' : J[jobSel], jobSel, notReady)}</div></div>`;
  },
  arsenal() {
    const P = profile, lists = { L: P.loadout.map(unpackW), B: P.bag.map(unpackW), S: P.stash.map(unpackW), K: SH.w.map(unpackW) }, sharedFull = SH.w.length >= SHARED_MAX;
    let [sl, si] = invSel.split(':');
    if (!lists[sl] || !lists[sl][+si]) { sl = 'L'; si = lists.L[0] ? 0 : 1; invSel = `L:${si}`; }
    const i = +si, w = lists[sl][i], bagFull = lists.B.length >= bagMax(), stashFull = lists.S.length >= stashMax(), lone = lists.L.filter(Boolean).length < 2;
    let acts = '';
    if (w && sl === 'L') acts = hbtn('Táskába', `mv:L:${i}:B`, lone || bagFull, 'KeyF') + hbtn(`${2 - i}. kézbe`, `mv:L:${i}:L:${1 - i}`, false, `Digit${2 - i}`) + hbtn('Raktárba', `mv:L:${i}:S`, lone || stashFull, 'KeyR') + hbtn('Karakterládába', `mv:L:${i}:K`, lone || sharedFull, 'KeyK') + wSellBtns(w, 'L', i, lone);
    else if (w && sl === 'K') acts = hbtn(`Kézbe → ${bestHand(lists.L, w) + 1}. kéz`, `mv:K:${i}:L:${bestHand(lists.L, w)}`, !canUse(w), 'KeyF') + hbtn('Táskába', `mv:K:${i}:B`, bagFull, 'KeyT') + hbtn('Raktárba', `mv:K:${i}:S`, stashFull, 'KeyR');
    else if (w) acts = hbtn(`Kézbe → ${bestHand(lists.L, w) + 1}. kéz`, `mv:${sl}:${i}:L:${bestHand(lists.L, w)}`, !canUse(w), 'KeyF') + hbtn('1. kézbe', `mv:${sl}:${i}:L:0`, !canUse(w), 'Digit1') + hbtn('2. kézbe', `mv:${sl}:${i}:L:1`, !canUse(w), 'Digit2') +
      hbtn('Karakterládába', `mv:${sl}:${i}:K`, sharedFull, 'KeyK') + (sl === 'B' ? hbtn('Raktárba', `mv:B:${i}:S`, stashFull, 'KeyR') : hbtn('Táskába', `mv:S:${i}:B`, bagFull, 'KeyT')) + wSellBtns(w, sl, i, false);
    if (w) acts += hbtn('Kovács ›', 'goforge', false, 'KeyG');
    const cmp = sl === 'L' ? lists.L[1 - i] : lists.L[0] || lists.L[1], c0 = lists.L[0] || lists.L[1];
    const fit = x => wFilter === 'all' || CAT[x.base.id] === wFilter, cats = [...new Set([...lists.S, ...lists.K].map(x => CAT[x.base.id]))];
    const hands = lists.L.map((x, k) => x ? wTile(`L:${k}`, x, { n: `${k + 1}` }) : emptyTile(`${k + 1}. kéz üres`, 'Húzz ide egy fegyvert', null, `L:${k}`)).join('');
    const bagFree = Math.max(0, bagMax() - lists.B.length);
    const left = `<h3>Kézben <small>${lists.L.filter(Boolean).length} / 2</small></h3><div class="tiles" data-drop="L">${hands}</div>
      <h3>Táska <small>${lists.B.length} / ${bagMax()} · a munkára is jön</small></h3><div class="tiles" data-drop="B">${lists.B.map((x, k) => wTile(`B:${k}`, x, { cmp: c0, sub: x.base.name })).join('')}${Array.from({ length: Math.min(2, bagFree) }, () => emptyTile('Üres hely', 'Húzz ide egy fegyvert', null, 'B')).join('')}</div>`;
    const junk = `<span class="junk"><b>Auto-szétszedés</b>${['Ki', 'Közönséges', 'Nem mindennapi', 'Ritka'].map((t, q) => `<button class="chip${(P.junkQ == null ? -1 : P.junkQ) === q - 1 ? ' on' : ''}" data-act="junk:${q - 1}" data-tip="${q ? `Kijutáskor a talált ${t.toLowerCase()} és gyengébb fegyvereket magától alkatrészre szedi.` : 'Nincs automatikus szétszedés.'}">${t}${q ? '-ig' : ''}</button>`).join('')}</span>`;
    const mid = `<div class="itools"><button class="chip${wFilter === 'all' ? ' on' : ''}" data-act="wfilt:all">Mind</button>${Object.keys(CAT_NAMES).filter(k => cats.includes(k)).map(k => `<button class="chip${wFilter === k ? ' on' : ''}" data-act="wfilt:${k}" data-badge="${newCounts().wc[k] || ''}">${CAT_NAMES[k][0].toUpperCase() + CAT_NAMES[k].slice(1)}</button>`).join('')}<span class="sp"></span>${trashBar('w')}</div>
      <h3>Raktár <small>${lists.S.length} / ${stashMax()} · a bázison marad</small></h3><div class="tiles" data-drop="S">${lists.S.map((x, k) => fit(x) ? wTile(`S:${k}`, x, { cmp: c0 }) : '').join('') || emptyTile('Üres', wFilter === 'all' ? 'A vett és talált fegyverek ide kerülnek' : 'Ebből a fajtából nincs a raktárban')}</div>
      <h3>Karakterek közti láda <small>${SH.w.length} / ${SHARED_MAX} · a többi mentésed is eléri</small></h3><div class="tiles shared" data-drop="K">${lists.K.map((x, k) => fit(x) ? wTile(`K:${k}`, x, { cmp: c0 }) : '').join('') || emptyTile('Üres', 'Tegyél ide fegyvert, és a másik mentésed is eléri')}</div>
      ${buildsRow(junk)}`;
    return invLayout(left, w ? weaponDetail(w, cmp, acts) : noDetail('Válassz egy fegyvert.'), mid);
  },
  gear() {
    const P = profile, st = P.gearStash;
    let [sl, si] = invSel.split(':');
    const get = () => sl === 'W' ? P.gear[si] : sl === 'G' ? st[+si] : sl === 'H' ? SH.g[+si] : null;
    if (!get()) { const k = GEAR_KEYS.find(k => P.gear[k]); [sl, si] = k ? ['W', k] : ['G', '0']; invSel = `${sl}:${si}`; }
    const it = get();
    const acts = !it ? '' : sl === 'W' ? hbtn('Leveszem', `unwear:${si}`, st.length >= gearMax(), 'KeyF') + hbtn('Kovács ›', 'goforge', false, 'KeyG') + gSellBtns(it, 'W', si) : sl === 'H' ? hbtn('Raktárba', `gunshare:${si}`, st.length >= gearMax(), 'KeyR') : hbtn('Felveszem', `wear:${si}`, !canUse(it), 'KeyF') + hbtn('Karakterládába', `gshare:${si}`, SH.g.length >= SHARED_MAX, 'KeyK') + hbtn('Kovács ›', 'goforge', false, 'KeyG') + gSellBtns(it, 'G', si);
    const worn = GEAR_KEYS.map(k => P.gear[k] ? gTile(`W:${k}`, P.gear[k]) : emptyTile(`${GEAR_SLOTS[k]} · üres`, 'Húzz ide páncélt', null, 'W')).join('');
    const fit = x => gFilter === 'all' || x.slot === gFilter;
    const sorted = st.map((x, k) => [x, k]).filter(([x]) => fit(x)).sort((a, b) => GEAR_KEYS.indexOf(a[0].slot) - GEAR_KEYS.indexOf(b[0].slot) || b[0].q - a[0].q);
    const left = `<h3>Viselt <small>${GEAR_KEYS.filter(k => P.gear[k]).length} / ${GEAR_KEYS.length}</small></h3><div class="tiles worn" data-drop="W">${worn}</div>`;
    const mid = `<div class="itools"><button class="chip${gFilter === 'all' ? ' on' : ''}" data-act="gfilt:all">Mind</button>${GEAR_KEYS.map(k => `<button class="chip${gFilter === k ? ' on' : ''}" data-act="gfilt:${k}" data-badge="${newCounts().gs[k] || ''}">${GEAR_SLOTS[k]}</button>`).join('')}<span class="sp"></span>${trashBar('g')}</div>
      <h3>Páncélraktár <small>${st.length} / ${gearMax()}</small></h3><div class="tiles" data-drop="G">${sorted.map(([x, k]) => gTile(`G:${k}`, x, { cmp: P.gear[x.slot] || null })).join('') || emptyTile('Üres', 'A munkán talált páncél ide kerül')}</div>
      <h3>Karakterek közti láda <small>${SH.g.length} / ${SHARED_MAX}</small></h3><div class="tiles shared" data-drop="H">${SH.g.map((x, k) => fit(x) ? gTile(`H:${k}`, x, { cmp: P.gear[x.slot] || null }) : '').join('') || emptyTile('Üres', 'Tegyél ide páncélt a többi karakterednek')}</div>
      ${buildsRow()}`;
    return invLayout(left, it ? gearDetail(it, sl === 'G' ? P.gear[it.slot] : null, acts) : noDetail('Még nincs páncélod. A zombik dobják, és a boltban is van.'), mid);
  },
  forge() { // the smith: pick a gun or a piece on the left, its workbench in the middle, the item itself on the right
    const P = profile, lists = { L: P.loadout.map(unpackW), B: P.bag.map(unpackW), S: P.stash.map(unpackW) }, st = P.gearStash;
    let [sl, si] = invSel.split(':');
    const okSel = () => lists[sl] ? !!lists[sl][+si] : sl === 'W' ? !!P.gear[si] : sl === 'G' ? !!st[+si] : false;
    if (!okSel()) { sl = 'L'; si = lists.L[0] ? '0' : '1'; invSel = `L:${si}`; }
    const i = +si, w = lists[sl] && lists[sl][i], it = !w && (sl === 'W' ? P.gear[si] : st[i]), pp = P.parts || 0;
    const card = (t, sm, body, cls = '') => `<section class="fcard${cls ? ' ' + cls : ''}"><h4>${t}${sm ? `<small>${sm}</small>` : ''}</h4>${body}</section>`;
    const optRows = (rows, key, costTxt, can) => rows.map(([k, n, pr]) => { const max = pr >= .999;
      return `<div class="optrow"><span>${n}</span>${rbarP(pr)}<b>${Math.round(pr * 100)}%</b><button class="sbtn" data-act="${key}:${sl}:${si}:${k}" data-tip="${n}: a dobás ${Math.round(pr * 100)}% → ${Math.round(Math.min(1, pr + OPT_STEP) * 100)}%"${max || !can(pr) ? ' disabled' : ''}>${max ? 'Tökéletes' : costTxt(pr)}</button></div>`; }).join('');
    let bench = '';
    if (w) {
      const rows = OPT_STATS.map(([k, n]) => [k, n, rollOf(w, k)]).filter(r => r[2] != null);
      const expP = `<div class="fexp">${expPips(w.exp || 0)}</div>`;
      bench = `<div class="fgrid">
        ${card('Optimalizálás', 'egy érték +10% a tartományában · ⚙ alkatrész', optRows(rows, 'opt', pr => { const C = optCost(w, pr); return `+10% · ${C.parts} ⚙ · $${C.cash}`; }, pr => { const C = optCost(w, pr); return pp >= C.parts && P.cash >= C.cash; }))}
        <div class="fcol">
          ${card('Kalibrálás', '', `<p>Újradobja a véletlen értékeket. A régit és az újat egymás mellett látod, és te döntesz.</p>${hbtn(`Új dobás · ${HFORGE.recal(w)} ⚙`, `hforge:recal:${sl}:${i}`, pp < HFORGE.recal(w), 'KeyC')}`)}
          ${w.q >= 2 ? card('Felkenés', '', w.anoPend ? `<div class="anopend"><small>Új felkenés dobva</small><b>${anoName(w.anoPend)}: ${ANOINTS[w.anoPend]}</b><span>Most: ${w.anoint ? `${anoName(w.anoint)}: ${ANOINTS[w.anoint]}` : 'nincs'}</span>${hbtn('Elfogadom', `anoacc:${sl}:${i}`, false, null, 'Az új felkenés kerül a fegyverre.')}${hbtn('Elutasítom', `anorej:${sl}:${i}`, false, null, 'Marad a régi felkenés. Az alkatrész nem jár vissza.')}</div>`
            : `<p class="amb">${w.anoint ? `${anoName(w.anoint)}: ${ANOINTS[w.anoint]}` : 'Nincs felkenése.'}</p>${hbtn(`Újradobás · ${HFORGE.anoint(w)} ⚙`, `hforge:anoint:${sl}:${i}`, pp < HFORGE.anoint(w), 'KeyN')}`) : ''}
          ${card('Szakértelem', `${w.exp || 0}/10 · most +${2 * (w.exp || 0)}% sebzés`, `${expP}${hbtn((w.exp || 0) >= 10 ? 'Szakértelem: max' : `Szakértelem ${(w.exp || 0) + 1}/10 · ${expCost(w)} ⚙`, `hforge:exp:${sl}:${i}`, (w.exp || 0) >= 10 || pp < expCost(w), 'KeyM', expTip(w))}`)}
        </div>
        ${card('Túlhajtás', `első beszerelés 1 ◆ + 20 ⚙ · csere 20 ⚙ · van ${P.oc || 0} ◆`, `<div class="ocrow">${Object.entries(OVERCLOCKS).map(([k, O]) => `<button class="chip${w.oc === k ? ' on' : ''}" data-act="ocset:${sl}:${i}:${k}" data-tip="${O.desc}${ocFits(w, k) ? '' : ' (erre a fegyverre nem jó)'}"${w.oc === k || !ocFits(w, k) || (!w.oc && (P.oc || 0) < 1) || pp < 20 ? ' disabled' : ''}>${O.name}</button>`).join('')}</div><p class="note">${OC_HELP}</p>`, 'wide')}
      </div>`;
    } else if (it) {
      bench = `<div class="fgrid">
        ${card('Optimalizálás', `egy érték +10% a tartományában · ${FAB} anyag (van ${P.fabric || 0})`, optRows(gRolls(it), 'gopt', pr => { const C = gOptCost(it, pr); return `+10% · ${C.fab} ${FAB} · $${C.cash}`; }, pr => { const C = gOptCost(it, pr); return (P.fabric || 0) >= C.fab && P.cash >= C.cash; }))}
        <div class="fcol">${card('Szakértelem', `${it.exp || 0}/10 · most +${3 * (it.exp || 0)}% minden értékre`, `<div class="fexp">${expPips(it.exp || 0)}</div>${hbtn((it.exp || 0) >= 10 ? 'Szakértelem: max' : `Szakértelem ${(it.exp || 0) + 1}/10 · ${expCost(it)} ⚙`, `gexp:${sl}:${si}`, (it.exp || 0) >= 10 || pp < expCost(it), 'KeyM', expTip(it, true))}`)}</div>
      </div>`;
    }
    const x = w || it, head = `<div class="fhead"><h2>Kovács</h2>${x ? `<b style="color:${w ? rarColor(w) : gCol(it)}">${x.name}</b>` : ''}<small>${pp} ⚙ · ${P.fabric || 0} ${FAB} · ${P.oc || 0} ◆</small></div>`;
    const sec = (t, x) => x ? `<h3>${t}</h3><div class="tiles">${x}</div>` : '';
    const left = sec('Kézben', lists.L.map((x, k) => x ? wTile(`L:${k}`, x, { n: `${k + 1}` }) : '').join('')) + sec('Táska', lists.B.map((x, k) => wTile(`B:${k}`, x, { sub: x.base.name })).join('')) + sec('Raktár', lists.S.map((x, k) => wTile(`S:${k}`, x, { sub: x.base.name })).join('')) +
      sec('Viselt páncél', GEAR_KEYS.map(k => P.gear[k] ? gTile(`W:${k}`, P.gear[k]) : '').join('')) + sec('Páncélraktár', st.map((x, k) => gTile(`G:${k}`, x)).join(''));
    return invLayout(left, w ? weaponDetail(w, null, '') : it ? gearDetail(it, null, '') : noDetail('Nincs mit fejleszteni.'), head + (bench || '<p class="note">Válassz egy fegyvert vagy páncélt a bal oldalon.</p>'));
  },
  stats() {
    const P = profile, ws = P.loadout.map(unpackW).filter(Boolean), w0 = ws[0], A = w0 && wCalc(w0), pc = v => `${Math.round(v * 100)}%`;
    const kv = (k, v, note) => `<div class="kvr"><span>${k}${note ? `<small>${note}</small>` : ''}</span><b>${v}</b></div>`;
    return `<div class="st3">
      <section class="stc"><h3>Karakter</h3>${kv('Kaszt', P.cls ? `<span style="color:${CLASSES[P.cls].color}">${CLASSES[P.cls].name}</span>` : 'nincs')}${kv('Szint', P.level)}${kv('Max életerő', Math.round(maxHp()))}${kv('Pajzs', Math.round(maxShield ? maxShield() : 0))}${kv('Kapott sebzés', pc(SK.taken()), 'képességek, páncél')}${kv('Újratöltés gyorsaság', pc(reloadMul()))}</section>
      <section class="stc"><h3>Harc · 1. kéz</h3>${A ? kv('Kritikus esély', pc(A.crit), `fegyver ${pc(wCrit(w0))} + fejlesztés, képesség, páncél, gyártó`) + kv('Kritikus szorzó', `×${A.critDmg.toFixed(2)}`) + kv('Fejlövés-szorzó', `×${A.head.toFixed(2)}`) + kv('Sebzésbónusz', `+${pc(A.bonus)}`, 'kaszt, képességek, páncél, mesterség, szakértelem') : ''}${ws.map((w, k) => kv(`${k + 1}. kéz · <span style="color:${rarColor(w)}">${w.name}</span>`, `DPS ${dps(w)}`)).join('')}</section>
      <section class="stc"><h3>Páncél összesítve</h3>${gearSummary()}</section></div>
      <p class="note">Minden fegyver, szett, tehetség és zombi leírása a Kézikönyvben van.</p>`;
  },
  upgrades() {
    const bars = (l, m) => `<span class="kbars">${Array.from({ length: m }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('')}</span>`;
    return `<div class="hubhead"><h2>Fejlesztések</h2><p class="lede">Tartós fejlesztések dollárért. Minden munkára veled jönnek.</p></div>
      <div class="upg">${Object.entries(UPGRADES).map(([k, u]) => { const l = U(k), maxed = l >= u.max, c = upCost(k);
        return `<div class="upc"><div><div class="upn"><b>${u.name}</b>${bars(l, u.max)}<small>${l}/${u.max}</small></div><p>${u.desc}</p><p class="upv">${u.val(l)}${maxed ? '' : ` → <span>${u.val(l + 1)}</span>`}</p></div>${hbtn(maxed ? 'Kész' : `$${c}`, `up:${k}`, maxed || profile.cash < c)}</div>`; }).join('')}</div>`;
  },
  shop() { return shopPage('P'); }, sgear() { return shopPage('Q'); }, skit() { return shopPage('I'); }, slost() { return shopPage('X'); },
  swheel() {
    const P = profile, full = P.stash.length >= stashMax(), c = slotCost(), O = wheelOdds(false), OG = wheelOdds(true), pc = v => v ? `${v < .01 ? (v * 100).toFixed(1) : Math.round(v * 100)}%` : '–', pity = P.wheelPity || 0;
    return `<div class="whl"><div class="whbox"><div class="wheelwrap"><i class="wptr"></i>${wheelSvg()}</div></div>
      <aside class="whside"><h2>Szerencsekerék</h2><p>Pénz, alkatrész, anyag, tárgy, fegyver, páncél, túlhajtás-mag vagy a főnyeremény. Az arany pörgetés négyszer annyiba kerül, de nincs üres mező, a nyeremények háromszorosak, a legendás és a jackpot háromszor gyakoribb.</p>
        <div class="wbtns">${hbtn(full ? '<b>Tele a raktár</b>' : `<b>Pörgetés</b> <small>$${c}</small>`, 'slot', full || P.cash < c || wheelBusy, 'KeyF')}${hbtn(full ? '<b>Tele a raktár</b>' : `<b>Arany pörgetés</b> <small>$${c * 4}</small>`, 'slot:gold', full || P.cash < c * 4 || wheelBusy, 'KeyG')}</div>
        <table class="wodds"><tr><th>Esélyek</th><th></th><th>Sima</th><th class="g">Arany</th></tr>${WHEEL.map((s, k) => `<tr><td><i style="background:${s.c}">${s.ic}</i></td><td>${s.n}</td><td>${pc(O[k])}</td><td class="g">${pc(OG[k])}</td></tr>`).join('')}</table>
        <div class="wpity"><b>Balszerencse-mérő</b><i><em style="width:${pity / PITY_MAX * 100}%"></em></i><small>${pity} / ${PITY_MAX} · ha megtelik, a következő pörgetés biztosan legendás fegyver</small></div>
        ${P.lastSlot ? `<p class="note">Legutóbb: ${P.lastSlot}</p>` : ''}</aside></div>`;
  },
  career() {
    const t = Math.round(stats.time / 60), ptime = t < 60 ? `${t} p` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const cells = [['Szint', profile.level], ['Kész munkák', stats.jobs], ['Elbukott', stats.fails], ['Ölések', stats.kills], ['Fejlövések', stats.heads],
      ['Keresett pénz', `$${stats.cash}`], ['Legendás fegyverek', stats.legendaries], ['Játékidő', ptime]];
    const maps = MAP_IDS.map(id => { const m = stats.byMap[id] || {}; return `<li><b>${MAPS[id].name}</b><span>${profile.level >= MAPS[id].minLevel ? `${m.done || 0} kész · ${m.fail || 0} elbukott` : `${MAPS[id].minLevel}. szinttől`}</span></li>`; }).join('');
    return `<div class="hubhead"><h2>Karrier</h2><label class="charname">Karakter neve <input id="charName" maxlength="24" value="${esc(profile.name)}"></label></div>
      <div class="cstats">${cells.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>
      <div class="car3"><section><h3>Fegyvermesterség <small>szintenként +2% sebzés azzal a típussal</small></h3><div class="mastery">${BASES.map(b => { const n = (stats.byBase || {})[b.id] || 0, t = masteryTier(b.id), next = MASTERY[t], prev = t ? MASTERY[t - 1] : 0;
        return `<div class="mst${t ? ' on' : ''}"><img src="${gunShot(b, Math.min(4, t))}" alt=""><b>${b.name}</b><small>${t ? `${MASTERY_NAMES[t - 1]} · +${2 * t}%` : 'még nincs szint'}</small><i><em style="width:${next ? Math.min(100, (n - prev) / (next - prev) * 100) : 100}%"></em></i><small>${n}${next ? ` / ${next}` : ' · max'}</small></div>`; }).join('')}</div></section>
      <section><h3>Pályák</h3><ul class="mlist">${maps}</ul></section>
      <section><h3>Ölések fajtánként</h3><ul class="mlist">${Object.entries(KINDS).sort((a, b) => (stats.killsBy[b[0]] || 0) - (stats.killsBy[a[0]] || 0)).map(([k, K]) => `<li class="${stats.killsBy[k] ? '' : 'zero'}"><b>${K.name}</b><span>${stats.killsBy[k] || '–'}</span></li>`).join('')}</ul></section></div>`;
  },
};
enableDrag($('hubBody'));
// five tabs; Felszerelés and Fejlődés have sub-tabs
const HUB_GROUPS = { kit: [['arsenal', 'Fegyverek'], ['gear', 'Páncél'], ['look', 'Karakter'], ['forge', 'Kovács'], ['stats', 'Statisztika']], grow: [['skills', 'Képességek'], ['upgrades', 'Fejlesztések'], ['vet', 'Veterán'], ['coll', 'Gyűjtemény']], shop: [['shop', 'Fegyverek'], ['sgear', 'Páncél'], ['skit', 'Felszerelés'], ['swheel', 'Szerencsekerék'], ['slost', 'Elveszett bolt']],
  book: [['bweap', 'Fegyverek'], ['btal', 'Tehetségek'], ['bgear', 'Páncél'], ['bzomb', 'Zombik'], ['bboss', 'Fejvadászok'], ['bjobs', 'Munkák és pályák']] };
document.querySelectorAll('.mbtn[data-hub]').forEach(b => b.onclick = () => { hubTab = b.dataset.hub; renderHub(); });
$('hubSub').addEventListener('click', e => { const t = e.target.closest('[data-sub]'); if (t) { hubTab = t.dataset.sub; renderHub(); } });
$('hubMenuBtn').onclick = () => { saveProfile(); openMenu(); };
$('hubBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [kind, a, c] = b.dataset.act.split(':'), P = profile;
  if (CONFIRM_ACTS.includes(kind) && !confirmOk) return askConfirm(b);
  const before = hubSnap();
  const pay = n => { if (P.cash < n) return false; P.cash -= n; return true; };
  if (kind === 'prejoin' && P.rejoin) { const c = P.rejoin.code; P.rejoin = null; saveProfile(); partyJoin(c, false); NET.rejoinT = performance.now(); return renderHub(); }
  if (kind === 'lostbuy') { const L = P.lost, list = L && (a === 'w' ? L.w : L.g), x = list && list[+c]; if (!x) return;
    const it = a === 'w' ? unpackW(x) : x, price = lostPrice(it, a); if (P.cash < price || (a === 'w' ? P.stash.length >= stashMax() : P.gearStash.length >= gearMax())) return SND.deny();
    P.cash -= price; list.splice(+c, 1); delete x.found; if (a === 'w') P.stash.push(x); else P.gearStash.push(x); if (!L.w.length && !L.g.length) P.lost = null;
    toast('VISSZAVÁSÁROLVA', [`<i style="color:${a === 'w' ? rarColor(it) : gCol(it)}">${it.name}</i> · −$${price}`, a === 'w' ? 'A raktárba került.' : 'A páncélraktárba került.'], '#9dff6a'); saveProfile(); return renderHub(); }
  if (kind === 'goforge') { hubTab = 'forge'; return renderHub(); }
  if (kind === 'sel') { invSel = b.dataset.act.slice(4); const [l, k] = invSel.split(':'), L = { L: P.loadout, B: P.bag, S: P.stash }[l]; if (L && L[+k] && L[+k].isNew) delete L[+k].isNew; const g = l === 'G' ? P.gearStash[+k] : l === 'W' ? P.gear[k] : null; if (g && g.isNew) delete g.isNew; renderHub(); return selDbl($('hubBody'), invSel); } // seen: no longer new
  if (kind === 'jsel') { jobSel = a === 'range' ? 'range' : +a; if (NET.host) publishMember(); return renderHub(); }
  if (kind === 'claim') claimContract(a);
  if (kind === 'gexp') { const it = a === 'W' ? P.gear[c] : a === 'G' ? P.gearStash[+c] : null; if (it && (it.exp || 0) < 10 && (P.parts || 0) >= expCost(it)) { P.parts -= expCost(it); it.exp = (it.exp || 0) + 1; gearChanged(); SND.explode(); } }
  if (kind === 'ocset') { const [, l, i, k] = b.dataset.act.split(':'), list = { L: P.loadout, B: P.bag, S: P.stash, K: SH.w }[l], w = list && list[+i] && unpackW(list[+i]); if (w && OVERCLOCKS[k] && ocFits(w, k) && (w.oc || (P.oc || 0) >= 1) && (P.parts || 0) >= 20 && w.oc !== k) { if (!w.oc) P.oc--; P.parts -= 20; setOverclock(w, k); list[+i] = packW(w); SND.explode(); } }
  if (kind === 'deep') { if (!P.cls || (NET.code && !NET.host)) return; return startJob(deepJob(clamp(+a, 0, 2))); }
  if (kind === 'dir' && DIRECTIVES[a] && !(NET.code && !NET.host)) { const D = P.dirs || (P.dirs = []), i = D.indexOf(a); if (i >= 0) D.splice(i, 1); else D.push(a); if (NET.host) publishMember(); }
  if (kind === 'bsave') saveBuild(+a);
  if (kind === 'bload') loadBuild(+a);
  if (kind === 'slot' && !wheelBusy && P.stash.length < stashMax()) { slotCostPaid = slotCost() * (a === 'gold' ? 4 : 1); if (pay(slotCostPaid)) spinSlot(a === 'gold'); }
  if (kind === 'look') { P.look = Object.assign(myLook(), { [a]: +c }); saveProfile(); applyLookFP(); publishMember(); return renderHub(); }
  if (kind === 'jdiff') { const j = P.jobs[+a]; if (j && !j.bounty && !j.tier && !j.deep) setDiff(j, j.diff + +c); }
  if (kind === 'tier') { const j = P.jobs[+a]; if (j && j.tier && j.base) { const T = clamp(j.tier + +c, 1, (P.tier || 0) + 1); setTier(j, T); P.tierSel = T; } }
  if (kind === 'junk') P.junkQ = clamp(+a, -1, 2);
  if (kind === 'wfilt') { wFilter = a; return renderHub(); }
  if (kind === 'bsel') { bookSel[hubTab] = +a; return renderHub(); }
  if (kind === 'gfilt') { gFilter = a; return renderHub(); }
  if (kind === 'testground') { if (NET.code && !NET.host) return; return startJob(testJob()); }
  if (kind === 'job') { if (!P.cls) { hubTab = 'skills'; return renderHub(); } if (NET.code && (!NET.host || partyMembers().some(m => !m.me && !m.rdy))) return; return startJob(P.jobs[+a]); }
  if (kind === 'sknode' || kind === 'skview') { skillAction(kind, a); return renderHub(); } // just looking
  if (['cls', 'sk', 'respec', 'aug', 'swcls'].includes(kind)) skillAction(kind, a);
  if (['pcreate', 'pjoin', 'pjoinc', 'pleave', 'preveal', 'pcopy', 'pready'].includes(kind)) return partyAction(kind, a);
  if (kind === 'vet' && VET[a] && vetOpen() && vetAvail() > 0) { SH.vet.ranks[a] = (SH.vet.ranks[a] || 0) + 1; saveShared(); gearChanged(); }
  if (kind === 'reroll' && !(NET.code && !NET.host) && pay(reroll())) rollBoard();
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
    const T = P.throw, D = TYPE_LISTS[a] && TYPE_LISTS[a][c];
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
  hubToast(kind, before, b.dataset.act);
  SND.buy(); saveProfile(); saveShared(); renderHub(); if (kind === 'slot') wheelGo();
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
      <div>Pénz<strong>+$${r.cash}</strong></div><div>XP<strong>+${r.xp}</strong></div>${r.tokens ? `<div>Érdemérem<strong>+${r.tokens}</strong></div>` : ''}</div>
    ${r.bd ? `<div class="rbd"><div><b>Pénz</b>${r.bd.c.map(([k, v]) => `<span>${k}<i>${v}</i></span>`).join('')}</div><div><b>XP</b>${r.bd.x.map(([k, v]) => `<span>${k}<i>${v}</i></span>`).join('')}</div></div>` : ''}
    ${r.xpTo != null ? `<div class="xpanim"><small>${profile.level}. szint · ${profile.xp} / ${xpNeed(profile.level)} XP</small><i><em id="xpFill" style="width:${(r.levelUps ? 0 : r.xpFrom) * 100}%"></em></i></div>` : ''}
    ${r.board ? `<h3>Csapat</h3><table class="mtable"><tr><th>Játékos</th><th>Ölés</th><th>Sebzés</th><th>Felélesztés</th></tr>${(() => { const top = Math.max(...r.board.map(p => p.d || 0)); return r.board.sort((a, b) => (b.d || 0) - (a.d || 0) || b.k - a.k).map(p => `<tr><td>${top > 0 && p.d === top ? '★ ' : ''}${esc(p.n)}${p.me ? ' (te)' : ''}</td><td>${p.k}</td><td>${(p.d || 0).toLocaleString('hu-HU')}</td><td>${p.r}</td></tr>`).join(''); })()}</table>` : ''}
    ${profile.tokens > 0 || (vetOpen() && vetAvail() > 0) ? `<p class="note nudge">Elkölthető: ${profile.tokens > 0 ? `${profile.tokens} érdemérem (Fejlődés → Képességek)` : ''}${profile.tokens > 0 && vetOpen() && vetAvail() > 0 ? ' · ' : ''}${vetOpen() && vetAvail() > 0 ? `${vetAvail()} veterán pont (Fejlődés → Veterán)` : ''}</p>` : ''}
    ${r.levelUps ? `<p class="lvlup">Szintet léptél: ${profile.level}. szint! +${r.levelUps} érdemérem a képességfához. ${MAP_IDS.filter(id => MAPS[id].minLevel === profile.level).map(id => `Új pálya: ${MAPS[id].name}.`).join(' ')}</p>` : ''}
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

// the shop's sub-tabs: guns (P), armor (Q), kit (I), lost-and-found (X guns / Y armor); the detail panel is shared
function shopPage(tab) {
  const P = profile, LS = P.lost;
  let [sl, si] = invSel.split(':');
  const get = () => sl === 'P' ? P.shop[+si] && unpackW(P.shop[+si]) : sl === 'Q' ? P.gshop[+si] : sl === 'I' && ITEMS[si] ? si : sl === 'X' ? LS && LS.w[+si] && unpackW(LS.w[+si]) : sl === 'Y' ? LS && LS.g[+si] : null;
  if (!(tab === 'X' ? 'XY' : tab).includes(sl) || !get()) { [sl, si] = tab === 'P' ? ['P', P.shop.findIndex(Boolean)] : tab === 'Q' ? ['Q', P.gshop.findIndex(Boolean)] : tab === 'I' ? ['I', 'med'] : LS && LS.w.length ? ['X', 0] : ['Y', 0]; invSel = `${sl}:${si}`; }
  const x = get(), L0 = unpackW(P.loadout[0]) || unpackW(P.loadout[1]);
  let detail = noDetail(tab === 'X' ? 'Nincs elveszett felszerelésed.' : 'Minden elfogyott. Munka után megújul a kínálat.');
  if (x && sl === 'P') { const c = shopPrice(x); detail = weaponDetail(x, L0, hbtn(`Megveszem · $${c}`, `gun:${si}`, P.cash < c || P.stash.length >= stashMax(), 'KeyF')); }
  if (x && sl === 'Q') { const c = gearPrice(x); detail = gearDetail(x, P.gear[x.slot], hbtn(`Megveszem · $${c}`, `gbuy:${si}`, P.cash < c || P.gearStash.length >= gearMax(), 'KeyF')); }
  if (x && sl === 'I') { const c = ITEM_PRICE[x], full = P.inv[x] >= itemMax(x); detail = itemDetail(x, hbtn(full ? 'Tele' : `Megveszem · $${c}`, `item:${x}`, full || P.cash < c, 'KeyF')); }
  if (x && sl === 'X') { const c = lostPrice(x, 'w'); detail = weaponDetail(x, L0, hbtn(`Visszavásárlás · $${c}`, `lostbuy:w:${si}`, P.cash < c || P.stash.length >= stashMax(), 'KeyF', 'A kilépéskor elveszett fegyvered, a raktárba kerül.')); }
  if (x && sl === 'Y') { const c = lostPrice(x, 'g'); detail = gearDetail(x, P.gear[x.slot], hbtn(`Visszavásárlás · $${c}`, `lostbuy:g:${si}`, P.cash < c || P.gearStash.length >= gearMax(), 'KeyF', 'A kilépéskor elveszett páncélod, a páncélraktárba kerül.')); }
  const soon = emptyTile('Elfogyott', 'Munka után megújul'), room = (n, m) => `<small>hely: ${n} / ${m}</small>`;
  let head, lede, left, cmpCol = null;
  if (tab === 'P') cmpCol = `<h3>Kézben · összevetéshez</h3><div class="tiles ro">${P.loadout.map((o, k) => o ? wTile(`cmp:${k}`, unpackW(o), { n: `${k + 1}` }) : '').join('')}</div>`;
  if (tab === 'Q') cmpCol = `<h3>Viselt · összevetéshez</h3><div class="tiles ro worn">${GEAR_KEYS.map(k => P.gear[k] ? gTile(`cmp:${k}`, P.gear[k]) : emptyTile(`${GEAR_SLOTS[k]} · üres`, '')).join('')}</div>`;
  if (tab === 'P') { head = 'Fegyverek'; lede = 'A kínálat minden munka után megújul. A vett fegyver a raktárba kerül.';
    left = `<h3>Kínálat <small>munka után megújul · egy darab 1 szinttel feletted · hely a raktárban: ${P.stash.length} / ${stashMax()}</small></h3><div class="tiles">${P.shop.map((o, k) => { if (!o) return ''; const w = unpackW(o), c = shopPrice(w); return wTile(`P:${k}`, w, { cmp: L0, price: `$${c}`, cant: P.cash < c }); }).join('') || soon}</div>`; }
  if (tab === 'Q') { head = 'Páncél'; lede = 'A kínálat minden munka után megújul. A vett páncél a páncélraktárba kerül.';
    left = `<h3>Kínálat <small>munka után megújul · hely a páncélraktárban: ${P.gearStash.length} / ${gearMax()}</small></h3><div class="tiles">${P.gshop.map((it, k) => it ? gTile(`Q:${k}`, it, { cmp: P.gear[it.slot] || null, price: `$${gearPrice(it)}`, cant: P.cash < gearPrice(it) }) : '').join('') || soon}</div>`; }
  if (tab === 'I') { head = 'Felszerelés'; lede = 'Mindegyik tárgyból több fajta van. A fajtát egyszer kell megvenned, utána szabadon választhatsz; munkára mindig a kiválasztott fajta jön veled.';
    left = ITEM_KEYS.map(k => { const s = TYPE_SLOT[k], c = ITEM_PRICE[k], n = k === 'knife' ? 3 : 1;
      return `<h3 class="kith"><img class="sico" src="${ICONS[k]}" alt="">${ITEMS[k].name} <kbd>${ITEMS[k].key}</kbd> <small>nálad ${P.inv[k]}/${itemMax(k)} · most: ${itemName(k)}</small></h3>
        <div class="tiles">${tile(`I:${k}`, ICONS[k], `${itemName(k)}${n > 1 ? ` ×${n}` : ''}`, 'utántöltés', ITEMS[k].color, { val: `${P.inv[k]}/${itemMax(k)}`, valLbl: 'nálad', price: `$${c}`, cant: P.cash < c || P.inv[k] >= itemMax(k) })}</div>
        <div class="slist">${typeRows(s)}</div>`; }).join(''); }
  if (tab === 'X') { head = 'Elveszett bolt'; lede = 'Ha munka közben kilépsz (egyedül, vagy utolsóként a csapatból), a nálad lévő fegyverek és páncél ide kerülnek. Drágán visszavásárolhatod őket; egy újabb elvesztés lecseréli a listát.';
    const lw = LS ? LS.w.map((o, k) => { const w = unpackW(o); return w ? wTile(`X:${k}`, w, { price: `$${lostPrice(w, 'w')}`, cant: P.cash < lostPrice(w, 'w') || P.stash.length >= stashMax() }) : ''; }).join('') : '', lg = LS ? LS.g.map((it, k) => gTile(`Y:${k}`, it, { price: `$${lostPrice(it, 'g')}`, cant: P.cash < lostPrice(it, 'g') || P.gearStash.length >= gearMax() })).join('') : '';
    left = lw || lg ? `${lw ? `<h3 class="losth">Fegyverek ${room(P.stash.length, stashMax())}</h3><div class="tiles">${lw}</div>` : ''}${lg ? `<h3 class="losth">Páncél ${room(P.gearStash.length, gearMax())}</h3><div class="tiles">${lg}</div>` : ''}` : `<div class="tiles">${emptyTile('Üres', 'Nincs elveszett felszerelésed')}</div>`; }
  return cmpCol ? invLayout(cmpCol, detail, left) : `<div class="hubhead"><h2>${head}</h2><p class="lede">${lede}</p></div>${invLayout(left, detail)}`;
}
function typeRows(slot) {
  const T = profile.throw;
  return Object.entries(TYPE_LISTS[slot]).map(([key, D]) => { const own = T.own.includes(key), on = throwKind({ g: 'gren', k: 'knife', m: 'med', s: 'adren' }[slot]) === key;
    return srow(`${D.name}${on ? ' <span class="vrank">nálad</span>' : ''}`, D.desc, own ? '' : `$${D.price}`, `ttype:${slot}:${key}`, on || (!own && profile.cash < D.price), on ? 'Kiválasztva' : own ? 'Kiválaszt' : 'Megveszem'); }).join('');
}

// ---------- the slot machine: a cash sink with a jackpot ----------
const slotLvl = () => profile.level >= LEVEL_CAP ? LEVEL_CAP + 2 * (profile.tier || 0) : profile.level, slotCost = () => 400 + 120 * slotLvl();
const PITY_MAX = 10; // ten spins without gear: the next one lands on Legendás
const giveW = (P, q, lv) => { const w = makeWeapon(pick(BASES), q, lv); P.stash.push(packW(w)); noteFound(w); return `<i style="color:${rarColor(w)}">${w.name}</i> a raktárba`; };
const WHEEL = [ // w: odds; the slice size on screen is only roughly the odds, so the rare ones are still visible
  { n: 'Üres', w: 24, c: '#34302c', ic: '✕', f: () => 'Semmi. A kerék nyert.' },
  { n: 'Pénz', w: 19, c: '#2f6b35', ic: '$', f: (P, lv, g) => { const c = Math.round(slotCost() * rand(.5, 2) * (g ? 3 : 1) / 10) * 10; P.cash += c; return `+$${c}`; } },
  { n: 'Alkatrész', w: 14, c: '#5c6068', ic: '⚙', f: (P, lv, g) => { const n = (4 + Math.floor(Math.random() * 10)) * (g ? 3 : 1); P.parts = (P.parts || 0) + n; return `+${n} ⚙ alkatrész`; } },
  { n: 'Anyag', w: 8, c: '#7a6440', ic: '▦', f: (P, lv, g) => { const n = (3 + Math.floor(Math.random() * 6)) * (g ? 3 : 1); P.fabric = (P.fabric || 0) + n; return `+${n} ▦ anyag`; } },
  { n: 'Utántöltés', w: 8, c: '#963434', ic: '✚', f: P => { ITEM_KEYS.forEach(k => P.inv[k] = itemMax(k)); return 'Minden tárgyad (gyógyítás, gránát, kés, stimuláns) tele'; } },
  { n: 'Fegyver', w: 13, c: '#2f5fa8', ic: '⌖', gear: 1, f: (P, lv, g) => giveW(P, Math.max(g ? 3 : 1, rollRarity(.4)), lv) },
  { n: 'Páncél', w: 8, c: '#6243a8', ic: '⛨', gear: 1, f: (P, lv, g) => { const it = makeGear(pick(GEAR_KEYS), Math.max(g ? 3 : 1, rollRarity(.4)), lv); if (P.gearStash.length >= gearMax()) { P.fabric = (P.fabric || 0) + PARTS[it.q]; return `${it.name}: a páncélraktár tele, szétszedve (+${PARTS[it.q]} ▦)`; } P.gearStash.push(it); return `<i style="color:${gCol(it)}">${it.name}</i> a páncélraktárba`; } },
  { n: 'Mag', w: 3, c: '#a8842f', ic: '◆', f: P => { P.oc = (P.oc || 0) + 1; return '+1 ◆ túlhajtás-mag'; } },
  { n: 'Legendás', w: 2.4, c: '#e07a1f', ic: '★', gear: 1, big: 1, f: (P, lv) => giveW(P, 4, lv) },
  { n: 'JACKPOT', w: .6, c: '#f2c230', ic: '♛', gear: 1, big: 1, f: (P, lv) => giveW(P, 5, lv) },
];
const wheelW = (s, g) => s.w * (g ? (s.n === 'Üres' ? 0 : s.big ? 3 : 1) : 1); // the gold spin: no blanks, triple jackpot odds
const wheelOdds = g => { const T = WHEEL.reduce((a, s) => a + wheelW(s, g), 0); return WHEEL.map(s => wheelW(s, g) / T); };
const WHEEL_ARC = (() => { const v = WHEEL.map(s => Math.max(s.w, 7)), T = v.reduce((a, b) => a + b, 0); let a = 0; return v.map(x => { const r = [a, a + x / T * 360]; a = r[1]; return r; }); })();
let wheelRot = 0, wheelAnim = null;
function spinSlot(gold) { // picks a slice, pays it out now (saved), the wheel shows it after the spin
  const P = profile, lv = slotLvl(), O = wheelOdds(gold);
  let k = 0, r = Math.random(); while (k < WHEEL.length - 1 && (r -= O[k]) > 0) k++;
  if ((P.wheelPity || 0) >= PITY_MAX - 1 && !WHEEL[k].gear) k = WHEEL.findIndex(s => s.n === 'Legendás');
  P.wheelPity = WHEEL[k].gear ? 0 : (P.wheelPity || 0) + 1;
  const msg = WHEEL[k].f(P, lv, gold); P.lastSlot = `${WHEEL[k].n}: ${msg}`;
  const [a0, a1] = WHEEL_ARC[k], th = a0 + (a1 - a0) * rand(.2, .8), to = wheelRot + 360 * 5 + (((-th - wheelRot) % 360) + 360) % 360;
  wheelAnim = { from: wheelRot, to, k, msg }; wheelRot = to;
}
function wheelGo() { // after the render: spin it, tick, then reveal
  const A = wheelAnim, el = document.querySelector('#hubBody .wheel'); wheelAnim = null; if (!A) return;
  const S = WHEEL[A.k], done = () => { wheelBusy = false; document.querySelectorAll('#hubBody [data-act^="slot"]').forEach(b => b.disabled = false); if (S.big) { banner(S.n === 'JACKPOT' ? 'JACKPOT!' : 'LEGENDÁS!', ''); SND.legend(S.n === 'JACKPOT'); } else if (S.n === 'Üres') SND.deny(); else SND.sell(); toast(`SZERENCSEKERÉK · ${S.n.toUpperCase()}`, [A.msg], S.c === '#34302c' ? '#aaa' : S.c); };
  if (!el || !el.animate) return done();
  wheelBusy = true; document.querySelectorAll('#hubBody [data-act^="slot"]').forEach(b => b.disabled = true);
  el.animate([{ transform: `rotate(${A.from}deg)` }, { transform: `rotate(${A.to}deg)` }], { duration: 3600, easing: 'cubic-bezier(.12,.75,.12,1)' }).onfinish = done;
  let t = 0; for (let n = 0; n < 26; n++) { t += 40 + n * n * .9; setTimeout(() => tn(1500 + Math.random() * 300, .02, .05, 'square'), t); } // the clicker slows down with the wheel
}
let wheelBusy = false;
function wheelSvg() {
  const R = 150, pt = (a, r) => { const t = (a - 90) * Math.PI / 180; return `${(160 + r * Math.cos(t)).toFixed(1)} ${(160 + r * Math.sin(t)).toFixed(1)}`; };
  return `<svg viewBox="0 0 320 320" class="wheel" style="transform:rotate(${wheelRot}deg)"><circle cx="160" cy="160" r="156" fill="#111" stroke="#c9a24a" stroke-width="4"/>${WHEEL.map((s, k) => { const [a0, a1] = WHEEL_ARC[k], m = (a0 + a1) / 2;
    return `<path d="M160 160 L${pt(a0, R)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1, R)} Z" fill="${s.c}" stroke="#0c0c0c" stroke-width="2"/><g transform="translate(${pt(m, R * .72)})" fill="#fff" color="#fff">${(z => `<svg x="${-z / 2}" y="${-z / 2}" width="${z}" height="${z}" viewBox="0 0 16 16">${icPaths(IC_CHAR[s.ic])}</svg>`)(a1 - a0 < 20 ? 15 : 22)}</g>`; }).join('')}
    ${Array.from({ length: 24 }, (_, k) => `<circle cx="${pt(k * 15, 150).split(' ')[0]}" cy="${pt(k * 15, 150).split(' ')[1]}" r="3" fill="#ffe7a0"/>`).join('')}<circle cx="160" cy="160" r="26" fill="#1a1a1a" stroke="#c9a24a" stroke-width="4"/><text x="160" y="161" text-anchor="middle" dominant-baseline="middle" fill="#c9a24a" font-size="18" font-weight="700">DA</text></svg>`;
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
const buildsRow = (extra = '') => `<div class="builds"><b class="parts">${profile.parts || 0} ⚙ · ${profile.fabric || 0} ${FAB} · ${profile.oc || 0} ◆</b>${extra}<b>Buildek</b>${[0, 1, 2].map(i => { const B = (profile.builds || [])[i]; return `<span class="bslot"><small>${i + 1}. ${B ? esc(B.name) : 'üres'}</small>${hbtn('Betöltés', `bload:${i}`, !B)}${hbtn('Mentés', `bsave:${i}`)}</span>`; }).join('')}</div>`;

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
