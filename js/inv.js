// ================= INVENTORY VIEW (Division style) =================
// left: tiles with a picture, name and level · right: the selected item with its stats broken down and compared.
// Tiles and buttons carry data-act; "sel:<list>:<key>" selects, everything else is handled by the screen that shows it.
let invSel = 'L:0';

// ---------- armor pictures (drawn once per shape + brand color) ----------
const gearIcons = {};
function gearIcon(slot, color, name = '') {
  const kind = /sapka/i.test(name) ? 'cap' : /álarc/i.test(name) ? 'mask' : /bányász/i.test(name) ? 'miner' : /kabát/i.test(name) ? 'coat' : slot;
  const key = kind + color; if (gearIcons[key]) return gearIcons[key];
  const c = document.createElement('canvas'); c.width = 320; c.height = 180;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 20, 0, 170);
  grad.addColorStop(0, color); grad.addColorStop(.55, color); grad.addColorStop(1, '#1a1b18');
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(160, 166, 96, 9, 0, 0, 7); g.fill(); // floor shadow
  const ink = () => { g.fillStyle = grad; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 5; g.lineJoin = 'round'; };
  const poly = pts => { ink(); g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); g.stroke(); };
  const dark = (x, y, w, h) => { g.fillStyle = 'rgba(10,10,10,.5)'; g.fillRect(x, y, w, h); };
  const shine = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x, y, w, h); };
  const stitch = (x1, y1, x2, y2) => { g.save(); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore(); };
  if (kind === 'cap') {
    ink(); g.beginPath(); g.arc(150, 118, 54, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    poly([[196, 112], [262, 118], [258, 128], [196, 126]]); shine(116, 76, 30, 7); stitch(150, 64, 150, 118);
  } else if (kind === 'mask') {
    ink(); g.beginPath(); g.ellipse(160, 96, 64, 62, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = 'rgba(20,30,34,.85)'; [[134, 84], [186, 84]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 18, 14, 0, 0, 7); g.fill(); });
    [[118, 142], [202, 142]].forEach(([x, y]) => { ink(); g.beginPath(); g.arc(x, y, 20, 0, 7); g.fill(); g.stroke(); dark(x - 10, y - 2, 20, 4); });
  } else if (slot === 'head') {
    ink(); g.beginPath(); g.arc(160, 112, 64, Math.PI, 0); g.lineTo(236, 116); g.lineTo(84, 116); g.closePath(); g.fill(); g.stroke();
    poly([[74, 116], [246, 116], [238, 130], [82, 130]]); shine(118, 64, 36, 8); stitch(160, 50, 160, 112);
    if (kind === 'miner') { g.fillStyle = '#ffe28a'; g.shadowColor = '#ffd24a'; g.shadowBlur = 20; g.beginPath(); g.arc(160, 86, 14, 0, 7); g.fill(); g.shadowBlur = 0; }
    else dark(100, 98, 120, 12);
  } else if (slot === 'chest') {
    poly([[108, 22], [138, 22], [160, 50], [182, 22], [212, 22], [240, 58], [228, 160], [92, 160], [80, 58]]);
    if (kind === 'coat') { poly([[138, 22], [160, 50], [148, 110], [120, 40]]); poly([[182, 22], [160, 50], [172, 110], [200, 40]]); }
    else { dark(96, 100, 128, 6); dark(102, 116, 36, 28); dark(182, 116, 36, 28); dark(98, 146, 124, 8); }
    stitch(160, 54, 160, 158); shine(92, 62, 12, 60);
  } else if (slot === 'legs') {
    poly([[110, 22], [210, 22], [222, 164], [180, 164], [160, 78], [140, 164], [98, 164]]);
    dark(110, 22, 100, 14); dark(114, 96, 28, 24); dark(178, 96, 28, 24); stitch(120, 40, 112, 160); stitch(200, 40, 208, 160);
  } else {
    const boot = (ox, sh) => { g.globalAlpha = sh; poly([[ox, 30], [ox + 46, 30], [ox + 48, 112], [ox + 104, 126], [ox + 108, 150], [ox - 4, 150]]); dark(ox - 4, 140, 112, 10); stitch(ox + 8, 50, ox + 40, 50); stitch(ox + 8, 70, ox + 40, 70); stitch(ox + 8, 90, ox + 40, 90); g.globalAlpha = 1; };
    boot(128, .55); boot(90, 1);
  }
  return gearIcons[key] = c.toDataURL();
}
const wPic = w => gunShot(w.base, w.q);
const gPic = it => gearIcon(it.slot, BRANDS[it.brand].color, it.name);

