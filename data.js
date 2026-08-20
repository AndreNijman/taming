// Shared clean-room game data. This module deliberately has no DOM or Worker globals.
export const SEASONS = [
  { id:'forest', name:'Forest', palette:{ background:['#183f35','#245746'], ground:['#467a45','#5f914e'], detail:['#a5ce66','#e4c56a'] }, resources:{ wood:['oak','birch','fallen-log'], stone:['moss-rock','slate'], food:['berry','mushroom'] }, duration:960, ambient:['leaf','fern','firefly'], bossId:'elder-bark' },
  { id:'winter', name:'Frost / Winter', palette:{ background:['#b8d9df','#dcebed'], ground:['#d5e9e8','#eef6f3'], detail:['#79aeba','#f7fcfa'] }, resources:{ wood:['pine','frost-log'], stone:['ice-rock','granite'], food:['winterberry','root'] }, duration:480, ambient:['snowflake','ice-crystal','cold-mist'], bossId:'rimehorn' },
  { id:'darkness', name:'Darkness', palette:{ background:['#111329','#201a38'], ground:['#2d2945','#3d3457'], detail:['#7865a9','#62c6ae'] }, resources:{ wood:['night-tree','hollow-stump'], stone:['moonstone','obsidian'], food:['glowcap','shade-fruit'] }, duration:480, ambient:['mote','wisp','shadow-grass'], bossId:'gloam-eye' },
  { id:'desert', name:'Desert', palette:{ background:['#c06d36','#de9650'], ground:['#d9a45b','#edc57a'], detail:['#8f633f','#f5df9c'] }, resources:{ wood:['dry-palm','thorn-bush'], stone:['sandstone','flint'], food:['cactus-fruit','date'] }, duration:480, ambient:['dust','dry-grass','heat-haze'], bossId:'dune-maw' },
  { id:'ocean', name:'Ocean', palette:{ background:['#0b5870','#117f8d'], ground:['#2c9a91','#61b9a1'], detail:['#c9e29c','#f0d58a'] }, resources:{ wood:['driftwood','mangrove'], stone:['coral-rock','shell-bed'], food:['kelp','coconut'] }, duration:480, ambient:['bubble','foam','sea-grass'], bossId:'deep-crown' },
  { id:'volcano', name:'Volcano', palette:{ background:['#371b1b','#54251f'], ground:['#71352a','#914331'], detail:['#ff8a3d','#ffc65a'] }, resources:{ wood:['char-tree','ember-root'], stone:['basalt','sulfur'], food:['fire-fruit','ash-tuber'] }, duration:480, ambient:['ember','ash','steam-vent'], bossId:'caldera-heart' },
];

export const SEASON_TRANSITION_SECONDS=30;
export function getSeasonTiming(time){
  const cycle=SEASONS.reduce((sum,season)=>sum+season.duration,0);let position=((time%cycle)+cycle)%cycle,index=0;
  while(position>=SEASONS[index].duration){position-=SEASONS[index].duration;index++}
  const transitioning=time>0&&position<SEASON_TRANSITION_SECONDS;
  return {index,elapsed:position,remaining:SEASONS[index].duration-position,blend:transitioning?position/SEASON_TRANSITION_SECONDS:1,previous:(index+SEASONS.length-1)%SEASONS.length};
}

