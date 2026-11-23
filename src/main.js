// Bootstrap: fonts, styles, engine, game, save, audio, fx, UI, loop. Exposes window.__game.
import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import './ui/styles.css';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { PerfProbe } from './core/perf.js';
import { Game } from './game/game.js';
import { Save } from './save/save.js';
import { installProgress } from './save/progress.js';
import { installAchievements } from './game/achievements.js';
import { UI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';
import { installFx } from './fx/fx.js';
import { warmShaders } from './game/warmup.js';
import { installMobile } from './core/mobile.js';

function readParams() {
  const q = new URLSearchParams(location.search);
  const num = (k) => (q.has(k) ? Number(q.get(k)) : null);
  return {
    test: q.get('test') === '1',
    level: num('level'),
    autopilot: q.get('autopilot') === '1',
    quality: ['high', 'low', 'auto'].includes(q.get('quality')) ? q.get('quality') : null,
    // update 5 (online): a friend's share link (?room=ABCD, &watch=1) and the local test networks
    room: /^[A-HJ-NP-Z]{4}$/i.test(q.get('room') || '') ? q.get('room').toUpperCase() : null,
    watch: q.get('watch') === '1',
    net: ['local', 'bridge', 'off'].includes(q.get('net')) ? q.get('net') : null, // two tabs of one browser / the test harness / tests: no service
    pid: /^[A-Za-z0-9_-]{1,24}$/.test(q.get('pid') || '') ? q.get('pid') : null, // this tab's own player id on a local network
    nettest: /^[a-z0-9.,; ]{1,60}$/i.test(q.get('nettest') || '') ? q.get('nettest') : null, // slow-network shim: lat400,jit200,loss5
  };
}

async function boot() {
  const params = readParams();
  const app = document.getElementById('app');
  const engine = new Engine(app);
  const input = new Input(app);
  input.width = engine.width;
  engine.onResize.push((w) => { input.width = w; });
  const game = new Game({ engine, input, params });
  window.__game = game;
  // Install order: save -> progress -> audio (game.audio) -> fx (game.fx) -> ui (screens + HUD).
  game.save = new Save(game.events);
  game.loadout.syncFromSave(); // saved hero + weapon (update 2)
  installProgress(game);
  installAchievements(game); // update 3 stage 5: achievement tracking (game.achievements)
  createAudio().install(game); // unlocks on first gesture; reads mute state from game.save
  installFx(game); // sets game.fx (updated from game.sync)
  const ui = new UI(game, document.getElementById('ui'), params);
  game.ui = ui;
  game.hud = ui.hud;
  warmShaders(game); // compile every material up front (no mid-run shader stalls)

  // Canvas labels need the display font; wait briefly (never block boot on it).
  try {
    await Promise.race([document.fonts.load("100px 'Lilita One'"), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* ignore */ }

  const perf = (game.perf = new PerfProbe(engine));
  const loop = new Loop((dt, real) => {
    game.loopFps = loop.fps;
    game.frame(dt, real);
    if (perf.on) {
      const t = performance.now();
      ui.update(dt);
      perf.cur.ui = performance.now() - t;
      perf.record(real * 1000);
    } else ui.update(dt);
  });
  game.loop = loop;

  if (params.autopilot) game.debug.setAutopilot(true);
  const run = !!(params.level && game.startLevel(params.level));
  if (!run) game.toTitle();
  if (!run && params.room) {
    // a friend's link: straight to that room's lobby. The room leaves the address so a reload does not join it again.
    ui.openOnline({ room: params.room, watch: params.watch });
    try {
      const q = new URLSearchParams(location.search);
      q.delete('room'); q.delete('watch');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
    } catch { /* a sandboxed page without history access: the link simply stays */ }
  }

  installMobile(game, engine); // viewport, gesture guards, pause on hide, WebGL context loss
  loop.start();
  console.info('[nimbus] boot ok');
}

boot().catch((e) => console.error('[nimbus] boot failed', e));
