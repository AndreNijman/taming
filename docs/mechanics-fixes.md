# Wildbound mechanics fixes

Branch: `fix/wildbound-mechanics`. Shared rules apply to solo and relay games. This branch changes deterministic resources and snapshot fields: deploy relay and client together, relay first. No production deployment has been performed.

## Implemented

| Reports | Changes |
| --- | --- |
| 1, 25 | Trees, stones, bushes, logs and cacti have health and respawn timers. Gold stays indestructible. Destroyed nodes stop blocking movement, placement and projectiles. Buildings delay node respawning. Full resource mutations reach late joiners. |
| 2, 23, 24 | Gathering awards one XP per resource; age cost is `40 * (age + 1)`. Respawn keeps 40% of cumulative XP, restores eligible previous upgrades, and keeps pets. Mills award gold without XP. |
| 3, 4, 40 | Pet release buttons; failed taming wakes and angers wildlife. Tool failure clears the bonus and wakes without aggression. |
| 5, 11, 35 | Naturally evolved wild animals, additional evolved respawns, removal of chase/follow speed multipliers, corrected matching species stats, slower weapon tiers and evolved variants. |
| 6, 38, 39, 44 | Pets roam around ground orders and idle defensive positions. Explicit targets are chased beyond the normal leash and survive incidental attacks. Relay preserves target IDs. |
| 7 | Species skill dispatch includes burst, sustained area effects, drain/heal, slow, poison, fire, lunge, knockback, teleport and rally. Wolf/rabbit/lynx/hedgehog cooldowns use separate stage tables. Hedgehog suppresses buildings/skills. |
| 8, 30 | One world-wide biome, Forest for the requested 15 minutes and the other five for 8 minutes. Visible wildlife and owned pets survive transitions. Pet catch-up teleport only occurs outside human views. |
| 9, 15, 17–19 | Owners can destroy buildings; wrenches repair them. Selection and auto attack do not place buildings. A physical press places once, including if it must wait for a weapon cooldown. Placement is closer and pushes overlapping bodies. Damaged buildings show a health bar for three seconds. |
| 10, 37 | Bites have a 350 ms contact windup; spikes deal damage without velocity knockback. |
| 12, 14 | Stable hotbar order and selection on upgrades; food/wall branches, locked weapon specializations, later cosmetic tiers, secondary branches, net/saddle tools and tool upgrades, and continued turret/tower upgrades. |
| 13 | Persistent keybind settings in pause, conflict swapping, reset, keyboard focus and mobile layout. |
| 16, 21, 26, 36, 43, 45 | Different fixed-facing boss cycles with windups, elemental damage both ways, evolved minion waves, three legendary baby drops and three harvestable gold chests. Ocean boss ink poisons/blinds; whirlpool pulls and grants temporary invulnerability. Turrets/towers acquire wild animals and bosses. |
| 20, 22 | Boost velocity persists beyond the pad. Labrys hits the full circle. |
| 27–29, 34 | Bots use obstacle routing, skip unharvestable insects, heal while moving, choose different primary families, and include aggressive personalities that keep fighting at low health. |
| 31–33 | Damage does not shake the camera. Food press eats once. Punches alternate hands, including across snapshots. |
| 41, 42 | Stronger Knight Helmet speed penalty; corrected wood/miner hats, seasonal defence, pet-XP crown, luck/kill-XP/speed hats, and a separate wings slot with matching weapon bonuses and regeneration. |

## Reference and tuning limits

This remains an original game with procedural art. It is not an exhaustive port of Taming.io's animal, boss or equipment catalogue. Exact per-species abilities, the full hat/accessory catalogue, and every balance value have **not** been verified against gameplay footage. In particular, resource respawn seconds, the Knight speed penalty, added structure-tier values, skill radii and boss timings are Wildbound tuning values; they should not be described as exact wiki parity.

The wiki describes Forest as 16 minutes; this branch deliberately uses the user's requested 15 minutes. Existing species without a matching reference counterpart retain original stats. The major mechanical corrections are testable independently of those balance choices.

Sources consulted:

- [Age and upgrade graph](https://tamingio.fandom.com/wiki/Age)
- [Weapon stats](https://tamingio.fandom.com/wiki/Weapons_List)
- [Animal stats](https://tamingio.fandom.com/wiki/Animals_List)
- [Biomes](https://tamingio.fandom.com/wiki/Biomes)
- [Resource deposits](https://tamingio.fandom.com/wiki/Resource_Deposits), [wood](https://tamingio.fandom.com/wiki/Wood), [stone](https://tamingio.fandom.com/wiki/Stone)
- [Taming](https://tamingio.fandom.com/wiki/Taming)
- [Equipment](https://tamingio.fandom.com/wiki/In-game_Shop)
- [Tree boss](https://tamingio.fandom.com/wiki/Tree_Boss), [Octopus boss](https://tamingio.fandom.com/wiki/Octopus_Boss)
- [Wolf](https://tamingio.fandom.com/wiki/Wolf), [Rabbit](https://tamingio.fandom.com/wiki/Rabbit), [Lynx](https://tamingio.fandom.com/wiki/Lynx), [Hedgehog](https://tamingio.fandom.com/wiki/Hedgehog)

## Verification

- `npm run check`: syntax, progression, long simulation, mechanics regressions, relay command validation, movement prediction and network logging.
- `npm test`: solo browser smoke.
- `npm run test:controls`: persistent keybinds, one-use food, release, click-only placement, season synchronization, wings shop and mobile layout.
- `npm run test:mp`: multiplayer browser smoke with a local relay.
- `npm run test:lobby`, `npm run test:latency`, `npm run test:dev`, `npm run test:dev-smoke`: existing relay integration suites.
- `agent-verify --full` and `git diff --check`.
