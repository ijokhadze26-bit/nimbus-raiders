// Camera shake (trauma model): add(amount 0..1); offset = trauma^2 * smooth noise. Applied by game.updateCamera.

export class Shake {
  constructor() { this.trauma = 0; this.t = 0; this.max = 0.55; }

  add(amount) { this.trauma = Math.min(1, this.trauma + Math.max(0, amount)); }

  reset() { this.trauma = 0; }

  apply(camera, dt) {
    if (this.trauma <= 0.001) return;
    this.t += dt;
    const k = this.trauma * this.trauma * this.max;
    const t = this.t * 31;
    camera.position.x += (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * k * 0.66;
    camera.position.y += (Math.sin(t * 1.37 + 1.7) + Math.sin(t * 3.1) * 0.5) * k * 0.66;
    camera.position.z += Math.sin(t * 0.91 + 4.1) * k * 0.3;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
}
