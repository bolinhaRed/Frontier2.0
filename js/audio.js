// Som do FRONTIER — tudo sintetizado com Web Audio (sem ficheiros: leve e funciona offline).
// Música generativa "de taberna": alaúde dedilhado (Karplus-Strong), bordão, flauta e tambor de mão,
// que muda com as estações. Efeitos: seleção, exploração, descobertas, erros, fim de expedição.

const SCALES = {
  dorian:  [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  mixo:    [0, 2, 4, 5, 7, 9, 10]
};
const MOODS = {
  menu:      { scale: 'dorian',  bpm: 76, drum: false, density: 0.55, flute: 0.5 },
  Primavera: { scale: 'dorian',  bpm: 84, drum: true,  density: 0.7,  flute: 0.55 },
  'Verão':   { scale: 'mixo',    bpm: 90, drum: true,  density: 0.75, flute: 0.45 },
  Outono:    { scale: 'aeolian', bpm: 72, drum: true,  density: 0.55, flute: 0.5 },
  Inverno:   { scale: 'aeolian', bpm: 60, drum: false, density: 0.4,  flute: 0.6 }
};
const PROGRESSIONS = [[0, 6, 3, 0], [0, 3, 4, 0], [0, 6, 5, 4], [0, 2, 3, 6], [5, 3, 6, 0]];
const ROOT = 50; // Ré 3
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;
const pickOne = a => a[Math.floor(Math.random() * a.length)];

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.vol = { music: 0.55, sfx: 0.8 };
    this.muted = false;
    this.wantMusic = true;
    this.mood = MOODS.menu; this.moodName = 'menu';
    this.cache = new Map();
    this.timer = null;
  }

  // O navegador só deixa tocar som depois de um toque/clique.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);
    this.reverb = c.createConvolver(); this.reverb.buffer = this._impulse(2.6);
    this.reverb.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.vol.sfx;
    for (const [bus, wet] of [[this.musicBus, 0.38], [this.sfxBus, 0.18]]) {
      bus.connect(this.master);
      const send = c.createGain(); send.gain.value = wet; bus.connect(send).connect(this.reverb);
    }
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) c.suspend(); else c.resume();
    });
    if (this.wantMusic) this.startMusic();
  }

  setVolume(kind, v) {
    this.vol[kind] = v;
    if (!this.ctx) return;
    const bus = kind === 'music' ? this.musicBus : this.sfxBus;
    bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.08);
  }
  setMood(name) {
    if (!MOODS[name] || name === this.moodName) return;
    this.moodName = name; this.mood = MOODS[name];
  }

  // ---------- instrumentos ----------
  _impulse(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  // Corda dedilhada (Karplus-Strong), em cache por nota.
  _pluckBuf(freq, bright = 0.5) {
    const k = Math.round(freq * 10) + ':' + bright;
    if (this.cache.has(k)) return this.cache.get(k);
    const c = this.ctx, sr = c.sampleRate, N = Math.max(2, Math.round(sr / freq));
    const dur = freq < 150 ? 2.4 : 1.8, len = Math.floor(sr * dur);
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(N); let prev = 0;
    for (let i = 0; i < N; i++) { prev += ((Math.random() * 2 - 1) - prev) * (0.25 + bright * 0.6); ring[i] = prev; }
    const decay = Math.pow(0.5, 1 / (freq * (freq < 150 ? 0.9 : 0.55)));
    let idx = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % N];
      d[i] = a; ring[idx] = (a + b) * 0.5 * decay; idx = (idx + 1) % N;
      if (Math.abs(a) > peak) peak = Math.abs(a);
    }
    const norm = 0.9 / (peak || 1); for (let i = 0; i < len; i++) d[i] *= norm;
    this.cache.set(k, buf);
    return buf;
  }
  pluck(freq, t, gain = 0.3, pan = 0, bus = this.musicBus, bright = 0.5) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), p = c.createStereoPanner();
    s.buffer = this._pluckBuf(freq, bright); g.gain.value = gain; p.pan.value = pan;
    s.connect(g).connect(p).connect(bus); s.start(t);
  }
  flute(freq, t, dur, gain = 0.07) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    const lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sine'; o.frequency.value = freq; o2.type = 'triangle'; o2.frequency.value = freq * 2;
    const g2 = c.createGain(); g2.gain.value = 0.12;
    lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.4, dur * 0.6));
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.09);
    g.gain.setValueAtTime(gain, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur + 0.15);
    o.connect(g); o2.connect(g2).connect(g); g.connect(f).connect(this.musicBus);
    // sopro
    const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = this.noise; nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 3;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(gain * 0.25, t + 0.05); ng.gain.linearRampToValueAtTime(0, t + 0.25);
    n.connect(nf).connect(ng).connect(this.musicBus);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.3); }
    n.start(t, rnd(0, 0.5), 0.3);
  }
  drone(freqs, t, dur, gain = 0.045) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 1.2);
    g.gain.setValueAtTime(gain, t + dur - 0.4); g.gain.linearRampToValueAtTime(0, t + dur + 1.4);
    g.connect(f).connect(this.musicBus);
    for (const fr of freqs) for (const det of [-5, 5]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      const og = c.createGain(); og.gain.value = 0.5; o.connect(og).connect(g); o.start(t); o.stop(t + dur + 1.6);
    }
  }
  drum(t, gain = 0.22, bus = this.musicBus) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.4);
    this.hiss(t, 0.04, 900, gain * 0.35, bus, 'lowpass');
  }
  hiss(t, dur, freq, gain, bus = this.sfxBus, type = 'bandpass', toFreq = null) {
    const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = 0.8;
    if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(bus); n.start(t, rnd(0, 0.6), dur + 0.05);
  }
  bell(freq, t, gain = 0.12, bus = this.sfxBus) {
    const c = this.ctx;
    for (const [mul, g0, d] of [[1, 1, 1.6], [2.76, 0.4, 0.9], [5.4, 0.18, 0.5]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq * mul; g.gain.setValueAtTime(gain * g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(bus); o.start(t); o.stop(t + d + 0.05);
    }
  }
  horn(freq, t, dur, gain = 0.06, bus = this.sfxBus) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1400, t + 0.25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.12); g.gain.setValueAtTime(gain, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur + 0.25);
    o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.3);
  }

  // ---------- música generativa ----------
  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.timer) return;
    const c = this.ctx;
    this.musicBus.gain.cancelScheduledValues(c.currentTime);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, c.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(this.vol.music, c.currentTime + 3);
    this.next = c.currentTime + 0.3; this.step = 0; this.bar = 0; this.prog = pickOne(PROGRESSIONS); this.mel = 4;
    this.timer = setInterval(() => this._schedule(), 60);
  }
  stopMusic() {
    this.wantMusic = false;
    if (!this.ctx) return;
    clearInterval(this.timer); this.timer = null;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }
  _note(deg, oct = 0) {
    const sc = SCALES[this.mood.scale], n = sc.length;
    const o = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return mtof(ROOT + 12 * (oct + o) + sc[i]);
  }
  _schedule() {
    const c = this.ctx;
    if (c.state !== 'running') { this.next = c.currentTime + 0.2; return; }
    while (this.next < c.currentTime + 0.3) {
      this._eighth(this.next);
      this.next += 30 / this.mood.bpm * rnd(0.985, 1.015); // ligeiro "swing" humano
    }
  }
  _eighth(t) {
    const m = this.mood, s = this.step % 8, cycle = 16; // compassos por ciclo
    const barInCycle = this.bar % cycle;
    const rest = barInCycle >= 14;                       // respiração no fim do ciclo
    const chord = this.prog[Math.floor(barInCycle / 2) % 4];
    const tones = [chord, chord + 2, chord + 4];
    const beat = 30 / m.bpm;

    if (s === 0) {
      if (barInCycle % 2 === 0) {
        this.drone([this._note(chord, -1), this._note(chord + 4, -1)], t, beat * 16, rest ? 0.035 : 0.045);
        if (barInCycle === 0) { this.prog = pickOne(PROGRESSIONS); this.pattern = null; }
      }
      this.pattern = chance(0.35) || !this.pattern ? pickOne([[1,0,1,1,0,1,1,0],[1,0,1,0,1,0,1,1],[1,1,0,1,1,0,1,0],[1,0,0,1,0,0,1,0]]) : this.pattern;
      this.phraseFlute = !rest && barInCycle % 4 === 0 ? chance(m.flute) : this.phraseFlute;
    }
    if (!rest) {
      // baixo
      if (s === 0) this.pluck(this._note(chord, -2), t, 0.5, -0.15, this.musicBus, 0.3);
      if (s === 4 && chance(0.6)) this.pluck(this._note(chord + 4, -2), t, 0.32, -0.15, this.musicBus, 0.3);
      // alaúde
      if (this.pattern[s] && chance(m.density + 0.25)) {
        const deg = tones[(s + this.bar) % 3] + (s > 3 ? 7 : 0);
        this.pluck(this._note(deg, 0), t, 0.2, 0.25, this.musicBus, 0.55);
      }
      // flauta
      if (this.phraseFlute && (s === 0 || s === 4 || (s % 2 === 0 && chance(0.3))) && chance(0.75)) {
        const strong = s === 0;
        let d = this.mel + pickOne([-2, -1, -1, 0, 1, 1, 2]);
        if (strong) d = tones.reduce((b, x) => { const v = x + 7 * Math.round((d - x) / 7); return Math.abs(v - d) < Math.abs(b - d) ? v : b; }, d);
        this.mel = Math.max(2, Math.min(11, d));
        const len = beat * (strong ? pickOne([2, 3, 4]) : 2);
        this.flute(this._note(this.mel, 1), t, len * 0.95);
      }
      // tambor de mão
      if (m.drum && (s === 0 || (s === 6 && chance(0.4)) || (s === 3 && chance(0.25)))) this.drum(t, s === 0 ? 0.2 : 0.11);
    } else if (s === 0 && barInCycle === 15) {
      this.pluck(this._note(0, 1), t + beat * 4, 0.15, 0.3, this.musicBus, 0.6);
    }
    this.step++;
    if (s === 7) this.bar++;
  }

  // ---------- efeitos ----------
  _ok() { return this.ctx && this.ctx.state === 'running'; }
  play(name, arg) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + 0.01, B = this.sfxBus, N = (d, o = 1) => this._note(d, o);
    switch (name) {
      case 'click':
        this.hiss(t, 0.05, 2200, 0.12); this.pluck(N(4, 1), t, 0.08, 0, B, 0.8); break;
      case 'select':
        this.pluck(N(arg ?? 2, 1), t, 0.18, rnd(-0.3, 0.3), B, 0.6);
        this.hiss(t, 0.04, 1500, 0.06); break;
      case 'explore': // pergaminho a desenrolar + dedilhado ascendente
        this.hiss(t, 0.45, 600, 0.12, B, 'bandpass', 3500);
        [0, 2, 4].forEach((d, i) => this.pluck(N(d, 1), t + 0.08 + i * 0.07, 0.2, -0.2 + i * 0.2, B, 0.6)); break;
      case 'reveal': {
        const n = Math.min(6, arg || 3);
        for (let i = 0; i < n; i++) this.pluck(N(pickOne([4, 6, 7, 9, 11]), 1), t + 0.25 + i * 0.06, 0.05, rnd(-0.6, 0.6), B, 0.9);
        break; }
      case 'find': // descoberta: arpejo + sino
        [0, 2, 4, 7].forEach((d, i) => this.pluck(N(d, 1), t + i * 0.09, 0.26, -0.3 + i * 0.2, B, 0.7));
        this.bell(N(7, 1), t + 0.36, 0.09); this.bell(N(11, 1), t + 0.5, 0.05); break;
      case 'magic': // portal, ilha flutuante, cristais
        this.hiss(t, 1.1, 300, 0.1, B, 'bandpass', 5000);
        [7, 9, 11, 14, 16].forEach((d, i) => this.bell(N(d, 1), t + i * 0.08, 0.06));
        this.horn(N(0, 0), t + 0.1, 0.9, 0.03); break;
      case 'dark': // ossadas, fenda, árvores mortas, terras mortas
        this.horn(N(0, -1), t, 0.7, 0.05); this.horn(N(1, -1) * 1.06, t + 0.05, 0.7, 0.03);
        this.pluck(N(5, 0), t + 0.2, 0.15, 0, B, 0.3); break;
      case 'deny':
        this.drum(t, 0.18, B); this.drum(t + 0.12, 0.12, B); break;
      case 'season':
        this.horn(N(0, 0), t, 0.5, 0.05); this.horn(N(4, 0), t + 0.45, 0.8, 0.05); this.drum(t, 0.14, B); break;
      case 'page':
        this.hiss(t, 0.22, 1200, 0.09, B, 'bandpass', 4000); break;
      case 'end':
        [0, 2, 4, 7, 9, 11, 14].forEach((d, i) => this.pluck(N(d, 0), t + i * 0.11, 0.25, -0.4 + i * 0.13, B, 0.6));
        this.horn(N(0, 0), t + 0.8, 1.2, 0.05); this.horn(N(4, 0), t + 0.8, 1.2, 0.035); this.drum(t + 0.8, 0.2, B); break;
      case 'start':
        this.horn(N(0, 0), t, 0.35, 0.05); this.horn(N(4, 0), t + 0.3, 0.35, 0.05); this.horn(N(7, 0), t + 0.6, 0.9, 0.055);
        this.drum(t, 0.15, B); this.drum(t + 0.6, 0.2, B); break;
    }
  }
}

export const sound = new SoundSystem();
