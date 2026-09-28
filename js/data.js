'use strict';
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
// names typed by other players are shown as text, never as HTML
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]).slice(0, 40);
const smooth = t => t * t * (3 - 2 * t);
// small seeded PRNG so a saved map seed rebuilds the same layout
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const B = 38; // arena half-size
const GAME_VER = (() => { const s = document.querySelector('script[src*="js/data.js"]'), m = s && s.src.match(/v=(\d+)/); return m ? 'v' + m[1] : 'dev'; })(); // the build shown in the hub and the pause menu

// ================= DATA =================
const RARITIES = [
  { name: 'Közönséges',     color: '#d4d4d4', w: 60, elem: 0 },
  { name: 'Nem mindennapi', color: '#45d35b', w: 26, elem: .12 },
  { name: 'Ritka',          color: '#3a8dff', w: 10, elem: .35 },
  { name: 'Epikus',         color: '#b05cff', w: 3.5, elem: .6 },
  { name: 'Legendás',       color: '#ff8c1a', w: .5, elem: 1 },
  { name: 'Egzotikus',         color: '#ff3b3b', w: .06, elem: 1 }, // one-of-a-kind guns with their own trick (UNIQUES)
];
const KINETIC = { name: 'Kinetikus', color: '#c8c0a8', desc: 'Nincs eleme: +8% alapsebzés' }; // the plain gun's own small edge
const ELEMENTS = {
  fire:  { name: 'Tűz',   word: 'Hellfire',  color: '#ff6a2a', hex: 0xff6a2a, desc: 'Felgyújtja a célt (3 mp)' },
  shock: { name: 'Villám', word: 'Storm',    color: '#7d8dff', hex: 0x7d8dff, desc: 'Átugrik egy közeli zombira' },
  cryo:  { name: 'Fagy',  word: 'Frostbite', color: '#8ff0ff', hex: 0x8ff0ff, desc: 'Lelassítja a célt (2,5 mp)' },
  corrosive: { name: 'Maró', word: 'Caustic', color: '#9dff3a', hex: 0x9dff3a, desc: 'Sav marja 4 mp-ig, és a páncélt kétszer olyan gyorsan töri' },
  leech: { name: 'Életszívó', word: 'Leeching', color: '#ff4a7a', hex: 0xff4a7a, desc: 'A sebzés 3%-a életerőként visszajön, legfeljebb másodpercenként a max életerőd 4%-a' },
  slag:  { name: 'Salak', word: 'Slagged',   color: '#c86aff', hex: 0xc86aff, desc: 'Megjelöli a célt: 5 mp-ig +40% sebzést kap minden más forrásból' },
};
// weapon categories (skills and makers both key off these)
const CAT = { carbine: 'rifle', sawed: 'shotgun', plasma: 'energy', ar: 'rifle', burst: 'rifle', lmg: 'heavy', minigun: 'heavy', dmr: 'marks', sniper: 'marks', crossbow: 'marks', lever: 'marks',
  smg: 'smg', mpistol: 'smg', pistol: 'pistol', deagle: 'pistol', revolver: 'pistol', shotgun: 'shotgun', autoshot: 'shotgun', dbarrel: 'shotgun',
  launcher: 'explosive', raygun: 'energy', tesla: 'energy', flamer: 'energy',
  autopistol: 'pistol', magnum: 'pistol', pdw: 'smg', blitz: 'smg', bullpup: 'rifle', heavyar: 'rifle', scout: 'marks', antimat: 'marks', hmg: 'heavy', squad: 'heavy',
  slug: 'shotgun', drumshot: 'shotgun', laser: 'energy', arc: 'energy', rocket: 'explosive' };
