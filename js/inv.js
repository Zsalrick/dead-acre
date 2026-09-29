// ================= INVENTORY VIEW (Division style) =================
// left: tiles with a picture, name and level · right: the selected item with its stats broken down and compared.
// Tiles and buttons carry data-act; "sel:<list>:<key>" selects, everything else is handled by the screen that shows it.
let invSel = 'L:0';

// ---------- armor pictures (drawn once per shape + brand color) ----------
const gearIcons = {}, gearCanvases = {}; // data URL for the HTML tiles, the canvas itself for the 3D drop
function gearCanvas(slot, color, name = '') { // the drawing; gearIcon turns it into a data URL only when a menu needs one
  const kind = /sapka/i.test(name) ? 'cap' : /álarc/i.test(name) ? 'mask' : /bányász/i.test(name) ? 'miner' : /kabát/i.test(name) ? 'coat' : /óra/i.test(name) ? 'watch' : /cédula/i.test(name) ? 'tags' : /rózsa/i.test(name) ? 'beads' : slot;
  const key = kind + color; if (gearCanvases[key]) return gearCanvases[key];
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
  } else if (slot === 'gloves') { // a pair of gloves
    const glove = (ox, sh) => { g.globalAlpha = sh; poly([[ox, 150], [ox, 80], [ox + 6, 40], [ox + 18, 40], [ox + 20, 70], [ox + 26, 30], [ox + 38, 30], [ox + 40, 70], [ox + 46, 34], [ox + 58, 34], [ox + 60, 76], [ox + 66, 50], [ox + 78, 54], [ox + 74, 110], [ox + 70, 150]]); dark(ox, 128, 70, 10); stitch(ox + 10, 100, ox + 60, 100); g.globalAlpha = 1; };
    glove(150, .55); glove(96, 1);
  } else if (slot === 'acc') { // a necklace, dog tags, a rosary or a watch
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.6)';
    if (kind === 'watch') { ink(); g.fillRect(146, 20, 28, 140); g.strokeRect(146, 20, 28, 140); g.beginPath(); g.arc(160, 90, 34, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(160, 90, 24, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 3; g.beginPath(); g.moveTo(160, 90); g.lineTo(160, 74); g.moveTo(160, 90); g.lineTo(172, 94); g.stroke(); }
    else { g.strokeStyle = color; g.lineWidth = 4; g.setLineDash(kind === 'beads' ? [2, 6] : [7, 4]); g.beginPath(); g.ellipse(160, 60, 70, 60, 0, .15, Math.PI - .15); g.stroke(); g.setLineDash([]);
      if (kind === 'tags') { poly([[132, 112], [162, 112], [162, 160], [132, 160]]); poly([[150, 106], [180, 106], [180, 154], [150, 154]]); dark(156, 120, 18, 4); dark(156, 130, 18, 4); }
      else if (kind === 'beads') { ink(); g.fillRect(155, 116, 10, 46); g.fillRect(142, 128, 36, 10); }
      else { ink(); g.beginPath(); g.moveTo(160, 112); g.lineTo(182, 138); g.lineTo(160, 164); g.lineTo(138, 138); g.closePath(); g.fill(); g.stroke(); shine(152, 128, 8, 8); } }
  } else if (slot === 'legs') {
    poly([[110, 22], [210, 22], [222, 164], [180, 164], [160, 78], [140, 164], [98, 164]]);
    dark(110, 22, 100, 14); dark(114, 96, 28, 24); dark(178, 96, 28, 24); stitch(120, 40, 112, 160); stitch(200, 40, 208, 160);
  } else {
    const boot = (ox, sh) => { g.globalAlpha = sh; poly([[ox, 30], [ox + 46, 30], [ox + 48, 112], [ox + 104, 126], [ox + 108, 150], [ox - 4, 150]]); dark(ox - 4, 140, 112, 10); stitch(ox + 8, 50, ox + 40, 50); stitch(ox + 8, 70, ox + 40, 70); stitch(ox + 8, 90, ox + 40, 90); g.globalAlpha = 1; };
    boot(128, .55); boot(90, 1);
  }
  return gearCanvases[key] = c;
}
function gearIcon(slot, color, name = '') { const c = gearCanvas(slot, color, name); return c.url || (c.url = c.toDataURL()); } // PNG encoding is slow: once per picture, and never for a drop on the ground
const wPic = w => gunShot(w.base, w.q);
const gPic = it => gearIcon(it.slot, BRANDS[it.brand].color, it.name);

