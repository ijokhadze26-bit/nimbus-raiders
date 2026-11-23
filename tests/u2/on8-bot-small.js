// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4: ranked Quick Match against the bot on a small phone (360 x 640): the same checks as on8-bot.js, and
// every line of the result fits (the panel scrolls to SHARE / LEAVE). Body: tests/u2/lib/on8bot.js.
const { botScenario } = await import('/tests/u2/lib/on8bot.js');
return botScenario(window.__game);
