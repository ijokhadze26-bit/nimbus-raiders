// @smoke --seconds 0 --shots 0
// Online stage 4: league badges + trophies on the VS card (390 x 844). Body: tests/u2/lib/on8card.js.
const { cardScenario } = await import('/tests/u2/lib/on8card.js');
return cardScenario(window.__game);
