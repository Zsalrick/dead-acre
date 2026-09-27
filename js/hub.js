// ================= THE BASE (between jobs) =================
const DIFF_NAMES = ['Könnyű', 'Közepes', 'Nehéz', 'Brutális', 'Rémálom'];
const START_THREAT = [1, 3, 5, 8, 11];
const JOB_TEXT = {
  farm:   [['A Holloway-farm védelme', 'Holloway család'], ['Aratás előtti éjszaka', 'Szövetkezet'], ['Az állatok maradjanak', 'Öreg Holloway']],
  chapel: [['Éjféli mise', 'Mihály atya'], ['A sírásó kérése', 'Temetőgondnok'], ['Csengessenek még egyszer', 'Egyházközség']],
  gas:    [['Az utolsó tankolás', 'Route 9 Kft.'], ['Éjszakai műszak', 'Kutas Béla'], ['Ki kell hozni a kasszát', 'Tulajdonos']],
  mill:   [['Fűrészpor és vér', 'Kovács-fatelep'], ['A favágók hazamennének', 'Művezető'], ['Rönkök hajnalig', 'Erdészet']],
  town:   [['Délben a főutcán', 'Városi tanács'], ['A bank nem nyit ki magától', 'Első Megyei Bank'], ['Utolsó kör a szalonban', 'Kocsmáros']],
  quarry: [['A gödör alján', 'Kőbánya Kft.'], ['Robbantás előtti éjszaka', 'Bányamester'], ['Senki sem jön fel', 'Bányászszakszervezet']],
};
const MAX_STASH = 40, MAX_GEAR = 40;
const reroll = () => 50 + 40 * profile.level;
// the base's own gunsmith: dollars instead of points, so old favourites can keep up
const HFORGE = { level: w => 150 * w.level, rarity: w => [2000, 4000, 8000, 16000][w.q] };
const ITEM_PRICE = { med: 120, gren: 100, knife: 90, adren: 180 };
const shopPrice = w => Math.round(sellValue(w) * 4 / 10) * 10;

function makeJob() {
  const lvl = profile.level, maps = MAP_IDS.filter(id => MAPS[id].minLevel <= lvl);
  const map = pick(maps), maxD = Math.min(5, 1 + Math.floor(lvl / 3));
  const diff = 1 + Math.floor(Math.random() * maxD);
  const dur = 300 + (diff - 1) * 45;
  const mod = diff >= 2 && Math.random() < .4 ? pick(Object.keys(MODS)) : null;
  const boss = diff >= 3 && (diff === 5 || Math.random() < .35);
  const [title0, client] = pick(JOB_TEXT[map]);
  const type = diff >= 2 ? pick(['survive', 'survive', 'survive', 'exterminate', 'defense', 'supply']) : 'survive';
  const title = type === 'survive' ? title0 : `${JOB_TYPES[type].name}: ${title0}`;
  const reward = Math.round((250 + 180 * Math.pow(diff, 1.4) + lvl * 35) * (dur / 300) * (mod ? 1.2 : 1) * (boss ? 1.3 : 1) / 10) * 10;
  return { map, diff, dur, mod, boss, title, client, type, goal: type === 'exterminate' ? 50 + 25 * diff : type === 'supply' ? 5 + diff : 0,
    reward: Math.round(reward * (type === 'survive' ? 1 : 1.15) / 10) * 10, lvl: lvl + diff - 1, xp: 120 * diff + (boss ? 150 : 0) + (mod ? 50 : 0) };
}
function rollBoard() {
  profile.jobs = [makeJob(), makeJob(), makeJob()];
  if (!profile.jobs.some(j => j.diff === 1)) profile.jobs[0] = Object.assign(makeJob(), { diff: 1, boss: false }); // always one easy job
  const j = profile.jobs[0]; j.dur = 300; j.reward = Math.round((470 + profile.level * 35) / 10) * 10; j.xp = 120; j.lvl = profile.level;
  if (profile.level >= 3) profile.jobs.push(makeBounty());
}
// a bounty: one strong boss, no clock, guaranteed legendary gun + armor
function makeBounty() {
  const lvl = profile.level, key = pick(Object.keys(BOUNTIES)), B = BOUNTIES[key];
  const map = pick(MAP_IDS.filter(id => MAPS[id].minLevel <= lvl)), diff = Math.min(5, 2 + Math.floor(lvl / 6));
  return { map, diff, dur: 0, mod: null, boss: false, bounty: key, title: `Fejvadászat: ${B.name}`, client: 'Megyei seriff',
    reward: Math.round((700 + 300 * diff + lvl * 60) / 10) * 10, xp: 350 + 120 * diff, lvl: lvl + 2 };
}
function rollShop() {
  const lvl = profile.level;
  profile.shop = [0, 1, 2, 3].map(() => packW(makeWeapon(pick(BASES), rollRarity(.15 + lvl * .02), lvl + 1)));
  profile.gshop = [0, 1, 2].map(() => makeGear(null, rollRarity(.15 + lvl * .02), lvl + 1));
}

