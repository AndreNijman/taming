# Wildbound.io

A clean-room browser survival game inspired by the gathering, building and pet-taming loop of Taming.io. It uses original code, names, visual design and procedural canvas art.

**Play: https://wildbound.andrenijman.com/**

## Features

- Real-time top-down gathering and combat
- Wood, stone, food and gold resources with respawning deposits
- Branching age progression with 48 weapons, tools and buildings through age 15
- Walls, traps and automated towers
- 60 wild species across six seasonal rosters, sleeping babies, probabilistic taming and three pet evolutions
- Six code-drawn seasonal world treatments and one boss encounter per season
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
| E | Toggle auto-attack |
| . | Tame nearby sleeping baby |
| B | Eat food |
| 1-3 | Select a companion |
| 4-6 | Use companion skills |
| L | Lock aim direction |
| M / C | World map / field shop |
| U / H / G | Wall / trap / tower |
| Enter | Chat |
| Escape | Pause |

No Taming.io source code, assets, text, branding or private protocol information is used by this project.
