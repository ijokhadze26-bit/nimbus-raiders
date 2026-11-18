// Haptics (update 3 stage 5): one navigator.vibrate wrapper for every buzz in the game. Respects the HAPTICS
// setting (save.settings.haptics, kept in step with the old `vibration` switch) and devices without vibration.
export function canVibrate() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; }

export function haptic(save, ms) {
  const st = save?.data?.settings;
  if (!st || st.haptics === false || !canVibrate()) return false;
  try { return !!navigator.vibrate(Math.max(1, Math.min(400, ms | 0))); } catch { return false; }
}