// ---------- rendering ----------
let hubTab = 'jobs';
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
  $('hubTokens').textContent = P.tokens || 0;
  $('hubCls').textContent = P.cls ? CLASSES[P.cls].name : 'nincs kaszt'; $('hubCls').style.setProperty('--cc', P.cls ? CLASSES[P.cls].color : '');
  document.querySelectorAll('[data-hub]').forEach(b => b.classList.toggle('on', b.dataset.hub === hubTab));
  const hb = $('hubBody'); hb.innerHTML = HUB[hubTab](); hb.style.animation = 'none'; void hb.offsetWidth; hb.style.animation = '';
  updateKeybar($('hubBody'));
}
const miniCard = (w, acts) => `<div class="wcard mini" style="--rc:${rarColor(w)}"><div class="head"><div class="lvl">Lv ${w.level}</div><div class="rar">${RARITIES[w.q].name}</div>
  <div class="name">${w.name}</div><div class="sub">${w.base.name} · DPS ${dps(w)}${w.element ? ` · <span style="color:${ELEMENTS[w.element].color}">${ELEMENTS[w.element].name}</span>` : ''}</div>
  <div class="sub" style="color:#9fd0ff">${w.maker}: ${mkOf(w).perk || ''}</div></div>
  <div class="act">${acts}</div></div>`;
