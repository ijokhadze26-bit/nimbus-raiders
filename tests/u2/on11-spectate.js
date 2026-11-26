// @smoke --seconds 0 --shots 0
// Online stage 5 (WATCH): this page watches a friend room of three plain players on the in-page hub with the real rules
// (scenario: tests/u2/lib/on11spec.js). About 50 s of real time.
const { spectateScenario } = await import('/tests/u2/lib/on11spec.js');
return spectateScenario(window.__game);
