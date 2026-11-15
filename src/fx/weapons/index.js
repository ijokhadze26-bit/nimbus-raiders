// Per-weapon effects (SPEC2 §2 visuals). FOUNDATION STUB (owned by the WEAPONS builder): no extra effects yet.
// Contract: installWeaponFx(fx) -> { update(dt) } | null. fx = the Fx director (fx.P particles, fx.D debris,
// fx.B bursts, fx.screen, fx.game). Subscribe to weapon:fire / weapon:special / weapon:swap / weapon:tier /
// bullet:hit / crate:take on fx.game.events; drain fx.game.weapons.fxq (arcs, bounce segments) each update.
// Every recipe halves through the Low path and still spawns >= 1 particle / mesh on Low (SPEC2 §6.9).
export function installWeaponFx(fx) {
  return { fx, update() {} };
}
