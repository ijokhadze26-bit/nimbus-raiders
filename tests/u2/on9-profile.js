// @smoke --seconds 0 --shots 0
// Online stage 4 (BOARDS): MY PROFILE at 390x844 (scenario: tests/u2/lib/on9profile.js).
const { profileScenario } = await import('/tests/u2/lib/on9profile.js');
return profileScenario(window.__game);
