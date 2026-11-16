// Finish arch system (update 3): levels without a boss (def.finish) end under an arch at z = -length; crossing
// it wins the run (game.step) and here adds a sparkle burst from both caps + a short world-coloured flash on
// top of the usual win confetti. Two meshes (merged frame + banner), never shadow casters, rebuilt only when
// the world changes. Low quality: half the sparkles (fx bursts scale with quality), no flash.
import * as THREE from 'three';
import { FINISH_LOOK, ARCH, finishFrameGeometry, finishBannerTexture, finishBannerGeometry } from '../models/finish.js';
import { registerWarm } from './warmup.js';

registerWarm((game) => {
  const f = game.finish;
  if (!f) return null;
  f.build('sky');
  return [new THREE.Mesh(f.frame.geometry, f.frame.material), new THREE.Mesh(f.banner.geometry, f.banner.material)];
});

const hex = (c) => parseInt(c.slice(1), 16);

export class Finish {
  init(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.banner = new THREE.Mesh(finishBannerGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    for (const m of [this.frame, this.banner]) { m.castShadow = false; m.receiveShadow = false; this.group.add(m); }
    game.scene.add(this.group);
    this.key = null;
    this.active = false;
    game.events.on('run:win', () => this.onWin());
  }

  build(key) {
    if (key === this.key) return;
    this.key = key;
    const look = FINISH_LOOK[key] || FINISH_LOOK.sky;
    this.frame.geometry.dispose();
    this.frame.geometry = finishFrameGeometry(look);
    if (this.banner.material.map) this.banner.material.map.dispose();
    this.banner.material.map = finishBannerTexture(look);
    this.banner.material.needsUpdate = true;
  }

  /** Run start: show the arch for finish levels (no boss, not endless). */
  reset(run) {
    this.active = !!(run && run.def.finish && !run.boss && run.mode !== 'endless');
    this.group.visible = this.active;
    if (!this.active) return;
    this.build(run.world || 'sky');
    this.group.position.set(0, 0, -run.length);
  }

  onWin() {
    if (!this.active) return;
    const g = this.game, fx = g.fx;
    if (!fx || !fx.B) return;
    const look = FINISH_LOOK[this.key] || FINISH_LOOK.sky;
    const z = this.group.position.z, vz = -(g.squad.speed || 0) * 0.3;
    for (const side of [-1, 1]) fx.B.sparkle(side * ARCH.halfW, ARCH.h + 0.4, z, hex(look.cap), 18, 1.6, vz, 2.2);
    fx.B.sparkle(0, ARCH.h - 1, z, hex(look.b), 16, 3.2, vz, 1.4);
    if (g.engine.quality !== 'low' && fx.screen && fx.screen.flash) fx.screen.flash(look.b, 0.18, 2);
  }
}
