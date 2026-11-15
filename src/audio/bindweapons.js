// Weapon sound bindings (SPEC2 §2, §6.9 audio; WEAPONS builder). bindings.js already plays def.sfx.fire on
// weapon:fire; this adds
//   - specials (weapon:special): ignite, freeze, shatter, candy landings (pitch rises per bounce), caramel goo,
//     prism splits, gear tings, chain arcs (pitch per jump), black holes and their implosion;
//   - Glacier's hit tick (bullet:hit) and the Gearworks turret drop (turret:drop);
//   - the Emberstorm roar loop: starts with firing (filter centre +8% per Mk), stops when firing stops, on
//     game:pause, weapon:swap, run end and title; restarts on game:resume if the weapon is still firing.
// Returns its unsubscribe functions.
import { weaponDef } from '../data/weapons.js';

const LOOP = 'wpn_ember_loop';
const IDLE = 0.3; // s of game time without an Ember volley -> the roar stops

export function bindWeapons(audio, game) {
  const ev = game.events, offs = [];
  const on = (name, fn) => offs.push(ev.on(name, (p) => fn(p || {})));
  const fx = (name, opts) => { if (name) audio.fx(name, opts); };
  const eng = () => audio.sfxEngine;
  const opts = { n: 0, mk: 1 };
  let loopOn = false, loopMk = 0, lastEmber = -10, paused = false;

  const startLoop = (mk) => {
    const e = eng();
    if (!e || !audio.sfxOn || !audio.ready || paused) return;
    if (loopOn && loopMk === mk) return;
    if (e.startLoop(LOOP, { mk })) { loopOn = true; loopMk = mk; }
  };
  const stopLoop = () => {
    const e = eng();
    if (loopOn && e) e.stopLoop(LOOP, 0.2);
    loopOn = false; loopMk = 0;
  };

  on('weapon:fire', (p) => {
    if (p.weapon !== 'emberstorm') { if (loopOn) stopLoop(); return; }
    lastEmber = game.time;
    startLoop(p.mk | 0 || 1);
  });
  // heartbeat (10/s while a run is live): stop the roar once Ember stops firing
  on('run:progress', () => { if (loopOn && (game.time - lastEmber > IDLE || game.weapons.id !== 'emberstorm' || !game.weapons.enabled)) stopLoop(); });
  on('game:pause', () => { paused = true; stopLoop(); });
  on('game:resume', () => {
    paused = false;
    const w = game.weapons, run = game.run;
    if (w.id === 'emberstorm' && w.enabled && run && run.active && game.time - lastEmber <= IDLE + 0.2) startLoop(w.mk);
  });
  on('weapon:swap', () => stopLoop());
  on('run:win', () => stopLoop());
  on('run:lose', () => stopLoop());
  on('run:start', () => { paused = false; stopLoop(); });
  on('boss:defeated', () => stopLoop());
  on('game:state', (p) => { if (p.state !== 'playing' && p.state !== 'paused') stopLoop(); });

  on('weapon:special', (p) => {
    const sfx = weaponDef(p.weapon).sfx || {};
    opts.n = p.n | 0; opts.mk = game.weapons.mk;
    switch (p.kind) {
      case 'ignite': fx(sfx.ignite, opts); break;
      case 'freeze': fx(sfx.freeze, opts); break;
      case 'shatter': fx(sfx.shatter, opts); break;
      case 'land': fx(sfx.land, opts); break;
      case 'puddle': fx(sfx.puddle, opts); break;
      case 'split': fx(sfx.split, opts); break;
      case 'bounce': fx(sfx.bounce, opts); break;
      case 'chain': fx(sfx.chain, opts); break;
      case 'hole': fx(sfx.hole, opts); break;
      case 'hole:end': fx(sfx.pop, opts); break;
      default: break;
    }
  });
  on('bullet:hit', (p) => { if (p.kind === 'enemy' && p.weapon === 'glacier') fx(weaponDef('glacier').sfx.hit); });
  on('turret:drop', (p) => { if (p.kind === 'gearturret') fx(weaponDef('gearworks').sfx.turret); });

  offs.push(() => stopLoop());
  return offs;
}
