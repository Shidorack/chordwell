// Chord / beat / key analysis. Pure JS with no DOM, so it runs in a Web Worker and in Node tests.
// Input: mono Float32Array at a low sample rate (about 11025 Hz).

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Chord types: intervals, per-note weights, and a small prior that favours the plain types.
export const CHORD_TYPES = {
  '':     { iv: [0, 4, 7],      w: [1, 1, 1],          prior: 0 },
  'm':    { iv: [0, 3, 7],      w: [1, 1, 1],          prior: 0 },
  '7':    { iv: [0, 4, 7, 10],  w: [1, 1, 1, 0.75],    prior: -0.035 },
  'maj7': { iv: [0, 4, 7, 11],  w: [1, 1, 1, 0.75],    prior: -0.045 },
  'm7':   { iv: [0, 3, 7, 10],  w: [1, 1, 1, 0.75],    prior: -0.035 },
  'sus2': { iv: [0, 2, 7],      w: [1, 1, 1],          prior: -0.07 },
  'sus4': { iv: [0, 5, 7],      w: [1, 1, 1],          prior: -0.07 },
  '5':    { iv: [0, 7],         w: [1, 1],             prior: -0.02 },
};
const TYPE_KEYS = Object.keys(CHORD_TYPES);

export function chordName(root, type) { return NOTE_NAMES[root] + type; }

// Splits a chord name like "F#m7" into { root, type }. Returns null for "N" or unknown names.
export function parseChord(name) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name || '');
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const root = (base + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  let type = m[3];
  const alias = { maj: '', min: 'm', M7: 'maj7', '-': 'm', m7b5: 'm7', dim: 'm', aug: '', add9: '', '6': '', m6: 'm', '9': '7', sus: 'sus4' };
  if (!(type in CHORD_TYPES)) type = alias[type] ?? (type.startsWith('m') ? 'm' : '');
  return { root, type };
}

// ---------- FFT (iterative radix-2, in place) ----------
const fftCache = new Map();
function fftTables(n) {
  if (fftCache.has(n)) return fftCache.get(n);
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
  const hann = new Float64Array(n);
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  const t = { rev, cos, sin, hann };
  fftCache.set(n, t);
  return t;
}
function fft(re, im, n) {
  const { rev, cos, sin } = fftTables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = sin[k * step];
        const a = start + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

// Magnitude spectra of all frames, centred (frame i is centred at i*hop samples).
function stft(x, n, hop, perFrame) {
  const { hann } = fftTables(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  const frames = Math.max(1, Math.ceil(x.length / hop));
  const mag = new Float32Array(n / 2);
  for (let f = 0; f < frames; f++) {
    const start = f * hop - n / 2;
    for (let i = 0; i < n; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < x.length ? x[s] * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im, n);
    for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    perFrame(f, mag, frames);
  }
  return frames;
}

// ---------- chord templates (with harmonics, so the 3rd/5th harmonics of real notes are expected) ----------
function buildTemplates() {
  const harm = [[0, 1], [12, 0.6], [19, 0.36], [24, 0.22], [28, 0.13]];
  const list = [];
  for (let root = 0; root < 12; root++) {
    for (const type of TYPE_KEYS) {
      const def = CHORD_TYPES[type];
      const v = new Float64Array(12);
      def.iv.forEach((iv, i) => { for (const [h, hw] of harm) v[(root + iv + h) % 12] += def.w[i] * hw; });
      let norm = 0; for (const a of v) norm += a * a; norm = Math.sqrt(norm);
      for (let i = 0; i < 12; i++) v[i] /= norm;
      list.push({ root, type, name: chordName(root, type), v, prior: def.prior });
    }
  }
  return list;
}
const TEMPLATES = buildTemplates();

// ---------- beat tracking (onset envelope + tempo by autocorrelation + dynamic programming) ----------
function trackBeats(onset, fps) {
  const n = onset.length;
  // normalise
  let mean = 0; for (const v of onset) mean += v; mean /= n;
  let sd = 0; for (const v of onset) sd += (v - mean) ** 2; sd = Math.sqrt(sd / n) || 1;
  const o = Float64Array.from(onset, v => Math.max(0, (v - mean) / sd));
  // tempo: autocorrelation weighted around 115 bpm
  const minLag = Math.round(fps * 60 / 200), maxLag = Math.round(fps * 60 / 55);
  let bestLag = Math.round(fps * 60 / 110), best = -Infinity;
  const acf = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += o[i] * o[i - lag];
    acf[lag] = s / (n - lag);
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = fps * 60 / lag;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.9) ** 2);
    const s = acf[lag] * w;
    if (s > best) { best = s; bestLag = lag; }
  }
  // refine lag with parabolic interpolation
  let period = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = acf[bestLag - 1], b = acf[bestLag], c = acf[bestLag + 1];
    const d = a - 2 * b + c;
    if (d < 0) period = bestLag + 0.5 * (a - c) / d;
  }
  // dynamic programming (Ellis 2007)
  const tight = 120;
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    let bestPrev = 0, bestIdx = -1;
    const lo = Math.max(0, Math.floor(t - 2 * period)), hi = Math.floor(t - period / 2);
    for (let p = lo; p <= hi; p++) {
      const v = score[p] - tight * Math.log((t - p) / period) ** 2;
      if (bestIdx < 0 || v > bestPrev) { bestPrev = v; bestIdx = p; }
    }
    score[t] = o[t] + (bestIdx >= 0 ? bestPrev : 0);
    back[t] = bestIdx;
  }
  // pick the end point: best score within the last period
  let end = n - 1, endBest = -Infinity;
  for (let t = Math.max(0, n - Math.ceil(period)); t < n; t++) if (score[t] > endBest) { endBest = score[t]; end = t; }
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) { beats.push(t); if (back[t] < 0) break; }
  beats.reverse();
  return { beats: beats.map(b => b / fps), bpm: fps * 60 / period };
}

