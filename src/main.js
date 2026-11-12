import { parseChord, NOTE_NAMES, TUNINGS, liveChord } from './analyze.js';
import { parseChordSheet, looksLikeChordSheet } from './sheet.js';
import { chordSVG, displayChord, capoSuggestion } from './chords.js';
import { Player, audioCtx } from './player.js';
import { SONGBOOK, chartToSong } from './songbook.js';
import { saveSong, deleteSong, listSongs, requestPersist } from './store.js';
import { STYLES, STYLE_ORDER, LT25_PRESETS, HOW_TO, MASTER_NOTE, knobSVG, presetFor, setPresetOverride } from './amp.js';
import { Tuner, STRINGS } from './tuner.js';

const $ = id => document.getElementById(id);
const player = new Player();
let song = null;          // current song object
let view = 'chords';      // 'chords' | 'tab'
let countIn = false;
const opts = { transpose: 0, simple: false, power: false };

// ---------- small helpers ----------
const fmt = t => { t = Math.max(0, t || 0); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
const disp = ch => (ch === 'N' ? '–' : displayChord(ch, opts));
player.opts = { display: disp, get power() { return opts.power; }, get view() { return view; } };

// ---------- navigation ----------
function show(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'amp') renderAmp();
  if (name !== 'tuner' && tuner.running) stopTuner();
  if (name === 'play') requestAnimationFrame(resizeCanvases);
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

// ---------- song lists ----------
async function renderLists() {
  const mine = await listSongs();
  const el = $('mySongs');
  el.innerHTML = mine.length ? '' : '<p class="muted empty">No songs yet. Add an audio file, record, or type chords.</p>';
  for (const s of mine) el.appendChild(songCard(s, true));
  const sb = $('songbook'); sb.innerHTML = '';
  for (const c of SONGBOOK) sb.appendChild(songCard(c, false));
}
function songCard(s, mine) {
  const d = document.createElement('div');
  d.className = 'song-card';
  const isTab = (s.view || 'chords') === 'tab';
  const meta = [s.artist, s.key?.name, s.bpm ? s.bpm + ' bpm' : '', s.duration ? fmt(s.duration) : ''].filter(Boolean).join(' · ');
  d.innerHTML = `<button class="sc-main"><span class="badge ${isTab ? 'tab' : ''}">${isTab ? 'TAB' : 'CHORDS'}</span>
      <span class="sc-text"><b>${esc(s.title)}</b><small>${esc(meta)}</small></span></button>
    ${mine ? '<button class="sc-del" title="Delete">✕</button>' : ''}`;
  d.querySelector('.sc-main').addEventListener('click', () => openSong(mine ? s : chartToSong(s)));
  if (mine) {
    let armed = false;
    d.querySelector('.sc-del').addEventListener('click', async e => {
      const b = e.currentTarget;
      if (!armed) { armed = true; b.textContent = 'Delete?'; b.classList.add('armed'); setTimeout(() => { armed = false; b.textContent = '✕'; b.classList.remove('armed'); }, 2500); return; }
      await deleteSong(s.id);
      if (song?.id === s.id) { song = null; player.pause(); }
      renderLists();
    });
  }
  return d;
}

// ---------- open a song ----------
function prefsKey(s) { return 'chordwell.prefs.' + s.id; }
function openSong(s) {
  song = s;
  ampStyle = null; ampKnobs = null;
  const pr = s.builtin ? lsGet(prefsKey(s), {}) : (s.prefs || {});
  opts.transpose = pr.transpose ?? 0;
  opts.simple = pr.simple ?? false;
  opts.power = pr.power ?? !!s.power;
  view = pr.view ?? s.view ?? 'chords';
  player.load(s);
  player.backing = !s.audioBlob;
  $('bBacking').classList.toggle('hidden', !!s.audioBlob);
  $('noSong').classList.add('hidden');
  $('playUI').classList.remove('hidden');
  $('nowTitle').textContent = s.title;
  setView(view, false);
  syncChips();
  updateMeta();
  show('play');
}
function savePrefs() {
  if (!song) return;
  const pr = { transpose: opts.transpose, simple: opts.simple, power: opts.power, view, style: song.prefs?.style ?? lsGet(prefsKey(song), {}).style };
  if (song.builtin) lsSet(prefsKey(song), { ...lsGet(prefsKey(song), {}), ...pr });
  else { song.prefs = { ...(song.prefs || {}), ...pr }; song.updated = Date.now(); saveSong(song); }
}
function currentStyle() {
  if (!song) return 'clean';
  const pr = song.builtin ? lsGet(prefsKey(song), {}) : (song.prefs || {});
  return pr.style || song.style || 'clean';
}
function updateMeta() {
  if (!song) return;
  const bits = [];
  if (song.key) bits.push('Key ' + displayKey(song.key));
  if (song.bpm) bits.push(song.bpm + ' bpm');
  if (song.capo) bits.push('<b class="warn">Capo ' + song.capo + '</b>');
  if (song.chart) bits.push(song.synced ? '✓ synced' : 'not synced yet');
  if (view === 'tab' && song.tuning && song.tuning !== 'Standard') bits.push('<b class="warn">' + song.tuning + ' tuning</b>');
  $('songMeta').innerHTML = bits.join(' · ');
  $('trVal').textContent = 'Key ' + (opts.transpose > 0 ? '+' : opts.transpose < 0 ? '−' : '±') + Math.abs(opts.transpose);
  const capo = view === 'chords' ? capoSuggestion(song.segments.map(s => s.chord), opts.transpose) : null;
  const hint = $('capoHint');
  if (capo && !opts.power) {
    hint.innerHTML = `Easier: put a capo on fret <b>${capo.capo}</b> and play <b>${[...new Set(capo.shapes)].slice(0, 6).join(' ')}</b> shapes. <button class="link" id="capoApply">Use these shapes</button>`;
    hint.classList.remove('hidden');
    $('capoApply').onclick = () => { opts.transpose -= capo.capo; toast(`Capo on fret ${capo.capo}`); savePrefs(); syncChips(); updateMeta(); };
  } else hint.classList.add('hidden');
  $('ampStyleName').textContent = '· ' + STYLES[currentStyle()].label;
  $('bSync').classList.toggle('hidden', !(song.chart?.length && !song.audioBlob));
  $('bSync').textContent = song.synced ? '🎧 Sync again' : '🎧 Sync to the music';
  const q = songQuery();
  $('bFindUG').classList.toggle('hidden', !q); $('bFindSS').classList.toggle('hidden', !q);
}
function displayKey(k) {
  const root = (k.root + opts.transpose + 120) % 12;
  return NOTE_NAMES[root] + (k.mode === 'minor' ? ' minor' : ' major');
}

// ---------- view: chords / tab ----------
function setView(v, persist = true) {
  view = v;
  $('vChords').classList.toggle('active', v === 'chords');
  $('vTab').classList.toggle('active', v === 'tab');
  $('chordStage').classList.toggle('hidden', v !== 'chords');
  $('tabStage').classList.toggle('hidden', v !== 'tab');
  $('chordOpts').classList.toggle('hidden', v !== 'chords');
  $('lane').height = v === 'tab' ? 190 : 120;
  lastNow = null;
  if (persist) savePrefs();
  updateMeta();
  resizeCanvases();
  if (v === 'tab' && song && !song.tab?.length) toast('No single notes found in this song. Try Chords.');
  if (v === 'chords' && song && !song.segments?.length) toast('This one is a tab-only song.');
}
$('vChords').onclick = () => setView('chords');
$('vTab').onclick = () => setView('tab');

// ---------- transport ----------
$('bPlay').onclick = () => { player.toggle({ countIn }); };
$('bStart').onclick = () => player.seek(player.loop.on && player.loop.a !== null ? player.loop.a : 0);
$('bBack').onclick = () => player.seek(player.time - 5);
$('bFwd').onclick = () => player.seek(player.time + 5);
$('speed').oninput = e => { const r = e.target.value / 100; player.setRate(r); $('speedVal').textContent = e.target.value + '%'; };
$('scrub').oninput = e => player.seek(e.target.value / 1000 * player.duration);
$('bA').onclick = () => { player.loop.a = player.time; if (player.loop.b !== null && player.loop.b <= player.loop.a) player.loop.b = null; syncChips(); toast('Loop start set'); };
$('bB').onclick = () => {
  const t = player.time;
  if (player.loop.a === null || t <= player.loop.a) { toast('Set A first (a spot before this one)'); return; }
  player.loop.b = t; player.loop.on = true; syncChips(); toast('Looping A → B');
};
$('bLoop').onclick = () => {
  if (player.loop.a === null || player.loop.b === null) {
    // no A/B yet: loop the current 2 chords (or 4 bars of notes)
    const t = player.time;
    if (view === 'chords' && song.segments.length) {
      const i = Math.max(0, song.segments.findIndex(s => t >= s.start && t < s.end));
      player.loop.a = song.segments[i].start;
      player.loop.b = song.segments[Math.min(song.segments.length - 1, i + 1)].end;
    } else {
      const bar = (60 / (song.bpm || 100)) * (song.beatsPerBar || 4);
      player.loop.a = Math.max(0, t - 0.1); player.loop.b = Math.min(player.duration, player.loop.a + bar * 2);
    }
    player.loop.on = true;
  } else player.loop.on = !player.loop.on;
  syncChips();
};
$('bLoopClear').onclick = () => { player.loop = { on: false, a: null, b: null }; syncChips(); };
$('bCount').onclick = () => { countIn = !countIn; syncChips(); };
$('bWait').onclick = () => { player.wait = !player.wait; syncChips(); if (player.wait) toast('Stops at each change. Tap “Next ➜” when you’re ready.'); };
$('bMetro').onclick = () => { player.metronome = !player.metronome; syncChips(); };
$('bBacking').onclick = () => { player.backing = !player.backing; syncChips(); };
$('bWaitGo').onclick = () => { $('bWaitGo').classList.add('hidden'); player.skipWaitUntil = player.time + 0.05; player.play(); };
player.onWait = () => { $('bWaitGo').classList.remove('hidden'); };
player.onEnd = () => {};
$('bTrDown').onclick = () => { opts.transpose--; savePrefs(); updateMeta(); lastNow = null; };
$('bTrUp').onclick = () => { opts.transpose++; savePrefs(); updateMeta(); lastNow = null; };
$('bSimple').onclick = () => { opts.simple = !opts.simple; if (opts.simple) opts.power = false; savePrefs(); syncChips(); updateMeta(); lastNow = null; };
$('bPower').onclick = () => { opts.power = !opts.power; if (opts.power) opts.simple = false; savePrefs(); syncChips(); updateMeta(); lastNow = null; };
function syncChips() {
  const on = (id, v) => $(id).classList.toggle('on', !!v);
  on('bA', player.loop.a !== null); on('bB', player.loop.b !== null); on('bLoop', player.loop.on);
  on('bCount', countIn); on('bWait', player.wait); on('bMetro', player.metronome); on('bBacking', player.backing);
  on('bSimple', opts.simple); on('bPower', opts.power);
}

// edit chord at the current spot
let editIdx = -1;
$('bEdit').onclick = () => {
  if (!song?.segments.length) return;
  player.pause();
  const t = player.time;
  editIdx = Math.max(0, song.segments.findIndex(s => t >= s.start && t < s.end));
  $('editInput').value = song.segments[editIdx].chord === 'N' ? '' : song.segments[editIdx].chord;
  $('editPanel').classList.remove('hidden');
  $('editInput').focus();
};
$('editCancel').onclick = () => $('editPanel').classList.add('hidden');
$('editSave').onclick = () => {
  let v = $('editInput').value.trim();
  if (v === '' || v === '-') v = 'N';
  else {
    const p = parseChord(v[0].toUpperCase() + v.slice(1));
    if (!p) { toast('Write a chord like G, Am, D7, E5'); return; }
    v = NOTE_NAMES[(p.root - opts.transpose + 120) % 12] + p.type; // store untransposed
  }
  song.segments[editIdx].chord = v;
  // merge with equal neighbours
  song.segments = song.segments.reduce((acc, s) => {
    const l = acc[acc.length - 1];
    if (l && l.chord === s.chord) { l.end = s.end; l.beats += s.beats; } else acc.push({ ...s });
    return acc;
  }, []);
  $('editPanel').classList.add('hidden');
  if (!song.builtin) { song.updated = Date.now(); saveSong(song); }
  lastNow = null; toast('Chord fixed');
};

// keyboard on PC
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (!$('view-play').classList.contains('active') || !song) return;
  if (e.code === 'Space') { e.preventDefault(); if (!$('bWaitGo').classList.contains('hidden')) $('bWaitGo').click(); else $('bPlay').click(); }
  if (e.code === 'ArrowLeft') player.seek(player.time - 5);
  if (e.code === 'ArrowRight') player.seek(player.time + 5);
});

