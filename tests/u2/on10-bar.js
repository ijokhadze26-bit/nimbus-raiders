// @smoke --seconds 0 --shots 0
// Online stage 5 (FOUR): the bar of a 3-4 player match at 390x844 (scenario: tests/u2/lib/on10match.js barScenario).
const { barScenario } = await import('/tests/u2/lib/on10match.js');
return barScenario(window.__game);