const PET_ROWS = [
  ['moss-pup','Moss Pup','forest','canine','#668c4f','#b4cf74','hound','trail-sense','common',92,14,128],
  ['bramble-boar','Bramble Boar','forest','boar','#715d3e','#b89458','tusked','root-charge','uncommon',132,18,86],
  ['canopy-owl','Canopy Owl','forest','bird','#6d7652','#d6c985','winged','keen-sight','common',72,16,146],
  ['fern-tail','Fern Tail','forest','fox','#9a6743','#6fa75c','long-tail','forage-finder','uncommon',78,15,154],
  ['barkback','Barkback','forest','turtle','#59623f','#a17a45','shelled','bark-guard','rare',156,13,62],
  ['honey-paw','Honey Paw','forest','bear','#8a633a','#e5b95d','round','honey-mend','rare',145,19,78],
  ['reed-hopper','Reed Hopper','forest','rabbit','#8da06b','#e1ddae','long-ear','spring-step','common',65,11,168],
  ['acorn-stag','Acorn Stag','forest','deer','#875c37','#d2a65f','antlered','grove-aura','epic',118,21,132],
  ['sap-slink','Sap Slink','forest','lizard','#55925e','#e2c650','low-slung','sticky-snare','uncommon',76,17,142],
  ['bloom-moth','Bloom Moth','forest','insect','#b97496','#f2d287','four-wing','pollen-cloud','rare',60,20,158],

  ['drift-husky','Drift Husky','winter','canine','#d6e1df','#6e9aaa','hound','snow-dash','common',96,15,134],
  ['tundra-yak','Tundra Yak','winter','bovine','#6e6259','#e9e0cd','horned','warmth-field','uncommon',158,16,68],
  ['flake-owl','Flake Owl','winter','bird','#eef4f0','#8eb3bd','winged','frost-gaze','uncommon',70,18,142],
  ['icewhisker','Icewhisker','winter','cat','#bdd5d8','#587c98','feline','slipstream','common',75,16,158],
  ['glacier-tusk','Glacier Tusk','winter','walrus','#849da3','#f0e2bd','tusked','ice-breaker','rare',172,21,58],
  ['rime-hare','Rime Hare','winter','rabbit','#e4ece8','#85acc2','long-ear','chill-hop','common',64,12,172],
  ['frost-antler','Frost Antler','winter','deer','#b8c8c9','#f0f5eb','antlered','crystal-rush','rare',120,20,125],
  ['sleet-penguin','Sleet Penguin','winter','bird','#283a48','#f4eee0','flippered','slick-slide','uncommon',88,14,118],
  ['polar-puff','Polar Puff','winter','bear','#f0f2e8','#8bc7d4','round','snow-shield','epic',162,22,72],
  ['aurora-mink','Aurora Mink','winter','mustelid','#5b7287','#86e1bd','slender','aurora-feint','rare',73,23,165],

  ['gloom-hound','Gloom Hound','darkness','canine','#2d304d','#8c70b5','hound','shade-step','common',94,17,140],
  ['lantern-bat','Lantern Bat','darkness','bat','#3b3150','#73d9b1','winged','echo-pulse','uncommon',66,18,164],
  ['mire-crow','Mire Crow','darkness','bird','#22243a','#9a86bd','winged','trinket-eye','common',69,15,152],
  ['duskmane','Duskmane','darkness','cat','#34304a','#cc7ed0','feline','night-pounce','rare',83,22,158],
  ['moon-shell','Moon Shell','darkness','turtle','#383957','#80c8c1','shelled','lunar-ward','rare',164,14,58],
  ['wisp-newt','Wisp Newt','darkness','amphibian','#39445b','#66e0bd','low-slung','ghost-lure','uncommon',72,16,144],
  ['hush-spider','Hush Spider','darkness','arachnid','#29263d','#aa79bf','eight-leg','silence-web','uncommon',62,20,150],
  ['veil-ram','Veil Ram','darkness','ovine','#4a4057','#b9a0cc','horned','gloam-ram','rare',137,23,92],
  ['starved-stag','Starved Stag','darkness','deer','#4c465c','#77d5c0','antlered','star-siphon','epic',116,25,128],
  ['oracle-moth','Oracle Moth','darkness','insect','#55416b','#d28fda','four-wing','future-glimpse','legendary',68,28,156],

  ['dune-jackal','Dune Jackal','desert','canine','#b87942','#f0bd68','hound','sand-sprint','common',88,16,152],
  ['pebble-camel','Pebble Camel','desert','camelid','#a9784c','#e8c488','humped','water-cache','common',138,14,84],
  ['sun-kite','Sun Kite','desert','bird','#a85735','#f2d063','winged','updraft','uncommon',67,19,160],
  ['cactus-hog','Cactus Hog','desert','boar','#756c3a','#b9ba52','tusked','thorn-hide','uncommon',142,20,82],
  ['dust-runner','Dust Runner','desert','lizard','#c39351','#724f38','low-slung','burrow-dodge','common',72,15,168],
  ['oasis-ibis','Oasis Ibis','desert','bird','#e5d7b7','#55a7a0','long-beak','healing-spring','rare',74,18,142],
  ['flint-scorp','Flint Scorp','desert','arachnid','#7e5a3d','#e69843','clawed','venom-pinch','rare',98,24,118],
  ['mirage-cat','Mirage Cat','desert','cat','#d7ad72','#6ba8ae','feline','double-image','rare',78,21,164],
  ['mesa-horn','Mesa Horn','desert','bovine','#965d3d','#dfb163','horned','stone-charge','epic',166,26,72],
  ['solar-scarab','Solar Scarab','desert','insect','#59462f','#f4bc35','shelled','sun-flare','legendary',105,29,125],

  ['foam-seal','Foam Seal','ocean','pinniped','#87b9b2','#d9ead8','flippered','tide-roll','common',104,14,126],
  ['coral-crab','Coral Crab','ocean','crustacean','#c76655','#f0ad75','clawed','reef-guard','common',126,17,82],
  ['kelp-otter','Kelp Otter','ocean','mustelid','#6c7563','#9ec78d','slender','shell-toss','uncommon',82,18,158],
  ['spray-gull','Spray Gull','ocean','bird','#e5e1d5','#527d93','winged','gust-cry','common',64,15,166],
  ['ribbon-eel','Ribbon Eel','ocean','fish','#488b98','#e4ce65','serpentine','shock-ribbon','rare',76,22,148],
  ['lagoon-ray','Lagoon Ray','ocean','fish','#477c83','#9bd2bd','wing-fin','glide-wave','uncommon',92,17,139],
  ['anchor-turtle','Anchor Turtle','ocean','turtle','#52766b','#c5bd75','shelled','anchor-stance','rare',174,18,54],
  ['pearl-dolphin','Pearl Dolphin','ocean','cetacean','#6aaab8','#e8e9d9','streamlined','sonic-help','rare',98,21,172],
  ['storm-shark','Storm Shark','ocean','fish','#416c7d','#d2e0d7','fin-back','blood-current','epic',148,27,136],
  ['crown-jelly','Crown Jelly','ocean','cnidarian','#8d76ba','#6fe0ce','bell','static-bloom','legendary',86,30,116],

  ['ash-pup','Ash Pup','volcano','canine','#55433c','#e56a38','hound','ember-fetch','common',91,17,145],
  ['cinder-ram','Cinder Ram','volcano','ovine','#4f413b','#ff9a43','horned','magma-ram','uncommon',139,22,88],
  ['smoke-bat','Smoke Bat','volcano','bat','#3e3b42','#d8654a','winged','smoke-screen','common',65,18,162],
  ['basalt-toad','Basalt Toad','volcano','amphibian','#4b4d42','#e79735','squat','lava-hop','uncommon',118,19,92],
  ['char-talon','Char Talon','volcano','bird','#422f2d','#f38439','winged','scorch-dive','rare',78,25,154],
  ['sulfur-slink','Sulfur Slink','volcano','lizard','#777035','#eec344','low-slung','fume-bite','uncommon',80,21,146],
  ['forge-beetle','Forge Beetle','volcano','insect','#3a3430','#ffad37','shelled','metal-mend','rare',128,20,78],
  ['magma-mole','Magma Mole','volcano','mammal','#49362d','#f1733c','clawed','tunnel-burst','rare',112,24,108],
  ['flare-lion','Flare Lion','volcano','cat','#6f392d','#ffc052','maned','roaring-flame','epic',146,29,126],
  ['pyre-wing','Pyre Wing','volcano','bird','#75332c','#ffd166','four-wing','rebirth-spark','legendary',108,32,150],
];

