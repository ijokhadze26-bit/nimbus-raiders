// @smoke --seconds 0 --shots 0
// Online stage 5 (FOUR): the lobby of a 4-seat friend room at 390x844 (scenario: tests/u2/lib/on10lobby.js).
const { lobbyScenario } = await import('/tests/u2/lib/on10lobby.js');
return lobbyScenario(window.__game);