// ---------- tiles ----------
// o: n (slot number) · tag (új/saját ribbon) · price · cant (can't afford) · up (better than what you use) · lv · val/valLbl (key stat) · bc (brand color)
function tile(sel, pic, name, sub, color, o = {}) {
  return `<button class="tile${invSel === sel ? ' on' : ''}${o.cant ? ' cant' : ''}" data-act="sel:${sel}" draggable="true" style="--rc:${color}${o.bc ? `;--bc:${o.bc}` : ''}">
    <span class="tpic"><img src="${pic}" alt="">${o.lv ? `<i class="tlv${o.lock ? ' lock' : ''}"${o.lock ? ' title="Még nem használhatod"' : ''}>${o.lv}</i>` : ''}${o.up ? '<i class="tup" title="Jobb, mint amit most használsz">▲</i>' : ''}${o.tag ? `<i class="ttag">${o.tag}</i>` : ''}</span>
    <span class="ttx"><b class="tn">${name}</b><small class="ts">${sub}</small></span>
    ${o.val != null ? `<b class="tv">${o.val}<small>${o.valLbl}</small></b>` : ''}${o.n ? `<i class="tb">${o.n}</i>` : ''}${o.price ? `<i class="tprice">${o.price}</i>` : ''}</button>`;
}
const wTile = (sel, w, o = {}) => tile(sel, wPic(w), w.name, `${RARITIES[w.q].name} · ${w.base.name}`, rarColor(w),
  Object.assign({ lv: `Lv ${w.level}`, lock: !canUse(w), val: dps(w), valLbl: 'DPS', up: o.cmp && o.cmp !== w && dps(w) > dps(o.cmp) }, o));
const gearScore = it => it ? it.armor + 6 * Object.keys(it.stats).length : -1;
const gTile = (sel, it, o = {}) => tile(sel, gPic(it), it.name, (it.exo ? `Egzotikus · ${GEAR_SLOTS[it.slot]} · bármely márka` : `${GEAR_SLOTS[it.slot]} · ${BRANDS[it.brand].name}`), gCol(it),
  Object.assign({ lv: `Lv ${it.level}`, val: it.armor, valLbl: 'páncél', bc: BRANDS[it.brand].color, up: 'cmp' in o && o.cmp !== it && gearScore(it) > gearScore(o.cmp) }, o));
const emptyTile = (label, sub, pic, drop) => `<div class="tile empty"${drop ? ` data-drop="${drop}"` : ''}><span class="tpic">${pic ? `<img src="${pic}" alt="">` : ''}</span><span class="ttx"><b class="tn">${label}</b><small class="ts">${sub}</small></span></div>`;
const invLayout = (left, detail) => `<div class="inv"><div class="invl">${left}</div><aside class="invd">${detail}</aside></div>`;
const noDetail = t => `<div class="dnone">${t}</div>`;

