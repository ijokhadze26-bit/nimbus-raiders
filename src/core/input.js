// Input: relative pointer drag (mouse + touch), keyboard arrows / A-D.
// Exposes targetX (world units, clamped) and axis (-1..1). Ignores presses on UI controls.
// Update 3: a quick, mostly upward flick (>= SWIPE.dist px within SWIPE.time ms, |dy| > SWIPE.ratio x |dx|) or
// W / ArrowUp fires onSwipeUp callbacks (the dodge roll) - once per press; sideways steering is unaffected.
import { MOVE, TARGET_CLAMP } from '../config.js';

const UI_SELECTOR = 'button, a, input, select, [data-ui]';
export const SWIPE = { dist: 60, time: 380, ratio: 1.4 };
/** True for a box you type text into (online name / room code). A slider or a checkbox is not one: it keeps the
 *  game's own key handling exactly as before. */
export const isTextBox = (t) => !!t && (t.tagName === 'TEXTAREA'
  || (t.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number)$/i.test(t.type || 'text')));
const typing = (e) => isTextBox(e.target);

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
    this.swipeFns = [];
    this.startPy = 0; this.startT = 0; this.swiped = false;

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
  /** fn() runs on every swipe up / W / ArrowUp (update 3 dodge roll). */
  onSwipeUp(fn) { this.swipeFns.push(fn); }
  fireSwipe() { if (!this.enabled) return; for (const fn of this.swipeFns) { try { fn(); } catch (e) { console.error(e); } } }

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
    this.startPy = e.clientY; this.startT = this.lastActivity; this.swiped = false;
    this.swipeX = e.clientX; this.swipeTarget = this.targetX;
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
    if (!this.swiped) this.swipeCheck(e.clientX, e.clientY, this.lastActivity);
  }

  /** Swipe up: far enough, fast enough and mostly vertical since the press (a re-press starts over). */
  swipeCheck(x, y, now) {
    const dy = this.startPy - y, dx = Math.abs(x - this.swipeX);
    if (now - this.startT > SWIPE.time) {
      // a slow drag: slide the window so a later quick flick in the same press still counts
      this.startPy = y; this.swipeX = x; this.startT = now; this.swipeTarget = this.targetX;
      return;
    }
    if (dy >= SWIPE.dist && dy > dx * SWIPE.ratio) {
      this.swiped = true;
      // the flick's small sideways drift must not steer: back to where the flick began, re-anchored
      this.setTarget(this.swipeTarget); this.startTarget = this.targetX; this.startPx = x;
      this.fireSwipe();
    }
  }

  up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  }

  key(e, isDown) {
    if (typing(e)) return; // a text box has the keyboard (online name / room code): a, d, w and the arrows belong to it
    if (isDown) this.fireGesture();
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.left = isDown;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.right = isDown;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') { if (isDown && !e.repeat) this.fireSwipe(); }
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
