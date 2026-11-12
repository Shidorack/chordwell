// One clock for both kinds of songs: real audio files and built-in charts (played by a little guitar synth).
import { shapeFor } from './chords.js';
import { TUNINGS } from './analyze.js';

let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Karplus-Strong plucked string, cached per midi note.
const pluckCache = new Map();
function pluckBuffer(midi) {
  const c = audioCtx();
  if (pluckCache.has(midi)) return pluckCache.get(midi);
  const sr = c.sampleRate, len = Math.floor(sr * 1.6);
  const buf = c.createBuffer(1, len, sr), out = buf.getChannelData(0);
  const f = 440 * 2 ** ((midi - 69) / 12), period = Math.max(2, Math.round(sr / f));
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const v = line[idx], nxt = line[(idx + 1) % period];
    line[idx] = 0.997 * (0.5 * v + 0.5 * (0.5 * v + 0.5 * nxt));
    out[i] = v * (i > len - 2000 ? (len - i) / 2000 : 1);
    idx = (idx + 1) % period;
  }
  pluckCache.set(midi, buf);
  return buf;
}
function playNote(midi, when, gain = 0.25, dest) {
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const g = c.createGain(); g.gain.value = gain;
  src.connect(g).connect(dest || c.destination);
  src.start(Math.max(c.currentTime, when));
}
function click(when, accent) {
  const c = audioCtx();
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g).connect(c.destination);
  o.start(when); o.stop(when + 0.06);
}
export function strum(chordName, when, opts = {}) {
  const frets = shapeFor(chordName, opts.power);
  if (!frets) return;
  const open = TUNINGS.Standard;
  frets.forEach((f, s) => { if (f >= 0) playNote(open[s] + f, when + s * 0.014, 0.16); });
}

export class Player {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.preservesPitch = true; this.audio.mozPreservesPitch = true; this.audio.webkitPreservesPitch = true;
    this.song = null; this.rate = 1; this.vTime = 0; this.vPlaying = false; this.lastPerf = 0;
    this.loop = { on: false, a: null, b: null };
    this.wait = false; this.metronome = false; this.backing = true;
    this.onWait = null; this.onEnd = null;
    this.schedT = 0; this.counting = false;
    this.opts = {};
    this.audio.addEventListener('ended', () => this.onEnd?.());
  }
  get hasAudio() { return !!this.song?.audioBlob; }
  load(song) {
    this.pause();
    this.song = song;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (song.audioBlob) { this.url = URL.createObjectURL(song.audioBlob); this.audio.src = this.url; }
    else this.audio.removeAttribute('src');
    this.vTime = 0; this.schedT = 0;
    this.loop = { on: false, a: null, b: null };
    this.setRate(this.rate);
  }
  get duration() { return this.song ? (this.hasAudio && isFinite(this.audio.duration) ? this.audio.duration : this.song.duration) : 0; }
  get time() {
    if (this.hasAudio) return this.audio.currentTime;
    if (this.vPlaying) return this.vTime + (performance.now() - this.lastPerf) / 1000 * this.rate;
    return this.vTime;
  }
  get playing() { return this.hasAudio ? !this.audio.paused : this.vPlaying; }
  setRate(r) {
    this.rate = r;
    if (this.vPlaying) { this.vTime = this.time; this.lastPerf = performance.now(); }
    this.audio.playbackRate = r;
  }
  seek(t) {
    t = Math.max(0, Math.min(this.duration - 0.05, t));
    if (this.hasAudio) this.audio.currentTime = t;
    else { this.vTime = t; this.lastPerf = performance.now(); }
    this.schedT = t;
    this.skipWaitUntil = t + 0.05;
  }
  async play({ countIn = false } = {}) {
    if (!this.song || this.playing || this.counting) return;
    audioCtx();
    if (this.time >= this.duration - 0.1) this.seek(0);
    if (countIn) {
      this.counting = true;
      const beat = 60 / (this.song.bpm || 100) / this.rate;
      const c = audioCtx(), n = this.song.beatsPerBar || 4;
      for (let i = 0; i < n; i++) click(c.currentTime + 0.05 + i * beat, i === 0);
      await new Promise(r => setTimeout(r, (0.05 + n * beat) * 1000 - 10));
      this.counting = false;
    }
    this.schedT = this.time;
    this.skipWaitUntil = this.time + 0.05;
    if (this.hasAudio) await this.audio.play().catch(() => {});
    else { this.lastPerf = performance.now(); this.vPlaying = true; }
  }
  pause() {
    if (this.hasAudio) this.audio.pause();
    else if (this.vPlaying) { this.vTime = this.time; this.vPlaying = false; }
  }
  toggle(opts) { if (this.playing) this.pause(); else this.play(opts); }

  // Called every animation frame: loops, wait mode, synth + metronome scheduling.
  tick(changeTimes) {
    if (!this.song || !this.playing) return;
    let t = this.time;
    const { loop } = this;
    if (loop.on && loop.a !== null && loop.b !== null && loop.b > loop.a && t >= loop.b) { this.seek(loop.a); t = loop.a; }
    if (!this.hasAudio && t >= this.duration) { this.pause(); this.vTime = this.duration; this.onEnd?.(); return; }
    if (this.wait && changeTimes && t > this.skipWaitUntil) {
      const crossed = changeTimes.find(ct => ct > this.lastTickT && ct <= t);
      if (crossed !== undefined) { this.pause(); this.seek(crossed); this.onWait?.(crossed); this.lastTickT = crossed; return; }
    }
    this.lastTickT = t;
    // schedule synth notes / clicks slightly ahead
    const c = audioCtx();
    const ahead = 0.15 * this.rate;
    const from = this.schedT, to = t + ahead;
    if (to > from) {
      const toWhen = tt => c.currentTime + (tt - t) / this.rate;
      if (!this.hasAudio && this.backing) {
        if (this.song.view === 'tab' || this.opts.view === 'tab') {
          for (const n of this.song.tab) if (n.t >= from && n.t < to) playNote(n.midi, toWhen(n.t), 0.3);
        }
        if (this.opts.view !== 'tab') {
          const beat = 60 / this.song.bpm;
          for (const sg of this.song.segments) {
            if (sg.chord === 'N') continue;
            for (let bt = sg.start; bt < sg.end - 0.01; bt += beat) {
              if (bt >= from && bt < to) strum(this.opts.display(sg.chord), toWhen(bt), this.opts);
            }
          }
        }
      }
      if (this.metronome && this.song.beats) {
        const bpb = this.song.beatsPerBar || 4;
        this.song.beats.forEach((bt, i) => { if (bt >= from && bt < to) click(toWhen(bt), i % bpb === 0); });
      }
      this.schedT = to;
    }
  }
}