// ---------- tiles: a card with the picture on top ----------
// o: lv · lock (under your level) · badge ('ÚJ', '★ KEDVENC', 'KUKA') · rar (the small coloured line) · val (right of the bottom line, html) · n (hand number) · exp · cant · bc (brand color)
function tile(sel, pic, name, sub, color, o = {}) {
  const badge = `<span class="tbadges">${o.lockLv ? `<i class="tbadge lock">${o.lockLv}. szinttől</i>` : ''}${(o.badge || o.tag) ? `<i class="tbadge${o.badgeCls ? ' ' + o.badgeCls : ''}">${o.badge || o.tag}</i>` : ''}</span>`; // level lock on top, new / favourite / trash under it
  return `<button class="tile${invSel === sel ? ' on' : ''}${o.cant ? ' cant' : ''}" data-act="sel:${sel}" draggable="true" style="--rc:${color}${o.bc ? `;--bc:${o.bc}` : ''}">
    <span class="tpic"><img src="${pic}" alt="">${o.lv ? `<i class="tlv${o.lockLv ? ' lock' : ''}">${o.lv}</i>` : ''}${badge}${o.n ? `<kbd class="tkey">${o.n}</kbd>` : ''}${o.exp && !o.n ? `<i class="texp" title="Szakértelem ${o.exp}/10">✦${o.exp}</i>` : ''}</span>
    <span class="ttx">${o.rar ? `<small class="trar">${o.rar}</small>` : ''}<b class="tn">${name}</b><span class="tmeta"><small class="ts">${sub}</small>${o.val != null ? `<b class="tv">${o.val}</b>` : ''}</span></span></button>`;
}
const delta = (d, lowBetter, fmt = v => Math.round(v)) => !d ? '' : `<em class="${(lowBetter ? d < 0 : d > 0) ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}</em>`;
const tBadge = x => x.isNew ? ['ÚJ', ''] : x.fav ? ['★ Kedvenc', 'fav'] : x.junk ? ['Kuka', 'junk'] : [null, ''];
const wTile = (sel, w, o = {}) => { const [bg, bc] = tBadge(w), d = o.cmp && o.cmp !== w ? dps(w) - dps(o.cmp) : 0;
  return tile(sel, wPic(w), w.name, o.price ? `DPS ${dps(w)}` : o.sub || `${w.base.name}${o.n ? '' : ' · ' + w.maker}`, rarColor(w),
    Object.assign({ rar: w.unique ? 'Egzotikus' : RARITIES[w.q].name, badge: bg, badgeCls: bc, exp: w.exp, lv: `Lv ${w.level}`, lockLv: !canUse(w) && w.level, val: o.price ? `<span class="tp">${o.price}</span>${delta(d)}` : `DPS ${dps(w)}${delta(d)}` }, o)); };
const gearScore = it => it ? it.armor + 6 * Object.keys(it.stats).length : -1;
const gTile = (sel, it, o = {}) => { const [bg, bc] = tBadge(it), d = o.cmp && o.cmp !== it ? it.armor - o.cmp.armor : 0;
  return tile(sel, gPic(it), it.name, it.exo ? `${GEAR_SLOTS[it.slot]} · bármely márka` : `${GEAR_SLOTS[it.slot]} · ${BRANDS[it.brand].name}`, gCol(it),
    Object.assign({ rar: it.exo ? 'Egzotikus' : RARITIES[it.q].name, badge: bg, badgeCls: bc, exp: it.exp, lv: `Lv ${it.level}`, lockLv: !canUse(it) && it.level, bc: BRANDS[it.brand].color, val: o.price ? `<span class="tp">${o.price}</span>${delta(d)}` : `Páncél ${it.armor}${delta(d)}` }, o)); };
