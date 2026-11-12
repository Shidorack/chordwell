// Built-in practice songs: public-domain songs and Chordwell's own practice riffs.
// Chord charts: one entry per bar ("Am C" splits a bar evenly).
// Tabs: notes as [midi, beats] pairs (null midi = rest); frets are worked out automatically.
import { assignFrets } from './analyze.js';


export const SONGBOOK = [
  {
    id: 'sb-rising-sun', title: 'House of the Rising Sun', artist: 'Traditional', bpm: 108, beatsPerBar: 3, style: 'ballad',
    bars: ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E', 'Am', 'C', 'D', 'F', 'Am', 'E', 'Am', 'E'], repeat: 2,
  },
  {
    id: 'sb-amazing-grace', title: 'Amazing Grace', artist: 'Traditional', bpm: 84, beatsPerBar: 3, style: 'clean',
    bars: ['G', 'G7', 'C', 'G', 'G', 'G', 'D', 'D', 'G', 'G7', 'C', 'G', 'G', 'D', 'G', 'G'], repeat: 2,
  },
  {
    id: 'sb-greensleeves', title: 'Greensleeves', artist: 'Traditional', bpm: 96, beatsPerBar: 3, style: 'ballad',
    bars: ['Am', 'G', 'F', 'E', 'Am', 'G', 'E', 'E', 'Am', 'G', 'F', 'E', 'Am', 'E', 'Am', 'Am', 'C', 'G', 'Am', 'E', 'C', 'G', 'Am E', 'Am'], repeat: 2,
  },
  {
    id: 'sb-saints', title: 'When the Saints Go Marching In', artist: 'Traditional', bpm: 110, beatsPerBar: 4, style: 'crunch',
    bars: ['C', 'C', 'C', 'C', 'C', 'C', 'G', 'G', 'C', 'C7', 'F', 'F', 'C', 'G', 'C', 'C'], repeat: 2,
  },
  {
    id: 'sb-12-bar', title: '12-Bar Blues in A', artist: 'Practice', bpm: 96, beatsPerBar: 4, style: 'classic',
    bars: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'], repeat: 3,
  },
  {
    id: 'sb-power-drill', title: 'Power Chord Drill', artist: 'Practice', bpm: 120, beatsPerBar: 4, style: 'hard', power: true,
    bars: ['E5', 'G5', 'A5', 'A5', 'E5', 'G5', 'D5 C5', 'A5', 'C5', 'D5', 'E5', 'E5'], repeat: 3,
  },
  {
    id: 'sb-pop-loop', title: 'Pop Loop (I–V–vi–IV)', artist: 'Practice', bpm: 100, beatsPerBar: 4, style: 'clean',
    bars: ['G', 'D', 'Em', 'C'], repeat: 6,
  },
  // ---- tabs ----
  {
    id: 'sb-mountain-king', title: 'In the Hall of the Mountain King (riff)', artist: 'Grieg, 1875', bpm: 120, style: 'hard', view: 'tab',
    notes: [
      [52, .5], [54, .5], [55, .5], [57, .5], [59, .5], [55, .5], [59, 1],
      [58, .5], [54, .5], [58, 1], [57, .5], [53, .5], [57, 1],
      [52, .5], [54, .5], [55, .5], [57, .5], [59, .5], [55, .5], [59, .5], [64, .5],
      [62, .5], [59, .5], [55, .5], [59, .5], [62, 2],
    ], repeat: 3,
  },
  {
    id: 'sb-ode-to-joy', title: 'Ode to Joy (melody)', artist: 'Beethoven, 1824', bpm: 100, style: 'lead', view: 'tab',
    notes: [
      [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, .5], [62, 2],
      [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, .5], [60, 2],
    ], repeat: 2,
  },
  {
    id: 'sb-fur-elise', title: 'Für Elise (opening)', artist: 'Beethoven, 1810', bpm: 70, style: 'clean', view: 'tab',
    notes: [
      [76, .5], [75, .5], [76, .5], [75, .5], [76, .5], [71, .5], [74, .5], [72, .5], [69, 1], [null, .5],
      [60, .5], [64, .5], [69, .5], [71, 1], [null, .5], [64, .5], [68, .5], [71, .5], [72, 1], [null, .5],
      [64, .5], [76, .5], [75, .5], [76, .5], [75, .5], [76, .5], [71, .5], [74, .5], [72, .5], [69, 1], [null, .5],
      [60, .5], [64, .5], [69, .5], [71, 1], [null, .5], [64, .5], [72, .5], [71, .5], [69, 2],
    ], repeat: 2,
  },
  {
    id: 'sb-gallop', title: 'Gallop Riff Drill (Drop D)', artist: 'Practice', bpm: 110, style: 'metal', view: 'tab',
    notes: [
      [38, .5], [38, .25], [38, .25], [38, .5], [38, .25], [38, .25], [41, .5], [43, .5], [38, 1],
      [38, .5], [38, .25], [38, .25], [38, .5], [38, .25], [38, .25], [44, .5], [43, .5], [41, .5], [40, .5],
    ], repeat: 4,
  },
  {
    id: 'sb-pentatonic', title: 'Minor Pentatonic Riff in E', artist: 'Practice', bpm: 96, style: 'classic', view: 'tab',
    notes: [
      [40, .5], [43, .5], [45, .5], [47, .5], [50, .5], [47, .5], [45, .5], [43, .5],
      [40, .5], [43, .5], [45, .5], [46, .5], [45, 1], [43, .5], [40, .5],
    ], repeat: 4,
  },
];

// Turns a chart into the same song shape that audio analysis produces.
export function chartToSong(c) {
  const beat = 60 / c.bpm;
  const segments = [], tabNotes = [];
  let t = 0;
  for (let r = 0; r < (c.repeat || 1); r++) {
    if (c.bars) for (const bar of c.bars) {
      const parts = bar.split(/\s+/);
      const each = c.beatsPerBar / parts.length;
      for (const ch of parts) {
        const last = segments[segments.length - 1];
        if (last && last.chord === ch) { last.end += each * beat; last.beats += each; }
        else segments.push({ chord: ch, start: t, end: t + each * beat, beats: each });
        t += each * beat;
      }
    }
    if (c.notes) for (const [midi, beats] of c.notes) {
      if (midi !== null) tabNotes.push({ t: +t.toFixed(3), dur: beats * beat, midi });
      t += beats * beat;
    }
  }
  const tab = assignFrets(tabNotes);
  const beatsArr = [];
  for (let b = 0; b * beat < t; b++) beatsArr.push(b * beat);
  return {
    id: c.id, title: c.title, artist: c.artist, source: 'chart', builtin: true,
    bpm: c.bpm, beatsPerBar: c.beatsPerBar || 4, duration: t, beats: beatsArr,
    segments, tab, tuning: tab.tuning || 'Standard', key: null, style: c.style,
    view: c.view || 'chords', power: !!c.power,
  };
}
