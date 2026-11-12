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
| 7 | All 47 shipped species have distinct ability dispatch and three sourced evolution-stage records. Includes delayed clones, ice ramparts, projectiles, zones, shields, debuffs, support and targeted dashes. |
| 8, 30 | One world-wide biome, Forest for the requested 15 minutes and the other five for 8 minutes. Visible wildlife and owned pets survive transitions. Pet catch-up teleport only occurs outside human views. |
| 9, 15, 17–19 | Owners can destroy buildings; wrenches repair them. Selection and auto attack do not place buildings. A physical press places once, including if it must wait for a weapon cooldown. Placement is closer and pushes overlapping bodies. Damaged buildings show a health bar for three seconds. |
| 10, 37 | Bites have a 350 ms contact windup; spikes deal damage without velocity knockback. |
| 12, 14 | Stable hotbar order and selection on upgrades; food/wall branches, locked weapon specializations, later cosmetic tiers, secondary branches, net/saddle tools and tool upgrades, and continued turret/tower upgrades. |
| 13 | Persistent keybind settings in pause, conflict swapping, reset, keyboard focus and mobile layout. |
| 16, 21, 26, 36, 43, 45 | Different fixed-facing boss cycles with windups, elemental damage both ways, evolved minion waves, three legendary baby drops and three harvestable gold chests. Ocean boss ink poisons/blinds; whirlpool pulls and grants temporary invulnerability. Turrets/towers acquire wild animals and bosses. |
| 20, 22 | Boost velocity persists beyond the pad. Labrys hits the full circle. |
| 27–29, 34 | Bots use obstacle routing, skip unharvestable insects, heal while moving, choose different primary families, and include aggressive personalities that keep fighting at low health. |
| 31–33 | Damage does not shake the camera. Food press eats once. Punches alternate hands, including across snapshots. |
| 41, 42 | 65 hats and 38 accessories, searchable equipment shop, matching elemental wings/capes, weapon bonuses, status immunity, specialist effects and stronger Knight Helmet penalty. |

## Reference and tuning limits

Animal stage tables, item properties, equipment effects and six boss profiles are recorded in the reference modules and [source notes](reference-sources.md). Regression tests cast all 47 species at all three stages, exercise equipment effects, boss rewards, upgrade branches and multiplayer snapshot compatibility.

This is an original implementation with procedural artwork. The requested mechanics are implemented, but exact gameplay parity has not been established from video. Resource respawn timers, skill radii, some boss intervals and movement penalties remain local tuning where the public reference does not provide an unambiguous number. The wiki describes Forest as 16 minutes; the implementation follows the user's requested 15 minutes. These limits must remain explicit when reporting completion.
