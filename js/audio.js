// ================= AUDIO =================
let ac = null, master = null, noiseBuf = null;
function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = .45; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    initMusic();
  } catch (e) { ac = null; }
}
const flames = {}; // one held roar per shooter ('me', 'r' for teammates)
function flameHold(v = 1, key = 'me') { // a steady roar with a hissing jet on top: fades in while the trigger is held, out right after
  if (!ac || !noiseBuf) return; const t = ac.currentTime;
  let L = flames[key];
  if (!L) {
    const nb = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // 3 s: no audible loop
    const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = .7; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const jet = ac.createBiquadFilter(); jet.type = 'bandpass'; jet.frequency.value = 2500; jet.Q.value = .8; const jg = ac.createGain(); jg.gain.value = .35;
    const g = ac.createGain(); g.gain.value = 0;
    s.connect(f).connect(hp).connect(g); s.connect(jet).connect(jg).connect(g); g.connect(master);
    for (const [hz, amt] of [[.7, 150], [3.3, 60]]) { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = hz; og.gain.value = amt; o.connect(og).connect(f.frequency); o.start(); } // a natural flutter
    s.start(); L = flames[key] = { g, v: 0, last: 0 };
  }
  const hold = key === 'me' ? .22 : .3, lv = .5 * v * sndVol;
  if (L.g.gain.value < .02 && t - L.last > .3) { withVol(v, () => { nz(.25, 300, .35, 'lowpass', 1); tn(90, .2, .15, 'sine', 50); }); } // the whoomp as it lights
  L.v = t - L.last > .15 ? lv : Math.max(L.v, lv); L.last = t;
  const G = L.g.gain; if (G.cancelAndHoldAtTime) G.cancelAndHoldAtTime(t); else { G.cancelScheduledValues(t); G.setValueAtTime(G.value, t); }
  G.setTargetAtTime(L.v, t, .06); G.setTargetAtTime(0, t + hold, .12); // scheduled on the audio clock: frame hitches don't gap it
  clearTimeout(L.off); L.off = setTimeout(() => withVol(v, () => nz(.15, 700, .1)), (hold + .05) * 1000); // a short sputter when it stops
}
let sndVol = 1; // scales every sound; withVol plays one at a distance
const withVol = (v, f) => { const o = sndVol; sndVol = o * v; try { f(); } finally { sndVol = o; } };
function nz(dur, freq, vol, type = 'lowpass', q = .7, delay = 0) {
  if (!ac || sndVol < .02) return; vol *= sndVol;
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * .5); s.stop(t + dur);
}
function grunt() { // a short, low "uhh": a buzzing voice through two vowel formants, pitch falling
  if (!ac || sndVol < .02) return;
  const t = ac.currentTime, f0 = rand(105, 135), dur = rand(.2, .28), o = ac.createOscillator(), g = ac.createGain(), out = ac.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.15, t); o.frequency.exponentialRampToValueAtTime(f0 * .8, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.5 * sndVol, t + .03); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g);
  for (const [fr, q, v] of [[600, 5, 1], [1000, 6, .6], [2400, 8, .15]]) { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr * rand(.95, 1.05); f.Q.value = q; const fg = ac.createGain(); fg.gain.value = v; g.connect(f).connect(fg).connect(out); }
  out.gain.value = .9; out.connect(master); o.start(t); o.stop(t + dur + .02);
  nz(dur * .8, 900, .06 * sndVol, 'bandpass', 1.5); // breath
}
function tn(freq, dur, vol, type = 'square', freqEnd = 0, delay = 0) {
  if (!ac || sndVol < .02) return; vol *= sndVol;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
}
const SND = {
  // guns: a sharp crack, the body of the shot, a sub thump and a dark tail (the reverb does the rest)
  light() { nz(.025, 5200, .45, 'highpass', .7); nz(.12, 2200, .5, 'bandpass', .8); tn(160, .07, .22, 'sine', 55); nz(.3, 600, .1, 'lowpass', .7, .02); },
  mid() { nz(.03, 4600, .5, 'highpass', .7); nz(.18, 1500, .6); tn(120, .1, .32, 'sine', 42); nz(.45, 450, .15, 'lowpass', .7, .03); },
  heavy() { nz(.04, 4000, .55, 'highpass', .7); nz(.32, 950, .85); tn(80, .22, .5, 'sine', 30); nz(.8, 320, .24, 'lowpass', .7, .04); },
  boom() { nz(.05, 3500, .6, 'highpass', .7); nz(.45, 700, .95); tn(65, .3, .55, 'sine', 26); nz(1.1, 260, .3, 'lowpass', .7, .05); },
  ray() { tn(1300, .18, .16, 'square', 180); tn(620, .2, .12, 'sawtooth', 90); },
  hit() { nz(.07, 650, .3, 'lowpass', 2.5); tn(1900, .03, .035); },                                  // a wet thud + the marker tick
  head() { nz(.08, 1500, .4, 'bandpass', 3); nz(.05, 500, .3, 'lowpass', 2); tn(2600, .05, .06); tn(3400, .04, .035, 'square', 0, .03); },
  kill() { nz(.18, 320, .4, 'lowpass', 1.5); tn(900, .08, .05, 'triangle', 300); },
  step(run) { nz(.05, run ? 500 : 380, run ? .16 : .1, 'lowpass', 1.2); nz(.025, 2600, .035, 'bandpass', 2, .01); },
  down() { tn(220, 1.2, .18, 'sine', 70); nz(1.2, 200, .3, 'lowpass', 1); },
  hurt() { nz(.2, 300, .6, 'lowpass', 1); tn(80, .2, .4, 'sine', 40); if (now - (SND.gruntT || -9) > .35) { SND.gruntT = now; grunt(); } }, // a thud, and your own grunt
  shieldHit() { tn(2200 + Math.random() * 400, .14, .07, 'sine', 1500); nz(.1, 3800, .18, 'bandpass', 5); tn(420, .12, .08, 'triangle', 300); }, // a glassy crack
  dry() { tn(1200, .02, .08); },
  reload() { nz(.05, 3000, .3, 'bandpass', 2); nz(.05, 2200, .3, 'bandpass', 2, .35); },
  knife() { nz(.12, 4000, .3, 'highpass', 1); },
  legend(u) { [0, 1, 2, 3, 4].forEach(i => tn((u ? 330 : 392) * Math.pow(1.335, i % 3) * (i > 2 ? 2 : 1), .5, .07, 'triangle', 0, i * .09)); nz(1.2, 5000, .05, 'highpass', .5, .1); },
  threat(t = 2) { tn(55, 1.1, .16, 'sawtooth', 38); tn(82, .9, .1, 'square', 60, .04); nz(.7, 380, .14, 'lowpass', 1); if (t >= 3) { tn(110, 1.4, .1, 'sawtooth', 70, .25); nz(1, 200, .12, 'lowpass', 1, .2); } }, // something strong has arrived
  salvage(kind) { if (kind === 'g') { nz(.32, 2600, .2, 'bandpass', 2.5); nz(.22, 1400, .14, 'bandpass', 2, .1); tn(260, .12, .05, 'triangle', 180, .18); } // cloth tearing
    else { [0, 1, 2, 3].forEach(i => tn(1400 + i * 220, .05, .06, 'square', 0, i * .045)); tn(760, .14, .1, 'triangle', 0, .2); tn(1140, .22, .08, 'triangle', 0, .27); tn(180, .3, .1, 'triangle', 90, .2); nz(.16, 3200, .1, 'highpass', 1, .2); } }, // a ratchet, then the parts clatter out
  drop(q = 0) { tn(170, .16, .08, 'triangle', 90); nz(.08, 900, .06, 'lowpass', 1); if (q >= 3) [0, 1].forEach(i => tn(660 * Math.pow(1.26, i + q - 3), .2, .05, 'sine', 0, .08 + i * .08)); },
  pickup(q) { tn(1200, .04, .06, 'square'); nz(.06, 2400, .05, 'highpass', 1); [0, 1, 2].forEach(i => tn(440 * Math.pow(1.26, i + q), .18, .09, 'triangle', 0, .04 + i * .07)); },
  buy() { tn(660, .08, .1, 'square'); tn(990, .12, .1, 'square', 0, .08); },
  heal() { [0, 1].forEach(i => tn(520 + i * 260, .2, .09, 'sine', 0, i * .1)); },
  sell() { [0, 1, 2].forEach(i => tn(1200 + i * 400, .07, .07, 'square', 0, i * .05)); },
  explode() { nz(1.1, 260, 1.1); tn(55, .8, .5, 'sine', 25); },
  zshot(v) { nz(.3, 1000, v); tn(100, .14, v * .4, 'sawtooth', 40); },
  whiz() { tn(2600, .16, .06, 'sine', 500); },
  spit() { nz(.25, 900, .3, 'bandpass', 3); },
  fuse() { tn(300, .7, .12, 'square', 1400); },
  deny() { tn(160, .18, .12, 'square', 120); },
  // new weapons
  bow() { nz(.12, 1800, .35, 'bandpass', 2); tn(180, .18, .18, 'triangle', 90); },
  flame(v = 1, key) { flameHold(v, key); if (Math.random() < .4) withVol(v, () => nz(.02 + Math.random() * .02, 1500 + Math.random() * 2500, .12 + Math.random() * .06, 'bandpass', 3)); }, // a held roar (flameHold) and the odd crackle
  thump() { nz(.2, 400, .6, 'lowpass', 1); tn(120, .15, .3, 'sine', 50); },
  zap() { tn(1800, .08, .1, 'sawtooth', 300); nz(.1, 5000, .15, 'highpass', 1); },
  spin(v) { tn(220 + v * 500, .09, .05 * v, 'sawtooth', 240 + v * 520); },
  // reload steps
  magOut() { nz(.05, 2400, .3, 'bandpass', 3); tn(500, .05, .06, 'square', 300); },
  magIn() { nz(.04, 3200, .35, 'bandpass', 3); nz(.05, 1800, .3, 'bandpass', 3, .05); },
  bolt() { nz(.05, 3600, .3, 'bandpass', 4); nz(.06, 2200, .3, 'bandpass', 4, .08); },
  shellIn() { nz(.04, 2800, .28, 'bandpass', 4); tn(900, .03, .04, 'triangle'); },
  pump() { nz(.07, 1500, .35, 'bandpass', 2); nz(.07, 1100, .35, 'bandpass', 2, .12); },
  drumOpen() { nz(.06, 3000, .25, 'bandpass', 5); },
  drumSpin() { for (let i = 0; i < 6; i++) nz(.02, 4200, .12, 'bandpass', 6, i * .04); },
  brass() { for (let i = 0; i < 5; i++) tn(2400 + Math.random() * 1200, .06, .03, 'triangle', 0, i * .05); },
  breakOpen() { nz(.08, 1200, .35, 'bandpass', 2); },
  breakClose() { nz(.06, 900, .45, 'bandpass', 2); tn(200, .05, .1, 'square', 120); },
  // new enemies
  armorBreak() { nz(.25, 3000, .4, 'bandpass', 2); tn(700, .2, .12, 'square', 200); },
  scream(v = .3) { tn(900, .9, v * .5, 'sawtooth', 1500); nz(.9, 2800, v, 'bandpass', 3); },
  leap() { nz(.3, 700, .3, 'lowpass', 1); },
  roar() { tn(80, 1.4, .45, 'sawtooth', 55); nz(1.2, 400, .5, 'lowpass', 1); },
  slam() { nz(.6, 200, 1, 'lowpass', 1); tn(45, .6, .5, 'sine', 25); },
  power() { [0, 1, 2, 3].forEach(i => tn(520 + i * 180, .16, .09, 'triangle', 0, i * .06)); },
  roundStart() { tn(110, 1.6, .25, 'sawtooth', 82); tn(165, 1.6, .15, 'triangle', 123, .15); },
  roundEnd() { [0, 1, 2].forEach(i => tn(220 * Math.pow(1.19, i), .7, .12, 'triangle', 0, i * .22)); },
  // a throat, not a buzzer: a rough voice through two vocal formants that slide from 'oo' to 'aa', with breath, placed left/right
  groan(vol, pan = 0) {
    if (!ac) return;
    const t = ac.currentTime, dur = rand(.9, 1.8), f0 = rand(55, 95), o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * rand(1, 1.25), t); o.frequency.linearRampToValueAtTime(f0 * rand(.65, .9), t + dur);
    lfo.frequency.value = rand(4, 11); lg.gain.value = rand(4, 12); lfo.connect(lg).connect(o.frequency);
    const br = ac.createBufferSource(), bg = ac.createGain(); br.buffer = noiseBuf; bg.gain.value = .35;
    const g = ac.createGain(), sp = ac.createStereoPanner ? ac.createStereoPanner() : null;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .18); g.gain.setValueAtTime(vol * .8, t + dur * .6); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    for (const [a, b, q, lv] of [[rand(300, 420), rand(600, 800), 5, 1], [rand(700, 900), rand(1000, 1300), 7, .6]]) {
      const f = ac.createBiquadFilter(), fg = ac.createGain(); f.type = 'bandpass'; f.Q.value = q; fg.gain.value = lv;
      f.frequency.setValueAtTime(a, t); f.frequency.linearRampToValueAtTime(b, t + dur * .5); f.frequency.linearRampToValueAtTime(a * .9, t + dur);
      o.connect(f); br.connect(bg).connect(f); f.connect(fg).connect(g);
    }
    if (sp) { sp.pan.value = clamp(pan, -1, 1); g.connect(sp).connect(master); } else g.connect(master);
    o.start(t); lfo.start(t); br.start(t, Math.random() * .5); o.stop(t + dur); lfo.stop(t + dur); br.stop(t + dur);
  },
};
