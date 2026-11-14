// Bootstrap: fonts, styles, engine, game, save, audio, fx, UI, loop. Exposes window.__game.
import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import './ui/styles.css';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { Game } from './game/game.js';
import { Save } from './save/save.js';
import { installProgress } from './save/progress.js';
import { UI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';
import { installFx } from './fx/fx.js';

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
  // Install order: save -> progress -> audio (game.audio) -> fx (game.fx) -> ui (screens + HUD).
  game.save = new Save(game.events);
  installProgress(game);
  createAudio().install(game); // unlocks on first gesture; reads mute state from game.save
  installFx(game); // sets game.fx (updated from game.sync)
  const ui = new UI(game, document.getElementById('ui'), params);
  game.ui = ui;
  game.hud = ui.hud;

  // Canvas labels need the display font; wait briefly (never block boot on it).
  try {
    await Promise.race([document.fonts.load("100px 'Lilita One'"), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* ignore */ }

  const loop = new Loop((dt, real) => {
    game.loopFps = loop.fps;
    game.frame(dt, real);
    ui.update(dt);
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
