// Keyboard and pointer input. Held keys give a thrust direction; the pointer's last position
// steers the drone. One-shot presses (confirm, pause, restart, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and never counted twice.
// What a confirm press means — start, dash, resume, continue — is the loop's business, not ours.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let actions = 0;
  // The pointer in client coordinates; `seen` stays false until it first moves or lands, so a
  // player who never touches the mouse is steered by keys alone.
  const pointer = { x: 0, y: 0, seen: false };

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
  });
  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Held-key thrust: each axis is -1, 0 or 1 (both keys on an axis cancel out). */
    thrust() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    /** The pointer's last client position, and whether there has ever been one. */
    pointer() {
      return pointer;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
