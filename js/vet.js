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
    ${collectionLog()}
    <div class="gtop"><section><h3>Bónuszok</h3><div class="slist">${rows}</div></section><section><h3>Kihívások</h3><div class="chals">${ch}</div></section></div>`;
}

// ---------- daily and weekly contracts (Division projects): fresh goals every day, a big one every week ----------
const CONTRACTS = [
  { id: 'kills', txt: n => `Ölj meg ${n} zombit`, n: [150, 250], get: s => s.kills },
  { id: 'heads', txt: n => `${n} fejlövéses ölés`, n: [40, 70], get: s => s.heads },
  { id: 'jobs', txt: n => `Teljesíts ${n} munkát`, n: [2, 3], get: s => s.jobs },
  { id: 'hard', txt: n => `Teljesíts ${n} legalább 4 csillagos munkát`, n: [1, 1], get: s => s.hard || 0 },
  { id: 'bounty', txt: n => `Teljesíts ${n} fejvadászatot`, n: [1, 1], get: s => s.bounties || 0 },
  { id: 'legend', txt: n => `Találj ${n} legendás tárgyat`, n: [1, 2], get: s => s.legendaries },
  { id: 'cash', txt: n => `Keress $${n}-t munkákon`, n: [3000, 6000], get: s => s.cash },
];
const WEEKLY = [
  { id: 'kills', txt: n => `Ölj meg ${n} zombit`, n: [1500, 1500], get: s => s.kills },
  { id: 'jobs', txt: n => `Teljesíts ${n} munkát`, n: [12, 12], get: s => s.jobs },
  { id: 'hard', txt: n => `Teljesíts ${n} legalább 4 csillagos munkát`, n: [5, 5], get: s => s.hard || 0 },
  { id: 'bounty', txt: n => `Teljesíts ${n} fejvadászatot`, n: [3, 3], get: s => s.bounties || 0 },
];
const featuredMap = () => MAP_IDS[weekKey() % MAP_IDS.length]; // this week's featured map: +25% XP and better loot
const dayKey = () => new Date().toLocaleDateString('sv'), weekKey = () => Math.floor((Date.now() / 864e5 + 3) / 7);
function rollContracts() {
  const P = profile, mk = (D, lvl) => ({ id: D.id, n: Math.round(D.n[0] + Math.random() * (D.n[1] - D.n[0])), base: D.get(stats) || 0, got: false, lvl });
  if (!P.daily || P.daily.day !== dayKey()) { const pool = CONTRACTS.filter(c => c.id !== 'bounty' || P.level >= 3).sort(() => Math.random() - .5); P.daily = { day: dayKey(), list: pool.slice(0, 3).map(D => mk(D)) }; }
  if (!P.weekly || P.weekly.wk !== weekKey()) P.weekly = { wk: weekKey(), c: mk(pick(WEEKLY.filter(c => c.id !== 'bounty' || P.level >= 3))) };
}
const cDef = (c, weekly) => (weekly ? WEEKLY : CONTRACTS).find(d => d.id === c.id);
const cProg = (c, weekly) => Math.min(c.n, (cDef(c, weekly).get(stats) || 0) - c.base);
const dailyReward = () => ({ cash: 600 + 120 * profile.level, parts: 8 });
function claimContract(i) {
  const P = profile, weekly = i === 'w', c = weekly ? P.weekly.c : P.daily.list[+i];
  if (!c || c.got || cProg(c, weekly) < c.n) return;
  c.got = true;
  if (weekly) { // the weekly cache: an exotic piece, parts and cash
    const it = makeExotic(null, profile.level); (stats.exo || (stats.exo = {}))[it.exo] = 1; if (P.gearStash.length < gearMax()) P.gearStash.push(it); else P.cash += gearValue(it);
    P.parts = (P.parts || 0) + 40; P.cash += 3000 + 300 * P.level; banner('HETI KONTRAKT KÉSZ', `${it.name} (egzotikus) · +40 ⚙`);
  } else { const r = dailyReward(); P.cash += r.cash; P.parts = (P.parts || 0) + r.parts; }
  SND.power();
}
function contractsStrip() {
  rollContracts();
  const P = profile, row = (c, i, weekly) => {
    const p = cProg(c, weekly), done = p >= c.n, rw = weekly ? 'egzotikus + 40 ⚙' : `$${dailyReward().cash} + ${dailyReward().parts} ⚙`;
    return `<div class="ctr${weekly ? ' wk' : ''}${c.got ? ' got' : ''}"><b>${weekly ? 'HETI' : 'NAPI'}</b><span>${cDef(c, weekly).txt(c.n)}<small>${Math.max(0, Math.floor(p))} / ${c.n} · ${rw}</small><i><em style="width:${Math.max(0, p) / c.n * 100}%"></em></i></span>${c.got ? '<em class="ok">✓</em>' : done ? hbtn('Átvétel', `claim:${i}`) : ''}</div>`;
  };
  return `<div class="contracts">${P.daily.list.map((c, i) => row(c, i, false)).join('')}${row(P.weekly.c, 'w', true)}</div>`;
}

// ---------- collection log: every unique, exotic, anointment and bounty; where to farm what you're missing ----------
function collectionLog() {
  const S = stats, from = k => Object.keys(BOUNTIES).filter(b => BOUNTIES[b].loot.includes(k)).map(b => BOUNTIES[b].name).join(', ');
  const chip = (got, name, sub, col) => `<div class="cchip${got ? ' got' : ''}" style="--cc:${col}"><b>${got ? name : '???'}</b><small>${sub}</small></div>`;
  const U = Object.keys(UNIQUES).map(k => chip(S.uniq && S.uniq[k], UNIQUES[k].name, from(k) ? `Forrás: ${from(k)}` : 'Bárhol eshet', RARITIES[5].color));
  const E = Object.keys(EXOTICS).map(k => chip(S.exo && S.exo[k], EXOTICS[k].name, GEAR_SLOTS[EXOTICS[k].slot], EXO_COL));
  const A = Object.keys(ANOINTS).map(k => chip(S.ano && S.ano[k], ANOINTS[k], 'Felkenés', '#b46cff'));
  const B = Object.keys(BOUNTIES).map(k => chip(S.bk && S.bk[k], BOUNTIES[k].name, `${BOUNTIES[k].minLvl || 3}. szinttől`, '#ff8c1a'));
  const n = (o, all) => `${Object.keys(o || {}).length} / ${all}`;
  return `<section class="collog"><h3>Gyűjtemény</h3>
    <h4>Egyedi fegyverek <small>${n(S.uniq, U.length)}</small></h4><div class="cgrid">${U.join('')}</div>
    <h4>Egzotikus páncélok <small>${n(S.exo, E.length)}</small></h4><div class="cgrid">${E.join('')}</div>
    <h4>Felkenések <small>${n(S.ano, A.length)}</small></h4><div class="cgrid">${A.join('')}</div>
    <h4>Fejvadász-célpontok <small>${n(S.bk, B.length)}</small></h4><div class="cgrid">${B.join('')}</div></section>`;
}
