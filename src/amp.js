// Fender Mustang LT25 tone helper.
// Preset numbers/names and amp models are from the Fender Mustang LT25 owner's manual (pages 2, 3 and 8).
// The knob values are Chordwell's own starting points, not Fender's factory values.

export const LT25_PRESETS = {
  1: 'FENDER CLEAN', 2: 'SILKY SOLO', 3: 'BLUES LEAD 1', 4: 'VINTAGE TREMOLO', 5: 'DREAMY',
  6: 'COUNTRY PICKING', 7: 'STRIPES FUZZ', 8: 'THRASH OVERKILL', 9: 'JAZZ AMP', 10: 'OCTOBOT',
  11: 'ROYAL MAJESTY', 12: 'SUPER ROCK', 13: 'SUPER DRYCLEAN', 14: 'POWER PUNCH', 15: 'CLEAN DELAY',
  16: 'ROCK STRUM', 17: 'LITTLE CHAMP', 18: 'PHASER SWIRL', 19: '60S FUZZ', 20: 'MYTHIC CRUNCH',
  21: 'TOUCH WAH', 22: 'CLASSIC ROCK', 23: 'POLICE THE AREA', 24: 'VH BROWN SOUND', 25: 'YOU TOO ANTHEM',
  26: 'PINK OF THE MOON', 27: 'TORTURED TELE', 28: 'SKATE PUNK', 29: 'SPACE TRAVEL', 30: 'ACOUSTIC SIM',
  // 31-50 are only available through SAVE > REPLACE
  31: 'TAME PSYCH', 32: 'OLD 15 SPEAKER', 33: 'SURF MUSIC', 34: 'GATED METAL', 35: 'ROCK A BILLY',
  36: 'POST PUNK', 37: 'DOOM AND GLOOM', 38: 'EARLY ZZ', 39: 'ANGRY CHAMP', 40: 'HEAVY SHOEGAZE',
  41: 'HER RHAPSODY', 42: 'BLUES LEAD 2', 43: 'MODERN METAL', 44: 'SLOW SPIN', 45: 'BRIGHT PRINCE',
  46: 'DESERT ROCK', 47: 'ROOTS RHYTHM', 48: 'CHOPPY DELUXE', 49: 'ELECTRIC LOVE', 50: 'SWEEPING FLANGER',
};

export const STYLES = {
  clean: {
    label: 'Clean / Pop', preset: 1, alt: [13, 15],
    knobs: { gain: 3, volume: 6, treble: 6.5, middle: 5, bass: 5 },
    tips: ['Use the neck or middle pickup for a round, sparkly strum.', 'If it sounds thin, turn BASS up to 6.'],
  },
  acoustic: {
    label: 'Acoustic-style', preset: 30, alt: [1],
    knobs: { gain: 2, volume: 6, treble: 6, middle: 4.5, bass: 4.5 },
    tips: ['Neck pickup, light strumming, let the chords ring.', 'ACOUSTIC SIM sounds best with a pick and full open chords.'],
  },
  ballad: {
    label: 'Ballad / Dreamy', preset: 5, alt: [15, 29],
    knobs: { gain: 2.5, volume: 6, treble: 5.5, middle: 5, bass: 5.5 },
    tips: ['DREAMY has lots of space, so play slower and let notes ring.', 'Pick single chord notes (arpeggios) for an extra dreamy sound.'],
  },
  crunch: {
    label: 'Crunch / Pop-rock', preset: 16, alt: [20, 17],
    knobs: { gain: 5, volume: 6, treble: 6, middle: 6, bass: 5 },
    tips: ['Strum hard for crunch, soft for almost clean.', 'Turn your guitar volume knob down to 7 to clean it up for verses.'],
  },
  classic: {
    label: 'Classic rock', preset: 22, alt: [12, 20],
    knobs: { gain: 6, volume: 6, treble: 6.5, middle: 7, bass: 5.5 },
    tips: ['Classic rock lives in the mids: keep MIDDLE high.', 'Bridge pickup for riffs, neck pickup for solos.'],
  },
  hard: {
    label: 'Hard rock', preset: 24, alt: [12, 25],
    knobs: { gain: 7, volume: 6, treble: 6.5, middle: 6, bass: 6 },
    tips: ['Power chords sound best here (switch on "Power chords").', 'Mute the strings you don’t play with your fretting hand so it stays tight.'],
  },
  punk: {
    label: 'Punk', preset: 28, alt: [14, 36],
    knobs: { gain: 7, volume: 6, treble: 7, middle: 5.5, bass: 6 },
    tips: ['Fast downstrokes on power chords.', 'Bridge pickup, a little palm muting on the verses.'],
  },
  metal: {
    label: 'Metal', preset: 8, alt: [34, 43],
    knobs: { gain: 8, volume: 6, treble: 6.5, middle: 4, bass: 7 },
    tips: ['Don’t put GAIN on 10: it gets muddy. 7–8 is tighter.', 'Low MIDDLE gives the scooped metal sound; raise it if you play with a band.', 'GATED METAL (34) and MODERN METAL (43) need SAVE → REPLACE to load.'],
  },
  lead: {
    label: 'Lead / Melody', preset: 2, alt: [3, 42],
    knobs: { gain: 6.5, volume: 7, treble: 6, middle: 7, bass: 5 },
    tips: ['Lead presets have more sustain, so notes last longer.', 'VOLUME a bit higher so the melody stands out.'],
  },
};
export const STYLE_ORDER = ['clean', 'acoustic', 'ballad', 'crunch', 'classic', 'hard', 'punk', 'metal', 'lead'];