// key: optional shortcut (KeyboardEvent.code) shown on the button and in the key bar
const KEY_LABEL = { KeyF: 'F', KeyR: 'R', KeyT: 'T', KeyX: 'X', KeyG: 'G', KeyV: 'V', Digit1: '1', Digit2: '2' };
const hbtn = (label, act, off, key) => `<button class="sbtn" data-act="${act}"${key ? ` data-key="${key}"` : ''}${off ? ' disabled' : ''}>${key ? `<kbd>${KEY_LABEL[key]}</kbd>` : ''}${label}</button>`;
const freeHand = L => L[0] ? L[1] ? 0 : 1 : 0;
const HUB = {
  skills: () => skillsTab(),
  vet: () => vetTab(),
  jobs() {
    const cards = profile.jobs.map((j, i) => {
      const M = MAPS[j.map];
      const lv = j.lvl || profile.level, B = j.bounty && BOUNTIES[j.bounty];
      return `<article class="job${B ? ' bounty' : ''}" style="--dc:${B ? '#ff8c1a' : ['#6fbf5a', '#d8c24a', '#f2a33a', '#e0533a', '#b05cff'][j.diff - 1]}">
        <div class="jhead"><span class="jmap">${M.name}</span><span class="jstars" title="${DIFF_NAMES[j.diff - 1]}">${stars(j.diff)}</span></div>
        <h3>${j.title}</h3><p class="jclient">Megbízó: ${j.client}</p>
        <ul class="jfacts">${B ? `<li class="jboss"><b>${B.name}</b>: ${B.desc}</li><li class="jleg">Garantált legendás fegyver és páncél</li><li>Nincs időkorlát · ${lv}. szintű zombik</li>`
          : `${j.type && j.type !== 'survive' ? `<li class="jtype">${JOB_TYPES[j.type].desc(j)}</li>` : ''}<li>${noClock(j) ? 'Nincs időkorlát' : `<b>${fmtTime(j.dur)}</b> ${j.type === 'defense' ? 'védelem' : 'túlélés'}`} · <b>${lv}.</b> szintű zóna</li><li>${DIFF_NAMES[j.diff - 1]} · ${START_THREAT[j.diff - 1]}. szintű veszélytől</li>`}
          ${j.mod ? `<li class="jmod">${MODS[j.mod].label}: ${MODS[j.mod].sub}</li>` : ''}${j.boss ? '<li class="jboss">A Mészáros is eljön</li>' : ''}</ul>
        <div class="jfoot"><span class="jreward">$${j.reward}<small>+${j.xp} XP</small></span>${hbtn(NET.code && !NET.host ? 'A vezető választ' : NET.code ? 'Elvállaljuk' : 'Elvállalom', `job:${i}`, NET.code && !NET.host)}</div>
      </article>`;
    }).join('');
    const locked = MAP_IDS.filter(id => MAPS[id].minLevel > profile.level).map(id => `${MAPS[id].name} (${MAPS[id].minLevel}. szint)`).join(', ');
    return partyPanel() + `<div class="hubhead"><h2>Munkák</h2>${hbtn(`Új munkák · $${reroll()}`, 'reroll', profile.cash < reroll())}</div>
      <p class="lede">Éld túl az időt, aztán juss el a furgonhoz, amikor visszajön érted. Ami nálad van (két fegyver a kézben, öt a táskában, a talált páncél), az hazajön, ha elhajtasz vele. Ha elbuksz, a munkán talált holmi elveszik.</p>
      <div class="jobs">${cards}</div>${locked ? `<p class="note">Később nyílik: ${locked}.</p>` : ''}`;
  },
  arsenal() {
    const P = profile, lists = { L: P.loadout.map(unpackW), B: P.bag.map(unpackW), S: P.stash.map(unpackW) };
    let [sl, si] = invSel.split(':');
    if (!lists[sl] || !lists[sl][+si]) { sl = 'L'; si = lists.L[0] ? 0 : 1; invSel = `L:${si}`; }
    const i = +si, w = lists[sl][i], bagFull = lists.B.length >= BAG_MAX, stashFull = lists.S.length >= MAX_STASH, lone = lists.L.filter(Boolean).length < 2;
    let acts = '';
    if (w && sl === 'L') acts = hbtn('Táskába', `mv:L:${i}:B`, lone || bagFull, 'KeyF') + hbtn(`${2 - i}. kézbe`, `mv:L:${i}:L:${1 - i}`, false, `Digit${2 - i}`) + hbtn('Raktárba', `mv:L:${i}:S`, lone || stashFull, 'KeyR');
    else if (w) acts = hbtn('Kézbe', `mv:${sl}:${i}:L:${freeHand(lists.L)}`, false, 'KeyF') + hbtn('1. kézbe', `mv:${sl}:${i}:L:0`, false, 'Digit1') + hbtn('2. kézbe', `mv:${sl}:${i}:L:1`, false, 'Digit2') +
      (sl === 'B' ? hbtn('Raktárba', `mv:B:${i}:S`, stashFull, 'KeyR') : hbtn('Táskába', `mv:S:${i}:B`, bagFull, 'KeyT') + hbtn(`Eladás $${sellValue(w)}`, `sell:${i}`, false, 'KeyX'));
    if (w) acts += hbtn(`Kovács: +2 szint · $${HFORGE.level(w)}`, `hforge:level:${sl}:${i}`, P.cash < HFORGE.level(w), 'KeyG') +
      (w.q < 4 ? hbtn(`Kovács: ${RARITIES[w.q + 1].name} · $${HFORGE.rarity(w)}`, `hforge:rarity:${sl}:${i}`, P.cash < HFORGE.rarity(w), 'KeyV') : '');
    const cmp = sl === 'L' ? lists.L[1 - i] : lists.L[0] || lists.L[1];
    const hands = lists.L.map((x, k) => x ? wTile(`L:${k}`, x, { n: `${k + 1}` }) : emptyTile(`${k + 1}. kéz üres`, 'Húzz ide egy fegyvert', null, `L:${k}`)).join('');
    const left = `<h3>Kézben</h3><div class="tiles" data-drop="L">${hands}</div>
      <h3>Táska <small>${lists.B.length} / ${BAG_MAX}</small></h3><div class="tiles" data-drop="B">${lists.B.map((x, k) => wTile(`B:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'A munkára is jön')}</div>
      <h3>Raktár <small>${lists.S.length} / ${MAX_STASH}</small></h3><div class="tiles" data-drop="S">${lists.S.map((x, k) => wTile(`S:${k}`, x, { cmp: lists.L[0] })).join('') || emptyTile('Üres', 'A vett és talált fegyverek ide kerülnek')}</div>`;
    return `<div class="hubhead"><h2>Fegyverek</h2></div>
      <p class="lede">A két kézben lévő fegyver és a táska (${BAG_MAX} hely) jön veled a munkára; munka közben [I] vagy [Tab] a leltár. Kattints egy fegyverre a részletekért, vagy húzd át máshová.</p>
      ${invLayout(left, w ? weaponDetail(w, cmp, acts) : noDetail('Válassz egy fegyvert.'))}`;
  },
  gear() {
    const P = profile, st = P.gearStash;
    let [sl, si] = invSel.split(':');
    const get = () => sl === 'W' ? P.gear[si] : sl === 'G' ? st[+si] : null;
    if (!get()) { const k = GEAR_KEYS.find(k => P.gear[k]); [sl, si] = k ? ['W', k] : ['G', '0']; invSel = `${sl}:${si}`; }
    const it = get();
    const acts = !it ? '' : sl === 'W' ? hbtn('Leveszem', `unwear:${si}`, st.length >= MAX_GEAR, 'KeyF') : hbtn('Felveszem', `wear:${si}`, false, 'KeyF') + hbtn(`Eladás $${gearValue(it)}`, `gsell:${si}`, false, 'KeyX');
    const worn = GEAR_KEYS.map(k => P.gear[k] ? gTile(`W:${k}`, P.gear[k]) : emptyTile(GEAR_SLOTS[k], 'Húzz ide páncélt', gearIcon(k, '#5a5a55'), 'W')).join('');
    const sorted = st.map((x, k) => [x, k]).sort((a, b) => GEAR_KEYS.indexOf(a[0].slot) - GEAR_KEYS.indexOf(b[0].slot) || b[0].q - a[0].q);
    const left = `<h3>Viselt</h3><div class="tiles worn" data-drop="W">${worn}</div>
      <h3>Összesítve</h3>${gearSummary()}
      <h3>Páncélraktár <small>${st.length} / ${MAX_GEAR}</small></h3><div class="tiles" data-drop="G">${sorted.map(([x, k]) => gTile(`G:${k}`, x, { cmp: P.gear[x.slot] || null })).join('') || emptyTile('Üres', 'A munkán talált páncél ide kerül')}</div>
      <h3>Márka-kódex</h3><div class="brands">${Object.values(BRANDS).map(B => `<div class="brand" style="--bc:${B.color}"><b>${B.name}</b><small>${B.tag} · minden darab: ${GSTATS[B.core[0]].name} ${fmtG(...B.core)}</small>
        <ul>${B.sets.map(([n, k, v]) => `<li>${n} db: ${GSTATS[k].name} ${fmtG(k, v)}</li>`).join('')}</ul></div>`).join('')}</div>`;
    return `<div class="hubhead"><h2>Páncél</h2></div>
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
    if (x && sl === 'P') { const c = shopPrice(x); detail = weaponDetail(x, unpackW(P.loadout[0]) || unpackW(P.loadout[1]), hbtn(`Megveszem · $${c}`, `gun:${si}`, P.cash < c || P.stash.length >= MAX_STASH, 'KeyF')); }
    if (x && sl === 'I') { const c = ITEM_PRICE[x], full = P.inv[x] >= itemMax(x); detail = itemDetail(x, hbtn(full ? 'Tele' : `Megveszem · $${c}`, `item:${x}`, full || P.cash < c, 'KeyF')); }
    if (x && sl === 'Q') { const c = gearPrice(x); detail = gearDetail(x, P.gear[x.slot], hbtn(`Megveszem · $${c}`, `gbuy:${si}`, P.cash < c || P.gearStash.length >= MAX_GEAR, 'KeyF')); }
    const L0 = unpackW(P.loadout[0]) || unpackW(P.loadout[1]);
    const guns = P.shop.map((o, k) => { if (!o) return ''; const w = unpackW(o), c = shopPrice(w); return wTile(`P:${k}`, w, { cmp: L0, price: `$${c}`, cant: P.cash < c }); }).join('');
    const gear = P.gshop.map((it, k) => it ? gTile(`Q:${k}`, it, { cmp: P.gear[it.slot] || null, price: `$${gearPrice(it)}`, cant: P.cash < gearPrice(it) }) : '').join('');
    const cons = Object.entries(ITEM_PRICE).map(([k, c]) => tile(`I:${k}`, ICONS[k], ITEMS[k].name, `${ITEMS[k].desc}`, ITEMS[k].color, { val: `${P.inv[k]}/${itemMax(k)}`, valLbl: 'nálad', price: `$${c}`, cant: P.cash < c || P.inv[k] >= itemMax(k) })).join('');
    const left = `<h3>Fegyverek</h3><div class="tiles">${guns || emptyTile('Elfogyott', 'Munka után megújul')}</div>
      <h3>Páncél</h3><div class="tiles">${gear || emptyTile('Elfogyott', 'Munka után megújul')}</div>
      <h3>Felszerelés</h3><div class="tiles">${cons}</div>
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
      <div class="mcols"><section><h3>Pályák</h3><ul class="mlist">${maps}</ul></section>
      <section><h3>Ölések fajtánként</h3><ul class="mlist cols2">${Object.entries(KINDS).sort((a, b) => (stats.killsBy[b[0]] || 0) - (stats.killsBy[a[0]] || 0)).map(([k, K]) => `<li class="${stats.killsBy[k] ? '' : 'zero'}"><b>${K.name}</b><span>${stats.killsBy[k] || '–'}</span></li>`).join('')}</ul></section></div>`;
  },
};
enableDrag($('hubBody'));
document.querySelectorAll('[data-hub]').forEach(b => b.onclick = () => { hubTab = b.dataset.hub; renderHub(); });
$('hubMenuBtn').onclick = () => { saveProfile(); openMenu(); };
$('hubBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [kind, a, c] = b.dataset.act.split(':'), P = profile;
  const pay = n => { if (P.cash < n) return false; P.cash -= n; return true; };
  if (kind === 'sel') { invSel = b.dataset.act.slice(4); return renderHub(); }
  if (kind === 'job') { if (!P.cls) { hubTab = 'skills'; return renderHub(); } if (NET.code && !NET.host) return; return startJob(P.jobs[+a]); }
  if (['cls', 'sk', 'respec', 'reclass', 'aug'].includes(kind)) skillAction(kind, a);
  if (['pcreate', 'pjoin', 'pjoinc', 'pleave', 'preveal', 'pcopy'].includes(kind)) return partyAction(kind, a);
  if (kind === 'vet' && VET[a] && vetAvail() > 0) { P.vet[a] = (P.vet[a] || 0) + 1; gearChanged(); }
  if (kind === 'reroll' && pay(reroll())) rollBoard();
  if (kind === 'hforge') { // hforge:level|rarity:L|B|S:i
    const [, what, l, i] = b.dataset.act.split(':'), list = { L: P.loadout, B: P.bag, S: P.stash }[l], w = list && list[+i] && unpackW(list[+i]);
    if (w && (what === 'level' || w.q < 4) && pay(HFORGE[what](w))) { what === 'level' ? levelUpWeapon(w, 2) : rarityUp(w); list[+i] = packW(w); SND.explode(); }
  }
  if (kind === 'up' && U(a) < UPGRADES[a].max && pay(upCost(a))) P.up[a] = U(a) + 1;
  if (kind === 'item') { const n = a === 'knife' ? 3 : 1; if (P.inv[a] < itemMax(a) && pay(ITEM_PRICE[a])) P.inv[a] = Math.min(itemMax(a), P.inv[a] + n); }
  if (kind === 'ttype') { // ttype:g|k:kind
    const T = P.throw, list = a === 'g' ? GREN_TYPES : KNIFE_TYPES, D = list[c];
    if (D) { if (!T.own.includes(c)) { if (!pay(D.price)) return; T.own.push(c); } T[a] = c; }
  }
  if (kind === 'gun') { const w = unpackW(P.shop[+a]); if (P.stash.length < MAX_STASH && pay(shopPrice(w))) { P.stash.push(packW(w)); P.shop[+a] = null; noteFound(w); } }
  if (kind === 'mv') { const [, f, i, t, j] = b.dataset.act.split(':'); moveGun({ L: P.loadout, B: P.bag, S: P.stash }, f, +i, t, +j); }
  if (kind === 'wear') { const it = P.gearStash.splice(+a, 1)[0], old = P.gear[it.slot]; P.gear[it.slot] = it; if (old) P.gearStash.push(old); gearChanged(); }
  if (kind === 'unwear') { P.gearStash.push(P.gear[a]); P.gear[a] = null; gearChanged(); }
  if (kind === 'gsell') { P.cash += gearValue(P.gearStash.splice(+a, 1)[0]); }
  if (kind === 'gbuy') { const it = P.gshop[+a]; if (it && P.gearStash.length < MAX_GEAR && pay(gearPrice(it))) { P.gearStash.push(it); P.gshop[+a] = null; } }
  if (kind === 'sell') { const w = unpackW(P.stash.splice(+a, 1)[0]); P.cash += sellValue(w); }
  SND.buy(); saveProfile(); renderHub();
});

