// ================= SETTINGS =================
// per-viewer preferences, kept in localStorage (guarded: it can be blocked)
const SET_KEY = 'deadacre.settings';
const SET_DEF = { binds: {}, fpsCap: 0, showFps: true, hudScale: 1, uiScale: 1, sens: 1, adsSens: .8, invertY: false, fov: 75, master: .8, music: .5, sfx: 1, gfx: devicePixelRatio > 1.25 ? 1 : 2 }; // gfx: high-DPI laptop screens start on medium
const SET = Object.assign({}, SET_DEF, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; } })());
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); } catch (e) {} applyVolumes(); }

// ================= MUSIC =================
// small generative tracks: a chord progression, pad, bass, arpeggio, a seeded melody and light drums.
// 3 for the base and 3 per map; the playlist rotates every ~40 bars and crossfades between places.
let out = null, musicBus = null, echo = null;
function applyVolumes() {
  if (!ac) return;
  out.gain.value = SET.master; master.gain.value = .45 * SET.sfx; musicBus.gain.value = .65 * SET.music;
}
function initMusic() { // called once from initAudio: reroutes sfx through `out` and adds the music bus with an echo send
  out = ac.createGain();
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .18;
  out.connect(comp).connect(ac.destination);
  master.disconnect(); master.connect(out);
  // a night-time open-air room: a short, dark reverb under every effect
  const len = Math.floor(ac.sampleRate * 1.8), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  const rev = ac.createConvolver(), rlp = ac.createBiquadFilter(), wet = ac.createGain(); rev.buffer = ir; rlp.type = 'lowpass'; rlp.frequency.value = 2600; wet.gain.value = .32;
  master.connect(rev).connect(rlp).connect(wet).connect(out);
  musicBus = ac.createGain(); musicBus.connect(out);
  echo = ac.createDelay(1); echo.delayTime.value = .36;
  const fb = ac.createGain(), lp = ac.createBiquadFilter(); fb.gain.value = .32; lp.type = 'lowpass'; lp.frequency.value = 1800;
  echo.connect(lp).connect(fb).connect(echo); lp.connect(musicBus);
  applyVolumes();
}

const MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], PHR = [0, 1, 3, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11];
// pat strings: 16 steps per bar, 1 = hit
const MUSIC = {
  hub: [
    { name: 'Hajnal előtt', bpm: 72, root: 45, scale: DOR, prog: [0, 5, 3, 4], pad: 'tri', cut: 1400, bass: { wave: 'sine', pat: '1000000010000000' }, arp: { wave: 'triangle', every: 4, vol: .05 }, lead: { wave: 'sine', dens: .12 }, seed: 11 },
    { name: 'Olajlámpa', bpm: 88, root: 50, scale: MIN, prog: [0, 5, 2, 6], pad: 'saw', cut: 900, bass: { wave: 'triangle', pat: '1000001010000000' }, arp: { wave: 'square', every: 2, vol: .022 }, lead: { wave: 'triangle', dens: .16 }, drums: { kick: '1000000010000000', hat: '0000100000001000' }, seed: 22 },
    { name: 'Fegyverolaj', bpm: 98, root: 40, scale: DOR, prog: [0, 0, 3, 4], pad: 'tri', cut: 1100, bass: { wave: 'sawtooth', pat: '1010001010100010' }, lead: { wave: 'square', dens: .18 }, drums: { kick: '1000001000100000', hat: '0010001000100010', snare: '0000100000001000' }, seed: 33 },
  ],
  farm: [
    { name: 'Kukoricás', bpm: 112, root: 43, scale: HMIN, prog: [0, 3, 4, 0], cut: 2400, bass: { wave: 'triangle', pat: '1000100010001000' }, arp: { wave: 'square', every: 1, vol: .018 }, lead: { wave: 'triangle', dens: .14 }, drums: { kick: '1000000010000000', hat: '0010001000100010' }, seed: 41 },
    { name: 'A csűr mögött', bpm: 84, root: 45, scale: MIN, prog: [0, 6, 5, 4], pad: 'tri', cut: 1200, bass: { wave: 'sine', pat: '1000000000100000' }, arp: { wave: 'triangle', every: 2, vol: .04 }, lead: { wave: 'sine', dens: .1 }, seed: 42 },
    { name: 'Szélmalom', bpm: 124, root: 38, scale: HMIN, prog: [0, 0, 4, 4, 3, 3, 4, 4], cut: 1600, bass: { wave: 'sawtooth', pat: '1010101010101010' }, arp: { wave: 'square', every: 2, vol: .02 }, lead: { wave: 'square', dens: .12 }, drums: { kick: '1000100010001000', hat: '0010001000100010', snare: '0000100000001000' }, seed: 43 },
  ],
  chapel: [
    { name: 'Harangszó', bpm: 60, root: 41, scale: PHR, prog: [0, 1, 0, 6], pad: 'organ', cut: 2000, bass: { wave: 'sine', pat: '1000000000000000' }, lead: { wave: 'sine', dens: .08, bell: true }, seed: 51 },
    { name: 'Kripta', bpm: 70, root: 44, scale: HMIN, prog: [0, 5, 1, 4], pad: 'organ', cut: 1600, bass: { wave: 'triangle', pat: '1000000010000000' }, arp: { wave: 'triangle', every: 4, vol: .04 }, lead: { wave: 'sine', dens: .1, bell: true }, drums: { kick: '1000000000000000' }, seed: 52 },
    { name: 'Gyertyafény', bpm: 92, root: 38, scale: PHR, prog: [0, 1, 6, 0], pad: 'saw', cut: 700, bass: { wave: 'sawtooth', pat: '1000100010001000' }, arp: { wave: 'triangle', every: 2, vol: .035 }, lead: { wave: 'triangle', dens: .13 }, drums: { kick: '1000000010000000', snare: '0000000000001000' }, seed: 53 },
  ],
  gas: [
    { name: 'Route 9', bpm: 120, root: 40, scale: MIN, prog: [0, 5, 6, 4], pad: 'saw', cut: 800, bass: { wave: 'sawtooth', pat: '1111111111111111', vol: .06 }, arp: { wave: 'square', every: 2, vol: .02 }, lead: { wave: 'square', dens: .1 }, drums: { kick: '1000100010001000', hat: '0010001000100010', snare: '0000100000001000' }, seed: 61 },
    { name: 'Neon', bpm: 104, root: 45, scale: DOR, prog: [0, 3, 0, 4], pad: 'saw', cut: 1000, bass: { wave: 'sawtooth', pat: '1000101010001010' }, arp: { wave: 'triangle', every: 1, vol: .025 }, lead: { wave: 'triangle', dens: .14 }, drums: { kick: '1000000010000000', hat: '1010101010101010' }, seed: 62 },
    { name: 'Kiégett', bpm: 132, root: 42, scale: PHR, prog: [0, 1, 0, 1, 6, 6, 0, 1], cut: 1400, bass: { wave: 'sawtooth', pat: '1011101110111011', vol: .05 }, lead: { wave: 'square', dens: .1 }, drums: { kick: '1000100010001000', hat: '0010001000100010', snare: '0000100000001000' }, seed: 63 },
  ],
  mill: [
    { name: 'Fűrészpor', bpm: 100, root: 43, scale: DOR, prog: [0, 6, 5, 6], pad: 'tri', cut: 1200, bass: { wave: 'triangle', pat: '1000001000100000' }, lead: { wave: 'triangle', dens: .12 }, drums: { tom: '1000001000100100', hat: '0010001000100010' }, seed: 71 },
    { name: 'Erdőszél', bpm: 80, root: 47, scale: MIN, prog: [0, 4, 5, 3], pad: 'tri', cut: 1300, arp: { wave: 'triangle', every: 2, vol: .04 }, lead: { wave: 'sine', dens: .1 }, drums: { tom: '1000000000100000' }, seed: 72 },
    { name: 'Rönkök', bpm: 116, root: 40, scale: HMIN, prog: [0, 0, 5, 4], cut: 1500, bass: { wave: 'sawtooth', pat: '1010001010100010' }, arp: { wave: 'square', every: 2, vol: .02 }, lead: { wave: 'square', dens: .1 }, drums: { kick: '1000000010100000', tom: '0000100100001001', hat: '1010101010101010' }, seed: 73 },
  ],
  town: [
    { name: 'Főutca', bpm: 96, root: 45, scale: HMIN, prog: [0, 3, 4, 0], pad: 'tri', cut: 1300, bass: { wave: 'triangle', pat: '1000001010000010' }, arp: { wave: 'triangle', every: 2, vol: .035 }, lead: { wave: 'triangle', dens: .15 }, drums: { kick: '1000000010000000', hat: '0010001000100010' }, seed: 81 },
    { name: 'Délidő', bpm: 70, root: 40, scale: PHR, prog: [0, 1, 0, 6], pad: 'saw', cut: 800, bass: { wave: 'sine', pat: '1000000000100000' }, lead: { wave: 'sine', dens: .09, bell: true }, drums: { tom: '1000000000000010' }, seed: 82 },
    { name: 'Szalonzongora', bpm: 118, root: 43, scale: DOR, prog: [0, 3, 0, 4], cut: 1800, bass: { wave: 'triangle', pat: '1000100010001000' }, arp: { wave: 'square', every: 1, vol: .016 }, lead: { wave: 'square', dens: .13 }, drums: { kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100010' }, seed: 83 },
  ],
  hospital: [ // fluorescent hum and a heart monitor that won't stop
    { name: 'Ügyelet', bpm: 70, root: 40, scale: HMIN, prog: [0, 5, 1, 4], pad: 'saw', cut: 800, bass: { wave: 'sine', pat: '1000000010000000' }, arp: { wave: 'square', every: 4, vol: .025 }, lead: { wave: 'sine', dens: .06, bell: true }, seed: 111 },
    { name: 'Kiürítés', bpm: 132, root: 42, scale: PHR, prog: [0, 1, 0, 1, 6, 6, 5, 5], cut: 1800, bass: { wave: 'sawtooth', pat: '1010101010101010', vol: .05 }, arp: { wave: 'square', every: 2, vol: .02 }, drums: { kick: '1000100010001000', hat: '0101010101010101', snare: '0000100000001000' }, seed: 112 },
    { name: 'Hullaház', bpm: 58, root: 36, scale: MIN, prog: [0, 6, 5, 4], pad: 'organ', cut: 1000, bass: { wave: 'triangle', pat: '1000000000000000' }, lead: { wave: 'sine', dens: .05, bell: true }, seed: 113 },
  ],
  fair: [ // a broken-down fairground organ
    { name: 'Körhinta', bpm: 138, root: 48, scale: HMIN, prog: [0, 4, 0, 4, 3, 0, 4, 0], pad: 'organ', cut: 2200, bass: { wave: 'triangle', pat: '1000100010001000', vol: .07 }, arp: { wave: 'square', every: 1, vol: .02 }, lead: { wave: 'square', dens: .14 }, drums: { kick: '1000000010000000', hat: '0010001000100010' }, seed: 101 },
    { name: 'Vattacukor', bpm: 76, root: 43, scale: MIN, prog: [0, 5, 3, 4], pad: 'tri', cut: 1300, bass: { wave: 'sine', pat: '1000000010000000' }, lead: { wave: 'sine', dens: .09, bell: true }, seed: 102 },
    { name: 'Tükörlabirintus', bpm: 104, root: 41, scale: PHR, prog: [0, 1, 0, 6], pad: 'saw', cut: 900, bass: { wave: 'sawtooth', pat: '1010001010100010', vol: .06 }, arp: { wave: 'triangle', every: 2, vol: .035 }, drums: { kick: '1000001010000000', snare: '0000100000001000', hat: '1010101010101010' }, seed: 103 },
  ],
  quarry: [
    { name: 'Kőpor', bpm: 84, root: 38, scale: MIN, prog: [0, 0, 5, 6], pad: 'saw', cut: 600, bass: { wave: 'sawtooth', pat: '1000000010000000', vol: .1 }, lead: { wave: 'sine', dens: .08 }, drums: { kick: '1000000000100000', tom: '0000000100000001' }, seed: 91 },
    { name: 'Robbantás', bpm: 128, root: 41, scale: PHR, prog: [0, 1, 0, 1, 5, 5, 6, 6], cut: 1500, bass: { wave: 'sawtooth', pat: '1011101110111011', vol: .05 }, arp: { wave: 'square', every: 2, vol: .02 }, lead: { wave: 'square', dens: .1 }, drums: { kick: '1000100010001000', hat: '1010101010101010', snare: '0000100000001000' }, seed: 92 },
    { name: 'Mélyfúrás', bpm: 62, root: 36, scale: HMIN, prog: [0, 5, 3, 4], pad: 'organ', cut: 1200, bass: { wave: 'sine', pat: '1000000000000000' }, arp: { wave: 'triangle', every: 4, vol: .04 }, lead: { wave: 'sine', dens: .07, bell: true }, seed: 93 },
  ],
};
const mhz = m => 440 * Math.pow(2, (m - 69) / 12);
const deg = (T, d) => T.root + T.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7); // scale degree -> midi
const chord = (T, d) => [0, 2, 4].map(k => deg(T, d + k));
function voice(t, f, dur, vol, wave, cut, atk = .01, dst = mus.bus) {
  const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
  o.type = wave; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cut;
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(fl).connect(g).connect(dst); o.start(t); o.stop(t + dur + .05);
  return g;
}
function hit(t, kind) {
  const b = mus.bus;
  if (kind === 'kick' || kind === 'tom') {
    const o = ac.createOscillator(), g = ac.createGain(), [f0, f1, v] = kind === 'kick' ? [120, 42, .5] : [190, 95, .3];
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + .14);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .28);
    o.connect(g).connect(b); o.start(t); o.stop(t + .3);
  } else {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), hat = kind === 'hat';
    s.buffer = noiseBuf; f.type = hat ? 'highpass' : 'bandpass'; f.frequency.value = hat ? 7000 : 1700;
    g.gain.setValueAtTime(hat ? .07 : .18, t); g.gain.exponentialRampToValueAtTime(.001, t + (hat ? .04 : .14));
    s.connect(f).connect(g).connect(b); s.start(t, Math.random() * .5); s.stop(t + .16);
  }
}
// a seeded melody: one phrase per progression cycle, mostly chord tones, sometimes a passing note
function melody(T) {
  const r = mulberry(T.seed), bars = [];
  for (let b = 0; b < T.prog.length; b++) {
    const steps = [];
    for (let s = 0; s < 16; s++) {
      const strong = s % 4 === 0;
      if (r() < T.lead.dens * (strong ? 2.2 : .7)) steps[s] = { d: T.prog[b] + [0, 2, 4, 7][Math.floor(r() * 4)] + (r() < .25 ? 1 : 0), len: 1 + Math.floor(r() * 3) };
    }
    bars.push(steps);
  }
  return bars;
}

