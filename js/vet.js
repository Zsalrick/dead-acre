// ================= VETERAN RANK (endless progression, like Borderlands' badass rank) =================
// Every level-up and every challenge tier earns a veteran point. Points buy small, never-capped stat ranks;
// each rank adds a little less than the one before (n^0.8), so there is always something to earn but no runaway.
const VET = {
  dmg: .012, crit: .005, critDmg: .03, head: .03, hp: 5, armor: 6,
  reload: .015, regen: .04, ammo: .03, expl: .03, points: .015, speed: .006,
};
const vetVal = (k, n) => { const v = VET[k] * Math.pow(n, .8); return GSTATS[k].flat ? Math.round(v) : Math.round(v * 1000) / 1000; };
// challenges: tiers at base, 3×base, 9×base… — endless
const CHALLENGES = [
  { id: 'kills', name: 'Zombiirtó', what: 'zombi megölve', get: s => s.kills, base: 100 },
  { id: 'heads', name: 'Mesterlövész', what: 'fejlövéses ölés', get: s => s.heads, base: 40 },
  { id: 'jobs', name: 'Megbízható', what: 'kész munka', get: s => s.jobs, base: 3 },
  { id: 'bounty', name: 'Fejvadász', what: 'teljesített fejvadászat', get: s => s.bounties || 0, base: 1 },
  { id: 'legend', name: 'Gyűjtő', what: 'legendás tárgy', get: s => s.legendaries, base: 1 },
  { id: 'boss', name: 'Bosszúálló', what: 'főellenség megölve', get: s => s.killsBy.butcher || 0, base: 1 },
  { id: 'threat', name: 'Rémálomjáró', what: 'legmagasabb veszélyszint', get: s => s.bestThreat, base: 5, step: 2 },
  { id: 'cash', name: 'Vállalkozó', what: 'megkeresett dollár', get: s => s.cash, base: 5000 },
];
function chTier(c) { // tiers reached and the next goal
  const v = c.get(stats) || 0, m = c.step || 3; let tier = 0, goal = c.base;
  while (v >= goal) { tier++; goal = Math.round(goal * m); }
  return { v, tier, goal, prev: tier ? Math.round(goal / m) : 0 };
}
const vetEarned = () => profile ? (profile.level - 1) + (profile.vetXp || 0) + CHALLENGES.reduce((a, c) => a + chTier(c).tier, 0) : 0;
const vetSpent = () => profile && profile.vet ? Object.values(profile.vet).reduce((a, n) => a + n, 0) : 0;
const vetAvail = () => vetEarned() - vetSpent();
function vetTab() {
  const P = profile, V = P.vet || (P.vet = {}), avail = vetAvail();
  const rows = Object.keys(VET).map(k => {
    const n = V[k] || 0, now = n ? vetVal(k, n) : 0, next = vetVal(k, n + 1);
    return srow(`${GSTATS[k].name} <span class="vrank">${n}. rang</span>`, `most: ${now ? fmtG(k, now) : '—'} → ${fmtG(k, next)}`, '', `vet:${k}`, avail < 1, 'Rang +1');
  }).join('');
  const ch = CHALLENGES.map(c => {
    const t = chTier(c), p = clamp((t.v - t.prev) / Math.max(1, t.goal - t.prev), 0, 1);
    return `<div class="chal"><div><b>${c.name}</b> <span class="vrank">${t.tier}. fokozat</span><small>${Math.floor(t.v)} / ${t.goal} ${c.what}</small></div><i><b style="width:${p * 100}%"></b></i></div>`;
  }).join('');
  return `<div class="hubhead"><h2>Veterán</h2></div>
    <p class="lede">Minden szintlépés és minden kihívás-fokozat ad egy veterán pontot. A pontokért kis, de sosem véget érő bónuszokat veszel; minden rang egy kicsit kevesebbet ad, mint az előző, de a fejlődésnek nincs plafonja.</p>
    <div class="vtop"><div>Veterán rang<strong>${vetEarned()}</strong></div><div>Elkölthető pont<strong class="cash">${avail}</strong></div></div>
    <div class="gtop"><section><h3>Bónuszok</h3><div class="slist">${rows}</div></section><section><h3>Kihívások</h3><div class="chals">${ch}</div></section></div>`;
}
