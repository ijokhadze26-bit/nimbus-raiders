// Event bus -> sound. Maps every gameplay/UI event (SPEC §4) to sfx, and game state /
// run phase to music tracks (crossfades, pause duck, win/lose stingers).

const POP_PITCH = { grunt: 1, runner: 1.28, tank: 0.68, shield: 0.88, bomber: 1.1 };
const BOSS_ATTACK = { slam: 'slam', roll: 'rumble', orb: 'orb', orbs: 'orb', volley: 'orb', summon: 'summon', puddle: 'summon', charge: 'charge', lightning: 'lightning', strike: 'lightning' };

export function bindAudio(audio, game) {
  const ev = game.events;
  const offs = [];
  const on = (name, fn) => offs.push(ev.on(name, (p) => fn(p || EMPTY)));
  const fx = (name, opts) => audio.fx(name, opts);
  const now = () => (audio.ctx ? audio.ctx.currentTime : 0);
  const dip = (a, h) => { if (audio.music && audio.musicOn) audio.music.dip(a, h); };

  // ---------------- music ----------------
  let holdUntil = 0;       // context time until which a stinger owns the stage
  let runStartedAt = -10;

  function wantedTrack() {
    const s = game.state;
    if (s === 'boot') return null;
    if (s === 'playing' || s === 'paused') {
      const ph = game.run && game.run.phase;
      if (ph === 'boss') return game.boss && game.boss.alive === false ? null : 'boss';
      if (ph === 'won' || ph === 'lost') return null;
      return 'run';
    }
    return 'title';
  }

  function updateMusic(fade = 1.0) {
    const m = audio.music;
    if (!m) return;
    const want = wantedTrack();
    if (!want) { m.stop(0.6); return; }
    const wait = Math.max(0, holdUntil - now());
    m.play(want, { fade, delay: wait > 0 && want === 'title' ? wait : 0 });
  }
  audio.onReady = () => updateMusic(0.3);

  on('game:state', (p) => {
    const m = audio.music;
    if (m) m.duck(p.state === 'paused');
    if (p.state === 'title' && audio.sfxEngine) audio.sfxEngine.stopAllLoops();
    if (p.state !== 'paused') updateMusic(p.state === 'playing' ? 0.8 : 1.2);
  });
  on('run:start', () => {
    if (audio.sfxEngine) audio.sfxEngine.stopAllLoops();
    lastTier = game.weapons ? game.weapons.tier : 1;
    holdUntil = 0;
    const m = audio.music;
    if (!m) return;
    const cur = m.current;
    // retry from a run: restart the run track from the top (unless game:state just started it)
    if (!(cur && cur.name === 'run' && now() - cur.t0 < 0.5)) m.play('run', { restart: true, fade: 0.6 });
    runStartedAt = now();
  });
  on('run:phase', (p) => {
    if (p.phase === 'boss') updateMusic(0.9);
    else if (p.phase === 'run' && now() - runStartedAt > 0.5) updateMusic(0.8);
  });
  on('game:pause', () => { if (audio.music) audio.music.duck(true); });
  on('game:resume', () => { if (audio.music) audio.music.duck(false); });
  on('run:win', () => {
    if (audio.music) audio.music.stop(0.5);
    if (audio.sfxEngine) audio.sfxEngine.stopAllLoops();
    const end = audio.fx('win', null);
    holdUntil = (typeof end === 'number' ? end : now() + 2.2) + 0.4;
  });
  on('run:lose', (p) => {
    if (p && p.quit) return; // endless run abandoned from the pause menu: no lose stinger
    if (audio.music) audio.music.stop(0.4);
    if (audio.sfxEngine) audio.sfxEngine.stopAllLoops();
    const end = audio.fx('lose', null);
    holdUntil = (typeof end === 'number' ? end : now() + 2.2) + 0.4;
  });

  // ---------------- weapons / combat ----------------
  let lastTier = 1;
  on('weapon:fire', (p) => fx('fire' + Math.max(1, Math.min(6, p.tier | 0 || 1))));
  on('weapon:tier', (p) => {
    if ((p.tier | 0) > lastTier) { fx('tierUp', { tier: p.tier }); dip(0.3, 0.4); }
    lastTier = p.tier | 0;
  });
  on('bullet:hit', (p) => {
    if (p.kind === 'boss') fx('bossHit');
    else if (p.kind === 'shield') fx('shieldHit');
  });
  on('enemy:die', (p) => fx('pop', { pitch: POP_PITCH[p.type] || 1 }));
  on('enemy:explode', () => { fx('explode'); dip(0.25, 0.15); });
  on('enemy:shieldbreak', () => fx('shieldBreak'));
  on('horde:incoming', (p) => { if ((p.count || 0) >= 12) fx('horde'); });

  // ---------------- gates / barrels ----------------
  on('gate:hit', (p) => fx('gateTick', { op: p.op, value: p.value }));
  on('gate:pass', (p) => {
    const b = p.before | 0, a = p.after | 0;
    if (a > b) { fx('gateGood', { big: a - b >= 10 && a >= b * 2 }); dip(0.25, 0.2); }
    else if (a < b) fx('gateBad');
    else fx('gateTick', { op: 'add', value: 0 });
  });
  on('barrel:hit', () => fx('clank'));
  on('barrel:break', (p) => { fx('barrelBreak', { kind: p.reward && p.reward.kind }); dip(0.2, 0.15); });

  // ---------------- squad ----------------
  on('squad:lost', (p) => { if (p.reason !== 'gap') fx('oof'); });
  on('squad:change', (p) => { if (p.reason === 'barrel' && p.delta > 0) fx('troops'); });
  on('obstacle:kill', (p) => { if (p.kind === 'blade') fx('slice'); else if (p.kind === 'gap') fx('fall'); });

  // ---------------- pickups / powers / helpers ----------------
  let lastCoin = -10, chain = 0;
  on('coin:collect', (p) => {
    const t = now();
    chain = t - lastCoin < 0.45 ? Math.min(8, chain + 1) : 0;
    lastCoin = t;
    if ((p.amount || 1) > 1) fx('coins', { amount: p.amount });
    else fx('coin', { chain });
  });
  on('pickup:collect', (p) => { if (p.kind !== 'coin') fx('powerUp'); });
  on('power:start', (p) => {
    if (p.kind === 'shield') { fx('shield'); if (audio.sfxOn && audio.ready) audio.sfxEngine.startLoop('shield'); }
    else if (p.kind === 'freeze') fx('freeze');
    else if (p.kind === 'rapid') fx('rapid');
    else if (p.kind === 'magnet') fx('magnet');
  });
  on('power:end', (p) => {
    if (audio.sfxEngine) audio.sfxEngine.stopLoop(p.kind);
    fx('powerDown');
  });
  on('helper:add', () => fx('helper'));

  // ---------------- boss ----------------
  on('boss:spawn', () => { fx('bossLand'); dip(0.45, 1.4); });
  on('boss:phase', () => { fx('roar', { len: 1.1, f0: 92 }); dip(0.35, 0.8); });
  on('boss:telegraph', (p) => { fx('warn', { duration: p.duration }); dip(0.3, 0.25); });
  on('boss:attack', (p) => { fx(BOSS_ATTACK[p.attack] || 'slam'); if (p.attack === 'slam') dip(0.3, 0.3); });
  on('boss:defeated', () => {
    if (audio.music) audio.music.stop(1.0);
    fx('bossDie');
    holdUntil = now() + 1.5;
  });

  // ---------------- UI ----------------
  on('ui:click', () => fx('click'));

  return offs;
}

const EMPTY = Object.freeze({});
