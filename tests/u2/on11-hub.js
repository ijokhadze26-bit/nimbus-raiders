// @smoke --seconds 0 --shots 0
// Online stage 5 (WATCH): the hub's ways into watching at 390x844 (scenario: tests/u2/lib/on11hub.js).
const { hubScenario } = await import('/tests/u2/lib/on11hub.js');
return hubScenario(window.__game);
