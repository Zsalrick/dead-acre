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
function nz(dur, freq, vol, type = 'lowpass', q = .7, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * .5); s.stop(t + dur);
}
function tn(freq, dur, vol, type = 'square', freqEnd = 0, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
}
const SND = {
  light() { nz(.12, 2400, .5, 'bandpass', .8); tn(170, .06, .14, 'square', 60); },
  mid() { nz(.18, 1600, .6); tn(120, .08, .2, 'square', 50); },
  heavy() { nz(.35, 950, .8); tn(90, .16, .3, 'sawtooth', 35); },
  boom() { nz(.45, 700, .95); tn(70, .22, .35, 'sawtooth', 30); },
  ray() { tn(1300, .18, .16, 'square', 180); tn(620, .2, .12, 'sawtooth', 90); },
  hit() { tn(1900, .035, .05); },
  head() { tn(2600, .05, .07); tn(3400, .04, .04, 'square', 0, .03); },
  kill() { tn(900, .08, .06, 'triangle', 300); },
  hurt() { nz(.2, 300, .6, 'lowpass', 1); tn(80, .2, .4, 'sine', 40); },
  dry() { tn(1200, .02, .08); },
  reload() { nz(.05, 3000, .3, 'bandpass', 2); nz(.05, 2200, .3, 'bandpass', 2, .35); },
  knife() { nz(.12, 4000, .3, 'highpass', 1); },
  pickup(q) { [0, 1, 2].forEach(i => tn(440 * Math.pow(1.26, i + q), .18, .09, 'triangle', 0, i * .07)); },
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
  flame() { nz(.14, 900, .22, 'lowpass', .5); },
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
  groan(vol) {
    if (!ac) return;
    const t = ac.currentTime, dur = rand(.8, 1.5), o = ac.createOscillator(), lfo = ac.createOscillator();
    const lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain(), f0 = rand(60, 95);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rand(.7, 1.2), t + dur);
    lfo.frequency.value = rand(5, 9); lg.gain.value = 8; lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 480;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .15); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(f).connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  },
};
