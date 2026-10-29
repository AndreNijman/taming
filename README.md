# Wildbound.io

A clean-room browser survival game inspired by the gathering, building and pet-taming loop of Taming.io. It uses original code, names, visual design and procedural canvas art.

**Play: https://wildbound.andrenijman.com/**

## Features

- One shared world that cycles through six seasons: a 16 minute Forest, then 8 minutes each of Winter, Darkness, Desert, Ocean and Volcano. Resources reset every season, and a gold node stays at the centre.
- Age progression from 40 XP for the first age, with one upgrade choice per age up to age 27: weapon families, bows, shields and wrenches, taming tools, foods, walls, doors, spikes, windmills, turrets and pads.
- 100 HP and no natural regeneration, so food is your healing.
- Sleeping babies you tame with Space. Common starters are easy, while rare animals need the Appletor or Slingshot to raise the odds. A failed attempt makes the baby angry.
- Up to three pets that grow from baby to adult to boss. Each has an elemental type and a skill with a cooldown, and you can order them to defend, attack, stay or move to a spot.
- One stationary boss per season that summons packs as it weakens and drops three sleeping babies when it dies.
- Gold is the score. Windmills earn it over time, and hats cost it. When you die, the killer takes a sixth of your gold, but your pets and buildings stay.
- Solo play against nine CPU tamers, or named public or private lobbies with CPU rivals.
- Solo and multiplayer run the same deterministic simulation (`sim.js`). Multiplayer runs it inside a Cloudflare Durable Object.
- Keyboard and mouse, plus touch controls.

### Code layout

| File | Role |
|---|---|
| `data.js` | Seasons, items, age tree, pets, bosses and hats |
| `sim.js` | Authoritative simulation, bots and snapshot encoding |
| `render.js` | Procedural canvas art for every entity |
| `game.js` | Browser client: menus, input, HUD and drawing |
| `worker.js` | Lobby registry and `GameRoom` Durable Object |

## Development

```bash
npm install
npm run dev
```

Wrangler serves both the static client and Worker during development. For a static-only client:

```bash
npm run serve
```

Add `?relay=http://localhost:8787` to point the client at a local Worker.

## Deployment

The client deploys to GitHub Pages from `.github/workflows/pages.yml`. Multiplayer deploys separately:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run deploy
```

The production client uses `wildbound-relay.tung-tung-tung-sahur.workers.dev`.

## Controls

| Control | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim |
| Click | Hit, gather, build or eat with the selected item |
| 1-9 | Select a hotbar item |
| Space | Tame a nearby sleeping baby |
| Q | Quick eat |
| F | Use pet skills |
| Right click | Send pets to a spot |
| X | Switch pets between defend and attack |
| E | Toggle auto attack |
| L | Lock aim direction |
| M / C | Map / hat shop |
| Enter | Chat |
| Escape | Pause (solo) |

## Tests

```bash
npm run check    # syntax, data and headless simulation tests
npm test         # browser smoke test for solo play
npm run test:mp  # two-browser multiplayer test against wrangler dev
```

No Taming.io source code, assets, text, branding or private protocol information is used by this project.
