// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 5 (FOUR): the lobby of a 4-seat friend room on a small phone, 360x640 (the same scenario as on10-lobby.js).
const { lobbyScenario } = await import('/tests/u2/lib/on10lobby.js');
return lobbyScenario(window.__game);
