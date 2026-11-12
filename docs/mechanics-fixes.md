# Wildbound mechanics fixes

Branch: `fix/wildbound-mechanics`. Shared rules apply to solo and relay games. This branch changes deterministic resources and snapshot fields: deploy relay and client together, relay first. The previous mechanics pass (`ba1162b`) is deployed. This completion pass must also ship relay first.

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

## Completion audit

The reported scope has implementations and regression coverage across all 45 points. This pass replaces remaining generic skill behaviour: single-target tracking curses; forward beams and projectile interception; moving tsunami/smog; four Oryx traps; aimed healing webs; travelling lava and ice trails; three Shark bites; Menhir's baby reset; support areas that affect allies entering later; and separate Axolotl shield anchors. Slowdown values now mean remaining speed. Harmful effects interrupt skills when the pet is weak to the effect's type.

All eight tower upgrades are available. Water heals allies, Rock damages structures, Spectrum creates a pulling vortex, Magic and Repair push enemies, and Blowpipe retains its branch. Supplemental numeric tables close missing spike, food, saddle and tower entries. The official November 5 balance notes supersede older wiki values for Sword damage, guaranteed five-hit Glove knockouts, and cape coverage of caster/skill elements.

`tools/completion-test.mjs` adds 29 targeted regressions. `tools/boss-encounters.mjs` runs six starter and six prepared encounters with real damage, healing, minions and skill cooldowns. With seed 456+boss index, starters are defeated in 4.7–7.0 seconds; counter-type pets, a Sapphire Sword, Knight Helmet, matching cape, food and telegraph dodging clear all six in 44.6–252.6 seconds each. The total of those isolated prepared fights is 662.6 seconds, before travel, resource gathering or season waits. These are automated strategies, not measured human clear times. Fast kills with a strong counter build remain possible; the game does not impose an artificial minimum fight duration.

## Reference and tuning limits

Animal stage tables, item properties, equipment effects and six boss profiles are recorded in the reference modules and [source notes](reference-sources.md). Regression tests cast all 47 species at all three stages, exercise equipment effects, boss rewards, upgrade branches and multiplayer snapshot compatibility.

This is an original implementation with procedural artwork. The reported mechanics are implemented and tested. Exact frame-by-frame parity with the reference game is not established. Resource respawn timers, skill radii, some boss intervals and movement penalties are explicit local tuning where the public reference does not provide an unambiguous number. Damage values omitted by the newer Salamander, Lava Golem, Octopus, Stone Golem and Mantle infoboxes are also explicit local values in `pet-abilities.js`; these skills now deal real damage rather than silently defaulting to zero. The wiki describes Forest as 16 minutes; the implementation follows the user's requested 15 minutes. These limits must remain explicit when reporting completion.
