# lumen-drift

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/rumangsanya/lumen-drift/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/rumangsanya/lumen-drift/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**LUMEN DRIFT** — an original canvas arcade game. You pilot the Ember, a small
light-drone, through a dark nebula garden where fallen stars drift in the
black. Gather the stars (they string along your trail, up to five at a time)
and deliver them to the Beacon to raise its light: every star is +10 points
and +10% light, every delivery +50 per star times your combo multiplier.
Jagged void shards patrol the garden — one touch costs a hull plate and
knocks you back; lose all three and the run ends. Fill the Beacon to 100%
light to win, then keep drifting in endless mode for score.

Controls: the mouse steers (the Ember follows with spring and inertia),
WASD / arrow keys thrust, Space or click is a pulse dash (brief
invulnerability, two-second cooldown), P pauses, M mutes, R restarts.
Synth sound effects are generated with WebAudio — no audio files. The game
is plain static files (HTML + ES modules + canvas), no libraries, no network
requests, and plays offline in a desktop browser from its title screen to
its restart.

Deterministic screenshot scenes are built in: open
`game/index.html?shot=start|play|beacon|end&seed=7` and the game stages a
fixed scene from the seeded world (the four files in `screenshots/` were
rendered exactly this way).

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a desktop browser
# (any static file server over game/ works just as well)
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=jsqes0wt&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
