// ================= CLASSES & SKILL TREES =================
// Each class: a passive, an active ability (C) and a 5-row tree of 15 skills bought with merit tokens.
// Row r opens once 3·r points are spent in the tree. Tokens: job stars (+1 for the Butcher) and +1 per level.
const CLASSES = {
  soldier: {
    name: 'Katona', tag: 'Frontvonal', color: '#d8a24a', desc: 'Gépkarabélyok és nehézfegyverek mestere. Sokat bír, sokat lő.',
    passive: '+10% sebzés gépkarabéllyal, sorozatlövővel, LMG-vel és minigunnal.',
    ability: { name: 'Tűzvihar', cd: 50, desc: '8 mp-ig 40%-kal gyorsabban lősz, és nem fogy a tár.' },
    tree: [
      ['s_rifle', 'Puskás', 3, r => `+${6 * r}% sebzés gépkarabéllyal és nehézfegyverrel`],
      ['s_hide', 'Vastag bőr', 3, r => `+${8 * r} max életerő`],
      ['s_hands', 'Gyors kezek', 3, r => `+${8 * r}% újratöltési sebesség`],
      ['s_burst', 'Sorozat', 2, r => `+${5 * r}% kritikus esély automata fegyverrel`],
      ['s_armor', 'Páncélzat', 3, r => `-${4 * r}% elszenvedett sebzés`],
      ['s_ammo', 'Lőszerzsák', 2, r => `+${15 * r}% tartalék lőszer`],
      ['s_disc', 'Tűzfegyelem', 2, r => `-${30 * r}% szórásnövekedés sorozatlövésnél`],
      ['s_rage', 'Nem adom fel', 1, () => '30% élet alatt +25% sebzés'],
      ['s_storm', 'Hosszabb vihar', 2, r => `a Tűzvihar +${3 * r} mp-ig tart`],
      ['s_heavy', 'Géppuskás', 1, () => 'nehézfegyverrel nem lassulsz, és +15% sebzés'],
      ['s_wind', 'Második szél', 1, () => 'munkánként egyszer a halálos ütést 1 életerővel túléled'],
      ['s_supply', 'Utánpótlás', 1, () => 'a Tűzvihar minden fegyvered tartalékát feltölti'],
      ['s_pierce', 'Átütő erő', 1, () => 'minden golyó eggyel több zombin megy át'],
      ['s_blast', 'Robbanó hüvely', 2, r => `kritikus találatnál ${10 * r}% eséllyel kis robbanás`],
      ['s_iron', 'Vasakarat', 2, r => `a Tűzvihar alatt -${15 * r}% elszenvedett sebzés`],
    ],
  },
  hunter: {
    name: 'Vadász', tag: 'Hideg szem', color: '#7fd0a0', desc: 'Messziről, egy lövéssel. Fejre céloz, és kiszúrja a legjobb zsákmányt.',
    passive: '+10% fejlövés-sebzés.',
    ability: { name: 'Halálszem', cd: 40, desc: '8 mp-ig élesebben látsz: minden zombi pirosan világít, a fejlövéseid +50%-ot sebeznek, és akit eltalálsz, megjelölődik (mindenkitől 50%-kal több sebzést kap). Jelölt zombi megölése +1,5 mp-et ad (legfeljebb 20 mp).' },
    tree: [
      ['h_marks', 'Mesterlövész', 3, r => `+${6 * r}% sebzés pisztollyal, revolverrel, karos és távcsöves fegyverrel`],
      ['h_head', 'Fejvadász', 3, r => `+${12 * r}% fejlövés-sebzés`],
      ['h_light', 'Könnyű léptek', 3, r => `+${4 * r}% mozgási sebesség`],
      ['h_crit', 'Kritikus pont', 3, r => `+${3 * r}% kritikus esély`],
      ['h_steady', 'Nyugodt kéz', 2, r => `-${25 * r}% szórás célzás közben`],
      ['h_scav', 'Zsákmányszimat', 2, r => `+${15 * r}% esély, hogy egy zombi fegyvert ejt`],
      ['h_deadly', 'Halálos pontosság', 2, r => `+${20 * r}% kritikus sebzés`],
      ['h_refund', 'Takarékos', 1, () => 'fejlövéses ölés után egy töltény visszakerül a tárba'],
      ['h_mark', 'Éles szem', 2, r => `a Halálszem +${2 * r} mp-ig tart, és ${8 * r} mp-cel hamarabb töltődik`],
      ['h_exec', 'Kivégzés', 1, () => 'dupla sebzés a 25% élet alatti zombikra'],
      ['h_boss', 'Nagyvad', 1, () => '+20% sebzés a Mészárosra'],
      ['h_luck', 'Zsákmányvadász', 1, () => 'jobb ritkaság a zombikból eső fegyvereken'],
      ['h_long', 'Távoli cél', 2, r => `+${10 * r}% sebzés 25 m-en túli célra`],
      ['h_ricochet', 'Gellert', 1, () => 'fejlövéses ölés után a golyó a legközelebbi zombira pattan'],
      ['h_bounty', 'Díjvadász', 2, r => `+${12 * r}% sebzés elitekre és főellenségekre`],
    ],
  },
  engineer: {
    name: 'Mérnök', tag: 'Csavarkulcs', color: '#8fb8ff', desc: 'Tornyok, robbanások és olcsóbb felszerelés. A pálya az ő fegyvere.',
    passive: '+20% robbanás-sebzés, +12% sebzés energiafegyverrel, és minden munkát +1 gránáttal kezdesz.',
    ability: { name: 'Szerelőtorony', cd: 60, desc: 'Ingyen telepít egy lövegtornyot 25 mp-re.' },
    tree: [
      ['e_boom', 'Robbanóanyag', 3, r => `+${8 * r}% robbanás-sebzés (gránát, gránátvető, hordó)`],
      ['e_tools', 'Szerszámos', 3, r => `+${10 * r}% toronysebzés, a Szerelőtorony +${5 * r} mp`],
      ['e_belt', 'Gránátöv', 2, r => `+${r} gránát hely, és ennyivel többel kezdesz`],
      ['e_big', 'Nagyobb bumm', 2, r => `+${15 * r}% robbanási sugár`],
      ['e_barricade', 'Barikádbontó', 2, r => `-${15 * r}% a kapuk nyitási ára`],
      ['e_cells', 'Energiacellák', 3, r => `+${8 * r}% sebzés Ray Gunnal, Teslával és lángszóróval`],
      ['e_last', 'Tartós torony', 1, () => 'a Szerelőtorony +15 mp-ig áll'],
      ['e_barrel', 'Hordófelelős', 1, () => 'a robbanó hordók dupla sebzést okoznak'],
      ['e_quick', 'Gyors bevetés', 2, r => `-${10 * r}% képesség-töltődési idő`],
      ['e_fire', 'Gyújtólövedék', 1, () => 'a tornyok felgyújtják a célt'],
      ['e_discount', 'Mérnöki kedvezmény', 1, () => '-20% a doboz, a lőszer, a csapda és a lövegtorony ára'],
      ['e_overload', 'Túlterhelés', 1, () => 'a Szerelőtorony kétszer olyan gyorsan lő'],
      ['e_chain', 'Láncrobbanás', 1, () => 'robbanással ölt zombi 30% eséllyel maga is felrobban'],
      ['e_drone', 'Javítódrón', 2, r => `a tornyaid 6 m-es körében +${6 * r} életerő/mp`],
      ['e_overclock', 'Túlhajtás', 1, () => 'a Szerelőtorony után 8 mp-ig, gránátdobás után 4 mp-ig +40% tűzgyorsaság'],
    ],
  },
  medic: {
    name: 'Tábori pap', tag: 'Gyógyító', color: '#f2d27a', desc: 'Nem hal meg könnyen. Gyógyul, pajzsot tart, és visszaáll a harcba.',
    passive: '+50% gyógycsomag-gyógyítás, +20% életerő-regeneráció, +20% sebzés sörétessel és géppisztollyal, és az általad felélesztett társ teli életerővel áll fel.',
    ability: { name: 'Szentelt kör', cd: 50, desc: '20 mp-ig szent kör vesz körül, és veled mozog. Aki benne áll: gyógyul, +15% sebzés, kétszer gyorsabb pajzs-töltődés, +25% újratöltés. A benne lévő zombik lelassulnak.' },
    tree: [
      ['m_regen', 'Gyógyír', 3, r => `+${10 * r}% életerő-regeneráció`],
      ['m_shield', 'Pajzsmester', 3, r => `+${15 * r} pajzs`],
      ['m_rest', 'Pihenő', 2, r => `a regeneráció ${(.3 * r).toFixed(1)} mp-cel hamarabb indul`],
      ['m_vamp', 'Vámpír', 3, r => `minden ölés +${3 * r} életerő`],
      ['m_bless', 'Áldás', 2, r => `a gyógycsomag +${20 * r} életerőt ad`],
      ['m_zeal', 'Hitvalló', 3, r => `+${6 * r}% sebzés sörétessel és géppisztollyal`],
      ['m_burst', 'Pajzsrobbanás', 1, () => 'ha a pajzsod elfogy, a közeli zombikat szétveti'],
      ['m_circle', 'Hosszabb kör', 2, r => `a Szentelt kör +${4 * r} mp és +${50 * r}% gyógyítás`],
      ['m_tithe', 'Adomány', 2, r => `+${10 * r}% pénz a munkákért`],
      ['m_revive', 'Feltámadás', 1, () => 'munkánként egyszer elesés helyett 50% élettel felállsz'],
      ['m_holy', 'Szentföld', 1, () => 'a Szentelt kör égeti a benne álló zombikat'],
      ['m_plenty', 'Bőség', 1, () => '+1 gyógycsomag hely, és minden munkát tele gyógycsomaggal kezdesz'],
      ['m_soul', 'Szívós lélek', 2, r => `a Harcolj az életedért ideje +${3 * r} mp`],
      ['m_steal', 'Életlopás', 2, r => `a sebzésed ${r}%-a visszatér életerőként (találatonként legfeljebb 2%)`],
      ['m_sanct', 'Menedék', 1, () => 'a Szentelt körben feleannyi sebzést kapsz'],
    ],
  },
  necro: {
    name: 'Nekromanta', tag: 'Holtak ura', color: '#9d7cff', desc: 'Akit megöl, az neki harcol tovább. Egyedül sem egyedül.',
    passive: '+10% sebzés maró fegyverrel, és minden ölés +1 életerőt ad.',
    ability: { name: 'Feltámasztás', cd: 90, desc: 'Az utoljára megölt zombid feltámad, és 60 mp-ig melletted harcol: teli élettel, erősebben és gyorsabban, mint életében. Az ütései a te öléseid. Utána végleg összeesik.' },
    tree: [
      ['n_bond', 'Erős kötelék', 3, r => `a szolgád +${20 * r}% életerőt kap`],
      ['n_rage', 'Vérszomj', 3, r => `a szolgád +${15 * r}% sebzést okoz`],
      ['n_toxic', 'Méregkeverő', 3, r => `+${6 * r}% sebzés maró fegyverrel`],
      ['n_time', 'Hosszú szolgálat', 2, r => `a szolgád +${15 * r} mp-ig marad`],
      ['n_quick', 'Gyors rítus', 2, r => `a Feltámasztás ${6 * r} mp-cel hamarabb töltődik`],
      ['n_leech', 'Lélekszívás', 3, r => `minden ölés további +${2 * r} életerő`],
      ['n_speed', 'Halotti lépés', 2, r => `+${4 * r}% mozgási sebesség`],
      ['n_shield', 'Csontpajzs', 2, r => `+${12 * r} pajzs`],
      ['n_taunt', 'Csali', 1, () => 'a zombik inkább a szolgádat támadják, mint téged'],
      ['n_twin', 'Kettős rítus', 1, () => 'egyszerre 2 szolgád lehet: a Feltámasztás az utolsó két áldozatodat hozza vissza'],
      ['n_soul', 'Lélekvédő', 2, r => `amíg él szolgád, -${8 * r}% elszenvedett sebzés`],
      ['n_blast', 'Hullarobbanás', 1, () => 'a szolgád a halálakor felrobban'],
      ['n_elite', 'Sötét áldás', 1, () => 'a szolgád +50% életet és sebzést kap, és minden ölésed gyógyítja'],
      ['n_pact', 'Vérszerződés', 2, r => `amíg él szolgád, +${10 * r}% sebzés`],
      ['n_plague', 'Dögvész', 1, () => 'a szolgád ütése a cél 4 m-es körében mindenkit sebez'],
    ],
  },
};
const RESPEC = 0, RECLASS = 800; // re-spending the tree is free
// augments change how the class ability works; unlock with merit tokens, one active per class, switch freely
const AUGMENTS = {
  soldier: [['ignite', 'Gyújtólövedék', 'A Tűzvihar alatt minden találat felgyújtja a célt.'], ['bulwark', 'Rohampáncél', 'A Tűzvihar alatt 40%-kal kevesebb sebzést kapsz.'], ['resupply', 'Utánpótlás-láda', 'A Tűzvihar +2 gránátot ad, és minden tárat megtölt.']],
  hunter: [['plague', 'Járvány', 'Ha egy megjelölt zombi meghal, a 8 m-en belüli társai is megjelölődnek.'], ['execute', 'Kivégző', 'A megjelölt zombi 30% élet alatt egy találattól meghal.'], ['wide', 'Sasszem', 'Halálszem alatt a találat a cél 4 m-es körében mindenkit megjelöl.']],
  engineer: [['shieldtower', 'Pajzstorony', 'A torony 5 m-es pajzskupolát húz: benne 50%-kal kevesebb sebzést kapsz.'], ['twin', 'Ikertorony', 'Két kisebb tornyot telepít (60% sebzés darabonként).'], ['rocket', 'Rakétatorony', 'A torony lassabban lő, de robbanó rakétával.']],
  necro: [['cross', 'Megtérítés', 'Kapsz egy keresztet (3-as gomb, legfeljebb 1): egy élő zombit a szolgáddá térít. Főellenségre nem hat. Minden Feltámasztás ad egy új keresztet.'], ['legion', 'Légió', 'Az utolsó 3 áldozatod kel fel egyszerre, 60%-os erővel.'], ['soulswap', 'Lélekcsere', 'Ha egy szolgád meghal, 25% életet kapsz vissza, és a Feltámasztás 15 mp-cel hamarabb töltődik.']],
  medic: [['revive', 'Feltámasztó kör', 'A körben dupla a gyógyítás, és az elesett társak felállnak benne.'], ['smite', 'Ítélet', 'A kör égeti és erősen lassítja a benne álló zombikat.'], ['bigcircle', 'Nagy szentély', 'A kör sugara 6 helyett 9 méter, és 5 mp-cel tovább tart.']],
};
const AUG_COST = 2;
const AUG_AT = [12, 15, 18], augAllowed = () => AUG_AT.filter(n => treeSpent() >= n).length; // tree points that open the 1st, 2nd and 3rd augment
const augOwned = cls => (AUGMENTS[cls] || []).filter(x => (profile.augOwn || []).includes(x[0])).length;
const augOn = id => !!profile && !!profile.aug && profile.aug[profile.cls] === id;
const rk = id => (profile && profile.skills && profile.skills[id]) || 0;
const isCls = c => !!profile && profile.cls === c;
const treeSpent = () => profile && profile.cls ? CLASSES[profile.cls].tree.reduce((a, [id]) => a + rk(id), 0) : 0;
const itemMax = k => ITEMS[k].max + (k === 'gren' ? rk('e_belt') : 0) + (k === 'med' ? rk('m_plenty') : 0);