export const MASTER_NOTE = 'MASTER is just the overall loudness. 2–3 is plenty at home; with headphones start at 1.';

export const HOW_TO = [
  'Turn the ENCODER (big wheel) to choose the preset number.',
  'GAIN, VOLUME, TREBLE and BASS: turn the knobs on the amp. The setting jumps to where the knob points.',
  'MIDDLE has no knob: press the ENCODER, press it again on the amp box, turn to MIDDLE, press, turn to set.',
  'Happy with it? Press SAVE, then SAVE again to keep it in that preset.',
];

// Small SVG dial, looks like a chicken-head knob with a 0-10 scale.
export function knobSVG(label, value, { menu = false } = {}) {
  const v = Math.max(0, Math.min(10, value));
  const ang = -135 + v * 27; // -135..135 degrees
  const r = 30, cx = 45, cy = 44;
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = (-135 + i * 27 - 90) * Math.PI / 180;
    const r1 = r + 6, r2 = r + (i % 5 === 0 ? 12 : 9);
    ticks += `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" class="kn-tick"/>`;
  }
  const a = (ang - 90) * Math.PI / 180;
  // filled arc from 0 to value
  const a0 = (-135 - 90) * Math.PI / 180;
  const large = v * 27 > 180 ? 1 : 0;
  const arc = v > 0.05 ? `<path d="M ${cx + (r + 3) * Math.cos(a0)} ${cy + (r + 3) * Math.sin(a0)} A ${r + 3} ${r + 3} 0 ${large} 1 ${cx + (r + 3) * Math.cos(a)} ${cy + (r + 3) * Math.sin(a)}" class="kn-arc"/>` : '';
  return `<div class="knob${menu ? ' knob-menu' : ''}">
    <svg viewBox="0 0 90 92" width="90" height="92" aria-hidden="true">${ticks}${arc}
      <circle cx="${cx}" cy="${cy}" r="${r - 4}" class="kn-body"/>
      <line x1="${cx}" y1="${cy}" x2="${cx + (r - 8) * Math.cos(a)}" y2="${cy + (r - 8) * Math.sin(a)}" class="kn-pointer"/>
    </svg>
    <div class="kn-val">${v.toFixed(1)}</div>
    <div class="kn-label">${label}${menu ? '<small>menu</small>' : ''}</div>
  </div>`;
}

// Preset number override (if the user saved different presets in their amp's slots).
const OVR_KEY = 'chordwell.presetOverrides';
export function presetFor(style) {
  let ovr = {};
  try { ovr = JSON.parse(localStorage.getItem(OVR_KEY) || '{}'); } catch {}
  return ovr[style] ?? STYLES[style].preset;
}
export function setPresetOverride(style, num) {
  try {
    const ovr = JSON.parse(localStorage.getItem(OVR_KEY) || '{}');
    if (num === STYLES[style].preset) delete ovr[style]; else ovr[style] = num;
    localStorage.setItem(OVR_KEY, JSON.stringify(ovr));
  } catch {}
}