// ---------- drawing ----------
const lane = $('lane'), fb = $('fretboard');
const PPS = 110; // pixels per second at 100 %
function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  for (const c of [lane, fb]) {
    const w = c.clientWidth || 340, h = c === lane ? (view === 'tab' ? 190 : 120) : 120;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.height = h + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
window.addEventListener('resize', resizeCanvases);

const css = getComputedStyle(document.documentElement);
const C = n => css.getPropertyValue(n).trim();
let lastNow = null;

function segAt(t) { return song.segments.findIndex(s => t >= s.start && t < s.end); }

function drawLane(t) {
  const ctx = lane.getContext('2d');
  const w = lane.clientWidth, h = parseFloat(lane.style.height) || 120;
  const ph = Math.round(w * 0.28);
  const x = tt => ph + (tt - t) * PPS;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C('--lane'); ctx.fillRect(0, 0, w, h);
  const t0 = t - ph / PPS, t1 = t + (w - ph) / PPS;
  // loop region
  const L = player.loop;
  if (L.a !== null) {
    const xb = L.b !== null ? x(L.b) : x(t1);
    ctx.fillStyle = L.on ? C('--loop') : C('--loop-off');
    ctx.fillRect(x(L.a), 0, xb - x(L.a), h);
  }
  // beats
  if (song.beats) {
    ctx.strokeStyle = C('--beat'); ctx.lineWidth = 1;
    const bpb = song.beatsPerBar || 4;
    song.beats.forEach((bt, i) => {
      if (bt < t0 || bt > t1) return;
      ctx.globalAlpha = i % bpb === 0 ? 0.9 : 0.35;
      ctx.beginPath(); ctx.moveTo(x(bt) + 0.5, 0); ctx.lineTo(x(bt) + 0.5, h); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  // song parts ([Verse], [Chorus] ...)
  if (song.sections?.length) {
    ctx.font = '800 11px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    for (const sec of song.sections) {
      if (sec.t == null || sec.t < t0 - 20 || sec.t > t1) continue;
      ctx.fillStyle = C('--accent-2'); ctx.fillRect(x(sec.t), 0, 2, h);
      ctx.fillText(sec.name.toUpperCase(), x(sec.t) + 5, 13);
    }
  }
  if (view === 'chords') {
    for (const s of song.segments) {
      if (s.end < t0 || s.start > t1) continue;
      const a = x(s.start), b = x(s.end);
      const cur = t >= s.start && t < s.end;
      if (s.chord === 'N') continue;
      ctx.fillStyle = cur ? C('--accent') : C('--block');
      roundRect(ctx, a + 2, 22, b - a - 4, h - 44, 8); ctx.fill();
      ctx.fillStyle = cur ? C('--on-accent') : C('--text');
      ctx.font = `700 ${cur ? 26 : 22}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const label = disp(s.chord);
      const tw = ctx.measureText(label).width;
      if (b - a - 8 > tw) ctx.fillText(label, a + 10, h / 2);
      else if (b - a > 18) { ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText(label, a + 5, h / 2); }
    }
  } else {
    // tab staff: high e on top
    const top = 34, gap = (h - 54) / 5;
    ctx.strokeStyle = C('--string'); ctx.lineWidth = 1;
    const names = (TUNINGS[song.tuning] || TUNINGS.Standard).map(m => NOTE_NAMES[m % 12].replace('Eb', 'D#'));
    for (let i = 0; i < 6; i++) {
      const y = top + i * gap;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = C('--muted'); ctx.font = '600 11px ui-monospace, monospace'; ctx.textBaseline = 'middle';
      ctx.fillText(i === 0 ? names[5].toLowerCase() : names[5 - i], 4, y);
    }
    // chord names above, if any
    ctx.font = '700 13px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    for (const s of song.segments) {
      if (s.chord === 'N' || s.end < t0 || s.start > t1) continue;
      ctx.fillStyle = C('--muted'); ctx.fillText(disp(s.chord), x(s.start) + 3, 16);
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (const n of song.tab) {
      if (n.t < t0 - 1 || n.t > t1) continue;
      const nx = x(n.t), y = top + (5 - n.string) * gap;
      const cur = t >= n.t && t < n.t + Math.max(0.12, n.dur);
      const label = String(n.fret);
      ctx.font = `700 ${cur ? 17 : 15}px ui-monospace, monospace`;
      const bw = ctx.measureText(label).width + 10;
      ctx.fillStyle = cur ? C('--accent') : C('--note');
      roundRect(ctx, nx - bw / 2, y - 11, bw, 22, 6); ctx.fill();
      ctx.fillStyle = cur ? C('--on-accent') : C('--text');
      ctx.fillText(label, nx, y + 1);
    }
    ctx.textAlign = 'left';
  }
  // playhead
  ctx.fillStyle = C('--playhead'); ctx.fillRect(ph - 1, 0, 2, h);
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawFretboard(cur, next) {
  const ctx = fb.getContext('2d');
  const w = fb.clientWidth, h = 120;
  ctx.clearRect(0, 0, w, h);
  const frets = 15, left = 26, right = w - 8, top = 14, bottom = h - 22;
  const fx = f => left + (right - left) * (f / frets);
  ctx.fillStyle = C('--wood'); ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = C('--fretwire');
  for (let f = 0; f <= frets; f++) { ctx.lineWidth = f === 0 ? 4 : 1.5; ctx.beginPath(); ctx.moveTo(fx(f), top); ctx.lineTo(fx(f), bottom); ctx.stroke(); }
  ctx.fillStyle = C('--inlay');
  for (const f of [3, 5, 7, 9, 15]) { ctx.beginPath(); ctx.arc((fx(f - 1) + fx(f)) / 2, (top + bottom) / 2, 4, 0, 7); ctx.fill(); }
  for (const yy of [0.33, 0.67]) { ctx.beginPath(); ctx.arc((fx(11) + fx(12)) / 2, top + (bottom - top) * yy, 4, 0, 7); ctx.fill(); }
  const sy = s => top + (bottom - top) * ((5 - s) + 0.5) / 6;
  ctx.strokeStyle = C('--string');
  for (let s = 0; s < 6; s++) { ctx.lineWidth = 2 - s * 0.25; ctx.beginPath(); ctx.moveTo(left, sy(s)); ctx.lineTo(right, sy(s)); ctx.stroke(); }
  ctx.fillStyle = C('--muted'); ctx.font = '600 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const f of [3, 5, 7, 9, 12, 15]) ctx.fillText(f, (fx(f - 1) + fx(f)) / 2, bottom + 5);
  const dot = (n, color, r) => {
    if (!n) return;
    const xx = n.fret === 0 ? left - 12 : (fx(n.fret - 1) + fx(n.fret)) / 2;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xx, sy(n.string), r, 0, 7); ctx.fill();
    ctx.fillStyle = C('--on-accent'); ctx.font = '700 10px system-ui'; ctx.textBaseline = 'middle';
    ctx.fillText(n.fret, xx, sy(n.string) + 0.5);
  };
  dot(next, C('--ghost'), 8);
  dot(cur, C('--accent'), 10);
  ctx.textAlign = 'left';
}

const STRING_NAMES = ['6th (low E)', '5th (A)', '4th (D)', '3rd (G)', '2nd (B)', '1st (high e)'];
function frame() {
  requestAnimationFrame(frame);
  if (!song || !$('view-play').classList.contains('active')) { if (song) player.tick(changeTimes()); return; }
  const changes = changeTimes();
  player.tick(changes);
  const t = player.time, dur = player.duration;
  $('bPlay').textContent = player.playing || player.counting ? '❚❚' : '▶';
  $('tCur').textContent = fmt(t); $('tDur').textContent = fmt(dur);
  if (document.activeElement !== $('scrub')) $('scrub').value = dur ? Math.round(t / dur * 1000) : 0;
  drawLane(t);
  if (view === 'chords') {
    const i = segAt(t);
    let cur = song.segments[i], nxt = song.segments.slice(i + 1).find(s => s.chord !== 'N');
    const key = (cur?.chord || '') + '|' + (nxt?.chord || '') + '|' + JSON.stringify(opts);
    if (key !== lastNow) {
      lastNow = key;
      const cn = cur && cur.chord !== 'N' ? disp(cur.chord) : '–';
      const nn = nxt ? disp(nxt.chord) : '–';
      $('nowChord').textContent = cn; $('nextChord').textContent = nn;
      $('nowDiagram').innerHTML = cn !== '–' ? chordSVG(cn, { power: opts.power }) : '';
      $('nextDiagram').innerHTML = nn !== '–' ? chordSVG(nn, { size: 0.7, power: opts.power }) : '';
    }
  } else {
    const tab = song.tab;
    let ci = -1;
    for (let k = 0; k < tab.length; k++) { if (tab[k].t <= t + 0.02) ci = k; else break; }
    const cur = ci >= 0 && t < tab[ci].t + Math.max(0.25, tab[ci].dur) ? tab[ci] : null;
    const nxt = tab[ci + 1] || null;
    drawFretboard(cur, nxt);
    const key = cur ? cur.t : 'none';
    if (key !== lastNow) {
      lastNow = key;
      $('nowNote').textContent = cur ? `${STRING_NAMES[cur.string]} string, fret ${cur.fret}  (${NOTE_NAMES[cur.midi % 12]}${Math.floor(cur.midi / 12) - 1})` : nxt ? `get ready: ${STRING_NAMES[nxt.string]} string, fret ${nxt.fret}` : '–';
    }
  }
}
let changeCache = { song: null, view: null, list: [] };
function changeTimes() {
  if (changeCache.song === song && changeCache.view === view) return changeCache.list;
  const list = view === 'tab' ? song.tab.map(n => n.t) : song.segments.slice(1).map(s => s.start);
  changeCache = { song, view, list: [...new Set(list)].sort((a, b) => a - b) };
  return changeCache.list;
}

// tap / drag on the lane to move around
let drag = null;
lane.addEventListener('pointerdown', e => { drag = { x: e.clientX, t: player.time, moved: false }; lane.setPointerCapture(e.pointerId); });
lane.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 4) drag.moved = true;
  if (drag.moved) player.seek(drag.t - dx / PPS);
});
lane.addEventListener('pointerup', e => {
  if (drag && !drag.moved) {
    const r = lane.getBoundingClientRect(), ph = r.width * 0.28;
    player.seek(player.time + (e.clientX - r.left - ph) / PPS);
  }
  drag = null;
});

// ---------- adding songs ----------
const worker = new Worker(new URL('./analyze.worker.js', import.meta.url), { type: 'module' });
function busy(on, title, note) {
  $('busy').classList.toggle('hidden', !on);
  if (title) $('busyTitle').textContent = title;
  if (note) $('busyNote').textContent = note;
  if (on) $('busyBar').style.width = '0%';
}
async function decodeToMono(blob) {
  const ac = audioCtx();
  const arr = await blob.arrayBuffer();
  const decoded = await new Promise((res, rej) => {
    const p = ac.decodeAudioData(arr, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  if (decoded.duration > 12 * 60) throw new Error('Song is longer than 12 minutes');
  let sr = 11025, rendered;
  try {
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * sr), sr);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    rendered = await off.startRendering();
  } catch {
    sr = 22050;
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * sr), sr);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    rendered = await off.startRendering();
  }
  return { samples: rendered.getChannelData(0).slice(), sr, duration: decoded.duration };
}
function runAnalysis(samples, sr, chart) {
  return new Promise((resolve, reject) => {
    worker.onmessage = e => {
      if (e.data.progress !== undefined) $('busyBar').style.width = Math.round(20 + e.data.progress * 80) + '%';
      if (e.data.result) resolve(e.data.result);
      if (e.data.error) reject(new Error(e.data.error));
    };
    worker.postMessage({ samples, sr, chart }, [samples.buffer]);
  });
}
const newId = () => 'u' + Date.now().toString(36);
const chordCount = segs => new Set(segs.filter(x => x.chord !== 'N').map(x => x.chord)).size;

// keep = store the audio so it can be replayed; otherwise only chords / notes / tempo are kept
async function addAudio(blob, title, { keep = true } = {}) {
  busy(true, 'Listening to the song…', 'Reading the audio');
  try {
    const { samples, sr } = await decodeToMono(blob);
    $('busyBar').style.width = '20%';
    $('busyNote').textContent = 'Finding beats, chords and notes';
    const r = await runAnalysis(samples, sr);
    const s = {
      id: newId(), title, artist: '', source: keep ? 'audio' : 'listened', audioBlob: keep ? blob : undefined,
      bpm: r.bpm, beatsPerBar: 4, duration: r.duration, beats: r.beats, segments: r.segments,
      tab: r.tab, tuning: r.tuning, key: r.key, style: r.style, view: r.view, features: r.features,
      created: Date.now(), updated: Date.now(),
    };
    await saveSong(s);
    requestPersist();
    busy(false);
    renderLists();
    openSong(s);
    toast(r.view === 'tab' ? 'Mostly single notes found, showing Tab' : `Found ${chordCount(r.segments)} different chords`);
  } catch (err) {
    busy(false);
    console.error(err);
    toast('Could not read the audio: ' + (err.message || err));
  }
}

// Lines up the song's pasted chords with music heard through the mic.
async function syncSong(target, blob) {
  busy(true, 'Matching your chords to the music…', 'Reading the audio');
  try {
    const { samples, sr } = await decodeToMono(blob);
    $('busyBar').style.width = '20%';
    $('busyNote').textContent = 'Finding where each chord is played';
    const r = await runAnalysis(samples, sr, target.chart);
    const al = r.aligned;
    busy(false);
    if (!al || al.fit < 0.3 || al.to - al.from < 2) {
      toast('That didn’t match the pasted chords. Same song? Same key / capo?');
      return;
    }
    target.segments = al.segments.map(({ chord, ci, start, end, beats }) => ({ chord, ci, start, end, beats }));
    target.beats = r.beats; target.bpm = r.bpm; target.duration = r.duration;
    target.sections = (target.sections || []).map(sec => {
      const sg = target.segments.find(x => x.ci >= sec.ci);
      return { ...sec, t: sg ? sg.start : null };
    }).filter(sec => sec.t !== null);
    target.synced = { at: Date.now(), from: al.from, to: al.to, fit: al.fit };
    target.key = r.key;
    target.updated = Date.now();
    await saveSong(target);
    renderLists();
    openSong(target);
    toast(`Synced chords ${al.from + 1}–${al.to + 1} of ${target.chart.length} (${Math.round(al.fit * 100)}% clear match)`);
  } catch (err) {
    busy(false);
    console.error(err);
    toast('Could not sync: ' + (err.message || err));
  }
}

// ---------- Listen (mic) with a live chord display ----------
let rec = null, recChunks = [], recStart = 0, recTimer = null, recMode = null, liveTimer = null, liveCtx = null, recCancelled = false;
async function startListening(mode) {
  if (rec) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    recMode = mode; recCancelled = false;
    rec = new MediaRecorder(stream);
    recChunks = [];
    rec.ondataavailable = e => e.data.size && recChunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recChunks, { type: rec.mimeType || 'audio/webm' });
      rec = null; clearInterval(recTimer); clearInterval(liveTimer); liveCtx?.close(); liveCtx = null;
      $('recordPanel').classList.add('hidden');
      if (recCancelled) return;
      if ((Date.now() - recStart) < 6000) { toast('Too short. Listen to at least 20 seconds.'); return; }
      if (recMode?.sync) syncSong(recMode.sync, blob);
      else addAudio(blob, 'Heard ' + new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), { keep: $('keepAudio').checked });
    };
    rec.start(1000);
    recStart = Date.now();
    $('recLabel').textContent = mode?.sync ? `Syncing “${mode.sync.title}”` : 'Listening';
    $('keepRow').classList.toggle('hidden', !!mode?.sync);
    $('recHelp').textContent = mode?.sync
      ? 'Play the song now (from the start if you can). Chordwell matches your pasted chords to what it hears.'
      : 'Play the song on a speaker, another device, or through the LT25’s AUX input, and hold the phone near it. Whole song = best result.';
    $('liveChord').textContent = '…';
    $('recordPanel').classList.remove('hidden');
    $('recordPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    recTimer = setInterval(() => { $('recTime').textContent = fmt((Date.now() - recStart) / 1000); }, 250);
    // live chord guess from the mic spectrum
    liveCtx = new (window.AudioContext || window.webkitAudioContext)();
    const an = liveCtx.createAnalyser();
    an.fftSize = 16384; an.smoothingTimeConstant = 0.5;
    liveCtx.createMediaStreamSource(stream).connect(an);
    const db = new Float32Array(an.frequencyBinCount), mag = new Float32Array(an.frequencyBinCount);
    let lastGuess = null;
    liveTimer = setInterval(() => {
      an.getFloatFrequencyData(db);
      let loud = -Infinity;
      for (let k = 0; k < db.length; k++) { mag[k] = Math.pow(10, db[k] / 20); if (db[k] > loud) loud = db[k]; }
      const g = loud > -75 ? liveChord(mag, liveCtx.sampleRate / an.fftSize) : null;
      const name = g && g.score > 0.72 ? g.name : null;
      if (name && name === lastGuess) $('liveChord').textContent = name;
      if (!g) $('liveChord').textContent = '…';
      lastGuess = name;
    }, 220);
  } catch (err) { console.error(err); toast('Microphone not allowed'); rec = null; }
}
$('recordBtn').onclick = () => startListening(null);
$('recStop').onclick = () => rec?.stop();
$('recCancel').onclick = () => { recCancelled = true; rec?.stop(); };

// ---------- find chords online ----------
const UG = q => `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`;
const SS = q => `https://www.songsterr.com/?pattern=${encodeURIComponent(q)}`;
function openSearch(urlFn, q) {
  q = (q || '').trim();
  if (!q) { show('songs'); toast('Type a song name first'); $('findQ').focus(); return; }
  window.open(urlFn(q), '_blank', 'noopener');
}
$('findUG').onclick = () => openSearch(UG, $('findQ').value);
$('findSS').onclick = () => openSearch(SS, $('findQ').value);
$('findQ').addEventListener('keydown', e => { if (e.key === 'Enter') openSearch(UG, $('findQ').value); });
const songQuery = () => (song && !/^(Heard|Recording) /.test(song.title) ? [song.title, song.artist].filter(Boolean).join(' ') : '');
$('bFindUG').onclick = () => openSearch(UG, songQuery());
$('bFindSS').onclick = () => openSearch(SS, songQuery());
$('bSync').onclick = () => {
  if (!song?.chart?.length) return;
  player.pause();
  show('songs');
  startListening({ sync: song });
};

// ---------- typed chords / pasted chord sheet / pasted tab ----------
$('typeBtn').onclick = () => { $('typePanel').classList.toggle('hidden'); $('tTitle').focus(); };
$('tCancel').onclick = () => $('typePanel').classList.add('hidden');
$('tSave').onclick = async () => {
  const title = $('tTitle').value.trim() || 'My song';
  const bpm = Math.max(40, Math.min(240, +$('tBpm').value || 100));
  const bpb = Math.max(2, Math.min(12, +$('tBpb').value || 4));
  const text = $('tText').value;
  const tab = parseTextTab(text, bpm);
  let s;
  if (tab) {
    s = { id: newId(), title, source: 'typed', bpm, beatsPerBar: bpb, duration: tab.duration, beats: beatGrid(bpm, tab.duration), segments: [], tab: tab.notes, tuning: tab.tuning, key: null, style: 'lead', view: 'tab' };
  } else if (looksLikeChordSheet(text) && !/^\s*\|/.test(text)) {
    const sh = parseChordSheet(text);
    if (!sh) { toast('No chords found in that text'); return; }
    // store the chords as they sound (shape + capo) and show the capo shapes by default
    const sounding = sh.chords.map(c => (c === 'N' ? 'N' : displayChord(c, { transpose: sh.capo })));
    const chart = { id: newId(), title, bpm, beatsPerBar: bpb, bars: sounding, sections: sh.sections, style: 'clean' };
    s = { ...chartToSong(chart), builtin: false, source: 'sheet', chart: sounding, capo: sh.capo, prefs: { transpose: -sh.capo } };
    s.key = null;
  } else {
    const bars = text.split(/[|\n]+/).map(b => b.trim()).filter(Boolean);
    const bad = bars.flatMap(b => b.split(/\s+/)).filter(c => !parseChord(c) && c !== 'N' && c !== '-' && c !== '%');
    if (!bars.length) { toast('Type some chords first'); return; }
    if (bad.length) { toast('Not a chord: ' + bad.slice(0, 3).join(', ')); return; }
    const chart = { id: newId(), title, bpm, beatsPerBar: bpb, bars: [], style: 'clean' };
    let prev = 'N';
    for (const b of bars) { const v = b === '%' ? prev : b.replace(/\b-\b/g, 'N'); chart.bars.push(v); prev = v; }
    s = { ...chartToSong(chart), builtin: false, source: 'typed', bars: chart.bars, chart: chart.bars.flatMap(b => b.split(/\s+/)) };
    s.key = null;
  }
  s.created = s.updated = Date.now();
  await saveSong(s);
  $('typePanel').classList.add('hidden'); $('tText').value = ''; $('tTitle').value = '';
  renderLists(); openSong(s);
  if (s.capo) toast(`Capo on fret ${s.capo}: showing the shapes from the sheet`);
};
function beatGrid(bpm, dur) { const b = 60 / bpm, out = []; for (let t = 0; t < dur; t += b) out.push(+t.toFixed(3)); return out; }

// Reads a plain-text guitar tab (6 lines per block, high e on top).
function parseTextTab(text, bpm) {
  const lines = text.split(/\r?\n/);
  const isTabLine = l => /^\s*[a-gA-G][#b]?\s*[|:]?[-0-9xXhpbr/\\~|()\s]{4,}$/.test(l) && /-/.test(l);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTabLine(lines[i]) && lines.slice(i, i + 6).length === 6 && lines.slice(i, i + 6).every(isTabLine)) {
      blocks.push(lines.slice(i, i + 6)); i += 5;
    }
  }
  if (!blocks.length) return null;
  const events = []; let colBase = 0;
  for (const b of blocks) {
    const rows = b.map(l => l.replace(/^\s*[a-gA-G][#b]?\s*[|:]?/, ''));
    const width = Math.max(...rows.map(r => r.length));
    for (let c = 0; c < width; c++) {
      const notes = [];
      rows.forEach((r, ri) => {
        if (/\d/.test(r[c] || '') && !/\d/.test(r[c - 1] || '')) {
          const m = /^\d{1,2}/.exec(r.slice(c));
          notes.push({ string: 5 - ri, fret: +m[0] });
        }
      });
      if (notes.length) events.push({ col: colBase + c, notes });
    }
    colBase += width + 2;
  }
  if (!events.length) return null;
  // time per column: make the typical gap between notes half a beat
  const gaps = events.slice(1).map((e, i) => e.col - events[i].col).sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)] || 2;
  const colSec = (60 / bpm) * 0.5 / med;
  const tuning = 'Standard', open = TUNINGS[tuning];
  const notes = [];
  events.forEach((e, i) => {
    const t = (e.col - events[0].col) * colSec;
    const next = events[i + 1] ? (events[i + 1].col - events[0].col) * colSec : t + 0.5;
    for (const n of e.notes) notes.push({ t: +t.toFixed(3), dur: next - t, midi: open[n.string] + n.fret, string: n.string, fret: n.fret });
  });
  return { notes, duration: notes[notes.length - 1].t + 1.5, tuning };
}

// ---------- amp helper ----------
let ampStyle = null, ampKnobs = null;
function ampKey() { return 'chordwell.amp.' + (song?.id || 'none'); }
function renderAmp() {
  const style = ampStyle || currentStyle();
  ampStyle = style;
  const saved = song ? lsGet(ampKey(), null) : null;
  if (!ampKnobs) ampKnobs = saved && saved.style === style ? { ...saved.knobs } : { ...STYLES[style].knobs };
  const st = STYLES[style];
  $('styleGuess').textContent = song ? `For “${song.title}”${song.source === 'audio' ? ' (best guess from the sound, change it if needed)' : ''}.` : '';
  const chips = $('styleChips'); chips.innerHTML = '';
  for (const k of STYLE_ORDER) {
    const b = document.createElement('button');
    b.className = 'chip' + (k === style ? ' on' : '');
    b.textContent = STYLES[k].label;
    b.onclick = () => { ampStyle = k; ampKnobs = null; if (song) setSongStyle(k); renderAmp(); };
    chips.appendChild(b);
  }
  const num = presetFor(style);
  $('lcdNum').textContent = String(num).padStart(2, '0');
  $('lcdName').textContent = LT25_PRESETS[num] || '';
  $('altPresets').innerHTML = 'Also try: ' + st.alt.map(n => `<b>${String(n).padStart(2, '0')}</b> ${LT25_PRESETS[n]}${n > 30 ? ' <small>(via REPLACE)</small>' : ''}`).join(' · ');
  const order = [['gain', 'GAIN'], ['volume', 'VOLUME'], ['treble', 'TREBLE'], ['bass', 'BASS'], ['middle', 'MIDDLE']];
  $('knobs').innerHTML = order.map(([k, l]) => `<div class="knob-wrap">${knobSVG(l, ampKnobs[k], { menu: k === 'middle' })}
      <div class="kn-btns"><button data-k="${k}" data-d="-0.5" aria-label="${l} down">−</button><button data-k="${k}" data-d="0.5" aria-label="${l} up">+</button></div></div>`).join('');
  $('knobs').querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.k; ampKnobs[k] = Math.max(0, Math.min(10, ampKnobs[k] + +b.dataset.d)); renderAmp();
  });
  $('masterNote').textContent = MASTER_NOTE;
  $('ampTips').innerHTML = st.tips.map(t => `<li>${esc(t)}</li>`).join('') + (saved && saved.style === style ? '<li class="saved">Your saved settings for this song are shown.</li>' : '');
  $('howTo').innerHTML = HOW_TO.map(t => `<li>${esc(t)}</li>`).join('');
  const sel = $('slotSelect');
  sel.innerHTML = Array.from({ length: 30 }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === num ? 'selected' : ''}>${String(n).padStart(2, '0')} — ${LT25_PRESETS[n]}</option>`).join('');
  sel.onchange = () => { setPresetOverride(style, +sel.value); renderAmp(); };
}
function setSongStyle(k) {
  if (song.builtin) lsSet(prefsKey(song), { ...lsGet(prefsKey(song), {}), style: k });
  else { song.prefs = { ...(song.prefs || {}), style: k }; saveSong(song); }
  updateMeta();
}
$('ampSave').onclick = () => {
  if (!song) { toast('Open a song first'); return; }
  lsSet(ampKey(), { style: ampStyle, knobs: ampKnobs }); setSongStyle(ampStyle); toast('Saved for this song'); renderAmp();
};
$('ampReset').onclick = () => { ampKnobs = { ...STYLES[ampStyle].knobs }; try { localStorage.removeItem(ampKey()); } catch {} renderAmp(); };
$('toAmp').onclick = () => { ampStyle = null; ampKnobs = null; show('amp'); };

// ---------- tuner ----------
const tuner = new Tuner(info => {
  if (!info) { $('tnNeedle').style.opacity = 0.25; return; }
  $('tnNeedle').style.opacity = 1;
  const c = Math.max(-50, Math.min(50, info.offString));
  $('tnNeedle').style.transform = `translateX(-50%) rotate(${c * 0.9}deg)`;
  const inTune = Math.abs(info.offString) <= 5;
  $('tnNote').textContent = info.string.name;
  $('tnNote').classList.toggle('in-tune', inTune);
  $('tnInfo').textContent = inTune ? `String ${info.string.label}: in tune ✓` : `String ${info.string.label}: ${info.offString < 0 ? 'too low, tighten' : 'too high, loosen'} (${info.offString > 0 ? '+' : ''}${info.offString} cents)`;
  document.querySelectorAll('.strings button').forEach(b => b.classList.toggle('on', +b.dataset.m === info.string.midi));
});
function stopTuner() { tuner.stop(); $('tnBtn').textContent = 'Start tuner'; }
$('tnBtn').onclick = async () => {
  if (tuner.running) { stopTuner(); return; }
  try { await tuner.start(); $('tnBtn').textContent = 'Stop tuner'; } catch { toast('Microphone not allowed'); }
};
$('tnStrings').innerHTML = STRINGS.map(s => `<button data-m="${s.midi}"><b>${s.name}</b><small>${s.label}</small></button>`).join('');
$('tnStrings').querySelectorAll('button').forEach(b => b.onclick = () => {
  const c = audioCtx(), o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((+b.dataset.m - 69) / 12);
  g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 2);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 2.1);
});

// ---------- start ----------
window.__chordwell = { player, get song() { return song; }, openSong, addAudio, show, syncSong };
renderLists();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.hostname.match(/^(localhost|127\.)/)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