// ---------- key detection (Krumhansl–Kessler profiles) ----------
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}
export function detectKey(chromaSum) {
  let best = { score: -Infinity };
  for (let k = 0; k < 12; k++) {
    for (const [mode, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]]) {
      const rot = prof.map((_, i) => prof[(i - k + 12) % 12]);
      const s = corr(chromaSum, rot);
      if (s > best.score) best = { score: s, root: k, mode, name: NOTE_NAMES[k] + (mode === 'minor' ? ' minor' : ' major') };
    }
  }
  return best;
}

// ---------- main entry ----------
export function analyze(x, sr, onProgress = () => {}) {
  const duration = x.length / sr;

  // 1) Onset envelope (spectral flux) + timbre features, from a short STFT.
  const oN = 1024, oHop = 256, fpsO = sr / oHop;
  let prev = null;
  const onsetArr = [];
  let hfSum = 0, totSum = 0, flatSum = 0, flatCount = 0;
  const rmsArr = [];
  stft(x, oN, oHop, (f, mag, frames) => {
    const lm = new Float32Array(mag.length);
    for (let k = 0; k < mag.length; k++) lm[k] = Math.log(1 + 100 * mag[k]);
    let flux = 0;
    if (prev) for (let k = 2; k < mag.length; k++) { const d = lm[k] - prev[k]; if (d > 0) flux += d; }
    onsetArr.push(flux);
    prev = lm;
    // timbre: energy above 2 kHz vs total, spectral flatness 400 Hz–4 kHz
    const kLo = Math.round(400 / sr * oN), kHf = Math.round(2000 / sr * oN), kHi = Math.min(mag.length - 1, Math.round(4500 / sr * oN));
    let e = 0, hf = 0, logSum = 0, linSum = 0;
    for (let k = 1; k < mag.length; k++) { const p = mag[k] * mag[k]; e += p; if (k >= kHf) hf += p; }
    for (let k = kLo; k <= kHi; k++) { const p = mag[k] * mag[k] + 1e-12; logSum += Math.log(p); linSum += p; }
    const cnt = kHi - kLo + 1;
    rmsArr.push(Math.sqrt(e));
    if (e > 1e-6) {
      hfSum += hf; totSum += e;
      flatSum += Math.exp(logSum / cnt) / (linSum / cnt); flatCount++;
    }
    if (f % 400 === 0) onProgress(0.3 * f / frames);
  });
  // smooth onset a little
  const onset = onsetArr.map((v, i) => (v + (onsetArr[i - 1] ?? v) * 0.5 + (onsetArr[i + 1] ?? v) * 0.5) / 2);
  const { beats: rawBeats, bpm } = trackBeats(onset, fpsO);
  onProgress(0.4);

  // 2) Chroma (bass + treble) from a long STFT for good low-note resolution.
  const N = 8192, hop = 1024;
  const fps = sr / hop;
  const binHz = sr / N;
  const kMin = Math.ceil(60 / binHz), kMax = Math.min(N / 2 - 1, Math.floor(2100 / binHz));
  const binPitch = new Float64Array(N / 2), binW = new Float64Array(N / 2);
  for (let k = kMin; k <= kMax; k++) {
    const midi = 69 + 12 * Math.log2(k * binHz / 440);
    const near = Math.round(midi);
    binPitch[k] = near;
    binW[k] = Math.max(0, 1 - 2.5 * Math.abs(midi - near)); // only bins close to a real note
  }
  const chroma = [], bass = [], energy = [];
  stft(x, N, hop, (f, mag, frames) => {
    // semitone spectrum (max of near-pitch bins), then log compression
    const semi = new Float64Array(128);
    let e = 0;
    for (let k = kMin; k <= kMax; k++) {
      const v = mag[k] * binW[k];
      e += mag[k] * mag[k];
      if (v > semi[binPitch[k]]) semi[binPitch[k]] = v;
    }
    let peak = 0; for (const v of semi) if (v > peak) peak = v;
    const c = new Float64Array(12), b = new Float64Array(12);
    if (peak > 0) {
      // whitening: subtract a local floor so a noisy spectrum doesn't light up every pitch class
      for (let m = 36; m < 100; m++) {
        let floor = 0, cnt = 0;
        for (let j = m - 6; j <= m + 6; j++) if (j !== m && semi[j] !== undefined) { floor += semi[j]; cnt++; }
        floor /= cnt || 1;
        const v = Math.max(0, semi[m] - 0.8 * floor);
        if (!v) continue;
        const val = Math.log(1 + 50 * v / peak);
        if (m < 55) b[m % 12] += val * (m < 52 ? 1 : 0.5); // bass: up to about G3
        if (m >= 43) c[m % 12] += val;
      }
    }
    chroma.push(c); bass.push(b); energy.push(Math.sqrt(e));
    if (f % 100 === 0) onProgress(0.4 + 0.45 * f / frames);
  });

  // 3) Beat-synchronous chroma. Add a beat grid before the first / after the last detected beat.
  let beats = rawBeats.slice();
  const period = 60 / bpm;
  if (!beats.length) beats = [0];
  while (beats[0] - period > 0) beats.unshift(beats[0] - period);
  if (beats[0] > 0.05) beats.unshift(0);
  while (beats[beats.length - 1] + period < duration) beats.push(beats[beats.length - 1] + period);
  beats.push(duration);
  const medianEnergy = [...energy].sort((a, b) => a - b)[Math.floor(energy.length / 2)] || 1;

  const units = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const t0 = beats[i], t1 = beats[i + 1];
    const f0 = Math.max(0, Math.round(t0 * fps)), f1 = Math.min(chroma.length, Math.max(f0 + 1, Math.round(t1 * fps)));
    const c = new Float64Array(12), b = new Float64Array(12);
    let e = 0, cnt = 0;
    for (let f = f0; f < f1; f++) {
      for (let p = 0; p < 12; p++) { c[p] += chroma[f][p]; b[p] += bass[f][p]; }
      e += energy[f]; cnt++;
    }
    units.push({ t0, t1, c, b, e: cnt ? e / cnt : 0 });
  }

  // 4) Emission scores per unit and state, then Viterbi with a switch penalty.
  const S = TEMPLATES.length; // + 1 for N (no chord)
  const em = units.map(u => {
    const scores = new Float64Array(S + 1);
    let norm = Math.hypot(...u.c);
    let bsum = u.b.reduce((s, v) => s + v, 0);
    const quiet = u.e < medianEnergy * 0.08 || norm < 1e-6;
    for (let s = 0; s < S; s++) {
      const t = TEMPLATES[s];
      let dot = 0;
      if (norm > 0) for (let p = 0; p < 12; p++) dot += u.c[p] * t.v[p];
      const cos = norm > 0 ? dot / norm : 0;
      const bassShare = bsum > 0 ? u.b[t.root] / bsum : 0;
      scores[s] = cos + t.prior + 0.2 * bassShare;
    }
    scores[S] = quiet ? 2 : 0.35; // "N" wins only when it is really quiet
    return scores;
  });
  const lambda = 0.22;
  const n = units.length;
  const dp = new Float64Array(S + 1), bp = [];
  for (let s = 0; s <= S; s++) dp[s] = em[0]?.[s] ?? 0;
  for (let i = 1; i < n; i++) {
    let bestS = 0; for (let s = 1; s <= S; s++) if (dp[s] > dp[bestS]) bestS = s;
    const back = new Int16Array(S + 1);
    const next = new Float64Array(S + 1);
    for (let s = 0; s <= S; s++) {
      const stay = dp[s], sw = dp[bestS] - lambda;
      if (stay >= sw) { next[s] = stay + em[i][s]; back[s] = s; }
      else { next[s] = sw + em[i][s]; back[s] = bestS; }
    }
    bp.push(back);
    dp.set(next);
  }
  const path = new Array(n);
  let cur = 0; for (let s = 1; s <= S; s++) if (dp[s] > dp[cur]) cur = s;
  for (let i = n - 1; i >= 0; i--) { path[i] = cur; if (i > 0) cur = bp[i - 1][cur]; }

  // 5) Merge equal neighbours into segments.
  const segments = [];
  for (let i = 0; i < n; i++) {
    const name = path[i] === S ? 'N' : TEMPLATES[path[i]].name;
    const last = segments[segments.length - 1];
    if (last && last.chord === name) { last.end = units[i].t1; last.beats++; }
    else segments.push({ chord: name, start: units[i].t0, end: units[i].t1, beats: 1 });
  }

  // 6) Key and style.
  const chromaSum = new Array(12).fill(0);
  units.forEach(u => { for (let p = 0; p < 12; p++) chromaSum[p] += u.c[p]; });
  const key = keyFromChords(segments) || detectKey(chromaSum);
  const hfRatio = totSum > 0 ? hfSum / totSum : 0;
  const flatness = flatCount ? flatSum / flatCount : 0;

  // 7) Single notes for Tab mode: pitch at each onset.
  const notes = detectNotes(x, sr, onset, fpsO);
  const tab = assignFrets(notes);
  const tuning = tab.tuning;
  // How well do chords explain the song? Low chord fit + many clear single notes => riff / melody song.
  let fitSum = 0, fitCnt = 0;
  em.forEach((sc, i) => { if (path[i] !== S) { fitSum += sc[path[i]]; fitCnt++; } });
  const chordFit = fitCnt ? fitSum / fitCnt : 0;
  const onsetsPerSec = notes.all / Math.max(1, duration);
  const clearShare = notes.all ? notes.length / notes.all : 0;
  const tabLikely = notes.length >= 8 && clearShare > 0.6 && chordFit < 0.95;

  const style = guessStyle({ flatness, bpm, segments, tab, tabLikely });
  onProgress(1);
  return {
    duration, bpm: Math.round(bpm), beats: beats.slice(0, -1), segments, key,
    features: { hfRatio: +hfRatio.toFixed(4), flatness: +flatness.toFixed(4), chordFit: +chordFit.toFixed(3), clearShare: +clearShare.toFixed(2), onsetsPerSec: +onsetsPerSec.toFixed(2) },
    style, tab, tuning, view: tabLikely ? 'tab' : 'chords', debug: { rejected: notes.rejected },
  };
}

