// Keyboard and pointer input. Held keys give live swim directions;
// one-shot presses (dash, confirm, pause, mute) are queued and taken once
// by the loop, so a press between two frames is never lost or counted twice.
import { FIELD } from './config.js';

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const DASH = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
// Keys whose browser default (scrolling) must not fire while playing.
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false };
  let dashQueued = false;
  let confirmQueued = false;
  let pauseQueued = false;
  let muteQueued = false;
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 2 };

  /** Convert a client point to field coordinates via the same fit as the renderer. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    mouse.x = Math.max(0, Math.min(FIELD.width, (clientX - rect.left - offsetX) / scale));
    mouse.y = Math.max(0, Math.min(FIELD.height, (clientY - rect.top - offsetY) / scale));
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (DASH.has(event.code)) {
      if (!event.repeat) dashQueued = true;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) confirmQueued = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) pauseQueued = true;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) muteQueued = true;
    } else return;
    if (PREVENT.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    toField(event.clientX, event.clientY);
  });
  // A click confirms on menus and dashes while swimming; the loop decides
  // which queue it reads, and discards the other one when starting a dive.
  canvas.addEventListener('pointerdown', (event) => {
    toField(event.clientX, event.clientY);
    confirmQueued = true;
    dashQueued = true;
  });

  return {
    /** Live held directions, read every step. */
    get up() { return held.up; },
    get down() { return held.down; },
    get left() { return held.left; },
    get right() { return held.right; },
    /** Mouse position in field coordinates (updated on move and click). */
    mouse,
    /** Edge-triggered presses, each true at most once per press. */
    consumeDash() {
      const taken = dashQueued;
      dashQueued = false;
      return taken;
    },
    consumeConfirm() {
      const taken = confirmQueued;
      confirmQueued = false;
      return taken;
    },
    consumePause() {
      const taken = pauseQueued;
      pauseQueued = false;
      return taken;
    },
    consumeMute() {
      const taken = muteQueued;
      muteQueued = false;
      return taken;
    },
  };
}
