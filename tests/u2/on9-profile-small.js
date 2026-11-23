// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4 (BOARDS): MY PROFILE on a small phone, 360x640 (the same scenario as on9-profile.js).
const { profileScenario } = await import('/tests/u2/lib/on9profile.js');
return profileScenario(window.__game);
