// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 3, a whole bot match through the real match screens on the small phone, 360 x 640
// (tests/u2/lib/on7screens.js): the same checks as on7-screens.js.
const { screens } = await import('/tests/u2/lib/on7screens.js');
return screens(window.__game, '360x640');
