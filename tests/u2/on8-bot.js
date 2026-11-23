// @smoke --seconds 0 --shots 0
// Online stage 4: ranked Quick Match against the bot at 390 x 844 (win: SAVING... then saved, loss, the daily limit).
// The body is tests/u2/lib/on8bot.js (shared with on8-bot-small.js).
const { botScenario } = await import('/tests/u2/lib/on8bot.js');
return botScenario(window.__game);
