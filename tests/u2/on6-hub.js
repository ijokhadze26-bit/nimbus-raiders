// @smoke --seconds 0 --shots 0
// Online stage 3 (QUICK MATCH), the hub at 390x844: the card, the finding view, CANCEL. The scenario is in
// tests/u2/lib/on6hub.js (on6-hub-small.js runs the same at 360x640).
const { hubScenario } = await import('/tests/u2/lib/on6hub.js');
return hubScenario(window.__game);
