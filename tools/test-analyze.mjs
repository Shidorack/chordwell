// Detection accuracy test on synthetic guitar audio (Karplus-Strong plucked strings).
// Run: node tools/test-analyze.mjs   (add --verbose to print the detected chords)
import { analyze, parseChord, NOTE_NAMES } from '../src/analyze.js';

const SR = 11025;
const VERBOSE = process.argv.includes('--verbose');
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function pluck(buf, t, midi, dur, amp = 0.25, bright = 0.5) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const period = Math.max(2, Math.round(SR / f));
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = (rand() * 2 - 1);
  const start = Math.round(t * SR), len = Math.min(buf.length - start, Math.round(dur * SR));
  let idx = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const v = line[idx];
    const nxt = line[(idx + 1) % period];
    line[idx] = 0.996 * (bright * v + (1 - bright) * 0.5 * (v + nxt));
    last = v;
    const env = i > len - 200 ? (len - i) / 200 : 1;
    buf[start + i] += last * amp * env;
    idx = (idx + 1) % period;
  }
}
function kick(buf, t) {
  const s = Math.round(t * SR);
  for (let i = 0; i < 2000 && s + i < buf.length; i++) buf[s + i] += Math.sin(2 * Math.PI * (60 - i * 0.01) * i / SR) * Math.exp(-i / 500) * 0.5;
}
function hat(buf, t) {
  const s = Math.round(t * SR);
  for (let i = 0; i < 400 && s + i < buf.length; i++) buf[s + i] += (rand() * 2 - 1) * Math.exp(-i / 60) * 0.06;
}

// guitar-like voicings (midi, low to high)
const OPEN = [40, 45, 50, 55, 59, 64];
const SHAPES = {
  C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], Am: [-1, 0, 2, 2, 1, 0], F: [1, 3, 3, 2, 1, 1],
  Em: [0, 2, 2, 0, 0, 0], D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], E: [0, 2, 2, 1, 0, 0],
  Am7: [-1, 0, 2, 0, 1, 0], Dm7: [-1, -1, 0, 2, 1, 1], G7: [3, 2, 0, 0, 0, 1], Cmaj7: [-1, 3, 2, 0, 0, 0],
  E5: [0, 2, 2, -1, -1, -1], G5: [3, 5, 5, -1, -1, -1], A5: [-1, 0, 2, 2, -1, -1], C5: [-1, 3, 5, 5, -1, -1],
  D5: [-1, 5, 7, 7, -1, -1], B: [-1, 2, 4, 4, 4, 2], 'F#m': [2, 4, 4, 2, 2, 2],
};
const voicing = name => SHAPES[name].map((f, s) => (f < 0 ? null : OPEN[s] + f)).filter(v => v !== null);

function makeChordSong({ prog, bpm, beatsPerChord, loops, distort = 0 }) {
  const beat = 60 / bpm, total = prog.length * beatsPerChord * loops * beat + 1;
  const buf = new Float32Array(Math.ceil(total * SR));
  const truth = [];
  let t = 0.3;
  for (let l = 0; l < loops; l++) for (const ch of prog) {
    truth.push({ chord: ch, start: t, end: t + beatsPerChord * beat });
    for (let b = 0; b < beatsPerChord; b++) {
      const notes = voicing(ch);
      const down = b % 2 === 0;
      (down ? notes : [...notes].reverse()).forEach((m, i) => pluck(buf, t + i * 0.012, m, beat * 1.05, distort ? 0.18 : 0.22));
      if (b % 2 === 0) kick(buf, t); hat(buf, t + beat / 2);
      t += beat;
    }
  }
  if (distort) for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * distort) * 0.5;
  return { buf, truth };
}

function makeRiffSong({ riff, bpm, loops, distort = 0 }) {
  const step = 60 / bpm / 2; // eighth notes
  const buf = new Float32Array(Math.ceil((riff.length * loops * step + 1.5) * SR));
  const truth = [];
  let t = 0.3;
  for (let l = 0; l < loops; l++) for (const m of riff) {
    if (m !== null) { pluck(buf, t, m, step * 1.1, 0.35, 0.6); truth.push({ t, midi: m }); }
    if (Math.round(t / step) % 4 === 0) kick(buf, t);
    t += step;
  }
  if (distort) for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * distort) * 0.5;
  return { buf, truth };
}

const sameChord = (det, truth) => {
  const d = parseChord(det), g = parseChord(truth);
  if (!d || !g || d.root !== g.root) return false;
  const minor = t => t.startsWith('m') && !t.startsWith('maj');
  if (d.type === '5' || g.type === '5') return true;
  return minor(d.type) === minor(g.type);
};

function chordAccuracy(res, truth) {
  let ok = 0, all = 0;
  for (let t = truth[0].start + 0.3; t < truth[truth.length - 1].end - 0.2; t += 0.05) {
    const g = truth.find(s => t >= s.start && t < s.end);
    const d = res.segments.find(s => t >= s.start && t < s.end);
    if (!g) continue;
    all++;
    if (d && sameChord(d.chord, g.chord)) ok++;
  }
  return ok / all;
}

