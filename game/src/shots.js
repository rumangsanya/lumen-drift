// The screenshot scenes behind ?shot=start|play|beacon|end. Each one plays the real rules forward
// from a fresh world, steered by a simple autopilot (gather stars, deliver at a threshold, veer
// away from shards), so the frame is what a short game really looks like and the same seed always
// gives the same frame. The beacon scene is finished by hand — the drone is placed on its final
// approach with a full trail — and the end scene is flown by a pilot that hunts shards instead of
// dodging them, with a staged finish if it somehow survives.
import { BEACON, FIELD, STEP } from './config.js';
import { EVENT_DELIVER, EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 16;
const BEACON_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 300;

function idleControl(state) {
  return {
    tx: 0, ty: 0, dash: false, hasPointer: true,
    px: FIELD.width / 2 + Math.cos(state.elapsed * 0.4) * 46,
    py: 520 + Math.sin(state.elapsed * 0.55) * 26,
  };
}

function nearest(list, x, y, predicate) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    if (!item.active || (predicate && !predicate(item))) continue;
    const d = (item.x - x) ** 2 + (item.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}

/** Steer at the nearest star until carrying `carryAt`, then at the Beacon; veer off shards. */
function gatherControl(state, carryAt) {
  const d = state.drone;
  const star = nearest(state.stars, d.x, d.y);
  const toBeacon = state.carried >= carryAt || (state.carried > 0 && star === null);
  let tx = toBeacon || star === null ? state.beacon.x : star.x;
  let ty = toBeacon || star === null ? state.beacon.y : star.y;
  for (const shard of state.shards) {
    if (!shard.active) continue;
    const dx = d.x - shard.x;
    const dy = d.y - shard.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1 && dist < 125) {
      const push = (125 - dist) * 1.7;
      tx += (dx / dist) * push;
      ty += (dy / dist) * push;
    }
  }
  return { tx: 0, ty: 0, dash: false, hasPointer: true, px: tx, py: ty };
}

/** Steer straight at the nearest shard, leading it a little: a pilot in a hurry to end. */
function hunterControl(state) {
  const d = state.drone;
  const shard = nearest(state.shards, d.x, d.y);
  if (shard === null) return idleControl(state);
  const dist = Math.sqrt((shard.x - d.x) ** 2 + (shard.y - d.y) ** 2);
  const lead = Math.min(dist / 320, 0.9);
  return {
    tx: 0, ty: 0, dash: false, hasPointer: true,
    px: shard.x + shard.vx * lead,
    py: shard.y + shard.vy * lead,
  };
}

/** Step the drone onto up to `count` active stars, one pickup per step. */
function gatherByHand(world, count) {
  const state = world.state;
  for (let n = 0; n < count && state.carried < count; n += 1) {
    const star = nearest(state.stars, state.drone.x, state.drone.y);
    if (star === null) break;
    state.drone.x = star.x;
    state.drone.y = star.y;
    state.drone.vx = 0;
    state.drone.vy = 0;
    world.step(STEP, { tx: 0, ty: 0, dash: false, hasPointer: true, px: star.x, py: star.y }, false);
  }
}

/**
 * Put the drone on a clean approach run at the Beacon. The position trail is primed along the
 * approach line (the drone was teleported to gather its stars, so its real trail is jumps), then
 * a few live steps fly it closer — stopping well outside delivery range, stars still aboard.
 */
function stageApproach(world) {
  const state = world.state;
  const tailX = state.beacon.x - 232;
  const tailY = state.beacon.y + 88;
  const headX = state.beacon.x - 185;
  const headY = state.beacon.y + 70;
  const length = state.trailX.length;
  for (let index = 0; index < length; index += 1) {
    const t = index / (length - 1);
    state.trailX[index] = tailX + (headX - tailX) * t;
    state.trailY[index] = tailY + (headY - tailY) * t;
  }
  state.trailHead = length - 1;
  state.drone.x = headX;
  state.drone.y = headY;
  state.drone.vx = 170;
  state.drone.vy = -60;
  state.drone.angle = Math.atan2(-60, 170);
  state.drone.invulnerable = 0;
  state.beacon.flash = 0.8;
  for (let index = 0; index < 12; index += 1) {
    world.step(STEP, { tx: 0, ty: 0, dash: false, hasPointer: true, px: state.beacon.x, py: state.beacon.y }, false);
  }
}

function stageBeacon(world) {
  const state = world.state;
  let delivered = false;
  for (let index = 0; index < BEACON_LIMIT_SECONDS / STEP; index += 1) {
    const events = world.step(STEP, gatherControl(state, 2), false);
    if (events & EVENT_OVER) break;
    if ((events & EVENT_DELIVER) && state.beacon.light >= 50) {
      delivered = true;
      break;
    }
  }
  if (state.over || state.drone.hull < 2) {
    // The run went badly; restage the moment cleanly rather than show a wreck.
    world.reset();
    delivered = false;
  }
  if (state.beacon.light < 55) state.beacon.light = 62;
  gatherByHand(world, 3);
  stageApproach(world);
  return { screen: SCREEN_PLAY, best: state.score };
}

function stageEnd(world) {
  const state = world.state;
  for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
    if (world.step(STEP, hunterControl(state), false) & EVENT_OVER) break;
  }
  if (!state.over) {
    if (state.score === 0) {
      state.score = 140;
      state.pickups = 6;
      state.deliveries = 2;
    }
    if (state.beacon.light === 0) state.beacon.light = 30;
    state.drone.x = FIELD.width / 2;
    state.drone.y = 430;
    world.stageGameOver();
  }
  return { screen: SCREEN_OVER, best: state.score };
}

/**
 * Set `world` to the named scene (start, play, beacon or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      if (world.step(STEP, gatherControl(world.state, 3), false) & EVENT_OVER) break;
    }
    if (world.state.over) {
      world.reset();
      for (let index = 0; index < PLAY_SECONDS / 2 / STEP; index += 1) {
        if (world.step(STEP, gatherControl(world.state, 3), false) & EVENT_OVER) break;
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'beacon') return stageBeacon(world);
  if (name === 'end') return stageEnd(world);
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, idleControl(world.state), true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
