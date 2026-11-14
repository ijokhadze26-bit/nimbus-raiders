// Full-screen DOM layers: red edge vignette pulse (member losses) and a color flash (gate pass, boss kill).
// Decays on real time so a slow-mo moment never leaves the screen washed out. Style writes only on change.

export class Screen {
  constructor(layer) {
    this.vig = document.createElement('div');
    this.vig.className = 'fx-vignette';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    layer.appendChild(this.vig);
    layer.appendChild(this.flashEl);
    this.v = 0; this.vShown = -1;
    this.f = 0; this.fShown = -1; this.fDecay = 3; this.fColor = '';
  }

  /** Red edge pulse; amounts accumulate up to a cap. */
  pulse(amount) { this.v = Math.min(0.7, this.v + amount); }

  /** Color flash (css color), peak opacity a, fades out over ~1/decay seconds. */
  flash(color, a, decay = 3) {
    if (a < this.f) return;
    this.f = a; this.fDecay = decay;
    if (color !== this.fColor) { this.fColor = color; this.flashEl.style.background = color; }
  }

  clear() { this.v = 0; this.f = 0; this.update(0); }

  update(real) {
    this.v = Math.max(0, this.v - real * 2.2);
    this.f = Math.max(0, this.f - real * this.fDecay);
    const v = Math.round(this.v * 100) / 100, f = Math.round(this.f * 100) / 100;
    if (v !== this.vShown) { this.vShown = v; this.vig.style.opacity = String(v); }
    if (f !== this.fShown) { this.fShown = f; this.flashEl.style.opacity = String(f); }
  }
}
