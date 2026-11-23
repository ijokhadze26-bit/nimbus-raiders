// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4: league badges + trophies on the VS card on a small phone (360 x 640). Body: tests/u2/lib/on8card.js.
const { cardScenario } = await import('/tests/u2/lib/on8card.js');
return cardScenario(window.__game);