let mus = null, musWant = null;
function startTrack(key, idx) {
  const T0 = MUSIC[key][idx], T = key === 'hub' ? T0 : Object.assign({}, T0, { bpm: Math.max(T0.bpm * 1.15, 116), cut: (T0.cut || 1200) * 1.4, // in a job: harder, faster, always drums
    drums: T0.drums || { kick: '1000100010001000', hat: '1010101010101010', snare: '0000100000001000' }, lead: T0.lead && Object.assign({}, T0.lead, { dens: Math.min(.35, (T0.lead.dens || .1) * 1.4) }) }), bus = ac.createGain(), t = ac.currentTime;
  bus.gain.setValueAtTime(.0001, t); bus.gain.exponentialRampToValueAtTime(1, t + 2.5); bus.connect(musicBus);
  mus = { key, idx, T, bus, step: 0, next: t + .15, mel: T.lead ? melody(T) : null };
}
function stopTrack() {
  if (!mus) return;
  const b = mus.bus, t = ac.currentTime;
  b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0, t + 2);
  setTimeout(() => b.disconnect(), 2600);
  mus = null;
}
// the place decides the playlist; a new place picks a random track from it
function playMusic(key) {
  musWant = key;
  if (!ac || (mus && mus.key === key)) return;
  stopTrack(); startTrack(key, Math.floor(Math.random() * MUSIC[key].length));
}
const nowPlaying = () => mus ? mus.T.name : '—';
function musicTick() {
  if (!ac || !mus) { if (ac && musWant) playMusic(musWant); return; }
  if (mus.next < ac.currentTime - .2) mus.next = ac.currentTime + .05; // tab was asleep: skip ahead instead of bursting
  const T = mus.T, st = 60 / T.bpm / 4, barLen = st * 16;
  while (mus.next < ac.currentTime + .4) {
    const t = mus.next, s = mus.step % 16, bar = Math.floor(mus.step / 16), pi = bar % T.prog.length, d = T.prog[pi], ch = chord(T, d);
    if (s === 0 && T.pad) {
      const [w, cut] = T.pad === 'saw' ? ['sawtooth', T.cut] : T.pad === 'organ' ? ['square', 900] : ['triangle', 2000];
      ch.forEach(m => { voice(t, mhz(m) * 1.003, barLen * 1.05, .03, w, cut, barLen * .35); voice(t, mhz(m) * .997, barLen * 1.05, .03, w, cut, barLen * .35); });
      if (T.pad === 'organ') ch.forEach(m => voice(t, mhz(m + 12), barLen, .02, 'sine', 3000, barLen * .3));
    }
    if (T.bass && T.bass.pat[s] === '1') voice(t, mhz(deg(T, d) - 12), st * 1.8, T.bass.vol || .12, T.bass.wave, 500 + (T.cut || 800) * .3);
    if (T.arp && s % T.arp.every === 0) { const k = (s / T.arp.every) % 4; voice(t, mhz(ch[[0, 1, 2, 1][k]] + 12), st * T.arp.every * 1.4, T.arp.vol, T.arp.wave, T.cut || 1500); }
    if (mus.mel && Math.floor(bar / T.prog.length) % 3 !== 2) { // the lead rests every third cycle
      const n = mus.mel[pi][s];
      if (n) { const g = voice(t, mhz(deg(T, n.d) + 12), st * n.len * (T.lead.bell ? 4 : 1.2), T.lead.bell ? .07 : .05, T.lead.wave, 2600, .01); g.connect(echo); }
    }
    if (T.drums) for (const k in T.drums) if (T.drums[k][s] === '1') hit(t, k);
    mus.next += st; mus.step++;
    if (mus.step >= 16 * Math.max(32, T.prog.length * 8)) { const key = mus.key, i = (mus.idx + 1) % MUSIC[key].length; stopTrack(); startTrack(key, i); return; }
  }
}
setInterval(musicTick, 100);
// browsers only start audio after a gesture: the first click or key anywhere wakes it up
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => initAudio(), { once: true }));

