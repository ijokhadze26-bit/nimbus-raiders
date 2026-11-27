// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 5 (FOUR): the bar of a 3-4 player match at 360x640 (scenario: tests/u2/lib/on10match.js barScenario).
const { barScenario } = await import('/tests/u2/lib/on10match.js');
return barScenario(window.__game);
