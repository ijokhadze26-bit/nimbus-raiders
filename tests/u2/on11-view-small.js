// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 5 (WATCH): the watch cards on a small phone, 360x640 (the same scenario as on11-view.js).
const { viewScenario } = await import('/tests/u2/lib/on11view.js');
return viewScenario(window.__game);
