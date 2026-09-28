// ================= CAREER SAVES (3 slots) =================
// each slot is one career: cash, level, weapon stash, permanent upgrades, items, job board and stats.
// localStorage lives per viewer and can be blocked (private mode, previews), so every access is guarded
const SLOTS = 3, SLOT_KEY = n => `deadacre.career.${n}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const emptyStats = () => ({ bounties: 0, jobs: 0, fails: 0, kills: 0, heads: 0, earned: 0, cash: 0, time: 0, legendaries: 0, boxSpins: 0, bestThreat: 0, killsBy: {}, found: {}, byMap: {} });
let profile = null, slot = 0, stats = emptyStats();
// the shared chest: every career on this browser can put things in and take them out (weapons packed, armor as is)
const SHARED_KEY = 'deadacre.shared', SHARED_MAX = 30;
const SH = Object.assign({ w: [], g: [] }, store.get(SHARED_KEY) || {});
const saveShared = () => store.set(SHARED_KEY, SH);
if (!SH.vet) SH.vet = { ranks: {}, xp: 0, ch: {} }; // the account-wide veteran rank (vet.js)

const packW = w => w ? Object.assign({}, w, { base: w.base.id }) : null;
function unpackW(o) {
  if (!o) return null;
  const w = Object.assign({}, o, { base: BASES.find(b => b.id === o.base) || BASES[0] });
  if (w.spread == null) w.spread = w.base.spread; if (!w.pellets) w.pellets = w.base.pellets || 1; if (!w.maxRes) w.maxRes = w.base.res; if (!(w.reserve >= 0)) w.reserve = w.maxRes; // very old saves
  if (w.base.single && w.reload > 1.2) w.reload = +(w.reload / 2.8 * w.base.reload).toFixed(2); // saves from before round-by-round loading
  if (w.unique && UNIQUES[w.unique] && UNIQUES[w.unique].baseMod) w.base = Object.assign({}, w.base, UNIQUES[w.unique].baseMod);
  if (!w.sv) { w.dmg = Math.round(w.dmg * Math.pow(1.08, w.level - 1) / (1 + .075 * (w.level - 1))); w.sv = 2; } // saves from before exponential levels
  if (w.crit == null) { const R = critRange(w); w.crit = +((R[0] + R[1]) / 2).toFixed(3); w.cdmg = +((R[2] + R[3]) / 2).toFixed(2); } // guns from before per-gun crit
  if (!w.mk) { w.mk = Object.keys(MAKERS).find(k => MAKERS[k].name === w.maker) || 'kessler'; w.maker = MAKERS[w.mk].name; } // saves from before maker perks
  if (w.tal === undefined && w.q >= 2 && w.q < 5 && !w.unique) w.tal = talentFor(w);
  return w;
}
function newProfile(n) {
  return { v: 2, slot: n, name: `Zsoldos ${n}`, cash: 300, xp: 0, level: 1, loadout: [packW(makeWeapon(BASES[0], 0, 1)), null], bag: [], stash: [], gear: {}, gearStash: [], gshop: [],
    inv: { med: 1, gren: 2, knife: 4, adren: 1 }, up: {}, cls: null, skills: {}, tokens: 0, stats: emptyStats(), jobs: [], shop: [], created: Date.now(), at: Date.now() };
}
const readProfile = n => { const p = store.get(SLOT_KEY(n)); return p && p.v === 2 ? p : null; };
function openProfile(n) {
  slot = n; profile = readProfile(n) || newProfile(n);
  stats = profile.stats = Object.assign(emptyStats(), profile.stats);
  profile.inv = Object.assign({ med: 0, gren: 0, knife: 0, adren: 0 }, profile.inv); // older saves may miss an item
  player.up = profile.up;
  Object.assign(profile, { bag: profile.bag || [], gear: profile.gear || {}, gearStash: profile.gearStash || [], gshop: profile.gshop || [] });
  profile.vet = profile.vet || {};
  profile.throw = profile.throw || { g: 'frag', k: 'steel', own: ['frag', 'steel'] };
  gearChanged();
  profile.name = profile.name || `Zsoldos ${n}`;
  profile.skills = profile.skills || {}; profile.tokens = profile.tokens || 0; if (profile.cls === undefined) profile.cls = null;
  if (!profile.jobs.length) rollBoard();
  if (!profile.shop.length || !profile.gshop.length) rollShop();
  saveProfile();
}
function saveProfile() { if (profile) { if (typeof vetSync === 'function') vetSync(); profile.at = Date.now(); store.set(SLOT_KEY(slot), profile); } }
const deleteProfile = n => store.del(SLOT_KEY(n));

// ---------- progression ----------
const LEVEL_CAP = 30; // like The Division: past the cap, XP fills veteran points
const xpNeed = l => 300 + 250 * Math.min(l, LEVEL_CAP);
function addXp(n) {
  let ups = 0; profile.xp += n;
  while (profile.xp >= xpNeed(profile.level)) { profile.xp -= xpNeed(profile.level); if (profile.level < LEVEL_CAP) { profile.level++; ups++; } else SH.vet.xp = (SH.vet.xp || 0) + 1; }
  return ups;
}
function noteFound(w) {
  const id = w.base.id;
  if (stats.found[id] == null || w.q > stats.found[id]) stats.found[id] = w.q;
  if (w.q >= 4 && !w.counted) { w.counted = true; stats.legendaries++; }
  if (w.unique) (stats.uniq || (stats.uniq = {}))[w.unique] = 1; // the collection log
  if (w.anoint) (stats.ano || (stats.ano = {}))[w.anoint] = 1;
}
function tickStats(dt) { stats.time += dt; }
// weapon mastery: kills with each weapon type climb through tiers, each worth +2% damage with that type
const MASTERY = [50, 200, 600, 1500, 4000, 10000], MASTERY_NAMES = ['Újonc', 'Gyakorlott', 'Veterán', 'Mester', 'Nagymester', 'Legenda'];
const masteryTier = id => { const n = (stats.byBase || {})[id] || 0; return MASTERY.filter(m => n >= m).length; };
function noteBaseKill(w) {
  if (!w || !w.base || (mission && mission.job.test)) return; const B = stats.byBase || (stats.byBase = {}), before = masteryTier(w.base.id);
  B[w.base.id] = (B[w.base.id] || 0) + 1;
  const t = masteryTier(w.base.id); if (t > before) { banner('FEGYVERMESTERSÉG', `${w.base.name}: ${MASTERY_NAMES[t - 1]} · +${2 * t}% sebzés`); SND.power(); }
}
