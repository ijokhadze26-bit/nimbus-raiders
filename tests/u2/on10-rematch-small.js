// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 5 (FOUR): a friend match of four, the fallen player watching, the final table, REMATCH with 1 and 2
// missing and with one who left, at 360x640 (scenario: tests/u2/lib/on10rematch.js).
const { rematchScenario } = await import('/tests/u2/lib/on10rematch.js');
return rematchScenario(window.__game);