// ---------- detail: weapon ----------
function arrow(v, c, lowBetter, digits = 0) {
  if (c == null) return '';
  const d = v - c; if (Math.abs(d) < 1e-6) return '<span class="eq">=</span>';
  const good = lowBetter ? d < 0 : d > 0;
  return `<span class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(+d.toFixed(digits))}</span>`;
}
const drow = (label, shown, cmpHTML = '', note = '', cls = '', bar = '') => `<tr class="${cls}"><td>${label}${bar}${note ? `<small>${note}</small>` : ''}</td><td>${shown}</td><td>${cmpHTML}</td></tr>`;
const pctS = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
function wCalc(w) { // everything this gun does with your current upgrades, skills and gear
  const b = w.base, M = mkOf(w), lv = Math.pow(1.08, w.level - 1), rq = 1 + w.q * .14;
  return {
    dps: dps(w), dmg: w.dmg * w.pellets, bonus: SK.dmg(w) - 1,
    roll: w.dmg / (b.dmg * lv * rq) - 1, lv: lv - 1, rq: rq - 1,
    crit: .05 + .04 * U('crit') + SK.crit(w) + G('crit') + (M.crit || 0),
    critDmg: 1.5 + .25 * U('critDmg') + SK.critDmg() + G('critDmg') + (M.critDmg || 0),
    head: (b.headMult || 2) * (1 + .15 * U('head') + SK.head() + G('head') + (M.head || 0)),
    res: resMax(w), acc: accuracy(w),
  };
}
function weaponDetail(w, cmp, actions) {
  const b = w.base, A = wCalc(w), C = cmp && cmp !== w ? wCalc(cmp) : null, c = C && cmp, el = w.element && ELEMENTS[w.element];
  const x = (k, low, dg) => C ? arrow(A[k], C[k], low, dg) : '';
  return `<div class="dhead" style="--rc:${rarColor(w)}"><div class="dband"><span class="rar">${RARITIES[w.q].name}</span> ${b.name}<i class="dlv">Lv ${w.level}</i></div>
      <div class="dname">${w.name}</div><img src="${wPic(w)}" alt="">
      <div class="dsub">${modeName(b)}${baseSpecial(b) ? ' · ' + baseSpecial(b) : ''}</div></div>
    <div class="dperk"><b>${w.maker}</b> ${mkOf(w).perk || ''}</div>
    ${!canUse(w) ? `<div class="dlock">Csak ${w.level}. szinttől használható. Addig viheted a táskában.</div>` : ''}
    ${cmp && cmp !== w ? `<div class="dcmp">Összevetve: <span style="color:${rarColor(cmp)}">${cmp.name}</span></div>` : ''}
    <table class="dtab">
      ${drow('DPS', A.dps, x('dps'))}
      ${drow('Sebzés', w.pellets > 1 ? `${w.dmg}×${w.pellets}` : w.dmg, x('dmg'), `alap ${b.dmg} · szint ${pctS(A.lv)} · ritkaság ${pctS(A.rq)} · egyedi ${pctS(A.roll)}`)}
      ${drow('Sebzésbónusz', pctS(A.bonus), x('bonus', false, 2), 'kaszt, képességek, páncél, gyártó')}
      ${drow('Tűzgyorsaság', `${w.rpm}/p`, c ? arrow(w.rpm, c.rpm) : '')}
      ${drow('Tár', w.mag, c ? arrow(w.mag, c.mag) : '')}
      ${drow(b.single ? 'Töltés / db' : 'Újratöltés', `${w.reload.toFixed(2)} mp`, c ? arrow(w.reload, c.reload, true, 2) : '', `gyorsaság ${pctS(reloadMul() - 1)}`)}
      ${drow('Pontosság', `${A.acc}%`, x('acc'))}
      ${drow('Tartalék lőszer', A.res, x('res'))}
      ${drow('Kritikus esély', `${Math.round(A.crit * 100)}%`, x('crit', false, 2))}
      ${drow('Kritikus szorzó', `×${A.critDmg.toFixed(2)}`, x('critDmg', false, 2))}
      ${drow('Fejlövés-szorzó', `×${A.head.toFixed(2)}`, x('head', false, 2))}
      ${drow('Hatótáv', `${b.range} m`, c ? arrow(b.range, c.base.range) : '')}
      ${w.roll != null ? drow('Dobás minősége', `${w.roll}%`, c && c.roll != null ? arrow(w.roll, c.roll) : '', w.roll >= 90 ? 'szinte tökéletes' : w.roll >= 70 ? 'jó dobás' : 'kalibrálható a kovácsnál', w.roll >= 90 ? 'core' : '') : ''}
    </table>
    ${el ? `<div class="delem" style="color:${el.color}">${el.name}: ${el.desc}</div>` : ''}
    ${w.unique && UNIQUES[w.unique] ? `<div class="duniq"><b>Egyedi:</b> ${UNIQUES[w.unique].trick}</div>` : ''}
    ${w.anoint && ANOINTS[w.anoint] ? `<div class="danoint"><b>Felkenés:</b> ${ANOINTS[w.anoint]}</div>` : ''}
    ${w.flavor ? `<div class="flav">${w.flavor}</div>` : ''}
    ${actions ? `<div class="dact">${actions}</div>` : ''}`;
}

