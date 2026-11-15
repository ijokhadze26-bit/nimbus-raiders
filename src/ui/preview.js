// 3D preview window for the info pages (SPEC2 §5 "3D preview rendering"). FOUNDATION STUB (owned by the UI
// builder): no-op. Contract: createPreview(ui) -> { show(rectEl, item), set(item), hide(), dispose() };
// renders through engine.addOverlay(fn) with scissor + its own small scene; engine.skipMain only while an opaque
// page is fully shown; restores scissor / viewport every frame; disposes every model in hide().
export function createPreview(ui) {
  return { ui, show() {}, set() {}, hide() {}, dispose() {} };
}