export const PETS = PET_ROWS.map(([id,name,season,type,color,accent,shape,skill,rarity,hp,attack,speed]) => ({
  id, name, season, type, color, accent, shape, skill, rarity,
  baseStats:{ hp, attack, speed },
}));

export const PET_BY_ID = new Map(PETS.map(pet => [pet.id, pet]));

const item = (id,name,age,slot,branch,category,stats={},cost={}) => ({id,name,age,slot,branch,category,stats,cost});
const primaryStats = {
  sword:{damage:30,range:78,cooldown:.75,power:3}, axe:{damage:34,range:68,cooldown:.96,power:5},
  hammer:{damage:22,range:70,cooldown:.55,power:7}, daggers:{damage:17,range:57,cooldown:.34,power:2},
  spear:{damage:20,range:106,cooldown:.8,power:3}, gloves:{damage:14,range:52,cooldown:.27,power:2},
};
const title = value => value.replaceAll('-',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const items = [
  item('hand','Hand',0,'primary','hand','melee',{damage:8,range:55,cooldown:.45,power:1}),
  item('apple','Apple',0,'food','apple','food',{healing:20}),
  item('wooden-wall','Wooden Wall',0,'wall','wall','building',{health:150},{wood:10}),
  item('wooden-door','Wooden Door',0,'door','door','building',{health:120},{wood:10}),
  item('wooden-spike','Wooden Spike',0,'spike','spike','building',{health:70,damage:10},{wood:20}),
  item('wooden-windmill','Wooden Windmill',0,'windmill','windmill','building',{health:100,income:1},{wood:50}),
];
for(const branch of Object.keys(primaryStats))items.push(item(`stone-${branch}`,`Stone ${title(branch)}`,1,'primary',branch,'melee',primaryStats[branch]));
items.push(
  item('cookie','Cookie',2,'food','food','food',{healing:35}),item('stone-wall','Stone Wall',2,'wall','wall','building',{health:300},{stone:15}),
  item('stone-door','Stone Door',3,'door','door','building',{health:260},{stone:15}),item('stone-spike','Stone Spike',3,'spike','spike','building',{health:110,damage:18},{stone:25}),
  item('big-stone-spike','Big Stone Spike',3,'spike','big-spike','building',{health:180,damage:28},{stone:40,gold:5}),item('stone-windmill','Stone Windmill',3,'windmill','windmill','building',{health:220,income:2},{wood:25,stone:35}),
  item('normal-magic-tower','Normal Magic Tower',3,'tower','magic-tower','building',{health:240,damage:12,range:280},{wood:30,stone:20,gold:10}),item('wooden-turret','Wooden Turret',3,'turret','turret','building',{health:180,damage:14,range:320},{wood:35,gold:8}),
  item('stone-bow','Stone Bow',4,'secondary','bow','ranged',{damage:18,range:310,cooldown:.78}),item('stone-shield','Stone Shield',4,'secondary','shield','shield',{block:22}),item('stone-wrench','Stone Wrench',4,'secondary','wrench','tool',{power:5,repair:20,range:68,cooldown:.45}),
  item('appletor','Appletor',5,'tool','appletor','tool',{tameBonus:.12}),item('slingshot','Slingshot',5,'tool','slingshot','ranged',{damage:8,range:240,cooldown:.5,tameBonus:.08}),item('bug-net','Bug Net',5,'tool','bug-net','tool',{range:70}),item('saddle','Saddle',5,'tool','saddle','tool',{mount:true}),
  item('boost-pad','Boost Pad',8,'pad','boost-pad','building',{health:100,boost:.3},{wood:20,stone:15,gold:10}),item('bear-trap','Bear Trap',8,'pad','bear-trap','building',{health:110,damage:35},{wood:15,stone:25,gold:8}),item('heal-pad','Heal Pad',8,'pad','heal-pad','building',{health:120,healing:5},{wood:20,stone:20,gold:15}),
  item('croissant','Croissant',7,'food','instant-food','food',{healing:15,foodUse:10}),item('sandwich','Sandwich',7,'food','regen-food','food',{healing:8,healOverTime:24,foodUse:12}),item('steak','Steak',7,'food','defense-food','food',{healing:12,defense:.1,foodUse:12}),item('toffee-candy','Toffee Candy',7,'food','speed-food','food',{healing:12,speedBoost:.05,foodUse:10}),
  item('golden-wall','Golden Wall',7,'wall','wall','building',{health:430},{stone:22,gold:8}),
  item('waffle','Waffle',12,'food','instant-food','food',{healing:18,foodUse:12}),item('salad','Salad',12,'food','regen-food','food',{healing:10,healOverTime:36,foodUse:15}),item('eggs','Eggs',12,'food','defense-food','food',{healing:14,defense:.15,foodUse:14}),item('biscuit','Biscuit',12,'food','speed-food','food',{healing:12,speedBoost:.1,foodUse:12}),item('ruby-wall','Ruby Wall',12,'wall','wall','building',{health:560},{stone:28,gold:12}),
  item('cake','Cake',16,'food','instant-food','food',{healing:22,foodUse:15}),item('mushroom-soup','Mushroom Soup',16,'food','regen-food','food',{healing:12,healOverTime:48,foodUse:18}),item('meatballs','Meatballs',16,'food','defense-food','food',{healing:16,defense:.2,foodUse:18}),item('roll-cake','Roll Cake',16,'food','speed-food','food',{healing:15,speedBoost:.15,foodUse:16}),item('amethyst-wall','Amethyst Wall',16,'wall','wall','building',{health:720},{stone:36,gold:18}),
  item('sapphire-wall','Sapphire Wall',20,'wall','wall','building',{health:920},{stone:46,gold:26}),item('amber-wall','Amber Wall',23,'wall','wall','building',{health:1100},{stone:55,gold:35}),
);
const primaryBranches={sword:['sword','katana'],axe:['axe','labrys'],hammer:['hammer','pickaxe'],daggers:['daggers','cleaver'],spear:['spear','naginata'],gloves:['gloves']};
for(const [root,branches] of Object.entries(primaryBranches))for(const branch of branches){const base=primaryStats[root];items.push(item(`golden-${branch}`,`Golden ${title(branch)}`,6,'primary',branch,'melee',{...base,damage:Math.round(base.damage*1.15),power:base.power+1}));for(const [age,tier,mult] of [[11,'ruby',1.28],[15,'amethyst',1.4],[19,'sapphire',1.52],[22,'amber',1.65]])items.push(item(`${tier}-${branch}`,`${title(tier)} ${title(branch)}`,age,'primary',branch,'melee',{...base,damage:Math.round(base.damage*mult),power:base.power+Math.floor(mult*2)}))}
for(const branch of ['bow','crossbow','musket','minigun'])items.push(item(`golden-${branch}`,`Golden ${title(branch)}`,10,'secondary',branch,'ranged',{damage:branch==='musket'?40:branch==='crossbow'?31:branch==='minigun'?9:24,range:branch==='musket'?430:350,cooldown:branch==='minigun'?.18:branch==='musket'?1.25:.7}));
for(const branch of ['shield','crystal-shield','spike-shield'])items.push(item(`golden-${branch}`,`Golden ${title(branch)}`,10,'secondary',branch,'shield',{block:branch==='crystal-shield'?40:30,damage:branch==='spike-shield'?12:0}));
items.push(item('golden-wrench','Golden Wrench',10,'secondary','wrench','tool',{power:8,repair:35,range:72,cooldown:.4}));
for(const branch of ['bow','crossbow','musket','minigun','shield','crystal-shield','spike-shield','wrench'])for(const [age,tier] of [[14,'ruby'],[18,'amethyst'],[21,'sapphire'],[24,'amber']]){const base=items.find(entry=>entry.id===`golden-${branch}`);if(base)items.push(item(`${tier}-${branch}`,`${title(tier)} ${title(branch)}`,age,'secondary',branch,base.category,{...base.stats,damage:Math.round((base.stats.damage||0)*(1+(age-10)*.04)),block:Math.round((base.stats.block||0)*(1+(age-10)*.03))}))}
for(const baseId of ['stone-door','stone-spike','big-stone-spike','stone-windmill','normal-magic-tower','wooden-turret']){const base=items.find(entry=>entry.id===baseId);for(const [age,tier,mult] of [[9,'golden',1.3],[13,'ruby',1.6],[17,'amethyst',1.9],[20,'sapphire',2.25],[23,'amber',2.6],[27,'emerald',3]])items.push(item(`${tier}-${base.branch}`,`${title(tier)} ${title(base.branch)}`,age,base.slot,base.branch,'building',{...base.stats,health:Math.round((base.stats.health||100)*mult),damage:Math.round((base.stats.damage||0)*mult)},Object.fromEntries(Object.entries(base.cost).map(([key,value])=>[key,Math.round(value*mult)]))))}
for(const branch of ['appletor','slingshot','bug-net','saddle']){const base=items.find(entry=>entry.id===branch);items.push(item(`golden-${branch}`,`Golden ${title(branch)}`,25,'tool',branch,base.category,{...base.stats,tameBonus:(base.stats.tameBonus||0)+.1}))}
for(const branch of ['boost-pad','bear-trap','heal-pad']){const base=items.find(entry=>entry.id===branch);items.push(item(`big-${branch}`,`Big ${title(branch)}`,26,'pad',branch,'building',{...base.stats,health:base.stats.health*2},Object.fromEntries(Object.entries(base.cost).map(([key,value])=>[key,Math.round(value*1.8)]))),item(`strong-${branch}`,`Strong ${title(branch)}`,26,'pad',branch,'building',{...base.stats,damage:(base.stats.damage||0)*1.8,healing:(base.stats.healing||0)*1.8,boost:(base.stats.boost||0)*1.5},Object.fromEntries(Object.entries(base.cost).map(([key,value])=>[key,Math.round(value*1.6)]))))}

export const ITEMS=items;
export const STARTING_ITEMS=['hand','apple','wooden-wall','wooden-door','wooden-spike','wooden-windmill'];
export const AGE_CHOICES={
  1:['stone-sword','stone-axe','stone-hammer','stone-daggers','stone-spear','stone-gloves'],
  2:['cookie','stone-wall'],
  3:['stone-door','stone-spike','big-stone-spike','stone-windmill','normal-magic-tower','wooden-turret'],
  4:['stone-bow','stone-shield','stone-wrench'],
  5:['appletor','slingshot','bug-net','saddle'],
  7:['croissant','sandwich','steak','toffee-candy','golden-wall'],
  8:['boost-pad','bear-trap','heal-pad'],
};

const ITEM_LOOKUP=new Map(ITEMS.map(entry=>[entry.id,entry]));
const PRIMARY_EVOLUTIONS={sword:['sword','katana'],axe:['axe','labrys'],hammer:['hammer','pickaxe'],daggers:['daggers','cleaver'],spear:['spear','naginata'],gloves:['gloves']};
export function getAgeChoices(age,loadout){
  const current=slot=>ITEM_LOOKUP.get(loadout.find(id=>ITEM_LOOKUP.get(id)?.slot===slot));
  if(age===6){const branch=current('primary')?.branch||'sword';return(PRIMARY_EVOLUTIONS[branch]||[branch]).map(name=>`golden-${name}`)}
  if(age===10){const branch=current('secondary')?.branch;if(branch==='bow')return['golden-bow','golden-crossbow','golden-musket','golden-minigun'];if(branch==='shield')return['golden-shield','golden-crystal-shield','golden-spike-shield'];if(branch==='wrench')return['golden-wrench'];return[]}
  const primaryTier={11:'ruby',15:'amethyst',19:'sapphire',22:'amber'}[age];if(primaryTier)return[`${primaryTier}-${current('primary')?.branch}`];
  const secondaryTier={14:'ruby',18:'amethyst',21:'sapphire',24:'amber'}[age];if(secondaryTier)return[`${secondaryTier}-${current('secondary')?.branch}`];
  if(age===7)return loadout.includes('cookie')?['croissant','sandwich','steak','toffee-candy']:loadout.includes('stone-wall')?['golden-wall']:[];
  if(age===12||age===16){const food=current('food'),wall=current('wall');if(food?.age>0){const ids={12:{'instant-food':'waffle','regen-food':'salad','defense-food':'eggs','speed-food':'biscuit'},16:{'instant-food':'cake','regen-food':'mushroom-soup','defense-food':'meatballs','speed-food':'roll-cake'}};return[ids[age][food.branch]].filter(Boolean)}if(wall?.age>0)return[age===12?'ruby-wall':'amethyst-wall']}
  const building=loadout.map(id=>ITEM_LOOKUP.get(id)).filter(entry=>entry?.category==='building'&&['door','spike','windmill','tower','turret'].includes(entry.slot)&&entry.age>0).sort((a,b)=>b.age-a.age)[0];
  if(age===23&&current('wall')?.id==='sapphire-wall')return['amber-wall'];
  const buildingTier={9:'golden',13:'ruby',17:'amethyst',20:'sapphire',23:'amber',27:'emerald'}[age];if(buildingTier&&building){const upgrade=`${buildingTier}-${building.branch}`;if(age===20&&current('wall')?.age>0)return[upgrade,'sapphire-wall'];return[upgrade]}
  if(age===25){const tool=current('tool');return tool?[`golden-${tool.branch}`]:[]}
  if(age===26){const pad=current('pad');return pad?[`big-${pad.branch}`,`strong-${pad.branch}`]:[]}
  return AGE_CHOICES[age]||[];
}
