// ================= UPGRADES =================
// lv: current level -> cost of the next one
const UPGRADES = {
  maxHp:       { name: 'Max életerő',        desc: '+20 max életerő',                          max: 10, base: 600,  val: l => `${100 + 20 * l}` },
  regen:       { name: 'Életerő-regeneráció', desc: 'Gyorsabban és hamarabb tölt vissza',      max: 8,  base: 700,  val: l => `${Math.round(45 * (1 + .25 * l))}/mp · ${(3.2 * (1 - .08 * l)).toFixed(1)} mp után` },
  shield:      { name: 'Pajzs',              desc: '+25 pajzs, ami előbb nyeli el a sebzést',  max: 8,  base: 900,  val: l => `${25 * l}` },
  shieldRegen: { name: 'Pajzs-regeneráció',  desc: 'Hamarabb indul és gyorsabban tölt',        max: 6,  base: 800,  val: l => `${Math.round(12 * (1 + .35 * l))}/mp · ${(4 - .35 * l).toFixed(1)} mp után` },
  crit:        { name: 'Kritikus esély',     desc: '+4% esély kritikus találatra',             max: 8,  base: 700,  val: l => `${5 + 4 * l}%` },
  critDmg:     { name: 'Kritikus sebzés',    desc: '+25% a kritikus szorzóhoz',                max: 8,  base: 700,  val: l => `+${(.25 * l).toFixed(2)} szorzó` },
  head:        { name: 'Fejlövés-sebzés',    desc: '+15% sebzés fejlövésnél',                  max: 8,  base: 650,  val: l => `+${15 * l}%` },
  stamina:     { name: 'Állóképesség',       desc: '+20 max állóképesség, gyorsabb töltődés',  max: 6,  base: 500,  val: l => `${100 + 20 * l}` },
  speed:       { name: 'Mozgási sebesség',   desc: '+4% futás- és sétasebesség',               max: 5,  base: 800,  val: l => `+${4 * l}%` },
  reload:      { name: 'Gyors kezek',        desc: '+6% újratöltési sebesség',                 max: 6,  base: 600,  val: l => `+${6 * l}%` },
  revive:      { name: 'Gyors felélesztés',  desc: '-15% idő, amíg felállítasz egy társat',   max: 4,  base: 1500, val: l => `${(10 * (1 - .15 * l)).toFixed(1)} mp` },
  swind:       { name: 'Újraéledés',          desc: 'Ha a földön ölsz: több életerővel állsz fel, +1 mp harcidő; 2. szinttől teli pajzzsal', max: 4, base: 1200, val: l => `${20 + 20 * l}% életerő${l >= 2 ? ' + pajzs' : ''}` },
  stash:       { name: 'Raktárbővítés',      desc: '+10 fegyver- és +10 páncélhely a raktárban', max: 6, base: 3000, val: l => `${40 + 10 * l} + ${40 + 10 * l} hely` },
  bag:         { name: 'Nagyobb táska',      desc: '+2 fegyverhely a táskában (legfeljebb 15)', max: 5,  base: 4000, val: l => `${5 + 2 * l} hely` },
  ammo:        { name: 'Lőszertáska',        desc: '+15% tartalék lőszer minden fegyverhez',   max: 5,  base: 700,  val: l => `+${15 * l}%` },
};
const U = k => (player.up && player.up[k]) || 0;
const upCost = k => Math.round(UPGRADES[k].base * 1.25 * Math.pow(1.38, U(k)) / 50) * 50;
// the base's price: steeper dollars; parts from a third of the way, fabric from halfway, both climbing hard to the last level
// (by progress, not level: a 4-level upgrade needs them too) — the last level of anything is ~150 parts and ~110 fabric
const upPrice = k => { const u = UPGRADES[k], l = U(k), f = u.max > 1 ? l / (u.max - 1) : 1, e = Math.pow(f, 2.5);
  return { cash: Math.round(u.base * 1.6 * Math.pow(1.5, l) / 50) * 50, parts: l >= 1 ? Math.round(15 + 235 * e) : 0, fab: l >= 2 ? Math.round(10 + 170 * e) : 0 }; }; // parts from the 2nd level, fabric from the 3rd
