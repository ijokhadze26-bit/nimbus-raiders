// Procedural music: song data for the step sequencer in music.js (16 steps per bar).
// Pattern strings: one char per 16th. Drums: 'x' hit, 'X' accent, 'o' ghost, '.' rest.
// Tonal parts: chord-relative letters — r root, t third, f fifth, s seventh, n ninth, o octave;
// UPPERCASE = one octave up; '-' holds the previous note; '.' rest. `lo` = lowest root midi.
// Melodies: { barIndex: [[step, midi, lenSteps], ...] } relative to the part's `from` bar.
// `pat` may be an array (cycled per bar); `fills` overrides specific loop bars.

const MEL_TITLE = {
  0: [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 4]],
  1: [[0, 72, 2], [2, 76, 2], [4, 79, 4], [10, 81, 2], [12, 79, 4]],
  2: [[0, 77, 3], [3, 76, 3], [6, 74, 2], [8, 72, 2], [10, 74, 6]],
  3: [[0, 71, 2], [2, 74, 2], [4, 79, 6], [12, 77, 2], [14, 74, 2]],
  4: [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 4]],
  5: [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 6], [12, 83, 2], [14, 81, 2]],
  6: [[0, 79, 3], [3, 77, 3], [6, 76, 2], [8, 74, 4], [12, 77, 4]],
  7: [[0, 74, 4], [4, 71, 4], [8, 72, 8]],
};

const MEL_RUN = {
  0: [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 2], [14, 77, 2]],
  1: [[0, 74, 6], [6, 70, 2], [8, 72, 2], [10, 74, 2], [12, 77, 4]],
  2: [[0, 76, 2], [2, 77, 2], [4, 81, 2], [6, 84, 4], [10, 81, 2], [12, 79, 4]],
  3: [[0, 79, 4], [4, 76, 2], [6, 72, 2], [8, 76, 8]],
  4: [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 2], [14, 77, 2]],
  5: [[0, 74, 4], [4, 77, 2], [6, 82, 6], [12, 81, 2], [14, 79, 2]],
  6: [[0, 81, 3], [3, 79, 3], [6, 77, 2], [8, 76, 2], [10, 77, 2], [12, 79, 4]],
  7: [[0, 76, 4], [4, 79, 4], [8, 72, 8]],
};

const MEL_BOSS = {
  0: [[0, 69, 2], [2, 72, 2], [4, 71, 2], [6, 69, 2], [8, 76, 4], [12, 74, 2], [14, 72, 2]],
  1: [[0, 72, 2], [2, 69, 2], [4, 65, 4], [8, 69, 2], [10, 72, 2], [12, 77, 4]],
  2: [[0, 74, 2], [2, 77, 2], [4, 76, 2], [6, 74, 2], [8, 72, 4], [12, 69, 4]],
  3: [[0, 68, 4], [4, 71, 4], [8, 76, 4], [12, 74, 2], [14, 71, 2]],
};

export const TRACKS = {
  // chill, bouncy: I-vi-ii-V in C, swung, mallet melody then a pluck arpeggio section
  title: {
    bpm: 116, swing: 0.1, bars: 16, gain: 0.95, delayBeats: 0.75,
    chords: ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    parts: [
      { inst: 'kick', pat: 'x.....x.x.......', v: 0.65 },
      { inst: 'rim', pat: '....x.......x...', v: 0.8 },
      { inst: 'shaker', pat: 'o.x.o.x.o.x.o.x.', v: 0.75 },
      { inst: 'hat', pat: '..............x.', v: 0.35, open: true },
      { inst: 'bass', pat: 'r-...rf.r-..f.o.', lo: 36, v: 0.75, bright: 0.35 },
      { inst: 'pad', lo: 55, v: 0.8 },
      { inst: 'mallet', mel: MEL_TITLE, from: 0, to: 8, v: 0.85 },
      { inst: 'pluck', pat: 'r.t.f.s.o.s.f.t.', lo: 60, from: 8, to: 16, v: 0.7 },
      { inst: 'mallet', pat: '........T.....F.', lo: 60, from: 12, to: 16, v: 0.35 },
    ],
  },
  // energetic: vi-IV-I-V in F, four-on-the-floor, octave bass, 16th arp, lead hook in the B half
  run: {
    bpm: 126, swing: 0, bars: 16, gain: 0.9, delayBeats: 0.75,
    chords: ['Dm', 'Bb', 'F', 'C'],
    parts: [
      { inst: 'kick', pat: 'x...x...x...x...', fills: { 7: 'x...x...x...x.x.', 15: 'x...x...x...x.xx' }, v: 1 },
      { inst: 'clap', pat: '....x.......x...', fills: { 15: '....x.......x.xx' }, v: 0.85 },
      { inst: 'hat', pat: 'xo.oxo.oxo.oxo.o', v: 0.7 },
      { inst: 'hat', pat: '..x...x...x...x.', v: 0.55, open: true },
      { inst: 'crash', pat: 'x...............', only: [0, 8], v: 0.8 },
      { inst: 'riser', pat: 'x...............', only: [7, 15], v: 0.9 },
      { inst: 'bass', pat: 'r.r.o.r.r.r.o.f.', lo: 33, v: 0.85, bright: 0.65 },
      { inst: 'pad', lo: 57, v: 0.55 },
      { inst: 'pluck', pat: 'rtfRftrtfRftrtfR', lo: 58, from: 0, to: 8, v: 0.75 },
      { inst: 'pluck', pat: 'r.fRf.r.fRf.r.fR', lo: 58, from: 8, to: 16, v: 0.45 },
      { inst: 'lead', mel: MEL_RUN, from: 8, to: 16, v: 0.95 },
    ],
  },
  // tense: A minor with a harmonic-minor E, heavy syncopated kick, 16th saw bass, riff then stabs
  boss: {
    bpm: 128, swing: 0, bars: 8, gain: 0.78, delayBeats: 0.5,
    chords: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'G', 'E'],
    parts: [
      { inst: 'kickH', pat: 'x..x..x.x.....x.', fills: { 7: 'x..x..x.x.x.x...' }, v: 1 },
      { inst: 'snareF', pat: '....x.......x...', fills: { 7: '....x.......xxxx' }, v: 0.9 },
      { inst: 'hat', pat: 'x.o.x.o.x.o.x.oo', v: 0.75 },
      { inst: 'tom', pat: '........x.x.x...', only: [7], v: 0.8 },
      { inst: 'crash', pat: 'x...............', only: [0, 4], v: 0.75 },
      { inst: 'bass', pat: 'rrrorrrorrrorror', lo: 33, v: 0.7, bright: 0.5 },
      { inst: 'pad', lo: 52, v: 0.6 },
      { inst: 'leadSaw', mel: MEL_BOSS, from: 0, to: 4, v: 0.85 },
      { inst: 'stab', pat: 'x..x..x...x..x..', lo: 57, from: 4, to: 8, v: 0.9 },
    ],
  },
};
