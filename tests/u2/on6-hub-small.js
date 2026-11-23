// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 3 (QUICK MATCH), the hub on a small phone (360x640): the same scenario as on6-hub.js.
const { hubScenario } = await import('/tests/u2/lib/on6hub.js');
return hubScenario(window.__game);
