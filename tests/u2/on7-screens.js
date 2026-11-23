// @smoke --seconds 0 --shots 0
// Online stage 3, a whole bot match through the real match screens at 390 x 844 (tests/u2/lib/on7screens.js): VS card,
// the versus bar and the ghost, a warning from the rival, RIVAL DOWN!, YOU WIN!, the result; no word on the page says BOT.
const { screens } = await import('/tests/u2/lib/on7screens.js');
return screens(window.__game, '390x844');
