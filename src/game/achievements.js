// Achievement tracking (update 3 stage 5, STAGE5.md C): event-driven. Counters live in save.achievements.counts
// (key -> number; 'max' keys keep the best value). During a run new counts collect in memory (`pending`, no save
// writes per kill) and are written once when the run ends (or the game pauses / quits); goals are checked every
// 0.5 s while playing (saved + pending + the live run), after every run and after menu saves (hero bought, daily
// gift). A finished goal goes into achievements.done and emits 'achievement:done' { id, def } (the HUD toast);
// CLAIM pays def.reward once (achievements.claimed). Old saves: stars / wins / kills / owned heroes, weapons and
// endless bests count from the save; per-event counters start from now. Practice and boss-test runs never count.
import { ACHIEVEMENTS, ACH_BY_ID } from '../data/achievements.js';
import { WORLDS } from '../data/worlds.js';
import { MENU_STATE_LIST } from './states.js';
import { endlessBestOf } from '../save/modes.js';
import { unlockedHeroes, unlockedWeapons } from '../save/unlocks.js';
import { dailyDone } from './modes/daily.js';

const SKIP_MODES = new Set(['practice', 'test']);
const MAX_KEYS = new Set(['maxSquad', 'combo', 'mk5', 'endless', 'bossrush', 'rushBosses']); // kills come from run.kills (enemy:die is rate-limited)
const CHECK_EVERY = 0.5;

/** Features some goals need (stage 4 systems, stage 5 modes): a goal whose feature is missing stays hidden. */
const NEEDS = {
  combo: (g) => !!g.combo, dodge: (g) => !!g.dodge, cages: (g) => !!g.cages, props: (g) => !!g.props,
  modes: () => MENU_STATE_LIST.includes('modes'),
};

const ckey = (metric) => metric.replace(':', '-');
/** Metrics read from the save only: they cannot change during a run, so the in-run check skips them. */
const SAVE_ONLY = new Set(['beat', 'world3', 'threes', 'wins', 'elite', 'heroes', 'weapons', 'endlessWorlds', 'streak', 'bossrush', 'dailyClears']);
/** Parsed metric per goal { name, arg, key } (no string work in the 0.5 s check). */
const PARSED = new Map(ACHIEVEMENTS.map((def) => { const [name, arg] = def.metric.split(':'); return [def.id, { name, arg, key: ckey(def.metric), live: !SAVE_ONLY.has(name) }]; }));

/** Longest run of consecutive dates among 'YYYY-MM-DD' keys. */
export function longestDayRun(keys) {
  const days = [...new Set(keys)].map((k) => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }).sort((x, y) => x - y);
  let best = 0, cur = 0;
  for (let i = 0; i < days.length; i++) { cur = i && days[i] === days[i - 1] + 1 ? cur + 1 : 1; if (cur > best) best = cur; }
  return best;
}

export class Achievements {
  constructor(game) {
    this.game = game;
    this.save = game.save;
    this.pending = {};
    this.t = 0;
    this.writing = false;
    this.queued = false;
    const ev = game.events;
    const live = () => this.live();
    ev.on('run:start', () => {
      this.pending = {}; this.t = game.time || 0;
      const M = game.modes; // a Daily win counts once per date (replays of the same day do not)
      this.dailyFresh = !!(M && M.kind === 'daily' && M.plan && !dailyDone(this.save.data, M.plan.date));
    });
    ev.on('squad:change', (p) => { if (live()) this.max('maxSquad', p.count || 0); });
    ev.on('weapon:tier', (p) => { if (live() && p.mk >= 5) this.max('mk5', 1); });
    ev.on('boss:defeated', () => { if (live()) this.add('bosses'); });
    ev.on('gate:pass', () => { if (live()) this.add('gates'); });
    ev.on('gate:reveal', () => { if (live()) this.add('reveals'); });
    ev.on('barrel:break', () => { if (live()) this.add('barrels'); });
    ev.on('pickup:collect', () => { if (live()) this.add('pickups'); });
    ev.on('cage:join', (p) => { if (live()) this.add('rescued', p.count || 1); });
    ev.on('prop:trigger', (p) => { if (live() && p.kind) this.add('prop-' + p.kind); });
    ev.on('dodge:skip', () => { if (live()) this.add('dodges'); });
    ev.on('combo:tier', (p) => { if (live()) this.max('combo', p.count || 0); });
    ev.on('run:progress', () => this.tick());
    ev.on('run:win', (p) => this.onEnd(p, true));
    ev.on('run:lose', (p) => this.onEnd(p, false));
    ev.on('game:pause', () => this.commit());
    ev.on('save:changed', () => { if (!this.writing && !this.live()) this.soon(); });
    this.check(true); // goals an old save already meets are done (claimable) without a toast
  }

