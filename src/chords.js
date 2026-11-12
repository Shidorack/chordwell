// Chord shapes for electric guitar, chord name helpers and SVG chord diagrams.
import { NOTE_NAMES, parseChord } from './analyze.js';

// Frets from low E to high e. -1 = don't play, 0 = open string.
const OPEN_SHAPES = {
  C: [-1, 3, 2, 0, 1, 0], C7: [-1, 3, 2, 3, 1, 0], Cmaj7: [-1, 3, 2, 0, 0, 0],
  D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], D7: [-1, -1, 0, 2, 1, 2], Dm7: [-1, -1, 0, 2, 1, 1],
  Dmaj7: [-1, -1, 0, 2, 2, 2], Dsus2: [-1, -1, 0, 2, 3, 0], Dsus4: [-1, -1, 0, 2, 3, 3], D5: [-1, -1, 0, 2, 3, -1],
  E: [0, 2, 2, 1, 0, 0], Em: [0, 2, 2, 0, 0, 0], E7: [0, 2, 0, 1, 0, 0], Em7: [0, 2, 0, 0, 0, 0],
  Emaj7: [0, 2, 1, 1, 0, 0], Esus4: [0, 2, 2, 2, 0, 0], E5: [0, 2, 2, -1, -1, -1],
  G: [3, 2, 0, 0, 0, 3], G7: [3, 2, 0, 0, 0, 1], Gmaj7: [3, 2, 0, 0, 0, 2], G5: [3, 5, 5, -1, -1, -1],
  A: [-1, 0, 2, 2, 2, 0], Am: [-1, 0, 2, 2, 1, 0], A7: [-1, 0, 2, 0, 2, 0], Am7: [-1, 0, 2, 0, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0], Asus2: [-1, 0, 2, 2, 0, 0], Asus4: [-1, 0, 2, 2, 3, 0], A5: [-1, 0, 2, 2, -1, -1],
  B7: [-1, 2, 1, 2, 0, 2], Fmaj7: [-1, -1, 3, 2, 1, 0],
};

// Movable barre shapes, relative to the root fret f.
const E_SHAPE = {
  '': f => [f, f + 2, f + 2, f + 1, f, f], m: f => [f, f + 2, f + 2, f, f, f],
  '7': f => [f, f + 2, f, f + 1, f, f], m7: f => [f, f + 2, f, f, f, f],
  maj7: f => [f, -1, f + 1, f + 1, f, -1], sus4: f => [f, f + 2, f + 2, f + 2, f, f],
  '5': f => [f, f + 2, f + 2, -1, -1, -1],
};
const A_SHAPE = {
  '': f => [-1, f, f + 2, f + 2, f + 2, f], m: f => [-1, f, f + 2, f + 2, f + 1, f],
  '7': f => [-1, f, f + 2, f, f + 2, f], m7: f => [-1, f, f + 2, f, f + 1, f],
  maj7: f => [-1, f, f + 2, f + 1, f + 2, f], sus2: f => [-1, f, f + 2, f + 2, f, f],
  sus4: f => [-1, f, f + 2, f + 2, f + 3, f], '5': f => [-1, f, f + 2, f + 2, -1, -1],
};

export function shapeFor(name, preferPower = false) {
  const p = parseChord(name);
  if (!p) return null;
  const canon = NOTE_NAMES[p.root] + p.type;
  if (!preferPower && OPEN_SHAPES[canon]) return OPEN_SHAPES[canon];
  const fE = (p.root - 4 + 12) % 12, fA = (p.root - 9 + 12) % 12;
  const opts = [];
  if (E_SHAPE[p.type]) opts.push(E_SHAPE[p.type](fE));
  if (A_SHAPE[p.type]) opts.push(A_SHAPE[p.type](fA));
  if (!opts.length) return OPEN_SHAPES[canon] || null;
  // pick the lower position on the neck
  opts.sort((a, b) => Math.max(...a) - Math.max(...b));
  return opts[0];
}