// everything else in the game asks these
const SK = {
  dmg(w) {
    const c = CAT[w.base.id]; let m = 1;
    if (c === 'rifle' || c === 'heavy') m += (isCls('soldier') ? .1 : 0) + .06 * rk('s_rifle');
    if (c === 'heavy') m += .15 * rk('s_heavy');
    if (c === 'marks' || c === 'pistol') m += .06 * rk('h_marks');
    if (c === 'energy') m += .08 * rk('e_cells') + (isCls('engineer') ? .12 : 0);
    if (c === 'shotgun' || c === 'smg') m += .06 * rk('m_zeal') + (isCls('medic') ? .2 : 0);
    if (rk('s_rage') && player.hp < maxHp() * .3) m += .25;
    if (exoOn('berserk')) m += .5 * clamp(1 - player.hp / maxHp(), 0, 1);
    if (player.bloodN && now < player.bloodT) m += .05 * player.bloodN; // Gravetide: Vérszomj
    m += .02 * masteryTier(w.base.id) + .02 * (w.exp || 0); // weapon mastery, expertise
    if (stimOn('berserk')) m += .3; // Berzerker-szérum
    if (inHolyAura()) m += .15; // Szentelt kör
    if (w.element === 'corrosive') m += (isCls('necro') ? .1 : 0) + .06 * rk('n_toxic');
    if (rk('n_pact') && minions.some(q => !q.dead)) m += .1 * rk('n_pact'); // Vérszerződés
    return m + (mkOf(w).dmg || 0) + G('dmg');
  },
  crit: w => (stimOn('focus') ? .2 : 0) + .03 * rk('h_crit') + (w && w.base.mode === 'auto' ? .05 * rk('s_burst') : 0),
  critDmg: () => .2 * rk('h_deadly') + (exoOn('glass') ? .5 : 0),
  head: () => (isCls('hunter') ? .1 : 0) + .12 * rk('h_head') + (player.eyeT > 0 ? .5 : 0), // Halálszem: +50% on the head
  hp: () => 8 * rk('s_hide'),
  shield: () => 15 * rk('m_shield') + 12 * rk('n_shield'),
  regen: () => 1 + (isCls('medic') ? .2 : 0) + .1 * rk('m_regen'),
  regenDelay: () => .3 * rk('m_rest'),
  speed: () => .04 * rk('h_light') + .04 * rk('n_speed'),
  reload: () => .08 * rk('s_hands') + (inHolyAura() ? .25 : 0),
  ammo: () => .15 * rk('s_ammo'),
  taken: () => (stimOn('iron') ? .6 : 1) * (now < (player.guardT || 0) ? .5 : 1) * (dirOn('fragile') ? 1.3 : 1) * (player.stormT > 0 ? 1 - .15 * rk('s_iron') : 1) * (rk('m_sanct') && aura && Math.hypot(player.pos.x - aura.pos.x, player.pos.z - aura.pos.z) < aura.r ? .5 : 1) * (brand4('bulwark') && now - (player.stillT || 0) > 1 ? .65 : 1) * (brand4('sable') && player.sprint ? .7 : 1) * (1 - .04 * rk('s_armor')) * (1 - Math.min(.5, G('red'))) * (player.stormT > 0 && augOn('bulwark') ? .6 : 1)
    * (turrets.some(t => t.shield && Math.hypot(t.g.position.x - player.pos.x, t.g.position.z - player.pos.z) < 5) ? .5 : 1) * (rk('n_soul') && minions.some(q => !q.dead) ? 1 - .08 * rk('n_soul') : 1),
  med: () => Math.round((70 + 20 * rk('m_bless')) * (isCls('medic') ? 1.5 : 1)),
  cash: () => 1 + .1 * rk('m_tithe'),
  explMul: () => 1 + (isCls('engineer') ? .2 : 0) + .08 * rk('e_boom') + G('expl'),
  explRadius: () => 1 + .15 * rk('e_big'),
  turret: () => 1 + .1 * rk('e_tools'),
  cost: n => Math.round(n * (1 - .2 * rk('e_discount'))),
  gate: n => Math.round(n * 2.5 * (1 - .15 * rk('e_barricade')) / 50) * 50, // areas are a real decision
  drop: () => 1 + .15 * rk('h_scav'),
  luck: () => .3 * rk('h_luck'),
  bloom: () => 1 - .3 * rk('s_disc'),
  ads: () => 1 - .25 * rk('h_steady'),
};

