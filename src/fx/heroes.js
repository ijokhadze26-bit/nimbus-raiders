// Hero / ability effects (SPEC2 §3). FOUNDATION STUB (owned by the HEROES builder): no extra effects yet.
// Contract: installHeroFx(fx) -> { update(dt) } | null. Listens to ability:use / ability:start / ability:end /
// hero:guard / turret:drop. Friendly markers (Meteor ring) are drawn here, never via game.telegraph.
export function installHeroFx(fx) {
  return { fx, update() {} };
}
