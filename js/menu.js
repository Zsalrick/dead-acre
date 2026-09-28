// ================= MAIN MENU =================
// ---------- model snapshots for the arsenal and bestiary ----------
const shots = {};
function snapshot(key, build, view) {
  if (shots[key]) return shots[key];
  if (!snapshot.r) {
    try {
      snapshot.r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      snapshot.r.setSize(320, 180, false);
      snapshot.scene = new THREE.Scene();
      snapshot.scene.add(new THREE.HemisphereLight(0xdde4ff, 0x302820, 1.1));
      const k = new THREE.DirectionalLight(0xffe6c8, 1.1); k.position.set(2, 3, 2); snapshot.scene.add(k);
      snapshot.cam = new THREE.PerspectiveCamera(30, 16 / 9, .01, 50);
    } catch (e) { snapshot.r = false; }
  }
  if (!snapshot.r) return '';
  const obj = build(), S = snapshot.scene, cam = snapshot.cam;
  S.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(); // frame only what is drawn (a crawler's hidden legs would skew it)
  obj.traverseVisible(o => { if (o.isMesh) box.union(new THREE.Box3().setFromObject(o)); });
  const c = box.getCenter(new V3()), size = box.getSize(new V3());
  const d = Math.max(size.x, size.y * 1.8, size.z) * view.dist;
  cam.position.set(c.x + view.dir[0] * d, c.y + view.dir[1] * d, c.z + view.dir[2] * d); cam.lookAt(c);
  snapshot.r.render(S, cam);
  shots[key] = snapshot.r.domElement.toDataURL();
  S.remove(obj);
  return shots[key];
}
const gunShot = (b, q) => snapshot(`g${b.id}${q}`, () => buildGun({ base: b, q }, false), { dist: 1.45, dir: [.9, .25, .12] });
const zombieShot = k => snapshot(`z${k}`, () => { const m = mkZombie(k); m.armL.rotation.x = m.armR.rotation.x = -1.3; m.upper.rotation.x = KINDS[k].lean; return m.g; }, k === 'crawler' ? { dist: 1.1, dir: [.85, .35, .45] } : { dist: .95, dir: [.45, .12, .9] });

