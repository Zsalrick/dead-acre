'use strict';
// ================= HANDBOOK (hub tab): every gun, talent, armor set, zombie, bounty, job and map, with pictures =================
const bcard = (pic, title, sub, body, col) => `<article class="bcard"${col ? ` style="--bc:${col}"` : ''}>${pic ? `<img src="${pic}" alt="">` : ''}<div><h4>${title}</h4>${sub ? `<small>${sub}</small>` : ''}${body}</div></article>`;
const bkv = rows => `<dl class="bkv">${rows.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const bhead = (t, lede) => `<div class="hubhead"><h2>${t}</h2></div>${lede ? `<p class="lede">${lede}</p>` : ''}`;
const pctR = (a, b) => `${Math.round(a * 100)}–${Math.round(b * 100)}%`;

function bookWeapons() {
  const cats = [...new Set(BASES.map(b => CAT[b.id]))];
  return bhead('Fegyverek', 'Minden fegyvertípus alapértékei. A ritkaság, a szint és a véletlen dobás ezekből indul; a kritikus esélyt és szorzót minden fegyver a típusa tartományából dobja.') +
    cats.map(c => `<h3>${(CAT_NAMES[c] || c).replace(/^./, x => x.toUpperCase())}</h3><div class="bgrid wg">${BASES.filter(b => CAT[b.id] === c).map(b => { const R = critRange({ base: b });
      return bcard(gunShot(b, 2), b.name, `${modeName(b)}${baseSpecial(b) ? ' · ' + baseSpecial(b) : ''}`, bkv([['Sebzés', b.pellets > 1 ? `${b.dmg}×${b.pellets}` : b.dmg], ['Tűzgyorsaság', `${b.rpm}/p`], ['Tár', b.mag],
        ['Újratöltés', `${b.reload} mp`], ['Hatótáv', `${b.range} m`], ['Kritikus esély', pctR(R[0], R[1])], ['Kritikus szorzó', `×${R[2]}–${R[3]}`]]) + `<div class="bmk">${makersFor(b).map(k => `<span data-tip="${MAKERS[k].name}: ${MAKERS[k].perk}">${makerLogo(k)}</span>`).join('')}</div>`); }).join('')}</div>`).join('') +
    `<h3>Gyártók</h3><div class="bgrid">${Object.entries(MAKERS).map(([k, m]) => `<article class="bcard maker">${makerLogo(k)}<div><h4>${m.name}</h4><small>${m.cats.map(c => CAT_NAMES[c]).join(', ')}</small><p>${m.perk}</p></div></article>`).join('')}</div>`;
}
function bookTalents() {
  return bhead('Tehetségek és felkenések', 'Ritka vagy jobb fegyveren egy tehetség van, ez végleges. A felkenés a kovácsnál újradobható. Az egyedi fegyvereknek saját, fix tehetségük van.') +
    `<h3>Fegyvertehetségek</h3><div class="bgrid">${Object.values(TALENTS).map(t => bcard('', t.name, 'tehetség · ritka, epikus, legendás', `<p>${t.desc}</p>`, '#ffd23f')).join('')}</div>
    <h3>Felkenések</h3><div class="bgrid">${Object.values(ANOINTS).map(t => bcard('', 'Felkenés', '25% ritkán, 50% epikuson, mindig legendáson', `<p>${t}</p>`, '#6ff0c8')).join('')}</div>
    <h3>Túlhajtások <small>maggal szerelhető be a kovácsnál</small></h3><div class="bgrid">${Object.values(OVERCLOCKS).map(o => bcard('', o.name, 'túlhajtás', `<p>${o.desc}</p>`, '#b48cff')).join('')}</div>
    <h3>Elemek</h3><div class="bgrid">${Object.values(ELEMENTS).map(e => bcard('', e.name, `„${e.word}” a fegyver nevében`, `<p>${e.desc}</p>`, e.color)).join('')}</div>
    <h3>Egyedi fegyverek</h3><div class="bgrid">${Object.values(UNIQUES).map(u => { const b = BASES.find(x => x.id === u.base); return bcard(b ? gunShot(b, 5) : '', u.name, `${b ? b.name : ''} · „${u.text}”`, `<p>${u.trick}</p>`, '#ff3b3b'); }).join('')}</div>`;
}
function bookGear() {
  return bhead('Páncél', 'Négy hely: sisak, mellvért, nadrág, csizma. Minden darab ad páncélt és a márkája alapbónuszát; 2, 3 és 4 azonos márkájú darab szettbónuszt ad. Tehetsége csak az egzotikus darabnak van.') +
    `<h3>Helyek</h3><div class="bgrid slots">${Object.entries(GEAR_SLOTS).map(([k, n]) => bcard(gearIcon(k, '#c8c0a8'), n, '', '')).join('')}</div>
    <h3>Márkák és szettek</h3><div class="bgrid">${Object.entries(BRANDS).map(([k, B]) => bcard(gearIcon('chest', B.color), B.name, `${B.tag} · minden darab: ${GSTATS[B.core[0]].name} ${fmtG(...B.core)}`,
      `<ul>${B.sets.map(([n, s, v]) => `<li>${n} db: ${GSTATS[s].name} ${fmtG(s, v)}</li>`).join('')}${B.t4 ? `<li class="t4"><b>4 db · ${B.t4[0]}:</b> ${B.t4[1]}</li>` : ''}</ul>`, B.color)).join('')}</div>
    <h3>Egzotikus páncélok <small>bármely márkának számítanak</small></h3><div class="bgrid">${Object.values(EXOTICS).map(x => bcard(gearIcon(x.slot, EXO_COL, x.name), x.name, GEAR_SLOTS[x.slot], `<p>${x.talent}</p>`, EXO_COL)).join('')}</div>`;
}
function bookZombies() {
  const kinds = Object.entries(KINDS).filter(([k, K]) => !K.boss);
  return bhead('Zombik', 'Minden zombi lehet sima, veterán, elit vagy nevesített. Minél nehezebb a munka és a Rémálom-fokozat, annál gyakoribbak az erősebbek. Az életerő-csík színe mutatja a rangot, mellette a szintjük (◆) és a Rémálom-fokozat (☠).') +
    `<h3>Rangok</h3><div class="bgrid">${ZTIERS.map((T, i) => bcard('', T.name || 'Sima', `×${T.hp} életerő`, `<i class="bbar" style="--c:${T.col};width:${60 + i * 14}px"></i><p>${['Az alap.', 'Szívósabb, nagyobb.', 'Egy véletlen tulajdonsága van, és jobb zsákmányt ejt.', 'Saját neve és két tulajdonsága van. Ritka, de megéri levadászni.'][i]}</p>`, T.col)).join('')}</div>
    <h3>Tulajdonságok <small>elit és nevesített zombikon</small></h3><div class="bgrid">${AFFIX_KEYS.map(k => bcard('', AFFIX[k].name, 'tulajdonság', `<p>${AFFIX_DESC[k] || ''}</p>`, '#ff8a70')).join('')}</div>
    <h3>Fajták</h3><div class="bgrid zk">${kinds.map(([k, K]) => bcard(zombieThumb(k), K.name, `${K.min}. hullámtól`, `<p>${K.desc || 'Lassú, de sokan vannak.'}</p>` + bkv([['Életerő', `×${K.hp}`], ['Sebzés', K.dmg || '—'], K.armor ? ['Páncél', 'igen, fejre lőj'] : null]))).join('')}</div>`;
}
function bookBounties() {
  return bhead('Fejvadászok', 'Fejvadászat munkán egy nagyon erős főellenség vár, fázisokkal és saját trükkökkel. Garantáltan legendás zsákmányt ejt, és az egyedi fegyverek csak tőlük esnek. Az első legyőzés egy túlhajtás-magot is ad.') +
    `<div class="bgrid zk">${Object.values(BOUNTIES).map(B => bcard(zombieThumb('butcher', B.tint), B.name, `${B.minLvl ? `${B.minLvl}. szinttől · ` : ''}×${B.hp} életerő`, `<p>${B.desc}</p>` + bkv([['Hív', KINDS[B.summon[0]].name], ['Egyedi zsákmány', B.loot.map(u => UNIQUES[u] ? UNIQUES[u].name : u).join(', ')]]))).join('')}
    ${bcard(zombieThumb('butcher'), 'A Mészáros', 'nehéz munkák utolsó perceiben', `<p>${KINDS.butcher.desc}</p>`)}</div>`;
}
function bookJobs() {
  return bhead('Munkák és pályák', 'A munka típusa adja a célt, a módosító a körülményeket, a direktívák önként vállalt nehezítések több jutalomért. Az 5 csillag fölött a Rémálom-fokozatok jönnek.') +
    `<h3>Munkatípusok</h3><div class="bgrid">${Object.entries(JOB_TYPES).map(([k, J]) => bcard('', J.name, '', `<p>${k === 'survive' ? 'Éld túl, amíg az óra lejár, aztán szállj be a furgonba.' : J.desc({ goal: 'N', dur: 300 })}</p>`)).join('')}</div>
    <h3>Módosítók</h3><div class="bgrid">${Object.values(MODS).map(m => bcard('', m.label, '', `<p>${m.sub}</p>`, '#7d8dff')).join('')}</div>
    <h3>Direktívák <small>5. szinttől</small></h3><div class="bgrid">${Object.values(DIRECTIVES).map(d => bcard('', d.name, '', `<p>${d.desc}</p>`, '#ff5a4a')).join('')}</div>
    <h3>Pályák</h3><div class="bgrid">${MAP_IDS.map(id => bcard('', MAPS[id].name, `${MAPS[id].minLevel || 1}. szinttől`, `<p>${MAPS[id].desc || ''}</p>`, '#9fcf6a')).join('')}</div>
    <h3>Rémálom</h3><p class="note">A 30. szint után a munkák Rémálom +1, +2… fokozaton is mehetnek: erősebb zombik, több XP, pénz és jobb zsákmány, és a zombikon ☠ jelzi a fokozatot.</p>`;
}

// a zombie's portrait: the real model, rendered once off-screen and kept as an image
const zThumbs = {};
function zombieThumb(kind, tint) {
  const key = kind + (tint || ''); if (zThumbs[key]) return zThumbs[key];
  const W = 160, H = 200, rt = new THREE.WebGLRenderTarget(W, H), sc = new THREE.Scene(), K = KINDS[kind];
  sc.add(new THREE.HemisphereLight(0xe8ecff, 0x40342a, 1.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.3); dl.position.set(2, 4, 5); sc.add(dl);
  const m = mkZombie(kind), s = K.scale ? K.scale() : 1, h = (K.crawl ? 1.1 : 2.2) * s;
  m.mats.forEach(q => { q.opacity = 1; q.transparent = false; q.depthWrite = true; }); // the Phantom shows up in the book
  if (tint) m.mats.forEach(q => q.color && q.color.lerp(new THREE.Color(tint), .45));
  m.g.scale.setScalar(s); m.g.rotation.y = .45; sc.add(m.g);
  const cam = new THREE.PerspectiveCamera(32, W / H, .1, 60); cam.position.set(0, h * .55, Math.max(h, 1.6) * 2.3); cam.lookAt(0, h * .5, 0);
  const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x1a1c1b, 1); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(null); renderer.setClearColor(cc, ca); rt.dispose(); sc.remove(m.g); freeZombie(m);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // the render target is upside down
  g.putImageData(img, 0, 0);
  return zThumbs[key] = c.toDataURL();
}
