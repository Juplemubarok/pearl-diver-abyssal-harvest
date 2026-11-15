// Screenshot scenes behind ?shot=start|play|abyss|victory|over. Each one
// plays the real rules forward from a fresh world, steered by an autopilot
// (score candidate swim directions by progress toward the target pearl
// minus a hazard penalty over a short horizon), so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { DIVER, EEL, FIELD, JELLY, LIVES, OXYGEN, STEP, URCHIN } from './config.js';
import {
  EVENT_DEPTH_CLEAR,
  EVENT_WIN,
  KIND_EEL,
  KIND_HEART,
  KIND_JELLY,
} from './world.js';
import {
  SCREEN_OVER,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 18;
const ABYSS_SECONDS = 20;
const LIMIT_SECONDS = 600;
const VICTORY_PLACE_SECONDS = 30;
const HORIZON_GOOD = 0.9;
const HORIZON_CARELESS = 0;
const MARGIN = 14;

/** Eight swim directions plus holding still, as unit vectors. */
const DIRECTIONS = [
  [0, 0],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071],
];

function isHeart(pearl) {
  return pearl.kind === KIND_HEART || pearl.heart === true || pearl.kind === 'heart' || pearl.kind === 'heartPearl';
}

function isGone(pearl) {
  return pearl.active === false || pearl.taken === true || pearl.collected === true;
}

/** Hit radius as the world measures it: config tuning by kind, then the entity itself. */
function hazardRadius(hazard) {
  if (hazard.kind === KIND_JELLY) return JELLY.radius ?? 22;
  if (hazard.kind === KIND_EEL) return EEL.radius ?? 17;
  if (typeof hazard.r === 'number') return hazard.r;
  if (typeof hazard.radius === 'number') return hazard.radius;
  // Urchins (and anything unrecognised): body plus half the spike reach.
  return (URCHIN.radius ?? 16) + (URCHIN.spikeReach ?? 10) * 0.5;
}

function hazardList(state) {
  const hazards = [];
  for (const jelly of state.jellies || []) hazards.push(jelly);
  for (const eel of state.eels || []) hazards.push(eel);
  for (const urchin of state.urchins || []) hazards.push(urchin);
  return hazards;
}

/**
 * One autopilot step. `options`: horizon (seconds to look ahead),
 * dash (whether dashing is allowed), heartOnly (chase the Heart Pearl).
 * Returns the input object the world's step() takes.
 */
