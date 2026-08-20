import { SEASONS, PETS, PET_BY_ID, ITEMS as ITEM_CATALOG, STARTING_ITEMS, getAgeChoices } from './data.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const TAU = Math.PI * 2;
const WORLD_W = 3200, WORLD_H = 2400;
const COLORS = ['#f0c95d','#79a966','#d96f59','#6fa8a4','#977ab2','#d99555','#7b93c5','#b66c85','#8f9e55','#c7794f'];
const BOT_NAMES = ['Fern','Kestrel','Mochi','Bramble','Juniper','Pip','Rowan','Clover','Wren','Taro','Mallow','Ash'];
const ITEM_BY_ID = new Map(ITEM_CATALOG.map(item => [item.id, item]));
const itemCost = item => Object.entries(item?.cost || {}).filter(([,value])=>value).map(([key,value])=>`${value}${key[0].toUpperCase()}`).join(' ');

const game = {
  mode:null, ws:null, room:'', id:null, host:false, running:false, paused:false, dead:false,
  world:null, input:{ x:0, y:0, angle:0, attack:false, interact:false, selected:0 },
  keys:new Set(), pointer:{ x:0, y:0, down:false }, camera:{ x:0, y:0 },
  last:performance.now(), sendAt:0, localTick:0, feed:[], selected:0, selectedPet:0,
  autoAttack:false, aimLocked:false, overlay:null, dexSeason:'forest', toastTimer:null,
};

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
}
function playerName() {
  const value = $('player-name').value.trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 16);
  if (value) localStorage.setItem('wildbound-name', value);
  return value || 'Wanderer';
}
$('player-name').value = localStorage.getItem('wildbound-name') || '';
function toast(text) {
  $('toast').textContent = text; $('toast').classList.add('on');
  clearTimeout(game.toastTimer); game.toastTimer = setTimeout(() => $('toast').classList.remove('on'), 1800);
}
function relayBase() {
  const override = new URLSearchParams(location.search).get('relay');
  if (override) return override.replace(/\/$/, '');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return location.origin;
  return 'https://wildbound-relay.tung-tung-tung-sahur.workers.dev';
}

$('how-button').onclick = () => $('how').classList.remove('hidden');
$('close-how').onclick = () => $('how').classList.add('hidden');
$('open-online').onclick = () => { show('online'); refreshLobbies(); };
document.querySelectorAll('[data-back="landing"]').forEach(button => button.onclick = () => show('landing'));
$('refresh').onclick = refreshLobbies;
$('play-cpu').onclick = () => startLocal(playerName());

async function refreshLobbies() {
  const list = $('lobbies'); list.innerHTML = '<p class="empty">Scanning the ranges...</p>';
  try {
    const response = await fetch(`${relayBase()}/lobbies`, { cache:'no-store' });
    if (!response.ok) throw new Error('relay unavailable');
    renderLobbies((await response.json()).lobbies || []);
  } catch (error) { list.innerHTML = `<p class="empty">${escapeHtml(error.message)}. You can still join by name.</p>`; }
}
function renderLobbies(lobbies) {
  const list = $('lobbies'); list.replaceChildren();
  if (!lobbies.length) { list.innerHTML = '<p class="empty">No open ranges. Create the first.</p>'; return; }
  for (const room of lobbies) {
    const row = document.createElement('div'); row.className = 'lobby-row';
    const info = document.createElement('div');
    const title = document.createElement('h4'); title.textContent = room.name;
    const meta = document.createElement('p'); meta.textContent = `${room.players}/${room.max} tamers · ${room.locked ? 'locked' : 'open'} · ${room.biome || 'forest'}`;
    info.append(title, meta);
    const join = document.createElement('button'); join.className = 'secondary'; join.textContent = 'JOIN';
    join.onclick = () => { $('join-name').value = room.name; connect('join', room.name, $('join-password').value); };
    row.append(info, join); list.append(row);
  }
}
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

$('create-form').onsubmit = event => {
  event.preventDefault();
  connect('create', $('room-name').value, $('room-password').value, { max:+$('room-max').value, bots:+$('room-bots').value });
};
$('join-form').onsubmit = event => { event.preventDefault(); connect('join', $('join-name').value, $('join-password').value); };

function connect(action, roomName, password = '', settings = {}) {
  const room = roomName.trim().replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').slice(0, 24);
  if (room.length < 3) { $('online-error').textContent = 'Lobby names need at least 3 characters.'; return; }
  $('online-error').textContent = 'Connecting...';
  const url = new URL(`${relayBase().replace(/^http/, 'ws')}/ws`); url.searchParams.set('room', room);
  const ws = new WebSocket(url);
  const timer = setTimeout(() => ws.close(), 10000);
  ws.onopen = () => ws.send(JSON.stringify({ t:action, room, password, name:playerName(), settings }));
  ws.onmessage = event => handleMessage(JSON.parse(event.data));
  ws.onerror = () => $('online-error').textContent = 'Could not reach the multiplayer relay.';
  ws.onclose = () => {
    clearTimeout(timer);
    if (game.ws === ws && game.running) leaveGame('Connection to the range was lost.');
    else if (!game.id) $('online-error').textContent = 'The lobby connection closed.';
  };
  game.ws = ws; game.mode = 'online'; game.room = room;
}

function send(message) { if (game.ws?.readyState === WebSocket.OPEN) game.ws.send(JSON.stringify(message)); }
function handleMessage(message) {
  if (message.t === 'error') { $('online-error').textContent = message.message; $('lobby-wait').textContent = message.message; return; }
  if (message.t === 'welcome') { game.id = message.id; game.host = message.host; $('online-error').textContent = ''; return; }
  if (message.t === 'lobby') { renderLobby(message); return; }
  if (message.t === 'start') { game.id = message.you || game.id; beginWorld(message.world); return; }
  if (message.t === 'snapshot') { game.world = message.world; if (game.world.players[game.id]?.dead) showDeath(); updateHud(); return; }
  if (message.t === 'event') { addFeed(message.message); if (message.self) toast(message.message); return; }
  if (message.t === 'chat') addChat(message.name, message.message);
}
function renderLobby(message) {
  show('lobby'); $('lobby-name').textContent = message.name; game.host = message.host === game.id;
  const roster = $('roster'); roster.replaceChildren();
  for (const player of message.players) {
    const row = document.createElement('div'); row.className = 'roster-row';
    const dot = document.createElement('i'); dot.style.background = player.color;
    const name = document.createElement('b'); name.textContent = player.name;
    const role = document.createElement('small'); role.textContent = player.id === message.host ? 'RANGE KEEPER' : 'READY';
    row.append(dot, name, role); roster.append(row);
  }
  $('lobby-cpu').textContent = `${message.settings.bots} roaming tamers will join`;
  $('start-match').classList.toggle('hidden', !game.host); $('lobby-wait').classList.toggle('hidden', game.host);
}
$('start-match').onclick = () => send({ t:'start' });
$('leave-lobby').onclick = () => leaveGame();

