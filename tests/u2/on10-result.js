// @smoke --seconds 0 --shots 0
// Online stage 5 (FOUR): the result of a 3-4 player match at 390x844 (scenario: tests/u2/lib/on10match.js resultScenario).
const { resultScenario } = await import('/tests/u2/lib/on10match.js');
return resultScenario(window.__game);