// ---------- single-note detection (onsets + YIN pitch) ----------
function yin(x, start, sr, W = 768) {
  const tauMin = Math.floor(sr / 1100), tauMax = Math.ceil(sr / 60);
  if (start < 0 || start + W + tauMax >= x.length) return null;
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[start + i] - x[start + i + tau]; s += v * v; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let run = 0;
  const cmnd = new Float64Array(tauMax + 1); cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cmnd[tau] = run > 0 ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < 0.18) { while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++; tau = t; break; }
  }
  if (tau < 0) { // no dip below the threshold: fall back to the global minimum
    let m = Infinity;
    for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < m) { m = cmnd[t]; tau = t; }
    if (m > 0.45) return null;
  }
  // parabolic refinement
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1], den = a - 2 * b + c;
    if (den > 0) better = tau + 0.5 * (a - c) / den;
  }
  return { f0: sr / better, clarity: 1 - cmnd[tau] };
}

export function detectNotes(x, sr, onset, fps) {
  // adaptive threshold peak picking
  const n = onset.length, peaks = [];
  const win = Math.round(fps * 0.5);
  let gMean = 0; for (const v of onset) gMean += v; gMean /= n || 1;
  for (let i = 1; i < n - 1; i++) {
    if (onset[i] < onset[i - 1] || onset[i] < onset[i + 1]) continue;
    let local = 0, cnt = 0, localMax = 0;
    for (let j = Math.max(0, i - win); j < Math.min(n, i + win); j++) { local += onset[j]; cnt++; }
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) localMax = Math.max(localMax, onset[j]);
    if (onset[i] < localMax) continue;
    if (onset[i] > 1.4 * local / cnt && onset[i] > 0.6 * gMean) {
      const t = i / fps;
      if (!peaks.length || t - peaks[peaks.length - 1] > 0.07) peaks.push(t);
    }
  }
  const out = [], rejected = [];
  for (let p = 0; p < peaks.length; p++) {
    const t = peaks[p];
    const next = peaks[p + 1] ?? t + 1;
    // measure a little after the attack, where the pitch is stable
    const offs = [0.035, 0.07, 0.11].filter(o => o < Math.max(0.05, next - t - 0.04));
    const res = offs.map(o => yin(x, Math.round((t + o) * sr), sr)).filter(Boolean);
    if (!res.length) { rejected.push({ t, why: 'nopitch' }); continue; }
    const best = res.reduce((a, b) => (b.clarity > a.clarity ? b : a));
    if (best.clarity < 0.72) { rejected.push({ t, why: 'clarity ' + best.clarity.toFixed(2) }); continue; }
    const midi = Math.round(69 + 12 * Math.log2(best.f0 / 440));
    if (midi < 35 || midi > 86) continue;
    out.push({ t: +t.toFixed(3), dur: +Math.min(next - t, 2).toFixed(3), midi });
  }
  out.all = peaks.length;
  out.rejected = rejected;
  return out;
}

