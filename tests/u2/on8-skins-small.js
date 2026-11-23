// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 4: the four online-only skins on a small phone (360 x 640): the shop's locked cards fit.
// Body: tests/u2/lib/on8skins.js.
const { skinsScenario } = await import('/tests/u2/lib/on8skins.js');
return skinsScenario(window.__game);
