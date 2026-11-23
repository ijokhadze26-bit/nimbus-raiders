// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4 (BOARDS): emotes on a small phone, 360x640 (the same scenario as on9-emote.js).
const { emoteScenario } = await import('/tests/u2/lib/on9emote.js');
return emoteScenario(window.__game);
