// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const DRONE = {
  radius: 13,
  /** Top speed under pointer steering, px/s. */
  maxSpeed: 360,
  /** How hard the pointer's spring pulls the velocity toward the pointer, per second. */
  steerRate: 7,
  /** Keyboard thrust acceleration, px/s^2. */
  thrust: 980,
  /** Velocity kept per second with no input at all (coasting drag). */
  coast: 0.55,
  hull: 3,
  /** Seconds of blinking invulnerability after a shard hit. */
  hitInvulnerable: 1.6,
  knockback: 430,
  /** The pulse dash: a short burst of speed with brief invulnerability, then a cooldown. */
  dashSpeed: 760,
  dashTime: 0.16,
  dashCooldown: 2,
  dashInvulnerable: 0.3,
};

export const STAR = {
  radius: 10,
  /** How many fallen stars drift in the garden at once. */
  target: 7,
  pool: 12,
  drift: 26,
  points: 10,
  /** How many the drone can carry at once; they trail behind it until delivered. */
  carryMax: 5,
  /** Beacon light one delivered star adds, percent. Ten stars fill the Beacon. */
  light: 10,
};

export const SHARD = {
  pool: 12,
  /** Shards in play at the start, and the most there can ever be. */
  first: 5,
  max: 10,
  /** One more shard joins every this-many seconds, up to the cap. */
  growSeconds: 45,
  minRadius: 17,
  maxRadius: 30,
  minSpeed: 18,
  maxSpeed: 58,
  maxSpin: 0.7,
};

export const BEACON = { x: 640, y: 118, radius: 54 };

export const SCORE = {
  /** Points per star delivered, before the combo multiplier. */
  delivery: 50,
  /** Seconds after a delivery in which the next one raises the combo. */
  comboWindow: 5,
  comboMax: 5,
};

/** Object pools, allocated once at boot: particles and the drone's position trail. */
export const PARTICLE_POOL = 260;
export const TRAIL_LENGTH = 96;
/** Trail steps between one carried star and the next, so they string out behind the drone. */
export const TRAIL_GAP = 7;

export const PALETTE = {
  backdrop: '#04050d',
  deep: '#070818',
  text: '#eef1ff',
  muted: '#9aa3c7',
  ember: '#ffb347',
  emberHot: '#ff7847',
  gold: '#ffd76a',
  heart: '#ff5d73',
  heartEmpty: '#3a3350',
  violet: '#9d7bff',
  teal: '#3fd9c0',
  droneBody: '#ffd9a0',
  droneCore: '#fff3d6',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-drift.best';