const emptyTile = (label, sub, pic, drop) => `<div class="tile empty"${drop ? ` data-drop="${drop}"` : ''} data-tip="${[label, sub].filter(Boolean).join(' · ').replace(/"/g, '&quot;')}"></div>`;
// double-click a tile: its main [F] action (buy, equip); a tile already on you does nothing
let lastSel = { s: '', t: 0 };
function selDbl(root, sel) {
  const t = performance.now(), d = lastSel.s === sel && t - lastSel.t < 450; lastSel = { s: d ? '' : sel, t };
  if (!d || /^[LW]:/.test(sel)) return;
  const b = root.querySelector('.invd [data-act][data-key="KeyF"]'); if (b && !b.disabled) b.click(); else SND.deny();
}
// right-click a tile: a small menu with what it is and everything it can do (the detail panel's buttons)
function closeCtx() { document.querySelectorAll('.ctxm').forEach(m => m.remove()); }
addEventListener('contextmenu', e => {
  closeCtx(); const t = e.target.closest && e.target.closest('.tile[data-act^="sel:"]'), root = t && t.closest('#hubBody,#loadout'); if (!root) return;
  lastSel = { s: '', t: 0 }; t.click(); // selected: the detail panel now holds its actions
  const btns = [...root.querySelectorAll('.invd [data-act], .invd [data-hact]')].filter(b => !b.closest('.tile') && b.classList.contains('sbtn')); if (!btns.length) return;
  const nm = root.querySelector('.invd .dname'), sub = root.querySelector('.invd .dband, .invd .dsub'), m = document.createElement('div'); m.className = 'ctxm';
  m.innerHTML = '<div class="ctxh"><b></b><small></small></div>'; m.querySelector('b').textContent = nm ? nm.firstChild.textContent : ''; // the name without the roll tag m.querySelector('small').textContent = sub ? sub.innerText.replace(/\s+/g, ' ') : '';
  btns.forEach(b => { const c = b.cloneNode(true); c.removeAttribute('data-key'); m.appendChild(c); });
  const kb = $('keybar'), lim = (kb && !kb.hidden ? kb.getBoundingClientRect().top : innerHeight) - 8; // stay above the key bar
  root.appendChild(m); m.style.maxHeight = (lim - 8) / (m.currentCSSZoom || 1) + 'px'; const r = m.getBoundingClientRect();
  const z = m.currentCSSZoom || 1; // inside the scaled UI: position in its own (zoomed) pixels
  m.style.left = Math.min(e.clientX, innerWidth - r.width - 8) / z + 'px'; m.style.top = Math.max(8, Math.min(e.clientY, lim - r.height)) / z + 'px';
});
addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('.ctxm'))) closeCtx(); }, true);
addEventListener('keydown', e => { if (e.code === 'Escape') closeCtx(); }, true);
addEventListener('click', e => { if (e.target.closest && e.target.closest('.ctxm [data-act]')) setTimeout(closeCtx, 0); });
// two columns (a wide list | detail) or three (your hands / what's on you | the list | detail), like the design
const invLayout = (left, detail, mid) => mid == null ? `<div class="inv two"><div class="invm">${left}</div><aside class="invd">${detail}</aside></div>`
  : `<div class="inv"><div class="invl">${left}</div><div class="invm">${mid}</div><aside class="invd">${detail}</aside></div>`;
function markCta(root) { // the detail panel shows one big button (the [F] one); the rest live in the key bar and the right-click menu
  root.querySelectorAll('.invd .dact').forEach(d => {
    const bs = d.querySelectorAll(':scope > .sbtn'), b = d.querySelector(':scope > .sbtn[data-key="KeyF"]') || bs[0]; if (b) b.classList.add('cta');
    if (bs.length > 1) d.insertAdjacentHTML('beforeend', '<div class="dmore">Minden művelet: jobb klikk a tárgyon, vagy a lenti billentyűsor</div>');
  });
  const iv = root.querySelector('.invd'), t = root.querySelector('.invd > [style*="--rc"]'); if (iv && t) iv.style.setProperty('--rc', t.style.getPropertyValue('--rc'));
}
// the UI is laid out for 1920×1080 and scaled to the window
function setUiZ() { // the player's own sizes on top (Beállítások → Felület)
  const z = clamp(Math.min(innerWidth / 1920, innerHeight / 1080), .72, 1.5), r = document.documentElement.style;
  r.setProperty('--uiz', clamp(z * (SET.uiScale || 1), .6, Math.min(innerWidth / 1450, innerHeight / 820))); // the three-column pages need ~1450 px of room r.setProperty('--huz', clamp(z * (SET.hudScale || 1), .6, Math.min(innerWidth / 1420, innerHeight / 800))); // the HUD never outgrows the screen: its corners would meet in the middle
}
addEventListener('resize', setUiZ); setUiZ();
// a re-render keeps every scrolled list where it was (matched by tag, class and order), whatever the layout
function keepScroll(root, render) {
  const key = e => e.tagName + '.' + e.className, saved = {};
  for (const e of root.querySelectorAll('*')) if (e.scrollTop > 0) { const k = key(e); (saved[k] || (saved[k] = [])).push([[...root.querySelectorAll(e.tagName)].filter(x => key(x) === k).indexOf(e), e.scrollTop]); }
  const top = root.scrollTop; render(); root.scrollTop = top;
  for (const k in saved) { const all = [...root.querySelectorAll(k.split('.')[0])].filter(x => key(x) === k); for (const [i, t] of saved[k]) if (all[i]) all[i].scrollTop = t; }
}
const noDetail = t => `<div class="dnone">${t}</div>`;

