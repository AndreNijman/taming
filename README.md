# Wildbound.io

A clean-room browser survival game inspired by the gathering, building and pet-taming loop of Taming.io. It uses original code, names, visual design and procedural canvas art.

## Features

- Real-time top-down gathering and combat
- Wood, stone, food and gold resources with respawning deposits
- Age progression and six unlockable weapons/buildings
- Walls, traps and automated towers
- Four wild species, sleeping babies, probabilistic taming and three pet evolutions
- Companion following, combat AI and a three-pet limit
- Six rotating biomes, minimap, chat, death and respawn
- Solo play with seven autonomous rival tamers
- Named public/private lobbies with configurable capacity and CPU rivals
- Server-authoritative Cloudflare Durable Object multiplayer
- Desktop, keyboard/mouse and touch controls

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
| Click / Space | Attack, harvest or place |
| E | Tame nearby sleeping baby |
| R | Eat food |
| 1-6 | Select equipment |
| Enter | Chat |
| Escape | Pause |

No Taming.io source code, assets, text, branding or private protocol information is used by this project.