// ---------- detail: armor ----------
function gearDetail(it, cmp, actions) {
  const B = BRANDS[it.brand], cnt = brandCounts()[it.brand] || 0, c = cmp && cmp !== it ? cmp : null;
  const val = (g, k) => { if (!g) return 0; let v = k === 'armor' ? g.armor : g.stats[k] || 0; if (BRANDS[g.brand].core[0] === k) v += coreVal(g); return v; };
  const keys = [...new Set(['armor', B.core[0], ...Object.keys(it.stats), ...(c ? [BRANDS[c.brand].core[0], ...Object.keys(c.stats)] : [])])];
  const rollMax = k => { const S = GSTATS[k]; return S.roll[1] * (1 + it.q * .12) * (S.flat ? 1 + .06 * (it.level - 1) : 1); };
  const rows = keys.map(k => {
    const v = val(it, k), parts = [];
    if (k === 'armor') parts.push(`alap +${it.armor}`); else if (it.stats[k]) parts.push(`tulajdonság ${fmtG(k, it.stats[k])}`);
    if (B.core[0] === k) parts.push(`márka ${fmtG(k, coreVal(it))}`);
    const d = c ? v - val(c, k) : 0;
    const cmpH = c ? (Math.abs(d) < 1e-6 ? '<span class="eq">=</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${fmtG(k, Math.abs(d)).slice(1)}</span>`) : '';
    const bar = it.stats[k] ? `<i class="rbar" title="A dobás minősége" style="--p:${Math.min(100, Math.round(it.stats[k] / rollMax(k) * 100))}%"></i>` : '';
    return drow(GSTATS[k].name, v ? fmtG(k, v) : '—', cmpH, parts.join(' · '), B.core[0] === k ? 'core' : '', bar);
  }).join('');
  const pipsB = `<span class="bpips">${[1, 2, 3, 4].map(n => `<i class="${n <= cnt ? 'on' : ''}"></i>`).join('')}</span>`;
  const next = B.sets.find(([n]) => n > cnt);
  const sets = B.sets.map(([n, k, v]) => `<li class="${cnt >= n ? 'on' : ''}"><span>${n} db</span>${GSTATS[k].name} ${fmtG(k, v)}</li>`).join('');
  return `<div class="dhead" style="--rc:${gCol(it)}"><div class="dband"><span class="rar">${it.exo ? 'Egzotikus' : RARITIES[it.q].name}</span> ${GEAR_SLOTS[it.slot]}<i class="dlv">Lv ${it.level}</i></div>
      <div class="dname">${it.name}</div><img src="${gPic(it)}" alt="">
      <div class="dsub"><span style="color:${B.color}">${B.name}</span> · ${B.tag}</div></div>
    ${c ? `<div class="dcmp">Összevetve a viselt darabbal: <span style="color:${RARITIES[c.q].color}">${c.name}</span></div>` : ''}
    ${it.exo && EXOTICS[it.exo] ? `<div class="duniq" style="border-color:${EXO_COL}"><b>Egzotikus tehetség:</b> ${EXOTICS[it.exo].talent}</div>` : ''}
    <table class="dtab" style="--bc:${B.color}">${rows}</table>
    <div class="dsets" style="--bc:${B.color}"><b>${B.name}</b> ${pipsB} <small>${cnt}/4 viselve</small><ul>${sets}</ul>
      ${B.t4 ? `<p class="dt4${cnt >= 4 ? ' on' : ''}"><b>4 db · ${B.t4[0]}:</b> ${B.t4[1]}</p>` : ''}
      ${next ? `<p class="dnext">Még ${next[0] - cnt} darab: ${GSTATS[next[1]].name} ${fmtG(next[1], next[2])}</p>` : ''}</div>
    ${actions ? `<div class="dact">${actions}</div>` : ''}`;
}
// consumables in the shop
function itemDetail(k, actions) {
  const I = ITEMS[k];
  return `<div class="dhead" style="--rc:${I.color}"><div class="dband"><span class="rar">Felszerelés</span> [${I.key}] gomb</div>
      <div class="dname">${I.name}</div><img class="dico" src="${ICONS[k]}" alt=""><div class="dsub">${I.desc}</div></div>
    <table class="dtab">${drow('Nálad', `${profile.inv[k]} / ${itemMax(k)}`)}${drow('Egyszerre', k === 'knife' ? '3 db' : '1 db')}</table>
    ${actions ? `<div class="dact">${actions}</div>` : ''}`;
}

// ---------- keyboard: shortcuts from the selected item's buttons, arrows move the selection ----------
function updateKeybar(root) {
  const bar = $('keybar'), inv = root.querySelector('.inv');
  if (!inv) { bar.innerHTML = ''; return; }
  const acts = [...inv.querySelectorAll('.invd [data-key]')].map(b => `<span${b.disabled ? ' class="off"' : ''}><kbd>${KEY_LABEL[b.dataset.key]}</kbd>${b.textContent.replace(KEY_LABEL[b.dataset.key], '')}</span>`);
  bar.innerHTML = `<span><kbd>←↑↓→</kbd>Választás</span>${acts.join('')}`;
}
function invKey(e, root) {
  if (!root.querySelector('.inv')) return false;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.code]) {
    e.preventDefault();
    const tiles = [...root.querySelectorAll('.tile[data-act]')], cur = root.querySelector('.tile.on') || tiles[0]; if (!cur) return true;
    const [dx, dy] = arrows[e.code], r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bd = Infinity;
    for (const t of tiles) { // nearest tile in that direction, same row / column preferred
      if (t === cur) continue;
      const r = t.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = dx ? x * dx : y * dy, side = dx ? Math.abs(y) : Math.abs(x);
      if (along <= 4) continue;
      const d = along + side * 3; if (d < bd) { bd = d; best = t; }
    }
    if (best) { best.click(); const n = root.querySelector('.tile.on'); if (n) n.scrollIntoView({ block: 'nearest' }); }
    return true;
  }
  const b = root.querySelector(`.invd [data-key="${e.code}"]`);
  if (!b) return false;
  if (b.dataset.hact) { if (!e.repeat) b.disabled ? SND.deny() : startHold(b, root); return true; }
  if (!b.disabled) b.click(); else SND.deny();
  return true;
}

