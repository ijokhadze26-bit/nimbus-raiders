// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4 (BOARDS): LEADERBOARDS on a small phone, 360x640 (the same scenario as on9-boards.js).
const { boardsScenario } = await import('/tests/u2/lib/on9boards.js');
return boardsScenario(window.__game);
