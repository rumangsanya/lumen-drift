// The game's rules and state, with no drawing and no browser in it: the Ember drone, the fallen
// stars that trail behind it once collected, the rotating void shards, the Beacon, particles,
// score, combo, hull and light. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sound, announcements) without the world knowing about screens.
// All randomness comes from the injected generator, so a seed plus a sequence of controls always
// replays the same game — that is what makes the screenshot scenes repeatable. Nothing here
// allocates after createWorld returns.
import { BEACON, DRONE, FIELD, PARTICLE_POOL, SCORE, SHARD, STAR, TRAIL_GAP, TRAIL_LENGTH } from './config.js';

export const EVENT_PICKUP = 1;
export const EVENT_DELIVER = 2;
export const EVENT_HIT = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_DASH = 32;

export const PARTICLE_EMBER = 0;
export const PARTICLE_SPARK = 1;
export const PARTICLE_MOTE = 2;
export const PARTICLE_GHOST = 3;
export const PARTICLE_FLASH = 4;

/** Particle colour families: warm gold, void violet, pale white. */
export const TONE_GOLD = 0;
export const TONE_VIOLET = 1;
export const TONE_WHITE = 2;

const TAU = Math.PI * 2;

function distance2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const drone = {
    x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2,
    hull: DRONE.hull, invulnerable: 0, dashCooldown: 0, dashTime: 0,
  };
  const beacon = { x: BEACON.x, y: BEACON.y, radius: BEACON.radius, light: 0, flash: 0 };
  const stars = [];
  for (let index = 0; index < STAR.pool; index += 1) {
    stars.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, phase: 0 });
  }
  const shards = [];
  for (let index = 0; index < SHARD.pool; index += 1) {
    shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 0, angle: 0, spin: 0, verts: new Array(8).fill(1), count: 0 });
  }
  const particles = [];
  for (let index = 0; index < PARTICLE_POOL; index += 1) {
    particles.push({ active: false, kind: PARTICLE_EMBER, tone: TONE_GOLD, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, angle: 0 });
  }
  const carriedPos = [];
  for (let index = 0; index < STAR.carryMax; index += 1) carriedPos.push({ x: 0, y: 0 });
  const trailX = new Array(TRAIL_LENGTH).fill(0);
  const trailY = new Array(TRAIL_LENGTH).fill(0);

  const state = {
    drone, beacon, stars, shards, particles, carriedPos,
    carried: 0, score: 0, combo: 0, comboTimer: 0,
    elapsed: 0, won: false, winTime: 0, over: false,
    deliveries: 0, pickups: 0, lastDelivery: 0, lastMult: 1,
    trailX, trailY, trailHead: 0,
  };
  let starTimer = 0;
  let shardTimer = 0;
  let emberAcc = 0;

  function spawnParticle(kind, tone, x, y, vx, vy, life, size, angle) {
    for (let index = 0; index < particles.length; index += 1) {
      const p = particles[index];
      if (p.active) continue;
      p.active = true;
      p.kind = kind;
      p.tone = tone;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.maxLife = life;
      p.size = size;
      p.angle = angle;
      return;
    }
  }

  function burst(x, y, count, tone, speed, life, size) {
    for (let index = 0; index < count; index += 1) {
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      spawnParticle(PARTICLE_SPARK, tone, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + random() * 0.7), size, 0);
    }
  }

  function spawnStar(initial) {
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      if (star.active) continue;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const x = 40 + random() * (FIELD.width - 80);
        const y = 40 + random() * (FIELD.height - 80);
        if (distance2(x, y, beacon.x, beacon.y) < 170 * 170) continue;
        if (!initial && distance2(x, y, drone.x, drone.y) < 100 * 100) continue;
        star.active = true;
        star.x = x;
        star.y = y;
        const a = random() * TAU;
        const s = STAR.drift * (0.4 + random() * 0.6);
        star.vx = Math.cos(a) * s;
        star.vy = Math.sin(a) * s;
        star.phase = random() * TAU;
        return;
      }
      return;
    }
  }

  function spawnShard(initial) {
    for (let index = 0; index < shards.length; index += 1) {
      const shard = shards[index];
      if (shard.active) continue;
      const keep = initial ? 210 : 260;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const x = 30 + random() * (FIELD.width - 60);
        const y = 30 + random() * (FIELD.height - 60);
        if (distance2(x, y, drone.x, drone.y) < keep * keep) continue;
        shard.active = true;
        shard.x = x;
        shard.y = y;
        const a = random() * TAU;
        const s = SHARD.minSpeed + random() * (SHARD.maxSpeed - SHARD.minSpeed);
        shard.vx = Math.cos(a) * s;
        shard.vy = Math.sin(a) * s;
        shard.radius = SHARD.minRadius + random() * (SHARD.maxRadius - SHARD.minRadius);
        shard.angle = random() * TAU;
        shard.spin = (random() * 2 - 1) * SHARD.maxSpin;
        shard.count = 6 + Math.floor(random() * 3);
        for (let v = 0; v < shard.count; v += 1) shard.verts[v] = 0.7 + random() * 0.5;
        return;
      }
      return;
    }
  }

  function activeCount(list) {
    let n = 0;
    for (let index = 0; index < list.length; index += 1) if (list[index].active) n += 1;
    return n;
  }

  function explode(x, y) {
    burst(x, y, 18, TONE_GOLD, 300, 0.9, 3);
    burst(x, y, 12, TONE_WHITE, 200, 0.6, 2.5);
    spawnParticle(PARTICLE_FLASH, TONE_GOLD, x, y, 0, 0, 0.5, 10, 0);
  }

  function reset() {
    drone.x = FIELD.width / 2;
    drone.y = 500;
    drone.vx = 0;
    drone.vy = 0;
    drone.angle = -Math.PI / 2;
    drone.hull = DRONE.hull;
    drone.invulnerable = 0;
    drone.dashCooldown = 0;
    drone.dashTime = 0;
    beacon.light = 0;
    beacon.flash = 0;
    for (const star of stars) star.active = false;
    for (const shard of shards) shard.active = false;
    for (const p of particles) p.active = false;
    state.carried = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.elapsed = 0;
    state.won = false;
    state.winTime = 0;
    state.over = false;
    state.deliveries = 0;
    state.pickups = 0;
    state.lastDelivery = 0;
    state.lastMult = 1;
    state.trailHead = 0;
    for (let index = 0; index < TRAIL_LENGTH; index += 1) {
      trailX[index] = drone.x;
      trailY[index] = drone.y;
    }
    for (let index = 0; index < carriedPos.length; index += 1) {
      carriedPos[index].x = drone.x;
      carriedPos[index].y = drone.y;
    }
    starTimer = 0;
    shardTimer = 0;
    emberAcc = 0;
    for (let index = 0; index < STAR.target; index += 1) spawnStar(true);
    for (let index = 0; index < SHARD.first; index += 1) spawnShard(true);
  }

  function updateParticles(dt) {
    for (let index = 0; index < particles.length; index += 1) {
      const p = particles[index];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.kind === PARTICLE_MOTE) {
        // Delivery motes home to the Beacon and feed its flash as they land.
        const dx = beacon.x - p.x;
        const dy = beacon.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 16) {
          p.active = false;
          beacon.flash = Math.max(beacon.flash, 0.4);
          continue;
        }
        p.vx += (dx / d) * 1500 * dt;
        p.vy += (dy / d) * 1500 * dt;
        const damp = Math.max(0, 1 - 2.2 * dt);
        p.vx *= damp;
        p.vy *= damp;
      } else if (p.kind === PARTICLE_SPARK) {
        const damp = Math.max(0, 1 - 2.6 * dt);
        p.vx *= damp;
        p.vy *= damp;
      } else if (p.kind === PARTICLE_EMBER) {
        const damp = Math.max(0, 1 - 3 * dt);
        p.vx *= damp;
        p.vy = p.vy * damp - 14 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function driftAmbient(dt) {
    for (const star of stars) {
      if (!star.active) continue;
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      if (star.x < -30) star.x += FIELD.width + 60;
      if (star.x > FIELD.width + 30) star.x -= FIELD.width + 60;
      if (star.y < -30) star.y += FIELD.height + 60;
      if (star.y > FIELD.height + 30) star.y -= FIELD.height + 60;
    }
    for (const shard of shards) {
      if (!shard.active) continue;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.angle += shard.spin * dt;
      const m = shard.radius + 14;
      if (shard.x < -m) shard.x += FIELD.width + 2 * m;
      if (shard.x > FIELD.width + m) shard.x -= FIELD.width + 2 * m;
      if (shard.y < -m) shard.y += FIELD.height + 2 * m;
      if (shard.y > FIELD.height + m) shard.y -= FIELD.height + 2 * m;
    }
  }

  /**
   * One fixed step. `control` is { tx, ty, px, py, hasPointer, dash }: held-key thrust axes, the
   * pointer's field position when it steers, and a dash press. With `harmless` set (the title
   * screen's backdrop) the garden drifts and the drone wanders, but nothing is collected, nothing
   * is delivered and nothing can hurt it.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (beacon.flash > 0) beacon.flash = Math.max(0, beacon.flash - dt * 1.3);
    updateParticles(dt);
    driftAmbient(dt);
    if (state.over) return events;
    state.elapsed += dt;
    if (state.comboTimer > 0) {
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer === 0) state.combo = 0;
    }

    // --- the drone ------------------------------------------------------------
    if (drone.invulnerable > 0) drone.invulnerable = Math.max(0, drone.invulnerable - dt);
    if (drone.dashCooldown > 0) drone.dashCooldown = Math.max(0, drone.dashCooldown - dt);
    if (drone.dashTime > 0) drone.dashTime = Math.max(0, drone.dashTime - dt);

    if (control.dash && drone.dashCooldown === 0 && !harmless) {
      let dx = drone.vx;
      let dy = drone.vy;
      if (dx * dx + dy * dy < 30 * 30) {
        if (control.hasPointer) {
          dx = control.px - drone.x;
          dy = control.py - drone.y;
        } else {
          dx = Math.cos(drone.angle);
          dy = Math.sin(drone.angle);
        }
      }
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      drone.vx = (dx / d) * DRONE.dashSpeed;
      drone.vy = (dy / d) * DRONE.dashSpeed;
      drone.dashTime = DRONE.dashTime;
      drone.dashCooldown = DRONE.dashCooldown;
      drone.invulnerable = Math.max(drone.invulnerable, DRONE.dashInvulnerable);
      events |= EVENT_DASH;
    }

    if (control.hasPointer) {
      const dx = control.px - drone.x;
      const dy = control.py - drone.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) {
        const speed = Math.min(DRONE.maxSpeed, d * 4.2);
        const k = Math.min(1, DRONE.steerRate * dt);
        drone.vx += ((dx / d) * speed - drone.vx) * k;
        drone.vy += ((dy / d) * speed - drone.vy) * k;
      }
    }
    if (control.tx !== 0 || control.ty !== 0) {
      const norm = control.tx !== 0 && control.ty !== 0 ? Math.SQRT1_2 : 1;
      drone.vx += control.tx * norm * DRONE.thrust * dt;
      drone.vy += control.ty * norm * DRONE.thrust * dt;
    } else if (!control.hasPointer) {
      const keep = Math.pow(DRONE.coast, dt);
      drone.vx *= keep;
      drone.vy *= keep;
    }

    const speed2 = drone.vx * drone.vx + drone.vy * drone.vy;
    const cap = drone.dashTime > 0 ? DRONE.dashSpeed : DRONE.maxSpeed * 1.3;
    if (speed2 > cap * cap) {
      const s = cap / Math.sqrt(speed2);
      drone.vx *= s;
      drone.vy *= s;
    }
    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;
    if (drone.x < DRONE.radius) { drone.x = DRONE.radius; drone.vx = Math.max(0, drone.vx); }
    if (drone.x > FIELD.width - DRONE.radius) { drone.x = FIELD.width - DRONE.radius; drone.vx = Math.min(0, drone.vx); }
    if (drone.y < DRONE.radius) { drone.y = DRONE.radius; drone.vy = Math.max(0, drone.vy); }
    if (drone.y > FIELD.height - DRONE.radius) { drone.y = FIELD.height - DRONE.radius; drone.vy = Math.min(0, drone.vy); }
    const speed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
    if (speed > 25) drone.angle = Math.atan2(drone.vy, drone.vx);

    // Engine embers and dash afterimages.
    emberAcc += dt * (speed > 40 ? 30 : 7);
    while (emberAcc >= 1) {
      emberAcc -= 1;
      const bx = drone.x - Math.cos(drone.angle) * 14;
      const by = drone.y - Math.sin(drone.angle) * 14;
      spawnParticle(
        PARTICLE_EMBER, TONE_GOLD, bx, by,
        -drone.vx * 0.25 + (random() * 2 - 1) * 16,
        -drone.vy * 0.25 + (random() * 2 - 1) * 16,
        0.35 + random() * 0.35, 2 + random() * 2, 0,
      );
    }
    if (drone.dashTime > 0) {
      spawnParticle(PARTICLE_GHOST, TONE_GOLD, drone.x, drone.y, 0, 0, 0.3, DRONE.radius, drone.angle);
    }

    // The trail the carried stars string out along.
    state.trailHead = (state.trailHead + 1) % TRAIL_LENGTH;
    trailX[state.trailHead] = drone.x;
    trailY[state.trailHead] = drone.y;
    for (let index = 0; index < state.carried; index += 1) {
      const at = (((state.trailHead - (index + 1) * TRAIL_GAP) % TRAIL_LENGTH) + TRAIL_LENGTH) % TRAIL_LENGTH;
      carriedPos[index].x = trailX[at];
      carriedPos[index].y = trailY[at];
    }

    if (!harmless) {
      // --- pickups ------------------------------------------------------------
      if (state.carried < STAR.carryMax) {
        const reach = DRONE.radius + STAR.radius + 4;
        for (const star of stars) {
          if (!star.active) continue;
          if (distance2(drone.x, drone.y, star.x, star.y) < reach * reach) {
            star.active = false;
            state.carried += 1;
            state.pickups += 1;
            state.score += STAR.points;
            burst(star.x, star.y, 9, TONE_GOLD, 170, 0.55, 2.4);
            events |= EVENT_PICKUP;
            if (state.carried >= STAR.carryMax) break;
          }
        }
      }

      // --- delivery -------------------------------------------------------------
      if (state.carried > 0 && distance2(drone.x, drone.y, beacon.x, beacon.y) < (beacon.radius + 12) ** 2) {
        const delivered = state.carried;
        state.carried = 0;
        state.combo = state.comboTimer > 0 ? Math.min(state.combo + 1, SCORE.comboMax) : 1;
        state.comboTimer = SCORE.comboWindow;
        state.lastMult = state.combo;
        state.lastDelivery = delivered;
        state.score += SCORE.delivery * delivered * state.combo;
        state.deliveries += 1;
        beacon.light = Math.min(100, beacon.light + delivered * STAR.light);
        beacon.flash = 1;
        for (let index = 0; index < delivered * 3; index += 1) {
          const a = random() * TAU;
          const s = 40 + random() * 90;
          spawnParticle(PARTICLE_MOTE, TONE_GOLD, drone.x, drone.y, Math.cos(a) * s, Math.sin(a) * s, 1.6, 2.6, 0);
        }
        events |= EVENT_DELIVER;
        if (!state.won && beacon.light >= 100) {
          state.won = true;
          state.winTime = state.elapsed;
          burst(beacon.x, beacon.y, 22, TONE_GOLD, 260, 1, 3);
          spawnParticle(PARTICLE_FLASH, TONE_GOLD, beacon.x, beacon.y, 0, 0, 0.8, 16, 0);
          events |= EVENT_WIN;
        }
      }

      // --- shards ---------------------------------------------------------------
      if (drone.invulnerable === 0) {
        for (const shard of shards) {
          if (!shard.active) continue;
          const reach = shard.radius * 0.86 + DRONE.radius;
          if (distance2(drone.x, drone.y, shard.x, shard.y) >= reach * reach) continue;
          shard.active = false;
          drone.hull -= 1;
          drone.invulnerable = DRONE.hitInvulnerable;
          const dx = drone.x - shard.x;
          const dy = drone.y - shard.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          drone.vx = (dx / d) * DRONE.knockback + shard.vx;
          drone.vy = (dy / d) * DRONE.knockback + shard.vy;
          burst(drone.x, drone.y, 13, TONE_VIOLET, 250, 0.7, 2.6);
          burst(drone.x, drone.y, 5, TONE_WHITE, 180, 0.5, 2);
          events |= EVENT_HIT;
          if (drone.hull <= 0) {
            drone.hull = 0;
            state.over = true;
            explode(drone.x, drone.y);
            events |= EVENT_OVER;
          }
          break;
        }
      }
    }

    // --- keep the garden stocked ----------------------------------------------
    starTimer -= dt;
    if (starTimer <= 0) {
      if (activeCount(stars) < STAR.target) spawnStar(false);
      starTimer = 0.35;
    }
    shardTimer -= dt;
    if (shardTimer <= 0) {
      const wanted = Math.min(SHARD.first + Math.floor(state.elapsed / SHARD.growSeconds), SHARD.max);
      if (activeCount(shards) < wanted) spawnShard(false);
      shardTimer = 0.5;
    }
    return events;
  }

  /** Stage a finished run (the game-over screenshot scene): the drone is gone, its light scattered. */
  function stageGameOver() {
    drone.hull = 0;
    state.over = true;
    explode(drone.x, drone.y);
  }

  reset();
  return { state, reset, step, stageGameOver };
}
