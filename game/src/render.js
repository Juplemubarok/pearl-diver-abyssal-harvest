// Presentation only: the reef, the diver, every entity, the HUD and the
// full-screen panels. The 1280x720 logical field is scaled to fit the
// window; everything is drawn on the canvas, no image assets anywhere.
import { DEPTHS, DIVER, EEL, FIELD, FONT, JELLY, LIVES, OXYGEN, PALETTE, PEARL, URCHIN } from './config.js';
import { createRandom } from './random.js';
import { KIND_HEART } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const GROUND_Y = FIELD.groundY ?? 664;
const DEPTH_NAMES = ['Sunlit Shallows', 'Twilight Reef', 'Abyssal Heart'];
const BANNER_MS = 1600;

// Fallback palettes per depth (sunlit teal -> twilight indigo -> abyssal
// violet-black). Any keys Builder A's DEPTHS palettes provide override these.
const DEPTH_PALETTES = [
  {
    top: '#0e5f6b', mid: '#0a3d4d', bottom: '#06222e', rays: 'rgba(190,240,255,0.20)',
    kelp: '#1d7a5a', kelpFar: '#155c46', rock: '#3a4a52', sand: '#274b52',
    glow: '#8ff5d2', pearl: '#eaf7ff', heart: '#ffd75e', jelly: '#ff9de2',
    danger: '#ff5d73', text: '#eaf6f2', muted: '#9fc3bb', panel: 'rgba(4,26,32,0.82)',
    oxygen: '#59e3a5', eel: '#7fb069',
  },
  {
    top: '#1c2a6b', mid: '#141a4d', bottom: '#0a0d2b', rays: 'rgba(150,180,255,0.10)',
    kelp: '#2a4d8f', kelpFar: '#1e3a6e', rock: '#2c3350', sand: '#1d2440',
    glow: '#7fb2ff', pearl: '#eaf7ff', heart: '#ffd75e', jelly: '#c99aff',
    danger: '#ff5d73', text: '#e8ecff', muted: '#9aa8d8', panel: 'rgba(8,12,38,0.82)',
    oxygen: '#59e3a5', eel: '#6fae7e',
  },
  {
    top: '#241640', mid: '#160b2e', bottom: '#070312', rays: 'rgba(190,150,255,0.05)',
    kelp: '#4a2d7a', kelpFar: '#38225e', rock: '#241a33', sand: '#17102a',
    glow: '#b78cff', pearl: '#f4ecff', heart: '#ffd75e', jelly: '#ff8fd0',
    danger: '#ff5d73', text: '#efe8ff', muted: '#a894d8', panel: 'rgba(10,5,26,0.85)',
    oxygen: '#59e3a5', eel: '#8f7fd0',
  },
];

function depthPalette(index) {
  const base = DEPTH_PALETTES[Math.min(Math.max(index | 0, 0), DEPTH_PALETTES.length - 1)];
  const depth = (DEPTHS && DEPTHS[index]) || {};
  const override = depth.palette ?? depth.palettes ?? {};
  return { ...base, ...PALETTE, ...override };
}

function depthName(index) {
  const depth = (DEPTHS && DEPTHS[index]) || {};
  return depth.name ?? DEPTH_NAMES[index] ?? `Depth ${index + 1}`;
}