const canPay = c => profile.cash >= c.cash && (profile.parts || 0) >= c.parts && (profile.fabric || 0) >= c.fab;
// G(k): bonuses from worn gear (gear.js) · mkOf(w): the held gun's maker perk
const perk = k => !!(player.perks && player.perks[k]);
const maxHp = () => Math.round((100 + 20 * U('maxHp') + SK.hp() + G('hp')) * (perk('jug') ? 1.5 : 1) * (exoOn('glass') ? .75 : 1));
const maxShield = () => 25 * U('shield') + SK.shield() + G('armor');
const maxStam = () => 100 + 20 * U('stamina') + G('stam');
const wCrit = w => w && w.crit != null ? w.crit : .05, wCdmg = w => w && w.cdmg ? w.cdmg : 1.5;
const CRIT_CAP = .6; // crit chance stops here, whatever stacks on top
const critChance = () => Math.min(CRIT_CAP, wCrit(curW()) + .04 * U('crit') + SK.crit(curW()) + G('crit') + (mkOf(curW()).crit || 0) + (curW() && curW().anoint === 'ads' && player.ads > .6 ? .15 : 0));
const critMult = () => wCdmg(curW()) + .25 * U('critDmg') + SK.critDmg() + G('critDmg') + (mkOf(curW()).critDmg || 0);
const headBonus = () => 1 + .15 * U('head') + SK.head() + G('head') + (mkOf(curW()).head || 0);
const speedMul = () => 1 + .04 * U('speed') + SK.speed() + G('speed') + (perk('runner') ? .15 : 0) + (exoOn('league') ? .2 : 0);
const reloadMul = () => 1 + .06 * U('reload') + SK.reload() + G('reload') + (perk('speed') ? .3 : 0) + (exoOn('grip') ? .25 : 0) + (now < (player.howlUntil || 0) ? .3 : 0);
const resMax = w => Math.round(w.maxRes * (1 + .15 * U('ammo') + SK.ammo() + G('ammo')) * (dirOn('ammo') ? .5 : 1));

function updateVitals(dt) {
  const since = now - player.lastHurt;
  if (!dirOn('noregen') && since > 3.2 * (1 - .08 * U('regen')) - SK.regenDelay()) player.hp = Math.min(maxHp(), player.hp + 45 * (1 + .25 * U('regen')) * (SK.regen() + G('regen')) * dt);
  const ha = inHolyAura(); if (maxShield() > 0 && since > (4 - .35 * U('shieldRegen')) * (ha ? .5 : 1)) player.shield = Math.min(maxShield(), player.shield + 12 * (1 + .35 * U('shieldRegen')) * (ha ? 2 : 1) * dt); // the priest's circle doubles it
}

