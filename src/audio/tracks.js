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
  7: [[0, 74, 4], [4, 77, 4], [8, 71, 6], [14, 74, 2]], // D F B D over G7, resolves into Cmaj7
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

// ---------------- update 3: world run tracks ----------------
const MEL_FORGE = {
  0: [[0, 64, 2], [2, 67, 2], [4, 71, 4], [8, 69, 2], [10, 67, 2], [12, 66, 2], [14, 67, 2]],
  1: [[0, 72, 6], [6, 71, 2], [8, 67, 4], [12, 64, 4]],
  2: [[0, 69, 2], [2, 72, 2], [4, 76, 4], [8, 74, 2], [10, 72, 2], [12, 71, 4]],
  3: [[0, 71, 4], [4, 75, 4], [8, 78, 6], [14, 75, 2]],
  4: [[0, 76, 2], [2, 74, 2], [4, 71, 4], [8, 72, 2], [10, 71, 2], [12, 69, 2], [14, 67, 2]],
  5: [[0, 67, 4], [4, 72, 4], [8, 76, 6], [14, 74, 2]],
  6: [[0, 72, 3], [3, 71, 3], [6, 69, 2], [8, 72, 4], [12, 76, 4]],
  7: [[0, 75, 4], [4, 71, 4], [8, 63, 2], [10, 66, 2], [12, 71, 4]],
};

const MEL_FROST = {
  0: [[0, 81, 4], [4, 84, 4], [8, 88, 6]],
  1: [[0, 84, 4], [4, 81, 2], [6, 77, 6], [12, 79, 4]],
  2: [[0, 79, 4], [4, 83, 4], [8, 84, 8]],
  3: [[0, 83, 4], [4, 79, 4], [8, 76, 8]],
  4: [[0, 76, 2], [2, 81, 2], [4, 84, 4], [8, 86, 4], [12, 84, 4]],
  5: [[0, 81, 6], [6, 77, 2], [8, 79, 4], [12, 77, 4]],
  6: [[0, 76, 4], [4, 79, 4], [8, 84, 4], [12, 83, 4]],
  7: [[0, 83, 8], [8, 81, 8]],
};

const MEL_CANDY = {
  0: [[0, 76, 1], [2, 79, 1], [4, 84, 2], [6, 79, 1], [8, 76, 2], [10, 79, 2], [12, 72, 4]],
  1: [[0, 81, 2], [2, 79, 1], [3, 76, 1], [4, 72, 2], [8, 76, 1], [10, 81, 2], [12, 84, 4]],
  2: [[0, 77, 1], [2, 81, 1], [4, 84, 2], [6, 81, 1], [8, 77, 2], [10, 81, 2], [12, 79, 4]],
  3: [[0, 79, 2], [2, 83, 2], [4, 86, 4], [8, 83, 2], [10, 79, 2], [12, 74, 4]],
  4: [[0, 84, 1], [2, 83, 1], [4, 79, 2], [6, 76, 1], [8, 79, 2], [10, 84, 2], [12, 88, 4]],
  5: [[0, 84, 2], [2, 81, 2], [4, 76, 4], [8, 72, 2], [10, 76, 2], [12, 81, 4]],
  6: [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 89, 4], [12, 88, 2], [14, 86, 2]],
  7: [[0, 86, 2], [2, 83, 2], [4, 79, 2], [6, 74, 2], [8, 79, 4], [12, 72, 4]],
};

const MEL_CITADEL = {
  0: [[0, 74, 4], [4, 77, 2], [6, 81, 6], [12, 79, 2], [14, 77, 2]],
  1: [[0, 82, 6], [6, 81, 2], [8, 77, 4], [12, 74, 4]],
  2: [[0, 79, 4], [4, 76, 2], [6, 72, 2], [8, 76, 4], [12, 79, 4]],
  3: [[0, 81, 8], [8, 73, 4], [12, 76, 4]],
  4: [[0, 86, 4], [4, 84, 2], [6, 81, 6], [12, 77, 2], [14, 81, 2]],
  5: [[0, 82, 4], [4, 86, 4], [8, 89, 6], [14, 86, 2]],
  6: [[0, 86, 3], [3, 82, 3], [6, 79, 2], [8, 82, 4], [12, 74, 4]],
  7: [[0, 76, 4], [4, 73, 4], [8, 69, 8]],
};

