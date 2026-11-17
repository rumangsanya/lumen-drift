// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, victory and game over.
//
// ?seed=N fixes the garden's pattern. ?shot=start|play|beacon|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_DASH, EVENT_DELIVER, EVENT_HIT, EVENT_OVER, EVENT_PICKUP, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;

  // Browsers unlock audio on a gesture; every key press or click offers one.
  window.addEventListener('keydown', () => audio.unlock());
  window.addEventListener('pointerdown', () => audio.unlock());

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function recordBest() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    dashQueued = false;
    screen = SCREEN_PLAY;
    audio.start();
    announce('Playing. Gather stars and light the Beacon. 3 hull.');
  }

  function winGame() {
    screen = SCREEN_WIN;
    recordBest();
    audio.win();
    announce(`The Beacon is lit. Score ${world.state.score}. Press Enter to keep drifting, or R for a new garden.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    recordBest();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        if (actions & ACTION_CONFIRM) dashQueued = true;
        if (actions & ACTION_RESTART) startGame();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_WIN) {
      if (actions & ACTION_RESTART) startGame();
      else if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Endless drift. The Beacon stays lit; the shards keep coming.');
      }
    } else if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
    }
  }

  /** The title screen's backdrop: the Ember idles in a slow circle while the garden drifts. */
  function titleControl() {
    const t = world.state.elapsed;
    return {
      tx: 0, ty: 0, dash: false, hasPointer: true,
      px: FIELD.width / 2 + Math.cos(t * 0.4) * 46,
      py: 520 + Math.sin(t * 0.55) * 26,
    };
  }

  function playControl() {
    const thrust = input.thrust();
    const pointer = input.pointer();
    const control = { tx: thrust.x, ty: thrust.y, px: 0, py: 0, hasPointer: false, dash: dashQueued };
    dashQueued = false;
    if (pointer.seen) {
      const field = renderer.toField(pointer.x, pointer.y);
      control.px = field.x;
      control.py = field.y;
      control.hasPointer = true;
    }
    return control;
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, titleControl(), true);
      return;
    }
    const events = world.step(STEP, playControl(), false);
    if (events & EVENT_PICKUP) audio.pickup(world.state.carried);
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_DELIVER) {
      audio.deliver(world.state.combo);
      announce(world.state.combo > 1
        ? `Delivered. Combo x${world.state.combo}. Beacon at ${Math.floor(world.state.beacon.light)} percent.`
        : `Delivered. Beacon at ${Math.floor(world.state.beacon.light)} percent.`);
    }
    if (events & EVENT_HIT && !(events & EVENT_OVER)) {
      announce(world.state.drone.hull === 1 ? 'Hit. 1 hull left.' : `Hit. ${world.state.drone.hull} hull left.`);
    }
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_WIN) winGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting shards drift unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Drift. Click or press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