  /** The current run counts toward goals. */
  live() {
    const run = this.game.run;
    return run && run.active && !SKIP_MODES.has(run.mode) ? run : null;
  }

  add(k, n = 1) { this.pending[k] = (this.pending[k] || 0) + n; }
  max(k, v) { if (v > (this.pending[k] || 0)) this.pending[k] = v; }

  /** Saved counter + this run's pending part. */
  count(k) {
    const s = this.save.data.achievements.counts?.[k] || 0, p = this.pending[k] || 0;
    return MAX_KEYS.has(k) ? Math.max(s, p) : s + p;
  }

  /** Writes the pending counters into the save (one update). */
  commit() {
    const keys = Object.keys(this.pending);
    if (!keys.length) return;
    const pend = this.pending;
    this.pending = {};
    this.write((d) => {
      const c = d.achievements.counts || (d.achievements.counts = {});
      for (const k of keys) c[k] = MAX_KEYS.has(k) ? Math.max(c[k] || 0, pend[k]) : Math.min(1e12, (c[k] || 0) + pend[k]);
    });
  }

  write(fn) { this.writing = true; try { this.save.update(fn); } finally { this.writing = false; } }

  onEnd(p, win) {
    const run = this.game.run;
    if (!run || SKIP_MODES.has(p.mode)) return;
    const m = String(p.mode || '');
    if (win && m === 'level' && run.hero) this.add('heroWin-' + run.hero);
    if (win && m.includes('chaos')) this.add('chaosWins');
    if (win && m.includes('daily') && this.dailyFresh) { this.add('dailyClears'); this.dailyFresh = false; }
    if (win && m.includes('boss') && m.includes('rush')) this.max('bossrush', 1);
    if (m === 'bossrush') this.max('rushBosses', this.rushBeaten());
    this.max('combo', run.stats.maxCombo || 0); // the best combo of the run (combo:tier only fires at tier steps)
    if (m === 'endless' || m.includes('endless')) this.max('endless', p.dist || 0);
    this.max('maxSquad', p.squad || 0);
    this.commit();
    this.soon(); // progress.js pays stars / kills in its own run:win handler: check after all handlers ran
  }

  /** Bosses beaten in the live Boss Rush (game/modes; 0 when not in one). */
  rushBeaten() { const M = this.game.modes; return (M && M.kind === 'bossrush' && M.rush && M.rush.beaten) || 0; }

  soon() {
    if (this.queued) return;
    this.queued = true;
    Promise.resolve().then(() => { this.queued = false; this.check(); });
  }

  tick() {
    const g = this.game;
    if (!this.live() || g.time - this.t < CHECK_EVERY) return;
    this.t = g.time;
    this.check(false, true);
  }

  available(def) { return !def.needs || !!NEEDS[def.needs]?.(this.game); }
  list() { return ACHIEVEMENTS.filter((d) => this.available(d)); }

