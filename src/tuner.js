// Guitar tuner using the microphone (autocorrelation / YIN-style pitch detection).
const STRINGS = [
  { name: 'E', midi: 40, label: '6 (low E)' }, { name: 'A', midi: 45, label: '5' }, { name: 'D', midi: 50, label: '4' },
  { name: 'G', midi: 55, label: '3' }, { name: 'B', midi: 59, label: '2' }, { name: 'E', midi: 64, label: '1 (high e)' },
];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function detectPitch(buf, sr) {
  let rms = 0; for (const v of buf) rms += v * v; rms = Math.sqrt(rms / buf.length);
  if (rms < 0.008) return null;
  const W = Math.floor(buf.length / 2);
  const tauMin = Math.floor(sr / 1000), tauMax = Math.min(W - 1, Math.ceil(sr / 60));
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = buf[i] - buf[i + tau]; s += v * v; }
    d[tau] = s;
  }
  let run = 0, tau = -1;
  const c = new Float32Array(tauMax + 1);
  for (let t = 1; t <= tauMax; t++) { run += d[t]; c[t] = run ? d[t] * t / run : 1; }
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < 0.15) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
  }
  if (tau < 0) return null;
  const a = c[tau - 1] ?? c[tau], b = c[tau], cc = c[tau + 1] ?? c[tau], den = a - 2 * b + cc;
  const better = den > 0 ? tau + 0.5 * (a - cc) / den : tau;
  return sr / better;
}

export class Tuner {
  constructor(onUpdate) { this.onUpdate = onUpdate; this.running = false; }
  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 4096;
    src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.running = true;
    this.smooth = null;
    const loop = () => {
      if (!this.running) return;
      this.an.getFloatTimeDomainData(this.buf);
      const f = detectPitch(this.buf, this.ctx.sampleRate);
      if (f) {
        this.smooth = this.smooth && Math.abs(Math.log2(f / this.smooth)) < 0.05 ? this.smooth * 0.7 + f * 0.3 : f;
        const midiF = 69 + 12 * Math.log2(this.smooth / 440);
        const midi = Math.round(midiF);
        const cents = Math.round((midiF - midi) * 100);
        const nearest = STRINGS.reduce((a, s) => (Math.abs(s.midi - midiF) < Math.abs(a.midi - midiF) ? s : a));
        this.onUpdate({ freq: this.smooth, note: NAMES[midi % 12], octave: Math.floor(midi / 12) - 1, cents, string: nearest, offString: Math.round((midiF - nearest.midi) * 100) });
      } else this.onUpdate(null);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close();
  }
}
export { STRINGS };
