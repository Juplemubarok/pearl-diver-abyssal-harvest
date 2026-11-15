// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, win, over.
//
// ?seed=N fixes the dive. ?shot=start|play|abyss|victory|over (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_DEPTH_CLEAR,
  EVENT_HIT,
  EVENT_OVER,
  EVENT_PEARL,
  EVENT_VENT,
  EVENT_WIN,
} from './world.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import {
  createRenderer,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { pilotInput, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long the depth-clear banner shows before the next depth starts. */
const BANNER_MS = 1600;
/** Title backdrop pilot: careful, dashes, keeps the reef alive. */
const TITLE_PILOT = { horizon: 0.9, dash: true };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

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
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { best: scene.best, muted: false, depthClearAt: scene.depthClearAt ?? null };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  status.textContent = `Pearl Diver screenshot: ${name}.`;
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let depthClearAt = null;
  let pendingDepth = null;

  // Screen readers (and anyone watching the page's text) hear screen changes and each sting.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    depthClearAt = null;
    pendingDepth = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.resume();
    audio.click();
    // The click that started the dive also queued a dash; drop it.
    input.consumeDash();
    announce(`Diving. ${LIVES} hearts. Collect ${world.state.pearlsNeeded} pearls.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Victory! The Heart Pearl is yours. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.over();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    if (input.consumeMute()) {
      audio.setMuted(!audio.muted);
      announce(audio.muted ? 'Muted.' : 'Sound on.');
    }
    const pause = input.consumePause();
    const confirm = input.consumeConfirm();
    if (screen === SCREEN_TITLE || screen === SCREEN_WIN || screen === SCREEN_OVER) {
      if (confirm) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (pause) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (pause || confirm) {
        screen = SCREEN_PLAY;
        audio.resume();
        announce('Diving.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Harmless: the backdrop never drains oxygen or loses hearts.
      const events = world.step(STEP, pilotInput(world.state, TITLE_PILOT), true);
      // The backdrop pilot is careful, but if the reef ever claims it, restart the backdrop.
      if (events & EVENT_OVER) {
        world.reset();
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    // Freeze the world while the depth-clear banner shows.
    if (pendingDepth !== null) return;
    const events = world.step(STEP, {
      up: input.up,
      down: input.down,
      left: input.left,
      right: input.right,
      dash: input.consumeDash(),
    });
    if (events & EVENT_PEARL) audio.pickup(world.state.combo);
    if (events & EVENT_VENT) audio.vent();
    if (events & EVENT_HIT) {
      audio.sting();
      announce(world.state.lives === 1 ? 'Stung! 1 heart left.' : `Stung! ${world.state.lives} hearts left.`);
    }
    if (events & EVENT_WIN) {
      endGame(true);
      return;
    }
    if (events & EVENT_DEPTH_CLEAR) {
      audio.depthClear();
      depthClearAt = performance.now();
      pendingDepth = world.state.depthIndex + 1;
      announce('Depth clear!');
    }
    if (events & EVENT_OVER) endGame(false);
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
    // The banner runs on wall time; advance once it has shown long enough,
    // but not while paused — the next depth starts when play resumes.
    if (screen === SCREEN_PLAY && pendingDepth !== null && depthClearAt !== null && performance.now() - depthClearAt >= BANNER_MS) {
      world.startDepth(pendingDepth);
      pendingDepth = null;
      depthClearAt = null;
      announce(`Depth ${world.state.depthIndex + 1}: ${world.state.pearlsNeeded} pearls.`);
    }
    renderer.draw(world.state, screen, { best, muted: audio.muted, depthClearAt });
  }

  window.addEventListener('resize', () => renderer.resize());

  // Leaving the tab pauses a running dive rather than letting oxygen drain unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Pearl Diver. Press Enter or click to dive.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