function rng(seed) { return () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed)), ((seed ^ seed >>> 14) >>> 0) / 4294967296); }
function makeWorld(seed = Date.now()) {
  const random = rng(seed | 0); const resources = [], animals = [], structures = [];
  for (let i=0;i<190;i++) {
    const roll=random(); const type=roll<.46?'tree':roll<.73?'rock':roll<.94?'berry':'gold';
    resources.push({ id:`r${i}`, type, x:80+random()*(WORLD_W-160), y:80+random()*(WORLD_H-160), hp:type==='gold'?110:type==='rock'?85:65, max:type==='gold'?110:type==='rock'?85:65, respawn:0 });
  }
  const roster=PETS.filter(pet=>pet.season==='forest');
  for (let i=0;i<40;i++) { const pet=roster[i%roster.length], baby=i%3!==0, hp=baby?Math.round(pet.baseStats.hp*.58):pet.baseStats.hp; animals.push({ id:`a${i}`, species:pet.id, x:120+random()*(WORLD_W-240), y:120+random()*(WORLD_H-240), hp, max:hp, baby, sleep:baby, owner:null, level:0, xp:0, angle:random()*TAU, cooldown:0 }); }
  animals.push(makeBoss(SEASONS[0],random));
  return { seed, time:0, season:0, biome:SEASONS[0].name, day:1, players:{}, resources, animals, structures, projectiles:[] };
}
function makeBoss(season,random=Math.random){return{id:'boss',species:season.bossId,boss:true,season:season.id,x:500+random()*(WORLD_W-1000),y:500+random()*(WORLD_H-1000),hp:1600,max:1600,baby:false,sleep:false,owner:null,level:2,xp:0,angle:0,cooldown:0,respawn:0};}
function newPlayer(id, name, x, y, color, bot=false) { return { id,name,x,y,vx:0,vy:0,angle:0,color,hp:100,maxHp:100,xp:0,age:0,nextXp:40,resources:{wood:20,stone:10,food:25,gold:0},selected:0,loadout:[...STARTING_ITEMS],unlocks:[...STARTING_ITEMS],choiceAge:null,cooldown:0,dead:false,kills:0,pets:[],bot,respawn:0,target:null }; }

function startLocal(name) {
  game.mode='local'; game.id='p1'; game.host=true;
  const world=makeWorld(Date.now()); world.players.p1=newPlayer('p1',name,WORLD_W/2,WORLD_H/2,COLORS[0]);
  for(let i=0;i<7;i++) world.players[`b${i}`]=newPlayer(`b${i}`,BOT_NAMES[i],300+Math.random()*(WORLD_W-600),300+Math.random()*(WORLD_H-600),COLORS[i+1],true);
  beginWorld(world);
}
function beginWorld(world) {
  game.world=world; game.running=true; game.paused=false; game.dead=false; game.last=performance.now();
  document.body.classList.add('playing'); $('hud').classList.remove('hidden'); $('pause').classList.add('hidden'); $('death').classList.add('hidden');
  renderHotbar(); updateHud(); toast('Gather. Age up. Tame the wild.');
}

function renderHotbar() {
  const bar=$('hotbar'); bar.replaceChildren(); const me=game.world?.players?.[game.id];
  (me?.loadout||STARTING_ITEMS).forEach((id,index)=>{ const item=ITEM_BY_ID.get(id); if(!item)return; const slot=document.createElement('div'); slot.className=`slot ${index===game.selected?'selected':''}`; slot.innerHTML=`<small>${item.slot.toUpperCase()}</small><strong>${item.name}</strong><em>${item.category==='building'?itemCost(item):''}</em>`; slot.onclick=()=>selectItem(index); bar.append(slot); });
}
function selectItem(index) { game.selected=index; game.input.selected=index; renderHotbar(); }
function updateHud() {
  const me=game.world?.players?.[game.id]; if(!me)return;
  $('health-fill').style.width=`${Math.max(0,me.hp/me.maxHp*100)}%`; $('health-text').textContent=`${Math.ceil(me.hp)} / ${me.maxHp}`;
  $('xp-fill').style.width=`${Math.min(100,me.xp/me.nextXp*100)}%`; $('age-text').textContent=`AGE ${me.age}`;
  $('resources').innerHTML=`<div class="resource">WOOD ${me.resources.wood|0}</div><div class="resource">STONE ${me.resources.stone|0}</div><div class="resource">FOOD ${me.resources.food|0}</div><div class="resource">GOLD ${me.resources.gold|0}</div>`;
  const pets=(game.world.animals||[]).filter(animal=>animal.owner===game.id);
  $('pet-panel').innerHTML=pets.length?`<span>${pets.map(p=>`${(PET_BY_ID.get(p.species)?.name||p.species).toUpperCase()} ${['BABY','ADULT','BOSS'][p.level]}`).join(' · ')}</span><small>${pets.map(p=>Math.ceil(p.hp)).join(' / ')} health · 1–3 select · 4–6 skill</small>`:'<span>NO COMPANION</span><small>Find a sleeping baby and press .</small>';
  $('pet-controls').innerHTML=pets.map((pet,index)=>`<div class="pet-chip ${index===game.selectedPet?'active':''}"><b>${index+1} ${(PET_BY_ID.get(pet.species)?.name||pet.species).split(' ')[0]}</b><small>${index+4} ${PET_BY_ID.get(pet.species)?.skill||'skill'}</small></div>`).join('');
  $('minimap').textContent=`${(game.world.biome||'Forest').toUpperCase()} · DAY ${game.world.day||1}`;
  [...$('hotbar').children].forEach((slot,i)=>slot.style.opacity=me.unlocks?.includes(me.loadout[i])?'1':'.42');
  $('auto-flag').textContent=`E AUTO: ${game.autoAttack?'ON':'OFF'}`;$('lock-flag').textContent=`L AIM: ${game.aimLocked?'LOCKED':'FREE'}`;
  if(me.choiceAge!==null&&me.choiceAge!==undefined&&$('age-choice').classList.contains('hidden'))openAgeChoice(me.choiceAge);
}
function addFeed(message){ game.feed.unshift({message,until:performance.now()+5000}); game.feed.length=5; $('feed').innerHTML=game.feed.map(item=>`<p>${escapeHtml(item.message)}</p>`).join(''); }
function addChat(name,message){ const p=document.createElement('p'); p.textContent=`${name}: ${message}`; $('chat-lines').append(p); while($('chat-lines').children.length>5)$('chat-lines').firstChild.remove(); }