// makers: every gun a maker builds carries its signature perk; one base can come from several makers.
// rpm/mag/reload/res/acc are baked into the rolled stats, dmg/head/crit/critDmg apply live when the gun hits
const MAKERS = {
  xfcv:       { name: 'XFCV Tactical',     perk: '+10% fejlövés-sebzés',       head: .1,    cats: ['rifle', 'marks', 'pistol', 'smg'] },
  kessler:    { name: 'Kessler Arms',      perk: '+8% sebzés',                 dmg: .08,    cats: ['rifle', 'heavy', 'pistol', 'shotgun', 'explosive'] },
  voss:       { name: 'Voss & Sons',       perk: '+10% tűzgyorsaság',          rpm: .1,     cats: ['smg', 'rifle', 'heavy', 'shotgun', 'energy'] },
  harrow:     { name: 'Harrow Ordnance',   perk: '+5% kritikus esély',         crit: .05,   cats: ['marks', 'rifle', 'pistol', 'explosive'] },
  ironmark:   { name: 'Ironmark',          perk: '+25% tárkapacitás',          mag: .25,    cats: ['heavy', 'smg', 'rifle', 'shotgun', 'energy'] },
  novak:      { name: 'Novak Works',       perk: '+15% gyorsabb újratöltés',   reload: .15, cats: ['pistol', 'smg', 'shotgun', 'marks', 'explosive'] },
  crane:      { name: 'Crane & Rook',      perk: '+20% kritikus sebzés',       critDmg: .2, cats: ['marks', 'pistol', 'rifle', 'shotgun'] },
  bellwether: { name: 'Bellwether',        perk: '+30% tartalék lőszer',       res: .3,     cats: ['heavy', 'shotgun', 'smg', 'energy', 'explosive'] },
  ostrava:    { name: 'Ostrava Precision', perk: '+20% pontosság',             acc: .2,     cats: ['rifle', 'marks', 'smg', 'energy', 'pistol'] },
};
const CAT_NAMES = { rifle: 'gépkarabély', heavy: 'nehézfegyver', marks: 'mesterlövész', smg: 'géppisztoly', pistol: 'pisztoly', shotgun: 'sörétes', explosive: 'robbanó', energy: 'energia' };
const makersFor = b => Object.keys(MAKERS).filter(k => MAKERS[k].cats.includes(CAT[b.id]) && !(b.fixedMag && MAKERS[k].mag));
const mkOf = w => (w && MAKERS[w.mk]) || {};
const PREFIX = {
  dmg: ['Vicious', 'Brutal', 'Savage'], rate: ['Rapid', 'Frantic', 'Hasty'], mag: ['Extended', 'Hungry', 'Deep'],
  reload: ['Swift', 'Nimble', 'Slick'], acc: ['Steady', 'True', 'Precise'],
};
const LEGENDS = [
  ['Gravedigger', 'A hat láb csak javaslat.'], ['Harvest Moon', 'Learatod, amit vetettek.'],
  ['Last Rites', 'Gyorsan mondva. Sokszor mondva.'], ['Widowmaker', 'Ma éjjel senki nem megy haza.'],
  ['Bonesaw', 'Tiszta vágás, piszkos munka.'], ['Requiem', 'Minden dalnak vége van.'],
  ["Dead Man's Hand", 'Ászok és nyolcasok, egész éjjel.'], ['Carrion Call', 'A varjak hálásak.'],
];
// model: len/h receiver, barrel length/radius, mag height, stock length + flags
// rl: reload animation style (mag · box · cell · revolver · shell · break) · single: loads one round at a time, reload = seconds per round
const BASES = [
  { id: 'pistol', name: 'Pistol', dmg: 30, rpm: 380, mag: 12, res: 96, reload: 1.3, spread: 1.4, mode: 'semi', range: 80, zoom: 1.3, snd: 'light', kick: .012, rl: 'mag',
    model: { len: .2, h: .09, barrel: .06, br: .016, mag: .1 } },
  { id: 'deagle', name: 'Hand Cannon', dmg: 120, rpm: 170, mag: 7, res: 56, reload: 1.8, spread: 1.1, mode: 'semi', range: 90, zoom: 1.35, snd: 'heavy', kick: .04, headMult: 2.5, rl: 'mag',
    model: { len: .25, h: .12, barrel: .1, br: .024, mag: .12 } },
  { id: 'mpistol', name: 'Machine Pistol', dmg: 18, rpm: 950, mag: 22, res: 176, reload: 1.5, spread: 3, mode: 'auto', range: 60, zoom: 1.3, snd: 'light', kick: .006, rl: 'mag',
    model: { len: .24, h: .1, barrel: .07, br: .015, mag: .2 } },
  { id: 'revolver', name: 'Revolver', dmg: 95, rpm: 150, mag: 6, res: 42, reload: 2.1, spread: .9, mode: 'semi', range: 90, zoom: 1.35, snd: 'heavy', kick: .03, headMult: 2.5, rl: 'revolver',
    model: { len: .18, h: .11, barrel: .17, br: .022, drum: true } },
  { id: 'smg', name: 'SMG', dmg: 22, rpm: 850, mag: 32, res: 256, reload: 1.9, spread: 2.5, mode: 'auto', range: 70, zoom: 1.4, snd: 'light', kick: .006, rl: 'mag',
    model: { len: .34, h: .11, barrel: .12, br: .018, mag: .22, stock: .16 } },
  { id: 'ar', name: 'Assault Rifle', dmg: 36, rpm: 620, mag: 30, res: 240, reload: 2.3, spread: 1.7, mode: 'auto', range: 110, zoom: 1.5, snd: 'mid', kick: .009, rl: 'mag',
    model: { len: .46, h: .12, barrel: .24, br: .02, mag: .2, stock: .24, sight: true } },
  { id: 'burst', name: 'Burst Rifle', dmg: 44, rpm: 900, burst: 3, burstDelay: .3, mag: 24, res: 192, reload: 2.2, spread: 1.2, mode: 'burst', range: 110, zoom: 1.6, snd: 'mid', kick: .008, rl: 'mag',
    model: { len: .44, h: .13, barrel: .2, br: .02, mag: .17, stock: .22, sight: true } },
  { id: 'carbine', name: 'Battle Rifle', dmg: 58, rpm: 400, mag: 20, res: 160, reload: 2.4, spread: .9, mode: 'semi', range: 130, zoom: 1.6, snd: 'mid', kick: .016, pierce: 1, rl: 'mag',
    model: { len: .5, h: .12, barrel: .3, br: .021, mag: .16, stock: .25, sight: true } },
  { id: 'lever', name: 'Lever Rifle', dmg: 100, rpm: 120, mag: 8, res: 64, reload: .5, single: true, spread: .7, mode: 'semi', range: 130, zoom: 1.7, snd: 'heavy', kick: .03, pierce: 2, rl: 'shell',
    model: { len: .34, h: .1, barrel: .42, br: .019, stock: .27, lever: true } },
  { id: 'lmg', name: 'LMG', dmg: 34, rpm: 720, mag: 100, res: 300, reload: 4.6, spread: 3.1, mode: 'auto', range: 100, zoom: 1.4, snd: 'mid', kick: .008, rl: 'box',
    model: { len: .56, h: .15, barrel: .32, br: .026, box: true, stock: .24 } },
  { id: 'minigun', name: 'Minigun', dmg: 24, rpm: 1300, mag: 200, res: 600, reload: 5.2, spread: 3.4, mode: 'auto', range: 90, zoom: 1.15, snd: 'light', kick: .004, spin: true, rl: 'box',
    model: { len: .46, h: .16, barrel: .4, br: .05, box: true, multi: true } },
  { id: 'shotgun', name: 'Pump Shotgun', dmg: 28, pellets: 8, rpm: 75, mag: 6, res: 48, reload: .5, single: true, spread: 5, mode: 'semi', range: 36, zoom: 1.25, snd: 'boom', kick: .05, rl: 'shell',
    model: { len: .44, h: .12, barrel: .38, br: .028, stock: .24, pump: true } },
  { id: 'autoshot', name: 'Auto Shotgun', dmg: 16, pellets: 8, rpm: 260, mag: 10, res: 60, reload: 2.5, spread: 5.5, mode: 'auto', range: 30, zoom: 1.2, snd: 'boom', kick: .035, rl: 'mag',
    model: { len: .46, h: .13, barrel: .3, br: .03, mag: .14, stock: .2 } },
  { id: 'dbarrel', name: 'Double Barrel', dmg: 26, pellets: 10, rpm: 260, mag: 2, fixedMag: true, res: 40, reload: 2, spread: 7, mode: 'semi', range: 28, zoom: 1.2, snd: 'boom', kick: .06, rl: 'break',
    model: { len: .3, h: .1, barrel: .42, br: .024, double: true, stock: .28 } },
  { id: 'sawed', name: 'Sawed-off', dmg: 24, pellets: 9, rpm: 240, mag: 2, fixedMag: true, res: 36, reload: 1.6, spread: 8.5, mode: 'semi', range: 18, zoom: 1.15, snd: 'boom', kick: .07, rl: 'break',
    model: { len: .2, h: .1, barrel: .16, br: .024, double: true } },
  { id: 'flamer', name: 'Flamethrower', dmg: 9, pellets: 3, rpm: 900, mag: 60, res: 120, reload: 3.2, spread: 7, mode: 'auto', range: 18, zoom: 1.15, snd: 'flame', kick: .002, flame: true, pierce: 3, rl: 'box',
    model: { len: .5, h: .13, barrel: .3, br: .035, tank: true, stock: .18 } },
  { id: 'dmr', name: 'Marksman Rifle', dmg: 95, rpm: 260, mag: 10, res: 80, reload: 2.5, spread: 1, adsSpread: .05, mode: 'semi', range: 150, zoom: 2.3, snd: 'heavy', kick: .022, pierce: 2, scopeView: true, rl: 'mag',
    model: { len: .52, h: .12, barrel: .3, br: .02, mag: .12, stock: .26, scope: true } },
  { id: 'sniper', name: 'Sniper Rifle', dmg: 260, rpm: 48, mag: 5, res: 35, reload: 3.2, spread: 5, adsSpread: 0, mode: 'semi', range: 220, zoom: 4, snd: 'heavy', kick: .05, pierce: 4, headMult: 3, scopeView: true, rl: 'mag',
    model: { len: .56, h: .12, barrel: .46, br: .022, mag: .1, stock: .3, scope: true } },
  { id: 'crossbow', name: 'Crossbow', dmg: 200, rpm: 55, mag: 1, fixedMag: true, res: 30, reload: 0.9, spread: .6, adsSpread: .05, mode: 'semi', range: 120, zoom: 1.8, snd: 'bow', kick: .02, pierce: 3, headMult: 3, rl: 'bow', tracer: 0xc9b89a,
    model: { len: .34, h: .08, barrel: .12, br: .014, stock: .26, bow: true } },
  { id: 'launcher', name: 'Grenade Launcher', dmg: 220, rpm: 70, mag: 4, res: 24, reload: .6, single: true, spread: 1, mode: 'semi', range: 60, zoom: 1.3, snd: 'thump', kick: .05, lob: true, splash: 4.5, rl: 'shell',
    model: { len: .34, h: .12, barrel: .24, br: .045, drum: true, stock: .2 } },
  { id: 'raygun', name: 'Ray Gun', dmg: 110, rpm: 230, mag: 20, res: 100, reload: 2.9, spread: 1.2, mode: 'semi', range: 120, zoom: 1.35, snd: 'ray', kick: .018, splash: 2.2, energy: true, rl: 'cell',
    model: { len: .22, h: .13, barrel: .14, br: .03 } },
  { id: 'plasma', name: 'Plasma Carbine', dmg: 35, rpm: 520, mag: 40, res: 200, reload: 2.4, spread: 1.6, mode: 'auto', range: 90, zoom: 1.4, snd: 'ray', kick: .007, splash: 1.3, energy: true, rl: 'cell', tracer: 0xff6aff,
    model: { len: .36, h: .13, barrel: .16, br: .028, coil: true, stock: .2 } },
  { id: 'tesla', name: 'Tesla Gun', dmg: 58, rpm: 300, mag: 30, res: 150, reload: 2.6, spread: .8, mode: 'auto', range: 45, zoom: 1.3, snd: 'zap', kick: .006, chain: 3, energy: true, rl: 'cell', tracer: 0x7fd8ff,
    model: { len: .3, h: .13, barrel: .16, br: .03, coil: true } },
  // two more per category, one more explosive
  { id: 'autopistol', name: 'Auto Pistol', dmg: 22, rpm: 700, mag: 18, res: 144, reload: 1.4, spread: 2.2, mode: 'auto', range: 70, zoom: 1.3, snd: 'light', kick: .008, rl: 'mag',
    model: { len: .21, h: .1, barrel: .07, br: .016, mag: .14 } },
  { id: 'magnum', name: 'Magnum', dmg: 150, rpm: 110, mag: 5, res: 40, reload: 2.4, spread: .8, mode: 'semi', range: 100, zoom: 1.4, snd: 'heavy', kick: .05, headMult: 2.6, rl: 'revolver',
    model: { len: .2, h: .12, barrel: .22, br: .026, drum: true } },
  { id: 'pdw', name: 'PDW', dmg: 26, rpm: 780, mag: 40, res: 280, reload: 2.1, spread: 2, mode: 'auto', range: 80, zoom: 1.4, snd: 'light', kick: .006, rl: 'mag',
    model: { len: .36, h: .12, barrel: .1, br: .018, mag: .16, stock: .18, sight: true } },
  { id: 'blitz', name: 'Blitz SMG', dmg: 17, rpm: 1150, mag: 25, res: 250, reload: 1.7, spread: 2.8, mode: 'auto', range: 55, zoom: 1.3, snd: 'light', kick: .005, rl: 'mag',
    model: { len: .3, h: .13, barrel: .08, br: .018, mag: .24, stock: .14 } },
  { id: 'bullpup', name: 'Bullpup Rifle', dmg: 40, rpm: 700, mag: 30, res: 240, reload: 2.6, spread: 1.4, mode: 'auto', range: 110, zoom: 1.5, snd: 'mid', kick: .009, rl: 'mag',
    model: { len: .4, h: .13, barrel: .2, br: .02, mag: .18, sight: true } },
  { id: 'heavyar', name: 'Heavy Rifle', dmg: 48, rpm: 540, mag: 25, res: 200, reload: 2.5, spread: 1.5, mode: 'auto', range: 120, zoom: 1.5, snd: 'mid', kick: .012, rl: 'mag',
    model: { len: .5, h: .13, barrel: .28, br: .023, mag: .18, stock: .25, sight: true } },
  { id: 'scout', name: 'Scout Rifle', dmg: 140, rpm: 150, mag: 8, res: 64, reload: 2.6, spread: 2, adsSpread: .03, mode: 'semi', range: 180, zoom: 2.8, snd: 'heavy', kick: .03, pierce: 2, headMult: 2.6, scopeView: true, rl: 'mag',
    model: { len: .5, h: .11, barrel: .36, br: .019, mag: .1, stock: .27, scope: true } },
  { id: 'antimat', name: 'Anti-Materiel Rifle', dmg: 420, rpm: 35, mag: 4, res: 24, reload: 3.8, spread: 6, adsSpread: 0, mode: 'semi', range: 250, zoom: 4.5, snd: 'heavy', kick: .07, pierce: 6, headMult: 3, scopeView: true, rl: 'mag',
    model: { len: .64, h: .14, barrel: .56, br: .03, mag: .12, stock: .3, scope: true } },
  { id: 'hmg', name: 'Heavy Machine Gun', dmg: 46, rpm: 520, mag: 80, res: 240, reload: 5, spread: 2.6, mode: 'auto', range: 110, zoom: 1.35, snd: 'mid', kick: .012, rl: 'box',
    model: { len: .6, h: .16, barrel: .36, br: .03, box: true, stock: .26 } },
  { id: 'squad', name: 'Squad Autorifle', dmg: 30, rpm: 800, mag: 75, res: 300, reload: 3.8, spread: 2.6, mode: 'auto', range: 100, zoom: 1.4, snd: 'light', kick: .007, rl: 'box',
    model: { len: .5, h: .14, barrel: .28, br: .024, box: true, stock: .22 } },
  { id: 'slug', name: 'Slug Shotgun', dmg: 160, rpm: 90, mag: 5, res: 40, reload: .55, single: true, spread: 1, mode: 'semi', range: 70, zoom: 1.35, snd: 'boom', kick: .05, pierce: 1, rl: 'shell',
    model: { len: .46, h: .12, barrel: .4, br: .028, stock: .24, pump: true } },
  { id: 'drumshot', name: 'Drum Shotgun', dmg: 11, pellets: 8, rpm: 300, mag: 20, res: 80, reload: 3.6, spread: 6, mode: 'auto', range: 26, zoom: 1.2, snd: 'boom', kick: .03, rl: 'mag',
    model: { len: .44, h: .13, barrel: .26, br: .03, drum: true, stock: .2 } },
  { id: 'laser', name: 'Laser Rifle', dmg: 30, rpm: 600, mag: 50, res: 250, reload: 2.6, spread: .6, mode: 'auto', range: 130, zoom: 1.5, snd: 'ray', kick: .003, pierce: 1, energy: true, rl: 'cell', tracer: 0xff3a3a,
    model: { len: .44, h: .12, barrel: .22, br: .02, coil: true, stock: .22, sight: true } },
  { id: 'arc', name: 'Arc Pistol', dmg: 40, rpm: 360, mag: 24, res: 120, reload: 2, spread: 1, mode: 'auto', range: 35, zoom: 1.3, snd: 'zap', kick: .006, chain: 2, energy: true, rl: 'cell', tracer: 0x7fd8ff,
    model: { len: .2, h: .12, barrel: .1, br: .026, coil: true } },
  { id: 'rocket', name: 'Rocket Launcher', dmg: 480, rpm: 40, mag: 1, fixedMag: true, res: 12, reload: 2.8, spread: .5, mode: 'semi', range: 120, zoom: 1.4, snd: 'thump', kick: .07, splash: 6, rl: 'mag',
    model: { len: .6, h: .14, barrel: .5, br: .06, stock: .1 } },
];