// ---------- tabs ----------
const pct = (q, luck) => { const ws = RARITIES.map((r, i) => r.w * Math.pow(1 + luck, i)); return ws[q] / ws.reduce((a, b) => a + b) * 100; };
const fmtPct = v => v >= 10 ? v.toFixed(0) + '%' : v >= 1 ? v.toFixed(1) + '%' : v.toFixed(2) + '%';
const modeName = b => b.mode === 'auto' ? 'Automata' : b.mode === 'burst' ? `${b.burst} lövéses sorozat` : 'Egyes lövés';
function baseSpecial(b) {
  const s = [];
  if (b.pellets) s.push(`${b.pellets} sörét`);
  if (b.pierce) s.push(`${b.pierce} célon át`);
  if (b.splash) s.push(`${b.splash} m robbanás`);
  if (b.scopeView) s.push(`${b.zoom}× távcső`);
  if (b.headMult) s.push(`fejlövés ×${b.headMult}`);
  if (b.single) s.push('töltényenként tölt');
  if (b.flame) s.push('mindig gyújt');
  if (b.lob) s.push('gránátot lő');
  if (b.chain) s.push(`${b.chain} célra ugrik át`);
  if (b.spin) s.push('fel kell pörögnie');
  return s.join(' · ');
}
const TABS = {
  arsenal() {
    const found = Object.keys(stats.found).length;
    const cards = BASES.map(b => {
      const f = stats.found[b.id], q = f == null ? 0 : f, w = makeWeapon(b, 0, 1);
      w.dmg = b.dmg; w.rpm = b.rpm; w.mag = b.mag; w.reload = b.reload; w.spread = b.spread;
      return `<article class="acard${f == null ? ' unknown' : ''}" style="--rc:${RARITIES[q].color}">
        <img src="${gunShot(b, q)}" alt="${b.name}">
        <div class="ahead"><h3>${b.name}</h3><span>${f == null ? 'Még nem találtad' : `Legjobb: ${RARITIES[f].name}`}</span></div>
        <p class="amode">${modeName(b)}${baseSpecial(b) ? ' · ' + baseSpecial(b) : ''}</p>
        <dl><div><dt>DPS</dt><dd>${dps(w)}</dd></div><div><dt>Sebzés</dt><dd>${b.pellets ? `${b.dmg}×${b.pellets}` : b.dmg}</dd></div>
          <div><dt>Tűzgyors.</dt><dd>${b.rpm}</dd></div><div><dt>Tár</dt><dd>${b.mag}</dd></div>
          <div><dt>${b.single ? 'Töltés/db' : 'Újratöltés'}</dt><dd>${b.reload} mp</dd></div><div><dt>Pontosság</dt><dd>${accuracy(w)}%</dd></div></dl>
      </article>`;
    }).join('');
    const rows = RARITIES.map((r, i) => `<tr><td style="color:${r.color}">${r.name}</td><td>${fmtPct(pct(i, .02))}</td><td>${fmtPct(pct(i, .2))}</td><td>${fmtPct(pct(i, .5))}</td>
      <td>${i ? `+${i * 14}% sebzés` : '—'}</td><td>${r.elem ? fmtPct(r.elem * 100) : '—'}</td></tr>`).join('');
    return `<h2>Fegyvertár</h2><p class="lede">${found} / ${BASES.length} fegyvertípust találtál meg. Az alapértékek 1. szintű, közönséges példányra vonatkoznak: a ritkaság, a szint és a gyártó mindegyiket módosítja.</p>
      <div class="agrid">${cards}</div>
      <h3>Ritkaság</h3>
      <div class="tscroll"><table class="mtable"><thead><tr><th>Ritkaság</th><th>Zsákmány, 1. szint</th><th>Zsákmány, 10. szint</th><th>Rejtélyes doboz</th><th>Bónusz</th><th>Elem esélye</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Gyártók és elemek</h3>
      <div class="mcols"><ul class="mlist">${Object.values(MAKERS).map(m => `<li><b>${m.name}</b><span>${m.perk} · ${m.cats.map(c => CAT_NAMES[c]).join(', ')}</span></li>`).join('')}</ul>
      <ul class="mlist">${Object.values(ELEMENTS).map(e => `<li><b style="color:${e.color}">${e.name}</b><span>${e.desc}</span></li>`).join('')}</ul></div>`;
  },
  bestiary() {
    return `<h2>Bestiárium</h2><p class="lede">A zombik életereje a veszélyszinttel nő, ami hullámonként emelkedik. A számok az alap sétálóhoz viszonyított szorzók.</p>
      <div class="agrid">${Object.entries(KINDS).map(([k, K]) => `<article class="acard zcard">
        <img src="${zombieShot(k)}" alt="${K.name}">
        <div class="ahead"><h3>${K.name}</h3><span>${K.min}. veszélyszinttől</span></div>
        <p class="amode">${K.desc || 'Lassú, kitartó, sok van belőle.'}</p>
        <dl><div><dt>Életerő</dt><dd>×${K.hp}</dd></div><div><dt>Ütés</dt><dd>${K.dmg || 'robban'}</dd></div><div><dt>Megölve</dt><dd>${stats.killsBy[k] || 0}</dd></div></dl>
      </article>`).join('')}</div>`;
  },
  guide() {
    const items = ITEM_KEYS.map(k => `<li><b><kbd>${ITEMS[k].key}</kbd> ${ITEMS[k].name}</b><span>${ITEMS[k].desc} · max ${ITEMS[k].max}</span></li>`).join('');
    const maps = MAP_IDS.map(id => { const M = MAPS[id]; return `<li><b>${M.name}</b><span>${M.minLevel}. szinttől · ${M.desc} Területek: ${Object.values(M.areas).map(a => a.name).join(', ')}.</span></li>`; }).join('');
    const st = Object.entries(STATION_INFO).map(([k, t]) => `<li><b>${({ forge: 'Kovácsműhely', trap: 'Tűzcsapda', well: 'Szent kút', tower: 'Lövegtorony' })[k]}</b><span>${t}</span></li>`).join('');
    return `<h2>Kézikönyv</h2>
      <div class="mcols">
        <section><h3>Hogyan megy</h3><ul class="mlist">
          <li><b>Munka</b><span>a bázison válassz egy munkát: pálya, nehézség, idő (5 perctől), esetleg módosító vagy boss</span></li>
          <li><b>Túlélés</b><span>a furgon kitesz, és rögtön jönnek; hullámok rövid pihenőkkel, a veszély hullámonként nő</span></li>
          <li><b>Evakuáció</b><span>ha lejár az idő, a furgon egy másik ponton visszajön érted: kövesd a zöld jelzést, és nyomj E-t</span></li>
          <li><b>Zsákmány</b><span>amit a munkán találsz, csak akkor a tiéd, ha elhajtasz vele; ha elesel, elveszik (a saját fegyvered megmarad)</span></li>
          <li><b>Kéz és táska</b><span>2 fegyver a kézben, 5 a táskában; F: új fegyver a táskába, F nyomva: csere (a kézben lévő a táskába, ha tele, a földre); [I] vagy [Tab]: leltár</span></li>
          <li><b>Gyártók</b><span>minden gyártónak saját bónusza van (pl. XFCV: +10% fejlövés), és egy fegyvertípust több gyártó is gyárt</span></li>
          <li><b>Páncél</b><span>sisak, mellvért, nadrág, csizma, kesztyű és egy kiegészítő: páncél a pajzshoz, véletlen bónuszok, márkabónusz, és 2/3/4 darabos szettbónuszok</span></li>
          <li><b>Kaszt és képességfa</b><span>4 kaszt, mindegyik passzív bónusszal, aktív képességgel (C) és 12 képességgel; érdemérmet a munka csillagai, a Mészáros és a szintlépés ad</span></li>
          <li><b>Pénz és XP</b><span>a munka díja és a pontjaid 10%-a; a szint új pályákat és nehezebb munkákat nyit</span></li></ul>
          <h3>Tárgyak</h3><ul class="mlist">${items}</ul>
          <h3>Pontok (munka közben)</h3><ul class="mlist"><li><b>Találat</b><span>10 pont</span></li><li><b>Ölés</b><span>60 · fejlövés 100 · késsel 130</span></li>
          <li><b>Rejtélyes doboz</b><span>${BOX_COST} pont, véletlen fegyver; néhány pörgetés után elköltözik</span></li><li><b>Lőszerláda</b><span>${AMMO_COST} pont</span></li>
          <li><b>Eladás</b><span>F nyomva tartva a földön lévő fegyveren</span></li></ul>
          <h3>Power-upok</h3><ul class="mlist"><li><b>Max Ammo</b><span>minden fegyver tele</span></li><li><b>Insta-Kill</b><span>15 mp-ig minden találat öl (a bosst kivéve)</span></li>
          <li><b>Double Points</b><span>15 mp-ig dupla pont</span></li></ul></section>
        <section><h3>Pályák</h3><ul class="mlist">${maps}</ul><h3>Állomások a területeken</h3><ul class="mlist">${st}</ul>
          <h3>Munka-módosítók</h3><ul class="mlist">${Object.values(MODS).map(m => `<li><b>${m.label}</b><span>${m.sub}</span></li>`).join('')}</ul>
          <h3>Robbanó hordó</h3><ul class="mlist"><li><b>Piros, sárga csíkkal</b><span>lőj rá, ha zombik állnak mellette</span></li></ul></section>
      </div>`;
  },
  controls() {
    const K = d => keyName(boundKey(d));
    const k = [[`${K('KeyW')} ${K('KeyA')} ${K('KeyS')} ${K('KeyD')}`, 'mozgás'], [K('ShiftLeft'), 'sprint'], [K('Space'), 'ugrás'], ['Bal egér', 'lövés'], ['Jobb egér', 'célzás'], [K('KeyR'), 'újratöltés'],
      [`${K('Digit1')} · ${K('Digit2')} · görgő`, 'fegyverváltás'], [K('KeyE'), 'vásárlás, kapuk, állomások, furgon'], [K('KeyF'), 'földön lévő fegyver a táskába'], [`${K('KeyF')} (nyomva)`, 'csere: a kézben lévő a táskába megy (ha tele, a földre)'], [`${K('KeyF')} (páncélnál)`, 'földön lévő páncél a zsákba'], [K('KeyV'), 'kés'],
      [K('KeyH'), 'gyógyítás'], [K('KeyG'), 'gránát'], [K('KeyQ'), 'dobókés'], [K('KeyT'), 'stimuláns'], ['X (nyomva)', 'szétszedés: a földön lévő tárgy alkatrészre / anyagra'], [K('KeyC'), 'kasztképesség'], [`${K('KeyZ')} · középső egérgomb`, 'pingelés: megjelöl egy helyet vagy zombit a csapatnak'], [`${K('KeyI')} · Tab`, 'leltár: kéz és táska'], ['Esc', 'szünet, leltár, munka feladása']];
    return `<h2>Irányítás</h2><div class="keys big">${k.map(([a, b]) => `<kbd>${a}</kbd><span>${b}</span>`).join('')}</div>
      <p class="note">Ha a böngésző nem engedi befogni az egeret, az egér az ablakon belül is fordít, és a nyilakkal is lehet nézni.</p>`;
  },
};
let menuTab = null;
function showTab(name) {
  menuTab = menuTab === name ? null : name;
  document.querySelectorAll('.mnav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === menuTab));
  const p = $('mpanel');
  p.hidden = !menuTab;
  if (menuTab) { p.innerHTML = '<button class="mclose" data-close title="Bezárás">✕</button>' + TABS[menuTab](); p.scrollTop = 0; }
}
document.querySelectorAll('.mnav [data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$('mpanel').addEventListener('click', e => { if (e.target.closest('[data-close]')) showTab(menuTab); });

// three career slots; deleting one needs a second click
let delArmed = 0;
function refreshMenu() {
  const fmt = t => new Date(t).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ps = [1, 2, 3].map(readProfile), latest = ps.reduce((b, p, i) => p && (b < 0 || p.at > ps[b].at) ? i : b, -1);
  $('slotList').innerHTML = [1, 2, 3].map(n => {
    const p = ps[n - 1], C = p && p.cls && CLASSES[p.cls], last = latest === n - 1;
    return `<div class="slotrow${last ? ' last' : ''}${p ? '' : ' empty'}"><button class="mslot" data-slot="${n}"><span class="snum">${n}</span>
      <span class="sinfo"><b>${p ? esc(p.name || `Zsoldos ${n}`) : '+ Új karakter'}</b>${p ? `<small><span>${p.level}. szint</span>${C ? `<span style="color:${C.color}">${C.name}</span>` : ''}<span class="cash">$${p.cash.toLocaleString('hu-HU')}</span><span>${p.stats.jobs} munka</span><span>${fmt(p.at)}</span></small>` : '<small>Kezdj egy pisztollyal és $300-ral</small>'}</span>
      ${p ? `<span class="sgo">${last ? 'Folytatás' : 'Betöltés'} ›</span>` : ''}</button>${p ? `<button class="mdel" data-del="${n}">${delArmed === n ? 'Biztos?' : 'Törlés'}</button>` : ''}</div>`;
  }).join('');
  $('menuVer').textContent = `${GAME_VER} · Billentyűzet és egér szükséges`;
  { const seenK = Object.keys(KINDS).filter(k => stats && stats.killsBy && stats.killsBy[k]).length; $('mBesN').textContent = `${Object.keys(KINDS).length} zombifajta`; $('mArsN').textContent = `${BASES.length} fegyvertípus`; }
  if (menuTab) $('mpanel').innerHTML = '<button class="mclose" data-close title="Bezárás">✕</button>' + TABS[menuTab]();
}
$('slotList').addEventListener('click', e => {
  const s = e.target.closest('[data-slot]'), d = e.target.closest('[data-del]');
  if (d) { const n = +d.dataset.del; if (delArmed === n) { deleteProfile(n); delArmed = 0; } else delArmed = n; return refreshMenu(); }
  if (s) { initAudio(); openProfile(+s.dataset.slot); showHub(); }
});
function openMenu() {
  state = 'menu'; mission = null; delArmed = 0;
  if (NET.code) partyLeave();
  if (document.pointerLockElement) document.exitPointerLock();
  clearZombieStuff();
  ['hud', 'pause', 'results', 'station', 'hub'].forEach(id => $(id).hidden = true);
  $('menu').hidden = false; refreshMenu();
}
