// @smoke --seconds 0 --shots 0
// Online stage 4 (BOARDS): the hub at 390x844 with my badge, trophies, PROFILE and LEADERBOARDS (tests/u2/lib/on9hub.js).
const { hubScenario } = await import('/tests/u2/lib/on9hub.js');
return hubScenario(window.__game);
