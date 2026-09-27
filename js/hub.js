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
  fair:   [['Utolsó kör a körhintán', 'Vásárigazgató'], ['Az óriáskerék fénye', 'Mutatványos család'], ['Céllövölde zárás után', 'Bódés Feri']],
  quarry: [['A gödör alján', 'Kőbánya Kft.'], ['Robbantás előtti éjszaka', 'Bányamester'], ['Senki sem jön fel', 'Bányászszakszervezet']],
};
const stashMax = () => 40 + 10 * U('stash'), gearMax = () => 40 + 10 * U('stash'); // the Raktárbővítés upgrade adds 10 + 10 a level
const reroll = () => 50 + 40 * profile.level;
// the base's own gunsmith: dollars instead of points, so old favourites can keep up
const PARTS = [1, 2, 5, 15, 40, 80]; // salvage yield by rarity
const HFORGE = { recal: w => 10 + Math.floor(w.level / 3), level: w => 2 + Math.floor(w.level / 5), anoint: () => 12, cap: () => profile.level >= LEVEL_CAP ? LEVEL_CAP + 2 * (profile.tier || 0) : Math.max(1, profile.level - 2), rarity: w => [8, 20, 45, 100][w.q] };
const ITEM_PRICE = { med: 120, gren: 100, knife: 90, adren: 180 };
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
  j.reward = Math.round(j.base.reward * 1.4 * Math.pow(1.3, T) / 10) * 10; j.xp = Math.round(j.base.xp * 1.3 * Math.pow(1.25, T));
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
  profile.shop = [0, 1, 2, 3].map(() => packW(makeWeapon(pick(BASES), Math.min(4, rollRarity(.15 + lvl * .02)), lvl + 1))); // uniques only drop
  profile.gshop = [0, 1, 2].map(() => makeGear(null, rollRarity(.15 + lvl * .02), lvl + 1));
}

