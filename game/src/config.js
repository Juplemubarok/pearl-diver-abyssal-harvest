// Every tuning number and colour for Pearl Diver — Abyssal Harvest lives here.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, groundY: 664 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const LIVES = 3;

export const DIVER = {
  radius: 16,
  /** Acceleration while a swim key is held, px/s^2. */
  accel: 980,
  /** Top swim speed, px/s. */
  maxSpeed: 265,
  /** Speed while dashing, px/s. */
  dashSpeed: 640,
  /** How long a dash lasts, seconds. */
  dashTime: 0.18,
  /** Seconds between dashes. */
  dashCooldown: 1.2,
  /** Seconds of invulnerability after taking a hit. */
  invulnerable: 1.5,
};

export const OXYGEN = {
  max: 100,
  /** Drain per second, by depth index (0 = shallow). */
  drain: [2.2, 2.7, 3.3],
  /** Oxygen restored by touching an active bubble vent. */
  ventRefill: 40,
  /** Seconds a vent sleeps after being used. */
  ventSleep: 6,
  /** Seconds between heart losses while oxygen is empty. */
  emptyDamageInterval: 2,
};

export const PEARL = {
  radius: 12,
  /** Base points per pearl; multiplied by the current combo. */
  points: 10,
  /** Seconds between pickups before the combo chain breaks. */
  comboWindow: 3,
  /** Highest combo multiplier. */
  maxCombo: 5,
  /** Vertical bob amplitude, px. */
  bobAmp: 7,
  /** Vertical bob speed, rad/s. */
  bobSpeed: 1.6,
};

export const JELLY = {
  radius: 22,
  /** Horizontal drift speed, px/s. */
  driftSpeed: 34,
  /** How far a jellyfish wanders from its anchor, px. */
  driftRange: 90,
  /** Sine-path frequency, rad/s. */
  swaySpeed: 0.9,
  /** Vertical sway amplitude, px. */
  swayAmp: 26,
};

export const URCHIN = {
  radius: 16,
  /** Urchins sit on the seabed; their spikes reach this far. */
  spikeReach: 10,
};

export const EEL = {
  radius: 17,
  /** Horizontal patrol speed, px/s. */
  patrolSpeed: 120,
  /** How far an eel patrols from its anchor, px. */
  patrolRange: 170,
  /** Vertical sine wobble amplitude, px. */
  wobbleAmp: 18,
  /** Vertical wobble frequency, rad/s. */
  wobbleSpeed: 2.1,
};

export const VENT = {
  radius: 26,
  /** Bubble vents per depth. */
  count: 2,
};

/** One entry per depth: name, goal, hazard counts, oxygen drain and palette. */
export const DEPTHS = [
  {
    name: 'Sunlit Shallows',
    pearlsNeeded: 8,
    jellies: 4,
    urchins: 3,
    eels: 0,
    vents: VENT.count,
    drain: OXYGEN.drain[0],
    palette: {
      top: '#1d7f8f',
      mid: '#0e5a72',
      bottom: '#083049',
      ray: 'rgba(190, 240, 235, 0.16)',
      kelp: '#2e8f6a',
      rock: '#3d4a5c',
      mote: 'rgba(210, 245, 235, 0.5)',
    },
  },
  {
    name: 'Twilight Reef',
    pearlsNeeded: 10,
    jellies: 6,
    urchins: 5,
    eels: 2,
    vents: VENT.count,
    drain: OXYGEN.drain[1],
    palette: {
      top: '#2c4a8f',
      mid: '#1b2f63',
      bottom: '#0b1533',
      ray: 'rgba(150, 180, 255, 0.10)',
      kelp: '#2f6f7e',
      rock: '#2c3550',
      mote: 'rgba(170, 200, 255, 0.45)',
    },
  },
  {
    name: 'Abyssal Trench',
    pearlsNeeded: 12,
    jellies: 6,
    urchins: 6,
    eels: 3,
    vents: VENT.count,
    drain: OXYGEN.drain[2],
    palette: {
      top: '#3a2a6e',
      mid: '#1d1445',
      bottom: '#05030f',
      ray: 'rgba(190, 160, 255, 0.07)',
      kelp: '#4a3a7e',
      rock: '#241d3d',
      mote: 'rgba(200, 180, 255, 0.4)',
    },
  },
];

/** Points for clearing a depth, plus a time bonus of remaining oxygen x 2. */
export const DEPTH_CLEAR_POINTS = 50;

export const PALETTE = {
  diver: '#ffd9a0',
  diverSuit: '#2f8f9d',
  fin: '#e07840',
  pearl: '#f4f9ff',
  pearlGlow: 'rgba(180, 230, 255, 0.55)',
  heartPearl: '#ffd76a',
  heartGlow: 'rgba(255, 205, 90, 0.7)',
  jelly: '#ff9ecf',
  jellyGlow: 'rgba(255, 158, 207, 0.45)',
  urchin: '#2b2b33',
  urchinSpike: '#c8c8d8',
  eel: '#7fe0a8',
  eelBelly: '#d8ffe8',
  vent: '#9fe8ff',
  bubble: 'rgba(200, 240, 255, 0.65)',
  particle: '#cfeeff',
  text: '#eef6ff',
  muted: '#9fb4c8',
  heart: '#ff5d73',
  heartEmpty: 'rgba(255, 255, 255, 0.22)',
  oxygen: '#5fd4ff',
  oxygenLow: '#ff7a5c',
  danger: '#ff4d4d',
  panel: 'rgba(4, 12, 24, 0.78)',
  gold: '#ffd76a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'pearl-diver.best';