function openAgeChoice(age){
  const me=game.world?.players?.[game.id],options=getAgeChoiceIds(me,age).map(id=>ITEM_BY_ID.get(id)).filter(Boolean);if(!options.length){if(me)me.choiceAge=null;return;}
  game.paused=true;$('age-choice').classList.remove('hidden');$('age-choice-title').textContent=`Age ${age}: choose new knowledge`;
  const container=$('age-options');container.replaceChildren();
  for(const item of options){const button=document.createElement('button');button.className='age-option';button.innerHTML=`<h3>${item.name}</h3><p>${item.category.toUpperCase()} · ${item.category==='building'&&itemCost(item)?`${itemCost(item)} TO PLACE`:'AGE UNLOCK'}</p><p>${describeItem(item)}</p>`;button.onclick=()=>chooseAgeItem(item.id);container.append(button)}
}
function describeItem(item){const s=item.stats||{};return [s.damage&&`${s.damage} damage`,s.power&&`${s.power} gather power`,s.range&&`${s.range} range`,s.health&&`${s.health} structure health`,s.healing&&`heals nearby allies`].filter(Boolean).join(' · ')||'A new way to survive.'}
function chooseAgeItem(id){const me=game.world?.players?.[game.id];if(!me)return;if(game.mode==='online')send({t:'choose',id});else applyChoice(me,id);$('age-choice').classList.add('hidden');game.paused=false;}
function getAgeChoiceIds(player,age){return player?getAgeChoices(age,player.loadout):[]}
function applyChoice(player,id){const item=ITEM_BY_ID.get(id);if(!item)return;player.unlocks??=[];if(!player.unlocks.includes(id))player.unlocks.push(id);player.choiceAge=null;const existing=player.loadout.findIndex(existingId=>ITEM_BY_ID.get(existingId)?.slot===item.slot);if(existing>=0)player.loadout[existing]=id;else player.loadout.push(id);player.selected=clamp(player.selected,0,player.loadout.length-1);if(player.id===game.id)renderHotbar();}

function renderTamodex(){
  const tabs=$('dex-seasons');tabs.replaceChildren();for(const season of SEASONS){const button=document.createElement('button');button.textContent=season.name;button.className=season.id===game.dexSeason?'active':'';button.onclick=()=>{game.dexSeason=season.id;renderTamodex()};tabs.append(button)}
  const pets=PETS.filter(pet=>pet.season===game.dexSeason);$('dex-count').textContent=`${pets.length} species · 3 evolutions each`;const grid=$('dex-grid');grid.replaceChildren();
  for(const pet of pets){const card=document.createElement('article');card.className='dex-card';const portrait=document.createElement('canvas');portrait.width=260;portrait.height=150;const pctx=portrait.getContext('2d');drawPetShape(pctx,130,78,pet,2,0);const rarity=document.createElement('span');rarity.className='rarity';rarity.textContent=pet.rarity.toUpperCase();const title=document.createElement('h3');title.textContent=pet.name;const meta=document.createElement('p');meta.textContent=`${pet.type} · ${pet.skill.replaceAll('-',' ')} · HP ${pet.baseStats.hp} · ATK ${pet.baseStats.attack}`;card.append(portrait,rarity,title,meta);grid.append(card)}
}
$('open-tamodex').onclick=()=>{renderTamodex();show('tamodex')};document.querySelectorAll('.collection-back').forEach(button=>button.onclick=()=>show('landing'));

const COSMETICS=[['leaf-crown','Leaf crown',0],['trail-scarf','Trail scarf',120],['moon-antlers','Moon antlers',300],['ember-halo','Ember halo',500]];
function openShop(){game.overlay='shop';game.paused=game.running;$('field-shop').classList.remove('hidden');const me=game.world?.players?.[game.id],grid=$('shop-items');grid.replaceChildren();for(const [id,name,cost] of COSMETICS){const card=document.createElement('div');card.className='shop-item';card.innerHTML=`<h3>${name}</h3><p>Cosmetic only · ${cost?`${cost} gold`:'free'}</p>`;const button=document.createElement('button');button.className='secondary';button.textContent=localStorage.getItem('wildbound-cosmetic')===id?'EQUIPPED':'EQUIP';button.disabled=!!me&&cost>me.resources.gold;button.onclick=()=>{if(me&&cost&&localStorage.getItem(`owned-${id}`)!=='1'){me.resources.gold-=cost;localStorage.setItem(`owned-${id}`,'1')}localStorage.setItem('wildbound-cosmetic',id);openShop()};card.append(button);grid.append(card)}}
$('open-shop-home').onclick=openShop;$('close-shop').onclick=()=>{game.overlay=null;game.paused=false;$('field-shop').classList.add('hidden')};
function openMap(){if(!game.world)return;game.overlay='map';game.paused=true;$('world-map').classList.remove('hidden');drawFullMap()}
$('close-map').onclick=()=>{game.overlay=null;game.paused=false;$('world-map').classList.add('hidden')};
function drawFullMap(){const map=$('map-canvas'),m=map.getContext('2d'),world=game.world,season=SEASONS[world.season||0];m.fillStyle=season.palette.ground[0];m.fillRect(0,0,map.width,map.height);m.strokeStyle=season.palette.detail[0];m.lineWidth=2;for(const node of world.resources.filter((_,i)=>i%3===0)){m.beginPath();m.arc(node.x/WORLD_W*map.width,node.y/WORLD_H*map.height,2,0,TAU);m.stroke()}for(const animal of world.animals.filter(a=>a.boss&&a.hp>0)){m.fillStyle='#b84e43';m.beginPath();m.arc(animal.x/WORLD_W*map.width,animal.y/WORLD_H*map.height,8,0,TAU);m.fill()}for(const player of Object.values(world.players)){m.fillStyle=player.id===game.id?'#e9b949':'#f1efcf';m.beginPath();m.arc(player.x/WORLD_W*map.width,player.y/WORLD_H*map.height,5,0,TAU);m.fill()}}

function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
function norm(x,y){ const length=Math.hypot(x,y)||1; return {x:x/length,y:y/length}; }
function getCosts(type){ return type==='wall'?{wood:20}:type==='spike'?{wood:15,stone:10}:type==='turret'?{wood:35,stone:25,gold:10}:{}; }
function canPay(player,cost){ return Object.entries(cost).every(([key,value])=>player.resources[key]>=value); }
function pay(player,cost){ Object.entries(cost).forEach(([key,value])=>player.resources[key]-=value); }
function gainXp(player,amount){ player.xp+=amount; while(player.xp>=player.nextXp){ player.xp-=player.nextXp; player.age++; player.nextXp=40*(player.age+1); player.maxHp+=5; player.hp=player.maxHp; player.choiceAge=Math.min(27,player.age); if(player.bot){const choices=getAgeChoiceIds(player,player.choiceAge);applyChoice(player,choices[Math.floor(Math.random()*choices.length)]);}else if(player.id===game.id)toast(`Age ${player.age}: choose new knowledge`); } }