/** Text that holds a number: rebuilt only when the number changes. */
function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const scoreLabel = cachedLabel('Score ');
  const pearlsLabel = cachedLabel('');
  const bestLabel = cachedLabel('Best ');
  const finalLabel = cachedLabel('Score ');
  const timeLabel = cachedLabel('Time ');

  let prevLives = LIVES;
  let flashStart = -10000;
  let layoutDepth = -1;
  let layout = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(window.innerWidth * ratio));
    const height = Math.max(1, Math.round(window.innerHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    let font = fonts.get(size);
    if (!font) {
      font = `${size}px ${FONT}`;
      fonts.set(size, font);
    }
    context.font = font;
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Kelp strands and rocks for a depth, laid out once from a fixed seed. */
  function layoutFor(depthIndex) {
    if (layoutDepth === depthIndex && layout) return layout;
    const random = createRandom(1000 + depthIndex * 77 + 13);
    const kelpFar = [];
    const kelpNear = [];
    for (let i = 0; i < 16; i += 1) {
      kelpFar.push({ x: 20 + random() * (FIELD.width - 40), h: 90 + random() * 130, phase: random() * Math.PI * 2, lean: (random() - 0.5) * 40 });
    }
    for (let i = 0; i < 10; i += 1) {
      kelpNear.push({ x: 20 + random() * (FIELD.width - 40), h: 150 + random() * 170, phase: random() * Math.PI * 2, lean: (random() - 0.5) * 60 });
    }
    const rocks = [];
    for (let i = 0; i < 9; i += 1) {
      rocks.push({ x: random() * FIELD.width, w: 60 + random() * 130, h: 18 + random() * 34 });
    }
    layoutDepth = depthIndex;
    layout = { kelpFar, kelpNear, rocks };
    return layout;
  }

  function drawBackground(state, pal, elapsed) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, pal.top);
    gradient.addColorStop(0.55, pal.mid);
    gradient.addColorStop(1, pal.bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // God rays near the surface, strongest in the shallows.
    if (pal.rays) {
      context.save();
      context.globalAlpha = 0.55 + 0.2 * Math.sin(elapsed * 0.4);
      context.fillStyle = pal.rays;
      for (let i = 0; i < 5; i += 1) {
        const topX = 120 + i * 250 + Math.sin(elapsed * 0.3 + i * 1.7) * 24;
        context.beginPath();
        context.moveTo(topX, 0);
        context.lineTo(topX + 70, 0);
        context.lineTo(topX + 190, 430);
        context.lineTo(topX + 90, 430);
        context.closePath();
        context.fill();
      }
      context.restore();
    }

    const lay = layoutFor(state.depthIndex | 0);
    // Far kelp, swaying gently.
    context.strokeStyle = pal.kelpFar;
    context.lineWidth = 7;
    context.lineCap = 'round';
    for (const strand of lay.kelpFar) {
      const sway = Math.sin(elapsed * 0.7 + strand.phase) * 14;
      context.beginPath();
      context.moveTo(strand.x, GROUND_Y + 6);
      context.quadraticCurveTo(strand.x + strand.lean * 0.4, GROUND_Y - strand.h * 0.6, strand.x + strand.lean + sway, GROUND_Y - strand.h);
      context.stroke();
    }

    // Seabed: sand, then rocks.
    context.fillStyle = pal.sand;
    context.fillRect(0, GROUND_Y, FIELD.width, FIELD.height - GROUND_Y);
    context.fillStyle = pal.rock;
    for (const rock of lay.rocks) {
      context.beginPath();
      context.ellipse(rock.x, GROUND_Y + 4, rock.w / 2, rock.h, 0, Math.PI, 0);
      context.fill();
    }

    // Near kelp in front of the sand, behind the creatures.
    context.strokeStyle = pal.kelp;
    context.lineWidth = 10;
    for (const strand of lay.kelpNear) {
      const sway = Math.sin(elapsed * 0.9 + strand.phase) * 20;
      context.beginPath();
      context.moveTo(strand.x, GROUND_Y + 6);
      context.quadraticCurveTo(strand.x + strand.lean * 0.4, GROUND_Y - strand.h * 0.6, strand.x + strand.lean + sway, GROUND_Y - strand.h);
      context.stroke();
    }
  }

  function drawBubble(x, y, r) {
    context.strokeStyle = 'rgba(220,245,255,0.75)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(255,255,255,0.5)';
    context.beginPath();
    context.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, Math.PI * 2);
    context.fill();
  }

  function drawMotesAndBubbles(state) {
    const motes = state.motes || [];
    context.fillStyle = 'rgba(220,240,255,0.35)';
    for (const mote of motes) {
      const r = mote.size ?? mote.r ?? mote.radius ?? 2;
      context.beginPath();
      context.arc(mote.x, mote.y, r, 0, Math.PI * 2);
      context.fill();
    }
    const bubbles = state.bubbles || [];
    for (const bubble of bubbles) {
      drawBubble(bubble.x, bubble.y, bubble.r ?? bubble.radius ?? 4);
    }
  }

  function drawVents(state, pal, elapsed) {
    const vents = state.vents || [];
    for (const vent of vents) {
      const active = vent.active !== false && (vent.sleep ?? 0) <= 0;
      // Rocky mound.
      context.fillStyle = pal.rock;
      context.beginPath();
      context.ellipse(vent.x, vent.y + 8, 34, 14, 0, Math.PI, 0);
      context.fill();
      if (active) {
        // Rising bubble column.
        for (let i = 0; i < 4; i += 1) {
          const rise = ((elapsed * 46 + i * 17) % 68);
          drawBubble(vent.x + Math.sin(elapsed * 2 + i * 2.1) * 6, vent.y - rise, 3 + (i % 2));
        }
        context.fillStyle = pal.glow;
        context.globalAlpha = 0.55 + 0.3 * Math.sin(elapsed * 4);
        context.beginPath();
        context.arc(vent.x, vent.y - 2, 7, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      } else {
        context.fillStyle = pal.muted;
        context.globalAlpha = 0.5;
        context.beginPath();
        context.arc(vent.x, vent.y - 2, 5, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
  }

  function isHeart(pearl) {
    return pearl.kind === KIND_HEART;
  }

  function isGone(pearl) {
    return pearl.active === false || pearl.taken === true || pearl.collected === true;
  }

  function drawPearls(state, pal, elapsed) {
    const pearls = state.pearls || [];
    const baseRadius = PEARL.radius ?? 12;
    for (const pearl of pearls) {
      if (isGone(pearl)) continue;
      const heart = isHeart(pearl);
      const radius = heart ? baseRadius * 1.7 : baseRadius;
      const pulse = 1 + 0.12 * Math.sin(elapsed * 3 + (pearl.phase ?? pearl.x * 0.01));
      const glow = context.createRadialGradient(pearl.x, pearl.y, 0, pearl.x, pearl.y, radius * 3.2);
      const glowColor = heart ? PALETTE.heartGlow : PALETTE.pearlGlow;
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalAlpha = heart ? 0.85 : 0.5;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(pearl.x, pearl.y, radius * 3.2, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      // Shell-less pearl: bright core with a hard highlight.
      context.fillStyle = heart ? PALETTE.heartPearl : PALETTE.pearl;
      context.beginPath();
      context.arc(pearl.x, pearl.y, radius * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.9)';
      context.beginPath();
      context.arc(pearl.x - radius * 0.3, pearl.y - radius * 0.35, radius * 0.28, 0, Math.PI * 2);
      context.fill();
      if (heart) {
        // Sparkles around the Heart Pearl.
        context.strokeStyle = PALETTE.heartPearl;
        context.lineWidth = 2;
        for (let i = 0; i < 4; i += 1) {
          const angle = elapsed * 0.8 + (i * Math.PI) / 2;
          const sx = pearl.x + Math.cos(angle) * radius * 2.4;
          const sy = pearl.y + Math.sin(angle) * radius * 2.4;
          context.beginPath();
          context.moveTo(sx - 5, sy);
          context.lineTo(sx + 5, sy);
          context.moveTo(sx, sy - 5);
          context.lineTo(sx, sy + 5);
          context.stroke();
        }
      }
    }
  }

  function drawJellies(state, pal, elapsed) {
    const jellies = state.jellies || [];
    for (const jelly of jellies) {
      const radius = JELLY.radius;
      const phase = jelly.phase ?? 0;
      const pulse = 1 + 0.09 * Math.sin(elapsed * 3 + phase);
      const bellR = radius * pulse;
      const bell = context.createRadialGradient(jelly.x, jelly.y - bellR * 0.3, 0, jelly.x, jelly.y, bellR * 1.4);
      bell.addColorStop(0, pal.jelly);
      bell.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalAlpha = 0.35;
      context.fillStyle = bell;
      context.beginPath();
      context.arc(jelly.x, jelly.y, bellR * 1.4, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.9;
      context.fillStyle = pal.jelly;
      context.beginPath();
      context.arc(jelly.x, jelly.y, bellR, Math.PI, 0);
      context.closePath();
      context.fill();
      // Trailing tentacles, swaying with the drift.
      context.strokeStyle = pal.jelly;
      context.lineWidth = 2;
      context.globalAlpha = 0.75;
      for (let i = -2; i <= 2; i += 1) {
        const startX = jelly.x + (i * bellR) / 2.4;
        const sway = Math.sin(elapsed * 2.4 + phase + i) * 8;
        context.beginPath();
        context.moveTo(startX, jelly.y);
        context.quadraticCurveTo(startX + sway, jelly.y + radius * 1.1, startX + sway * 1.6, jelly.y + radius * 1.9);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
  }

  function drawUrchins(state, pal) {
    const urchins = state.urchins || [];
    for (const urchin of urchins) {
      const radius = URCHIN.radius;
      context.strokeStyle = PALETTE.urchinSpike;
      context.lineWidth = 2;
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        context.beginPath();
        context.moveTo(urchin.x + Math.cos(angle) * radius * 0.5, urchin.y + Math.sin(angle) * radius * 0.5);
        context.lineTo(urchin.x + Math.cos(angle) * radius * 1.5, urchin.y + Math.sin(angle) * radius * 1.5);
        context.stroke();
      }
      context.fillStyle = '#1c1c26';
      context.beginPath();
      context.arc(urchin.x, urchin.y, radius * 0.7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = pal.danger;
      context.beginPath();
      context.arc(urchin.x, urchin.y, radius * 0.3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawEels(state, pal, elapsed) {
    const eels = state.eels || [];
    for (const eel of eels) {
      // Eels patrol on a sine path: the sign of their horizontal velocity
      // (the cosine term) is which way the head points.
      const omega = (eel.speed ?? EEL.patrolSpeed) / (eel.range ?? EEL.patrolRange);
      const moving = Math.cos((state.elapsed ?? 0) * omega + (eel.phase ?? 0)) * (eel.speed ?? EEL.patrolSpeed);
      const dir = moving >= 0 ? 1 : -1;
      const length = eel.length ?? 90;
      const segments = 7;
      const phase = eel.phase ?? 0;
      context.strokeStyle = pal.eel;
      context.lineCap = 'round';
      for (let i = 0; i < segments; i += 1) {
        const t = i / (segments - 1);
        const x = eel.x - dir * t * length;
        const y = eel.y + Math.sin(elapsed * 5 + phase - t * 4) * 7 * t;
        context.lineWidth = 13 - t * 8;
        context.beginPath();
        if (i === 0) context.moveTo(eel.x, eel.y);
        else {
          const px = eel.x - dir * ((i - 1) / (segments - 1)) * length;
          const py = eel.y + Math.sin(elapsed * 5 + phase - ((i - 1) / (segments - 1)) * 4) * 7 * ((i - 1) / (segments - 1));
          context.moveTo(px, py);
        }
        context.lineTo(x, y);
        context.stroke();
      }
      // Head with a pale belly stripe and an eye.
      context.fillStyle = pal.eel;
      context.beginPath();
      context.arc(eel.x, eel.y, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f2f2e8';
      context.beginPath();
      context.arc(eel.x + dir * 6, eel.y + 2, 3.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#101018';
      context.beginPath();
      context.arc(eel.x + dir * 4, eel.y - 3, 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawDiver(state, pal, elapsed) {
    const diver = state.diver;
    if (!diver) return;
    const radius = DIVER.radius ?? 16;
    const facing = (diver.vx ?? 0) >= 0 ? 1 : -1;
    // Blink while invulnerable after a sting.
    if (diver.invulnerable > 0 && Math.floor(diver.invulnerable * 10) % 2 === 0) return;
    context.save();
    context.translate(diver.x, diver.y);
    context.scale(facing, 1);
    const kick = Math.sin(elapsed * 9) * 0.3;
    // Fins, kicking.
    context.fillStyle = PALETTE.fin;
    context.save();
    context.translate(-radius * 1.1, 0);
    context.rotate(-0.5 + kick);
    context.beginPath();
    context.moveTo(0, -4);
    context.lineTo(-radius * 1.1, -9);
    context.lineTo(-radius * 1.1, 9);
    context.closePath();
    context.fill();
    context.restore();
    context.save();
    context.translate(-radius * 1.1, 0);
    context.rotate(-0.5 - kick);
    context.beginPath();
    context.moveTo(0, -4);
    context.lineTo(-radius * 0.9, -8);
    context.lineTo(-radius * 0.9, 8);
    context.closePath();
    context.fill();
    context.restore();
    // Body (wetsuit) and tank.
    context.fillStyle = PALETTE.diverSuit;
    context.beginPath();
    context.ellipse(0, 0, radius * 1.25, radius * 0.72, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#c8ccd4';
    context.beginPath();
    context.ellipse(-radius * 0.15, -radius * 0.62, radius * 0.85, radius * 0.34, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8f959e';
    context.fillRect(-radius * 0.9, -radius * 0.95, radius * 0.22, radius * 0.3);
    // Head, mask and snorkel.
    context.fillStyle = PALETTE.diver;
    context.beginPath();
    context.arc(radius * 1.05, -radius * 0.15, radius * 0.55, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#12333d';
    context.beginPath();
    context.ellipse(radius * 1.15, -radius * 0.2, radius * 0.42, radius * 0.3, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#12333d';
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(radius * 0.9, -radius * 0.6);
    context.quadraticCurveTo(radius * 1.5, -radius * 1.1, radius * 1.5, -radius * 0.4);
    context.stroke();
    // Reaching arm.
    context.strokeStyle = PALETTE.diverSuit;
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(radius * 0.5, radius * 0.3);
    context.lineTo(radius * 1.5, radius * 0.55 + Math.sin(elapsed * 6) * 2);
    context.stroke();
    context.restore();
  }

  function drawParticles(state) {
    const particles = state.particles || [];
    for (const particle of particles) {
      const maxLife = particle.maxLife ?? particle.life ?? 1;
      const life = Math.max(0, particle.life ?? 0);
      const alpha = maxLife > 0 ? life / maxLife : 0;
      if (alpha <= 0) continue;
      context.globalAlpha = alpha;
      context.fillStyle = particle.color ?? '#ffffff';
      const size = particle.size ?? particle.r ?? 3;
      context.beginPath();
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHeart(x, y, size, filled, pal) {
    context.fillStyle = filled ? pal.danger : 'rgba(255,255,255,0.18)';
    context.beginPath();
    context.moveTo(x, y + size * 0.9);
    context.bezierCurveTo(x - size * 1.1, y, x - size * 0.55, y - size * 0.9, x, y - size * 0.25);
    context.bezierCurveTo(x + size * 0.55, y - size * 0.9, x + size * 1.1, y, x, y + size * 0.9);
    context.fill();
  }

  function drawHud(state, ui, pal, elapsed) {
    const maxOxygen = OXYGEN.max ?? 100;
    const oxygen = Math.max(0, state.oxygen ?? maxOxygen);
    context.textBaseline = 'top';
    // Hearts.
    for (let i = 0; i < LIVES; i += 1) {
      drawHeart(36 + i * 34, 30, 11, i < (state.lives ?? 0), pal);
    }
    // Oxygen bar.
    const barX = 30;
    const barY = 56;
    const barW = 210;
    const barH = 16;
    const ratio = oxygen / maxOxygen;
    const low = ratio < 0.25;
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(barX - 3, barY - 3, barW + 6, barH + 6);
    context.fillStyle = low && Math.floor(elapsed * 4) % 2 === 0 ? '#ff8a7a' : pal.oxygen;
    context.fillRect(barX, barY, barW * ratio, barH);
    text('OXYGEN', barX, barY + barH + 5, 13, pal.muted, 'left', 'top');
    // Pearls and depth, centred.
    text(pearlsLabel(`◆ ${state.pearlsGot ?? 0}/${state.pearlsNeeded ?? 0}`), FIELD.width / 2, 20, 26, pal.text, 'center', 'top');
    text(depthName(state.depthIndex | 0), FIELD.width / 2, 50, 16, pal.muted, 'center', 'top');
    // Score and combo, right.
    text(scoreLabel(state.score ?? 0), FIELD.width - 30, 20, 26, pal.text, 'right', 'top');
    const combo = state.combo ?? 0;
    if (combo > 1) {
      const comboWindow = PEARL.comboWindow ?? 3;
      const timerRatio = Math.max(0, Math.min(1, (state.comboTimer ?? 0) / comboWindow));
      text(`COMBO x${combo}`, FIELD.width - 30, 50, 18, pal.heart, 'right', 'top');
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(FIELD.width - 130, 74, 100, 5);
      context.fillStyle = pal.heart;
      context.fillRect(FIELD.width - 130, 74, 100 * timerRatio, 5);
    }
    if (ui.muted) text('MUTED (M)', FIELD.width - 30, FIELD.height - 34, 14, pal.muted, 'right', 'top');
  }

  function drawVignette(pal, elapsed, state) {
    const depth = state.depthIndex | 0;
    const strength = 0.25 + depth * 0.14;
    const vignette = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,10,${strength})`);
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Oxygen-empty edge pulse.
    if ((state.oxygen ?? 1) <= 0) {
      const pulse = 0.12 + 0.08 * Math.sin(elapsed * 6);
      context.strokeStyle = `rgba(255,60,60,${pulse})`;
      context.lineWidth = 26;
      context.strokeRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  /** Rounded rect path, with a plain-rect fallback for older browsers. */
  function panelRect(x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
    } else {
      context.rect(x, y, width, height);
    }
  }

  function drawPanel(title, lines, prompt, pal, accent) {
    const width = 640;
    const lineHeight = 32;
    const height = 150 + lines.length * lineHeight + 74;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = pal.panel;
    panelRect(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = accent || pal.glow;
    context.globalAlpha = 0.55;
    context.lineWidth = 2;
    context.stroke();
    context.globalAlpha = 1;
    context.textBaseline = 'alphabetic';
    context.save();
    context.shadowColor = accent || pal.glow;
    context.shadowBlur = 18;
    text(title, FIELD.width / 2, y + 74, 46, pal.text, 'center');
    context.restore();
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 128 + i * lineHeight, 21, pal.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, accent || pal.heart, 'center');
  }

  function drawBanner(state, ui, pal) {
    if (!ui.depthClearAt) return;
    const age = performance.now() - ui.depthClearAt;
    if (age < 0 || age > BANNER_MS) return;
    const fade = age > BANNER_MS - 300 ? (BANNER_MS - age) / 300 : 1;
    context.save();
    context.globalAlpha = fade;
    context.fillStyle = pal.panel;
    panelRect(FIELD.width / 2 - 260, 128, 520, 92, 16);
    context.fill();
    context.strokeStyle = pal.heart;
    context.lineWidth = 2;
    context.stroke();
    text('DEPTH CLEAR!', FIELD.width / 2, 168, 34, pal.heart, 'center');
    text(`${depthName(state.depthIndex | 0)} conquered  ·  +50 and oxygen bonus`, FIELD.width / 2, 198, 17, pal.text, 'center');
    context.restore();
  }

  /** Paint one frame: field, entities, HUD, then the panel for the screen. */
  function draw(state, screen, ui) {
    const safeUi = ui || {};
    const elapsed = state.elapsed ?? 0;
    const pal = depthPalette(state.depthIndex | 0);

    if ((state.lives ?? LIVES) < prevLives) flashStart = performance.now();
    prevLives = state.lives ?? LIVES;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#04141a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shake = state.shake ?? 0;
    const shakeAmp = shake * 14;
    const shakeX = shakeAmp * Math.sin(elapsed * 91.7) * 0.6;
    const shakeY = shakeAmp * Math.cos(elapsed * 113.3) * 0.6;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);

    drawBackground(state, pal, elapsed);
    drawVents(state, pal, elapsed);
    drawMotesAndBubbles(state);
    drawPearls(state, pal, elapsed);
    drawUrchins(state, pal);
    drawEels(state, pal, elapsed);
    drawJellies(state, pal, elapsed);
    drawDiver(state, pal, elapsed);
    drawParticles(state);
    drawVignette(pal, elapsed, state);

    // Red flash right after a sting, fading fast.
    const flashAge = performance.now() - flashStart;
    if (flashAge >= 0 && flashAge < 350) {
      context.fillStyle = `rgba(255,40,50,${0.22 * (1 - flashAge / 350)})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_TITLE) {
      const lines = [
        'Swim with WASD or arrow keys.  Space or click to dash.',
        'Collect every pearl, mind your oxygen, dodge the reef.',
        'P pause  ·  M mute',
      ];
      if ((safeUi.best ?? 0) > 0) lines.push(bestLabel(safeUi.best));
      drawPanel('PEARL DIVER', ['— Abyssal Harvest —', ...lines], 'Press ENTER to dive', pal);
      return;
    }

    drawHud(state, safeUi, pal, elapsed);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The reef waits for you.'], 'Press P or ENTER to resume', pal);
    } else if (screen === SCREEN_WIN) {
      const lines = [
        finalLabel(state.score ?? 0),
        bestLabel(safeUi.best ?? 0),
        timeLabel(formatTime(state.elapsed)),
        `Pearls ${state.pearlsGot ?? 0}/${state.pearlsNeeded ?? 0}  ·  The Heart Pearl is yours`,
      ];
      drawPanel('THE ABYSS YIELDS', lines, 'Press ENTER to dive again', pal, pal.heart);
    } else if (screen === SCREEN_OVER) {
      const lines = [
        finalLabel(state.score ?? 0),
        bestLabel(safeUi.best ?? 0),
        `Reached ${depthName(state.depthIndex | 0)}`,
      ];
      drawPanel('THE ABYSS KEEPS YOU', lines, 'Press ENTER to try again', pal, pal.danger);
    } else if (screen === SCREEN_PLAY) {
      drawBanner(state, safeUi, pal);
    }
  }

  resize();
  return { draw, resize };
}