// ================= SETTINGS SCREEN =================
const SET_UI = [
  ['sens', 'Egérérzékenység', .2, 3, .05, v => `${v.toFixed(2)}×`],
  ['adsSens', 'Érzékenység célzáskor', .2, 1.5, .05, v => `${v.toFixed(2)}×`],
  ['fov', 'Látószög (FOV)', 60, 100, 1, v => `${v}°`],
  ['master', 'Fő hangerő', 0, 1, .05, v => `${Math.round(v * 100)}%`],
  ['music', 'Zene', 0, 1, .05, v => `${Math.round(v * 100)}%`],
  ['sfx', 'Effektek', 0, 1, .05, v => `${Math.round(v * 100)}%`],
  ['gfx', 'Minőség', 0, 2, 1, v => ['Alacsony', 'Közepes', 'Magas'][v]],
  ['fpsCap', 'FPS-korlát', 0, 5, 1, v => v ? `${FPS_CAPS[v]} FPS` : 'Nincs'],
  ['hudScale', 'HUD mérete', .7, 1.6, .05, v => `${Math.round(v * 100)}%`],
  ['uiScale', 'Menük mérete', .7, 1.6, .05, v => `${Math.round(v * 100)}%`],
];
const FPS_CAPS = [0, 30, 60, 90, 120, 144];
// key bindings: SET.binds maps an action's default key to the key the player chose; the game reads the default codes
const BINDS = [['KeyW', 'Előre'], ['KeyS', 'Hátra'], ['KeyA', 'Balra'], ['KeyD', 'Jobbra'], ['ShiftLeft', 'Sprint'], ['Space', 'Ugrás'], ['KeyR', 'Újratöltés'], ['KeyE', 'Használat, felélesztés'],
  ['KeyF', 'Felvétel a földről'], ['Digit1', '1. fegyver'], ['Digit2', '2. fegyver'], ['KeyV', 'Kés'], ['KeyH', 'Gyógyítás'], ['KeyG', 'Gránát'], ['KeyQ', 'Dobókés'], ['KeyT', 'Stimuláns'],
  ['KeyC', 'Kasztképesség'], ['KeyZ', 'Pingelés'], ['KeyI', 'Leltár']];