// ---------- detail: weapon ----------
function arrow(v, c, lowBetter, digits = 0) {
  if (c == null) return '';
  const d = v - c; if (Math.abs(d) < 1e-6) return '<span class="eq">=</span>';
  const good = lowBetter ? d < 0 : d > 0;
  return `<span class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(+d.toFixed(digits))}</span>`;
}
const drow = (label, shown, cmpHTML = '', note = '', cls = '', bar = '') => `<tr class="${cls}"><td>${label}${bar}${note ? `<small>${note}</small>` : ''}</td><td>${shown}</td><td>${cmpHTML}</td></tr>`;
const rbarOf = (v, a, b) => `<i class="rbar" style="--p:${Math.round(clamp((v - a) / Math.max(1e-6, b - a), 0, 1) * 100)}%"></i>`;
const pctS = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
function wCalc(w) { // everything this gun does with your current upgrades, skills and gear
  const b = w.base, M = mkOf(w), lv = Math.pow(1.08, w.level - 1), rq = 1 + w.q * .14;
  return {
    dps: dps(w), dmg: w.dmg * w.pellets, bonus: SK.dmg(w) - 1,
    roll: w.dmg / (b.dmg * lv * rq) - 1, lv: lv - 1, rq: rq - 1,
    crit: Math.min(CRIT_CAP, wCrit(w) + .04 * U('crit') + SK.crit(w) + G('crit') + (M.crit || 0)), critRaw: wCrit(w) + .04 * U('crit') + SK.crit(w) + G('crit') + (M.crit || 0), // above the cap it counts as the cap
    critDmg: wCdmg(w) + .25 * U('critDmg') + SK.critDmg() + G('critDmg') + (M.critDmg || 0),
    head: (b.headMult || 2) * (1 + .15 * U('head') + SK.head() + G('head') + (M.head || 0)),
    res: resMax(w), acc: accuracy(w),
  };
}
const MAKER_COL = { xfcv: '#6fb4ff', kessler: '#e0a040', voss: '#9fd36a', harrow: '#e05a5a', ironmark: '#a8b0b8', novak: '#c77dff', crane: '#f2d27a', bellwether: '#5ad0c0', ostrava: '#ff8c5a' };
const makerLogo = mk => { const M = MAKERS[mk] || {}, n = (M.name || '?').split(/[\s&]+/).filter(Boolean); return `<span class="mlogo" style="--mc:${MAKER_COL[mk] || '#aaa'}">${(n.length > 1 ? n[0][0] + n[1][0] : n[0].slice(0, 2)).toUpperCase()}</span>`; };
const dtal = (kind, name, text, col) => `<div class="dtal"${col ? ` style="--tc:${col}"` : ''}><small>${kind}</small>${name ? `<b>${name}</b>` : ''}<span>${text}</span></div>`;
// where each random roll landed, 0..1 (worst..best): worked back from the stats, the gun only stores the totals
function rollsOf(w) {
  const c = unpackW(packW(w)); ocStrip(c); const b = BASES.find(x => x.id === w.base.id) || w.base, M = mkOf(w), q = Math.min(4, w.q), p = r => clamp((r + 1) / 2, 0, 1);
  return {
    dmg: p(c.dmg / (w.unique ? 1.12 : 1) / (b.dmg * Math.pow(1.08, w.level - 1) * (1 + q * .14)) / .15 - 1 / .15),
    rate: p((c.rpm / (b.rpm * (1 + q * .04) * (1 + (M.rpm || 0))) - 1) / .12),
    mag: b.fixedMag ? null : p((c.mag / (b.mag * (1 + q * .08) * (1 + (M.mag || 0))) - 1) / .2),
    reload: p((1 - c.reload / (b.reload * (1 - q * .05) * (1 - (M.reload || 0)))) / .15),
    acc: p((1 - c.spread / (b.spread * (1 - q * .06) * (1 - (M.acc || 0)))) / .22),
  };
}
// optimization (the forge): push one roll up the range; the stat is rebuilt from the base as if it had rolled that high
const OPT_STATS = [['dmg', 'Sebzés'], ['rate', 'Tűzgyorsaság'], ['mag', 'Tár'], ['reload', 'Újratöltés'], ['acc', 'Pontosság'], ['crit', 'Kritikus esély'], ['cdmg', 'Kritikus szorzó']];
const OPT_STEP = .1;
function critRoll(w) { const R = critRange(w); return clamp((wCrit(w) - Math.min(4, w.q) * .004 - R[0]) / (R[1] - R[0]), 0, 1); }
const cdmgRoll = w => { const R = critRange(w); return clamp((wCdmg(w) - R[2]) / (R[3] - R[2]), 0, 1); };
const rollOf = (w, k) => k === 'crit' ? critRoll(w) : k === 'cdmg' ? cdmgRoll(w) : rollsOf(w)[k];
const optCost = (w, p) => ({ parts: Math.round((4 + 12 * p) * (1 + Math.min(4, w.q) * .5)), cash: Math.round(150 * (1 + w.level / 5) * (1 + 2 * p) / 10) * 10 });
function optimize(w, k) {
  const p = rollOf(w, k); if (p == null || p >= .999) return false;
  const np = Math.min(1, p + OPT_STEP), r = 2 * np - 1, b = BASES.find(x => x.id === w.base.id) || w.base, M = mkOf(w), q = Math.min(4, w.q), R = critRange(w);
  ocStrip(w);
  if (k === 'dmg') w.dmg = Math.max(w.dmg + 1, Math.round(b.dmg * Math.pow(1.08, w.level - 1) * (1 + q * .14) * (1 + r * .15) * (w.unique ? 1.12 : 1)));
  if (k === 'rate') w.rpm = Math.max(w.rpm + 1, Math.round(b.rpm * (1 + q * .04) * (1 + r * .12) * (1 + (M.rpm || 0))));
  if (k === 'mag') w.mag = Math.max(w.mag + (np < 1 || w.mag < Math.round(b.mag * (1 + q * .08) * 1.2 * (1 + (M.mag || 0))) ? 1 : 0), Math.round(b.mag * (1 + q * .08) * (1 + r * .2) * (1 + (M.mag || 0))));
  if (k === 'reload') w.reload = Math.min(w.reload - .01, +(b.reload * (1 - q * .05) * (1 - r * .15) * (1 - (M.reload || 0))).toFixed(2));
  if (k === 'acc') w.spread = b.spread * (1 - q * .06) * (1 - r * .22) * (1 - (M.acc || 0));
  if (k === 'crit') w.crit = +(R[0] + np * (R[1] - R[0]) + q * .004).toFixed(3);
  if (k === 'cdmg') w.cdmg = +(R[2] + np * (R[3] - R[2])).toFixed(2);
  ocApply(w);
  const RL = rollsOf(w); w.roll = Math.round(['dmg', 'rate', 'mag', 'reload', 'acc'].reduce((a, s) => a + (RL[s] == null ? .5 : RL[s]), 0) / 5 * 100);
  return true;
}
const rbarP = p => p == null ? '' : `<i class="rbar roll" style="--p:${Math.round(p * 100)}%"></i>`;
// one stat row: name · roll bar (null: none) · value · change against the compared item
const srw = (label, val, cmpHTML = '', bar = null, tip = '', cls = '') => `<div class="srw${cls ? ' ' + cls : ''}"${tip ? ` data-tip="${String(tip).replace(/"/g, '&quot;')}"` : ''}><span>${label}</span>${bar == null ? (cls.includes('minor') ? '' : '<span></span>') : `<i class="sb"><i style="width:${Math.round(clamp(bar, 0, 1) * 100)}%"></i></i>`}<b>${val}</b>${cmpHTML || '<em></em>'}</div>`;
const dlt = (v, c, lowBetter, dg = 0) => { if (c == null) return ''; const d = v - c; if (Math.abs(d) < 1e-6) return '<em class="eq">=</em>'; return `<em class="${(lowBetter ? d < 0 : d > 0) ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(+d.toFixed(dg))}</em>`; };
const dbox = (kind, name, text, col) => `<div class="dbox"${col ? ` style="--tc:${col}"` : ''}><small>${kind}</small>${name ? `<b>${name}</b>` : ''}${text ? `<span>${text}</span>` : ''}</div>`;
const expPips = n => `<span class="pips">${Array.from({ length: 10 }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
const rollTagP = p => p == null ? '' : `<span class="rtag ${p >= 90 ? 'r4' : p >= 75 ? 'r3' : p >= 50 ? 'r2' : 'r1'}">${p}%</span>`, rollTag = w => rollTagP(w.roll); // the roll at a glance
const gRoll = it => { const R = gRolls(it); return R.length ? Math.round(R.reduce((a, r) => a + r[2], 0) / R.length * 100) : null; }; // an armour piece's roll: its values' average place in their ranges
function weaponDetail(w, cmp, actions) {
  const b = w.base, A = wCalc(w), C = cmp && cmp !== w ? wCalc(cmp) : null, c = C && cmp, el = w.element && ELEMENTS[w.element], RL = rollsOf(w), R = critRange(w);
  const x = (k, low, dg) => C ? dlt(A[k], C[k], low, dg) : '';
  return `<div class="dscroll" style="--rc:${rarColor(w)}">
    <div class="dvimg"><img src="${wPic(w)}" alt=""><div class="dammo" data-tip="${CAT_NAMES[CAT[b.id]] || ''} lőszert használ"><img src="${ammoURL(CAT[b.id])}" alt=""><small>${CAT_NAMES[CAT[b.id]] || ''}</small></div></div>
    <div class="dvhead"><div class="dk">${w.unique ? 'Egzotikus' : RARITIES[w.q].name} · Lv ${w.level}</div><div class="dname">${w.name}${rollTag(w)}</div>
      <div class="dsub">${b.name} · ${modeName(b)}${baseSpecial(b) ? ' · ' + baseSpecial(b) : ''} · ${w.maker}</div>${mkOf(w).perk ? `<div class="dperk">${w.maker}: ${mkOf(w).perk}</div>` : ''}</div>
    <div class="dvbody">
      ${!canUse(w) ? `<div class="dlock">Csak ${w.level}. szinttől használható. Addig viheted a táskában.</div>` : ''}
      ${c ? `<div class="dcmp">összevetve: <span style="color:${rarColor(c)}">${c.name}</span></div>` : ''}
      <div class="srows">
        ${srw('DPS', A.dps, x('dps'), w.roll != null ? w.roll / 100 : null, 'Másodpercenkénti sebzés egy teljes tárral és újratöltéssel. A csík: a véletlen értékek összesített minősége.')}
        ${srw('Sebzés', w.pellets > 1 ? `${w.dmg}×${w.pellets}` : w.dmg, x('dmg'), RL.dmg, `alap ${b.dmg} · szint ${pctS(A.lv)} · ritkaság ${pctS(A.rq)} · véletlen ${pctS(A.roll)}`)}
        ${srw('Tűzgyorsaság', `${w.rpm}/p`, c ? dlt(w.rpm, c.rpm) : '', RL.rate)}
        ${srw('Tár', w.mag, c ? dlt(w.mag, c.mag) : '', RL.mag)}
        ${srw(b.single ? 'Töltés / db' : 'Újratöltés', `${w.reload.toFixed(2)} mp`, c ? dlt(w.reload, c.reload, true, 2) : '', RL.reload, `gyorsaság ${pctS(reloadMul() - 1)}`)}
        ${srw('Pontosság', `${A.acc}%`, x('acc'), RL.acc)}
        ${srw('Kritikus esély', A.critRaw > CRIT_CAP ? `<span class="cmax">${Math.round(CRIT_CAP * 100)}% (max)</span>` : `${Math.round(A.crit * 100)}%`, C ? dlt(Math.round(A.crit * 100), Math.round(C.crit * 100)) : '', clamp((wCrit(w) - R[0]) / (R[1] + .016 - R[0]), 0, 1), `fegyver ${Math.round(wCrit(w) * 1000) / 10}% · a többi: felszerelés, képességek, gyártó`)}
      </div>
      <div class="srows">
        ${srw('Kritikus szorzó', `×${A.critDmg.toFixed(2)}`, x('critDmg', false, 2), null, `fegyver ×${wCdmg(w).toFixed(2)}`, 'minor')}
        ${srw('Fejlövés-szorzó', `×${A.head.toFixed(2)}`, x('head', false, 2), null, '', 'minor')}
        ${srw('Sebzésbónusz', pctS(A.bonus), x('bonus', false, 2), null, 'kaszt, képességek, páncél, gyártó, szakértelem', 'minor')}
        ${srw('Hatótáv', `${b.range} m`, c ? dlt(b.range, c.base.range) : '', null, '', 'minor')}
        ${srw('Tartalék lőszer', A.res, x('res'), null, '', 'minor')}
      </div>
      <div class="dboxes">
        ${w.unique && UNIQUES[w.unique] ? dbox('Egzotikus tehetség', UNIQUES[w.unique].name, UNIQUES[w.unique].trick, '#ff5a4a') : ''}
        ${w.tal && TALENTS[w.tal] ? dbox('Tehetség', TALENTS[w.tal].name, TALENTS[w.tal].desc, '#ffd23f') : ''}
        ${w.anoint && ANOINTS[w.anoint] ? dbox('Felkenés', anoName(w.anoint), ANOINTS[w.anoint], '#6ff0c8') : ''}
        ${w.oc && OVERCLOCKS[w.oc] ? dbox('Túlhajtás', OVERCLOCKS[w.oc].name, OVERCLOCKS[w.oc].desc, '#b48cff') : ''}
        ${el ? dbox('Elem', el.name, el.desc, el.color) : dbox('Elem', KINETIC.name, KINETIC.desc, KINETIC.color)}
        ${dbox('Szakértelem', `${w.exp || 0}/10 · +${2 * (w.exp || 0)}% sebzés`, expPips(w.exp || 0) + ((w.exp || 0) < 10 ? '<span>A kovácsnál fejleszthető.</span>' : ''), '#f0a024')}
      </div>
      ${w.flavor ? `<div class="flav">${w.flavor}</div>` : ''}
    </div></div>
    ${actions ? `<div class="dact">${actions}</div>` : ''}`;
}

// ---------- detail: armor ----------
function gearDetail(it, cmp, actions) {
  const tb = it.exo ? exoTarget() : it.brand, B = BRANDS[tb || it.brand], cnt = tb ? brandCounts()[tb] || 0 : 0, c = cmp && cmp !== it ? cmp : null; // an exotic shows the set it counts toward now
  const val = (g, k) => { if (!g) return 0; let v = k === 'armor' ? g.armor : g.stats[k] || 0; if (!g.exo && BRANDS[g.brand].core[0] === k) v += coreVal(g); return v; };
  const keys = [...new Set(['armor', ...(it.exo ? [] : [B.core[0]]), ...Object.keys(it.stats), ...(c ? [...(c.exo ? [] : [BRANDS[c.brand].core[0]]), ...Object.keys(c.stats)] : [])])];
  const rollMax = k => { const S = GSTATS[k]; return S.roll[1] * (1 + it.q * .12) * (S.flat ? 1 + .06 * (it.level - 1) : 1); };
  const rows = keys.map(k => {
    const v = val(it, k), parts = [];
    if (k === 'armor') parts.push(`alap +${it.armor}`); else if (it.stats[k]) parts.push(`tulajdonság ${fmtG(k, it.stats[k])}`);
    if (!it.exo && B.core[0] === k) parts.push(`márka ${fmtG(k, coreVal(it))}`);
    const d = c ? v - val(c, k) : 0, p = it.stats[k] ? Math.min(1, it.stats[k] / rollMax(k)) : null;
    const cmpH = c ? (Math.abs(d) < 1e-6 ? '<em class="eq">=</em>' : `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${fmtG(k, Math.abs(d)).slice(1)}</em>`) : '';
    return srw(k === 'armor' ? 'Páncél' : GSTATS[k].name, v ? (k === 'armor' ? Math.round(v) : fmtG(k, v)) : '—', cmpH, k === 'armor' ? null : p, parts.join(' · '), !it.exo && B.core[0] === k ? 'core' : '');
  }).join('');
  const next = B.sets.find(([n]) => n > cnt), sets = B.sets.map(([n, k, v]) => `${n} db: ${GSTATS[k].name} ${fmtG(k, v)}`).join(' · ');
  const setLine = (on, t) => `<span style="color:${on ? 'var(--tx)' : 'var(--tx4)'}">${on ? '✓' : '·'} ${t}</span>`;
  return `<div class="dscroll" style="--rc:${gCol(it)};--bc:${B.color}">
    <div class="dvimg"><img src="${gPic(it)}" alt=""></div>
    <div class="dvhead"><div class="dk">${it.exo ? 'Egzotikus' : RARITIES[it.q].name} · Lv ${it.level}</div><div class="dname">${it.name}${rollTagP(gRoll(it))}</div>
      <div class="dsub">${GEAR_SLOTS[it.slot]} · ${it.exo ? 'egzotikus: bármely márkához számít' : `${B.name} · ${B.tag}`}</div><div class="dperk">${it.exo ? (tb ? `Most ide számít: ${B.name} (a legtöbbet viselt márkád)` : 'Más páncél nélkül egy szetthez sem számít') : `${B.name} szett · ${sets}`}</div></div>
    <div class="dvbody">
      ${!canUse(it) ? `<div class="dlock">Csak ${it.level}. szinttől viselhető. Addig a raktárban tarthatod.</div>` : ''}
      ${c ? `<div class="dcmp">összevetve a viselt darabbal: <span style="color:${gCol(c)}">${c.name}</span></div>` : ''}
      <div class="srows">${rows}</div>
      <div class="dboxes">
        ${it.exo && EXOTICS[it.exo] ? dbox('Egzotikus tehetség', '', EXOTICS[it.exo].talent, EXO_COL) : ''}
        ${it.exo && !tb ? '' : dbox(`${B.name} szett · ${cnt}/4 viselve${wornGear().some(g => g.exo) && tb === exoTarget() ? ' (egzotikussal)' : ''}`, '', B.sets.map(([n, k, v]) => setLine(cnt >= n, `${n} db: ${GSTATS[k].name} ${fmtG(k, v)}`)).join('') + (B.t4 ? setLine(cnt >= 4, `4 db · ${B.t4[0]}: ${B.t4[1]}`) : '') + (next ? `<span style="color:var(--amb)">Még ${next[0] - cnt} darab a következő bónuszig</span>` : ''), B.color)}
        ${dbox('Szakértelem', `${it.exp || 0}/10 · +${3 * (it.exp || 0)}% minden értékre`, expPips(it.exp || 0) + ((it.exp || 0) < 10 ? '<span>A kovácsnál fejleszthető.</span>' : ''), '#f0a024')}
      </div>
    </div></div>
    ${actions ? `<div class="dact">${actions}</div>` : ''}`;
}
// consumables in the shop
function itemDetail(k, actions) {
  const I = ITEMS[k];
  return `<div class="dscroll" style="--rc:${I.color}">
    <div class="dvimg"><img class="dico" src="${ICONS[k]}" alt=""></div>
    <div class="dvhead"><div class="dk">Felszerelés · [${I.key}] gomb</div><div class="dname">${itemName(k)}</div><div class="dsub">${itemDesc(k)}</div></div>
    <div class="dvbody"><div class="srows">${srw('Nálad', `${profile.inv[k]} / ${itemMax(k)}`, '', profile.inv[k] / itemMax(k))}${srw('Egyszerre', k === 'knife' ? '3 db' : '1 db')}</div></div></div>
    ${actions ? `<div class="dact">${actions}</div>` : ''}`;
}

// ---------- keyboard: shortcuts from the selected item's buttons, arrows move the selection ----------
function updateKeybar(root) {
  const bar = $('keybar'), inv = root.querySelector('.inv'), hub = root.id === 'hubBody';
  const btns = inv ? [...inv.querySelectorAll('[data-key]')].filter(b => !b.closest('.tile')) : []; bar.btns = btns;
  const acts = btns.map((b, i) => `<span data-i="${i}"${b.dataset.tip ? ` data-tip="${b.dataset.tip.replace(/"/g, '&quot;')}"` : ''} class="${b.disabled ? 'off' : ''}${b.classList.contains('hold') ? ' hold' : ''}"><kbd>${KEY_LABEL[b.dataset.key]}</kbd>${(c => { c.querySelector('kbd')?.remove(); return c.innerHTML.trim(); })(b.cloneNode(true))}</span>`);
  const hint = hub && { jobs: '<span><kbd>Enter</kbd>elvállalom</span>', skills: '<span><kbd>Enter</kbd>tanul</span>', swheel: '<span><kbd>Space</kbd>pörgetés</span>' }[hubTab] || '';
  bar.innerHTML = hint + acts.join('') + `<span class="kver">${GAME_VER}${hub ? ' · automatikusan mentve' : ''}</span>`; // only what this screen's selection can do; the rest is on screen
  requestAnimationFrame(() => { const z = bar.currentCSSZoom || 1; document.documentElement.style.setProperty('--kbh', (bar.hidden ? 0 : bar.getBoundingClientRect().height / z) + 'px'); }); // the lists stay clear of it, one line or two
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
  const b = [...root.querySelectorAll(`.inv [data-key="${e.code}"]`)].find(x => !x.closest('.tile'));
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
  if (fl === 'G' && tl === 'Z') return `gbag:${fi}`;
  if (fl === 'Z' && tl === 'G') return `gunbag:${fi}`;
  if (fl === 'Z' && tl === 'W') return `zwear:${fi}`;
  if (fl === 'W' && tl === 'Z') return `zunwear:${fi}`;
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
  document.addEventListener('dragover', e => { // dragging near the list's top or bottom edge (or past it) scrolls it
    if (!from) return; const sc = root.querySelector('.invl'); if (!sc) return;
    const r = sc.getBoundingClientRect(), m = 70, up = r.top + m - e.clientY, dn = e.clientY - (r.bottom - m);
    if (up > 0) sc.scrollTop -= Math.min(30, up / 3); else if (dn > 0) sc.scrollTop += Math.min(30, dn / 3);
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
    const act = dropAct(from, target(e.target) || ''); if (act && state === 'hub') clearNew(from); from = null; root.classList.remove('ground'); // moved it: seen
    if (act) fireAct(fireRoot, act);
  });
}

// ---------- hold-to-confirm buttons (destroying things): hold the mouse button or the key until the bar fills ----------
const HOLD_T = .9; let holding = null;
function startHold(b, root) {
  if (holding || b.disabled) return;
  const h = holding = { b, t0: performance.now(), marks: [...root.querySelectorAll('.tile.on, .invd .dhead')] }; // the red sweep over the item
  h.marks.forEach(m => m.classList.add('rhold'));
  const step = () => {
    if (holding !== h) return;
    const p = (performance.now() - h.t0) / 1000 / HOLD_T;
    b.style.setProperty('--hp', Math.min(1, p) * 100 + '%'); h.marks.forEach(m => m.style.setProperty('--rp', Math.min(1, p) * 100 + '%'));
    if (p >= 1) { holding = null; h.marks.forEach(m => m.classList.remove('rhold')); fireAct(root, b.dataset.hact); } else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function endHold() { if (holding) { holding.b.style.setProperty('--hp', '0%'); holding.marks.forEach(m => { m.classList.remove('rhold'); m.style.setProperty('--rp', '0%'); }); holding = null; } }
addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('.sbtn.hold'); if (b) startHold(b, b.closest('#loadout,#hubBody') || document.body); }, true);
addEventListener('pointerup', endHold, true);
addEventListener('keyup', e => { if (holding && holding.b.dataset.key === e.code) endHold(); });

$('keybar').addEventListener('pointerdown', e => { // the bar is the action list: click (or hold) an entry
  const sp = e.target.closest('[data-i]'), b = sp && $('keybar').btns && $('keybar').btns[+sp.dataset.i]; if (!b || b.disabled) return;
  e.preventDefault(); if (b.classList.contains('hold')) startHold(b, b.closest('#loadout,#hubBody') || document.body); else b.click();
});

// hover descriptions: anything with data-tip (disabled buttons too, so :hover instead of mouse events)
const tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.hidden = true; document.body.appendChild(tipEl);
addEventListener('pointermove', e => {
  const h = document.pointerLockElement ? null : [...document.querySelectorAll('[data-tip]:hover')].pop();
  if (!h) { tipEl.hidden = true; return; }
  if (tipEl.textContent !== h.dataset.tip) tipEl.textContent = h.dataset.tip; tipEl.hidden = false;
  const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
  tipEl.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px'; tipEl.style.top = (e.clientY - ht - 14 < 8 ? e.clientY + 20 : e.clientY - ht - 14) + 'px';
});
addEventListener('pointerdown', () => { tipEl.hidden = true; });