function simulateLocal(dt) {
  const world=game.world; world.time+=dt; world.day=1+Math.floor(world.time/180);const nextSeason=Math.floor(world.time/75)%SEASONS.length;if(nextSeason!==world.season){world.season=nextSeason;world.biome=SEASONS[nextSeason].name;const oldBoss=world.animals.find(a=>a.boss);if(oldBoss)Object.assign(oldBoss,makeBoss(SEASONS[nextSeason]));addFeed(`${world.biome} has reached the range`)}
  const me=world.players[game.id]; applyPlayerInput(me,game.input,dt); game.input.interact=false;
  for(const player of Object.values(world.players)){ player.cooldown=Math.max(0,player.cooldown-dt); if(player.dead){ player.respawn-=dt; if(player.bot&&player.respawn<=0)respawnPlayer(player); continue; } if(player.bot)updateBot(player,dt); }
  updateAnimals(world,dt); updateStructures(world,dt); updateResources(world,dt);
  if(me.dead&&!game.dead)showDeath();
}
function applyPlayerInput(player,input,dt){
  if(!player||player.dead)return; const direction=norm(input.x,input.y); const moving=Math.abs(input.x)+Math.abs(input.y)>.05; const speed=175;
  if(moving){ const nextX=clamp(player.x+direction.x*speed*dt,24,WORLD_W-24),nextY=clamp(player.y+direction.y*speed*dt,24,WORLD_H-24),blocked=game.world.structures.some(s=>['wall','door'].includes(s.type)&&s.owner!==player.id&&Math.hypot(s.x-nextX,s.y-nextY)<38);if(!blocked){player.x=nextX;player.y=nextY;} }
  player.angle=input.angle; player.selected=input.selected;
  if(input.attack&&player.cooldown<=0)performAction(player);
  if(input.interact)tameNearest(player);
}
function performAction(player){
  const selectedId=player.bot?player.loadout?.find(id=>ITEM_BY_ID.get(id)?.slot==='primary'):player.loadout?.[player.selected],item=ITEM_BY_ID.get(selectedId)||ITEM_BY_ID.get('hand'); if(!player.unlocks?.includes(item.id)){ if(player.id===game.id)toast(`Choose ${item.name} at an age-up first`); player.cooldown=.3; return; }
  if(item.category==='building'){ placeStructure(player,item); return; }
  const stats=item.stats||{}; player.cooldown=stats.cooldown||.48; const range=stats.range||72; const damage=stats.damage||stats.power||18;
  if(item.branch==='wrench'){const structure=game.world.structures.filter(s=>s.owner===player.id&&s.hp<s.max&&distance(player,s)<range).sort((a,b)=>distance(player,a)-distance(player,b))[0];if(structure&&player.resources.stone>0){player.resources.stone--;structure.hp=Math.min(structure.max,structure.hp+(stats.repair||20));}return;}
  let targets=[...game.world.resources.filter(r=>r.hp>0),...game.world.animals.filter(a=>a.hp>0&&a.owner!==player.id),...Object.values(game.world.players).filter(p=>p.id!==player.id&&!p.dead),...game.world.structures.filter(s=>s.owner!==player.id)];
  targets=targets.filter(target=>distance(player,target)<range&&Math.abs(angleDiff(player.angle,Math.atan2(target.y-player.y,target.x-player.x)))<(item.category==='ranged'?.2:.7)).sort((a,b)=>distance(player,a)-distance(player,b));
  const target=targets[0]; if(!target)return; player.target=target.id;
  if(target.type&&target.id.startsWith('r')) harvest(player,target,stats.power||10);
  else { target.hp-=damage; if(target.hp<=0)defeat(player,target); }
}
function angleDiff(a,b){ return Math.atan2(Math.sin(b-a),Math.cos(b-a)); }
function harvest(player,node,amount){ if(node.hp<=0)return; node.hp-=amount; const yields=node.type==='tree'?['wood',4]:node.type==='rock'?['stone',3]:node.type==='berry'?['food',2]:['gold',2]; player.resources[yields[0]]+=yields[1]; gainXp(player,4); if(node.hp<=0){ node.respawn=25+Math.random()*20; gainXp(player,18); } }
function defeat(killer,target){ target.hp=0; if(target.id?.startsWith('r'))return; gainXp(killer,target.boss?400:target.baby?50:100); killer.resources.food+=target.boss?40:2;if(target.boss){killer.resources.gold+=180;target.respawn=45;const roster=PETS.filter(p=>p.season===SEASONS[game.world.season||0].id&&['epic','legendary','rare'].includes(p.rarity));for(let i=0;i<3;i++){const pet=roster[i%roster.length];game.world.animals.push({id:`reward${Date.now()}${i}`,species:pet.id,x:target.x+(i-1)*55,y:target.y+65,hp:Math.round(pet.baseStats.hp*.58),max:Math.round(pet.baseStats.hp*.58),baby:true,sleep:true,owner:null,level:0,xp:0,angle:0,cooldown:0,respawn:0})}addFeed(`${killer.name} defeated ${SEASONS[game.world.season||0].bossId.replaceAll('-',' ')}`);return} if(target.id in game.world.players){ target.dead=true; target.respawn=5; killer.kills++; addFeed(`${killer.name} defeated ${target.name}`); } else { target.respawn=20; } }
function placeStructure(player,item){ const cost=item.cost||{}; if(!canPay(player,cost)){ if(player.id===game.id)toast('Not enough resources'); player.cooldown=.3; return; } const x=player.x+Math.cos(player.angle)*72,y=player.y+Math.sin(player.angle)*72; if(game.world.structures.some(s=>Math.hypot(s.x-x,s.y-y)<52)){ if(player.id===game.id)toast('Too close to another structure');return; } pay(player,cost); const kind=['wall','door','spike','windmill'].includes(item.slot)?item.slot:item.stats.healing?'healer':item.stats.boost?'boost':'turret',hp=item.stats.health||160; game.world.structures.push({id:`s${Date.now()}${Math.random()}`,type:kind,item:item.id,x,y,owner:player.id,hp,max:hp,cooldown:0,damage:item.stats.damage||0,range:item.stats.range||0,income:item.stats.income||0,healing:item.stats.healing||0}); player.cooldown=.4; }
function tameNearest(player){ const owned=game.world.animals.filter(a=>a.owner===player.id); if(owned.length>=3){ if(player.id===game.id)toast('You can guide only three companions'); return; } const pet=game.world.animals.filter(a=>a.baby&&a.sleep&&!a.owner&&a.hp>0&&distance(a,player)<80).sort((a,b)=>distance(a,player)-distance(b,player))[0]; if(!pet){ if(player.id===game.id)toast('No sleeping baby close enough'); return; } if(Math.random()<.76){ const def=PET_BY_ID.get(pet.species);pet.owner=player.id; pet.sleep=false; pet.hp=pet.max=Math.round((def?.baseStats.hp||100)*.7); player.pets.push(pet.id); addFeed(`${player.name} befriended a ${def?.name||pet.species}`); } else { pet.sleep=false; if(player.id===game.id)toast('It woke up startled'); } }
function updateBot(bot,dt){
  bot.brain=(bot.brain||0)-dt; if(bot.brain<=0){ bot.brain=.35+Math.random()*.5; const threats=Object.values(game.world.players).filter(p=>p.id!==bot.id&&!p.dead&&distance(p,bot)<240); const node=game.world.resources.filter(r=>r.hp>0).sort((a,b)=>distance(a,bot)-distance(b,bot))[0]; const baby=game.world.animals.find(a=>a.baby&&a.sleep&&!a.owner&&distance(a,bot)<100); if(baby&&Math.random()<.35)tameNearest(bot); bot.goal=threats[0]||node; if(bot.age>=2&&Math.random()<.08){ bot.selected=3+Math.floor(Math.random()*Math.min(3,Math.max(1,bot.age-1))); performAction(bot); } }
  if(!bot.goal)return; const d=distance(bot,bot.goal); bot.angle=Math.atan2(bot.goal.y-bot.y,bot.goal.x-bot.x); if(d>65){ bot.x+=Math.cos(bot.angle)*145*dt; bot.y+=Math.sin(bot.angle)*145*dt; } else if(bot.cooldown<=0){ bot.selected=bot.goal.name?1:0; performAction(bot); }
}
function updateAnimals(world,dt){ for(const animal of world.animals){ animal.cooldown=Math.max(0,(animal.cooldown||0)-dt); if(animal.hp<=0){ animal.respawn-=dt; if(animal.respawn<=0){ if(animal.boss){Object.assign(animal,makeBoss(SEASONS[world.season||0]));}else{const roster=PETS.filter(p=>p.season===SEASONS[world.season||0].id),pet=roster[Math.floor(Math.random()*roster.length)];animal.species=pet.id;animal.max=animal.baby?Math.round(pet.baseStats.hp*.58):pet.baseStats.hp;animal.hp=animal.max;animal.owner=null;animal.sleep=animal.baby;animal.x=100+Math.random()*(WORLD_W-200);animal.y=100+Math.random()*(WORLD_H-200);} }continue; } let target=null; if(animal.owner){ target=world.players[animal.owner]; const enemy=Object.values(world.players).filter(p=>p.id!==animal.owner&&!p.dead&&distance(p,animal)<210).sort((a,b)=>distance(a,animal)-distance(b,animal))[0]; if(enemy)target=enemy; } else if(!animal.baby&&!animal.sleep){ target=Object.values(world.players).filter(p=>!p.dead).sort((a,b)=>distance(a,animal)-distance(b,animal))[0]; if(target&&distance(target,animal)>(animal.boss?330:190))target=null; } if(target){ const d=distance(animal,target); animal.angle=Math.atan2(target.y-animal.y,target.x-animal.x); if(d>(animal.boss?78:54)){ if(!animal.boss){animal.x+=Math.cos(animal.angle)*95*dt;animal.y+=Math.sin(animal.angle)*95*dt;} } else if(target.hp!==undefined&&animal.cooldown<=0&&target.id!==animal.owner){ target.hp-=animal.boss?38:animal.level===2?24:12;animal.cooldown=animal.boss?1.6:1.1;if(target.hp<=0){target.dead=true;target.respawn=5;} } } else if(!animal.sleep&&!animal.boss){ animal.x+=Math.cos(animal.angle)*22*dt;animal.y+=Math.sin(animal.angle)*22*dt;if(Math.random()<dt*.25)animal.angle+=Math.random()*2-1; } if(animal.owner){ animal.xp+=dt*2; const needed=(animal.level+1)*45;if(animal.level<2&&animal.xp>=needed){animal.xp=0;animal.level++;animal.max+=35;animal.hp=animal.max;} } } }
function updateStructures(world,dt){
  for(const structure of world.structures){structure.cooldown=Math.max(0,(structure.cooldown||0)-dt);const owner=world.players[structure.owner];
    if(structure.type==='turret'&&structure.cooldown<=0){const enemy=Object.values(world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<(structure.range||280)).sort((a,b)=>distance(a,structure)-distance(b,structure))[0];if(enemy){enemy.hp-=structure.damage||14;structure.cooldown=1;if(enemy.hp<=0&&owner)defeat(owner,enemy)}}
    if(structure.type==='spike')for(const enemy of Object.values(world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<34)){enemy.hp-=(structure.damage||20)*dt;if(enemy.hp<=0&&owner)defeat(owner,enemy)}
    if(structure.type==='windmill'&&owner){structure.incomeClock=(structure.incomeClock||0)+dt;if(structure.incomeClock>=5){owner.resources.gold+=(structure.income||1);structure.incomeClock-=5}}
    if(structure.type==='healer'&&owner&&distance(owner,structure)<110)owner.hp=Math.min(owner.maxHp,owner.hp+(structure.healing||2)*dt);
  }world.structures=world.structures.filter(s=>s.hp>0);
}
function updateResources(world,dt){for(const node of world.resources)if(node.hp<=0){node.respawn-=dt;if(node.respawn<=0)node.hp=node.max;}}
function respawnPlayer(player){ player.dead=false;player.hp=player.maxHp;player.x=200+Math.random()*(WORLD_W-400);player.y=200+Math.random()*(WORLD_H-400);player.resources.wood=Math.max(10,Math.floor(player.resources.wood*.6));player.resources.stone=Math.floor(player.resources.stone*.6);player.resources.gold=Math.floor(player.resources.gold*.5); }

