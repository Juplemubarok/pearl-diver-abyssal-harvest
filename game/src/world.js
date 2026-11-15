// The game's rules and state, with no drawing and no browser in it: the diver,
// pearls, hazards, vents, oxygen, score and combo. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sound,
// screens, shake) without the world knowing about screens or sound. All
// randomness comes from the seeded random passed to createWorld, so the same
// seed always plays the same game.

import {
  DEPTH_CLEAR_POINTS,
  DEPTHS,
  DIVER,
  EEL,
  FIELD,
  JELLY,
  LIVES,
  OXYGEN,
  PEARL,
  URCHIN,
  VENT,
} from './config.js';

export const KIND_PEARL = 0;
export const KIND_HEART = 1;
export const KIND_JELLY = 2;
export const KIND_URCHIN = 3;
export const KIND_EEL = 4;
export const KIND_VENT = 5;

export const EVENT_PEARL = 1;
export const EVENT_HIT = 2;
export const EVENT_VENT = 4;
export const EVENT_DEPTH_CLEAR = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function circleHit(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) < r * r;
}

export function createWorld(random) {
  const diver = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    // Unit vector of the last swim direction; the dash follows it.
    fx: 1,
    fy: 0,
    invulnerable: 0,
    dashCooldown: 0,
    dashTime: 0,
  };

  const state = {
    diver,
    pearls: [],
    jellies: [],
    urchins: [],
    eels: [],
    vents: [],
    bubbles: [],
    motes: [],
    particles: [],
    score: 0,
    combo: 0,
    comboTimer: 0,
    lives: LIVES,
    oxygen: OXYGEN.max,
    depthIndex: 0,
    pearlsNeeded: DEPTHS[0].pearlsNeeded,
    pearlsGot: 0,
    elapsed: 0,
    shake: 0,
    // Seconds until the next heart loss while oxygen is empty.
    oxygenDamageTimer: OXYGEN.emptyDamageInterval,
    bubbleTimer: 0,
    // True once the depth-clear event for the current depth has fired.
    depthCleared: false,
    over: false,
  };

  function spawnParticle(x, y, vx, vy, life, size, color) {
    state.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  function burst(x, y, count, speed, color, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * TAU;
      const v = speed * (0.4 + random() * 0.6);
      spawnParticle(
        x,
        y,
        Math.cos(angle) * v,
        Math.sin(angle) * v,
        0.45 + random() * 0.4,
        size * (0.7 + random() * 0.6),
        color,
      );
    }
  }

  function farFromDiver(x, y, minDist) {
    return dist2(x, y, diver.x, diver.y) > minDist * minDist;
  }

  function placePearl(kind) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = 70 + random() * (FIELD.width - 140);
      const y = 110 + random() * (FIELD.groundY - 190);
      if (!farFromDiver(x, y, 90)) continue;
      let crowded = false;
      for (const other of state.pearls) {
        if (dist2(x, y, other.x, other.baseY) < 70 * 70) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      return {
        kind,
        x,
        baseY: y,
        y,
        phase: random() * TAU,
        taken: false,
      };
    }
    // Fallback: accept any open-water spot rather than dropping a pearl.
    const x = 90 + random() * (FIELD.width - 180);
    const y = 130 + random() * (FIELD.groundY - 220);
    return { kind, x, baseY: y, y, phase: random() * TAU, taken: false };
  }

  function placeJelly() {
    const anchorX = 90 + random() * (FIELD.width - 180);
    const anchorY = 120 + random() * (FIELD.groundY - 260);
    return {
      kind: KIND_JELLY,
      anchorX,
      anchorY,
      x: anchorX,
      y: anchorY,
      phase: random() * TAU,
      range: JELLY.driftRange * (0.7 + random() * 0.6),
      speed: JELLY.driftSpeed * (0.8 + random() * 0.4),
    };
  }

  function placeUrchin() {
    return {
      kind: KIND_URCHIN,
      x: 60 + random() * (FIELD.width - 120),
      y: FIELD.groundY - URCHIN.radius * 0.4,
      phase: random() * TAU,
    };
  }

  function placeEel() {
    const anchorX = 200 + random() * (FIELD.width - 400);
    const anchorY = 200 + random() * (FIELD.groundY - 320);
    return {
      kind: KIND_EEL,
      anchorX,
      anchorY,
      x: anchorX,
      y: anchorY,
      phase: random() * TAU,
      range: EEL.patrolRange * (0.7 + random() * 0.6),
      speed: EEL.patrolSpeed * (0.85 + random() * 0.3),
    };
  }

  function placeVent() {
    return {
      kind: KIND_VENT,
      x: 110 + random() * (FIELD.width - 220),
      y: FIELD.groundY - 34,
      sleep: 0,
      phase: random() * TAU,
    };
  }

  function spawnMotes() {
    state.motes.length = 0;
    for (let i = 0; i < 46; i += 1) {
      state.motes.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        size: 1 + random() * 2.2,
        drift: 6 + random() * 14,
        phase: random() * TAU,
      });
    }
  }

  function spawnBubbles() {
    state.bubbles.length = 0;
    for (let i = 0; i < 12; i += 1) {
      state.bubbles.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        r: 2 + random() * 4,
        speed: 26 + random() * 40,
        wobble: random() * TAU,
      });
    }
  }

  function startDepth(index) {
    const depth = DEPTHS[index];
    state.depthIndex = index;
    state.pearlsNeeded = depth.pearlsNeeded;
    state.pearlsGot = 0;
    state.depthCleared = false;
    state.oxygen = OXYGEN.max;
    state.oxygenDamageTimer = OXYGEN.emptyDamageInterval;
    state.combo = 0;
    state.comboTimer = 0;

    diver.x = 120;
    diver.y = 130;
    diver.vx = 0;
    diver.vy = 0;
    diver.fx = 1;
    diver.fy = 0;
    diver.dashCooldown = 0;
    diver.dashTime = 0;
    diver.invulnerable = 0;

    state.pearls.length = 0;
    state.jellies.length = 0;
    state.urchins.length = 0;
    state.eels.length = 0;
    state.vents.length = 0;
    state.particles.length = 0;

    // Depth 3: the last pearl is the golden Heart Pearl, resting on the
    // seabed at the centre, guarded by the eels. It counts as the final
    // pearl, so the depth cannot clear without it.
    const normalCount = index === 2 ? depth.pearlsNeeded - 1 : depth.pearlsNeeded;
    for (let i = 0; i < normalCount; i += 1) state.pearls.push(placePearl(KIND_PEARL));
    if (index === 2) {
      state.pearls.push({
        kind: KIND_HEART,
        x: FIELD.width / 2,
        baseY: FIELD.groundY - PEARL.radius - 6,
        y: FIELD.groundY - PEARL.radius - 6,
        phase: 0,
        taken: false,
      });
    }
    for (let i = 0; i < depth.jellies; i += 1) state.jellies.push(placeJelly());
    for (let i = 0; i < depth.urchins; i += 1) state.urchins.push(placeUrchin());
    for (let i = 0; i < depth.eels; i += 1) state.eels.push(placeEel());
    for (let i = 0; i < depth.vents; i += 1) state.vents.push(placeVent());

    spawnMotes();
    spawnBubbles();
  }

  function reset() {
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.lives = LIVES;
    state.elapsed = 0;
    state.shake = 0;
    state.over = false;
    state.oxygenDamageTimer = OXYGEN.emptyDamageInterval;
    state.bubbleTimer = 0;
    startDepth(0);
  }

  function hurt(fromX, fromY) {
    state.lives -= 1;
    diver.invulnerable = DIVER.invulnerable;
    state.shake = 1;
    state.combo = 0;
    state.comboTimer = 0;
    // Knockback away from whatever hit the diver.
    const dx = diver.x - fromX;
    const dy = diver.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    diver.vx = (dx / len) * 420;
    diver.vy = (dy / len) * 420;
    burst(diver.x, diver.y, 14, 170, '#ff8fa0', 3);
    if (state.lives <= 0) {
      state.over = true;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  /**
   * One fixed step. `input` is {up, down, left, right, dash} where dash is
   * edge-triggered by the caller (true only on the step the dash starts).
   * With `harmless` set, hazards never hurt and nothing scores — used for
   * the title screen's ambient reef backdrop. Returns event bit flags.
   */
  function step(dt, input, harmless = false) {
    let events = 0;
    state.elapsed += dt;

    // --- Diver movement: inertia-based swimming. ---
    let ax = 0;
    let ay = 0;
    if (input.left) ax -= 1;
    if (input.right) ax += 1;
    if (input.up) ay -= 1;
    if (input.down) ay += 1;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      ax /= len;
      ay /= len;
      diver.fx = ax;
      diver.fy = ay;
    }

    if (diver.dashTime > 0) {
      diver.dashTime -= dt;
      diver.vx = diver.fx * DIVER.dashSpeed;
      diver.vy = diver.fy * DIVER.dashSpeed;
    } else {
      diver.vx += ax * DIVER.accel * dt;
      diver.vy += ay * DIVER.accel * dt;
      // Water drag: coast to a stop when no key is held.
      const drag = ax === 0 && ay === 0 ? 3.2 : 0.9;
      const damp = Math.max(0, 1 - drag * dt);
      diver.vx *= damp;
      diver.vy *= damp;
      const speed = Math.hypot(diver.vx, diver.vy);
      if (speed > DIVER.maxSpeed) {
        diver.vx = (diver.vx / speed) * DIVER.maxSpeed;
        diver.vy = (diver.vy / speed) * DIVER.maxSpeed;
      }
    }

    if (input.dash && diver.dashCooldown <= 0 && diver.dashTime <= 0 && !harmless) {
      diver.dashTime = DIVER.dashTime;
      diver.dashCooldown = DIVER.dashCooldown;
      burst(diver.x, diver.y, 8, 90, '#cfeeff', 2.5);
    }
    if (diver.dashCooldown > 0) diver.dashCooldown -= dt;
    if (diver.invulnerable > 0) diver.invulnerable = Math.max(0, diver.invulnerable - dt);

    diver.x = clamp(diver.x + diver.vx * dt, DIVER.radius, FIELD.width - DIVER.radius);
    diver.y = clamp(diver.y + diver.vy * dt, DIVER.radius + 8, FIELD.groundY - DIVER.radius);

    // Dashing leaves a bubble trail.
    if (diver.dashTime > 0) {
      state.bubbles.push({
        x: diver.x - diver.fx * DIVER.radius,
        y: diver.y - diver.fy * DIVER.radius + (random() - 0.5) * 10,
        r: 2 + random() * 3,
        speed: 60 + random() * 50,
        wobble: random() * TAU,
      });
    }

    // --- Ambient life: bobbing pearls, drifting jellies, patrolling eels. ---
    for (const pearl of state.pearls) {
      if (pearl.taken) continue;
      pearl.y =
        pearl.baseY + (pearl.kind === KIND_HEART ? 3 : PEARL.bobAmp) * Math.sin(state.elapsed * PEARL.bobSpeed + pearl.phase);
    }
    for (const jelly of state.jellies) {
      jelly.x = jelly.anchorX + Math.sin(state.elapsed * (jelly.speed / jelly.range) + jelly.phase) * jelly.range;
      jelly.y = jelly.anchorY + Math.sin(state.elapsed * JELLY.swaySpeed + jelly.phase * 2) * JELLY.swayAmp;
    }
    for (const eel of state.eels) {
      eel.x = eel.anchorX + Math.sin(state.elapsed * (eel.speed / eel.range) + eel.phase) * eel.range;
      eel.y = eel.anchorY + Math.sin(state.elapsed * EEL.wobbleSpeed + eel.phase) * EEL.wobbleAmp;
    }
    for (const vent of state.vents) {
      if (vent.sleep > 0) vent.sleep -= dt;
    }

    // Rising bubbles (ambient + vent streams).
    state.bubbleTimer -= dt;
    if (state.bubbleTimer <= 0) {
      state.bubbleTimer = 0.28 + random() * 0.4;
      state.bubbles.push({
        x: random() * FIELD.width,
        y: FIELD.height + 6,
        r: 2 + random() * 4,
        speed: 26 + random() * 40,
        wobble: random() * TAU,
      });
    }
    for (let i = state.bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = state.bubbles[i];
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(state.elapsed * 2 + bubble.wobble) * 12 * dt;
      if (bubble.y < -10) state.bubbles.splice(i, 1);
    }

    // Drifting plankton motes.
    for (const mote of state.motes) {
      mote.x += Math.sin(state.elapsed * 0.4 + mote.phase) * mote.drift * dt;
      mote.y -= mote.drift * 0.35 * dt;
      if (mote.y < -4) {
        mote.y = FIELD.height + 4;
        mote.x = random() * FIELD.width;
      }
      if (mote.x < -4) mote.x = FIELD.width + 4;
      if (mote.x > FIELD.width + 4) mote.x = -4;
    }

    // Particles fade and drift.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt - 24 * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy *= 1 - 2.4 * dt;
    }

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);

    if (harmless || state.over || state.depthCleared) return events;

    // --- Oxygen: drains faster in deeper water; empty lungs cost hearts. ---
    const depth = DEPTHS[state.depthIndex];
    state.oxygen = Math.max(0, state.oxygen - depth.drain * dt);
    if (state.oxygen <= 0) {
      state.oxygenDamageTimer -= dt;
      if (state.oxygenDamageTimer <= 0) {
        state.oxygenDamageTimer += OXYGEN.emptyDamageInterval;
        events |= hurt(diver.x, diver.y - 40);
        if (state.over) return events;
      }
    } else {
      state.oxygenDamageTimer = OXYGEN.emptyDamageInterval;
    }

    // --- Combo timer. ---
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // --- Pearl pickups. ---
    for (const pearl of state.pearls) {
      if (pearl.taken) continue;
      if (!circleHit(diver.x, diver.y, DIVER.radius, pearl.x, pearl.y, PEARL.radius + 4)) continue;
      pearl.taken = true;
      state.pearlsGot += 1;
      state.combo = state.comboTimer > 0 ? Math.min(PEARL.maxCombo, state.combo + 1) : 1;
      state.comboTimer = PEARL.comboWindow;
      state.score += PEARL.points * state.combo;
      burst(pearl.x, pearl.y, 10, 130, pearl.kind === KIND_HEART ? '#ffd76a' : '#cfeeff', 3);
      events |= EVENT_PEARL;
    }

    // --- Bubble vents refill oxygen, then sleep. ---
    for (const vent of state.vents) {
      if (vent.sleep > 0) continue;
      if (!circleHit(diver.x, diver.y, DIVER.radius, vent.x, vent.y, VENT.radius)) continue;
      state.oxygen = Math.min(OXYGEN.max, state.oxygen + OXYGEN.ventRefill);
      vent.sleep = OXYGEN.ventSleep;
      burst(vent.x, vent.y - 10, 12, 110, '#9fe8ff', 3);
      events |= EVENT_VENT;
    }

    // --- Hazards: one hit costs a heart, knockback and brief invulnerability. ---
    if (diver.invulnerable <= 0) {
      for (const jelly of state.jellies) {
        if (circleHit(diver.x, diver.y, DIVER.radius, jelly.x, jelly.y, JELLY.radius)) {
          events |= hurt(jelly.x, jelly.y);
          break;
        }
      }
      if (!(events & EVENT_HIT)) {
        for (const urchin of state.urchins) {
          if (
            circleHit(
              diver.x,
              diver.y,
              DIVER.radius,
              urchin.x,
              urchin.y,
              URCHIN.radius + URCHIN.spikeReach * 0.5,
            )
          ) {
            events |= hurt(urchin.x, urchin.y);
            break;
          }
        }
      }
      if (!(events & EVENT_HIT)) {
        for (const eel of state.eels) {
          if (circleHit(diver.x, diver.y, DIVER.radius, eel.x, eel.y, EEL.radius)) {
            events |= hurt(eel.x, eel.y);
            break;
          }
        }
      }
      if (state.over) return events;
    }

    // --- Depth clear / win. ---
    if (!state.depthCleared && state.pearlsGot >= state.pearlsNeeded) {
      state.depthCleared = true;
      state.score += DEPTH_CLEAR_POINTS + Math.round(state.oxygen * 2);
      if (state.depthIndex >= DEPTHS.length - 1) {
        events |= EVENT_WIN;
      } else {
        events |= EVENT_DEPTH_CLEAR;
      }
    }

    return events;
  }

  reset();
  return { state, reset, startDepth, step };
}