export function pilotInput(state, options) {
  const opts = options || {};
  const horizon = opts.horizon ?? HORIZON_GOOD;
  const diver = state.diver;
  const maxSpeed = DIVER.maxSpeed ?? 240;
  const diverRadius = DIVER.radius ?? 16;

  // Target: the nearest collectible pearl — or a vent when oxygen is low
  // and no pearl is within immediate reach. A pearl a few strokes away is
  // always finished first: abandoning it for a distant vent burns more
  // oxygen commuting than the detour saves.
  let target = null;
  let targetIsVent = false;
  const oxygen = state.oxygen ?? 100;
  // The Heart Pearl cannot be collected until it is the last one, so never
  // chase it early: the pilot would camp beside it forever.
  const heartOpen = opts.heartOnly || (state.pearlsGot ?? 0) >= (state.pearlsNeeded ?? 1) - 1;
  let nearestPearl = null;
  let nearestPearlDist = opts.farthest ? -Infinity : Infinity;
  for (const pearl of state.pearls || []) {
    if (isGone(pearl)) continue;
    if (isHeart(pearl) && !heartOpen) continue;
    if (opts.heartOnly && !isHeart(pearl)) continue;
    const dist = Math.hypot(pearl.x - diver.x, pearl.y - diver.y);
    // A careless pilot chases the farthest pearl, crossing the whole reef
    // — and every hazard in it — instead of the sensible nearest one.
    const better = opts.farthest ? dist > nearestPearlDist : dist < nearestPearlDist;
    if (better) {
      nearestPearlDist = dist;
      nearestPearl = pearl;
    }
  }
  if (oxygen < 45 && (opts.seekVents ?? true) && nearestPearlDist > 80) {
    let bestVent = null;
    let bestVentDist = Infinity;
    for (const vent of state.vents || []) {
      if (vent.active === false || (vent.sleep ?? 0) > 0) continue;
      const dist = Math.hypot(vent.x - diver.x, vent.y - diver.y);
      if (dist < bestVentDist) {
        bestVentDist = dist;
        bestVent = vent;
      }
    }
    if (bestVent) {
      target = bestVent;
      targetIsVent = true;
    }
  }
  if (!target) target = nearestPearl || { x: FIELD.width / 2, y: FIELD.height / 2 };

  const desiredX = target.x - diver.x;
  const desiredY = target.y - diver.y;
  const desiredLen = Math.hypot(desiredX, desiredY) || 1;
  const wantX = desiredX / desiredLen;
  const wantY = desiredY / desiredLen;

  const hazards = hazardList(state);

  // How far the target is: the closer it is, the more risk the pilot
  // accepts to close the last stretch.
  const distToTarget = Math.hypot(target.x - diver.x, target.y - diver.y);
  const lives = state.lives ?? 3;
  // Is the target guarded? A jelly drifting on a pearl or an urchin on a
  // rock will not move away, so the only way in is to take the hit and
  // grab the pearl inside the invulnerability window. A patrolling eel
  // passes by on its own, so it never counts as a guard — the pilot waits
  // it out instead of charging it.
  let guarded = false;
  for (const hazard of hazards) {
    if (hazard.kind === KIND_EEL) continue;
    if (Math.hypot(hazard.x - target.x, hazard.y - target.y) < hazardRadius(hazard) + diverRadius + 12) {
      guarded = true;
      break;
    }
  }
  // Unguarded targets are always approached cautiously; a guarded one is
  // worth a heart while hearts remain, but never the last one. A guarded
  // pearl is usually worth waiting out — its jelly drifts away on its sine
  // path — so the discount for charging one stays small.
  const commitFloor = guarded ? (lives > 1 ? 0.35 : 0.5) : 0.5;
  const riskFactor = Math.min(1, Math.max(commitFloor, (distToTarget / 180) ** 2));

  // While invulnerable after a sting the diver cannot be hurt, so the
  // pilot stops dodging and uses the window to finish the job.
  const invulnerable = (diver.invulnerable ?? 0) > 0.15;

  // Where a hazard will be `t` seconds from now. Jellies and eels ride
  // sine paths around their anchors (the world's own motion, re-derived
  // here from anchor/range/speed/phase); urchins never move.
  function hazardAt(hazard, t) {
    const at = (state.elapsed ?? 0) + t;
    if (hazard.kind === KIND_JELLY) {
      const omega = (hazard.speed ?? JELLY.driftSpeed) / (hazard.range ?? JELLY.driftRange);
      return {
        x: hazard.anchorX + Math.sin(at * omega + (hazard.phase ?? 0)) * (hazard.range ?? JELLY.driftRange),
        y: hazard.anchorY + Math.sin(at * JELLY.swaySpeed + (hazard.phase ?? 0) * 2) * JELLY.swayAmp,
      };
    }
    if (hazard.kind === KIND_EEL) {
      const omega = (hazard.speed ?? EEL.patrolSpeed) / (hazard.range ?? EEL.patrolRange);
      return {
        x: hazard.anchorX + Math.sin(at * omega + (hazard.phase ?? 0)) * (hazard.range ?? EEL.patrolRange),
        y: hazard.anchorY + Math.sin(at * EEL.wobbleSpeed + (hazard.phase ?? 0)) * EEL.wobbleAmp,
      };
    }
    return { x: hazard.x, y: hazard.y };
  }

  let bestDir = DIRECTIONS[0];
  let bestScore = -Infinity;
  let bestClearance = Infinity;
  // Look ahead only as far as the diver will actually travel before
  // reaching the target (plus a little overshoot): projecting the full
  // horizon past a nearby target punishes the direction toward it with
  // a wall the diver would never reach, and the pilot stalls.
  const lookAhead = Math.min(horizon, distToTarget / maxSpeed + 0.2);
  for (const dir of DIRECTIONS) {
    const [dx, dy] = dir;
    // Progress toward the target (holding still scores poorly).
    let score = dx === 0 && dy === 0 ? -0.6 : dx * wantX + dy * wantY;
    // Sample the path at fractions of the look-ahead; the worst clearance rules,
    // because the diver swims through every intermediate point, not just the end.
    // The prediction is deliberately sluggish (kept momentum + a fraction of
    // full speed in the chosen direction) because inertia swimming cannot
    // turn on a dime. A careless pilot samples only the endpoint, so it
    // notices a hazard far too late to turn away from it.
    const samples = opts.samples ?? 3;
    let minClearance = Infinity;
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = (lookAhead * sample) / samples;
      const px = diver.x + ((diver.vx ?? 0) * 0.7 + dx * maxSpeed * 0.55) * t;
      const py = diver.y + ((diver.vy ?? 0) * 0.7 + dy * maxSpeed * 0.55) * t;
      // Keep off the walls and the seabed.
      if (px < 30 || px > FIELD.width - 30 || py < 24 || py > FIELD.height - 24) score -= 2;
      if (!invulnerable) {
        for (const hazard of hazards) {
          const pos = hazardAt(hazard, t);
          const clearance = Math.hypot(pos.x - px, pos.y - py) - hazardRadius(hazard) - diverRadius - MARGIN;
          if (clearance < minClearance) minClearance = clearance;
        }
      }
    }
    if (minClearance < 0) score -= (10 + -minClearance * 0.15) * riskFactor;
    else if (minClearance < 50) score -= (50 - minClearance) * 0.02 * riskFactor;
    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
      bestClearance = minClearance;
    }
  }

  // Dash when a hazard is close roughly ahead and the whole dash segment
  // along the chosen direction is clear of every hazard, threat included.
  let dash = false;
  if (opts.dash && (diver.dashCooldown ?? 0) <= 0) {
    const [bx, by] = bestDir;
    if (bx !== 0 || by !== 0) {
      let threatNear = false;
      for (const hazard of hazards) {
        const hx = hazard.x - diver.x;
        const hy = hazard.y - diver.y;
        const dist = Math.hypot(hx, hy);
        if (dist < 150 && dist > 1 && (hx * bx + hy * by) / dist > 0.3) {
          threatNear = true;
          break;
        }
      }
      if (threatNear) {
        const reach = (DIVER.dashSpeed ?? 520) * 0.35;
        let blocked = false;
        for (const hazard of hazards) {
          const hx = hazard.x - diver.x;
          const hy = hazard.y - diver.y;
          const along = Math.max(0, Math.min(reach, hx * bx + hy * by));
          const cx = diver.x + bx * along;
          const cy = diver.y + by * along;
          if (Math.hypot(hazard.x - cx, hazard.y - cy) < hazardRadius(hazard) + diverRadius + MARGIN) {
            blocked = true;
            break;
          }
        }
        dash = !blocked;
      }
      // Punch through: the way to a nearby guarded target is blocked on
      // every side. Dash straight in and take the hit — the invulnerability
      // window that follows is exactly when the pilot stops dodging and
      // grabs the target. Only worth it with a heart to spare, or when
      // oxygen is nearly gone, and only when the dash can actually land
      // on the target — punching from far away spends a life for nothing.
      if (!dash && guarded && bestClearance < 0 && distToTarget < 130
        && (lives > 1 || (state.oxygen ?? 100) < 15)) {
        dash = true;
      }
    }
  }

  const [bx, by] = bestDir;
  return {
    up: by < -0.3,
    down: by > 0.3,
    left: bx < -0.3,
    right: bx > 0.3,
    dash,
    _targetIsVent: targetIsVent,
  };
}

