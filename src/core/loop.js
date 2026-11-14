// requestAnimationFrame loop: clamps dt, measures fps, and offers a fixed-step simulate().
import { DT_MAX } from '../config.js';

export class Loop {
  /** frame(dt, realDt) is called every animation frame. */
  constructor(frame) {
    this.frame = frame;
    this.running = false;
    this.last = 0;
    this.fps = 60;
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop() { this.running = false; }

  tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const real = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    // fps meter (0.5s windows)
    this.fpsAcc += real; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    const dt = Math.min(real, DT_MAX);
    try { this.frame(dt, real); } catch (e) { console.error('[loop] frame failed', e); }
  }

  /** Runs step(dt) repeatedly for `seconds` of game time without rendering. */
  static simulate(step, seconds, dt = 1 / 60, stopWhen = null) {
    const n = Math.max(0, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) {
      step(dt);
      if (stopWhen && stopWhen()) break;
    }
  }
}
