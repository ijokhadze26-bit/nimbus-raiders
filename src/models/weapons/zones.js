// Zone views (caramel puddles, black holes). FOUNDATION STUB (owned by the WEAPONS builder): draws nothing.
// Contract: createZoneViews(game) -> { sync(dt), reset(), dispose() }; reads game.zones.list (read-only) every
// frame; one InstancedMesh per look, registered for warm-up (warmup.registerWarm), >= 1 mesh on Low.
export function createZoneViews(game) {
  return { game, sync() {}, reset() {}, dispose() {} };
}