function rollRarity(luck = 0) {
  const ws = RARITIES.map((r, i) => r.w * Math.pow(1 + luck, i));
  let x = Math.random() * ws.reduce((a, b) => a + b);
  for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; }
  return 0;
}

// every gun rolls its own crit chance and crit multiplier from its type's range; gear, skills and upgrades add on top
const CRIT_RANGE = { marks: [.08, .14, 1.7, 2.0], pistol: [.06, .11, 1.5, 1.8], rifle: [.04, .09, 1.4, 1.7], smg: [.03, .07, 1.3, 1.6], shotgun: [.02, .05, 1.3, 1.5],
  heavy: [.02, .06, 1.3, 1.5], energy: [.04, .08, 1.4, 1.6], explosive: [.01, .03, 1.3, 1.4] };
const critRange = w => CRIT_RANGE[CAT[w.base.id]] || [.04, .08, 1.4, 1.6];
function rollCrit(w) { const R = critRange(w); w.crit = +(rand(R[0], R[1]) + Math.min(4, w.q) * .004).toFixed(3); w.cdmg = +rand(R[2], R[3]).toFixed(2); }
// weapon talents (The Division): one per rare-or-better gun, fixed for good; uniques have their own trick instead
const TALENTS = {
  optimist: { name: 'Optimista',   desc: 'Minél üresebb a tár, annál nagyobb a sebzés: az utolsó lövésnél +30%.' },
  frenzy:   { name: 'Vérszomj',    desc: 'Ölés után 5 mp-ig +20% sebzés.' },
  feast:    { name: 'Lakoma',      desc: 'A fejlövéses ölés 4% életerőt ad vissza.' },
  bread:    { name: 'Kenyérkosár', desc: 'Testlövés után a következő fejlövés +40% sebzést okoz.' },
  close:    { name: 'Közelharc',   desc: '10 méteren belül +25% sebzés.' },
  ranger:   { name: 'Távcső',      desc: '25 méteren túl +25% sebzés.' },
  scav:     { name: 'Guberáló',    desc: 'Minden ölés a tár 15%-át visszatölti a tartalékból (újratöltés nélkül).' },
  frost:    { name: 'Dermesztő',   desc: 'Minden 5. találat 2 mp-re lelassítja a zombit.' },
};
const TAL_KEYS = Object.keys(TALENTS);
function talentFor(w) { let h = 0; for (const ch of w.base.id + w.mk + w.name) h = (h * 31 + ch.charCodeAt(0)) | 0; return TAL_KEYS[Math.abs(h) % TAL_KEYS.length]; } // older guns: a fixed pick, the same every load
function makeWeapon(base, q, level, mk) {
  if (q >= 5) return makeUnique(null, level);
  mk = mk || pick(makersFor(base));
  const M = MAKERS[mk], r = {};
  for (const k of ['dmg', 'rate', 'mag', 'reload', 'acc']) r[k] = rand(-1, 1);
  const lv = Math.pow(1.08, level - 1); // ×1.08 per level, the same as zombie health: endless, but always even
  const w = {
    base, q, level, mk, maker: M.name, sv: 2,
    dmg: Math.round(base.dmg * lv * (1 + q * .14) * (1 + r.dmg * .15)),
    pellets: base.pellets || 1,
    rpm: Math.round(base.rpm * (1 + q * .04) * (1 + r.rate * .12) * (1 + (M.rpm || 0))),
    mag: base.fixedMag ? base.mag : Math.max(2, Math.round(base.mag * (1 + q * .08) * (1 + r.mag * .2) * (1 + (M.mag || 0)))),
    reload: +(base.reload * (1 - q * .05) * (1 - r.reload * .15) * (1 - (M.reload || 0))).toFixed(2),
    spread: base.spread * (1 - q * .06) * (1 - r.acc * .22) * (1 - (M.acc || 0)),
    element: base.flame ? 'fire' : base.chain ? null : Math.random() < RARITIES[q].elem ? pick(Object.keys(ELEMENTS)) : null,
  };
  w.maxRes = Math.round(base.res * (1 + q * .1) * (1 + (M.res || 0)));
  w.ammo = w.mag; w.reserve = w.maxRes;
  w.roll = Math.round(Object.values(r).reduce((a, v) => a + (v + 1) / 2, 0) / 5 * 100); // roll quality: 100% is a perfect gun
  const top = Object.keys(r).reduce((a, b) => r[a] > r[b] ? a : b);
  if (q === 4) { const L = pick(LEGENDS); w.name = L[0]; w.flavor = L[1]; }
  else w.name = [q > 0 ? pick(PREFIX[top]) : null, w.element ? ELEMENTS[w.element].word : null, base.name].filter(Boolean).join(' ');
  if (q >= 2 && Math.random() < [0, 0, .25, .5, 1][q]) w.anoint = pick(Object.keys(ANOINTS));
  if (q >= 2) w.tal = pick(TAL_KEYS);
  rollCrit(w);
  return w;
}
// ---------- unique (red) weapons: very rare, each with its own trick and a red line, Borderlands style ----------
const UNIQUES = {
  granny:    { base: 'dbarrel',  name: 'Nagyi Mordálya',  text: 'Nagyi mindig két golyót tartogatott.', trick: 'Ölés után azonnal újratölt.' },
  ash:       { base: 'flamer',   name: 'Hamvazószerda',   text: 'Porból lettél, porrá leszel.', trick: 'Az égő zombik halálukkor szétrobbannak.' },
  thirteen:  { base: 'revolver', name: 'Tizenhárom',      text: 'Az utolsó golyó hozza a szerencsét.', trick: 'A tár utolsó lövése ötszörös és mindig kritikus.' },
  haystack:  { base: 'lmg',      name: 'Szénakazal',      text: 'Ha elég sokat lősz, valami csak eltalál.', trick: 'Folyamatos tűznél egyre gyorsabban lő, akár kétszeres sebességig.' },
  reaper:    { base: 'lever',    name: 'Kaszás',          text: 'Aratás ideje van.', trick: 'Fejlövéses ölés után a következő lövés többszörös (3-ig halmozódik).' },
  rod:       { base: 'tesla',    name: 'Villámhárító',    text: 'Vihar idején ne állj a fa alá.', trick: 'A villám 6 célra ugrik át.', baseMod: { chain: 6 } },
  sebastian: { base: 'crossbow', name: 'Szent Sebestyén', text: 'Egy nyíl is elég volt.', trick: 'A nyilak becsapódáskor felrobbannak.' },
  silent:    { base: 'sniper',   name: 'Csendes Éj',      text: 'Aludj csak, reggel már nem kelsz fel.', trick: 'A fejlövés szétveti a közeli zombikat is.' },
  honey:     { base: 'smg',      name: 'Mézesmadzag',     text: 'Édes, mint a méz. Ragad is.', trick: 'Minden találat lassít, és a sebzés 2%-át visszagyógyítja.', element: 'cryo' },
  glacier:   { base: 'ar',       name: 'Örök Tél',        text: 'Nálunk sosem olvad el a hó.', trick: 'A lelassított zombi halálakor szétfagy, és a közelieket is megdermeszti.', element: 'cryo' },
  anvil:     { base: 'deagle',   name: 'Üllő',            text: 'Kalapács kell ide, nem golyó.', trick: 'Egy lövéssel letépi a páncélt, és hátralöki a célt.' },
  hydra:     { base: 'autoshot', name: 'Hidra',           text: 'Vágj le egy fejet, kettő nő helyette.', trick: 'Minden ölés után 3 mp-ig nem fogy a tár.' },
  bells:     { base: 'burst',    name: 'Lélekharang',     text: 'Kinek szól a harang?', trick: 'Minden kilencedik találat megkondítja a harangot: a célpont körül minden zombi elkábul.' },
  scalpel:   { base: 'mpistol',  name: 'Szike',           text: 'Nem fog fájni. Nagyon.', trick: 'A kritikus találat 3 mp-ig vérzést okoz: a sebzés fele még egyszer.' },
  bigbang:   { base: 'launcher', name: 'A Nagy Bumm',     text: 'Minek célozni?', trick: 'Minden gránát három kisebb bombára esik szét.' },
};
function makeUnique(key, level) {
  key = UNIQUES[key] ? key : pick(Object.keys(UNIQUES));
  const U = UNIQUES[key], w = makeWeapon(BASES.find(b => b.id === U.base), 4, level);
  Object.assign(w, { q: 5, unique: key, name: U.name, flavor: U.text, dmg: Math.round(w.dmg * 1.12), anoint: pick(Object.keys(ANOINTS)), tal: null });
  if (U.element) w.element = U.element;
  if (U.baseMod) w.base = Object.assign({}, w.base, U.baseMod);
  return w;
}
// anointments: an extra rule on rare and better guns (25% rare, 50% epic, always on legendary and unique)
const ANOINT_NAMES = { reload: 'Töltőláz', ability: 'Képességpörgetés', killheal: 'Vérvétel', lowhp: 'Utolsó lehelet', ads: 'Nyugodt cél', first: 'Nyitólövés', swap: 'Villámváltás', boom: 'Detonátor' };
const anoName = k => ANOINT_NAMES[k] || 'Felkenés';
const ANOINTS = {
  reload:   'Újratöltés után 5 mp-ig +50% sebzés',
  ability:  'Képesség használata után 8 mp-ig +50% tűzgyorsaság',
  killheal: 'Minden ölés +6% életerőt ad vissza',
  lowhp:    '35% életerő alatt +60% sebzés',
  ads:      'Célzás közben +15% kritikus esély',
  first:    'Újratöltés után az első 3 lövés dupla sebzésű',
  swap:     'Fegyvercsere után 4 mp-ig +40% sebzés',
  boom:     'Ölésenként 20% esély, hogy a zombi felrobban',
};
const fireRate = w => w.base.mode === 'burst' ? w.base.burst / (w.base.burstDelay + (w.base.burst - 1) * 60 / w.rpm) : w.rpm / 60;
// sustained DPS: a full magazine plus its reload, so a double barrel doesn't look like the best gun in the game
const dps = w => Math.round(w.dmg * w.pellets * w.mag / (w.mag / fireRate(w) + (w.base.single ? w.reload * w.mag : w.reload)));
const accuracy = w => Math.round(clamp(100 - w.spread * 9, 5, 99));
const rarColor = w => RARITIES[w.q].color;
const sellValue = w => Math.round([60, 150, 320, 650, 1300, 2600][w.q] * (1 + .08 * (w.level - 1)));

