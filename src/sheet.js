// Reads a pasted chord sheet (the "chords above lyrics" layout used by chord sites).
// Keeps only the chords, song parts ([Verse], [Chorus] ...), repeats (x2) and capo. Lyric lines are dropped.
import { parseChord, NOTE_NAMES } from './analyze.js';

const CHORD_RE = /^\(?([A-G][#b]?)(maj|min|m|M|dim|aug|sus|add|°|\+)?(\d{0,2})((?:sus[24]?|add\d{1,2}|maj\d{0,2}|[b#]\d{1,2}|M\d)*)(\/[A-G][#b]?)?\*?\)?$/;
const NC_RE = /^\(?N\.?C\.?\)?$/i;

export function isChordToken(tok) { return CHORD_RE.test(tok) || NC_RE.test(tok); }

// "C#m7/G#" -> "C#m7" style canonical name the app understands, "N.C." -> "N"
export function normalizeChord(tok) {
  if (NC_RE.test(tok)) return 'N';
  const m = CHORD_RE.exec(tok);
  if (!m) return null;
  const [, root, qual = '', num = '', ext = ''] = m;
  let type = '';
  const minor = qual === 'm' || qual === 'min';
  if (qual === 'dim' || qual === '°') type = 'm';
  else if (qual === 'add') type = '';
  else if (/sus2/.test(qual + num + ext)) type = 'sus2';
  else if (qual === 'sus' || /sus4?/.test(ext)) type = 'sus4';
  else if (num === '5' && !qual) type = '5';
  else if (qual === 'maj' || qual === 'M' || /maj|M7/.test(ext)) type = num === '7' || /7/.test(ext) ? (minor ? 'm7' : 'maj7') : minor ? 'm' : '';
  else if (['7', '9', '11', '13'].includes(num)) type = minor ? 'm7' : '7';
  else type = minor ? 'm' : '';
  const p = parseChord(root + type);
  return p ? NOTE_NAMES[p.root] + p.type : null;
}

const SECTION_RE = /^\s*\[([^\]]{1,40})\]\s*$/;
const REPEAT_RE = /^\(?(?:x\s?(\d+)|(\d+)\s?x)\)?$/i;

export function looksLikeChordSheet(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const chordLines = lines.filter(l => chordLine(l));
  return chordLines.length >= 2 && chordLines.length >= lines.length * 0.15;
}

function chordLine(line) {
  const toks = line.replace(/\[\/?ch\]/g, '').trim().split(/\s+/).filter(t => t && !/^[|/\-:.]+$/.test(t));
  if (!toks.length) return null;
  let repeat = 1;
  const last = toks[toks.length - 1];
  const rm = REPEAT_RE.exec(last);
  if (rm && toks.length > 1) { repeat = Math.min(8, +(rm[1] || rm[2])); toks.pop(); }
  if (!toks.every(isChordToken)) return null;
  return { chords: toks.map(normalizeChord).filter(Boolean), repeat };
}

// Returns { chords: [...], sections: [{ name, ci }], capo } or null if no chords were found.
export function parseChordSheet(text) {
  text = text.replace(/\[\/?(tab|ch)\]/g, '');
  const sections = [];
  const chords = [];
  let capo = 0, pendingSection = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sm = SECTION_RE.exec(line);
    if (sm) { pendingSection = sm[1].trim(); continue; }
    const cm = /capo\s*(?:on\s*)?(?:fret\s*)?(\d{1,2})/i.exec(line);
    if (cm && line.length < 40) { capo = +cm[1]; continue; }
    const cl = chordLine(line);
    if (!cl || !cl.chords.length) continue; // lyrics and other text are skipped on purpose
    if (pendingSection) { sections.push({ name: pendingSection, ci: chords.length }); pendingSection = null; }
    for (let r = 0; r < cl.repeat; r++) chords.push(...cl.chords);
  }
  if (!chords.length) return null;
  return { chords, sections, capo };
}
