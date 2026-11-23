// @smoke --seconds 0 --shots 0
// Online stage 4 (BOARDS): LEADERBOARDS at 390x844 on the in-page hub (scenario: tests/u2/lib/on9boards.js).
const { boardsScenario } = await import('/tests/u2/lib/on9boards.js');
return boardsScenario(window.__game);
