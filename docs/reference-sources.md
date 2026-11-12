# Public mechanics references

Retrieved 2026-11-12 through the public MediaWiki API. Numeric tables are facts, not imported game code. All artwork and simulation code are original.

- [Animal stage statistics](https://tamingio.fandom.com/wiki/Module:Animals/data/stats), overlaid with individual animal page infoboxes when newer. `reference-animals.js` records each species source and all three stages.
- [Item statistics](https://tamingio.fandom.com/wiki/Module:Items/data), supplemented by the Miniguns, Spike Shields, Blowpipes, Big Spikes, Heal Pads, Bear Traps and Boost Pads pages. `reference-items.js` records numeric properties and recipes.
- [Hats](https://tamingio.fandom.com/wiki/Hats) and [Accessories](https://tamingio.fandom.com/wiki/Accessories): equipment families and effects in `equipment-data.js`.
- [Bosses](https://tamingio.fandom.com/wiki/Bosses), Tree Boss, Ice Golem Boss, Mushroom Boss, Rock Golem Boss, Octopus Boss and Volcanic Golem Boss: profiles in `boss-data.js`.
- [Saddles](https://tamingio.fandom.com/wiki/Saddles), [Slingshots](https://tamingio.fandom.com/wiki/Slingshots) and [Spikes](https://tamingio.fandom.com/wiki/Spikes): mount modifiers, tool-failure probabilities and boss contact damage.

Conflicting or absent values are local tuning, not verified parity. Examples include skill hit radii and travel speed, exact boss secondary intervals, resource respawn timers, and numeric Knight movement reduction. Slingshot prose and tables disagree on some ammunition costs. Later cosmetic equipment tiers reuse the final verified tier when no separate reference exists. Forest duration deliberately follows the requested 15 minutes rather than the wiki's 16 minutes.


## Completion audit, 2026-11-12

- Checked individual public animal entries for the 47 shipped species. Complete three-stage basic/skill tables were retrievable for 35 species; the remaining entries retain their earlier recorded tables. Raven, Sea Crab, Giant Moth and Goldfish had numeric differences and were corrected. Species source URLs remain in `reference-animals.js`.
- [White Spider](https://tamingio.fandom.com/wiki/White_Spider): slowdown is the fraction of speed remaining, aimed web, allies healed in the area. The same remaining-speed interpretation applies to the other skill slowdown tables.
- [Cow](https://tamingio.fandom.com/wiki/Cow), [Dog](https://tamingio.fandom.com/wiki/Dog), [Axolotl](https://tamingio.fandom.com/wiki/Axolotl), [Menhir](https://tamingio.fandom.com/wiki/Menhir), [Shark](https://tamingio.fandom.com/wiki/Shark): support limits, shield anchor selection, baby reset and three-hit attack behaviour.
- [Camel](https://tamingio.fandom.com/wiki/Camel), [Fire Dragon](https://tamingio.fandom.com/wiki/Fire_Dragon), [Oryx](https://tamingio.fandom.com/wiki/Oryx), [Seal](https://tamingio.fandom.com/wiki/Seal), [Volcanic Golem](https://tamingio.fandom.com/wiki/Volcanic_Golem): beam geometry, four traps, harmless slippery trail and moving smog.
- [Ice Golem Boss](https://tamingio.fandom.com/wiki/Ice_Golem_Boss): exact 75/50/25% minion stages and counts; [Octopus Boss](https://tamingio.fandom.com/wiki/Octopus_Boss): poisonous ink, pull and temporary invulnerability.
- [Towers](https://tamingio.fandom.com/wiki/Towers), [Spikes](https://tamingio.fandom.com/wiki/Spikes), [Food](https://tamingio.fandom.com/wiki/Food), [Saddles](https://tamingio.fandom.com/wiki/Saddles), [Slingshots](https://tamingio.fandom.com/wiki/Slingshots): supplementary numeric tables in `reference-tables.js`. Where Slingshot prose conflicts with its technical table, ammunition follows the technical table.
- [Official changelog](https://taming.io/changelog/), November 5, 2026: Sword player damage 28/32/36 for Stone/Golden/Ruby; every fifth consecutive Glove hit knocks out; Glove damage to animals is ×1.4; capes protect against the animal's types and its skill element. [Types](https://tamingio.fandom.com/wiki/Types) and current individual type grids establish combined elemental interactions.

The wiki and official articles omit several numeric hit radii, skill timings and newer skill damage values. Those values are local gameplay configuration with deterministic coverage, not fabricated wiki measurements. No gameplay video was available for a reliable frame-count comparison. This does not leave those mechanics unimplemented, but it prevents a claim of exact numerical or visual equivalence.
