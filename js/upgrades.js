// ================= UPGRADES =================
// lv: current level -> cost of the next one
const UPGRADES = {
  maxHp:       { name: 'Max életerő',        desc: '+20 max életerő',                          max: 10, base: 600,  val: l => `${100 + 20 * l}` },
  regen:       { name: 'Életerő-regeneráció', desc: 'Gyorsabban és hamarabb tölt vissza',      max: 8,  base: 700,  val: l => `${Math.round(45 * (1 + .25 * l))}/mp · ${(3.2 * (1 - .08 * l)).toFixed(1)} mp után` },
  shield:      { name: 'Pajzs',              desc: '+25 pajzs, ami előbb nyeli el a sebzést',  max: 8,  base: 900,  val: l => `${25 * l}` },
  shieldRegen: { name: 'Pajzs-regeneráció',  desc: 'Hamarabb indul és gyorsabban tölt',        max: 6,  base: 800,  val: l => `${Math.round(12 * (1 + .35 * l))}/mp · ${(4 - .35 * l).toFixed(1)} mp után` },
  crit:        { name: 'Kritikus esély',     desc: '+4% esély kritikus találatra',             max: 8,  base: 700,  val: l => `${5 + 4 * l}%` },
  critDmg:     { name: 'Kritikus sebzés',    desc: '+25% a kritikus szorzóhoz',                max: 8,  base: 700,  val: l => `×${(1.5 + .25 * l).toFixed(2)}` },
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
// G(k): bonuses from worn gear (gear.js) · mkOf(w): the held gun's maker perk
const perk = k => !!(player.perks && player.perks[k]);
const maxHp = () => Math.round((100 + 20 * U('maxHp') + SK.hp() + G('hp')) * (perk('jug') ? 1.5 : 1) * (exoOn('glass') ? .75 : 1));
const maxShield = () => 25 * U('shield') + SK.shield() + G('armor');
const maxStam = () => 100 + 20 * U('stamina') + G('stam');
const critChance = () => Math.min(.75, .05 + .04 * U('crit') + SK.crit(curW()) + G('crit') + (mkOf(curW()).crit || 0) + (curW() && curW().anoint === 'ads' && player.ads > .6 ? .15 : 0));
const critMult = () => 1.5 + .25 * U('critDmg') + SK.critDmg() + G('critDmg') + (mkOf(curW()).critDmg || 0);
const headBonus = () => 1 + .15 * U('head') + SK.head() + G('head') + (mkOf(curW()).head || 0);
const speedMul = () => 1 + .04 * U('speed') + SK.speed() + G('speed') + (perk('runner') ? .15 : 0) + (exoOn('league') ? .2 : 0);
const reloadMul = () => 1 + .06 * U('reload') + SK.reload() + G('reload') + (perk('speed') ? .3 : 0);
const resMax = w => Math.round(w.maxRes * (1 + .15 * U('ammo') + SK.ammo() + G('ammo')));

function updateVitals(dt) {
  const since = now - player.lastHurt;
  if (since > 3.2 * (1 - .08 * U('regen')) - SK.regenDelay()) player.hp = Math.min(maxHp(), player.hp + 45 * (1 + .25 * U('regen')) * (SK.regen() + G('regen')) * dt);
  if (maxShield() > 0 && since > 4 - .35 * U('shieldRegen')) player.shield = Math.min(maxShield(), player.shield + 12 * (1 + .35 * U('shieldRegen')) * dt);
}

// ================= STATION MODAL =================
let stationKind = null;
function openStation(kind) {
  stationKind = kind; state = 'station'; mouseDown = rmb = false;
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
const FORGE = {
  level: w => 300 + 120 * w.level,
  rarity: w => [1500, 3500, 8000, 20000][w.q],
  elem: () => 2500,
};
const VEND = { med: 350, gren: 300, knife: 250, adren: 450 };
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
    const w = curW();
    title = 'Kovácsműhely'; lede = `A kézben lévő fegyveren dolgozik: <b style="color:${rarColor(w)}">${w.name}</b> · Lv ${w.level} · ${RARITIES[w.q].name}`;
    body = srow('Szintemelés (+2 szint)', `A sebzés a szinttel együtt nő. Lv ${w.level} → ${w.level + 2}`, `${FORGE.level(w)} pont`, 'forge:level', pts < FORGE.level(w), 'Kovácsolás') +
      (w.q < 4 ? srow('Ritkaság-emelés', `${RARITIES[w.q].name} → ${RARITIES[w.q + 1].name}. Minden stat javul.`, `${FORGE.rarity(w)} pont`, 'forge:rarity', pts < FORGE.rarity(w), 'Kovácsolás')
        : srow('Ritkaság-emelés', 'Ez már legendás.', '—', 'none', true, 'Kész')) +
      (w.element ? srow('Elem beégetése', `Már van eleme: ${ELEMENTS[w.element].name}.`, '—', 'none', true, 'Kész')
        : srow('Elem beégetése', 'Véletlen elem: tűz, villám vagy fagy.', `${FORGE.elem()} pont`, 'forge:elem', pts < FORGE.elem(), 'Kovácsolás')) +
      `<div class="wcard" style="--rc:${rarColor(w)};margin-top:18px;max-width:320px">${cardHTML(w, '', null)}</div>`;
  } else {
    title = 'Szent kút'; lede = 'A kút vize gyógyít, ha a közelében állsz. A kútnál felszerelést is vehetsz.';
    body = Object.entries(VEND).map(([k, c]) => {
      const n = k === 'knife' ? 3 : 1, full = P.inv[k] >= itemMax(k);
      return srow(`${ITEMS[k].name}${n > 1 ? ` ×${n}` : ''}`, `${ITEMS[k].desc} · nálad: ${P.inv[k]}/${itemMax(k)}`, `${c} pont`, `vend:${k}`, full || pts < c, full ? 'Tele' : 'Megveszem');
    }).join('') + (maxShield() ? srow('Pajzs feltöltése', `Most: ${Math.round(P.shield)}/${maxShield()}`, '200 pont', 'vend:shield', P.shield >= maxShield() || pts < 200, 'Feltöltés') : '');
  }
  $('stationBody').innerHTML = `<div class="shop-top"><div><div class="eyebrow">Állomás</div><div class="title st-title">${title}</div><p class="lede">${lede}</p></div>
    <div class="purse"><small>Pontjaid</small><strong>${pts}</strong></div></div><div class="slist">${body}</div>`;
}
$('stationBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [kind, key] = b.dataset.act.split(':'), P = player, w = curW();
  const pay = c => { if (P.points < c) return false; P.points -= c; return true; };
  if (kind === 'up') { if (U(key) < UPGRADES[key].max && pay(upCost(key))) { P.up[key] = U(key) + 1; if (key === 'maxHp') P.hp += 20; if (key === 'shield') P.shield += 25; } }
  else if (kind === 'forge') {
    if (key === 'level' && pay(FORGE.level(w))) levelUpWeapon(w, 2);
    if (key === 'rarity' && w.q < 4 && pay(FORGE.rarity(w))) rarityUp(w);
    if (key === 'elem' && !w.element && pay(FORGE.elem())) w.element = pick(Object.keys(ELEMENTS));
    trackBest(w); equipView(); renderSlots(); SND.explode();
  } else if (kind === 'vend') {
    if (key === 'shield') { if (pay(200)) P.shield = maxShield(); }
    else { const n = key === 'knife' ? 3 : 1; if (P.inv[key] < itemMax(key) && pay(VEND[key])) { P.inv[key] = Math.min(itemMax(key), P.inv[key] + n); renderInv(); } }
  }
  SND.buy(); renderStation();
});
$('stationClose').onclick = closeStation;

function levelUpWeapon(w, n) {
  w.dmg = Math.round(w.dmg * Math.pow(1.08, n));
  w.level += n;
}
function rarityUp(w) {
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
}
