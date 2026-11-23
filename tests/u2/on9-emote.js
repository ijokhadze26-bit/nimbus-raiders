// @smoke --seconds 0 --shots 0
// Online stage 4 (BOARDS): emotes at 390x844 (scenario: tests/u2/lib/on9emote.js).
const { emoteScenario } = await import('/tests/u2/lib/on9emote.js');
return emoteScenario(window.__game);