// ---------- rendering ----------
let hubTab = 'jobs', jobSel = 0;
// the county: where each map lies, and a hand-drawn backdrop
const MAP_LOC = { farm: [170, 300], chapel: [300, 105], gas: [560, 335], mill: [735, 110], town: [450, 215], quarry: [790, 320], fair: [615, 205] };
const MAP_ART = (() => {
  const L = MAP_LOC, road = (a, b) => `<path class="road" d="M${L[a][0]} ${L[a][1]} Q ${(L[a][0] + L[b][0]) / 2 + 30} ${(L[a][1] + L[b][1]) / 2 - 20} ${L[b][0]} ${L[b][1]}"/>`;
  const r = mulberry(7), trees = Array.from({ length: 140 }, () => { const x = r() * 900, y = r() * 440; return Math.hypot(x - 450, y - 215) < 70 ? '' : `<circle class="tree" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + r() * 6).toFixed(1)}"/>`; }).join('');
  const grid = Array.from({ length: 12 }, (_, i) => `<path class="grid" d="M${i * 80} 0 V440 M0 ${i * 40} H900"/>`).join('');
  return `<defs><radialGradient id="jfog" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#1c211c"/><stop offset="1" stop-color="#070908"/></radialGradient></defs>
    <rect width="900" height="440" fill="url(#jfog)"/>${grid}${trees}
    <path class="river" d="M-10 200 C 120 170 200 230 300 210 S 520 140 620 200 S 800 260 910 230"/>
    ${road('farm', 'town')}${road('chapel', 'town')}${road('town', 'gas')}${road('town', 'mill')}${road('gas', 'quarry')}${road('mill', 'quarry')}${road('town', 'fair')}${road('farm', 'chapel')}
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
    <ul class="jfacts">${B ? `<li class="jboss"><b>${B.name}</b>: ${B.desc}</li><li class="jleg">Garantált legendás fegyver és páncél</li><li class="jleg">Lehetséges egyedi: ${(B.loot || []).map(k => UNIQUES[k].name).join(', ')}</li><li>Nincs időkorlát · ${lv}. szintű zombik</li>`
      : `${j.type && j.type !== 'survive' ? `<li class="jtype">${JOB_TYPES[j.type].desc(j)}</li>` : ''}<li>${noClock(j) ? 'Nincs időkorlát' : `<b>${fmtTime(j.dur)}</b> ${j.type === 'defense' ? 'védelem' : 'túlélés'}`} · <b>${lv}.</b> szintű zóna</li><li>${START_THREAT[j.diff - 1]}. szintű veszélytől</li>`}
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
  $('hubSlot').textContent = `${P.name} · ${stats.jobs} kész munka${NET.code ? ` · csapat: ${partyMembers().length} fő` : ''}`;
  $('hubLvl').textContent = P.level;
  $('hubXp').style.width = P.xp / xpNeed(P.level) * 100 + '%';
  $('hubXpTxt').textContent = `${P.xp} / ${xpNeed(P.level)} XP · veterán ${vetEarned()}${vetAvail() ? ` (+${vetAvail()})` : ''}`;
  $('hubCash').textContent = `$${P.cash}`;
  rollContracts(); const claimable = [...P.daily.list.map(c => [c, false]), [P.weekly.c, true]].filter(([c, w]) => !c.got && cProg(c, w) >= c.n).length;
  document.querySelector('[data-hub="jobs"]').dataset.badge = claimable || '';
  $('hubTokens').textContent = P.tokens || 0;
  $('hubCls').textContent = P.cls ? CLASSES[P.cls].name : 'nincs kaszt'; $('hubCls').style.setProperty('--cc', P.cls ? CLASSES[P.cls].color : '');
  document.querySelectorAll('.mbtn[data-hub]').forEach(b => b.classList.toggle('on', b.dataset.hub === hubTab || (b.dataset.group && HUB_GROUPS[b.dataset.group].some(([k]) => k === hubTab))));
  const grp = Object.values(HUB_GROUPS).find(g => g.some(([k]) => k === hubTab)), sub = grp ? `<nav class="subnav">${grp.map(([k, t]) => `<button class="sbtab${k === hubTab ? ' on' : ''}" data-sub="${k}">${t}</button>`).join('')}</nav>` : '';
  const hb = $('hubBody'); hb.innerHTML = (NET.code && hubTab !== 'jobs' ? partyPanel() : '') + sub + HUB[hubTab](); // in a party the strip is on every tab hb.style.animation = 'none'; void hb.offsetWidth; hb.style.animation = '';
  updateKeybar($('hubBody'));
}
const miniCard = (w, acts) => `<div class="wcard mini" style="--rc:${rarColor(w)}"><div class="head"><div class="lvl">Lv ${w.level}</div><div class="rar">${RARITIES[w.q].name}</div>
  <div class="name">${w.name}</div><div class="sub">${w.base.name} · DPS ${dps(w)}${w.element ? ` · <span style="color:${ELEMENTS[w.element].color}">${ELEMENTS[w.element].name}</span>` : ''}</div>
  <div class="sub" style="color:#9fd0ff">${w.maker}: ${mkOf(w).perk || ''}</div></div>
  <div class="act">${acts}</div></div>`;
// key: optional shortcut (KeyboardEvent.code) shown on the button and in the key bar
const KEY_LABEL = { KeyC: 'C', KeyK: 'K', KeyF: 'F', KeyR: 'R', KeyT: 'T', KeyX: 'X', KeyG: 'G', KeyV: 'V', KeyB: 'B', KeyN: 'N', Digit1: '1', Digit2: '2' };
const hbtn = (label, act, off, key) => `<button class="sbtn" data-act="${act}"${key ? ` data-key="${key}"` : ''}${off ? ' disabled' : ''}>${key ? `<kbd>${KEY_LABEL[key]}</kbd>` : ''}${label}</button>`;
const hhold = (label, act, off, key) => `<button class="sbtn hold" data-hact="${act}"${key ? ` data-key="${key}"` : ''}${off ? ' disabled' : ''}>${key ? `<kbd>${KEY_LABEL[key]}</kbd>` : ''}${label}</button>`;
const freeHand = L => L[0] ? L[1] ? 0 : 1 : 0;
const fieldParts = q => Math.max(1, Math.floor(PARTS[q] / 2)); // taking a gun apart in the field: half what the bench at home gets
const testJob = () => ({ map: 'farm', diff: 1, dur: 1e6, mod: null, boss: false, type: 'test', test: true, title: 'Lőtér', client: '', reward: 0, xp: 0, lvl: profile.level, goal: 0 });
const HUB = {
  skills: () => skillsTab(),
  vet: () => vetTab(),
  jobs() { // a county map with the jobs on it (Deep Rock style); the picked one's card on the side
    const P = profile, J = P.jobs; if (!J[jobSel]) jobSel = 0;
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
    return partyPanel() + `${contractsStrip()}<div class="hubhead"><h2>Munkák</h2><span>${hbtn('Lőtér', 'testground', NET.code && !NET.host)}${hbtn(`Új munkák · $${reroll()}`, 'reroll', P.cash < reroll())}</span></div>
      <div class="jobmap"><svg viewBox="0 0 900 440" class="jsvg" role="img" aria-label="Munkatérkép">${MAP_ART}${locs}${marks}</svg><div class="jside">${hostPick()}${jobCard(J[jobSel], jobSel, notReady)}</div></div>`;
  },
  arsenal() {
    const P = profile, lists = { L: P.loadout.map(unpackW), B: P.bag.map(unpackW), S: P.stash.map(unpackW), K: SH.w.map(unpackW) }, sharedFull = SH.w.length >= SHARED_MAX;
    let [sl, si] = invSel.split(':');
    if (!lists[sl] || !lists[sl][+si]) { sl = 'L'; si = lists.L[0] ? 0 : 1; invSel = `L:${si}`; }
    const i = +si, w = lists[sl][i], bagFull = lists.B.length >= bagMax(), stashFull = lists.S.length >= stashMax(), lone = lists.L.filter(Boolean).length < 2;
    let acts = '';
    if (w && sl === 'L') acts = hbtn('Táskába', `mv:L:${i}:B`, lone || bagFull, 'KeyF') + hbtn(`${2 - i}. kézbe`, `mv:L:${i}:L:${1 - i}`, false, `Digit${2 - i}`) + hbtn('Raktárba', `mv:L:${i}:S`, lone || stashFull, 'KeyR') + hbtn('Karakterládába', `mv:L:${i}:K`, lone || sharedFull, 'KeyK');
    else if (w && sl === 'K') acts = hbtn('Kézbe', `mv:K:${i}:L:${freeHand(lists.L)}`, !canUse(w), 'KeyF') + hbtn('Táskába', `mv:K:${i}:B`, bagFull, 'KeyT') + hbtn('Raktárba', `mv:K:${i}:S`, stashFull, 'KeyR');
    else if (w) acts = hbtn('Kézbe', `mv:${sl}:${i}:L:${freeHand(lists.L)}`, !canUse(w), 'KeyF') + hbtn('1. kézbe', `mv:${sl}:${i}:L:0`, !canUse(w), 'Digit1') + hbtn('2. kézbe', `mv:${sl}:${i}:L:1`, !canUse(w), 'Digit2') +
      hbtn('Karakterládába', `mv:${sl}:${i}:K`, sharedFull, 'KeyK') + (sl === 'B' ? hbtn('Raktárba', `mv:B:${i}:S`, stashFull, 'KeyR') : hbtn('Táskába', `mv:S:${i}:B`, bagFull, 'KeyT') + hbtn(`Eladás $${sellValue(w)}`, `sell:${i}`, false, 'KeyX') + hbtn(`Szétszedés +${PARTS[w.q]} ⚙`, `salvage:${i}`, false, 'KeyB'));
    const pp = P.parts || 0;
    if (w) acts += hbtn(w.level + 2 > HFORGE.cap() ? `Kovács: szintkorlát (${HFORGE.cap()})` : `Kovács: +2 szint · ${HFORGE.level(w)} ⚙`, `hforge:level:${sl}:${i}`, pp < HFORGE.level(w) || w.level + 2 > HFORGE.cap(), 'KeyG') +
      (w.q < 4 ? hbtn(`Kovács: ${RARITIES[w.q + 1].name} · ${HFORGE.rarity(w)} ⚙`, `hforge:rarity:${sl}:${i}`, pp < HFORGE.rarity(w), 'KeyV') : '') +
      (w.q >= 2 ? hbtn(`Új felkenés · ${HFORGE.anoint()} ⚙`, `hforge:anoint:${sl}:${i}`, pp < HFORGE.anoint(), 'KeyN') : '') +
      hbtn(`Kalibrálás (új dobás) · ${HFORGE.recal(w)} ⚙`, `hforge:recal:${sl}:${i}`, pp < HFORGE.recal(w), 'KeyC');
    const cmp = sl === 'L' ? lists.L[1 - i] : lists.L[0] || lists.L[1];
    const hands = lists.L.map((x, k) => x ? wTile(`L:${k}`, x, { n: `${k + 1}` }) : emptyTile(`${k + 1}. kéz üres`, 'Húzz ide egy fegyvert', null, `L:${k}`)).join('');
    const left = `<h3>Kézben</h3><div class="tiles" data-drop="L">${hands}</div>
      <h3>Táska <small>${lists.B.length} / ${bagMax()}</small></h3><div class="tiles" data-drop="B">${lists.B.map((x, k) => wTile(`B:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'A munkára is jön')}</div>
      <h3>Raktár <small>${lists.S.length} / ${stashMax()}</small></h3><div class="tiles" data-drop="S">${lists.S.map((x, k) => wTile(`S:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'A vett és talált fegyverek ide kerülnek')}</div>
      <h3>Karakterek közti láda <small>${SH.w.length} / ${SHARED_MAX} · a saját mentéseid között, nem a csapattal</small></h3><div class="tiles shared" data-drop="K">${lists.K.map((x, k) => wTile(`K:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'Tegyél ide fegyvert, és a másik mentésed is eléri')}</div>`;
    const junk = `<span class="junk"><b>Auto-szétszedés kijutáskor</b>${['Ki', 'Közönséges', 'Nem mindennapi', 'Ritka'].map((t, q) => `<button class="chip${(P.junkQ == null ? -1 : P.junkQ) === q - 1 ? ' on' : ''}" data-act="junk:${q - 1}">${t}${q ? '-ig' : ''}</button>`).join('')}</span>`;
    return `${buildsRow(junk)}

      ${invLayout(left, w ? weaponDetail(w, cmp, acts) : noDetail('Válassz egy fegyvert.'))}`;
  },
  gear() {
    const P = profile, st = P.gearStash;
    let [sl, si] = invSel.split(':');
    const get = () => sl === 'W' ? P.gear[si] : sl === 'G' ? st[+si] : sl === 'H' ? SH.g[+si] : null;
    if (!get()) { const k = GEAR_KEYS.find(k => P.gear[k]); [sl, si] = k ? ['W', k] : ['G', '0']; invSel = `${sl}:${si}`; }
    const it = get();
    const acts = !it ? '' : sl === 'W' ? hbtn('Leveszem', `unwear:${si}`, st.length >= gearMax(), 'KeyF') : sl === 'H' ? hbtn('Raktárba', `gunshare:${si}`, st.length >= gearMax(), 'KeyR') : hbtn('Felveszem', `wear:${si}`, false, 'KeyF') + hbtn('Karakterládába', `gshare:${si}`, SH.g.length >= SHARED_MAX, 'KeyK') + hbtn(`Eladás $${gearValue(it)}`, `gsell:${si}`, false, 'KeyX') + hbtn(`Szétszedés +${PARTS[it.q]} ⚙`, `gsalvage:${si}`, false, 'KeyB');
    const worn = GEAR_KEYS.map(k => P.gear[k] ? gTile(`W:${k}`, P.gear[k]) : emptyTile(GEAR_SLOTS[k], 'Húzz ide páncélt', gearIcon(k, '#5a5a55'), 'W')).join('');
    const sorted = st.map((x, k) => [x, k]).sort((a, b) => GEAR_KEYS.indexOf(a[0].slot) - GEAR_KEYS.indexOf(b[0].slot) || b[0].q - a[0].q);
    const left = `<h3>Viselt</h3><div class="tiles worn" data-drop="W">${worn}</div>
      <h3>Összesítve</h3>${gearSummary()}
      <h3>Páncélraktár <small>${st.length} / ${gearMax()}</small></h3><div class="tiles" data-drop="G">${sorted.map(([x, k]) => gTile(`G:${k}`, x, { cmp: P.gear[x.slot] || null })).join('') || emptyTile('Üres', 'A munkán talált páncél ide kerül')}</div>
      <h3>Karakterek közti láda <small>${SH.g.length} / ${SHARED_MAX} · a saját mentéseid között, nem a csapattal</small></h3><div class="tiles shared" data-drop="H">${SH.g.map((x, k) => gTile(`H:${k}`, x, { cmp: P.gear[x.slot] || null })).join('') || emptyTile('Üres', 'Tegyél ide páncélt a többi karakterednek')}</div>
      <h3>Márka-kódex</h3><div class="brands">${Object.values(BRANDS).map(B => `<div class="brand" style="--bc:${B.color}"><b>${B.name}</b><small>${B.tag} · minden darab: ${GSTATS[B.core[0]].name} ${fmtG(...B.core)}</small>
        <ul>${B.sets.map(([n, k, v]) => `<li>${n} db: ${GSTATS[k].name} ${fmtG(k, v)}</li>`).join('')}${B.t4 ? `<li class="t4"><b>4 db · ${B.t4[0]}:</b> ${B.t4[1]}</li>` : ''}</ul></div>`).join('')}</div>`;
    return `${buildsRow()}
      <p class="lede">Sisak, mellvért, nadrág, csizma. A páncél a pajzsodat növeli, minden darab márkabónuszt ad, és 2/3/4 azonos márkájú darab szettbónuszt. Kattints egy darabra a részletekért.</p>
      ${invLayout(left, it ? gearDetail(it, sl === 'G' ? P.gear[it.slot] : null, acts) : noDetail('Még nincs páncélod. A zombik dobják, és a boltban is van.'))}`;
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
    const cons = Object.entries(ITEM_PRICE).map(([k, c]) => tile(`I:${k}`, ICONS[k], ITEMS[k].name, `${ITEMS[k].desc}`, ITEMS[k].color, { val: `${P.inv[k]}/${itemMax(k)}`, valLbl: 'nálad', price: `$${c}`, cant: P.cash < c || P.inv[k] >= itemMax(k) })).join('');
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
const HUB_GROUPS = { kit: [['arsenal', 'Fegyverek'], ['gear', 'Páncél']], grow: [['skills', 'Képességek'], ['upgrades', 'Fejlesztések'], ['vet', 'Veterán és gyűjtemény']] };
document.querySelectorAll('.mbtn[data-hub]').forEach(b => b.onclick = () => { hubTab = b.dataset.hub; renderHub(); });
$('hubBody').addEventListener('click', e => { const t = e.target.closest('[data-sub]'); if (t) { hubTab = t.dataset.sub; renderHub(); } });
$('hubMenuBtn').onclick = () => { saveProfile(); openMenu(); };
$('hubBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [kind, a, c] = b.dataset.act.split(':'), P = profile;
  const pay = n => { if (P.cash < n) return false; P.cash -= n; return true; };
  if (kind === 'sel') { invSel = b.dataset.act.slice(4); return renderHub(); }
  if (kind === 'jsel') { jobSel = +a; if (NET.host) publishMember(); return renderHub(); }
  if (kind === 'claim') claimContract(a);
  if (kind === 'bsave') saveBuild(+a);
  if (kind === 'bload') loadBuild(+a);
  if (kind === 'slot' && P.stash.length < stashMax() && pay(slotCost())) spinSlot();
  if (kind === 'tier') { const j = P.jobs[+a]; if (j && j.tier && j.base) { const T = clamp(j.tier + +c, 1, (P.tier || 0) + 1); setTier(j, T); P.tierSel = T; } }
  if (kind === 'junk') P.junkQ = clamp(+a, -1, 2);
  if (kind === 'testground') { if (NET.code && !NET.host) return; return startJob(testJob()); }
  if (kind === 'job') { if (!P.cls) { hubTab = 'skills'; return renderHub(); } if (NET.code && (!NET.host || partyMembers().some(m => !m.me && !m.rdy))) return; return startJob(P.jobs[+a]); }
  if (['cls', 'sk', 'respec', 'reclass', 'aug'].includes(kind)) skillAction(kind, a);
  if (['pcreate', 'pjoin', 'pjoinc', 'pleave', 'preveal', 'pcopy', 'pready'].includes(kind)) return partyAction(kind, a);
  if (kind === 'vet' && VET[a] && vetAvail() > 0) { P.vet[a] = (P.vet[a] || 0) + 1; gearChanged(); }
  if (kind === 'reroll' && pay(reroll())) rollBoard();
  if (kind === 'hforge') { // hforge:level|rarity:L|B|S:i
    const [, what, l, i] = b.dataset.act.split(':'), list = { L: P.loadout, B: P.bag, S: P.stash, K: SH.w }[l], w = list && list[+i] && unpackW(list[+i]);
    const ok = what === 'level' ? w && w.level + 2 <= HFORGE.cap() : what === 'rarity' ? w && w.q < 4 : what === 'recal' ? !!w : w && w.q >= 2, cost = w && HFORGE[what] ? HFORGE[what](w) : 1e9;
    if (ok && (P.parts || 0) >= cost) { P.parts -= cost; if (what === 'level') levelUpWeapon(w, 2); else if (what === 'rarity') rarityUp(w); else if (what === 'recal') recalWeapon(w); else w.anoint = pick(Object.keys(ANOINTS).filter(k => k !== w.anoint)); list[+i] = packW(w); SND.explode(); }
  }
  if (kind === 'up' && U(a) < UPGRADES[a].max && pay(upCost(a))) P.up[a] = U(a) + 1;
  if (kind === 'item') { const n = a === 'knife' ? 3 : 1; if (P.inv[a] < itemMax(a) && pay(ITEM_PRICE[a])) P.inv[a] = Math.min(itemMax(a), P.inv[a] + n); }
  if (kind === 'ttype') { // ttype:g|k:kind
    const T = P.throw, list = a === 'g' ? GREN_TYPES : KNIFE_TYPES, D = list[c];
    if (D) { if (!T.own.includes(c)) { if (!pay(D.price)) return; T.own.push(c); } T[a] = c; }
  }
  if (kind === 'gun') { const w = unpackW(P.shop[+a]); if (P.stash.length < stashMax() && pay(shopPrice(w))) { P.stash.push(packW(w)); P.shop[+a] = null; noteFound(w); } }
  if (kind === 'mv') { const [, f, i, t, j] = b.dataset.act.split(':'); moveGun({ L: P.loadout, B: P.bag, S: P.stash, K: SH.w }, f, +i, t, +j); }
  if (kind === 'wear') { const it = P.gearStash.splice(+a, 1)[0], old = P.gear[it.slot]; P.gear[it.slot] = it; if (old) P.gearStash.push(old); gearChanged(); }
  if (kind === 'unwear') { P.gearStash.push(P.gear[a]); P.gear[a] = null; gearChanged(); }
  if (kind === 'gshare' && P.gearStash[+a] && SH.g.length < SHARED_MAX) SH.g.push(P.gearStash.splice(+a, 1)[0]);
  if (kind === 'gunshare' && SH.g[+a] && P.gearStash.length < gearMax()) P.gearStash.push(SH.g.splice(+a, 1)[0]);
  if (kind === 'gsell') { P.cash += gearValue(P.gearStash.splice(+a, 1)[0]); }
  if (kind === 'gbuy') { const it = P.gshop[+a]; if (it && P.gearStash.length < gearMax() && pay(gearPrice(it))) { P.gearStash.push(it); P.gshop[+a] = null; } }
  if (kind === 'salvage') { const w = P.stash[+a] && unpackW(P.stash[+a]); if (w) { P.stash.splice(+a, 1); P.parts = (P.parts || 0) + PARTS[w.q]; } }
  if (kind === 'gsalvage') { const it = P.gearStash[+a]; if (it) { P.gearStash.splice(+a, 1); P.parts = (P.parts || 0) + PARTS[it.q]; } }
  if (kind === 'sell') { const w = unpackW(P.stash.splice(+a, 1)[0]); P.cash += sellValue(w); }
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
    ${r.board ? `<h3>Csapat</h3><table class="mtable"><tr><th>Játékos</th><th>Ölés</th><th>Felélesztés</th></tr>${r.board.sort((a, b) => b.k - a.k).map(p => `<tr><td>${esc(p.n)}${p.me ? ' (te)' : ''}</td><td>${p.k}</td><td>${p.r}</td></tr>`).join('')}</table>` : ''}
    ${r.levelUps ? `<p class="lvlup">Szintet léptél: ${profile.level}. szint! ${MAP_IDS.filter(id => MAPS[id].minLevel === profile.level).map(id => `Új pálya: ${MAPS[id].name}.`).join(' ')}</p>` : ''}
    ${r.tierBonus ? `<h3>${r.job.tier ? 'Rémálom-jutalom' : 'Az első munkád jutalma'}</h3><ul class="wlist"><li style="color:${rarColor(r.tierBonus)}">${r.tierBonus.name} <small>Lv ${r.tierBonus.level} ${r.tierBonus.base.name} · a raktárba került</small></li></ul>` : ''}
    ${(() => { const best = [...r.kept].sort((a, b) => (b.unique ? 9 : b.q) - (a.unique ? 9 : a.q) || dps(b) - dps(a))[0]; return best && best.q >= 2 ? `<div class="bestdrop" style="--rc:${rarColor(best)}"><small>A MUNKA LEGJOBB ZSÁKMÁNYA</small><img src="${wPic(best)}" alt=""><b>${best.name}</b><span>${best.unique ? 'Egyedi' : RARITIES[best.q].name} · Lv ${best.level} ${best.base.name} · ${dps(best)} DPS</span></div>` : ''; })()}
    ${r.kept.length ? `<h3>Hazavitt új fegyverek</h3><ul class="wlist">${wl(r.kept, '')}</ul>` : ''}
    ${r.junkN ? `<p class="note">Automatikus szétszedés: ${r.junkN} fegyver → +${r.junkParts} ⚙</p>` : ''}
    ${r.lost.length ? `<h3>Elveszett fegyverek</h3><ul class="wlist">${wl(r.lost, 'lost')}</ul>` : ''}
    ${r.gear.length ? `<h3>${r.success ? 'Hazavitt páncél' : 'Elveszett páncél'}</h3><ul class="wlist">${r.gear.map(it => `<li class="${r.success ? '' : 'lost'}" style="color:${RARITIES[it.q].color}">${it.name} <small>Lv ${it.level} ${GEAR_SLOTS[it.slot]} · ${BRANDS[it.brand].name}</small></li>`).join('')}</ul>` : ''}
    ${r.parts ? `<p class="lvlup">Alkatrész a terepen szétszedett holmiból: +${r.parts} ⚙</p>` : r.partsLost ? `<p class="note">A terepen szétszedett holmi alkatrésze (${r.partsLost} ⚙) odaveszett.</p>` : ''}
    ${r.overflow ? `<p class="note">A páncélraktár megtelt: ${r.overflow} darabot automatikusan eladtunk.</p>` : ''}`;
  $('results').hidden = false;
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
const slotCost = () => 400 + 120 * profile.level, SLOT_TXT = '55% semmi vagy pénz vissza · 25% ⚙ · 15% fegyver · 4% legendás · 1% egyedi';
function spinSlot() {
  const P = profile, r = Math.random(), lv = P.level;
  let msg;
  if (r < .35) msg = 'Semmi. A gép nyert.';
  else if (r < .55) { const c = Math.round(slotCost() * rand(.5, 2)); P.cash += c; msg = `$${c} vissza`; }
  else if (r < .80) { const n = 4 + Math.floor(Math.random() * 10); P.parts = (P.parts || 0) + n; msg = `+${n} ⚙`; }
  else { const q = r < .95 ? Math.max(1, rollRarity(.4)) : r < .99 ? 4 : 5, w = makeWeapon(pick(BASES), q, lv); P.stash.push(packW(w)); noteFound(w); msg = `${w.name} (${w.unique ? 'egyedi' : RARITIES[w.q].name}) a raktárba`; if (q >= 4) { banner('JACKPOT!', w.name); SND.legend(w.unique); } }
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
const buildsRow = (extra = '') => `<div class="builds"><b class="parts">${profile.parts || 0} ⚙</b>${extra}<b>Buildek</b>${[0, 1, 2].map(i => { const B = (profile.builds || [])[i]; return `<span class="bslot"><small>${i + 1}. ${B ? esc(B.name) : 'üres'}</small>${hbtn('Betöltés', `bload:${i}`, !B)}${hbtn('Mentés', `bsave:${i}`)}</span>`; }).join('')}</div>`;

// a party member sees what the leader is looking at on the map
function hostPick() {
  if (!NET.code || NET.host) return '';
  const h = partyMembers().find(m => m.h), s = h && h.sel; if (!s || typeof s !== 'object') return '';
  const M = MAPS[s.m], d = clamp(+s.d || 1, 1, 5);
  return `<div class="hostpick"><small>A VEZETŐ VÁLASZTÁSA</small><b>${esc(String(s.t || ''))}</b><span>${M ? M.name : ''} · ${DIFF_NAMES[d - 1]}${+s.tr ? ` · Rémálom +${+s.tr}` : ''} · $${+s.r || 0}</span></div>`;
}
