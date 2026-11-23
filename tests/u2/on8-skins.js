// @smoke --seconds 0 --shots 0
// Online stage 4: the four online-only skins (390 x 844): never owned / bought offline, locked in the shop with EARN
// ONLINE, granted by the server profile, kept from an old tab, worn in a run. Body: tests/u2/lib/on8skins.js.
const { skinsScenario } = await import('/tests/u2/lib/on8skins.js');
return skinsScenario(window.__game);
