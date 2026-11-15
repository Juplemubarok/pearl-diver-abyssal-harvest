# Pearl Diver — Abyssal Harvest

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Juplemubarok/pearl-diver-abyssal-harvest/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Juplemubarok/pearl-diver-abyssal-harvest/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Pearl Diver — Abyssal Harvest. You are Nara, a pearl diver in a bioluminescent reef: swim three depths, gather pearls, dodge jellyfish, urchins and moray eels, mind your oxygen, and claim the golden Heart Pearl at the bottom of the abyss.

- Three depths, one dive: Sunlit Shallows, Twilight Reef, Abyssal Heart — each deeper, darker and busier than the last
- A real loop: collect the pearls each depth asks for, chain pickups into a x5 combo, refill oxygen at bubble vents, reach the Heart Pearl to win
- Hazards with their own behaviour: drifting jellyfish, spiky urchins on the rocks, patrolling moray eels
- Feel: inertia swimming, a dash with a bubble trail, screen shake and a red flash on every sting, synthesized WebAudio sound (pickup chimes that rise with your combo, vent bubbles, a victory fanfare)
- Complete: title screen, HUD (hearts, oxygen, pearls, depth, score, combo), pause, depth-clear banners, victory and game-over screens with restart, best score kept between visits
- Fixed 60 Hz simulation, seeded and deterministic (`?seed=N` replays the same dive), no network requests at all

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

Controls: WASD / arrow keys swim, Space or mouse click dash, P or Esc pause, M mute, Enter start / restart.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=k8xtnezb&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