// ---------- drag and drop between hands, bag, stash, worn armor and the armor lists ----------
// a drop becomes the same action a button would send ("mv:B:2:L:0", "wear:3", ...), fired through the screen's own click handler
function dropAct(from, to) {
  const [fl, fi] = from.split(':'), [tl, ti] = to.split(':');
  if (tl === 'ground') return fl === 'L' || fl === 'B' ? `drop:${fl}:${fi}` : fl === 'M' ? `gdrop:${fi}` : null;
  if (fl === 'G' && tl === 'H') return `gshare:${fi}`;
  if (fl === 'H' && tl === 'G') return `gunshare:${fi}`;
  if ('LBSK'.includes(fl) && 'LBSK'.includes(tl)) {
    if (tl === 'L') return ti !== undefined && ti !== '' ? `mv:${fl}:${fi}:L:${ti}` : `mv:${fl}:${fi}:L:${freeHand(dragLists().L)}`;
    return fl === tl ? null : `mv:${fl}:${fi}:${tl}`;
  }
  if ((fl === 'G' || fl === 'M') && tl === 'W') return `wear:${fi}`;
  if (fl === 'W' && (tl === 'G' || tl === 'M')) return `unwear:${fi}`;
  return null;
}
const dragLists = () => state === 'paused' ? { L: player.slots } : { L: profile.loadout };
function fireAct(root, act) { const b = document.createElement('button'); b.dataset.act = act; b.hidden = true; root.appendChild(b); b.click(); b.remove(); }
function dropTarget(el) { // a hand or worn tile is its own slot; otherwise the list it sits in
  const t = el.closest('.tile[data-act^="sel:"]'), sel = t && t.dataset.act.slice(4);
  if (sel && (sel[0] === 'L' || sel[0] === 'W')) return sel[0] === 'W' ? 'W' : sel;
  const d = el.closest('[data-drop]'); return d ? d.dataset.drop : null;
}
// root: where drags start; fireRoot: whose click handler runs the action; ground: dropping outside the lists throws it away
function enableDrag(root, fireRoot = root, ground = false) {
  let from = null;
  const target = el => dropTarget(el) || (ground && el.closest && !el.closest('.invd,.pbtns') ? 'ground' : null);
  root.addEventListener('dragstart', e => {
    const t = e.target.closest && e.target.closest('.tile[draggable]'); if (!t) return;
    from = t.dataset.act.slice(4); e.dataTransfer.setData('text/plain', from); e.dataTransfer.effectAllowed = 'move';
    t.classList.add('dragging'); root.classList.add('dnd');
  });
  root.addEventListener('dragend', () => { from = null; root.classList.remove('dnd', 'ground'); root.querySelectorAll('.dragging,.dropok').forEach(x => x.classList.remove('dragging', 'dropok')); });
  root.addEventListener('dragover', e => {
    if (!from) return; const to = target(e.target); if (!to || !dropAct(from, to)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; root.classList.toggle('ground', to === 'ground');
    const el = e.target.closest('.tile[data-act^="sel:L"],.tile[data-act^="sel:W"]') || e.target.closest('[data-drop]');
    root.querySelectorAll('.dropok').forEach(x => x !== el && x.classList.remove('dropok')); if (el) el.classList.add('dropok');
  });
  root.addEventListener('drop', e => {
    if (!from) return; e.preventDefault();
    const act = dropAct(from, target(e.target) || ''); from = null; root.classList.remove('ground');
    if (act) fireAct(fireRoot, act);
  });
}

// ---------- hold-to-confirm buttons (destroying things): hold the mouse button or the key until the bar fills ----------
const HOLD_T = .9; let holding = null;
function startHold(b, root) {
  if (holding || b.disabled) return;
  const h = holding = { b, t0: performance.now() };
  const step = () => {
    if (holding !== h) return;
    const p = (performance.now() - h.t0) / 1000 / HOLD_T;
    b.style.setProperty('--hp', Math.min(1, p) * 100 + '%');
    if (p >= 1) { holding = null; fireAct(root, b.dataset.hact); } else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function endHold() { if (holding) { holding.b.style.setProperty('--hp', '0%'); holding = null; } }
addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('.sbtn.hold'); if (b) startHold(b, b.closest('#loadout,#hubBody') || document.body); }, true);
addEventListener('pointerup', endHold, true);
addEventListener('keyup', e => { if (holding && holding.b.dataset.key === e.code) endHold(); });