function noteAccuracy(res, truth) {
  let hit = 0;
  for (const g of truth) if (res.tab.some(n => Math.abs(n.t - g.t) < 0.06 && n.midi === g.midi)) hit++;
  const extra = res.tab.filter(n => !truth.some(g => Math.abs(n.t - g.t) < 0.06)).length;
  const missed = truth.filter(g => !res.tab.some(n => Math.abs(n.t - g.t) < 0.06 && n.midi === g.midi));
  return { recall: hit / truth.length, extra, missed };
}

const tests = [
  { name: 'Clean pop  C-G-Am-F  100bpm', kind: 'chords', song: makeChordSong({ prog: ['C', 'G', 'Am', 'F'], bpm: 100, beatsPerChord: 4, loops: 3 }), min: 0.85 },
  { name: 'Clean      Em-C-G-D 2/bar 120bpm', kind: 'chords', song: makeChordSong({ prog: ['Em', 'C', 'G', 'D'], bpm: 120, beatsPerChord: 2, loops: 4 }), min: 0.85 },
  { name: 'Sevenths   Am7-Dm7-G7-Cmaj7 90bpm', kind: 'chords', song: makeChordSong({ prog: ['Am7', 'Dm7', 'G7', 'Cmaj7'], bpm: 90, beatsPerChord: 4, loops: 3 }), min: 0.8 },
  { name: 'Distorted  E5-G5-A5-C5 140bpm', kind: 'chords', song: makeChordSong({ prog: ['E5', 'G5', 'A5', 'C5'], bpm: 140, beatsPerChord: 4, loops: 4, distort: 6 }), min: 0.85 },
  { name: 'Crunch     E-B-F#m-D 110bpm', kind: 'chords', song: makeChordSong({ prog: ['E', 'B', 'F#m', 'D'], bpm: 110, beatsPerChord: 4, loops: 3, distort: 3 }), min: 0.8 },
  { name: 'Riff clean  E-minor pentatonic 100bpm', kind: 'tab', song: makeRiffSong({ riff: [40, 43, 45, 40, 43, 46, 45, null, 40, 43, 45, 43, 40, null, 50, 52], bpm: 100, loops: 4 }), min: 0.8 },
  { name: 'Riff melody A-minor 120bpm', kind: 'tab', song: makeRiffSong({ riff: [57, 60, 64, 62, 60, 59, 57, 55, 57, 64, 67, 64, 62, 60, 59, null], bpm: 120, loops: 3 }), min: 0.8 },
  { name: 'Riff dist  low E 130bpm', kind: 'tab', song: makeRiffSong({ riff: [40, 40, 43, 40, 45, 40, 46, 45, 40, 40, 43, 40, 38, 40, null, null], bpm: 130, loops: 4, distort: 4 }), min: 0.7 },
];

let failed = 0;
for (const tc of tests) {
  const t0 = Date.now();
  const res = analyze(tc.song.buf, SR);
  const ms = Date.now() - t0;
  let line;
  if (tc.kind === 'chords') {
    const acc = chordAccuracy(res, tc.song.truth);
    const pass = acc >= tc.min && res.view === 'chords';
    if (!pass) failed++;
    line = `${pass ? 'PASS' : 'FAIL'}  ${tc.name}: chords ${(acc * 100).toFixed(0)}%  view=${res.view}  bpm=${res.bpm}  key=${res.key.name}  style=${res.style}`;
  } else {
    const { recall, extra } = noteAccuracy(res, tc.song.truth);
    const pass = recall >= tc.min && res.view === 'tab';
    if (!pass) failed++;
    line = `${pass ? 'PASS' : 'FAIL'}  ${tc.name}: notes ${(recall * 100).toFixed(0)}% (+${extra} extra)  view=${res.view}  bpm=${res.bpm}  style=${res.style}`;
  }
  console.log(line + `  [${ms} ms]  ${JSON.stringify(res.features)}`);
  if (VERBOSE) {
    if (tc.kind === 'chords') console.log('   ', res.segments.map(s => `${s.chord}(${s.beats})`).join(' '));
    else {
      const { missed } = noteAccuracy(res, tc.song.truth);
      console.log('    missed:', missed.slice(0, 8).map(g => {
        const near = res.tab.find(n => Math.abs(n.t - g.t) < 0.06);
        const rej = res.debug.rejected.find(r => Math.abs(r.t - g.t) < 0.06);
        return `${g.midi}@${g.t.toFixed(2)}${near ? ' got ' + near.midi : rej ? ' ' + rej.why : ' no-onset'}`;
      }).join(' | '));
      console.log('   ', res.tab.slice(0, 20).map(n => `${NOTE_NAMES[n.midi % 12]}${Math.floor(n.midi / 12) - 1}@s${6 - n.string}f${n.fret}`).join(' '));
    }
  }
}
console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
