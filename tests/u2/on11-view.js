// @smoke --seconds 0 --shots 0
// Online stage 5 (WATCH): the watch cards on the fake link with 4, 3 and 2 players at 390x844 (tests/u2/lib/on11view.js).
const { viewScenario } = await import('/tests/u2/lib/on11view.js');
return viewScenario(window.__game);
