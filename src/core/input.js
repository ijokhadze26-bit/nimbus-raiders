// Input: relative pointer drag (mouse + touch), keyboard arrows / A-D.
// Exposes targetX (world units, clamped) and axis (-1..1). Ignores presses on UI controls.
import { MOVE, TARGET_CLAMP } from '../config.js';

const UI_SELECTOR = 'button, a, input, select, [data-ui]';

export class Input {
  constructor(surface) {
    this.surface = surface;
    this.targetX = 0;
    this.axis = 0;
    this.dragging = false;
    this.enabled = true;
    this.pointerId = null;
    this.startPx = 0; this.startTarget = 0;
    this.keys = { left: false, right: false };
    this.lastPx = 0;
    this.gestureFns = [];
    this.lastActivity = 0;

    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    surface.addEventListener('lostpointercapture', (e) => this.up(e));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.cancel());
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** fn() runs on the first user gesture (pointer or key), e.g. to unlock audio. */
  onGesture(fn) { this.gestureFns.push(fn); }
  fireGesture() { const f = this.gestureFns; this.gestureFns = []; f.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  down(e) {
    this.fireGesture();
    if (e.target && e.target.closest && e.target.closest(UI_SELECTOR)) return;
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    // keep receiving moves / the release when the finger slides off the game (over the HUD, off-screen)
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    this.dragging = true;
    this.startPx = e.clientX;
    this.lastPx = e.clientX;
    this.startTarget = this.targetX;
    this.lastActivity = performance.now();
  }

  move(e) {
    if (!this.dragging || e.pointerId !== this.pointerId || !this.enabled) return;
    const w = this.width || this.surface.clientWidth || 1; // width is pushed by Engine resize (no layout read)
    this.lastPx = e.clientX;
    const dx = e.clientX - this.startPx;
    const raw = this.startTarget + (dx / w) * MOVE.dragWorld;
    this.setTarget(raw);
    // Pushed past the road edge: re-anchor so the overshoot is forgotten and reversing responds at once.
    if (raw !== this.targetX) { this.startTarget = this.targetX; this.startPx = e.clientX; }
    this.lastActivity = performance.now();
  }

  up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  }

  key(e, isDown) {
    if (isDown) this.fireGesture();
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.left = isDown;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.right = isDown;
    else return;
    e.preventDefault();
  }

  /** Ends any drag / held keys (pause, blur): the next press starts a fresh, re-anchored drag. */
  cancel() {
    this.keys.left = this.keys.right = false;
    this.dragging = false;
    this.pointerId = null;
    this.axis = 0;
  }

  setTarget(x) { this.targetX = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, x)); }

  /** Re-anchor an active drag after the target was moved externally (e.g. run reset). */
  reset(x = 0) { this.targetX = x; this.startTarget = x; }

  update(dt) {
    this.axis = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (this.enabled && this.axis !== 0) {
      this.setTarget(this.targetX + this.axis * MOVE.keySpeed * dt);
      if (this.dragging) { this.startTarget = this.targetX; this.startPx = this.lastPx; }
    }
  }
}
