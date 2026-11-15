// Game camera (extracted from game.js): follow / boss-arena / menu framing goals, damped follow, shake.
import * as THREE from 'three';
import { CAMERA, FORMATION } from '../config.js';
import { MENU_STATES } from './states.js';

const _gp = new THREE.Vector3(), _gl = new THREE.Vector3();

export function cameraGoal(game, outPos, outLook) {
  const L = game.squad.leader;
  if (MENU_STATES.has(game.state)) {
    const t = game.time;
    outPos.set(L.x * 0.3 + Math.sin(t * 0.2) * 1.5, 6.2, L.z + 9.5);
    // squad framed between the title logo and the PLAY button; wider frames (desktop 9:16) show less
    // vertical room, so the look point slides toward the squad to lift it above the button
    const wide = Math.max(0, Math.min(1, (game.camera.aspect - 0.47) / 0.1));
    outLook.set(L.x * 0.2, 0.4 - 0.5 * wide, L.z - 3.5 + 1.5 * wide);
    return;
  }
  const boss = game.run && game.run.phase === 'boss';
  // blob radius from the rendered member count (same formula as squad.center) -> zoom-out that keeps
  // growing up to the 320 rendered members (r ~ 4.9), so big squads stay inside the frame
  const r = FORMATION.spacing * 0.525 * Math.sqrt(game.squad.members.length + 0.5);
  const crowd = Math.max(0, Math.min(1, (r - 0.6) / 4.3));
  // 9:16 frames (desktop portrait frame, 16:9 phones) have a narrower fov than tall phones
  const wide = Math.max(0, Math.min(1, (game.camera.aspect - 0.47) / 0.1));
  if (boss) {
    // pull back and look further ahead so the boss clears the HUD and the squad clears the badge
    const zoom = 1 + CAMERA.crowdZoom * crowd;
    outPos.set(L.x * CAMERA.followX, CAMERA.bossHeight * zoom * (1 + CAMERA.bossWideLift * wide), L.z + CAMERA.bossBack * zoom * (1 + CAMERA.bossWideBack * wide));
    outLook.set(L.x * CAMERA.lookX, 0, L.z - (CAMERA.bossLook + CAMERA.bossWideLook * wide));
    return;
  }
  const wc = wide * crowd;
  outPos.set(L.x * CAMERA.followX, CAMERA.height * (1 + CAMERA.crowdLift * crowd + 0.12 * wide),
    L.z + CAMERA.back * (1 + CAMERA.crowdBack * crowd + 0.1 * wide + CAMERA.wideCrowdBack * wc));
  outLook.set(L.x * CAMERA.lookX, 0, L.z - (CAMERA.lookAhead - CAMERA.crowdLook * crowd - 2.5 * wide + CAMERA.wideCrowdLook * wc));
}

export function snapCamera(game) {
  cameraGoal(game, game.camPos, game.camLook);
  game.camera.position.copy(game.camPos);
  game.camera.lookAt(game.camLook);
}

export function updateCamera(game, dt) {
  const goalP = _gp, goalL = _gl;
  cameraGoal(game, goalP, goalL);
  const k = 1 - Math.exp(-CAMERA.damping * dt);
  const P = game.camPos, Lk = game.camLook;
  P.x += (goalP.x - P.x) * k;
  P.y += (goalP.y - P.y) * k;
  P.z += (goalP.z - P.z) * Math.max(k, 0.5);
  Lk.x += (goalL.x - Lk.x) * k;
  Lk.y += (goalL.y - Lk.y) * k;
  Lk.z += (goalL.z - Lk.z) * Math.max(k, 0.5);
  game.camera.position.copy(P);
  if (game.shake) game.shake.apply(game.camera, dt);
  game.camera.lookAt(Lk);
}