  /** Current value of a goal's metric. */
  value(def) {
    const d = this.save.data, { name, arg, key } = PARSED.get(def.id);
    const run = this.live();
    switch (name) {
      case 'beat': return d.stars[arg] > 0 ? 1 : 0;
      case 'world3': { const w = WORLDS[arg - 1]; let n = 0; for (let i = w.first; i <= w.last; i++) if (d.stars[i] >= 3) n++; return n; }
      case 'threes': return Object.values(d.stars).filter((s) => s >= 3).length;
      case 'wins': return d.stats.wins;
      case 'elite': return Object.keys(d.elite).length;
      case 'kills': return d.stats.kills + (run ? run.kills || 0 : 0);
      case 'maxSquad': return Math.max(this.count('maxSquad'), run ? this.game.squad.count : 0);
      // bought OR opened by reaching their level (unlocked items can't be bought, save/unlocks.js canBuy)
      case 'heroes': return unlockedHeroes(d).length;
      case 'weapons': return unlockedWeapons(d).length;
      case 'combo': return Math.max(this.count('combo'), run ? Math.max(run.stats.maxCombo || 0, this.game.combo ? this.game.combo.n || 0 : 0) : 0);
      case 'rushBosses': return Math.max(this.count('rushBosses'), d.modes.bossRushBest > 0 ? 10 : 0, run ? this.rushBeaten() : 0);
      case 'endlessWorlds': { let n = 0; for (const w of WORLDS) if (endlessBestOf(d, w.id) >= +arg) n++; return n; }
      case 'endless': {
        let best = Math.max(d.endlessBest, this.count('endless'), run && String(run.mode).includes('endless') ? run.dist || 0 : 0);
        for (const k in d.modes.endlessBest) if (d.modes.endlessBest[k] > best) best = d.modes.endlessBest[k];
        return best;
      }
      case 'streak': return Math.max(d.daily.streak, longestDayRun(Object.keys(d.modes.dailyBest)));
      case 'bossrush': return d.modes.bossRushBest > 0 ? 1 : this.count('bossrush');
      case 'dailyClears': return Math.max(this.count('dailyClears'), Object.keys(d.modes.dailyBest).length);
      default: return this.count(key);
    }
  }

  /** { def, value, done, claimed } for every visible goal (UI). */
  status() {
    const a = this.save.data.achievements;
    return this.list().map((def) => {
      const done = a.done.includes(def.id);
      return { def, value: done ? def.goal : Math.min(def.goal, Math.floor(this.value(def))), done, claimed: a.claimed.includes(def.id) };
    });
  }

  unclaimed() {
    const a = this.save.data.achievements;
    return a.done.filter((id) => ACH_BY_ID[id] && !a.claimed.includes(id) && this.available(ACH_BY_ID[id])).length;
  }

  /**
   * Marks newly finished goals done; returns their ids. silent: no toast event (boot). liveOnly (the in-run check
   * every 0.5 s): only goals the live run can move - the save-only ones are checked when the run ends.
   */
  check(silent = false, liveOnly = false) {
    const a = this.save.data.achievements;
    let fresh = null;
    for (const def of ACHIEVEMENTS) {
      if ((liveOnly && !PARSED.get(def.id).live) || a.done.includes(def.id) || !this.available(def)) continue;
      if (this.value(def) >= def.goal) (fresh ||= []).push(def.id);
    }
    if (!fresh) return [];
    this.write((d) => { for (const id of fresh) if (!d.achievements.done.includes(id)) d.achievements.done.push(id); });
    if (!silent) for (const id of fresh) this.game.events.emit('achievement:done', { id, def: ACH_BY_ID[id] });
    return fresh;
  }

  /** Pays a finished goal's reward once; returns the coins (0 when not claimable). */
  claim(id) {
    const def = ACH_BY_ID[id], a = this.save.data.achievements;
    if (!def || !a.done.includes(id) || a.claimed.includes(id)) return 0;
    this.write((d) => { d.coins = Math.min(1e9, d.coins + def.reward); d.achievements.claimed.push(id); });
    this.game.events.emit('achievement:claim', { id, coins: def.reward });
    return def.reward;
  }
}

export function installAchievements(game) {
  game.achievements = new Achievements(game);
  return game.achievements;
}