function updateInput() {
  if(game.paused||game.dead){game.input.x=game.input.y=0;game.input.attack=false;return;}
  game.input.x=(game.keys.has('d')||game.keys.has('arrowright')?1:0)-(game.keys.has('a')||game.keys.has('arrowleft')?1:0);
  game.input.y=(game.keys.has('s')||game.keys.has('arrowdown')?1:0)-(game.keys.has('w')||game.keys.has('arrowup')?1:0);
  game.input.attack=game.pointer.down||game.keys.has(' ')||game.autoAttack;
  const me=game.world?.players?.[game.id]; if(me&&!game.aimLocked)game.input.angle=Math.atan2(game.pointer.y-innerHeight/2,game.pointer.x-innerWidth/2);
}
addEventListener('keydown',event=>{
  const key=event.key.toLowerCase(); if($('chat-input')===document.activeElement)return;
  if(['1','2','3'].includes(key)){game.selectedPet=+key-1;updateHud()}
  if(['4','5','6'].includes(key))usePetSkill(+key-4);
  if(key==='e'){game.autoAttack=!game.autoAttack;toast(`Auto-attack ${game.autoAttack?'on':'off'}`)}
  if(key==='.')game.input.interact=true;if(key==='b')eatFood();if(key==='l'){game.aimLocked=!game.aimLocked;toast(`Aim ${game.aimLocked?'locked':'free'}`)}if(key==='m')openMap();if(key==='c')openShop();if(key==='enter')openChat();if(key==='escape'&&game.running)togglePause();
  const buildKeys={u:'palisade',h:'briar-trap',g:'acorn-tower',v:'stone-gate',t:'storehouse',f:'healing-totem'};if(buildKeys[key])selectUnlockedItem(buildKeys[key]);
  game.keys.add(key);
});
addEventListener('keyup',event=>game.keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointermove',event=>{game.pointer.x=event.clientX;game.pointer.y=event.clientY});
canvas.addEventListener('pointerdown',event=>{game.pointer.down=true;game.pointer.x=event.clientX;game.pointer.y=event.clientY});
addEventListener('pointerup',()=>game.pointer.down=false);
canvas.addEventListener('contextmenu',event=>event.preventDefault());
function eatFood(){const me=game.world?.players?.[game.id],food=me&&ITEM_BY_ID.get(me.loadout.find(id=>ITEM_BY_ID.get(id)?.slot==='food')),cost=food?.stats.foodUse||5;if(!me||me.resources.food<cost||me.hp>=me.maxHp)return;if(game.mode==='online')send({t:'eat'});else{me.resources.food-=cost;me.hp=Math.min(me.maxHp,me.hp+(food?.stats.healing||10));}}
function selectUnlockedItem(id){const me=game.world?.players?.[game.id];if(!me)return;let slot=me.loadout.indexOf(id);if(slot<0){const item=ITEM_BY_ID.get(id);slot=item?.category==='building'?3:0;if(me.unlocks?.includes(id))me.loadout[slot]=id}selectItem(Math.max(0,slot));}
function usePetSkill(index){const pets=game.world?.animals?.filter(animal=>animal.owner===game.id)||[],pet=pets[index];if(!pet){toast(`No companion in slot ${index+1}`);return}if(game.mode==='online'){send({t:'skill',slot:index});return}const def=PET_BY_ID.get(pet.species),me=game.world.players[game.id];pet.skillCooldown=pet.skillCooldown||0;if(pet.skillCooldown>0){toast('Companion skill is recharging');return}pet.skillCooldown=8;if(/mend|help|spring|shield|guard|ward/.test(def.skill)){me.hp=Math.min(me.maxHp,me.hp+30);pet.hp=Math.min(pet.max,pet.hp+30);toast(`${def.name} restored the team`)}else{const enemy=Object.values(game.world.players).filter(p=>p.id!==game.id&&!p.dead&&distance(p,pet)<260).sort((a,b)=>distance(a,pet)-distance(b,pet))[0];if(enemy){enemy.hp-=def.baseStats.attack*2;toast(`${def.name} used ${def.skill.replaceAll('-',' ')}`)}}}
function openChat(){const input=$('chat-input');input.classList.remove('hidden');input.focus();}
$('chat-input').onkeydown=event=>{if(event.key==='Enter'){const value=event.currentTarget.value.trim();if(value){if(game.mode==='online')send({t:'chat',message:value});else addChat(playerName(),value);}event.currentTarget.value='';event.currentTarget.classList.add('hidden');canvas.focus();}if(event.key==='Escape'){event.currentTarget.classList.add('hidden');canvas.focus();}};

function setupMobile(){const stick=$('stick'),knob=stick.querySelector('i');let active=false;const move=event=>{if(!active)return;const touch=event.touches?.[0]||event;const rect=stick.getBoundingClientRect(),dx=touch.clientX-(rect.left+rect.width/2),dy=touch.clientY-(rect.top+rect.height/2),n=norm(dx,dy),mag=Math.min(1,Math.hypot(dx,dy)/(rect.width*.35));game.input.x=n.x*mag;game.input.y=n.y*mag;knob.style.transform=`translate(${n.x*mag*30}px,${n.y*mag*30}px)`;};stick.addEventListener('pointerdown',e=>{active=true;stick.setPointerCapture(e.pointerId);move(e)});stick.addEventListener('pointermove',move);stick.addEventListener('pointerup',()=>{active=false;game.input.x=game.input.y=0;knob.style.transform=''});$('mobile-action').onpointerdown=()=>game.pointer.down=true;$('mobile-action').onpointerup=()=>game.pointer.down=false;$('mobile-tame').onclick=()=>game.input.interact=true;} setupMobile();

$('menu-button').onclick=togglePause;$('resume').onclick=togglePause;$('quit').onclick=()=>leaveGame();$('death-quit').onclick=()=>leaveGame();
$('respawn').onclick=()=>{if(game.mode==='online')send({t:'respawn'});else respawnPlayer(game.world.players[game.id]);game.dead=false;$('death').classList.add('hidden');};
function togglePause(){if(!game.running)return;game.paused=!game.paused;$('pause').classList.toggle('hidden',!game.paused);game.keys.clear();}
function showDeath(){game.dead=true;$('death').classList.remove('hidden');const me=game.world.players[game.id];$('death-stats').textContent=`Age ${me.age} · ${me.kills} rivals defeated`;}
function leaveGame(message='') { if(game.ws){game.ws.close();game.ws=null;} game.running=false;game.id=null;game.world=null;game.dead=false;document.body.classList.remove('playing');$('hud').classList.add('hidden');$('pause').classList.add('hidden');$('death').classList.add('hidden');show('landing');if(message)toast(message); }

function sendInput(now){if(game.mode!=='online'||now-game.sendAt<50)return;game.sendAt=now;send({t:'input',...game.input});game.input.interact=false;}
function frame(now){const dt=Math.min(.05,(now-game.last)/1000);game.last=now;if(game.running&&game.world){updateInput();if(game.mode==='local'&&!game.paused)simulateLocal(dt);sendInput(now);drawWorld();updateHud();}else drawBackdrop(now);requestAnimationFrame(frame);}requestAnimationFrame(frame);

function drawBackdrop(now){ctx.setTransform(devicePixelRatio>2?2:devicePixelRatio||1,0,0,devicePixelRatio>2?2:devicePixelRatio||1,0,0);ctx.fillStyle='#afc77e';ctx.fillRect(0,0,innerWidth,innerHeight);ctx.globalAlpha=.22;for(let i=0;i<20;i++){const x=(i*271+now*.004*(i%3))%innerWidth,y=(i*173)%innerHeight;drawLeaf(x,y,18+(i%4)*5,i*.7);}ctx.globalAlpha=1;}
function drawWorld(){
  const world=game.world,me=world.players[game.id];if(!me)return;game.camera.x+=(me.x-game.camera.x)*.12;game.camera.y+=(me.y-game.camera.y)*.12;
  const zoom=1,dpr=Math.min(devicePixelRatio||1,2),season=SEASONS[world.season||0];ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=season.palette.ground[0];ctx.fillRect(0,0,innerWidth,innerHeight);
  ctx.save();ctx.translate(innerWidth/2-game.camera.x*zoom,innerHeight/2-game.camera.y*zoom);ctx.scale(zoom,zoom);drawGround(world,season);
  for(const node of world.resources)if(node.hp>0&&onScreen(node))drawResource(node,season);for(const structure of world.structures)if(onScreen(structure))drawStructure(structure);for(const animal of world.animals)if(animal.hp>0&&onScreen(animal))drawAnimal(animal);for(const player of Object.values(world.players))if(!player.dead&&onScreen(player))drawPlayer(player);ctx.restore();
  drawSeasonOverlay(season,world.time);drawMinimap(world,me);drawCrosshair();const closeBaby=world.animals.find(a=>a.baby&&a.sleep&&!a.owner&&a.hp>0&&distance(a,me)<80);$('prompt').classList.toggle('hidden',!closeBaby);if(closeBaby)$('prompt').textContent=`. · TAME ${(PET_BY_ID.get(closeBaby.species)?.name||closeBaby.species).toUpperCase()}`;
}
function onScreen(entity){return Math.abs(entity.x-game.camera.x)<innerWidth*.7+100&&Math.abs(entity.y-game.camera.y)<innerHeight*.7+100;}
function drawGround(world,season){
  const left=Math.max(0,game.camera.x-innerWidth),right=Math.min(WORLD_W,game.camera.x+innerWidth),top=Math.max(0,game.camera.y-innerHeight),bottom=Math.min(WORLD_H,game.camera.y+innerHeight);ctx.fillStyle=season.palette.ground[1];
  for(let x=Math.floor(left/96)*96;x<right;x+=96)for(let y=Math.floor(top/96)*96;y<bottom;y+=96){const n=((x*31+y*17+world.seed)%101)/101;if(n<.28){ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(x+30+(n*41)%40,y+20+(n*67)%45,5+n*7,0,TAU);ctx.fill()}}
  ctx.globalAlpha=1;ctx.strokeStyle=season.palette.background[0];ctx.lineWidth=8;ctx.strokeRect(0,0,WORLD_W,WORLD_H);
}
function drawResource(node){ctx.save();ctx.translate(node.x,node.y);if(node.type==='tree'){ctx.fillStyle='#745433';ctx.fillRect(-8,4,16,24);ctx.fillStyle='#456d3c';for(const [x,y,r] of [[-14,-6,20],[12,-9,22],[0,-25,24]]){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}}else if(node.type==='rock'||node.type==='gold'){ctx.fillStyle=node.type==='gold'?'#e9b949':'#727a70';ctx.beginPath();for(let i=0;i<7;i++){const a=i/7*TAU,r=22+(i%2)*5;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.strokeStyle='#354533';ctx.lineWidth=3;ctx.stroke()}else{ctx.fillStyle='#536d36';ctx.beginPath();ctx.arc(0,0,24,0,TAU);ctx.fill();ctx.fillStyle='#b84e43';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(Math.cos(i*2.2)*14,Math.sin(i*2.2)*12,4,0,TAU);ctx.fill()}}ctx.restore();}
function drawPlayer(player){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.fillStyle='rgba(38,51,34,.2)';ctx.beginPath();ctx.ellipse(-4,12,22,11,0,0,TAU);ctx.fill();ctx.fillStyle=player.color;ctx.strokeStyle='#263322';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,19,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#f1efcf';ctx.beginPath();ctx.arc(10,-6,5,0,TAU);ctx.fill();ctx.stroke();ctx.strokeStyle='#263322';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(15,3);ctx.lineTo(31,0);ctx.stroke();ctx.restore();drawBarWorld(player.x,player.y-36,player.hp/player.maxHp,player.name,player.id===game.id?'#e9b949':'#f1efcf');}
function drawAnimal(animal){
  ctx.save();ctx.translate(animal.x,animal.y);ctx.rotate(animal.angle);if(animal.boss){drawBossShape(ctx,animal);ctx.restore();drawBarWorld(animal.x,animal.y-62,animal.hp/animal.max,animal.species.replaceAll('-',' ').toUpperCase(),'#b84e43');return}
  const pet=PET_BY_ID.get(animal.species)||PETS[0];drawPetShape(ctx,0,0,pet,animal.level,animal.angle,animal.baby);if(animal.sleep){ctx.fillStyle='#263322';ctx.font='700 14px DM Mono';ctx.fillText('z',10,-24)}if(animal.owner){ctx.fillStyle=worldPlayerColor(animal.owner);ctx.beginPath();ctx.arc(-20,0,5,0,TAU);ctx.fill()}ctx.restore();
}
function drawPetShape(target,x,y,pet,level=0,angle=0,baby=false){
  target.save();target.translate(x,y);const scale=baby?.82:level===2?1.48:level===1?1.2:1;target.scale(scale,scale);target.lineWidth=3/scale;target.strokeStyle='#263322';target.fillStyle='rgba(38,51,34,.18)';target.beginPath();target.ellipse(-3,13,24,9,0,0,TAU);target.fill();
  const winged=/wing|bird|bat|moth|insect/.test(`${pet.shape} ${pet.type}`),shelled=/shell|turtle|beetle|crab/.test(`${pet.shape} ${pet.type}`),long=/serpentine|eel|slender/.test(`${pet.shape} ${pet.type}`),horned=/horn|antler|tusk/.test(pet.shape);
  if(winged){target.fillStyle=pet.accent;target.beginPath();target.ellipse(-9,-8,17,9,-.55,0,TAU);target.ellipse(-9,9,17,9,.55,0,TAU);target.fill();target.stroke()}
  if(long){target.fillStyle=pet.color;target.beginPath();target.moveTo(-24,5);target.bezierCurveTo(-8,-16,10,15,24,-3);target.lineWidth=12;target.strokeStyle=pet.color;target.stroke();target.lineWidth=3/scale;target.strokeStyle='#263322'}
  target.fillStyle=pet.color;target.beginPath();target.ellipse(0,0,long?18:23,shelled?16:14,0,0,TAU);target.fill();target.stroke();
  if(shelled){target.fillStyle=pet.accent;target.beginPath();target.ellipse(-5,0,15,12,0,0,TAU);target.fill();target.stroke();target.beginPath();target.moveTo(-16,0);target.lineTo(6,0);target.moveTo(-5,-11);target.lineTo(-5,11);target.stroke()}
  target.fillStyle=pet.color;target.beginPath();target.arc(17,-3,10,0,TAU);target.fill();target.stroke();
  if(horned){target.fillStyle=pet.accent;target.beginPath();target.moveTo(15,-11);target.lineTo(12,-27);target.lineTo(22,-12);target.fill();target.stroke();target.beginPath();target.moveTo(22,-9);target.lineTo(27,-23);target.lineTo(28,-5);target.fill();target.stroke()}
  if(/long-ear|rabbit/.test(`${pet.shape} ${pet.type}`)){target.fillStyle=pet.accent;for(const dx of [13,22]){target.beginPath();target.ellipse(dx,-18,4,12,-.18,0,TAU);target.fill();target.stroke()}}
  if(/maned|bear|lion/.test(`${pet.shape} ${pet.type}`)){target.fillStyle=pet.accent;target.beginPath();target.arc(15,-3,14,0,TAU);target.fill();target.stroke();target.fillStyle=pet.color;target.beginPath();target.arc(17,-3,9,0,TAU);target.fill()}
  target.fillStyle='#f7f1cf';target.beginPath();target.arc(21,-6,3.2,0,TAU);target.fill();target.fillStyle='#263322';target.beginPath();target.arc(22,-6,1.4,0,TAU);target.fill();
  if(level===2){target.strokeStyle=pet.accent;target.lineWidth=2/scale;target.beginPath();target.arc(0,0,28,0,TAU);target.stroke()}target.restore();
}
function drawBossShape(target,animal){const season=SEASONS[game.world?.season||0],pulse=1+Math.sin(game.world.time*2)*.04;target.scale(pulse,pulse);target.fillStyle=season.palette.background[0];target.strokeStyle='#263322';target.lineWidth=5;target.beginPath();for(let i=0;i<12;i++){const a=i/12*TAU,r=i%2?42:55;i?target.lineTo(Math.cos(a)*r,Math.sin(a)*r):target.moveTo(Math.cos(a)*r,Math.sin(a)*r)}target.closePath();target.fill();target.stroke();target.fillStyle=season.palette.detail[1];target.beginPath();target.arc(0,0,24,0,TAU);target.fill();target.stroke();target.fillStyle='#263322';target.beginPath();target.ellipse(8,-2,10,6,0,0,TAU);target.fill();target.fillStyle='#f7f1cf';target.beginPath();target.arc(11,-3,3,0,TAU);target.fill()}
function drawSeasonOverlay(season,time){ctx.save();ctx.globalAlpha=.2;if(season.id==='winter'){ctx.fillStyle='#fff';for(let i=0;i<45;i++){const x=(i*97+time*18)%innerWidth,y=(i*53+time*25)%innerHeight;ctx.fillRect(x,y,3,3)}}else if(season.id==='darkness'){ctx.fillStyle='#151329';ctx.globalAlpha=.27;ctx.fillRect(0,0,innerWidth,innerHeight)}else if(season.id==='ocean'){ctx.strokeStyle='#d7f3e6';for(let y=30;y<innerHeight;y+=70){ctx.beginPath();for(let x=0;x<innerWidth;x+=20)ctx.lineTo(x,y+Math.sin(x*.03+time)*5);ctx.stroke()}}else if(season.id==='volcano'){ctx.fillStyle='#ff9a43';for(let i=0;i<25;i++){const x=(i*131+time*8)%innerWidth,y=(i*79-time*20+innerHeight*3)%innerHeight;ctx.fillRect(x,y,3,5)}}else if(season.id==='desert'){ctx.fillStyle='#f5df9c';for(let i=0;i<30;i++)ctx.fillRect((i*113+time*30)%innerWidth,(i*67)%innerHeight,12,2)}ctx.restore()}
function worldPlayerColor(id){return game.world.players[id]?.color||'#fff'}
function drawStructure(s){ctx.save();ctx.translate(s.x,s.y);ctx.strokeStyle='#263322';ctx.lineWidth=3;
  if(s.type==='wall'||s.type==='door'){ctx.fillStyle=s.type==='door'?'#b17b43':'#8b623a';ctx.fillRect(-33,-13,66,26);ctx.strokeRect(-33,-13,66,26);for(let x=-24;x<30;x+=16){ctx.beginPath();ctx.moveTo(x,-12);ctx.lineTo(x,12);ctx.stroke()}if(s.type==='door'){ctx.fillStyle='#e9b949';ctx.beginPath();ctx.arc(22,0,3,0,TAU);ctx.fill()}}
  else if(s.type==='spike'){ctx.fillStyle='#4e6737';for(let i=0;i<8;i++){ctx.rotate(TAU/8);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(7,-8);ctx.lineTo(30,0);ctx.lineTo(7,8);ctx.closePath();ctx.fill();ctx.stroke()}}
  else if(s.type==='windmill'){ctx.fillStyle='#8b623a';ctx.fillRect(-7,-25,14,50);ctx.strokeRect(-7,-25,14,50);ctx.rotate((game.world.time||0)*.8);for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.fillStyle='#f1efcf';ctx.fillRect(0,-6,34,12);ctx.strokeRect(0,-6,34,12)}}
  else{ctx.fillStyle='#8b623a';ctx.fillRect(-11,-28,22,56);ctx.strokeRect(-11,-28,22,56);ctx.fillStyle=s.type==='healer'?'#79a966':'#e9b949';ctx.beginPath();ctx.arc(0,-31,16,0,TAU);ctx.fill();ctx.stroke()}ctx.restore();}
function drawBarWorld(x,y,fraction,label,color){ctx.font='500 10px DM Mono';ctx.textAlign='center';ctx.fillStyle='rgba(38,51,34,.8)';ctx.fillRect(x-28,y,56,6);ctx.fillStyle=color;ctx.fillRect(x-28,y,56*clamp(fraction,0,1),6);ctx.fillStyle='#263322';ctx.fillText(label,x,y-5);}
function drawLeaf(x,y,size,angle){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#44693c';ctx.beginPath();ctx.ellipse(0,0,size,size*.42,0,0,TAU);ctx.fill();ctx.restore();}
function drawMinimap(world,me){const w=130,h=96,x=innerWidth-w-18,y=92;ctx.fillStyle='rgba(31,44,27,.72)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#f1efcf';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);for(const p of Object.values(world.players)){ctx.fillStyle=p.id===game.id?'#e9b949':'rgba(255,255,230,.7)';ctx.beginPath();ctx.arc(x+p.x/WORLD_W*w,y+p.y/WORLD_H*h,p.id===game.id?3:2,0,TAU);ctx.fill()}ctx.fillStyle='#b84e43';for(const animal of world.animals.filter(a=>!a.baby&&a.hp>0)){ctx.fillRect(x+animal.x/WORLD_W*w-1,y+animal.y/WORLD_H*h-1,2,2)}}
function drawCrosshair(){ctx.strokeStyle='rgba(255,255,230,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(game.pointer.x,game.pointer.y,7,0,TAU);ctx.moveTo(game.pointer.x-11,game.pointer.y);ctx.lineTo(game.pointer.x+11,game.pointer.y);ctx.moveTo(game.pointer.x,game.pointer.y-11);ctx.lineTo(game.pointer.x,game.pointer.y+11);ctx.stroke();}
