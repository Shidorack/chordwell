# Chordwell

A guitar practice app for electric guitar that runs in the browser on your phone and your PC, and works offline once it's installed.

- **Song → chords**: pick an audio file (mp3/m4a/wav) or record a song with the mic. The app finds the beats, chords and key. Everything runs on your device, so nothing is uploaded.
- **Tab mode**: for riff and melody songs it finds the single notes and shows a scrolling 6-string tab plus a fretboard. It switches to Drop D or Drop C when the notes go low enough.
- **Practice**: speed 40–120 % without changing the pitch, A-B loop, count-in, metronome, and "wait for me", which stops at every chord or note change. You can also transpose, get a capo hint, and switch on simple chords or power chords. "Fix chord" lets you correct a wrong chord.
- **Type / paste**: type chords as `| G | D | Em | C |` (`%` repeats a bar), paste a whole chord sheet (chords above lyrics), or paste a plain-text tab. From a chord sheet the app keeps only the chords, the song parts ([Verse], [Chorus]), repeats (x2) and the capo. The lyrics are thrown away.
- **Listen**: hears a song from a speaker (Spotify, radio, the LT25's AUX input…), shows the chord it hears live, then works out all the chords. The audio isn't saved unless you tick "Keep the recording".
- **Sync to the music**: for pasted chords, Chordwell listens to the real song and works out when each chord is played, even if you start listening in the middle of the song.
- **Find online**: search buttons that open Ultimate Guitar or Songsterr for a song. Chordwell doesn't copy anything from those sites itself.
- **Songbook**: public-domain songs and practice riffs, which the app plays back with a plucked-guitar sound.
- **Fender Mustang LT25 helper**: for each sound it shows which preset to choose and where to set GAIN, VOLUME, TREBLE, BASS and MIDDLE (MIDDLE is in the menu). Preset names come from the LT25 owner's manual. The knob values are this app's own starting points, and you can save your own settings for each song.
- **Tuner**: uses the mic, set to standard tuning.

## Run locally

```
python serve.py            # http://localhost:8010
node tools/test-analyze.mjs  # detection accuracy test on synthetic guitar audio
node tools/test-analyze.mjs --wav   # also writes the test songs to test-audio/
node tools/cdp.mjs steps.json       # headless Edge UI test (server must run)
```

## Install on the phone

Open the GitHub Pages link on your phone. Then use **Add to Home Screen** (Safari: Share menu, Chrome: ⋮ menu). After the first visit it also works without internet.