// ---------- active abilities ----------
const abilityCd = () => {
  if (!profile || !profile.cls) return 0;
  const base = CLASSES[profile.cls].ability.cd;
  return (base - (profile.cls === 'hunter' ? 8 * rk('h_mark') : 0) - (profile.cls === 'necro' ? 6 * rk('n_quick') : 0)) * (1 - .1 * rk('e_quick'));
};
let aura = null;
// in a priest's circle (yours or a teammate's): +15% damage, twice the shield regen, +25% reload, healing
const inHolyAura = () => (aura && Math.hypot(player.pos.x - aura.pos.x, player.pos.z - aura.pos.z) < aura.r) || (NET.mode && [...NET.avatars.values()].some(a => a.au && Math.hypot(player.pos.x - a.au[0], player.pos.z - a.au[1]) < (a.au[3] || 6)));
const auraMesh = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 48), new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }));
auraMesh.rotation.x = -Math.PI / 2; auraMesh.visible = false; scene.add(auraMesh);
const auraFill = new THREE.Mesh(new THREE.CircleGeometry(5.6, 48), new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: .08, depthWrite: false }));
auraFill.rotation.x = -Math.PI / 2; auraMesh.add(auraFill); auraFill.rotation.x = 0;
function useAbility() {
  if (!profile || !profile.cls || state !== 'playing') return;
  if (player.abilCd > 0) return SND.deny();
  const c = profile.cls;
  if (c === 'engineer' && rk('e_overclock')) player.overT = now + 8; // Túlhajtás
  if (c === 'soldier') {
    player.stormT = 8 + 3 * rk('s_storm');
    if (rk('s_supply')) player.slots.forEach(w => { if (w) w.reserve = resMax(w); });
    if (augOn('resupply')) { player.inv.gren = Math.min(itemMax('gren'), player.inv.gren + 2); [...player.slots, ...player.bag].forEach(w => { if (w) w.ammo = w.mag; }); renderInv(); }
    banner('TŰZVIHAR', `${Math.round(player.stormT)} mp végtelen tár`);
  } else if (c === 'hunter') {
    player.eyeT = 8 + 2 * rk('h_mark'); // Deadeye: see weaponOnHit / weaponOnKill
    banner('HALÁLSZEM', `${player.eyeT} mp · a zombik pirosan látszanak, fejlövés +50%`); SND.threat(1);
  } else if (c === 'engineer') {
    const twin = augOn('twin'), first = twin && !(player.twinWait > 0);
    if (!deployTurret(0, 25 + 5 * rk('e_tools') + 15 * rk('e_last'), { rate: rk('e_overload') ? 2 : 1, n: 1, max: twin ? 2 : 1, dmgMul: twin ? .6 : 1, small: twin, shield: augOn('shieldtower'), rocket: augOn('rocket') })) return SND.deny();
    if (first) { player.twinWait = 12; banner('IKERTORONY', 'Tedd le a másodikat is máshova: [C], 12 mp-en belül'); return; } // the cooldown starts with the second
    player.twinWait = 0;
  } else if (c === 'medic') {
    aura = { pos: player.pos.clone(), t: 20 + 4 * rk('m_circle') + (augOn('bigcircle') ? 5 : 0), r: augOn('bigcircle') ? 9 : 6 };
    auraMesh.scale.setScalar(aura.r / 6);
    auraMesh.position.set(aura.pos.x, .04, aura.pos.z); auraMesh.visible = true;
    banner('SZENTELT KÖR', `${Math.round(aura.t)} mp · aki melletted áll, erősebb`);
  } else if (c === 'necro') { if (!useRaise()) return SND.deny(); renderInv(); }
  player.abilCd = abilityCd(); SND.power(); pushFx(['ab', c]); if (c === 'medic' && aura) pushFx(['au', Math.round(aura.pos.x * 10), Math.round(aura.pos.z * 10), Math.round(aura.t)]);
  (player.buf || (player.buf = {})).ability = 8;
}
function updateSkills(dt) {
  if (player.eyeT > 0) player.eyeT -= dt;
  if (player.twinWait > 0 && (player.twinWait -= dt) <= 0) { player.twinWait = 0; player.abilCd = abilityCd(); } // the second twin turret never came
  player.abilCd = Math.max(0, (player.abilCd || 0) - dt);
  player.stormT = Math.max(0, (player.stormT || 0) - dt);
  updateMinions(dt); updateRemoteMinions(dt);
  if (!aura) return;
  aura.t -= dt;
  auraMesh.material.opacity = .35 + Math.sin(now * 6) * .15;
  aura.pos.copy(player.pos); auraMesh.position.set(aura.pos.x, .04, aura.pos.z); // the circle goes with the priest
  const inAura = true;
  if (inAura) player.hp = Math.min(maxHp(), player.hp + 12 * (1 + .5 * rk('m_circle')) * (augOn('revive') ? 2 : 1) * dt);
  for (const z of zombies) {
    if (z.dead || Math.hypot(z.pos.x - aura.pos.x, z.pos.z - aura.pos.z) > aura.r) continue;
    z.slowT = Math.max(z.slowT, augOn('smite') ? 1 : .3);
    if (rk('m_holy') || augOn('smite')) { z.burnT = 1; z.burnDps = Math.max(z.burnDps, zombieHp() * (augOn('smite') ? .45 : .25)); }
  }
  if (Math.random() < dt * 20) burst(new V3(aura.pos.x + rand(-aura.r, aura.r) * .8, .1, aura.pos.z + rand(-aura.r, aura.r) * .8), 0xf2d27a, 1, 1, .6);
  if (aura.t <= 0) { aura = null; auraMesh.visible = false; }
}
function resetSkillsRun() {
  player.abilCd = 0; player.stormT = 0; aura = null; auraMesh.visible = false; resetMinions();
}