/** Step the world with the pilot until `stop` says so or the cap is hit. Returns the last events. */
function runPilot(world, seconds, pilotOptions, stop, harmless = false) {
  let events = 0;
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    events = world.step(STEP, pilotInput(world.state, pilotOptions), harmless);
    if (stop && stop(events, world.state)) break;
  }
  return events;
}

function findHeart(state) {
  for (const pearl of state.pearls || []) {
    if (!isGone(pearl) && isHeart(pearl)) return pearl;
  }
  return null;
}

/**
 * Set `world` to the named scene and return the screen to draw over it
 * and the best score to show. Unknown names stage the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  const good = { horizon: HORIZON_GOOD, dash: true };
  const careless = { horizon: HORIZON_CARELESS, dash: false, samples: 1, seekVents: false, farthest: true };

  if (name === 'play') {
    world.startDepth(0);
    // Stop a couple of pearls short of clearing, so the frame still shows
    // pearls to chase; the 18 s cap covers a slow pilot.
    runPilot(world, PLAY_SECONDS, good, (events, state) => (
      (events & EVENT_DEPTH_CLEAR) !== 0 || (events & EVENT_WIN) !== 0 || state.lives === 0
      || (state.pearlsGot ?? 0) >= (state.pearlsNeeded ?? 8) - 2
    ));
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }

  if (name === 'abyss') {
    world.startDepth(2);
    // Same idea one depth down: stop a few pearls short so the shot stays
    // a mid-dive abyss frame, never a victory frame.
    runPilot(world, ABYSS_SECONDS, good, (events, state) => (
      (events & EVENT_DEPTH_CLEAR) !== 0 || (events & EVENT_WIN) !== 0 || state.lives === 0
      || (state.pearlsGot ?? 0) >= (state.pearlsNeeded ?? 12) - 3
    ));
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }

  if (name === 'victory') {
    world.startDepth(2);
    const needed = world.state.pearlsNeeded ?? 12;
    // Gather all but the last pearl, then walk up to the Heart Pearl.
    const gatherEvents = runPilot(world, LIMIT_SECONDS, good, (events, state) => (
      (events & EVENT_WIN) !== 0 || state.lives === 0 || (state.pearlsGot ?? 0) >= needed - 1
    ));
    // The 11th pearl and the Heart Pearl can fall in the same step.
    if (gatherEvents & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    if (world.state.lives === 0) return { screen: SCREEN_OVER, best: world.state.score };
    const heart = findHeart(world.state);
    if (heart) {
      // Stage the finale with full hearts and a full tank: the gather may
      // have left one heart and low oxygen, and a Heart Pearl guarded by
      // urchins is uncollectable on a single heart — any approach trades a
      // hit for the pearl, which needs a heart to spare. The staged win
      // needs that margin to make the trade.
      world.state.lives = LIVES;
      world.state.oxygen = OXYGEN.max ?? 100;
      // Place Nara beside the Heart Pearl — on a spot clear of urchins
      // and jellies, or the staging itself would sting the diver dead
      // (the seabed around the Heart Pearl is guarded).
      const diverRadius = DIVER.radius ?? 16;
      const offsets = [[-56, 0], [56, 0], [0, -56], [-96, 0], [96, 0], [0, -96], [-56, -56], [56, -56], [-96, -56], [96, -56]];
      let bestSpot = null;
      let bestClearance = -Infinity;
      for (const [dx, dy] of offsets) {
        const x = Math.max(24, Math.min(FIELD.width - 24, heart.x + dx));
        const y = Math.max(24, Math.min(FIELD.height - 24, heart.y + dy));
        let clearance = Infinity;
        for (const hazard of hazardList(world.state)) {
          const gap = Math.hypot(hazard.x - x, hazard.y - y) - hazardRadius(hazard) - diverRadius;
          if (gap < clearance) clearance = gap;
        }
        if (clearance > bestClearance) {
          bestClearance = clearance;
          bestSpot = { x, y };
        }
      }
      world.state.diver.x = bestSpot.x;
      world.state.diver.y = bestSpot.y;
      world.state.diver.vx = 0;
      world.state.diver.vy = 0;
      runPilot(world, VICTORY_PLACE_SECONDS, { ...good, heartOnly: true }, (events, state) => (
        (events & EVENT_WIN) !== 0 || state.lives === 0
      ));
      const won = (world.state.pearlsGot ?? 0) >= needed;
      return { screen: won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }

  if (name === 'over') {
    world.startDepth(0);
    let depth = 0;
    const steps = Math.ceil(LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      const events = world.step(STEP, pilotInput(world.state, careless));
      if (world.state.lives === 0) break;
      if (events & EVENT_WIN) break;
      if (events & EVENT_DEPTH_CLEAR) {
        // A careless pilot can still clear a depth; push on so it can die deeper.
        depth = Math.min(2, depth + 1);
        world.startDepth(depth);
      }
    }
    return { screen: world.state.lives === 0 ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }

  // 'start' and anything else: a few seconds of ambient swimming behind the title.
  // Harmless, so the backdrop never drains oxygen or loses hearts.
  world.startDepth(0);
  runPilot(world, START_SECONDS, good, (events, state) => state.lives === 0, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
