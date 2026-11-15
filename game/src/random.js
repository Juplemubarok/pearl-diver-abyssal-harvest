// A small seeded random number generator (mulberry32): the same seed gives the
// same game, which is what makes `?seed=N` playthroughs and screenshot scenes
// repeatable. Every random value in the game flows through this function.

export function createRandom(seed) {
  let state = (seed | 0) >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