// ---------- string / fret choice with dynamic programming (smallest hand movement) ----------
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (index 0 = low E)
export const TUNINGS = {
  'Standard': [40, 45, 50, 55, 59, 64],
  'Drop D': [38, 45, 50, 55, 59, 64],
  'Drop C': [36, 43, 48, 53, 57, 62],
};
export function assignFrets(notes, maxFret = 17) {
  if (!notes.length) return Object.assign([], { tuning: 'Standard' });
  const lowest = Math.min(...notes.map(n => n.midi));
  const tuning = lowest >= 40 ? 'Standard' : lowest >= 38 ? 'Drop D' : 'Drop C';
  const res = assignFretsWith(notes, TUNINGS[tuning], maxFret);
  res.tuning = tuning;
  return res;
}
function assignFretsWith(notes, OPEN_STRINGS, maxFret) {
  const cands = notes.map(nt => {
    const c = [];
    OPEN_STRINGS.forEach((open, s) => { const f = nt.midi - open; if (f >= 0 && f <= maxFret) c.push({ s, f }); });
    if (!c.length) c.push({ s: 0, f: Math.max(0, nt.midi - 40) });
    return c;
  });
  const handPos = c => (c.f === 0 ? null : c.f);
  const cost0 = c => c.f * 0.05;
  let prevCost = cands[0].map(cost0);
  const backs = [];
  for (let i = 1; i < cands.length; i++) {
    const gap = notes[i].t - notes[i - 1].t;
    const cur = cands[i].map(c => {
      let best = Infinity, bi = 0;
      cands[i - 1].forEach((p, j) => {
        const hp = handPos(p) ?? handPos(c) ?? 0, hc = handPos(c) ?? hp;
        let move = Math.abs(hc - hp);
        move = move <= 3 ? move * 0.3 : move; // within one hand position is cheap
        const v = prevCost[j] + move / Math.max(0.5, Math.min(2, gap * 4)) + Math.abs(c.s - p.s) * 0.15 + c.f * 0.08;
        if (v < best) { best = v; bi = j; }
      });
      return { v: best, bi };
    });
    backs.push(cur.map(c => c.bi));
    prevCost = cur.map(c => c.v);
  }
  let k = prevCost.indexOf(Math.min(...prevCost));
  const res = new Array(notes.length);
  for (let i = notes.length - 1; i >= 0; i--) {
    res[i] = { ...notes[i], string: cands[i][k].s, fret: cands[i][k].f };
    if (i > 0) k = backs[i - 1][k];
  }
  return res;
}