const keyName = c => c ? c.replace(/^Key|^Digit/, '').replace(/^Shift(Left|Right)$/, 'Shift').replace(/^Control(Left|Right)$/, 'Ctrl').replace(/^Alt(Left|Right)$/, 'Alt').replace('Space', 'Szóköz').replace(/^Numpad/, 'Num ') : '–';
const boundKey = d => (SET.binds || {})[d] || d;
function keyCode(p) { // physical key -> the default code of the action bound to it; a default key moved elsewhere does nothing
  const b = SET.binds || {}; for (const d in b) if (b[d] === p) return d;
  return b[p] && b[p] !== p ? null : p;
}
let bindWait = null;
function bindKey(e) { // while the settings wait for a key: take it, swapping with an action that already had it
  if (!bindWait) return false; e.preventDefault();
  if (e.code !== 'Escape') {
    const b = SET.binds = Object.assign({}, SET.binds), old = boundKey(bindWait), other = BINDS.find(([d]) => d !== bindWait && boundKey(d) === e.code);
    if (other) b[other[0]] = old; b[bindWait] = e.code;
    for (const d in b) if (b[d] === d) delete b[d];
    saveSettings();
  }
  bindWait = null; openSettings(); return true;
}
function openSettings() {
  const row = ([k, n, a, b, st, f]) => `<label class="setrow"><span>${n}${k === 'music' && mus ? `<small>♪ ${nowPlaying()}</small>` : ''}</span>
    <input type="range" min="${a}" max="${b}" step="${st}" value="${SET[k]}" data-set="${k}"><output id="out_${k}">${f(SET[k])}</output></label>`;
  $('settingsBody').innerHTML = '<h3>Irányítás</h3>' + SET_UI.slice(0, 3).map(row).join('') +
    `<label class="setrow"><span>Függőleges egér megfordítása</span><input type="checkbox" data-set="invertY"${SET.invertY ? ' checked' : ''}><output></output></label>` +
    '<h3>Hang</h3>' + SET_UI.slice(3, 6).map(row).join('') +
    '<h3>Grafika</h3>' + SET_UI.slice(6, 8).map(row).join('') +
    `<label class="setrow"><span>FPS-számláló a sarokban</span><input type="checkbox" data-set="showFps"${SET.showFps ? ' checked' : ''}><output></output></label>` +
    '<h3>Felület <small>a betűk és a panelek mérete; a HUD a játék közbeni kijelzés</small></h3>' + SET_UI.slice(8).map(row).join('') +
    '<h3>Billentyűk <small>kattints, majd nyomd meg az új gombot (Esc: mégse)</small></h3><div class="binds">' + BINDS.map(([d, n]) => `<div class="setrow"><span>${n}</span><button class="sbtn bindb${bindWait === d ? ' wait' : ''}" data-bind="${d}">${bindWait === d ? 'Nyomj egy gombot…' : keyName(boundKey(d))}</button></div>`).join('') + '</div>';
  $('settings').hidden = false;
}
function closeSettings() { bindWait = null; $('settings').hidden = true; }
$('settingsBody').addEventListener('input', e => {
  const k = e.target.dataset.set; if (!k) return;
  SET[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
  const u = SET_UI.find(r => r[0] === k); if (u) $('out_' + k).textContent = u[5](SET[k]);
  if (k === 'hudScale' || k === 'uiScale') setUiZ();
  saveSettings();
});
$('settingsReset').onclick = () => { Object.assign(SET, SET_DEF); saveSettings(); setUiZ(); openSettings(); };
$('settingsClose').onclick = closeSettings;
$('settingsBody').addEventListener('click', e => { const b = e.target.closest('[data-bind]'); if (b) { bindWait = b.dataset.bind; openSettings(); } });
document.querySelectorAll('[data-settings]').forEach(b => b.onclick = openSettings);
