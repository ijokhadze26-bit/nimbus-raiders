// Bootstrap: fonts, styles, engine, game, HUD, loop. Exposes window.__game.
import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import './ui/styles.css';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { createAudio } from './audio/audio.js';

function readParams() {
  const q = new URLSearchParams(location.search);
  const num = (k) => (q.has(k) ? Number(q.get(k)) : null);
  return {
    test: q.get('test') === '1',
    level: num('level'),
    autopilot: q.get('autopilot') === '1',
    quality: ['high', 'low', 'auto'].includes(q.get('quality')) ? q.get('quality') : null,
  };
}

async function boot() {
  const params = readParams();
  const app = document.getElementById('app');
  const engine = new Engine(app);
  const input = new Input(app);
  const game = new Game({ engine, input, params });
  window.__game = game;
  const hud = new Hud(game, document.getElementById('ui'));
  game.hud = hud;
  createAudio().install(game); // audio: unlocks on first gesture, sets game.audio

  // Canvas labels need the display font; wait briefly (never block boot on it).
  try {
    await Promise.race([document.fonts.load("100px 'Lilita One'"), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* ignore */ }

  const loop = new Loop((dt, real) => {
    game.loopFps = loop.fps;
    game.frame(dt, real);
    hud.update();
  });
  game.loop = loop;

  if (params.autopilot) game.debug.setAutopilot(true);
  if (params.level) game.startLevel(params.level);
  else game.toTitle();

  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
  loop.start();
  console.info('[nimbus] boot ok');
}

boot().catch((e) => console.error('[nimbus] boot failed', e));
