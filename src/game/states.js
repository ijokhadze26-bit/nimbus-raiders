// Game states that show a menu over the live attract scene (single copy; game.js, ui.js and fx.js import it).
// Update 2 adds the ARMORY and HEROES info pages and the pre-level LOADOUT screen; stage 5 the MODES and ACHIEVEMENTS pages.
export const MENU_STATE_LIST = ['title', 'map', 'shop', 'settings', 'endless', 'armory', 'heroes', 'loadout', 'modes', 'achievements'];
export const MENU_STATES = new Set(MENU_STATE_LIST);
