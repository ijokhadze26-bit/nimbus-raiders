// Online mode entry (SPEC4 §3.1): the ONLY door into src/online/**. Nothing in the main bundle imports this file
// statically; the UI reaches it through one dynamic import('../online/index.js'), so single-player never loads it.
// Stage 1, game side: installs the versus controller (game.versus) and warms the ghost shader. The UI builder
// extends this (transport, screens, HUD) and adds what it returns.
import { Versus } from './game/versus.js';

/**
 * @param game  the Game
 * @param ui    the Ui (unused by the game side)
 * @param opts  reserved for the UI / network side
 * @returns {Promise<{ versus: Versus }>}
 */
export async function installOnline(game, ui, opts = {}) { // eslint-disable-line no-unused-vars
  if (!game.versus) {
    game.versus = new Versus(game);
    game.versus.ghost.warm();
  }
  return { versus: game.versus };
}