// ---------- after a job ----------
function showResults(r) {
  state = 'results';
  if (document.pointerLockElement) document.exitPointerLock();
  ['hud', 'pause', 'station'].forEach(id => $(id).hidden = true);
  const wl = (list, cls) => list.map(w => `<li class="${cls}" style="color:${rarColor(w)}">${w.name} <small>Lv ${w.level} ${w.base.name}</small></li>`).join('');
  $('resultsBody').innerHTML = `<div class="eyebrow">${r.job.title} · ${MAPS[r.job.map].name}</div>
    <div class="title">${r.success ? 'MUNKA KÉSZ' : 'ELBUKTÁL'}</div>
    <p class="lede">${r.success ? 'Beültél a furgonba, és elhajtottál. A megbízó fizet.' : r.abandoned ? 'Feladtad a munkát. A megbízó nem fizet.' : 'Elestél. Kimentettek, de a munka közben talált fegyverek odavesztek.'}</p>
    <div class="stats"><div>Ölés<strong>${r.kills}</strong></div><div>Fejlövés<strong>${r.heads}</strong></div><div>Kibírt idő<strong>${fmtTime(r.time)}</strong></div>
      <div>Pénz<strong>+$${r.cash}</strong></div><div>XP<strong>+${r.xp}</strong></div><div>Érdemérem<strong>+${r.tokens}</strong></div></div>
    ${r.levelUps ? `<p class="lvlup">Szintet léptél: ${profile.level}. szint! ${MAP_IDS.filter(id => MAPS[id].minLevel === profile.level).map(id => `Új pálya: ${MAPS[id].name}.`).join(' ')}</p>` : ''}
    ${r.kept.length ? `<h3>Hazavitt új fegyverek</h3><ul class="wlist">${wl(r.kept, '')}</ul>` : ''}
    ${r.lost.length ? `<h3>Elveszett fegyverek</h3><ul class="wlist">${wl(r.lost, 'lost')}</ul>` : ''}
    ${r.gear.length ? `<h3>${r.success ? 'Hazavitt páncél' : 'Elveszett páncél'}</h3><ul class="wlist">${r.gear.map(it => `<li class="${r.success ? '' : 'lost'}" style="color:${RARITIES[it.q].color}">${it.name} <small>Lv ${it.level} ${GEAR_SLOTS[it.slot]} · ${BRANDS[it.brand].name}</small></li>`).join('')}</ul>` : ''}
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