const ITEMS = {
  med:   { name: 'Gyógycsomag', key: 'H', max: 3, color: '#ff5a5a', desc: '+70 életerő azonnal' },
  gren:  { name: 'Gránát',      key: 'G', max: 4, color: '#8fd35a', desc: '1,8 mp után robban, 5 m sugárban' },
  knife: { name: 'Dobókés',     key: 'Q', max: 8, color: '#d8d8d8', desc: 'Nagy sebzés, fejre dupla' },
  adren: { name: 'Adrenalin',   key: 'T', max: 2, color: '#7fc4ff', desc: '12 mp: végtelen sprint, +30% sebesség, gyors újratöltés' },
};
const ITEM_KEYS = Object.keys(ITEMS);
// grenade and knife kinds: bought once at the base, the chosen one fills the G / Q slot
const GREN_TYPES = {
  frag:    { name: 'Repeszgránát', desc: 'Nagy robbanás 5 m-es körben.', price: 0 },
  molotov: { name: 'Molotov-koktél', desc: '6 mp-ig égő tűztócsa, ami mindent felgyújt.', price: 900 },
  cryo:    { name: 'Fagygránát', desc: 'Kisebb robbanás, a környéket 5 mp-re lefagyasztja.', price: 1100 },
  shock:   { name: 'Villámgránát', desc: 'Villám ugrik a közeli 6 zombira.', price: 1300 },
  sticky:  { name: 'Tapadó gránát', desc: 'Rátapad az első eltalált zombira, és nagyobbat robban.', price: 1500 },
};
const KNIFE_TYPES = {
  steel:    { name: 'Acélkés', desc: 'Nagy sebzés, fejre dupla.', price: 0 },
  poison:   { name: 'Mérgezett kés', desc: 'Kisebb találat, de 5 mp-ig mérgez.', price: 800 },
  blast:    { name: 'Robbanó kés', desc: 'Becsapódáskor felrobban.', price: 1200 },
  ricochet: { name: 'Pattanó kés', desc: 'Még két zombiról lepattan.', price: 1000 },
};
const throwKind = k => { const T = profile && profile.throw || {}; return k === 'gren' ? (GREN_TYPES[T.g] ? T.g : 'frag') : (KNIFE_TYPES[T.k] ? T.k : 'steel'); };
function drawIcon(k) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), col = ITEMS[k].color;
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round';
  if (k === 'med') { g.fillRect(8, 14, 48, 38); g.fillStyle = '#fff'; g.fillRect(27, 20, 10, 26); g.fillRect(19, 28, 26, 10); }
  else if (k === 'gren') { g.beginPath(); g.arc(32, 38, 18, 0, 7); g.fill(); g.fillStyle = '#444'; g.fillRect(26, 12, 12, 10); g.beginPath(); g.arc(44, 14, 6, 0, 7); g.stroke(); }
  else if (k === 'knife') { g.beginPath(); g.moveTo(10, 54); g.lineTo(44, 20); g.lineTo(56, 8); g.lineTo(50, 22); g.lineTo(18, 56); g.closePath(); g.fill(); g.fillStyle = '#6b4a2b'; g.fillRect(6, 50, 14, 8); }
  else { g.fillRect(12, 26, 34, 12); g.fillStyle = '#fff'; g.fillRect(16, 29, 18, 6); g.beginPath(); g.moveTo(46, 32); g.lineTo(60, 32); g.stroke(); g.beginPath(); g.moveTo(8, 22); g.lineTo(8, 42); g.stroke(); }
  return c;
}
const ICONS = {}, ICON_CANVAS = {};
ITEM_KEYS.forEach(k => { ICON_CANVAS[k] = drawIcon(k); ICONS[k] = ICON_CANVAS[k].toDataURL(); });