// ================= STATION MODAL =================
let stationKind = null;
function openStation(kind) {
  stationKind = kind; state = 'station'; mouseDown = rmb = false; stSel = null;
  if (document.pointerLockElement) document.exitPointerLock();
  renderStation(); $('station').hidden = false; $('hud').hidden = true;
}
// Esc cannot re-grab the mouse (browsers refuse pointer lock from Esc), so wait for the next click instead of pausing
function closeStation(viaEsc) {
  $('station').hidden = true; $('hud').hidden = false;
  if (state !== 'station') return;
  state = 'playing';
  if (noLock) return;
  if (viaEsc) { needClick = true; $('clickHint').hidden = false; } else lockPointer();
}
function srow(name, sub, right, act, disabled, btn) {
  return `<div class="srow"><div><b>${name}</b><small>${sub}</small></div><span class="sval${disabled && !/Kész|Tele/.test(btn) ? ' no' : ''}">${right}</span>
    <button class="sbtn" data-act="${act}"${disabled ? ' disabled' : ''}>${btn}</button></div>`;
}
const pips = (l, m) => `<span class="pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(m - l)}</span>`;
const FORGE = { // points in a job: dear, and each upgrade only once per gun per job
  level: w => 900 + 300 * w.level,
  elem: () => 6000,
};
const forgedOn = (w, k) => !!(mission && mission.forged && mission.forged.get(w) && mission.forged.get(w).has(k));
function markForged(w, k) { mission.forged = mission.forged || new WeakMap(); if (!mission.forged.get(w)) mission.forged.set(w, new Set()); mission.forged.get(w).add(k); }
const VEND = { med: 350, gren: 300, knife: 250, adren: 450 };
// ---------- the field smith: everything the base's smith does, for points, on what you carry ----------
let stSel = null;
const fpts = (c, x) => Math.max(50, Math.round(((c.parts || 0) * 80 + (c.fab || 0) * 90 + (c.cash || 0) * .5) * forgeMul(x) / 50) * 50); // parts, fabric and cash, turned into points
const forgeMul = x => x ? (1 + .45 * Math.min(5, x.unique ? 5 : x.q || 0)) * (1 + (x.level || 1) / 12) : 1; // the better and higher the piece, the dearer the field smith
function forgeItem() { // [slot, index, item] of the picked piece: a gun in hand or bag, or worn armour
  const P = player, G0 = profile.gear; let [sl, si] = (stSel || `L:${P.cur}`).split(':');
  const get = () => sl === 'L' ? P.slots[+si] : sl === 'B' ? P.bag[+si] : sl === 'W' ? G0[si] : null;
  if (!get()) { sl = 'L'; si = String(P.slots[P.cur] ? P.cur : P.slots.findIndex(Boolean)); }
  stSel = `${sl}:${si}`; return [sl, si, get()];
}
function fieldForge() {
  const P = player, pts = P.points, G0 = profile.gear, [sl, si, x] = forgeItem(), w = sl !== 'W' ? x : null, it = sl === 'W' ? x : null;
  const card = (t, sm, b, cls = '') => `<section class="fcard${cls ? ' ' + cls : ''}"><h4>${t}${sm ? `<small>${sm}</small>` : ''}</h4>${b}</section>`;
  const btn = (label, act, c, off) => `<button class="sbtn" data-act="${act}"${off || pts < c ? ' disabled' : ''}>${label} · ${c} pont</button>`;
  const opt = (rows, key, cost) => rows.map(([k, n, pr]) => `<div class="optrow"><span>${n}</span>${rbarP(pr)}<b>${Math.round(pr * 100)}%</b>${pr >= .999 ? '<button class="sbtn" disabled>Tökéletes</button>' : btn('+10%', `${key}:${k}`, cost(pr))}</div>`).join('');
  let bench = '<p class="note">Válassz egy fegyvert vagy páncélt.</p>';
  if (w) {
    const rows = OPT_STATS.map(([k, n]) => [k, n, rollOf(w, k)]).filter(r => r[2] != null), ex = w.exp || 0;
    bench = `<div class="fgrid">${card('Optimalizálás', '', opt(rows, 'fopt', pr => fpts(optCost(w, pr), w)))}
      <div class="fcol">${card('Kalibrálás', '', btn('Új dobás', 'frecal', fpts({ parts: HFORGE.recal(w) }, w)))}
        ${w.q >= 2 ? card('Felkenés', '', w.anoPend ? `<div class="anopend"><small>Új felkenés dobva</small><b>${anoName(w.anoPend)}: ${ANOINTS[w.anoPend]}</b><span>Most: ${w.anoint ? `${anoName(w.anoint)}: ${ANOINTS[w.anoint]}` : 'nincs'}</span><button class="sbtn" data-act="fano:acc">Elfogadom</button><button class="sbtn" data-act="fano:rej">Elutasítom</button></div>`
          : `<p class="amb">${w.anoint ? `${anoName(w.anoint)}: ${ANOINTS[w.anoint]}` : 'Nincs felkenése.'}</p>${btn('Újradobás', 'fano:roll', fpts({ parts: HFORGE.anoint(w) }, w))}`) : ''}
        ${card('Szakértelem', `${ex}/10 · most +${2 * ex}% sebzés`, `<div class="fexp">${expPips(ex)}</div>${ex >= 10 ? '<button class="sbtn" disabled>Szakértelem: max</button>' : btn(`Szakértelem ${ex + 1}/10`, 'fexp', fpts({ parts: expCost(w) }, w))}`)}
        ${card('Elem beégetése', w.element ? ELEMENTS[w.element].name : 'munkánként egyszer', w.element ? '<button class="sbtn" disabled>Van eleme</button>' : btn('Véletlen elem', 'forge:elem', Math.round(FORGE.elem() * forgeMul(w) / 50) * 50, forgedOn(w, 'elem')))}</div></div>`;
  } else if (it) {
    const ex = it.exp || 0;
    bench = `<div class="fgrid">${card('Optimalizálás', '', opt(gRolls(it), 'fgopt', pr => fpts(gOptCost(it, pr), it)))}
      <div class="fcol">${card('Szakértelem', `${ex}/10 · most +${3 * ex}% minden értékre`, `<div class="fexp">${expPips(ex)}</div>${ex >= 10 ? '<button class="sbtn" disabled>Szakértelem: max</button>' : btn(`Szakértelem ${ex + 1}/10`, 'fgexp', fpts({ parts: expCost(it) }, it))}`)}</div></div>`;
  }
  const left = `<h3>Kézben</h3><div class="tiles">${P.slots.map((q, k) => q ? wTile(`L:${k}`, q, { n: `${k + 1}` }) : '').join('')}</div>
    ${P.bag.length ? `<h3>Táska</h3><div class="tiles">${P.bag.map((q, k) => wTile(`B:${k}`, q, { sub: q.base.name })).join('')}</div>` : ''}
    <h3>Viselt páncél</h3><div class="tiles">${GEAR_KEYS.map(k => G0[k] ? gTile(`W:${k}`, G0[k]) : '').join('') || emptyTile('Nincs rajtad páncél', '')}</div>`;
  const sel = `<style>#stationBody .tile[data-act="sel:${stSel}"]{outline:2px solid var(--amb)}</style>`;
  return sel + invLayout(left, w ? weaponDetail(w, null, '') : it ? gearDetail(it, null, '') : noDetail(''), bench);
}
function forgeAct(kind, key, pay) { // true: handled (and re-rendered, or a dialog opened)
  const [sl, , x] = forgeItem(), w = sl !== 'W' ? x : null, it = sl === 'W' ? x : null; if (!x) return false;
  const done = () => { if (w) { trackBest(w); if (w === curW()) equipView(); renderSlots(); } else { const hpF = player.hp / maxHp(); gearChanged(); player.hp = Math.max(1, maxHp() * hpF); } SND.explode(); renderStation(); return true; };
  if (kind === 'fopt' && w) { const pr = rollOf(w, key); if (pr != null && pr < .999 && player.points >= fpts(optCost(w, pr), w) && optimize(w, key)) { pay(fpts(optCost(w, pr), w)); return done(); } }
  if (kind === 'frecal' && w && pay(fpts({ parts: HFORGE.recal(w) }, w))) { showRecal(w, null, 0, c => { if (c) { Object.assign(w, c); done(); } else renderStation(); }); return true; } // the same old/new table as at the base
  if (kind === 'fano' && w && w.q >= 2) {
    if (key === 'roll' && !w.anoPend && pay(fpts({ parts: HFORGE.anoint(w) }, w))) { w.anoPend = pick(Object.keys(ANOINTS).filter(k => k !== w.anoint)); w.anoN = (w.anoN || 0) + 1; return done(); }
    if ((key === 'acc' || key === 'rej') && w.anoPend) { if (key === 'acc') w.anoint = w.anoPend; delete w.anoPend; return done(); }
  }
  if (kind === 'fexp' && w && (w.exp || 0) < 10 && pay(fpts({ parts: expCost(w) }, w))) { w.exp = (w.exp || 0) + 1; return done(); }
  if (kind === 'fgopt' && it) { const r = gRolls(it).find(q => q[0] === key); if (r && r[2] < .999 && player.points >= fpts(gOptCost(it, r[2]), it) && gOptimize(it, key)) { pay(fpts(gOptCost(it, r[2]), it)); return done(); } }
  if (kind === 'fgexp' && it && (it.exp || 0) < 10 && pay(fpts({ parts: expCost(it) }, it))) { it.exp = (it.exp || 0) + 1; return done(); }
  if (kind === 'forge' && key === 'elem' && w && !w.element && !forgedOn(w, 'elem') && pay(Math.round(FORGE.elem() * forgeMul(w) / 50) * 50)) { w.element = pick(Object.keys(ELEMENTS)); markForged(w, 'elem'); return done(); }
  return false;
}
function renderStation() {
  const P = player, pts = P.points;
  let title, lede, body;
  if (stationKind === 'upgrade') {
    title = 'Fejlesztőállomás'; lede = 'A pontjaidat itt tartós fejlesztésekre költheted. A fejlesztések a futás végéig megmaradnak.';
    body = Object.entries(UPGRADES).map(([k, u]) => {
      const l = U(k), maxed = l >= u.max;
      return srow(`${u.name} ${pips(l, u.max)}`, `${u.desc} · most: ${u.val(l)}${maxed ? '' : ` → ${u.val(l + 1)}`}`,
        maxed ? 'MAX' : `${upCost(k)} pont`, `up:${k}`, maxed || pts < upCost(k), maxed ? 'Kész' : 'Fejlesztés');
    }).join('');
  } else if (stationKind === 'forge') {
    title = 'Kovácsműhely'; lede = ''; body = fieldForge();
  } else if (stationKind === 'desk') {
    const S = mission.range, chip = (act, on, txt) => `<button class="chip${on ? ' on' : ''}" data-act="${act}">${txt}</button>`;
    title = 'Lőtér-vezérlő'; lede = `Állítsd be a célbábukat: öt sáv, 10, 20, 30, 40 és 55 méteren. Pont annyi életerejük van, mint egy munkán a ${jobLvl()}. szinten, a ${S.wave}. hullámban. Minden változtatás után újra felállnak.`;
    body = `<div class="srow desk"><div><b>Rang</b><small>több életerő és színes csík</small></div><span>${ZTIERS.map((T, k) => chip(`desk:rank:${k}`, S.rank === k, T.name || 'Sima')).join('')}</span></div>
      <div class="srow desk"><div><b>Hullám</b><small>ennyi életereje lenne egy munkán, a te szinteden</small></div><span>${[1, 5, 10, 15, 20, 30].map(n => chip(`desk:wave:${n}`, S.wave === n, `${n}.`)).join('')}</span></div>
      <div class="srow desk"><div><b>Fajta</b><small>a páncélost fejre kell lőni</small></div><span>${RANGE_KINDS.map(k => chip(`desk:kind:${k}`, S.kind === k, KINDS[k].name)).join('')}</span></div>
      <div class="srow desk"><div><b>Tulajdonság</b><small>elit és nevesített bábun</small></div><span>${chip('desk:trait:', !S.trait, 'Nincs')}${RANGE_TRAITS.map(k => chip(`desk:trait:${k}`, S.trait === k, AFFIX[k].name)).join('')}</span></div>` +
      srow('Újraállítás', 'Mind az öt bábu teljes életerővel áll fel.', '', 'desk:reset:', false, 'Újraállít');
  } else {
    title = 'Szent kút'; lede = 'A kút vize gyógyít, ha a közelében állsz. A kútnál felszerelést is vehetsz.';
    body = Object.entries(VEND).map(([k, c]) => {
      const n = k === 'knife' ? 3 : 1, full = P.inv[k] >= itemMax(k);
      return srow(`${itemName(k)}${n > 1 ? ` ×${n}` : ''}`, `${itemDesc(k)} · nálad: ${P.inv[k]}/${itemMax(k)}`, `${c} pont`, `vend:${k}`, full || pts < c, full ? 'Tele' : 'Megveszem');
    }).join('') + (maxShield() ? srow('Pajzs feltöltése', `Most: ${Math.round(P.shield)}/${maxShield()}`, '200 pont', 'vend:shield', P.shield >= maxShield() || pts < 200, 'Feltöltés') : '');
  }
  $('stationBody').innerHTML = `<div class="shop-top"><div><div class="eyebrow">Állomás</div><div class="title st-title">${title}</div><p class="lede">${lede}</p></div>
    ${stationKind === 'desk' ? '' : `<div class="purse"><small>Pontjaid</small><strong>${pts}</strong></div>`}</div>${stationKind === 'forge' ? body : `<div class="slist">${body}</div>`}`;
  $('station').classList.toggle('wide', stationKind === 'forge');
}
$('stationBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [kind, key, val] = b.dataset.act.split(':'), P = player, w = curW();
  if (kind === 'desk') { const S = mission.range; if (key === 'rank') S.rank = +val; if (key === 'wave') S.wave = clamp(+val || 1, 1, 60); if (key === 'kind' && KINDS[val]) S.kind = val; if (key === 'trait') S.trait = val || null; resetDummies(mission); SND.buy(); return renderStation(); }
  const pay = c => { if (P.points < c) return false; P.points -= c; return true; };
  if (stationKind === 'forge') { if (kind === 'sel') { stSel = b.dataset.act.slice(4); return renderStation(); } if (!forgeAct(kind, key, pay)) SND.deny(); return; }
  if (kind === 'up') { if (U(key) < UPGRADES[key].max && pay(upCost(key))) { P.up[key] = U(key) + 1; if (key === 'maxHp') P.hp += 20; if (key === 'shield') P.shield += 25; } }
  else if (kind === 'forge') {
    if (key === 'elem' && !w.element && !forgedOn(w, 'elem') && pay(Math.round(FORGE.elem() * forgeMul(w) / 50) * 50)) { w.element = pick(Object.keys(ELEMENTS)); markForged(w, 'elem'); }
    trackBest(w); equipView(); renderSlots(); SND.explode();
  } else if (kind === 'vend') {
    if (key === 'shield') { if (pay(200)) P.shield = maxShield(); }
    else { const n = key === 'knife' ? 3 : 1; if (P.inv[key] < itemMax(key) && pay(VEND[key])) { P.inv[key] = Math.min(itemMax(key), P.inv[key] + n); renderInv(); } }
  }
  SND.buy(); renderStation();
});
$('stationClose').onclick = closeStation;

function levelUpWeapon(w, n) {
  ocStrip(w); w.dmg = Math.round(w.dmg * Math.pow(1.08, n));
  w.level += n; ocApply(w);
}
function rarityUp(w) {
  ocStrip(w);
  const q = w.q, f = (k, a) => (1 + (q + 1) * k * a) / (1 + q * k * a);
  w.dmg = Math.round(w.dmg * f(.14, 1));
  w.rpm = Math.round(w.rpm * f(.04, 1));
  if (!w.base.fixedMag) w.mag = Math.round(w.mag * f(.08, 1));
  w.reload = +(w.reload * f(.05, -1)).toFixed(2);
  w.spread *= f(.06, -1);
  w.maxRes = Math.round(w.base.res * (1 + (q + 1) * .1));
  w.q = q + 1;
  if (w.q === 4) { const L = pick(LEGENDS); w.name = L[0]; w.flavor = L[1]; if (!w.element) w.element = pick(Object.keys(ELEMENTS)); }
  else if (q === 0) w.name = 'Forged ' + w.name;
  if (w.q >= 2 && !w.tal && !w.unique) w.tal = pick(TAL_KEYS);
  ocApply(w);
}
