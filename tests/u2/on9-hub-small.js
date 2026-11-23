// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4 (BOARDS): the hub on a small phone, 360x640 (the same scenario as on9-hub.js).
const { hubScenario } = await import('/tests/u2/lib/on9hub.js');
return hubScenario(window.__game);