// ---------- hub tab ----------
function skillsTab() {
  const P = profile;
  if (!P.cls) {
    return `<div class="hubhead"><h2>Válassz kasztot</h2></div>
      <p class="lede">A kaszt ad egy passzív bónuszt, egy aktív képességet (C gomb) és egy saját képességfát. Minden szintlépés egy érdemérmet ad (a 30. szinten összesen 29-et). Később bármikor ingyen válthatsz, a pontjaid kasztonként megmaradnak.</p>
      <div class="classes">${Object.entries(CLASSES).map(([k, C]) => `<article class="cls" style="--cc:${C.color}">
        <div class="ctag">${C.tag}</div><h3>${C.name}</h3><p>${C.desc}</p>
        <dl><dt>Passzív</dt><dd>${C.passive}</dd><dt>Képesség · ${C.ability.name}</dt><dd>${C.ability.desc} (${C.ability.cd} mp)</dd></dl>
        ${hbtn('Ezt választom', `cls:${k}`)}</article>`).join('')}</div>`;
  }
  const V = CLASSES[skView] ? skView : P.cls, mine = V === P.cls, C = CLASSES[V], SKV = mine ? P.skills : (P.clsSkills || {})[V] || {};
  const lvOf = id => SKV[id] || 0, spent = C.tree.reduce((a, [id]) => a + lvOf(id), 0), tok = mine ? P.tokens : clsTokens(V);
  const bars = (l, max) => `<span class="kbars">${Array.from({ length: max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('')}</span>`;
  const augs = (AUGMENTS[V] || []), sel = C.tree.find(t => t[0] === skNode) || augs.find(t => t[0] === skNode) || C.tree[0]; skNode = sel[0];
  const classes = Object.entries(CLASSES).map(([k, c]) => `<button class="kcls${k === V ? ' on' : ''}" data-act="skview:${k}" style="--cc:${c.color}"><b>${c.name}</b><small>${c.tag}</small><em>${k === P.cls ? 'Aktív' : 'Váltás ingyen'}</em></button>`).join('');
  const rows = [0, 1, 2, 3, 4].map(r => {
    const need = r * 3, open = spent >= need;
    return `<div class="krow${open ? '' : ' locked'}"><div class="klab"><b>${r + 1}. sor</b><small>${open ? 'nyitva' : `${need} elköltött kell (${spent}/${need})`}</small></div>` +
      C.tree.slice(r * 3, r * 3 + 3).map(([id, name, max, desc]) => { const l = lvOf(id);
        return `<button class="knode${id === skNode ? ' on' : ''}${l ? ' has' : ''}${l >= max ? ' max' : ''}" data-act="sknode:${id}"><span class="kh"><b>${name}</b><em>${l}/${max}</em></span>${bars(l, max)}<small>${desc(Math.max(1, l))}</small></button>`; }).join('') + '</div>';
  }).join('');
  const augRow = augs.length ? `<div class="krow"><div class="klab"><b>Módosítók</b><small>${AUG_AT.join(' / ')} elköltöttnél</small></div>${augs.map(([id, name, desc]) => { const own = (P.augOwn || []).includes(id), on = mine && augOn(id);
    return `<button class="knode aug${id === skNode ? ' on' : ''}${own ? ' has' : ''}${on ? ' max' : ''}" data-act="sknode:${id}"><span class="kh"><b>${name}</b><em>${on ? 'aktív' : own ? 'megvan' : ''}</em></span><small>${desc}</small></button>`; }).join('')}</div>` : '';
  // the right-hand panel: the selected node and what learning it costs
  const isAug = augs.some(t => t[0] === skNode), ri = isAug ? -1 : C.tree.indexOf(sel), row = Math.floor(ri / 3), l = isAug ? 0 : lvOf(sel[0]), max = isAug ? 1 : sel[2];
  let cta = '', info = '';
  if (isAug) { const own = (P.augOwn || []).includes(sel[0]), on = mine && augOn(sel[0]), can = own || augOwned(V) < augAllowed();
    info = `<div class="kbox"><small>${C.ability.name} módosítása</small><span>${sel[2]}</span></div>${!can ? `<p class="note">Zárva: ${AUG_AT[augOwned(V)] || AUG_AT[AUG_AT.length - 1]} elköltött érdemérem kell (van: ${spent}).</p>` : ''}`;
    cta = mine ? hbtn(on ? 'Aktív' : own ? 'Kiválaszt' : `Feloldás · ${AUG_COST} érdemérem`, `aug:${sel[0]}`, on || !can || (!own && P.tokens < AUG_COST)) : '';
  } else { const open = spent >= row * 3, maxed = l >= max;
    info = `<div class="kbox"><small>Szintenként</small><span>${sel[3](1)}</span></div>${l && !maxed ? `<div class="kbox"><small>Most → következő</small><span>${sel[3](l)} → ${sel[3](l + 1)}</span></div>` : ''}${!open ? `<p class="note">Zárva: ${row * 3} elköltött érdemérem kell ebben a fában (${spent}/${row * 3}).</p>` : ''}`;
    cta = mine ? hbtn(maxed ? 'Kész' : 'Tanul · 1 érdemérem', `sk:${sel[0]}`, maxed || !open || P.tokens < 1) : ''; }
  const side = `<aside class="kside" style="--cc:${C.color}"><div class="kstop"><small>${isAug ? 'Módosító' : `${row + 1}. sor`} · ${C.name}</small><h2>${sel[1]}</h2>${isAug ? '' : `<div class="kmax">${bars(l, max)}<b>${l} / ${max}</b></div>`}${info}</div>
    <div class="ksfoot"><div class="ktok"><span>${mine ? 'Elérhető érdemérem' : `Érdemérem (${C.name})`}</span><b>${tok}</b></div>${mine ? cta : hbtn(`Váltás: ${C.name}`, `swcls:${V}`, state !== 'hub')}</div></aside>`;
  return `<div class="ktab" style="--kc:${C.color}"><div class="kleft"><h3>Kasztok</h3>${classes}<p class="kinfo">Minden szintlépés egy érdemérmet ad. A kasztváltás ingyenes, a pontjaid kasztonként megmaradnak.</p></div>
    <div class="kmid"><div class="khead"><div><h2 style="color:${C.color}">${C.name} · ${C.tag}</h2><p><b>Passzív:</b> ${C.passive}</p></div>${mine ? hbtn('Pontok vissza (ingyen)', 'respec', !spent && !augOwned(V)) : ''}</div>
      <div class="kabil" style="--cc:${C.color}"><kbd>C</kbd><b>${C.ability.name}</b><span>${C.ability.desc}</span><small>töltődés ${mine ? Math.round(abilityCd()) : C.ability.cd} mp</small></div>
      <div class="ktree">${rows}${augRow}</div></div>
    ${side}</div>`;
}
// every class keeps its own tree and its own tokens: switching is free and nothing is re-bought
let skView = null, skNode = null; // the class shown, and the node picked in its tree
// merit tokens: exactly (level - 1) per class, 29 at the cap; each class keeps its own tree
const tokEarned = () => Math.max(0, profile.level - 1);
const clsSpent = (k, S) => CLASSES[k].tree.reduce((a, [id]) => a + ((S || {})[id] || 0), 0) + (AUGMENTS[k] || []).filter(x => (profile.augOwn || []).includes(x[0])).length * AUG_COST;
function syncTokens() { // recount every class from its tree; a class that spent more than its level allows gets its points back to re-spend
  const P = profile, cap = tokEarned(); P.clsSkills = P.clsSkills || {}; P.clsTok = P.clsTok || {};
  for (const k in CLASSES) {
    let S = k === P.cls ? P.skills : P.clsSkills[k] || {};
    if (clsSpent(k, S) > cap) { S = {}; P.augOwn = (P.augOwn || []).filter(id => !(AUGMENTS[k] || []).some(x => x[0] === id)); if (P.aug) P.aug[k] = null; if (k === P.cls) P.skills = S; else P.clsSkills[k] = S; }
    if (k === P.cls) P.tokens = cap - clsSpent(k, S); else P.clsTok[k] = cap - clsSpent(k, S);
  }
  if (!P.cls) P.tokens = cap; P.tokEarned = cap;
}
function clsTokens(k) { const P = profile, t = (P.clsTok || {})[k]; return t == null ? tokEarned() : t; }
function switchClass(k) {
  const P = profile; tokEarned(); P.clsSkills = P.clsSkills || {}; P.clsTok = P.clsTok || {};
  if (P.cls) { P.clsSkills[P.cls] = P.skills; P.clsTok[P.cls] = P.tokens; }
  P.skills = P.clsSkills[k] || {}; P.tokens = clsTokens(k); P.cls = k;
}
function giveTokens() { syncTokens(); } // a level-up: the count follows the level
function skillAction(kind, a) {
  const P = profile;
  if (kind === 'skview') { skView = a; skNode = null; return true; }
  if (kind === 'sknode') { skNode = a; return true; }
  if (kind === 'swcls' && CLASSES[a] && a !== P.cls && state === 'hub') { switchClass(a); skView = a; banner(CLASSES[a].name.toUpperCase(), 'Kaszt váltva · a pontjaid megmaradtak'); return true; }
  if (kind === 'cls') { const first = !P.cls; switchClass(a); if (first) { hubTab = 'jobs'; banner('KÉSZEN ÁLLSZ', 'Válassz egy munkát a térképen, és indulás!'); } return true; }
  if (kind === 'sk') {
    const def = CLASSES[P.cls].tree.find(t => t[0] === a), row = Math.floor(CLASSES[P.cls].tree.indexOf(def) / 3);
    if (P.tokens < 1 || rk(a) >= def[2] || treeSpent() < row * 3) return false;
    P.tokens--; P.skills[a] = rk(a) + 1; return true;
  }
  if (kind === 'aug') {
    const ok = (AUGMENTS[P.cls] || []).some(x => x[0] === a); if (!ok) return false;
    P.augOwn = P.augOwn || []; P.aug = P.aug || {};
    if (!P.augOwn.includes(a)) { if (P.tokens < AUG_COST || augOwned(P.cls) >= augAllowed()) return false; P.tokens -= AUG_COST; P.augOwn.push(a); }
    P.aug[P.cls] = a; return true;
  }
  if (kind === 'respec' && P.cash >= RESPEC) { P.cash -= RESPEC; P.tokens += treeSpent(); P.skills = {}; const own = (AUGMENTS[P.cls] || []).map(x => x[0]).filter(id => (P.augOwn || []).includes(id)); P.tokens += own.length * AUG_COST; P.augOwn = (P.augOwn || []).filter(id => !own.includes(id)); if (P.aug) P.aug[P.cls] = null; return true; }
  return false;
}
