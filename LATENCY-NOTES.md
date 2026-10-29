# Wildbound latency notes (Step 0)

Written before any simulation or rendering change. Line numbers are for
origin/main f291279.

## Authority model: (b), the Durable Object runs the sim

- `GameRoom` (worker.js:75) is one Durable Object per lobby name
  (`env.ROOMS.getByName(roomKey(room))`, worker.js:35-37). It owns the whole
  world: `tick()` (worker.js:141-148) moves players from their held input
  (`applyInput`, worker.js:150), runs bots, animals, structures and resources,
  and resolves every attack, harvest, build and tame.
- Clients send only intent: `{t:'input', x, y, angle, rotation, attack,
  interact, selected}` (game.js:316) plus discrete `choose`, `skill`, `eat`,
  `respawn`, `chat`. Online clients never simulate; `simulateLocal`
  (game.js:231) runs only in single-player CPU mode (game.js:319).
- The client replaces its world with every snapshot
  (`game.world = message.world`, game.js:115) and draws it as is.

## What already hides delay

Almost nothing.

- No interpolation, buffering or prediction. Remote players and animals are
  drawn at the last snapshot's positions (game.js:322-326), so they step at
  10 Hz and every network hiccup shows as a stall then a jump.
- The local player is also drawn from the snapshot, so a key press shows
  only after a full round trip plus up to one snapshot interval (~100 ms) and
  a tick (~50 ms) of server-side waiting.
- The one smoothing is the camera, which eases 12% per frame towards the
  player (game.js:323), so the local player's 10 Hz steps show a little less.
- `currentWorldTime()` (game.js:172) extrapolates the season clock between
  snapshots; it is cosmetic (season label and overlay).
- Action animations (`drawPlayerAction`, game.js:340-349) measure
  `game.world.time - actionAt`, and `world.time` only advances per snapshot,
  so a 0.34 s swing shows in about three steps online.

## Rates and messages

- Server tick 50 ms (`TICK_MS`, worker.js:5) on `setInterval`; dt capped at
  0.1 s.
- Snapshot every >=100 ms (`SNAPSHOT_MS`, worker.js:5 and 146): the whole
  serialized world (190 resources, ~41 animals, all players, structures),
  10/s to every player. Server sim time is `world.time` (seconds), carried in
  every snapshot.
- Client to relay while playing: `input` 20/s (game.js:316), `ping` 1/s
  (game.js:318, only while a world is running), occasional
  `choose`/`skill`/`eat`/`respawn`/`chat`.
- Relay to client: `snapshot` 10/s, `pong` 1/s, `event`, `chat`, `lobby` on
  roster changes, `welcome`, `start`, `error`.

## Room lifecycle

- Create: first socket sends `{t:'create', room, password, name, settings}`
  (worker.js:108-110); the DO is named by `roomKey(room)` (lowercased,
  cleaned, 3-24 chars, worker.js:15).
- Join: `{t:'join', …}` (worker.js:111-116); rejected once started, when
  full, or on a wrong password. The lobby list comes from the `LobbyRegistry`
  DO (worker.js:41-58), which the room upserts every 15 s and on roster
  changes.
- Start ("match start"): the host sends `{t:'start'}`; worker.js:96 calls
  `start()` (worker.js:130-135), which builds the world, seats players, adds
  bots, removes the registry entry and sends `{t:'start', you, world}`.
  Nobody can join after this.
- End: there is no win state. When the last player leaves, `remove()` calls
  `reset()` (worker.js:121-125), which ends the lag record ('closed'). The
  idle TTL (45 min) also resets.

## Item 1 plan

Authority (b), so both halves apply. The wire protocol stays unchanged.

1. **Remote entities** (other players, bots, animals): a snapshot buffer
   keyed on server sim time (`world.time`). The client keeps the smallest
   recent (arrival - server time) offset, renders at
   `now - offset - delay`, where the delay is about the 95th-percentile
   snapshot inter-arrival gap (clamped). It interpolates x, y and angle
   between the two snapshots around that time, extrapolates at most 100 ms
   when the buffer runs dry, and snaps on teleports (respawns, re-spawned
   animals, the boss reset). Health, deaths, actions and everything else still
   come from the newest snapshot. Action and hit animations use the same
   render clock, so swings play smoothly instead of in 100 ms steps.
2. **Local player**: client-side movement prediction from this frame's input
   with the same movement rule and wall collision as the server
   (`applyInput`), reconciled on every snapshot: the server position plus this
   client's own predicted movement over the last round trip (`pinger.rtt`,
   about a tick), with small errors blended out over a few frames and big
   ones (respawn, being pushed) snapped. Facing follows the mouse at once.
   Own swings, shots and builds start their animation locally when pressed,
   cooldown permitting; the server still decides what they hit.
3. Single-player CPU mode is unchanged. `?smooth=0` keeps the old path (raw
   latest snapshot) for comparison.

Measured in `tests/latency/harness.mjs` at 200 ms RTT, ±40 ms jitter:
remote stutter frames and position error, and the local player's
input-to-visible delay, old path against new.

## Result (after the change)

`node tests/latency/harness.mjs` (5 seeds × 120 s, one-way 100 ms ± 40 ms
per message, in order; old path → new):

```
Remote tamer: stutter frames                   100.0 →     3.3 %
Remote tamer: drawn speed error                  289 →       7 px/s
Remote tamer: drawn this far in the past         149 →     215 ms
Remote tamer: distance from where it is now     25.9 →    37.6 px
Own tamer: input to visible movement             284 →       3 ms
Own tamer: off the server position at rest       0.0 →     0.1 px
```

The price is about 65 ms more display delay for other entities (the render
delay that lets the next snapshot arrive), so they are drawn ~12 px further
behind where they really are; in exchange they move every frame instead of
every sixth. About 80% of the remaining 3% "stutter" frames fall within
0.4 s of a start, stop or turn, which any delayed view shows late; the rest
are the render delay adjusting. Combat is unchanged: the server still
resolves hits from its own positions.