// the forge's calibration: every stat roll again; rarity, level, maker, element, anointment and unique trick stay
function recalWeapon(w) {
  const b = BASES.find(x => x.id === w.base.id) || w.base, n = makeWeapon(b, Math.min(4, w.q), w.level, w.mk), k = w.unique ? 1.12 : 1;
  ocStrip(w); Object.assign(w, { dmg: Math.round(n.dmg * k), rpm: n.rpm, mag: n.mag, reload: n.reload, spread: n.spread, roll: n.roll, crit: n.crit, cdmg: n.cdmg }); ocApply(w);
  return w;
}

// ---------- overclocks (Deep Rock Galactic): one per gun, bought with an overclock core; they change how the gun works ----------
const OVERCLOCKS = {
  heavy:    { name: 'Nehéz lövedék', desc: '+35% sebzés, −20% tűzgyorsaság', mul: { dmg: 1.35, rpm: .8 } },
  rapid:    { name: 'Túlpörgetett', desc: '+40% tűzgyorsaság, −10% sebzés', mul: { rpm: 1.4, dmg: .9 } },
  drum:     { name: 'Dobtár', desc: '+60% tárkapacitás, 25%-kal lassabb újratöltés (egyesével töltőknél nincs lassulás)', mul: { mag: 1.6, reload: 1.25 } },
  exploder: { name: 'Robbanó tár', desc: 'A tár utolsó lövése felrobban (3 m, dupla sebzés). Legalább 6 töltényes tárnál.' },
  leech:    { name: 'Vérszívó', desc: 'A találatok sebzésének 1%-a visszajön életerőként (találatonként legfeljebb 1,5%).' },
  ricochet: { name: 'Pattanó', desc: '25% eséllyel a golyó a legközelebbi zombira pattan (50% sebzés).' },
};
function ocStrip(w) { if (w && w.ocBase) { Object.assign(w, w.ocBase); delete w.ocBase; } }
function ocApply(w) {
  const O = w && w.oc && OVERCLOCKS[w.oc]; if (!O || !O.mul) return;
  w.ocBase = { dmg: w.dmg, rpm: w.rpm, mag: w.mag, reload: w.reload };
  if (O.mul.dmg) w.dmg = Math.round(w.dmg * O.mul.dmg); if (O.mul.rpm) w.rpm = Math.round(w.rpm * O.mul.rpm);
  if (O.mul.mag && !w.base.fixedMag) w.mag = Math.max(2, Math.round(w.mag * O.mul.mag)); if (O.mul.reload && !w.base.single) w.reload = +(w.reload * O.mul.reload).toFixed(2);
}
function setOverclock(w, key) { ocStrip(w); w.oc = OVERCLOCKS[key] ? key : null; ocApply(w); }

// which overclocks make sense on a gun: no drum on fixed mags, no last-round blast on tiny mags, on-hit ones not on grenade guns
const ocFits = (w, k) => !(k === 'drum' && w.base.fixedMag) && !(k === 'exploder' && (w.base.fixedMag || w.mag < 6)) && !(['exploder', 'leech', 'ricochet'].includes(k) && w.base.lob);
