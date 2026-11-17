// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. The deep
// background (gradient, nebula blobs, far stars, vignette) is painted once onto an offscreen
// canvas; two nearer star layers drift against the drone for parallax. Every animation phase is
// derived from the world's own clock (state.elapsed), never from the wall clock, so a staged
// screenshot scene renders the identical frame on every load.
import { BEACON, DRONE, FIELD, FONT, PALETTE, SCORE, STAR } from './config.js';
import { createRandom } from './random.js';
import { PARTICLE_EMBER, PARTICLE_FLASH, PARTICLE_GHOST, PARTICLE_MOTE, PARTICLE_SPARK, TONE_GOLD, TONE_VIOLET, TONE_WHITE } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;
const TONE_COLORS = ['#ffd76a', '#b79aff', '#ffffff'];

function cachedLabel(prefix, suffix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next + (suffix || '');
    }
    return text;
  };
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** A fixed decorative star layer: positions from a private seed, so they never change. */
function makeLayer(seed, count, parallax, minSize, maxSize) {
  const random = createRandom(seed);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    points.push({
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      size: minSize + random() * (maxSize - minSize),
      phase: random() * TAU,
      speed: 0.6 + random() * 1.8,
    });
  }
  return { points, parallax };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE  ');
  const finalLabel = cachedLabel('Score  ');
  const bestLabel = cachedLabel('Best  ');
  const lightLabel = cachedLabel('BEACON LIGHT  ', '%');
  const carriedLabel = cachedLabel('carrying ', ' / ' + STAR.carryMax);
  const midStars = makeLayer(20240, 70, 0.012, 1, 2);
  const nearStars = makeLayer(9177, 34, 0.03, 1.6, 2.7);
  const background = paintBackground();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Convert a pointer position in client coordinates to playfield coordinates. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function paintBackground() {
    const off = document.createElement('canvas');
    off.width = FIELD.width;
    off.height = FIELD.height;
    const g = off.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, FIELD.height);
    sky.addColorStop(0, '#060714');
    sky.addColorStop(0.55, '#0b0d2a');
    sky.addColorStop(1, '#050a18');
    g.fillStyle = sky;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
    const blobs = [
      [290, 170, 340, 'rgba(88, 72, 220, 0.20)'],
      [1010, 540, 390, 'rgba(28, 150, 140, 0.16)'],
      [770, 105, 260, 'rgba(140, 80, 220, 0.13)'],
      [420, 610, 300, 'rgba(255, 130, 60, 0.07)'],
      [1150, 130, 210, 'rgba(255, 170, 80, 0.06)'],
    ];
    for (const [x, y, r, color] of blobs) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const random = createRandom(5551212);
    for (let index = 0; index < 180; index += 1) {
      const x = random() * FIELD.width;
      const y = random() * FIELD.height;
      const r = 0.5 + random() * 1.1;
      g.globalAlpha = 0.2 + random() * 0.55;
      g.fillStyle = random() > 0.75 ? '#bcd2ff' : '#ffffff';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    const vignette = g.createRadialGradient(640, 360, 300, 640, 360, 780);
    vignette.addColorStop(0, 'rgba(2, 2, 8, 0)');
    vignette.addColorStop(1, 'rgba(2, 2, 8, 0.62)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
    return off;
  }

  function drawStarLayer(layer, state) {
    const ox = -state.drone.x * layer.parallax;
    const oy = -state.drone.y * layer.parallax;
    for (const p of layer.points) {
      const x = (((p.x + ox) % FIELD.width) + FIELD.width) % FIELD.width;
      const y = (((p.y + oy) % FIELD.height) + FIELD.height) % FIELD.height;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(state.elapsed * p.speed + p.phase));
      context.globalAlpha = tw;
      context.fillStyle = '#dfe8ff';
      context.beginPath();
      context.arc(x, y, p.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawBeacon(state) {
    const b = state.beacon;
    const light = b.light / 100;
    context.save();
    context.globalCompositeOperation = 'lighter';
    const haloR = b.radius + 26 + Math.sin(state.elapsed * 2) * 4;
    const halo = context.createRadialGradient(b.x, b.y, 0, b.x, b.y, haloR);
    halo.addColorStop(0, `rgba(255, 205, 100, ${0.1 + light * 0.3 + b.flash * 0.25})`);
    halo.addColorStop(1, 'rgba(255, 205, 100, 0)');
    context.fillStyle = halo;
    context.fillRect(b.x - haloR, b.y - haloR, haloR * 2, haloR * 2);
    if (b.light >= 100) {
      context.strokeStyle = 'rgba(255, 214, 106, 0.16)';
      context.lineWidth = 2;
      for (let index = 0; index < 12; index += 1) {
        const a = (index / 12) * TAU + state.elapsed * 0.25;
        context.beginPath();
        context.moveTo(b.x + Math.cos(a) * (b.radius + 12), b.y + Math.sin(a) * (b.radius + 12));
        context.lineTo(b.x + Math.cos(a) * (b.radius + 58), b.y + Math.sin(a) * (b.radius + 58));
        context.stroke();
      }
    }
    context.restore();

    // The inner disc fills with golden light as deliveries land.
    const disc = context.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius - 8);
    disc.addColorStop(0, `rgba(255, 226, 150, ${0.16 + light * 0.62})`);
    disc.addColorStop(0.7, `rgba(255, 170, 70, ${0.08 + light * 0.3})`);
    disc.addColorStop(1, 'rgba(255, 150, 60, 0.02)');
    context.fillStyle = disc;
    context.beginPath();
    context.arc(b.x, b.y, b.radius - 8, 0, TAU);
    context.fill();

    // Tick ring: each of 20 ticks lights up as the Beacon fills.
    for (let index = 0; index < 20; index += 1) {
      const a = (index / 20) * TAU - Math.PI / 2;
      const lit = index < Math.round(light * 20);
      context.strokeStyle = lit ? PALETTE.gold : 'rgba(120, 110, 170, 0.4)';
      context.lineWidth = lit ? 3 : 2;
      context.beginPath();
      context.moveTo(b.x + Math.cos(a) * (b.radius + 3), b.y + Math.sin(a) * (b.radius + 3));
      context.lineTo(b.x + Math.cos(a) * (b.radius + 10), b.y + Math.sin(a) * (b.radius + 10));
      context.stroke();
    }
    context.strokeStyle = 'rgba(160, 150, 220, 0.55)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(b.x, b.y, b.radius, 0, TAU);
    context.stroke();
    if (b.light > 0) {
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 5;
      context.shadowColor = 'rgba(255, 200, 90, 0.9)';
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(b.x, b.y, b.radius, -Math.PI / 2, -Math.PI / 2 + light * TAU);
      context.stroke();
      context.shadowBlur = 0;
    }
    if (b.flash > 0) {
      context.strokeStyle = `rgba(255, 220, 140, ${b.flash * 0.7})`;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(b.x, b.y, b.radius + (1 - b.flash) * 48, 0, TAU);
      context.stroke();
    }
    // The heart of the Beacon.
    context.fillStyle = b.light >= 100 ? '#fff6da' : PALETTE.gold;
    context.beginPath();
    context.arc(b.x, b.y, 5 + light * 4 + Math.sin(state.elapsed * 3) * 1.2, 0, TAU);
    context.fill();
  }

  function drawStarOrb(x, y, r, phase, elapsed) {
    const pulse = 1 + 0.16 * Math.sin(elapsed * 3 + phase);
    const haloR = r * 3.1 * pulse;
    const grad = context.createRadialGradient(x, y, 0, x, y, haloR);
    grad.addColorStop(0, 'rgba(255, 220, 140, 0.55)');
    grad.addColorStop(0.4, 'rgba(255, 180, 80, 0.18)');
    grad.addColorStop(1, 'rgba(255, 180, 80, 0)');
    context.fillStyle = grad;
    context.fillRect(x - haloR, y - haloR, haloR * 2, haloR * 2);
    context.fillStyle = '#ffdf9e';
    context.beginPath();
    context.arc(x, y, r * 0.62 * pulse, 0, TAU);
    context.fill();
    context.fillStyle = '#fff8e6';
    context.beginPath();
    context.arc(x, y, r * 0.3 * pulse, 0, TAU);
    context.fill();
    // A four-point sparkle, breathing with the pulse.
    const s = r * 1.5 * pulse;
    context.strokeStyle = 'rgba(255, 240, 200, 0.75)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(x - s, y);
    context.lineTo(x + s, y);
    context.moveTo(x, y - s);
    context.lineTo(x, y + s);
    context.stroke();
  }

  function drawShard(shard) {
    context.save();
    context.translate(shard.x, shard.y);
    context.rotate(shard.angle);
    context.beginPath();
    for (let index = 0; index < shard.count; index += 1) {
      const a = (index / shard.count) * TAU;
      const r = shard.radius * shard.verts[index];
      if (index === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    context.closePath();
    context.fillStyle = '#130e22';
    context.fill();
    context.strokeStyle = 'rgba(157, 123, 255, 0.16)';
    context.lineWidth = 6;
    context.stroke();
    context.strokeStyle = 'rgba(178, 150, 255, 0.9)';
    context.lineWidth = 1.6;
    context.stroke();
    // One inner facet line, so the crystal reads as cut, not flat.
    context.strokeStyle = 'rgba(157, 123, 255, 0.35)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-shard.radius * 0.45, shard.radius * 0.3);
    context.lineTo(shard.radius * 0.2, -shard.radius * 0.5);
    context.lineTo(shard.radius * 0.5, shard.radius * 0.25);
    context.stroke();
    context.restore();
  }

  function drawDroneShape(x, y, angle, alpha) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.globalAlpha = alpha;
    const body = context.createLinearGradient(-14, 0, 18, 0);
    body.addColorStop(0, '#c96a35');
    body.addColorStop(0.55, '#ffb347');
    body.addColorStop(1, '#ffe1ae');
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(18, 0);
    context.quadraticCurveTo(10, -8.5, 1, -8);
    context.lineTo(-9, -12);
    context.lineTo(-6.5, -3.5);
    context.lineTo(-11, 0);
    context.lineTo(-6.5, 3.5);
    context.lineTo(-9, 12);
    context.lineTo(1, 8);
    context.quadraticCurveTo(10, 8.5, 18, 0);
    context.fill();
    context.strokeStyle = 'rgba(63, 217, 192, 0.85)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(-8.4, -10.6);
    context.lineTo(-5.6, -3.4);
    context.moveTo(-8.4, 10.6);
    context.lineTo(-5.6, 3.4);
    context.stroke();
    context.restore();
  }

  function drawDrone(state) {
    const d = state.drone;
    if (state.over) return;
    // Blink while invulnerable after a hit (a dash's shorter grace does not blink).
    if (d.invulnerable > 0.35 && Math.floor(d.invulnerable * 10) % 2 === 0) return;
    drawDroneShape(d.x, d.y, d.angle, 1);
    context.save();
    context.globalCompositeOperation = 'lighter';
    const flicker = 1 + 0.25 * Math.sin(state.elapsed * 31);
    const core = context.createRadialGradient(d.x + 3, d.y, 0, d.x + 3, d.y, 13 * flicker);
    core.addColorStop(0, 'rgba(255, 246, 214, 0.95)');
    core.addColorStop(0.35, 'rgba(255, 190, 90, 0.55)');
    core.addColorStop(1, 'rgba(255, 150, 60, 0)');
    context.fillStyle = core;
    context.fillRect(d.x - 14, d.y - 14, 28, 28);
    context.restore();
    context.fillStyle = PALETTE.droneCore;
    context.beginPath();
    context.arc(d.x + 3, d.y, 3.4, 0, TAU);
    context.fill();
  }

  function drawParticles(state, front) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (!p.active) continue;
      const frac = p.life / p.maxLife;
      if (!front && (p.kind === PARTICLE_SPARK || p.kind === PARTICLE_FLASH)) continue;
      if (front && p.kind !== PARTICLE_SPARK && p.kind !== PARTICLE_FLASH) continue;
      if (p.kind === PARTICLE_GHOST) {
        drawDroneShape(p.x, p.y, p.angle, frac * 0.3);
      } else if (p.kind === PARTICLE_FLASH) {
        context.strokeStyle = TONE_COLORS[p.tone];
        context.globalAlpha = frac * 0.8;
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(p.x, p.y, p.size + (1 - frac) * 56, 0, TAU);
        context.stroke();
        context.globalAlpha = 1;
      } else if (p.kind === PARTICLE_SPARK) {
        context.strokeStyle = TONE_COLORS[p.tone];
        context.globalAlpha = frac;
        context.lineWidth = p.size * 0.7;
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        context.stroke();
        context.globalAlpha = 1;
      } else {
        context.fillStyle = p.kind === PARTICLE_MOTE ? PALETTE.gold : '#ffab52';
        context.globalAlpha = p.kind === PARTICLE_MOTE ? 0.9 : 0.55 * frac;
        context.beginPath();
        context.arc(p.x, p.y, p.size * (p.kind === PARTICLE_MOTE ? 1 : frac), 0, TAU);
        context.fill();
        context.globalAlpha = 1;
      }
    }
    context.restore();
  }

  function drawWorld(state) {
    context.drawImage(background, 0, 0);
    drawStarLayer(midStars, state);
    drawStarLayer(nearStars, state);
    drawBeacon(state);
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const star of state.stars) {
      if (star.active) drawStarOrb(star.x, star.y, STAR.radius, star.phase, state.elapsed);
    }
    context.restore();
    for (const shard of state.shards) if (shard.active) drawShard(shard);
    drawParticles(state, false);
    // Carried stars string out along the drone's trail.
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = 0; index < state.carried; index += 1) {
      drawStarOrb(state.carriedPos[index].x, state.carriedPos[index].y, 6.5, index * 1.7, state.elapsed);
    }
    context.restore();
    drawDrone(state);
    drawParticles(state, true);
  }

  function heartPath(cx, cy, s) {
    context.beginPath();
    context.moveTo(cx, cy + s * 0.38);
    context.bezierCurveTo(cx - s * 0.62, cy - s * 0.08, cx - s * 0.36, cy - s * 0.56, cx, cy - s * 0.16);
    context.bezierCurveTo(cx + s * 0.36, cy - s * 0.56, cx + s * 0.62, cy - s * 0.08, cx, cy + s * 0.38);
    context.closePath();
  }

  function drawHud(state) {
    const d = state.drone;
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 30, PALETTE.text, 'left');
    text(formatTime(state.elapsed), FIELD.width / 2, 20, 22, PALETTE.muted, 'center');
    // Carried-star pips under the score.
    for (let index = 0; index < STAR.carryMax; index += 1) {
      const x = 34 + index * 22;
      const y = 66;
      if (index < state.carried) {
        context.fillStyle = PALETTE.gold;
        context.beginPath();
        context.arc(x, y, 6, 0, TAU);
        context.fill();
      } else {
        context.strokeStyle = 'rgba(154, 163, 199, 0.5)';
        context.lineWidth = 1.4;
        context.beginPath();
        context.arc(x, y, 6, 0, TAU);
        context.stroke();
      }
    }
    text(carriedLabel(state.carried), 34 + STAR.carryMax * 22 + 8, 58, 16, PALETTE.muted, 'left');
    if (state.comboTimer > 0 && state.combo > 1) {
      text('COMBO x' + state.combo, 24, 84, 20, PALETTE.gold, 'left');
      context.fillStyle = 'rgba(255, 215, 106, 0.75)';
      context.fillRect(24, 110, 92 * (state.comboTimer / SCORE.comboWindow), 4);
    }
    // Hull hearts, top right.
    for (let index = 0; index < DRONE.hull; index += 1) {
      const cx = FIELD.width - 30 - (DRONE.hull - 1 - index) * 34;
      heartPath(cx, 34, 24);
      if (index < d.hull) {
        context.fillStyle = PALETTE.heart;
        context.fill();
      } else {
        context.strokeStyle = PALETTE.heartEmpty;
        context.lineWidth = 2;
        context.stroke();
      }
    }
    // Pulse-dash cooldown, bottom left.
    text('PULSE', 24, FIELD.height - 46, 14, PALETTE.muted, 'left');
    context.fillStyle = 'rgba(20, 22, 44, 0.8)';
    context.fillRect(24, FIELD.height - 28, 110, 9);
    const ready = d.dashCooldown === 0;
    const fill = 1 - d.dashCooldown / DRONE.dashCooldown;
    context.fillStyle = ready ? PALETTE.gold : PALETTE.teal;
    context.fillRect(24, FIELD.height - 28, 110 * fill, 9);
    if (ready) text('READY', 142, FIELD.height - 31, 14, PALETTE.gold, 'left');
    // Beacon light bar, bottom centre.
    const barW = 380;
    const barX = (FIELD.width - barW) / 2;
    context.textBaseline = 'alphabetic';
    text(state.beacon.light >= 100 ? 'BEACON LIT — ENDLESS DRIFT' : lightLabel(Math.floor(state.beacon.light)), FIELD.width / 2, FIELD.height - 36, 15, state.beacon.light >= 100 ? PALETTE.gold : PALETTE.muted, 'center');
    context.fillStyle = 'rgba(20, 22, 44, 0.8)';
    context.fillRect(barX, FIELD.height - 28, barW, 10);
    if (state.beacon.light > 0) {
      const grad = context.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#ff9a3d');
      grad.addColorStop(1, '#ffd76a');
      context.fillStyle = grad;
      context.fillRect(barX, FIELD.height - 28, barW * (state.beacon.light / 100), 10);
    }
    context.strokeStyle = 'rgba(154, 163, 199, 0.35)';
    context.lineWidth = 1;
    context.strokeRect(barX, FIELD.height - 28, barW, 10);
  }

  function panel(width, height) {
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 11, 28, 0.78)';
    context.strokeStyle = 'rgba(255, 183, 71, 0.35)';
    context.lineWidth = 1.5;
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, 18);
    else context.rect(x, y, width, height);
    context.fill();
    context.stroke();
    return { x, y };
  }

  function drawTitle(state, best) {
    context.save();
    try { context.letterSpacing = '15px'; } catch { /* older engines: spacing is a nicety */ }
    context.textBaseline = 'alphabetic';
    context.shadowColor = 'rgba(255, 170, 70, 0.85)';
    context.shadowBlur = 30;
    text('LUMEN DRIFT', FIELD.width / 2, 196, 82, '#ffe9bd', 'center');
    context.shadowBlur = 0;
    try { context.letterSpacing = '4px'; } catch { /* as above */ }
    text('a nebula garden, lit one star at a time', FIELD.width / 2, 240, 21, PALETTE.teal, 'center');
    try { context.letterSpacing = '0px'; } catch { /* as above */ }
    context.restore();

    panel(700, 218);
    const lines = [
      'Pilot the Ember. The mouse steers her; WASD or the arrow keys thrust.',
      'Fly into fallen stars to gather them — they trail behind you.',
      'Carry them into the Beacon ring at the top to raise its light.',
      'Fill the Beacon to 100% to win. Void shards cost 1 hull — you have 3.',
      'Space or click: pulse dash (briefly untouchable).  P pauses.  M mutes.',
    ];
    context.textBaseline = 'alphabetic';
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, 356 + index * 34, 19, PALETTE.text, 'center');
    }
    const pulse = 0.65 + 0.35 * Math.sin(state.elapsed * 2.6);
    context.globalAlpha = pulse;
    text('Click or press Enter to drift', FIELD.width / 2, 620, 25, PALETTE.gold, 'center');
    context.globalAlpha = 1;
    if (best > 0) text(bestLabel(best), FIELD.width / 2, 656, 18, PALETTE.muted, 'center');
  }

  function drawWin(state, best) {
    panel(660, 330);
    context.save();
    context.textBaseline = 'alphabetic';
    context.shadowColor = 'rgba(255, 200, 90, 0.9)';
    context.shadowBlur = 22;
    text('THE BEACON BURNS BRIGHT', FIELD.width / 2, 268, 38, '#ffe9bd', 'center');
    context.restore();
    const lines = [
      finalLabel(state.score),
      'Time  ' + formatTime(state.winTime),
      'Deliveries  ' + state.deliveries + '   ·   Stars gathered  ' + state.pickups,
      bestLabel(best),
    ];
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, 322 + index * 32, 21, PALETTE.text, 'center');
    }
    text('Press Enter or click to keep drifting — endless mode', FIELD.width / 2, 478, 21, PALETTE.gold, 'center');
    text('Press R for a new garden', FIELD.width / 2, 508, 18, PALETTE.muted, 'center');
  }

  function drawOver(state, best) {
    panel(620, 316);
    context.save();
    context.textBaseline = 'alphabetic';
    context.shadowColor = 'rgba(255, 93, 115, 0.8)';
    context.shadowBlur = 20;
    text('THE LIGHT GOES OUT', FIELD.width / 2, 274, 40, '#ffc9d1', 'center');
    context.restore();
    const lines = [
      finalLabel(state.score),
      bestLabel(best),
      'The Beacon reached ' + Math.floor(state.beacon.light) + '%  ·  adrift for ' + formatTime(state.elapsed),
    ];
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, 328 + index * 32, 21, PALETTE.text, 'center');
    }
    text('Press R or click to drift again', FIELD.width / 2, 478, 22, PALETTE.gold, 'center');
  }

  function drawPaused() {
    panel(420, 170);
    context.textBaseline = 'alphabetic';
    text('PAUSED', FIELD.width / 2, 356, 36, PALETTE.text, 'center');
    text('Press P to resume', FIELD.width / 2, 398, 19, PALETTE.muted, 'center');
  }

  /** Paint one frame: the garden, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_WIN) drawWin(state, best);
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
