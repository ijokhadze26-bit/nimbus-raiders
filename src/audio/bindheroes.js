// Hero sound bindings (SPEC2 §3.8). FOUNDATION STUB (owned by the HEROES builder): plays def.sfx.ability on
// ability:use, .ready on ability:ready, .guard on hero:guard and .select on loadout:change / run start.
// Returns its unsubscribe functions.
import { heroDef } from '../data/heroes.js';

export function bindHeroes(audio, game) {
  const ev = game.events, offs = [];
  const play = (hero, key) => { const n = heroDef(hero).sfx[key]; if (n) audio.fx(n, null); };
  offs.push(ev.on('ability:use', (p) => play(p.hero, 'ability')));
  offs.push(ev.on('ability:ready', (p) => play(p.hero, 'ready')));
  offs.push(ev.on('hero:guard', () => play(game.heroes.id, 'guard')));
  offs.push(ev.on('loadout:change', (p) => { if (game.state !== 'playing') play(p.hero, 'select'); }));
  offs.push(ev.on('run:start', (p) => play(p.hero || game.heroes.id, 'select')));
  return offs;
}