Object.assign(TRACKS, {
  // Volcanic Forge: heavy and stompy. E minor, syncopated heavy kick, low gritty bass, power stabs, saw lead
  forge: {
    bpm: 112, swing: 0, bars: 16, gain: 0.82, delayBeats: 0.5,
    chords: ['Em', 'C', 'Am', 'B'],
    parts: [
      { inst: 'kickH', pat: 'x..x..x.x..x..x.', fills: { 7: 'x..x..x.x.x.x.x.', 15: 'x..x..x.x.xxxxxx' }, v: 1 },
      { inst: 'snareF', pat: '....x.......x...', fills: { 15: '....x.......xxxx' }, v: 0.9 },
      { inst: 'hat', pat: 'x.x.x.x.x.x.x.x.', v: 0.45 },
      { inst: 'tom', pat: 'x.x.x.x.x.x.x.x.', only: [7, 15], v: 0.7 },
      { inst: 'crash', pat: 'x...............', only: [0, 8], v: 0.8 },
      { inst: 'bass', pat: 'r-.rr-.rr-.ro-f-', lo: 28, v: 0.95, bright: 0.35 },
      { inst: 'stab', pat: 'x.......x..x....', lo: 52, from: 0, to: 8, v: 0.55 },
      { inst: 'pad', lo: 52, v: 0.4 },
      { inst: 'leadSaw', mel: MEL_FORGE, from: 8, to: 16, v: 0.78 },
    ],
  },
  // Frozen Peaks: airy and slower. A minor sevenths, soft half-time beat, bell arpeggios + a high bell tune
  frost: {
    bpm: 92, swing: 0.08, bars: 16, gain: 0.95, delayBeats: 0.75,
    chords: ['Am7', 'Fmaj7', 'Cmaj7', 'Em7'],
    parts: [
      { inst: 'kick', pat: 'x.........x.....', v: 0.55 },
      { inst: 'rim', pat: '........x.......', v: 0.6 },
      { inst: 'shaker', pat: 'o.o.o.o.o.o.o.o.', v: 0.45 },
      { inst: 'hat', pat: '..............x.', v: 0.3, open: true },
      { inst: 'riser', pat: 'x...............', only: [15], v: 0.4 },
      { inst: 'bass', pat: 'r-------f---r---', lo: 33, v: 0.7, bright: 0.25 },
      { inst: 'pad', lo: 57, v: 0.8 },
      { inst: 'mallet', pat: 'r..f..o..t..F...', lo: 69, v: 0.42 },
      { inst: 'pluck', pat: 'r...f...o...f...', lo: 57, from: 0, to: 8, v: 0.35 },
      { inst: 'mallet', mel: MEL_FROST, from: 8, to: 16, v: 0.8 },
    ],
  },
  // Candy Kingdom: bouncy and playful. C major, swung, skipping bass, mallet tune then a square-lead answer
  candy: {
    bpm: 134, swing: 0.14, bars: 16, gain: 0.88, delayBeats: 0.75,
    chords: ['C', 'Am', 'F', 'G'],
    parts: [
      { inst: 'kick', pat: 'x.....x.x...x...', v: 0.85 },
      { inst: 'clap', pat: '....x.......x...', v: 0.8 },
      { inst: 'shaker', pat: 'o.x.o.x.o.x.o.x.', v: 0.6 },
      { inst: 'hat', pat: '..x...x...x...x.', v: 0.35, open: true },
      { inst: 'crash', pat: 'x...............', only: [0, 8], v: 0.7 },
      { inst: 'riser', pat: 'x...............', only: [15], v: 0.5 },
      { inst: 'bass', pat: 'r..ro..rf..ro.t.', lo: 36, v: 0.8, bright: 0.7 },
      { inst: 'pad', lo: 60, v: 0.45 },
      { inst: 'pluck', pat: 'r.t.f.t.R.f.t.f.', lo: 60, from: 0, to: 8, v: 0.55 },
      { inst: 'mallet', mel: MEL_CANDY, from: 0, to: 8, v: 0.85 },
      { inst: 'lead', mel: MEL_CANDY, from: 8, to: 16, v: 0.8 },
    ],
  },
  // Storm Citadel: epic and driving. D minor with a harmonic-minor A, 16th bass, stabs, brass hero theme
  citadel: {
    bpm: 140, swing: 0, bars: 16, gain: 0.8, delayBeats: 0.5,
    chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'],
    parts: [
      { inst: 'kickH', pat: 'x...x...x...x.x.', fills: { 7: 'x...x...x.x.x.xx', 15: 'x.x.x.x.xxxxxxxx' }, v: 1 },
      { inst: 'snareF', pat: '....x.......x...', fills: { 15: '....x...x.x.xxxx' }, v: 0.9 },
      { inst: 'hat', pat: 'xoxoxoxoxoxoxoxo', v: 0.55 },
      { inst: 'tom', pat: '..........x.x.x.', only: [7, 15], v: 0.8 },
      { inst: 'crash', pat: 'x...............', only: [0, 8], v: 0.8 },
      { inst: 'riser', pat: 'x...............', only: [7, 15], v: 0.7 },
      { inst: 'bass', pat: 'rrrorrrorrrorrfo', lo: 26, v: 0.75, bright: 0.55 },
      { inst: 'pad', lo: 50, v: 0.55 },
      { inst: 'stab', pat: 'x..x..x...x..x..', lo: 50, from: 0, to: 8, v: 0.6 },
      { inst: 'pluck', pat: 'rfRfrfRfrfRfrfRf', lo: 62, from: 8, to: 16, v: 0.35 },
      { inst: 'brass', mel: MEL_CITADEL, from: 8, to: 16, v: 0.9 },
    ],
  },
});

/** Run track of a world key ('sky' -> 'run'). */
export function runTrackFor(world) { return world && world !== 'sky' && TRACKS[world] ? world : 'run'; }