// Rough guess of the guitar sound (tempo, power chords, low riffs, timbre). The user can always change it.
export function guessStyle({ flatness, bpm, segments, tab, tabLikely }) {
  let beats = 0, power = 0, minor = 0;
  for (const sg of segments) {
    if (sg.chord === 'N') continue;
    beats += sg.beats;
    const p = parseChord(sg.chord);
    if (p.type === '5') power += sg.beats;
    if (p.type.startsWith('m') && !p.type.startsWith('maj')) minor += sg.beats;
  }
  const p5 = beats ? power / beats : 0, pm = beats ? minor / beats : 0;
  if (tabLikely && tab.length) {
    const low = tab.filter(n => n.midi < 48).length / tab.length;
    if (low > 0.5) return bpm > 135 || tab.tuning !== 'Standard' ? 'metal' : 'hard';
    return 'lead';
  }
  if (p5 > 0.35) return bpm > 140 && pm > 0.2 ? 'metal' : bpm > 150 ? 'punk' : 'hard';
  if (flatness > 0.085) return p5 > 0.15 ? 'hard' : 'classic';
  if (bpm < 82) return 'ballad';
  return 'clean';
}

// Key from the chord list: which major scale explains most chord time; relative minor if vi dominates.
const MAJOR_DEGREES = [[0, 'maj'], [2, 'min'], [4, 'min'], [5, 'maj'], [7, 'maj'], [9, 'min']];
export function keyFromChords(segments) {
  const dur = new Map();
  let total = 0;
  for (const sg of segments) {
    const p = parseChord(sg.chord); if (!p) continue;
    const q = p.type === '5' ? 'any' : p.type.startsWith('m') && !p.type.startsWith('maj') ? 'min' : 'maj';
    const k = p.root + ':' + q;
    const d = sg.end - sg.start;
    dur.set(k, (dur.get(k) || 0) + d); total += d;
  }
  if (!total) return null;
  const get = (r, q) => (dur.get(((r % 12) + 12) % 12 + ':' + q) || 0) + (dur.get(((r % 12) + 12) % 12 + ':any') || 0);
  let best = null;
  for (let k = 0; k < 12; k++) {
    let sc = 0;
    for (const [deg, q] of MAJOR_DEGREES) sc += get(k + deg, q) * (deg === 0 || deg === 9 ? 1.15 : deg === 7 || deg === 5 ? 1.05 : 1);
    if (!best || sc > best.sc) best = { sc, k };
  }
  const first = parseChord(segments.find(s => s.chord !== 'N')?.chord);
  const tonicMaj = get(best.k, 'maj'), tonicMin = get(best.k + 9, 'min');
  const minorKey = tonicMin > tonicMaj * 1.1 || (first && first.root === (best.k + 9) % 12 && tonicMin >= tonicMaj * 0.7);
  const root = minorKey ? (best.k + 9) % 12 : best.k;
  return { root, mode: minorKey ? 'minor' : 'major', name: NOTE_NAMES[root] + (minorKey ? ' minor' : ' major'), score: best.sc / total };
}