// Display name after transpose / simplify / power-chord options.
export function displayChord(name, { transpose = 0, simple = false, power = false } = {}) {
  const p = parseChord(name);
  if (!p) return name;
  const root = (p.root + transpose + 120) % 12;
  let type = p.type;
  if (power) type = '5';
  else if (simple) type = type.startsWith('m') && !type.startsWith('maj') ? 'm' : type === '5' ? '5' : '';
  return NOTE_NAMES[root] + type;
}

// Open-chord friendliness, used to suggest a capo position.
const EASY = new Set(['C', 'D', 'Dm', 'E', 'Em', 'G', 'A', 'Am', 'E7', 'A7', 'D7', 'G7', 'C7', 'B7', 'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Dsus2', 'Dsus4', 'Asus2', 'Asus4', 'Esus4', 'Amaj7', 'Dmaj7', 'E5', 'A5', 'D5', 'G5']);
export function capoSuggestion(chordNames, transpose = 0) {
  const uniq = [...new Set(chordNames.filter(c => c !== 'N'))];
  if (!uniq.length) return null;
  const score = shift => uniq.filter(c => EASY.has(displayChord(c, { transpose: transpose - shift }))).length;
  const base = score(0);
  let best = { capo: 0, s: base };
  for (let capo = 1; capo <= 7; capo++) { const s = score(capo); if (s > best.s) best = { capo, s }; }
  if (best.capo === 0 || best.s - base < 2) return null;
  return { capo: best.capo, shapes: uniq.map(c => displayChord(c, { transpose: transpose - best.capo })) };
}

// SVG chord diagram.
export function chordSVG(name, { size = 1, power = false } = {}) {
  const frets = shapeFor(name, power);
  const W = 120 * size, H = 150 * size;
  if (!frets) return `<svg viewBox="0 0 120 150" width="${W}" height="${H}" class="chord-svg"><text x="60" y="80" text-anchor="middle" class="cd-none">?</text></svg>`;
  const played = frets.filter(f => f > 0);
  const maxF = played.length ? Math.max(...played) : 0;
  const minF = played.length ? Math.min(...played) : 0;
  const base = maxF <= 4 ? 1 : minF;
  const x0 = 22, dx = 16, y0 = 30, dy = 22, rows = 5;
  let s = `<svg viewBox="0 0 120 150" width="${W}" height="${H}" class="chord-svg" role="img" aria-label="${name} chord diagram">`;
  // nut / frets
  for (let r = 0; r <= rows; r++) s += `<line x1="${x0}" x2="${x0 + 5 * dx}" y1="${y0 + r * dy}" y2="${y0 + r * dy}" class="cd-fret${r === 0 && base === 1 ? ' cd-nut' : ''}"/>`;
  for (let st = 0; st < 6; st++) s += `<line x1="${x0 + st * dx}" x2="${x0 + st * dx}" y1="${y0}" y2="${y0 + rows * dy}" class="cd-string"/>`;
  if (base > 1) s += `<text x="${x0 - 6}" y="${y0 + dy * 0.7}" text-anchor="end" class="cd-base">${base}</text>`;
  // barre
  if (minF > 0) {
    const atMin = frets.map((f, i) => (f === minF ? i : -1)).filter(i => i >= 0);
    if (atMin.length >= 3) {
      const a = atMin[0], b = atMin[atMin.length - 1];
      const y = y0 + (minF - base + 0.5) * dy;
      s += `<rect x="${x0 + a * dx - 6}" y="${y - 6}" width="${(b - a) * dx + 12}" height="12" rx="6" class="cd-dot"/>`;
    }
  }
  frets.forEach((f, st) => {
    const x = x0 + st * dx;
    if (f < 0) s += `<text x="${x}" y="${y0 - 8}" text-anchor="middle" class="cd-mute">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${y0 - 12}" r="4.5" class="cd-open"/>`;
    else s += `<circle cx="${x}" cy="${y0 + (f - base + 0.5) * dy}" r="7" class="cd-dot"/>`;
  });
  return s + '</svg>';
}
