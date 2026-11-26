// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 5 (WATCH): the hub's ways into watching on a small phone, 360x640 (the same scenario as on11-hub.js).
const { hubScenario } = await import('/tests/u2/lib/on11hub.js');
return hubScenario(window.__game);
